'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/components/Icons'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Short confirmations for actions whose result is otherwise easy to miss:
// a copied address, a submitted deposit or KYC request. They add to the
// on-page states, never replace them, so nothing depends on a toast being seen.

type Tone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: Tone; message: string }
type Ctx = { show: (message: string, tone?: Tone) => void }

const ToastContext = createContext<Ctx>({ show: () => {} })

const TONE_STYLE: Record<Tone, string> = {
  success: 'border-success-500/35 text-success-200',
  error: 'border-danger-500/40 text-danger-200',
  info: 'border-ink-600 text-fg',
}
const TONE_ICON = { success: IconCheck, error: IconAlert, info: IconInfo }

const LIFETIME_MS = 4200
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const { t } = useI18n()

  const dismiss = useCallback((id: number) => {
    setToasts(list => list.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId.current++
    setToasts(list => [...list, { id, tone, message }].slice(-MAX_VISIBLE))
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS))
  }, [dismiss])

  // No timer outlives the provider.
  useEffect(() => {
    const all = timers.current
    return () => { all.forEach(clearTimeout); all.clear() }
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed z-[60] left-1/2 -translate-x-1/2 w-[min(26rem,calc(100vw-2rem))] flex flex-col gap-2 pointer-events-none"
        style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
      >
        {toasts.map(toast => {
          const Icon = TONE_ICON[toast.tone]
          return (
            <div key={toast.id} className={`toast-in pointer-events-auto glass-panel rounded-xl border px-4 py-3 flex items-start gap-3 text-sm ${TONE_STYLE[toast.tone]}`}>
              <Icon width={17} height={17} className="shrink-0 mt-px" aria-hidden="true" />
              <p className="flex-1 min-w-0 leading-snug">{toast.message}</p>
              <button onClick={() => dismiss(toast.id)} className="shrink-0 -m-1 p-1 rounded-md text-fg-faint hover:text-fg" aria-label={t('common.dismiss')}>
                <IconClose width={15} height={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
