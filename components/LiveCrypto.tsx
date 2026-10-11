'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAssets } from '@/components/markets/assetStore'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { ageLabel, effectiveState } from '@/lib/marketStatus'

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

// The landing hero reads Bitcoin from the same shared snapshot as this ticker
// and the market board (components/markets/assetStore: useBtcQuote), so every
// price and status label on the page agrees.

function Change({ value, className = '' }: { value: number | null; className?: string }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <span className={`tabular-nums font-medium ${up ? 'price-up' : 'price-down'} ${className}`}>
      {up ? '+' : '-'}{Math.abs(value).toFixed(2)}%
    </span>
  )
}

type TickerRow = {
  asset: { symbol: string; name: string }
  quote: { price: number | null; change24h: number | null; status: 'live' | 'delayed' | 'stale' | 'unavailable' }
  at?: string | null
}

export function LiveTickerBar() {
  const { t } = useI18n()
  // Shares the page's single /api/market/assets snapshot (no second request).
  const { assets, error, now } = useAssets()
  // Only real quotes; unavailable assets are left out. Labels follow the
  // shared status rule (lib/marketStatus): a quote whose provider time is
  // old, or shown after a failed refresh, reads STALE with its age.
  const rows: TickerRow[] = useMemo(() => (assets || [])
    .filter(a => typeof a?.id === 'string' && typeof a?.name === 'string' && a.price != null && Number.isFinite(a.price) && a.price > 0)
    .map(a => ({ a, st: effectiveState(a, error, now) }))
    .filter(x => x.st !== 'unavailable')
    .map(({ a, st }) => ({ asset: { symbol: a.id, name: a.name }, quote: { price: a.price, change24h: a.changePct, status: st as 'live' | 'delayed' | 'stale' }, at: a.updatedAt })), [assets, error, now])

  // Age of a quote that is not live, from its own provider timestamp.
  const age = (iso: string | null | undefined) => ageLabel(iso, now)
  const renderItems = (copy: number) => rows.map(({ asset, quote, at }) => (
    <div key={`${copy}-${asset.symbol}`} className="flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 shrink-0 text-[12px] sm:text-[12.5px]">
      <span className="text-fg-muted">{asset.name}</span>
      <span className="text-fg-faint">{asset.symbol}</span>
      <span className="text-fg font-medium tabular-nums">{usd(quote.price!)}</span>
      <Change value={quote.change24h} />
      <span className={`text-[10px] uppercase tracking-wide ${quote.status === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
        {quote.status === 'live' ? t('status.live') : quote.status === 'stale' ? t('status.stale') : t('status.delayed')}{quote.status !== 'live' && age(at) ? <span className="normal-case tracking-normal text-fg-faint"> · {age(at)}</span> : null}
      </span>
    </div>
  ))

  return (
    <div className="relative overflow-hidden border-b border-ink-700 bg-ink-900/80 h-9 flex items-center marquee-mask" aria-label={t('market.livePrices')} data-ticker>
      <div className={`flex w-max ${rows.length > 1 ? 'animate-marquee' : ''}`}>
        {rows.length ? <>{renderItems(0)}<div className="flex" aria-hidden="true">{renderItems(1)}</div></>
          : assets === null && !error ? <span className="mx-5 inline-block h-3 w-64 rounded skeleton-sheen" aria-hidden="true" />
          : <span className="px-5 text-[12px] text-fg-faint" role="status">{t('market.tickerUnavailable')}</span>}
      </div>
    </div>
  )
}

interface Block { id: string; height: number; timestamp: number; tx_count: number; size: number; extras?: { pool?: { name?: string } } }

function timeAgo(t: ReturnType<typeof useI18n>['t'], ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return t('common.secondsAgo', { n: s })
  if (s < 3600) return t('common.minutesAgo', { n: Math.floor(s / 60) })
  return t('common.hoursMinutesAgo', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) })
}

export function LatestBlocks() {
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [fees, setFees] = useState<{ fastestFee: number; halfHourFee: number; hourFee: number } | null>(null)
  const [error, setError] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [, tick] = useState(0)
  const topId = useRef<string | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [bRes, fRes] = await Promise.all([
          fetch('https://mempool.space/api/v1/blocks'),
          fetch('https://mempool.space/api/v1/fees/recommended'),
        ])
        if (!bRes.ok) throw new Error()
        const b: Block[] = (await bRes.json()).slice(0, 6)
        if (!alive) return
        if (topId.current && b[0]?.id !== topId.current) setFresh(b[0].id)
        topId.current = b[0]?.id ?? null
        setBlocks(b)
        if (fRes.ok) setFees(await fRes.json())
        setError(false)
      } catch { if (alive) setError(true) }
    }
    load()
    const poll = setInterval(load, 30_000)
    const clock = setInterval(() => tick(n => n + 1), 1000)
    return () => { alive = false; clearInterval(poll); clearInterval(clock) }
  }, [])

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">{t('market.blocksTitle')}</h3>
          <p className="text-[13px] text-fg-faint mt-1">{t('market.blocksBody')}</p>
        </div>
        {fees && (
          <dl className="flex gap-5 text-[13px]">
            {([[t('market.nextBlock'), fees.fastestFee], [t('market.halfHour'), fees.halfHourFee], [t('market.oneHour'), fees.hourFee]] as const).map(([l, v]) => (
              <div key={l}>
                <dt className="text-fg-faint">{l}</dt>
                <dd className="text-fg font-medium tabular-nums">{v} sat/vB</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {error && !blocks && <p className="text-sm text-red-400">{t('market.blocksUnavailable')}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {!blocks && !error && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[118px]" />)}
        {blocks?.map(b => (
          <div key={b.id} className={`rounded-md border border-ink-700 bg-ink-850 p-3 ${fresh === b.id ? 'block-new' : ''}`}>
            <div className="text-[15px] font-semibold text-fg tabular-nums">{b.height.toLocaleString()}</div>
            <div className="text-xs text-fg-faint mb-3">{timeAgo(t, b.timestamp)}</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{t('market.transactions', { n: b.tx_count.toLocaleString() })}</div>
            <div className="text-[13px] text-fg-muted tabular-nums">{(b.size / 1e6).toFixed(2)} MB</div>
            <div className="text-xs text-fg-faint truncate mt-1">{b.extras?.pool?.name ?? t('market.unknownPool')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
