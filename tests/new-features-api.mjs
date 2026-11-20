/**
 * Support messaging, dashboard notices, month-end close & scheduled processing.
 *
 * Runs against an existing server. Boot one first, e.g.:
 *   CHASE_DB_PATH=/tmp/features.json PORT=3001 \
 *   CHASE_ADMIN_PASSWORD='Temporary-test-password-92!' node server/index.js
 *   BASE_URL=http://127.0.0.1:3001 \
 *   TEST_ROOT_PASSWORD='Temporary-test-password-92!' node tests/new-features-api.mjs
 *
 * This suite previously depended on a seeded demo account, which no longer
 * exists (POST /api/seed returns 410 and staff sign-in requires a username).
 * It now provisions its own customer from the Super Administrator account.
 */
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3001';
const ROOT_USER = process.env.CHASE_ADMIN_USERNAME || 'dianasmith6525@gmail.com';
const ROOT_PASS =
  process.env.CHASE_ADMIN_PASSWORD ||
  process.env.TEST_ROOT_PASSWORD ||
  'Temporary-test-password-92!';

async function api(path, token, body, expected = 200, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

// Super Administrator sign-in (username + password).
const admin = (await api('/api/admin/login', null, { username: ROOT_USER, password: ROOT_PASS })).token;

// Provision this run's own customer with a checking + savings account.
const suffix = Math.random().toString(36).slice(2, 8);
const username = `feat.customer.${suffix}`;
const created = await api('/api/admin/users', admin, {
  username,
  fullName: 'Feature Test Customer',
  email: `${username}@example.test`,
  password: 'FeatureCustomer123!',
}, 201);
const id = created.user.id;

for (const [type, name, balance] of [['checking', 'Everyday Checking', 4200], ['savings', 'Savings', 1500]]) {
  await api(`/api/admin/users/${id}/accounts`, admin, { type, name, balance }, 201);
}

const login = await api('/api/auth/login', null, { username, password: 'FeatureCustomer123!' });
const token = login.token;
const route = `/api/admin/users/${encodeURIComponent(id)}`;

/* ---- Secure messaging ---- */
await api('/api/messages', token, { subject: 'Test', body: 'Hello support', category: 'general' }, 201);
let threads = (await api('/api/admin/messages', admin)).threads;
assert.equal(threads.find((t) => t.userId === id).unreadForAdmin, 1, 'customer message increments admin unread count');

await api(`${route}/messages/read`, admin, {});
threads = (await api('/api/admin/messages', admin)).threads;
assert.equal(threads.find((t) => t.userId === id).unreadForAdmin, 0, 'marking read clears the unread count');

await api(`${route}/messages`, admin, { subject: 'Reply', body: 'Hello customer' }, 201);
let me = (await api('/api/auth/me', token)).user;
assert(me.messages.some((m) => m.sender === 'advisor' && !m.readByCustomer), 'admin reply is unread for the customer');

await api('/api/messages/read', token, {});
me = (await api('/api/auth/me', token)).user;
assert(me.messages.every((m) => m.readByCustomer), 'customer read receipt is recorded');

/* ---- Dashboard notice publish + dismiss ---- */
await api(`${route}/notice`, admin, {
  notice: { title: 'Test notice', message: 'Hello', tone: 'info', dismissible: true },
}, 200, 'PUT');
me = (await api('/api/auth/me', token)).user;
assert.equal(me.accountNotice.title, 'Test notice');

me = (await api('/api/notice/dismiss', token, {})).user;
assert.equal(me.accountNotice, null, 'dismissible notice clears');

/* ---- Month-end close (idempotent per cycle) ---- */
const close = await api('/api/admin/month-end-close', admin, { userId: id });
assert(close.accountsProcessed > 0, 'month-end close processes accounts');
const second = await api('/api/admin/month-end-close', admin, { userId: id });
assert.equal(second.accountsProcessed, 0, 'close is idempotent within a cycle');

/* ---- Scheduled payment execution rolls the schedule forward ---- */
me = (await api('/api/auth/me', token)).user;
const checking = me.accounts.find((a) => a.type === 'checking');
const savings = me.accounts.find((a) => a.type === 'savings');
const scheduled = await api(`${route}/scheduled`, admin, {
  payment: {
    kind: 'transfer',
    label: 'Test transfer',
    fromAccountId: checking.id,
    toAccountId: savings.id,
    amount: 1,
    date: '2020-01-31',
    frequency: 'monthly',
  },
}, 201);

const run = await api('/api/admin/process-scheduled', admin, { userId: id, paymentId: scheduled.payment.id });
assert.equal(run.processedCount, 1, 'one scheduled payment is executed');
assert.equal(
  run.user.scheduledPayments.find((p) => p.id === scheduled.payment.id).date.slice(0, 10),
  '2020-02-29',
  'monthly schedule advances to the next cycle (Feb 29 in a leap year)'
);

/* ---- Clean up this run's customer ---- */
await api(`${route}`, admin, { confirm: true }, 200, 'DELETE');

console.log('New feature API tests passed.');
