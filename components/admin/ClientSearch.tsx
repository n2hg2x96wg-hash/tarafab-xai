'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usd } from '@/components/admin/ManualProfitCredit'

// Admin client picker: customers only, matched by name, email or ID on the
// server (admin_list_customers). Used by the admin operations that act on one
// client (Manual profit credit, Record historical investment).
export type FoundClient = { id: string; full_name: string | null; email: string | null; created_at: string; profit_balance: number | null }

export function useClientLookup() {
  const supabase = createClient()
  const emails = useRef<Map<string, string> | null>(null)
  const emailMap = async () => {
    if (emails.current) return emails.current
    const r = await (supabase.rpc('admin_client_emails') as unknown as Promise<{ data: { id: string; email: string }[] | null }>)
    return (emails.current = new Map((r.data || []).map(e => [e.id, e.email])))
  }
  const find = async (ids: string[]): Promise<FoundClient[]> => {
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
  const search = async (term: string) => {
    const r = await (supabase.rpc as any)('admin_list_customers', { p_search: term }) as { data: { id: string }[] | null; error: unknown }
    if (r.error) throw r.error
    const ids = (r.data || []).map(x => x.id)
    return ids.length ? find(ids) : []
  }
  return { find, search }
}

export function ClientSearch({ client, onChange, showProfit = true, inputId = 'client-search' }: {
  client: FoundClient | null
  onChange: (c: FoundClient | null) => void
  showProfit?: boolean
  inputId?: string
}) {
  const { search: run } = useClientLookup()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoundClient[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => {
    if (term.length < 2) { setResults(null); setError(''); return }
    let live = true
    setSearching(true)
    run(term)
      .then(rows => { if (live) { setResults(rows); setError('') } })
      .catch(() => { if (live) setError('Clients could not be searched. Please try again.') })
      .finally(() => { if (live) setSearching(false) })
    return () => { live = false }
  }, [term]) // eslint-disable-line react-hooks/exhaustive-deps

  if (client) return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5" data-mpc-client data-client-selected>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">{client.full_name || 'Unnamed client'}</p>
        {client.email && <p className="text-[11px] text-slate-400 break-all">{client.email}</p>}
        {showProfit && <p className="text-[11px] text-slate-500 mt-0.5">Profit balance <span className="text-slate-200 tabular-nums">{usd(client.profit_balance)}</span></p>}
      </div>
      <button type="button" onClick={() => onChange(null)} className="text-[12px] text-slate-300 border border-white/[0.12] rounded-lg px-3 py-1.5 hover:bg-white/[0.05] shrink-0">Change</button>
    </div>
  )

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-400 mb-1.5">Client</label>
      <input id={inputId} type="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, email or client ID" className="input-field text-sm" />
      {error && <p role="alert" className="text-xs text-red-400 mt-2">{error}</p>}
      {searching && <p className="text-xs text-slate-500 mt-2">Searching…</p>}
      {!searching && results && results.length === 0 && <p className="text-xs text-slate-500 mt-2">No client matches “{term}”.</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden" data-mpc-results data-client-results>
          {results.map(r => (
            <li key={r.id}>
              <button type="button" onClick={() => { onChange(r); setSearch(''); setResults(null) }}
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
  )
}
