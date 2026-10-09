'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch, errorText, readJson } from '@/lib/authFetch'
import { validateNewClient } from '@/lib/clientAccountValidation'

type Created = { user_id: string; email: string; full_name: string }

// A random password that satisfies the policy (upper, lower, digit, symbol),
// from the browser's cryptographic generator. It exists only in this form.
function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?']
  const all = sets.join('')
  const pick = (s: string) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return s[b[0] % s.length] }
  const chars = sets.map(pick)
  while (chars.length < 16) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) { const b = new Uint32Array(1); crypto.getRandomValues(b); const j = b[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

export default function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => { firstField.current?.focus() }, [created])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const v = validateNewClient({ full_name: fullName, email, password })
    if (v.error) { setError(v.error); return }
    setBusy(true); setError('')
    try {
      const res = await readJson<Created>(await authFetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: v.full_name, email: v.email, password: v.password }),
      }, 30_000))
      // The password is cleared from memory and never shown again.
      setPassword(''); setShowPw(false)
      setCreated({ user_id: res.user_id, email: res.email, full_name: res.full_name })
      onCreated()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => { setCreated(null); setFullName(''); setEmail(''); setPassword(''); setError('') }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="create-client-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { if (!busy) onClose() }} />
      <div className="relative z-10 glass w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/[0.1] p-5 sm:p-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        {created ? (
          <div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-lg mb-3" aria-hidden="true">✓</div>
            <h3 id="create-client-title" className="text-base font-bold text-white">Client account created successfully.</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">The email is confirmed, so the client can sign in straight away. No confirmation email was sent.</p>
            <dl className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06] text-sm">
              <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-slate-500">Name</dt><dd className="text-white text-right break-all">{created.full_name}</dd></div>
              <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-slate-500">Email</dt><dd className="text-white text-right break-all">{created.email}</dd></div>
              <div className="flex justify-between gap-3 px-4 py-2.5 items-center"><dt className="text-slate-500">User ID</dt>
                <dd className="text-right">
                  <button type="button" className="font-mono text-[11px] text-slate-300 hover:text-white break-all text-right" onClick={() => navigator.clipboard.writeText(created.user_id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})} title="Copy user ID">
                    {created.user_id}
                  </button>
                  {copied && <span className="block text-[10px] text-emerald-400">Copied</span>}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Share the temporary password with the client through a secure channel (never in the same message as the email address). They can change it at any time from <span className="text-slate-300">Profile → Change password</span>.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
              <button type="button" onClick={reset} className="flex-1 text-sm font-medium text-slate-300 border border-white/[0.1] hover:border-white/25 hover:text-white rounded-xl px-4 py-2.5 transition-colors">Create another</button>
              <Link href={`/admin/clients/${created.user_id}`} className="flex-1 text-center text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-2.5 transition-colors">Open client</Link>
            </div>
            <button type="button" onClick={onClose} className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300 py-2">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3 id="create-client-title" className="text-base font-bold text-white">Create Client Account</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">Creates a client login with a confirmed email. The client signs in on the normal sign-in page with this email and password.</p>

            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="cc-name">Full Name</label>
            <input ref={firstField} id="cc-name" className="input-field w-full mb-4" autoComplete="off" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} required />

            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="cc-email">Email</label>
            <input id="cc-email" type="email" inputMode="email" className="input-field w-full mb-4" autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required />

            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-slate-400" htmlFor="cc-password">Temporary Password</label>
              <button type="button" onClick={() => { setPassword(generatePassword()); setShowPw(true) }} className="text-[11px] text-accent hover:text-accent-hover">Generate</button>
            </div>
            <div className="relative mb-1.5">
              <input id="cc-password" type={showPw ? 'text' : 'password'} className="input-field w-full pr-16 font-mono" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={password} onChange={e => setPassword(e.target.value)} maxLength={72} required />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-white px-2 py-1" aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? 'Hide' : 'Show'}</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">At least 12 characters with an uppercase letter, a lowercase letter, a number and a symbol.</p>

            {error && <p role="alert" className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="flex-1 text-sm font-medium text-slate-300 border border-white/[0.1] hover:border-white/25 hover:text-white rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy} className="flex-1 text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60">
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
