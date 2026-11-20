# Super Administrator — Complete Capability Inventory

This document lists **everything the Super Administrator (root operator) can do** in this application, derived from the server authorization code, the admin console UI, and the test suites.

**The Super Administrator is the environment-configured root identity.** It is not a database row: it is derived from server-only environment variables (a server-configured root username and password, with an independent session-signing secret). Because it lives outside the staff table, it cannot be edited, demoted, deleted, or impersonated from inside the application.

**What makes it different from every other role:** every other actor (limited administrator, read-only auditor) is scoped to customers they own, is blocked from global endpoints by a deny-by-default allowlist, and is filtered by per-account permissions and capabilities. **The Super Administrator bypasses all of it** — it is the only identity with global scope, staff lifecycle control, and system configuration. It is also the only role that can never be made read-only, never has a capability revoked, and never has its scope narrowed.

---

## 1. Authentication & Session Control

| Capability | Detail |
| --- | --- |
| Sign in via the dedicated admin endpoint | `POST /api/admin/login` — root credentials verified against the environment-configured password hash |
| Sign in via the public customer login page | `POST /api/auth/login` recognizes the root username and returns an admin session |
| Receive a signed, time-limited admin session | 8-hour HMAC-signed token, additionally bound to a stored server session |
| Get full identity metadata | `GET /api/admin/me` returns username, label, role, `isSuperAdmin: true`, effective permissions/capabilities, linked customer (always none), and support contact |
| Revoke every other Super Admin session globally | `POST /api/admin/me/revoke-all-sessions` — bumps a global session version, invalidates all other root tokens on all devices, and issues a fresh token to the caller |
| Sign out | `POST /api/admin/logout` — revokes the presented session tokens |
| Own credential management | Root password is **not** changeable in-app: it is managed exclusively by the server-side root password environment variable, and the in-app password endpoint explicitly refuses for root |
| Direct the password-recovery flow | Accounts linked to administrator access cannot use public self-service reset; they must be reset by the Super Administrator |
| Bypass the read-only auditor guard | The auditor write-block does not apply (root is always `admin` role) |
| Bypass the cross-tenant guard | The per-customer ownership check (`ownerAdminId === operator.id`) is skipped for root |

---

## 2. Staff Directory — Create, Read, Update, Delete

Full lifecycle authority over **limited administrators** and **read-only auditors**. Every write is validated server-side and recorded in the audit trail with before/after diffs.

### 2.1 Create staff accounts
`POST /api/admin/admins`

- Create a **limited administrator** (`role: admin`) or a **read-only auditor** (`role: auditor`).
- Set **username** (4–32 chars, letters/numbers/`.`/`_`/`-`), **full name**, and **initial password** (minimum 10 characters).
- Uniqueness is enforced against the root username, all staff usernames, and all customer usernames.
- Optionally provision a **linked personal customer profile in the same atomic operation** (`createCustomerProfile: true` + `email`) — the staff member gets a real banking profile with the same username and one shared password.
- Optionally set **granular permissions** and **granular capabilities** at creation time.
- Optionally set a **customer support contact** (email + phone) at creation time.

### 2.2 Read the staff directory
`GET /api/admin/admins` — **root-only**; other roles receive an empty list.

Each row exposes: id, username, full name, role, status, protected flag, linked customer summary, effective permissions/capabilities, support contact, **owned customer count**, **unread message count**, and **last activity timestamp**. A synthetic root row is prepended with `id: "__root__"` and `protected: true`.

### 2.3 Update staff accounts
`PUT /api/admin/admins/:id`

- **Username** — change it (blocked for linked admins, whose username must match their customer profile).
- **Full name** — change it; for linked staff this propagates to the customer profile too.
- **Role** — flip between `admin` and `auditor` at any time.
- **Status** — set `active` or `disabled`.
- **Lock message** — up to 300 characters, shown only after the correct password is supplied at sign-in.
- **Password** — reset it (minimum 10 chars, requires explicit confirmation); for linked staff this also rotates the shared customer password.
- **Permissions** — toggle `createUsers`, `generateActivity`, `sendMessages`.
- **Capabilities** — toggle `manageAccounts`, `editLedger`, `impersonateUsers`, `manageCustomerAccess`, `manageDisputes`, `publishNotices`.
- **Support contact** — set the support email + phone that assigned customers see.
- **Automatic activity flag** — enable/disable daily synthetic transaction generation for that staff member.
- **Customer handoff in the same request** — supply `replacementAdminId` to atomically move all their customers to another owner.
- **Session invalidation on security-relevant changes** — credential, role, status, and username changes immediately kill existing staff sessions, including after re-enabling.

### 2.4 Root row special case
`PUT /api/admin/admins/__root__` — the only accepted field is `supportContact` (the default contact shown to unassigned and orphaned customers). Every other field is rejected with the message that the environment-configured root admin cannot be edited here.

### 2.5 Delete staff accounts
`DELETE /api/admin/admins/:id`

- **Delete a standalone staff account** (confirmation required).
- **Guarded against self-deletion** — root cannot delete its own identity.
- **Guarded against orphaning customers** — deletion returns `409` while customers remain assigned, unless a replacement is supplied.
- **Atomic reassign-and-remove** — supply `replacementAdminId` (another active admin, or `null` for the Super Administrator) and the system reassigns every owned customer and deletes the staff account in one commit.
- **Revoke linked staff access while preserving banking** — deleting a linked staff account removes administrator privileges and signs out admin sessions, but **keeps the personal customer profile, balances, and history intact**.
- **Session termination** — all of that administrator's active sessions are revoked on deletion.

### 2.6 Link staff to a customer identity
`POST /api/admin/admins/:id/link-customer`

- **Create-and-link** — provision a brand-new personal customer profile for an unlinked staff account (requires a valid email; refuses if a customer with that username already exists).
- **Link-to-existing** — attach the staff account to an existing active customer profile, with a choice of **which password wins** (`admin` or `customer`).
- Enforces: active-only targets, one administrator per customer, no duplicate usernames, no use of the reserved root username, and no linking to an already-linked customer.
- Aligns the staff username to the customer's username and **revokes stale sessions on both identities**.

### 2.7 Bulk customer reassignment
`POST /api/admin/admins/:id/reassign-customers`

- Move **all** customers owned by one staff member to another active administrator, or back to the Super Administrator (`null`).
- **All balances, messages, private staff notes, disputes, payees, schedules, and history are preserved** — only the ownership pointer moves.
- Replacement must be active, must be an `admin` role, and cannot be the administrator being emptied.

---

## 3. Customer-to-Staff Promotion & Revocation

| Capability | Detail |
| --- | --- |
| Promote an existing customer to staff | `POST /api/admin/users/:id/promote` — **root-only**; creates a linked administrator (or auditor) that shares the customer's username and password |
| Choose the promoted role | `admin` or `auditor`, confirmed explicitly |
| Eligibility enforcement | Customer must be active; username must be a valid staff username, not reserved, not already used by staff, and the account must not already be linked |
| Preserve the customer identity | Promotion links the new staff account to the existing customer record — no data is copied or discarded; the profile is re-owned by the Super Administrator so other limited admins cannot touch its credentials |
| Revoke staff access from a customer | Deleting the linked staff account (or the "Revoke Admin Access" action) removes admin privileges, signs out admin sessions, and leaves the banking profile fully intact |
| Blocked escalation paths | A limited admin calling promote gets `403`; a customer cannot self-promote; the promoted account cannot be promoted twice (`409`) |

---

## 4. Customer Ownership & Assignment

| Capability | Detail |
| --- | --- |
| See every customer's assigned owner | `GET /api/admin/users` returns `ownerAdminId`, `linkedAdminId`, `linkedAdminRole`, and `linkedAdminStatus` — fields **only** populated for root |
| Assign or reassign a single customer | `PUT /api/admin/users/:id/assign-admin` — **root-only**; set the owner to any active admin/auditor, or `null` for the Super Administrator |
| Assign ownership at creation | `POST /api/admin/users` accepts `ownerAdminId` (root only) to create a customer already owned by a staff member |
| Filter the directory by owner | UI owner filter — "All owners", "Super admin only", or any individual staff member |
| Inspect one admin's book | Jump from the staff table into a directory filtered to that administrator's customers |
| Protect linked staff profiles | A linked staff member's own customer profile can only stay owned by the Super Administrator — attempts to assign it to a limited admin return `409` |
| Orphan handling | Customers owned by a disabled administrator fall back to the root support contact and remain fully manageable by root |

---

## 5. Customer Management — Unlimited Scope

Root is the only role with **no `ownerAdminId` filter**. Everything a limited administrator can do to their assigned customers, root can do to **every** customer in the system, without capability gates.

### 5.1 Directory & records
- Full customer directory with deposits, card balances, loan balances, account counts, transaction counts, credit score, status, and creation date.
- **Free-text search** across name, username, email, and status.
- **CSV export** of the full directory.
- Create customer profiles (`POST /api/admin/users`) — username, full name, email, phone, address, temporary password (min 8), optional owner.
- Inspect the full simulator record for any customer (`GET /api/admin/users/:id`).
- **Edit the profile** — username, full name, email, phone, address, status, credit score.
- **Raw JSON record studio** — edit the customer's complete state object directly.
- Suspend / reactivate individual customers.
- **Bulk actions across up to 100 customers** (`POST /api/admin/users/bulk`) — suspend, reactivate, or confirmed-delete (`DELETE SELECTED USERS`).
- Delete a customer (confirmation required; blocked while an administrator link exists).
- **Automatic daily activity toggle** per customer.
- Toggle synthetic activity generation on a per-customer basis.

### 5.2 Account & access control
- **Reset any customer's password** (`POST /api/admin/users/:id/reset-password`) — minimum 8 chars, or 10 chars if the account has linked admin access; automatically revokes all customer **and** linked-admin sessions.
- **Revoke all sessions** for a customer (`POST /api/admin/users/:id/revoke-sessions`) — kills customer sessions and any linked administrator sessions together.
- **Impersonate / preview as customer** (`POST /api/admin/users/:id/impersonate`) — mint a live customer banking session while keeping the admin session; the impersonated session is deliberately restricted (cannot switch to the admin console, does not expose linked-admin metadata).

### 5.3 Activity generation
`POST /api/admin/users/:id/generate-transactions`

- Generate realistic ledger history over a chosen date range (ending today or earlier).
- **Cadence:** daily, weekly, monthly, or yearly.
- **Density:** 1–5 events per period.
- **Scope:** all accounts or a single selected account.
- **Hard cap:** 2,500 generated events per run.
- Realistic behavior: purchases on cards and checking, direct deposits, checking→savings transfers, card payments, and (monthly) loan payments. Generated rows are flagged as simulated (and labeled as such in the ledger and CSV exports).
- Respects each account's opening date and available credit / balance.

---

## 6. Accounts Portfolio — Full Control, Any Customer

`/api/admin/users/:id/accounts` (root has no capability gate)

- **Create accounts** of any product type: checking, savings, CD, credit card, auto loan, mortgage.
  - Set name, **unrestricted opening balance (any finite positive, zero, or negative/overdraft amount — no dollar ceiling for root)**, optional credit limit (also uncapped for root), optional opening date, plus optional **routing number** and **account number** (the mask is derived from the last 4 digits).
- **Edit accounts** — product name, dashboard nickname, mask, **balance (any finite positive or negative/overdraft amount)**, credit limit, statement balance, APR, monthly payment, rewards points, opening date, replacement date.
- **Direct account overdraft & target-balance authority — root-only** (`POST /api/admin/users/:id/accounts/:accountId/overdraft`) — set an account's balance directly to **any exact negative or positive amount** (`targetBalance`) or **debit/overdraft by any amount** (`amount`), with optional automatic posting of a reconciling adjustment entry on the statement (`recordTransaction`, enabled by default).
- **Toggle account flags** — locked, autopay, hidden, favorite, primary.
- **Lock / unlock** accounts, including in bulk.
- **Bulk actions on up to 100 accounts** — lock, unlock, or confirmed-delete (`DELETE SELECTED ACCOUNTS`).
- **Delete accounts** (confirmation required, high-severity audit).
- **Issue a replacement card** — generates a new 4-digit mask and stamps the replacement timestamp.
- **Printable statements** and **per-account statement CSV export**.

---

## 7. Ledger & Transaction Authority

Root can post, rewrite, and reverse money movement on any account of any customer — including overdrafting balances to any finite amount.

### 7.1 Global ledger
- **Cross-customer transaction explorer** (`GET /api/admin/transactions`) — search by customer, account, description, or category; filter by status and date range; paginated up to 5,000 rows.
- **Ledger CSV export**, **date-range activity report**, and 6-month volume breakdown.

### 7.2 Write operations
- **Post a transaction** (`POST /api/admin/users/:id/transactions`) — pick account, **any finite signed amount (no $10,000,000 cap and no overdraft floor for root)**, description, category, date, and `posted`/`pending` status. **The account balance reconciles automatically, allowing root to overdraft any account to any amount.**
- **Edit a transaction** (`PUT .../transactions/:txId`) — change description, category, **any finite amount**, date, or status; the balance adjusts by the delta with no overdraft restriction for root.
- **Delete a transaction** (`DELETE .../transactions/:txId`) — the amount is **reversed out of the balance** automatically, even if the reversal places a deposit account into overdraft.
- Credit-card statement balances are kept in sync with the card balance.
- **Quick money & overdraft actions in the UI** — "Deposit / Credit Funds", "Debit / Withdraw", "Overdraft / Set Balance", "Post Credit / Payment", "Post Purchase / Charge", and "Deposit / Overdraft Balance" (with live resulting-balance and overdraft preview).
- Every ledger write records before/after balances and is severity-scored by amount.

---

## 8. Payments, Transfers & Scheduled Instructions

### 8.1 Transfers between customer accounts
`POST /api/admin/users/:id/transfers` — supports ten transfer types: internal, wire, ACH, person-to-person payment, direct deposit, payroll, bill pay, vendor payment, customer refund, check deposit, card payment, loan payment.

- Debits the source deposit account and credits the destination — deposit, card, or loan — with matching entries on both ledgers.
- **Loan/card payments reduce principal** instead of increasing balance.
- **Unrestricted overdraft & amount authority for root** — root bypasses the source-account sufficient-funds check, the $10,000,000 transfer cap, and the loan-principal cap, so any transfer can overdraft the funding deposit account to any amount. Subordinate administrators remain bound by sufficient funds and standard limits.
- Custom memo/description supported (sanitized).

### 8.2 Payees
`POST / PUT / DELETE /api/admin/users/:id/payees` — create, edit, and delete bill-pay payees (name, masked account reference, category). Deleting a payee also removes its scheduled payments.

### 8.3 Scheduled payments
`POST / PUT / DELETE /api/admin/users/:id/scheduled` — create, edit, pause, resume, cancel, or delete one-time and monthly scheduled transfers, bill payments, card payments, and loan payments. Set amount (uncapped for root), date, source account, destination account or payee, and status.

### 8.4 Batch execution engine — **root-only**
`POST /api/admin/process-scheduled`

- Execute **all due scheduled payments** across the entire customer base, for one customer, or force a single payment immediately.
- Choose an **as-of date** to backdate or advance the run.
- **Overdraft execution (`allowOverdraft`, enabled by default)** — executes scheduled payments even when the source account lacks funds, overdrafting the account to any resulting balance (can optionally be set to `false` to skip insufficient balances).
- Rolls monthly schedules forward to the next cycle instead of closing them.
- Skips suspended customers, locked accounts, and invalid destinations.
- Returns processed count, total amount, and a per-payment execution list.

### 8.5 Month-end close engine — **root-only**
`POST /api/admin/month-end-close`

- **Credit monthly Savings & CD interest** (using the account APR, or 2.15% savings / 4.25% CD defaults), minimum $0.01.
- **Cut credit-card statements** — set the statement balance to the current balance.
- **Award card rewards points** (capped at 5,000 per card per cycle).
- Run for one customer or the whole portfolio; idempotent per monthly cycle via a close marker.

---

## 9. Disputes & Refunds

- **Open a dispute** on any posted positive card transaction for any customer (`POST .../disputes`) — reason required, duplicate open disputes blocked, the transaction is stamped as disputed.
- **Change dispute status** to `open`, `resolved`, or `denied` (`PUT .../disputes/:id`).
- **Issue a simulated refund** (`POST .../disputes/:id/refund`) — credits the card balance, marks the statement balance, posts a "Simulated refund" ledger entry, and resolves the dispute.
- Global open-dispute queue on the overview, with alerts and a per-dispute drill-down.

---

## 10. Customer Messaging & Notices

- **See every conversation** across every customer (`GET /api/admin/messages`), sorted by unread and recency, with unread counts, support status, and any published banner.
- **Search** conversations and **filter the queue** by all / unread / open / pending / resolved.
- **Send a secure message** to any customer — subject, category (general, wire, dispute, security, account), and body up to 2,000 characters; marks the customer's messages read.
- **Mark messages read** in bulk for a customer.
- **Private staff notes** (`GET` / `POST .../staff-notes`) — add internal notes (up to 2,000 chars, 500 retained) that are never returned in customer API responses.
- **Conversation status** (`PUT .../support-status`) — set the support thread to open, pending, or resolved.
- **Publish dashboard banners** — tone (info, warning, urgent, success), title, message, dismissible flag; or clear the banner.
- **Staff-assignment view** — see and change which administrator owns each conversation.
- **Reassign a customer's owner from the message center** — conversation history and private notes follow the customer.
- **Saved replies** — maintain a personal library of up to 25 reusable replies (label, subject, body, category) stored on the root settings record.

---

## 11. Support Contact Governance

- **Root's own support contact** (`PUT /api/admin/me/support-contact`) or the admin-console support modal — the default email + phone shown to customers with no assigned administrator, or whose administrator is disabled.
- **Per-staff support contact** — set any staff member's contact details from the staff table, so that member's assigned customers see them in their message center.
- **Reset the root support contact** as part of simulator settings or a backup restore.
- Contact fields are strictly display information — they configure no email or SMS delivery.

---

## 12. Global Platform Settings — **root-only**

`GET / PUT /api/admin/settings`

| Setting | Effect |
| --- | --- |
| `allowEnrollment` | Enable/disable public customer self-registration. When off, `POST /api/auth/register` returns `403`, and the attempt is audited as a blocked security event. |
| `allowCustomerPasswordReset` | Enable/disable self-service password recovery. When off, `POST /api/auth/reset-password` returns `403`, audited as blocked. |
| `rootSupportContact` | Default support email + phone for unassigned customers. |

Non-root staff calling `GET /api/admin/settings` see only those two booleans; every `PUT` is refused with "Super administrator access required."

---

## 13. Backup, Restore & Environment Reset — **root-only**

### 13.1 Export
`GET /api/admin/backup`

- Download a **v2 JSON snapshot** (`simulator-backup-v1`) containing:
  - **All customer records** (accounts, ledgers, payees, schedules, disputes, messages, staff notes, banners)
  - **All staff administrator records** including password hashes
  - **Global settings** (enrollment, password reset, root support contact)
- The export itself is audited.

### 13.2 Restore
`POST /api/admin/backup` — requires typing `RESTORE SIMULATOR BACKUP`.

- **Validate before writing** — format check; up to 5,000 customers; each with a unique valid username, password hash, and account set of recognized types with finite balances.
- **Optional staff restore** (`restoreAdmins: true`) — up to 500 staff accounts, unique ids/usernames, valid roles and statuses, no `__root__` collision, no root username collision, and consistent linked-customer mapping.
- **Users-only restore guardrails** — refused with `409` while any linked staff account exists, or if a restored customer username collides with a staff username.
- **Ownership sanitization** — customers pointing at administrators that no longer exist are re-owned by the Super Administrator.
- **Session revocation** — a full restore (with staff) kills every non-root session; a users-only restore kills all customer sessions.
- **Single atomic commit** — the whole restore applies as one state write, so a Supabase compare-and-swap conflict cannot leave a partial restore.

### 13.3 Environment reset
`POST /api/admin/reset` — requires typing `RESET SIMULATOR`.

- Deletes **all customer profiles and customer sessions**, restores a clean baseline (no sample customers), and **retains the audit history**.
- Refused while any linked staff account exists (to prevent orphaning the personal banking side of a staff identity).

### 13.4 Retired operation
`POST /api/admin/seed-demo` is hard-disabled and returns `410 Gone` — demo seeding cannot be re-enabled through the API.

---

## 14. Audit Trail & Forensic Oversight — **root-only scope**

`GET /api/admin/audit`

- **See every entry in the system** — up to 5,000 enriched records. Limited admins and auditors see only their own actions.
- **Verify the tamper-evident SHA-256 hash chain** — root receives an `integrity` block with `valid`, `status` (`verified` / `tampered` / `legacy_only`), `totalEntries`, `chainedCount`, `legacyCount`, `tamperedIds`, `lastSeq`, `lastHash`, and `chainStartedAt`.
- **Tamper alerting** — a "Chain Mismatch" badge appears when any row has been altered or the linkage is broken.
- **Filter by category, outcome, actor type, and free text**; server-side pagination.
- **Actor-type filter exclusive to root** — Super Admin, Staff Admins, Read-Only Auditors, Customers, Unknown/Visitors.
- **Root-only "JSON Proof" export** — bundles the exported events *plus* the integrity verdict into a signed-off JSON evidence file.
- **CSV export** of the filtered trail with sequence, timestamp, status, who, role, category, plain-English description, failure reason, target, IP, device, and hash.
- **Every action listed in this document is written here** — logins, failed logins with exact reasons, blocked actions, money movement with before/after balances, staff CRUD with field-level diffs, backup export/restore, and settings changes.

---

## 15. Analytics, Oversight & Console Experience

### 15.1 Global overview
`GET /api/admin/overview?range=7d|30d|12w` across all customers:

- KPI metrics: total customers, suspended customers, accounts, deposit balances, card balances, loan balances, active scheduled payments, open disputes, transaction count.
- **Cashflow velocity** chart (daily for 7d/30d, weekly for 12w), inflow and outflow split.
- **Account portfolio mix** by product type.
- **Spending by merchant category**, top 6.
- **Credit utilization** — total balance, total limit, utilization percentage.
- Monthly inflow/outflow against the monthly target.
- **Global open-dispute queue** with customer and account context.
- **Unread message count** across the entire customer base.
- Recent audit entries (10, fully enriched).

### 15.2 System telemetry — **root-only**
Embedded in the overview response and rendered in Settings, the `system` block exposes:

- Runtime: Node version, platform, architecture.
- Uptime in seconds.
- Memory: RSS, heap used, heap total (MB).
- Storage backend: `supabase-postgres` or `local-json`, DB row path / file path, size in bytes, modified timestamp.
- **Active customer sessions**, **active admin sessions**, and **revoked session count**.
- Audit row count.

Non-root roles receive an empty `system` block — verified by the test suite.

> **Verification note on the two batch engines.** `POST /api/admin/process-scheduled` and
> `POST /api/admin/month-end-close` are Super Administrator operations. They are protected
> server-side by the admin router's **deny-by-default** rule, not by a per-route check:
> neither path matches the owned-customer regex (`/api/admin/users/:id/...`) nor appears in
> the `safeGlobal` allowlist, so any non-root caller receives `403 Super administrator access
> required.` The UI additionally hides the controls. Both behaviours were confirmed by direct
> request during a review pass — a previous revision of this document incorrectly claimed a
> limited administrator could reach them once the `manageAccounts` capability was toggled off.

### 15.3 Console experience
- **Nine tabs**: Overview, Customers, Accounts & cards, Ledger & statements, Pay & disputes, Wealth/rewards/credit, Messages & notices, Audit log, and **Settings & backup (root-only)**.
- **Settings & backup tab is invisible to every other role.**
- Super-administrator identity chip in the header.
- **Live alert bell** — root additionally sees security failures and blocked actions from the last 24 hours, alongside unread messages and open disputes.
- **Quick jump (⌘K / Ctrl+K)** — search customers, ledger entries, and console sections.
- **Failed/blocked badge** on the Audit tab when security events exist.
- One-click **Preview [customer]'s Banking** and **View as Customer** impersonation.
- Global refresh of metrics and ledgers.

### 15.4 Wealth, rewards & credit controls
On any customer: edit the credit score, score goal, score factors, and alerts; edit property valuation, contact details, 2-step verification, and alerts; edit credit-bureau tradelines and hard inquiries; configure monthly category budgets; and push custom cash-back offers.

---

## 16. Explicit Limits & Safeguards

What the Super Administrator **cannot** do — by design:

- **Cannot change its own password in-app** — it is managed only by the server-side root password environment variable, and the endpoint refuses.
- **Cannot be edited, demoted, renamed, disabled, or deleted** through the staff API — `PUT /api/admin/admins/__root__` accepts only `supportContact`, and `DELETE` is rejected.
- **Cannot be impersonated** — root has no linked customer identity, so there is nothing to switch to or preview as.
- **Cannot use the workspace switcher** (`POST /api/admin/switch-to-customer`) — that endpoint exists only for staff accounts that own a linked personal banking profile; for root it returns `400`.
- **Cannot delete a customer that is linked to a staff identity** — the link must be revoked first.
- **Cannot delete or empty a staff member who still owns customers** without supplying a replacement — `409` protects against orphaning.
- **Cannot restore a users-only backup** while linked staff accounts exist.
- **Cannot reset the environment** while linked staff accounts exist.
- **Cannot restore or delete without typed confirmation phrases** (`RESTORE SIMULATOR BACKUP`, `RESET SIMULATOR`, `DELETE SELECTED USERS`, `DELETE SELECTED ACCOUNTS`).
- **Cannot import a backup that collides with the root username or `__root__` id.**
- **Cannot exceed hard caps** — 5,000 customers per backup, 500 staff accounts per restore, 100 rows per bulk action, 2,500 generated events per run, 25 saved replies, 5,000 audit rows, 24-hour audit pagination limit of 5,000 per request.
- **Cannot bypass audits** — every mutation is recorded server-side before it is reported as successful.
- **Cannot keep sessions alive across credential changes** — role, status, username, and password changes invalidate sessions; a linked staff password reset also signs out the customer side.

### Precedence rules the root enforces on everyone else
For completeness, the constraints the Super Administrator imposes on subordinate roles:

- **Limited administrators** see only customers they own; global endpoints are denied by an allowlist; writes to staff accounts and settings return `403`; **overdrafting customer deposit balances is forbidden (`403` with an audited security block)** and standard dollar ceilings apply; each of the six capabilities and three permissions is enforced server-side with an audited block on denial.
- **Read-only auditors** may only `GET`, plus sign out, change their own password, and switch to their linked banking view; every other write is blocked and audited.
- **Linked staff** share one password across both identities; a suspended customer profile blocks administrator sign-in with a `403`; the shared password must be at least 10 characters.
- **Failed sign-ins** lock out after 10 attempts in 15 minutes per IP and username, with the exact reason and attempt count recorded.

---

## Appendix A — Root-Only Endpoints

| Method | Endpoint |
| --- | --- |
| GET | `/api/admin/admins` |
| POST | `/api/admin/admins` |
| PUT / DELETE | `/api/admin/admins/:id` |
| PUT | `/api/admin/admins/__root__` (support contact only) |
| POST | `/api/admin/admins/:id/link-customer` |
| POST | `/api/admin/admins/:id/reassign-customers` |
| POST | `/api/admin/users/:id/promote` |
| PUT | `/api/admin/users/:id/assign-admin` |
| POST | `/api/admin/users/:id/accounts/:accountId/overdraft` |
| GET / PUT | `/api/admin/settings` |
| GET / POST | `/api/admin/backup` |
| POST | `/api/admin/reset` |
| POST | `/api/admin/process-scheduled` |
| POST | `/api/admin/month-end-close` |
| POST | `/api/admin/me/revoke-all-sessions` |
| GET | `/api/admin/audit` — full-scope view plus integrity verification |

## Appendix B — Elevations Over Shared Endpoints

These endpoints are used by all administrators, but root gets materially more from them:

| Endpoint | What root gets that others do not |
| --- | --- |
| `GET /api/admin/overview` | Portfolio-wide metrics, all disputes, all unread counts, and the `system` telemetry block |
| `GET /api/admin/users` | `ownerAdminId`, `linkedAdminId`, `linkedAdminRole`, `linkedAdminStatus` and every customer, not just owned ones |
| `GET /api/admin/transactions` | Cross-customer ledger instead of owned-customer scope |
| `GET /api/admin/messages` | Every conversation in the system |
| `GET /api/admin/audit` | All entries plus chain integrity and tamper detection |
| `GET /api/admin/settings` | The full settings object instead of two booleans |
| `GET /api/admin/replies` | The root's own saved-reply library on the settings record |
| `POST /api/admin/users` | Optional initial owner assignment (`ownerAdminId`) |
| `PUT /api/admin/users/:id` | Unrestricted account balances (including negative overdrafts of any magnitude, with no $100,000,000 cap) |
| `POST / PUT /api/admin/users/:id/accounts[/:accountId]` | Unrestricted positive or negative/overdraft balances and uncapped limits |
| `POST / PUT / DELETE /api/admin/users/:id/transactions[/:txId]` | Unrestricted amounts (no $10,000,000 cap) and full deposit-account overdraft authority |
| `POST /api/admin/users/:id/transfers` | Bypasses source sufficient-funds check, $10,000,000 transfer cap, and loan-principal cap to allow overdrafting to any amount |
| `POST / PUT /api/admin/users/:id/scheduled[/:id]` | Uncapped scheduled payment amounts |
| `POST /api/admin/users/bulk` | Bulk actions across any customers, not just owned ones |
| `PUT /api/admin/me/support-contact` | Writes the global default contact instead of a personal one |

## Appendix C — Audit Coverage

Every capability in this document produces an audit record. The categories are: `auth`, `security`, `money`, `accounts`, `customers`, `staff`, `support`, `system`. Each record captures actor, actor type, action, outcome (`success` / `failed` / `blocked` / `warning`), severity, plain-English summary, reason, target, structured details (including before/after diffs), IP address, device string, timestamp, and a SHA-256 hash chained to the previous entry.
