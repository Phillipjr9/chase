/* -------------------------------------------------------------------------- */
/* Chase Clone — fullstack server                                              */
/*                                                                           */
/* Serves the built frontend (dist/) AND a REST API on the same origin:        */
/*   npm run build          (build the frontend into dist/)                    */
/*   node server/index.js   (start API + static server on PORT, default 3000)  */
/*                                                                           */
/* API summary:                                                                */
/*   GET  /api/health                    liveness probe                        */
/*   POST /api/seed                      seed sample Chase user (idempotent)   */
/*   POST /api/auth/register             enroll + open first account           */
/*   POST /api/auth/login                sign in (returns session token)       */
/*   POST /api/auth/logout               invalidate token                      */
/*   GET  /api/auth/me                   current user from token               */
/*   GET  /api/auth/check-username       username availability                 */
/*   POST /api/auth/change-password      change password                       */
/*   POST /api/accounts                  open another account                  */
/*   POST /api/transfers                 transfer between own accounts         */
/*   POST /api/payees                    add a bill-pay payee                  */
/*   POST /api/billpay                   pay a bill                            */
/*   POST /api/zelle                     send money with Zelle®                */
/*   POST /api/cards/pay                 pay a credit card balance             */
/*   POST /api/auto/apply                apply for an auto loan                */
/* -------------------------------------------------------------------------- */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTS,
  LOCATIONS,
  OFFERS,
  MARKET_QUOTES,
  defaultInvestments,
  defaultSecurity,
  defaultPreferences,
  defaultHome,
  defaultCredit,
  nextDueDate,
  buildAccount,
  buildChaseUser,
  hashPassword,
  verifyPassword,
  uid,
  mask4,
  round2,
} from './domain.js';
import {
  findUserByUsername,
  findUserById,
  insertUser,
  updateUser,
  createSession,
  getSession,
  deleteSession,
  revokeSession,
  isSessionRevoked,
  deleteSessionsForUser,
  findAllUsers,
  deleteUserById,
  resetUsers,
  appendAudit,
  getAuditLog,
  getSimulatorSettings,
  updateSimulatorSettings,
  findAdminByUsername,
  listAdminAccounts,
  insertAdminAccount,
  updateAdminAccount,
  deleteAdminAccount,
  countUsers,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 3000;
const CHASE_ADMIN_USERNAME = process.env.CHASE_ADMIN_USERNAME || 'admin';
const CHASE_ADMIN_PASSWORD = process.env.CHASE_ADMIN_PASSWORD || 'chaseadmin123';
const CHASE_ADMIN_PASSWORD_HASH = hashPassword(CHASE_ADMIN_PASSWORD);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}

function sessionCookieHeader(req, token = '', role = 'user') {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = !!req.socket?.encrypted || forwardedProto === 'https';
  const cookieName = ['admin', 'auditor'].includes(role) ? 'chase_sim_admin_session' : 'chase_sim_user_session';
  const cookie = token
    ? `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
    : `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  return { 'Set-Cookie': cookie };
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function cookieSessionToken(req, cookieName) {
  const cookieHeader = String(req.headers.cookie || '');
  const sessionCookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!sessionCookie) return null;
  try { return decodeURIComponent(sessionCookie.slice(`${cookieName}=`.length)); } catch { return null; }
}

function requestSessionTokens(req, cookieName) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  return [...new Set([bearer, cookieSessionToken(req, cookieName)].filter(Boolean))];
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const cookieName = String(req.url || '').startsWith('/api/admin/') ? 'chase_sim_admin_session' : 'chase_sim_user_session';
  return cookieSessionToken(req, cookieName);
}

function getAuthUser(req) {
  for (const token of requestSessionTokens(req, 'chase_sim_user_session')) {
    const session = getSession(token);
    if (!session || ['admin', 'auditor'].includes(session.role)) continue;
    const user = findUserById(session.userId);
    if (!user) continue;
    if (user.status === 'suspended' && session.role !== 'impersonated') continue;
    return user;
  }
  return null;
}

function getAdminSession(req) {
  for (const token of requestSessionTokens(req, 'chase_sim_admin_session')) {
    if (isSessionRevoked(token)) continue;
    const session = getSession(token);
    if (session && ['admin', 'auditor'].includes(session.role)) {
      if (session.userId === '__chase_admin__') return session;
      const username = String(session.userId || '').replace(/^admin:/, '');
      const account = findAdminByUsername(username);
      if (account && account.status === 'active' && account.role === session.role) return session;
      continue;
    }
    const stateless = verifyAdminToken(token);
    if (stateless) return stateless;
  }
  return null;
}

function auditAdmin(action, details = {}, actor = 'Chase administrator') {
  appendAudit({ id: uid(), actor, action, details, createdAt: new Date().toISOString() });
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function adminTokenSecret() {
  // CHASE_ADMIN_PASSWORD_HASH is generated with a fresh random salt each process.
  // Using it as the token key makes sessions fail across restarts or serverless
  // instances. Derive the fallback deterministically; production should set the
  // same ADMIN_SESSION_SECRET on every instance.
  return process.env.ADMIN_SESSION_SECRET || crypto
    .createHash('sha256')
    .update(`chase-admin-session-v1:${CHASE_ADMIN_USERNAME}:${CHASE_ADMIN_PASSWORD}`)
    .digest('hex');
}

function createAdminToken(username, role) {
  const payload = Buffer.from(JSON.stringify({
    username,
    role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString('hex'),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', adminTokenSecret()).update(payload).digest('base64url');
  return `adm1.${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (typeof token !== 'string') return null;
  const [version, payload, signature, extra] = token.split('.');
  if (version !== 'adm1' || !payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', adminTokenSecret()).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['admin', 'auditor'].includes(claims.role) || !claims.username || claims.expiresAt <= Date.now()) return null;
    if (String(claims.username).toLowerCase() !== CHASE_ADMIN_USERNAME.toLowerCase()) {
      const admin = findAdminByUsername(claims.username);
      if (!admin || admin.status !== 'active' || admin.role !== claims.role) return null;
    }
    return { userId: String(claims.username).toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() ? '__chase_admin__' : `admin:${claims.username}`, role: claims.role, expiresAt: claims.expiresAt };
  } catch {
    return null;
  }
}

const DEPOSIT_TYPES = new Set(['checking', 'savings', 'cd']);
const loginAttempts = new Map();

function clientKey(req) {
  return String(req.socket?.remoteAddress || 'unknown');
}

function rateLimit(req, bucket, limit, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${clientKey(req)}`;
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function limited(req, res, bucket, limit, windowMs, message) {
  if (!rateLimit(req, bucket, limit, windowMs)) return false;
  sendJson(res, 429, { error: message });
  return true;
}

function failureKey(req, bucket) {
  return `fail:${bucket}:${clientKey(req)}`;
}

function tooManyFailures(req, bucket, limit) {
  const current = loginAttempts.get(failureKey(req, bucket));
  return !!current && current.resetAt > Date.now() && current.count >= limit;
}

function recordFailure(req, bucket, windowMs) {
  const key = failureKey(req, bucket);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    current.count += 1;
  }
}

function clearFailures(req, bucket) {
  loginAttempts.delete(failureKey(req, bucket));
}

function money(value, max = 1_000_000) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= max ? round2(amount) : null;
}

function openingDeposit(value, isCard) {
  if (isCard) return 0;
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100_000 ? round2(amount) : null;
}

function cleanText(value, max = 120) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;

  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      users: countUsers(),
      version: '1.0.0',
    });
  }

  if (pathname === '/api/rates' && method === 'GET') {
    // Illustrative Chase reference rates, refreshed on each request so the product pages
    // always show a current timestamp and slightly moving numbers.
    const wobble = (base, spread) => round2(base + (Math.random() * spread * 2 - spread));
    return sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      disclaimer: 'Illustrative Chase reference rates, not an offer. Real rates depend on credit, term and relationship.',
      checking: [{ id: 'total-checking', apy: '0.01%' }],
      savings: [
        { id: 'savings', apy: `${wobble(0.01, 0.005).toFixed(3)}%` },
        { id: 'premier-savings', apy: `${wobble(0.02, 0.01).toFixed(3)}%` },
      ],
      cds: [
        { id: 'cd-1m', term: '1 month', apy: wobble(2.10, 0.08) },
        { id: 'cd-6m', term: '6 months', apy: wobble(3.20, 0.10) },
        { id: 'cd-12m', term: '12 months', apy: wobble(4.00, 0.12) },
        { id: 'cd-24m', term: '24 months', apy: wobble(3.80, 0.12) },
        { id: 'cd-60m', term: '60 months', apy: wobble(3.55, 0.10) },
      ],
      mortgage: [
        { id: '30yr', term: '30-year fixed', rate: wobble(6.375, 0.06), apr: wobble(6.52, 0.06) },
        { id: '15yr', term: '15-year fixed', rate: wobble(5.75, 0.06), apr: wobble(5.94, 0.06) },
        { id: 'arm5', term: '5/6 ARM', rate: wobble(6.10, 0.08), apr: wobble(6.41, 0.08) },
      ],
      auto: [
        { id: '36', term: '36 months', rate: wobble(5.99, 0.10), apr: wobble(6.34, 0.10) },
        { id: '48', term: '48 months', rate: wobble(6.19, 0.10), apr: wobble(6.55, 0.10) },
        { id: '60', term: '60 months', rate: wobble(6.49, 0.10), apr: wobble(6.86, 0.10) },
        { id: '72', term: '72 months', rate: wobble(6.79, 0.10), apr: wobble(7.18, 0.10) },
      ],
    });
  }

  if (pathname === '/api/locations' && method === 'GET') {
    return sendJson(res, 200, { locations: LOCATIONS });
  }

  if (pathname === '/api/offers' && method === 'GET') {
    return sendJson(res, 200, { offers: OFFERS });
  }

  if (pathname === '/api/seed' && method === 'POST') {
    if (!findUserByUsername('chase')) {
      const sampleUser = buildChaseUser();
      sampleUser.passwordHash = hashPassword('chase123');
      sampleUser.username = 'chase';
      insertUser(sampleUser);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    if (limited(req, res, 'admin-login', 10, 15 * 60 * 1000, 'Too many admin sign-in attempts. Try again later.')) return;
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const storedAdmin = findAdminByUsername(username);
    const isRootAdmin = username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() && verifyPassword(String(body.password || ''), CHASE_ADMIN_PASSWORD_HASH);
    const isStoredAdmin = storedAdmin && storedAdmin.status === 'active' && verifyPassword(String(body.password || ''), storedAdmin.passwordHash);
    if (!isRootAdmin && !isStoredAdmin) return sendJson(res, 401, { error: 'Admin username or password is incorrect.' });
    const role = isRootAdmin ? 'admin' : storedAdmin.role;
    const adminUsername = isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username;
    const token = createAdminToken(adminUsername, role);
    createSession(token, isRootAdmin ? '__chase_admin__' : `admin:${storedAdmin.username}`, role);
    auditAdmin('Admin sign-in', { username: isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username, role }, isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username);
    return sendJson(res, 200, { token, admin: { username: isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username, label: isRootAdmin ? 'Chase administrator' : storedAdmin.fullName, role } }, sessionCookieHeader(req, token, role));
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    if (!getSimulatorSettings().allowEnrollment) return sendJson(res, 403, { error: 'Online enrollment is temporarily disabled in this simulator.' });
    if (limited(req, res, 'register', 20, 60 * 60 * 1000, 'Too many enrollment attempts. Please wait and try again.')) return;
    const body = await readBody(req);
    const required = ['firstName', 'lastName', 'email', 'username', 'password', 'product'];
    for (const field of required) {
      if (!body[field] || !String(body[field]).trim()) {
        return sendJson(res, 400, { error: `${field} is required` });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
      return sendJson(res, 400, { error: 'Enter a valid email address' });
    }
    if (String(body.username).trim().length < 4 || String(body.username).trim().length > 32) {
      return sendJson(res, 400, { error: 'Username must be 4–32 characters' });
    }
    if (String(body.password).length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }
    if (String(body.username).trim().toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase()) {
      return sendJson(res, 400, { error: 'That username is reserved for the separate administrator sign-in.' });
    }
    if (findUserByUsername(body.username)) {
      return sendJson(res, 400, { error: 'That username is already taken' });
    }
    const product = PRODUCTS.find((p) => p.id === body.product);
    if (!product) return sendJson(res, 400, { error: 'Invalid product' });
    const deposit = openingDeposit(body.openingDeposit, product.type === 'credit-card');
    if (deposit === null) {
      return sendJson(res, 400, { error: 'Opening deposit must be between $0 and $100,000' });
    }
    const user = {
      id: uid(),
      username: String(body.username).trim(),
      passwordHash: hashPassword(String(body.password)),
      fullName: `${body.firstName} ${body.lastName}`.trim(),
      email: String(body.email).trim(),
      phone: String(body.phone || '').trim(),
      address: [body.address, body.city, body.state, body.zip].filter(Boolean).join(', '),
      accounts: [buildAccount(product, deposit)],
      payees: [],
      investments: defaultInvestments(),
      security: defaultSecurity(),
      preferences: defaultPreferences(),
      home: null,
      credit: defaultCredit(),
      scheduledPayments: [],
      disputes: [],
      travelNotices: [],
      travelBookings: [],
      createdAt: new Date().toISOString(),
    };
    insertUser(user);
    const token = newToken();
    createSession(token, user.id);
    return sendJson(res, 201, { user: publicUser(user), token }, sessionCookieHeader(req, token));
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const adminUsername = String(body.username || '').trim();
    const storedAdmin = findAdminByUsername(adminUsername);
    const rootNameMatch = adminUsername.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase();
    const isRootAdmin = rootNameMatch && verifyPassword(String(body.password || ''), CHASE_ADMIN_PASSWORD_HASH);
    const isStoredAdmin = storedAdmin && storedAdmin.status === 'active' && verifyPassword(String(body.password || ''), storedAdmin.passwordHash);
    if (rootNameMatch || storedAdmin) {
      if (limited(req, res, 'admin-login', 10, 15 * 60 * 1000, 'Too many admin sign-in attempts. Try again later.')) return;
      if (!isRootAdmin && !isStoredAdmin) return sendJson(res, 401, { error: 'The username or password you entered is incorrect. Please try again.' });
      const role = isRootAdmin ? 'admin' : storedAdmin.role;
      const token = createAdminToken(isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username, role);
      createSession(token, isRootAdmin ? '__chase_admin__' : `admin:${storedAdmin.username}`, role);
      auditAdmin('Admin sign-in through customer login', { username: isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username, role }, isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username);
      return sendJson(res, 200, { admin: { username: isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username, label: isRootAdmin ? 'Chase administrator' : storedAdmin.fullName, role }, token }, sessionCookieHeader(req, token, role));
    }
    const bucket = `login:${String(body.username || '').trim().toLowerCase()}`;
    if (tooManyFailures(req, bucket, 10)) {
      return sendJson(res, 429, { error: 'Too many unsuccessful sign-in attempts. Please wait 15 minutes and try again.' });
    }
    const user = findUserByUsername(body.username || '');
    if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
      recordFailure(req, bucket, 15 * 60 * 1000);
      return sendJson(
        res,
        401,
        { error: 'The username or password you entered is incorrect. Please try again.' }
      );
    }
    if (user.status === 'suspended') return sendJson(res, 403, { error: 'This simulated account is suspended. Contact the Chase administrator.' });
    clearFailures(req, bucket);
    const token = newToken();
    createSession(token, user.id);
    return sendJson(res, 200, { user: publicUser(user), token }, sessionCookieHeader(req, token));
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = bearerToken(req);
    if (token) deleteSession(token);
    return sendJson(res, 200, { ok: true }, sessionCookieHeader(req));
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = url.searchParams.get('username') || '';
    return sendJson(res, 200, { taken: !!findUserByUsername(username) });
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    if (!getSimulatorSettings().allowCustomerPasswordReset) return sendJson(res, 403, { error: 'Password reset is temporarily disabled in this simulator.' });
    if (limited(req, res, 'reset', 10, 60 * 60 * 1000, 'Too many password reset attempts. Please wait and try again.')) return;
    const body = await readBody(req);
    if (String(body.newPassword || '').length < 8) {
      return sendJson(res, 400, { error: 'New password must be at least 8 characters' });
    }
    const user = findUserByUsername(body.username || '');
    const emailMatches =
      user && String(user.email || '').trim().toLowerCase() === String(body.email || '').trim().toLowerCase();
    if (!emailMatches) {
      return sendJson(res, 400, { error: "We couldn't verify that username and email. Check them and try again." });
    }
    const updated = { ...user, passwordHash: hashPassword(String(body.newPassword)) };
    updateUser(updated);
    deleteSessionsForUser(user.id);
    return sendJson(res, 200, { ok: true });
  }

  /* -------------------------- Admin simulator API ------------------------- */
  if (pathname.startsWith('/api/admin/')) {
    const adminSession = getAdminSession(req);
    if (!adminSession) return sendJson(res, 401, { error: 'Admin sign-in required.' });
    if (adminSession.role === 'auditor' && method !== 'GET' && !(pathname === '/api/admin/logout' && method === 'POST')) {
      return sendJson(res, 403, { error: 'This auditor account has read-only access.' });
    }
    const auditActor = adminSession.userId === '__chase_admin__' ? CHASE_ADMIN_USERNAME : String(adminSession.userId || '').replace(/^admin:/, '');
    const recordAdminAudit = (action, details = {}) => auditAdmin(action, details, auditActor);

    if (pathname === '/api/admin/me' && method === 'GET') {
      const username = adminSession.userId === '__chase_admin__' ? CHASE_ADMIN_USERNAME : String(adminSession.userId || '').replace(/^admin:/, '');
      const storedAdmin = adminSession.userId === '__chase_admin__' ? null : findAdminByUsername(username);
      return sendJson(res, 200, { admin: { username, label: storedAdmin?.fullName || 'Chase administrator', role: adminSession.role } });
    }

    if (pathname === '/api/admin/me/password' && method === 'PUT') {
      if (adminSession.userId === '__chase_admin__') return sendJson(res, 400, { error: 'The root admin password is managed by CHASE_ADMIN_PASSWORD in the server environment.' });
      const body = await readBody(req);
      const username = String(adminSession.userId || '').replace(/^admin:/, '');
      const storedAdmin = findAdminByUsername(username);
      if (!storedAdmin || !verifyPassword(String(body.currentPassword || ''), storedAdmin.passwordHash)) return sendJson(res, 400, { error: 'Current admin password is incorrect.' });
      if (body.confirm !== true || String(body.newPassword || '').length < 10) return sendJson(res, 400, { error: 'Confirm the change and provide a new password of at least 10 characters.' });
      updateAdminAccount(storedAdmin.id, { passwordHash: hashPassword(String(body.newPassword)) });
      revokeSession(bearerToken(req));
      recordAdminAudit('Changed own simulator admin password', { username });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/admins' && method === 'GET') {
      return sendJson(res, 200, { admins: [{ id: '__root__', username: CHASE_ADMIN_USERNAME, fullName: 'Chase administrator', role: 'admin', status: 'active', protected: true }, ...listAdminAccounts()] });
    }

    if (pathname === '/api/admin/admins' && method === 'POST') {
      const body = await readBody(req);
      const username = cleanText(body.username, 32);
      const fullName = cleanText(body.fullName, 80);
      const password = String(body.password || '');
      const role = body.role;
      if (!/^[a-zA-Z0-9._-]{4,32}$/.test(username) || !fullName || password.length < 10 || !['admin', 'auditor'].includes(role)) {
        return sendJson(res, 400, { error: 'Provide a valid username, full name, password of at least 10 characters, and admin or auditor role.' });
      }
      if (username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || findAdminByUsername(username) || findUserByUsername(username)) return sendJson(res, 409, { error: 'That username is already reserved.' });
      const admin = { id: uid(), username, fullName, role, status: 'active', passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      insertAdminAccount(admin);
      recordAdminAudit('Created simulator administrator', { adminId: admin.id, username, role });
      const { passwordHash, ...publicAdmin } = admin;
      return sendJson(res, 201, { admin: publicAdmin });
    }

    const adminRoute = pathname.match(/^\/api\/admin\/admins\/([^/]+)$/);
    if (adminRoute) {
      const adminId = decodeURIComponent(adminRoute[1]);
      if (adminId === '__root__') return sendJson(res, 400, { error: 'The environment-configured root admin cannot be edited here.' });
      const existing = listAdminAccounts().find((admin) => admin.id === adminId);
      if (!existing) return sendJson(res, 404, { error: 'Simulator administrator not found.' });
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = {};
        if (body.role !== undefined) {
          if (!['admin', 'auditor'].includes(body.role)) return sendJson(res, 400, { error: 'Role must be admin or auditor.' });
          patch.role = body.role;
        }
        if (body.status !== undefined) {
          if (!['active', 'disabled'].includes(body.status)) return sendJson(res, 400, { error: 'Status must be active or disabled.' });
          patch.status = body.status;
        }
        if (body.password !== undefined) {
          if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm this administrator password reset.' });
          if (String(body.password).length < 10) return sendJson(res, 400, { error: 'Admin password must be at least 10 characters.' });
          patch.passwordHash = hashPassword(String(body.password));
        }
        const updated = updateAdminAccount(adminId, patch);
        recordAdminAudit('Updated simulator administrator', { adminId, fields: Object.keys(patch) });
        return sendJson(res, 200, { admin: updated });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        const currentUsername = String(adminSession.userId || '').replace(/^admin:/, '');
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm admin account deletion.' });
        if (currentUsername.toLowerCase() === existing.username.toLowerCase()) return sendJson(res, 400, { error: 'You cannot delete your own active admin identity.' });
        deleteAdminAccount(adminId);
        recordAdminAudit('Deleted simulator administrator', { adminId, username: existing.username });
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/overview' && method === 'GET') {
      const users = findAllUsers();
      const accounts = users.flatMap((u) => u.accounts || []);
      const transactions = accounts.flatMap((a) => a.transactions || []);
      return sendJson(res, 200, {
        metrics: {
          users: users.length,
          suspendedUsers: users.filter((u) => u.status === 'suspended').length,
          accounts: accounts.length,
          deposits: round2(accounts.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
          cardBalances: round2(accounts.filter((a) => a.type === 'credit-card').reduce((n, a) => n + Number(a.balance || 0), 0)),
          scheduledPayments: users.reduce((n, u) => n + (u.scheduledPayments || []).filter((s) => s.status === 'scheduled' || s.status === 'paused').length, 0),
          transactions: transactions.length,
        },
        recentAudit: getAuditLog(8),
      });
    }

    if (pathname === '/api/admin/transactions' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || '';
      const through = url.searchParams.get('through') || '';
      const allRows = findAllUsers().flatMap((user) => (user.accounts || []).flatMap((account) => (account.transactions || []).map((transaction) => ({
        ...transaction, userId: user.id, username: user.username, fullName: user.fullName, accountId: account.id, accountName: account.name, accountType: account.type,
      }))));
      const filtered = allRows.filter((row) => {
        const haystack = `${row.username} ${row.fullName} ${row.accountName} ${row.description} ${row.category}`.toLowerCase();
        return (!q || haystack.includes(q)) && (!status || row.status === status) && (!from || row.date.slice(0, 10) >= from) && (!through || row.date.slice(0, 10) <= through);
      }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const total = filtered.length;
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const requestedLimit = Number(url.searchParams.get('limit')) || 100;
      const limit = Math.max(1, Math.min(5000, requestedLimit));
      return sendJson(res, 200, { transactions: filtered.slice(offset, offset + limit), total, offset, limit });
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      const users = findAllUsers().map((u) => {
        const accounts = u.accounts || [];
        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          status: u.status || 'active',
          createdAt: u.createdAt,
          accountCount: accounts.length,
          depositBalance: round2(accounts.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
          cardBalance: round2(accounts.filter((a) => a.type === 'credit-card').reduce((n, a) => n + Number(a.balance || 0), 0)),
        };
      }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return sendJson(res, 200, { users });
    }

    if (pathname === '/api/admin/audit' && method === 'GET') {
      const allAudit = getAuditLog(5000);
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const requestedLimit = Number(url.searchParams.get('limit')) || 100;
      const limit = Math.max(1, Math.min(5000, requestedLimit));
      return sendJson(res, 200, { audit: allAudit.slice(offset, offset + limit), total: allAudit.length, offset, limit });
    }

    if (pathname === '/api/admin/settings' && method === 'GET') {
      return sendJson(res, 200, { settings: getSimulatorSettings() });
    }

    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const body = await readBody(req);
      const settings = body.settings || {};
      if (typeof settings.allowEnrollment !== 'boolean' || typeof settings.allowCustomerPasswordReset !== 'boolean') {
        return sendJson(res, 400, { error: 'Provide both simulator access settings as boolean values.' });
      }
      const saved = updateSimulatorSettings({ allowEnrollment: settings.allowEnrollment, allowCustomerPasswordReset: settings.allowCustomerPasswordReset });
      recordAdminAudit('Updated simulator access settings', saved);
      return sendJson(res, 200, { settings: saved });
    }

    if (pathname === '/api/admin/backup' && adminSession.role !== 'admin') return sendJson(res, 403, { error: 'Only admin-role accounts may export or restore backups.' });
    if (pathname === '/api/admin/backup' && method === 'GET') {
      return sendJson(res, 200, { format: 'chase-simulator-backup-v1', createdAt: new Date().toISOString(), users: findAllUsers(), settings: getSimulatorSettings() });
    }
    if (pathname === '/api/admin/backup' && method === 'POST') {
      const body = await readBody(req, 20_000_000);
      if (body.confirmText !== 'RESTORE SIMULATOR BACKUP') return sendJson(res, 400, { error: 'Type RESTORE SIMULATOR BACKUP to confirm.' });
      if (body.format !== 'chase-simulator-backup-v1' || !Array.isArray(body.users) || body.users.length > 5000) return sendJson(res, 400, { error: 'Unsupported or invalid simulator backup file.' });
      const seenUsers = new Set();
      const validUsers = body.users.every((user) => {
        const username = String(user?.username || '').trim().toLowerCase();
        if (!user || typeof user.id !== 'string' || !/^[a-z0-9._-]{4,32}$/.test(username) || !Array.isArray(user.accounts) || typeof user.passwordHash !== 'string' || !user.passwordHash.includes(':') || seenUsers.has(username) || username === CHASE_ADMIN_USERNAME.toLowerCase()) return false;
        seenUsers.add(username);
        return user.accounts.every((account) => account && typeof account.id === 'string' && ['checking', 'savings', 'credit-card', 'cd', 'auto-loan', 'mortgage'].includes(account.type) && Number.isFinite(Number(account.balance)) && Array.isArray(account.transactions || []));
      });
      if (!validUsers) return sendJson(res, 400, { error: 'Backup contains invalid, duplicate, or incomplete user records.' });
      resetUsers(body.users);
      if (body.settings && typeof body.settings.allowEnrollment === 'boolean' && typeof body.settings.allowCustomerPasswordReset === 'boolean') updateSimulatorSettings(body.settings);
      recordAdminAudit('Restored simulator backup', { usersRestored: body.users.length });
      return sendJson(res, 200, { ok: true, usersRestored: body.users.length });
    }

    if (pathname === '/api/admin/users/bulk' && method === 'POST') {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => typeof id === 'string'))] : [];
      if (!ids.length || ids.length > 100 || !['suspend', 'reactivate', 'delete'].includes(body.action)) return sendJson(res, 400, { error: 'Select between 1 and 100 users and a supported bulk action.' });
      if (body.action === 'delete' && body.confirmText !== 'DELETE SELECTED USERS') return sendJson(res, 400, { error: 'Type DELETE SELECTED USERS to confirm.' });
      const targets = ids.map(findUserById).filter(Boolean);
      if (targets.length !== ids.length) return sendJson(res, 404, { error: 'One or more selected users no longer exist.' });
      for (const target of targets) {
        if (body.action === 'delete') deleteUserById(target.id);
        else {
          const status = body.action === 'suspend' ? 'suspended' : 'active';
          updateUser({ ...target, status });
          if (status === 'suspended') deleteSessionsForUser(target.id);
        }
      }
      recordAdminAudit(`Bulk ${body.action} simulator users`, { userIds: ids, count: ids.length });
      return sendJson(res, 200, { ok: true, updated: ids.length });
    }

    if (pathname === '/api/admin/users' && method === 'POST') {
      const body = await readBody(req);
      const username = cleanText(body.username, 32);
      const fullName = cleanText(body.fullName || 'Sample Customer', 80);
      const email = cleanText(body.email || `${username}@example.com`, 120);
      const password = String(body.password || 'chase123');
      if (!/^[a-zA-Z0-9._-]{4,32}$/.test(username)) return sendJson(res, 400, { error: 'Username must be 4–32 letters, numbers, periods, underscores, or hyphens.' });
      if (username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase()) return sendJson(res, 400, { error: 'That username is reserved for the administrator.' });
      if (password.length < 8) return sendJson(res, 400, { error: 'Temporary password must be at least 8 characters.' });
      if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Enter a full name and valid email address.' });
      if (findAllUsers().some((u) => u.username.toLowerCase() === username.toLowerCase())) return sendJson(res, 409, { error: 'That username is already in use.' });
      const sampleUser = buildChaseUser();
      sampleUser.username = username;
      sampleUser.fullName = fullName;
      sampleUser.email = email;
      sampleUser.passwordHash = hashPassword(password);
      sampleUser.status = 'active';
      sampleUser.adminCreated = true;
      insertUser(sampleUser);
      recordAdminAudit('Created simulator user', { userId: sampleUser.id, username });
      return sendJson(res, 201, { user: publicUser(sampleUser) });
    }

    if (pathname === '/api/admin/reset' && method === 'POST') {
      const body = await readBody(req);
      if (body.confirmText !== 'RESET SIMULATOR') return sendJson(res, 400, { error: 'Type RESET SIMULATOR to confirm.' });
      const sampleUser = buildChaseUser();
      sampleUser.passwordHash = hashPassword('chase123');
      sampleUser.username = 'chase';
      sampleUser.status = 'active';
      resetUsers([sampleUser]);
      recordAdminAudit('Reset simulator data to fresh sample profile');
      return sendJson(res, 200, { ok: true, sampleUsername: 'chase' });
    }

    const bulkAccountRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/accounts\/bulk$/);
    if (bulkAccountRoute && method === 'POST') {
      const userId = decodeURIComponent(bulkAccountRoute[1]);
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const body = await readBody(req);
      const accountIds = Array.isArray(body.accountIds) ? [...new Set(body.accountIds.filter((id) => typeof id === 'string'))] : [];
      if (!accountIds.length || accountIds.length > 100 || !['lock', 'unlock', 'delete'].includes(body.action)) return sendJson(res, 400, { error: 'Select 1–100 accounts and choose lock, unlock, or delete.' });
      if (body.action === 'delete' && body.confirmText !== 'DELETE SELECTED ACCOUNTS') return sendJson(res, 400, { error: 'Type DELETE SELECTED ACCOUNTS to confirm.' });
      const accounts = target.accounts || [];
      if (accountIds.some((id) => !accounts.some((account) => account.id === id))) return sendJson(res, 404, { error: 'One or more selected accounts no longer exist.' });
      const updatedAccounts = body.action === 'delete'
        ? accounts.filter((account) => !accountIds.includes(account.id))
        : accounts.map((account) => accountIds.includes(account.id) ? { ...account, locked: body.action === 'lock' } : account);
      const updated = { ...target, accounts: updatedAccounts };
      updateUser(updated);
      recordAdminAudit(`Bulk ${body.action} simulator accounts`, { userId, username: target.username, accountIds });
      return sendJson(res, 200, { user: publicUser(updated), updated: accountIds.length });
    }

    const accountRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/accounts(?:\/([^/]+))?$/);
    if (accountRoute) {
      const userId = decodeURIComponent(accountRoute[1]);
      const accountId = accountRoute[2] ? decodeURIComponent(accountRoute[2]) : null;
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const accounts = target.accounts || [];

      if (!accountId && method === 'POST') {
        const body = await readBody(req);
        const type = String(body.type || '');
        const allowed = new Set(['checking', 'savings', 'credit-card', 'cd', 'auto-loan', 'mortgage']);
        const name = cleanText(body.name, 80);
        const balance = Number(body.balance);
        const creditLimit = body.creditLimit === '' || body.creditLimit == null ? undefined : Number(body.creditLimit);
        if (!allowed.has(type) || !name || !Number.isFinite(balance) || Math.abs(balance) > 100000000 || (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > 100000000))) {
          return sendJson(res, 400, { error: 'Provide a valid account type, name, balance, and optional credit limit.' });
        }
        const account = {
          id: uid(), type, name, mask: mask4(), balance: round2(balance),
          ...(creditLimit !== undefined ? { creditLimit: round2(creditLimit) } : {}),
          locked: false, autopay: false, transactions: [], createdAt: new Date().toISOString(),
        };
        const updated = { ...target, accounts: [...accounts, account] };
        updateUser(updated);
        recordAdminAudit('Created simulator account', { userId, username: target.username, accountId: account.id, type });
        return sendJson(res, 201, { user: publicUser(updated), account });
      }

      const index = accounts.findIndex((account) => account.id === accountId);
      if (index < 0) return sendJson(res, 404, { error: 'Simulator account not found.' });
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = body.account || {};
        const existing = accounts[index];
        const next = { ...existing };
        if (patch.name !== undefined) {
          next.name = cleanText(patch.name, 80);
          if (!next.name) return sendJson(res, 400, { error: 'Account name is required.' });
        }
        for (const field of ['balance', 'creditLimit', 'apr', 'monthlyPayment']) {
          if (field === 'creditLimit' && patch[field] === null) {
            delete next[field];
            continue;
          }
          if (patch[field] !== undefined) {
            const value = Number(patch[field]);
            if (!Number.isFinite(value) || Math.abs(value) > 100000000 || (field !== 'balance' && value < 0)) return sendJson(res, 400, { error: `Invalid account ${field}.` });
            next[field] = round2(value);
          }
        }
        for (const field of ['locked', 'autopay', 'hidden', 'favorite']) if (patch[field] !== undefined) next[field] = !!patch[field];
        const updated = { ...target, accounts: accounts.map((account, i) => i === index ? next : account) };
        updateUser(updated);
        recordAdminAudit('Updated simulator account', { userId, username: target.username, accountId, fields: Object.keys(patch) });
        return sendJson(res, 200, { user: publicUser(updated), account: next });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm account deletion.' });
        const updated = { ...target, accounts: accounts.filter((account) => account.id !== accountId) };
        updateUser(updated);
        recordAdminAudit('Deleted simulator account', { userId, username: target.username, accountId });
        return sendJson(res, 200, { user: publicUser(updated), ok: true });
      }
    }

    const transactionRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/transactions(?:\/([^/]+))?$/);
    if (transactionRoute) {
      const userId = decodeURIComponent(transactionRoute[1]);
      const transactionId = transactionRoute[2] ? decodeURIComponent(transactionRoute[2]) : null;
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const accounts = (target.accounts || []).map((account) => ({ ...account, transactions: [...(account.transactions || [])] }));
      const matches = [];
      for (const account of accounts) for (let index = 0; index < account.transactions.length; index++) {
        if (account.transactions[index].id === transactionId) matches.push({ account, index });
      }
      if (!transactionId && method === 'GET') {
        const transactions = accounts.flatMap((account) => account.transactions.map((transaction) => ({ ...transaction, accountId: account.id, accountName: account.name, accountType: account.type }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return sendJson(res, 200, { transactions });
      }
      if (!transactionId && method === 'POST') {
        const body = await readBody(req);
        const account = accounts.find((item) => item.id === body.accountId);
        const transaction = body.transaction || {};
        const amount = Number(transaction.amount);
        const date = new Date(transaction.date || Date.now());
        const description = cleanText(transaction.description, 120);
        const category = cleanText(transaction.category || 'Other', 48);
        if (!account || !description || !Number.isFinite(amount) || Math.abs(amount) > 10000000 || Number.isNaN(+date) || !['posted', 'pending'].includes(transaction.status || 'posted')) return sendJson(res, 400, { error: 'Choose an account and provide valid transaction details.' });
        const created = { id: uid(), date: date.toISOString(), description, amount: round2(amount), category, status: transaction.status || 'posted' };
        account.transactions.push(created);
        account.balance = round2(Number(account.balance || 0) + created.amount);
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Created simulator ledger transaction', { userId, username: target.username, accountId: account.id, transactionId: created.id, amount: created.amount });
        return sendJson(res, 201, { user: publicUser(updated), transaction: { ...created, accountId: account.id, accountName: account.name, accountType: account.type } });
      }
      if (matches.length !== 1) return sendJson(res, matches.length ? 409 : 404, { error: matches.length ? 'Transaction ID is not unique.' : 'Simulator transaction not found.' });
      const { account, index } = matches[0];
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = body.transaction || {};
        const existing = account.transactions[index];
        const updatedTransaction = { ...existing };
        if (patch.description !== undefined) updatedTransaction.description = cleanText(patch.description, 120);
        if (patch.category !== undefined) updatedTransaction.category = cleanText(patch.category, 48) || 'Other';
        if (patch.amount !== undefined) {
          const amount = Number(patch.amount);
          if (!Number.isFinite(amount) || Math.abs(amount) > 10000000) return sendJson(res, 400, { error: 'Enter a valid transaction amount.' });
          updatedTransaction.amount = round2(amount);
        }
        if (patch.date !== undefined) {
          const date = new Date(patch.date);
          if (Number.isNaN(+date)) return sendJson(res, 400, { error: 'Enter a valid transaction date.' });
          updatedTransaction.date = date.toISOString();
        }
        if (patch.status !== undefined) {
          if (!['posted', 'pending'].includes(patch.status)) return sendJson(res, 400, { error: 'Transaction status must be posted or pending.' });
          updatedTransaction.status = patch.status;
        }
        if (!updatedTransaction.description) return sendJson(res, 400, { error: 'Transaction description is required.' });
        account.balance = round2(Number(account.balance || 0) + updatedTransaction.amount - Number(existing.amount || 0));
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        account.transactions[index] = updatedTransaction;
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Updated simulator ledger transaction', { userId, username: target.username, accountId: account.id, transactionId });
        return sendJson(res, 200, { user: publicUser(updated), transaction: { ...updatedTransaction, accountId: account.id, accountName: account.name, accountType: account.type } });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm transaction deletion.' });
        const [deletedTransaction] = account.transactions.splice(index, 1);
        account.balance = round2(Number(account.balance || 0) - Number(deletedTransaction.amount || 0));
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Deleted simulator ledger transaction', { userId, username: target.username, accountId: account.id, transactionId });
        return sendJson(res, 200, { user: publicUser(updated), ok: true });
      }
    }

    const adminTransferRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/transfers$/);
    if (adminTransferRoute && method === 'POST') {
      const userId = decodeURIComponent(adminTransferRoute[1]);
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const body = await readBody(req);
      const amount = round2(Number(body.amount));
      const accounts = JSON.parse(JSON.stringify(target.accounts || []));
      const from = accounts.find((account) => account.id === body.fromAccountId && DEPOSIT_TYPES.has(account.type));
      const to = accounts.find((account) => account.id === body.toAccountId && account.id !== body.fromAccountId);
      if (!from || !to || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) return sendJson(res, 400, { error: 'Choose valid source/destination accounts and a positive transfer amount.' });
      if (Number(from.balance || 0) < amount) return sendJson(res, 400, { error: 'The source simulator account has insufficient balance.' });
      if (['auto-loan', 'mortgage'].includes(to.type) && amount > Number(to.balance || 0)) return sendJson(res, 400, { error: 'Payment amount cannot exceed the loan principal balance.' });
      const transferId = uid();
      const date = new Date(body.date || Date.now());
      if (Number.isNaN(+date)) return sendJson(res, 400, { error: 'Choose a valid transfer date.' });
      const label = cleanText(body.description || `Simulated transfer to ${to.name}`, 100);
      from.balance = round2(Number(from.balance || 0) - amount);
      from.transactions.unshift({ id: uid(), transferId, date: date.toISOString(), description: label, amount: -amount, category: 'Transfer', status: 'posted' });
      const paysDebt = ['credit-card', 'auto-loan', 'mortgage'].includes(to.type);
      if (paysDebt) {
        to.balance = round2(Number(to.balance || 0) - amount);
        to.transactions.unshift({ id: uid(), transferId, date: date.toISOString(), description: `Simulated payment from ${from.name}`, amount: -amount, category: to.type === 'credit-card' ? 'Card payment' : 'Loan payment', status: 'posted' });
      } else {
        to.balance = round2(Number(to.balance || 0) + amount);
        to.transactions.unshift({ id: uid(), transferId, date: date.toISOString(), description: `Simulated transfer from ${from.name}`, amount, category: 'Transfer', status: 'posted' });
      }
      if (to.type === 'credit-card') to.statementBalance = to.balance;
      const updated = { ...target, accounts };
      updateUser(updated);
      recordAdminAudit('Completed simulated admin transfer', { userId, username: target.username, fromAccountId: from.id, toAccountId: to.id, amount });
      return sendJson(res, 200, { user: publicUser(updated), transferId, amount });
    }

    const payeeRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/payees(?:\/([^/]+))?$/);
    if (payeeRoute) {
      const userId = decodeURIComponent(payeeRoute[1]);
      const payeeId = payeeRoute[2] ? decodeURIComponent(payeeRoute[2]) : null;
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const payees = target.payees || [];
      if (!payeeId && method === 'POST') {
        const body = await readBody(req);
        const name = cleanText(body.name, 80);
        const accountNumber = cleanText(body.accountNumber, 40);
        const category = cleanText(body.category || 'Other', 48);
        if (!name || !accountNumber) return sendJson(res, 400, { error: 'Payee name and masked account reference are required.' });
        const payee = { id: uid(), name, accountNumber, category };
        const updated = { ...target, payees: [...payees, payee] };
        updateUser(updated);
        recordAdminAudit('Created simulated payee', { userId, username: target.username, payeeId: payee.id });
        return sendJson(res, 201, { user: publicUser(updated), payee });
      }
      const existing = payees.find((item) => item.id === payeeId);
      if (!existing) return sendJson(res, 404, { error: 'Simulator payee not found.' });
      if (method === 'PUT') {
        const body = await readBody(req);
        const updatedPayee = { ...existing, ...body.payee };
        updatedPayee.name = cleanText(updatedPayee.name, 80);
        updatedPayee.accountNumber = cleanText(updatedPayee.accountNumber, 40);
        updatedPayee.category = cleanText(updatedPayee.category || 'Other', 48);
        if (!updatedPayee.name || !updatedPayee.accountNumber) return sendJson(res, 400, { error: 'Payee name and account reference are required.' });
        const updated = { ...target, payees: payees.map((item) => item.id === payeeId ? updatedPayee : item) };
        updateUser(updated);
        recordAdminAudit('Updated simulated payee', { userId, username: target.username, payeeId });
        return sendJson(res, 200, { user: publicUser(updated), payee: updatedPayee });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm payee deletion.' });
        const scheduledPayments = (target.scheduledPayments || []).filter((payment) => payment.payeeId !== payeeId);
        const updated = { ...target, payees: payees.filter((item) => item.id !== payeeId), scheduledPayments };
        updateUser(updated);
        recordAdminAudit('Deleted simulated payee', { userId, username: target.username, payeeId });
        return sendJson(res, 200, { user: publicUser(updated), ok: true });
      }
    }

    const scheduleRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/scheduled(?:\/([^/]+))?$/);
    if (scheduleRoute) {
      const userId = decodeURIComponent(scheduleRoute[1]);
      const paymentId = scheduleRoute[2] ? decodeURIComponent(scheduleRoute[2]) : null;
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const scheduled = target.scheduledPayments || [];
      if (!paymentId && method === 'POST') {
        const body = await readBody(req);
        const fields = body.payment || {};
        const allowedKinds = ['transfer', 'bill', 'card', 'loan'];
        const from = (target.accounts || []).find((account) => account.id === fields.fromAccountId);
        const to = (target.accounts || []).find((account) => account.id === fields.toAccountId);
        const payee = (target.payees || []).find((item) => item.id === fields.payeeId);
        const amount = Number(fields.amount);
        const date = new Date(fields.date);
        if (!allowedKinds.includes(fields.kind) || !fields.label || !from || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Number.isNaN(+date) || !['once', 'monthly'].includes(fields.frequency) || (fields.kind === 'bill' && !payee) || (fields.kind !== 'bill' && fields.toAccountId && !to)) return sendJson(res, 400, { error: 'Provide a valid scheduled simulator payment and matching accounts/payee.' });
        const payment = { id: uid(), kind: fields.kind, label: cleanText(fields.label, 100), fromAccountId: from.id, ...(to ? { toAccountId: to.id } : {}), ...(payee ? { payeeId: payee.id } : {}), amount: round2(amount), date: date.toISOString(), frequency: fields.frequency, status: 'scheduled', createdAt: new Date().toISOString() };
        const updated = { ...target, scheduledPayments: [...scheduled, payment] };
        updateUser(updated);
        recordAdminAudit('Created simulated scheduled payment', { userId, username: target.username, paymentId: payment.id, amount: payment.amount });
        return sendJson(res, 201, { user: publicUser(updated), payment });
      }
      const existing = scheduled.find((payment) => payment.id === paymentId);
      if (!existing) return sendJson(res, 404, { error: 'Scheduled simulator payment not found.' });
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = body.payment || {};
        const updatedPayment = { ...existing };
        for (const field of ['label', 'status', 'frequency', 'date', 'amount']) if (patch[field] !== undefined) updatedPayment[field] = patch[field];
        if (!['scheduled', 'paused', 'paid', 'cancelled'].includes(updatedPayment.status) || !['once', 'monthly'].includes(updatedPayment.frequency) || !Number.isFinite(Number(updatedPayment.amount)) || Number(updatedPayment.amount) <= 0 || Number.isNaN(+new Date(updatedPayment.date)) || !cleanText(updatedPayment.label, 100)) return sendJson(res, 400, { error: 'Invalid scheduled payment update.' });
        updatedPayment.amount = round2(Number(updatedPayment.amount));
        updatedPayment.date = new Date(updatedPayment.date).toISOString();
        updatedPayment.label = cleanText(updatedPayment.label, 100);
        const updated = { ...target, scheduledPayments: scheduled.map((payment) => payment.id === paymentId ? updatedPayment : payment) };
        updateUser(updated);
        recordAdminAudit('Updated simulated scheduled payment', { userId, username: target.username, paymentId, status: updatedPayment.status });
        return sendJson(res, 200, { user: publicUser(updated), payment: updatedPayment });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm scheduled payment deletion.' });
        const updated = { ...target, scheduledPayments: scheduled.filter((payment) => payment.id !== paymentId) };
        updateUser(updated);
        recordAdminAudit('Deleted simulated scheduled payment', { userId, username: target.username, paymentId });
        return sendJson(res, 200, { user: publicUser(updated), ok: true });
      }
    }

    const disputeRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/disputes(?:\/([^/]+)(?:\/(refund))?)?$/);
    if (disputeRoute) {
      const userId = decodeURIComponent(disputeRoute[1]);
      const disputeId = disputeRoute[2] ? decodeURIComponent(disputeRoute[2]) : null;
      const subAction = disputeRoute[3] || '';
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const updated = JSON.parse(JSON.stringify(target));
      if (!Array.isArray(updated.disputes)) updated.disputes = [];
      if (!disputeId && method === 'POST') {
        const body = await readBody(req);
        const account = (updated.accounts || []).find((item) => item.id === body.accountId && item.type === 'credit-card');
        const transaction = account?.transactions.find((item) => item.id === body.transactionId);
        const reason = cleanText(body.reason, 160);
        if (!account || !transaction || Number(transaction.amount) <= 0 || !reason) return sendJson(res, 400, { error: 'Choose a valid card purchase and provide a dispute reason.' });
        if (updated.disputes.some((item) => item.transactionId === transaction.id && item.status === 'open')) return sendJson(res, 409, { error: 'This purchase already has an open dispute.' });
        const dispute = { id: uid(), transactionId: transaction.id, accountId: account.id, description: transaction.description, amount: transaction.amount, reason, status: 'open', createdAt: new Date().toISOString() };
        updated.disputes.unshift(dispute);
        transaction.disputedAt = dispute.createdAt;
        updateUser(updated);
        recordAdminAudit('Opened simulated card dispute', { userId, username: target.username, disputeId: dispute.id });
        return sendJson(res, 201, { user: publicUser(updated), dispute });
      }
      const dispute = updated.disputes.find((item) => item.id === disputeId);
      if (!dispute) return sendJson(res, 404, { error: 'Simulator dispute not found.' });
      if (subAction === 'refund' && method === 'POST') {
        const body = await readBody(req);
        if (body.confirm !== true || dispute.status !== 'open') return sendJson(res, 400, { error: 'Confirm the refund for an open dispute.' });
        const account = (updated.accounts || []).find((item) => item.id === dispute.accountId && item.type === 'credit-card');
        if (!account) return sendJson(res, 404, { error: 'Dispute card account not found.' });
        const refundAmount = Math.abs(Number(dispute.amount));
        account.balance = round2(Number(account.balance || 0) - refundAmount);
        account.statementBalance = account.balance;
        const refund = { id: uid(), date: new Date().toISOString(), description: `Simulated refund: ${dispute.description}`, amount: -refundAmount, category: 'Refund', status: 'posted' };
        account.transactions.unshift(refund);
        dispute.status = 'resolved';
        dispute.refundAt = refund.date;
        updateUser(updated);
        recordAdminAudit('Issued simulated dispute refund', { userId, username: target.username, disputeId, refundAmount });
        return sendJson(res, 200, { user: publicUser(updated), refund });
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        if (!['open', 'resolved', 'denied'].includes(body.status)) return sendJson(res, 400, { error: 'Choose open, resolved, or denied.' });
        dispute.status = body.status;
        updateUser(updated);
        recordAdminAudit('Updated simulated dispute status', { userId, username: target.username, disputeId, status: dispute.status });
        return sendJson(res, 200, { user: publicUser(updated), dispute });
      }
    }

    const userRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/(impersonate|reset-password|generate-transactions|revoke-sessions))?$/);
    if (userRoute) {
      const userId = decodeURIComponent(userRoute[1]);
      const action = userRoute[2] || '';
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });

      if (!action && method === 'GET') return sendJson(res, 200, { user: publicUser(target) });

      if (action === 'revoke-sessions' && method === 'POST') {
        deleteSessionsForUser(target.id);
        recordAdminAudit('Revoked simulator user sessions', { userId: target.id, username: target.username });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'generate-transactions' && method === 'POST') {
        const body = await readBody(req);
        const cadence = body.cadence;
        const cadenceDays = { daily: 1, weekly: 7 };
        const allowedCadences = new Set(['daily', 'weekly', 'monthly', 'yearly']);
        const perPeriod = Number(body.perPeriod);
        if (!allowedCadences.has(cadence) || !Number.isInteger(perPeriod) || perPeriod < 1 || perPeriod > 5) {
          return sendJson(res, 400, { error: 'Choose a supported cadence and 1–5 transactions per period.' });
        }
        const isoDate = (value) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
          const date = new Date(`${value}T12:00:00.000Z`);
          return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
        };
        if (!isoDate(body.startDate) || !isoDate(body.endDate)) return sendJson(res, 400, { error: 'Choose valid start and end dates.' });
        const start = new Date(`${body.startDate}T12:00:00.000Z`);
        const end = new Date(`${body.endDate}T23:59:59.999Z`);
        if (body.startDate > body.endDate || body.endDate > new Date().toISOString().slice(0, 10)) {
          return sendJson(res, 400, { error: 'The date range must be valid and end today or earlier.' });
        }

        const periods = [];
        let cursor = new Date(start);
        while (cursor <= end) {
          periods.push(new Date(cursor));
          if (periods.length * perPeriod > 2500) return sendJson(res, 400, { error: 'That range creates more than 2,500 activity events. Shorten the range or choose a slower cadence.' });
          if (cadence === 'daily') cursor.setUTCDate(cursor.getUTCDate() + cadenceDays.daily);
          else if (cadence === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + cadenceDays.weekly);
          else if (cadence === 'monthly') {
            const day = cursor.getUTCDate();
            cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 12));
            cursor.setUTCDate(Math.min(day, new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()));
          } else {
            const month = cursor.getUTCMonth();
            const day = cursor.getUTCDate();
            cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, month, 1, 12));
            cursor.setUTCDate(Math.min(day, new Date(Date.UTC(cursor.getUTCFullYear(), month + 1, 0)).getUTCDate()));
          }
        }

        const updated = JSON.parse(JSON.stringify(target));
        const accounts = updated.accounts || [];
        const checking = accounts.find((a) => a.type === 'checking');
        const savings = accounts.find((a) => a.type === 'savings');
        const creditCards = accounts.filter((a) => a.type === 'credit-card');
        const purchases = [
          { merchant: 'Whole Foods Market', category: 'Groceries', min: 18, max: 185 },
          { merchant: 'Local Market', category: 'Groceries', min: 12, max: 92 },
          { merchant: 'Neighborhood Cafe', category: 'Dining', min: 8, max: 68 },
          { merchant: 'City Transit', category: 'Transportation', min: 2.9, max: 45 },
          { merchant: 'Online Retail', category: 'Shopping', min: 16, max: 210 },
          { merchant: 'Electric Utility', category: 'Bills', min: 45, max: 240 },
          { merchant: 'Streaming Service', category: 'Subscriptions', min: 8, max: 24 },
          { merchant: 'Pharmacy', category: 'Health', min: 9, max: 95 },
        ];
        const roundAmount = (n) => round2(n);
        const amountBetween = (min, max) => {
          const minCents = Math.ceil(min * 100);
          const maxCents = Math.floor(max * 100);
          let cents = minCents + Math.floor(Math.random() * (maxCents - minCents + 1));
          // Keep generated purchases and deposits feeling like real ledger amounts,
          // rather than producing only whole-dollar values by chance.
          if (cents % 100 === 0) cents += cents < maxCents ? 1 : -1;
          return roundAmount(cents / 100);
        };
        let eventIndex = 0;
        let eventsGenerated = 0;
        let transactionCount = 0;
        let eventRowStartCount = 0;
        const isOpenOnDate = (account, date) => !account.createdAt || new Date(account.createdAt) <= date;
        const addTransaction = (account, description, amount, category, date) => {
          if (transactionCount === eventRowStartCount) eventsGenerated += 1;
          if (!Array.isArray(account.transactions)) account.transactions = [];
          const occurredAt = new Date(date);
          occurredAt.setUTCHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
          account.transactions.push({
            id: uid(),
            date: occurredAt.toISOString(),
            description,
            amount: roundAmount(amount),
            category,
            status: 'posted',
          });
          transactionCount += 1;
        };

        for (const period of periods) {
          for (let slot = 0; slot < perPeriod; slot += 1) {
            eventRowStartCount = transactionCount;
            const date = new Date(period);
            date.setUTCHours(Math.min(21, 9 + slot * 3), 0, 0, 0);
            eventIndex += 1;
            const roll = Math.random();
            const eligibleChecking = checking && isOpenOnDate(checking, date);
            const eligibleSavings = savings && isOpenOnDate(savings, date);
            const eligibleCards = creditCards.filter((card) => isOpenOnDate(card, date) && Number(card.balance) < Number(card.creditLimit || 100000));
            const eligibleYieldAccount = accounts.find((account) => ['savings', 'cd'].includes(account.type) && isOpenOnDate(account, date));
            const eligibleLoan = accounts.find((account) => ['mortgage', 'auto-loan'].includes(account.type) && isOpenOnDate(account, date) && Number(account.balance || 0) > 0);

            if (roll < 0.36 && eligibleCards.length) {
              const card = eligibleCards[Math.floor(Math.random() * eligibleCards.length)];
              const purchase = purchases[Math.floor(Math.random() * purchases.length)];
              const available = Math.max(0, Number(card.creditLimit || 100000) - Number(card.balance || 0));
              const amount = Math.min(amountBetween(purchase.min, purchase.max), available);
              if (amount >= 1) {
                card.balance = roundAmount(Number(card.balance || 0) + amount);
                card.rewardsPoints = Number(card.rewardsPoints || 0) + Math.floor(amount);
                addTransaction(card, `${purchase.merchant} · simulated purchase`, amount, purchase.category, date);
                continue;
              }
            }

            if (roll < 0.68 && eligibleChecking) {
              const purchase = purchases[Math.floor(Math.random() * purchases.length)];
              const amount = Math.min(amountBetween(purchase.min, purchase.max), Math.max(0, Number(checking.balance || 0) - 5));
              if (amount >= 1) {
                checking.balance = roundAmount(Number(checking.balance || 0) - amount);
                addTransaction(checking, `${purchase.merchant} · simulated debit`, -amount, purchase.category, date);
                continue;
              }
            }

            if (roll < 0.83 && eligibleChecking) {
              const amount = amountBetween(850, 3400);
              checking.balance = roundAmount(Number(checking.balance || 0) + amount);
              addTransaction(checking, 'Direct deposit · Northstar Payroll', amount, 'Income', date);
              continue;
            }

            if (roll < 0.93 && eligibleChecking && eligibleSavings && Number(checking.balance || 0) > 100) {
              const amount = Math.min(amountBetween(50, 425), Number(checking.balance || 0) - 25);
              checking.balance = roundAmount(Number(checking.balance || 0) - amount);
              savings.balance = roundAmount(Number(savings.balance || 0) + amount);
              addTransaction(checking, `Transfer to ${savings.name} · simulated`, -amount, 'Transfer', date);
              addTransaction(savings, `Transfer from ${checking.name} · simulated`, amount, 'Transfer', date);
              continue;
            }

            if (eligibleChecking && eligibleCards.length) {
              const card = creditCards.filter((item) => isOpenOnDate(item, date) && Number(item.balance || 0) > 0)[0];
              if (card) {
                const amount = Math.min(amountBetween(35, 250), Number(card.balance), Number(checking.balance || 0));
                if (amount >= 1) {
                  checking.balance = roundAmount(Number(checking.balance || 0) - amount);
                  card.balance = roundAmount(Number(card.balance || 0) - amount);
                  addTransaction(checking, `Payment to ${card.name} · simulated`, -amount, 'Credit card payment', date);
                  addTransaction(card, 'Payment received — thank you · simulated', -amount, 'Payment', date);
                  continue;
                }
              }
            }

            if (eligibleChecking && eligibleLoan && cadence === 'monthly' && date.getUTCDate() <= 5) {
              const due = Number(eligibleLoan.monthlyPayment || 250);
              const amount = Math.min(due, Number(eligibleLoan.balance || 0), Number(checking.balance || 0));
              if (amount >= 1) {
                checking.balance = roundAmount(Number(checking.balance || 0) - amount);
                eligibleLoan.balance = roundAmount(Number(eligibleLoan.balance || 0) - amount);
                addTransaction(checking, `Payment to ${eligibleLoan.name} · simulated`, -amount, 'Loan payment', date);
                addTransaction(eligibleLoan, 'Monthly loan payment received · simulated', -amount, 'Loan payment', date);
                continue;
              }
            }

            if (eligibleChecking) {
              const amount = amountBetween(850, 3400);
              checking.balance = roundAmount(Number(checking.balance || 0) + amount);
              addTransaction(checking, 'Direct deposit · Northstar Payroll', amount, 'Income', date);
              continue;
            }

            if (eligibleCards.length) {
              const card = eligibleCards[0];
              const purchase = purchases[Math.floor(Math.random() * purchases.length)];
              const available = Math.max(0, Number(card.creditLimit || 100000) - Number(card.balance || 0));
              const amount = Math.min(amountBetween(purchase.min, purchase.max), available);
              if (amount >= 1) {
                card.balance = roundAmount(Number(card.balance || 0) + amount);
                card.rewardsPoints = Number(card.rewardsPoints || 0) + Math.floor(amount);
                addTransaction(card, `${purchase.merchant} · simulated purchase`, amount, purchase.category, date);
                continue;
              }
            }

            if (eligibleYieldAccount) {
              const annualRate = 0.04;
              const factor = cadence === 'daily' ? annualRate / 365 : cadence === 'weekly' ? annualRate / 52 : cadence === 'monthly' ? annualRate / 12 : annualRate;
              const amount = Math.max(0.01, roundAmount(Number(eligibleYieldAccount.balance || 0) * factor));
              eligibleYieldAccount.balance = roundAmount(Number(eligibleYieldAccount.balance || 0) + amount);
              addTransaction(eligibleYieldAccount, 'Monthly interest credit · simulated', amount, 'Interest', date);
              continue;
            }

            if (eligibleLoan) {
              const amount = Math.min(Number(eligibleLoan.monthlyPayment || 250), Number(eligibleLoan.balance || 0));
              eligibleLoan.balance = roundAmount(Number(eligibleLoan.balance || 0) - amount);
              addTransaction(eligibleLoan, 'Simulated principal payment', -amount, 'Loan payment', date);
            }
          }
        }

        if (transactionCount === 0) return sendJson(res, 400, { error: 'No transactions could be generated for the selected accounts and dates. Check account opening dates and balances.' });
        for (const account of accounts) {
          account.transactions = (account.transactions || []).sort((a, b) => new Date(b.date) - new Date(a.date));
          if (account.type === 'credit-card') account.statementBalance = roundAmount(Number(account.balance || 0));
        }
        updateUser(updated);
        recordAdminAudit('Generated simulator transaction history', {
          userId: target.id, username: target.username, startDate: body.startDate, endDate: body.endDate,
          cadence, periods: periods.length, eventsRequested: eventIndex, eventsGenerated, transactionsAdded: transactionCount,
        });
        return sendJson(res, 200, { user: publicUser(updated), eventsGenerated, transactionsAdded: transactionCount });
      }

      if (action === 'impersonate' && method === 'POST') {
        const token = newToken();
        createSession(token, target.id, 'impersonated');
        recordAdminAudit('Started user impersonation', { userId: target.id, username: target.username });
        return sendJson(res, 200, { token, user: publicUser(target) }, sessionCookieHeader(req, token));
      }

      if (action === 'reset-password' && method === 'POST') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm this password reset.' });
        const password = String(body.password || '');
        if (password.length < 8) return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
        const updated = { ...target, passwordHash: hashPassword(password) };
        updateUser(updated);
        deleteSessionsForUser(target.id);
        recordAdminAudit('Reset simulator user password', { userId: target.id, username: target.username });
        return sendJson(res, 200, { ok: true });
      }

      if (!action && method === 'PUT') {
        const body = await readBody(req);
        if (!body.user || typeof body.user !== 'object' || Array.isArray(body.user)) return sendJson(res, 400, { error: 'Provide a simulator user record.' });
        const patch = body.user;
        const username = cleanText(patch.username ?? target.username, 32);
        if (!username || username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || findAllUsers().some((u) => u.id !== target.id && u.username.toLowerCase() === username.toLowerCase())) {
          return sendJson(res, 400, { error: 'Choose a unique username that is not reserved for the administrator.' });
        }
        const accounts = patch.accounts ?? target.accounts;
        if (!Array.isArray(accounts) || accounts.some((a) => !a || typeof a.id !== 'string' || !['checking', 'savings', 'credit-card', 'cd', 'auto-loan', 'mortgage'].includes(a.type) || !Number.isFinite(Number(a.balance)) || Math.abs(Number(a.balance)) > 100000000)) {
          return sendJson(res, 400, { error: 'Each account needs an ID, valid account type, and a finite simulated balance.' });
        }
        const status = patch.status ?? target.status ?? 'active';
        if (!['active', 'suspended'].includes(status)) return sendJson(res, 400, { error: 'Status must be active or suspended.' });
        const updated = {
          ...target,
          ...patch,
          id: target.id,
          username,
          fullName: cleanText(patch.fullName ?? target.fullName, 80),
          email: cleanText(patch.email ?? target.email, 120),
          status,
          accounts: accounts.map((a) => ({ ...a, balance: round2(Number(a.balance)) })),
          passwordHash: target.passwordHash,
          updatedAt: new Date().toISOString(),
        };
        if (!updated.fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated.email)) return sendJson(res, 400, { error: 'Enter a name and valid email address.' });
        updateUser(updated);
        if (status === 'suspended') deleteSessionsForUser(target.id);
        recordAdminAudit('Updated simulator user record', { userId: target.id, username, fields: Object.keys(patch).slice(0, 40) });
        return sendJson(res, 200, { user: publicUser(updated) });
      }

      if (!action && method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm simulated user deletion.' });
        const deleted = deleteUserById(target.id);
        if (!deleted) return sendJson(res, 404, { error: 'Simulator user not found.' });
        recordAdminAudit('Deleted simulator user', { userId: target.id, username: target.username });
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/logout' && method === 'POST') {
      const token = bearerToken(req);
      if (token) revokeSession(token);
      recordAdminAudit('Admin sign-out');
      return sendJson(res, 200, { ok: true }, sessionCookieHeader(req, '', adminSession.role));
    }

    return sendJson(res, 404, { error: 'Admin endpoint not found.' });
  }

  /* ------------------------- Authenticated routes ------------------------- */
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not signed in' });

  if (pathname === '/api/auth/me' && method === 'GET') {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const body = await readBody(req);
    if (!verifyPassword(String(body.currentPassword || ''), user.passwordHash)) {
      return sendJson(res, 400, { error: 'Your current password is incorrect.' });
    }
    if (String(body.newPassword || '').length < 8) {
      return sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
    }
    updateUser({ ...user, passwordHash: hashPassword(String(body.newPassword)) });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/accounts' && method === 'POST') {
    const body = await readBody(req);
    const product = PRODUCTS.find((p) => p.id === body.product);
    if (!product) return sendJson(res, 400, { error: 'Invalid product' });
    const deposit = openingDeposit(body.openingDeposit, product.type === 'credit-card');
    if (deposit === null) {
      return sendJson(res, 400, { error: 'Opening deposit must be between $0 and $100,000' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    updated.accounts.push(buildAccount(product, deposit));
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/transfers' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid transfer amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const from = updated.accounts.find((a) => a.id === body.fromId);
    const to = updated.accounts.find((a) => a.id === body.toId);
    if (!from || !to || !DEPOSIT_TYPES.has(from.type) || !DEPOSIT_TYPES.has(to.type)) {
      return sendJson(res, 400, { error: 'Choose two eligible deposit accounts.' });
    }
    if (from.id === to.id) {
      return sendJson(res, 400, { error: 'Choose two different accounts.' });
    }
    if (amount > from.balance) {
      return sendJson(res, 400, { error: 'Insufficient funds in the "from" account.' });
    }
    from.balance = round2(from.balance - amount);
    to.balance = round2(to.balance + amount);
    const suffix = body.memo ? ` — ${body.memo}` : '';
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Transfer to ${to.name}${suffix}`,
      amount: -amount,
      category: 'Transfer',
      status: 'posted',
    });
    to.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Transfer from ${from.name}${suffix}`,
      amount,
      category: 'Transfer',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/payees' && method === 'POST') {
    const body = await readBody(req);
    const payeeName = cleanText(body.name, 80);
    const accountNumber = cleanText(body.accountNumber, 34).replace(/\s/g, '');
    if (!payeeName || accountNumber.length < 4) {
      return sendJson(res, 400, { error: 'Payee name and a valid account number are required.' });
    }
    const categories = new Set(['Utilities', 'Credit card', 'Rent', 'Insurance', 'Other']);
    const updated = JSON.parse(JSON.stringify(user));
    updated.payees.push({
      id: uid(),
      name: payeeName,
      accountNumber: `•••• ${accountNumber.slice(-4)}`,
      category: categories.has(body.category) ? body.category : 'Other',
    });
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/billpay' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid payment amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const payee = updated.payees.find((p) => p.id === body.payeeId);
    const from = updated.accounts.find((a) => a.id === body.fromId);
    if (!payee || !from || !DEPOSIT_TYPES.has(from.type)) {
      return sendJson(res, 400, { error: 'Payee or eligible funding account not found.' });
    }
    if (amount > from.balance) {
      return sendJson(res, 400, { error: 'Insufficient funds in the selected account.' });
    }
    from.balance = round2(from.balance - amount);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Payment to ${payee.name}`,
      amount: -amount,
      category: 'Bill pay',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/zelle' && method === 'POST') {
    const body = await readBody(req);
    if (!body.to || !String(body.to).trim()) {
      return sendJson(res, 400, { error: 'Enter a recipient.' });
    }
    if (Number(body.amount) > 2500) {
      return sendJson(res, 400, { error: 'Zelle® payments in this Chase experience are limited to $2,500 per payment.' });
    }
    const amount = money(body.amount, 2500);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid Zelle® amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const from = updated.accounts.find((a) => a.type === 'checking');
    if (!from) {
      return sendJson(res, 400, { error: 'You need a checking account to send money with Zelle®.' });
    }
    if (amount > from.balance) {
      return sendJson(res, 400, { error: 'Insufficient funds in your checking account.' });
    }
    from.balance = round2(from.balance - amount);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Zelle payment to ${String(body.to).trim()}${body.memo ? ` — ${body.memo}` : ''}`,
      amount: -amount,
      category: 'Zelle',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/cards/pay' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid payment amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const card = updated.accounts.find((a) => a.id === body.cardId && a.type === 'credit-card');
    const from = updated.accounts.find((a) => a.id === body.fromId);
    if (!card || !from || !DEPOSIT_TYPES.has(from.type)) {
      return sendJson(res, 400, { error: 'Card or eligible funding account not found.' });
    }
    if (amount > card.balance) {
      return sendJson(res, 400, {
        error: `Amount exceeds your current balance of $${card.balance.toFixed(2)}.`,
      });
    }
    if (amount > from.balance) {
      return sendJson(res, 400, { error: 'Insufficient funds in the selected account.' });
    }
    from.balance = round2(from.balance - amount);
    card.balance = round2(card.balance - amount);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Payment to ${card.name}`,
      amount: -amount,
      category: 'Credit card payment',
      status: 'posted',
    });
    card.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: 'Payment received — thank you',
      amount: -amount,
      category: 'Payment',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/auto/apply' && method === 'POST') {
    const body = await readBody(req);
    const price = Number(body.price);
    const down = Number(body.downPayment);
    const term = Number(body.term);
    const allowedTerms = new Set([36, 48, 60, 72]);
    if (
      !Number.isFinite(price) || price < 1000 || price > 250000 ||
      !Number.isFinite(down) || down < 0 || down >= price ||
      !allowedTerms.has(term)
    ) {
      return sendJson(res, 400, { error: 'Enter a valid vehicle price, down payment, and loan term.' });
    }
    const loan = price - down;
    const APR = 6.9;
    const r = APR / 100 / 12;
    const monthly = (loan * r) / (1 - Math.pow(1 + r, -term));
    const updated = JSON.parse(JSON.stringify(user));
    updated.accounts.push({
      id: uid(),
      type: 'auto-loan',
      name: 'Chase Auto Loan',
      mask: mask4(),
      balance: loan,
      apr: APR,
      monthlyPayment: round2(monthly),
      transactions: [
        {
          id: uid(),
          date: new Date().toISOString(),
          description: 'Vehicle purchase financed',
          amount: loan,
          category: 'Loan',
          status: 'posted',
        },
      ],
      createdAt: new Date().toISOString(),
    });
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/deposit' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount, 25000);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a check amount between $0.01 and $25,000.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const acct = updated.accounts.find((a) => a.id === body.accountId && (a.type === 'checking' || a.type === 'savings'));
    if (!acct) return sendJson(res, 400, { error: 'Select a checking or savings account.' });
    acct.balance = round2(acct.balance + amount);
    acct.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `QuickDeposit℠ Check #${String(body.checkNumber || '1042').trim()}`,
      amount: round2(amount),
      category: 'Deposit',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/wires' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    const wireType = body.wireType === 'international' ? 'international' : 'domestic';
    const fee = wireType === 'international' ? 40 : 25;
    const recipient = cleanText(body.recipient, 80);
    const routingNumber = cleanText(body.routingNumber, 34).replace(/\s/g, '');
    if (!recipient || routingNumber.length < 8) {
      return sendJson(res, 400, { error: 'Recipient name and a valid routing/SWIFT number are required.' });
    }
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid wire amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const from = updated.accounts.find((a) => a.id === body.fromId && (a.type === 'checking' || a.type === 'savings'));
    if (!from) return sendJson(res, 400, { error: 'Source account not found.' });
    if (amount + fee > from.balance) {
      return sendJson(res, 400, { error: `Insufficient funds (includes $${fee} wire fee).` });
    }
    from.balance = round2(from.balance - amount - fee);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Outgoing ${wireType === 'international' ? 'Intl' : 'Domestic'} Wire to ${recipient}`,
      amount: -round2(amount),
      category: 'Wire',
      status: 'posted',
    });
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: 'Wire transfer fee',
      amount: -fee,
      category: 'Fee',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/cards/controls' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const acct = updated.accounts.find((a) => a.id === body.accountId);
    if (!acct || !['checking', 'credit-card'].includes(acct.type)) {
      return sendJson(res, 400, { error: 'Card controls are available for debit and credit cards.' });
    }
    if (typeof body.locked === 'boolean') acct.locked = body.locked;
    if (typeof body.autopay === 'boolean') acct.autopay = body.autopay;
    if (typeof body.autopayFromId === 'string') {
      const from = updated.accounts.find((a) => a.id === body.autopayFromId && DEPOSIT_TYPES.has(a.type));
      if (!from) return sendJson(res, 400, { error: 'Choose an eligible autopay account.' });
      acct.autopayFromId = from.id;
    }
    if (['minimum', 'statement', 'current'].includes(body.autopayAmount)) {
      acct.autopayAmount = body.autopayAmount;
    }
    if (body.autopay === true && typeof body.autopayDay === 'number') {
      acct.autopayDay = Math.min(28, Math.max(1, Math.round(body.autopayDay)));
    }
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/cards/reveal' && method === 'POST') {
    const body = await readBody(req);
    const card = user.accounts.find((a) => a.id === body.cardId && a.type === 'credit-card');
    if (!card) return sendJson(res, 404, { error: 'Card not found.' });
    if (!verifyPassword(String(body.password || ''), user.passwordHash)) {
      recordFailure(req, `reveal:${user.id}`, 15 * 60 * 1000);
      sendJson(res, 400, { error: 'That password is incorrect.' });
      return;
    }
    // Sample PAN only. Real card numbers are never stored by this Chase experience.
    const pan = `4117 8234 5690 ${card.mask}`;
    return sendJson(res, 200, { cardNumber: pan, expiry: '08/29', cvv: '482' });
  }

  if (pathname === '/api/cards/replace' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const card = updated.accounts.find((a) => a.id === body.cardId && a.type === 'credit-card');
    if (!card) return sendJson(res, 404, { error: 'Card not found.' });
    const reasons = new Set(['lost', 'stolen', 'damaged', 'not-received']);
    if (!reasons.has(body.reason)) return sendJson(res, 400, { error: 'Choose a replacement reason.' });
    card.mask = mask4();
    card.locked = true;
    card.replacedAt = new Date().toISOString();
    card.replacementReason = body.reason;
    if (!Array.isArray(updated.disputes)) updated.disputes = [];
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/cards/dispute' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const account = updated.accounts.find((a) => a.id === body.accountId && a.type === 'credit-card');
    if (!account) return sendJson(res, 404, { error: 'Card account not found.' });
    const transaction = account.transactions.find((t) => t.id === body.transactionId);
    if (!transaction) return sendJson(res, 404, { error: 'Transaction not found.' });
    if (transaction.amount <= 0) {
      return sendJson(res, 400, { error: 'Only purchases can be disputed.' });
    }
    if (!Array.isArray(updated.disputes)) updated.disputes = [];
    if (updated.disputes.some((d) => d.transactionId === transaction.id && d.status === 'open')) {
      return sendJson(res, 400, { error: 'This transaction already has an open dispute.' });
    }
    const reasons = new Set([
      'I did not make this purchase',
      'I was charged the wrong amount',
      'The merchant did not deliver the item or service',
      'I cancelled and was still charged',
      'Duplicate charge',
    ]);
    if (!reasons.has(body.reason)) return sendJson(res, 400, { error: 'Choose a dispute reason.' });
    updated.disputes.unshift({
      id: uid(),
      transactionId: transaction.id,
      accountId: account.id,
      description: transaction.description,
      amount: transaction.amount,
      reason: body.reason,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    transaction.disputedAt = new Date().toISOString();
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/investments/trade' && method === 'POST') {
    const body = await readBody(req);
    const shares = Number(body.shares);
    const side = body.side === 'sell' ? 'sell' : 'buy';
    const quote = MARKET_QUOTES.find((q) => q.symbol === body.symbol);
    if (!quote) return sendJson(res, 400, { error: 'Invalid ticker symbol.' });
    if (!shares || shares <= 0 || shares > 100000 || !Number.isFinite(shares)) {
      return sendJson(res, 400, { error: 'Enter a valid number of shares.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    if (!updated.investments) updated.investments = defaultInvestments();
    const total = round2(shares * quote.price);
    const existing = updated.investments.holdings.find((h) => h.symbol === quote.symbol);

    if (side === 'buy') {
      if (total > updated.investments.cash) {
        return sendJson(res, 400, { error: `Insufficient buying power ($${updated.investments.cash.toFixed(2)} available).` });
      }
      updated.investments.cash = round2(updated.investments.cash - total);
      if (existing) {
        const newShares = round2(existing.shares + shares);
        existing.avgCost = round2((existing.shares * existing.avgCost + total) / newShares);
        existing.shares = newShares;
        existing.price = quote.price;
      } else {
        updated.investments.holdings.push({
          symbol: quote.symbol,
          name: quote.name,
          shares: round2(shares),
          avgCost: quote.price,
          price: quote.price,
        });
      }
    } else {
      if (!existing || shares > existing.shares) {
        return sendJson(res, 400, { error: `You don't hold ${shares} shares of ${quote.symbol}.` });
      }
      updated.investments.cash = round2(updated.investments.cash + total);
      existing.shares = round2(existing.shares - shares);
      if (existing.shares <= 0) {
        updated.investments.holdings = updated.investments.holdings.filter((h) => h.symbol !== quote.symbol);
      }
    }
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/travel/redeem' && method === 'POST') {
    const body = await readBody(req);
    const points = Math.floor(Number(body.points));
    const kinds = new Set(['travel', 'transfer', 'cashback']);
    const brands = new Set(['united', 'southwest', 'airbnb']);
    if (!points || points < 1000 || points > 1000000 || !kinds.has(body.kind)) {
      return sendJson(res, 400, { error: 'Enter a valid redemption of at least 1,000 Ultimate Rewards® points.' });
    }
    if (body.brand && !brands.has(body.brand)) {
      return sendJson(res, 400, { error: 'Choose a supported travel partner.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const card = updated.accounts.find((a) => a.id === body.cardId && a.type === 'credit-card') ||
      updated.accounts.find((a) => a.type === 'credit-card' && (a.rewardsPoints || 0) >= points);
    if (!card || (card.rewardsPoints || 0) < points) {
      return sendJson(res, 400, { error: 'Not enough Ultimate Rewards® points on selected card.' });
    }
    card.rewardsPoints = (card.rewardsPoints || 0) - points;
    if (!Array.isArray(updated.travelBookings)) updated.travelBookings = [];

    if (body.kind === 'cashback') {
      const credit = round2(points / 100);
      card.balance = round2(card.balance - credit);
      card.transactions.unshift({
        id: uid(),
        date: new Date().toISOString(),
        description: `Ultimate Rewards® Cash Back (${points.toLocaleString()} pts)`,
        amount: -credit,
        category: 'Rewards',
        status: 'posted',
      });
    } else {
      updated.travelBookings.unshift({
        id: uid(),
        title: String(body.title || 'Chase Travel℠ Redemption'),
        provider: String(body.provider || 'Chase Travel℠'),
        brand: body.brand || 'united',
        dates: String(body.dates || 'Flexible dates · 2026'),
        pointsUsed: points,
        status: body.kind === 'transfer' ? 'Transferred 1:1' : 'Confirmed',
      });
    }
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/auth/sign-out-all' && method === 'POST') {
    deleteSessionsForUser(user.id);
    return sendJson(res, 200, { ok: true }, sessionCookieHeader(req));
  }

  if (pathname === '/api/profile' && method === 'POST') {
    const body = await readBody(req);
    const fullName = cleanText(body.fullName, 80);
    const email = cleanText(body.email, 120);
    const phone = cleanText(body.phone, 30);
    const address = cleanText(body.address, 160);
    if (fullName.length < 2) return sendJson(res, 400, { error: 'Enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Enter a valid email address.' });
    }
    if (phone.replace(/\D/g, '').length < 10) {
      return sendJson(res, 400, { error: 'Enter a valid phone number.' });
    }
    if (address.length < 5) return sendJson(res, 400, { error: 'Enter your mailing address.' });
    const updated = { ...user, fullName, email, phone, address };
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/settings/preferences' && method === 'POST') {
    const body = await readBody(req);
    const allowed = [
      'balanceAlerts', 'paymentReminders', 'transactionAlerts', 'travelAlerts',
      'offerEmails', 'textAlerts', 'affiliateSharing', 'thirdPartyMarketing',
    ];
    const patch = {};
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') patch[key] = body[key];
    }
    const updated = JSON.parse(JSON.stringify(user));
    updated.preferences = { ...(updated.preferences || defaultPreferences()), ...patch };
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/accounts/settings' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const acct = updated.accounts.find((a) => a.id === body.accountId);
    if (!acct) return sendJson(res, 404, { error: 'Account not found.' });
    if (typeof body.nickname === 'string') acct.nickname = cleanText(body.nickname, 30);
    if (typeof body.hidden === 'boolean') acct.hidden = body.hidden;
    if (typeof body.favorite === 'boolean') acct.favorite = body.favorite;
    if (body.isPrimary === true) {
      for (const a of updated.accounts) a.isPrimary = a.id === acct.id;
    } else if (body.isPrimary === false) {
      acct.isPrimary = false;
    }
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/travel/notices' && method === 'POST') {
    const body = await readBody(req);
    const destination = cleanText(body.destination, 60);
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (destination.length < 2) return sendJson(res, 400, { error: 'Enter a destination.' });
    if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) {
      return sendJson(res, 400, { error: 'Choose valid travel dates.' });
    }
    if (body.accountId && !user.accounts.some((a) => a.id === body.accountId)) {
      return sendJson(res, 400, { error: 'Choose one of your cards or accounts.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    if (!Array.isArray(updated.travelNotices)) updated.travelNotices = [];
    updated.travelNotices.unshift({
      id: uid(),
      destination,
      startDate: String(body.startDate),
      endDate: String(body.endDate),
      accountId: body.accountId || undefined,
    });
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/travel/notices/delete' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    updated.travelNotices = (updated.travelNotices || []).filter((n) => n.id !== body.id);
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/loans/pay' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    if (amount === null) {
      return sendJson(res, 400, { error: 'Enter a valid payment amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const loan = updated.accounts.find((a) => a.id === body.loanId);
    const from = updated.accounts.find((a) => a.id === body.fromId);
    if (!loan || !['auto-loan', 'mortgage'].includes(loan.type)) {
      return sendJson(res, 400, { error: 'Loan not found.' });
    }
    if (!from || !DEPOSIT_TYPES.has(from.type)) {
      return sendJson(res, 400, { error: 'Choose an eligible funding account.' });
    }
    if (amount > loan.balance) {
      return sendJson(res, 400, { error: `Amount exceeds the remaining balance of $${loan.balance.toFixed(2)}.` });
    }
    if (amount > from.balance) {
      return sendJson(res, 400, { error: 'Insufficient funds in the selected account.' });
    }
    from.balance = round2(from.balance - amount);
    loan.balance = round2(loan.balance - amount);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Payment to ${loan.name}`,
      amount: -amount,
      category: 'Loan payment',
      status: 'posted',
    });
    loan.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: 'Loan payment received',
      amount: -amount,
      category: 'Loan payment',
      status: 'posted',
    });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/scheduled' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    const kinds = new Set(['transfer', 'bill', 'card', 'loan']);
    const frequencies = new Set(['once', 'monthly']);
    if (!kinds.has(body.kind) || !frequencies.has(body.frequency)) {
      return sendJson(res, 400, { error: 'Choose a valid payment type and frequency.' });
    }
    if (amount === null) return sendJson(res, 400, { error: 'Enter a valid amount.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) {
      return sendJson(res, 400, { error: 'Choose a valid delivery date.' });
    }
    const scheduled = new Date(`${body.date}T23:59:59`);
    if (Number.isNaN(+scheduled) || scheduled < new Date()) {
      return sendJson(res, 400, { error: 'Choose a future delivery date.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const from = updated.accounts.find((a) => a.id === body.fromAccountId);
    if (!from || !DEPOSIT_TYPES.has(from.type)) {
      return sendJson(res, 400, { error: 'Choose an eligible funding account.' });
    }
    const to = body.toAccountId ? updated.accounts.find((a) => a.id === body.toAccountId) : null;
    if (body.kind === 'transfer' && (!to || to.id === from.id)) {
      return sendJson(res, 400, { error: 'Choose two different accounts.' });
    }
    if (body.kind === 'bill') {
      const payee = updated.payees.find((p) => p.id === body.payeeId);
      if (!payee) return sendJson(res, 400, { error: 'Choose a payee.' });
    }
    if (!Array.isArray(updated.scheduledPayments)) updated.scheduledPayments = [];
    updated.scheduledPayments.unshift({
      id: uid(),
      kind: body.kind,
      label: cleanText(body.label, 60),
      fromAccountId: from.id,
      toAccountId: to ? to.id : undefined,
      payeeId: body.payeeId || undefined,
      amount,
      date: String(body.date),
      frequency: body.frequency,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    });
    updateUser(updated);
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/scheduled/cancel' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const before = (updated.scheduledPayments || []).length;
    updated.scheduledPayments = (updated.scheduledPayments || []).filter((s) => s.id !== body.id);
    if (updated.scheduledPayments.length === before) {
      return sendJson(res, 404, { error: 'Scheduled payment not found.' });
    }
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/scheduled/manage' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const item = (updated.scheduledPayments || []).find((s) => s.id === body.id);
    if (!item) return sendJson(res, 404, { error: 'Scheduled payment not found.' });
    if (body.action === 'pause') item.status = 'paused';
    else if (body.action === 'resume') item.status = 'scheduled';
    else if (body.action === 'edit') {
      const amount = money(body.amount);
      if (amount === null) return sendJson(res, 400, { error: 'Enter a valid amount.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) return sendJson(res, 400, { error: 'Choose a valid delivery date.' });
      const date = new Date(`${body.date}T23:59:59`);
      if (Number.isNaN(+date) || date < new Date()) return sendJson(res, 400, { error: 'Choose a future delivery date.' });
      item.amount = amount;
      item.date = String(body.date);
    } else return sendJson(res, 400, { error: 'Choose a valid scheduled payment action.' });
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/budgets' && method === 'POST') {
    const body = await readBody(req);
    if (!body.budgets || typeof body.budgets !== 'object' || Array.isArray(body.budgets)) {
      return sendJson(res, 400, { error: 'Enter valid monthly budgets.' });
    }
    const entries = Object.entries(body.budgets);
    if (entries.length > 30 || entries.some(([key, value]) => !cleanText(key, 40) || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000)) {
      return sendJson(res, 400, { error: 'Enter valid monthly budget amounts.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    updated.budgets = Object.fromEntries(entries.map(([key, value]) => [cleanText(key, 40), round2(Number(value))]));
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/credit/simulate' && method === 'POST') {
    const body = await readBody(req);
    const allowed = ['pay-down', 'new-card', 'missed-payment', 'higher-limit', 'close-oldest', 'inquiry'];
    if (!allowed.includes(body.scenario)) {
      return sendJson(res, 400, { error: 'Choose a valid credit scenario.' });
    }
    const credit = user.credit || defaultCredit();
    const base = credit.score;
    const deltas = {
      'pay-down': { low: 8, high: 20, note: 'Paying revolving balances down can help your utilization.' },
      'new-card': { low: -12, high: -5, note: 'A new card adds a hard inquiry and lowers your average account age.' },
      'missed-payment': { low: -95, high: -60, note: 'A 30-day late payment is a serious negative mark.' },
      'higher-limit': { low: 3, high: 11, note: 'A higher limit can lower utilization if balances stay the same.' },
      'close-oldest': { low: -20, high: -6, note: 'Closing your oldest account shortens your credit history.' },
      inquiry: { low: -7, high: -2, note: 'A single hard inquiry has a small, temporary effect.' },
    };
    const delta = deltas[body.scenario];
    if (body.simulate === true) {
      const updated = JSON.parse(JSON.stringify(user));
      const preview = {
        id: uid(),
        scenario: String(body.scenario),
        estimatedScore: Math.min(850, Math.max(300, base + delta.high)),
        low: Math.min(850, Math.max(300, base + delta.low)),
        high: Math.min(850, Math.max(300, base + delta.high)),
        note: `${delta.note} Estimate only — results are directional, not a forecast.`,
        createdAt: new Date().toISOString(),
      };
      updated.credit = updated.credit || defaultCredit();
      updated.credit.simulations = [preview, ...(updated.credit.simulations || [])].slice(0, 12);
      updateUser(updated);
      return sendJson(res, 200, {
        estimatedScore: preview.estimatedScore,
        low: preview.low,
        high: preview.high,
        note: preview.note,
        user: publicUser(updated),
      });
    }
    const scenarioNote = `${delta.note} Estimate only — results are directional, not a forecast.`;
    const updated = JSON.parse(JSON.stringify(user));
    const updatedCredit = updated.credit || defaultCredit();
    updatedCredit.simulations = [
      {
        id: uid(),
        scenario: String(body.scenario),
        estimatedScore: Math.min(850, Math.max(300, base + delta.high)),
        low: Math.min(850, Math.max(300, base + delta.low)),
        high: Math.min(850, Math.max(300, base + delta.high)),
        note: scenarioNote,
        createdAt: new Date().toISOString(),
      },
      ...(updatedCredit.simulations || []),
    ].slice(0, 12);
    updated.credit = updatedCredit;
    updateUser(updated);
    return sendJson(res, 200, {
      estimatedScore: Math.min(850, Math.max(300, base + delta.high)),
      low: Math.min(850, Math.max(300, base + delta.low)),
      high: Math.min(850, Math.max(300, base + delta.high)),
      note: scenarioNote,
      user: publicUser(updated),
    });
  }

  if (pathname === '/api/credit/goal' && method === 'POST') {
    const body = await readBody(req);
    const goal = Math.round(Number(body.goal));
    if (!Number.isFinite(goal) || goal < 300 || goal > 850) {
      return sendJson(res, 400, { error: 'Please choose a score between 300 and 850.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const credit = updated.credit || defaultCredit();
    if (goal <= credit.score) {
      return sendJson(res, 400, { error: 'Choose a goal above your current score.' });
    }
    credit.goal = goal;
    updated.credit = credit;
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/credit/alerts/read' && method === 'POST') {
    const updated = JSON.parse(JSON.stringify(user));
    if (!updated.credit) updated.credit = defaultCredit();
    updated.credit.alerts = (updated.credit.alerts || []).map((a) => ({ ...a, read: true }));
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/credit/enroll' && method === 'POST') {
    const updated = JSON.parse(JSON.stringify(user));
    updated.credit = updated.credit || defaultCredit();
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/security/settings' && method === 'POST') {
    const body = await readBody(req);
    const updated = JSON.parse(JSON.stringify(user));
    const allowed = ['twoFactor', 'loginAlerts', 'fraudAlerts', 'paperless'];
    const patch = {};
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') patch[key] = body[key];
    }
    updated.security = { ...(updated.security || defaultSecurity()), ...patch };
    updateUser(updated);
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let filePath = path.join(DIST, url.pathname);
  if (url.pathname === '/') filePath = path.join(DIST, 'index.html');
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        ...SECURITY_HEADERS,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    /* SPA fallback */
    const indexPath = path.join(DIST, 'index.html');
    fs.stat(indexPath, (err2) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found — run `npm run build` first, then start the server.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', ...SECURITY_HEADERS });
      fs.createReadStream(indexPath).pipe(res);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Chase clone fullstack server running at http://localhost:${PORT}`);
  console.log(`API health: http://localhost:${PORT}/api/health`);
});
