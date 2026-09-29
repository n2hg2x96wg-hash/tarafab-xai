'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson } from '@/lib/authFetch'

// Admin Investment Center. Reads use row level security (admins see all);
// every change goes through /api/admin/investments, whose database functions
// check the admin role, validate and audit. Nothing here can change a client
// balance, record a return or create a client investment.

type Product = { id: string; code: string; status: string; current_version_id: string | null; created_at: string; updated_at: string }
type Version = {
  id: string; product_id: string; version: number; name: string; description: string; currency: string
  min_amount: number; max_amount: number | null; term_days: number | null; risk_level: string
  risk_disclosure: string; terms_text: string; entry_fee_pct: number; return_type: string; return_rate_pct: number | null
  eligibility: { kyc_required?: boolean }; published_at: string | null; created_at: string
}
type Inv = { id: string; user_id: string; product_id: string; principal: number; currency: string; status: string; start_date: string | null; maturity_date: string | null; created_at: string }
type Audit = { id: string; action: string; entity: string; entity_id: string; details: Record<string, unknown>; created_at: string }

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-800 text-slate-300 border-white/[0.08]',
  under_review: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  suspended: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  closed: 'bg-red-500/10 text-red-400 border-red-500/20',
}
const PAGE = 25
const EMPTY_FORM = { product_id: '', code: '', name: '', description: '', min_amount: '', max_amount: '', term_days: '', risk_level: 'medium', risk_disclosure: '', terms_text: '', entry_fee_pct: '0', return_type: 'none', return_rate_pct: '', kyc_required: true }

export default function AdminInvestmentsPage() {
  const [tab, setTab] = useState<'products' | 'investments' | 'activity'>('products')
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Investment Center</h1>
        <p className="text-sm text-slate-500 mt-1">Products, their versioned terms, client positions and the audit trail.</p>
      </div>
      <div className="mb-5 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] text-xs text-yellow-300">
        Investing is not enabled. Clients can view active products, but there is no way to invest yet, and nothing on this page moves money.
      </div>
      <div className="seg mb-5" role="tablist">
        {([['products', 'Products'], ['investments', 'Client investments'], ['activity', 'Activity']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`seg-btn ${tab === id ? 'seg-btn-on' : ''}`}>{label}</button>
        ))}
      </div>
      {tab === 'products' && <ProductsTab />}
      {tab === 'investments' && <InvestmentsTab />}
      {tab === 'activity' && <ActivityTab />}
    </AdminLayout>
  )
}

async function act(body: Record<string, unknown>) {
  return readJson(await authFetch('/api/admin/investments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
}

function ProductsTab() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [statusFor, setStatusFor] = useState<{ product: Product; status: string; reason: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, v] = await Promise.all([
      supabase.from('investment_products').select('*').order('created_at', { ascending: false }),
      supabase.from('investment_product_versions').select('*').order('version', { ascending: false }),
    ])
    setLoadError(p.error || v.error ? 'Products could not be loaded.' : '')
    setProducts((p.data as Product[]) || []); setVersions((v.data as Version[]) || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); return true }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); return false }
    finally { setBusy(false) }
  }

  const editDraft = (p: Product) => {
    const latest = versions.find(v => v.product_id === p.id)
    if (!latest) return
    setForm({
      product_id: p.id, code: p.code, name: latest.name, description: latest.description,
      min_amount: String(latest.min_amount), max_amount: latest.max_amount === null ? '' : String(latest.max_amount),
      term_days: latest.term_days === null ? '' : String(latest.term_days), risk_level: latest.risk_level,
      risk_disclosure: latest.risk_disclosure, terms_text: latest.terms_text, entry_fee_pct: String(Number(latest.entry_fee_pct) * 100),
      return_type: latest.return_type, return_rate_pct: latest.return_rate_pct === null ? '' : String(latest.return_rate_pct),
      kyc_required: latest.eligibility?.kyc_required !== false,
    })
  }

  const save = async () => {
    if (!form) return
    const okSaved = await run(() => act({
      action: 'save', ...form, product_id: form.product_id || null,
      // Entered as a percentage; stored as a fraction.
      entry_fee_pct: form.entry_fee_pct === '' ? 0 : Number(form.entry_fee_pct) / 100,
    }), 'Draft saved. Publish it to make these terms available.')
    if (okSaved) setForm(null)
  }

  if (loading) return <div className="panel p-8 text-center text-sm text-slate-500">Loading products…</div>

  return (
    <div className="space-y-4">
      {loadError && <AdminLoadError message={loadError} onRetry={load} />}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

      {!form && <button onClick={() => { setForm({ ...EMPTY_FORM }); setMsg(null) }} className="btn btn-sm btn-solid">New product</button>}

      {form && (
        <div className="panel p-5 space-y-4">
          <h2 className="text-white font-medium">{form.product_id ? `Edit draft terms: ${form.code}` : 'New product'}</h2>
          <p className="text-xs text-slate-500">Saving creates or updates an unpublished draft. Published terms can never be edited; changing them creates a new version, and existing investments keep the version they were made under.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {!form.product_id && <Field label="Product code (lowercase, dashes)"><input className="input-field" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. btc-growth-90" /></Field>}
            <Field label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Currency"><input className="input-field" value="USD" disabled /></Field>
            <Field label="Minimum investment (USD)"><input className="input-field" inputMode="decimal" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} /></Field>
            <Field label="Maximum investment (USD, optional)"><input className="input-field" inputMode="decimal" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })} /></Field>
            <Field label="Duration in days (blank = open-ended)"><input className="input-field" inputMode="numeric" value={form.term_days} onChange={e => setForm({ ...form, term_days: e.target.value })} /></Field>
            <Field label="Risk classification">
              <select className="input-field" value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </Field>
            <Field label="Entry fee (%)"><input className="input-field" inputMode="decimal" value={form.entry_fee_pct} onChange={e => setForm({ ...form, entry_fee_pct: e.target.value })} /></Field>
            <Field label="Stated return">
              <select className="input-field" value={form.return_type} onChange={e => setForm({ ...form, return_type: e.target.value, return_rate_pct: e.target.value === 'none' ? '' : form.return_rate_pct })}>
                <option value="none">No stated return</option><option value="fixed_rate">Fixed rate for the term</option>
              </select>
            </Field>
            {form.return_type === 'fixed_rate' && <Field label="Rate for the whole term (%)"><input className="input-field" inputMode="decimal" value={form.return_rate_pct} onChange={e => setForm({ ...form, return_rate_pct: e.target.value })} /></Field>}
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={form.kyc_required} onChange={e => setForm({ ...form, kyc_required: e.target.checked })} /> Verified KYC required to invest
            </label>
          </div>
          <Field label="Description"><textarea className="input-field" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Risk disclosure (shown before investing)"><textarea className="input-field" rows={3} value={form.risk_disclosure} onChange={e => setForm({ ...form, risk_disclosure: e.target.value })} /></Field>
          <Field label="Terms"><textarea className="input-field" rows={5} value={form.terms_text} onChange={e => setForm({ ...form, terms_text: e.target.value })} /></Field>
          {form.return_type === 'fixed_rate' && <p className="text-xs text-yellow-300">A stated rate is shown to clients as a term of the product. The system never credits returns automatically.</p>}
          <div className="flex gap-3">
            <button onClick={() => setForm(null)} disabled={busy} className="btn btn-sm btn-outline">Cancel</button>
            <button onClick={save} disabled={busy} className="btn btn-sm btn-solid">{busy ? 'Saving…' : 'Save draft'}</button>
          </div>
        </div>
      )}

      {products.length === 0 && !form ? (
        <div className="panel p-8 text-center"><p className="text-sm text-slate-400">No investment products yet.</p><p className="text-xs text-slate-600 mt-1">Create one to define its terms. Clients only see a product once its terms are published and it is set to Active.</p></div>
      ) : products.map(p => {
        const pv = versions.filter(v => v.product_id === p.id)
        const current = pv.find(v => v.id === p.current_version_id)
        const draft = pv.find(v => !v.published_at)
        return (
          <div key={p.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-medium">{current?.name || draft?.name || p.code}</p>
                <p className="text-xs text-slate-500 font-mono">{p.code}</p>
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-full border capitalize ${STATUS_STYLE[p.status]}`}>{p.status.replace('_', ' ')}</span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {current ? `Live terms: version ${current.version} · min $${Number(current.min_amount).toFixed(2)}${current.term_days ? ` · ${current.term_days} days` : ''} · ${current.risk_level} risk` : 'No published terms yet.'}
              {draft ? ` · Unpublished draft: version ${draft.version}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {p.status !== 'closed' && <button onClick={() => editDraft(p)} className="btn btn-sm btn-outline">{draft ? 'Edit draft' : 'New version'}</button>}
              {draft && <button disabled={busy} onClick={() => { if (confirm(`Publish version ${draft.version}? Published terms can never be edited.`)) run(() => act({ action: 'publish', version_id: draft.id }), `Version ${draft.version} published.`) }} className="btn btn-sm btn-brand">Publish v{draft.version}</button>}
              {p.status !== 'closed' && <button onClick={() => setStatusFor({ product: p, status: p.status, reason: '' })} className="btn btn-sm btn-ghost">Change status</button>}
            </div>
            {pv.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-slate-500 cursor-pointer">Version history ({pv.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {pv.map(v => <li key={v.id}>v{v.version} · {v.name} · {v.published_at ? `published ${new Date(v.published_at).toLocaleDateString()}` : 'draft'}{v.id === p.current_version_id ? ' · live' : ''}</li>)}
                </ul>
              </details>
            )}
          </div>
        )
      })}

      {statusFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true">
          <div className="panel p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-white">Change status: {statusFor.product.code}</h2>
            <select className="input-field" value={statusFor.status} onChange={e => setStatusFor({ ...statusFor, status: e.target.value })}>
              {['draft', 'under_review', 'active', 'suspended', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            {statusFor.status === 'closed' && <p className="text-xs text-red-400">Closing is permanent. A closed product cannot be reopened or edited.</p>}
            {statusFor.status === 'active' && <p className="text-xs text-yellow-300">Active products are visible to clients. Investing itself is still not enabled.</p>}
            <textarea className="input-field" rows={2} placeholder="Reason (required, recorded in the audit log)" value={statusFor.reason} onChange={e => setStatusFor({ ...statusFor, reason: e.target.value })} />
            <div className="flex gap-3">
              <button onClick={() => setStatusFor(null)} className="btn btn-outline flex-1">Cancel</button>
              <button disabled={busy || !statusFor.reason.trim()} onClick={async () => { if (await run(() => act({ action: 'status', product_id: statusFor.product.id, status: statusFor.status, reason: statusFor.reason }), 'Status updated.')) setStatusFor(null) }} className="btn btn-solid flex-1">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-400 mb-1">{label}</span>{children}</label>
}

// Paginated on the server: only one page of rows is ever loaded.
function InvestmentsTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Inv[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [products, setProducts] = useState<{ id: string; code: string }[]>([])
  const [status, setStatus] = useState('')
  const [product, setProduct] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => { supabase.from('investment_products').select('id, code').then(r => setProducts(r.data || [])) }, [supabase])
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      let q = supabase.from('client_investments').select('id, user_id, product_id, principal, currency, status, start_date, maturity_date, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (status) q = q.eq('status', status)
      if (product) q = q.eq('product_id', product)
      const r = await q
      if (!alive) return
      setLoadError(r.error ? 'Client investments could not be loaded.' : '')
      const data = (r.data as Inv[]) || []
      setRows(data); setTotal(r.count || 0)
      const ids = Array.from(new Set(data.map(x => x.user_id)))
      if (ids.length) {
        const p = await supabase.from('profiles').select('id, full_name').in('id', ids)
        const people = (p.data || []) as { id: string; full_name: string }[]
        if (alive) setNames(Object.fromEntries(people.map(x => [x.id, x.full_name])))
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [supabase, status, product, page])

  const code = (id: string) => products.find(p => p.id === id)?.code || '—'
  const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—'
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select className="input-field text-xs py-2 sm:w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}>
          <option value="">All statuses</option>
          {['pending_activation', 'active', 'matured', 'closed', 'cancelled', 'rejected'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="input-field text-xs py-2 sm:w-56" value={product} onChange={e => { setProduct(e.target.value); setPage(0) }}>
          <option value="">All products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
      </div>
      {loadError && <AdminLoadError message={loadError} onRetry={() => setPage(p => p)} />}
      {loading ? <div className="panel p-8 text-center text-sm text-slate-500">Loading…</div> : rows.length === 0 ? (
        <div className="panel p-8 text-center"><p className="text-sm text-slate-400">No client investments.</p><p className="text-xs text-slate-600 mt-1">Investing is not enabled, so none can exist yet.</p></div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-white/[0.06]">{['Client', 'Investment', 'Product', 'Principal', 'Status', 'Start', 'Maturity', 'Created'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="border-b border-white/[0.04]">
                <td className="px-4 py-3 text-white">{names[r.user_id] || r.user_id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-slate-300">{code(r.product_id)}</td>
                <td className="px-4 py-3 text-white tabular-nums">${Number(r.principal).toFixed(2)} {r.currency}</td>
                <td className="px-4 py-3 capitalize text-slate-300">{r.status.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-slate-400">{d(r.start_date)}</td>
                <td className="px-4 py-3 text-slate-400">{d(r.maturity_date)}</td>
                <td className="px-4 py-3 text-slate-400">{d(r.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn btn-sm btn-outline">Previous</button>
            <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)} className="btn btn-sm btn-outline">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('audit_logs').select('id, action, entity, entity_id, details, created_at')
      .in('entity', ['investment_product', 'client_investment']).order('created_at', { ascending: false }).limit(100)
      .then(r => { setRows((r.data as Audit[]) || []); setLoading(false) })
  }, [supabase])
  if (loading) return <div className="panel p-8 text-center text-sm text-slate-500">Loading…</div>
  if (!rows.length) return <div className="panel p-8 text-center text-sm text-slate-400">No investment activity recorded yet.</div>
  return (
    <ul className="panel divide-y divide-white/[0.04]">
      {rows.map(r => (
        <li key={r.id} className="px-5 py-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-white">{r.action.replace(/_/g, ' ')}</span><span className="text-xs text-slate-500 shrink-0">{new Date(r.created_at).toLocaleString()}</span></div>
          <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">{JSON.stringify(r.details)}</p>
        </li>
      ))}
    </ul>
  )
}
