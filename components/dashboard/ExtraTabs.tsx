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
import { IconChart, IconCheck, IconHelp, IconInfo, IconMail } from '@/components/Icons'
import {
  EmptyState, OPEN_STATUSES, SettingsRow, SettingsSection, StatusTag, SUPPORT_EMAIL, TxIcon, fmt, methodLabel, txLabel,
  type Account, type Tx, type UserInfo,
} from './shared'
import { isAccountCredit, txCategory, txSign } from '@/lib/txCategory'

const money = (n: number) => `$${fmt(n)}`

// Totals from completed records only, by what each record means
// (lib/txCategory): deposits credited (client deposits and account credits),
// withdrawals paid, and profit = investment returns only. An admin top-up is
// never counted as profit.
export function txTotals(txs: Tx[]) {
  let deposited = 0, withdrawn = 0, returns = 0
  for (const x of txs) {
    if (x.status !== 'completed' && x.status !== 'approved') continue
    const c = txCategory(x), sign = txSign(x)
    if (c === 'deposit' && sign >= 0) deposited += Number(x.amount)
    else if (c === 'withdrawal') withdrawn += Number(x.amount)
    else if (c === 'profit') returns += sign < 0 ? -Number(x.amount) : Number(x.amount)
  }
  return { deposited, withdrawn, returns }
}

/* Portfolio */
export function PortfolioTab({ account, txs, hasMore, go }: { account: Account | null; txs: Tx[]; hasMore: boolean; go: (id: string) => void }) {
  const { t } = useI18n()
  const totals = useMemo(() => txTotals(txs), [txs])

  // One client-facing balance, taken from the account's available_balance;
  // invested, profit and pending stay separate, as before.
  // Invested figures come from client_investment_summary (same as Overview);
  // null when unavailable, never shown as $0.00.
  const inv = account?.investments ?? null
  const balances: [string, number | null][] = [
    [t('dash.accountBalance'), account?.available_balance ?? 0],
    [t('dash.totalInvested'), inv ? inv.total_invested : null],
    [t('dash.activeInvestments'), inv ? inv.active_principal : null],
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
                <dd className={`tabular-nums ${i === 0 ? 'text-lg font-semibold text-fg' : 'text-sm text-fg'}`}>{value != null ? money(value) : <span className="text-fg-faint text-[12px]">{t('dash.unavailable')}</span>}</dd>
              </div>
            ))}
          </dl>
          {/* Where these figures come from, so none of them reads as a calculation it is not. */}
          <p className="mt-3 text-xs leading-relaxed text-fg-faint">{t('portfolio.sourceNote')}</p>
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
  // By meaning: Deposit history includes account credits made by Tarafab (admin funding).
  const rows = txs.filter(x => txCategory(x) === kind)
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
                  <TxIcon type={x.type} tx={x} />
                  <div className="min-w-0">
                    <p className="text-sm text-fg">
                      {kind === 'withdrawal'
                        ? t(x.method === 'profit_balance' ? 'withdraw.fromProfit' : 'withdraw.fromAvailable')
                        : isAccountCredit(x) ? t('dash.txType.accountCredit')
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
    <div className="max-w-lg space-y-6">
      <SettingsSection title={t('nav2.groupAccount')} id="sec-signin">
        {rows.map(([label, value]) => <SettingsRow key={label} label={label} value={<span className="break-all">{value}</span>} />)}
        <SettingsRow label={t('common.password')} sub={t('profile.passwordBody')}
          action={<Link href="/forgot-password" className="btn btn-sm btn-outline whitespace-nowrap">{t('profile.changePassword')}</Link>} />
      </SettingsSection>
      <SettingsSection title={t('security.signOutAll')} id="sec-sessions" danger>
        <div className="px-4 py-3.5 space-y-3">
          <p className="text-[13.5px] text-fg-muted">{t('security.signOutAllBody')}</p>
          {error && <FormError message={error} />}
          <button onClick={signOutEverywhere} disabled={busy} className="btn btn-sm btn-danger" data-signout-all>
            {busy ? <><Spinner />{t('security.signingOut')}</> : t('security.signOutAll')}
          </button>
        </div>
      </SettingsSection>
    </div>
  )
}

/* Preferences: appearance and language are separate controls */
export function PreferencesTab() {
  const { t } = useI18n()
  return (
    <div className="max-w-lg space-y-5">
      {/* One surface: appearance and language (both saved on this device). */}
      <div className="dep-surface !p-0 overflow-hidden divide-y divide-[rgb(var(--contrast)/.07)]" data-prefs>
        <div className="p-4"><ThemeSelector variant="list" /></div>
        <div className="p-4"><LanguageSelector variant="list" /></div>
      </div>
      <div className="flex gap-3 px-1">
        <IconInfo width={16} height={16} className="shrink-0 mt-0.5 text-fg-faint" aria-hidden="true" />
        <p className="text-[13px] text-fg-muted"><span className="text-fg font-medium">{t('prefs.notifications')}.</span> {t('prefs.notificationsBody')}</p>
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
  // One list of support routes (rows, not cards). Email is the primary route
  // because it always works; live chat opens the existing single Smartsupp widget.
  const row = 'w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-[rgb(var(--contrast)/.035)] focus-visible:outline-none focus-visible:bg-[rgb(var(--contrast)/.05)]'
  const tile = 'w-10 h-10 shrink-0 rounded-xl grid place-items-center'
  const chev = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-fg-faint" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  return (
    <div className="max-w-lg">
      <ul className="dep-surface !p-0 overflow-hidden divide-y divide-[rgb(var(--contrast)/.07)]" data-support-list>
        <li>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account support')}`} className={row} data-support="email">
            <span className={`${tile} bg-accent/15 text-accent`}><IconMail width={18} height={18} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-fg">{t('support.email')}</span>
              <span className="block text-[12.5px] text-fg-faint break-all">{SUPPORT_EMAIL}</span>
            </span>
            {chev}
          </a>
        </li>
        <li>
          <button type="button" onClick={openChat} className={row} data-support="chat">
            <span className={`${tile} bg-[rgb(var(--contrast)/.06)] text-fg-muted`}><IconHelp width={18} height={18} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-fg">{t('support.chat')}</span>
              <span className={`block text-[12.5px] ${chatMissing ? 'text-amber-300' : 'text-fg-faint'}`} role={chatMissing ? 'status' : undefined}>{chatMissing ? t('support.chatUnavailable') : t('support.chatBody')}</span>
            </span>
            {chev}
          </button>
        </li>
        <li>
          <Link href="/#faq" className={row} data-support="faq">
            <span className={`${tile} bg-[rgb(var(--contrast)/.06)] text-fg-muted`}><IconInfo width={18} height={18} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-fg">{t('support.faq')}</span></span>
            {chev}
          </Link>
        </li>
      </ul>
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
    } else if ((tx.type === 'adjustment' || txCategory(tx) === 'profit') && tx.status === 'completed') {
      out.push({ id: tx.id, tx, kind: 'credited', at: tx.created_at })
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50)
}

export type TeamNotice = {
  id: string; type: 'account' | 'deposit' | 'withdrawal' | 'security' | 'announcement' | 'investment' | 'market' | 'release'
  title: string; body: string; cta_label: string | null; cta_target: string | null; investment_id?: string | null; created_at: string; read: boolean
}

const NOTICE_TONE: Record<TeamNotice['type'], string> = {
  release: 'text-accent border-accent/30',
  account: 'text-brand-300 border-brand-500/30',
  deposit: 'text-emerald-400 border-emerald-500/30',
  withdrawal: 'text-sky-400 border-sky-500/30',
  security: 'text-amber-400 border-amber-500/30',
  announcement: 'text-fg-muted border-ink-600',
  market: 'text-sky-300 border-sky-500/30',
  investment: 'text-accent border-accent/30',
}

export function NotificationsTab({ notices, seenAt, team, onRead, go }: {
  notices: Notice[]; seenAt: string | null; team: TeamNotice[]; onRead: (ids: string[]) => void; go: (id: string, investmentId?: string | null) => void
}) {
  const { t, intl } = useI18n()
  const unreadIds = team.filter(n => !n.read).map(n => n.id)
  const when = (d: string) => new Date(d).toLocaleString(intl, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="max-w-2xl space-y-6 panel-in">

      {team.length > 0 && (
        <section aria-labelledby="nt-team">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <h3 id="nt-team" className="dep-h">{t('notif.fromTeam')}{unreadIds.length > 0 && <span className="ml-2 align-middle inline-flex min-w-5 h-5 px-1.5 rounded-full bg-accent/15 text-accent text-[11px] font-semibold items-center justify-center tabular-nums">{unreadIds.length}</span>}</h3>
            {unreadIds.length > 0 && <button onClick={() => onRead(unreadIds)} className="text-[13px] text-fg-muted hover:text-fg min-h-9 px-1">{t('notif.markAllRead')}</button>}
          </div>
          <ul className="dep-surface !p-0 overflow-hidden divide-y divide-[rgb(var(--contrast)/.07)]">
            {team.map(n => (
              <li key={n.id} className={`px-4 py-3.5 transition-colors ${n.read ? '' : 'bg-accent/[0.035]'}`} data-notice={n.read ? 'read' : 'unread'}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`tag ${NOTICE_TONE[n.type]}`}>{t(`notif.types.${n.type}`)}</span>
                      {!n.read && <span className="sr-only">{t('notif.unread')}</span>}
                      <span className="text-xs text-fg-faint">{when(n.created_at)}</span>
                    </div>
                    <p className={`text-[14px] ${n.read ? 'text-fg-muted' : 'font-semibold text-fg'}`}>{n.title}</p>
                    {n.body && <p className="text-[13.5px] text-fg-muted mt-0.5 whitespace-pre-line break-words">{n.body}</p>}
                    <div className="flex flex-wrap gap-2 mt-2.5 empty:hidden">
                      {n.cta_label && n.cta_target && (
                        <button onClick={() => { onRead([n.id]); go(n.cta_target!.slice(1), n.investment_id) }} className="btn btn-brand btn-sm">{n.cta_label}</button>
                      )}
                      {!n.read && <button onClick={() => onRead([n.id])} className="btn btn-ghost btn-sm">{t('notif.markRead')}</button>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="nt-act">
        <h3 id="nt-act" className="dep-h mb-2.5">{t('notif.activity')}</h3>
        {notices.length === 0 ? <div className="dep-surface !p-0"><EmptyState title={t('notices.empty')} /></div> : (
          <ul className="dep-surface !p-0 overflow-hidden divide-y divide-[rgb(var(--contrast)/.07)]">
            {notices.map(n => {
              const isNew = !seenAt || n.at > seenAt
              const text = t(`notices.${n.kind}`, { type: txLabel(n.tx, t), amount: money(Number(n.tx.amount)) })
              return (
                <li key={n.id + n.kind} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew && n.kind !== 'pending' ? 'bg-accent' : 'bg-transparent'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] ${isNew && n.kind !== 'pending' ? 'text-fg font-medium' : 'text-fg-muted'}`}>{text}</p>
                    <p className="text-xs text-fg-faint">{when(n.at)}{n.tx.reference ? ` · ${n.tx.reference}` : ''}</p>
                  </div>
                  <StatusTag status={n.tx.status} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/* Performance: returns credited and money in/out, month by month */
export function PerformanceTab({ txs, hasMore }: { txs: Tx[]; hasMore: boolean }) {
  const { t, intl } = useI18n()
  const totals = useMemo(() => txTotals(txs), [txs])
  const credits = useMemo(() => txs.filter(x => txCategory(x) === 'profit' && txSign(x) > 0 && x.status === 'completed'), [txs])
  const months = useMemo(() => {
    const m = new Map<string, { deposits: number; withdrawals: number; returns: number }>()
    for (const x of txs) {
      if (x.status !== 'completed' && x.status !== 'approved') continue
      const key = x.created_at.slice(0, 7)
      const row = m.get(key) ?? { deposits: 0, withdrawals: 0, returns: 0 }
      const c = txCategory(x)
      if (c === 'deposit' && txSign(x) >= 0) row.deposits += Number(x.amount)
      else if (c === 'withdrawal') row.withdrawals += Number(x.amount)
      else if (c === 'profit') row.returns += txSign(x) < 0 ? -Number(x.amount) : Number(x.amount)
      else continue
      m.set(key, row)
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  }, [txs])
  const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(intl, { month: 'short', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="space-y-4 max-w-4xl panel-in">
      {/* Two headline figures in one strip, not two cards. */}
      <div className="panel grid grid-cols-2 divide-x divide-ink-700/70" data-perf-summary>
        <div className="p-4 min-w-0">
          <p className="text-[12px] text-fg-faint">{t('performance.returnsTotal')}</p>
          <p className={`mt-0.5 text-[20px] sm:text-2xl font-semibold tabular-nums break-words ${totals.returns > 0 ? 'price-up' : 'text-fg'}`}>{money(totals.returns)}</p>
          <p className="text-[11.5px] text-fg-faint mt-0.5">{t('performance.credits')}: {credits.length}</p>
        </div>
        <div className="p-4 min-w-0">
          <p className="text-[12px] text-fg-faint">{t('performance.netDeposits')}</p>
          <p className="mt-0.5 text-[20px] sm:text-2xl font-semibold text-fg tabular-nums break-words">{money(totals.deposited - totals.withdrawn)}</p>
          <p className="text-[11.5px] text-fg-faint mt-0.5">{t('performance.netDepositsHint')}</p>
        </div>
      </div>
      <section className="panel overflow-hidden" aria-labelledby="pf-months">
        <h3 id="pf-months" className="px-5 pt-5 pb-3 text-[15px] font-semibold text-fg">{t('performance.byMonth')}</h3>
        {months.length === 0 ? <EmptyState title={t('performance.noReturns')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-y border-ink-700 text-left text-xs text-fg-faint">
                  <th className="px-5 py-2.5 font-medium">{t('performance.month')}</th>
                  <th className="px-5 py-2.5 font-medium text-right">{t('performance.deposits')}</th>
                  <th className="px-5 py-2.5 font-medium text-right">{t('performance.withdrawals')}</th>
                  <th className="px-5 py-2.5 font-medium text-right">{t('performance.returns')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {months.map(([k, r]) => (
                  <tr key={k}>
                    <td className="px-5 py-3 text-fg">{monthName(k)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-fg-muted">{money(r.deposits)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-fg-muted">{money(r.withdrawals)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${r.returns > 0 ? 'price-up' : 'text-fg-muted'}`}>{money(r.returns)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {hasMore && <p className="text-xs text-fg-faint">{t('portfolio.partial', { n: txs.length })}</p>}
      <p className="text-xs text-fg-faint">{t('portfolio.note')}</p>
    </div>
  )
}
