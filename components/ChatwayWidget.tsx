'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { hiddenState, useFeatures } from '@/components/ui/features'
import { chatAllowed, isRecoveryPage, useAfterPageLoad, useHeroCtaVisible } from '@/components/SmartsuppWidget'

// Chatway live chat, switched independently of Smartsupp in Admin → Feature
// Control Center (feature 'chatway'). Same rules as Smartsupp: production
// site only, never for bots or staff devices, never on /admin or recovery
// pages, and nothing is requested while the switch is OFF. Switched OFF
// while a page is open, the widget is taken out of the page (not just
// hidden); the next page load does not load it at all.
const SCRIPT_ID = 'chatway'
const SRC = 'https://cdn.chatway.app/widget.js?id=YrSzlpMRweiL'

declare global {
  interface Window { $chatway?: { openChatwayWidget?: () => void; destroyApp?: () => Promise<void> | void } }
}

// Whether the widget has decided to run on this page (set by the component).
let chatwayExpected = false

// Opens the Chatway window; resolves false when Chatway is not running here.
// Waits briefly while the widget is still starting.
export function openChatwayChat(timeoutMs = 6000): Promise<boolean> {
  const open = () => {
    const cw = window.$chatway
    if (!cw?.openChatwayWidget || !document.querySelector('.chatway--container')) return false
    cw.openChatwayWidget(); return true
  }
  if (open()) return Promise.resolve(true)
  if (!chatwayExpected) return Promise.resolve(false)
  return new Promise(resolve => {
    const started = Date.now()
    const t = setInterval(() => {
      if (open()) { clearInterval(t); resolve(true) }
      else if (Date.now() - started > timeoutMs) { clearInterval(t); resolve(false) }
    }, 200)
  })
}

// Takes everything Chatway added out of the page.
function removeChatway() {
  try { void window.$chatway?.destroyApp?.() } catch { /* already gone */ }
  document.querySelectorAll('#chatway, #chatway-widget-css, #chatway-expanded-style, .chatway--container, .chatway--image-viewer-container, .chatway--youtube-viewer-container')
    .forEach(el => el.remove())
}

export default function ChatwayWidget() {
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)
  useEffect(() => { setAllowed(chatAllowed()) }, [])
  const loadNow = useAfterPageLoad()
  const feature = useFeatures()
  // Both switches start as hidden until the server answers (see STRICT in
  // components/ui/features), so a widget never loads before its state is known.
  const on = !hiddenState(feature('chatway'))
  const smartsuppOn = !hiddenState(feature('live_chat'))
  const blockedPage = !!pathname?.startsWith('/admin') || isRecoveryPage(pathname)
  const heroCta = useHeroCtaVisible(pathname)
  chatwayExpected = allowed && on && !blockedPage

  // Load once per page load: the script tag's id guards against a second copy.
  useEffect(() => {
    if (!allowed || !on || blockedPage || !loadNow) return
    if (document.getElementById(SCRIPT_ID)) return
    const s = document.createElement('script')
    s.id = SCRIPT_ID; s.async = true; s.src = SRC
    document.body.appendChild(s)
  }, [allowed, on, blockedPage, loadNow])

  // Switched OFF after it loaded: remove it, not just its button.
  useEffect(() => { if (allowed && !on) removeChatway() }, [allowed, on])

  // Placement (app/globals.css): with Smartsupp also ON, Chatway takes the
  // bottom-left corner so the two bubbles never overlap; alone, it uses
  // Smartsupp's usual bottom-right spot. Hidden (still loaded) on /admin or
  // recovery pages reached by in-app navigation, and behind the homepage
  // hero buttons, like Smartsupp.
  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('cw-left', on && smartsuppOn)
    html.classList.toggle('cw-hide', !on || blockedPage || heroCta)
  }, [on, smartsuppOn, blockedPage, heroCta])
  useEffect(() => () => { document.documentElement.classList.remove('cw-left', 'cw-hide') }, [])

  return null
}
