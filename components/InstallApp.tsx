'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Installable app (Add to Home Screen).
// - ServiceWorkerRegister (root layout): registers /sw.js, which is
//   network-only apart from an offline page. https only, so local dev and its
//   tests run without one.
// - InstallAppCard (dashboard overview): browsers with an install prompt
//   (Chrome, Edge, Samsung Internet) get an "Install app" button; iPhone and
//   iPad get the Share → Add to Home Screen steps, since Safari has no prompt.
//   Hidden once installed or after "Not now".

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }

const DISMISS_KEY = 'tarafab.installDismissed'

// The browser can fire its install event before the dashboard mounts, so it is
// captured here, as soon as this module loads, and shared with the card.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPromptEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function InstallAppCard() {
  const { t } = useI18n()
  const [, rerender] = useState(0)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* storage unavailable */ }
    setHidden(dismissed || standalone())
    const fn = () => rerender(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  if (hidden || (!deferred && !isIOS())) return null

  const install = async () => {
    const p = deferred
    deferred = null
    await p?.prompt()
    await p?.userChoice.catch(() => {})
    rerender(n => n + 1)
  }
  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode: hidden for this visit only */ }
    setHidden(true)
  }

  return (
    <section className="panel mt-6 p-4 sm:p-5 grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3" aria-labelledby="installAppTitle" data-install-app>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image is off for this site (next.config.js) */}
      <img src="/app/icon-192.png" alt="" width={52} height={52} className="rounded-[13px]" />
      <div className="min-w-0">
        <h3 id="installAppTitle" className="text-[15px] font-semibold text-fg">{t('installApp.title')}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{t(deferred ? 'installApp.body' : 'installApp.ios')}</p>
      </div>
      <div className="col-span-2 sm:col-span-1 flex gap-2">
        {deferred && (
          <button type="button" onClick={install} className="btn btn-sm btn-solid flex-1 sm:flex-none">
            {t('installApp.install')}
          </button>
        )}
        <button type="button" onClick={later} className="btn btn-sm btn-outline flex-1 sm:flex-none">
          {t('installApp.later')}
        </button>
      </div>
    </section>
  )
}
