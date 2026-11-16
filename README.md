# Chase.com Clone — Fullstack Banking App

A pixel-faithful recreation of the **chase.com homepage** built as a complete
fullstack application: a React + TypeScript + Tailwind frontend and a
zero-dependency Node.js backend serving a REST API and the built site from a
single origin.

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

**Sample Chase credentials:** username `chase` · password `chase123`
(or enroll a brand-new account through the sign-up wizard).

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

## API reference

All endpoints are JSON. Authenticated routes require
`Authorization: Bearer <token>` (returned by register/login).

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Liveness probe (`{ status, uptime, users }`) |
| POST | `/api/seed` | — | Seed the sample Chase user (idempotent) |
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
| POST | `/api/scheduled/manage` | ✓ | Edit, pause, or resume a scheduled payment |
| POST | `/api/budgets` | ✓ | Save monthly spending budgets |
| POST | `/api/admin/login` | — | Sign in to the simulator admin portal |
| GET | `/api/admin/me` | Admin | Current admin identity and role |
| PUT | `/api/admin/me/password` | Admin | Confirmed password change for stored admin accounts; root password remains environment-managed |
| GET/POST/PUT/DELETE | `/api/admin/admins` | Admin | Create/manage admin and read-only auditor accounts |
| GET | `/api/admin/transactions` | Admin | Search simulator ledger activity across all customers |
| GET/POST | `/api/admin/backup` | Admin | Download or confirmed-restore a simulator backup |
| POST | `/api/admin/users/bulk` | Admin | Bulk suspend, reactivate, or confirmed-delete selected users |
| GET | `/api/admin/overview` | Admin | Simulator totals and recent admin activity |
| GET | `/api/admin/users` | Admin | List simulated customer profiles |
| POST | `/api/admin/users` | Admin | Create a sample simulator profile |
| GET/PUT/DELETE | `/api/admin/users/:id` | Admin | View, fully edit, or delete simulated customer data |
| POST | `/api/admin/users/:id/revoke-sessions` | Admin | Revoke all user and impersonation sessions |
| POST | `/api/admin/users/:id/impersonate` | Admin | Open a customer-view simulation session |
| POST | `/api/admin/users/:id/transfers` | Admin | Post a confirmed simulated account transfer or debt payment |
| POST | `/api/admin/users/:id/accounts` | Admin | Add a simulated account |
| PUT/DELETE | `/api/admin/users/:id/accounts/:accountId` | Admin | Edit or confirmed-delete an account |
| POST | `/api/admin/users/:id/accounts/bulk` | Admin | Bulk lock/unlock or typed-confirm delete accounts |
| GET/POST | `/api/admin/users/:id/transactions` | Admin | List or add simulated ledger activity |
| PUT/DELETE | `/api/admin/users/:id/transactions/:transactionId` | Admin | Edit or confirmed-delete a ledger entry; balances reconcile automatically |
| POST | `/api/admin/users/:id/payees` | Admin | Add a simulated payee |
| PUT/DELETE | `/api/admin/users/:id/payees/:payeeId` | Admin | Edit or confirmed-delete a payee and linked schedules |
| POST | `/api/admin/users/:id/scheduled` | Admin | Add a simulated scheduled payment |
| PUT/DELETE | `/api/admin/users/:id/scheduled/:paymentId` | Admin | Edit, pause, resume, cancel, or confirmed-delete a schedule |
| POST | `/api/admin/users/:id/disputes` | Admin | Open a simulated card dispute |
| PUT | `/api/admin/users/:id/disputes/:disputeId` | Admin | Update dispute status |
| POST | `/api/admin/users/:id/disputes/:disputeId/refund` | Admin | Issue a confirmed simulated refund and reconcile the card balance |
| POST | `/api/admin/users/:id/generate-transactions` | Admin | Generate posted simulated activity over a selected date range and cadence |
| POST | `/api/admin/users/:id/reset-password` | Admin | Reset a simulated user's password |
| GET/PUT | `/api/admin/settings` | Admin | Read/update simulator enrollment and password recovery controls |
| POST | `/api/admin/reset` | Admin | Reset all simulator data to the sample profile |
| GET | `/api/admin/audit` | Admin | Search and page through up to 5,000 retained audit entries |
| POST | `/api/admin/logout` | Admin | End the administrator session |
| POST | `/api/cards/reveal` | ✓ | Verify password and reveal a sample card number |
| POST | `/api/cards/replace` | ✓ | Order a replacement and lock the old card |
| POST | `/api/cards/dispute` | ✓ | Dispute a posted card purchase |
| POST | `/api/credit/simulate` | ✓ | Estimate a score range for a scenario |

Every mutation validates ownership, amounts, and sufficient funds
server-side and returns the updated user object.

---

## Features

**Homepage (chase.com clone)**
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
- Scheduled & recurring payments with an upcoming-payments manager to edit,
  pause/resume recurring items, or cancel payments
- Checking and savings monthly statements with downloadable, period-specific CSV
  transaction exports
- Spending & Budgeting with current-month category totals and persisted monthly
  budget targets
- Ultimate Rewards® cash-back redemption posts a card statement credit; points
  and card balances update with each redemption
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
- Simulator-only admin portal at `/admin`: separate role-protected login,
  user/account/ledger/rewards/credit/preferences management through complete
  simulator records; filter/page/export users and audit history; global transaction
  search and date-range reports; create, edit and delete accounts and ledger entries
  with balance reconciliation; manage payees, schedules, disputes and simulated
  refunds; bulk user status/delete actions; admin and read-only auditor accounts;
  secure JSON backup/restore; user session revocation; environment access controls;
  and a persistent 5,000-entry audit log. Admin credentials entered in the regular
  sign-in form route directly to administration; `/admin` also has one-click demo sign-in. Demo
  credentials are `admin` / `chaseadmin123` (override with `DEMO_ADMIN_USERNAME`
  and `DEMO_ADMIN_PASSWORD` environment variables).
  Admin controls only simulated data; this portal has no real payment rails.
- Committed end-to-end test (`tests/e2e.mjs`) covering sign in → transfer →
  card payment → persistence, asserting balances through the API; admin API
  smoke test (`tests/admin-api.mjs`) covers authorization and roles, backup/restore,
  settings, account/ledger reconciliation, payees, schedules, disputes/refunds,
  user/session controls, impersonation, and audit logging.
- Session persistence across refreshes; sign-out invalidates the token

---

## Project structure

```
├── index.html                  # Entry HTML (title, favicon, fonts)
├── start.sh                    # Build + launch the fullstack server
├── server/
│   ├── index.js                # HTTP server: REST API + static hosting
│   ├── db.js                   # JSON database (users + sessions)
│   └── domain.js               # Products, account factory, sample data
├── src/
│   ├── banking/store.ts        # API client (+ local fallback mode)
│   ├── components/
│   │   ├── Header.tsx          # 3-row Chase header + mega menus
│   │   ├── HeroSection.tsx     # Blue hero + sign-in card
│   │   ├── ProductCarousel.tsx # "Choose what's right for you"
│   │   ├── FeaturedOffersGrid.tsx
│   │   ├── EditorialSections.tsx
│   │   ├── SignUpWizard.tsx    # Enrollment flow
│   │   ├── BankingDashboard.tsx# Online Banking
│   │   ├── AdminPage.tsx       # Simulator administrator portal
│   │   ├── Modals.tsx          # Offers, mortgage, scheduler, auto loan
│   │   ├── Footer.tsx
│   │   └── ChaseLogo.tsx       # Octagon logo + card artwork (SVG)
│   ├── data/chaseData.ts       # Nav model, offers, search index
│   └── assets/advisor.jpg      # Advisor photo (inlined at build)
└── dist/                       # Production build (served by the API server)
```

---

## Testing

```bash
npm run build
node server/index.js &                      # serve app + API
npm install --no-save playwright && npx playwright install chromium
BASE_URL=http://127.0.0.1:3000 node tests/e2e.mjs
BASE_URL=http://127.0.0.1:3000 node tests/admin-api.mjs
```

The E2E suite signs in with the sample Chase account, transfers money, pays the card,
and verifies both account balances through the API. The admin API smoke test
checks role separation, customer creation, daily/monthly/yearly history generation,
full-record editing, suspension, impersonation, and audit entries; it creates
and removes one temporary simulated customer.
Both suites exit non-zero on failure.

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
