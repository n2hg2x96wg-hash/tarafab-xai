'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { AdminModal, Field } from '@/components/AdminModal'

type Link = { id: string; title: string; provider: string; url: string; amount: number; currency: string; frequency: string; usage: string; allowed_country: string; enabled: boolean; plan_id: string | null; created_at: string; updated_at: string }
type Plan = { id: string; name: string; price: number; promo_price: number | null; currency: string; enabled?: boolean }
type Attempt = { id: string; reference: string; provider?: string; full_name: string | null; email: string | null; plan_id: string | null; expected_amount: number; currency: string; status: string; verification_status: string; provider_reference: string | null; country: string | null; note: string | null; created_at: string; verified_at: string | null }
const TONE: Record<string, string> = { successful: 'text-emerald-400', pending_verification: 'text-sky-300', redirected: 'text-slate-300', failed: 'text-red-400', cancelled: 'text-slate-500', expired: 'text-slate-500' }
const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat(c === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency: c }).format(n) } catch { return `${c} ${n}` } }

// Copies the full URL. Uses the Clipboard API when available and a hidden
// textarea otherwise (older Safari, insecure contexts).
async function copyText(text: string) {
  try { if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); return true } } catch { /* fall back */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

function CopyButton({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button type="button" data-url={url} onClick={async () => { const ok = await copyText(url); setState(ok ? 'copied' : 'failed'); clearTimeout(timer.current); timer.current = setTimeout(() => setState('idle'), 2000) }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${state === 'copied' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : state === 'failed' ? 'border-red-500/40 text-red-300' : 'border-white/[0.12] text-slate-200 hover:bg-white/[0.06]'}`}
      aria-live="polite">
      {state === 'copied' ? '✓ Copied!' : state === 'failed' ? 'Copy failed — select the link' : 'Copy Payment Link'}
    </button>
  )
}

// Payment management. The payment URL is readable only by admins (RLS);
// customers receive it only from the server gateway after its checks.
export default function AdminPaymentsPage() {
  const supabase = createClient()
  const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>).call(supabase, fn, args)
  const [links, setLinks] = useState<Link[] | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [gateway, setGateway] = useState<{ configured: boolean; updated_at: string } | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [edit, setEdit] = useState<null | { id: string; title: string; url: string; amount: string; currency: string; frequency: string; usage: string; country: string; enabled: boolean; plan: string; reason: string }>(null)
  const [toggle, setToggle] = useState<null | { link: Link; reason: string }>(null)
  const [decide, setDecide] = useState<null | { a: Attempt; action: 'confirm' | 'reject'; providerRef: string; reason: string }>(null)
  const [newKey, setNewKey] = useState('')
  const [msg, setMsg] = useState('')
  const [sbToggle, setSbToggle] = useState<null | { plan: Plan; enable: boolean; reason: string }>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = useCallback(async () => {
    const [l, p, a, g] = await Promise.all([
      (supabase.from('payment_links') as any).select('*').order('created_at', { ascending: false }),
      (supabase.from('premium_plans') as any).select('id, name, price, promo_price, currency, enabled').order('sort_order'),
      rpc('admin_list_payment_attempts_v2', { p_status: null, p_limit: 200 }),
      rpc('admin_payment_gateway_configured'),
    ])
    if (l.error || a.error) { setError('Payment data could not be loaded.'); return }
    setLinks(Array.isArray(l.data) ? l.data : []); setPlans(Array.isArray(p.data) ? p.data : []); setAttempts(Array.isArray(a.data) ? a.data as Attempt[] : [])
    setGateway((g.data as { configured: boolean; updated_at: string }) || null); setError('')
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, reload])

  const run = async (fn: string, args: Record<string, unknown>, done: () => void) => {
    setBusy(true); setFormErr('')
    const { error } = await rpc(fn, args)
    setBusy(false)
    if (error) { setFormErr(error.message); return }
    done(); load()
  }
  const verify = async (a: Attempt) => {
    setMsg('')
    const { data, error } = await supabase.functions.invoke('seerbit-verify', { body: { reference: a.reference } })
    const r = data as { status?: string; reason?: string } | null
    setMsg(error ? 'Verification request failed.' : r?.reason === 'not_configured' ? 'SeerBit keys are not configured on the seerbit-verify function, so automatic verification is unavailable. Check the payment in your SeerBit dashboard and confirm manually.'
      : r?.reason === 'no_provider_reference' ? 'No SeerBit reference was returned for this payment. Find it in your SeerBit dashboard and confirm manually.'
      : `SeerBit verification: ${r?.status}${r?.reason ? ` (${r.reason})` : ''}`)
    load()
  }
  const generateKey = () => {
    const b = new Uint8Array(32); crypto.getRandomValues(b)
    setNewKey(Array.from(b, x => x.toString(16).padStart(2, '0')).join(''))
  }
  const planName = (id: string | null) => plans.find(p => p.id === id)?.name || '—'
  const field = 'w-full rounded-lg bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-sm text-white'

  return (
    <AdminLayout title="Payments" subtitle="SeerBit payment links, access rules and payment records">
      {error && <AdminLoadError message={error} onRetry={() => setReload(n => n + 1)} />}

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5 text-xs" aria-labelledby="sb-title">
        <h2 id="sb-title" className="text-sm font-semibold text-white mb-2">SeerBit</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          <div><dt className="text-slate-500 inline">Gateway key: </dt><dd className="inline">{gateway?.configured ? <span className="text-emerald-400">configured</span> : <span className="text-amber-300">not configured (payments cannot start)</span>}</dd></div>
          <div><dt className="text-slate-500 inline">Verification: </dt><dd className="inline">server-side via the seerbit-verify function</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500 inline">Return (redirect) URL for each SeerBit payment link: </dt><dd className="inline font-mono break-all">{origin}/payment/return</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500 inline">Webhook URL (SeerBit dashboard → Settings → Webhooks): </dt><dd className="inline font-mono break-all">{origin}/api/webhooks/seerbit</dd></div>
        </dl>
        <p className="mt-3 text-slate-400">SeerBit per plan (uses the plan&apos;s existing payment link; links are never regenerated here):</p>
        <ul className="mt-2 space-y-1">
          {plans.filter(p => p.enabled !== false).map(p => {
            const pl = (links || []).filter(l => l.plan_id === p.id)
            const on = pl.some(l => l.enabled)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="text-white">{p.name}</span><span className="text-slate-500">{fmt(Number(p.promo_price ?? p.price), p.currency)}</span>
                {!pl.length ? <span className="ml-auto text-slate-500">No SeerBit link</span> : (
                  <button onClick={() => { setFormErr(''); setSbToggle({ plan: p, enable: !on, reason: '' }) }} aria-label={`${on ? 'Disable' : 'Enable'} SeerBit for ${p.name}`}
                    className={`ml-auto rounded-lg border px-2.5 py-1 ${on ? 'border-emerald-500/30 text-emerald-300' : 'border-white/[0.12] text-slate-300'}`}>{on ? 'SeerBit enabled' : 'SeerBit disabled'}</button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-white">Payment links</h2>
          <button onClick={() => { setFormErr(''); setEdit({ id: '', title: '', url: 'https://pay.seerbitapi.com/', amount: '', currency: 'NGN', frequency: 'one_time', usage: 'single_use', country: 'NG', enabled: false, plan: '', reason: '' }) }} className="text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5">Add link</button>
        </div>
        {!links ? <p className="text-xs text-slate-500">Loading…</p> : !links.length ? <p className="text-xs text-slate-400">No payment links.</p> : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {links.map(l => {
              const plan = plans.find(p => p.id === l.plan_id)
              const mismatch = plan && (Number(plan.promo_price ?? plan.price) !== Number(l.amount) || plan.currency !== l.currency)
              return (
                <li key={l.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{l.title}</p>
                      <p className="text-[11px] text-slate-500">SeerBit · created {new Date(l.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${l.enabled ? 'border-emerald-500/30 text-emerald-300' : 'border-white/[0.1] text-slate-400'}`}>{l.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><dt className="text-slate-500">Amount</dt><dd className="text-white tabular-nums">{fmt(Number(l.amount), l.currency)}</dd></div>
                    <div><dt className="text-slate-500">Plan</dt><dd className="text-white">{planName(l.plan_id)}</dd></div>
                    <div><dt className="text-slate-500">Frequency · use</dt><dd className="text-slate-300">{l.frequency === 'one_time' ? 'One-time' : 'Recurring'} · {l.usage === 'single_use' ? 'Single-use' : 'Multiple-use'}</dd></div>
                    <div><dt className="text-slate-500">Allowed country</dt><dd className="text-slate-300">{l.allowed_country === 'NG' ? 'Nigeria (NG)' : l.allowed_country}</dd></div>
                  </dl>
                  <p className="mt-3 font-mono text-[12px] text-slate-300 break-all select-all" data-testid="payment-url">{l.url}</p>
                  {!l.plan_id && <p className="mt-2 text-[11px] text-amber-300">Not attached to a plan, so customers cannot reach it yet.</p>}
                  {mismatch && <p className="mt-2 text-[11px] text-red-300">The plan price ({fmt(Number(plan!.promo_price ?? plan!.price), plan!.currency)}) differs from this link; payments are blocked until they match.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyButton url={l.url} />
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.06] min-h-[36px]">Open Payment Link ↗</a>
                    <button onClick={() => setToggle({ link: l, reason: '' })} className={`rounded-lg border px-3 py-1.5 text-xs min-h-[36px] ${l.enabled ? 'border-red-500/30 text-red-300' : 'border-emerald-500/30 text-emerald-300'}`}>{l.enabled ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => { setFormErr(''); setEdit({ id: l.id, title: l.title, url: l.url, amount: String(l.amount), currency: l.currency, frequency: l.frequency, usage: l.usage, country: l.allowed_country, enabled: l.enabled, plan: l.plan_id || '', reason: '' }) }} className="text-xs text-violet-300 px-2">Edit</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4 mb-5 text-xs">
        <h2 className="text-sm font-semibold text-white mb-2">Payment gateway</h2>
        <p className="text-slate-400">Customers get a payment link only through the server gateway, which checks the visitor&apos;s country (from the hosting platform&apos;s IP geolocation), the plan, the amount and that the link is enabled. IP geolocation is an estimate: VPNs and proxies can change it, and an unknown location is always blocked.</p>
        <p className="mt-2">Status: {gateway?.configured ? <span className="text-emerald-400">Gateway key set ({new Date(gateway.updated_at).toLocaleString()})</span> : <span className="text-amber-300">Not configured: payments are unavailable until a gateway key is set here and in Vercel.</span>}</p>
        {!newKey ? <button onClick={generateKey} className="mt-3 rounded-lg border border-white/[0.12] px-3 py-1.5 text-slate-200">{gateway?.configured ? 'Replace gateway key' : 'Create gateway key'}</button> : (
          <div className="mt-3 space-y-2">
            <p className="text-amber-300">Copy this key now: it is not stored in readable form. Add it to Vercel as the environment variable <span className="font-mono">PAYMENT_GATEWAY_KEY</span> (not NEXT_PUBLIC), redeploy, then save it here.</p>
            <p className="font-mono break-all text-slate-200 select-all">{newKey}</p>
            <div className="flex gap-2"><CopyButton url={newKey} /><button disabled={busy} onClick={() => run('admin_set_payment_gateway_key', { p_key: newKey }, () => { setNewKey(''); setMsg('Gateway key saved.') })} className="rounded-lg bg-violet-600 px-3 py-1.5 text-white">Save key</button><button onClick={() => setNewKey('')} className="px-3 py-1.5 text-slate-400">Cancel</button></div>
            {formErr && <p className="text-red-400">{formErr}</p>}
          </div>
        )}
      </section>

      <section className="glass rounded-2xl border border-white/[0.08] p-4">
        <h2 className="text-sm font-semibold text-white mb-2">Payment records</h2>
        {msg && <p className="mb-2 text-xs text-sky-300" role="status">{msg}</p>}
        {!attempts ? <p className="text-xs text-slate-500">Loading…</p> : !attempts.length ? <p className="text-xs text-slate-400">No payment attempts yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-3">Reference</th><th className="pr-3">Provider</th><th className="pr-3">Client</th><th className="pr-3">Plan</th><th className="pr-3">Amount</th><th className="pr-3">Status</th><th className="pr-3">Verification</th><th className="pr-3">SeerBit ref.</th><th className="pr-3">Country</th><th /></tr></thead>
            <tbody>{attempts.map(a => (
              <tr key={a.id} className="border-t border-white/[0.06] text-slate-300 align-top">
                <td className="py-2 pr-3 font-mono">{a.reference}<div className="font-sans text-slate-500">{new Date(a.created_at).toLocaleString()}</div></td>
                <td className="pr-3">{a.provider === 'paystack' ? 'Paystack (retired)' : 'SeerBit'}</td>
                <td className="pr-3">{a.full_name || '—'}<div className="text-slate-500">{a.email}</div></td>
                <td className="pr-3">{planName(a.plan_id)}</td>
                <td className="pr-3 tabular-nums">{fmt(Number(a.expected_amount), a.currency)}</td>
                <td className={`pr-3 font-semibold ${TONE[a.status] || ''}`}>{a.status.replace('_', ' ')}</td>
                <td className="pr-3">{a.verification_status.replace('_', ' ')}{a.note && <div className="text-slate-500 max-w-[14rem]">{a.note}</div>}</td>
                <td className="pr-3 font-mono">{a.provider_reference || '—'}</td>
                <td className="pr-3">{a.country || '—'}</td>
                <td>{['redirected', 'pending_verification'].includes(a.status) && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => verify(a)} className="text-sky-300 text-left">Verify with SeerBit</button>
                    <button onClick={() => { setFormErr(''); setDecide({ a, action: 'confirm', providerRef: a.provider_reference || '', reason: '' }) }} className="text-emerald-400 text-left">Confirm…</button>
                    <button onClick={() => { setFormErr(''); setDecide({ a, action: 'reject', providerRef: '', reason: '' }) }} className="text-red-400 text-left">Reject…</button>
                  </div>
                )}</td>
              </tr>))}</tbody></table></div>
        )}
      </section>

      {edit && (
        <AdminModal title={edit.id ? 'Edit payment link' : 'New payment link'} busy={busy} err={formErr} onClose={() => setEdit(null)}
          onSave={() => run('admin_upsert_payment_link', { p_id: edit.id || null, p_title: edit.title, p_url: edit.url.trim(), p_amount: Number(edit.amount), p_currency: edit.currency, p_frequency: edit.frequency, p_usage: edit.usage, p_allowed_country: edit.country, p_enabled: edit.enabled, p_plan_id: edit.plan || null, p_reason: edit.reason }, () => setEdit(null))}>
          <Field label="Title"><input className={field} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="SeerBit payment URL"><input className={`${field} font-mono`} value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount"><input className={field} inputMode="decimal" value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label="Currency"><input className={field} value={edit.currency} onChange={e => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Frequency"><select className={field} value={edit.frequency} onChange={e => setEdit({ ...edit, frequency: e.target.value })}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></Field>
            <Field label="Use"><select className={field} value={edit.usage} onChange={e => setEdit({ ...edit, usage: e.target.value })}><option value="single_use">Single-use</option><option value="multiple_use">Multiple-use</option></select></Field>
            <Field label="Allowed country (ISO code)"><input className={field} value={edit.country} maxLength={2} onChange={e => setEdit({ ...edit, country: e.target.value.toUpperCase() })} /></Field>
            <Field label="Plan"><select className={field} value={edit.plan} onChange={e => setEdit({ ...edit, plan: e.target.value })}><option value="">— none —</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} ({fmt(Number(p.promo_price ?? p.price), p.currency)})</option>)}</select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={edit.enabled} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled</label>
          <p className="text-[11px] text-slate-500">The amount and currency must match the plan and the amount configured at SeerBit for this link.</p>
          <Field label="Reason (audit log)"><input className={field} value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
      {sbToggle && (
        <AdminModal title={`${sbToggle.enable ? 'Enable' : 'Disable'} SeerBit for ${sbToggle.plan.name}`} saveLabel={sbToggle.enable ? 'Enable SeerBit' : 'Disable SeerBit'} busy={busy} err={formErr} onClose={() => setSbToggle(null)}
          onSave={() => run('admin_set_plan_seerbit', { p_plan: sbToggle.plan.id, p_enabled: sbToggle.enable, p_reason: sbToggle.reason }, () => setSbToggle(null))}>
          <p className="text-xs text-slate-400">{sbToggle.enable ? 'Customers in the allowed country can pay for this plan with SeerBit again.' : 'Takes effect immediately: no customer is sent to SeerBit for this plan while disabled.'}</p>
          <Field label="Reason (audit log)"><input className={field} value={sbToggle.reason} onChange={e => setSbToggle({ ...sbToggle, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
      {toggle && (
        <AdminModal title={`${toggle.link.enabled ? 'Disable' : 'Enable'} ${toggle.link.title}`} saveLabel={toggle.link.enabled ? 'Disable now' : 'Enable'} busy={busy} err={formErr} onClose={() => setToggle(null)}
          onSave={() => run('admin_set_payment_link_enabled', { p_id: toggle.link.id, p_enabled: !toggle.link.enabled, p_reason: toggle.reason }, () => setToggle(null))}>
          <p className="text-xs text-slate-400">{toggle.link.enabled ? 'Takes effect immediately: no customer is sent to SeerBit while disabled; they see a temporary-unavailability message.' : 'Customers in the allowed country can pay again.'}</p>
          <Field label="Reason (audit log)"><input className={field} value={toggle.reason} onChange={e => setToggle({ ...toggle, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
      {decide && (
        <AdminModal title={`${decide.action === 'confirm' ? 'Confirm' : 'Reject'} ${decide.a.reference}`} saveLabel={decide.action === 'confirm' ? 'Confirm payment' : 'Reject payment'} busy={busy} err={formErr} onClose={() => setDecide(null)}
          onSave={() => run('admin_payment_decide', { p_reference: decide.a.reference, p_action: decide.action, p_provider_reference: decide.providerRef, p_reason: decide.reason }, () => setDecide(null))}>
          {decide.action === 'confirm' ? <p className="text-xs text-amber-300/90">Only confirm after finding this exact payment ({fmt(Number(decide.a.expected_amount), decide.a.currency)}) as successful in your SeerBit dashboard. It is recorded as an admin confirmation (not an automatic verification) and activates the plan once.</p>
            : <p className="text-xs text-slate-400">Marks the payment as failed. Nothing is activated.</p>}
          {decide.action === 'confirm' && <Field label="SeerBit transaction reference"><input className={`${field} font-mono`} value={decide.providerRef} onChange={e => setDecide({ ...decide, providerRef: e.target.value })} /></Field>}
          <Field label="Reason (required, audit log)"><input className={field} value={decide.reason} onChange={e => setDecide({ ...decide, reason: e.target.value })} /></Field>
        </AdminModal>
      )}
    </AdminLayout>
  )
}
