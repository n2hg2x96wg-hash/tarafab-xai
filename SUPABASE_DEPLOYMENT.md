# Tarafab.XAi — Supabase Deployment

This setup uses Supabase Auth and Postgres for the customer-facing read layer. Do not enable real-money deposits, withdrawals, or transfers until trusted server-side financial functions, payment verification, and audit controls are deployed.

## 1. Apply the database migration

In Supabase:

1. Open **SQL Editor**.
2. Open the repository file:
   `supabase/migrations/202609250001_initial_schema.sql`
3. Paste the complete file into a new query.
4. Select **Run**.
5. Confirm that these tables exist under `public`:
   - `profiles`
   - `accounts`
   - `transactions`
   - `audit_logs`

The migration enables Row Level Security and creates an account automatically when a Supabase Auth user is created.

## 2. Configure email confirmation

In **Authentication → Providers → Email**:

- Keep email/password enabled.
- Keep **Confirm email** enabled for production.
- In **Authentication → URL Configuration**, add the deployed application URL to **Site URL**.
- Add the deployed login URL to **Redirect URLs**. For GitHub Pages this is normally:
  `https://YOUR_GITHUB_USERNAME.github.io/tarafab-xai/login`

If verification emails are not arriving, configure a custom SMTP provider in Supabase. Apple Private Relay addresses can also delay or filter messages; test with a normal mailbox while configuring delivery.

## 3. Frontend environment variables

Set these variables in the hosting provider's project settings before building:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Use the Supabase **publishable/anon** key in the browser only. Never put `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or other server secrets into `VITE_*` variables or frontend code.

## 4. Build and deploy

```bash
npm install
npm run lint
npm run build
```

Deploy the generated `dist` directory using a static host such as Vercel, Netlify, or GitHub Pages.

For GitHub Pages, the project already uses the `/tarafab-xai/` base path during GitHub Actions builds and aligns React Router with that base path.

## 5. Current scope

The frontend currently supports Supabase session restoration, registration, login, dashboard reads, and transaction reads. The existing deposit, withdrawal, and transfer screens still require trusted backend/API or Supabase Edge Function implementations before they can safely process financial writes.
