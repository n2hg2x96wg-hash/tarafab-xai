'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CatalogCountry } from '@/lib/countryCatalog'

type Catalog = typeof import('@/lib/countryCatalog')

// Searchable country list for the bank-account form. Every country is
// listed (lib/countryCatalog); `isAvailable` says which ones bank
// withdrawals can actually be paid to. "My country is not listed" stays the
// last option. The list opens inside the form (not another dialog), so the
// sheet's focus handling and scrolling stay as they are.
export const NOT_LISTED = 'other'

export function CountryPicker({ value, onChange, isAvailable, disabled, invalid, describedBy }: {
  value: string
  onChange: (code: string, country: CatalogCountry | null) => void
  isAvailable: (c: CatalogCountry) => boolean
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}) {
  const uid = useId().replace(/:/g, '')
  const [cat, setCat] = useState<Catalog | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const load = () => {
    setLoadFailed(false)
    import('@/lib/countryCatalog').then(setCat).catch(e => { console.error('Country list could not be loaded', e); setLoadFailed(true) })
  }
  useEffect(load, [])

  const results = useMemo(() => (cat ? cat.searchCountries(q) : []), [cat, q])
  // Options: the matches, then "My country is not listed".
  const count = results.length + 1
  // A new search starts at the best match, at the top of the list.
  useEffect(() => { setActive(0); if (list.current) list.current.scrollTop = 0 }, [q])
  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const selected = value && value !== NOT_LISTED ? cat?.findCountry(value) : undefined
  const shown = value === NOT_LISTED ? 'My country is not listed' : selected ? cat!.countryLabel(selected) : value && !cat ? value : ''

  const pick = (i: number) => {
    if (i >= results.length) onChange(NOT_LISTED, null)
    else onChange(results[i].code, results[i])
    setOpen(false); setQ('')
    requestAnimationFrame(() => button.current?.focus())
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(count - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(count - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active) }
    // Closes the list only, not the sheet around it.
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); button.current?.focus() }
  }

  const optId = (i: number) => `${uid}-opt-${i}`
  const optCls = (i: number, on: boolean) => `flex items-center gap-2 rounded-lg px-2.5 py-2.5 cursor-pointer text-[14.5px] ${i === active ? 'bg-[rgb(var(--contrast)/.07)]' : ''} ${on ? 'text-fg' : 'text-fg-muted'}`

  return (
    <div data-country-picker>
      <button ref={button} type="button" id="bk-country" name="country" value={value}
        className={`field text-left flex items-center gap-2 ${invalid ? 'field-error' : ''}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
        aria-labelledby="bk-country-label bk-country" aria-describedby={describedBy}
        onClick={() => { setOpen(o => !o); setQ('') }} data-country-trigger>
        <span className={`min-w-0 flex-1 truncate ${shown ? 'text-fg' : 'text-fg-faint'}`} data-country-value>{shown || 'Choose a country'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-fg-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div id={`${uid}-panel`} className="mt-2 rounded-xl border border-ink-700 bg-ink-950/60 p-2" data-country-panel>
          <label htmlFor={`${uid}-search`} className="sr-only">Search countries</label>
          <input id={`${uid}-search`} type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search countries" autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus enterKeyHint="search"
            role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list"
            aria-activedescendant={cat ? optId(active) : undefined} className="field" data-country-search />
          {!cat ? (
            <p className="px-2.5 py-3 text-[13px] text-fg-faint" role="status">
              {loadFailed ? <>The country list could not be loaded. <button type="button" className="underline underline-offset-2" onClick={load}>Try again</button></> : 'Loading countries…'}
            </p>
          ) : (
            <ul ref={list} id={`${uid}-list`} role="listbox" aria-label="Countries" className="mt-2 max-h-[min(300px,42dvh)] overflow-y-auto overscroll-contain" data-country-list>
              {results.map((c, i) => {
                const on = c.code === value
                const avail = isAvailable(c)
                return (
                  <li key={c.code} id={optId(i)} role="option" aria-selected={on} data-index={i} data-country-option={c.code}
                    className={optCls(i, on)} onMouseMove={() => setActive(i)} onClick={() => pick(i)}>
                    <span className="min-w-0 flex-1 truncate">{c.name} <span className="text-fg-faint">· {cat.currencyText(c)}</span></span>
                    {avail && <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-[11px] text-emerald-300" data-country-available>Available</span>}
                    {on && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="shrink-0 text-accent" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
                  </li>
                )
              })}
              {results.length === 0 && (
                <li role="presentation" className="px-2.5 py-3 text-[13px] text-fg-faint" data-country-empty>No country matches “{q.trim()}”.</li>
              )}
              <li id={optId(results.length)} role="option" aria-selected={value === NOT_LISTED} data-index={results.length} data-country-option={NOT_LISTED}
                className={`${optCls(results.length, value === NOT_LISTED)} border-t border-ink-700 mt-1`} onMouseMove={() => setActive(results.length)} onClick={() => pick(results.length)}>
                My country is not listed
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
