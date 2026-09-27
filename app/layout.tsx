import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tarafab.XAi - Investment Platform',
  description: 'Secure, transparent investment management platform with real-time settlement.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75" fill="%2310b981">₹</text></svg>',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
