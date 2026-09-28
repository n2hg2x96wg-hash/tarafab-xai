'use client'

export function AdminLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm">
      <span className="text-amber-200">{message}</span>
      <button onClick={onRetry} className="px-3 py-1.5 rounded-lg border border-white/15 text-white text-xs font-medium hover:bg-white/5">Try again</button>
    </div>
  )
}
