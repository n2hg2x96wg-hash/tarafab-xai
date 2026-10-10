'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useHideChat } from '@/lib/chatAside'

export type CommandItem = { id: string; label: string; group: string; icon: ComponentType<SVGProps<SVGSVGElement>> }

// Keyboard-first navigation for the dashboard: Cmd/Ctrl+K opens it, typing
// narrows the list, arrows move, Enter goes. It lists the same sections as the
// menu (hidden sections are never offered), so it cannot reach anything the
// client could not reach by tapping.
export function CommandSearch({ items, open, onOpenChange, onGo }: {
  items: CommandItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onGo: (id: string) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  // Global shortcut. One listener for the life of the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])
  useHideChat(open)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery(''); setActive(0)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prev
      returnFocus.current?.focus?.()
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
  }, [items, query])

  if (!open) return null

  const choose = (item?: CommandItem) => {
    if (!item) return
    onOpenChange(false)
    onGo(item.id)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label={t('cmd.title')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] backdrop-in" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div className="relative w-full max-w-lg glass-panel rounded-2xl overflow-hidden rise-in" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 border-b border-ink-700">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="shrink-0 text-fg-faint" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0) }}
            placeholder={t('cmd.placeholder')}
            className="flex-1 min-w-0 h-14 bg-transparent outline-none text-[16px] text-fg placeholder:text-fg-faint"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          />
          <kbd className="hidden sm:inline text-[11px] text-fg-faint border border-ink-600 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="cmd-results" role="listbox" className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-fg-muted">{t('cmd.none')}</li>}
          {results.map((item, i) => {
            const I = item.icon
            return (
              <li
                key={item.id}
                id={`cmd-${item.id}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={`flex items-center gap-3 px-3 min-h-11 rounded-lg cursor-pointer text-sm ${i === active ? 'bg-ink-800 text-fg' : 'text-fg-muted'}`}
              >
                <I width={17} height={17} aria-hidden="true" className="shrink-0" />
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
                <span className="text-[11px] text-fg-faint shrink-0">{item.group}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
