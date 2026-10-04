'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { hiddenState, useFeatures } from '@/components/ui/features'

// Smartsupp counts every browser that loads its script as a visitor and
// notifies the support team. Only real people on the production site should
// count, so the script is not loaded for:
// - preview / other deployments (Vercel builds each push on several projects
//   and opens each deployment in an automated browser for its preview image),
// - automated browsers, crawlers and link-preview bots,
// - devices used by staff (marked by the admin panel; see STAFF_FLAG).
const PRODUCTION_HOSTS = ['tarafabxai.vercel.app']
export const STAFF_FLAG = 'tarafab.staffDevice'
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|vercel|screenshot|monitor|uptime|pingdom|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|axios|node-fetch/i

function chatAllowed(): boolean {
  const host = window.location.hostname
  const isProd = PRODUCTION_HOSTS.includes(host) || (!host.endsWith('.vercel.app') && host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host))
  if (!isProd) return false
  if (navigator.webdriver || BOT_UA.test(navigator.userAgent)) return false
  try { if (localStorage.getItem(STAFF_FLAG) === '1') return false } catch { /* storage blocked: treat as visitor */ }
  return true
}

// Client-facing live chat. Renders on the landing page, sign-in/up, and
// dashboard — hidden under /admin, since support chat is for clients
// reaching out, not for the admin's own panel.
export default function SmartsuppWidget() {
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)
  // Decided once per page load in the browser; later navigation reuses the
  // already-loaded widget, so moving between pages is never a new visit.
  useEffect(() => { setAllowed(chatAllowed()) }, [])
  // Admin → Feature Control Center → Live chat. Not loaded while OFF; if it
  // is switched OFF after loading, the bubble is hidden without a reload.
  const feature = useFeatures()
  const off = hiddenState(feature('live_chat'))
  useEffect(() => {
    const ss = (window as unknown as { smartsupp?: (...a: unknown[]) => void }).smartsupp
    if (ss) ss(off ? 'chat:hide' : 'chat:show')
  }, [off])
  if (pathname?.startsWith('/admin') || !allowed || off) return null

  return (
    <>
      <ChatLauncher />
      <Script id="smartsupp-loader" strategy="lazyOnload">
        {`
          var _smartsupp = _smartsupp || {};
          _smartsupp.key = '7609b94f32c953ff2d48e555ce2d1f77f817d98e';
          // Keep the bubble clear of the iPhone home indicator and page edges;
          // pages add matching bottom space on phones (see .chat-clearance).
          // Below 1024px the dashboard has a 64px bottom bar (plus the iPhone
          // safe area). The widget reads its offset once when it loads, and
          // sign-in moves to the dashboard without a reload, so on phones and
          // tablets the bubble always sits above where that bar would be.
          _smartsupp.hideWidget = true;
          _smartsupp.offsetX = 16;
          _smartsupp.offsetY = window.innerWidth < 1024 ? 112 : 20;
          window.smartsupp||(function(d) {
            var s,c,o=smartsupp=function(){ o._.push(arguments)};o._=[];
            s=d.getElementsByTagName('script')[0];c=d.createElement('script');
            c.type='text/javascript';c.charset='utf-8';c.async=true;
            c.onload=function(){window.__tfSs='loaded'};c.onerror=function(){window.__tfSs='error'};
            c.src='https://www.smartsuppchat.com/loader.js?';s.parentNode.insertBefore(c,s);
          })(document);
        `}
      </Script>
      <noscript>Powered by <a href="https://www.smartsupp.com" target="_blank" rel="noreferrer">Smartsupp</a></noscript>
    </>
  )
}

type Ss = (...a: unknown[]) => void
const ss = () => (window as unknown as { smartsupp?: Ss & { _?: unknown[] } }).smartsupp
// Smartsupp replaces its queue stub with the real API once loaded; the stub
// only has the `_` command queue.
const ssReady = () => { const f = ss(); return !!f && !Array.isArray((f as { _?: unknown[] })._) }

// Tarafab's own launcher for the existing Smartsupp chat (Smartsupp's default
// bubble is hidden). It opens Smartsupp's real conversation window; nothing
// here pretends an agent is online. States: connecting (script loading),
// ready, open, and a contact fallback if the chat cannot load.
function ChatLauncher() {
  const [state, setState] = useState<'connecting' | 'ready' | 'open' | 'error'>('connecting')
  const [unread, setUnread] = useState(0)
  const [fallback, setFallback] = useState(false)
  const wired = useRef(false)
  const isOpen = useRef(false)
  useEffect(() => { isOpen.current = state === 'open' }, [state])
  useEffect(() => {
    // Ready = Smartsupp's loader script loaded (flag set by the snippet's own
    // onload) or its real API replaced the queue stub. Error = the loader
    // failed (onerror), or nothing loaded within ~20 s.
    let tries = 0
    const flag = () => (window as unknown as { __tfSs?: string }).__tfSs
    const t = setInterval(() => {
      const f = ss()
      if (f && (flag() === 'loaded' || ssReady())) {
        clearInterval(t); setState(s => (s === 'connecting' || s === 'error' ? 'ready' : s))
        if (wired.current) return
        wired.current = true
        const onOpen = () => { setState('open'); setUnread(0) }
        const onClose = () => setState('ready')
        const onMsg = () => { if (!isOpen.current) setUnread(n => Math.min(99, n + 1)) }
        for (const e of ['messenger_open', 'chat_open']) f('on', e, onOpen)
        for (const e of ['messenger_close', 'chat_close']) f('on', e, onClose)
        f('on', 'message_received', onMsg)
      } else if (flag() === 'error' || ++tries > 40) { clearInterval(t); setState('error') }
    }, 500)
    return () => clearInterval(t)
  }, [])
  const click = () => {
    const f = ss()
    // Commands sent before Smartsupp finishes loading are queued by its stub.
    if (state === 'error' || !f) { setFallback(v => !v); return }
    if (state === 'open') { f('chat:close'); setState('ready') } else { f('chat:open'); setState('open'); setUnread(0) }
    setFallback(false)
  }
  return (
    <div className="chat-launch" data-chat-state={state}>
      {fallback && (
        <div className="chat-fallback panel p-4 text-[13px]" role="dialog" aria-label="Contact support">
          <p className="font-semibold text-fg">Tarafab.XAi support</p>
          <p className="mt-1 text-fg-muted">{state === 'error' ? 'Live chat could not connect right now.' : 'Live chat is still connecting.'} You can email us and we will reply as soon as possible.</p>
          <a className="mt-3 inline-flex rounded-lg bg-accent/90 hover:bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white" href="mailto:tarafab.support@gmail.com">Email support</a>
        </div>
      )}
      <button type="button" onClick={click} className="chat-launch-btn" aria-label={state === 'open' ? 'Close support chat' : unread ? `Open support chat, ${unread} unread` : 'Open support chat'} aria-expanded={state === 'open'}>
        <span className="chat-launch-glow" aria-hidden="true" />
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" /></svg>
        <span className={`chat-launch-dot ${state === 'ready' ? 'is-ready' : state === 'error' ? 'is-error' : ''}`} aria-hidden="true" />
        {unread > 0 && <span className="chat-launch-badge">{unread}</span>}
      </button>
    </div>
  )
}
