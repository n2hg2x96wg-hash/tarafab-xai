'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/Icons'

// Centered card used by the payment status pages.
export function PaymentShell({ tone, title, body, children }: { tone: 'info' | 'ok' | 'warn' | 'error'; title: string; body?: ReactNode; children?: ReactNode }) {
  const ring = tone === 'ok' ? 'from-emerald-400/30' : tone === 'warn' ? 'from-amber-400/30' : tone === 'error' ? 'from-red-400/30' : 'from-sky-400/25'
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10 bg-ink-950">
      <Link href="/" className="mb-6 opacity-90 hover:opacity-100" aria-label="Tarafab.XAi"><Logo /></Link>
      <section className={`relative w-full max-w-md rounded-2xl p-[1px] bg-gradient-to-b ${ring} to-transparent rise-in`}>
        <div className="rounded-2xl panel p-6 sm:p-8 text-center" role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'}>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {body && <div className="mt-3 text-sm text-fg-muted leading-relaxed">{body}</div>}
          {children && <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">{children}</div>}
        </div>
      </section>
    </main>
  )
}
