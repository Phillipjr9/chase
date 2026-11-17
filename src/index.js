const DEFAULT_ADMIN_USERNAME = 'dianasmith6525@gmail.com';
const MAX_SESSION_AGE_MS = 86_400_000;

const LOCATIONS = [
  { id: 'loc-1', name: 'Chase Bank — Midtown West', type: 'Branch', address: '1564 Broadway, New York, NY 10036', distance: '0.2 mi', driveThru: false, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Safe deposit boxes', 'Foreign currency', 'Chase Private Client office'] },
  { id: 'loc-2', name: 'Chase ATM — Penn Station', type: 'ATM', address: '250 W 34th St, New York, NY 10001', distance: '0.8 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Card-free access'] },
  { id: 'loc-3', name: 'Chase Bank — Lincoln Center', type: 'Branch', address: '1886 Broadway, New York, NY 10023', distance: '1.1 mi', driveThru: true, hours: 'Mon–Fri 9:00 AM – 5:00 PM', features: ['ATM', 'Drive-thru', 'Safe deposit boxes'] },
  { id: 'loc-4', name: 'Chase ATM — Grand Central', type: 'ATM', address: '89 E 42nd St, New York, NY 10017', distance: '1.6 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Envelope-free cash & check deposit'] },
  { id: 'loc-5', name: 'Chase Bank — Upper East Side', type: 'Branch', address: '1122 Madison Ave, New York, NY 10128', distance: '3.0 mi', driveThru: true, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Drive-thru', 'Chase Private Client office'] },
  { id: 'loc-6', name: 'Chase Bank — Wall Street', type: 'Branch', address: '1 Chase Manhattan Plaza, New York, NY 10005', distance: '3.4 mi', driveThru: false, hours: 'Mon–Fri 8:30 AM – 5:30 PM', features: ['ATM', 'J.P. Morgan Wealth Management', 'Wire services'] },
];

const OFFERS = [
  { id: 'offer-adidas', brand: 'adidas', merchant: 'adidas', value: '20% cash back', spendMax: 'Up to $50 back', note: 'Offer valid online and in store through Sep 30, 2026.' },
  { id: 'offer-starbucks', brand: 'starbucks', merchant: 'Starbucks', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Valid on Starbucks app reloads and in-cafe purchases.' },
  { id: 'offer-doordash', brand: 'doordash', merchant: 'DoorDash', value: '$10 statement credit', spendMax: 'Orders $35+', note: 'Complimentary DashPass benefits for eligible Chase cardmembers.' },
  { id: 'offer-lyft', brand: 'lyft', merchant: 'Lyft', value: '10% cash back', spendMax: 'Up to $30/mo', note: 'Plus earn up to 5x total points on Lyft rides with Sapphire.' },
  { id: 'offer-target', brand: 'target', merchant: 'Target', value: '5% cash back', spendMax: 'Up to $25 back', note: 'Valid in store and on Target.com.' },
  { id: 'offer-nike', brand: 'nike', merchant: 'Nike', value: '10% cash back', spendMax: 'Up to $40 back', note: 'Valid on Nike.com and in Nike retail locations.' },
  { id: 'offer-uber', brand: 'uber', merchant: 'Uber', value: '10% cash back', spendMax: 'Up to $15 back', note: 'Applies to Uber rides and Uber Eats orders.' },
  { id: 'offer-netflix', brand: 'netflix', merchant: 'Netflix', value: '15% cash back', spendMax: 'Up to $6 back', note: 'Valid on monthly Netflix streaming memberships.' },
  { id: 'offer-spotify', brand: 'spotify', merchant: 'Spotify', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Applies to recurring Spotify Premium billing.' },
  { id: 'offer-instacart', brand: 'instacart', merchant: 'Instacart', value: '$15 statement credit', spendMax: 'Orders $75+', note: 'Available on eligible grocery and retail deliveries.' },
];

let fallbackState = null;

function getSupabaseUrl(env) {
  return String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
}

function getSupabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
}

function getFallbackState() {
  if (!fallbackState) {
    fallbackState = {
      users: [],
      adminAccounts: [],
      sessions: {},
      simulatorSettings: { allowEnrollment: true, allowCustomerPasswordReset: true },
      auditLog: [],
    };
  }
  return fallbackState;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function normalizeState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  return {
    users: Array.isArray(state.users) ? state.users : [],
    adminAccounts: Array.isArray(state.adminAccounts) ? state.adminAccounts : [],
    sessions: state.sessions && typeof state.sessions === 'object' ? state.sessions : {},
    simulatorSettings: state.simulatorSettings && typeof state.simulatorSettings === 'object' ? state.simulatorSettings : { allowEnrollment: true, allowCustomerPasswordReset: true },
    auditLog: Array.isArray(state.auditLog) ? state.auditLog : [],
  };
}

async function readRemoteState(env) {
  const supabaseUrl = getSupabaseUrl(env);
  const supabaseKey = getSupabaseKey(env);
  if (!supabaseUrl || !supabaseKey) return normalizeState(getFallbackState());
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/chase_simulator_state?id=eq.primary&select=state`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return normalizeState(getFallbackState());
    const rows = await res.json().catch(() => []);
    const state = Array.isArray(rows) && rows[0] ? rows[0].state : {};
    return normalizeState(state);
  } catch {
    return normalizeState(getFallbackState());
  }
}

async function persistState(env, state) {
  const sanitized = normalizeState(state);
  const supabaseUrl = getSupabaseUrl(env);
  const supabaseKey = getSupabaseKey(env);
  if (!supabaseUrl || !supabaseKey) {
    fallbackState = sanitized;
    return sanitized;
  }

  const endpoint = `${supabaseUrl}/rest/v1/chase_simulator_state`;
  try {
    const fetchState = await fetch(`${endpoint}?id=eq.primary&select=state`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    });
    const rows = await fetchState.json().catch(() => []);
    const exists = Array.isArray(rows) && rows.length > 0;
    const payload = { state: sanitized };
    const res = await fetch(exists ? `${endpoint}?id=eq.primary` : endpoint, {
      method: exists ? 'PATCH' : 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(exists ? payload : { id: 'primary', ...payload }),
    });
    if (!res.ok) return sanitized;
    return sanitized;
  } catch {
    return sanitized;
  }
}

function publicUser(user) {
  if (!user || typeof user !== 'object') return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function findUserByUsername(state, username) {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return null;
  return (
    (state.users || []).find(
      (u) =>
        String(u.username || '').trim().toLowerCase() === needle ||
        String(u.email || '').trim().toLowerCase() === needle
    ) || null
  );
}

function findAdminByUsername(state, username) {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return null;
  return (state.adminAccounts || []).find((a) => String(a.username || '').trim().toLowerCase() === needle) || null;
}

function getTokenFromHeader(request, kind = 'user') {
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Chase-Token') || '';
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|; )${kind === 'admin' ? 'chase_sim_admin_session' : 'chase_sim_user_session'}=([^;]+)`));
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return bearerToken || cookieToken || '';
}

function normalizeAdminSummary(state, username, isRoot = false) {
  const admin = isRoot
    ? { username, fullName: 'Super administrator', role: 'admin', status: 'active', permissions: { createUsers: true, generateActivity: true, sendMessages: true }, capabilities: { manageAccounts: true, editLedger: true, impersonateUsers: true, manageCustomerAccess: true, manageDisputes: true, publishNotices: true }, linkedUserId: null }
    : findAdminByUsername(state, username) || null;
  if (!admin) return null;
  return {
    username: String(admin.username || username).trim(),
    label: String(admin.fullName || 'Administrator'),
    role: admin.role === 'auditor' ? 'auditor' : 'admin',
    isSuperAdmin: isRoot,
    permissions: admin.permissions || { createUsers: true, generateActivity: true, sendMessages: true },
    capabilities: admin.capabilities || { manageAccounts: true, editLedger: true, impersonateUsers: true, manageCustomerAccess: true, manageDisputes: true, publishNotices: true },
    linkedUserId: admin.linkedUserId || null,
  };
}

function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const cleanHex = hex.replace(/^0x/i, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

const DEFAULT_PASSWORD_HASH_ITERATIONS = 10000;
const LEGACY_PASSWORD_HASH_ITERATIONS = 120000;

async function derivePbkdf2Sha256(password, saltBytes, iterations, keyLengthBytes = 64) {
  const passwordBytes = new TextEncoder().encode(password);
  const hmacKey = await crypto.subtle.importKey('raw', passwordBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const output = new Uint8Array(keyLengthBytes);
  let offset = 0;

  for (let blockIndex = 1; offset < keyLengthBytes; blockIndex += 1) {
    const saltWithCounter = new Uint8Array(saltBytes.length + 4);
    saltWithCounter.set(saltBytes, 0);
    const view = new DataView(saltWithCounter.buffer, saltWithCounter.byteOffset, saltWithCounter.byteLength);
    view.setUint32(saltWithCounter.length - 4, blockIndex);

    let u = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, saltWithCounter));
    let previous = u;
    let t = new Uint8Array(u);

    for (let i = 1; i < iterations; i += 1) {
      u = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, u));
      for (let j = 0; j < t.length; j += 1) {
        t[j] ^= u[j];
      }
    }

    output.set(t, offset);
    offset += t.length;
    previous = t;
  }

  return output;
}

async function compareValuesMaybeEquivalent(candidate, stored) {
  if (typeof candidate !== 'string' || typeof stored !== 'string') return false;
  if (candidate === stored) return true;
  if (stored.startsWith('pbkdf2:')) {
    const [prefix, saltHex, expectedHex] = stored.split(':');
    if (prefix !== 'pbkdf2' || !saltHex || !expectedHex) return false;
    const saltBytes = hexToBytes(saltHex);

    for (const iterations of [DEFAULT_PASSWORD_HASH_ITERATIONS, LEGACY_PASSWORD_HASH_ITERATIONS]) {
      try {
        const derived = await derivePbkdf2Sha256(candidate, saltBytes, iterations, 64);
        if (hexFromBytes(derived) === expectedHex) return true;
      } catch {
        // Ignore per-iteration failures and continue to the next supported iteration count.
      }
    }
    return false;
  }
  return false;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('pbkdf2:')) {
    return compareValuesMaybeEquivalent(password, stored);
  }
  if (stored.includes(':') && stored.startsWith('scrypt')) {
    return false;
  }
  return password === stored;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePbkdf2Sha256(password, salt, DEFAULT_PASSWORD_HASH_ITERATIONS, 64);
  return `pbkdf2:${hexFromBytes(salt)}:${hexFromBytes(bits)}`;
}

function sessionTokenForUser(type, identifier) {
  return `${type}:${identifier}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function parseSessionToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const [kind, identifier, issuedAt, nonce] = token.split(':');
  if (!kind || !identifier || !issuedAt || !nonce) return null;
  const createdAt = Number(issuedAt);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_SESSION_AGE_MS) return null;
  return { kind, identifier };
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const state = await readRemoteState(env);
      return jsonResponse({ status: 'ok', uptime: 0, users: state.users.length, storage: 'cloudflare-worker', version: '1.1.0' });
    }

    if (url.pathname === '/api/rates') {
      const wobble = (base, spread) => Number((base + (Math.random() * spread * 2 - spread)).toFixed(2));
      return jsonResponse({
        updatedAt: new Date().toISOString(),
        disclaimer: 'Illustrative Chase reference rates, not an offer. Real rates depend on credit, term and relationship.',
        checking: [{ id: 'total-checking', apy: '0.01%' }],
        savings: [{ id: 'savings', apy: `${wobble(0.01, 0.005).toFixed(3)}%` }],
        cds: [{ id: 'cd-1m', term: '1 month', apy: wobble(2.10, 0.08) }],
        mortgage: [{ id: '30yr', term: '30-year fixed', rate: wobble(6.375, 0.06), apr: wobble(6.52, 0.06) }],
        auto: [{ id: '36', term: '36 months', rate: wobble(5.99, 0.10), apr: wobble(6.34, 0.10) }],
      });
    }

    if (url.pathname === '/api/locations') {
      return jsonResponse({ locations: LOCATIONS });
    }

    if (url.pathname === '/api/offers') {
      return jsonResponse({ offers: OFFERS });
    }

    if (url.pathname === '/api/seed') {
      return jsonResponse({ error: 'Sample account seeding has been disabled.' }, 410);
    }

    if (url.pathname.startsWith('/api/')) {
      const state = await readRemoteState(env);
      const adminUsername = String(env.CHASE_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
      const adminPassword = String(env.CHASE_ADMIN_PASSWORD || '');

      if (url.pathname === '/api/auth/check-username' && request.method === 'GET') {
        const username = url.searchParams.get('username') || '';
        const taken = Boolean(findUserByUsername(state, username) || findAdminByUsername(state, username) || username.trim().toLowerCase() === adminUsername.toLowerCase());
        return jsonResponse({ taken });
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return jsonResponse({ ok: true });
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const candidateUsername = String(body.username || '').trim();
        const candidatePassword = String(body.password || '');
        const adminUsername = String(env.CHASE_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
        const adminPassword = String(env.CHASE_ADMIN_PASSWORD || '');

        if (candidateUsername.toLowerCase() === adminUsername.toLowerCase() && adminPassword && candidatePassword === adminPassword) {
          const token = sessionTokenForUser('admin', adminUsername);
          return jsonResponse({
            token,
            admin: {
              username: adminUsername,
              label: 'Super administrator',
              role: 'admin',
              isSuperAdmin: true,
              permissions: { createUsers: true, generateActivity: true, sendMessages: true },
              capabilities: { manageAccounts: true, editLedger: true, impersonateUsers: true, manageCustomerAccess: true, manageDisputes: true, publishNotices: true },
              linkedUserId: null,
            },
          }, 200, { 'Set-Cookie': `chase_sim_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
        }

        const storedAdmin = findAdminByUsername(state, candidateUsername);
        if (storedAdmin && storedAdmin.passwordHash && (await verifyPassword(candidatePassword, storedAdmin.passwordHash))) {
          const token = sessionTokenForUser('admin', storedAdmin.username);
          return jsonResponse({
            token,
            admin: {
              username: storedAdmin.username,
              label: storedAdmin.fullName || 'Administrator',
              role: storedAdmin.role || 'admin',
              isSuperAdmin: false,
              permissions: storedAdmin.permissions || { createUsers: true, generateActivity: true, sendMessages: true },
              capabilities: storedAdmin.capabilities || { manageAccounts: true, editLedger: true, impersonateUsers: true, manageCustomerAccess: true, manageDisputes: true, publishNotices: true },
              linkedUserId: storedAdmin.linkedUserId || null,
            },
          }, 200, { 'Set-Cookie': `chase_sim_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
        }

        return jsonResponse({ error: 'Admin username or password is incorrect.' }, 401);
      }

      if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
        return jsonResponse({ ok: true }, 200, { 'Set-Cookie': 'chase_sim_admin_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax' });
      }

      if (url.pathname === '/api/admin/me' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        const adminUsername = String(parsed.identifier || '').trim();
        const isRoot = adminUsername.toLowerCase() === String(env.CHASE_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim().toLowerCase();
        const admin = normalizeAdminSummary(state, adminUsername, isRoot);
        if (!admin) return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ admin, token }, 200);
      }

      if (url.pathname === '/api/admin/settings' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ settings: state.simulatorSettings || { allowEnrollment: true, allowCustomerPasswordReset: true } });
      }

      if (url.pathname === '/api/admin/admins' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ admins: Array.isArray(state.adminAccounts) ? state.adminAccounts : [] });
      }

      if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({
          metrics: {
            totalCustomers: (state.users || []).length,
            activeCustomers: (state.users || []).filter((u) => String(u.status || 'active') !== 'suspended').length,
            totalAccounts: (state.users || []).reduce((sum, u) => sum + (Array.isArray(u.accounts) ? u.accounts.length : 0), 0),
            totalDisputes: (state.users || []).reduce((sum, u) => sum + (Array.isArray(u.disputes) ? u.disputes.length : 0), 0),
            totalTransfers: 0,
          },
          recentAudit: Array.isArray(state.auditLog) ? state.auditLog.slice(0, 8) : [],
          analytics: {},
        });
      }

      if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ users: Array.isArray(state.users) ? state.users : [] });
      }

      if (url.pathname === '/api/admin/audit' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ audit: Array.isArray(state.auditLog) ? state.auditLog : [] });
      }

      if (url.pathname === '/api/admin/transactions' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ transactions: [] });
      }

      if (url.pathname === '/api/admin/messages' && request.method === 'GET') {
        const token = getTokenFromHeader(request, 'admin');
        const parsed = parseSessionToken(token || '');
        if (!parsed || parsed.kind !== 'admin') return jsonResponse({ error: 'Admin sign-in required.' }, 401);
        return jsonResponse({ threads: [] });
      }

      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || request.headers.get('X-Chase-Token') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const parsed = parseSessionToken(token || url.searchParams.get('_st') || '');
        if (!parsed) return jsonResponse({ error: 'Session expired.' }, 401);
        if (parsed.kind === 'admin') {
          const admin = findAdminByUsername(state, parsed.identifier) || (parsed.identifier.toLowerCase() === adminUsername.toLowerCase() ? { username: adminUsername, role: 'admin', fullName: 'Super administrator', passwordHash: '', status: 'active', permissions: {}, capabilities: {} } : null);
          if (!admin) return jsonResponse({ error: 'Admin sign-in required.' }, 401);
          return jsonResponse({ admin: { username: admin.username, label: admin.fullName || 'Super administrator', role: admin.role || 'admin', isSuperAdmin: parsed.identifier.toLowerCase() === adminUsername.toLowerCase(), linkedUserId: admin.linkedUserId || null }, token });
        }
        if (parsed.kind === 'user') {
          const user = (state.users || []).find((entry) => entry.id === parsed.identifier) || null;
          if (!user) return jsonResponse({ error: 'Session expired.' }, 401);
          return jsonResponse({ user: publicUser(user), token }, 200);
        }
        return jsonResponse({ error: 'Session expired.' }, 401);
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const candidateUsername = String(body.username || '').trim();
        const candidatePassword = String(body.password || '');

        if (candidateUsername.toLowerCase() === adminUsername.toLowerCase()) {
          if (adminPassword && candidatePassword === adminPassword) {
            const token = sessionTokenForUser('admin', adminUsername);
            return jsonResponse({ admin: { username: adminUsername, label: 'Super administrator', role: 'admin', isSuperAdmin: true, linkedUserId: null }, token }, 200, { 'Set-Cookie': `chase_sim_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
          }
          const storedAdmin = findAdminByUsername(state, candidateUsername);
          if (storedAdmin && storedAdmin.passwordHash && (await verifyPassword(candidatePassword, storedAdmin.passwordHash))) {
            const token = sessionTokenForUser('admin', storedAdmin.username);
            return jsonResponse({ admin: { username: storedAdmin.username, label: storedAdmin.fullName || 'Administrator', role: storedAdmin.role || 'admin', isSuperAdmin: false, linkedUserId: storedAdmin.linkedUserId || null }, token }, 200, { 'Set-Cookie': `chase_sim_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
          }
        }

        const user = findUserByUsername(state, candidateUsername);
        if (user && user.passwordHash && (await verifyPassword(candidatePassword, user.passwordHash))) {
          const token = sessionTokenForUser('user', user.id);
          return jsonResponse({ user: publicUser(user), token }, 200, { 'Set-Cookie': `chase_sim_user_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
        }

        return jsonResponse({ error: 'The username or password you entered is incorrect. Please try again.' }, 401);
      }

      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const email = String(body.email || '').trim();
        if (!username || !password || !email) return jsonResponse({ error: 'Username, email, and password are required.' }, 400);
        if (findUserByUsername(state, username) || findAdminByUsername(state, username) || username.toLowerCase() === adminUsername.toLowerCase()) {
          return jsonResponse({ error: 'That username is already taken' }, 400);
        }
        const nextUser = {
          id: `user_${Math.random().toString(36).slice(2, 10)}`,
          username,
          fullName: `${String(body.firstName || '').trim()} ${String(body.lastName || '').trim()}`.trim() || username,
          email,
          phone: String(body.phone || '').trim(),
          address: `${String(body.address || '').trim()} ${String(body.city || '').trim()} ${String(body.state || '').trim()} ${String(body.zip || '').trim()}`.trim(),
          accounts: [],
          payees: [],
          investments: { accountMask: '7192', cash: 0, holdings: [] },
          security: { twoFactor: true, loginAlerts: true, fraudAlerts: true, paperless: true },
          preferences: { balanceAlerts: true, paymentReminders: true, transactionAlerts: false, travelAlerts: true, offerEmails: false, textAlerts: false, affiliateSharing: false, thirdPartyMarketing: false },
          budgets: {},
          disputes: [],
          credit: { score: 700, bureau: 'Experian', model: 'VantageScore® 3.0', goal: 800, history: [], factors: [], changes: [], report: { pulledAt: new Date().toISOString(), accounts: [], inquiries: [], publicRecords: [], collections: [] }, darkWeb: [], alerts: [] },
          home: null,
          scheduledPayments: [],
          travelNotices: [],
          travelBookings: [],
          createdAt: new Date().toISOString(),
          passwordHash: await hashPassword(password),
        };
        const nextState = { ...state, users: [...state.users, nextUser] };
        await persistState(env, nextState);
        const token = sessionTokenForUser('user', nextUser.id);
        return jsonResponse({ user: publicUser(nextUser), token }, 201, { 'Set-Cookie': `chase_sim_user_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax` });
      }

      return jsonResponse({ error: 'API endpoint not implemented in this Cloudflare worker.' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
