'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type Source = 'Coinbase Exchange' | 'CoinGecko'

export interface Summary {
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24hUsd: number
  updatedAt: string
  source: Source
}

export type HistoryRange = '1' | '7' | '30' | '365' | '1825'
export interface History { range: HistoryRange; points: [number, number][]; source: Source }

// Successful history responses only; a failure is never remembered, so the
// next attempt always goes back to the network.
const historyCache = new Map<HistoryRange, { history: History; fetchedAt: number }>()

async function load<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body as T
}

export type SummaryStatus = 'loading' | 'live' | 'stale' | 'error'

export function useBtcSummary(refreshMs = 30_000) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [status, setStatus] = useState<SummaryStatus>('loading')
  const hasData = useRef(false)

  const run = useCallback(async () => {
    try {
      const { summary } = await load<{ summary: Summary }>('/api/market/btc/summary')
      setSummary(summary)
      setFetchedAt(Date.now())
      setStatus('live')
      hasData.current = true
    } catch {
      // Keep showing the last good figures, clearly marked as delayed.
      setStatus(hasData.current ? 'stale' : 'error')
    }
  }, [])

  const retry = useCallback(() => {
    if (!hasData.current) setStatus('loading')
    run()
  }, [run])

  useEffect(() => {
    run()
    const t = setInterval(run, refreshMs)
    return () => clearInterval(t)
  }, [run, refreshMs])

  return { summary, fetchedAt, status, retry }
}

export type HistoryStatus = 'loading' | 'ready' | 'error'

export function useBtcHistory(range: HistoryRange) {
  const cached = historyCache.get(range)
  const [state, setState] = useState<{ range: HistoryRange; history: History | null; fetchedAt: number | null; status: HistoryStatus }>(
    cached ? { range, ...cached, status: 'ready' } : { range, history: null, fetchedAt: null, status: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const hit = historyCache.get(range)
    if (hit && attempt === 0) {
      setState({ range, ...hit, status: 'ready' })
      return
    }
    let alive = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    setState(s => ({ range, history: s.range === range ? s.history : null, fetchedAt: s.range === range ? s.fetchedAt : null, status: 'loading' }))

    const go = async (autoRetry: boolean) => {
      try {
        const { history } = await load<{ history: History }>(`/api/market/btc/history?range=${range}`)
        const entry = { history, fetchedAt: Date.now() }
        historyCache.set(range, entry)
        if (alive) setState({ range, ...entry, status: 'ready' })
      } catch {
        if (!alive) return
        // One quiet retry covers a brief upstream blip before showing an error.
        if (autoRetry) retryTimer = setTimeout(() => go(false), 2500)
        else setState(s => ({ ...s, range, status: 'error' }))
      }
    }
    go(true)
    return () => { alive = false; if (retryTimer) clearTimeout(retryTimer) }
  }, [range, attempt])

  const retry = useCallback(() => {
    historyCache.delete(range)
    setAttempt(a => a + 1)
  }, [range])

  const current = state.range === range ? state : { range, history: null, fetchedAt: null, status: 'loading' as const }
  return { ...current, retry }
}

export function timeAgo(ms: number | null, now = Date.now()) {
  if (!ms) return ''
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function compactUsd(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${Math.round(n).toLocaleString('en-US')}`
}
