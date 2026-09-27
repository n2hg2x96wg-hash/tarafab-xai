'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Account = {
  id: string
  account_balance: number
  available_balance: number
  invested_balance: number
  pending_balance: number
}

type Profile = {
  id: string
  full_name: string | null
  role: string
  created_at: string
}

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [form, setForm] = useState({ account_balance: '', available_balance: '', invested_balance: '', pending_balance: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    checkAdminAndLoad()
  }, [clientId])

  const checkAdminAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: { role?: string } | null }
    if (me?.role !== 'admin') { router.push('/dashboard'); return }

    const { data: profileData } = await supabase.from('profiles').select('id, full_name, role, created_at').eq('id', clientId).single() as { data: Profile | null }
    const { data: accountData } = await supabase.from('accounts').select('*').eq('user_id', clientId).single() as { data: Account | null }

    setProfile(profileData)
    setAccount(accountData)
    if (accountData) {
      setForm({
        account_balance: accountData.account_balance?.toString() || '0',
        available_balance: accountData.available_balance?.toString() || '0',
        invested_balance: accountData.invested_balance?.toString() || '0',
        pending_balance: accountData.pending_balance?.toString() || '0',
      })
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setError('')
    setSuccess(false)
    setSaving(true)

    const updates = {
      account_balance: parseFloat(form.account_balance) || 0,
      available_balance: parseFloat(form.available_balance) || 0,
      invested_balance: parseFloat(form.invested_balance) || 0,
      pending_balance: parseFloat(form.pending_balance) || 0,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('user_id', clientId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    // Log the adjustment
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'admin_balance_update',
      details: {
        target_user_id: clientId,
        target_name: profile?.full_name,
        previous: { account_balance: account?.account_balance, available_balance: account?.available_balance, invested_balance: account?.invested_balance, pending_balance: account?.pending_balance },
        updated: updates,
      },
    })

    setAccount({ ...account!, ...updates })
    setSuccess(true)
    setSaving(false)
  }

  const fields: { key: keyof typeof form; label: string; hint: string }[] = [
    { key: 'account_balance', label: 'Account Balance', hint: 'Total portfolio value including all assets' },
    { key: 'available_balance', label: 'Available Balance', hint: 'Funds available for withdrawal or trading' },
    { key: 'invested_balance', label: 'Invested Balance', hint: 'Capital currently deployed in investments' },
    { key: 'pending_balance', label: 'Pending Balance', hint: 'Deposits/withdrawals in processing state' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center text-slate-400 text-sm">
        Client not found.{' '}
        <Link href="/admin" className="text-violet-400 ml-2">Back to admin</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-violet-600/[0.05] rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-8">
          <Link href="/admin" className="hover:text-violet-400 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-slate-300">Edit Client Balance</span>
        </nav>

        {/* Client info */}
        <div className="glass rounded-2xl p-6 border border-white/[0.08] mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-lg font-bold">
              {(profile.full_name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{profile.full_name || 'Unnamed Client'}</h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{profile.id}</p>
            </div>
            <span className={`ml-auto text-[10px] px-2 py-1 rounded-full font-medium border ${profile.role === 'admin' ? 'bg-violet-600/20 text-violet-400 border-violet-500/30' : 'bg-slate-800 text-slate-400 border-white/[0.06]'}`}>
              {profile.role}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-4">
            Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Balance editor */}
        <div className="glass rounded-2xl p-6 border border-white/[0.08]">
          <h2 className="text-sm font-semibold text-white mb-1">Edit Portfolio Balances</h2>
          <p className="text-xs text-slate-500 mb-6">Changes are saved immediately and logged to the audit trail.</p>

          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
              <span>✓</span>
              <span>Balances updated successfully.</span>
            </div>
          )}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-5">
            {fields.map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-slate-300 mb-1">{field.label}</label>
                <p className="text-xs text-slate-600 mb-2">{field.hint}</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className="input-field pl-8"
                    disabled={saving}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-500 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </button>
            <Link
              href="/admin"
              className="px-6 py-3.5 text-sm font-medium text-slate-400 border border-white/[0.08] rounded-xl hover:border-white/20 hover:text-white transition-all text-center"
            >
              Cancel
            </Link>
          </div>
        </div>

        {/* Current snapshot */}
        {account && (
          <div className="mt-4 glass rounded-2xl p-5 border border-white/[0.06]">
            <p className="text-xs text-slate-500 mb-3 font-medium">Current saved values</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Account', value: account.account_balance },
                { label: 'Available', value: account.available_balance },
                { label: 'Invested', value: account.invested_balance },
                { label: 'Pending', value: account.pending_balance },
              ].map(item => (
                <div key={item.label} className="bg-white/[0.02] rounded-xl p-3">
                  <p className="text-[10px] text-slate-600">{item.label}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    ${(item.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
