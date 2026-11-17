import assert from 'node:assert/strict';
const worker = (await import('../src/index.js')).default;

const env = {
  CHASE_ADMIN_USERNAME: 'dianasmith6525@gmail.com',
  CHASE_ADMIN_PASSWORD: 'AdminPass!123',
  ASSETS: { fetch: () => new Response('asset fallback', { status: 200 }) },
};

async function call(path, init = {}) {
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), env);
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text), headers: Object.fromEntries(res.headers.entries()) };
  } catch {
    return { status: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
  }
}

const register = await call('/api/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Cloud',
    lastName: 'Fallback',
    email: 'cloudfallback@example.com',
    username: 'cloudfallback',
    password: 'Password123!',
    product: 'checking',
    openingDeposit: 2500,
    phone: '555-0100',
    address: '1 Fake St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
  }),
});

assert.equal(register.status, 201, `Expected register to succeed without a Supabase anon key, got ${register.status}: ${JSON.stringify(register.json)}`);
assert.ok(register.json && register.json.user, 'Register response should include a user object');

const login = await call('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'cloudfallback@example.com', password: 'Password123!' }),
});

assert.equal(login.status, 200, `Expected login to succeed without a Supabase anon key, got ${login.status}: ${JSON.stringify(login.json)}`);
assert.ok(login.json && login.json.user, 'Login response should include a user object');
console.log('Cloudflare auth fallback test passed');
