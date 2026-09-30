import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { cookies } from 'next/headers'
import SmartsuppWidget from '@/components/SmartsuppWidget'
import SessionGuard from '@/components/SessionGuard'
import { ToastProvider } from '@/components/Toast'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { THEME_COOKIE, isThemePreference, themeInitScript } from '@/lib/theme/config'

// Served from this site at build time rather than fetched from Google on each
// visit: no render-blocking request to another origin before text appears,
// and the fallback is size-adjusted so nothing jumps when Inter arrives.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})

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
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The saved language is read on the server so the first render is already
  // in that language (no flash of English).
  const saved = cookies().get(LOCALE_COOKIE)?.value
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE
  const savedTheme = cookies().get(THEME_COOKIE)?.value
  const themePref = isThemePreference(savedTheme) ? savedTheme : 'dark'
  // Light/dark is known on the server; "system" is settled by the head script
  // before paint. suppressHydrationWarning: that script may change data-theme.
  return (
    <html lang={locale} className={`scroll-smooth ${inter.variable}`} data-theme={themePref === 'light' ? 'light' : 'dark'} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-ink-950 text-fg antialiased overflow-x-hidden">
        <ThemeProvider initialPreference={themePref}>
          <I18nProvider initialLocale={locale}>
            <ToastProvider>
              {children}
            </ToastProvider>
            <SmartsuppWidget />
            <SessionGuard />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
