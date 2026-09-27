'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'

// Client-facing live chat. Renders on the landing page, sign-in/up, and
// dashboard — hidden under /admin, since support chat is for clients
// reaching out, not for the admin's own panel.
export default function SmartsuppWidget() {
  const pathname = usePathname()
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      <Script id="smartsupp-loader" strategy="lazyOnload">
        {`
          var _smartsupp = _smartsupp || {};
          _smartsupp.key = '7609b94f32c953ff2d48e555ce2d1f77f817d98e';
          window.smartsupp||(function(d) {
            var s,c,o=smartsupp=function(){ o._.push(arguments)};o._=[];
            s=d.getElementsByTagName('script')[0];c=d.createElement('script');
            c.type='text/javascript';c.charset='utf-8';c.async=true;
            c.src='https://www.smartsuppchat.com/loader.js?';s.parentNode.insertBefore(c,s);
          })(document);
        `}
      </Script>
      <noscript>Powered by <a href="https://www.smartsupp.com" target="_blank" rel="noreferrer">Smartsupp</a></noscript>
    </>
  )
}
