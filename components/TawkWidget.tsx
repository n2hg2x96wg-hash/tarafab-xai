'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { chatAllowed, isRecoveryPage } from '@/components/SmartsuppWidget'

// tawk.to live chat: NOT RENDERED. The site uses Smartsupp (app/layout.tsx);
// this file is kept so tawk.to can be restored by swapping the layout back.
// tawk.to live chat (the same rules decide where it runs,
// see SmartsuppWidget, except that staff devices also get it): production site
// only, not for bots,
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

// The API's methods may only be used once tawk.to has called onLoad.
let ready = false
const waiting = new Set<() => void>()
function markReady() { ready = true; waiting.forEach(f => f()); waiting.clear() }

// Opens the chat window (Help & Support). If the widget is still starting,
// waits for it instead of reporting chat as unavailable; resolves false only
// when it is not loading on this page or does not start within the timeout.
export function openTawkChat(timeoutMs = 10_000): Promise<boolean> {
  const open = () => {
    const api = window.Tawk_API
    try { api?.showWidget?.(); api?.maximize?.(); return !!api?.maximize } catch { return false }
  }
  if (ready) return Promise.resolve(open())
  const loading = !!document.getElementById(SCRIPT_ID) || (!!window.Tawk_API && document.readyState !== 'complete')
  if (!loading) return Promise.resolve(false)
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); resolve(open()) }
    const t = setTimeout(() => { waiting.delete(done); resolve(false) }, timeoutMs)
    waiting.add(done)
  })
}

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
  api.onLoad = () => { markReady(); onLoad() }
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
  // A dialog or sheet is open (body.dialog-open, lib/chatAside): the bubble
  // steps aside so it never covers that layer's buttons.
  const [dialogOpen, setDialogOpen] = useState(false)
  const feature = useFeatures()
  const off = hiddenState(feature('live_chat'))
  const blockedPage = !!pathname?.startsWith('/admin') || isRecoveryPage(pathname)

  // Decided once per page load in the browser; later navigation reuses the
  // already-loaded widget, so moving between pages is never a new visit.
  useEffect(() => { setAllowed(chatAllowed({ includeStaff: true })) }, [])

  // Load after the page has finished loading, so it never delays rendering.
  useEffect(() => {
    if (!allowed || off || blockedPage) return
    if (ready) { setLoaded(true); return }
    window.Tawk_API = window.Tawk_API || {}
    const start = () => loadTawk(() => setLoaded(true))
    if (document.readyState === 'complete') { start(); return }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [allowed, off, blockedPage])

  useEffect(() => {
    const read = () => setDialogOpen(document.body.classList.contains('dialog-open'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  // Show or hide the loaded widget. It stays visible while the page scrolls
  // and while the navigation menu is open; it steps aside only on pages that
  // must not show it, when Live chat is switched off, and (unless a
  // conversation is open) while a dialog is on screen.
  useEffect(() => {
    const api = window.Tawk_API
    if (!loaded || !api?.hideWidget || !api.showWidget) return
    const open = !!api.isChatMaximized?.()
    const hide = off || blockedPage || (!open && dialogOpen)
    try { if (hide) api.hideWidget(); else api.showWidget() } catch { /* widget not ready */ }
  }, [loaded, off, blockedPage, dialogOpen])

  return null
}
