# TARAFAB.XAi — Security posture

The frontend presents. The API routes decide who may ask. The database decides what is allowed. This document records what the database and API enforce today, what is still open, and how it was tested. Nothing here claims the system is "100% secure".

## 1. Authority model

| Layer | Enforces |
|---|---|
| Browser | Nothing it can't be trusted to skip. Admin UI is hidden for non-admins, but this is cosmetic. |
| API routes (`app/api/**`) | Bearer token → user (`auth.getUser`). Admin routes then call `requireAdmin` (`lib/adminGuard.ts`): authenticated → `is_admin()` → else 403 and a recorded `admin_denied` event. Per-user rate limits (`lib/userRateLimit.ts`). Sanitised errors (`dbError`). |
| Database (Supabase Postgres) | RLS on every public table. Clients have no INSERT/UPDATE/DELETE on financial tables. All money movement happens in SECURITY DEFINER functions scoped to `auth.uid()`, or admin functions gated by `_require_admin()`. Idempotency keys, optimistic `updated_at` checks, append-only audit trails. |

## 2. Threat model

| # | Threat | Attack surface | Current protection | Remaining risk | Mitigation |
|---|---|---|---|---|---|
| 1 | Account takeover (credential stuffing) | `/api/auth/signin` | Per-IP+email limiter, Supabase Auth limits, `failed_login` security events | In-memory limiter is per instance | Enable Supabase CAPTCHA / leaked-password protection; alert on `failed_login` spikes |
| 2 | Token theft via XSS | Session in localStorage | React escaping, no `dangerouslySetInnerHTML` of user data, X-Frame-Options, nosniff | Token readable by injected script; CSP lacks `script-src` | Roll out full CSP in Report-Only first; consider cookie sessions (`@supabase/ssr`) |
| 3 | Privilege escalation to admin | Admin API, profile `role` | Server `requireAdmin` + DB `_require_admin()`; clients can't update role (tested) | None found | Keep admin list small; review `security_events` |
| 4 | Balance tampering | Direct table writes | No write grants; RLS; tested 42501 | None found | — |
| 5 | Forged transactions / profits | Tables, RPCs | Only definer functions write; engine functions not client-executable | None found | — |
| 6 | Double spend / replay | Deposit, withdraw, invest, transfer | Idempotency keys (tested: one row); row locks in RPCs | — | — |
| 7 | Negative / overflow amounts | Financial RPCs | Server validation + DB checks (tested) | — | — |
| 8 | Cross-tenant data read (IDOR) | Transactions, KYC, profiles | RLS `auth.uid()`; 0 rows on attack | — | — |
| 9 | Audit tampering | `audit_logs`, `transaction_events`, `security_events` | Append-only triggers | Service-role key can bypass | Protect service key; periodic export |
| 10 | Malicious upload | KYC / receipts | MIME allowlist, magic bytes, 5 MB, own-folder paths, private buckets, signed URLs, upload rate limit | No AV scan | Add malware scanning if volume grows |
| 11 | Webhook forgery | `/api/webhooks/seerbit` | Payment re-verified with provider by reference before crediting | — | — |
| 12 | Abuse / spam | Client POSTs | DB-backed per-user limits (shared across instances), `rate_limited` events | Fails open if DB check errors | Vercel firewall rules for volumetric abuse |
| 13 | CSRF | API | Bearer-token auth, no cookie auth on API → not applicable | Re-evaluate if cookies are adopted | SameSite + origin check then |
| 14 | Clickjacking / sniffing | Pages | X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS, no `X-Powered-By` | — | — |
| 15 | Secret leakage | Repo, bundle | Only the public anon key is in the client; `.env.local` untracked; `.env.example` placeholders | — | Rotate service key if ever exposed |
| 16 | Vulnerable dependencies | npm | Next 14.2.35 (latest 14.x) | `npm audit` reports Next advisories fixed only in a major upgrade; build-time-only highs (postcss/tailwind/micromatch) | Plan Next 15/16 upgrade; `images.unoptimized` removes the image-optimizer surface |
| 17 | Data loss | Database | Supabase managed backups (plan-dependent) | Restore has **not** been tested | Confirm plan PITR; run and document a restore drill |

## 3. API inventory

- **Public:** `auth/signin`, `auth/signup`, `market/*`, `fx`, `geo`, `health`, `plans`, `features`, `automation/status`, `webhooks/seerbit` (verified server-to-provider).
- **Client (bearer token, RLS-scoped):** `client/account, automations, deposit-options, deposit, fees, investments, kyc, nav-config, notifications, payments, premium, transactions, transfers, upload-kyc-doc, upload-receipt, wallets, watchlist, withdraw`.
- **Admin (bearer + `requireAdmin` + DB `_require_admin`):** `admin/adjust-balance, client-nav, create-client (service-key admin check), investments, kyc-doc-url, notifications, receipt-url, review-deposit, review-kyc, set-trading-status, update-client`.

## 4. Monitoring

`security_events` (append-only, admin-read-only) records `failed_login`, `admin_denied`, `rate_limited`. The latest 20 appear at the top of **Admin → Audit logs**.

## 5. Production checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_GATEWAY_KEY` set only in server env (Vercel), never `NEXT_PUBLIC_*`
- [ ] `FINNHUB_API_KEY` set as an Edge Function secret if equities are wanted
- [ ] Supabase: leaked-password protection, email confirmation, CAPTCHA on auth
- [ ] Supabase: PITR/backups confirmed for the plan, restore drill done
- [ ] HTTPS-only domain (HSTS already sent)
- [ ] CSP Report-Only with `script-src`/`connect-src`, then enforce
- [ ] Review `security_events` weekly; alert on spikes
- [ ] Schedule Next.js major upgrade

## 6. Backups (honest note)

Backups are provided by Supabase according to the project's plan. This hardening did not change, verify or test them. Until a restore is tested, recovery capability is unproven.
