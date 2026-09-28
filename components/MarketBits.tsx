'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { timeAgoT } from '@/lib/i18n/format'
import type { SummaryStatus } from '@/components/useMarket'

// A price that eases up or down when a new real value arrives: a brief
// colour tint and a 2px nudge in the direction of the move. It never
// animates on first render and does nothing under prefers-reduced-motion.
export function AnimatedPrice({ value, format, className = '' }: { value: number; format: (n: number) => string; className?: string }) {
  const prev = useRef<number | null>(null)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (prev.current !== null && value !== prev.current) {
      setDir(value > prev.current ? 'up' : 'down')
      setTick(n => n + 1)
    }
    prev.current = value
  }, [value])
  return (
    <span key={tick} className={`inline-block tabular-nums ${dir === 'up' ? 'price-tick-up' : dir === 'down' ? 'price-tick-down' : ''} ${className}`}>
      {format(value)}
    </span>
  )
}

// "Updated just now" while live; "Last updated 4 min ago" when delayed.
export function freshnessText(t: ReturnType<typeof useI18n>['t'], status: SummaryStatus, at: number | null) {
  if (!at) return status === 'error' ? t('market.unavailable') : t('common.loading')
  const ago = timeAgoT(t, at)
  return status === 'stale' ? t('common.lastUpdated', { time: ago }) : t('common.updated', { time: ago })
}

// Re-render every few seconds so "x ago" stays accurate.
export function useNow(ms = 15_000) {
  const [, setN] = useState(0)
  useEffect(() => { const id = setInterval(() => setN(n => n + 1), ms); return () => clearInterval(id) }, [ms])
}
