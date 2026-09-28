'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTheme, type ThemePreference } from '@/lib/theme/ThemeProvider'
import { useI18n, type TKey } from '@/lib/i18n/I18nProvider'
import { IconCheck, IconMonitor, IconMoon, IconSun } from '@/components/Icons'

const OPTIONS: { value: ThemePreference; label: TKey; Icon: typeof IconSun }[] = [
  { value: 'system', label: 'theme.system', Icon: IconMonitor },
  { value: 'light', label: 'theme.light', Icon: IconSun },
  { value: 'dark', label: 'theme.dark', Icon: IconMoon },
]

// Appearance only. Language has its own selector; the two are never combined.
//  "menu": icon button with a small popover (headers, sidebars)
//  "list": the three choices inline as radios (mobile drawer, settings pages)
export function ThemeSelector({ variant = 'menu', align = 'right', direction = 'down', className = '' }: {
  variant?: 'menu' | 'list'; align?: 'left' | 'right'; direction?: 'down' | 'up'; className?: string
}) {
  const { preference, resolved, setPreference } = useTheme()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (variant === 'list') {
    return (
      <div className={className}>
        <p id={`${id}-l`} className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-faint mb-2">{t('theme.appearance')}</p>
        <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ value, label, Icon }) => {
            const on = preference === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPreference(value)}
                className={`flex flex-col items-center justify-center gap-1.5 min-h-[64px] px-2 rounded-md border text-[13px] transition-colors ${on ? 'border-brand-400/60 bg-brand-500/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg hover:border-ink-500'}`}
              >
                <Icon width={18} height={18} aria-hidden="true" className={on ? 'text-brand-300' : ''} />
                <span className="text-center leading-tight">{t(label)}</span>
              </button>
            )
          })}
        </div>
        {preference === 'system' && <p className="text-xs text-fg-faint mt-2">{t('theme.systemHint')}</p>}
      </div>
    )
  }

  const CurrentIcon = resolved === 'light' ? IconSun : IconMoon
  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-m`}
        aria-label={`${t('theme.appearance')}: ${t(OPTIONS.find(o => o.value === preference)!.label)}`}
        data-testid="theme-button"
        className={`inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${open ? 'border-brand-400/50 bg-ink-850 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg hover:border-ink-500'}`}
      >
        <CurrentIcon width={16} height={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${id}-m`}
          role="menu"
          aria-label={t('theme.appearance')}
          className={`absolute z-[60] w-48 max-w-[calc(100vw-2rem)] p-1 rounded-lg border border-ink-600 bg-ink-900 shadow-[0_18px_40px_-12px_rgb(var(--shadow)/.5)] ${align === 'right' ? 'right-0' : 'left-0'} ${direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint">{t('theme.appearance')}</p>
          {OPTIONS.map(({ value, label, Icon }) => {
            const on = preference === value
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { setPreference(value); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 h-10 px-2.5 rounded-md text-left text-[14px] transition-colors focus:outline-none focus-visible:bg-ink-800 ${on ? 'bg-brand-500/10 text-fg' : 'text-fg-muted hover:bg-ink-850 hover:text-fg'}`}
              >
                <Icon width={16} height={16} aria-hidden="true" className={on ? 'text-brand-300' : 'text-fg-faint'} />
                <span className="flex-1">{t(label)}</span>
                {on && <IconCheck width={15} height={15} className="text-brand-300" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
