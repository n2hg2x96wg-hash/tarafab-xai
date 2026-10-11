import type { Metadata } from 'next'

// One-time link page: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return children
}
