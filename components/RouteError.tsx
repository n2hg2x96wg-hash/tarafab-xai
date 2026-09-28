'use client'

import { useEffect } from 'react'

export function RouteError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="site min-h-screen bg-ink-950 text-fg flex items-center justify-center px-4">
      <div className="panel max-w-md w-full p-6 sm:p-8">
        <h1 className="text-lg font-semibold mb-2">This page ran into a problem</h1>
        <p className="text-sm text-fg-muted mb-6">Your account and balances are not affected. Try again, or reload the page if this continues.</p>
        <div className="flex gap-3">
          <button onClick={reset} className="btn btn-solid">Try again</button>
          <a href={home} className="btn btn-outline">Go back</a>
        </div>
      </div>
    </div>
  )
}
