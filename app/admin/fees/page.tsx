'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal as Modal, Field as L } from '@/components/AdminModal'

type Rule = { id: string; service: 'wallet_transfer' | 'withdrawal' | 'wallet_withdrawal'; label: string; asset: string | null; chain_id: number | null; fixed_fee: number; pct_fee: number; min_fee: number; max_fee: number | null; enabled: boolean; effective_from: string; updated_at: string }
type Addr = { id: string; chain_id: number; network: string; asset: string; token_contract: string | null; decimals: number; address: string; min_confirmations: number; enabled: boolean }
type FeeRow = { id: string; created_at: string; full_name: string | null; email: string | null; method: string; amount: number; reference: string | null; notes: string | null; status: string }

const SERVICE: Record<string, string> = { withdrawal: 'Normal Withdrawal', wallet_withdrawal: 'External Wallet Transfer (to a linked wallet)', wallet_transfer: 'External wallet → Tarafab transfer (incoming)' }
const NETS: [number, string][] = [[1, 'Ethereum'], [8453, 'Base'], [42161, 'Arbitrum One'], [10, 'OP Mainnet'], [137, 'Polygon'], [56, 'BNB Smart Chain']]
// Canonical Ethereum mainnet stablecoin contracts, offered as a starting
// point only; the admin confirms every value before saving.
const KNOWN: Record<string, { contract: string; decimals: number }> = {
  '1:USDC': { contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  '1:USDT': { contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
}
const usd = (n: number | null | undefined) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const emptyRule = { id: '', service: 'wallet_transfer', label: 'Tarafab Service Fee', asset: '', chain_id: '', fixed_fee: '0', pct_fee: '0', min_fee: '0', max_fee: '', enabled: false, effective_from: '', reason: '' }
const emptyAddr = { id: '', chain_id: '1', network: 'Ethereum', asset: 'ETH', token_contract: '', decimals: '18', address: '', min_confirmations: '12', enabled: true, reason: '' }

// Service fees: the authoritative, audited configuration. The client app and
// the database read the active rule from here; nothing is hardcoded.
export default function AdminFeesPage() {
  const supabase = createClient()
  const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>).call(supabase, fn, args)
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [addrs, setAddrs] = useState<Addr[] | null>(null)
  const [report, setReport] = useState<FeeRow[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [rf, setRf] = useState<typeof emptyRule | null>(null)
  const [af, setAf] = useState<typeof emptyAddr | null>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [range, setRange] = useState(30)

  const load = useCallback(async () => {
    const from = new Date(Date.now() - range * 86400000).toISOString()
    const [r, a, f] = await Promise.all([
      (supabase.from('service_fee_rules') as any).select('*').order('service').order('effective_from', { ascending: false }),
      (supabase.from('deposit_addresses') as any).select('*').order('chain_id').order('asset'),
      rpc('admin_fee_report', { p_from: from, p_to: null, p_limit: 300 }),
    ])
    if (r.error || a.error || f.error) { setError('Fee settings could not be loaded.'); return }
    setRules(Array.isArray(r.data) ? r.data : []); setAddrs(Array.isArray(a.data) ? a.data : []); setReport(Array.isArray(f.data) ? f.data as FeeRow[] : []); setError('')
  }, [supabase, range]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, reload])

  const saveRule = async () => {
    if (!rf) return
    setBusy(true); setFormErr('')
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    const { error } = await rpc('admin_upsert_fee_rule', {
      p_id: rf.id || null, p_service: rf.service, p_label: rf.label, p_asset: rf.asset || null, p_chain_id: n(String(rf.chain_id)),
      p_fixed: n(rf.fixed_fee) ?? 0, p_pct: n(rf.pct_fee) ?? 0, p_min: n(rf.min_fee) ?? 0, p_max: n(rf.max_fee), p_enabled: rf.enabled,
      p_effective_from: rf.effective_from ? new Date(rf.effective_from).toISOString() : null, p_reason: rf.reason,
    })
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    setRf(null); load()
  }
  const saveAddr = async () => {
    if (!af) return
    setBusy(true); setFormErr('')
    const { error } = await rpc('admin_upsert_deposit_address', {
      p_id: af.id || null, p_chain_id: Number(af.chain_id), p_network: af.network, p_asset: af.asset, p_token_contract: af.token_contract || null,
      p_decimals: Number(af.decimals), p_address: af.address, p_min_confirmations: Number(af.min_confirmations), p_enabled: af.enabled, p_reason: af.reason,
    })
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    setAf(null); load()
  }
  const total = (report || []).filter(x => x.status === 'completed').reduce((s, x) => s + Number(x.amount), 0)
  const field = 'w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white'

  return (
    <AdminLayout title="Fees & Transfers" subtitle="Tarafab Service Fees and the addresses that receive external wallet transfers">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}
      <p className="mb-4 text-xs text-amber-300/90">Charging service fees and accepting crypto transfers can be regulated activity. Confirm the applicable payment, consumer-disclosure, tax and crypto-service requirements before enabling a fee or a receiving address.</p>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-white">Service fee rules</h2>
          <button onClick={() => { setFormErr(''); setRf({ ...emptyRule }) }} className="text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5">Add rule</button>
        </div>
        {!rules ? <p className="text-xs text-slate-500">Loading…</p> : !rules.length ? <p className="text-xs text-slate-400">No fee rules. No service fee is charged.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Service</th><th className="pr-3">Scope</th><th className="pr-3">Fee</th><th className="pr-3">Min / Max</th><th className="pr-3">From</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>{rules.map(r => (
              <tr key={r.id} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3">{SERVICE[r.service]}<div className="text-slate-500">{r.label}</div></td>
                <td className="pr-3">{!r.asset ? 'Any asset' : ['ANY', '*', 'ALL'].includes(r.asset.trim().toUpperCase()) ? `Any asset (stored as “${r.asset}”)` : r.asset} · {r.chain_id ? NETS.find(x => x[0] === r.chain_id)?.[1] || r.chain_id : 'Any network'}</td>
                <td className="pr-3 tabular-nums">{Number(r.pct_fee)}% + {usd(r.fixed_fee)}</td>
                <td className="pr-3 tabular-nums">{usd(r.min_fee)} / {r.max_fee == null ? 'none' : usd(r.max_fee)}</td>
                <td className="pr-3">{new Date(r.effective_from).toLocaleString()}</td>
                <td className="pr-3">{r.enabled ? <span className="text-emerald-400">Enabled</span> : <span className="text-slate-500">Disabled</span>}</td>
                <td><button onClick={() => { setFormErr(''); setRf({ id: r.id, service: r.service, label: r.label, asset: r.asset || '', chain_id: r.chain_id == null ? '' : String(r.chain_id), fixed_fee: String(r.fixed_fee), pct_fee: String(r.pct_fee), min_fee: String(r.min_fee), max_fee: r.max_fee == null ? '' : String(r.max_fee), enabled: r.enabled, effective_from: '', reason: '' }) }} className="text-violet-300 hover:text-violet-200">Edit</button></td>
              </tr>))}</tbody></table></div>
        )}
        {rules && !rules.some(r => r.enabled && r.service === 'withdrawal') && (
          <p className="mt-2 text-[11px] text-amber-300" role="status" data-no-withdrawal-rule>No enabled {SERVICE['withdrawal'] || 'Withdrawal'} rule: clients&apos; withdrawal preview shows “None” and no withdrawal fee is charged. Rules apply only to the service they are set for (“Any asset · Any network” widens the asset and network, not the service). Add a rule with service “{SERVICE['withdrawal'] || 'Withdrawal'}” to charge withdrawals.</p>
        )}
        {rules && !rules.some(r => r.enabled && r.service === 'wallet_withdrawal') && (
          <p className="mt-2 text-[11px] text-amber-300" role="status" data-no-wallet-withdrawal-rule>No enabled {SERVICE.wallet_withdrawal} rule: withdrawals to linked wallets are charged no service fee. Add a rule with service “{SERVICE.wallet_withdrawal}”.</p>
        )}
        {rules && (() => {
          // Sample check that External Wallet Transfer costs more than Normal Withdrawal (general rules).
          const fee = (svc: string, amt: number) => { const r = rules.filter(x => x.enabled && x.service === svc && (!x.asset || ['ANY', '*', 'ALL'].includes(x.asset.trim().toUpperCase())) && x.chain_id == null)[0]; if (!r) return null
            let f = Number(r.fixed_fee) + amt * Number(r.pct_fee) / 100; f = Math.max(f, Number(r.min_fee)); if (r.max_fee != null) f = Math.min(f, Number(r.max_fee)); return Math.min(f, amt) }
          const bad = [100, 1000, 10000].filter(a => { const n = fee('withdrawal', a), x = fee('wallet_withdrawal', a); return n != null && x != null && x <= n })
          return bad.length ? <p className="mt-2 text-[11px] text-amber-300" role="status" data-fee-order-warning>{SERVICE.wallet_withdrawal} is not more expensive than {SERVICE.withdrawal} at ${bad.join(', $')} (general rules).</p> : null
        })()}
        <p className="mt-2 text-[11px] text-slate-500">The most specific enabled rule applies (asset + network, then asset, then network, then general). Fee = fixed + percentage, kept between min and max, never more than the amount. Shown to clients as “Tarafab Service Fee” before they confirm.</p>
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div><h2 className="text-sm font-semibold text-white">Tarafab receiving addresses</h2>
            <p className="text-[11px] text-slate-500">The enabled ETH · Ethereum (chain 1) address is also the Ethereum option on the client Deposit page; disable it to hide that option.</p></div>
          <button onClick={() => { setFormErr(''); setAf({ ...emptyAddr }) }} className="text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5">Add address</button>
        </div>
        {!addrs ? <p className="text-xs text-slate-500">Loading…</p> : !addrs.length ? <p className="text-xs text-slate-400">None configured. “Transfer to Tarafab” and Ethereum deposits are shown to clients as not available.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Network</th><th className="pr-3">Asset</th><th className="pr-3">Receiving address</th><th className="pr-3">Confirmations</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>{addrs.map(a => (
              <tr key={a.id} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3">{a.network} ({a.chain_id})</td>
                <td className="pr-3">{a.asset}{a.token_contract && <div className="text-slate-500 font-mono">{a.token_contract.slice(0, 10)}… · {a.decimals} dp</div>}</td>
                <td className="pr-3 font-mono break-all">{a.address}</td>
                <td className="pr-3">{a.min_confirmations}</td>
                <td className="pr-3">{a.enabled ? <span className="text-emerald-400">Enabled</span> : <span className="text-slate-500">Disabled</span>}</td>
                <td><button onClick={() => { setFormErr(''); setAf({ id: a.id, chain_id: String(a.chain_id), network: a.network, asset: a.asset, token_contract: a.token_contract || '', decimals: String(a.decimals), address: a.address, min_confirmations: String(a.min_confirmations), enabled: a.enabled, reason: '' }) }} className="text-violet-300 hover:text-violet-200">Edit</button></td>
              </tr>))}</tbody></table></div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Use addresses Tarafab controls. Transfers are credited only after the transaction is verified on-chain (destination, token, amount, sender = the client’s verified wallet, confirmations). Reconcile in <Link href="/admin/transfers" className="text-violet-300">Wallet transfers →</Link></p>
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-white">Service fee activity</h2>
          <select value={range} onChange={e => setRange(Number(e.target.value))} className="rounded-lg bg-white/[0.04] border border-white/[0.1] px-2 py-1 text-xs text-white">
            {[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-400 mb-2">Completed fees in range: <span className="text-white tabular-nums">{usd(total)}</span> · {(report || []).length} records (from the transactions ledger)</p>
        {!report ? <p className="text-xs text-slate-500">Loading…</p> : !report.length ? <p className="text-xs text-slate-400">No service fees recorded in this period.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Date</th><th className="pr-3">Client</th><th className="pr-3">Service</th><th className="pr-3">Amount</th><th className="pr-3">Related</th><th>Status</th></tr></thead>
            <tbody>{report.map(x => (
              <tr key={x.id} className="border-t border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(x.created_at).toLocaleString()}</td>
                <td className="pr-3">{x.full_name || '—'}<div className="text-slate-500">{x.email}</div></td>
                <td className="pr-3">{x.notes || x.method}</td>
                <td className="pr-3 tabular-nums">{usd(x.amount)}</td>
                <td className="pr-3 font-mono">{x.reference}</td>
                <td>{x.status}</td>
              </tr>))}</tbody></table></div>
        )}
      </section>

      {rf && (
        <Modal title={rf.id ? 'Edit fee rule' : 'New fee rule'} onClose={() => setRf(null)} onSave={saveRule} busy={busy} err={formErr}>
          <L label="Service"><select className={field} value={rf.service} onChange={e => setRf({ ...rf, service: e.target.value })}><option value="withdrawal">{SERVICE.withdrawal}</option><option value="wallet_withdrawal">{SERVICE.wallet_withdrawal}</option><option value="wallet_transfer">{SERVICE.wallet_transfer}</option></select></L>
          <p className="text-[11px] text-slate-500 -mt-1">Normal Withdrawal: to an address the client types. External Wallet Transfer: to one of the client&apos;s linked, verified wallets (usually priced higher). Incoming: client sends crypto into Tarafab.</p>
          <L label="Label shown to clients"><input className={field} value={rf.label} onChange={e => setRf({ ...rf, label: e.target.value })} /></L>
          <div className="grid grid-cols-2 gap-2">
            <L label="Asset (blank = any)"><input className={field} value={rf.asset} onChange={e => setRf({ ...rf, asset: e.target.value.toUpperCase() })} placeholder="ETH" /></L>
            <L label="Network (blank = any)"><select className={field} value={rf.chain_id} onChange={e => setRf({ ...rf, chain_id: e.target.value })}><option value="">Any</option>{NETS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></L>
            <L label="Percentage %"><input className={field} inputMode="decimal" value={rf.pct_fee} onChange={e => setRf({ ...rf, pct_fee: e.target.value })} /></L>
            <L label="Fixed fee (USD)"><input className={field} inputMode="decimal" value={rf.fixed_fee} onChange={e => setRf({ ...rf, fixed_fee: e.target.value })} /></L>
            <L label="Minimum (USD)"><input className={field} inputMode="decimal" value={rf.min_fee} onChange={e => setRf({ ...rf, min_fee: e.target.value })} /></L>
            <L label="Maximum (USD, blank = none)"><input className={field} inputMode="decimal" value={rf.max_fee} onChange={e => setRf({ ...rf, max_fee: e.target.value })} /></L>
          </div>
          <L label="Effective from (blank = now / unchanged)"><input type="datetime-local" className={field} value={rf.effective_from} onChange={e => setRf({ ...rf, effective_from: e.target.value })} /></L>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={rf.enabled} onChange={e => setRf({ ...rf, enabled: e.target.checked })} /> Enabled</label>
          <L label="Reason (audit log)"><input className={field} value={rf.reason} onChange={e => setRf({ ...rf, reason: e.target.value })} /></L>
        </Modal>
      )}
      {af && (
        <Modal title={af.id ? 'Edit receiving address' : 'New receiving address'} onClose={() => setAf(null)} onSave={saveAddr} busy={busy} err={formErr}>
          <div className="grid grid-cols-2 gap-2">
            <L label="Network"><select className={field} value={af.chain_id} onChange={e => { const id = e.target.value; setAf({ ...af, chain_id: id, network: NETS.find(x => String(x[0]) === id)?.[1] || af.network }) }}>{NETS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></L>
            <L label="Asset (priced from Markets)"><select className={field} value={af.asset} onChange={e => { const asset = e.target.value; const k = KNOWN[`${af.chain_id}:${asset}`]; setAf({ ...af, asset, token_contract: asset === 'ETH' ? '' : k?.contract || af.token_contract, decimals: asset === 'ETH' ? '18' : String(k?.decimals ?? af.decimals) }) }}><option>ETH</option><option>USDC</option><option>USDT</option></select></L>
          </div>
          {af.asset !== 'ETH' && <L label="Token contract"><input className={`${field} font-mono`} value={af.token_contract} onChange={e => setAf({ ...af, token_contract: e.target.value.trim() })} placeholder="0x…" /></L>}
          <div className="grid grid-cols-2 gap-2">
            <L label="Decimals"><input className={field} value={af.decimals} onChange={e => setAf({ ...af, decimals: e.target.value })} /></L>
            <L label="Required confirmations"><input className={field} value={af.min_confirmations} onChange={e => setAf({ ...af, min_confirmations: e.target.value })} /></L>
          </div>
          <L label="Tarafab receiving address"><input className={`${field} font-mono`} value={af.address} onChange={e => setAf({ ...af, address: e.target.value.trim() })} placeholder="0x…" /></L>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={af.enabled} onChange={e => setAf({ ...af, enabled: e.target.checked })} /> Enabled</label>
          <L label="Reason (audit log)"><input className={field} value={af.reason} onChange={e => setAf({ ...af, reason: e.target.value })} /></L>
        </Modal>
      )}
    </AdminLayout>
  )
}
