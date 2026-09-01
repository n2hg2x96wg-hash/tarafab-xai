# Tarafab.XAi — Fictional Demo Investment Platform

Tarafab.XAi is a **fictional, demo-only** fintech investment platform prototype. It is a fully interactive,
front-end-only visual prototype built to showcase a modern, premium fintech user experience — dashboards, portfolio
views, investment plan cards, transaction history, analytics, and account settings.

> ⚠️ **This is not a real financial product.** Tarafab.XAi does not manage real money, does not connect to any real
> bank, brokerage, or crypto accounts, and does not provide real financial or investment advice. Every balance,
> return, transaction, and chart in this app is generated from static mock data bundled with the project.

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
    layout/      # App shell: sidebar, top bar, mobile nav, demo banner, footer
    ui/          # Reusable UI primitives: Card, Badge, Modal, Toast, SimulatedTag
  context/       # Theme (light/dark) and currency display settings
  data/          # Mock/fictional JSON-like data modules (user, portfolio, investments,
                 # transactions, performance time series, FAQ/help content)
  pages/         # Landing, Dashboard, Investments, Portfolio, Transactions, Analytics,
                 # Profile, Support
  utils/         # Formatting helpers (currency, percent, date)
```

## Pages

| Route            | Description                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `/`               | Landing page with branding, tagline, feature highlights, and CTAs            |
| `/dashboard`      | Portfolio balance, invested amount, profit/loss, performance chart, recent activity |
| `/investments`    | Investment plan cards with demo return ranges, risk badges, and a "Demo Plan" confirmation modal |
| `/portfolio`      | Asset allocation donut chart, allocation table, performance history, key stats |
| `/transactions`   | Searchable/filterable list of mock deposits, withdrawals, investments, returns |
| `/analytics`      | Interactive performance chart with 1W / 1M / 3M / 1Y / All ranges and summary stats |
| `/profile`        | Mock account info, security settings UI, notification toggles, theme & currency preferences |
| `/support`        | FAQ accordion, demo contact form, and a mock help center                     |

## Disclaimer

Tarafab.XAi is a **fictional demo** built purely as a UI/UX prototype:

- No real backend, database, or third-party financial integrations are used.
- No environment secrets or API keys are required to run this project.
- No real banking, crypto, or payment credentials are ever requested or collected.
- All investment plans, returns, balances, and transactions are simulated and clearly labeled as such throughout
  the interface (see the persistent "Fictional Demo / Simulation" banner and the "Simulated Data" tags next to
  every figure).
- Nothing in this application constitutes real financial advice or a real investment product.
