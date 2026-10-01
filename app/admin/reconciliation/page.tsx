'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'

type Recon = { user_id: string; full_name: string | null; check_name: string; expected: number; actual: number; difference: number }
const RECON_LABEL: Record<string, string> = {
  total_vs_parts: 'Account total differs from the sum of its balances',
  negative_balance: 'A stored balance is negative',
  pending_investments_not_held: 'Pending investment requests exceed the held balance',
  active_investments_not_invested: 'Active investments exceed the invested balance',
}

export default function ReconciliationPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Recon[]>([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    supabase.rpc('admin_reconciliation').then(({ data, error }) => {
      if (!active) return
      if (error) setError('Reconciliation data could not be loaded. Please try again.')
      else { setItems((data as Recon[]) || []); setError('') }
    })
    return () => { active = false }
  }, [supabase, reload])

  return (
    <AdminLayout title="Reconciliation audit" subtitle="Restricted accounting review of stored balance discrepancies">
      {error && <AdminLoadError message={error} onRetry={() => setReload(value => value + 1)} />}
      {!error && items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm text-slate-300">
          Reconciliation is clean. No items need review.
        </div>
      ) : items.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
          <div className="border-b border-white/[0.06] px-5 py-4 text-sm text-slate-400">
            {items.length} item{items.length === 1 ? '' : 's'} need review. This report is read-only; corrections require an audited admin adjustment.
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {items.map((item, index) => (
              <li key={`${item.user_id}-${item.check_name}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-sm">
                <Link href={`/admin/clients/${item.user_id}`} className="text-violet-300 hover:underline">
                  {item.full_name || item.user_id.slice(0, 8)}
                </Link>
                <span className="text-slate-300">{RECON_LABEL[item.check_name] || item.check_name}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  expected ${Number(item.expected).toFixed(2)}, stored ${Number(item.actual).toFixed(2)} (difference ${Number(item.difference).toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AdminLayout>
  )
}
