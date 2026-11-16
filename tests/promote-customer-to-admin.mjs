import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_USERNAME = process.env.CHASE_ADMIN_USERNAME || process.env.DEMO_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.CHASE_ADMIN_PASSWORD || process.env.DEMO_ADMIN_PASSWORD || 'chaseadmin123';

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

const adminLogin = await api('/api/admin/login', {
  method: 'POST',
  body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
});
const adminToken = adminLogin.token;
assert.ok(adminToken, 'root admin can sign in');

const suffix = Date.now();
const username = `limited-admin-${suffix}`;
const customer = await api('/api/auth/register', {
  method: 'POST',
  expected: 201,
  body: {
    firstName: 'Limited',
    lastName: 'Admin',
    email: `limited-admin-${suffix}@example.com`,
    username,
    password: 'customerpass123',
    product: 'total-checking',
  },
});

const promotion = await api(`/api/admin/users/${encodeURIComponent(customer.user.id)}/promote-admin`, {
  method: 'POST',
  token: adminToken,
  expected: 201,
});
assert.equal(promotion.admin.username, username, 'customer username is reused for the admin account');
assert.equal(promotion.admin.role, 'admin', 'promoted user becomes a limited admin');
assert.ok(promotion.admin.id, 'a new admin record is created');

const promotedLogin = await api('/api/admin/login', {
  method: 'POST',
  body: { username, password: 'customerpass123' },
});
assert.equal(promotedLogin.admin.role, 'admin', 'the promoted customer can sign in as a limited admin');
assert.equal(promotedLogin.admin.username, username, 'the promoted admin keeps the customer username');

const allAdmins = await api('/api/admin/admins', { token: adminToken });
assert.ok(allAdmins.admins.some((admin) => admin.username === username), 'the promoted limited admin appears in the admin list');
