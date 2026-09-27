import type { Metadata, Viewport } from 'next'
import './globals.css'
import SmartsuppWidget from '@/components/SmartsuppWidget'

export const metadata: Metadata = {
  title: 'Tarafab.XAi | Bitcoin deposits and account tracking',
  description: 'Deposit Bitcoin, upload your transfer receipt, and track your balance and transaction history in one dashboard.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">₿</text></svg>',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#080810] text-white antialiased overflow-x-hidden">
        {children}
        <SmartsuppWidget />
      </body>
    </html>
  )
}
