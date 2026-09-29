'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Address of one investment: opens the client Investment Center on it. The id
// is only a hint for which of the SIGNED-IN client's own investments to open.
// Data is loaded through the client API under row level security, so an id
// that belongs to someone else (or does not exist) simply opens nothing.
export default function InvestmentRedirect() {
  const router = useRouter()
  const params = useParams()
  useEffect(() => {
    const id = String(params.id || '')
    router.replace(/^[0-9a-f-]{36}$/i.test(id) ? `/dashboard#investments/${id}` : '/dashboard#investments')
  }, [router, params])
  return <div className="min-h-screen bg-ink-950" role="status" aria-label="Loading" />
}
