'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, newRequestKey, readJson } from '@/lib/authFetch'

// Admin Investment Center. Reads use row level security (admins see all);
// every change goes through /api/admin/investments, whose database functions
// check the admin role, validate and audit. Approving or rejecting a client's
// request moves only the amount the client already put on hold; nothing here
// records a return or edits a balance directly.

type Product = { id: string; code: string; status: string; current_version_id: string | null; created_at: string; updated_at: string }
type Version = {
  id: string; product_id: string; version: number; name: string; description: string; currency: string
  min_amount: number; max_amount: number | null; term_days: number | null; duration_value: number | null; duration_unit: string | null
  cancellation_allowed: boolean; cancellation_terms: string | null; risk_level: string
  risk_disclosure: string; terms_text: string; entry_fee_pct: number; return_type: string; return_rate_pct: number | null
  eligibility: { kyc_required?: boolean }; published_at: string | null; created_at: string
}
type Inv = {
  id: string; reference: string | null; user_id: string; product_id: string; product_version_id: string; principal: number; fee_amount: number; currency: string; status: string
  start_date: string | null; maturity_date: string | null; completed_at: string | null; rejection_reason: string | null; reviewed_by: string | null; reviewed_at: string | null; terms_accepted_at?: string | null; created_at: string
}
type Audit = { id: string; action: string; entity: string; entity_id: string; details: Record<string, unknown>; created_at: string }

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-800 text-slate-300 border-white/[0.08]',
  published: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  archived: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending_activation: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  matured: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-slate-800 text-slate-400 border-white/[0.08]',
  under_review: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  suspended: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  closed: 'bg-red-500/10 text-red-400 border-red-500/20',
}
const PAGE = 25
const EMPTY_FORM = { product_id: '', code: '', name: '', description: '', min_amount: '', max_amount: '', duration_value: '', duration_unit: 'months', risk_level: 'medium', risk_disclosure: '', terms_text: '', entry_fee_pct: '0', return_type: 'none', return_rate_pct: '', kyc_required: true, cancellation_allowed: false, cancellation_terms: '' }
const FINAL = ['archived', 'closed']
const label = (s: string) => s === 'pending_activation' ? 'pending' : s.replace(/_/g, ' ')
const money = (n: number | null | undefined) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const duration = (v: { duration_value?: number | null; duration_unit?: string | null; term_days?: number | null }) =>
  v.duration_value && v.duration_unit ? `${v.duration_value} ${v.duration_value === 1 ? v.duration_unit.replace(/s$/, '') : v.duration_unit}` : v.term_days ? `${v.term_days} days` : 'Open-ended'

export default function AdminInvestmentsPage() {
  const [tab, setTab] = useState<'products' | 'investments' | 'activity'>('products')
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Investment Center</h1>
        <p className="text-sm text-slate-500 mt-1">Products, their versioned terms, client positions and the audit trail.</p>
      </div>
      <InvestingBanner />
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

// Clients can invest only while at least one product is Active.
function InvestingBanner() {
  const supabase = createClient()
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('investment_products').select('id', { count: 'exact', head: true }).eq('status', 'active').not('current_version_id', 'is', null)
      .then(r => setActive(r.error ? null : r.count || 0))
  }, [supabase])
  if (active === null) return null
  return active === 0 ? (
    <div className="mb-5 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] text-xs text-yellow-300">
      Investing is not enabled. Publish a product and set it to Active to open it to clients.
    </div>
  ) : (
    <div className="mb-5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] text-xs text-emerald-300">
      Investing is open: {active} active product{active === 1 ? '' : 's'}. New client requests arrive as Pending in Client investments for your review.
    </div>
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
      duration_value: latest.duration_value ? String(latest.duration_value) : latest.term_days ? String(latest.term_days) : '',
      duration_unit: latest.duration_unit || (latest.term_days ? 'days' : 'months'), risk_level: latest.risk_level,
      risk_disclosure: latest.risk_disclosure, terms_text: latest.terms_text, entry_fee_pct: String(Number(latest.entry_fee_pct) * 100),
      return_type: latest.return_type, return_rate_pct: latest.return_rate_pct === null ? '' : String(latest.return_rate_pct),
      kyc_required: latest.eligibility?.kyc_required !== false,
      cancellation_allowed: !!latest.cancellation_allowed, cancellation_terms: latest.cancellation_terms || '',
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
            <Field label="Duration (blank = open-ended)">
              <div className="flex gap-2">
                <input className="input-field flex-1 min-w-0" inputMode="numeric" value={form.duration_value} onChange={e => setForm({ ...form, duration_value: e.target.value })} />
                <select className="input-field w-28" value={form.duration_unit} onChange={e => setForm({ ...form, duration_unit: e.target.value })}>
                  <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option>
                </select>
              </div>
            </Field>
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
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={form.cancellation_allowed} onChange={e => setForm({ ...form, cancellation_allowed: e.target.checked })} /> Clients may request early cancellation of an active investment
            </label>
          </div>
          <Field label="Description"><textarea className="input-field" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Risk disclosure (shown before investing)"><textarea className="input-field" rows={3} value={form.risk_disclosure} onChange={e => setForm({ ...form, risk_disclosure: e.target.value })} /></Field>
          <Field label="Terms"><textarea className="input-field" rows={5} value={form.terms_text} onChange={e => setForm({ ...form, terms_text: e.target.value })} /></Field>
          <Field label={form.cancellation_allowed ? 'Cancellation rules and fee' : 'Cancellation note (optional)'}><textarea className="input-field" rows={2} value={form.cancellation_terms} onChange={e => setForm({ ...form, cancellation_terms: e.target.value })} placeholder={form.cancellation_allowed ? 'e.g. Early cancellation returns the principal less a 2% fee.' : 'Pending requests can always be cancelled before review.'} /></Field>
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
              <span className={`text-[11px] px-2 py-1 rounded-full border capitalize ${STATUS_STYLE[p.status]}`}>{label(p.status)}</span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {current ? `Published terms: version ${current.version} · ${money(current.min_amount)}${current.max_amount ? `–${money(current.max_amount)}` : '+'} · ${duration(current)} · ${current.risk_level} risk` : 'No published terms yet.'}
              {draft ? ` · Unpublished draft: version ${draft.version}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {!FINAL.includes(p.status) && <button onClick={() => editDraft(p)} className="btn btn-sm btn-outline">{draft ? 'Edit draft' : 'New version'}</button>}
              {draft && <button disabled={busy} onClick={() => { if (confirm(`Publish version ${draft.version}? Published terms can never be edited.`)) run(() => act({ action: 'publish', version_id: draft.id }), `Version ${draft.version} published.`) }} className="btn btn-sm btn-brand">Publish v{draft.version}</button>}
              {!FINAL.includes(p.status) && <button onClick={() => setStatusFor({ product: p, status: p.status, reason: '' })} className="btn btn-sm btn-ghost">Change status</button>}
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
              {['draft', 'published', 'active', 'paused', 'archived'].map(s => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            {statusFor.status === 'archived' && <p className="text-xs text-red-400">Archiving is permanent. Existing client investments are kept and still shown to their owners.</p>}
            {statusFor.status === 'active' && <p className="text-xs text-yellow-300">Active products are visible to clients and open for investment requests.</p>}
            {statusFor.status === 'paused' && <p className="text-xs text-yellow-300">Paused products are hidden from clients and accept no new requests. Existing investments are unaffected.</p>}
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
  const [status, setStatus] = useState('pending_activation')
  const [product, setProduct] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState<Inv | null>(null)

  useEffect(() => { supabase.from('investment_products').select('id, code').then(r => setProducts(r.data || [])) }, [supabase])
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      let q = supabase.from('client_investments')
        .select('id, reference, user_id, product_id, product_version_id, principal, fee_amount, currency, status, start_date, maturity_date, completed_at, rejection_reason, reviewed_by, reviewed_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (status) q = q.eq('status', status)
      if (product) q = q.eq('product_id', product)
      if (from) q = q.gte('created_at', new Date(from).toISOString())
      if (to) q = q.lt('created_at', new Date(new Date(to).getTime() + 86400000).toISOString())
      const term = search.trim()
      if (term) {
        // Investment reference / ID, or a client's name.
        const uuid = /^[0-9a-f-]{36}$/i.test(term)
        const people = await supabase.from('profiles').select('id').ilike('full_name', `%${term.replace(/[%_,()]/g, '')}%`).limit(50)
        const ids = ((people.data || []) as { id: string }[]).map(x => x.id)
        const ors = [`reference.ilike.%${term.replace(/[%_,()]/g, '')}%`]
        if (uuid) ors.push(`id.eq.${term}`, `user_id.eq.${term}`)
        if (ids.length) ors.push(`user_id.in.(${ids.join(',')})`)
        q = q.or(ors.join(','))
      }
      const r = await q
      if (!alive) return
      setLoadError(r.error ? 'Client investments could not be loaded.' : '')
      const data = (r.data as Inv[]) || []
      setRows(data); setTotal(r.count || 0)
      const ids = Array.from(new Set(data.map(x => x.user_id)))
      if (ids.length) {
        const p = await supabase.from('profiles').select('id, full_name').in('id', ids)
        const people = (p.data || []) as { id: string; full_name: string }[]
        if (alive) setNames(n => ({ ...n, ...Object.fromEntries(people.map(x => [x.id, x.full_name])) }))
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [supabase, status, product, page, search, from, to, reload])

  const code = (id: string) => products.find(p => p.id === id)?.code || '—'
  const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—'
  const statuses = [['pending_activation', 'Pending'], ['active', 'Active'], ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled'], ['suspended', 'Suspended'], ['', 'All']] as const
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Status">
        {statuses.map(([v, l]) => (
          <button key={l} role="tab" aria-selected={status === v} onClick={() => { setStatus(v); setPage(0) }}
            className={`btn btn-sm shrink-0 ${status === v ? 'btn-solid' : 'btn-outline'}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input className="input-field text-xs py-2" placeholder="Search client name, client ID or INV- reference" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <select className="input-field text-xs py-2" value={product} onChange={e => { setProduct(e.target.value); setPage(0) }}>
          <option value="">All products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-500">From<input type="date" className="input-field text-xs py-2 flex-1" value={from} onChange={e => { setFrom(e.target.value); setPage(0) }} /></label>
        <label className="flex items-center gap-2 text-xs text-slate-500">To<input type="date" className="input-field text-xs py-2 flex-1" value={to} onChange={e => { setTo(e.target.value); setPage(0) }} /></label>
      </div>
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(x => x + 1)} />}
      {loading ? <div className="panel p-8 text-center text-sm text-slate-500">Loading…</div> : rows.length === 0 ? (
        <div className="panel p-8 text-center"><p className="text-sm text-slate-400">No client investments match.</p><p className="text-xs text-slate-600 mt-1">Requests clients submit appear here as Pending.</p></div>
      ) : (
        <>
          <ul className="md:hidden space-y-2">
            {rows.map(r => (
              <li key={r.id}>
                <button onClick={() => setOpen(r)} className="panel p-4 w-full text-left">
                  <div className="flex justify-between gap-2"><span className="text-white truncate">{names[r.user_id] || r.user_id.slice(0, 8)}</span><span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize shrink-0 ${STATUS_STYLE[r.status] || ''}`}>{label(r.status)}</span></div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">{r.reference || r.id.slice(0, 8)} · {code(r.product_id)}</p>
                  <p className="text-sm text-white tabular-nums mt-1">{money(r.principal)} <span className="text-xs text-slate-500">· {d(r.created_at)}</span></p>
                </button>
              </li>
            ))}
          </ul>
          <div className="panel overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-white/[0.06]">{['Client', 'Reference', 'Product', 'Amount', 'Status', 'Submitted', 'Start', 'Maturity', ''].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="border-b border-white/[0.04]">
                  <td className="px-4 py-3 text-white">{names[r.user_id] || r.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.reference || r.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-slate-300">{code(r.product_id)}</td>
                  <td className="px-4 py-3 text-white tabular-nums">{money(r.principal)}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[r.status] || ''}`}>{label(r.status)}</span></td>
                  <td className="px-4 py-3 text-slate-400">{d(r.created_at)}</td>
                  <td className="px-4 py-3 text-slate-400">{d(r.start_date)}</td>
                  <td className="px-4 py-3 text-slate-400">{d(r.maturity_date)}</td>
                  <td className="px-4 py-3"><button onClick={() => setOpen(r)} className="btn btn-sm btn-outline">{r.status === 'pending_activation' ? 'Review' : 'Open'}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
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
      {open && <ReviewPanel inv={open} client={names[open.user_id]} productCode={code(open.product_id)} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setReload(x => x + 1) }} />}
    </div>
  )
}

type Ev = { id: number; from_status: string | null; to_status: string; reason: string | null; created_at: string }
type LinkedTx = { kind: string; transactions: { id: string; type: string; amount: number; status: string; reference: string | null; created_at: string } | null }

// Everything an admin needs to decide, loaded fresh for one investment.
function ReviewPanel({ inv, client, productCode, onClose, onDone }: { inv: Inv; client?: string; productCode: string; onClose: () => void; onDone: () => void }) {
  const supabase = createClient()
  const [info, setInfo] = useState<{ kyc: string; available: number | null; pending: number | null; version: Version | null; events: Ev[]; txs: LinkedTx[]; reviewer: string | null } | null>(null)
  const [mode, setMode] = useState<'' | 'reject' | 'complete' | 'return'>('')
  const [amount, setAmount] = useState('')
  // One key per return being recorded: a double click or retry cannot credit twice.
  const returnKey = useRef(newRequestKey())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [k, a, v, e, t, rv] = await Promise.all([
        supabase.from('kyc_submissions').select('status, submitted_at').eq('user_id', inv.user_id).order('submitted_at', { ascending: false }).limit(1),
        supabase.from('accounts').select('available_balance, pending_balance').eq('user_id', inv.user_id).maybeSingle(),
        supabase.from('investment_product_versions').select('*').eq('id', inv.product_version_id).maybeSingle(),
        supabase.from('client_investment_events').select('id, from_status, to_status, reason, created_at').eq('client_investment_id', inv.id).order('created_at'),
        supabase.from('investment_transactions').select('kind, transactions(id, type, amount, status, reference, created_at)').eq('client_investment_id', inv.id),
        inv.reviewed_by ? supabase.from('profiles').select('full_name').eq('id', inv.reviewed_by).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (!alive) return
      const acct = a.data as { available_balance: number; pending_balance: number } | null
      setInfo({
        kyc: (k.data?.[0] as { status?: string } | undefined)?.status || 'not submitted',
        available: acct ? Number(acct.available_balance) : null, pending: acct ? Number(acct.pending_balance) : null,
        version: (v.data as unknown as Version) || null, events: (e.data as Ev[]) || [],
        txs: ((t.data || []) as unknown as { kind: string; transactions: LinkedTx['transactions'] | LinkedTx['transactions'][] }[])
          .map(x => ({ kind: x.kind, transactions: Array.isArray(x.transactions) ? x.transactions[0] : x.transactions })),
        reviewer: (rv.data as { full_name?: string } | null)?.full_name || null,
      })
    })()
    return () => { alive = false }
  }, [supabase, inv])

  const go = async (body: Record<string, unknown>) => {
    setBusy(true); setErr('')
    try { await act({ ...body, investment_id: inv.id }); onDone() }
    catch (e) { setErr(errorText(e)); if (body.action === 'record_return') returnKey.current = newRequestKey() }
    finally { setBusy(false) }
  }
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3 py-1.5 border-b border-white/[0.04] text-sm"><span className="text-slate-500 shrink-0">{k}</span><span className="text-white text-right break-all">{v}</span></div>

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70" role="dialog" aria-modal="true" aria-label="Investment review">
      <div className="panel w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 rounded-b-none sm:rounded-b-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-white">{inv.reference || 'Investment'}</h2><p className="text-xs text-slate-500">{productCode}</p></div>
          <button onClick={onClose} className="btn btn-sm btn-ghost" aria-label="Close">✕</button>
        </div>
        <div>
          {row('Client', client || '—')}
          {row('Client ID', <span className="font-mono text-xs">{inv.user_id}</span>)}
          {row('Investment ID', <span className="font-mono text-xs">{inv.id}</span>)}
          {row('Product', `${info?.version?.name || productCode}${info?.version ? ` (v${info.version.version})` : ''}`)}
          {row(inv.status === 'pending_activation' ? 'Amount requested' : 'Principal', money(inv.principal))}
          {Number(inv.fee_amount) > 0 && row(inv.status === 'pending_activation' ? 'Entry fee on approval' : 'Entry fee', money(inv.fee_amount))}
          {row('Submitted', new Date(inv.created_at).toLocaleString())}
          {row('Status', <span className="capitalize">{label(inv.status)}</span>)}
          {row('Terms accepted', 'Yes, at submission (required)')}
          {row('KYC status', <span className="capitalize">{info ? info.kyc : '…'}</span>)}
          {row('Available balance', info?.available == null ? '…' : money(info.available))}
          {row('Held for pending requests', info?.pending == null ? '…' : money(info.pending))}
          {inv.start_date && row('Start', new Date(inv.start_date).toLocaleString())}
          {inv.maturity_date && row('Maturity', new Date(inv.maturity_date).toLocaleString())}
          {inv.reviewed_at && row('Reviewed', `${new Date(inv.reviewed_at).toLocaleString()}${info?.reviewer ? ` by ${info.reviewer}` : ''}`)}
          {inv.rejection_reason && row('Rejection reason', inv.rejection_reason)}
        </div>
        {info && info.txs.length > 0 && (
          <div><p className="text-xs text-slate-500 mb-1">Related transactions</p>
            <ul className="text-xs space-y-1">{info.txs.map((t, i) => t.transactions && <li key={i} className="flex justify-between gap-2"><span className="text-slate-400">{t.kind.replace(/_/g, ' ')} · {t.transactions.reference || t.transactions.id.slice(0, 8)} · {t.transactions.status.replace(/_/g, ' ')}</span><span className="text-white tabular-nums">{money(t.transactions.amount)}</span></li>)}</ul>
          </div>
        )}
        {info && info.events.length > 0 && (
          <div><p className="text-xs text-slate-500 mb-1">Timeline</p>
            <ul className="text-xs space-y-1">{info.events.map(e => <li key={e.id} className="text-slate-400"><span className="text-slate-500">{new Date(e.created_at).toLocaleString()}</span> · {e.from_status ? `${label(e.from_status)} → ` : ''}<span className="capitalize text-white">{label(e.to_status)}</span>{e.reason ? ` · ${e.reason}` : ''}</li>)}</ul>
          </div>
        )}
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        {inv.status === 'pending_activation' && mode === '' && (
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => setMode('reject')} className="btn btn-outline flex-1">Reject</button>
            <button disabled={busy || !info} onClick={() => { if (confirm(`Approve ${inv.reference || 'this investment'} for ${money(inv.principal)}?`)) go({ action: 'review', decision: 'approve' }) }} className="btn btn-solid flex-1">{busy ? 'Working…' : 'Approve'}</button>
          </div>
        )}
        {inv.status === 'active' && mode === '' && (
          <button disabled={busy} onClick={() => setMode('complete')} className="btn btn-outline w-full">Mark completed (return principal)</button>
        )}
        {['active', 'completed', 'matured'].includes(inv.status) && mode === '' && (
          <button disabled={busy} onClick={() => setMode('return')} className="btn btn-outline w-full">Record return</button>
        )}
        {mode === 'return' && (
          <div className="space-y-3">
            <input className="input-field" inputMode="decimal" placeholder="Return amount (USD)" value={amount} onChange={e => setAmount(e.target.value.replace(',', '.'))} />
            <textarea className="input-field" rows={2} placeholder="Reason (required, shown in the client's history and the audit log)" value={reason} onChange={e => setReason(e.target.value)} />
            <p className="text-xs text-slate-500">Credits the client&apos;s profit balance and account total, creates a ledger entry linked to this investment and records the previous and new values in the audit log. Only record returns that were actually earned.</p>
            <div className="flex gap-3">
              <button disabled={busy} onClick={() => { setMode(''); setReason(''); setAmount('') }} className="btn btn-outline flex-1">Back</button>
              <button disabled={busy || !reason.trim() || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0}
                onClick={() => { if (confirm(`Credit ${money(Number(amount))} to this client as a return on ${inv.reference || 'this investment'}?`)) go({ action: 'record_return', amount, reason, idempotency_key: returnKey.current }) }}
                className="btn btn-solid flex-1">{busy ? 'Working…' : 'Confirm return'}</button>
            </div>
          </div>
        )}
        {(mode === 'reject' || mode === 'complete') && (
          <div className="space-y-3">
            <textarea className="input-field" rows={2} placeholder={mode === 'reject' ? 'Reason for rejection (required, shown to the client)' : 'Reason (required, recorded in the audit log)'} value={reason} onChange={e => setReason(e.target.value)} />
            {mode === 'reject' && <p className="text-xs text-slate-500">The held amount returns to the client&apos;s available balance.</p>}
            {mode === 'complete' && <p className="text-xs text-slate-500">The principal moves from invested back to available. No return is recorded here.</p>}
            <div className="flex gap-3">
              <button disabled={busy} onClick={() => { setMode(''); setReason('') }} className="btn btn-outline flex-1">Back</button>
              <button disabled={busy || !reason.trim()} onClick={() => go(mode === 'reject' ? { action: 'review', decision: 'reject', reason } : { action: 'complete', reason })} className="btn btn-solid flex-1">{busy ? 'Working…' : mode === 'reject' ? 'Confirm rejection' : 'Confirm completion'}</button>
            </div>
          </div>
        )}
      </div>
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
          <div className="flex justify-between gap-3"><span className="text-white capitalize">{r.action.replace(/_/g, ' ')}</span><span className="text-xs text-slate-500 shrink-0">{new Date(r.created_at).toLocaleString()}</span></div>
          <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">{JSON.stringify(r.details)}</p>
        </li>
      ))}
    </ul>
  )
}
