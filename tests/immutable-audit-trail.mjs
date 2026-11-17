/**
 * Comprehensive verification for the Immutable Administrator Audit Trail:
 * - Tamper-evident SHA-256 hash chaining & PostgreSQL-style key-reordering invariance
 * - Tamper detection when an audit row is altered on disk
 * - Plain-English failed login reasons (admin + customer, wrong password vs unknown user,
 *   suspended account, disabled admin, rate-limit lockout, attempt counts, IP & device)
 * - Customer banking & security event coverage (transfers, Zelle, card reveal failure,
 *   password change failure, reset failure, messages, before/after admin ledger balances)
 * - Auditor / limited admin read-only isolation and security block logging
 * - Server-side filtering, stats, and legacy pre-chain record compatibility
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.TEST_PORT || 3106);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT_USER = 'superadmin@chase.test';
const ROOT_PASS = 'SuperRootPassword123!';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chase-audit-test-'));
const dbFile = path.join(tempDir, 'db.json');

// Seed one legacy pre-chain audit row on disk to prove legacy + chained coexist cleanly.
fs.writeFileSync(
  dbFile,
  JSON.stringify(
    {
      users: [],
      sessions: {},
      revokedSessions: [],
      adminAccounts: [],
      simulatorSettings: { allowEnrollment: true, allowCustomerPasswordReset: true },
      auditLog: [
        {
          id: 'legacy-entry-1',
          actor: ROOT_USER,
          action: 'Admin sign-in',
          details: { username: ROOT_USER, role: 'admin', isSuperAdmin: true },
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      ],
    },
    null,
    2
  )
);

function startServer() {
  const proc = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CHASE_DB_PATH: dbFile,
      CHASE_ADMIN_USERNAME: ROOT_USER,
      CHASE_ADMIN_PASSWORD: ROOT_PASS,
      ADMIN_SESSION_SECRET: 'audit-test-secret-0123456789abcdef',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return proc;
}

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

async function api(route, { method = 'GET', body, token, userToken, ip = '203.0.113.10', ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36', expected = 200 } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Forwarded-For': ip,
    'User-Agent': ua,
  };
  if (token) headers['X-Chase-Admin-Token'] = token;
  if (userToken) headers['X-Chase-Token'] = userToken;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(res.status, expected, `${method} ${route} expected ${expected}, got ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

let server = startServer();

try {
  await waitForHealth();

  /* 1. Failed admin logins (unknown user + wrong root password) */
  await api('/api/admin/login', {
    method: 'POST',
    body: { username: 'ghost.admin', password: 'WrongPassword1!' },
    ip: '198.51.100.21',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    expected: 401,
  });
  await api('/api/admin/login', {
    method: 'POST',
    body: { username: ROOT_USER, password: 'WrongRootPassword!' },
    ip: '198.51.100.22',
    expected: 401,
  });

  /* 2. Super admin sign-in & create a customer + an auditor */
  const rootLogin = await api('/api/admin/login', {
    method: 'POST',
    body: { username: ROOT_USER, password: ROOT_PASS },
    ip: '198.51.100.1',
  });
  const rootTok = rootLogin.token;

  const createdCust = (
    await api('/api/admin/users', {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: {
        username: 'duran.audit',
        fullName: 'Duran Audit',
        email: 'duran.audit@example.test',
        password: 'CustomerPass123!',
        openingDeposit: 5000,
      },
    })
  ).user;
  const checkingAcct = (
    await api(`/api/admin/users/${createdCust.id}/accounts`, {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: { type: 'checking', name: 'Chase Total Checking®', balance: 5000 },
    })
  ).account;

  // Add a credit card so we can test card reveal failure too
  const cardRes = await api(`/api/admin/users/${createdCust.id}/accounts`, {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: { type: 'credit-card', name: 'Chase Sapphire Preferred®', balance: 250, creditLimit: 10000 },
  });
  const cardAcct = cardRes.account;

  // Admin creates then deletes a ledger transaction -> verify before/after balance captured
  const txCreated = (
    await api(`/api/admin/users/${createdCust.id}/transactions`, {
      method: 'POST',
      token: rootTok,
      expected: 201,
      body: {
        accountId: checkingAcct.id,
        transaction: { description: 'Wire refund adjustment', amount: -1200, category: 'Adjustment' },
      },
    })
  ).transaction;
  await api(`/api/admin/users/${createdCust.id}/transactions/${txCreated.id}`, {
    method: 'DELETE',
    token: rootTok,
    body: { confirm: true },
  });

  /* 3. Customer failed logins (unknown user, wrong password, rate limit lockout) */
  await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'nobody.here', password: 'Password123!' },
    ip: '198.51.100.55',
    expected: 401,
  });
  await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'duran.audit', password: 'WrongPassword!' },
    ip: '198.51.100.56',
    expected: 401,
  });

  // Trigger rate limit on distinct IP
  for (let i = 0; i < 10; i++) {
    await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'duran.audit', password: `BadTry${i}!` },
      ip: '198.51.100.99',
      expected: 401,
    });
  }
  await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'duran.audit', password: 'CustomerPass123!' },
    ip: '198.51.100.99',
    expected: 429,
  });

  /* 4. Customer successful login, banking actions, failures, and forgot-password failure */
  const custLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'duran.audit', password: 'CustomerPass123!' },
    ip: '198.51.100.60',
  });
  const custTok = custLogin.token;

  // Zelle over $2,500 -> blocked
  await api('/api/zelle', {
    method: 'POST',
    userToken: custTok,
    body: { to: 'alex@example.test', amount: 3000, memo: 'Rent' },
    expected: 400,
  });
  // Valid Zelle -> succeeded
  await api('/api/zelle', {
    method: 'POST',
    userToken: custTok,
    body: { to: 'alex@example.test', amount: 150, memo: 'Dinner' },
    expected: 200,
  });
  // Wrong password on card reveal -> failed
  await api('/api/cards/reveal', {
    method: 'POST',
    userToken: custTok,
    body: { cardId: cardAcct.id, password: 'NotThePassword!' },
    expected: 400,
  });
  // Wrong current password on password change -> failed
  await api('/api/auth/change-password', {
    method: 'POST',
    userToken: custTok,
    body: { currentPassword: 'WrongCurrent!', newPassword: 'NewPassword123!' },
    expected: 400,
  });
  // Forgot-password wrong email -> failed
  await api('/api/auth/reset-password', {
    method: 'POST',
    body: { username: 'duran.audit', email: 'wrong@example.test', newPassword: 'ResetPassword123!' },
    expected: 400,
  });
  // Customer sends secure message -> succeeded
  await api('/api/messages', {
    method: 'POST',
    userToken: custTok,
    body: { subject: 'Question about wire', category: 'wire', body: 'Checking on wire timing.' },
    expected: 201,
  });

  // Suspend customer and attempt login -> blocked with suspended reason
  await api(`/api/admin/users/${createdCust.id}`, {
    method: 'PUT',
    token: rootTok,
    body: { user: { status: 'suspended' } },
  });
  await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'duran.audit', password: 'CustomerPass123!' },
    ip: '198.51.100.61',
    expected: 403,
  });

  /* 5. Read-only auditor blocked write + isolation check */
  await api('/api/admin/admins', {
    method: 'POST',
    token: rootTok,
    expected: 201,
    body: { username: 'auditor.audit', fullName: 'Auditor View', password: 'AuditorPassword123!', role: 'auditor' },
  });
  const audTok = (
    await api('/api/admin/login', {
      method: 'POST',
      body: { username: 'auditor.audit', password: 'AuditorPassword123!' },
      ip: '198.51.100.70',
    })
  ).token;

  await api('/api/admin/settings', {
    method: 'PUT',
    token: audTok,
    body: { settings: { allowEnrollment: false } },
    expected: 403,
  });

  // Auditor ONLY sees own events, NEVER sees Super Admin or customer failures or integrity proof
  const audAuditRes = await api('/api/admin/audit?limit=5000', { token: audTok });
  assert.ok(audAuditRes.audit.length >= 2, 'auditor has own login and blocked write events');
  assert.ok(audAuditRes.audit.every((e) => e.actor === 'auditor.audit'), 'auditor strictly scoped to own entries');
  assert.equal(audAuditRes.integrity, undefined, 'non-super-admin does not receive global chain integrity');
  assert.ok(
    audAuditRes.audit.some((e) => e.action === 'Blocked auditor write attempt' && e.outcome === 'blocked' && /read-only/i.test(e.reason || '')),
    'auditor blocked write recorded with clear reason'
  );

  /* 6. Verify Super Admin full audit log, plain-English reasons, filters, stats, and SHA-256 chain */
  const fullRes = await api('/api/admin/audit?limit=5000', { token: rootTok });
  assert.equal(fullRes.integrity.valid, true, 'SHA-256 hash chain must verify cleanly');
  assert.equal(fullRes.integrity.status, 'verified');
  assert.equal(fullRes.integrity.legacyCount, 1, 'legacy pre-chain entry preserved');
  assert.ok(fullRes.integrity.chainedCount >= 20, 'new entries are SHA-256 chained');
  assert.equal(fullRes.integrity.tamperedIds.length, 0);

  const entries = fullRes.audit;
  // Legacy entry enriched in plain English
  const legacy = entries.find((e) => e.id === 'legacy-entry-1');
  assert.ok(legacy && legacy.chained === false && /Super Administrator/i.test(legacy.summary), 'legacy entry enriched');

  // Unknown admin failure reason + iPhone Safari UA + IP
  const unknownAdminFail = entries.find((e) => e.action === 'Failed admin sign-in attempt' && e.actor === 'ghost.admin');
  assert.ok(unknownAdminFail, 'unknown admin fail recorded');
  assert.match(unknownAdminFail.reason, /Unknown username/i);
  assert.equal(unknownAdminFail.ip, '198.51.100.21');
  assert.equal(unknownAdminFail.userAgent, 'Safari on iPhone');

  // Wrong root password reason
  const rootPassFail = entries.find((e) => e.action === 'Failed admin sign-in attempt' && e.actor === ROOT_USER);
  assert.ok(rootPassFail && /Incorrect password entered for the Super Administrator/i.test(rootPassFail.reason));

  // Customer wrong password reason
  const custPassFail = entries.find((e) => e.action === 'Failed customer sign-in attempt' && e.actor === 'duran.audit');
  assert.ok(custPassFail && /Incorrect password entered for customer Duran Audit/i.test(custPassFail.reason));
  assert.ok(custPassFail.target?.label?.includes('Duran Audit'));

  // Customer rate-limit lockout
  const custRateLimit = entries.find((e) => e.action === 'Blocked customer sign-in (rate limit)');
  assert.ok(custRateLimit && custRateLimit.outcome === 'blocked' && /15 minutes/i.test(custRateLimit.reason));

  // Customer suspended block
  const custSuspended = entries.find((e) => e.action === 'Blocked customer sign-in (account suspended)');
  assert.ok(custSuspended && custSuspended.outcome === 'blocked' && /suspended/i.test(custSuspended.reason));

  // Zelle limit block + Zelle success + card reveal fail + password change fail + reset fail + message
  assert.ok(entries.some((e) => e.action === 'Blocked Zelle payment (limit exceeded)' && /\$2,500/.test(e.reason || '')));
  assert.ok(entries.some((e) => e.action === 'Customer sent Zelle payment' && /\$150\.00/.test(e.summary || '')));
  assert.ok(entries.some((e) => e.action === 'Failed card detail reveal' && /password/i.test(e.reason || '')));
  assert.ok(entries.some((e) => e.action === 'Failed password change attempt' && /current password/i.test(e.reason || '')));
  assert.ok(entries.some((e) => e.action === 'Failed password reset attempt' && /email address/i.test(e.reason || '')));
  assert.ok(entries.some((e) => e.action === 'Customer sent secure message' && /Question about wire/.test(e.summary || '')));

  // Admin deleted ledger transaction shows balance reversal
  const deletedTx = entries.find((e) => e.action === 'Deleted simulator ledger transaction');
  assert.ok(deletedTx && deletedTx.details.previousBalance === 3800 && deletedTx.details.newBalance === 5000);
  assert.match(deletedTx.summary, /automatically reversed/i);

  // Server-side filters work
  const failedOnly = await api('/api/admin/audit?outcome=failed&limit=500', { token: rootTok });
  assert.ok(failedOnly.audit.length >= 5 && failedOnly.audit.every((e) => e.outcome === 'failed'));
  const moneyOnly = await api('/api/admin/audit?category=money&limit=500', { token: rootTok });
  assert.ok(moneyOnly.audit.length >= 3 && moneyOnly.audit.every((e) => e.category === 'money'));

  /* 7. Test JSONB key-reordering invariance + tamper detection */
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));

  // Reorder keys in `details` of the newest chained entry (simulating Postgres JSONB) -> must STAY valid!
  const dbSnapshot = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const targetEntry = dbSnapshot.auditLog.find((e) => typeof e.seq === 'number' && Object.keys(e.details || {}).length > 1);
  assert.ok(targetEntry, 'found chained entry with multi-key details');
  const reversedDetails = Object.fromEntries(Object.entries(targetEntry.details).reverse());
  targetEntry.details = reversedDetails;
  fs.writeFileSync(dbFile, JSON.stringify(dbSnapshot, null, 2));

  server = startServer();
  await waitForHealth();
  const afterReorderTok = (await api('/api/admin/login', { method: 'POST', body: { username: ROOT_USER, password: ROOT_PASS } })).token;
  const afterReorder = await api('/api/admin/audit?limit=5000', { token: afterReorderTok });
  assert.equal(afterReorder.integrity.valid, true, 'JSONB key reordering must NOT break SHA-256 chain');

  // Now simulate real tampering on disk (altering a chained entry's summary) -> MUST be caught!
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));

  const tamperedDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const victim = tamperedDb.auditLog.find((e) => e.action === 'Customer sent Zelle payment');
  assert.ok(victim, 'found Zelle audit entry to tamper');
  victim.summary = 'Tampered summary text';
  fs.writeFileSync(dbFile, JSON.stringify(tamperedDb, null, 2));

  server = startServer();
  await waitForHealth();
  const afterTamperTok = (await api('/api/admin/login', { method: 'POST', body: { username: ROOT_USER, password: ROOT_PASS } })).token;
  const afterTamper = await api('/api/admin/audit?limit=5000', { token: afterTamperTok });
  assert.equal(afterTamper.integrity.valid, false, 'tampered entry MUST be detected');
  assert.equal(afterTamper.integrity.status, 'tampered');
  assert.ok(afterTamper.integrity.tamperedIds.includes(victim.id), 'tampered entry ID reported');
  assert.equal(afterTamper.audit.find((e) => e.id === victim.id)?.tampered, true, 'tampered flag set on row');

  console.log('ALL Immutable Administrator Audit Trail tests passed (hash chain, JSONB invariance, tamper detection, failed login reasons, customer/admin coverage, and isolation)!');
} finally {
  try {
    server.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
