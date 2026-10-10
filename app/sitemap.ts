import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// The public pages, on the official domain.
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/sign-up', '/sign-in'].map(p => ({ url: `${SITE_URL}${p === '/' ? '/' : p}`, changeFrequency: 'weekly', priority: p === '/' ? 1 : 0.5 }))
}
