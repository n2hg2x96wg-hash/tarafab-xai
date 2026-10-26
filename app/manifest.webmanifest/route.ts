import { NextResponse } from 'next/server'

// Installable app (Add to Home Screen): opens full screen on the dashboard,
// which sends signed-out visitors to sign in as usual. Served at
// /manifest.webmanifest and linked from the root layout's metadata (a plain
// route rather than app/manifest.ts, so the admin pages can link their own
// app instead: app/admin-app.webmanifest).
export function GET() {
  return NextResponse.json({
    id: '/dashboard',
    name: 'Tarafab.XAi',
    short_name: 'Tarafab',
    description: 'Your Bitcoin deposits, balance and transaction history in one dashboard.',
    start_url: '/dashboard?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#080a0e',
    theme_color: '#080a0e',
    categories: ['finance', 'business'],
    // Light tile with the Tarafab gold coin (the site's logo mark). ?v= changes
    // whenever the images change, so installed apps pick up the new icon.
    icons: [
      { src: '/app/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/maskable-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/app/maskable-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } })
}
