'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal, Field } from '@/components/AdminModal'

type Row = {
  id: string; reference: string; user_id: string; full_name: string | null; email: string | null; chain_id: number; network: string; asset: string
  from_address: string; to_address: string; tx_hash: string | null; quoted_amount: number; received_amount: number | null; usd_rate: number; credit_rate: number | null
  quoted_credit_usd: number; gross_usd: number | null; fee_usd: number | null; credited_usd: number | null; confirmations: number; required_confirmations: number
  status: string; error: string | null; transaction_id: string | null; fee_transaction_id: string | null; ledger_amount: number | null; ledger_status: string | null
  fee_ledger_amount: number | null; created_at: string; submitted_at: string | null; credited_at: string | null
}
const EXPLORER: Record<number, string> = { 1: 'https://etherscan.io/tx/', 8453: 'https://basescan.org/tx/', 42161: 'https://arbiscan.io/tx/', 10: 'https://optimistic.etherscan.io/tx/', 137: 'https://polygonscan.com/tx/', 56: 'https://bscscan.com/tx/' }
const TONE: Record<string, string> = { credited: 'text-emerald-400', needs_review: 'text-amber-300', failed: 'text-red-400', submitted: 'text-sky-300', confirming: 'text-sky-300' }
const usd = (n: number | null) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

// Wallet transfer reconciliation: each blockchain transaction next to the
// ledger entries it produced (deposit + Tarafab Service Fee) and the amount
// credited. Read from the one existing ledger; nothing is duplicated.
export default function AdminTransfersPage() {
  const supabase = createClient()
  const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>).call(supabase, fn, args)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [res, setRes] = useState<null | { row: Row; action: 'credit' | 'reject'; received: string; rate: string; reason: string }>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await rpc('admin_list_transfers', { p_status: status || null, p_limit: 300 })
    if (error) { setError('Wallet transfers could not be loaded.'); return }
    setRows(Array.isArray(data) ? data as Row[] : []); setError('')
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, reload])
  useEffect(() => { const i = setInterval(load, 30_000); return () => clearInterval(i) }, [load])

  const resolve = async () => {
    if (!res) return
    setBusy(true); setFormErr('')
    const { error } = await rpc('admin_resolve_transfer', { p_id: res.row.id, p_action: res.action, p_received: res.received ? Number(res.received) : null, p_rate: res.rate ? Number(res.rate) : null, p_reason: res.reason })
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    setRes(null); load()
  }
  // A credited transfer whose ledger rows do not add up is flagged here.
  const mismatch = (r: Row) => r.status === 'credited' && (r.ledger_amount == null || Math.abs(Number(r.ledger_amount) - Number(r.gross_usd)) > 0.004 ||
    Math.abs(Number(r.fee_ledger_amount ?? 0) - Number(r.fee_usd ?? 0)) > 0.004 || Math.abs(Number(r.gross_usd) - Number(r.fee_usd ?? 0) - Number(r.credited_usd)) > 0.004)
  const n = (s: string) => (rows || []).filter(r => r.status === s).length

  return (
    <AdminLayout title="Wallet transfers" subtitle="External wallet → Tarafab transfers, verified on-chain and reconciled with the ledger">
      {error && <AdminLoadError message={error} onRetry={() => setReload(x => x + 1)} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[['Pending on-chain', n('submitted') + n('confirming')], ['Needs review', n('needs_review')], ['Credited', n('credited')], ['Failed', n('failed')]].map(([k, v]) => (
          <div key={k as string} className="glass rounded-xl border border-white/[0.08] p-3"><p className="text-[11px] text-slate-500">{k}</p><p className="text-xl font-semibold text-white tabular-nums">{rows ? v : '—'}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg bg-white/[0.04] border border-white/[0.1] px-2 py-1 text-xs text-white">
          <option value="">All statuses</option>{['awaiting_signature', 'submitted', 'confirming', 'credited', 'needs_review', 'failed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <Link href="/admin/fees" className="text-xs text-accent">Fees & receiving addresses →</Link>
        <Link href="/admin/reconciliation" className="text-xs text-accent">Balance reconciliation →</Link>
      </div>
      <div className="glass rounded-2xl border border-white/[0.08] p-4 overflow-x-auto">
        {!rows ? <p className="text-xs text-slate-500">Loading…</p> : !rows.length ? <p className="text-xs text-slate-400">No wallet transfers yet.</p> : (
          <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Transfer</th><th className="pr-3">Client</th><th className="pr-3">Blockchain transaction</th><th className="pr-3">Received</th><th className="pr-3">Deposit (ledger)</th><th className="pr-3">Service fee (ledger)</th><th className="pr-3">Credited</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className={`border-t border-white/[0.06] text-slate-300 align-top ${mismatch(r) ? 'bg-red-500/[0.06]' : ''}`}>
                <td className="py-2 pr-3"><span className="font-mono">{r.reference}</span><div className="text-slate-500">{new Date(r.created_at).toLocaleString()}</div></td>
                <td className="pr-3">{r.full_name || '—'}<div className="text-slate-500">{r.email}</div></td>
                <td className="pr-3">
                  {r.tx_hash ? (EXPLORER[r.chain_id] ? <a href={EXPLORER[r.chain_id] + r.tx_hash} target="_blank" rel="noopener noreferrer" className="font-mono text-accent">{r.tx_hash.slice(0, 12)}…</a> : <span className="font-mono">{r.tx_hash.slice(0, 12)}…</span>) : '—'}
                  <div className="text-slate-500">{r.network} · from <span className="font-mono">{r.from_address.slice(0, 8)}…</span> · {r.confirmations}/{r.required_confirmations} conf.</div>
                </td>
                <td className="pr-3 tabular-nums">{r.received_amount != null ? `${Number(r.received_amount)} ${r.asset}` : <span className="text-slate-500">quoted {Number(r.quoted_amount)} {r.asset}</span>}{r.credit_rate != null && <div className="text-slate-500">@ {usd(r.credit_rate)}</div>}</td>
                <td className="pr-3 tabular-nums">{usd(r.ledger_amount)}{r.ledger_status && <div className="text-slate-500">{r.ledger_status}</div>}</td>
                <td className="pr-3 tabular-nums">{r.fee_transaction_id ? usd(r.fee_ledger_amount) : r.status === 'credited' ? '$0.00' : '—'}</td>
                <td className="pr-3 tabular-nums">{usd(r.credited_usd)}{mismatch(r) && <div className="text-red-400">Ledger mismatch</div>}</td>
                <td className={`pr-3 font-semibold ${TONE[r.status] || 'text-slate-400'}`}>{r.status.replace('_', ' ')}{r.error && <div className="font-normal text-slate-500 max-w-[16rem]">{r.error}</div>}</td>
                <td>{['needs_review', 'submitted', 'confirming'].includes(r.status) && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { setFormErr(''); setRes({ row: r, action: 'credit', received: r.received_amount != null ? String(r.received_amount) : '', rate: String(r.usd_rate), reason: '' }) }} className="text-emerald-400 hover:text-emerald-300">Credit…</button>
                    <button onClick={() => { setFormErr(''); setRes({ row: r, action: 'reject', received: '', rate: '', reason: '' }) }} className="text-red-400 hover:text-red-300">Close…</button>
                  </div>
                )}</td>
              </tr>))}</tbody></table>
        )}
      </div>
      {res && (
        <AdminModal title={res.action === 'credit' ? `Credit ${res.row.reference}` : `Close ${res.row.reference}`} saveLabel={res.action === 'credit' ? 'Credit once' : 'Close transfer'} busy={busy} err={formErr} onClose={() => setRes(null)} onSave={resolve}>
          {res.action === 'credit' ? (
            <>
              <p className="text-xs text-amber-300/90">Only credit after you have checked the transaction on the explorer: funds reached the Tarafab address and belong to this client. The credit happens once, with the configured Tarafab Service Fee, and is audited.</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Amount received (${res.row.asset})`}><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={res.received} onChange={e => setRes({ ...res, received: e.target.value })} /></Field>
                <Field label="USD rate"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={res.rate} onChange={e => setRes({ ...res, rate: e.target.value })} /></Field>
              </div>
            </>
          ) : <p className="text-xs text-slate-400">Marks the transfer as failed without crediting anything (for example funds never arrived).</p>}
          <Field label="Reason (required, audit log)"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={res.reason} onChange={e => setRes({ ...res, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
    </AdminLayout>
  )
}
