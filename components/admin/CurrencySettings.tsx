'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminModal, Field } from '@/components/AdminModal'
import { CURRENCIES, parseCurrencyConfig, type CurrencyConfig } from '@/lib/currency'

type FxInfo = { rates?: Record<string, number>; source?: string; as_of?: string; stale?: boolean; rate?: number | null }
const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(n) } catch { return `${c} ${n.toFixed(2)}` } }

// Currency display (clients only SEE converted prices; checkout is always the
// plan's NGN amount, Nigeria only). Settings live in premium_settings and are
// changed through an audited, admin-only database function.
export function CurrencySettings({ basePrices }: { basePrices: { name: string; amount: number }[] }) {
  const supabase = createClient()
  const [cfg, setCfg] = useState<CurrencyConfig | null>(null)
  const [fx, setFx] = useState<FxInfo | null>(null)
  const [geo, setGeo] = useState<{ country: string | null; currency: string } | null>(null)
  const [edit, setEdit] = useState<null | (CurrencyConfig & { reason: string })>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data } = await (supabase.from('premium_settings') as any).select('currency_config').eq('id', 1).maybeSingle()
    setCfg(parseCurrencyConfig(data?.currency_config))
    fetch('/api/fx').then(r => r.json()).then(setFx).catch(() => setFx({}))
    fetch('/api/geo').then(r => r.json()).then(setGeo).catch(() => setGeo(null))
  }, [supabase])
  useEffect(() => { load() }, [load])
  const save = async () => {
    if (!edit) return
    setBusy(true); setErr('')
    const { error } = await (supabase.rpc as any).call(supabase, 'admin_set_currency_config', { p_config: { auto_detect: edit.auto_detect, fallback: edit.fallback, enabled: edit.enabled }, p_reason: edit.reason })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setEdit(null); load()
  }
  const ngnPerUsd = fx?.rates?.NGN
  return (
    <>
    <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5 text-xs" aria-labelledby="cur-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cur-title" className="text-sm font-semibold text-white">Currency display &amp; checkout country</h2>
        {cfg && <button onClick={() => { setErr(''); setEdit({ ...cfg, enabled: [...cfg.enabled], reason: '' }) }} className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-slate-200">Edit currency settings</button>}
      </div>
      {!cfg ? <p className="mt-2 text-slate-500">Loading…</p> : (
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <div><dt className="text-slate-500 inline">Automatic country detection: </dt><dd className="inline">{cfg.auto_detect ? <span className="text-emerald-400">on (IP country)</span> : <span className="text-slate-300">off (fallback for everyone)</span>}</dd></div>
          <div><dt className="text-slate-500 inline">Fallback currency: </dt><dd className="inline text-white">{cfg.fallback}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500 inline">Enabled display currencies: </dt><dd className="inline text-white">{cfg.enabled.join(', ')}</dd></div>
          <div><dt className="text-slate-500 inline">Your detected country: </dt><dd className="inline text-white">{geo?.country || 'unknown'} → {geo?.currency || cfg.fallback}</dd></div>
          <div><dt className="text-slate-500 inline">Payment-eligible country: </dt><dd className="inline text-emerald-400">Nigeria (NG), checkout in NGN only</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500 inline">Exchange rates: </dt><dd className="inline">{ngnPerUsd ? <span className={fx?.stale ? 'text-amber-300' : 'text-emerald-400'}>{fx?.source} · {fx?.as_of ? new Date(fx.as_of).toLocaleString() : ''}{fx?.stale ? ' · STALE (sources unreachable; last verified rates)' : ''} · 1 USD = ₦{ngnPerUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span> : fx ? <span className="text-amber-300">no reliable rate right now: clients see NGN prices only</span> : <span className="text-slate-400">checking…</span>}</dd></div>
        </dl>
      )}
      {cfg && ngnPerUsd && basePrices.length > 0 && (
        <div className="mt-3 overflow-x-auto"><table className="text-[11px]"><thead><tr className="text-left text-slate-500"><th className="pr-3 py-1">Base NGN price</th>{cfg.enabled.filter(c => c !== 'NGN').map(c => <th key={c} className="pr-3">{c}</th>)}</tr></thead>
          <tbody>{basePrices.map(b => (
            <tr key={b.name} className="border-t border-white/[0.06] text-slate-300"><td className="pr-3 py-1 whitespace-nowrap">{b.name} · ₦{b.amount.toLocaleString('en-US')}</td>
              {cfg.enabled.filter(c => c !== 'NGN').map(c => <td key={c} className="pr-3 whitespace-nowrap tabular-nums">{fx?.rates?.[c] ? fmt(b.amount / ngnPerUsd * fx.rates[c], c) : '—'}</td>)}</tr>
          ))}</tbody></table></div>
      )}
      <p className="mt-3 text-slate-500">Base NGN prices are the plan prices in the Plans table below (Edit a plan). Conversions are display-only and never change what is charged. The checkout country is enforced by the database from the visitor&apos;s IP and is not editable here.</p>
    </section>
      {edit && (
        <AdminModal title="Currency display settings" busy={busy} err={err} onClose={() => setEdit(null)} onSave={save}>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.auto_detect} onChange={e => setEdit({ ...edit, auto_detect: e.target.checked })} /> Detect the client&apos;s country automatically (IP)</label>
          <Field label="Enabled currencies (NGN is always on)">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto">
              {Object.keys(CURRENCIES).map(c => (
                <label key={c} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" disabled={c === 'NGN'} checked={edit.enabled.includes(c)} onChange={e => setEdit({ ...edit, enabled: e.target.checked ? [...edit.enabled, c] : edit.enabled.filter(x => x !== c) })} />{c}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Fallback currency (unknown country or detection off)">
            <select className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={edit.fallback} onChange={e => setEdit({ ...edit, fallback: e.target.value })}>
              {edit.enabled.map(c => <option key={c} value={c}>{c} · {CURRENCIES[c]}</option>)}
            </select>
          </Field>
          <Field label="Reason (audit log)"><input className="w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white" value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
    </>
  )
}
