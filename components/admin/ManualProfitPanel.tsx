'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { fmtDate, fmtDateTime, usd } from '@/components/admin/ManualProfitFields'
import { CLASSIFICATIONS, ManualProfitCreditForm, type CreditClient } from '@/components/admin/ManualProfitCredit'
import { DEBIT_CATEGORIES, ManualProfitDebitForm } from '@/components/admin/ManualProfitDebit'

// Manual Profit Credit and Debit, side by side in one panel: a switch between
// the two forms over the client's current profit balance, and the combined
// record of manual entries (admin only; both record tables are readable by
// admins alone).

export type ProfitSnapshot = {
  profit_balance: number
  pending_withdrawals: number
  available_for_debit: number
  account_opened_at: string
  reversible_credits: { reference: string; amount: number; source: string | null; effective_at: string; remaining: number }[]
  correctable_debits: { reference: string; amount: number; category: string; effective_at: string; remaining: number }[]
}

export function useProfitSnapshot(clientId: string | null, refreshKey = 0) {
  const [snapshot, setSnapshot] = useState<ProfitSnapshot | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!clientId) return
    try {
      const { snapshot: s } = await readJson<{ snapshot: ProfitSnapshot }>(await authFetch(`/api/admin/profit-balance?client=${clientId}`))
      setSnapshot(s); setError('')
    } catch (e) { setError(`The profit balance could not be loaded: ${errorText(e)}`) }
  }, [clientId])
  useEffect(() => { setSnapshot(null); load() }, [load, refreshKey])
  return { snapshot, error, reload: load }
}

export function ManualProfitPanel({ client, profitBalance, onPosted }: { client: CreditClient; profitBalance?: number | null; onPosted?: () => void }) {
  const [mode, setMode] = useState<'credit' | 'debit'>('credit')
  const [refresh, setRefresh] = useState(0)
  const { snapshot, error } = useProfitSnapshot(client.id, refresh)
  const posted = () => { setRefresh(n => n + 1); onPosted?.() }
  return (
    <div data-mp-panel>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4" data-mp-balance>
        <Stat label="Profit balance" value={snapshot ? usd(snapshot.profit_balance) : profitBalance != null ? usd(profitBalance) : '…'} />
        <Stat label="Requested withdrawals" value={snapshot ? usd(snapshot.pending_withdrawals) : '…'} muted />
        <Stat label="Available to debit" value={snapshot ? usd(snapshot.available_for_debit) : '…'} />
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 mb-5" role="tablist" aria-label="Entry type">
        {(['credit', 'debit'] as const).map(m => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-mp-mode={m}
            className={`py-2.5 rounded-lg text-[13px] font-semibold transition-colors ${mode === m ? (m === 'credit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-200') : 'text-slate-400 hover:text-slate-200'}`}>
            {m === 'credit' ? '+ Profit credit' : '− Profit debit'}
          </button>
        ))}
      </div>
      {mode === 'credit'
        ? <ManualProfitCreditForm client={client} snapshot={snapshot} profitBalance={profitBalance} onPosted={posted} />
        : <ManualProfitDebitForm client={client} snapshot={snapshot} snapshotError={error} onPosted={posted} />}
    </div>
  )
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 leading-tight">{label}</p>
      <p className={`text-[13px] sm:text-sm font-semibold tabular-nums truncate mt-0.5 ${muted ? 'text-slate-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

type Entry = {
  kind: 'credit' | 'debit'
  id: string
  user_id: string
  admin_id: string
  amount: number
  currency: string
  title: string
  description: string
  internal_note: string | null
  external_reference: string | null
  evidence_path: string | null
  backdate_reason: string | null
  pre_opening_exception: boolean
  exception_basis: string | null
  effective_at: string
  posted_at: string
  profit_balance_before: number | null
  profit_balance_after: number | null
  reference: string | null
  linked: string | null
  investment: string | null
}

// Recorded manual profit credits and debits, newest posting first. The
// effective date and the posting time are shown separately; historical and
// pre-opening entries are flagged. Posted entries are never edited here.
export function ManualProfitHistory({ clientId, refreshKey = 0, limit = 25 }: { clientId?: string; refreshKey?: number; limit?: number }) {
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const sb = createClient()
    let qc = (sb.from('manual_profit_credits') as any)
      .select('id, user_id, admin_id, amount, currency, classification, reason, internal_note, external_reference, evidence_path, backdate_reason, pre_opening_exception, exception_basis, effective_at, posted_at, profit_balance_before, profit_balance_after, tx:transactions!manual_profit_credits_transaction_id_fkey(reference), rev:transactions!manual_profit_credits_reverses_transaction_id_fkey(reference), client_investments(reference)')
      .order('posted_at', { ascending: false }).limit(limit)
    let qd = (sb.from('manual_profit_debits') as any)
      .select('id, user_id, admin_id, amount, currency, category, description, internal_note, external_reference, evidence_path, backdate_reason, pre_opening_exception, exception_basis, effective_at, posted_at, profit_balance_before, profit_balance_after, tx:transactions!manual_profit_debits_transaction_id_fkey(reference), rev:transactions!manual_profit_debits_reverses_transaction_id_fkey(reference)')
      .order('posted_at', { ascending: false }).limit(limit)
    if (clientId) { qc = qc.eq('user_id', clientId); qd = qd.eq('user_id', clientId) }
    Promise.all([qc, qd]).then(async ([c, d]: { data: any[] | null; error: unknown }[]) => {
      if (!live) return
      if (c.error || d.error) { setError('Recorded entries could not be loaded.'); return }
      setError('')
      const all: Entry[] = [
        ...(c.data || []).map(r => ({
          kind: 'credit' as const, ...r, description: r.reason,
          title: CLASSIFICATIONS.find(x => x.id === r.classification)?.title || 'Profit credit',
          reference: r.tx?.reference ?? null, linked: r.rev?.reference ?? null, investment: r.client_investments?.reference ?? null,
        })),
        ...(d.data || []).map(r => ({
          kind: 'debit' as const, ...r,
          title: DEBIT_CATEGORIES.find(x => x.id === r.category)?.title || 'Profit debit',
          reference: r.tx?.reference ?? null, linked: r.rev?.reference ?? null, investment: null,
        })),
      ].sort((a, b) => b.posted_at.localeCompare(a.posted_at)).slice(0, limit)
      setRows(all)
      const ids = Array.from(new Set(all.flatMap(r => [r.user_id, r.admin_id])))
      if (!ids.length) return
      const { data: ps } = await (sb.from('profiles') as any).select('id, full_name').in('id', ids) as { data: { id: string; full_name: string | null }[] | null }
      if (live) setNames(new Map((ps || []).map(p => [p.id, p.full_name || 'Unnamed'])))
    })
    return () => { live = false }
  }, [clientId, refreshKey, limit])

  if (error) return <p role="alert" className="text-xs text-red-400">{error}</p>
  if (!rows) return <p className="text-xs text-slate-500">Loading…</p>
  if (!rows.length) return <p className="text-xs text-slate-500" data-mpc-history-empty>No manual profit credits or debits recorded{clientId ? ' for this client' : ''} yet.</p>

  return (
    <ul className="divide-y divide-white/[0.06]" data-mpc-history>
      {rows.map(r => <HistoryItem key={`${r.kind}-${r.id}`} r={r} names={names} showClient={!clientId} />)}
    </ul>
  )
}

function HistoryItem({ r, names, showClient }: { r: Entry; names: Map<string, string>; showClient: boolean }) {
  const [err, setErr] = useState('')
  const credit = r.kind === 'credit'
  const viewEvidence = async () => {
    try {
      const { url } = await readJson<{ url: string }>(await authFetch(`/api/admin/historical-evidence?path=${encodeURIComponent(r.evidence_path!)}`))
      window.open(url, '_blank', 'noopener')
    } catch (e) { setErr(errorText(e)) }
  }
  return (
    <li className="py-3 text-sm" data-mpc-row data-mp-kind={r.kind}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-medium">{r.title}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <Badge tone={credit ? 'emerald' : 'rose'}>{credit ? 'Credit' : 'Debit'}</Badge>
            {r.backdate_reason && <Badge tone="amber" data="historical">Historical</Badge>}
            {r.pre_opening_exception && <Badge tone="amber" data="preopening">Pre-opening exception</Badge>}
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1">{r.reference || '—'}{r.investment ? ` · ${r.investment}` : ''}{r.linked ? ` · ${credit ? 'corrects' : 'reverses'} ${r.linked}` : ''}</p>
          {showClient && <Link href={`/admin/clients/${r.user_id}`} className="text-[12px] text-accent hover:text-accent-hover">{names.get(r.user_id) || 'Client'}</Link>}
        </div>
        <p className={`${credit ? 'text-emerald-300' : 'text-rose-200'} font-semibold tabular-nums shrink-0`}>{credit ? '+' : '−'}{usd(r.amount)} <span className="text-[10px] text-slate-500 font-normal">{r.currency}</span></p>
      </div>
      <dl className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div className="flex gap-1.5"><dt className="text-slate-500">Effective</dt><dd className="text-slate-200">{fmtDate(r.effective_at)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">Posted</dt><dd className="text-slate-300">{fmtDateTime(r.posted_at)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">By</dt><dd className="text-slate-300">{names.get(r.admin_id) || 'Admin'}</dd></div>
        {r.profit_balance_before !== null && <div className="flex gap-1.5"><dt className="text-slate-500">Profit balance</dt><dd className="text-slate-300 tabular-nums">{usd(r.profit_balance_before)} → {usd(r.profit_balance_after)}</dd></div>}
        {r.external_reference && <div className="flex gap-1.5 min-w-0"><dt className="text-slate-500">Ref.</dt><dd className="text-slate-300 break-all">{r.external_reference}</dd></div>}
      </dl>
      <p className="text-[11px] text-slate-400 mt-1 break-words">{r.description}</p>
      {r.backdate_reason && <p className="text-[11px] text-amber-300/80 mt-0.5 break-words">Earlier date: {r.backdate_reason}</p>}
      {r.exception_basis && <p className="text-[11px] text-amber-300/80 mt-0.5 break-words">Accounting basis: {r.exception_basis}</p>}
      {r.internal_note && <p className="text-[11px] text-slate-500 mt-0.5 break-words">Note: {r.internal_note}</p>}
      {r.evidence_path && <button type="button" onClick={viewEvidence} className="mt-1 text-[11px] text-accent underline underline-offset-2">View evidence file</button>}
      {err && <p role="alert" className="text-[11px] text-red-400 mt-1">{err}</p>}
    </li>
  )
}

function Badge({ tone, data, children }: { tone: 'emerald' | 'rose' | 'amber'; data?: string; children: React.ReactNode }) {
  const c = tone === 'emerald' ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.08]'
    : tone === 'rose' ? 'border-rose-500/30 text-rose-200 bg-rose-500/[0.08]'
    : 'border-amber-500/30 text-amber-300 bg-amber-500/[0.08]'
  return <span className={`inline-flex rounded-md border px-1.5 py-px text-[10px] font-semibold ${c}`} data-mp-badge={data}>{children}</span>
}
