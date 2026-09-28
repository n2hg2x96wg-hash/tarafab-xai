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
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
    if (!body || typeof body !== 'object') throw new Error('Malformed market data')
    return body as T
  } finally {
    clearTimeout(t)
  }
}

// Every widget on a page shares one summary request: calls within a few
// seconds of each other reuse the same response.
let summaryShared: { at: number; promise: Promise<{ summary: Summary }> } | null = null
function sharedSummary() {
  const now = Date.now()
  if (summaryShared && now - summaryShared.at < 5_000) return summaryShared.promise
  const promise = load<{ summary: Summary }>('/api/market/btc/summary')
  promise.catch(() => { if (summaryShared?.promise === promise) summaryShared = null })
  summaryShared = { at: now, promise }
  return promise
}

export type SummaryStatus = 'loading' | 'live' | 'stale' | 'error'

export function useBtcSummary(refreshMs = 30_000) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [status, setStatus] = useState<SummaryStatus>('loading')
  const hasData = useRef(false)

  const failures = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alive = useRef(true)

  const run = useCallback(async () => {
    try {
      const { summary } = await sharedSummary()
      if (!alive.current) return
      setSummary(summary)
      setFetchedAt(Date.now())
      setStatus('live')
      hasData.current = true
      failures.current = 0
    } catch {
      if (!alive.current) return
      // Keep showing the last good figures, clearly marked as delayed.
      setStatus(hasData.current ? 'stale' : 'error')
      failures.current += 1
    }
  }, [])

  // Polls on a timer that backs off after failures (up to 5 minutes) and
  // skips while the tab is hidden, resuming as soon as it is visible again.
  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    const delay = Math.min(refreshMs * 2 ** failures.current, 300_000)
    timer.current = setTimeout(async () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') await run()
      if (alive.current) schedule()
    }, delay)
  }, [run, refreshMs])

  const retry = useCallback(() => {
    if (!hasData.current) setStatus('loading')
    failures.current = 0
    run().then(() => { if (alive.current) schedule() })
  }, [run, schedule])

  useEffect(() => {
    alive.current = true
    run().then(() => { if (alive.current) schedule() })
    const onVisible = () => {
      if (document.visibilityState === 'visible') { failures.current = 0; run(); schedule() }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run, schedule])

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
