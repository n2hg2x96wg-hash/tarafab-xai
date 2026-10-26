'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { TKey } from '@/lib/i18n/I18nProvider'

// Installable app (Add to Home Screen).
// - ServiceWorkerRegister (root layout): registers /sw.js, which is
//   network-only apart from an offline page. https only, so local dev and its
//   tests run without one.
// - InstallAppCard (dashboard overview): numbered steps for this phone
//   (iPhone/iPad: Share → Add to Home Screen → Add; Android: menu → Install
//   app → Install). Where the browser offers its own install prompt (Chrome,
//   Edge, Samsung Internet) the card has an "Install app" button instead.
//   Hidden once installed or after "Not now".
// - GetAppMenuButton (dashboard phone menu) + InstallGuideHost (root layout):
//   "Get the app" opens the same steps in a dialog, even after "Not now".

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }
type Kind = 'ios' | 'android'

const DISMISS_KEY = 'tarafab.installDismissed'

// The browser can fire its install event before the dashboard mounts, so it is
// captured here, as soon as this module loads, and shared with every consumer.
let deferred: InstallPromptEvent | null = null
let guideOpen = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPromptEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}
function useInstallState() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const fn = () => rerender(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
}
async function promptInstall() {
  const p = deferred
  deferred = null
  notify()
  await p?.prompt()
  await p?.userChoice.catch(() => {})
}
export function openInstallGuide() { guideOpen = true; notify() }

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = () => /Android/i.test(navigator.userAgent)
const phoneKind = (): Kind | null => (isIOS() ? 'ios' : isAndroid() ? 'android' : null)

const Ico = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const ICONS = {
  share: <Ico><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></Ico>,
  addHome: <Ico><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></Ico>,
  done: <Ico><path d="m5 12.5 4.5 4.5L19 7.5" /></Ico>,
  dots: <Ico><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></Ico>,
  install: <Ico><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19h14" /></Ico>,
}
const STEPS: Record<Kind, [keyof typeof ICONS, TKey, TKey?][]> = {
  ios: [['share', 'installApp.ios1', 'installApp.ios1Hint'], ['addHome', 'installApp.ios2', 'installApp.ios2Hint'], ['done', 'installApp.ios3']],
  android: [['dots', 'installApp.android1'], ['install', 'installApp.android2'], ['done', 'installApp.android3']],
}

function Steps({ kind }: { kind: Kind }) {
  const { t } = useI18n()
  return (
    <ol className="mt-4 grid gap-2.5" data-install-steps>
      {STEPS[kind].map(([icon, key, hint], i) => (
        <li key={key} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 px-3.5 py-3">
          <span className="relative grid place-items-center w-10 h-10 shrink-0 rounded-[11px] bg-accent text-accent-ink">
            {ICONS[icon]}
            <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-ink-950 border border-ink-600 text-fg text-[11px] font-bold leading-[16px] text-center" aria-hidden="true">{i + 1}</span>
          </span>
          <span className="grid gap-0.5 min-w-0 text-[14.5px] leading-snug">
            <strong className="font-semibold text-fg">{t(key)}</strong>
            {hint && <small className="text-[12.5px] text-fg-faint">{t(hint)}</small>}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Head({ id, lead }: { id: string; lead: TKey }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image is off for this site (next.config.js) */}
      <img src="/app/icon-192.png?v=2" alt="" width={52} height={52} className="rounded-[13px] shrink-0" />
      <div className="min-w-0">
        <h3 id={id} className="text-[16px] font-semibold text-fg">{t('installApp.title')}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{t(lead)}</p>
      </div>
    </div>
  )
}

export function InstallAppCard() {
  const { t } = useI18n()
  useInstallState()
  const [hidden, setHidden] = useState(true)
  const [kind, setKind] = useState<Kind | null>(null)

  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* storage unavailable */ }
    setHidden(dismissed || standalone())
    setKind(phoneKind())
  }, [])

  if (hidden || (!deferred && !kind)) return null

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode: hidden for this visit only */ }
    setHidden(true)
  }

  return (
    <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="installAppTitle" data-install-app>
      <Head id="installAppTitle" lead="installApp.lead" />
      {!deferred && kind && <Steps kind={kind} />}
      <div className="mt-4 flex gap-2 sm:justify-end">
        {deferred && (
          <button type="button" onClick={promptInstall} className="btn btn-sm btn-solid flex-1 sm:flex-none">{t('installApp.install')}</button>
        )}
        <button type="button" onClick={later} className="btn btn-sm btn-outline flex-1 sm:flex-none">{t('installApp.later')}</button>
      </div>
    </section>
  )
}

// "Get the app" row for the dashboard's phone menu (hidden inside the installed app).
export function GetAppMenuButton({ onOpen, className }: { onOpen?: () => void; className?: string }) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(!standalone()) }, [])
  if (!show) return null
  return (
    <button type="button" onClick={() => { onOpen?.(); openInstallGuide() }} className={className} data-get-app>
      <span className="cc-logout-icon" aria-hidden="true"><Ico><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19h14" /></Ico></span>
      <span>{t('installApp.menu')}</span>
    </button>
  )
}

// The "Get the app" dialog, mounted once in the root layout.
export function InstallGuideHost() {
  const { t } = useI18n()
  useInstallState()
  const ref = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState<Kind | null>(null)
  useEffect(() => { setKind(phoneKind()) }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (guideOpen && !d.open) d.showModal()
    if (!guideOpen && d.open) d.close()
  })
  const close = () => { guideOpen = false; notify() }

  return (
    <dialog ref={ref} onClose={close} onClick={e => { if (e.target === ref.current) close() }} aria-labelledby="installGuideTitle" data-install-guide
      className="w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] m-auto p-0 bg-transparent text-fg overflow-auto backdrop:bg-black/60 backdrop:backdrop-blur-[3px]">
      {guideOpen && (
        <div className="panel p-4 sm:p-5">
          <Head id="installGuideTitle" lead={standalone() ? 'installApp.already' : 'installApp.lead'} />
          {!standalone() && !deferred && (kind ? <Steps kind={kind} /> : (
            <>
              <h4 className="mt-4 text-[13.5px] font-semibold text-fg-muted">{t('installApp.onIphone')}</h4>
              <Steps kind="ios" />
              <h4 className="mt-4 text-[13.5px] font-semibold text-fg-muted">{t('installApp.onAndroid')}</h4>
              <Steps kind="android" />
            </>
          ))}
          <div className="mt-4 flex gap-2 sm:justify-end">
            {deferred && !standalone() && (
              <button type="button" onClick={() => { close(); promptInstall() }} className="btn btn-sm btn-solid flex-1 sm:flex-none">{t('installApp.install')}</button>
            )}
            <button type="button" onClick={close} className="btn btn-sm btn-outline flex-1 sm:flex-none" data-close>{t('installApp.close')}</button>
          </div>
        </div>
      )}
    </dialog>
  )
}
