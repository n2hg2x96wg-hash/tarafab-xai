'use client'

import { Component, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'

// Contains a crash to the section that failed, so the rest of the page keeps
// working. Shows a short message with a retry that remounts the section.
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; className?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label || 'section'}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <Fallback label={this.props.label} className={this.props.className} onRetry={() => this.setState({ error: null })} />
  }
}

function Fallback({ label, className, onRetry }: { label?: string; className?: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div role="alert" className={`panel p-5 text-sm text-fg-muted ${className || ''}`}>
      <p className="text-fg font-medium mb-1">{label ? t('errors.sectionFailed', { label }) : t('errors.sectionFailedGeneric')}</p>
      <p className="mb-3">{t('errors.restUnaffected')}</p>
      <button onClick={onRetry} className="btn btn-sm btn-outline">{t('common.tryAgain')}</button>
    </div>
  )
}
