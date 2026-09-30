'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type W = { id: string; network: string; chain_id: number; address: string; wallet_name: string; status: string; linked_at: string; last_verified_at: string | null }

// A client's external wallet links, as public metadata only. Tarafab never
// collects private keys or recovery phrases, so none can be shown.
export function ClientWallets({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<W[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    ;(createClient().rpc as any)('admin_list_wallets', { p_search: clientId, p_limit: 20 })
      .then(({ data, error }: { data: W[] | null; error: unknown }) => { if (!alive) return; if (error) setFailed(true); else setRows(data || []) })
    return () => { alive = false }
  }, [clientId])
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
  return (
    <div className="glass rounded-2xl border border-white/[0.08] p-4 sm:p-5 mt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Linked wallets</h3>
        <Link href={`/admin/wallets?q=${clientId}`} className="text-xs text-violet-300 hover:text-violet-200">Open in Wallets →</Link>
      </div>
      {failed ? <p className="text-xs text-slate-500">Wallet links could not be loaded.</p>
        : rows === null ? <p className="text-xs text-slate-500">Loading…</p>
        : rows.length === 0 ? <p className="text-xs text-slate-500">This client has not linked an external wallet.</p>
        : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map(w => (
              <li key={w.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono text-slate-200 break-all">{w.address}</span>
                <span className="text-slate-400">{w.network}</span>
                <span className="text-slate-500">{w.wallet_name || '—'}</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${w.status === 'linked' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-slate-400 border-white/[0.08]'}`}>{w.status === 'linked' ? 'linked · verified' : w.status === 'unlinked' ? 'disconnected' : w.status}</span>
                <span className="text-slate-500">linked {d(w.linked_at)} · last verified {d(w.last_verified_at)}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
