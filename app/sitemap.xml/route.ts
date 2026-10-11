import { SITE_URL } from '@/lib/site'

// /sitemap.xml: Sitemap Protocol 0.9 (https://www.sitemaps.org/protocol.html),
// served as application/xml. Only the public, indexable pages, as absolute
// URLs on the canonical host (the one that answers 200).
// Never listed: signed-in areas (/dashboard, /admin, /investments,
// /verification, /payment), the password-reset pages and the API.
// <changefreq> and <priority> are left out: Google ignores both.
// The xml-stylesheet line only changes how a browser displays the file (Safari
// otherwise runs the URLs together as plain text); crawlers ignore it.
export const dynamic = 'force-static'

const PUBLIC_PAGES = ['/', '/sign-up', '/sign-in'] as const

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function GET() {
  const urls = PUBLIC_PAGES.map(p => `  <url>\n    <loc>${xmlEscape(`${SITE_URL}${p}`)}</loc>\n  </url>`).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/css" href="/sitemap.css"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
