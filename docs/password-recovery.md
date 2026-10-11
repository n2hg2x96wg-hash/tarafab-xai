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

### Supabase (project `jdskpqjwmaeurxspipyv`), with the default email service

**Limits of Supabase's default email service** (from Supabase's documentation):
- It delivers only to email addresses of members of your Supabase organization's team. Every other address fails with "Email address not authorized". New clients therefore cannot receive confirmation or reset emails until custom SMTP is set up, or until they are added to the team (not practical for clients).
- It sends only a few emails per hour, and the limit can change without notice.
- Mail comes from `noreply@mail.app.supabase.io`, as the live auth logs confirm. The sender cannot be changed to `no-reply@tarafabxai.xyz` without custom SMTP.
- Email templates can be edited; only the sender is fixed.

Settings:
1. **Authentication → URL Configuration → Redirect URLs.** **Add** these and keep every existing entry, including the `tarafabxai.vercel.app` ones, as a fallback:
   - `https://www.tarafabxai.xyz/reset-password`
   - `https://www.tarafabxai.xyz/sign-in`
   - `https://www.tarafabxai.xyz/auth/confirm`
   - `https://tarafabxai.xyz/reset-password`
   - `https://tarafabxai.xyz/sign-in`
   - `https://tarafabxai.xyz/auth/confirm`

   The app asks Supabase to return reset links to `https://www.tarafabxai.xyz/reset-password` and confirmation links to `https://www.tarafabxai.xyz/sign-in`. Supabase honours them only once they are listed; until then it uses the Site URL.
2. **Authentication → URL Configuration → Site URL.** Leave it on the Vercel address until the custom-domain flow has been tested (see "How to test"). Then change it to `https://tarafabxai.xyz`, with no trailing slash.
3. **Authentication → Emails → Templates → Reset password** (optional; works with the default service). Subject: `Reset your Tarafab.XAi password`. Body: the contents of `supabase/templates/recovery.html`. The link in the email is then on `tarafabxai.xyz`. Without this step, the link in the email is on `jdskpqjwmaeurxspipyv.supabase.co`, and the final destination is still your domain.
4. **Authentication → Sign In / Providers → Email:** keep "Confirm email" on. Turning it off would let anyone register without proving they own the address.
5. To reach every client: set up custom SMTP (Authentication → Emails → SMTP Settings), then raise the email rate limit. This is a separate decision; see the email provider and DNS sections below.

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

Use an account whose email is a member of the Supabase organization's team; the default email service delivers only to those addresses.

1. Open `https://tarafabxai.xyz/forgot-password` and request a reset for your own account.
2. **Check the link in the email.**
   - With the branded template, it starts with `https://tarafabxai.xyz/auth/confirm#token_hash=`.
   - With the default template, it starts with `https://jdskpqjwmaeurxspipyv.supabase.co/auth/v1/verify`. After clicking, the browser must end on `https://www.tarafabxai.xyz/reset-password`. If it ends on `tarafabxai.vercel.app`, the Redirect URLs from step 1 are not saved yet.
3. **Opening the link** shows "Reset your password" with **Continue**, and the address bar shows only `/auth/confirm`.
4. **Pressing Continue** opens the new-password form. Save a new password, then sign in with it.
5. **Opening the same link again** shows "This link has expired".
6. **While signed in, opening `/reset-password` directly** shows "This link has expired", not the form.
7. **Sign-up confirmation:** register with a team-member address. The confirmation link should end on `https://www.tarafabxai.xyz/sign-in`, with nothing after `#` in the address. Sign in with the new password.
