import type { Metadata, Viewport } from 'next'
import './globals.css'
import { cookies } from 'next/headers'
import SmartsuppWidget from '@/components/SmartsuppWidget'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { THEME_COOKIE, isThemePreference, themeInitScript } from '@/lib/theme/config'

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
  // The saved language is read on the server so the first render is already
  // in that language (no flash of English).
  const saved = cookies().get(LOCALE_COOKIE)?.value
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE
  const savedTheme = cookies().get(THEME_COOKIE)?.value
  const themePref = isThemePreference(savedTheme) ? savedTheme : 'dark'
  // Light/dark is known on the server; "system" is settled by the head script
  // before paint. suppressHydrationWarning: that script may change data-theme.
  return (
    <html lang={locale} className="scroll-smooth" data-theme={themePref === 'light' ? 'light' : 'dark'} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-ink-950 text-fg antialiased overflow-x-hidden">
        <ThemeProvider initialPreference={themePref}>
          <I18nProvider initialLocale={locale}>
            {children}
            <SmartsuppWidget />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
