/**
 * Smoke test for the simulator-only admin surface.
 *
 * Start the built fullstack server, then run:
 *   node tests/admin-api.mjs
 *
 * This creates and removes one temporary simulated customer. It does not use
 * real payment rails or reset the existing simulator database.
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.DEMO_ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.DEMO_ADMIN_PASSWORD || 'chaseadmin123';

async function api(path, { method = 'GET', body, token, expected = 200 } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

await api('/api/seed', { method: 'POST', body: {} });
const customerLoginAdmin = await api('/api/auth/login', {
  method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS },
});
assert.equal(customerLoginAdmin.admin.username, ADMIN_USER, 'customer sign-in detects admin credentials');
await api('/api/auth/me', { token: customerLoginAdmin.token, expected: 401 });
const adminLogin = await api('/api/admin/login', {
  method: 'POST',
  body: { username: ADMIN_USER, password: ADMIN_PASS },
});
const adminToken = adminLogin.token;
assert.ok(adminToken, 'admin login returns an admin session token');
const cookieLoginResponse = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
assert.equal(cookieLoginResponse.status, 200);
const cookieHeader = cookieLoginResponse.headers.get('set-cookie');
assert.match(cookieHeader || '', /chase_sim_admin_session=.*HttpOnly/);
const cookieMeResponse = await fetch(`${BASE}/api/admin/me`, { headers: { Cookie: cookieHeader.split(';')[0] } });
assert.equal(cookieMeResponse.status, 200, 'admin session cookie authenticates requests when Authorization is unavailable');
await api('/api/admin/users', { token: undefined, expected: 401 });
await api('/api/admin/me/password', { method: 'PUT', token: adminToken, expected: 400, body: { currentPassword: ADMIN_PASS, newPassword: 'rootnewpass123', confirm: true } });
const auditorUsername = `auditor-${Date.now()}`;
const createdAuditor = await api('/api/admin/admins', {
  method: 'POST', token: adminToken, expected: 201,
  body: { username: auditorUsername, fullName: 'Temporary Read Only Auditor', password: 'auditpass12345', role: 'auditor' },
});
try {
  const auditorLogin = await api('/api/admin/login', { method: 'POST', body: { username: auditorUsername, password: 'auditpass12345' } });
  assert.equal((await api('/api/admin/me', { token: auditorLogin.token })).admin.role, 'auditor');
  await api('/api/admin/overview', { token: auditorLogin.token });
  await api('/api/admin/backup', { token: auditorLogin.token, expected: 403 });
  await api('/api/admin/settings', { method: 'PUT', token: auditorLogin.token, expected: 403, body: { settings: { allowEnrollment: false, allowCustomerPasswordReset: false } } });
  const regularFormAuditor = await api('/api/auth/login', { method: 'POST', body: { username: auditorUsername, password: 'auditpass12345' } });
  assert.equal(regularFormAuditor.admin.role, 'auditor', 'admin accounts also sign in through the regular login form');
  await api(`/api/admin/admins/${encodeURIComponent(createdAuditor.admin.id)}`, { method: 'PUT', token: adminToken, body: { status: 'disabled' } });
  await api('/api/admin/me', { token: auditorLogin.token, expected: 401 });
  await api(`/api/admin/admins/${encodeURIComponent(createdAuditor.admin.id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
} finally {
  const currentAdmins = await api('/api/admin/admins', { token: adminToken }).catch(() => ({ admins: [] }));
  const leftover = currentAdmins.admins.find((admin) => admin.id === createdAuditor.admin.id);
  if (leftover) await api(`/api/admin/admins/${encodeURIComponent(leftover.id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
}
const operatorUsername = `operator-${Date.now()}`;
const createdOperator = await api('/api/admin/admins', { method: 'POST', token: adminToken, expected: 201, body: { username: operatorUsername, fullName: 'Temporary Admin Operator', password: 'operatorpass123', role: 'admin' } });
try {
  const operatorLogin = await api('/api/admin/login', { method: 'POST', body: { username: operatorUsername, password: 'operatorpass123' } });
  await api('/api/admin/me/password', { method: 'PUT', token: operatorLogin.token, expected: 400, body: { currentPassword: 'wrong', newPassword: 'operatornew123', confirm: true } });
  await api('/api/admin/me/password', { method: 'PUT', token: operatorLogin.token, body: { currentPassword: 'operatorpass123', newPassword: 'operatornew123', confirm: true } });
  await api('/api/admin/me', { token: operatorLogin.token, expected: 401 });
  await api('/api/admin/login', { method: 'POST', body: { username: operatorUsername, password: 'operatornew123' } });
} finally {
  await api(`/api/admin/admins/${encodeURIComponent(createdOperator.admin.id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
}

const promotedUsername = `promoted-admin-${Date.now()}`;
const promotedAdmin = await api('/api/admin/admins', {
  method: 'POST', token: adminToken, expected: 201,
  body: { username: promotedUsername, fullName: 'Promoted Admin User', password: 'promotepass123', role: 'auditor' },
});
try {
  const promotedLogin = await api('/api/admin/login', { method: 'POST', body: { username: promotedUsername, password: 'promotepass123' } });
  const beforePromotion = await api('/api/admin/me', { token: promotedLogin.token });
  assert.equal(beforePromotion.admin.role, 'auditor');
  const promotion = await api(`/api/admin/admins/${encodeURIComponent(promotedAdmin.admin.id)}`, {
    method: 'PUT', token: adminToken,
    body: { role: 'admin' },
  });
  assert.equal(promotion.needsReLogin, true, 'role promotion requires the admin to sign in again');
  await api('/api/admin/me', { token: promotedLogin.token, expected: 401 });
  const reLogin = await api('/api/admin/login', { method: 'POST', body: { username: promotedUsername, password: 'promotepass123' } });
  const afterPromotion = await api('/api/admin/me', { token: reLogin.token });
  assert.equal(afterPromotion.admin.role, 'admin', 'the promoted admin can access the admin dashboard after re-login');
} finally {
  await api(`/api/admin/admins/${encodeURIComponent(promotedAdmin.admin.id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
}

const normalLogin = await api('/api/auth/login', {
  method: 'POST', body: { username: 'chase', password: 'chase123' },
});
const customerCookieResponse = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'chase', password: 'chase123' }) });
const customerCookie = customerCookieResponse.headers.get('set-cookie');
assert.equal(customerCookieResponse.status, 200);
assert.match(customerCookie || '', /chase_sim_user_session=.*HttpOnly/);
const customerCookieMe = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: customerCookie.split(';')[0] } });
assert.equal(customerCookieMe.status, 200, 'customer session cookie authenticates requests without Authorization');
const bothCookies = `${cookieHeader.split(';')[0]}; ${customerCookie.split(';')[0]}`;
assert.equal((await fetch(`${BASE}/api/admin/me`, { headers: { Cookie: bothCookies } })).status, 200, 'admin cookie remains distinct from the customer cookie');
assert.equal((await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: bothCookies } })).status, 200, 'customer cookie remains distinct from the admin cookie');
assert.equal((await fetch(`${BASE}/api/admin/me`, { headers: { Cookie: bothCookies, Authorization: 'Bearer stale-or-proxy-token' } })).status, 200, 'a stale Authorization header does not override a valid admin cookie');
assert.equal((await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: bothCookies, Authorization: 'Bearer stale-or-proxy-token' } })).status, 200, 'a stale Authorization header does not override a valid customer cookie');
await api('/api/admin/users', { token: normalLogin.token, expected: 401 });
const overview = await api('/api/admin/overview', { token: adminToken });
assert.ok(overview.metrics.users >= 1);
const backup = await api('/api/admin/backup', { token: adminToken });
assert.equal(backup.format, 'chase-simulator-backup-v1');
await api('/api/admin/backup', { method: 'POST', token: adminToken, expected: 400, body: { ...backup, confirmText: 'wrong' } });
const restoredBackup = await api('/api/admin/backup', { method: 'POST', token: adminToken, body: { ...backup, confirmText: 'RESTORE SIMULATOR BACKUP' } });
assert.equal(restoredBackup.usersRestored, backup.users.length);
const originalSettings = (await api('/api/admin/settings', { token: adminToken })).settings;
try {
  const pausedSettings = await api('/api/admin/settings', { method: 'PUT', token: adminToken, body: { settings: { ...originalSettings, allowEnrollment: false, allowCustomerPasswordReset: false } } });
  assert.equal(pausedSettings.settings.allowEnrollment, false);
  await api('/api/auth/register', { method: 'POST', expected: 403, body: { username: `blocked-${Date.now()}`, firstName: 'Blocked', lastName: 'User', email: 'blocked@example.com', password: 'testpass123', product: 'total-checking' } });
  await api('/api/auth/reset-password', { method: 'POST', expected: 403, body: { username: 'chase', email: 'chase@example.com', newPassword: 'another123' } });
} finally {
  await api('/api/admin/settings', { method: 'PUT', token: adminToken, body: { settings: originalSettings } });
}

const suffix = String(Date.now());
const username = `admin-test-${suffix}`;
const created = await api('/api/admin/users', {
  method: 'POST',
  token: adminToken,
  expected: 201,
  body: { username, fullName: 'Admin Test Customer', email: `${username}@example.com`, password: 'testpass123' },
});
const id = created.user.id;
let customerPassword = 'testpass123';

try {
  const customerLogin = await api('/api/auth/login', { method: 'POST', body: { username, password: customerPassword } });
  const customerBeforeAction = (await api('/api/auth/me', { token: customerLogin.token })).user;
  const sourceAccount = customerBeforeAction.accounts.find((account) => account.type === 'checking');
  const destinationAccount = customerBeforeAction.accounts.find((account) => account.type === 'savings');
  await api('/api/transfers', { method: 'POST', token: customerLogin.token, body: { fromId: sourceAccount.id, toId: destinationAccount.id, amount: 1, memo: 'Customer session persistence test' } });
  const customerAfterAction = await api('/api/auth/me', { token: customerLogin.token });
  assert.equal(customerAfterAction.user.id, id, 'a customer remains authenticated after a normal account action');
  await api(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', token: adminToken, expected: 400, body: { password: 'newpass1234' } });
  customerPassword = 'newpass1234';
  await api(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', token: adminToken, body: { password: customerPassword, confirm: true } });
  await api('/api/auth/login', { method: 'POST', body: { username, password: customerPassword } });
  await api('/api/admin/users/bulk', { method: 'POST', token: adminToken, body: { ids: [id], action: 'suspend' } });
  await api('/api/auth/login', { method: 'POST', expected: 403, body: { username, password: customerPassword } });
  await api('/api/admin/users/bulk', { method: 'POST', token: adminToken, body: { ids: [id], action: 'reactivate' } });
  await api('/api/admin/users/bulk', { method: 'POST', token: adminToken, expected: 400, body: { ids: [id], action: 'delete' } });
  const accountCreated = await api(`/api/admin/users/${encodeURIComponent(id)}/accounts`, {
    method: 'POST', token: adminToken, expected: 201,
    body: { type: 'checking', name: 'Admin test checking', balance: 125.75 },
  });
  const testAccount = accountCreated.user.accounts.find((account) => account.name === 'Admin test checking');
  assert.ok(testAccount, 'admin can create a simulator account');
  const bulkLocked = await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/bulk`, { method: 'POST', token: adminToken, body: { accountIds: [testAccount.id], action: 'lock' } });
  assert.equal(bulkLocked.user.accounts.find((account) => account.id === testAccount.id).locked, true);
  await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/bulk`, { method: 'POST', token: adminToken, body: { accountIds: [testAccount.id], action: 'unlock' } });
  await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/bulk`, { method: 'POST', token: adminToken, expected: 400, body: { accountIds: [testAccount.id], action: 'delete' } });
  const accountUpdated = await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/${encodeURIComponent(testAccount.id)}`, {
    method: 'PUT', token: adminToken, body: { account: { balance: 222.22, locked: true, autopay: true } },
  });
  assert.equal(accountUpdated.user.accounts.find((account) => account.id === testAccount.id).balance, 222.22);
  assert.equal(accountUpdated.user.accounts.find((account) => account.id === testAccount.id).locked, true);
  const ledgerCreated = await api(`/api/admin/users/${encodeURIComponent(id)}/transactions`, {
    method: 'POST', token: adminToken, expected: 201,
    body: { accountId: testAccount.id, transaction: { description: 'Admin test debit', amount: -18.25, category: 'Test', date: new Date().toISOString(), status: 'pending' } },
  });
  assert.equal(ledgerCreated.user.accounts.find((account) => account.id === testAccount.id).balance, 203.97, 'ledger creation adjusts the account balance');
  const testTransaction = ledgerCreated.transaction;
  const ledgerUpdated = await api(`/api/admin/users/${encodeURIComponent(id)}/transactions/${encodeURIComponent(testTransaction.id)}`, {
    method: 'PUT', token: adminToken, body: { transaction: { description: 'Edited test debit', amount: -20, status: 'posted' } },
  });
  assert.equal(ledgerUpdated.user.accounts.find((account) => account.id === testAccount.id).balance, 202.22, 'editing a ledger entry applies the amount delta');
  await api(`/api/admin/users/${encodeURIComponent(id)}/transactions/${encodeURIComponent(testTransaction.id)}`, {
    method: 'DELETE', token: adminToken, expected: 400, body: {},
  });
  const ledgerDeleted = await api(`/api/admin/users/${encodeURIComponent(id)}/transactions/${encodeURIComponent(testTransaction.id)}`, {
    method: 'DELETE', token: adminToken, body: { confirm: true },
  });
  assert.equal(ledgerDeleted.user.accounts.find((account) => account.id === testAccount.id).balance, 222.22, 'deleting a ledger entry reverses its amount');
  await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/${encodeURIComponent(testAccount.id)}`, {
    method: 'DELETE', token: adminToken, expected: 400, body: {},
  });
  await api(`/api/admin/users/${encodeURIComponent(id)}/accounts/${encodeURIComponent(testAccount.id)}`, {
    method: 'DELETE', token: adminToken, body: { confirm: true },
  });

  const payee = await api(`/api/admin/users/${encodeURIComponent(id)}/payees`, { method: 'POST', token: adminToken, expected: 201, body: { name: 'Test Utility', accountNumber: '•••• 9876', category: 'Utilities' } });
  const checkingAccount = payee.user.accounts.find((account) => account.type === 'checking');
  const savingsAccount = payee.user.accounts.find((account) => account.type === 'savings');
  const beforeFromBalance = checkingAccount.balance;
  const beforeToBalance = savingsAccount.balance;
  const transfer = await api(`/api/admin/users/${encodeURIComponent(id)}/transfers`, { method: 'POST', token: adminToken, body: { fromAccountId: checkingAccount.id, toAccountId: savingsAccount.id, amount: 25, description: 'Admin test transfer' } });
  assert.equal(transfer.user.accounts.find((account) => account.id === checkingAccount.id).balance, beforeFromBalance - 25);
  assert.equal(transfer.user.accounts.find((account) => account.id === savingsAccount.id).balance, beforeToBalance + 25);
  const schedule = await api(`/api/admin/users/${encodeURIComponent(id)}/scheduled`, { method: 'POST', token: adminToken, expected: 201, body: { payment: { kind: 'bill', label: 'Test Utility bill', fromAccountId: checkingAccount.id, payeeId: payee.payee.id, amount: 45, date: new Date(Date.now() + 86400000).toISOString(), frequency: 'monthly' } } });
  await api(`/api/admin/users/${encodeURIComponent(id)}/scheduled/${encodeURIComponent(schedule.payment.id)}`, { method: 'PUT', token: adminToken, body: { payment: { status: 'paused' } } });
  await api(`/api/admin/users/${encodeURIComponent(id)}/scheduled/${encodeURIComponent(schedule.payment.id)}`, { method: 'DELETE', token: adminToken, expected: 400, body: {} });
  await api(`/api/admin/users/${encodeURIComponent(id)}/scheduled/${encodeURIComponent(schedule.payment.id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
  const cardAccount = payee.user.accounts.find((account) => account.type === 'credit-card');
  const purchase = cardAccount.transactions.find((transaction) => transaction.amount > 0);
  const dispute = await api(`/api/admin/users/${encodeURIComponent(id)}/disputes`, { method: 'POST', token: adminToken, expected: 201, body: { accountId: cardAccount.id, transactionId: purchase.id, reason: 'Admin demo review' } });
  const beforeRefund = dispute.user.accounts.find((account) => account.id === cardAccount.id).balance;
  const refund = await api(`/api/admin/users/${encodeURIComponent(id)}/disputes/${encodeURIComponent(dispute.dispute.id)}/refund`, { method: 'POST', token: adminToken, body: { confirm: true } });
  assert.equal(refund.user.accounts.find((account) => account.id === cardAccount.id).balance, beforeRefund - purchase.amount, 'simulated refund adjusts the card balance');

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const generated = await api(`/api/admin/users/${encodeURIComponent(id)}/generate-transactions`, {
    method: 'POST', token: adminToken,
    body: { startDate, endDate, cadence: 'daily', perPeriod: 1 },
  });
  assert.equal(generated.eventsGenerated, 7);
  assert.ok(generated.transactionsAdded >= 7);
  const generatedRows = generated.user.accounts.flatMap((account) => account.transactions).filter((transaction) =>
    transaction.description.includes('simulated') || transaction.description.includes('Northstar Payroll')
  );
  assert.ok(generatedRows.some((transaction) => Math.round(Math.abs(transaction.amount) * 100) % 100 !== 0), 'generated history includes randomized cents');
  const globalLedger = await api(`/api/admin/transactions?q=${encodeURIComponent(username)}&limit=50`, { token: adminToken });
  assert.ok(globalLedger.total >= generated.transactionsAdded, 'admin global transaction search includes the selected simulator customer');
  assert.ok(globalLedger.transactions.every((row) => row.userId === id));
  const monthHistory = await api(`/api/admin/users/${encodeURIComponent(id)}/generate-transactions`, {
    method: 'POST', token: adminToken,
    body: { startDate: new Date(Date.now() - 92 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate, cadence: 'monthly', perPeriod: 1 },
  });
  assert.ok(monthHistory.eventsGenerated >= 3);
  const yearHistory = await api(`/api/admin/users/${encodeURIComponent(id)}/generate-transactions`, {
    method: 'POST', token: adminToken,
    body: { startDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate, cadence: 'yearly', perPeriod: 1 },
  });
  assert.ok(yearHistory.eventsGenerated >= 1);

  const detail = await api(`/api/admin/users/${encodeURIComponent(id)}`, { token: adminToken });
  detail.user.accounts[0].balance = 4321.09;
  detail.user.budgets = { Dining: 500 };
  const saved = await api(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT', token: adminToken, body: { user: detail.user },
  });
  assert.equal(saved.user.accounts[0].balance, 4321.09);
  assert.deepEqual(saved.user.budgets, { Dining: 500 });

  const suspended = { ...saved.user, status: 'suspended' };
  await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', token: adminToken, body: { user: suspended } });
  await api('/api/auth/login', {
    method: 'POST', expected: 403,
    body: { username, password: customerPassword },
  });

  const preview = await api(`/api/admin/users/${encodeURIComponent(id)}/impersonate`, {
    method: 'POST', token: adminToken, body: {},
  });
  const me = await api('/api/auth/me', { token: preview.token });
  assert.equal(me.user.id, id, 'admin impersonation opens a customer session, even for a suspended profile');
  await api(`/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { method: 'POST', token: adminToken, body: {} });
  await api('/api/auth/me', { token: preview.token, expected: 401 });

  await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', token: adminToken, expected: 400, body: {} });
  const audit = await api('/api/admin/audit', { token: adminToken });
  assert.ok(audit.audit.some((entry) => entry.action === 'Started user impersonation'));
  console.log('Admin API smoke test passed: roles, backup/restore, settings, account and ledger reconciliation, global activity search, payees, schedules, disputes/refunds, confirmations, bulk user/account actions, session controls, impersonation, and audit.');
} finally {
  await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', token: adminToken, body: { confirm: true } });
}
