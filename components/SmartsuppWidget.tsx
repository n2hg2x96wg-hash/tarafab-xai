'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { startChatAvoid } from '@/lib/chatAvoid'
import { SITE_HOST } from '@/lib/site'

// Smartsupp counts every browser that loads its script as a visitor and
// notifies the support team. Only real people on the production site should
// count, so the script is not loaded for:
// - preview / other deployments (Vercel builds each push on several projects
//   and opens each deployment in an automated browser for its preview image),
// - automated browsers, crawlers and link-preview bots,
// - devices used by staff (marked by the admin panel; see STAFF_FLAG).
const BARE_HOST = SITE_HOST.replace(/^www\./, '')
const PRODUCTION_HOSTS = [BARE_HOST, `www.${BARE_HOST}`, 'tarafabxai.vercel.app']
export const STAFF_FLAG = 'tarafab.staffDevice'
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|vercel|screenshot|monitor|uptime|pingdom|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|axios|node-fetch/i

// includeStaff: also allow devices marked by the admin panel (tawk.to has no
// per-visitor cost, and staff need to see the chat to test and answer it).
export function chatAllowed({ includeStaff = false }: { includeStaff?: boolean } = {}): boolean {
  const host = window.location.hostname
  const isProd = PRODUCTION_HOSTS.includes(host) || (!host.endsWith('.vercel.app') && host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host))
  if (!isProd) return false
  if (navigator.webdriver || BOT_UA.test(navigator.userAgent)) return false
  if (!includeStaff) try { if (localStorage.getItem(STAFF_FLAG) === '1') return false } catch { /* storage blocked: treat as visitor */ }
  return true
}

// Password-recovery pages carry one-time tokens in the address; the chat
// script (a third party that records the page address) is never loaded there.
export const isRecoveryPage = (p: string | null) => p === '/reset-password' || !!p?.startsWith('/auth/')

declare global { interface Window { smartsupp?: (...args: unknown[]) => void } }

// Whether the widget has decided to run on this page (set by the component).
let chatExpected = false

// Opens the chat window (Help & Support). The loader's command queue exists as
// soon as the embed has run, before the widget finishes downloading, so this
// waits briefly for it; resolves false when chat is not running on this page
// (switched off, a bot, a staff device, or a page that never loads it).
export function openSmartsuppChat(timeoutMs = 6000): Promise<boolean> {
  const open = () => {
    const ss = window.smartsupp
    if (typeof ss !== 'function') return false
    ss('chat:show'); ss('chat:open'); return true
  }
  if (open()) return Promise.resolve(true)
  if (!chatExpected) return Promise.resolve(false)
  return new Promise(resolve => {
    const started = Date.now()
    const t = setInterval(() => {
      if (open()) { clearInterval(t); resolve(true) }
      else if (Date.now() - started > timeoutMs) { clearInterval(t); resolve(false) }
    }, 200)
  })
}

// True one second after the page has finished loading: when the chat
// scripts start. Not 'lazyOnload': that waits for the browser to be idle,
// which the homepage's animated hero can postpone indefinitely on slower
// devices.
export function useAfterPageLoad() {
  const [loadNow, setLoadNow] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const start = () => { t = setTimeout(() => setLoadNow(true), 1000) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => { window.removeEventListener('load', start); if (t) clearTimeout(t) }
  }, [])
  return loadNow
}

// Homepage: a support bubble stays hidden while the hero's Open an account /
// Sign in buttons are on screen (on short phones it would sit on them), and
// appears once the visitor scrolls past them. One-shot: after that it stays
// visible, so an open conversation is never hidden by scrolling.
export function useHeroCtaVisible(pathname: string | null) {
  const [heroCta, setHeroCta] = useState(false)
  useEffect(() => {
    if (pathname !== '/' || typeof IntersectionObserver === 'undefined') { setHeroCta(false); return }
    const el = document.querySelector('[data-hero-cta]'); if (!el) return
    let seenOnce = false
    const io = new IntersectionObserver(e => {
      if (e[0].isIntersecting) { seenOnce = true; setHeroCta(true) }
      else if (seenOnce) { setHeroCta(false); io.disconnect() }
    })
    io.observe(el); return () => io.disconnect()
  }, [pathname])
  return heroCta
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
  const loadNow = useAfterPageLoad()
  // Steps the bubble aside while it would cover marked content (see lib/chatAvoid).
  useEffect(() => startChatAvoid(), [])
  // Admin → Feature Control Center → Customer support → Smartsupp. Not loaded while OFF; if it
  // is switched OFF after loading, the bubble is hidden without a reload.
  const feature = useFeatures()
  const off = hiddenState(feature('live_chat'))
  const blockedPage = !!pathname?.startsWith('/admin') || isRecoveryPage(pathname)
  const heroCta = useHeroCtaVisible(pathname)
  useEffect(() => {
    if (!allowed) return
    // The loader runs lazily: wait (briefly) for Smartsupp's command queue.
    // Also hidden if the visitor moves to /admin or a recovery page after it loaded.
    const cmd = off || heroCta || blockedPage ? 'chat:hide' : 'chat:show'
    let tries = 0
    const apply = () => {
      const ss = (window as unknown as { smartsupp?: (...a: unknown[]) => void }).smartsupp
      if (ss) { ss(cmd); return true }
      return false
    }
    if (apply()) return
    const t = setInterval(() => { if (apply() || ++tries > 60) clearInterval(t) }, 250)
    return () => clearInterval(t)
  }, [off, heroCta, allowed, blockedPage])
  chatExpected = allowed && !off && !blockedPage
  if (blockedPage || !allowed || off || !loadNow) return null

  return (
    <>
      {/* The id makes next/script add it once per page load, however often this re-renders. */}
      <Script id="smartsupp-loader" strategy="afterInteractive">
        {`
          var _smartsupp = _smartsupp || {};
          _smartsupp.key = '7609b94f32c953ff2d48e555ce2d1f77f817d98e';
          // Keep the bubble clear of the page edges and, on phones and
          // tablets (below 1024px), 16px above the dashboard's 60px bottom bar
          // plus the device's safe area (iPhone home indicator). The widget
          // reads its offset once when it loads, and sign-in moves to the
          // dashboard without a reload, so below 1024px it always sits above
          // where that bar would be. Pages add matching bottom space
          // (.chat-clearance), and it steps aside while a menu or dialog is
          // open (body.dialog-open).
          var _sa = 0;
          try { var _p = document.createElement('div'); _p.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'; document.body.appendChild(_p); _sa = _p.offsetHeight || 0; _p.remove(); } catch (e) {}
          _smartsupp.offsetX = 16;
          _smartsupp.offsetY = window.innerWidth < 1024 ? 76 + _sa : 20;
          window.smartsupp||(function(d) {
            var s,c,o=smartsupp=function(){ o._.push(arguments)};o._=[];
            s=d.getElementsByTagName('script')[0];c=d.createElement('script');
            c.type='text/javascript';c.charset='utf-8';c.async=true;
            c.src='https://www.smartsuppchat.com/loader.js?';s.parentNode.insertBefore(c,s);
          })(document);
        `}
      </Script>
      <noscript>Powered by <a href="https://www.smartsupp.com" target="_blank" rel="noreferrer">Smartsupp</a></noscript>
    </>
  )
}

