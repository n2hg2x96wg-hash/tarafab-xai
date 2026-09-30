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
          // Keep the bubble clear of the iPhone home indicator and page edges;
          // pages add matching bottom space on phones (see .chat-clearance).
          // Below 1024px the dashboard has a 64px bottom bar (plus the iPhone
          // safe area). The widget reads its offset once when it loads, and
          // sign-in moves to the dashboard without a reload, so on phones and
          // tablets the bubble always sits above where that bar would be.
          _smartsupp.offsetX = 16;
          _smartsupp.offsetY = window.innerWidth < 1024 ? 112 : 20;
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
