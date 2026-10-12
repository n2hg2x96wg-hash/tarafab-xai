'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { countryName, ROUTE_NAMES, type BankRoute } from '@/lib/bankRoutes'

// Review details for a bank-transfer withdrawal (Admin → Transactions).
// There is no payout provider: staff verify the destination, send the
// transfer from the company bank account, then approve the withdrawal with
// that transfer's bank reference. Only masked details are loaded here; the
// full account details are released by admin_bank_account_details, which
// requires a reason and writes an audit record each time.

type BankRow = {
  id: string; user_id: string; label: string | null; country: string; currency: string; route: BankRoute
  holder_name: string; bank_name: string; account_last4: string; name_check: 'match' | 'mismatch'
  status: 'pending_review' | 'verified' | 'rejected' | 'removed'; review_note: string | null; reviewed_at: string | null; created_at: string
}

const STATUS: Record<BankRow['status'], { text: string; cls: string }> = {
  pending_review: { text: 'Not verified yet', cls: 'text-yellow-400' },
  verified: { text: 'Verified', cls: 'text-emerald-400' },
  rejected: { text: 'Rejected', cls: 'text-red-400' },
  removed: { text: 'Removed by client', cls: 'text-slate-400' },
}

const DETAIL_LABEL: Record<string, string> = {
  routing_number: 'Routing number (ABA)', account_number: 'Account number', account_type: 'Account type', sort_code: 'Sort code',
  institution_number: 'Institution number', transit_number: 'Transit number', bsb: 'BSB', iban: 'IBAN', bic: 'BIC / SWIFT',
}

export function BankReviewPanel({ bankAccountId, userId }: { bankAccountId: string; userId: string }) {
  const supabase = createClient()
  // These functions are newer than the generated database types.
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  const [row, setRow] = useState<BankRow | null>(null)
  const [kyc, setKyc] = useState<{ status: string; full_legal_name: string | null } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [details, setDetails] = useState<Record<string, string> | null>(null)

  const load = async () => {
    const [b, k] = await Promise.all([
      supabase.from('client_bank_accounts')
        .select('id, user_id, label, country, currency, route, holder_name, bank_name, account_last4, name_check, status, review_note, reviewed_at, created_at')
        .eq('id', bankAccountId).maybeSingle(),
      supabase.from('kyc_submissions').select('status, full_legal_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (b.error || !b.data) { setLoadError('The bank account could not be loaded.'); return }
    setRow(b.data as BankRow)
    setKyc((k.data as { status: string; full_legal_name: string | null } | null) ?? null)
    setLoadError('')
  }
  useEffect(() => { load() }, [bankAccountId])

  const review = async (action: 'verify' | 'reject') => {
    if (busy) return
    if (!note.trim()) { setMsg({ ok: false, text: 'Enter a note for this decision (for example, how the account was checked).' }); return }
    setBusy(true); setMsg(null)
    let error: { message: string } | null
    try { ({ error } = await rpc('admin_review_bank_account', { p_id: bankAccountId, p_action: action, p_note: note.trim() })) }
    catch { error = { message: 'The request failed. Please try again.' } }
    finally { setBusy(false) }
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setNote('')
    setMsg({ ok: true, text: action === 'verify' ? 'Bank account verified.' : 'Bank account rejected.' })
    load()
  }

  const reveal = async () => {
    if (busy) return
    if (!revealReason.trim()) { setMsg({ ok: false, text: 'Enter why you need the full details (this is recorded).' }); return }
    setBusy(true); setMsg(null)
    let data: unknown = null, error: { message: string } | null
    try { ({ data, error } = await rpc('admin_bank_account_details', { p_id: bankAccountId, p_reason: revealReason.trim() })) }
    catch { error = { message: 'The request failed. Please try again.' } }
    finally { setBusy(false) }
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setDetails(((data as { details?: Record<string, string> } | null)?.details) || {})
  }

  if (loadError) return <p className="text-sm text-red-400 mb-4" data-bank-review-error>{loadError}</p>
  if (!row) return <p className="text-sm text-slate-400 mb-4">Loading bank account…</p>
  const st = STATUS[row.status]
  const kycVerified = kyc?.status === 'verified'

  return (
    <div className="mb-4 rounded-xl border border-white/[0.08] p-3 text-sm space-y-2" data-bank-review>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Destination</span><span className="text-white text-right">{row.label || row.bank_name} · •••• {row.account_last4}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Bank</span><span className="text-white text-right break-words">{row.bank_name}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Country · payout currency</span><span className="text-white text-right">{countryName(row.country)} · {row.currency}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Route</span><span className="text-white text-right">{ROUTE_NAMES[row.route] || row.route}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Account holder</span><span className="text-white text-right break-words">{row.holder_name}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">KYC legal name</span>
        <span className={`text-right break-words ${kycVerified ? 'text-white' : 'text-yellow-400'}`}>{kyc?.full_legal_name || '—'} {kycVerified ? '' : `(KYC ${kyc?.status?.replace(/_/g, ' ') || 'not submitted'})`}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Name check</span>
        <span className={row.name_check === 'match' ? 'text-emerald-400' : 'text-yellow-400'} data-bank-name-check>{row.name_check === 'match' ? 'Matches KYC name' : 'Differs from KYC name: check before paying'}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Account status</span><span className={st.cls} data-bank-status>{st.text}</span></div>
      {row.review_note && <p className="text-xs text-slate-400">Last note: {row.review_note}</p>}

      {row.status !== 'removed' && (
        <div className="pt-2 border-t border-white/[0.06]">
          <label className="block text-xs text-slate-400 mb-1" htmlFor="bank-review-note">Account verification note</label>
          <input id="bank-review-note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="e.g. Bank statement matches KYC name" className="input-field text-sm" disabled={busy} />
          <div className="mt-2 flex gap-2">
            {row.status !== 'verified' && <button type="button" onClick={() => review('verify')} disabled={busy} className="flex-1 py-2 text-xs font-semibold rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-[#fff] disabled:opacity-50" data-bank-verify>Verify account</button>}
            {row.status !== 'rejected' && <button type="button" onClick={() => review('reject')} disabled={busy} className="flex-1 py-2 text-xs font-semibold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50" data-bank-reject>Reject account</button>}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-white/[0.06]">
        {details ? (
          <dl className="space-y-1" data-bank-details>
            {Object.entries(details).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-slate-400">{DETAIL_LABEL[k] || k}</dt><dd className="text-white font-mono text-xs break-all text-right">{v}</dd></div>
            ))}
            <p className="text-[11px] text-slate-500">This view was recorded in the audit log.</p>
          </dl>
        ) : (
          <>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="bank-reveal-reason">Full details for sending the transfer (recorded in the audit log)</label>
            <div className="flex gap-2">
              <input id="bank-reveal-reason" value={revealReason} onChange={e => setRevealReason(e.target.value)} maxLength={200} placeholder="Reason, e.g. Sending payout" className="input-field text-sm flex-1 min-w-0" disabled={busy} />
              <button type="button" onClick={reveal} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg border border-white/[0.12] text-slate-200 hover:bg-white/[0.04] disabled:opacity-50 whitespace-nowrap" data-bank-reveal>Show</button>
            </div>
          </>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  )
}
