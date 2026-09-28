'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch, errorText, readJson, RequestError, newRequestKey } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { isAllowedUpload, MAX_UPLOAD_BYTES, prepareUpload } from '@/lib/uploadFile'
import { ReceiptField } from '@/components/dashboard/ReceiptField'
import { FormError, Spinner } from '@/components/AuthShell'
import { IconCheck, IconInfo, IconShield } from '@/components/Icons'

export type KycState = {
  status: 'unverified' | 'pending' | 'under_review' | 'verified' | 'rejected' | string
  // What the profile says. It can carry a status set by an admin before the
  // KYC form existed, which is not a submission and must not hide the form.
  profile_status?: string
  has_submission?: boolean
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  document_type: string | null
  full_legal_name: string | null
}

const DOCUMENT_TYPES = ['passport', 'national_id', 'drivers_license'] as const

// The colour of the status banner follows the meaning of the state, not the
// brand accent, so it reads the same way as the transaction statuses.
const TONE: Record<string, string> = {
  verified: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300',
  pending: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-300',
  under_review: 'border-sky-500/30 bg-sky-500/[0.06] text-sky-300',
  rejected: 'border-danger-400/40 bg-danger-400/[0.06] text-danger-300',
  unverified: 'border-ink-700 bg-ink-850/60 text-fg-muted',
}

export function VerificationTab({ onStatusChange }: { onStatusChange?: (status: string) => void }) {
  const { t, intl } = useI18n()
  const [state, setState] = useState<KycState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [country, setCountry] = useState('')
  const [address, setAddress] = useState('')
  const [docType, setDocType] = useState<string>('passport')
  const [docNumber, setDocNumber] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [stage, setStage] = useState<'' | 'uploading' | 'submitting'>('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await readJson<{ kyc: KycState }>(await authFetch('/api/client/kyc'))
      setState(data.kyc)
      onStatusChange?.(data.kyc.status)
      setLoadError('')
    } catch (e) {
      setLoadError(errorText(e, t))
    } finally {
      setLoading(false)
    }
  // The translator identity changes with the language; reloading on that is
  // harmless and keeps any error message in the selected language.
  }, [t, onStatusChange])

  useEffect(() => { load() }, [load])

  const upload = async (file: File, key: string) => {
    const ready = await prepareUpload(file)
    if (ready.size > MAX_UPLOAD_BYTES) throw new RequestError(t('kyc.errSize'), 0)
    const fd = new FormData()
    fd.append('file', ready)
    fd.append('key', key)
    try {
      const up = await readJson<{ path: string }>(await authFetch('/api/client/upload-kyc-doc', { method: 'POST', body: fd }, 60_000))
      return up.path
    } catch (e) {
      throw e instanceof RequestError && e.status === 0 ? new RequestError(t('kyc.errUpload'), 0) : e
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError(t('kyc.errName')); return }
    if (!docFile) { setError(t('kyc.errDocument')); return }
    if (!consent) { setError(t('kyc.errConsent')); return }
    if (!isAllowedUpload(docFile) || (selfieFile && !isAllowedUpload(selfieFile))) { setError(t('kyc.errType')); return }
    if (submitting) return

    setSubmitting(true)
    try {
      setStage('uploading')
      const documentPath = await upload(docFile, newRequestKey().replace(/-/g, ''))
      const selfiePath = selfieFile ? await upload(selfieFile, newRequestKey().replace(/-/g, '')) : undefined

      setStage('submitting')
      await readJson(await authFetch('/api/client/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_legal_name: fullName.trim(),
          document_type: docType,
          date_of_birth: dob || undefined,
          country: country.trim() || undefined,
          address: address.trim() || undefined,
          document_number: docNumber.trim() || undefined,
          document_path: documentPath,
          selfie_path: selfiePath,
        }),
      }))
      await load()
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setSubmitting(false)
      setStage('')
    }
  }

  if (loading) {
    return <div className="panel p-6 flex items-center gap-3 text-fg-muted"><Spinner /><span className="text-sm">{t('common.loading')}</span></div>
  }

  const status = state?.status || 'unverified'
  // Whether the client has actually applied, which is what decides if the form
  // is shown. A profile status on its own is not a submission.
  const hasSubmission = state?.has_submission ?? (status !== 'unverified')
  // 'unverified' means nothing has been sent yet; the copy calls that
  // "not submitted" so a new account is never described as verified.
  const statusKey = status === 'unverified' ? 'notSubmitted' : status === 'under_review' ? 'underReview' : status
  // The form is offered whenever there is no submission to wait on, and after
  // a rejection so the details can be corrected and sent again.
  const canSubmit = !hasSubmission || status === 'rejected'
  const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { dateStyle: 'medium' }) : ''

  return (
    <div className="space-y-5 panel-in max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg">{t('kyc.title')}</h2>
      </div>

      <div className={`panel p-5 sm:p-6 border ${TONE[status] || TONE.unverified}`}>
        <div className="flex items-start gap-3">
          <span className="shrink-0 mt-0.5">
            {status === 'verified' ? <IconCheck width={18} height={18} aria-hidden="true" /> : <IconShield width={18} height={18} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t(`kyc.status.${statusKey}` as 'kyc.status.pending')}</p>
            <p className="text-[14px] mt-1 text-fg-muted">{t(`kyc.body.${statusKey}` as 'kyc.body.pending')}</p>
            {status === 'rejected' && state?.rejection_reason && (
              <p className="text-[14px] mt-2 text-fg">
                <span className="text-fg-faint">{t('kyc.reason')}: </span>{state.rejection_reason}
              </p>
            )}
            {state?.submitted_at && hasSubmission && (
              <p className="text-xs mt-2 text-fg-faint">{t('kyc.submittedOn', { date: when(state.submitted_at) })}</p>
            )}
          </div>
        </div>
      </div>

      {loadError && <FormError message={loadError} />}

      {canSubmit && (
        <form onSubmit={submit} className="panel p-5 sm:p-6 space-y-4" noValidate>
          <div>
            <h3 className="text-lg font-semibold text-fg">{status === 'rejected' ? t('kyc.resubmit') : t('kyc.formTitle')}</h3>
            <p className="text-[14px] text-fg-muted mt-1">{t('kyc.why')}</p>
            <p className="text-[14px] text-fg-muted mt-2">{t('kyc.formBody')}</p>
          </div>

          <div>
            <label htmlFor="kyc-name" className="field-label">{t('kyc.fullName')}</label>
            <input id="kyc-name" value={fullName} onChange={e => setFullName(e.target.value)}
              className="field" autoComplete="name" disabled={submitting} required />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="kyc-dob" className="field-label">{t('kyc.dob')}</label>
              <input id="kyc-dob" type="date" value={dob} onChange={e => setDob(e.target.value)}
                className="field" disabled={submitting} />
            </div>
            <div>
              <label htmlFor="kyc-country" className="field-label">{t('kyc.country')}</label>
              <input id="kyc-country" value={country} onChange={e => setCountry(e.target.value)}
                className="field" autoComplete="country-name" disabled={submitting} />
            </div>
          </div>

          <div>
            <label htmlFor="kyc-address" className="field-label">{t('kyc.address')}</label>
            <input id="kyc-address" value={address} onChange={e => setAddress(e.target.value)}
              className="field" autoComplete="street-address" disabled={submitting} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="kyc-doctype" className="field-label">{t('kyc.documentType')}</label>
              <select id="kyc-doctype" value={docType} onChange={e => setDocType(e.target.value)}
                className="field" disabled={submitting}>
                {DOCUMENT_TYPES.map(d => (
                  <option key={d} value={d}>{t(`kyc.doc.${d}` as 'kyc.doc.passport')}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="kyc-docnum" className="field-label">{t('kyc.documentNumber')}</label>
              <input id="kyc-docnum" value={docNumber} onChange={e => setDocNumber(e.target.value)}
                className="field" disabled={submitting} />
            </div>
          </div>

          <ReceiptField id="kyc-doc" file={docFile} onChange={setDocFile} disabled={submitting}
            label={t('kyc.documentFile')} help={t('kyc.documentHelp')} choose={t('kyc.chooseDocument')} />
          <ReceiptField id="kyc-selfie" file={selfieFile} onChange={setSelfieFile} disabled={submitting}
            label={t('kyc.selfieFile')} help={t('kyc.selfieHelp')} choose={t('kyc.chooseSelfie')} />

          <div className="flex items-start gap-2 text-xs text-fg-faint">
            <IconInfo width={14} height={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>{t('kyc.privacy')}</p>
          </div>

          <label htmlFor="kyc-consent" className="flex items-start gap-3 cursor-pointer py-1">
            <input
              id="kyc-consent"
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 w-5 h-5 shrink-0 accent-[rgb(var(--accent))]"
            />
            <span className="text-[14px] text-fg-muted">{t('kyc.consent')}</span>
          </label>

          {error && <FormError message={error} />}

          <button type="submit" disabled={submitting || !consent} className="btn btn-solid w-full sm:w-auto">
            {submitting
              ? <span className="flex items-center gap-2"><Spinner />{stage === 'uploading' ? t('kyc.uploading') : t('kyc.submitting')}</span>
              : status === 'rejected' ? t('kyc.resubmit') : t('kyc.submit')}
          </button>
        </form>
      )}
    </div>
  )
}
