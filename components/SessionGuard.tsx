'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// The auth client is loaded on demand so public pages (landing, sign-in) do
// not ship it in their initial JavaScript.
const loadClient = () => import('@/lib/supabase/client').then(m => m.createClient())

// Privacy guard for the signed-in areas (client dashboard and admin).
//
// 1. Back/forward cache: a page restored from the browser's memory after
//    sign-out would still show the last figures. On restore the session is
//    re-checked and, without one, the page is replaced by the sign-in page.
// 2. Inactivity: after IDLE_MS with no interaction (pointer, key, scroll,
//    touch) in any tab, the session is signed out. Switching tabs does not
//    count as inactivity by itself; only the time since the last interaction
//    does, and it is shared across tabs through localStorage.
const IDLE_MS = 30 * 60 * 1000
const KEY = 'tarafab.lastActivity'

const isAdminPath = (p: string) => p.startsWith('/admin') && !p.startsWith('/admin/login')
const isClientPath = (p: string) => ['/dashboard', '/investments', '/verification'].some(x => p === x || p.startsWith(x + '/'))

function readLast() {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 }
}
function writeLast(now: number) {
  try { localStorage.setItem(KEY, String(now)) } catch {}
}

export default function SessionGuard() {
  const pathname = usePathname() || '/'
  const admin = isAdminPath(pathname)
  const protectedPath = admin || isClientPath(pathname)

  // A fresh sign-in (on any page) starts a new activity window, so an old mark
  // from an earlier session never signs the new one out.
  useEffect(() => {
    let unsub = () => {}
    let alive = true
    loadClient().then(sb => {
      if (!alive) return
      const { data: { subscription } } = sb.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_IN') writeLast(Date.now())
        if (event === 'SIGNED_OUT') { try { localStorage.removeItem(KEY) } catch {} }
      })
      unsub = () => subscription.unsubscribe()
    })
    return () => { alive = false; unsub() }
  }, [])

  useEffect(() => {
    if (!protectedPath) return
    const signInPath = admin ? '/admin/login' : '/sign-in'
    const leave = () => window.location.replace(signInPath)

    const recheck = async () => {
      const { data } = await (await loadClient()).auth.getSession().catch(() => ({ data: { session: null } }))
      if (!data.session) leave()
    }

    // Entering a protected page counts as activity only if the stored mark is
    // not already stale (otherwise an old session would be refreshed silently).
    const last = readLast()
    if (last && Date.now() - last > IDLE_MS) {
      loadClient().then(sb => sb.auth.signOut()).catch(() => {}).finally(leave)
      return
    }
    writeLast(Date.now())

    let lastWrite = 0
    const mark = () => {
      const now = Date.now()
      if (now - lastWrite > 15_000) { lastWrite = now; writeLast(now) }
    }
    const checkIdle = () => {
      if (Date.now() - readLast() > IDLE_MS) loadClient().then(sb => sb.auth.signOut()).catch(() => {}).finally(leave)
    }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { recheck(); checkIdle() } }
    const onVisible = () => { if (document.visibilityState === 'visible') checkIdle() }

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach(ev => window.addEventListener(ev, mark, { passive: true }))
    window.addEventListener('pageshow', onShow)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(checkIdle, 60_000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, mark))
      window.removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [protectedPath, admin])

  return null
}
