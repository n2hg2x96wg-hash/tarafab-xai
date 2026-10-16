'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { TKey } from '@/lib/i18n/I18nProvider'

// "Discover how Tarafab.XAi works": a 60-second walkthrough of the real
// application, recorded with an isolated demo account and sample data (no
// client data). Nothing loads until the visitor asks for it: the card shows a
// small poster, and the video element mounts when the player opens. Native
// controls give play/pause, seeking, volume, captions and fullscreen on every
// browser, including iOS Safari. The player never starts by itself; the
// visitor's tap starts it. It can be minimized to a small player in the
// bottom-left corner (the support chat sits bottom-right).

const SRC = '/media/how-it-works.mp4'
const SRC_WEBM = '/media/how-it-works.webm'
const POSTER = '/media/how-it-works-poster.webp'
const THUMB = '/media/how-it-works-thumb.webp'
const CAPTIONS = '/media/how-it-works.en.vtt'

// Chapter start times match the recorded timeline (scene starts).
const CHAPTERS: { at: number; label: TKey }[] = [
  { at: 0, label: 'hiw.ch1' },
  { at: 6, label: 'hiw.ch2' },
  { at: 18, label: 'hiw.ch3' },
  { at: 31, label: 'hiw.ch4' },
  { at: 43, label: 'hiw.ch5' },
  { at: 50.5, label: 'hiw.ch6' },
]
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

type Mode = 'closed' | 'open' | 'mini'

export function HowItWorks() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('closed')
  const [now, setNow] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [dodge, setDodge] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => setMounted(true), [])

  const open = (e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget
    setMode('open')
  }
  const close = useCallback(() => {
    video.current?.pause()
    setMode('closed')
    // Back to exactly where the visitor was: focus returns to the button
    // that opened the player, without scrolling the page.
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }, [])

  // Start playback from the visitor's tap. If the browser declines (for
  // example a strict autoplay setting), the poster and controls stay ready.
  useEffect(() => {
    if (mode !== 'open') return
    const v = video.current
    if (v && v.paused && v.currentTime === 0) v.play().catch(() => {})
  }, [mode])

  // While the full player is open: lock page scrolling (the position is kept),
  // keep keyboard focus inside the dialog, and close with Escape.
  useEffect(() => {
    if (mode !== 'open') return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    const el = dialog.current
    el?.querySelector<HTMLElement>('[data-hiw-close]')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); close() }
      if (e.key !== 'Tab' || !el) return
      const f = Array.from(el.querySelectorAll<HTMLElement>('button, video, [href], [tabindex]:not([tabindex="-1"])')).filter(x => !x.hasAttribute('disabled') && x.offsetParent !== null)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { root.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [mode, close])

  // Minimized: never cover the sign-up or sign-in buttons. While the small
  // player's bottom-left spot would sit over one, it moves to the top-left.
  useEffect(() => {
    if (mode !== 'mini') { setDodge(false); return }
    let raf = 0
    const check = () => {
      raf = 0
      const el = wrap.current; if (!el) return
      const h = el.offsetHeight, w = el.offsetWidth, H = window.innerHeight
      const spot = { left: 16, right: 16 + w, top: H - 16 - h, bottom: H - 16 }
      const hit = Array.from(document.querySelectorAll<HTMLElement>('a[href="/sign-up"], a[href="/sign-in"]')).some(a => {
        const r = a.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.left < spot.right && spot.left < r.right && r.top < spot.bottom && spot.top < r.bottom
      })
      setDodge(hit)
    }
    const req = () => { if (!raf) raf = requestAnimationFrame(check) }
    window.addEventListener('scroll', req, { passive: true }); window.addEventListener('resize', req)
    req()
    return () => { window.removeEventListener('scroll', req); window.removeEventListener('resize', req); if (raf) cancelAnimationFrame(raf) }
  }, [mode])

  const seek = (at: number) => {
    const v = video.current; if (!v) return
    v.currentTime = at + 0.05
    v.play().catch(() => {})
  }
  const chapter = CHAPTERS.reduce((i, c, k) => (now >= c.at ? k : i), 0)

  return (
    <>
      <section className="hiw-card panel relative overflow-hidden" aria-labelledby="hiw-title" data-hiw>
        <div className="grid sm:grid-cols-[1fr_minmax(0,300px)] lg:grid-cols-[1fr_minmax(0,340px)] items-center gap-4 sm:gap-6 p-4 sm:p-5 lg:p-6">
          <button type="button" onClick={open} className="hiw-thumb group order-first sm:order-last" aria-label={`${t('hiw.watch')} · ${t('hiw.duration')}`} data-hiw-open="thumb">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image is off site-wide (images.unoptimized) */}
            <img src={THUMB} alt="" width={640} height={360} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <span className="hiw-thumb-shade" aria-hidden="true" />
            <span className="hiw-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>
            <span className="hiw-dur" aria-hidden="true">1:00</span>
          </button>
          <div className="min-w-0">
            <p className="lp-eyebrow">{t('hiw.eyebrow')}</p>
            <h2 id="hiw-title" className="mt-1.5 text-[20px] sm:text-[22px] leading-tight font-semibold tracking-[-0.02em] text-fg">{t('hiw.title')}</h2>
            <p className="mt-2 text-[14px] sm:text-[15px] leading-relaxed text-fg-muted max-w-xl">{t('hiw.body')}</p>
            <button type="button" onClick={open} className="mt-4 inline-flex items-center gap-3 rounded-full pr-4 text-left min-h-12 group" data-hiw-open="button">
              <span className="hiw-play hiw-play-sm" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>
              <span>
                <span className="block text-[15px] font-semibold text-fg group-hover:text-accent transition-colors">{t('hiw.watch')}</span>
                <span className="block text-[12.5px] text-fg-faint">{t('hiw.duration')}</span>
              </span>
            </button>
          </div>
        </div>
      </section>

      {mounted && mode !== 'closed' && createPortal(
        <div ref={wrap} className={mode === 'open' ? 'hiw-overlay' : `hiw-mini-wrap${dodge ? ' hiw-mini-top' : ''}`} data-hiw-mode={mode} data-hiw-dodge={dodge ? '' : undefined}>
          {mode === 'open' && <div className="hiw-backdrop" onClick={close} aria-hidden="true" />}
          <div ref={dialog} role={mode === 'open' ? 'dialog' : 'region'} aria-modal={mode === 'open' ? true : undefined}
            aria-labelledby="hiw-dialog-title" className={mode === 'open' ? 'hiw-dialog' : 'hiw-mini'} data-chat-avoid={mode === 'open' ? '' : undefined} data-hiw-player>
            <div className={mode === 'open' ? 'flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3' : 'flex items-center justify-between gap-2 px-2.5 py-1.5'}>
              <div className="min-w-0">
                <h2 id="hiw-dialog-title" className={mode === 'open' ? 'text-[16px] sm:text-[17px] font-semibold text-fg' : 'text-[12.5px] font-medium text-fg truncate'}>{t('hiw.modalTitle')}</h2>
                {mode === 'open' && <p className="text-[12.5px] text-fg-faint mt-0.5">{t('hiw.modalSub')}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {mode === 'open'
                  ? <button type="button" onClick={() => setMode('mini')} className="hiw-icon-btn" aria-label={t('hiw.minimize')} title={t('hiw.minimize')} data-hiw-minimize>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>
                    </button>
                  : <button type="button" onClick={() => setMode('open')} className="hiw-icon-btn" aria-label={t('hiw.expand')} title={t('hiw.expand')} data-hiw-expand>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                    </button>}
                <button type="button" onClick={close} className="hiw-icon-btn" aria-label={t('hiw.close')} title={t('hiw.close')} data-hiw-close>
                  <svg viewBox="0 0 24 24" width={mode === 'open' ? 18 : 16} height={mode === 'open' ? 18 : 16} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            </div>
            <div className={mode === 'open' ? 'px-0 sm:px-5' : ''}>
              {/* One element for both sizes, so playback continues when minimized. */}
              <video ref={video} className="hiw-video" controls playsInline preload="metadata" poster={POSTER}
                onTimeUpdate={e => setNow(e.currentTarget.currentTime)} onEnded={() => setNow(0)}
                aria-label={t('hiw.modalTitle')} data-hiw-video>
                {/* H.264/AAC first (Safari, Chrome, Edge, Firefox); VP9/Opus for browsers without H.264. */}
                <source src={SRC} type="video/mp4" />
                <source src={SRC_WEBM} type="video/webm" />
                <track kind="captions" src={CAPTIONS} srcLang="en" label="English" />
                <a href={SRC}>{t('hiw.download')}</a>
              </video>
            </div>
            {mode === 'open' && (
              <>
                <ol className="hiw-chapters px-4 sm:px-5 pt-3 pb-1" aria-label={t('hiw.chapters')}>
                  {CHAPTERS.map((c, i) => (
                    <li key={c.at}>
                      <button type="button" onClick={() => seek(c.at)} aria-current={i === chapter ? 'step' : undefined} className="hiw-chapter" data-hiw-chapter={i + 1}>
                        <span className="hiw-ch-n tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                        <span className="hiw-ch-l">{t(c.label)}</span>
                        <span className="hiw-ch-t tabular-nums">{mmss(c.at)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="px-4 sm:px-5 pb-4 pt-2 text-[11.5px] leading-relaxed text-fg-faint">{t('hiw.note')}</p>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
