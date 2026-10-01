'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'

type Automation = {
  id: string
  status: string
  condition: string
  threshold: number
  last_evaluated_at: string | null
  last_triggered_at: string | null
  last_error: string | null
  market_assets?: { symbol: string; name: string } | null
}

export default function AdminAutomationsPage() {
  const [rows, setRows] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await createClient().from('market_automations').select('id,status,condition,threshold,last_evaluated_at,last_triggered_at,last_error,market_assets(symbol,name)').order('created_at', { ascending: false })
      if (alive) { setRows((data || []) as Automation[]); setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [])
  return <AdminLayout title="Automation center" subtitle="Persisted rules and evaluation health">
    <p className="mb-5 text-sm text-slate-400">Only recorded events are shown as executed. Rules without an evaluation remain configured.</p>
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <table className="w-full min-w-[760px] text-left">
        <thead><tr className="border-b border-white/[0.08] text-xs text-slate-500"><th className="px-5 py-3">Asset / rule</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last evaluated</th><th className="px-5 py-3">Last executed</th><th className="px-5 py-3">Failure</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">Loading automation rules…</td></tr> : rows.map(row => <tr key={row.id} className="border-b border-white/[0.05] text-sm"><td className="px-5 py-4 text-white">{row.market_assets?.name || 'Unknown asset'} <span className="text-xs text-slate-500">{row.market_assets?.symbol} · {row.condition} {row.threshold}</span></td><td className="px-5 py-4 text-slate-300">{row.status}</td><td className="px-5 py-4 text-slate-500">{row.last_evaluated_at ? new Date(row.last_evaluated_at).toLocaleString() : 'Not evaluated'}</td><td className="px-5 py-4 text-slate-500">{row.last_triggered_at ? new Date(row.last_triggered_at).toLocaleString() : 'Not executed'}</td><td className="max-w-xs px-5 py-4 text-amber-300">{row.last_error || '—'}</td></tr>)}</tbody>
      </table>
    </div>
  </AdminLayout>
}
