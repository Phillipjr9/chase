/**
 * Unified regression test verifying all merged admin & customer features work together:
 * - Account opening dates (openedDate on create, edit, and history generation)
 * - Transfer types & sanitized customer-facing ledger descriptions
 * - Limited admin linked checking account transfers (/send-from-checking & /api/admin/me)
 * - Limited admin own support contact update (/api/admin/me/support-contact)
 * - Customer phone & address creation/editing
 * - Customer login by email OR username
 * - Cloudflare Worker request handler (worker/index.js -> handleCloudflareRequest)
 * - Immutable Audit Trail SHA-256 chain remains valid across all operations
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.TEST_PORT || 3118);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT_USER = 'superadmin@chase.test';
const ROOT_PASS = 'SuperRootPassword123!';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chase-unified-test-'));
const dbFile = path.join(tempDir, 'db.json');

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    CHASE_DB_PATH: dbFile,
    CHASE_ADMIN_USERNAME: ROOT_USER,
    CHASE_ADMIN_PASSWORD: ROOT_PASS,
    ADMIN_SESSION_SECRET: 'unified-test-secret-0123456789',
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
  assert.equal(res.status, expected, `${method} ${route} expected ${expected}, got ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

try {
  await waitForHealth();

  /* 1. Super Admin login + create linked limited admin with checking account */
  const rootTok = (await api('/api/admin/login', { method: 'POST', body: { username: ROOT_USER, password: ROOT_PASS } })).token;

  const linkedAdminRes = await api('/api/admin/admins', {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: {
      username: 'ops.manager',
      fullName: 'Ops Manager',
      email: 'ops.manager@example.test',
      password: 'OpsPassword123!',
      role: 'admin',
      createCustomerProfile: true,
    },
  });
  const linkedAdminUserId = linkedAdminRes.user.id;

  // Give linked admin a personal checking account with custom openedDate
  const opsChecking = (
    await api(`/api/admin/users/${linkedAdminUserId}/accounts`, {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: { type: 'checking', name: 'Operating Checking', balance: 5000, openedDate: '2022-05-15' },
    })
  ).account;
  assert.equal(opsChecking.openedDate, '2022-05-15', 'account openedDate saved on creation');

  // Update openedDate via PUT
  const updatedAcctRes = await api(`/api/admin/users/${linkedAdminUserId}/accounts/${opsChecking.id}`, {
    method: 'PUT',
    token: rootTok,
    body: { account: { openedDate: '2021-11-01', balance: 5000 } },
  });
  assert.equal(
    updatedAcctRes.user.accounts.find((a) => a.id === opsChecking.id)?.openedDate,
    '2021-11-01',
    'account openedDate updated cleanly'
  );

  /* 2. Limited Admin login -> verify linkedCheckingAccounts + support-contact update */
  const opsTok = (await api('/api/admin/login', { method: 'POST', body: { username: 'ops.manager', password: 'OpsPassword123!' } })).token;
  const opsMe = await api('/api/admin/me', { token: opsTok });
  assert.equal(opsMe.admin.linkedCheckingAccounts.length, 1);
  assert.equal(opsMe.admin.linkedCheckingAccounts[0].balance, 5000);

  await api('/api/admin/me/support-contact', {
    method: 'PUT',
    token: opsTok,
    body: { email: 'help.ops@example.test', phone: '(305) 555-0144' },
  });
  const opsMeAfter = await api('/api/admin/me', { token: opsTok });
  assert.equal(opsMeAfter.admin.supportContact.email, 'help.ops@example.test');
  assert.equal(opsMeAfter.admin.supportContact.phone, '(305) 555-0144');

  /* 3. Limited Admin creates customer with phone + address, edits both, and opens 2 accounts */
  const cust = (
    await api('/api/admin/users', {
      method: 'POST',
      token: opsTok,
      expected: 201,
      body: {
        username: 'client.maria',
        fullName: 'Maria Cruz',
        email: 'maria.cruz@example.test',
        phone: '(305) 555-0199',
        address: '100 Biscayne Blvd, Miami, FL 33132',
        password: 'MariaPassword123!',
      },
    })
  ).user;
  assert.equal(cust.phone, '(305) 555-0199');
  assert.equal(cust.address, '100 Biscayne Blvd, Miami, FL 33132');

  const custEdited = (
    await api(`/api/admin/users/${cust.id}`, {
      method: 'PUT',
      token: opsTok,
      body: { user: { phone: '(305) 555-0188', address: '200 Brickell Ave, Miami, FL 33131' } },
    })
  ).user;
  assert.equal(custEdited.phone, '(305) 555-0188');
  assert.equal(custEdited.address, '200 Brickell Ave, Miami, FL 33131');

  const custChecking = (
    await api(`/api/admin/users/${cust.id}/accounts`, {
      method: 'POST',
      token: opsTok,
      expected: 201,
      body: { type: 'checking', name: 'Chase Total Checking®', balance: 100, openedDate: '2023-01-15' },
    })
  ).account;
  const custSavings = (
    await api(`/api/admin/users/${cust.id}/accounts`, {
      method: 'POST',
      token: opsTok,
      expected: 201,
      body: { type: 'savings', name: 'Chase Savings℠', balance: 500, openedDate: '2023-01-15' },
    })
  ).account;

  /* 4. Limited Admin sends $750 from linked personal checking to assigned customer */
  const sendRes = await api(`/api/admin/users/${cust.id}/send-from-checking`, {
    method: 'POST',
    token: opsTok,
    body: {
      fromAccountId: opsChecking.id,
      toAccountId: custChecking.id,
      amount: 750,
      memo: 'Client retainer payout',
    },
  });
  assert.equal(sendRes.linkedCheckingAccounts[0].balance, 4250, 'linked checking debited accurately');
  assert.equal(sendRes.user.accounts.find((a) => a.id === custChecking.id)?.balance, 850, 'recipient checking credited accurately');

  /* 5. Transfer type & sanitized label (no "admin" leaked into customer ledger) */
  const xferRes = await api(`/api/admin/users/${cust.id}/transfers`, {
    method: 'POST',
    token: opsTok,
    body: {
      fromAccountId: custChecking.id,
      toAccountId: custSavings.id,
      amount: 200,
      transferType: 'direct-deposit',
      description: 'Admin payroll transfer',
    },
  });
  const savingsTx = xferRes.user.accounts.find((a) => a.id === custSavings.id)?.transactions[0];
  assert.ok(savingsTx, 'savings received transfer transaction');
  assert.doesNotMatch(savingsTx.description, /\badmin\b/i, 'customer ledger label never leaks "admin"');

  /* 6. Customer signs in using EMAIL instead of username */
  const emailLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'maria.cruz@example.test', password: 'MariaPassword123!' },
  });
  assert.equal(emailLogin.user.username, 'client.maria', 'customer login by email works');

  /* 7. Super Admin audit trail captures everything with intact SHA-256 hash chain */
  const auditRes = await api('/api/admin/audit?limit=5000', { token: rootTok });
  assert.equal(auditRes.integrity.valid, true, 'SHA-256 chain intact after all unified operations');
  assert.ok(auditRes.audit.some((e) => e.action === 'Sent funds from linked checking account to user' && /\$750\.00/.test(e.summary || '')));
  assert.ok(auditRes.audit.some((e) => e.action === 'Updated own simulator admin support contact' && /help\.ops@example\.test/.test(e.summary || '')));

  /* 8. Cloudflare Worker handler health check */
  process.env.CLOUDFLARE_WORKERS = '1';
  process.env.CHASE_DB_PATH = dbFile;
  const workerMod = (await import('../worker/index.js')).default;
  const cfRes = await workerMod.fetch(new Request('https://example.com/api/health'), {
    CHASE_ADMIN_USERNAME: ROOT_USER,
    CHASE_ADMIN_PASSWORD: ROOT_PASS,
  });
  assert.equal(cfRes.status, 200, 'Cloudflare Worker /api/health returns 200');
  const cfJson = await cfRes.json();
  assert.equal(cfJson.status, 'ok');

  console.log('ALL unified admin & customer feature tests passed!');
} finally {
  try {
    server.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
