import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Public pages are indexable on the official domain; signed-in areas and the
// API are not. Preview deployments are kept out entirely.
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api/', '/investments', '/verification', '/payment', '/reset-password'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
