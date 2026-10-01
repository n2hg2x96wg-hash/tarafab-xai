# Tarafab.XAi — Supabase Deployment

This setup uses Supabase Auth and Postgres for the customer-facing read layer. Do not enable real-money deposits, withdrawals, or transfers until trusted server-side financial functions, payment verification, and audit controls are deployed.

## 1. Apply database migrations safely

For an existing deployment, **do not rerun the initial schema, reset the project, or recreate tables**. Apply only migration files that have not already been applied, in ascending filename order. The migrations are designed to extend the existing schema without deleting account or transaction records.

For the automation persistence and in-app alert changes, apply:

`supabase/migrations/202610180001_automation_idempotency_market_alerts.sql`

If setting up a new project, apply all migrations in order and verify that `profiles`, `accounts`, `transactions`, `market_assets`, `market_automations`, and `market_automation_events` exist under `public`. Keep the existing Row Level Security policies enabled.

## 2. Configure email confirmation

In **Authentication → Providers → Email**:

- Keep email/password enabled.
- Keep **Confirm email** enabled for production.
- In **Authentication → URL Configuration**, add the deployed application URL to **Site URL**.
- Add the deployed login URL to **Redirect URLs**. For GitHub Pages this is normally:
  `https://YOUR_GITHUB_USERNAME.github.io/tarafab-xai/login`

If verification emails are not arriving, configure a custom SMTP provider in Supabase. Apple Private Relay addresses can also delay or filter messages; test with a normal mailbox while configuring delivery.

## 3. Application environment variables

Set the Supabase public values in the Vercel project settings:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The market quote endpoints use public feeds and need no provider credentials. `MARKET_COINBASE_BASE`, `MARKET_COINGECKO_BASE`, and `MARKET_STOOQ_BASE` are optional server-side endpoint overrides; the production defaults are configured in the application. Do not set the service-role key as a `NEXT_PUBLIC_*` variable or expose it to browser code.

The scheduled Supabase Edge Function `evaluate-market-automations` must use server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets and be invoked by the existing trusted scheduler. Never put those secrets in Vercel's public environment variables or client code.

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
