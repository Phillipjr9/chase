/**
 * Routing number, account number, limited-admin scoping & wire transfer coverage.
 *
 * Boots the server in-process against a temporary database, then verifies:
 *   1. Super Admin sign-in
 *   2. Super Admin creates a limited administrator
 *   3. Limited administrator creates a customer they own
 *   4. Limited administrator creates a checking account with custom routing/account numbers
 *   5. Limited administrator edits those numbers on their own customer's account
 *   6. Customer sends a domestic wire from that account
 *   7. A second limited administrator cannot reach the first one's customer
 *
 * Run: node tests/routing-and-wire-features.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_PORT = Number(process.env.TEST_PORT || 3132);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chase-routing-wire-test-'));
const DB_FILE = path.join(DATA_DIR, 'db.json');

const ROOT_USER = 'superadmin@routing.test';
const ROOT_PASS = 'TestSuperAdminPassword!2026';

// The server only reads CHASE_DB_PATH — there is no CHASE_DATA_DIR.
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';
process.env.CHASE_DB_PATH = DB_FILE;
process.env.CHASE_ADMIN_USERNAME = ROOT_USER;
process.env.CHASE_ADMIN_PASSWORD = ROOT_PASS;
process.env.ADMIN_SESSION_SECRET = 'test-secret-routing-wire-2026';

await import('../server/index.js');

const BASE = `http://127.0.0.1:${TEST_PORT}`;

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start in time');
}

async function req(p, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

let failure = null;
try {
  await waitForHealth();

  // 1. Super Admin sign-in (username is required — password alone is rejected)
  const saLogin = await req('/api/admin/login', {
    method: 'POST',
    body: { username: ROOT_USER, password: ROOT_PASS },
  });
  assert.equal(saLogin.status, 200, `super admin login: ${JSON.stringify(saLogin.json)}`);
  assert.equal(saLogin.json.admin.isSuperAdmin, true);
  const saToken = saLogin.json.token;

  // 2. Create a limited administrator (staff live at /api/admin/admins)
  const laCreate = await req('/api/admin/admins', {
    method: 'POST',
    token: saToken,
    body: {
      username: 'limited_routing_admin',
      fullName: 'Limited Routing Admin',
      password: 'LimitedPassword!2026',
      role: 'admin',
    },
  });
  assert.equal(laCreate.status, 201, `create limited admin: ${JSON.stringify(laCreate.json)}`);

  const laLogin = await req('/api/admin/login', {
    method: 'POST',
    body: { username: 'limited_routing_admin', password: 'LimitedPassword!2026' },
  });
  assert.equal(laLogin.status, 200);
  assert.equal(laLogin.json.admin.isSuperAdmin, false);
  const laToken = laLogin.json.token;

  // 3. Limited administrator creates a customer — that customer is owned by them
  const custRes = await req('/api/admin/users', {
    method: 'POST',
    token: laToken,
    body: {
      username: 'wire_cust_1',
      fullName: 'Wire Customer One',
      email: 'wirecust1@example.test',
      password: 'CustomerPassword!2026',
    },
  });
  assert.equal(custRes.status, 201, `create customer: ${JSON.stringify(custRes.json)}`);
  const custId = custRes.json.user.id;
  // A limited admin always owns the customers they create; verify via the root
  // directory read, since publicUser() does not expose ownerAdminId.
  const rootDirectory = await req('/api/admin/users', { token: saToken });
  assert.equal(rootDirectory.status, 200);
  const ownedRow = rootDirectory.json.users.find((u) => u.id === custId);
  assert.ok(ownedRow, 'new customer appears in the root directory');
  assert.ok(ownedRow.ownerAdminId, 'customer is owned by the limited administrator that created it');

  // 4. Create a checking account with explicit routing & account numbers
  const accCreate = await req(`/api/admin/users/${custId}/accounts`, {
    method: 'POST',
    token: laToken,
    body: {
      type: 'checking',
      name: 'Custom Routing Checking',
      balance: 5000,
      routingNumber: '122000247',
      accountNumber: '9876543210',
    },
  });
  assert.equal(accCreate.status, 201, `create account: ${JSON.stringify(accCreate.json)}`);
  const createdAcc = accCreate.json.account;
  assert.equal(createdAcc.routingNumber, '122000247');
  assert.equal(createdAcc.accountNumber, '9876543210');
  assert.equal(createdAcc.mask, '3210', 'mask derives from the last 4 account-number digits');

  // 5. Edit routing & account numbers on the owned account
  const accEdit = await req(`/api/admin/users/${custId}/accounts/${createdAcc.id}`, {
    method: 'PUT',
    token: laToken,
    body: {
      account: {
        name: createdAcc.name,
        balance: createdAcc.balance,
        routingNumber: '021000021',
        accountNumber: '1122334455',
      },
    },
  });
  assert.equal(accEdit.status, 200, `edit account: ${JSON.stringify(accEdit.json)}`);
  const editedAcc = accEdit.json.user.accounts.find((a) => a.id === createdAcc.id);
  assert.equal(editedAcc.routingNumber, '021000021');
  assert.equal(editedAcc.accountNumber, '1122334455');
  assert.equal(editedAcc.mask, '4455', 'mask follows the edited account number');

  // 6. Customer signs in and sends a domestic wire from that account
  const custLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: 'wire_cust_1', password: 'CustomerPassword!2026' },
  });
  assert.equal(custLogin.status, 200);
  const custToken = custLogin.json.token;

  const wireRes = await req('/api/wires', {
    method: 'POST',
    token: custToken,
    body: {
      fromId: createdAcc.id,
      recipient: 'Acme Escrow LLC',
      routingNumber: '021000021',
      accountNumber: '5556667778',
      amount: 250,
      wireType: 'domestic',
    },
  });
  assert.equal(wireRes.status, 200, `send wire: ${JSON.stringify(wireRes.json)}`);

  // Wire debits amount + $25 domestic fee
  const afterWire = wireRes.json.user.accounts.find((a) => a.id === createdAcc.id);
  assert.equal(afterWire.balance, 5000 - 250 - 25, 'balance debits the wire amount plus the domestic fee');

  // 7. A second limited administrator must not reach the first one's customer
  const la2Create = await req('/api/admin/admins', {
    method: 'POST',
    token: saToken,
    body: {
      username: 'limited_routing_admin2',
      fullName: 'Limited Routing Admin Two',
      password: 'LimitedPassword2!2026',
      role: 'admin',
    },
  });
  assert.equal(la2Create.status, 201);
  const la2Login = await req('/api/admin/login', {
    method: 'POST',
    body: { username: 'limited_routing_admin2', password: 'LimitedPassword2!2026' },
  });
  assert.equal(la2Login.status, 200);
  const crossTenant = await req(`/api/admin/users/${custId}`, { token: la2Login.json.token });
  assert.equal(crossTenant.status, 404, 'cross-tenant customer access must not be disclosed');

  console.log('ALL routing, account number, limited-admin scoping & wire tests passed!');
} catch (error) {
  failure = error;
  console.error(`TEST FAILED: ${error?.name || 'Error'} :: ${error?.message || error}`);
  if (error?.stack) console.error(error.stack.split('\n').slice(0, 4).join('\n'));
} finally {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  // Exit non-zero on failure so CI cannot report a false pass.
  process.exit(failure ? 1 : 0);
}
