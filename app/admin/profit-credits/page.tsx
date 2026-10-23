'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { ManualProfitHistory, ManualProfitPanel } from '@/components/admin/ManualProfitPanel'
import { ClientSearch, useClientLookup, type FoundClient } from '@/components/admin/ClientSearch'

// Admin: Manual Profit Credit & Debit. Find a client, record one profit credit
// or debit with its effective date, and review the entries already recorded.
// Admin access is checked by the admin layout, again by the API route, and
// again by the database function; the record tables are readable by admins only.
export default function ProfitCreditsPage() {
  const params = useSearchParams()
  const [client, setClient] = useState<FoundClient | null>(null)
  const [refresh, setRefresh] = useState(0)
  const { find } = useClientLookup()

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
        <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Manual profit credit &amp; debit</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-5 max-w-2xl">Posted once to the client’s profit balance, shown in their activity and kept in the audit log.</p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <section className="glass rounded-2xl p-3.5 sm:p-5 border border-white/[0.08]" aria-labelledby="mpc-new">
            <h2 id="mpc-new" className="text-sm font-semibold text-white mb-3">New entry</h2>

            <div className="mb-5"><ClientSearch client={client} onChange={setClient} inputId="mpc-search" /></div>

            {client && (
              <ManualProfitPanel client={client} profitBalance={client.profit_balance} onPosted={() => { setRefresh(n => n + 1); reloadBalance() }} />
            )}
          </section>

          <section className="glass rounded-2xl p-3.5 sm:p-5 border border-white/[0.08]" aria-labelledby="mpc-recent">
            <h2 id="mpc-recent" className="text-sm font-semibold text-white">Recent manual entries</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Posted entries are never edited; correct a mistake with a linked entry.</p>
            <ManualProfitHistory refreshKey={refresh} />
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}
