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
    return [
      { source: '/api/client/:path*', headers: privateNoStore },
      { source: '/api/admin/:path*', headers: privateNoStore },
      { source: '/api/auth/:path*', headers: privateNoStore },
    ]
  },
}

module.exports = nextConfig
