import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Sitemap Protocol 0.9 (Next.js renders it as XML at /sitemap.xml). Only the
// public, indexable pages, on the canonical host (the one that answers 200).
// Never listed: signed-in areas (/dashboard, /admin, /investments,
// /verification, /payment), the password-reset pages and the API.
const PUBLIC_PAGES = ['/', '/sign-up', '/sign-in'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(p => ({ url: `${SITE_URL}${p}`, changeFrequency: 'weekly', priority: p === '/' ? 1 : 0.5 }))
}
