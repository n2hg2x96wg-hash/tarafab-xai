import type { MetadataRoute } from 'next'

// Installable app (Add to Home Screen): opens full screen on the dashboard,
// which sends signed-out visitors to sign in as usual. Served at
// /manifest.webmanifest; Next.js links it from every page.
export default function manifest(): MetadataRoute.Manifest {
  return {
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
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/app/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
