'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { createClient } from '@/lib/supabase/client'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

type NoticeType = 'account' | 'deposit' | 'withdrawal' | 'security' | 'announcement' | 'investment'
const TYPES: NoticeType[] = ['account', 'deposit', 'withdrawal', 'security', 'announcement', 'investment']
// Buttons can only open a client dashboard section, never an outside link
// (the database enforces the same rule).
const TARGETS: { id: string; label: TKey }[] = [
  { id: 'deposit', label: 'dash.nav.deposit' }, { id: 'withdraw', label: 'dash.nav.withdraw' },
  { id: 'transactions', label: 'dash.nav.transactions' }, { id: 'investments', label: 'nav2.investments' }, { id: 'depositHistory', label: 'nav2.depositHistory' },
  { id: 'withdrawalHistory', label: 'nav2.withdrawalHistory' }, { id: 'security', label: 'nav2.security' },
  { id: 'profile', label: 'dash.nav.profile' }, { id: 'markets', label: 'dash.nav.markets' }, { id: 'support', label: 'nav2.support' },
  { id: 'wallet', label: 'wallet.nav' },
]

type Sent = { id: string; user_id: string | null; type: NoticeType; title: string; body: string; cta_label: string | null; cta_target: string | null; created_at: string; archived_at: string | null; read_count: number }
type Client = { id: string; name: string; email: string | null }

export default function AdminNotificationsPage() {
  const { t, intl } = useI18n()
  const params = useSearchParams()
  const presetClient = params.get('to')
  const [clients, setClients] = useState<Client[]>([])
  const [sent, setSent] = useState<Sent[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [audience, setAudience] = useState<'all' | 'one'>(presetClient ? 'one' : 'all')
  const [clientId, setClientId] = useState(presetClient || '')
  const [type, setType] = useState<NoticeType>('account')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaTarget, setCtaTarget] = useState('')
  const [investmentId, setInvestmentId] = useState('')
  const [clientInvs, setClientInvs] = useState<{ id: string; reference: string | null; status: string; principal: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  // Optional: link the notification to one of the chosen client's investments.
  useEffect(() => {
    setInvestmentId('')
    if (audience !== 'one' || !clientId) { setClientInvs([]); return }
    let alive = true
    createClient().from('client_investments').select('id, reference, status, principal').eq('user_id', clientId)
      .order('created_at', { ascending: false }).limit(25)
      .then(r => { if (alive) setClientInvs((r.data as typeof clientInvs) || []) })
    return () => { alive = false }
  }, [audience, clientId])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const d = await readJson<{ notifications: Sent[] }>(await authFetch('/api/admin/notifications'))
      setSent(d.notifications)
    } catch { setLoadError(t('adminNotif.loadFailed')) }
    const supabase = createClient()
    const [{ data: profiles }, { data: emails }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').order('created_at', { ascending: false }) as unknown as Promise<{ data: { id: string; full_name: string | null; role: string }[] | null }>,
      supabase.rpc('admin_client_emails') as unknown as Promise<{ data: { id: string; email: string }[] | null }>,
    ])
    const byId = new Map((emails || []).map(e => [e.id, e.email]))
    setClients((profiles || []).filter(p => p.role !== 'admin').map(p => ({ id: p.id, name: p.full_name || '', email: byId.get(p.id) ?? null })))
  }, [t])
  useEffect(() => { load() }, [load])

  const clientName = (id: string | null) => {
    if (!id) return t('adminNotif.allClients')
    const c = clients.find(x => x.id === id)
    return c ? (c.name || c.email || id.slice(0, 8)) : id.slice(0, 8)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setOk('')
    if (!title.trim()) { setError(t('adminNotif.titleField')); return }
    if (audience === 'one' && !clientId) { setError(t('adminNotif.chooseClient')); return }
    if (!!ctaLabel.trim() !== !!ctaTarget) { setError(`${t('adminNotif.ctaLabel')} / ${t('adminNotif.ctaTarget')}`); return }
    const who = audience === 'all' ? t('adminNotif.confirmAll') : t('adminNotif.confirmOne', { client: clientName(clientId) })
    if (!window.confirm(`${who}\n\n${title.trim()}`)) return
    setBusy(true)
    try {
      await readJson(await authFetch('/api/admin/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: audience === 'one' ? clientId : null, type, title: title.trim(), body: body.trim(),
          cta_label: ctaLabel.trim() || undefined, cta_target: ctaTarget ? `#${ctaTarget}` : undefined,
          investment_id: audience === 'one' && investmentId ? investmentId : undefined,
        }),
      }))
      setOk(t('adminNotif.sent')); setTitle(''); setBody(''); setCtaLabel(''); setCtaTarget(''); setInvestmentId('')
      load()
    } catch (err) { setError(errorText(err, t)) } finally { setBusy(false) }
  }

  const archive = async (id: string) => {
    if (!window.confirm(t('adminNotif.archiveConfirm'))) return
    try {
      await readJson(await authFetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive', id }) }))
      setSent(s => s?.map(n => n.id === id ? { ...n, archived_at: new Date().toISOString() } : n) ?? s)
    } catch (err) { setLoadError(errorText(err, t)) }
  }

  const field = 'input-field !py-2.5 !text-sm'
  return (
    <AdminLayout title={t('adminNotif.title')} subtitle={t('adminNotif.subtitle')}>
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 items-start">
        <form onSubmit={submit} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4" aria-labelledby="compose-title">
          <h2 id="compose-title" className="text-base font-semibold text-white">{t('adminNotif.compose')}</h2>
          <fieldset>
            <legend className="text-xs text-slate-400 mb-1.5">{t('adminNotif.audience')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'one'] as const).map(a => (
                <label key={a} className={`flex items-center justify-center min-h-10 rounded-lg border text-sm cursor-pointer ${audience === a ? 'border-violet-500/50 bg-violet-500/10 text-white' : 'border-white/[0.1] text-slate-400'}`}>
                  <input type="radio" name="aud" className="sr-only" checked={audience === a} onChange={() => setAudience(a)} />
                  {t(a === 'all' ? 'adminNotif.allClients' : 'adminNotif.oneClient')}
                </label>
              ))}
            </div>
          </fieldset>
          {audience === 'one' && (
            <label className="block">
              <span className="text-xs text-slate-400">{t('adminNotif.chooseClient')}</span>
              <select value={clientId} onChange={e => setClientId(e.target.value)} className={`${field} mt-1.5`}>
                <option value="">{t('adminNotif.chooseClient')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name ? `${c.name} · ` : ''}{c.email ?? c.id.slice(0, 8)}</option>)}
              </select>
            </label>
          )}
          {audience === 'one' && clientId && clientInvs.length > 0 && (
            <label className="block">
              <span className="text-xs text-slate-400">{t('adminNotif.relatedInvestment')}</span>
              <select value={investmentId} onChange={e => setInvestmentId(e.target.value)} className={`${field} mt-1.5`}>
                <option value="">{t('adminNotif.noRelatedInvestment')}</option>
                {clientInvs.map(i => <option key={i.id} value={i.id}>{i.reference || i.id.slice(0, 8)} · {i.status === 'pending_activation' ? 'pending' : i.status} · ${Number(i.principal).toFixed(2)}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs text-slate-400">{t('adminNotif.type')}</span>
            <select value={type} onChange={e => setType(e.target.value as NoticeType)} className={`${field} mt-1.5`}>
              {TYPES.map(x => <option key={x} value={x}>{t(`notif.types.${x}`)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">{t('adminNotif.titleField')}</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required className={`${field} mt-1.5`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">{t('adminNotif.message')}</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={4} className={`${field} mt-1.5 resize-y`} />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">{t('adminNotif.ctaLabel')}</span>
              <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} maxLength={40} className={`${field} mt-1.5`} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">{t('adminNotif.ctaTarget')}</span>
              <select value={ctaTarget} onChange={e => setCtaTarget(e.target.value)} className={`${field} mt-1.5`}>
                <option value="">{t('adminNotif.ctaNone')}</option>
                {TARGETS.map(x => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">{t('adminNotif.note')}</p>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          {ok && <p role="status" className="text-sm text-emerald-400">{ok}</p>}
          <button type="submit" disabled={busy} className="w-full sm:w-auto px-5 py-3 rounded-xl text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-50">
            {busy ? t('common.sending') : t('adminNotif.send')}
          </button>
        </form>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5" aria-labelledby="sent-title">
          <h2 id="sent-title" className="text-base font-semibold text-white mb-4">{t('adminNotif.list')}</h2>
          {loadError && <AdminLoadError message={loadError} onRetry={load} />}
          {sent === null && !loadError ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-16" />)}</div>
          ) : sent && sent.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{t('adminNotif.empty')}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {sent?.map(n => (
                <li key={n.id} className={`py-3.5 ${n.archived_at ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-1">
                        <span className="border border-white/[0.1] rounded px-1.5 py-0.5">{t(`notif.types.${n.type}`)}</span>
                        <span>{clientName(n.user_id)}</span>
                        <span>{new Date(n.created_at).toLocaleString(intl, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        <span>{t('adminNotif.readCount', { n: n.read_count })}</span>
                      </div>
                      <p className="text-sm font-medium text-white break-words">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 break-words">{n.body}</p>}
                    </div>
                    {n.archived_at
                      ? <span className="text-[11px] text-slate-500 shrink-0">{t('adminNotif.archived')}</span>
                      : <button onClick={() => archive(n.id)} className="shrink-0 text-xs text-slate-400 hover:text-red-400 border border-white/[0.1] rounded-lg px-2.5 min-h-8">{t('adminNotif.archive')}</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
