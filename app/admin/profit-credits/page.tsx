'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { ManualProfitCreditForm, ManualProfitCreditHistory } from '@/components/admin/ManualProfitCredit'
import { ClientSearch, useClientLookup, type FoundClient } from '@/components/admin/ClientSearch'

// Admin: Manual Profit Credit. Find a client, record one profit credit with
// its effective date, and review the credits already recorded. Admin access is
// checked by the admin layout, again by the API route, and again by the
// database function; the records table is readable by admins only.
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
        <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Manual profit credit</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-5 max-w-2xl">Record a profit credit for one client with the date it applies to. It is posted once to the client’s profit balance, recorded in their activity, notified to the client and kept in the audit log. No investment is created or changed.</p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]" aria-labelledby="mpc-new">
            <h2 id="mpc-new" className="text-sm font-semibold text-white mb-3">New credit</h2>

            <div className="mb-5"><ClientSearch client={client} onChange={setClient} inputId="mpc-search" /></div>

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
