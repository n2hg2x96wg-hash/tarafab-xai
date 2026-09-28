'use client'

import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'

export function RouteError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => { console.error(error) }, [error])
  const { t } = useI18n()
  return (
    <div className="site min-h-screen bg-ink-950 text-fg flex items-center justify-center px-4">
      <div className="panel max-w-md w-full p-6 sm:p-8">
        <h1 className="text-lg font-semibold mb-2">{t('errors.pageProblem')}</h1>
        <p className="text-sm text-fg-muted mb-6">{t('errors.pageProblemBody')}</p>
        <div className="flex gap-3">
          <button onClick={reset} className="btn btn-solid">{t('common.tryAgain')}</button>
          <a href={home} className="btn btn-outline">{t('common.goBack')}</a>
        </div>
      </div>
    </div>
  )
}
