'use client'

import { useEffect } from 'react'

// The support chat bubble (Smartsupp) floats above the page. While a menu,
// sheet or dialog is open it steps aside (body.dialog-open hides it, see
// globals.css) so it never covers that layer's buttons or fields. Several
// layers can be open at once (a confirmation over a sheet), so this keeps a
// count and shows the bubble again only when the last one closes.
let open = 0

export function hideChat(): () => void {
  if (typeof document === 'undefined') return () => {}
  open++
  document.body.classList.add('dialog-open')
  let done = false
  return () => {
    if (done) return
    done = true
    open = Math.max(0, open - 1)
    if (!open) document.body.classList.remove('dialog-open')
  }
}

export function useHideChat(active = true) {
  useEffect(() => (active ? hideChat() : undefined), [active])
}
