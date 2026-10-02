'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { premiumText } from '@/lib/i18n/premium'
import { PaymentShell } from '@/components/payment/PaymentShell'

// Shown instead of the payment page when the server did not allow it. The
// payment destination is never part of this page.
function Unavailable() {
  const { locale } = useI18n()
  const t = (k: string) => premiumText(locale, k)
  const router = useRouter()
  const reason = useSearchParams().get('reason')
  const [title, body] = reason === 'region' ? [t('pay.regionTitle'), t('pay.regionBody')]
    : reason === 'unknown' ? [t('pay.unknownTitle'), t('pay.unknownBody')]
    : [t('pay.disabledTitle'), t('pay.disabledBody')]
  return (
    <PaymentShell tone="warn" title={title} body={<p>{body}</p>}>
      <button onClick={() => (history.length > 1 ? router.back() : router.push('/dashboard#premium'))} className="btn btn-outline min-h-[44px]">{t('pay.back')}</button>
      <Link href="/" className="btn btn-solid min-h-[44px]">{t('pay.home')}</Link>
    </PaymentShell>
  )
}
export default function Page() { return <Suspense fallback={null}><Unavailable /></Suspense> }
