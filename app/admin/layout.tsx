import type { Metadata } from 'next'

// Admin pages install as their own home-screen app ("Tarafab Admin", opening
// the admin dashboard) instead of the client app.
export const metadata: Metadata = {
  manifest: '/admin-app.webmanifest',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">₿</text></svg>',
    apple: '/app/admin-apple-touch-icon.png?v=1',
  },
  appleWebApp: { capable: true, title: 'Tarafab Admin', statusBarStyle: 'black' },
}

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return children
}
