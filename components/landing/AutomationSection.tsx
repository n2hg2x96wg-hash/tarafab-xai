'use client'

import Link from 'next/link'
import { EnginePanel } from '@/components/automation/EnginePanel'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Public "Intelligent automation" section. The panel's status and activity
// are the engine's real, verified state; nothing here suggests a visitor is
// receiving a return.
const FLOW = ['Market data', 'XAI engine', 'Rule evaluation', 'Portfolio monitoring', 'Verified performance']

export default function AutomationSection() {
  return (
    <section aria-labelledby="auto-title" className="border-b border-ink-700 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">Intelligent automation</p>
          <h2 id="auto-title" className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">Automation that watches the market.<span className="block text-fg-muted">Your portfolio stays in view.</span></h2>
          <p className="mt-4 text-fg-muted leading-relaxed max-w-lg">Configure rules that monitor supported markets and account conditions. The engine evaluates them every minute and records activity for review.</p>
          <ol className="auto-flow mt-6 space-y-2" aria-label="How automation works">
            {FLOW.map((s, i) => <li key={s} className="auto-flow-step" style={{ ['--i' as string]: i }}><span className="auto-flow-dot" aria-hidden="true" />{s}</li>)}
          </ol>
          <Link href="/sign-up" className="btn btn-solid mt-7 inline-flex">Open an account</Link>
        </div>
        <ErrorBoundary label="Automation"><EnginePanel variant="preview" /></ErrorBoundary>
      </div>
    </section>
  )
}
