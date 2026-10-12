'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { authFetch, errorText, messageFor, readJson, RequestError } from '@/lib/authFetch'
import { hideChat } from '@/lib/chatAside'
import { FormError, Spinner } from '@/components/AuthShell'
import {
  BANK_STATUS_TEXT, bankCountry, bankMasked, bankTitle, countryName, pickDetails, ROUTE_NAMES, routeFields, validateBankDetails,
  type BankContext, type SavedBankAccount,
} from '@/lib/bankRoutes'
import type { CatalogCountry } from '@/lib/countryCatalog'
import { CountryPicker, NOT_LISTED } from '@/components/dashboard/CountryPicker'
import { SupportButton } from '@/components/dashboard/SupportAction'

// Bank-transfer withdrawal destinations in the Withdraw tab: the client's
// saved bank accounts (masked), the form that adds or replaces one, and the
// card that manages the selected one. Everything is stored and checked by
// /api/client/bank-accounts and the database; nothing here is trusted.

export function BankGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 4l9 5.5" /><path d="M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8" /><path d="M3 20h18" />
    </svg>
  )
}

export function useBankAccounts() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [context, setContext] = useState<BankContext | null>(null)
  const [accounts, setAccounts] = useState<SavedBankAccount[]>([])
  const reload = useCallback(async () => {
    try {
      const r = await readJson<{ context: BankContext; accounts: SavedBankAccount[] }>(await authFetch('/api/client/bank-accounts'))
      setContext(r.context)
      setAccounts(r.accounts || [])
      setState('ok')
    } catch (e) {
      console.error('Bank accounts could not be loaded', e)
      setState('error')
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { state, context, accounts, setAccounts, reload }
}

const STATUS_TONE: Record<SavedBankAccount['status'], string> = {
  pending_review: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  verified: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  rejected: 'text-red-300 bg-red-500/10 border-red-500/25',
}

export function BankStatusBadge({ status }: { status: SavedBankAccount['status'] }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${STATUS_TONE[status]}`} data-bank-status={status}>{BANK_STATUS_TEXT[status]}</span>
}

// Add a bank account, or replace one (its details are saved as a new
// account that must be verified again; the old one is retired).
export function BankAccountSheet({ ctx, replace, onSaved, onClose }: {
  ctx: BankContext
  replace?: SavedBankAccount | null
  onSaved: (a: SavedBankAccount) => void
  onClose: () => void
}) {
  const [country, setCountry] = useState(replace?.country || '')
  const [picked, setPicked] = useState<CatalogCountry | null>(null)
  const [holder, setHolder] = useState(replace?.holder_name || ctx.legal_name || '')
  const [bankName, setBankName] = useState(replace?.bank_name || '')
  const [label, setLabel] = useState(replace?.label || '')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const c = bankCountry(country)
  const supported = !!c && ctx.routes.includes(c.route)
  const fields = c && supported ? routeFields(c) : []

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const html = document.documentElement, prev = html.style.overflow
    html.style.overflow = 'hidden'
    const showChat = hideChat()
    ref.current?.querySelector<HTMLElement>('[data-country-trigger], select, input')?.focus()
    return () => { html.style.overflow = prev; showChat(); opener?.focus?.() }
  }, [])

  const setDetail = (k: string, v: string) => { setDetails(d => ({ ...d, [k]: v })); setFieldErr(e => { const n = { ...e }; delete n[k]; return n }) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inFlight.current) return
    setError('')
    const errs: Record<string, string> = {}
    if (!c || !supported) errs.country = 'Choose the country where the bank account is held.'
    if (holder.replace(/\s+/g, ' ').trim().length < 2) errs.holder_name = 'Enter the account holder\'s full legal name.'
    if (bankName.trim().length < 2) errs.bank_name = 'Enter the bank name.'
    if (label.trim().length > 40) errs.label = 'Use 40 characters or fewer.'
    if (c && supported) Object.assign(errs, validateBankDetails(c, details))
    setFieldErr(errs)
    if (Object.keys(errs).length) {
      setError('Check the highlighted fields.')
      ref.current?.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus()
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      const res = await authFetch('/api/client/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', country: c!.code, holder_name: holder, bank_name: bankName, label: label.trim() || undefined, details: pickDetails(c!, details), replace_id: replace?.id }),
      })
      const body = await res.json().catch(() => null) as { account?: SavedBankAccount; error?: string; fields?: Record<string, string> } | null
      if (!res.ok || !body?.account) {
        if (body?.fields) setFieldErr(body.fields)
        setError(body?.error || messageFor(res.status))
        return
      }
      onSaved(body.account)
    } catch (err) {
      setError(err instanceof RequestError ? err.message : errorText(err))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const err = (k: string) => fieldErr[k] && <p id={`bk-${k}-err`} className="mt-1 text-[12.5px] text-red-400" data-field-error={k}>{fieldErr[k]}</p>
  const aria = (k: string) => ({ 'aria-invalid': !!fieldErr[k] || undefined, 'aria-describedby': fieldErr[k] ? `bk-${k}-err` : undefined })
  const cls = (k: string) => `field ${fieldErr[k] ? 'field-error' : ''}`

  if (typeof document === 'undefined') return null
  return createPortal(
    <div data-sheet-root className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="bank-sheet-title"
      onKeyDown={e => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); onClose() } }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px] backdrop-in" onClick={() => { if (!saving) onClose() }} aria-hidden="true" />
      <div ref={ref} className="dep-sheet relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[22px] sm:rounded-2xl px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:p-5" data-bank-sheet>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id="bank-sheet-title" className="text-[17px] font-semibold text-fg">{replace ? 'Replace bank details' : 'Add a bank account'}</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">{replace ? `The new details replace ${bankMasked(replace)} and must be verified again.` : 'For withdrawals by bank transfer.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-sm btn-outline shrink-0" aria-label="Close">✕</button>
        </div>

        {!ctx.kyc_verified ? (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-3.5 text-[13.5px] text-fg-muted" data-bank-kyc-required>
            <p className="font-medium text-fg">Identity verification needed</p>
            <p className="mt-1">Complete identity verification (Verification in the menu) before adding a bank account. The account must be in your own verified legal name.</p>
          </div>
        ) : (
          <form onSubmit={save} className="mt-4 space-y-4" noValidate data-bank-form>
            {error && <FormError message={error} />}
            <div>
              <span id="bk-country-label" className="field-label">Country of bank account</span>
              {/* Every country is listed; only those marked Available can be paid by bank transfer.
                  Entered details are kept when the country changes. */}
              <CountryPicker value={country} disabled={saving || !!replace} invalid={!!fieldErr.country} describedBy={fieldErr.country ? 'bk-country-err' : undefined}
                isAvailable={x => !!x.payout && ctx.routes.includes(x.payout.route)}
                onChange={(code, x) => { setCountry(code); setPicked(x); setFieldErr({}); setError('') }} />
              {err('country')}
              {country && !supported && (
                <p className="mt-2 text-[13px] text-amber-300" role="status" data-bank-unsupported>
                  {country === NOT_LISTED || !picked
                    ? 'Bank withdrawals are only available for the countries marked Available.'
                    : `Bank withdrawals to ${picked.name} (${picked.currencies.join(', ')}) are not available yet.`}
                  {' '}You can still withdraw with Bitcoin or a verified wallet.
                </p>
              )}
              {c && supported && <p className="mt-1.5 text-[12.5px] text-fg-faint" data-bank-route>{ROUTE_NAMES[c.route]} · paid in {c.currency}</p>}
            </div>

            {country && !supported && (
              <div className="rounded-xl border border-ink-700 p-3.5 text-[13px]" data-bank-help>
                <p className="font-medium text-fg">Need help with your bank account?</p>
                <p className="mt-1 text-fg-muted">Contact your representative or Tarafab.XAi Support to ask about bank-transfer availability for your country.</p>
                <SupportButton className="btn btn-sm btn-outline mt-3" beforeOpen={onClose} data-bank-support>Contact Tarafab.XAi Support</SupportButton>
              </div>
            )}

            {c && supported && (
              <>
                <div>
                  <label htmlFor="bk-holder" className="field-label">Account holder&apos;s full legal name</label>
                  <input id="bk-holder" name="holder_name" value={holder} onChange={e => { setHolder(e.target.value); setFieldErr(x => ({ ...x, holder_name: '' })) }} maxLength={120} autoComplete="name" className={cls('holder_name')} disabled={saving} {...aria('holder_name')} />
                  {err('holder_name')}
                  <p className="mt-1.5 text-[12.5px] text-fg-faint">
                    {ctx.legal_name ? <>Must match your verified legal name, <span className="text-fg-muted">{ctx.legal_name}</span>. </> : null}
                    Not a nickname. A different name is reviewed by our team before any payment.
                  </p>
                </div>
                <div>
                  <label htmlFor="bk-bank" className="field-label">Bank name</label>
                  <input id="bk-bank" name="bank_name" value={bankName} onChange={e => { setBankName(e.target.value); setFieldErr(x => ({ ...x, bank_name: '' })) }} maxLength={120} autoComplete="off" className={cls('bank_name')} disabled={saving} {...aria('bank_name')} />
                  {err('bank_name')}
                </div>
                {fields.map(f => (
                  <div key={f.key}>
                    <label htmlFor={`bk-${f.key}`} className="field-label">{f.label}{f.optional && <span className="text-fg-faint font-normal"> (optional)</span>}</label>
                    {f.options ? (
                      <select id={`bk-${f.key}`} name={f.key} value={details[f.key] || ''} onChange={e => setDetail(f.key, e.target.value)} className={cls(f.key)} disabled={saving} {...aria(f.key)}>
                        <option value="">Choose</option>
                        {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input id={`bk-${f.key}`} name={f.key} value={details[f.key] || ''} onChange={e => setDetail(f.key, e.target.value)} placeholder={f.placeholder}
                        inputMode={f.inputMode} maxLength={f.maxLength} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                        className={`${cls(f.key)} font-mono tabular-nums`} disabled={saving} {...aria(f.key)} />
                    )}
                    {err(f.key)}
                    {f.help && !fieldErr[f.key] && <p className="mt-1 text-[12.5px] text-fg-faint">{f.help}</p>}
                  </div>
                ))}
                <div>
                  <label htmlFor="bk-label" className="field-label">Account nickname <span className="text-fg-faint font-normal">(optional)</span></label>
                  <input id="bk-label" name="label" value={label} onChange={e => setLabel(e.target.value)} maxLength={40} placeholder="e.g. My main account" autoComplete="off" className={cls('label')} disabled={saving} {...aria('label')} />
                  {err('label')}
                </div>
              </>
            )}

            <div className="rounded-xl border border-ink-700 p-3 text-[12.5px] text-fg-muted space-y-1.5" data-bank-notice>
              <p>Our payments team checks every new or changed bank account before sending money to it. There is no instant automatic verification.</p>
              <p>We never ask for your online-banking password, PIN, card number, CVV or one-time codes.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="btn btn-outline flex-1">Cancel</button>
              <button type="submit" disabled={saving || !c || !supported} aria-busy={saving} className="btn btn-solid flex-1" data-bank-save>
                {saving ? <><Spinner />Saving…</> : replace ? 'Save new details' : 'Save bank account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

// The selected saved account: what it is, where it stands, and the actions
// the client may take on it (rename, replace details, remove).
export function BankAccountPanel({ account, disabled, onRenamed, onReplace, onRemoved }: {
  account: SavedBankAccount
  disabled?: boolean
  onRenamed: (a: SavedBankAccount) => void
  onReplace: () => void
  onRemoved: (id: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setRenaming(false); setConfirmRemove(false); setMsg('') }, [account.id])

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('')
    try {
      return await readJson<{ account?: SavedBankAccount; removed?: boolean }>(await authFetch('/api/client/bank-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }))
    } catch (e) { setMsg(errorText(e)); return null } finally { setBusy(false) }
  }
  // Not a <form>: this card sits inside the withdrawal form.
  const rename = async () => {
    if (busy) return
    if (draft.trim().length > 40) { setMsg('Use 40 characters or fewer.'); return }
    const r = await call({ action: 'rename', id: account.id, label: draft.trim() })
    if (r?.account) { onRenamed(r.account); setRenaming(false) }
  }
  const remove = async () => {
    if (busy) return
    const r = await call({ action: 'remove', id: account.id })
    if (r?.removed) onRemoved(account.id)
  }

  const off = disabled || busy
  return (
    <div className="mt-2 rounded-xl border border-ink-700 p-3.5 text-[13px]" data-bank-panel={account.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-fg truncate" data-bank-title>{bankTitle(account)}</p>
          <p className="text-fg-muted" data-bank-masked>{bankMasked(account)}</p>
          <p className="text-fg-faint truncate">{account.bank_name} · {countryName(account.country)} · {account.currency}</p>
        </div>
        <BankStatusBadge status={account.status} />
      </div>
      <p className="mt-2 text-fg-muted" data-bank-status-note>
        {account.status === 'verified' && 'Checked by our payments team. Withdrawals are paid to this account by bank transfer.'}
        {account.status === 'pending_review' && 'Not verified yet. You can request a withdrawal now; our payments team verifies this account before sending any money.'}
        {account.status === 'rejected' && <>This account was not accepted{account.review_note ? `: ${account.review_note}` : '.'} Replace the details or remove it.</>}
      </p>
      {account.name_check === 'mismatch' && account.status !== 'rejected' && (
        <p className="mt-1.5 text-amber-300" data-bank-name-mismatch>The account holder name is different from your verified legal name, so our team will review it before any payment.</p>
      )}
      {account.currency !== 'USD' && account.status !== 'rejected' && (
        <p className="mt-1.5 text-fg-faint">Your balance is in USD. The bank receives {account.currency}; the exchange rate is applied by our payments team when the transfer is sent.</p>
      )}

      {renaming ? (
        <div className="mt-3 flex gap-2">
          <label htmlFor="bk-rename" className="sr-only">Account nickname</label>
          <input id="bk-rename" value={draft} onChange={e => setDraft(e.target.value)} maxLength={40} placeholder="e.g. Savings account" className="field flex-1 min-w-0" disabled={off} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rename() } else if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false) } }} />
          <button type="button" className="btn btn-sm btn-solid" disabled={off} onClick={rename} data-bank-rename-save>Save</button>
          <button type="button" className="btn btn-sm btn-outline" disabled={off} onClick={() => setRenaming(false)}>Cancel</button>
        </div>
      ) : confirmRemove ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-fg-muted">Remove this bank account?</span>
          <button type="button" className="btn btn-sm btn-outline !text-red-300" disabled={off} onClick={remove} data-bank-remove-confirm>Remove</button>
          <button type="button" className="btn btn-sm btn-outline" disabled={off} onClick={() => setConfirmRemove(false)}>Keep</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline" disabled={off} onClick={() => { setDraft(account.label || ''); setRenaming(true) }} data-bank-rename>Rename</button>
          <button type="button" className="btn btn-sm btn-outline" disabled={off} onClick={onReplace} data-bank-replace>Replace details</button>
          <button type="button" className="btn btn-sm btn-outline" disabled={off} onClick={() => setConfirmRemove(true)} data-bank-remove>Remove</button>
        </div>
      )}
      {msg && <p className="mt-2 text-[12.5px] text-red-400" role="alert">{msg}</p>}
    </div>
  )
}
