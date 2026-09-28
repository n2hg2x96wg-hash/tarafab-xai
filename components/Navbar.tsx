'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { IconClose, IconMenu, Logo } from '@/components/Icons'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'

const navLinks: { label: TKey; href: string }[] = [
  { label: 'nav.platform', href: '#platform' },
  { label: 'nav.markets', href: '#markets' },
  { label: 'nav.howItWorks', href: '#how-it-works' },
  { label: 'nav.howDeposits', href: '#how-deposits-work' },
  { label: 'nav.security', href: '#security' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-ink-950 border-b transition-colors duration-200 ${scrolled || mobileOpen ? 'border-ink-700' : 'border-transparent'}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" aria-label={t('common.home')} className="shrink-0"><Logo /></Link>

          <div className="hidden lg:flex items-center gap-7 min-w-0">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} className="text-sm text-fg-muted hover:text-fg transition-colors whitespace-nowrap">
                {t(link.label)}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <ThemeSelector />
            <LanguageSelector />
            <Link href="/sign-in" className="btn btn-sm btn-outline">{t('common.signIn')}</Link>
            <Link href="/sign-up" className="btn btn-sm btn-solid">{t('common.openAccountShort')}</Link>
          </div>

          <button
            className="md:hidden p-2 -mr-2 text-fg-muted hover:text-fg"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? t('common.closeMenu') : t('common.openMenu')}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-ink-700 bg-ink-950 px-4 pb-5 pt-2 max-h-[calc(100dvh-4rem)] overflow-y-auto">
          <div className="flex flex-col">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="py-3 text-[15px] text-fg-muted hover:text-fg border-b border-ink-800">
                {t(link.label)}
              </a>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Link href="/sign-in" onClick={() => setMobileOpen(false)} className="btn btn-outline min-w-0">{t('common.signIn')}</Link>
            <Link href="/sign-up" onClick={() => setMobileOpen(false)} className="btn btn-solid min-w-0">{t('common.openAccountShort')}</Link>
          </div>
          <LanguageSelector variant="list" className="pt-5" />
          <ThemeSelector variant="list" className="pt-5" />
        </div>
      )}
    </nav>
  )
}
