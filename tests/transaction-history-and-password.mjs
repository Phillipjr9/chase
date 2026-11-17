import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3012';

async function api(path, { token, body, method = body ? 'POST' : 'GET', status = 200 } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(res.status, status, `${method} ${path} expected ${status}, got ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function assertSortedDesc(transactions, label) {
  for (let i = 1; i < transactions.length; i += 1) {
    const prev = new Date(transactions[i - 1].date).getTime();
    const curr = new Date(transactions[i].date).getTime();
    assert.ok(prev >= curr, `${label}: transaction[${i - 1}] (${transactions[i - 1].date}) should be >= transaction[${i}] (${transactions[i].date})`);
  }
}

const root = (
  await api('/api/admin/login', {
    body: { username: 'dianasmith6525@gmail.com', password: 'Temporary-test-password-92!' },
  })
).token;

// 1. Create a customer + accounts created TODAY with backdated openedDate (like live Duran.mcruz!)
const createdUser = (
  await api('/api/admin/users', {
    token: root,
    status: 201,
    body: {
      username: 'history.customer',
      fullName: 'History Customer',
      email: 'history@example.test',
      password: 'InitialPassword123!',
    },
  })
).user;

const personalChecking = (
  await api(`/api/admin/users/${createdUser.id}/accounts`, {
    token: root,
    status: 201,
    body: {
      type: 'checking',
      name: 'Chase Checking',
      balance: 25000,
      openedDate: '2015-03-17',
    },
  })
).account;
assert.equal(personalChecking.openedDate, '2015-03-17');

const businessChecking = (
  await api(`/api/admin/users/${createdUser.id}/accounts`, {
    token: root,
    status: 201,
    body: {
      type: 'checking',
      name: 'Chase Business Complete Banking',
      balance: 100000,
      openedDate: '2020-02-19',
    },
  })
).account;

const savings = (
  await api(`/api/admin/users/${createdUser.id}/accounts`, {
    token: root,
    status: 201,
    body: {
      type: 'savings',
      name: 'Chase Savings',
      balance: 15000,
      openedDate: '2018-04-08',
    },
  })
).account;

const card = (
  await api(`/api/admin/users/${createdUser.id}/accounts`, {
    token: root,
    status: 201,
    body: {
      type: 'credit-card',
      name: 'Chase Sapphire Reserve',
      balance: 0,
      creditLimit: 50000,
      openedDate: '2020-05-27',
    },
  })
).account;

// 2. Generate historical transactions strictly in the past (2022–2024) — must honor openedDate, NOT createdAt!
const genAll = await api(`/api/admin/users/${createdUser.id}/generate-transactions`, {
  token: root,
  body: {
    startDate: '2022-01-15',
    endDate: '2024-12-15',
    cadence: 'monthly',
    perPeriod: 2,
    accountId: 'all',
  },
});
assert.ok(genAll.transactionsAdded >= 50, `Expected >=50 historical transactions, got ${genAll.transactionsAdded}`);

const afterAll = genAll.user;
const chk1After = afterAll.accounts.find((a) => a.id === personalChecking.id);
const chk2After = afterAll.accounts.find((a) => a.id === businessChecking.id);
assert.ok(chk1After.transactions.length > 0, 'personal checking should have past transactions');
assert.ok(chk2After.transactions.length > 0, 'second checking account should also receive past transactions');
for (const acc of afterAll.accounts) {
  assertSortedDesc(acc.transactions, `after generate-all ${acc.name}`);
  for (const tx of acc.transactions) {
    assert.ok(tx.date.slice(0, 10) >= '2022-01-15' && tx.date.slice(0, 10) <= '2024-12-15', `Expected generated date within 2022–2024, got ${tx.date}`);
  }
}

// 3. Account-specific history generation must ONLY affect the selected account (not leak into savings/card)
const savingsCountBefore = afterAll.accounts.find((a) => a.id === savings.id).transactions.length;
const chk1CountBefore = chk1After.transactions.length;
const genCardOnly = await api(`/api/admin/users/${createdUser.id}/generate-transactions`, {
  token: root,
  body: {
    startDate: '2021-01-10',
    endDate: '2021-06-10',
    cadence: 'monthly',
    perPeriod: 1,
    accountId: card.id,
  },
});
assert.equal(genCardOnly.user.accounts.find((a) => a.id === savings.id).transactions.length, savingsCountBefore, 'savings must be untouched when targeting card');
assert.equal(genCardOnly.user.accounts.find((a) => a.id === personalChecking.id).transactions.length, chk1CountBefore, 'checking must be untouched when targeting card');
assert.ok(genCardOnly.user.accounts.find((a) => a.id === card.id).transactions.some((t) => t.date.startsWith('2021-')), 'card must receive 2021 transactions');

// 4. Manually inserting an OLDER and a NEWER transaction via admin ledger maintains newest-first ordering
const manualOld = await api(`/api/admin/users/${createdUser.id}/transactions`, {
  token: root,
  status: 201,
  body: {
    accountId: personalChecking.id,
    transaction: {
      description: 'Legacy Opening Transfer',
      amount: 5000,
      category: 'Transfer',
      date: '2016-06-01T12:00:00.000Z',
      status: 'posted',
    },
  },
});
assertSortedDesc(manualOld.user.accounts.find((a) => a.id === personalChecking.id).transactions, 'after manual old tx');

const manualNew = await api(`/api/admin/users/${createdUser.id}/transactions`, {
  token: root,
  status: 201,
  body: {
    accountId: personalChecking.id,
    transaction: {
      description: 'Recent Payroll Deposit',
      amount: 12000,
      category: 'Income',
      date: '2026-10-20T12:00:00.000Z',
      status: 'posted',
    },
  },
});
const chkWithManual = manualNew.user.accounts.find((a) => a.id === personalChecking.id);
assertSortedDesc(chkWithManual.transactions, 'after manual new tx');
assert.equal(chkWithManual.transactions[0].description, 'Recent Payroll Deposit', 'newest manual tx must be first');
assert.equal(chkWithManual.transactions.at(-1).description, 'Legacy Opening Transfer', 'oldest manual tx must be last');

// Editing a transaction's date re-sorts newest-first
await api(`/api/admin/users/${createdUser.id}/transactions/${manualOld.transaction.id}`, {
  token: root,
  method: 'PUT',
  body: {
    transaction: { date: '2026-10-25T12:00:00.000Z' },
  },
});
const afterEdit = (await api(`/api/admin/users/${createdUser.id}`, { token: root })).user;
const chkAfterEdit = afterEdit.accounts.find((a) => a.id === personalChecking.id);
assertSortedDesc(chkAfterEdit.transactions, 'after editing tx date');
assert.equal(chkAfterEdit.transactions[0].description, 'Legacy Opening Transfer', 'edited date tx should move to top');

const totalTxBeforePasswordChange = afterEdit.accounts.reduce((sum, a) => sum + a.transactions.length, 0);
assert.ok(totalTxBeforePasswordChange >= 55);

// 5. Customer signs in on TWO sessions, changes password on session 1:
//    - session 1 receives refreshed user with ALL past transactions intact
//    - session 1 remains valid for GET /api/auth/me with ALL past transactions intact
//    - session 2 is revoked
//    - re-login with NEW password returns ALL past transactions intact and sorted newest-first
const session1 = await api('/api/auth/login', {
  body: { username: 'history.customer', password: 'InitialPassword123!' },
});
const session2 = await api('/api/auth/login', {
  body: { username: 'history.customer', password: 'InitialPassword123!' },
});
assert.equal(
  session1.user.accounts.reduce((s, a) => s + a.transactions.length, 0),
  totalTxBeforePasswordChange,
  'login must return all past transactions'
);

const pwChange = await api('/api/auth/change-password', {
  token: session1.token,
  body: {
    currentPassword: 'InitialPassword123!',
    newPassword: 'UpdatedCustomerPass456!',
  },
});
assert.equal(pwChange.ok, true);
assert.ok(pwChange.user, 'change-password must return refreshed user');
assert.equal(
  pwChange.user.accounts.reduce((s, a) => s + a.transactions.length, 0),
  totalTxBeforePasswordChange,
  'change-password response must preserve all past transactions'
);

// Session 1 still works & returns full history
const meAfterPwChange = await api('/api/auth/me', { token: session1.token });
assert.equal(
  meAfterPwChange.user.accounts.reduce((s, a) => s + a.transactions.length, 0),
  totalTxBeforePasswordChange,
  '/api/auth/me after password change must return all past transactions'
);
for (const acc of meAfterPwChange.user.accounts) {
  assertSortedDesc(acc.transactions, `/api/auth/me ${acc.name}`);
}

// Session 2 was revoked on password change
await api('/api/auth/me', { token: session2.token, status: 401 });

// Re-login with NEW password returns full history
const relogin = await api('/api/auth/login', {
  body: { username: 'history.customer', password: 'UpdatedCustomerPass456!' },
});
assert.equal(
  relogin.user.accounts.reduce((s, a) => s + a.transactions.length, 0),
  totalTxBeforePasswordChange,
  're-login after password change must return all past transactions'
);

// 6. Promote to linked admin (like Duran.mcruz), reset password via admin, verify full history survives!
await api(`/api/admin/users/${createdUser.id}/promote`, {
  token: root,
  status: 201,
  body: { confirm: true, role: 'admin' },
});
await api(`/api/admin/users/${createdUser.id}/reset-password`, {
  token: root,
  body: { confirm: true, password: 'AdminResetLinkedPass789!' },
});
// Old customer session revoked
await api('/api/auth/me', { token: relogin.token, status: 401 });
// Re-login as linked customer returns ALL past transactions
const linkedRelogin = await api('/api/auth/login', {
  body: { username: 'history.customer', password: 'AdminResetLinkedPass789!' },
});
assert.equal(
  linkedRelogin.user.accounts.reduce((s, a) => s + a.transactions.length, 0),
  totalTxBeforePasswordChange,
  'linked customer re-login after admin password reset must return all past transactions'
);
assert.ok(linkedRelogin.linkedAdmin, 'linkedAdmin metadata returned on customer login');

console.log('ALL transaction history (openedDate, sorting, accountId scoping) and password-change preservation tests passed!');
