'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authFetch, readJson, RequestError } from '@/lib/authFetch'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { premiumText } from '@/lib/i18n/premium'
import { PaymentShell } from '@/components/payment/PaymentShell'
import { Spinner } from '@/components/AuthShell'

type Pay = { reference: string; status: 'redirected' | 'pending_verification' | 'successful' | 'failed' | 'cancelled' | 'expired'; verification_status: string }
type View = 'loading' | 'signin' | 'notfound' | Pay['status']

// Return from SeerBit. Whatever the URL says, this page only reports what
// the server has verified with SeerBit; it never marks a payment as paid.
function Return() {
  const { locale } = useI18n()
  const t = (k: string, v?: Record<string, string>) => premiumText(locale, k, v)
  const q = useSearchParams()
  const [view, setView] = useState<View>('loading')
  const [ref, setRef] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    let stored = ''
    try { stored = sessionStorage.getItem('tarafab.payRef') || '' } catch { /* ignore */ }
    const ours = [q.get('tref'), stored].find(x => x && /^PAY-[A-Z0-9]{12}$/.test(x)) || ''
    if (!ours) { setView('notfound'); return }
    setRef(ours)
    // SeerBit's own reference (parameter name varies by integration).
    const provider = [q.get('reference'), q.get('paymentReference'), q.get('trxref'), q.get('ref')].find(x => x && /^[A-Za-z0-9_-]{4,80}$/.test(x)) || ''
    const cancelled = /cancel/i.test(q.get('status') || '') || q.get('cancelled') === 'true'
    let timer: ReturnType<typeof setTimeout> | undefined; let tries = 0
    const poll = async () => {
      try {
        const r = await readJson<{ payment: Pay }>(await authFetch(`/api/client/payments/status?reference=${ours}`))
        setView(r.payment.status === 'redirected' ? 'pending_verification' : r.payment.status)
        if (r.payment.status === 'pending_verification' && ++tries < 24) timer = setTimeout(poll, 5000)
      } catch (e) { if (e instanceof RequestError && e.status === 401) setView('signin'); else if (++tries < 24) timer = setTimeout(poll, 5000) }
    }
    ;(async () => {
      try {
        const r = await readJson<{ payment: Pay }>(await authFetch('/api/client/payments/return', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: ours, provider_reference: provider, outcome: cancelled ? 'cancelled' : 'returned' }) }))
        setView(r.payment.status === 'redirected' ? 'pending_verification' : r.payment.status)
        if (r.payment.status === 'pending_verification') timer = setTimeout(poll, 5000)
      } catch (e) {
        if (e instanceof RequestError && e.status === 401) setView('signin')
        else if (e instanceof RequestError && e.status === 400) setView('notfound')
        else timer = setTimeout(poll, 3000)
      }
    })()
    return () => { if (timer) clearTimeout(timer) }
  }, [q])

  const refLine = ref ? <p className="mt-2 font-mono text-[12px] text-fg-faint">{t('pay.ref', { ref })}</p> : null
  const dash = <Link href="/dashboard#premium" className="btn btn-solid min-h-[44px]">{t('pay.toDashboard')}</Link>
  const retry = <Link href="/dashboard#premium" className="btn btn-outline min-h-[44px]">{t('pay.retry')}</Link>
  if (view === 'loading') return <PaymentShell tone="info" title={t('pay.verifying')} body={<><p className="flex justify-center"><Spinner /></p><p className="mt-2">{t('pay.verifyingBody')}</p></>} />
  if (view === 'signin') return <PaymentShell tone="info" title={t('pay.signIn')}><Link href="/sign-in" className="btn btn-solid min-h-[44px]">{t('pay.signIn')}</Link></PaymentShell>
  if (view === 'notfound') return <PaymentShell tone="warn" title={t('pay.notFound')}>{dash}</PaymentShell>
  if (view === 'successful') return <PaymentShell tone="ok" title={t('pay.successTitle')} body={<><p>{t('pay.successBody')}</p>{refLine}</>}>{dash}</PaymentShell>
  if (view === 'failed') return <PaymentShell tone="error" title={t('pay.failedTitle')} body={<><p>{t('pay.failedBody')}</p>{refLine}</>}>{retry}{dash}</PaymentShell>
  if (view === 'cancelled') return <PaymentShell tone="warn" title={t('pay.cancelledTitle')} body={<><p>{t('pay.cancelledBody')}</p>{refLine}</>}>{retry}{dash}</PaymentShell>
  if (view === 'expired') return <PaymentShell tone="warn" title={t('pay.expiredTitle')} body={<><p>{t('pay.expiredBody')}</p>{refLine}</>}>{retry}{dash}</PaymentShell>
  return <PaymentShell tone="info" title={t('pay.pendingTitle')} body={<><p className="flex justify-center mb-2"><Spinner /></p><p>{t('pay.pendingBody')}</p>{refLine}</>}>{dash}</PaymentShell>
}
export default function Page() { return <Suspense fallback={null}><Return /></Suspense> }
