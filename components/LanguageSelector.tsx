'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { LOCALES } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { IconCheck, IconChevronDown, IconGlobe } from '@/components/Icons'

type Props = {
  // "menu": button with a popover (headers, sidebars).
  // "list": all languages inline (mobile drawer), no popover to clip or overflow.
  variant?: 'menu' | 'list'
  // Which way the popover opens from the button.
  align?: 'left' | 'right'
  direction?: 'down' | 'up'
  className?: string
}

export function LanguageSelector({ variant = 'menu', align = 'right', direction = 'down', className = '' }: Props) {
  const { locale, setLocale, t } = useI18n()
  const current = LOCALES.find(l => l.code === locale) ?? LOCALES[0]

  if (variant === 'list') {
    return (
      <div className={className}>
        <p id="lang-list-label" className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-faint mb-2">{t('common.language')}</p>
        <div role="radiogroup" aria-labelledby="lang-list-label" className="grid grid-cols-2 gap-2">
          {LOCALES.map(l => {
            const on = l.code === locale
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={on}
                lang={l.code}
                onClick={() => setLocale(l.code)}
                className={`flex items-center gap-2 min-w-0 h-11 px-3 rounded-md border text-left text-[14px] transition-colors ${on ? 'border-brand-400/60 bg-brand-500/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg hover:border-ink-500'}`}
              >
                <span className={`shrink-0 text-[11px] font-semibold tabular-nums w-6 ${on ? 'text-brand-300' : 'text-fg-faint'}`}>{l.label}</span>
                <span className="truncate">{l.name}</span>
                {on && <IconCheck width={15} height={15} className="ml-auto shrink-0 text-brand-300" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return <LanguageMenu current={current} align={align} direction={direction} className={className} />
}

function LanguageMenu({ current, align, direction, className }: { current: (typeof LOCALES)[number]; align: 'left' | 'right'; direction: 'down' | 'up'; className: string }) {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    // Focus the selected option so arrow keys start from it.
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t('common.language')}: ${current.name}`}
        className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border text-[13px] transition-colors ${open ? 'border-brand-400/50 bg-ink-850 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg hover:border-ink-500'}`}
      >
        <IconGlobe width={15} height={15} aria-hidden="true" />
        <span className="font-semibold tabular-nums">{current.label}</span>
        <IconChevronDown width={13} height={13} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={listId}
          role="menu"
          aria-label={t('common.language')}
          onKeyDown={onListKey}
          className={`absolute z-[60] w-52 max-w-[calc(100vw-2rem)] p-1 rounded-lg border border-ink-600 bg-ink-900 shadow-[0_18px_40px_-12px_rgba(0,0,0,.85)] ${align === 'right' ? 'right-0' : 'left-0'} ${direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint">{t('common.language')}</p>
          {LOCALES.map(l => {
            const on = l.code === locale
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                lang={l.code}
                onClick={() => { setLocale(l.code); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 h-10 px-2.5 rounded-md text-left text-[14px] transition-colors focus:outline-none focus-visible:bg-ink-800 ${on ? 'bg-brand-500/10 text-fg' : 'text-fg-muted hover:bg-ink-850 hover:text-fg'}`}
              >
                <span className={`text-[11px] font-semibold w-6 ${on ? 'text-brand-300' : 'text-fg-faint'}`}>{l.label}</span>
                <span className="flex-1 truncate">{l.name}</span>
                {on && <IconCheck width={15} height={15} className="text-brand-300" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
