'use client'

import { useState, type ReactNode } from 'react'
import { openSmartsuppChat } from '@/components/SmartsuppWidget'

// Opens the site's existing support channel: the Smartsupp live chat already
// loaded by the root layout (no second widget is created here). Where chat
// is not running (switched off in Feature controls, a bot, or not loaded
// yet), the dashboard's Help & Support page opens instead; it lists the
// configured support email and the chat button.
export async function openSupport(): Promise<'chat' | 'page'> {
  if (await openSmartsuppChat(6000)) return 'chat'
  window.location.hash = 'support'
  return 'page'
}

export function SupportButton({ children, className, beforeOpen, ...rest }: {
  children: ReactNode
  className?: string
  // Runs first, e.g. to close the sheet the button sits in.
  beforeOpen?: () => void
} & Record<`data-${string}`, string | boolean | undefined>) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" className={className} disabled={busy} aria-busy={busy} {...rest}
      onClick={async () => {
        if (busy) return
        setBusy(true)
        beforeOpen?.()
        try { await openSupport() } finally { setBusy(false) }
      }}>
      {busy ? 'Opening support…' : children}
    </button>
  )
}
