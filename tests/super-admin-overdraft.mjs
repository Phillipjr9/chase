/**
 * Comprehensive verification of unrestricted Super Administrator overdraft authority:
 * - Dedicated POST /api/admin/users/:id/accounts/:accountId/overdraft (targetBalance "set" & "debit" modes,
 *   arbitrary negative amounts beyond $100M/$1B, optional reconciling ledger entry, input validation)
 * - Direct negative / uncapped balance creation & editing on POST/PUT /api/admin/users/:id/accounts
 * - Unrestricted ledger overdrafts on POST/PUT/DELETE /api/admin/users/:id/transactions (including > $10M)
 * - Unrestricted transfer overdrafts on POST /api/admin/users/:id/transfers (bypassing sufficient-funds & $10M cap)
 * - Scheduled payment creation & batch execution overdrafts via POST /api/admin/process-scheduled (allowOverdraft)
 * - Unrestricted raw user document PUT /api/admin/users/:id (arbitrary negative balances + negative brokerage cash)
 * - Strict 403 enforcement + security audit block when subordinate Limited Admin attempts to create or deepen an overdraft,
 *   while still permitting Limited Admin to credit/recover an already-overdrafted account
 * - Customer session visibility of overdrafted balances and SHA-256 audit chain integrity
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.TEST_PORT || 3129);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT_USER = 'superadmin@chase.test';
const ROOT_PASS = 'SuperRootPassword123!';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chase-overdraft-test-'));
const dbFile = path.join(tempDir, 'db.json');

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    CHASE_DB_PATH: dbFile,
    CHASE_ADMIN_USERNAME: ROOT_USER,
    CHASE_ADMIN_PASSWORD: ROOT_PASS,
    ADMIN_SESSION_SECRET: 'overdraft-test-secret-0123456789',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Server did not start in time');
}

async function api(route, { method = 'GET', body, token, expected = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(
    res.status,
    expected,
    `${method} ${route} expected ${expected}, got ${res.status}: ${JSON.stringify(data)}`
  );
  return data;
}

try {
  await waitForHealth();

  /* 1. Authenticate as Super Admin and create a test customer + full-capability Limited Admin */
  const rootTok = (
    await api('/api/admin/login', {
      method: 'POST',
      body: { username: ROOT_USER, password: ROOT_PASS },
    })
  ).token;

  const limitedRes = await api('/api/admin/admins', {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      username: 'desk.operator',
      fullName: 'Desk Operator',
      email: 'desk.operator@chase.test',
      password: 'LimitedOperatorPass123!',
      role: 'admin',
    },
  });
  const limitedAdminId = limitedRes.admin.id;

  const limitedTok = (
    await api('/api/admin/login', {
      method: 'POST',
      body: { username: 'desk.operator', password: 'LimitedOperatorPass123!' },
    })
  ).token;

  const createdUserRes = await api('/api/admin/users', {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      fullName: 'Overdraft Test Customer',
      username: 'overdraft.customer',
      email: 'overdraft.customer@example.com',
      password: 'CustomerPass123!',
      ownerAdminId: limitedAdminId,
    },
  });
  const userId = createdUserRes.user.id;
  const checking = (
    await api(`/api/admin/users/${userId}/accounts`, {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: { type: 'checking', name: 'Chase Total Checking', balance: 1000 },
    })
  ).account;
  const savings = (
    await api(`/api/admin/users/${userId}/accounts`, {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: { type: 'savings', name: 'Chase Savings', balance: 2500 },
    })
  ).account;
  assert.ok(checking && savings, 'Expected seeded checking and savings accounts');

  /* 2. Dedicated POST /api/admin/users/:id/accounts/:accountId/overdraft */
  // 2a. Set exact negative balance (-$250.75) with reconciling transaction
  const od1 = await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: {
      targetBalance: -250.75,
      description: 'Initial Super Admin Overdraft',
      category: 'Adjustment',
      recordTransaction: true,
    },
  });
  assert.equal(od1.previousBalance, 1000);
  assert.equal(od1.newBalance, -250.75);
  assert.equal(od1.delta, -1250.75);
  assert.ok(od1.transaction, 'Expected reconciling transaction');
  assert.equal(od1.transaction.amount, -1250.75);
  assert.equal(
    od1.user.accounts.find((a) => a.id === checking.id).balance,
    -250.75
  );

  // 2b. Set extreme negative balance beyond $100M/$1B (-$5,000,000,000.99)
  const od2 = await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: {
      targetBalance: -5000000000.99,
      description: 'Five Billion Overdraft',
      recordTransaction: true,
    },
  });
  assert.equal(od2.newBalance, -5000000000.99);
  assert.equal(od2.delta, -4999999750.24);

  // 2c. Debit mode (`amount`) deepens overdraft by another $250,000,000 without recording a tx
  const txCountBefore = od2.account.transactions.length;
  const od3 = await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: {
      amount: 250000000,
      recordTransaction: false,
    },
  });
  assert.equal(od3.newBalance, -5250000000.99);
  assert.equal(od3.transaction, undefined);
  assert.equal(od3.account.transactions.length, txCountBefore);

  // 2d. Input validation rejects empty/boolean/missing payloads
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    expected: 400,
    body: {},
  });
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    expected: 400,
    body: { targetBalance: '' },
  });
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    expected: 400,
    body: { targetBalance: true },
  });

  /* 3. Account creation & editing with arbitrary negative balances */
  const negCreatedRes = await api(`/api/admin/users/${userId}/accounts`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      type: 'checking',
      name: 'Deep Overdraft Checking',
      balance: -450000000.25,
    },
  });
  const negAcctId = negCreatedRes.account.id;
  assert.equal(negCreatedRes.account.balance, -450000000.25);

  const negEditedRes = await api(`/api/admin/users/${userId}/accounts/${savings.id}`, {
    method: 'PUT',
    token: rootTok,
    body: {
      account: { balance: -1234567890.12 },
    },
  });
  assert.equal(negEditedRes.account.balance, -1234567890.12);

  /* 4. Ledger POST, PUT, and DELETE overdrafts (including > $10M) */
  // Reset checking to +$1,000 first
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 1000, recordTransaction: false },
  });

  // 4a. POST single -$75,000,000.50 debit -> checking becomes -$74,999,000.50
  const postTxRes = await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      accountId: checking.id,
      transaction: {
        amount: -75000000.5,
        description: 'Institutional Settlement Debit',
        category: 'Wire',
      },
    },
  });
  const bigTxId = postTxRes.transaction.id;
  assert.equal(
    postTxRes.user.accounts.find((a) => a.id === checking.id).balance,
    -74999000.5
  );

  // 4b. PUT edit transaction to -$250,000,000.00 -> checking becomes -$249,999,000.00
  const editTxRes = await api(`/api/admin/users/${userId}/transactions/${bigTxId}`, {
    method: 'PUT',
    token: rootTok,
    body: {
      transaction: { amount: -250000000 },
    },
  });
  assert.equal(
    editTxRes.user.accounts.find((a) => a.id === checking.id).balance,
    -249999000
  );

  // 4c. Reversal via DELETE places a positive account into overdraft
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 100, recordTransaction: false },
  });
  const depTx = await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      accountId: checking.id,
      transaction: { amount: 5000, description: 'Provisional Credit', category: 'Deposit' },
    },
  });
  await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      accountId: checking.id,
      transaction: { amount: -4000, description: 'Outgoing Wire', category: 'Wire' },
    },
  });
  // Balance is now 100 + 5000 - 4000 = 1100; deleting the +5000 credit reverses it to -3900!
  const delTxRes = await api(`/api/admin/users/${userId}/transactions/${depTx.transaction.id}`, {
    method: 'DELETE',
    token: rootTok,
    body: { confirm: true },
  });
  assert.equal(
    delTxRes.user.accounts.find((a) => a.id === checking.id).balance,
    -3900
  );

  /* 5. Unrestricted Super Admin Transfers (overdrafting source + exceeding $10M) */
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 500, recordTransaction: false },
  });
  await api(`/api/admin/users/${userId}/accounts/${savings.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 0, recordTransaction: false },
  });

  const xferRes = await api(`/api/admin/users/${userId}/transfers`, {
    method: 'POST',
    token: rootTok,
    body: {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: 85000000,
      transferType: 'wire',
      description: 'Super Admin Overdraft Wire',
    },
  });
  assert.equal(
    xferRes.user.accounts.find((a) => a.id === checking.id).balance,
    -84999500
  );
  assert.equal(
    xferRes.user.accounts.find((a) => a.id === savings.id).balance,
    85000000
  );

  /* 6. Scheduled Payment creation (> $10M) & Batch Execution Overdraft */
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 200, recordTransaction: false },
  });

  const schedRes = await api(`/api/admin/users/${userId}/scheduled`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      payment: {
        kind: 'transfer',
        label: 'Treasury Clearing House',
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amount: 25000000,
        date: '2026-01-15',
        frequency: 'once',
      },
    },
  });
  const schedId = schedRes.payment.id;

  // When allowOverdraft is explicitly false, batch engine skips insufficient balance
  const skipRun = await api('/api/admin/process-scheduled', {
    method: 'POST',
    token: rootTok,
    body: {
      userId,
      paymentId: schedId,
      forceAll: true,
      allowOverdraft: false,
    },
  });
  assert.equal(skipRun.processedCount, 0);

  // When allowOverdraft is true (default), batch engine executes and overdrafts checking to -$24,999,800
  const execRun = await api('/api/admin/process-scheduled', {
    method: 'POST',
    token: rootTok,
    body: {
      userId,
      paymentId: schedId,
      forceAll: true,
    },
  });
  assert.equal(execRun.processedCount, 1);

  const afterSchedUser = (await api(`/api/admin/users/${userId}`, { token: rootTok })).user;
  assert.equal(
    afterSchedUser.accounts.find((a) => a.id === checking.id).balance,
    -24999800
  );

  /* 7. Subordinate Limited Admin is strictly blocked (403) from creating or deepening overdrafts */
  // Set savings to +$100 and checking to -$1,000 for boundary checks
  await api(`/api/admin/users/${userId}/accounts/${savings.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: 100, recordTransaction: false },
  });
  await api(`/api/admin/users/${userId}/accounts/${checking.id}/overdraft`, {
    method: 'POST',
    token: rootTok,
    body: { targetBalance: -1000, recordTransaction: false },
  });

  // 7a. Root-only /overdraft endpoint returns 403 for Limited Admin
  await api(`/api/admin/users/${userId}/accounts/${savings.id}/overdraft`, {
    method: 'POST',
    token: limitedTok,
    expected: 403,
    body: { targetBalance: -50 },
  });

  // 7b. Creating an account with negative balance returns 403 for Limited Admin
  await api(`/api/admin/users/${userId}/accounts`, {
    method: 'POST',
    token: limitedTok,
    expected: 403,
    body: { type: 'checking', name: 'Unauthorized Overdraft', balance: -1 },
  });

  // 7c. Editing savings (+100 -> -10) or deepening checking (-1000 -> -1500) returns 403
  await api(`/api/admin/users/${userId}/accounts/${savings.id}`, {
    method: 'PUT',
    token: limitedTok,
    expected: 403,
    body: { account: { balance: -10 } },
  });
  await api(`/api/admin/users/${userId}/accounts/${checking.id}`, {
    method: 'PUT',
    token: limitedTok,
    expected: 403,
    body: { account: { balance: -1500 } },
  });

  // 7d. Posting a debit (-250 on +100 savings, or -50 on -1000 checking) returns 403
  await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: limitedTok,
    expected: 403,
    body: {
      accountId: savings.id,
      transaction: { amount: -250, description: 'Overdraft attempt' },
    },
  });
  await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: limitedTok,
    expected: 403,
    body: {
      accountId: checking.id,
      transaction: { amount: -50, description: 'Deepen overdraft attempt' },
    },
  });

  // 7e. Limited Admin CAN credit/reduce an existing overdraft (-1000 + 400 = -600) and lock an extreme-overdraft account
  const recoverRes = await api(`/api/admin/users/${userId}/transactions`, {
    method: 'POST',
    token: limitedTok,
    expected: 201,
    body: {
      accountId: checking.id,
      transaction: { amount: 400, description: 'Overdraft recovery deposit', category: 'Deposit' },
    },
  });
  assert.equal(
    recoverRes.user.accounts.find((a) => a.id === checking.id).balance,
    -600
  );

  // Deleting that recovery deposit would push checking back down from -600 to -1000 (deepening overdraft) -> 403!
  await api(`/api/admin/users/${userId}/transactions/${recoverRes.transaction.id}`, {
    method: 'DELETE',
    token: limitedTok,
    expected: 403,
    body: { confirm: true },
  });

  // Locking the -$450M account without changing its balance succeeds for Limited Admin
  const lockExtremeRes = await api(`/api/admin/users/${userId}/accounts/${negAcctId}`, {
    method: 'PUT',
    token: limitedTok,
    body: { account: { locked: true } },
  });
  assert.equal(lockExtremeRes.account.locked, true);
  assert.equal(lockExtremeRes.account.balance, -450000000.25);

  // 7f. Transfer exceeding source funds returns 400 for Limited Admin
  await api(`/api/admin/users/${userId}/transfers`, {
    method: 'POST',
    token: limitedTok,
    expected: 400,
    body: {
      fromAccountId: savings.id,
      toAccountId: checking.id,
      amount: 500,
      transferType: 'internal',
    },
  });

  /* 8. Raw PUT /api/admin/users/:id by Super Admin with -$9,999,999,999.99 + Customer sign-in + Audit Chain */
  const latestCustomer = (await api(`/api/admin/users/${userId}`, { token: rootTok })).user;

  // Limited Admin attempting raw PUT to deepen overdraft -> 403
  const tamperedForLimited = structuredClone(latestCustomer);
  tamperedForLimited.accounts.find((a) => a.id === savings.id).balance = -999;
  await api(`/api/admin/users/${userId}`, {
    method: 'PUT',
    token: limitedTok,
    expected: 403,
    body: { user: tamperedForLimited },
  });

  // Super Admin setting -$9,999,999,999.99 (~-$10B) and negative brokerage sweep cash -> 200
  const extremeUserDoc = structuredClone(latestCustomer);
  extremeUserDoc.accounts.find((a) => a.id === checking.id).balance = -9999999999.99;
  extremeUserDoc.investments = {
    accountMask: '8841',
    cash: -75000.55,
    holdings: [],
  };
  const savedExtreme = await api(`/api/admin/users/${userId}`, {
    method: 'PUT',
    token: rootTok,
    body: { user: extremeUserDoc },
  });
  assert.equal(
    savedExtreme.user.accounts.find((a) => a.id === checking.id).balance,
    -9999999999.99
  );
  assert.equal(savedExtreme.user.investments.cash, -75000.55);

  // Customer signs in and sees exact overdrafted balance
  const custSession = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'overdraft.customer', password: 'CustomerPass123!' },
  });
  assert.equal(
    custSession.user.accounts.find((a) => a.id === checking.id).balance,
    -9999999999.99
  );

  // Immutable SHA-256 audit chain remains 100% valid and includes both overdraft & blocked security entries
  const auditRes = await api('/api/admin/audit?limit=5000', { token: rootTok });
  assert.equal(auditRes.integrity.valid, true, 'Expected unbroken SHA-256 audit chain');
  assert.ok(
    auditRes.audit.some((e) => e.action === 'Overdrafted simulator account balance' && e.category === 'money'),
    'Expected Overdrafted simulator account balance audit record'
  );
  assert.ok(
    auditRes.audit.some((e) => e.action === 'Blocked non-super-admin account overdraft attempt' && e.outcome === 'blocked'),
    'Expected Blocked non-super-admin account overdraft attempt audit record'
  );

  console.log('✓ All Super Administrator unrestricted overdraft & non-super-admin 403 tests passed!');
} finally {
  server.kill('SIGTERM');
  fs.rmSync(tempDir, { recursive: true, force: true });
}
