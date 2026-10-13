'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { ManualProfitCreditForm, ManualProfitCreditHistory, usd, type CreditClient } from '@/components/admin/ManualProfitCredit'

type Found = CreditClient & { profit_balance: number | null }

// Admin: Manual Profit Credit. Find a client, record one profit credit with
// its effective date, and review the credits already recorded. Admin access is
// checked by the admin layout, again by the API route, and again by the
// database function; the records table is readable by admins only.
export default function ProfitCreditsPage() {
  const supabase = createClient()
  const params = useSearchParams()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Found[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [client, setClient] = useState<Found | null>(null)
  const [refresh, setRefresh] = useState(0)
  const emails = useRef<Map<string, string> | null>(null)

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])

  const emailMap = async () => {
    if (emails.current) return emails.current
    const r = await (supabase.rpc('admin_client_emails') as unknown as Promise<{ data: { id: string; email: string }[] | null }>)
    return (emails.current = new Map((r.data || []).map(e => [e.id, e.email])))
  }

  // Customers only; matched by name, email or ID on the server.
  const find = async (ids: string[]) => {
    const [{ data, error }, map] = await Promise.all([
      (supabase.from('profiles') as any)
        .select('id, full_name, created_at, accounts(profit_balance)')
        .eq('role', 'customer').in('id', ids.slice(0, 50)).order('created_at', { ascending: false })
        .limit(10) as Promise<{ data: { id: string; full_name: string | null; created_at: string; accounts: { profit_balance: number }[] | { profit_balance: number } | null }[] | null; error: unknown }>,
      emailMap(),
    ])
    if (error) throw error
    return (data || []).map(p => {
      const acc = Array.isArray(p.accounts) ? p.accounts[0] : p.accounts
      return { id: p.id, full_name: p.full_name, created_at: p.created_at, email: map.get(p.id) ?? null, profit_balance: acc?.profit_balance ?? null }
    })
  }

  useEffect(() => {
    if (term.length < 2) { setResults(null); setSearchError(''); return }
    let live = true
    setSearching(true)
    ;(async () => {
      try {
        const r = await (supabase.rpc as any)('admin_list_customers', { p_search: term }) as { data: { id: string }[] | null; error: unknown }
        if (r.error) throw r.error
        const ids = (r.data || []).map(x => x.id)
        const rows = ids.length ? await find(ids) : []
        if (live) { setResults(rows); setSearchError('') }
      } catch {
        if (live) setSearchError('Clients could not be searched. Please try again.')
      } finally {
        if (live) setSearching(false)
      }
    })()
    return () => { live = false }
  }, [term]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a client's page: /admin/profit-credits?client=<id>
  useEffect(() => {
    const id = params.get('client')
    if (!id || client) return
    find([id]).then(r => { if (r[0]) setClient(r[0]) }).catch(() => {})
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadBalance = async () => {
    if (!client) return
    const r = await find([client.id]).catch(() => [])
    if (r[0]) setClient(r[0])
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Manual profit credit</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-5 max-w-2xl">Record a profit credit for one client with the date it applies to. It is posted once to the client’s profit balance, recorded in their activity, notified to the client and kept in the audit log. No investment is created or changed.</p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]" aria-labelledby="mpc-new">
            <h2 id="mpc-new" className="text-sm font-semibold text-white mb-3">New credit</h2>

            {client ? (
              <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5" data-mpc-client>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{client.full_name || 'Unnamed client'}</p>
                  {client.email && <p className="text-[11px] text-slate-400 break-all">{client.email}</p>}
                  <p className="text-[11px] text-slate-500 mt-0.5">Profit balance <span className="text-slate-200 tabular-nums">{usd(client.profit_balance)}</span></p>
                </div>
                <button type="button" onClick={() => setClient(null)} className="text-[12px] text-slate-300 border border-white/[0.12] rounded-lg px-3 py-1.5 hover:bg-white/[0.05] shrink-0">Change</button>
              </div>
            ) : (
              <div className="mb-2">
                <label htmlFor="mpc-search" className="block text-xs font-medium text-slate-400 mb-1.5">Client</label>
                <input id="mpc-search" type="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email or client ID" className="input-field text-sm" />
                {searchError && <p role="alert" className="text-xs text-red-400 mt-2">{searchError}</p>}
                {searching && <p className="text-xs text-slate-500 mt-2">Searching…</p>}
                {!searching && results && results.length === 0 && <p className="text-xs text-slate-500 mt-2">No client matches “{term}”.</p>}
                {results && results.length > 0 && (
                  <ul className="mt-2 rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden" data-mpc-results>
                    {results.map(r => (
                      <li key={r.id}>
                        <button type="button" onClick={() => { setClient(r); setSearch(''); setResults(null) }}
                          className="w-full text-left px-3.5 py-3 hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none">
                          <span className="block text-sm text-white">{r.full_name || 'Unnamed client'}</span>
                          <span className="block text-[11px] text-slate-500 break-all">{r.email || r.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!results && !searching && <p className="text-[11px] text-slate-500 mt-1.5">Type at least 2 characters.</p>}
              </div>
            )}

            {client && (
              <ManualProfitCreditForm client={client} profitBalance={client.profit_balance}
                onPosted={() => { setRefresh(n => n + 1); reloadBalance() }} />
            )}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]" aria-labelledby="mpc-recent">
            <h2 id="mpc-recent" className="text-sm font-semibold text-white">Recent manual credits</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Effective date and posting time are shown separately. Posted credits are not edited or deleted here.</p>
            <ManualProfitCreditHistory refreshKey={refresh} />
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}
