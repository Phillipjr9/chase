import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_PORT = Number(process.env.TEST_PORT || 3132);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chase-routing-wire-test-'));

process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';
process.env.CHASE_DATA_DIR = DATA_DIR;
process.env.CHASE_ADMIN_PASSWORD = 'TestSuperAdminPassword!2026';
process.env.ADMIN_SESSION_SECRET = 'test-secret-routing-wire-2026';
process.env.ALLOWED_ORIGIN = `http://127.0.0.1:${TEST_PORT}`;

await import('../server/index.js');
await new Promise((resolve) => setTimeout(resolve, 250));
const BASE = `http://127.0.0.1:${TEST_PORT}`;

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
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, json };
}

try {
  // 1. Super admin login
  const saLogin = await req('/api/admin/login', {
    method: 'POST',
    body: { password: process.env.CHASE_ADMIN_PASSWORD },
  });
  assert.equal(saLogin.status, 200);
  const saToken = saLogin.json.token;

  // 2. Create a limited admin
  const laCreate = await req('/api/admin/accounts', {
    method: 'POST',
    token: saToken,
    body: {
      username: 'limited_routing_admin',
      fullName: 'Limited Routing Admin',
      email: 'limited-routing@chase-sim.test',
      password: 'LimitedPassword!2026',
    },
  });
  assert.equal(laCreate.status, 201);

  const laLogin = await req('/api/admin/login', {
    method: 'POST',
    body: { username: 'limited_routing_admin', password: 'LimitedPassword!2026' },
  });
  assert.equal(laLogin.status, 200);
  const laToken = laLogin.json.token;

  // 3. Limited admin creates a customer
  const custRes = await req('/api/admin/users', {
    method: 'POST',
    token: laToken,
    body: {
      username: 'wire_cust_1',
      fullName: 'Wire Customer One',
      email: 'wirecust1@chase-sim.test',
      password: 'CustomerPassword!2026',
    },
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.json.user.id;

  // 4. Limited admin creates a checking account with custom routingNumber & accountNumber
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
  assert.equal(accCreate.status, 201);
  const createdAcc = accCreate.json.account;
  assert.equal(createdAcc.routingNumber, '122000247');
  assert.equal(createdAcc.accountNumber, '9876543210');
  assert.equal(createdAcc.mask, '3210');

  // 5. Limited admin edits routingNumber & accountNumber on their own customer's account
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
  assert.equal(accEdit.status, 200);
  const editedAcc = accEdit.json.user.accounts.find((a) => a.id === createdAcc.id);
  assert.equal(editedAcc.routingNumber, '021000021');
  assert.equal(editedAcc.accountNumber, '1122334455');
  assert.equal(editedAcc.mask, '4455');

  // 6. Customer logs in and sends a wire with accountNumber
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
  assert.equal(wireRes.status, 200);

  console.log('ALL routing, account number, limited-admin scoping & wire tests passed!');
} finally {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(0);
}
