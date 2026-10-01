'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'

type Row = { asset: { symbol: string; name: string; category: string }; quote: { price: number | null; status: string; updatedAt: string | null } }

export default function AdminMarketDataPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/market/assets', { cache: 'no-store' })
      .then(response => response.json())
      .then(body => setRows(body.assets || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])
  return <AdminLayout title="Market data health" subtitle="Monitor asset availability without exposing client secrets">
    <div className="mb-5 flex items-center justify-between gap-3">
      <p className="text-sm text-slate-400">Provider failures are shown as unavailable; no fallback prices are fabricated.</p>
      <Link href="/admin" className="text-sm text-violet-300 hover:underline">Back to admin</Link>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <table className="w-full min-w-[640px] text-left">
        <thead><tr className="border-b border-white/[0.08] text-xs text-slate-500"><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last update</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">Checking market feeds…</td></tr> : rows.map(row => <tr key={row.asset.symbol} className="border-b border-white/[0.05] text-sm"><td className="px-5 py-4 font-medium text-white">{row.asset.name} <span className="text-xs text-slate-500">{row.asset.symbol}</span></td><td className="px-5 py-4 capitalize text-slate-400">{row.asset.category}</td><td className="px-5 py-4 text-slate-200">{row.quote.price == null ? 'Unavailable' : `$${row.quote.price.toLocaleString('en-US', { maximumFractionDigits: 6 })}`}</td><td className="px-5 py-4"><span className={row.quote.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}>{row.quote.status}</span></td><td className="px-5 py-4 text-slate-500">{row.quote.updatedAt ? new Date(row.quote.updatedAt).toLocaleString() : '—'}</td></tr>)}</tbody>
      </table>
    </div>
  </AdminLayout>
}
