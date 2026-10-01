'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'

type Wallet = {
  id: string; user_id: string; full_name: string | null; email: string | null; chain_id: number; network: string; address: string
  label: string; wallet_name: string; status: 'linked' | 'unlinked' | 'revoked'; verification_status: string
  linked_at: string; verified_at: string | null; last_verified_at: string | null; ended_at: string | null; end_reason: string | null; created_at: string
}
type Event = { id: string; action: string; result: string; actor_id: string | null; actor_name: string | null; details: Record<string, unknown>; created_at: string }

const PAGE = 50
const NETWORKS: [number, string][] = [[1, 'Ethereum'], [8453, 'Base'], [42161, 'Arbitrum One'], [10, 'OP Mainnet'], [137, 'Polygon'], [56, 'BNB Smart Chain']]
const STATUS_STYLE: Record<string, string> = {
  linked: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  unlinked: 'bg-white/[0.04] text-slate-400 border-white/[0.08]',
  revoked: 'bg-red-500/10 text-red-400 border-red-500/20',
}
const ACTION_LABEL: Record<string, string> = {
  WALLET_LINKED: 'Linked after signature check', WALLET_REVERIFIED: 'Ownership re-verified', WALLET_UNLINKED: 'Disconnected by client',
  ADMIN_WALLET_REVOKED: 'Link revoked by admin', WALLET_LINK_REJECTED: 'Link rejected (linked to another account)',
}
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

// Admin view of client wallet links. Only public metadata exists in the
// database (address, network, status, dates): Tarafab never collects private
// keys or recovery phrases, so there is nothing secret to show or reveal.
export default function AdminWalletsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const params = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [term, setTerm] = useState(() => params.get('q') || '')
  const [status, setStatus] = useState('')
  const [chain, setChain] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [open, setOpen] = useState<Wallet | null>(null)
  const [events, setEvents] = useState<Event[] | null>(null)
  const [reason, setReason] = useState('')
  const [revoking, setRevoking] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reload, setReload] = useState(0)
  const [copiedAddress, setCopiedAddress] = useState(false)

  const copyAddress = async () => {
    if (!open) return
    try {
      await navigator.clipboard.writeText(open.address)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 1500)
    } catch { setCopiedAddress(false) }
  }

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])

  const fetchPage = useCallback(async (before?: string) => {
    const { data, error } = await (supabase.rpc as any)('admin_list_wallets', {
      p_search: term || null, p_status: status || null, p_chain_id: chain ? Number(chain) : null, p_before: before || null, p_limit: PAGE + 1,
    }) as { data: Wallet[] | null; error: { message: string } | null }
    if (error) { setLoadError('Wallet links could not be loaded.'); return }
    const page = (data || []).slice(0, PAGE)
    setHasMore((data || []).length > PAGE)
    setRows(prev => (before ? [...prev, ...page.filter(r => !prev.some(x => x.id === r.id))] : page))
    setLoadError('')
  }, [supabase, term, status, chain])

  useEffect(() => { setLoading(true); fetchPage().finally(() => setLoading(false)) }, [fetchPage, reload])

  const openWallet = async (w: Wallet) => {
    setOpen(w); setEvents(null); setReason(''); setActionError(''); setCopiedAddress(false)
    const { data, error } = await (supabase.rpc as any)('admin_wallet_events', { p_wallet: w.id }) as { data: Event[] | null; error: unknown }
    setEvents(error ? [] : data || [])
  }

  const revoke = async () => {
    if (!open || revoking) return
    if (reason.trim().length < 3) { setActionError('Enter a reason (at least 3 characters).'); return }
    setRevoking(true); setActionError('')
    const { error } = await (supabase.rpc as any)('admin_revoke_wallet', { p_wallet: open.id, p_reason: reason.trim() }) as { error: { message: string } | null }
    setRevoking(false)
    if (error) { setActionError(/^(Enter|This|Wallet|Not authorized)/.test(error.message) ? error.message : 'The link could not be revoked. Please try again.'); return }
    setOpen(null); setReload(n => n + 1)
  }

  return (
    <AdminLayout title="Wallets" subtitle="External wallets linked by clients (public metadata only)">
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.06] grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by address, client name, email or ID…" className="input-field text-xs py-2" aria-label="Search wallets" />
          <select value={chain} onChange={e => setChain(e.target.value)} className="input-field text-xs py-2 sm:w-44" aria-label="Network">
            <option value="">All networks</option>
            {NETWORKS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-field text-xs py-2 sm:w-40" aria-label="Status">
            <option value="">All statuses</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Disconnected</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>

        {loading ? (
          <div className="p-10 text-center"><div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">{term || status || chain ? 'No wallet links match these filters.' : 'No client has linked a wallet yet.'}</div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map(w => (
              <li key={w.id}>
                <button onClick={() => openWallet(w)} className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-white/[0.02] transition-colors grid gap-1 sm:grid-cols-[1.2fr_1.6fr_auto_auto] sm:items-center sm:gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{w.full_name || 'Unnamed client'}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{w.email || w.user_id}</span>
                  </span>
                  <span className="font-mono text-[12px] text-slate-300 break-all">{w.address}</span>
                  <span className="text-xs text-slate-400">{w.network}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[w.status]}`}>{w.status === 'unlinked' ? 'disconnected' : w.status}</span>
                    {w.status === 'linked' && <span className="text-[10px] text-sky-300">verified</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="p-4 text-center border-t border-white/[0.06]">
            <button disabled={loadingMore} onClick={async () => { setLoadingMore(true); try { await fetchPage(rows[rows.length - 1]?.created_at) } finally { setLoadingMore(false) } }} className="text-xs text-violet-300 hover:text-violet-200 disabled:opacity-50">
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !revoking && setOpen(null)} />
          <div className="relative z-10 glass w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <h3 id="wallet-title" className="text-base font-bold text-white">Wallet link</h3>
            <div className="mt-2 rounded-xl border border-white/[0.08] bg-black/10 p-3">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-500">WALLET ADDRESS</p>
              <p className="mt-1 font-mono text-[12px] text-slate-200 break-all">{open.address}</p>
              <button onClick={copyAddress} className="mt-2 text-xs text-violet-300 hover:text-violet-200 underline underline-offset-2">
                {copiedAddress ? 'Address copied' : 'Copy address'}
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-slate-500">Client</dt><dd className="text-white"><Link href={`/admin/clients/${open.user_id}`} className="hover:underline">{open.full_name || open.user_id.slice(0, 8)}</Link></dd><dd className="mt-0.5 break-all text-slate-400">{open.email || 'Email unavailable'}</dd></div>
              <div><dt className="text-slate-500">Wallet provider</dt><dd className="text-white">{open.wallet_name || '—'}</dd></div>
              <div><dt className="text-slate-500">Network</dt><dd className="text-white">{open.network}</dd><dd className="mt-0.5 text-slate-400">Chain ID {open.chain_id}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="text-white capitalize">{open.status === 'unlinked' ? 'disconnected' : open.status}</dd></div>
              <div><dt className="text-slate-500">Verification</dt><dd className="text-white">{open.verification_status === 'verified' ? 'Verified' : 'Unverified'}</dd></div>
              <div><dt className="text-slate-500">Label</dt><dd className="text-white">{open.label || '—'}</dd></div>
              <div><dt className="text-slate-500">Linked</dt><dd className="text-white">{when(open.linked_at)}</dd></div>
              <div><dt className="text-slate-500">Last verified</dt><dd className="text-white">{when(open.last_verified_at)}</dd></div>
              {open.ended_at && <div className="col-span-2"><dt className="text-slate-500">Ended</dt><dd className="text-white">{when(open.ended_at)}{open.end_reason ? ` · ${open.end_reason}` : ''}</dd></div>}
            </dl>

            <h4 className="mt-5 text-xs font-semibold text-slate-300">Audit history</h4>
            {events === null ? <p className="text-xs text-slate-500 mt-2">Loading…</p> : events.length === 0 ? <p className="text-xs text-slate-500 mt-2">No events recorded.</p> : (
              <ol className="mt-2 space-y-2">
                {events.map(ev => (
                  <li key={ev.id} className="text-xs text-slate-400 border-l border-white/[0.1] pl-3">
                    <span className="text-slate-200">{ACTION_LABEL[ev.action] || ev.action}</span>
                    <span className="block text-[11px] text-slate-500">{when(ev.created_at)} · by {ev.actor_name || (ev.actor_id ? ev.actor_id.slice(0, 8) : 'system')}{typeof ev.details?.reason === 'string' ? ` · ${ev.details.reason}` : ''}</span>
                  </li>
                ))}
              </ol>
            )}

            <p className="mt-5 text-[11px] text-slate-500 leading-relaxed">Tarafab stores only public wallet information. Private keys and recovery phrases are never collected, so they cannot be viewed here or anywhere else in Tarafab.</p>

            {open.status === 'linked' && (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
                <label htmlFor="revoke-reason" className="block text-xs text-slate-300 mb-1.5">Revoke this link (the client is notified; their wallet and funds are not affected)</label>
                <input id="revoke-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Reason (recorded in the audit log)" className="input-field w-full text-xs py-2" />
                {actionError && <p role="alert" className="text-xs text-red-400 mt-2">{actionError}</p>}
                <button onClick={revoke} disabled={revoking} className="mt-3 w-full text-sm font-semibold text-white bg-red-600/80 hover:bg-red-600 rounded-xl px-4 py-2.5 disabled:opacity-60">{revoking ? 'Revoking…' : 'Revoke link'}</button>
              </div>
            )}
            <button onClick={() => setOpen(null)} disabled={revoking} className="w-full mt-3 text-sm text-slate-300 border border-white/[0.1] hover:border-white/25 rounded-xl px-4 py-2.5">Close</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
