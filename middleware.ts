import { NextResponse, type NextRequest } from 'next/server'
import { LEGACY_HOSTS, SITE_HOST, SITE_URL } from '@/lib/site'

// Domain handling (no authentication or data is touched here):
// - www.<domain> → <domain> (308, path and query kept).
// - The former *.vercel.app production address → <domain>, only when
//   REDIRECT_LEGACY_HOSTS=1. API routes are never redirected, so payment
//   webhooks and callbacks still configured on the old address keep working.
// - Every page carries a canonical link to the same path on <domain>, so the
//   custom domain is the one search engines index.
// - Preview deployments are marked noindex.
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase().replace(/:\d+$/, '')
  const { pathname, search } = req.nextUrl
  const isApi = pathname.startsWith('/api/')

  if (host === `www.${SITE_HOST}`) {
    return NextResponse.redirect(`${SITE_URL}${pathname}${search}`, 308)
  }
  if (!isApi && process.env.REDIRECT_LEGACY_HOSTS === '1' && LEGACY_HOSTS.includes(host)) {
    return NextResponse.redirect(`${SITE_URL}${pathname}${search}`, 308)
  }

  const res = NextResponse.next()
  if (!isApi) res.headers.set('Link', `<${SITE_URL}${pathname === '/' ? '/' : pathname}>; rel="canonical"`)
  if (process.env.VERCEL_ENV === 'preview') res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export const config = {
  // Pages and API routes; not build assets or files with an extension.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
