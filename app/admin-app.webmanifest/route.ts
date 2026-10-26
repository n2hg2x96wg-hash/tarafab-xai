import { NextResponse } from 'next/server'

// Installable admin app (Add to Home Screen from any admin page): its own
// name, icon and start page, separate from the client app (app/manifest.ts),
// so the two can sit side by side on one phone. The admin pages themselves
// still check the admin role before showing anything.
export function GET() {
  return NextResponse.json({
    id: '/admin',
    name: 'Tarafab Admin',
    short_name: 'Tarafab Admin',
    description: 'Tarafab.XAi administration.',
    start_url: '/admin?source=app',
    scope: '/admin',
    display: 'standalone',
    orientation: 'any',
    background_color: '#080a0e',
    theme_color: '#080a0e',
    categories: ['finance', 'business'],
    icons: [
      { src: '/app/admin-icon-192.png?v=1', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/admin-icon-512.png?v=1', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/admin-maskable-192.png?v=1', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/app/admin-maskable-512.png?v=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } })
}
