'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import OpsChart, { type Day } from '@/components/admin/OpsChart'

type Client = {
  id: string
  full_name: string | null
  role: string
  created_at: string
  accounts: {
    account_balance: number
    available_balance: number
    invested_balance: number
    pending_balance: number
  } | null
}

type Overview = {
  clients: { total: number; active: number; suspended: number; inactive: number; pending_verifications: number; new_7d: number }
  balances: { account: number; available: number; invested: number; profit: number; pending: number }
  deposits: { completed_count: number; completed_usd: number; pending: number }
  withdrawals: { completed_count: number; completed_usd: number; pending: number }
  investments: { active_count: number; active_principal: number; awaiting_activation: number; completed_count: number; completed_principal: number; products_open: number }
  pending: { investments: number; deposits: number; withdrawals: number; verifications: number; transfers_review: number; payments_review: number }
  system: { market_assets: number; market_live: number; market_newest: string | null; automations_active: number; engine_last_run: string | null; gateway_key: boolean | null; audit_24h: number }
  daily: Day[]
  recent: { action: string; entity: string | null; created_at: string; result: string | null; actor: string; target: string }[]
  at: string
}

const usd = (n: number | string | null | undefined) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function ago(iso: string | null | undefined) {
  if (!iso) return null
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}
const humanize = (a: string) => a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

type Tone = 'ok' | 'warn' | 'idle'
const DOT: Record<Tone, string> = { ok: 'bg-emerald-400', warn: 'bg-amber-400', idle: 'bg-slate-500' }

function Kpi({ label, value, sub, href }: { label: string; value: string | null; sub: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-slate-400 text-xs">{label}</p>
      {value == null ? <div className="h-7 w-24 mt-2 rounded skeleton-sheen" /> : <p className="text-[17px] sm:text-xl lg:text-2xl font-bold text-white mt-1.5 tabular-nums [overflow-wrap:anywhere]">{value}</p>}
      <p className="text-slate-500 text-[11px] mt-1">{sub}</p>
    </>
  )
  const cls = 'glass rounded-2xl p-4 sm:p-5 border border-white/[0.08] block min-w-0'
  return href ? <Link href={href} className={`${cls} hover:border-violet-500/30 transition-colors`}>{body}</Link> : <div className={cls}>{body}</div>
}

function Panel({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl border border-white/[0.08] p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-sm font-semibold text-white">{title}</h2>{action}</div>
      {children}
    </section>
  )
}

const LINK_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: 'Clients', links: [{ label: 'All clients', href: '/admin/clients' }, { label: 'Verification', href: '/admin/verification' }, { label: 'Linked wallets', href: '/admin/wallets' }, { label: 'Notifications', href: '/admin/notifications' }] },
  { title: 'Money', links: [{ label: 'Transactions', href: '/admin/transactions' }, { label: 'Investments', href: '/admin/investments' }, { label: 'Wallet transfers', href: '/admin/transfers' }, { label: 'Fees', href: '/admin/fees' }, { label: 'Reconciliation', href: '/admin/reconciliation' }] },
  { title: 'Markets', links: [{ label: 'Assets & market data', href: '/admin/assets' }, { label: 'Automation Center', href: '/admin/automations' }] },
  { title: 'System', links: [{ label: 'Premium', href: '/admin/premium' }, { label: 'Payments', href: '/admin/payments' }, { label: 'Feature controls', href: '/admin/features' }, { label: 'Audit logs', href: '/admin/audit-logs' }, { label: 'Settings', href: '/admin/settings' }] },
]

// Every figure comes from admin_overview(), a read-only database function
// that refuses anyone who is not an admin. The client list below is a small,
// server-filtered page, so the dashboard stays fast however many clients exist.
export default function AdminPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [ov, setOv] = useState<Overview | null>(null)
  const [ovError, setOvError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')

  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  // Debounced: one query after typing pauses, not one per keystroke.
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])

  useEffect(() => {
    let alive = true
    setRefreshing(true)
    supabase.rpc('admin_overview').then(({ data, error }) => {
      if (!alive) return
      // A failed refresh keeps the last figures on screen and says so.
      const o = data as Overview | null
      const valid = !!o && typeof o === 'object' && !Array.isArray(o) && !!o.clients && !!o.balances && !!o.deposits && !!o.withdrawals && !!o.investments && !!o.pending && !!o.system && Array.isArray(o.daily) && Array.isArray(o.recent)
      if (error || !valid) setOvError(true)
      else { setOv(o); setOvError(false) }
      setRefreshing(false)
    })
    return () => { alive = false }
  }, [supabase, reload])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      let q = (supabase.from('profiles') as any)
        .select('id, full_name, role, created_at, accounts(account_balance, available_balance, invested_balance, pending_balance)')
        .eq('role', 'customer').order('created_at', { ascending: false }).limit(term ? 25 : 5)
      if (term) {
        const safe = term.replace(/[%_,()]/g, '')
        q = /^[0-9a-f-]{36}$/i.test(term) ? q.eq('id', term) : q.ilike('full_name', `%${safe}%`)
      }
      const { data, error } = await q as { data: Client[] | null; error: unknown }
      if (!alive) return
      // A failed load keeps the previous list rather than showing zero clients.
      if (error) setLoadError('Client data could not be loaded. Figures below may be incomplete.')
      else { setClients(data || []); setLoadError('') }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [supabase, term, reload])

  const filtered = clients
  const recentClients = clients
  const v = <T,>(f: (o: Overview) => T) => (ov ? f(ov) : null)

  const pendingItems = ov ? [
    { label: 'Deposits to review', n: ov.pending.deposits, href: '/admin/transactions?type=deposit' },
    { label: 'Withdrawals to process', n: ov.pending.withdrawals, href: '/admin/transactions?type=withdrawal' },
    { label: 'Investments awaiting activation', n: ov.pending.investments, href: '/admin/investments' },
    { label: 'Identity verifications', n: ov.pending.verifications, href: '/admin/verification' },
    { label: 'Wallet transfers to review', n: ov.pending.transfers_review, href: '/admin/transfers' },
    { label: 'Payments to verify', n: ov.pending.payments_review, href: '/admin/payments' },
  ] : []
  const pendingTotal = pendingItems.reduce((n, p) => n + p.n, 0)

  const system: { label: string; tone: Tone; detail: string; href: string }[] = ov ? (() => {
    const s = ov.system
    const feedFresh = s.market_newest && Date.now() - Date.parse(s.market_newest) < 10 * 60_000
    const engineFresh = s.engine_last_run && Date.now() - Date.parse(s.engine_last_run) < 10 * 60_000
    return [
      { label: 'Market data feed', href: '/admin/assets',
        tone: s.market_live > 0 && feedFresh ? 'ok' : 'warn',
        detail: s.market_newest ? `${s.market_live} of ${s.market_assets} assets current · last quote ${ago(s.market_newest)}` : 'No quotes recorded yet' },
      { label: 'Automation engine', href: '/admin/automations',
        tone: s.automations_active === 0 ? 'idle' : engineFresh ? 'ok' : 'warn',
        detail: s.automations_active === 0 ? 'No active automations' : `${s.automations_active} active · last evaluated ${ago(s.engine_last_run) || 'never'}` },
      { label: 'Premium payment gateway', href: '/admin/payments',
        tone: s.gateway_key ? 'ok' : 'warn',
        detail: s.gateway_key ? 'Server key configured' : 'Server key not set — Premium checkout is unavailable' },
      { label: 'Audit trail', href: '/admin/audit-logs', tone: 'ok', detail: `${s.audit_24h} events in the last 24 hours` },
    ]
  })() : []

  return (
    <AdminLayout title="Admin Dashboard" subtitle="Manage client accounts and platform activity">
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      {ovError && <AdminLoadError message={ov ? 'The overview could not be refreshed. The figures shown are from the last successful load.' : 'The overview could not be loaded.'} onRetry={() => setReload(n => n + 1)} />}

      <div className="flex items-center justify-between gap-3 mb-3 text-[11px] text-slate-500">
        <span>{ov ? `Updated ${new Date(ov.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Loading overview…'}</span>
        <button onClick={() => setReload(n => n + 1)} disabled={refreshing} className="px-2.5 py-1 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Kpi label="Total clients" href="/admin/clients" value={v(o => String(o.clients.total))}
          sub={ov ? <>{ov.clients.active} active · {ov.clients.inactive} inactive{ov.clients.new_7d ? ` · ${ov.clients.new_7d} new this week` : ''}</> : ' '} />
        <Kpi label="Client account balances" value={v(o => usd(o.balances.available))}
          sub={ov ? <>spendable · {usd(ov.balances.pending)} pending</> : ' '} />
        <Kpi label="Deposits completed" href="/admin/transactions?type=deposit" value={v(o => usd(o.deposits.completed_usd))}
          sub={ov ? <>{ov.deposits.completed_count} completed · {ov.deposits.pending} pending</> : ' '} />
        <Kpi label="Withdrawals completed" href="/admin/transactions?type=withdrawal" value={v(o => usd(o.withdrawals.completed_usd))}
          sub={ov ? <>{ov.withdrawals.completed_count} completed · {ov.withdrawals.pending} pending</> : ' '} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {/* Investments are their own block, never mixed into deposits. */}
        <Panel title="Investments" action={<Link href="/admin/investments" className="text-xs text-violet-400 hover:text-violet-300">Manage →</Link>}>
          {ov ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-[11px] text-slate-500">Active</dt><dd className="text-white font-semibold tabular-nums">{ov.investments.active_count} · {usd(ov.investments.active_principal)}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Awaiting activation</dt><dd className={`font-semibold tabular-nums ${ov.investments.awaiting_activation ? 'text-amber-300' : 'text-white'}`}>{ov.investments.awaiting_activation}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Completed</dt><dd className="text-white font-semibold tabular-nums">{ov.investments.completed_count} · {usd(ov.investments.completed_principal)}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Open products</dt><dd className="text-white font-semibold tabular-nums">{ov.investments.products_open}</dd></div>
              <div className="col-span-2 pt-2 border-t border-white/[0.06]"><dt className="text-[11px] text-slate-500">Client invested · profit balances</dt><dd className="text-slate-300 tabular-nums">{usd(ov.balances.invested)} · {usd(ov.balances.profit)}</dd></div>
            </dl>
          ) : <div className="h-32 rounded-lg skeleton-sheen" />}
        </Panel>

        <Panel title="Needs attention" action={ov ? <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pendingTotal ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}>{pendingTotal ? `${pendingTotal} waiting` : 'All clear'}</span> : null}>
          {ov ? (
            <ul className="divide-y divide-white/[0.05] -my-1">
              {pendingItems.map(p => (
                <li key={p.label}>
                  <Link href={p.href} className="flex items-center justify-between gap-3 py-2 text-[13px] text-slate-300 hover:text-white">
                    <span className="min-w-0 truncate">{p.label}</span>
                    <span className={`tabular-nums text-xs px-2 py-0.5 rounded-md ${p.n ? 'bg-amber-500/15 text-amber-300' : 'text-slate-600'}`}>{p.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="h-40 rounded-lg skeleton-sheen" />}
        </Panel>

        <Panel title="System status">
          {ov ? (
            <ul className="space-y-3">
              {system.map(s => (
                <li key={s.label}>
                  <Link href={s.href} className="flex gap-2.5 group">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[s.tone]}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-slate-200 group-hover:text-white">{s.label}<span className="sr-only"> — {s.tone === 'ok' ? 'OK' : s.tone === 'warn' ? 'needs attention' : 'idle'}</span></span>
                      <span className="block text-[11px] text-slate-500">{s.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="h-40 rounded-lg skeleton-sheen" />}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 mb-4">
        <Panel title="Activity" className="lg:col-span-3">
          {ov ? <OpsChart days={ov.daily} /> : <div className="h-[210px] rounded-lg skeleton-sheen" />}
        </Panel>
        <Panel title="Recent admin activity" className="lg:col-span-2" action={<Link href="/admin/audit-logs" className="text-xs text-violet-400 hover:text-violet-300">Audit logs →</Link>}>
          {ov ? ov.recent.length ? (
            <ul className="space-y-2.5">
              {ov.recent.slice(0, 7).map((r, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  <span className="text-slate-200">{humanize(r.action)}</span>
                  {r.result && r.result !== 'success' && <span className="ml-1.5 text-amber-300">({r.result})</span>}
                  <span className="block text-[11px] text-slate-500 truncate">{`${r.actor || 'System'}${r.target ? ` → ${r.target}` : ''} · ${ago(r.created_at)}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-slate-500">No activity recorded yet.</p> : <div className="h-[210px] rounded-lg skeleton-sheen" />}
        </Panel>
      </div>

      {/* Shortcuts, grouped */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {LINK_GROUPS.map(g => (
          <nav key={g.title} aria-label={g.title} className="glass rounded-2xl border border-white/[0.08] p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">{g.title}</p>
            <ul className="space-y-1.5">
              {g.links.map(l => <li key={l.href}><Link href={l.href} className="text-[13px] text-slate-300 hover:text-white">{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>

      {/* Recent clients */}
      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">Clients</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field text-xs py-2 w-full sm:w-48"
            />
            <Link href="/admin/clients" className="text-xs text-violet-400 hover:text-violet-300 whitespace-nowrap transition-colors">
              View all →
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : (search ? filtered : recentClients).length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No clients found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Name / ID', 'Account Balance', 'Invested', 'Joined', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(search ? filtered : recentClients).map((client, i) => (
                    <tr key={client.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-white">{client.full_name || 'Unnamed'}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{client.id.slice(0, 16)}…</p>
                      </td>
                      {/* Account Balance = the client's spendable (available) balance, as the client sees it. */}
                      <td className="px-5 py-4 text-sm text-white font-medium">
                        {client.accounts ? `$${(client.accounts.available_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">
                        {client.accounts ? `$${(client.accounts.invested_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-600/10"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-white/[0.04]">
              {(search ? filtered : recentClients).map(client => (
                <div key={client.id} className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600/40 to-blue-500/40 flex items-center justify-center text-sm font-bold shrink-0">
                    {(client.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{client.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-slate-500">
                      {client.accounts ? `$${(client.accounts.available_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'No account'}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="text-xs text-violet-400 border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-600/10 transition-colors shrink-0"
                  >
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
