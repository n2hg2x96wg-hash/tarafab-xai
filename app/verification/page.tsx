import { redirect } from 'next/navigation'

// Kept so any existing link to /verification still works. The KYC page itself
// lives in the dashboard, alongside the rest of the client's account.
export default function VerificationRedirect() {
  redirect('/dashboard#verification')
}
