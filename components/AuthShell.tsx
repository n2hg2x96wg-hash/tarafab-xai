'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconAlert, Logo } from '@/components/Icons'
import { LanguageSelector } from '@/components/LanguageSelector'
import { useI18n } from '@/lib/i18n/I18nProvider'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="site min-h-screen bg-ink-950 text-fg flex flex-col">
      <header className="h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-ink-700">
        <Link href="/" aria-label={t('common.home')}><Logo /></Link>
        <LanguageSelector />
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-fg-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-fg-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="alert alert-danger">
      <IconAlert className="shrink-0 mt-px" width={16} height={16} />
      <span>{message}</span>
    </div>
  )
}

export function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden="true" />
}
