'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { HistoricalInvestmentForm, HistoricalInvestmentHistory } from '@/components/admin/HistoricalInvestment'
import { ClientSearch, useClientLookup, type FoundClient } from '@/components/admin/ClientSearch'

// Admin: Record Historical Investment. Documents a genuine past investment
// missing from a client's history, without moving money. Admin access is
// checked by the admin layout, again by the API route, and again by the
// database function; the records table is readable by admins only.
export default function HistoricalInvestmentsPage() {
  const params = useSearchParams()
  const [client, setClient] = useState<FoundClient | null>(null)
  const [refresh, setRefresh] = useState(0)
  const { find } = useClientLookup()

  // Opened from a client's page: /admin/historical-investments?client=<id>
  useEffect(() => {
    const id = params.get('client')
    if (!id || client) return
    find([id]).then(r => { if (r[0]) setClient(r[0]) }).catch(() => {})
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Record historical investment</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-5 max-w-2xl">Document a genuine investment a client made earlier that is missing from their investment history. Recording it never creates a deposit, debit or credit and never changes a balance. Existing records are checked first so nothing is added twice.</p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]" aria-labelledby="hi-new">
            <h2 id="hi-new" className="text-sm font-semibold text-white mb-3">New historical record</h2>
            <div className="mb-5"><ClientSearch client={client} onChange={setClient} showProfit={false} inputId="hi-search" /></div>
            {client && <HistoricalInvestmentForm client={client} onRecorded={() => setRefresh(n => n + 1)} />}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-6 border border-white/[0.08]" aria-labelledby="hi-recent">
            <h2 id="hi-recent" className="text-sm font-semibold text-white">Recorded historical investments</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Investment date and record time are shown separately. Records are corrected or voided here with a reason; they are never deleted.</p>
            <HistoricalInvestmentHistory clientId={client?.id} refreshKey={refresh} />
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}
