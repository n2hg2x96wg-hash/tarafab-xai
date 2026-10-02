'use client'

import type { ReactNode } from 'react'

// Small form dialog used by the admin configuration pages.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-[11px] text-slate-400 mb-1">{label}</span>{children}</label>
}

export function AdminModal({ title, children, onClose, onSave, busy, err, saveLabel = 'Save' }: { title: string; children: ReactNode; onClose: () => void; onSave: () => void; busy: boolean; err: string; saveLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] bg-[#0d1117] p-5 space-y-3">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {children}
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-white/[0.1] px-3 py-2 text-sm text-slate-300">Cancel</button>
          <button onClick={onSave} disabled={busy} className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>
  )
}
