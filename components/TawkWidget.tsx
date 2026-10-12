'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { startChatAvoid } from '@/lib/chatAvoid'
import { chatAllowed, isRecoveryPage } from '@/components/SmartsuppWidget'

// tawk.to live chat (replaces Smartsupp; the same rules decide where it runs,
// see SmartsuppWidget): production site only, not for bots or staff devices,
// never loaded on /admin or the password-recovery pages (their addresses carry
// one-time tokens), and switchable from Admin → Feature Control Center → Live
// chat. Rendered once in the root layout.
const TAWK_SRC = 'https://embed.tawk.to/6acc482f5debc234cd5aac01/default'
const SCRIPT_ID = 'tawk-embed'

type TawkApi = {
  onLoad?: () => void
  hideWidget?: () => void
  showWidget?: () => void
  maximize?: () => void
  isChatMaximized?: () => boolean
  customStyle?: unknown
}
declare global { interface Window { Tawk_API?: TawkApi; Tawk_LoadStart?: Date } }

// The official embed, run once per page load: the script's id guards against
// a second copy after client navigation, remounts or hot reloads.
function loadTawk(onLoad: () => void) {
  if (document.getElementById(SCRIPT_ID)) return
  // Same spot as before: 16px from the right; on phones and tablets (below
  // 1024px) 16px above the dashboard's 60px bottom bar plus the safe area
  // (pages add matching room with .chat-clearance), 20px from the bottom above.
  let sa = 0
  try {
    const p = document.createElement('div')
    p.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(p); sa = p.offsetHeight || 0; p.remove()
  } catch { /* no safe area */ }
  const yOffset = window.innerWidth < 1024 ? 76 + sa : 20
  const api: TawkApi = (window.Tawk_API = window.Tawk_API || {})
  window.Tawk_LoadStart = new Date()
  api.customStyle = { visibility: { desktop: { position: 'br', xOffset: 16, yOffset }, mobile: { position: 'br', xOffset: 16, yOffset } } }
  api.onLoad = onLoad
  const s1 = document.createElement('script')
  const s0 = document.getElementsByTagName('script')[0]
  s1.id = SCRIPT_ID
  s1.async = true
  s1.src = TAWK_SRC
  s1.charset = 'UTF-8'
  s1.setAttribute('crossorigin', '*')
  s0.parentNode!.insertBefore(s1, s0)
}

export default function TawkWidget() {
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Body flags set elsewhere: a menu or dialog is open (dialog-open), or the
  // bubble would cover marked content (chat-avoid, lib/chatAvoid).
  const [stepAside, setStepAside] = useState(false)
  const feature = useFeatures()
  const off = hiddenState(feature('live_chat'))
  const blockedPage = !!pathname?.startsWith('/admin') || isRecoveryPage(pathname)

  // Decided once per page load in the browser; later navigation reuses the
  // already-loaded widget, so moving between pages is never a new visit.
  useEffect(() => { setAllowed(chatAllowed()) }, [])

  // Load after the page has finished loading, so it never delays rendering.
  useEffect(() => {
    if (!allowed || off || blockedPage) return
    if (window.Tawk_API?.hideWidget) { setLoaded(true); return }
    const start = () => loadTawk(() => setLoaded(true))
    if (document.readyState === 'complete') { start(); return }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [allowed, off, blockedPage])

  useEffect(() => startChatAvoid(), [])
  useEffect(() => {
    const read = () => setStepAside(document.body.classList.contains('dialog-open') || document.body.classList.contains('chat-avoid'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  // Homepage: the bubble stays hidden while the hero's Open an account /
  // Sign in buttons are on screen (on short phones it would sit on them),
  // and appears once the visitor scrolls past them. One-shot: after that it
  // stays visible, so an open conversation is never hidden by scrolling.
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

  // Show or hide the loaded widget. An open conversation only steps aside
  // when the feature is switched off or the page must not show it.
  useEffect(() => {
    const api = window.Tawk_API
    if (!loaded || !api?.hideWidget || !api.showWidget) return
    const open = !!api.isChatMaximized?.()
    const hide = off || blockedPage || (!open && (heroCta || stepAside))
    try { if (hide) api.hideWidget(); else api.showWidget() } catch { /* widget not ready */ }
  }, [loaded, off, blockedPage, heroCta, stepAside])

  return null
}
