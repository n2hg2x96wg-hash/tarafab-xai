'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { SecurityEvents } from '@/components/admin/SecurityEvents'

type Log = {
  id: string
  user_id: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

const PAGE = 100

export default function AuditLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)

  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Paged newest-first; older entries load on request instead of all at once.
  const fetchPage = async (before?: string) => {
    let q = (supabase.from('audit_logs') as any)
      .select('id, user_id, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE + 1)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q as { data: Log[] | null; error: unknown }
    if (error) setLoadError('Audit logs could not be loaded.')
    else {
      const rows = data || []
      setHasMore(rows.length > PAGE)
      const page = rows.slice(0, PAGE)
      setLogs(prev => before ? [...prev, ...page.filter(r => !prev.some(x => x.id === r.id))] : page)
      setLoadError('')
    }
    setLoading(false)
  }
  const loadMore = async () => {
    const last = logs[logs.length - 1]?.created_at
    if (!last || loadingMore) return
    setLoadingMore(true)
    try { await fetchPage(last) } finally { setLoadingMore(false) }
  }
  useEffect(() => { fetchPage() }, [reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = logs.filter(log => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      log.action.toLowerCase().includes(s) ||
      (log.user_id || '').toLowerCase().includes(s) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(s)
    )
  })

  const getActionColor = (action: string) => {
    if (action.includes('balance') || action.includes('adjust')) return 'bg-violet-600/20 text-violet-400 border-violet-500/30'
    if (action.includes('sign') || action.includes('auth')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    if (action.includes('delete') || action.includes('remove')) return 'bg-red-500/10 text-red-400 border-red-500/20'
    return 'bg-slate-800 text-slate-400 border-white/[0.06]'
  }

  return (
    <AdminLayout title="Audit Logs" subtitle="Full immutable record of admin actions">
      <SecurityEvents />
      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by action, user ID, or details…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field text-xs py-2 flex-1"
        />
      </div>

      <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No audit logs found</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map(log => (
              <div key={log.id}>
                <button
                  className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${getActionColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-500 font-mono truncate">{log.user_id ? `${log.user_id.slice(0, 16)}…` : 'system'}</p>
                        <span className="text-slate-700 text-xs ml-auto shrink-0">
                          {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-slate-600 text-xs shrink-0">{expanded === log.id ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </div>
                </button>
                {expanded === log.id && log.details && (
                  <div className="px-4 pb-4">
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                      <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="px-5 py-3 border-t border-white/[0.06] text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Showing {filtered.length} of {logs.length} loaded{hasMore ? '' : ' (all)'}</span>
              {hasMore && <button onClick={loadMore} disabled={loadingMore} className="btn btn-sm btn-outline">{loadingMore ? 'Loading…' : 'Load older entries'}</button>}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
