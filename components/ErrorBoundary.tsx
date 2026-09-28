'use client'

import { Component, type ReactNode } from 'react'

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
    return (
      <div role="alert" className={`panel p-5 text-sm text-fg-muted ${this.props.className || ''}`}>
        <p className="text-fg font-medium mb-1">{this.props.label ? `${this.props.label} could not be displayed.` : 'This section could not be displayed.'}</p>
        <p className="mb-3">The rest of the page is unaffected.</p>
        <button onClick={() => this.setState({ error: null })} className="btn btn-sm btn-outline">Try again</button>
      </div>
    )
  }
}
