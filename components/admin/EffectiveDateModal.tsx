'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseEffective, toLocalInput } from '@/lib/effectiveDate'

// Admin: change the effective (business) date of an existing transaction.
// The database checks the admin role, validates the date, keeps the amount,
// status, balances and recording time unchanged, and audits the change with
// the previous and new date, the reason and the admin.
export function EffectiveDateModal({ tx, onClose, onSaved }: {
  tx: { id: string; reference: string | null; type: string; amount: number; effective_at: string; created_at: string }
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState(toLocalInput(tx.effective_at))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fmt = (s: string) => new Date(s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const save = async () => {
    if (busy) return
    const p = parseEffective(value)
    if (!value || p.error) { setError(p.error || 'Enter an effective date.'); return }
    if (reason.trim().length < 3) { setError('Enter a reason (at least 3 characters).'); return }
    setBusy(true); setError('')
    const { error: e } = await (createClient().rpc as any)('admin_set_transaction_effective_date', { p_tx: tx.id, p_effective_at: p.iso, p_reason: reason.trim() }) as { error: { message: string } | null }
    setBusy(false)
    if (e) { setError(/^(Enter|The|Transaction|Not authorized)/.test(e.message) ? e.message : 'The date could not be changed. Please try again.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="eff-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative z-10 glass w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <h3 id="eff-title" className="text-base font-bold text-white">Change effective date</h3>
        <p className="text-xs text-slate-500 mt-1">{tx.reference || tx.id.slice(0, 8)} · ${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}. Amount, status and balances do not change.</p>
        <dl className="mt-4 space-y-1 text-xs">
          <div className="flex justify-between"><dt className="text-slate-500">Current effective date</dt><dd className="text-white">{fmt(tx.effective_at)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Recorded (internal)</dt><dd className="text-slate-300">{fmt(tx.created_at)}</dd></div>
        </dl>
        <label htmlFor="eff-date" className="block text-xs text-slate-400 mt-4 mb-1.5">New effective date</label>
        <input id="eff-date" type="datetime-local" value={value} min="2020-01-01T00:00" max={toLocalInput(new Date())} onChange={e => setValue(e.target.value)} className="input-field w-full text-sm" />
        <label htmlFor="eff-reason" className="block text-xs text-slate-400 mt-3 mb-1.5">Reason (audit log only)</label>
        <input id="eff-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="e.g. Recorded late; applies to 25 Sep" className="input-field w-full text-sm" />
        {error && <p role="alert" className="text-xs text-red-400 mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={busy} className="flex-1 text-sm text-slate-300 border border-white/[0.1] rounded-xl px-4 py-2.5">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-2.5 disabled:opacity-60">{busy ? 'Saving…' : 'Save date'}</button>
        </div>
      </div>
    </div>
  )
}
