'use client'

// Keeps the floating support bubbles (Smartsupp, Chatway) off content that matters.
// Anything marked data-chat-avoid (forms, the dashboard's quick actions, the
// landing page's automation demonstration) hides the collapsed bubble while
// it sits under the bubble's spot, and the bubble returns as soon as it
// scrolls away. An open conversation is never hidden. The spot matches the
// widget's own offsets (see SmartsuppWidget): 16px from the right, and 76px
// plus the safe area from the bottom below 1024px (20px above). When Chatway
// sits in the mirrored bottom-left spot (html.cw-left), that spot is checked
// too and toggles body.chat-avoid-left.
export function startChatAvoid(): () => void {
  if (typeof window === 'undefined') return () => {}
  let sa = 0
  try {
    const p = document.createElement('div')
    p.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(p); sa = p.offsetHeight || 0; p.remove()
  } catch { /* no safe area */ }
  let raf = 0
  const check = () => {
    raf = 0
    const W = window.innerWidth, H = window.innerHeight, off = W < 1024 ? 76 + sa : 20
    const top = H - off - 64 - 12, bottom = H - off + 12
    const zr = { left: W - 16 - 64 - 12, right: W, top, bottom }
    const zl = { left: 0, right: 16 + 64 + 12, top, bottom }
    const chat = document.getElementById('chat-application')
    const open = (!!chat && chat.getBoundingClientRect().height > 200) || !!window.Tawk_API?.isChatMaximized?.()
      || !!document.querySelector('.chatway--container.widget--open')
    const left = document.documentElement.classList.contains('cw-left')
    let hit = false, hitLeft = false
    if (!open) for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-chat-avoid]'))) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || !(r.top < bottom && top < r.bottom)) continue
      if (r.left < zr.right && zr.left < r.right) hit = true
      if (left && r.left < zl.right && zl.left < r.right) hitLeft = true
      if (hit && (hitLeft || !left)) break
    }
    document.body.classList.toggle('chat-avoid', hit)
    document.body.classList.toggle('chat-avoid-left', hitLeft)
  }
  const req = () => { if (!raf) raf = requestAnimationFrame(check) }
  window.addEventListener('scroll', req, { passive: true })
  window.addEventListener('resize', req)
  // Content appears and moves without scrolling (sections loading, tabs).
  const timer = window.setInterval(req, 800)
  req()
  return () => {
    window.removeEventListener('scroll', req); window.removeEventListener('resize', req); window.clearInterval(timer)
    if (raf) cancelAnimationFrame(raf)
    document.body.classList.remove('chat-avoid', 'chat-avoid-left')
  }
}
