'use client'

import { useEffect, useId, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Text size: Standard or Large, saved on this device. Large raises the
// interface's small text sizes (see html[data-text="large"] in globals.css);
// it changes no layout widths, so nothing overflows on a phone.
const KEY = 'tf_text_size'
export function TextSizeSelector() {
  const { t } = useI18n()
  const id = useId()
  const [size, setSize] = useState<'standard' | 'large'>('standard')
  useEffect(() => { setSize(document.documentElement.getAttribute('data-text') === 'large' ? 'large' : 'standard') }, [])
  const choose = (v: 'standard' | 'large') => {
    setSize(v)
    if (v === 'large') document.documentElement.setAttribute('data-text', 'large')
    else document.documentElement.removeAttribute('data-text')
    try { localStorage.setItem(KEY, v) } catch { /* private mode: applies for this visit only */ }
  }
  return (
    <div>
      <p id={`${id}-l`} className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-faint mb-2">{t('prefs.textSize')}</p>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid grid-cols-2 gap-2" data-text-size>
        {(['standard', 'large'] as const).map(v => {
          const on = size === v
          return (
            <button key={v} type="button" role="radio" aria-checked={on} onClick={() => choose(v)} data-text-option={v}
              className={`flex flex-col items-center justify-center gap-1 min-h-[64px] px-2 rounded-md border transition-colors ${on ? 'border-brand-400/60 bg-brand-500/10 text-fg' : 'border-ink-700 text-fg-muted hover:text-fg hover:border-ink-500'}`}>
              <span aria-hidden="true" className={v === 'large' ? 'text-[20px] font-semibold leading-none' : 'text-[15px] font-semibold leading-none'}>Aa</span>
              <span className="text-[13px]">{t(v === 'large' ? 'prefs.textLarge' : 'prefs.textStandard')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
