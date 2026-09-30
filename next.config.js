/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  // Per-user and admin responses must never be stored by a CDN or shared
  // cache, so one person's data can never be served to another.
  async headers() {
    const privateNoStore = [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }]
    // Applied to every response. The CSP is limited to directives that cannot
    // break existing scripts, styles or the chart iframes: no framing of this
    // site (clickjacking), no plugins, no <base> hijacking, forms post here only.
    const security = [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]
    return [
      { source: '/:path*', headers: security },
      { source: '/api/client/:path*', headers: privateNoStore },
      { source: '/api/admin/:path*', headers: privateNoStore },
      { source: '/api/auth/:path*', headers: privateNoStore },
      // Signed-in pages: never kept by shared caches or the back/forward cache.
      { source: '/dashboard/:path*', headers: privateNoStore },
      { source: '/dashboard', headers: privateNoStore },
      { source: '/admin/:path*', headers: privateNoStore },
      { source: '/admin', headers: privateNoStore },
      { source: '/investments', headers: privateNoStore },
      { source: '/verification/:path*', headers: privateNoStore },
      { source: '/verification', headers: privateNoStore },
    ]
  },
}

module.exports = nextConfig
