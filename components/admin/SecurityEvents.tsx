'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Suspicious activity (failed sign-ins, rate-limit violations). Readable by
// admins only — enforced by the database policy, not by this component.
type Ev = { id: number; created_at: string; kind: string; actor: string | null; ip: string | null; detail: Record<string, unknown> }
const LABEL: Record<string, string> = { failed_login: 'Failed sign-in', rate_limited: 'Rate limit exceeded' }

export function SecurityEvents() {
  const supabase = createClient()
  const [rows, setRows] = useState<Ev[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    (supabase.from('security_events') as any).select('id, created_at, kind, actor, ip, detail').order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }: { data: Ev[] | null; error: unknown }) => { if (error) setErr('Security events could not be loaded.'); else setRows(data || []) })
  }, [supabase])
  return (
    <section className="glass rounded-2xl border border-white/[0.08] p-4 sm:p-5 mb-5" aria-labelledby="sec-ev">
      <div className="flex items-center justify-between gap-3">
        <h2 id="sec-ev" className="text-sm font-semibold text-white">Security events</h2>
        <span className="text-[11px] text-slate-500">Latest 20 · append-only</span>
      </div>
      {err ? <p className="mt-3 text-xs text-amber-300">{err}</p> : !rows ? <p className="mt-3 text-xs text-slate-500">Loading…</p> : !rows.length ? <p className="mt-3 text-xs text-slate-500">No suspicious activity recorded.</p> : (
        <ul className="mt-3 divide-y divide-white/[0.05]">
          {rows.map(r => (
            <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-200">{LABEL[r.kind] || r.kind}<span className="ml-2 text-slate-500">{String((r.detail as { email?: string; scope?: string }).email || (r.detail as { scope?: string }).scope || '')}</span></span>
              <span className="text-slate-500 tabular-nums">{r.ip ? `${r.ip} · ` : ''}{new Date(r.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
