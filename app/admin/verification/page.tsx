'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminLayout from '@/components/AdminLayout'
import { AdminLoadError } from '@/components/AdminLoadError'
import { authFetch, errorText, readJson } from '@/lib/authFetch'

type Submission = {
  id: string | null
  user_id: string
  status: string
  full_legal_name: string
  date_of_birth: string | null
  country: string | null
  address: string | null
  document_type: string
  document_number: string | null
  document_path: string | null
  selfie_path: string | null
  submitted_at: string
  reviewed_at: string | null
  rejection_reason: string | null
  client_name: string | null
  client_email: string | null
  // A client whose verification state predates the submission table. It is
  // shown so those records stay visible, but there is nothing to review.
  legacy: boolean
}

const STATUS_STYLE: Record<string, string> = {
  verified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  under_review: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
}

// 'verified' is the value the database has always stored; the panel shows it
// as "Approved" without changing existing records.
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  under_review: 'Under review',
  verified: 'Approved',
  rejected: 'Rejected',
}

const DOC_LABEL: Record<string, string> = {
  passport: 'Passport',
  national_id: 'National ID',
  drivers_license: "Driver's licence",
}

export default function VerificationPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  const [reviewing, setReviewing] = useState<Submission | null>(null)
  const [action, setAction] = useState<'review' | 'verify' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const subs = await (supabase.rpc('admin_kyc_queue') as unknown as Promise<{ data: Submission[] | null; error: unknown }>)
      if (cancelled) return
      if (subs.error) setLoadError('Verification requests could not be loaded. The list may be out of date.')
      else setLoadError('')
      setRows(subs.data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [supabase, reload])

  const openDocument = async (path: string, kind: 'document' | 'selfie') => {
    // Opened first so the browser treats it as part of the click, then pointed
    // at the short-lived signed link once it comes back.
    const tab = window.open('', '_blank')
    try {
      const { url } = await readJson<{ url: string }>(await authFetch(`/api/admin/kyc-doc-url?path=${encodeURIComponent(path)}`))
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (e) {
      tab?.close()
      setReviewError(`The ${kind} could not be opened. ${errorText(e)}`)
    }
  }

  const submitReview = async () => {
    if (!reviewing || !action) return
    setBusy(true)
    setReviewError('')
    try {
      await readJson(await authFetch('/api/admin/review-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: reviewing.id, action, reason: reason.trim() || undefined }),
      }))
      setReviewing(null)
      setAction(null)
      setReason('')
      setReload(n => n + 1)
    } catch (e) {
      setReviewError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const filtered = rows.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.full_legal_name, r.client_name, r.client_email, r.country].some(v => (v || '').toLowerCase().includes(q))
  })

  const date = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const openCount = rows.filter(r => r.status === 'pending' || r.status === 'under_review').length

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">KYC Verification</h1>
        <p className="text-sm text-slate-500 mt-1">
          Identity documents submitted by clients{openCount > 0 ? ` · ${openCount} awaiting review` : ''}
        </p>
      </div>

      {loadError && <AdminLoadError message={loadError} onRetry={() => setReload(n => n + 1)} />}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name, email or country…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field text-xs py-2 flex-1"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-2 sm:w-48">
          <option value="">All</option>
          <option value="pending">Pending review</option>
          <option value="under_review">Under review</option>
          <option value="verified">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="panel p-8 text-center text-sm text-slate-500">Loading verification requests…</div>
      ) : filtered.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-slate-400">No verification requests to show.</p>
          <p className="text-xs text-slate-600 mt-1">Requests appear here as soon as a client submits one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id || r.user_id} className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white whitespace-nowrap">{r.client_name || r.full_legal_name}</p>
                  <p className="text-xs text-slate-500 break-all">{r.client_email || '—'}</p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">{r.user_id}</p>
                </div>
                <span className={`inline-block whitespace-nowrap text-[10px] px-2 py-1 rounded-full border font-medium ${STATUS_STYLE[r.status] || 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>

              {r.legacy && (
                <p className="mt-3 text-xs text-amber-400/90">
                  This status was set on the client&apos;s profile before the KYC form existed, so there are no submitted
                  documents to review. Their record is kept as it is; they can submit a KYC request from their dashboard.
                </p>
              )}

              <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mt-4 text-xs">
                <div><dt className="text-slate-600">Legal name</dt><dd className="text-slate-300">{r.full_legal_name}</dd></div>
                <div><dt className="text-slate-600">Document</dt><dd className="text-slate-300">{r.document_type ? `${DOC_LABEL[r.document_type] || r.document_type}${r.document_number ? ` · ${r.document_number}` : ''}` : '—'}</dd></div>
                <div><dt className="text-slate-600">Date of birth</dt><dd className="text-slate-300">{r.date_of_birth || '—'}</dd></div>
                <div><dt className="text-slate-600">Country</dt><dd className="text-slate-300">{r.country || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-slate-600">Address</dt><dd className="text-slate-300 break-words">{r.address || '—'}</dd></div>
                <div><dt className="text-slate-600">Submitted</dt><dd className="text-slate-300">{date(r.submitted_at)}</dd></div>
                {r.reviewed_at && <div><dt className="text-slate-600">Reviewed</dt><dd className="text-slate-300">{date(r.reviewed_at)}</dd></div>}
                {r.rejection_reason && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-600">Reason given</dt><dd className="text-slate-300 break-words">{r.rejection_reason}</dd></div>}
              </dl>

              <div className="flex flex-wrap gap-2 mt-4">
                {r.document_path && (
                  <button onClick={() => openDocument(r.document_path!, 'document')} className="btn btn-sm btn-outline">View document</button>
                )}
                {r.selfie_path && (
                  <button onClick={() => openDocument(r.selfie_path!, 'selfie')} className="btn btn-sm btn-outline">View selfie</button>
                )}
                {!r.legacy && (r.status === 'pending' || r.status === 'under_review') && (
                  <>
                    {r.status === 'pending' && (
                      <button
                        onClick={() => { setReviewing(r); setAction('review'); setReason(''); setReviewError('') }}
                        className="btn btn-sm bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20"
                      >Mark under review</button>
                    )}
                    <button
                      onClick={() => { setReviewing(r); setAction('verify'); setReason(''); setReviewError('') }}
                      className="btn btn-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                    >Approve KYC</button>
                    <button
                      onClick={() => { setReviewing(r); setAction('reject'); setReason(''); setReviewError('') }}
                      className="btn btn-sm bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                    >Reject KYC</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewing && action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true">
          <div className="panel p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-2">
              {action === 'verify' ? 'Approve this KYC request' : action === 'reject' ? 'Reject this KYC request' : 'Mark as under review'}
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              {action === 'verify'
                ? `${reviewing.client_name || reviewing.full_legal_name} will be shown as approved. This does not change their balance.`
                : action === 'reject'
                  ? 'The client will be shown as rejected and can submit again. A reason is required.'
                  : 'The client will see that their submission is being reviewed. Nothing is decided yet.'}
            </p>
            <label htmlFor="kyc-reason" className="field-label">
              {action === 'reject' ? 'Reason for rejection' : 'Note (optional)'}
            </label>
            <textarea
              id="kyc-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={action === 'reject' ? 'e.g. Please provide a clearer copy of the requested document.' : 'e.g. Document matches the account name'}
              className="input-field text-sm"
              disabled={busy}
            />
            {reviewError && <p role="alert" className="text-xs text-red-400 mt-2">{reviewError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setReviewing(null); setAction(null) }} disabled={busy} className="btn btn-outline flex-1">Cancel</button>
              <button
                onClick={submitReview}
                disabled={busy || (action === 'reject' && !reason.trim())}
                className={`btn flex-1 disabled:opacity-50 ${
                  action === 'verify' ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                  : action === 'reject' ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-sky-500 text-black hover:bg-sky-400'}`}
              >
                {busy ? 'Saving…' : action === 'verify' ? 'Approve KYC' : action === 'reject' ? 'Reject KYC' : 'Mark under review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
