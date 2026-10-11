// The official public address of Tarafab.XAi. Vercel keeps hosting the app;
// clients use this domain. NEXT_PUBLIC_SITE_URL can override it (for example
// if the domain ever changes) without a code change.
// It is the www host because that is where Vercel serves the site: the bare
// domain (tarafabxai.xyz) redirects to it. Canonical links, the sitemap and
// robots.txt must name the address that answers 200, not one that redirects.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tarafabxai.xyz').replace(/\/+$/, '')
export const SITE_HOST = new URL(SITE_URL).host

// The former production address on Vercel. Requests to it are sent to
// SITE_URL once REDIRECT_LEGACY_HOSTS=1 is set (after the custom domain is
// confirmed working), so clients are never sent to a domain that is not live.
export const LEGACY_HOSTS = ['tarafabxai.vercel.app']

// Where Supabase's email links (password reset, sign-up confirmation) send
// people back to: always the official domain, whichever address the request
// came from, except during local development. Supabase only honours an
// address on its Redirect URLs list; any other falls back to its Site URL.
export function authReturnBase(origin: string): string {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : SITE_URL
}
