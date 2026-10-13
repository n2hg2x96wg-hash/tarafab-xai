'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { callingCode } from '@/lib/phone'

type Catalog = typeof import('@/lib/countryCatalog')
type Option = { code: string; name: string; dial: string }

// Country flag from its ISO code (regional indicator letters).
const flag = (iso: string) => iso.length === 2 ? String.fromCodePoint(...iso.toUpperCase().split('').map(c => 0x1f1a5 + c.charCodeAt(0))) : ''

// Phone number with a country calling-code selector. Every country with a
// calling code is listed; search by name or code ("Nigeria", "+234", "234").
// The selector opens inside the form, so it works the same on a phone and a
// desktop and never covers the rest of the page.
export function PhoneInput({ id, country, onCountry, number, onNumber, disabled, error, describedBy }: {
  id: string
  country: string
  onCountry: (iso: string) => void
  number: string
  onNumber: (v: string) => void
  disabled?: boolean
  error?: string
  describedBy?: string
}) {
  const { t } = useI18n()
  const uid = useId().replace(/:/g, '')
  const [cat, setCat] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const load = () => { setFailed(false); import('@/lib/countryCatalog').then(setCat).catch(() => setFailed(true)) }
  useEffect(load, [])

  const options: Option[] = useMemo(() => {
    if (!cat) return []
    const digits = q.replace(/\D/g, '')
    const pool = digits ? cat.allCountries() : cat.searchCountries(q)
    return pool.map(c => ({ code: c.code, name: c.name, dial: callingCode(c.code) || '' }))
      .filter(o => o.dial && (!digits || o.dial.slice(1).startsWith(digits)))
  }, [cat, q])
  useEffect(() => { setActive(0); if (list.current) list.current.scrollTop = 0 }, [q])
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  const dial = callingCode(country)
  const pick = (o: Option) => { onCountry(o.code); setOpen(false); setQ(''); requestAnimationFrame(() => document.getElementById(id)?.focus()) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) pick(options[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); button.current?.focus() }
  }
  const optId = (i: number) => `${uid}-opt-${i}`
  const errId = error ? `${id}-error` : undefined

  return (
    <div data-phone-input>
      <div className="flex gap-2">
        <button ref={button} type="button" disabled={disabled} onClick={() => { setOpen(o => !o); setQ('') }}
          className={`field !w-auto shrink-0 flex items-center gap-1.5 pr-2.5 ${error && !dial ? 'field-error' : ''}`}
          aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
          aria-label={dial ? `${t('auth.phoneCode')}: ${cat?.findCountry(country)?.name || country} ${dial}` : t('auth.phoneCode')} data-phone-code>
          {dial ? <><span aria-hidden="true">{flag(country)}</span><span className="tabular-nums text-fg">{dial}</span></> : <span className="text-fg-faint">{t('auth.phoneCodeShort')}</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={number} disabled={disabled}
          onChange={e => onNumber(e.target.value.replace(/[^\d+()\-.\s]/g, '').slice(0, 24))}
          placeholder={t('auth.phonePlaceholder')} className={`field min-w-0 flex-1 tabular-nums ${error ? 'field-error' : ''}`}
          aria-invalid={error ? true : undefined} aria-describedby={[errId, describedBy].filter(Boolean).join(' ') || undefined} data-phone-number />
      </div>
      {open && (
        <div id={`${uid}-panel`} className="mt-2 rounded-xl border border-ink-700 bg-ink-950/60 p-2" data-phone-panel>
          <label htmlFor={`${uid}-search`} className="sr-only">{t('auth.phoneSearch')}</label>
          <input id={`${uid}-search`} type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={t('auth.phoneSearch')} autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus enterKeyHint="search"
            role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list"
            aria-activedescendant={options.length ? optId(active) : undefined} className="field" data-phone-search />
          {!cat ? (
            <p className="px-2.5 py-3 text-[13px] text-fg-faint" role="status">
              {failed ? <button type="button" className="underline underline-offset-2" onClick={load}>{t('auth.phoneRetry')}</button> : t('auth.phoneLoading')}
            </p>
          ) : (
            <ul ref={list} id={`${uid}-list`} role="listbox" aria-label={t('auth.phoneCode')} className="mt-2 max-h-[min(280px,40dvh)] overflow-y-auto overscroll-contain" data-phone-list>
              {options.map((o, i) => (
                <li key={o.code} id={optId(i)} role="option" aria-selected={o.code === country} data-index={i} data-phone-option={o.code}
                  onMouseMove={() => setActive(i)} onClick={() => pick(o)}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 cursor-pointer text-[14.5px] ${i === active ? 'bg-[rgb(var(--contrast)/.07)]' : ''} ${o.code === country ? 'text-fg' : 'text-fg-muted'}`}>
                  <span aria-hidden="true">{flag(o.code)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="shrink-0 tabular-nums text-fg-faint">{o.dial}</span>
                </li>
              ))}
              {options.length === 0 && <li role="presentation" className="px-2.5 py-3 text-[13px] text-fg-faint">{t('auth.phoneNoMatch')}</li>}
            </ul>
          )}
        </div>
      )}
      {error && <p id={errId} role="alert" className="text-xs text-danger-400 mt-1.5" data-phone-error>{error}</p>}
    </div>
  )
}
