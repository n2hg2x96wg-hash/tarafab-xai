# Tarafab.XAi — Fictional Demo Investment Platform

Tarafab.XAi is a **fictional, demo-only** fintech investment platform prototype. It is a fully interactive,
front-end-only visual prototype built to showcase a modern, premium fintech user experience — dashboards, portfolio
views, investment plan cards, transaction history, analytics, and account settings.

> ⚠️ **This is not a real financial product.** Tarafab.XAi does not manage real money, does not connect to any real
> bank, brokerage, or crypto accounts, and does not provide real financial or investment advice. Every balance,
> return, transaction, and chart in this app is generated from static mock data bundled with the project.

## Deployment Links

Choose your preferred deployment platform:

### 🚀 Quick Deployment Options

| Platform | Command | Status |
| -------- | ------- | ------ |
| **Vercel** (Recommended) | `npm run deploy:vercel` | Ready to deploy |
| **Netlify** | `npm run deploy:netlify` | Ready to deploy |
| **GitHub Pages** | Auto-deployed on push | [Workflow configured](.github/workflows/deploy.yml) |

### Deploy to Vercel (Recommended)
```bash
npm run build
npm run deploy:vercel
```

Your site will be available at: `https://tarafab-xai.vercel.app`

### Deploy to Netlify
```bash
npm run deploy:netlify
```

Your site will be available at: `https://tarafab-xai.netlify.app`

### GitHub Pages Auto-Deployment
Push to `main` or `master` branch and the app deploys automatically:
```bash
git push origin main
```

Your site will be available at: `https://username.github.io/tarafab-xai`

## Test Accounts

Sign in at `/login` using one of the pre-configured test accounts (also listed on the sign-in page itself):

| Investor Profile | Email | Password |
| ----------------- | ----- | -------- |
| Conservative | `jordan.ashworth@tarafab.com` | `Conserve#2024` |
| Moderate | `sarah.mitchell@tarafab.com` | `Balanced#2024` |
| Growth | `marcus.chen@tarafab.com` | `Growth#2024` |

Each account has fully isolated portfolio holdings, transaction history, performance data, and settings — you will
only ever see the data associated with the account you signed in with.

## Admin Panel

Access the admin dashboard at `/admin` to manage:

| Route | Feature |
| ----- | ------- |
| `/admin` | Dashboard overview with stats and analytics |
| `/admin/users` | User management, search, and filtering |
| `/admin/investments` | Investment plan configuration and returns |
| `/admin/settings` | Platform settings, system status, and config |

## Tech stack

- [React](https://react.dev/) + [Vite](https://vite.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [React Router](https://reactrouter.com/) for client-side navigation
- [Recharts](https://recharts.org/) for charts (performance area chart, allocation donut chart)
- Self-hosted [Inter](https://rsms.me/inter/) font via `@fontsource/inter`

All data lives in `src/data/` as static TypeScript modules — there is no backend, no real API calls, and no
collection of real banking, crypto, or payment credentials anywhere in the app.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL printed in your terminal (typically `http://localhost:5173`).

Other useful scripts:

```bash
npm run build    # type-check with tsc and produce a production build in dist/
npm run preview  # preview the production build locally
npm run lint     # run oxlint
```

## Project structure

```
src/
  components/
    charts/     # Recharts wrappers (performance area chart, allocation donut)
    layout/      # App shell: sidebar, top bar, mobile nav, account menu, footer
    ui/          # Reusable UI primitives: Card, Badge, Modal, Toast
  context/       # Auth/session, theme (light/dark), and currency display settings
  data/          # Mock/fictional data modules (accounts, per-account portfolio, investments,
                 # transactions, performance time series, FAQ/help content)
  pages/         # Landing, Login, Dashboard, Investments, Portfolio, Transactions, Analytics,
                 # Profile, Support, Terms, Privacy, Admin Dashboard, Admin Users, Admin Investments, Admin Settings
  utils/         # Formatting helpers (currency, percent, date)
```

## Pages

| Route            | Description                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `/`               | Landing page with branding, tagline, feature highlights, and CTAs            |
| `/login`          | Secure sign-in with the pre-configured test accounts                        |
| `/dashboard`      | Portfolio balance, invested amount, profit/loss, performance chart, recent activity |
| `/investments`    | Investment plan cards with return ranges, risk badges, and an investment confirmation modal |
| `/portfolio`      | Asset allocation donut chart, allocation table, performance history, key stats |
| `/transactions`   | Searchable/filterable list of your account's deposits, withdrawals, investments, returns |
| `/analytics`      | Interactive performance chart with 1W / 1M / 3M / 1Y / All ranges and summary stats |
| `/profile`        | Account info, security settings, identity verification, notification toggles, theme & currency preferences |
| `/support`        | FAQ accordion, contact form, and a help center                              |
| `/terms`          | Terms of use and simulated-data disclosures                                  |
| `/privacy`        | Privacy policy                                                                |
| `/admin`          | Admin dashboard with system overview and stats                               |
| `/admin/users`    | User management and administration                                           |
| `/admin/investments` | Investment plan configuration                                              |
| `/admin/settings` | Platform settings and system configuration                                   |

## Disclaimer

Tarafab.XAi is a **fictional demo** built purely as a UI/UX prototype:

- No real backend, database, or third-party financial integrations are used.
- No environment secrets or API keys are required to run this project.
- No real banking, crypto, or payment credentials are ever requested or collected.
- All investment plans, returns, balances, and transactions are simulated. This is disclosed in the footer and in
  the Terms of Use / Privacy Policy pages rather than cluttering the main dashboard.
- Nothing in this application constitutes real financial advice or a real investment product.
