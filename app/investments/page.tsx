'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Stable address of the client Investment Center (used by links and, later,
// by notification buttons). It always opens the CLIENT dashboard on the
// Investment Center; it never resolves to an admin route. The dashboard
// itself checks the session and sends signed-out visitors to sign in, and an
// admin who opens this link sees the client-facing Investment Center.
export default function InvestmentsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard#investments') }, [router])
  return <div className="min-h-screen bg-ink-950" role="status" aria-label="Loading" />
}
