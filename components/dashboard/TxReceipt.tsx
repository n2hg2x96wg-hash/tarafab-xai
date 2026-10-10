'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { statusLabel } from '@/lib/i18n/format'
import { isAccountCredit, txSign } from '@/lib/txCategory'
import { IconCheck, IconClose, IconCopy } from '@/components/Icons'
import { StatusTag, fmt, methodLabel, signedAmount, txDescription, txLabel, type Tx } from '@/components/dashboard/shared'

/* A receipt for one of the client's own transactions: every line comes from
   that transaction record (nothing is recalculated). It can be shared as an
   image through the device's share sheet, saved, or copied as text. */

type Line = [string, string]

function receiptLines(tx: Tx, t: ReturnType<typeof useI18n>['t'], intl: string) {
  const label = `${txLabel(tx, t)}${isAccountCredit(tx) ? ` · ${t('dash.txType.accountCredit')}` : ''}`
  const lines: Line[] = [
    [t('rcpt.type'), label],
    [t('rcpt.status'), statusLabel(t, tx.status)],
    [t('rcpt.dateTime'), new Date(tx.created_at).toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' })],
  ]
  if (tx.reference) lines.push([t('rcpt.reference'), tx.reference])
  const desc = txDescription(tx, t)
  if (desc) lines.push([t('rcpt.description'), desc])
  if (tx.method && tx.type !== 'adjustment') lines.push([t('rcpt.method'), methodLabel(tx.method, t)])
  if (Number(tx.fee) > 0) lines.push([t('rcpt.fee'), `$${fmt(Number(tx.fee))}`])
  if (tx.address) lines.push([t('rcpt.address'), tx.address])
  return { label, lines }
}

// Wrap text to a width on a 2D canvas (between words; very long tokens such
// as addresses break by character, as they have no spaces).
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const tryLine = line ? `${line} ${word}` : word
    if (g.measureText(tryLine).width <= width) { line = tryLine; continue }
    if (line) out.push(line)
    if (g.measureText(word).width <= width) { line = word; continue }
    let part = ''
    for (const ch of word) { if (g.measureText(part + ch).width > width) { out.push(part); part = ch } else part += ch }
    line = part
  }
  if (line) out.push(line)
  return out
}

async function receiptImage(title: string, amount: string, positive: boolean, lines: Line[], note: string): Promise<Blob> {
  const S = 2, W = 540, pad = 36, colW = W - pad * 2
  const font = (size: number, weight = 400) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  const probe = document.createElement('canvas').getContext('2d')!
  // measure the height first
  probe.font = font(14)
  const rows = lines.map(([k, v]) => ({ k, v: wrap(probe, v, colW) }))
  probe.font = font(12)
  const noteLines = wrap(probe, note, colW)
  const H = 210 + rows.reduce((h, r) => h + 26 + r.v.length * 20, 0) + 24 + noteLines.length * 17 + pad
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S
  const g = c.getContext('2d')!; g.scale(S, S)
  // card
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#15120d'); bg.addColorStop(1, '#0b0c10')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W, 0, 0, W, 0, 320); glow.addColorStop(0, 'rgba(247,147,26,.22)'); glow.addColorStop(1, 'rgba(247,147,26,0)')
  g.fillStyle = glow; g.fillRect(0, 0, W, H)
  // brand: gold coin + name
  const cx = pad + 14, cy = pad + 14
  const coin = g.createRadialGradient(cx - 5, cy - 6, 1, cx, cy, 15); coin.addColorStop(0, '#ffecb0'); coin.addColorStop(.45, '#fdb94a'); coin.addColorStop(1, '#b4610b')
  g.fillStyle = coin; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#fff7e2'; g.font = font(15, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₿', cx, cy + 1)
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  g.fillStyle = '#f0f2f6'; g.font = font(17, 700); g.fillText('Tarafab', pad + 36, pad + 20)
  const tw = g.measureText('Tarafab').width; g.fillStyle = '#9aa3b2'; g.fillText('.XAi', pad + 36 + tw, pad + 20)
  g.fillStyle = '#f7931a'; g.font = font(11, 600); g.textAlign = 'right'; g.fillText(title.toUpperCase(), W - pad, pad + 19); g.textAlign = 'left'
  // amount
  g.fillStyle = positive ? '#3dd5a0' : '#f0f2f6'; g.font = font(38, 700); g.fillText(amount, pad, pad + 96)
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(pad, pad + 122, colW, 1)
  // lines
  let y = pad + 150
  for (const r of rows) {
    g.fillStyle = '#8a93a1'; g.font = font(12, 500); g.fillText(r.k, pad, y); y += 20
    g.fillStyle = '#f0f2f6'; g.font = font(14, 500)
    for (const v of r.v) { g.fillText(v, pad, y); y += 20 }
    y += 6
  }
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(pad, y, colW, 1); y += 22
  g.fillStyle = '#8a93a1'; g.font = font(12)
  for (const n of noteLines) { g.fillText(n, pad, y); y += 17 }
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('image')), 'image/png'))
}

export function TxReceipt({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const { t, intl } = useI18n()
  const [busy, setBusy] = useState<'' | 'share' | 'save'>('')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const { label, lines } = receiptLines(tx, t, intl)
  const amount = signedAmount(tx)
  const note = t('rcpt.note')
  const fileName = `tarafab-receipt-${(tx.reference || tx.id).replace(/[^A-Za-z0-9-]/g, '')}.png`
  const text = [`Tarafab.XAi — ${t('rcpt.title')}`, `${label}: ${amount}`, ...lines.slice(1).map(([k, v]) => `${k}: ${v}`)].join('\n')

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const save = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const onSave = async () => {
    setBusy('save'); setMsg('')
    try { save(await receiptImage(t('rcpt.title'), amount, txSign(tx) > 0, lines, note)); setMsg(t('rcpt.saved')) } catch { setMsg(t('rcpt.failed')) } finally { setBusy('') }
  }
  const onShare = async () => {
    setBusy('share'); setMsg('')
    try {
      const blob = await receiptImage(t('rcpt.title'), amount, txSign(tx) > 0, lines, note)
      const file = new File([blob], fileName, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: t('rcpt.title'), text })
      else if (nav.share) await nav.share({ title: t('rcpt.title'), text })
      else { save(blob); setMsg(t('rcpt.shareFallback')) }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg(t('rcpt.failed'))
    } finally { setBusy('') }
  }
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setMsg(t('rcpt.failed')) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="rcpt-title" data-tx-receipt={tx.id}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div className="dep-sheet rcpt relative w-full sm:max-w-[440px] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="rcpt-head relative px-6 pt-6 pb-5">
          <div className="flex items-center justify-between gap-3">
            <p id="rcpt-title" className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent">{t('rcpt.title')}</p>
            <button ref={closeRef} onClick={onClose} className="w-9 h-9 -mr-2 rounded-xl grid place-items-center text-fg-muted hover:text-fg hover:bg-[rgb(var(--contrast)/.06)]" aria-label={t('rcpt.close')}><IconClose width={18} height={18} /></button>
          </div>
          <p className={`mt-3 text-[34px] leading-none font-semibold tracking-[-0.02em] tabular-nums break-words ${txSign(tx) > 0 ? 'price-up' : 'text-fg'}`} data-rcpt-amount>{amount}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[14px] text-fg">{label}</span><StatusTag status={tx.status} /></div>
        </div>
        <dl className="px-6 py-4 space-y-3 border-t border-[rgb(var(--contrast)/.07)]">
          {lines.slice(2).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 text-[13.5px]">
              <dt className="text-fg-faint">{k}</dt>
              <dd className={`text-fg min-w-0 ${k === t('rcpt.reference') || k === t('rcpt.address') ? 'font-mono text-[12.5px] break-all' : 'break-words'}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="px-6 pb-4 text-[12px] text-fg-faint">{note}</p>
        <div className="px-6 pb-6 grid grid-cols-2 gap-2">
          <button onClick={onShare} disabled={!!busy} aria-busy={busy === 'share'} className="btn btn-solid col-span-2 min-h-12" data-rcpt-share>{busy === 'share' ? t('rcpt.preparing') : t('rcpt.share')}</button>
          <button onClick={onSave} disabled={!!busy} className="btn btn-outline whitespace-nowrap" data-rcpt-save>{busy === 'save' ? t('rcpt.preparing') : t('rcpt.save')}</button>
          <button onClick={onCopy} className="btn btn-outline whitespace-nowrap" data-rcpt-copy>{copied ? <><IconCheck width={15} height={15} className="max-[380px]:hidden" />{t('rcpt.copied')}</> : <><IconCopy width={15} height={15} className="max-[380px]:hidden" />{t('rcpt.copy')}</>}</button>
          {msg && <p role="status" className="col-span-2 text-[12.5px] text-fg-muted text-center">{msg}</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
