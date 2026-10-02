'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Spinner } from '@/components/AuthShell'

// A confirmation step before an action that cannot be taken back. The dialog
// is modal: focus moves into it, Escape and the backdrop cancel (unless a
// request is already running), and the page behind does not scroll.
export function ConfirmModal({ title, children, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onCancel() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('dialog-open')
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.body.classList.remove('dialog-open'); document.removeEventListener('keydown', onKey) }
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] backdrop-in" onClick={() => { if (!busy) onCancel() }} aria-hidden="true" />
      <div className="relative w-full sm:max-w-md glass-panel rounded-t-2xl sm:rounded-2xl p-6 rise-in safe-bottom">
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-outline flex-1">{cancelLabel}</button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className="btn btn-solid flex-1">
            {busy && <Spinner />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
