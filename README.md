# Chase.com Banking App

A fullstack banking application inspired by the **chase.com homepage** built as a complete
React + TypeScript + Tailwind frontend with a zero-dependency Node.js backend serving a REST API and the built site from a single origin.

> This is a front-end/back-end design showcase for a Chase-inspired banking experience.
> No real accounts are opened and no data leaves your machine.

---

## Quick start

```bash
./start.sh            # builds the frontend, then starts the server
# → open http://localhost:3000
```

Or manually:

```bash
npm run build         # build the frontend into dist/
node server/index.js  # start API + static server (PORT env, default 3000)
```

**Customer accounts:** enroll through the sign-up wizard or provision test customers from the Administrator Console (`/admin`). Sample seeding (`/api/seed`) is disabled (`410`).

**Super Administrator credentials (Operations & Simulator Console):** configured via server environment variables `CHASE_ADMIN_USERNAME` (default `dianasmith6525@gmail.com`), `CHASE_ADMIN_PASSWORD` (required to enable root Super Admin sign-in), and optionally `ADMIN_SESSION_SECRET` (recommended for multi-instance / serverless deployments). Open directly at `/admin`, click **Admin Console** in the header/sign-in card/footer, or sign in through the homepage sign-in card. See [Admin Simulator Console](#admin-simulator-console).

The frontend also works **standalone** (static preview only): if the API is
unreachable, the app automatically falls back to browser-local storage with
identical behavior.

---

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (React + TS)     │  HTTP  │  Backend (Node.js, no deps)  │
│  src/                      │ ─────► │  server/                     │
│  • Homepage (chase.com)    │  JSON  │  • REST API (/api/*)         │
│  • Enrollment wizard       │ ◄───── │  • Static hosting (dist/)    │
│  • Online Banking UI       │        │  • scrypt password hashing   │
│  • API client + fallback   │        │  • Session tokens (24h)      │
└────────────────────────────┘        └──────────────┬───────────────┘
                                                     │
                                              server/data/db.json
                                              (users + sessions)
```

| Layer | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Lucide icons |
| Backend | Node.js `http` (built-in only), `node:crypto` (scrypt) |
| Database | JSON file (`server/data/db.json`) — swap `server/db.js` for SQLite/Postgres |
| Build | Vite + `vite-plugin-singlefile` (image inlined into the bundle) |

---

## Cloudflare Worker + Hyperdrive (Supabase)

This repo also includes a Cloudflare Worker named `chase` that connects to a Supabase Postgres database through a Hyperdrive binding.

### Install dependencies

```bash
npm install
```

### Add the Hyperdrive config ID

Open `wrangler.jsonc` and replace the placeholder value for the `HYPERDRIVE` binding:

```json
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "REPLACE_WITH_HYPERDRIVE_CONFIG_ID" }
]
```

Use the Cloudflare dashboard config named `chase-supabase` and paste its config ID into that field. Do not add the database password anywhere in the project; Hyperdrive provides the runtime connection string via `env.HYPERDRIVE.connectionString`.

### Run locally

```bash
npm run dev
```

This runs `wrangler dev`, which starts the local Worker and makes the `HYPERDRIVE` binding available at runtime.

### Deploy

```bash
npm run deploy
```

This runs `wrangler deploy` and publishes the Worker. The existing Cloudflare Worker named `chase` is already present in your account as a static-assets-only Worker; deploying this Worker code will turn it into a real Worker with a fetch handler.

> Do not redefine the remote secret bindings `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or `SUPABASE_JWKS_URL` in this repo. Those already exist in Cloudflare and are injected remotely.

---

## API reference

All endpoints are JSON. Authenticated routes require
`Authorization: Bearer <token>` (returned by register/login).

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Liveness probe (`{ status, uptime, users }`) |
| POST | `/api/seed` | — | Disabled (`410`) — sample accounts are not seeded automatically |
| POST | `/api/auth/register` | — | Enroll + open first account → `{ user, token }` |
| POST | `/api/auth/login` | — | Sign in → `{ user, token }` (401 on bad credentials) |
| POST | `/api/auth/logout` | ✓ | Invalidate the session token |
| GET | `/api/auth/me` | ✓ | Current user profile + accounts |
| GET | `/api/auth/check-username?username=` | — | Username availability |
| POST | `/api/auth/change-password` | ✓ | Change password (verifies current) |
| POST | `/api/accounts` | ✓ | Open another account (checking/savings/CD/card) |
| POST | `/api/transfers` | ✓ | Transfer between own accounts |
| POST | `/api/payees` | ✓ | Add a bill-pay payee |
| POST | `/api/billpay` | ✓ | Pay a bill from a deposit account |
| POST | `/api/zelle` | ✓ | Send money with Zelle® |
| POST | `/api/cards/pay` | ✓ | Pay a credit-card balance |
| POST | `/api/auto/apply` | ✓ | Apply for an auto loan |
| POST | `/api/deposit` | ✓ | Submit a QuickDeposit℠ check deposit |
| POST | `/api/wires` | ✓ | Send a domestic or international wire |
| POST | `/api/cards/controls` | ✓ | Lock/unlock a card or toggle autopay |
| POST | `/api/investments/trade` | ✓ | Buy or sell shares in Self-Directed Investing |
| POST | `/api/travel/redeem` | ✓ | Book travel, transfer points, or redeem cash back |
| POST | `/api/security/settings` | ✓ | Update Security Center preferences |
| POST | `/api/auth/reset-password` | — | Verify username + email and set a new password |
| POST | `/api/profile` | ✓ | Update name, email, phone, and mailing address |
| POST | `/api/settings/preferences` | ✓ | Update alert, communication, and privacy preferences |
| POST | `/api/accounts/settings` | ✓ | Nickname, favorite, primary, and show/hide an account |
| POST | `/api/travel/notices` | ✓ | Add a travel notice |
| POST | `/api/travel/notices/delete` | ✓ | Remove a travel notice |
| POST | `/api/auth/sign-out-all` | ✓ | End every session for the signed-in user |
| POST | `/api/credit/goal` | ✓ | Set a credit score goal |
| GET | `/api/rates` | — | Illustrative, refreshed savings/CD/mortgage/auto rates |
| POST | `/api/credit/alerts/read` | ✓ | Mark Credit Journey alerts as read |
| POST | `/api/loans/pay` | ✓ | Pay a mortgage or auto loan (reduces principal) |
| POST | `/api/scheduled` | ✓ | Schedule a future or recurring payment |
| POST | `/api/scheduled/cancel` | ✓ | Cancel a scheduled payment |
| POST | `/api/cards/reveal` | ✓ | Verify password and reveal a sample card number |
| POST | `/api/cards/replace` | ✓ | Order a replacement and lock the old card |
| POST | `/api/cards/dispute` | ✓ | Dispute a posted card purchase |
| POST | `/api/credit/simulate` | ✓ | Estimate a score range for a scenario |
| POST | `/api/admin/login` | — | Sign in as Super Admin (`CHASE_ADMIN_USERNAME`/`CHASE_ADMIN_PASSWORD`), Limited Admin, or Auditor |
| GET | `/api/admin/me` | ⛨ | Verify active admin/auditor session, capabilities, and linked customer identity |
| POST | `/api/admin/me/revoke-all-sessions` | ⛨ | Super Admin global session revocation across all other browsers/devices |
| POST | `/api/admin/switch-to-customer` | ⛨ | Mint personal banking session for a linked staff admin/auditor |
| POST | `/api/auth/switch-to-admin` | ✓ | Mint administrator session for a signed-in linked staff member (forbidden when impersonated) |
| GET | `/api/admin/overview?range=7d\|30d\|12w` | ⛨ | Scoped KPIs, cashflow velocity, account mix, credit utilization, categories & disputes (system telemetry Super Admin only) |
| GET / POST | `/api/admin/users` | ⛨ | List customer directory (scoped by owner for Limited Admins) or provision a customer with optional initial owner |
| POST | `/api/admin/users/bulk` | ⛨ | Bulk suspend, reactivate, or confirmed-delete owned/authorized customer profiles |
| GET / PUT / DELETE | `/api/admin/users/:id` | ⛨ | Inspect, edit full simulator JSON record, suspend, or delete customer |
| POST | `/api/admin/users/:id/promote` | ⛨ | Super Admin: promote a customer to a linked Limited Admin or Auditor (shared credentials) |
| POST | `/api/admin/users/:id/impersonate` | ⛨ | Mint customer preview session while preserving admin session (capability-gated) |
| POST | `/api/admin/users/:id/generate-transactions` | ⛨ | Generate daily/weekly/monthly/yearly realistic ledger activity (capability-gated) |
| POST / PUT / DELETE | `/api/admin/users/:id/accounts[/:accountId]` | ⛨ | Create, edit balances/limits, lock/unlock, or delete simulated accounts |
| GET | `/api/admin/transactions` | ⛨ | Cross-customer global ledger search, date-range filter & pagination (scoped for Limited Admins) |
| POST / PUT / DELETE | `/api/admin/users/:id/transactions[/:txId]` | ⛨ | Post, edit, or reverse & delete ledger entries with automatic balance reconciliation |
| POST / PUT / DELETE | `/api/admin/users/:id/{transfers,payees,scheduled,disputes}` | ⛨ | Execute internal transfers, manage payees/schedules, resolve disputes & issue card refunds |
| GET | `/api/admin/audit` | ⛨ | 5,000-entry compliance & operator audit trail (Super Admin sees all; Limited Admins see own/owned-customer entries) |
| GET / PUT | `/api/admin/settings` | ⛨ | Super Admin: toggle customer self-enrollment and password reset guardrails |
| GET / POST / PUT / DELETE | `/api/admin/admins[/:id]` | ⛨ | Super Admin: manage Limited Admins & Auditors, granular capabilities, root support contact, and atomic ownership handoff |
| POST | `/api/admin/admins/:id/link-customer` | ⛨ | Super Admin: link an unlinked staff account to a newly created or existing personal customer profile |
| POST | `/api/admin/admins/:id/reassign-customers` | ⛨ | Super Admin: bulk-reassign all customers owned by a staff member to another active staff owner or Super Admin |
| GET / POST | `/api/admin/backup` | ⛨ | Super Admin: export v2 JSON backup (users + staff accounts + settings) or restore with optional `restoreAdmins` |
| POST | `/api/admin/reset` | ⛨ | Super Admin: confirmed reset of simulator to clean baseline |

Every mutation validates ownership, capabilities, amounts, and sufficient funds
server-side and returns the updated user object.

⛨ = requires a valid administrator or read-only auditor session (`X-Chase-Admin-Token`, `chase_sim_admin_session` cookie, or `Bearer` token; auditors receive `403` on mutations except self-service password change, workspace switch, and logout).

---

## Admin Simulator Console

An executive operations, analytics, and simulator control center (`/admin`) supporting three distinct tiers:
- **Super Administrator (Root)**: full cross-bank visibility, staff lifecycle & granular capability control, customer ownership assignment & atomic bulk handoff, linked personal-banking identity management, global session revocation, simulator settings, v2 backups (including staff accounts), and platform telemetry.
- **Limited Administrator**: scoped exclusively to assigned customers (plus optional per-admin capability toggles for customer creation, deletion, ledger editing, transaction generation, impersonation, and account mutation), with support messaging isolation and optional linked personal banking workspace switching.
- **Read-Only Auditor**: scoped read-only oversight (assigned customers or full oversight when unassigned), self-service password rotation, and linked personal banking switching when linked.

Sign in at `/admin` with the configured `CHASE_ADMIN_USERNAME` / `CHASE_ADMIN_PASSWORD` (or a staff account provisioned by the Super Admin). Users with a linked personal banking + staff identity see a Workspace Chooser after signing in and can switch cleanly between **Personal Banking** and **Admin Console** at any time.

| Section | What it does |
| --- | --- |
| **Executive Overview** | KPI cards with sparklines; `7d` / `30d` / `12w` Cashflow Velocity SVG area chart; Credit Utilization radial gauge; Account Portfolio Mix donut chart; Top Spending Categories bar chart; Date-Range Ledger Activity Report + 6-month volume breakdown + CSV export; Customer Households table; Open Card Disputes queue; Audit Trail |
| **Users & Simulator** | Searchable customer directory, bulk suspend/reactivate/confirmed-delete, `+ New Customer` modal, CSV export, customer inspector with **Preview as Customer** (with one-click `Return to Admin` banner), session revocation, password reset, **Activity History Generator** (`daily`/`weekly`/`monthly`/`yearly`), quick profile/credit score editor, and **Raw JSON Record Studio** |
| **Accounts Portfolio** | Customer liquidity/credit/loan KPIs, open new Checking/Savings/CD/Credit Card/Auto Loan/Mortgage accounts, bulk lock/unlock/confirmed-delete, and inline balance/credit-limit/autopay/lock editors |
| **Ledger Activity** | Balance-reconciled ledger entry poster, global or per-customer search/status/type/date-range explorer, CSV export, edit modal (adjusts balance by delta), and delete & reverse modal |
| **Payments & Disputes** | Simulated internal transfers, bill-pay payees CRUD, recurring/one-time scheduled instructions (pause/resume/edit/cancel/delete), card dispute filing, status updates, and one-click **Issue Refund** (posts card credit & resolves dispute) |
| **Admin Audit Log** | Searchable 5,000-entry compliance log with structured detail badges and CSV export |
| **Settings & Backup** | Self-enrollment & password-reset guardrails, live runtime/memory/DB/session telemetry, `admin` & read-only `auditor` staff accounts, full JSON backup download/restore, and confirmed simulator reset |

All charts are dependency-free SVG (area, bar, donut, radial gauge,
sparklines) with hover tooltips. Every sensitive admin action is written to
the audit log server-side. When the API is unreachable the console falls back
to the same browser-local mode as the banking app, so it never dead-ends.

---

## Features

**Homepage (banking experience)**
- Three-row header: utility bar (Personal/Business/Commercial, Español,
  search), logo row, primary nav with mega-dropdowns
- Solid-blue hero with the $400 Total Checking offer + authentic sign-in card
  (Show/Hide password, Remember me, Use token, forgot-password flow)
- "Choose what's right for you" — all 11 services
- Featured offers + "More ways to get started" tiles with real copy
- Dense gray footer with product directory, legal disclosures, FDIC/EHO

**Banking flows**
- 4-step enrollment wizard (account selection → identity → login creation →
  review & funding) with full validation
- Online Banking dashboard: accounts + transaction history, dedicated
  Pay & Transfer pages (transfer, Zelle®, QuickDeposit℠, card payment,
  bill pay, wires), investments, travel rewards, Credit Journey®, and
  profile & password controls
- Dashboard search across accounts, sections, and transactions, plus
  account-derived alerts with mark-as-read
- Working username remembering, sample password reset, and expired-session
  handling; mortgage estimator, meeting scheduler, and auto loan application
- Full Profile & Settings: editable personal details, password and
  sign-in protection, paperless, account nicknames/favorites/primary/
  show-hide, travel notices, alerts, and privacy choices — all persisted
- Real mortgage and auto-loan accounts: monthly, payoff, or custom
  payments that reduce principal, plus scheduled future payments
- Scheduled & recurring transfers with a cancellable upcoming-payments panel
- Chase MyHome® driven by the live mortgage account, not static figures
- Error boundary so a render failure shows a recovery screen, not a blank page
- Dedicated Chase-style credit-card account page: real card artwork,
  expandable balance and statement details, credit/APR/rewards metrics,
  Pay card / Statements / Paperless / More actions, computed bonus progress,
  card benefits, card-specific offers, and searchable/sortable activity
- Completed card services: automatic payments setup, password-protected
  card-number reveal, card replacement, per-transaction dispute, statement
  CSV downloads, recent payments, and an open-disputes panel
- Chase-style loading: a full blue loading screen with spinning ring on
  boot, inline spinners on async actions and toggles, and shimmer
  skeletons for the dashboard and credit-card pages
- Chase Credit Journey®: weekly VantageScore® 3.0 gauge and 12-week
  history, six score factors with impact weighting, reasons for score
  changes, Experian® credit report, score goal tracking, a directional
  score simulator, and credit alerts with dark web monitoring
- Full product pages: checking comparison table, credit-card comparison
  with a live side-by-side builder, and a rates & calculators page with
  refreshed CD, mortgage and auto rates plus a working payment calculator
- Spanish translation for dashboard navigation, accounts overview, quick
  actions, utility bar and sign-out, with an Español/English switch
- Global dashboard search across accounts, transactions, payees, settings
  sections, Chase Offers, credit tools and shortcuts
- Admin Console (role-gated): analytics overview with SVG charts, customer
  management drawer, fraud-flag ledger, dispute resolution, audit trail, and
  live system health — see the [Admin Console](#admin-console) section
- Committed end-to-end test (`tests/e2e.mjs`) covering sign in → transfer →
  card payment → persistence, asserting balances through the API
- Session persistence across refreshes; sign-out invalidates the token

---

## Project structure

```
├── index.html                  # Entry HTML (title, favicon, fonts)
├── start.sh                    # Build + launch the fullstack server
├── server/
│   ├── index.js                # HTTP server: customer + admin simulator REST API + static hosting
│   ├── db.js                   # JSON database (users, admin staff, settings, sessions, audit log)
│   └── domain.js               # Products, account factory, sample data
├── src/
│   ├── banking/store.ts        # Proxy-safe API client (+ local fallback mode)
│   ├── components/
│   │   ├── Header.tsx          # 3-row Chase header + mega menus + Admin Console shortcut
│   │   ├── HeroSection.tsx     # Blue hero + sign-in card
│   │   ├── ProductCarousel.tsx # "Choose what's right for you"
│   │   ├── FeaturedOffersGrid.tsx
│   │   ├── EditorialSections.tsx
│   │   ├── SignUpWizard.tsx    # Enrollment flow
│   │   ├── BankingDashboard.tsx# Online Banking + Customer Impersonation preview banner
│   │   ├── AdminPage.tsx       # Admin Simulator shell: sidebar, topbar, ⌘K palette, dark mode
│   │   ├── admin/              # Simulator tabs + SVG charts + UI kit
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── UsersTab.tsx
│   │   │   ├── AccountsLedgerTab.tsx
│   │   │   ├── OperationsSettingsTab.tsx
│   │   │   ├── types.ts        # Shared simulator types + proxy-safe adminFetch
│   │   │   ├── charts.tsx      # Area/bar/donut/gauge/sparkline (no deps)
│   │   │   └── ui.tsx          # Cards, tables, drawer, modal, toasts, CSV
│   │   ├── Modals.tsx          # Offers, mortgage, scheduler, auto loan
│   │   ├── Footer.tsx
│   │   └── ChaseLogo.tsx       # Octagon logo + card artwork (SVG)
│   ├── data/chaseData.ts       # Nav model, offers, search index
│   └── assets/advisor.jpg      # Advisor photo (inlined at build)
├── tests/
│   ├── admin-api.mjs           # Admin simulator API & RBAC verification suite
│   └── e2e.mjs                 # Customer banking E2E suite
└── dist/                       # Production build (served by the API server)
```

---

## Testing

```bash
npm run build
CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node server/index.js &
CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node tests/admin-api.mjs
CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node tests/admin-ownership.mjs
CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node tests/admin-promotion.mjs
CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node tests/super-admin-complete.mjs
node tests/supabase-concurrency.mjs
```

The backend/API suites cover Super Admin governance, linked customer-staff identities, workspace switching, granular capabilities, auditor isolation, ownership handoffs, session revocation, audit scoping, backup v2 restore, and Supabase optimistic concurrency.

Auth hardening already in place: scrypt password hashing, 24-hour session
tokens, ten-attempt sign-in throttling per client/username, password reset
that verifies username + account email and revokes other sessions, expired
session detection with a re-sign-in notice, and sign-out-all-devices.

## Performance

The build is a single inlined HTML file by design (Vite single-file plugin).
The official card artwork is WebP at 360px wide, and the advisor photo is
resized to 900px at quality 72, keeping the bundle around 953 KB (≈343 KB
gzip). Further splitting requires changing the Vite build configuration.

## Notes

- Passwords are hashed with **scrypt** and a per-user random salt; session
  tokens are 256-bit random values with 24-hour expiry. Sign-in is throttled
  after 10 failed attempts from the same client and username in 15 minutes.
- The database file (`server/data/db.json`) is created automatically on first
  run and written atomically; a corrupt file is preserved with a
  `.corrupt-<timestamp>.json` suffix instead of being silently overwritten.
  Delete `db.json` to reset all data (the sample Chase user is re-seeded on next start).
- To deploy: run `npm run build`, then `node server/index.js` on any Node
  host (Render, Railway, Fly.io, a VPS, …). Set `PORT` as required.
