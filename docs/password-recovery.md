# Password recovery

## How it works

1. **`/forgot-password`** calls `supabase.auth.resetPasswordForEmail` (browser client, `lib/supabase/client.ts`). The page shows the same reply whether or not the address has an account, including when Supabase rate-limits the request.
2. **Supabase sends the "Reset password" email.** With the branded template (`supabase/templates/recovery.html`), the link is `https://tarafabxai.xyz/auth/confirm#token_hash=…&type=recovery`. Vercel redirects the bare domain to `www`, and the browser keeps the `#…` part.
3. **`/auth/confirm`** (`app/auth/confirm/page.tsx`):
   - It removes the token from the address bar.
   - When the client presses **Continue**, it calls `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`. Email link scanners only open the page, so they cannot use up the token.
   - On success, it marks the tab as in recovery and opens `/reset-password`.
   - An expired, used or malformed token shows "This link has expired" with **Send a new link**.
   - It never follows any address from the link, so it cannot be used as an open redirect.
4. **`/reset-password`** shows the form only to a recovery session. That means one opened from a reset link: `/auth/confirm`, or Supabase's older `#…&type=recovery` redirect. Being signed in is not enough.
   - The new password is saved with `supabase.auth.updateUser({ password })`, which changes the existing user. No account is created.
   - If the session has ended, the page asks for a new link.

The older email link (`{{ .ConfirmationURL }}`, on the Supabase project URL) keeps working until the template is changed. `lib/auth/recoveryRedirect.ts` sends it to `/reset-password`.

**Token safety:**
- The token travels after `#`, so it is never sent to a server and never appears in Vercel request logs.
- The page removes it from the address bar and history.
- The recovery pages:
  - send no `Referer` header (`Referrer-Policy: no-referrer`);
  - are never cached;
  - do not load the live-chat script;
  - are excluded from robots.txt and marked noindex.

## Manual configuration checklist

Nothing below can be done from the codebase. Each item is a dashboard setting.

### Supabase (project `jdskpqjwmaeurxspipyv`)

1. **Authentication → URL Configuration → Site URL:** `https://tarafabxai.xyz`, with no trailing slash.
2. **Authentication → URL Configuration → Redirect URLs.** Keep only the URLs you need:
   - `https://tarafabxai.xyz/reset-password`
   - `https://www.tarafabxai.xyz/reset-password`
   - `https://tarafabxai.xyz/auth/confirm`
   - `https://www.tarafabxai.xyz/auth/confirm`

   Remove broad wildcards such as `https://*.vercel.app/**`. For local development, use a separate Supabase project with `http://localhost:3000/**`. Do not add localhost to the production project.
3. **Authentication → Emails → Templates → Reset password:**
   - Subject: `Reset your Tarafab.XAi password`.
   - Body: paste the contents of `supabase/templates/recovery.html`.
   - Save, then send yourself a test reset from `/forgot-password`.
4. **Authentication → Emails → SMTP Settings** (optional, recommended). Supabase's built-in sender is for testing: it sends only a few emails per hour and comes from a Supabase address. To send from your own domain:
   - Enable custom SMTP.
   - Enter the provider's host, port, user and password here, never in the code or repository.
   - Sender: `no-reply@tarafabxai.xyz`, name `Tarafab.XAi`.
5. **Authentication → Rate Limits:** after custom SMTP is on, raise "emails sent per hour" to suit real use.
6. **Authentication → Sign In / Providers → Email:** keep "Secure email change" on. Optionally shorten the email OTP expiry; the default is 1 hour (3600 s).

### Email provider (only if custom SMTP is used)

1. Verify the sending domain `tarafabxai.xyz` with the provider.
2. **Turn off click tracking** and open tracking for this sender. Click tracking rewrites links through the provider's domain, which would expose the reset link to it and can break the `#token_hash`.
3. Create an SMTP credential limited to sending, and paste it only into Supabase SMTP Settings.

### Domain DNS (only if custom SMTP is used)

Add the records your email provider gives you. Don't change the existing A/CNAME records that point the site to Vercel. Typically:

1. SPF: a TXT record on `tarafabxai.xyz` that includes the provider, e.g. `v=spf1 include:<provider> ~all`. Merge it with any existing SPF record; never keep two.
2. DKIM: the TXT or CNAME records the provider lists.
3. DMARC: TXT on `_dmarc.tarafabxai.xyz`, e.g. `v=DMARC1; p=none; rua=mailto:<your address>`. Tighten it to `quarantine` once mail is delivering.

The sender only changes after the provider shows the domain as verified and Supabase SMTP is saved.

### Deployment (Vercel)

1. No new environment variables are needed. The app keeps using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Never add a service-role key or SMTP password to a `NEXT_PUBLIC_*` variable.
3. If `NEXT_PUBLIC_SITE_URL` is set, it must be `https://www.tarafabxai.xyz`.
4. Domains: keep `tarafabxai.xyz` redirecting to `www.tarafabxai.xyz`, preferably as a permanent 308.

## How to test

1. Open `https://tarafabxai.xyz/forgot-password` and request a reset for your own account.
2. **The email link starts with `https://tarafabxai.xyz/auth/confirm#token_hash=`.** If it still starts with `https://jdskpqjwmaeurxspipyv.supabase.co`, the template has not been saved yet.
3. **Opening the link** shows "Reset your password" with **Continue**, and the address bar shows only `/auth/confirm`.
4. **Pressing Continue** opens the new-password form. Save a new password, then sign in with it.
5. **Opening the same link again** shows "This link has expired".
6. **While signed in, opening `/reset-password` directly** shows "This link has expired", not the form.
