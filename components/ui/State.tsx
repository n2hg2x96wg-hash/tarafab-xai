'use client'

import type { ReactNode } from 'react'
import { IconAlert, IconInfo } from '@/components/Icons'
import { Spinner } from '@/components/AuthShell'

// Shared loading / empty / error / unavailable states, so every area tells the
// user the same, honest thing in the same way. Never filled with sample data.
export type ViewState = 'loading' | 'empty' | 'error' | 'unavailable'

export function StateView({ state, title, body, action, compact }: { state: ViewState; title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  const tone = state === 'error' ? 'text-red-300' : state === 'unavailable' ? 'text-amber-300' : 'text-fg'
  return (
    <div role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}
      className={`panel ${compact ? 'p-4' : 'px-6 py-10'} flex flex-col items-center text-center gap-2`}>
      <span className="text-fg-faint">{state === 'loading' ? <Spinner /> : state === 'empty' ? <IconInfo width={18} height={18} /> : <IconAlert width={18} height={18} />}</span>
      <p className={`text-sm font-medium ${tone}`}>{title}</p>
      {body && <p className="text-[13px] text-fg-faint max-w-md">{body}</p>}
      {action}
    </div>
  )
}

// One status vocabulary for live system states (dot + label). The caller maps
// real backend state to a tone; this never invents a state.
export type Tone = 'live' | 'watching' | 'triggered' | 'paused' | 'error' | 'unavailable' | 'neutral'
const DOT: Record<Tone, string> = {
  live: 'bg-emerald-400', watching: 'bg-emerald-400', triggered: 'bg-amber-300', paused: 'bg-slate-400',
  error: 'bg-red-400', unavailable: 'bg-slate-500', neutral: 'bg-slate-500',
}
export function StatusIndicator({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg">
      <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[tone]}`}>
        {pulse && <span className={`absolute inset-0 rounded-full ${DOT[tone]} status-ping`} aria-hidden="true" />}
      </span>
      {label}
    </span>
  )
}
