// The official public address of Tarafab.XAi. Vercel keeps hosting the app;
// clients use this domain. NEXT_PUBLIC_SITE_URL can override it (for example
// if the domain ever changes) without a code change.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://terafabxai.xyz').replace(/\/+$/, '')
export const SITE_HOST = new URL(SITE_URL).host

// The former production address on Vercel. Requests to it are sent to
// SITE_URL once REDIRECT_LEGACY_HOSTS=1 is set (after the custom domain is
// confirmed working), so clients are never sent to a domain that is not live.
export const LEGACY_HOSTS = ['tarafabxai.vercel.app']
