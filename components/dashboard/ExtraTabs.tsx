'use client'

// Dashboard sections added alongside the original tabs. Every figure here is
// derived from the signed-in client's own account and transaction records;
// nothing is projected, simulated or estimated.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { FormError, Spinner } from '@/components/AuthShell'
import { IconChart, IconCheck, IconHelp, IconMail } from '@/components/Icons'
import {
  EmptyState, OPEN_STATUSES, StatusTag, SUPPORT_EMAIL, TxIcon, fmt, methodLabel, txLabel,
  type Account, type Tx, type UserInfo,
} from './shared'

const money = (n: number) => `$${fmt(n)}`

/* Portfolio */
export function PortfolioTab({ account, txs, hasMore, go }: { account: Account | null; txs: Tx[]; hasMore: boolean; go: (id: string) => void }) {
  const { t } = useI18n()
  const totals = useMemo(() => {
    let deposited = 0, withdrawn = 0, returns = 0
    for (const x of txs) {
      if (x.status !== 'completed' && x.status !== 'approved') continue
      if (x.type === 'deposit') deposited += Number(x.amount)
      else if (x.type === 'withdrawal') withdrawn += Number(x.amount)
      else if (x.type === 'adjustment' && x.direction === 'credit') returns += Number(x.amount)
    }
    return { deposited, withdrawn, returns }
  }, [txs])

  const balances: [string, number][] = [
    [t('dash.accountBalance'), account?.account_balance ?? 0],
    [t('withdraw.availableBalance'), account?.available_balance ?? 0],
    [t('dash.invested'), account?.invested_balance ?? 0],
    [t('withdraw.profitBalance'), account?.profit_balance ?? 0],
    [t('dash.pending'), account?.pending_balance ?? 0],
  ]
  const activity: [string, number][] = [
    [t('portfolio.deposited'), totals.deposited],
    [t('portfolio.withdrawn'), totals.withdrawn],
    [t('portfolio.returns'), totals.returns],
  ]

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-fg-muted">{t('portfolio.body')}</p>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="panel p-5 sm:p-6" aria-labelledby="pf-bal">
          <h3 id="pf-bal" className="text-[15px] font-semibold text-fg mb-3">{t('portfolio.balances')}</h3>
          <dl className="divide-y divide-ink-700">
            {balances.map(([label, value], i) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3">
                <dt className={`text-sm ${i === 0 ? 'text-fg font-medium' : 'text-fg-muted'}`}>{label}</dt>
                <dd className={`tabular-nums ${i === 0 ? 'text-lg font-semibold text-fg' : 'text-sm text-fg'}`}>{money(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel p-5 sm:p-6" aria-labelledby="pf-act">
          <h3 id="pf-act" className="text-[15px] font-semibold text-fg mb-3">{t('portfolio.activity')}</h3>
          <dl className="divide-y divide-ink-700">
            {activity.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-fg-muted">{label}</dt>
                <dd className="text-sm text-fg tabular-nums">{money(value)}</dd>
              </div>
            ))}
          </dl>
          {hasMore && <p className="text-xs text-fg-faint mt-3">{t('portfolio.partial', { n: txs.length })}</p>}
        </section>
      </div>
      <p className="text-xs text-fg-faint">{t('portfolio.note')}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => go('markets')} className="btn btn-outline btn-sm"><IconChart width={15} height={15} aria-hidden="true" />{t('portfolio.viewMarket')}</button>
        <button onClick={() => go('support')} className="btn btn-ghost btn-sm"><IconHelp width={15} height={15} aria-hidden="true" />{t('portfolio.contactSupport')}</button>
      </div>
    </div>
  )
}

/* Deposit / withdrawal history */
export function HistoryTab({ kind, txs, hasMore, loadingMore, onLoadMore, go }: {
  kind: 'deposit' | 'withdrawal'; txs: Tx[]; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; go: (id: string) => void
}) {
  const { t, intl } = useI18n()
  const rows = txs.filter(x => x.type === kind)
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="panel overflow-hidden">
        {rows.length === 0 ? (
          kind === 'deposit'
            ? <div><EmptyState title={t('history.noDeposits')} body={t('history.noDepositsBody')} /><div className="pb-8 text-center"><button onClick={() => go('deposit')} className="btn btn-solid btn-sm">{t('dash.depositBitcoin')}</button></div></div>
            : <EmptyState title={t('withdraw.noRequests')} />
        ) : (
          <ul className="divide-y divide-ink-700">
            {rows.map(x => (
              <li key={x.id} className="flex items-start justify-between gap-4 px-4 sm:px-5 py-3.5">
                <div className="flex items-start gap-3 min-w-0">
                  <TxIcon type={x.type} />
                  <div className="min-w-0">
                    <p className="text-sm text-fg">
                      {kind === 'withdrawal'
                        ? t(x.method === 'profit_balance' ? 'withdraw.fromProfit' : 'withdraw.fromAvailable')
                        : x.method ? methodLabel(x.method, t) : txLabel(x, t)}
                    </p>
                    <p className="text-xs text-fg-faint">
                      {new Date(x.created_at).toLocaleString(intl, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {x.reference && <p className="text-xs text-fg-faint font-mono mt-0.5 break-all">{x.reference}</p>}
                    {kind === 'withdrawal' && x.address && <p className="text-xs text-fg-faint font-mono truncate max-w-[220px] sm:max-w-sm">{x.address}</p>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-fg tabular-nums mb-1">{money(Number(x.amount))}</p>
                  <StatusTag status={x.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
    </div>
  )
}

export function LoadMore({ hasMore, loading, onLoadMore }: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  const { t } = useI18n()
  if (!hasMore) return null
  return (
    <div className="text-center">
      <button onClick={onLoadMore} disabled={loading} className="btn btn-outline btn-sm">
        {loading ? <><Spinner />{t('common.loading')}</> : t('history.loadMore')}
      </button>
    </div>
  )
}

/* Security */
export function SecurityTab({ user }: { user: UserInfo | null }) {
  const { t, intl } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signOutEverywhere = async () => {
    setBusy(true); setError('')
    // Supabase revokes every refresh token for this user; the dashboard's
    // auth listener then sends this tab to sign-in.
    const { error: err } = await createClient().auth.signOut({ scope: 'global' }).catch(e => ({ error: e }))
    if (err) { setError(t('security.signOutFailed')); setBusy(false) }
  }
  const date = (v?: string | null) => v ? new Date(v).toLocaleString(intl, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('common.unknown')
  const rows: [string, string][] = [
    [t('security.signInEmail'), user?.email || t('common.notSet')],
    [t('profile.emailConfirmed'), user?.email_confirmed === undefined ? t('common.unknown') : user.email_confirmed ? t('common.yes') : t('common.no')],
    [t('security.lastSignIn'), date(user?.last_sign_in_at)],
  ]
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-fg-muted">{t('security.body')}</p>
      <div className="panel p-5 sm:p-6">
        <dl className="divide-y divide-ink-700">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="text-sm text-fg text-right break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-2">{t('common.password')}</h3>
        <p className="text-sm text-fg-muted mb-5">{t('profile.passwordBody')}</p>
        <Link href="/forgot-password" className="btn btn-outline">{t('profile.changePassword')}</Link>
      </div>
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-2">{t('security.signOutAll')}</h3>
        <p className="text-sm text-fg-muted mb-5">{t('security.signOutAllBody')}</p>
        {error && <div className="mb-4"><FormError message={error} /></div>}
        <button onClick={signOutEverywhere} disabled={busy} className="btn btn-danger">
          {busy ? <><Spinner />{t('security.signingOut')}</> : t('security.signOutAll')}
        </button>
      </div>
    </div>
  )
}

/* Preferences: appearance and language are separate controls */
export function PreferencesTab() {
  const { t } = useI18n()
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-fg-muted">{t('prefs.body')}</p>
      <div className="panel p-5 sm:p-6"><ThemeSelector variant="list" /></div>
      <div className="panel p-5 sm:p-6"><LanguageSelector variant="list" /></div>
      <div className="panel p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-fg mb-2">{t('prefs.notifications')}</h3>
        <p className="text-sm text-fg-muted">{t('prefs.notificationsBody')}</p>
      </div>
    </div>
  )
}

/* Help & support */
declare global { interface Window { smartsupp?: (...args: unknown[]) => void } }

export function SupportTab() {
  const { t } = useI18n()
  const [chatMissing, setChatMissing] = useState(false)
  const openChat = () => {
    // The existing Smartsupp widget on client pages.
    if (typeof window.smartsupp === 'function') { window.smartsupp('chat:open'); setChatMissing(false) }
    else setChatMissing(true)
  }
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-fg-muted">{t('support.body')}</p>
      <div className="panel p-5 sm:p-6 space-y-3">
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account support')}`} className="btn btn-solid w-full">
          <IconMail width={17} height={17} aria-hidden="true" />{t('support.email')}
        </a>
        <p className="text-xs text-fg-faint text-center break-all">{SUPPORT_EMAIL}</p>
      </div>
      <div className="panel p-5 sm:p-6">
        <button onClick={openChat} className="btn btn-outline w-full">{t('support.chat')}</button>
        <p className="text-xs text-fg-faint mt-2">{chatMissing ? t('support.chatUnavailable') : t('support.chatBody')}</p>
      </div>
      <div className="panel p-5 sm:p-6">
        <Link href="/#faq" className="btn btn-ghost w-full">{t('support.faq')}</Link>
      </div>
    </div>
  )
}

/* Notifications: status updates taken from the client's own transactions */
export type Notice = { id: string; tx: Tx; kind: 'approved' | 'rejected' | 'pending' | 'credited'; at: string }

export function noticesFrom(txs: Tx[]): Notice[] {
  const out: Notice[] = []
  for (const tx of txs) {
    if (tx.type === 'deposit' || tx.type === 'withdrawal') {
      if (tx.status === 'completed' || tx.status === 'approved') out.push({ id: tx.id, tx, kind: 'approved', at: tx.updated_at || tx.created_at })
      else if (tx.status === 'rejected') out.push({ id: tx.id, tx, kind: 'rejected', at: tx.updated_at || tx.created_at })
      else if (OPEN_STATUSES.includes(tx.status)) out.push({ id: tx.id, tx, kind: 'pending', at: tx.created_at })
    } else if (tx.type === 'adjustment' && tx.status === 'completed') {
      out.push({ id: tx.id, tx, kind: 'credited', at: tx.created_at })
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50)
}

export function NotificationsTab({ notices, seenAt }: { notices: Notice[]; seenAt: string | null }) {
  const { t, intl } = useI18n()
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-fg-muted">{t('notices.body')}</p>
      <div className="panel overflow-hidden">
        {notices.length === 0 ? <EmptyState title={t('notices.empty')} /> : (
          <ul className="divide-y divide-ink-700">
            {notices.map(n => {
              const isNew = !seenAt || n.at > seenAt
              const text = t(`notices.${n.kind}`, { type: txLabel(n.tx, t), amount: money(Number(n.tx.amount)) })
              return (
                <li key={n.id + n.kind} className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? 'bg-brand-400' : 'bg-transparent'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{text}</p>
                    <p className="text-xs text-fg-faint">
                      {new Date(n.at).toLocaleString(intl, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {n.tx.reference ? ` · ${n.tx.reference}` : ''}
                    </p>
                  </div>
                  {n.kind === 'approved' && <IconCheck width={16} height={16} className="shrink-0 text-emerald-400 mt-0.5" aria-hidden="true" />}
                  <StatusTag status={n.tx.status} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
