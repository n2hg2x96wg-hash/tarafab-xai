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
  const [active, setActive] = useState('')
  const { t } = useI18n()

  // Marks the section in view (aria-current) so the visitor sees where they
  // are. Sections that mount later (lazy) are picked up on the next check.
  useEffect(() => {
    const ids = navLinks.map(l => l.href.slice(1))
    let raf = 0
    const check = () => {
      raf = 0
      const line = 96
      let cur = ''
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line && el.getBoundingClientRect().bottom > line) cur = id
      }
      setActive(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // While the phone menu is open: Escape closes it and the page behind it
  // does not scroll. Both are undone when it closes or the navbar unmounts.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [mobileOpen])

  return (
    <>
    {/* Tapping anywhere outside the open phone menu closes it. */}
    {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-in" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <nav className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200 safe-top ${scrolled || mobileOpen ? 'glass-bar border-ink-700/80' : 'bg-ink-950 border-transparent'}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" aria-label={t('common.home')} className="shrink-0"><Logo /></Link>

          <div className="hidden lg:flex items-center gap-7 min-w-0">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} aria-current={active === link.href.slice(1) ? 'true' : undefined} className="ex-nav-link text-sm text-fg-muted hover:text-fg transition-colors whitespace-nowrap">
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
            className="md:hidden p-2.5 -mr-2.5 text-fg-muted hover:text-fg"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? t('common.closeMenu') : t('common.openMenu')}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden rise-in border-t border-ink-700 bg-ink-950 px-4 pb-5 pt-2 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain safe-bottom">
          <div className="flex flex-col">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)} aria-current={active === link.href.slice(1) ? 'true' : undefined} className="py-3 min-h-11 text-[15px] text-fg-muted hover:text-fg aria-[current=true]:text-fg border-b border-ink-800">
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
    </>
  )
}
