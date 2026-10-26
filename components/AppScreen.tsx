'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { IconClose } from '@/components/Icons'
import { useBackClose } from '@/lib/backClose'
import { hideChat } from '@/lib/chatAside'

/* A detail opened by tapping something (a notification, a receipt, a plan).
   On phones it is a full app screen that slides in from the right with a
   "‹" back bar; the phone's Back button or swipe-back closes it (see
   lib/backClose). On larger screens it is a centred dialog with a close X.
   Short confirmations keep using ConfirmModal: those stay small on purpose. */

const WIDTH = { sm: 'sm:max-w-[440px]', md: 'sm:max-w-xl', lg: 'sm:max-w-2xl' } as const
const LEAVE_MS = 200

export function AppScreen({ title, onClose, children, closeLabel, width = 'md', z = 55, attrs, titleId, headClassName = '' }: {
  title: ReactNode
  onClose: () => void
  children: (ReactNode | ((dismiss: (after?: () => void) => void) => ReactNode))
  closeLabel?: string
  width?: keyof typeof WIDTH
  z?: number
  /** data-* attributes for the dialog element (tests and styling hooks). */
  attrs?: Record<string, string | undefined>
  titleId?: string
  headClassName?: string
}) {
  const { t } = useI18n()
  const autoId = useId()
  const id = titleId || `scr-${autoId.replace(/:/g, '')}`
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const leavingRef = useRef(false)

  // Slide out, then unmount (at once when motion is reduced).
  const leave = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) { closeRef.current(); return }
    setLeaving(true)
    setTimeout(() => closeRef.current(), LEAVE_MS)
  }
  const dismiss = useBackClose(leave)

  useEffect(() => {
    setMounted(true)
    const opener = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const showChat = hideChat()
    return () => {
      document.body.style.overflow = prev
      showChat()
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true })
    }
  }, [])
  useEffect(() => { if (mounted) backRef.current?.focus({ preventScroll: true }) }, [mounted])

  const onKey = (e: RKeyboardEvent) => {
    // Only for keys inside this screen itself (not a dialog opened over it).
    if ((e.target as HTMLElement).closest?.('[role="dialog"]') !== rootRef.current) return
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); return }
    if (e.key === 'Tab') { // keep focus inside
      const all = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!all.length) return
      const first = all[0], last = all[all.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  if (!mounted) return null
  return createPortal(
    <div ref={rootRef} className={`app-screen-root fixed inset-0 flex sm:items-center sm:justify-center sm:p-4 ${leaving ? 'is-leaving' : ''}`} style={{ zIndex: z }}
      role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={onKey} data-app-screen={leaving ? 'leaving' : 'open'} {...attrs}>
      <div className="app-screen-backdrop absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={() => dismiss()} aria-hidden="true" />
      <div className={`app-screen relative flex flex-col w-full h-full sm:h-auto sm:max-h-[90dvh] ${WIDTH[width]} sm:rounded-2xl overflow-hidden`}>
        <div className={`app-screen-bar shrink-0 flex items-center gap-1.5 h-14 pl-1.5 pr-4 sm:pl-5 sm:pr-2.5 ${headClassName}`}>
          <button ref={backRef} type="button" onClick={() => dismiss()} aria-label={closeLabel || t('common.goBack')} data-screen-back
            className="order-first sm:order-last shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl grid place-items-center text-fg-muted hover:text-fg hover:bg-[rgb(var(--contrast)/.06)] active:bg-[rgb(var(--contrast)/.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:hidden" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            <IconClose width={18} height={18} className="hidden sm:block" aria-hidden="true" />
          </button>
          <h2 id={id} className="flex-1 min-w-0 truncate text-[16px] sm:text-base font-semibold text-fg">{title}</h2>
        </div>
        <div className="app-screen-body flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {typeof children === 'function' ? children(dismiss) : children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
