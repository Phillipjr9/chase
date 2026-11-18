/* -------------------------------------------------------------------------- */
/* Chase banking app server                                                   */
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
import os from 'node:os';
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
  revokeAllSessionsForUserAndLinkedAdmin,
  findAllUsers,
  deleteUserById,
  resetUsers,
  restoreBackupAtomic,
  appendAudit,
  getAuditLog,
  verifyAuditIntegrity,
  getSimulatorSettings,
  updateSimulatorSettings,
  bumpSuperAdminSessionVersion,
  findAdminByUsername,
  findAdminById,
  findAdminByLinkedUserId,
  listAdminAccounts,
  listAdminAccountsRaw,
  insertAdminAccount,
  createAdminWithCustomer,
  linkAdminToCustomer,
  reassignAdminCustomers,
  reassignAndRemoveAdmin,
  promoteCustomerToAdmin,
  updateAdminAccount,
  deleteAdminAccount,
  countUsers,
  getDbStats,
  ensureDbReady,
  flushRemoteSave,
  isSupabaseEnabled,
} from './db.js';
import {
  describeUserAgent,
  inferCategory,
  inferOutcome,
  inferSeverity,
  buildAuditContext,
  enrichAuditEntry,
  computeAuditStats,
} from './audit.js';

const __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : '/tmp';
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 3000;
let CHASE_ADMIN_USERNAME = process.env.CHASE_ADMIN_USERNAME || 'dianasmith6525@gmail.com';
let CHASE_ADMIN_PASSWORD = process.env.CHASE_ADMIN_PASSWORD || '';
let CHASE_ADMIN_PASSWORD_HASH = null;
let CHASE_ADMIN_PASSWORD_HASH_SOURCE = '';
const IS_CLOUDFLARE_WORKERS = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function getRootAdminPasswordHash() {
  if (!CHASE_ADMIN_PASSWORD) return null;
  if (!CHASE_ADMIN_PASSWORD_HASH || CHASE_ADMIN_PASSWORD_HASH_SOURCE !== CHASE_ADMIN_PASSWORD) {
    CHASE_ADMIN_PASSWORD_HASH = hashPassword(CHASE_ADMIN_PASSWORD);
    CHASE_ADMIN_PASSWORD_HASH_SOURCE = CHASE_ADMIN_PASSWORD;
  }
  return CHASE_ADMIN_PASSWORD_HASH;
}

function syncRuntimeEnv(env) {
  if (!env || typeof env !== 'object') return;
  for (const key of [
    'CHASE_ADMIN_USERNAME',
    'CHASE_ADMIN_PASSWORD',
    'ADMIN_SESSION_SECRET',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'CHASE_SUPABASE_ROW_ID',
  ]) {
    if (typeof env[key] === 'string' && env[key].length > 0) {
      process.env[key] = env[key];
    }
  }
  const nextUser = process.env.CHASE_ADMIN_USERNAME || 'dianasmith6525@gmail.com';
  const nextPass = process.env.CHASE_ADMIN_PASSWORD || '';
  CHASE_ADMIN_USERNAME = nextUser;
  if (nextPass !== CHASE_ADMIN_PASSWORD) {
    CHASE_ADMIN_PASSWORD = nextPass;
    CHASE_ADMIN_PASSWORD_HASH = null;
    CHASE_ADMIN_PASSWORD_HASH_SOURCE = '';
  }
}

if (!IS_CLOUDFLARE_WORKERS) {
  if (!CHASE_ADMIN_PASSWORD && !process.env.ADMIN_SESSION_SECRET) {
    console.warn('[chase-admin] Neither CHASE_ADMIN_PASSWORD nor ADMIN_SESSION_SECRET is set; administrator authentication and token verification are disabled until configured.');
  } else if (!CHASE_ADMIN_PASSWORD) {
    console.warn('[chase-admin] CHASE_ADMIN_PASSWORD is not set; super administrator sign-in is disabled.');
  }
}

const DEFAULT_PERMISSIONS = { createUsers: true, generateActivity: true, sendMessages: true };
const DEFAULT_CAPABILITIES = {
  manageAccounts: true,
  editLedger: true,
  impersonateUsers: true,
  manageCustomerAccess: true,
  manageDisputes: true,
  publishNotices: true,
};
const CAPABILITY_KEYS = Object.keys(DEFAULT_CAPABILITIES);

function normalizePermissions(p) {
  return { ...DEFAULT_PERMISSIONS, ...(p || {}) };
}

function normalizeCapabilities(c) {
  return { ...DEFAULT_CAPABILITIES, ...(c || {}) };
}

function validateSupportContact(contact) {
  if (!contact || typeof contact !== 'object' || typeof contact.email !== 'string' || typeof contact.phone !== 'string') return null;
  const email = contact.email.trim();
  const phone = contact.phone.trim();
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phone.length > 40 || (phone && !/^[+0-9(). -]{3,40}$/.test(phone))) return null;
  return { email, phone };
}

function formatSupportContactOrNull(contact) {
  if (!contact || (!contact.email && !contact.phone)) return null;
  return { email: contact.email || '', phone: contact.phone || '' };
}

function buildLinkedAdminSummary(userId) {
  const linked = findAdminByLinkedUserId(userId);
  if (!linked || linked.status !== 'active') return null;
  return {
    id: linked.id,
    username: linked.username,
    fullName: linked.fullName,
    role: linked.role,
    status: linked.status,
    permissions: normalizePermissions(linked.permissions),
    capabilities: normalizeCapabilities(linked.capabilities),
  };
}

function getLinkedCheckingAccounts(linkedUserId) {
  if (!linkedUserId) return [];
  const linked = findUserById(linkedUserId);
  if (!linked || linked.status !== 'active') return [];
  return (linked.accounts || [])
    .filter((a) => a.type === 'checking')
    .map((a) => ({
      id: a.id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      balance: round2(Number(a.balance || 0)),
      locked: Boolean(a.locked),
    }));
}

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
  const sameSite = secure ? 'None; Secure' : 'Lax';
  const cookieName = ['admin', 'auditor'].includes(role) ? 'chase_sim_admin_session' : 'chase_sim_user_session';
  const cookie = token
    ? `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=86400; SameSite=${sameSite}`
    : `${cookieName}=; Path=/; HttpOnly; Max-Age=0; SameSite=${sameSite}`;
  return { 'Set-Cookie': cookie };
}

function normalizeOpenedDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T12:00:00.000Z`);
    return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(+parsed) ? null : parsed.toISOString().slice(0, 10);
}

function effectiveAccountOpenIso(account) {
  if (account?.openedDate) {
    const normalized = normalizeOpenedDate(account.openedDate);
    if (normalized) return `${normalized}T00:00:00.000Z`;
  }
  return account?.createdAt || null;
}

function sortTransactionsDesc(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const ta = new Date(a?.date || 0).getTime();
    const tb = new Date(b?.date || 0).getTime();
    if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
    return String(b?.date || '').localeCompare(String(a?.date || ''));
  });
}

function sanitizeCustomerDescription(text, fallback) {
  const cleaned = cleanText(String(text || '').replace(/\badmin\b/gi, 'Operations').replace(/\s+/g, ' '), 120);
  return cleaned || fallback;
}

const TRANSFER_TYPE_CONFIG = {
  internal: { label: 'Internal Transfer', fromCategory: 'Transfer', toCategory: 'Transfer' },
  wire: { label: 'Wire Transfer', fromCategory: 'Wire Transfer', toCategory: 'Wire Transfer' },
  ach: { label: 'ACH Transfer', fromCategory: 'ACH Transfer', toCategory: 'ACH Transfer' },
  zelle: { label: 'Zelle®', fromCategory: 'Zelle', toCategory: 'Zelle' },
  'direct-deposit': { label: 'Direct Deposit', fromCategory: 'Transfer', toCategory: 'Income' },
  payroll: { label: 'Payroll Deposit', fromCategory: 'Transfer', toCategory: 'Income' },
  'bill-pay': { label: 'Bill Pay', fromCategory: 'Bills', toCategory: 'Bills' },
  'vendor-payment': { label: 'Vendor Payment', fromCategory: 'Business', toCategory: 'Business' },
  'customer-refund': { label: 'Customer Refund', fromCategory: 'Refund', toCategory: 'Refund' },
  check: { label: 'Check Deposit', fromCategory: 'Check', toCategory: 'Check Deposit' },
  'card-payment': { label: 'Card Payment', fromCategory: 'Credit card payment', toCategory: 'Card payment' },
  'loan-payment': { label: 'Loan Payment', fromCategory: 'Loan payment', toCategory: 'Loan payment' },
  adjustment: { label: 'Balance Adjustment', fromCategory: 'Adjustment', toCategory: 'Adjustment' },
};

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, staffNotes, supportStatus, ...rest } = user;
  if (Array.isArray(rest.accounts)) {
    rest.accounts = rest.accounts.map((account) => ({
      ...account,
      transactions: sortTransactionsDesc(account.transactions),
    }));
  }
  return rest;
}

function readBody(req, maxBytes = 1_000_000) {
  // Vercel or Cloudflare Workers may provide the buffered request body directly.
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > maxBytes) return Promise.reject(new Error('Request body too large'));
    if (typeof req.body === 'string' && !req.body.trim()) return Promise.resolve({});
    try { return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}); }
    catch { return Promise.reject(new Error('Invalid JSON body')); }
  }
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

function requestSessionTokens(req, url, kind = 'user') {
  const isAdmin = kind === 'admin';
  const cookieName = isAdmin ? 'chase_sim_admin_session' : 'chase_sim_user_session';
  const headerName = isAdmin ? 'x-chase-admin-token' : 'x-chase-token';
  const customHeader = String(req.headers[headerName] || '').trim() || null;
  const queryToken = !isAdmin && url ? (String(url.searchParams.get('_st') || '').trim() || null) : null;
  const cookieToken = cookieSessionToken(req, cookieName);
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  return [...new Set([customHeader, queryToken, cookieToken, bearer].filter(Boolean))];
}

function getAuthUserResolved(req, url) {
  for (const token of requestSessionTokens(req, url, 'user')) {
    const session = getSession(token);
    if (!session || ['admin', 'auditor'].includes(session.role)) continue;
    const user = findUserById(session.userId);
    if (!user) continue;
    if (user.status === 'suspended' && session.role !== 'impersonated') continue;
    return { user, token, sessionRole: session.role };
  }
  return { user: null, token: null, sessionRole: null };
}

function getAuthUser(req, url) {
  return getAuthUserResolved(req, url).user;
}

function getAdminSession(req, url) {
  for (const token of requestSessionTokens(req, url, 'admin')) {
    if (isSessionRevoked(token)) continue;
    const session = getSession(token);
    if (session && ['admin', 'auditor'].includes(session.role)) {
      if (session.userId === '__chase_admin__') {
        const verified = verifyAdminToken(token);
        if (verified?.userId === '__chase_admin__') return { ...verified, token };
        continue;
      }
      const username = String(session.userId || '').replace(/^admin:/, '');
      const account = findAdminByUsername(username);
      const verified = verifyAdminToken(token);
      if (account && verified && verified.userId === session.userId) return { ...verified, token };
      continue;
    }
    const stateless = verifyAdminToken(token);
    if (stateless) return { ...stateless, token };
  }
  return null;
}

let currentRequestMeta = null;

function formatUsdSimple(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function recordAuditEvent({
  actor = 'Chase administrator',
  actorType = null,
  action,
  summary = null,
  reason = null,
  category = null,
  outcome = null,
  severity = null,
  target = null,
  details = {},
} = {}) {
  const meta = currentRequestMeta || {};
  const resolvedCategory = category || inferCategory(action, details);
  const resolvedOutcome = outcome || inferOutcome(action, details);
  const resolvedSeverity = severity || inferSeverity(action, resolvedOutcome, resolvedCategory);
  return appendAudit({
    id: uid(),
    actor: actor || 'unknown',
    actorType,
    action,
    summary,
    reason,
    category: resolvedCategory,
    outcome: resolvedOutcome,
    severity: resolvedSeverity,
    target,
    ip: meta.ip || null,
    userAgent: meta.userAgent || null,
    path: meta.path || null,
    method: meta.method || null,
    details,
    createdAt: new Date().toISOString(),
  });
}

function auditAdmin(action, details = {}, actor = 'Chase administrator', extra = {}) {
  return recordAuditEvent({
    actor,
    action,
    details,
    ...extra,
  });
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
  const isRoot = String(username || '').toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase();
  const storedAdmin = isRoot ? null : findAdminByUsername(username);
  const payload = Buffer.from(JSON.stringify({
    username,
    role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    sessionVersion: isRoot
      ? (getSimulatorSettings().superAdminSessionVersion || 0)
      : (storedAdmin?.sessionVersion || 0),
    adminId: storedAdmin?.id || null,
    nonce: crypto.randomBytes(16).toString('hex'),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', adminTokenSecret()).update(payload).digest('base64url');
  return `adm1.${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!CHASE_ADMIN_PASSWORD && !process.env.ADMIN_SESSION_SECRET) return null;
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
    const isRoot = String(claims.username).toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase();
    if (isRoot) {
      if ((claims.sessionVersion || 0) !== (getSimulatorSettings().superAdminSessionVersion || 0)) return null;
    } else {
      const admin = findAdminByUsername(claims.username);
      if (!admin || admin.status !== 'active' || admin.role !== claims.role || (admin.sessionVersion || 0) !== (claims.sessionVersion || 0)) return null;
      if ((claims.adminId && claims.adminId !== admin.id) || (admin.linkedUserId && claims.adminId !== admin.id)) return null;
      if (admin.linkedUserId) {
        const linked = findUserById(admin.linkedUserId);
        if (!linked || linked.status !== 'active' || linked.username.toLowerCase() !== admin.username.toLowerCase() || linked.passwordHash !== admin.passwordHash) return null;
      }
    }
    return { userId: isRoot ? '__chase_admin__' : `admin:${claims.username}`, role: claims.role, expiresAt: claims.expiresAt };
  } catch {
    return null;
  }
}

const DEPOSIT_TYPES = new Set(['checking', 'savings', 'cd']);
const loginAttempts = new Map();

function clientKey(req) {
  const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cfIp) return cfIp;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
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
    return 1;
  }
  current.count += 1;
  return current.count;
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
  currentRequestMeta = {
    ip: clientKey(req),
    userAgent: describeUserAgent(req.headers['user-agent']),
    path: url.pathname,
    method: req.method,
  };
  await ensureDbReady();
  const method = req.method;
  const pathname = url.pathname;

  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      uptime: typeof process?.uptime === 'function' ? Math.round(process.uptime()) : 0,
      users: countUsers(),
      storage: isSupabaseEnabled() ? 'supabase-postgres' : 'local-json',
      version: '1.1.0',
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
    return sendJson(res, 410, { error: 'Sample account seeding has been disabled.' });
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const failBucket = `admin-login:${username.toLowerCase() || '*'}`;
    if (tooManyFailures(req, failBucket, 10)) {
      auditAdmin(
        'Blocked admin sign-in (rate limit)',
        { username: username || '(empty)', path: '/api/admin/login', lockoutMinutes: 15, maxAttempts: 10 },
        username || 'unknown',
        {
          actorType: 'anonymous',
          category: 'security',
          outcome: 'blocked',
          severity: 'high',
          reason: 'Too many failed sign-in attempts (10 or more within 15 minutes from this IP address). Temporarily locked for 15 minutes.',
          summary: `Blocked admin sign-in attempt for "${username || '(empty)'}" because the 15-minute failed attempt limit was reached.`,
        }
      );
      return sendJson(res, 429, { error: 'Too many unsuccessful admin sign-in attempts. Try again later.' });
    }
    const storedAdmin = findAdminByUsername(username);
    const rootNameMatch = username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase();
    const rootHash = getRootAdminPasswordHash();
    const isRootAdmin = !!rootHash && rootNameMatch && verifyPassword(password, rootHash);
    const validStoredPassword = storedAdmin && verifyPassword(password, storedAdmin.passwordHash);
    const linkedCustomer = storedAdmin?.linkedUserId ? findUserById(storedAdmin.linkedUserId) : null;
    if (validStoredPassword && storedAdmin.status === 'disabled') {
      auditAdmin(
        'Blocked admin sign-in (disabled)',
        { username: storedAdmin.username, adminId: storedAdmin.id, role: storedAdmin.role },
        storedAdmin.username,
        {
          actorType: storedAdmin.role === 'auditor' ? 'auditor' : 'admin',
          category: 'security',
          outcome: 'blocked',
          severity: 'high',
          reason: storedAdmin.lockMessage || 'This administrator account is currently disabled by the Super Administrator.',
          summary: `Blocked sign-in for @${storedAdmin.username} because this administrator account is disabled.`,
          target: { type: 'admin', id: storedAdmin.id, label: `${storedAdmin.fullName} (@${storedAdmin.username})` },
        }
      );
      return sendJson(res, 403, { error: storedAdmin.lockMessage || 'This administrator account is disabled. Contact the super administrator.' });
    }
    if (validStoredPassword && storedAdmin.linkedUserId && (!linkedCustomer || linkedCustomer.status !== 'active')) {
      auditAdmin(
        'Blocked admin sign-in (linked customer suspended)',
        { username: storedAdmin.username, adminId: storedAdmin.id, userId: storedAdmin.linkedUserId },
        storedAdmin.username,
        {
          actorType: storedAdmin.role === 'auditor' ? 'auditor' : 'admin',
          category: 'security',
          outcome: 'blocked',
          severity: 'high',
          reason: 'The linked customer banking account is suspended, so linked administrator sign-in is blocked.',
          summary: `Blocked admin sign-in for @${storedAdmin.username} because their linked customer account is suspended.`,
          target: { type: 'admin', id: storedAdmin.id, label: `${storedAdmin.fullName} (@${storedAdmin.username})` },
        }
      );
      return sendJson(res, 403, { error: 'The linked customer account is suspended. Contact the super administrator.' });
    }
    const isStoredAdmin = validStoredPassword && storedAdmin.status === 'active' && (!storedAdmin.linkedUserId || (linkedCustomer && linkedCustomer.status === 'active' && linkedCustomer.passwordHash === storedAdmin.passwordHash));
    if (!isRootAdmin && !isStoredAdmin) {
      const attemptCount = recordFailure(req, failBucket, 15 * 60 * 1000);
      let failReason = 'Unknown username — no administrator account exists with this username.';
      let actorType = 'anonymous';
      if (!username || !password) {
        failReason = !username ? 'Username field was left blank.' : 'Password field was left blank.';
      } else if (rootNameMatch) {
        failReason = 'Incorrect password entered for the Super Administrator account.';
        actorType = 'super_admin';
      } else if (storedAdmin && validStoredPassword && storedAdmin.linkedUserId && linkedCustomer && linkedCustomer.passwordHash !== storedAdmin.passwordHash) {
        failReason = 'Linked customer and administrator passwords are out of sync.';
        actorType = storedAdmin.role === 'auditor' ? 'auditor' : 'admin';
      } else if (storedAdmin) {
        failReason = `Incorrect password entered for ${storedAdmin.role === 'auditor' ? 'read-only auditor' : 'administrator'} account @${storedAdmin.username}.`;
        actorType = storedAdmin.role === 'auditor' ? 'auditor' : 'admin';
      }
      auditAdmin(
        'Failed admin sign-in attempt',
        { username: username || '(empty)', path: '/api/admin/login', attemptCount, attemptsRemaining: Math.max(0, 10 - attemptCount) },
        username || 'unknown',
        {
          actorType,
          category: 'auth',
          outcome: 'failed',
          severity: attemptCount >= 5 ? 'high' : 'medium',
          reason: `${failReason} (Attempt ${attemptCount} of 10 before lockout.)`,
          summary: `Admin sign-in failed for "${username || '(empty)'}" on the Admin Console login page.`,
        }
      );
      return sendJson(res, 401, { error: 'Admin username or password is incorrect.' });
    }
    clearFailures(req, failBucket);
    const role = isRootAdmin ? 'admin' : storedAdmin.role;
    const adminUsername = isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username;
    const token = createAdminToken(adminUsername, role);
    createSession(token, isRootAdmin ? '__chase_admin__' : `admin:${storedAdmin.username}`, role);
    auditAdmin(
      'Admin sign-in',
      { username: adminUsername, role, isSuperAdmin: isRootAdmin },
      adminUsername,
      {
        actorType: isRootAdmin ? 'super_admin' : role === 'auditor' ? 'auditor' : 'admin',
        category: 'auth',
        outcome: 'success',
        severity: 'low',
        summary: `${isRootAdmin ? 'Super Administrator' : role === 'auditor' ? 'Read-Only Auditor' : 'Administrator'} ${adminUsername} signed in to the Admin Console.`,
      }
    );
    return sendJson(res, 200, {
      token,
      admin: {
        username: adminUsername,
        label: isRootAdmin ? 'Super administrator' : storedAdmin.fullName,
        role,
        isSuperAdmin: isRootAdmin,
        permissions: normalizePermissions(isRootAdmin ? null : storedAdmin.permissions),
        capabilities: normalizeCapabilities(isRootAdmin ? null : storedAdmin.capabilities),
        linkedUserId: isRootAdmin ? null : (storedAdmin.linkedUserId || null),
      },
    }, sessionCookieHeader(req, token, role));
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    if (!getSimulatorSettings().allowEnrollment) {
      recordAuditEvent({
        actor: 'anonymous',
        actorType: 'anonymous',
        action: 'Blocked customer enrollment',
        category: 'security',
        outcome: 'blocked',
        severity: 'medium',
        reason: 'Online customer enrollment is currently turned off in Super Admin settings.',
        summary: 'A visitor tried to enroll a new account, but online enrollment is disabled.',
      });
      return sendJson(res, 403, { error: 'Online enrollment is temporarily disabled in this simulator.' });
    }
    if (limited(req, res, 'register', 20, 60 * 60 * 1000, 'Too many enrollment attempts. Please wait and try again.')) {
      recordAuditEvent({
        actor: 'anonymous',
        actorType: 'anonymous',
        action: 'Blocked customer enrollment (rate limit)',
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'More than 20 enrollment requests within 1 hour from this IP address.',
        summary: 'Blocked a customer enrollment request due to rate limiting.',
      });
      return;
    }
    const body = await readBody(req);
    const attemptedUsername = String(body.username || '').trim();
    const logEnrollFail = (reasonText, extra = {}) => recordAuditEvent({
      actor: attemptedUsername || 'anonymous',
      actorType: 'anonymous',
      action: 'Failed customer enrollment',
      category: 'customers',
      outcome: 'failed',
      severity: 'low',
      reason: reasonText,
      summary: `Customer enrollment for "${attemptedUsername || '(no username)'}" did not complete.`,
      details: { username: attemptedUsername || '(empty)', product: body.product || null, ...extra },
    });
    const required = ['firstName', 'lastName', 'email', 'username', 'password', 'product'];
    for (const field of required) {
      if (!body[field] || !String(body[field]).trim()) {
        logEnrollFail(`Required field "${field}" was left empty.`);
        return sendJson(res, 400, { error: `${field} is required` });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
      logEnrollFail('The email address entered was not in a valid format.');
      return sendJson(res, 400, { error: 'Enter a valid email address' });
    }
    if (attemptedUsername.length < 4 || attemptedUsername.length > 32) {
      logEnrollFail('Username must be between 4 and 32 characters long.');
      return sendJson(res, 400, { error: 'Username must be 4–32 characters' });
    }
    if (String(body.password).length < 8) {
      logEnrollFail('Password was shorter than the 8-character minimum.');
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }
    if (attemptedUsername.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase()) {
      logEnrollFail('Attempted to register using the reserved Super Administrator username.');
      return sendJson(res, 400, { error: 'That username is reserved for the separate administrator sign-in.' });
    }
    if (findUserByUsername(body.username) || findAdminByUsername(body.username)) {
      logEnrollFail(`Username "@${attemptedUsername}" is already taken by an existing account.`);
      return sendJson(res, 400, { error: 'That username is already taken' });
    }
    const product = PRODUCTS.find((p) => p.id === body.product);
    if (!product) {
      logEnrollFail(`Invalid banking product "${String(body.product || '')}" selected.`);
      return sendJson(res, 400, { error: 'Invalid product' });
    }
    const deposit = openingDeposit(body.openingDeposit, product.type === 'credit-card');
    if (deposit === null) {
      logEnrollFail('Opening deposit amount was outside the allowed $0 to $100,000 range.');
      return sendJson(res, 400, { error: 'Opening deposit must be between $0 and $100,000' });
    }
    const user = {
      id: uid(),
      username: attemptedUsername,
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
    recordAuditEvent({
      actor: user.username,
      actorType: 'customer',
      action: 'New customer enrolled',
      category: 'customers',
      outcome: 'success',
      severity: 'info',
      summary: `New customer ${user.fullName} (@${user.username}) enrolled with ${product.name} (${formatUsdSimple(deposit)} opening deposit).`,
      target: { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` },
      details: { userId: user.id, username: user.username, product: product.name, openingDeposit: deposit },
    });
    return sendJson(res, 201, { user: publicUser(user), token }, sessionCookieHeader(req, token));
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const adminUsername = String(body.username || '').trim();
    const password = String(body.password || '');
    const storedAdmin = findAdminByUsername(adminUsername);
    const rootNameMatch = adminUsername.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase();
    const rootHash = getRootAdminPasswordHash();
    const isRootAdmin = !!rootHash && rootNameMatch && verifyPassword(password, rootHash);
    const validStoredPassword = storedAdmin && verifyPassword(password, storedAdmin.passwordHash);
    const linkedCustomer = storedAdmin?.linkedUserId ? findUserById(storedAdmin.linkedUserId) : null;
    const isStoredAdmin = validStoredPassword && storedAdmin.status === 'active' && (!storedAdmin.linkedUserId || (linkedCustomer && linkedCustomer.status === 'active' && linkedCustomer.passwordHash === storedAdmin.passwordHash));
    if (rootNameMatch || (storedAdmin && !storedAdmin.linkedUserId)) {
      const failBucket = `admin-login:${adminUsername.toLowerCase() || '*'}`;
      if (tooManyFailures(req, failBucket, 10)) {
        auditAdmin(
          'Blocked admin sign-in (rate limit)',
          { username: adminUsername || '(empty)', path: '/api/auth/login', lockoutMinutes: 15, maxAttempts: 10 },
          adminUsername || 'unknown',
          {
            actorType: rootNameMatch ? 'super_admin' : 'admin',
            category: 'security',
            outcome: 'blocked',
            severity: 'high',
            reason: 'Too many failed sign-in attempts (10 or more within 15 minutes from this IP address). Temporarily locked for 15 minutes.',
            summary: `Blocked admin sign-in for "${adminUsername || '(empty)'}" on the main login page due to repeated failures.`,
          }
        );
        return sendJson(res, 429, { error: 'Too many unsuccessful admin sign-in attempts. Try again later.' });
      }
      if (validStoredPassword && storedAdmin.status === 'disabled') {
        auditAdmin(
          'Blocked admin sign-in through customer login (disabled)',
          { username: storedAdmin.username, adminId: storedAdmin.id, role: storedAdmin.role },
          storedAdmin.username,
          {
            actorType: storedAdmin.role === 'auditor' ? 'auditor' : 'admin',
            category: 'security',
            outcome: 'blocked',
            severity: 'high',
            reason: storedAdmin.lockMessage || 'This administrator account is currently disabled by the Super Administrator.',
            summary: `Blocked sign-in for @${storedAdmin.username} on the main sign-in page because the administrator account is disabled.`,
            target: { type: 'admin', id: storedAdmin.id, label: `${storedAdmin.fullName} (@${storedAdmin.username})` },
          }
        );
        return sendJson(res, 403, { error: storedAdmin.lockMessage || 'This administrator account is disabled. Contact the super administrator.' });
      }
      if (!isRootAdmin && !isStoredAdmin) {
        const attemptCount = recordFailure(req, failBucket, 15 * 60 * 1000);
        const failReason = !password
          ? 'Password field was left blank.'
          : rootNameMatch
            ? 'Incorrect password entered for the Super Administrator account.'
            : `Incorrect password entered for ${storedAdmin?.role === 'auditor' ? 'read-only auditor' : 'administrator'} account @${storedAdmin?.username || adminUsername}.`;
        auditAdmin(
          'Failed admin sign-in attempt',
          { username: adminUsername || '(empty)', path: '/api/auth/login', attemptCount, attemptsRemaining: Math.max(0, 10 - attemptCount) },
          adminUsername || 'unknown',
          {
            actorType: rootNameMatch ? 'super_admin' : storedAdmin?.role === 'auditor' ? 'auditor' : 'admin',
            category: 'auth',
            outcome: 'failed',
            severity: attemptCount >= 5 ? 'high' : 'medium',
            reason: `${failReason} (Attempt ${attemptCount} of 10 before lockout.)`,
            summary: `Admin sign-in failed for "${adminUsername || '(empty)'}" on the main Chase sign-in page.`,
          }
        );
        return sendJson(res, 401, { error: 'The username or password you entered is incorrect. Please try again.' });
      }
      clearFailures(req, failBucket);
      const role = isRootAdmin ? 'admin' : storedAdmin.role;
      const resolvedUsername = isRootAdmin ? CHASE_ADMIN_USERNAME : storedAdmin.username;
      const token = createAdminToken(resolvedUsername, role);
      createSession(token, isRootAdmin ? '__chase_admin__' : `admin:${storedAdmin.username}`, role);
      auditAdmin(
        'Admin sign-in through customer login',
        { username: resolvedUsername, role, isSuperAdmin: isRootAdmin },
        resolvedUsername,
        {
          actorType: isRootAdmin ? 'super_admin' : role === 'auditor' ? 'auditor' : 'admin',
          category: 'auth',
          outcome: 'success',
          severity: 'low',
          summary: `${isRootAdmin ? 'Super Administrator' : role === 'auditor' ? 'Read-Only Auditor' : 'Administrator'} ${resolvedUsername} signed in via the main Chase sign-in page.`,
        }
      );
      return sendJson(res, 200, {
        admin: {
          username: resolvedUsername,
          label: isRootAdmin ? 'Super administrator' : storedAdmin.fullName,
          role,
          isSuperAdmin: isRootAdmin,
          permissions: normalizePermissions(isRootAdmin ? null : storedAdmin.permissions),
          capabilities: normalizeCapabilities(isRootAdmin ? null : storedAdmin.capabilities),
          linkedUserId: isRootAdmin ? null : (storedAdmin.linkedUserId || null),
        },
        token,
      }, sessionCookieHeader(req, token, role));
    }
    const bucket = `login:${adminUsername.toLowerCase()}`;
    if (tooManyFailures(req, bucket, 10)) {
      const rateLimitedUser = findUserByUsername(adminUsername);
      recordAuditEvent({
        actor: adminUsername || 'unknown',
        actorType: rateLimitedUser ? 'customer' : 'anonymous',
        action: 'Blocked customer sign-in (rate limit)',
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'Too many failed sign-in attempts (10 or more within 15 minutes from this IP address). Temporarily locked for 15 minutes.',
        summary: `Blocked customer sign-in for "${adminUsername || '(empty)'}" after too many consecutive failed attempts.`,
        target: rateLimitedUser ? { type: 'customer', id: rateLimitedUser.id, label: `${rateLimitedUser.fullName} (@${rateLimitedUser.username})` } : null,
        details: { username: adminUsername || '(empty)', lockoutMinutes: 15, maxAttempts: 10 },
      });
      return sendJson(res, 429, { error: 'Too many unsuccessful sign-in attempts. Please wait 15 minutes and try again.' });
    }
    const user = findUserByUsername(adminUsername);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      const attemptCount = recordFailure(req, bucket, 15 * 60 * 1000);
      let failReason = 'Unknown username — no customer or administrator account matches this username.';
      if (!adminUsername || !password) {
        failReason = !adminUsername ? 'Username field was left blank.' : 'Password field was left blank.';
      } else if (user) {
        failReason = `Incorrect password entered for customer ${user.fullName} (@${user.username}).`;
      }
      recordAuditEvent({
        actor: user ? user.username : (adminUsername || 'unknown'),
        actorType: user ? 'customer' : 'anonymous',
        action: 'Failed customer sign-in attempt',
        category: 'auth',
        outcome: 'failed',
        severity: attemptCount >= 5 ? 'high' : 'medium',
        reason: `${failReason} (Attempt ${attemptCount} of 10 before 15-minute lockout.)`,
        summary: user
          ? `Customer ${user.fullName} (@${user.username}) failed to sign in because the password was wrong.`
          : `Sign-in failed for unrecognized username "${adminUsername || '(empty)'}".`,
        target: user ? { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` } : null,
        details: {
          username: adminUsername || '(empty)',
          ...(user ? { userId: user.id, customerName: user.fullName } : {}),
          attemptCount,
          attemptsRemaining: Math.max(0, 10 - attemptCount),
        },
      });
      return sendJson(
        res,
        401,
        { error: 'The username or password you entered is incorrect. Please try again.' }
      );
    }
    if (user.status === 'suspended') {
      recordAuditEvent({
        actor: user.username,
        actorType: 'customer',
        action: 'Blocked customer sign-in (account suspended)',
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'This customer account is currently suspended by an administrator.',
        summary: `Blocked sign-in for ${user.fullName} (@${user.username}) because their account is suspended.`,
        target: { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` },
        details: { userId: user.id, username: user.username, status: user.status },
      });
      return sendJson(res, 403, { error: 'This simulated account is suspended. Contact the Chase administrator.' });
    }
    clearFailures(req, bucket);
    const token = newToken();
    createSession(token, user.id);
    const linkedAdmin = buildLinkedAdminSummary(user.id);
    recordAuditEvent({
      actor: user.username,
      actorType: 'customer',
      action: 'Customer signed in',
      category: 'auth',
      outcome: 'success',
      severity: 'low',
      summary: `Customer ${user.fullName} (@${user.username}) signed in to online banking${linkedAdmin ? ' (linked staff account)' : ''}.`,
      target: { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` },
      details: { userId: user.id, username: user.username, linkedAdmin: Boolean(linkedAdmin) },
    });
    return sendJson(res, 200, { user: publicUser(user), token, ...(linkedAdmin ? { linkedAdmin } : {}) }, sessionCookieHeader(req, token));
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const tokens = requestSessionTokens(req, url, 'user');
    let loggedOutUser = null;
    for (const tok of tokens) {
      const sess = getSession(tok);
      if (sess?.userId && !loggedOutUser) loggedOutUser = findUserById(sess.userId);
      deleteSession(tok);
    }
    if (loggedOutUser) {
      recordAuditEvent({
        actor: loggedOutUser.username,
        actorType: 'customer',
        action: 'Customer signed out',
        category: 'auth',
        outcome: 'success',
        severity: 'info',
        summary: `Customer ${loggedOutUser.fullName} (@${loggedOutUser.username}) signed out of online banking.`,
        target: { type: 'customer', id: loggedOutUser.id, label: `${loggedOutUser.fullName} (@${loggedOutUser.username})` },
        details: { userId: loggedOutUser.id, username: loggedOutUser.username },
      });
    }
    return sendJson(res, 200, { ok: true }, sessionCookieHeader(req));
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = url.searchParams.get('username') || '';
    return sendJson(res, 200, { taken: !!findUserByUsername(username) || !!findAdminByUsername(username) || username.trim().toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() });
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    if (!getSimulatorSettings().allowCustomerPasswordReset) {
      recordAuditEvent({
        actor: 'anonymous',
        actorType: 'anonymous',
        action: 'Blocked password reset',
        category: 'security',
        outcome: 'blocked',
        severity: 'medium',
        reason: 'Customer self-service password reset is currently turned off in Super Admin settings.',
        summary: 'A password reset request was blocked because self-service resets are disabled.',
      });
      return sendJson(res, 403, { error: 'Password reset is temporarily disabled in this simulator.' });
    }
    if (limited(req, res, 'reset', 10, 60 * 60 * 1000, 'Too many password reset attempts. Please wait and try again.')) {
      recordAuditEvent({
        actor: 'anonymous',
        actorType: 'anonymous',
        action: 'Blocked password reset (rate limit)',
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'More than 10 password reset requests within 1 hour from this IP address.',
        summary: 'Blocked a password reset attempt due to rate limiting.',
      });
      return;
    }
    const body = await readBody(req);
    const reqUsername = String(body.username || '').trim();
    const user = findUserByUsername(reqUsername);
    if (String(body.newPassword || '').length < 8) {
      recordAuditEvent({
        actor: user ? user.username : (reqUsername || 'unknown'),
        actorType: user ? 'customer' : 'anonymous',
        action: 'Failed password reset attempt',
        category: 'auth',
        outcome: 'failed',
        severity: 'low',
        reason: 'The new password entered was shorter than 8 characters.',
        summary: `Password reset failed for "${reqUsername || '(empty)'}" because the new password was too short.`,
        target: user ? { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` } : null,
        details: { username: reqUsername || '(empty)' },
      });
      return sendJson(res, 400, { error: 'New password must be at least 8 characters' });
    }
    const emailMatches =
      user && String(user.email || '').trim().toLowerCase() === String(body.email || '').trim().toLowerCase();
    if (!emailMatches) {
      const failReason = !user
        ? `No customer account exists with username "${reqUsername || '(empty)'}".`
        : 'The email address entered did not match the email address on file for this customer.';
      recordAuditEvent({
        actor: user ? user.username : (reqUsername || 'unknown'),
        actorType: user ? 'customer' : 'anonymous',
        action: 'Failed password reset attempt',
        category: 'auth',
        outcome: 'failed',
        severity: 'medium',
        reason: failReason,
        summary: user
          ? `Self-service password reset failed for ${user.fullName} (@${user.username}) due to mismatched email verification.`
          : `Self-service password reset failed for unknown username "${reqUsername || '(empty)'}".`,
        target: user ? { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` } : null,
        details: { username: reqUsername || '(empty)', ...(user ? { userId: user.id } : {}) },
      });
      return sendJson(res, 400, { error: "We couldn't verify that username and email. Check them and try again." });
    }
    if (listAdminAccounts().some(a => a.linkedUserId === user.id)) {
      recordAuditEvent({
        actor: user.username,
        actorType: 'customer',
        action: 'Blocked password reset (linked admin)',
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'Accounts with linked administrator access cannot use public password reset and must be reset by the Super Administrator.',
        summary: `Blocked self-service password reset for ${user.fullName} (@${user.username}) because this account has linked admin access.`,
        target: { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` },
        details: { userId: user.id, username: user.username },
      });
      return sendJson(res, 403, { error: 'Contact the super administrator to reset this account password.' });
    }
    const updated = { ...user, passwordHash: hashPassword(String(body.newPassword)) };
    updateUser(updated);
    deleteSessionsForUser(user.id);
    recordAuditEvent({
      actor: user.username,
      actorType: 'customer',
      action: 'Customer reset password',
      category: 'auth',
      outcome: 'success',
      severity: 'high',
      summary: `Customer ${user.fullName} (@${user.username}) completed a self-service password reset and all prior sessions were signed out.`,
      target: { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` },
      details: { userId: user.id, username: user.username },
    });
    return sendJson(res, 200, { ok: true });
  }

  /* -------------------------- Admin simulator API ------------------------- */
  if (pathname.startsWith('/api/admin/')) {
    const adminSession = getAdminSession(req, url);
    if (!adminSession) {
      if (method !== 'GET') {
        recordAuditEvent({
          actor: 'anonymous',
          actorType: 'anonymous',
          action: 'Blocked unauthenticated admin request',
          category: 'security',
          outcome: 'blocked',
          severity: 'high',
          reason: 'No valid or active administrator session token was provided.',
          summary: `Blocked an unauthenticated ${method} request to ${pathname}.`,
          details: { endpoint: pathname, method },
        });
      }
      return sendJson(res, 401, { error: 'Admin sign-in required.' });
    }
    const isSuperAdmin = adminSession.userId === '__chase_admin__';
    const auditActor = isSuperAdmin ? CHASE_ADMIN_USERNAME : String(adminSession.userId || '').replace(/^admin:/, '');
    const actorRoleType = isSuperAdmin ? 'super_admin' : adminSession.role === 'auditor' ? 'auditor' : 'admin';
    const isAuditorSelfAction =
      (pathname === '/api/admin/logout' && method === 'POST') ||
      (pathname === '/api/admin/me/password' && method === 'PUT') ||
      (pathname === '/api/admin/switch-to-customer' && method === 'POST');
    if (adminSession.role === 'auditor' && method !== 'GET' && !isAuditorSelfAction) {
      auditAdmin(
        'Blocked auditor write attempt',
        { endpoint: pathname, method },
        auditActor,
        {
          actorType: 'auditor',
          category: 'security',
          outcome: 'blocked',
          severity: 'medium',
          reason: 'Read-only auditor accounts are only permitted to view data and cannot make changes.',
          summary: `Blocked read-only auditor @${auditActor} from performing ${method} ${pathname}.`,
        }
      );
      return sendJson(res, 403, { error: 'This auditor account has read-only access.' });
    }
    const operator = isSuperAdmin ? null : findAdminByUsername(auditActor);
    if (!isSuperAdmin && !operator?.id) return sendJson(res, 401, { error: 'Admin sign-in required.' });
    const visibleUsers = () => isSuperAdmin ? findAllUsers() : findAllUsers().filter(u => u.ownerAdminId === operator.id);
    if (!isSuperAdmin) {
      const logPermissionBlock = (actionName, reasonText, extraDetails = {}, severityLevel = 'medium') =>
        auditAdmin(actionName, { endpoint: pathname, method, ...extraDetails }, auditActor, {
          actorType: actorRoleType,
          category: 'security',
          outcome: 'blocked',
          severity: severityLevel,
          reason: reasonText,
          summary: `Blocked @${auditActor} from ${method} ${pathname}: ${reasonText}`,
        });
      // Deny global operations by default. Never rely on hidden client controls for isolation.
      const safeGlobal = new Set([
        '/api/admin/me',
        '/api/admin/me/password',
        '/api/admin/me/support-contact',
        '/api/admin/switch-to-customer',
        '/api/admin/logout',
        '/api/admin/overview',
        '/api/admin/users',
        '/api/admin/users/bulk',
        '/api/admin/transactions',
        '/api/admin/messages',
        '/api/admin/audit',
        '/api/admin/settings',
        '/api/admin/admins',
        '/api/admin/replies',
      ]);
      const ownRoute = pathname === '/api/admin/users/bulk' ? null : pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/|$)/);
      if (ownRoute) {
        const target = findUserById(decodeURIComponent(ownRoute[1]));
        const isSelfFundingRoute =
          Boolean(operator?.linkedUserId && target?.id === operator.linkedUserId) &&
          (
            (method === 'GET' && pathname === `/api/admin/users/${ownRoute[1]}`) ||
            /^\/api\/admin\/users\/[^/]+\/accounts(?:\/|$)/.test(pathname)
          );
        if (!target || (target.ownerAdminId !== operator?.id && !isSelfFundingRoute)) {
          if (target) {
            logPermissionBlock(
              'Blocked cross-tenant customer access',
              `Customer ${target.fullName} (@${target.username}) is not assigned to administrator @${auditActor}.`,
              { targetUserId: target.id, targetUsername: target.username },
              'high'
            );
          }
          return sendJson(res, 404, { error: 'Customer not found.' });
        }
      } else if (!safeGlobal.has(pathname)) {
        logPermissionBlock(
          'Blocked unauthorized admin action',
          'Only the Super Administrator is allowed to access this system-wide endpoint.',
          {},
          'high'
        );
        return sendJson(res, 403, { error: 'Super administrator access required.' });
      }
      if ((pathname === '/api/admin/admins' || pathname === '/api/admin/settings') && method !== 'GET') {
        logPermissionBlock(
          'Blocked unauthorized admin action',
          'Only the Super Administrator can change staff accounts or global access settings.',
          {},
          'high'
        );
        return sendJson(res, 403, { error: 'Super administrator access required.' });
      }
      const permissions = normalizePermissions(operator.permissions);
      const capabilities = normalizeCapabilities(operator.capabilities);
      if (pathname === '/api/admin/users' && method === 'POST' && !permissions.createUsers) {
        logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Create Customers" permission enabled.');
        return sendJson(res, 403, { error: 'Customer creation permission required.' });
      }
      if (/\/generate-transactions$/.test(pathname) && method === 'POST' && !permissions.generateActivity) {
        logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Generate Activity" permission enabled.');
        return sendJson(res, 403, { error: 'Activity generation permission required.' });
      }
      if (/\/messages$/.test(pathname) && method === 'POST' && !permissions.sendMessages) {
        logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Send Messages" permission enabled.');
        return sendJson(res, 403, { error: 'Message sending permission required.' });
      }
      if (method !== 'GET') {
        if (/^\/api\/admin\/users\/[^/]+\/(accounts|transfers|payees|scheduled|send-from-checking)(?:\/|$)/.test(pathname) && !capabilities.manageAccounts) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Manage Accounts & Payments" capability enabled.');
          return sendJson(res, 403, { error: 'Account and payment management permission required.' });
        }
        if (/^\/api\/admin\/users\/[^/]+\/transactions(?:\/|$)/.test(pathname) && !capabilities.editLedger) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Edit Ledger Transactions" capability enabled.');
          return sendJson(res, 403, { error: 'Ledger editing permission required.' });
        }
        if (/^\/api\/admin\/users\/[^/]+\/impersonate$/.test(pathname) && !capabilities.impersonateUsers) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Customer Preview / Impersonation" capability enabled.');
          return sendJson(res, 403, { error: 'Customer preview permission required.' });
        }
        if ((/^\/api\/admin\/users\/[^/]+(?:\/(reset-password|revoke-sessions))?$/.test(pathname) || pathname === '/api/admin/users/bulk') && !capabilities.manageCustomerAccess) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Manage Customer Profile & Access" capability enabled.');
          return sendJson(res, 403, { error: 'Customer profile & access management permission required.' });
        }
        if (/^\/api\/admin\/users\/[^/]+\/disputes(?:\/|$)/.test(pathname) && !capabilities.manageDisputes) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Manage Disputes" capability enabled.');
          return sendJson(res, 403, { error: 'Dispute management permission required.' });
        }
        if (/^\/api\/admin\/users\/[^/]+\/notice$/.test(pathname) && !capabilities.publishNotices) {
          logPermissionBlock('Blocked admin action (missing permission)', 'This administrator does not have "Publish Dashboard Notices" capability enabled.');
          return sendJson(res, 403, { error: 'Dashboard banner publishing permission required.' });
        }
      }
    }
    const recordAdminAudit = (action, details = {}, extra = {}) =>
      auditAdmin(action, details, auditActor, { actorType: actorRoleType, ...extra });

    if (pathname === '/api/admin/replies' && method === 'GET') {
      const replies = isSuperAdmin ? getSimulatorSettings().superAdminReplies : operator.savedReplies;
      return sendJson(res, 200, { replies: Array.isArray(replies) ? replies : [] });
    }
    if (pathname === '/api/admin/replies' && method === 'PUT') {
      const body = await readBody(req);
      if (!Array.isArray(body.replies) || body.replies.length > 25) return sendJson(res, 400, { error: 'Provide at most 25 replies.' });
      const replies = body.replies.map(r => ({ id: cleanText(r.id, 80), label: cleanText(r.label, 80), subject: cleanText(r.subject, 120), body: cleanText(r.body, 2000), category: ['general', 'wire', 'dispute', 'security', 'account'].includes(r.category) ? r.category : 'general' }));
      if (replies.some(r => !r.id || !r.label || !r.body)) return sendJson(res, 400, { error: 'Each saved reply needs a label and message.' });
      if (isSuperAdmin) updateSimulatorSettings({ superAdminReplies: replies });
      else updateAdminAccount(operator.id, { savedReplies: replies });
      recordAdminAudit('Updated saved replies', { count: replies.length });
      return sendJson(res, 200, { replies });
    }

    if (pathname === '/api/admin/me' && method === 'GET') {
      const username = adminSession.userId === '__chase_admin__' ? CHASE_ADMIN_USERNAME : String(adminSession.userId || '').replace(/^admin:/, '');
      const storedAdmin = adminSession.userId === '__chase_admin__' ? null : findAdminByUsername(username);
      return sendJson(res, 200, {
        admin: {
          username,
          label: storedAdmin?.fullName || 'Super administrator',
          role: adminSession.role,
          isSuperAdmin,
          permissions: normalizePermissions(storedAdmin?.permissions),
          capabilities: normalizeCapabilities(storedAdmin?.capabilities),
          linkedUserId: storedAdmin?.linkedUserId || null,
          linkedCheckingAccounts: getLinkedCheckingAccounts(storedAdmin?.linkedUserId),
          supportContact: isSuperAdmin ? getSimulatorSettings().rootSupportContact : (storedAdmin?.supportContact || { email: '', phone: '' }),
        },
        token: adminSession.token,
      });
    }

    if (pathname === '/api/admin/me/revoke-all-sessions' && method === 'POST') {
      if (!isSuperAdmin) return sendJson(res, 403, { error: 'Super administrator access required.' });
      bumpSuperAdminSessionVersion();
      const freshToken = createAdminToken(CHASE_ADMIN_USERNAME, 'admin');
      createSession(freshToken, '__chase_admin__', 'admin');
      recordAdminAudit('Revoked all other super administrator sessions');
      return sendJson(res, 200, { ok: true, token: freshToken }, sessionCookieHeader(req, freshToken, 'admin'));
    }

    if (pathname === '/api/admin/switch-to-customer' && method === 'POST') {
      if (isSuperAdmin || !operator?.linkedUserId) {
        return sendJson(res, 400, { error: 'This administrator account is not linked to a customer profile.' });
      }
      const linkedCustomer = findUserById(operator.linkedUserId);
      if (!linkedCustomer || linkedCustomer.status !== 'active' || linkedCustomer.username.toLowerCase() !== operator.username.toLowerCase() || linkedCustomer.passwordHash !== operator.passwordHash) {
        return sendJson(res, 403, { error: 'The linked customer profile is unavailable or suspended.' });
      }
      const token = newToken();
      createSession(token, linkedCustomer.id, 'user');
      recordAdminAudit('Switched from admin console to linked customer view', { userId: linkedCustomer.id, username: linkedCustomer.username });
      const linkedAdmin = buildLinkedAdminSummary(linkedCustomer.id);
      return sendJson(res, 200, { token, user: publicUser(linkedCustomer), ...(linkedAdmin ? { linkedAdmin } : {}) }, sessionCookieHeader(req, token, 'user'));
    }

    if (pathname === '/api/admin/me/password' && method === 'PUT') {
      if (adminSession.userId === '__chase_admin__') return sendJson(res, 400, { error: 'The root admin password is managed by CHASE_ADMIN_PASSWORD in the server environment.' });
      const body = await readBody(req);
      const username = String(adminSession.userId || '').replace(/^admin:/, '');
      const storedAdmin = findAdminByUsername(username);
      if (!storedAdmin || !verifyPassword(String(body.currentPassword || ''), storedAdmin.passwordHash)) {
        recordAdminAudit(
          'Failed admin password change',
          { username },
          {
            category: 'auth',
            outcome: 'failed',
            severity: 'medium',
            reason: 'The current administrator password entered was incorrect.',
            summary: `@${username} tried to change their admin password, but entered the wrong current password.`,
          }
        );
        return sendJson(res, 400, { error: 'Current admin password is incorrect.' });
      }
      if (body.confirm !== true || String(body.newPassword || '').length < 10) return sendJson(res, 400, { error: 'Confirm the change and provide a new password of at least 10 characters.' });
      updateAdminAccount(storedAdmin.id, { passwordHash: hashPassword(String(body.newPassword)) });
      for (const tok of requestSessionTokens(req, url, 'admin')) revokeSession(tok);
      recordAdminAudit('Changed own simulator admin password', { username }, {
        category: 'auth',
        outcome: 'success',
        severity: 'high',
        summary: `@${username} changed their own administrator password and all prior sessions were signed out.`,
      });
      return sendJson(res, 200, { ok: true }, sessionCookieHeader(req, '', adminSession.role));
    }

    if (pathname === '/api/admin/me/support-contact' && method === 'PUT') {
      const body = await readBody(req);
      const contact = validateSupportContact(body?.supportContact ?? body);
      if (!contact) return sendJson(res, 400, { error: 'Provide a valid support email and phone number.' });
      if (isSuperAdmin) {
        updateSimulatorSettings({ rootSupportContact: contact });
        recordAdminAudit('Updated own super administrator support contact', { after: contact }, {
          category: 'admin',
          outcome: 'success',
          severity: 'low',
          summary: `${auditActor} updated their customer support contact (${contact.email} · ${contact.phone}).`,
        });
        return sendJson(res, 200, { supportContact: contact });
      }
      if (!operator?.id) return sendJson(res, 401, { error: 'Admin sign-in required.' });
      updateAdminAccount(operator.id, { supportContact: contact });
      recordAdminAudit('Updated own simulator admin support contact', { username: operator.username, after: contact }, {
        category: 'admin',
        outcome: 'success',
        severity: 'low',
        summary: `${auditActor} updated their customer support contact (${contact.email} · ${contact.phone}).`,
      });
      return sendJson(res, 200, { supportContact: contact });
    }

    if (pathname === '/api/admin/admins' && method === 'GET') {
      if (!isSuperAdmin) return sendJson(res, 200, { admins: [] });
      const allUsers = findAllUsers();
      const activity = getAuditLog(5000);
      const rootOwned = allUsers.filter(u => !u.ownerAdminId);
      const rootRow = {
        id: '__root__',
        username: CHASE_ADMIN_USERNAME,
        fullName: 'Super administrator',
        role: 'admin',
        status: 'active',
        protected: true,
        supportContact: getSimulatorSettings().rootSupportContact,
        customerCount: rootOwned.length,
        unreadCount: rootOwned.reduce((n, u) => n + (u.messages || []).filter(m => m.sender === 'customer' && !m.readByAdmin).length, 0),
        lastActivity: activity.find(entry => entry.actor === CHASE_ADMIN_USERNAME)?.createdAt || null,
      };
      const admins = listAdminAccounts().map(admin => {
        const owned = allUsers.filter(u => u.ownerAdminId === admin.id);
        const linkedUser = admin.linkedUserId ? allUsers.find(u => u.id === admin.linkedUserId) : null;
        return {
          ...admin,
          permissions: normalizePermissions(admin.permissions),
          capabilities: normalizeCapabilities(admin.capabilities),
          linkedCustomer: linkedUser ? { id: linkedUser.id, username: linkedUser.username, fullName: linkedUser.fullName, email: linkedUser.email, status: linkedUser.status || 'active' } : null,
          customerCount: owned.length,
          unreadCount: owned.reduce((n, u) => n + (u.messages || []).filter(m => m.sender === 'customer' && !m.readByAdmin).length, 0),
          lastActivity: activity.find(entry => entry.actor === admin.username)?.createdAt || null,
        };
      });
      return sendJson(res, 200, { admins: [rootRow, ...admins] });
    }

    if (pathname === '/api/admin/admins' && method === 'POST') {
      const body = await readBody(req);
      const username = cleanText(body.username, 32);
      const fullName = cleanText(body.fullName, 80);
      const password = String(body.password || '');
      const role = body.role;
      const createCustomerProfile = body.createCustomerProfile === true;
      const email = cleanText(body.email || '', 120);
      if (!/^[a-zA-Z0-9._-]{4,32}$/.test(username) || !fullName || password.length < 10 || !['admin', 'auditor'].includes(role)) {
        return sendJson(res, 400, { error: 'Provide a valid username, full name, password of at least 10 characters, and admin or auditor role.' });
      }
      if (createCustomerProfile && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: 'Enter a valid email address for the linked customer profile.' });
      }
      if (username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || findAdminByUsername(username) || findUserByUsername(username)) return sendJson(res, 409, { error: 'That username is already reserved.' });
      let permissions;
      if (body.permissions !== undefined) {
        const p = body.permissions;
        if (!p || typeof p !== 'object' || !['createUsers', 'generateActivity', 'sendMessages'].every(key => typeof p[key] === 'boolean')) {
          return sendJson(res, 400, { error: 'Provide all administrator permissions as booleans.' });
        }
        permissions = { createUsers: p.createUsers, generateActivity: p.generateActivity, sendMessages: p.sendMessages };
      }
      let capabilities;
      if (body.capabilities !== undefined) {
        const c = body.capabilities;
        if (!c || typeof c !== 'object' || !CAPABILITY_KEYS.every(key => typeof c[key] === 'boolean')) {
          return sendJson(res, 400, { error: 'Provide all administrator capabilities as booleans.' });
        }
        capabilities = Object.fromEntries(CAPABILITY_KEYS.map(key => [key, c[key]]));
      }
      let supportContact;
      if (body.supportContact !== undefined) {
        supportContact = validateSupportContact(body.supportContact);
        if (!supportContact) return sendJson(res, 400, { error: 'Provide a valid support email and phone number.' });
      }
      const passwordHash = hashPassword(password);
      const nowIso = new Date().toISOString();
      if (createCustomerProfile) {
        const customer = {
          id: uid(),
          username,
          fullName,
          email,
          passwordHash,
          status: 'active',
          adminCreated: true,
          ownerAdminId: null,
          accounts: [],
          payees: [],
          scheduledPayments: [],
          disputes: [],
          messages: [],
          travelNotices: [],
          travelBookings: [],
          createdAt: nowIso,
        };
        const admin = {
          id: uid(),
          username,
          fullName,
          role,
          status: 'active',
          linkedUserId: customer.id,
          ...(permissions ? { permissions } : {}),
          ...(capabilities ? { capabilities } : {}),
          ...(supportContact ? { supportContact } : {}),
          passwordHash,
          createdAt: nowIso,
        };
        createAdminWithCustomer(admin, customer);
        recordAdminAudit('Created administrator with linked customer profile', { adminId: admin.id, userId: customer.id, username, role });
        const { passwordHash: _ph, ...publicAdmin } = admin;
        return sendJson(res, 201, { admin: { ...publicAdmin, permissions: normalizePermissions(publicAdmin.permissions), capabilities: normalizeCapabilities(publicAdmin.capabilities) }, user: publicUser(customer) });
      }
      const admin = {
        id: uid(),
        username,
        fullName,
        role,
        status: 'active',
        ...(permissions ? { permissions } : {}),
        ...(capabilities ? { capabilities } : {}),
        ...(supportContact ? { supportContact } : {}),
        passwordHash,
        createdAt: nowIso,
      };
      insertAdminAccount(admin);
      recordAdminAudit('Created simulator administrator', { adminId: admin.id, username, role });
      const { passwordHash: _ph, ...publicAdmin } = admin;
      return sendJson(res, 201, { admin: { ...publicAdmin, permissions: normalizePermissions(publicAdmin.permissions), capabilities: normalizeCapabilities(publicAdmin.capabilities) } });
    }

    const adminSubRoute = pathname.match(/^\/api\/admin\/admins\/([^/]+)\/(link-customer|reassign-customers)$/);
    if (adminSubRoute) {
      const adminId = decodeURIComponent(adminSubRoute[1]);
      const action = adminSubRoute[2];
      if (adminId === '__root__') return sendJson(res, 400, { error: 'The environment-configured root admin cannot be modified here.' });
      const existing = findAdminById(adminId);
      if (!existing) return sendJson(res, 404, { error: 'Simulator administrator not found.' });

      if (action === 'link-customer' && method === 'POST') {
        if (existing.linkedUserId) return sendJson(res, 409, { error: 'This administrator is already linked to a customer profile.' });
        const body = await readBody(req);
        const mode = body.mode;
        if (mode === 'create') {
          const email = cleanText(body.email || '', 120);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, { error: 'Enter a valid email address for the new customer profile.' });
          }
          if (findUserByUsername(existing.username)) {
            return sendJson(res, 409, { error: 'A customer with this username already exists. Review and link that existing customer instead.' });
          }
          const customer = {
            id: uid(),
            username: existing.username,
            fullName: existing.fullName,
            email,
            passwordHash: existing.passwordHash,
            status: 'active',
            adminCreated: true,
            ownerAdminId: null,
            accounts: [],
            payees: [],
            scheduledPayments: [],
            disputes: [],
            messages: [],
            travelNotices: [],
            travelBookings: [],
            createdAt: new Date().toISOString(),
          };
          const linked = linkAdminToCustomer(adminId, { newCustomer: customer });
          recordAdminAudit('Linked administrator to new customer profile', { adminId, userId: customer.id, username: existing.username });
          return sendJson(res, 201, { admin: linked.admin, user: publicUser(linked.user) });
        }
        if (mode === 'existing') {
          if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm linking this administrator to the selected customer profile.' });
          const targetUser = findUserById(String(body.userId || ''));
          if (!targetUser) return sendJson(res, 404, { error: 'Customer not found.' });
          if (targetUser.status !== 'active') return sendJson(res, 400, { error: 'Only active customer profiles can be linked.' });
          if (findAdminByLinkedUserId(targetUser.id)) return sendJson(res, 409, { error: 'That customer is already linked to another administrator.' });
          if (!/^[a-zA-Z0-9._-]{4,32}$/.test(targetUser.username) || targetUser.username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase()) {
            return sendJson(res, 400, { error: 'This customer username cannot be used as an administrator username.' });
          }
          const usernameOwner = findAdminByUsername(targetUser.username);
          if (usernameOwner && usernameOwner.id !== adminId) {
            return sendJson(res, 409, { error: 'Another administrator already uses that customer username.' });
          }
          const passwordSource = body.passwordSource === 'customer' ? 'customer' : 'admin';
          const passwordHash = passwordSource === 'customer' ? targetUser.passwordHash : existing.passwordHash;
          const linked = linkAdminToCustomer(adminId, { existingUserId: targetUser.id, passwordHash });
          recordAdminAudit('Linked administrator to existing customer profile', {
            adminId,
            previousAdminUsername: existing.username,
            linkedUsername: linked.admin.username,
            userId: targetUser.id,
            passwordSource,
          });
          return sendJson(res, 200, { admin: linked.admin, user: publicUser(linked.user) });
        }
        return sendJson(res, 400, { error: 'Specify mode as "create" or "existing".' });
      }

      if (action === 'reassign-customers' && method === 'POST') {
        const body = await readBody(req);
        const replacementId = body.replacementAdminId === null || body.replacementAdminId === '' ? null : String(body.replacementAdminId);
        if (replacementId === adminId) return sendJson(res, 400, { error: 'Choose a different active administrator as the replacement.' });
        if (replacementId !== null) {
          const replacement = listAdminAccounts().find(a => a.id === replacementId && a.status === 'active' && a.role === 'admin');
          if (!replacement) return sendJson(res, 400, { error: 'Select an active administrator or Super admin as the replacement.' });
        }
        const reassignedCount = reassignAdminCustomers(adminId, replacementId);
        recordAdminAudit('Reassigned all customers from administrator', { fromAdminId: adminId, fromUsername: existing.username, replacementAdminId: replacementId, reassignedCount });
        return sendJson(res, 200, { ok: true, reassignedCount, replacementAdminId: replacementId });
      }
    }

    const adminRoute = pathname.match(/^\/api\/admin\/admins\/([^/]+)$/);
    if (adminRoute) {
      const adminId = decodeURIComponent(adminRoute[1]);
      if (adminId === '__root__') {
        if (method === 'PUT') {
          const body = await readBody(req);
          const keys = Object.keys(body || {});
          if (keys.length === 1 && keys[0] === 'supportContact') {
            const contact = validateSupportContact(body.supportContact);
            if (!contact) return sendJson(res, 400, { error: 'Provide a valid support email and phone number.' });
            const prevContact = getSimulatorSettings().rootSupportContact;
            updateSimulatorSettings({ rootSupportContact: contact });
            recordAdminAudit('Updated super administrator support contact', { before: prevContact, after: contact });
            return sendJson(res, 200, {
              admin: {
                id: '__root__',
                username: CHASE_ADMIN_USERNAME,
                fullName: 'Super administrator',
                role: 'admin',
                status: 'active',
                protected: true,
                supportContact: contact,
              },
            });
          }
        }
        return sendJson(res, 400, { error: 'The environment-configured root admin cannot be edited here.' });
      }
      const existing = listAdminAccounts().find((admin) => admin.id === adminId);
      if (!existing) return sendJson(res, 404, { error: 'Simulator administrator not found.' });
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = {};
        const auditChanges = {};
        if (body.username !== undefined) {
          const username = cleanText(body.username, 32);
          if (existing.linkedUserId && username !== existing.username) return sendJson(res, 400, { error: 'The linked username cannot be changed here.' });
          const conflict = findAdminByUsername(username);
          const customerConflict = findUserByUsername(username);
          if (!/^[a-zA-Z0-9._-]{4,32}$/.test(username) || username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || (conflict && conflict.id !== adminId) || (customerConflict && customerConflict.id !== existing.linkedUserId)) return sendJson(res, 400, { error: 'Provide an available staff username of 4–32 letters, numbers, dots, underscores or hyphens.' });
          if (username !== existing.username) {
            patch.username = username;
            auditChanges.username = { from: existing.username, to: username };
          }
        }
        if (body.fullName !== undefined) {
          const fullName = cleanText(body.fullName, 80);
          if (!fullName) return sendJson(res, 400, { error: 'Staff name is required.' });
          if (fullName !== existing.fullName) auditChanges.fullName = { from: existing.fullName, to: fullName };
          patch.fullName = fullName;
        }
        if (body.supportContact !== undefined) {
          const contact = validateSupportContact(body.supportContact);
          if (!contact) return sendJson(res, 400, { error: 'Provide a valid support email and phone number.' });
          auditChanges.supportContact = { from: existing.supportContact || null, to: contact };
          patch.supportContact = contact;
        }
        if (body.lockMessage !== undefined) {
          if (typeof body.lockMessage !== 'string' || body.lockMessage.length > 300) return sendJson(res, 400, { error: 'Lock message must be at most 300 characters.' });
          patch.lockMessage = cleanText(body.lockMessage, 300);
          auditChanges.lockMessage = patch.lockMessage;
        }
        if (body.role !== undefined) {
          if (!['admin', 'auditor'].includes(body.role)) return sendJson(res, 400, { error: 'Role must be admin or auditor.' });
          if (body.role !== existing.role) auditChanges.role = { from: existing.role, to: body.role };
          patch.role = body.role;
        }
        if (body.permissions !== undefined) {
          const p = body.permissions;
          if (!p || typeof p !== 'object' || !['createUsers', 'generateActivity', 'sendMessages'].every(key => typeof p[key] === 'boolean')) return sendJson(res, 400, { error: 'Provide all administrator permissions as booleans.' });
          patch.permissions = { createUsers: p.createUsers, generateActivity: p.generateActivity, sendMessages: p.sendMessages };
          auditChanges.permissions = { from: normalizePermissions(existing.permissions), to: patch.permissions };
        }
        if (body.capabilities !== undefined) {
          const c = body.capabilities;
          if (!c || typeof c !== 'object' || !CAPABILITY_KEYS.every(key => typeof c[key] === 'boolean')) return sendJson(res, 400, { error: 'Provide all administrator capabilities as booleans.' });
          patch.capabilities = Object.fromEntries(CAPABILITY_KEYS.map(key => [key, c[key]]));
          auditChanges.capabilities = { from: normalizeCapabilities(existing.capabilities), to: patch.capabilities };
        }
        if (body.status !== undefined) {
          if (!['active', 'disabled'].includes(body.status)) return sendJson(res, 400, { error: 'Status must be active or disabled.' });
          if (body.status !== existing.status) auditChanges.status = { from: existing.status, to: body.status };
          patch.status = body.status;
        }
        if (body.password !== undefined) {
          if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm this administrator password reset.' });
          if (String(body.password).length < 10) return sendJson(res, 400, { error: 'Admin password must be at least 10 characters.' });
          patch.passwordHash = hashPassword(String(body.password));
          auditChanges.passwordReset = true;
        }
        let replacementAdminId;
        if (body.replacementAdminId !== undefined) {
          const rep = body.replacementAdminId === null || body.replacementAdminId === '' ? null : String(body.replacementAdminId);
          if (rep === adminId) return sendJson(res, 400, { error: 'Choose a different active administrator as the replacement.' });
          if (rep !== null && !listAdminAccounts().some(a => a.id === rep && a.status === 'active' && a.role === 'admin')) {
            return sendJson(res, 400, { error: 'Select an active administrator or Super admin as the replacement.' });
          }
          replacementAdminId = rep;
        }
        const updated = updateAdminAccount(adminId, patch, replacementAdminId !== undefined ? { replacementAdminId } : {});
        const reassignedCount = updated?._reassignedCount || 0;
        if (updated && '_reassignedCount' in updated) delete updated._reassignedCount;
        recordAdminAudit('Updated simulator administrator', {
          adminId,
          username: updated?.username || existing.username,
          fields: Object.keys(patch),
          changes: auditChanges,
          ...(replacementAdminId !== undefined ? { reassignedCount, replacementAdminId } : {}),
        });
        return sendJson(res, 200, { admin: { ...updated, permissions: normalizePermissions(updated.permissions), capabilities: normalizeCapabilities(updated.capabilities) }, ...(replacementAdminId !== undefined ? { reassignedCount } : {}) });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        const currentUsername = String(adminSession.userId || '').replace(/^admin:/, '');
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm admin account deletion.' });
        if (currentUsername.toLowerCase() === existing.username.toLowerCase()) return sendJson(res, 400, { error: 'You cannot delete your own active admin identity.' });
        const hasAssigned = findAllUsers().some(u => u.ownerAdminId === adminId);
        if (body.replacementAdminId !== undefined) {
          const rep = body.replacementAdminId === null || body.replacementAdminId === '' ? null : String(body.replacementAdminId);
          if (rep === adminId) return sendJson(res, 400, { error: 'Choose a different active administrator as the replacement.' });
          if (rep !== null && !listAdminAccounts().some(a => a.id === rep && a.status === 'active' && a.role === 'admin')) {
            return sendJson(res, 400, { error: 'Select an active administrator or Super admin as the replacement.' });
          }
          const result = reassignAndRemoveAdmin(adminId, rep);
          recordAdminAudit(existing.linkedUserId ? 'Revoked linked administrator access' : 'Deleted simulator administrator', {
            adminId,
            username: existing.username,
            linkedUserId: existing.linkedUserId || null,
            replacementAdminId: rep,
            reassignedCount: result?.reassignedCount || 0,
          });
          return sendJson(res, 200, { ok: true, reassignedCount: result?.reassignedCount || 0, preservedCustomerId: existing.linkedUserId || null });
        }
        if (hasAssigned) return sendJson(res, 409, { error: 'Reassign this administrator’s customers before deleting the administrator.' });
        deleteAdminAccount(adminId);
        recordAdminAudit(existing.linkedUserId ? 'Revoked linked administrator access' : 'Deleted simulator administrator', {
          adminId,
          username: existing.username,
          linkedUserId: existing.linkedUserId || null,
        });
        return sendJson(res, 200, { ok: true, reassignedCount: 0, preservedCustomerId: existing.linkedUserId || null });
      }
    }

    if (pathname === '/api/admin/overview' && method === 'GET') {
      const rangeParam = String(url.searchParams.get('range') || '12w').toLowerCase();
      const range = ['7d', '30d', '12w'].includes(rangeParam) ? rangeParam : '12w';
      const users = visibleUsers();
      const accounts = users.flatMap((u) => u.accounts || []);
      const transactions = accounts.flatMap((a) => (a.transactions || []).map((t) => ({ ...t, _acctType: a.type })));
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      let monthlyInflow = 0;
      let monthlyOutflow = 0;
      const categoryMap = new Map();

      const txFlow = (t) => {
        const amt = Number(t.amount || 0);
        if (t._acctType === 'credit-card') {
          return amt > 0 ? { inflow: 0, outflow: amt } : { inflow: Math.abs(amt), outflow: 0 };
        }
        return amt >= 0 ? { inflow: amt, outflow: 0 } : { inflow: 0, outflow: Math.abs(amt) };
      };

      for (const t of transactions) {
        const d = new Date(t.date);
        const { inflow, outflow } = txFlow(t);
        if (!Number.isNaN(+d) && d.getFullYear() === curYear && d.getMonth() === curMonth) {
          if (t.category !== 'Transfer') {
            monthlyInflow += inflow;
            monthlyOutflow += outflow;
          }
        }
        if (outflow > 0 && !['Transfer', 'Payment', 'Credit card payment', 'Card payment', 'Loan payment'].includes(t.category)) {
          const cat = t.category || 'Other';
          const prev = categoryMap.get(cat) || { category: cat, amount: 0, count: 0 };
          prev.amount = round2(prev.amount + outflow);
          prev.count += 1;
          categoryMap.set(cat, prev);
        }
      }

      const dayMs = 24 * 60 * 60 * 1000;
      const cashflow = [];
      if (range === '7d' || range === '30d') {
        const days = range === '7d' ? 7 : 30;
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        for (let i = days - 1; i >= 0; i--) {
          const bStart = todayStart - i * dayMs;
          const bEnd = bStart + dayMs;
          let inflow = 0;
          let outflow = 0;
          for (const t of transactions) {
            if (t.category === 'Transfer') continue;
            const ts = +new Date(t.date);
            if (ts >= bStart && ts < bEnd) {
              const f = txFlow(t);
              inflow += f.inflow;
              outflow += f.outflow;
            }
          }
          const lblDate = new Date(bStart);
          cashflow.push({
            label: range === '7d'
              ? lblDate.toLocaleDateString('en-US', { weekday: 'short' })
              : lblDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            inflow: round2(inflow),
            outflow: round2(outflow),
          });
        }
      } else {
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
        const weekMs = 7 * dayMs;
        for (let i = 11; i >= 0; i--) {
          const bEnd = todayEnd - i * weekMs;
          const bStart = bEnd - weekMs + 1;
          let inflow = 0;
          let outflow = 0;
          for (const t of transactions) {
            if (t.category === 'Transfer') continue;
            const ts = +new Date(t.date);
            if (ts >= bStart && ts <= bEnd) {
              const f = txFlow(t);
              inflow += f.inflow;
              outflow += f.outflow;
            }
          }
          const lblDate = new Date(bStart);
          cashflow.push({
            label: lblDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            inflow: round2(inflow),
            outflow: round2(outflow),
          });
        }
      }

      const typeLabels = {
        checking: 'Checking',
        savings: 'Savings',
        cd: 'Certificates (CD)',
        'credit-card': 'Credit Cards',
        'auto-loan': 'Auto Loans',
        mortgage: 'Mortgages',
      };
      const mixMap = new Map();
      for (const a of accounts) {
        const entry = mixMap.get(a.type) || { type: a.type, label: typeLabels[a.type] || a.type, count: 0, balance: 0, totalBalance: 0 };
        entry.count += 1;
        entry.balance = round2(entry.balance + Math.abs(Number(a.balance || 0)));
        entry.totalBalance = entry.balance;
        mixMap.set(a.type, entry);
      }

      const creditAccounts = accounts.filter((a) => a.type === 'credit-card');
      const totalCreditBalance = round2(creditAccounts.reduce((n, a) => n + Math.max(0, Number(a.balance || 0)), 0));
      const totalCreditLimit = round2(creditAccounts.reduce((n, a) => n + Math.max(0, Number(a.creditLimit || 0)), 0));
      const utilizationPct = totalCreditLimit > 0 ? round2((totalCreditBalance / totalCreditLimit) * 100) : 0;

      const allDisputes = users.flatMap((u) =>
        (u.disputes || []).map((d) => {
          const acct = (u.accounts || []).find((a) => a.id === d.accountId);
          return {
            ...d,
            userId: u.id,
            username: u.username,
            fullName: u.fullName,
            accountName: acct?.name || 'Credit Card',
          };
        })
      ).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const sortedCategories = [...categoryMap.values()]
        .map((c) => ({ category: c.category, amount: c.amount, total: c.amount, count: c.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);

      const dbStats = isSuperAdmin ? getDbStats() : {};
      const mem = typeof process.memoryUsage === 'function' ? process.memoryUsage() : { rss: 0, heapUsed: 0, heapTotal: 0 };

      return sendJson(res, 200, {
        metrics: {
          users: users.length,
          suspendedUsers: users.filter((u) => u.status === 'suspended').length,
          accounts: accounts.length,
          deposits: round2(accounts.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
          cardBalances: round2(accounts.filter((a) => a.type === 'credit-card').reduce((n, a) => n + Number(a.balance || 0), 0)),
          loanBalances: round2(accounts.filter((a) => ['auto-loan', 'mortgage'].includes(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
          scheduledPayments: users.reduce((n, u) => n + (u.scheduledPayments || []).filter((s) => s.status === 'scheduled' || s.status === 'paused').length, 0),
          openDisputes: allDisputes.filter((d) => d.status === 'open').length,
          transactions: transactions.length,
        },
        recentAudit: (() => {
          const auditCtx = buildAuditContext({
            users: isSuperAdmin ? findAllUsers() : users,
            adminAccounts: isSuperAdmin ? listAdminAccounts() : [],
            rootAdminUsername: CHASE_ADMIN_USERNAME,
          });
          const rawRecent = isSuperAdmin
            ? getAuditLog(10)
            : getAuditLog(5000).filter((entry) => entry.actor === auditActor).slice(0, 10);
          return rawRecent.map((entry) => enrichAuditEntry(entry, auditCtx));
        })(),
        analytics: {
          range,
          cashflow,
          accountMix: [...mixMap.values()],
          categorySpend: sortedCategories,
          categories: sortedCategories,
          credit: {
            totalCreditBalance,
            totalCreditLimit,
            utilizationPct,
          },
          monthlyInflow: round2(monthlyInflow),
          monthlyOutflow: round2(monthlyOutflow),
          monthlyTarget: 75000,
          disputes: allDisputes,
          unreadMessagesCount: users.reduce(
            (sum, u) => sum + ((u.messages || []).filter((m) => m.sender === 'customer' && !m.readByAdmin).length),
            0
          ),
          ...(isSuperAdmin ? {
            system: {
              nodeVersion: process.version || 'workers',
              platform: `${typeof os.platform === 'function' ? os.platform() : 'cloudflare'} (${typeof os.arch === 'function' ? os.arch() : 'wasm'})`,
              uptimeSeconds: typeof process.uptime === 'function' ? Math.round(process.uptime()) : 0,
              rssMb: round2((mem.rss || 0) / (1024 * 1024)),
              heapUsedMb: round2((mem.heapUsed || 0) / (1024 * 1024)),
              memoryMb: {
                rss: round2((mem.rss || 0) / (1024 * 1024)),
                heapUsed: round2((mem.heapUsed || 0) / (1024 * 1024)),
                heapTotal: round2((mem.heapTotal || 0) / (1024 * 1024)),
              },
              ...dbStats,
            },
          } : {}),
        },
      });
    }

    if (pathname === '/api/admin/seed-demo' && method === 'POST') return sendJson(res, 410, { error: 'Demo seeding disabled.' });
    if (pathname === '/api/admin/transactions' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const status = url.searchParams.get('status') || '';
      const from = url.searchParams.get('from') || '';
      const through = url.searchParams.get('through') || '';
      const allRows = visibleUsers().flatMap((user) => (user.accounts || []).flatMap((account) => (account.transactions || []).map((transaction) => ({
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
      const linkedByUserId = isSuperAdmin
        ? new Map(listAdminAccounts().filter(a => a.linkedUserId).map(a => [a.linkedUserId, a]))
        : null;
      const users = visibleUsers().map((u) => {
        const accounts = u.accounts || [];
        const linked = linkedByUserId ? linkedByUserId.get(u.id) : null;
        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          ownerAdminId: isSuperAdmin ? u.ownerAdminId || null : undefined,
          linkedAdminId: isSuperAdmin ? (linked?.id || null) : undefined,
          linkedAdminRole: isSuperAdmin ? (linked?.role || null) : undefined,
          linkedAdminStatus: isSuperAdmin ? (linked?.status || null) : undefined,
          status: u.status || 'active',
          creditScore: Number(u.credit?.score ?? u.creditScore ?? 750),
          createdAt: u.createdAt,
          accountCount: accounts.length,
          transactionCount: accounts.reduce((n, a) => n + (a.transactions || []).length, 0),
          depositBalance: round2(accounts.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
          cardBalance: round2(accounts.filter((a) => a.type === 'credit-card').reduce((n, a) => n + Number(a.balance || 0), 0)),
          loanBalance: round2(accounts.filter((a) => ['auto-loan', 'mortgage'].includes(a.type)).reduce((n, a) => n + Number(a.balance || 0), 0)),
        };
      }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return sendJson(res, 200, { users });
    }

    if (pathname === '/api/admin/audit' && method === 'GET') {
      const rawAll = getAuditLog(5000);
      const scopedRaw = isSuperAdmin
        ? rawAll
        : rawAll.filter((entry) => entry.actor === auditActor);
      const integrity = isSuperAdmin ? verifyAuditIntegrity(rawAll) : null;
      const tamperedSet = new Set(integrity?.tamperedIds || []);
      const auditCtx = buildAuditContext({
        users: isSuperAdmin ? findAllUsers() : visibleUsers(),
        adminAccounts: isSuperAdmin ? listAdminAccounts() : [],
        rootAdminUsername: CHASE_ADMIN_USERNAME,
      });
      const enriched = scopedRaw.map((entry) => enrichAuditEntry(entry, auditCtx, tamperedSet));
      const stats = computeAuditStats(enriched);

      // Optional server-side filtering for programmatic queries
      const categoryFilter = String(url.searchParams.get('category') || '').trim().toLowerCase();
      const outcomeFilter = String(url.searchParams.get('outcome') || '').trim().toLowerCase();
      const actorTypeFilter = String(url.searchParams.get('actorType') || '').trim().toLowerCase();
      const qFilter = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const filtered = enriched.filter((entry) => {
        if (categoryFilter && categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
        if (outcomeFilter && outcomeFilter !== 'all' && entry.outcome !== outcomeFilter) return false;
        if (actorTypeFilter && actorTypeFilter !== 'all' && entry.actorType !== actorTypeFilter) return false;
        if (qFilter) {
          const hay = `${entry.actor} ${entry.action} ${entry.summary || ''} ${entry.reason || ''} ${entry.target?.label || ''} ${entry.ip || ''} ${JSON.stringify(entry.details || {})}`.toLowerCase();
          if (!hay.includes(qFilter)) return false;
        }
        return true;
      });

      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const requestedLimit = Number(url.searchParams.get('limit')) || 100;
      const limit = Math.max(1, Math.min(5000, requestedLimit));
      return sendJson(res, 200, {
        audit: filtered.slice(offset, offset + limit),
        total: filtered.length,
        offset,
        limit,
        stats,
        ...(isSuperAdmin ? { integrity } : {}),
      });
    }

    if (pathname === '/api/admin/settings' && method === 'GET') {
      const settings = getSimulatorSettings();
      if (!isSuperAdmin) {
        return sendJson(res, 200, {
          settings: {
            allowEnrollment: settings.allowEnrollment,
            allowCustomerPasswordReset: settings.allowCustomerPasswordReset,
          },
        });
      }
      return sendJson(res, 200, { settings });
    }

    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const body = await readBody(req);
      const settings = body.settings || {};
      if (typeof settings.allowEnrollment !== 'boolean' || typeof settings.allowCustomerPasswordReset !== 'boolean') {
        return sendJson(res, 400, { error: 'Provide both simulator access settings as boolean values.' });
      }
      const patch = {
        allowEnrollment: settings.allowEnrollment,
        allowCustomerPasswordReset: settings.allowCustomerPasswordReset,
      };
      if (settings.rootSupportContact !== undefined) {
        const contact = validateSupportContact(settings.rootSupportContact);
        if (!contact) return sendJson(res, 400, { error: 'Provide a valid support email and phone number.' });
        patch.rootSupportContact = contact;
      }
      const saved = updateSimulatorSettings(patch);
      recordAdminAudit('Updated simulator access settings', patch);
      return sendJson(res, 200, { settings: saved });
    }

    if (pathname === '/api/admin/process-scheduled' && method === 'POST') {
      const body = await readBody(req);
      const targetUserId = body.userId ? String(body.userId) : null;
      const singlePaymentId = body.paymentId ? String(body.paymentId) : null;
      const forceAll = body.forceAll === true;
      const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.asOfDate || ''))
        ? String(body.asOfDate)
        : new Date().toISOString().slice(0, 10);

      const candidates = targetUserId
        ? [findUserById(targetUserId)].filter(Boolean)
        : findAllUsers().filter((u) => u.status !== 'suspended');

      let processedCount = 0;
      let totalAmount = 0;
      const executed = [];
      let updatedTargetUser = null;

      for (const rawUser of candidates) {
        const u = JSON.parse(JSON.stringify(rawUser));
        let userChanged = false;
        for (const p of u.scheduledPayments || []) {
          if (p.status !== 'scheduled') continue;
          if (singlePaymentId && p.id !== singlePaymentId) continue;
          const dueDay = String(p.date || '').slice(0, 10);
          if (!singlePaymentId && !forceAll && dueDay > asOfDate) continue;

          const fromAcct = (u.accounts || []).find((a) => a.id === p.fromAccountId);
          if (!fromAcct || fromAcct.locked) continue;
          const amt = round2(Math.abs(Number(p.amount || 0)));
          if (!Number.isFinite(amt) || amt <= 0 || Number(fromAcct.balance || 0) < amt) continue;
          if (p.toAccountId && (!u.accounts.some((a) => a.id === p.toAccountId && a.id !== fromAcct.id))) continue;

          const nowIso = new Date().toISOString();
          fromAcct.balance = round2(Number(fromAcct.balance || 0) - amt);
          fromAcct.transactions = [
            {
              id: uid(),
              date: nowIso,
              description: `Scheduled ${p.kind}: ${p.label}`,
              amount: -amt,
              category: p.kind === 'transfer' ? 'Transfer' : p.kind === 'bill' ? 'Bills' : 'Payment',
              status: 'posted',
            },
            ...(fromAcct.transactions || []),
          ];

          if (p.toAccountId) {
            const toAcct = (u.accounts || []).find((a) => a.id === p.toAccountId);
            if (toAcct) {
              const isDebt = ['credit-card', 'auto-loan', 'mortgage'].includes(toAcct.type);
              toAcct.balance = round2(Number(toAcct.balance || 0) + (isDebt ? -amt : amt));
              if (toAcct.type === 'credit-card') toAcct.statementBalance = round2(Math.max(0, toAcct.balance));
              toAcct.transactions = [
                {
                  id: uid(),
                  date: nowIso,
                  description: isDebt ? `Payment — ${p.label}` : `Scheduled transfer from ${fromAcct.name}`,
                  amount: isDebt ? -amt : amt,
                  category: isDebt ? 'Payment' : 'Transfer',
                  status: 'posted',
                },
                ...(toAcct.transactions || []),
              ];
            }
          }

          if (p.frequency === 'monthly') {
            const nextD = new Date(p.date || nowIso);
            const day = nextD.getUTCDate();
            nextD.setUTCDate(1);
            nextD.setUTCMonth(nextD.getUTCMonth() + 1);
            const lastDay = new Date(Date.UTC(nextD.getUTCFullYear(), nextD.getUTCMonth() + 1, 0)).getUTCDate();
            nextD.setUTCDate(Math.min(day, lastDay));
            p.date = nextD.toISOString();
          } else {
            p.status = 'paid';
          }
          processedCount += 1;
          totalAmount = round2(totalAmount + amt);
          executed.push({ username: u.username, label: p.label, amount: amt, kind: p.kind });
          userChanged = true;
        }
        if (userChanged) {
          updateUser(u);
          if (targetUserId && u.id === targetUserId) updatedTargetUser = publicUser(u);
        } else if (targetUserId && u.id === targetUserId) {
          updatedTargetUser = publicUser(u);
        }
      }

      recordAdminAudit('Executed scheduled simulator payments', {
        processedCount,
        totalAmount,
        asOfDate,
        forceAll,
        ...(targetUserId ? { userId: targetUserId } : {}),
      });

      return sendJson(res, 200, {
        ok: true,
        processedCount,
        totalAmount,
        executed,
        ...(updatedTargetUser ? { user: updatedTargetUser } : {}),
      });
    }

    if (pathname === '/api/admin/month-end-close' && method === 'POST') {
      const body = await readBody(req);
      const targetUserId = body.userId ? String(body.userId) : null;
      const candidates = targetUserId
        ? [findUserById(targetUserId)].filter(Boolean)
        : findAllUsers().filter((u) => u.status !== 'suspended');

      let interestCredited = 0;
      let statementsCut = 0;
      let accountsProcessed = 0;
      let pointsAwarded = 0;
      let updatedTargetUser = null;
      const nowIso = new Date().toISOString();

      for (const rawUser of candidates) {
        const u = JSON.parse(JSON.stringify(rawUser));
        let changed = false;
        for (const a of u.accounts || []) {
          const cycle = nowIso.slice(0, 7);
          if (a.lastSimulatorCloseCycle === cycle) continue;
          if (a.type === 'savings' || a.type === 'cd') {
            const bal = Number(a.balance || 0);
            if (bal > 0) {
              const ratePct = Number(a.apr) > 0 ? Number(a.apr) : a.type === 'cd' ? 4.25 : 2.15;
              const interest = round2(Math.max(0.01, bal * (ratePct / 100 / 12)));
              a.balance = round2(bal + interest);
              a.transactions = [
                {
                  id: uid(),
                  date: nowIso,
                  description: `Monthly Interest Payment (${ratePct.toFixed(2)}% APY)`,
                  amount: interest,
                  category: 'Income',
                  status: 'posted',
                },
                ...(a.transactions || []),
              ];
              interestCredited = round2(interestCredited + interest);
              a.lastSimulatorCloseCycle = cycle;
              accountsProcessed += 1;
              changed = true;
            }
          } else if (a.type === 'credit-card') {
            a.statementBalance = round2(Math.max(0, Number(a.balance || 0)));
            const earnedPts = Math.max(0, Math.round(Number(a.balance || 0)));
            if (earnedPts > 0) {
              a.rewardsPoints = Math.round(Number(a.rewardsPoints || 0) + Math.min(5000, Math.round(earnedPts * 0.2)));
              pointsAwarded += Math.min(5000, Math.round(earnedPts * 0.2));
            }
            a.lastSimulatorCloseCycle = cycle;
            statementsCut += 1;
            accountsProcessed += 1;
            changed = true;
          }
        }
        if (changed) updateUser(u);
        if (targetUserId && u.id === targetUserId) updatedTargetUser = publicUser(u);
      }

      recordAdminAudit('Executed month-end interest & statement close', {
        interestCredited,
        statementsCut,
        pointsAwarded,
        accountsProcessed,
        ...(targetUserId ? { userId: targetUserId } : {}),
      });

      return sendJson(res, 200, {
        ok: true,
        interestCredited,
        statementsCut,
        pointsAwarded,
        accountsProcessed,
        ...(updatedTargetUser ? { user: updatedTargetUser } : {}),
      });
    }

    if (pathname === '/api/admin/messages' && method === 'GET') {
      const threads = visibleUsers().map((u) => {
        const msgs = Array.isArray(u.messages) ? u.messages : [];
        const unreadForAdmin = msgs.filter((m) => m.sender === 'customer' && !m.readByAdmin).length;
        return {
          userId: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          status: u.status || 'active',
          unreadForAdmin,
          accountNotice: u.accountNotice || null,
          lastMessageAt: msgs[0]?.createdAt || u.createdAt,
          messages: msgs,
          supportStatus: u.supportStatus || 'open',
        };
      }).sort((a, b) => {
        if (b.unreadForAdmin !== a.unreadForAdmin) return b.unreadForAdmin - a.unreadForAdmin;
        return String(b.lastMessageAt).localeCompare(String(a.lastMessageAt));
      });
      return sendJson(res, 200, { threads });
    }

    const msgAdminRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(messages|messages\/read|notice|staff-notes|support-status|assign-admin)$/);
    if (msgAdminRoute) {
      const userId = decodeURIComponent(msgAdminRoute[1]);
      const sub = msgAdminRoute[2];
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      const updated = JSON.parse(JSON.stringify(target));
      if (!Array.isArray(updated.messages)) updated.messages = [];

      if (sub === 'staff-notes' && method === 'GET') {
        return sendJson(res, 200, { notes: Array.isArray(target.staffNotes) ? target.staffNotes : [] });
      }
      if (sub === 'staff-notes' && method === 'POST') {
        const body = await readBody(req);
        const text = cleanText(body.text, 2000);
        if (!text) return sendJson(res, 400, { error: 'Enter a note.' });
        const note = { id: uid(), text, author: auditActor, createdAt: new Date().toISOString() };
        updated.staffNotes = [note, ...(updated.staffNotes || [])].slice(0, 500);
        updateUser(updated);
        recordAdminAudit('Added private staff note', { userId });
        return sendJson(res, 201, { notes: updated.staffNotes });
      }
      if (sub === 'support-status' && method === 'PUT') {
        const body = await readBody(req);
        if (!['open', 'pending', 'resolved'].includes(body.status)) return sendJson(res, 400, { error: 'Invalid support status.' });
        updated.supportStatus = body.status;
        updateUser(updated);
        recordAdminAudit('Updated support status', { userId, status: body.status });
        return sendJson(res, 200, { status: body.status });
      }
      if (sub === 'assign-admin' && method === 'PUT') {
        if (!isSuperAdmin) return sendJson(res, 403, { error: 'Super administrator access required.' });
        const body = await readBody(req);
        if (body.adminId !== null && findAdminByLinkedUserId(target.id)) {
          return sendJson(res, 409, { error: 'A linked administrator’s own customer profile must stay assigned to the Super administrator.' });
        }
        const owner = body.adminId === null ? null : listAdminAccounts().find(a => a.id === body.adminId && a.status === 'active' && ['admin', 'auditor'].includes(a.role));
        if (body.adminId !== null && !owner) return sendJson(res, 400, { error: 'Select an active administrator or auditor.' });
        updated.ownerAdminId = owner?.id || null;
        updateUser(updated);
        recordAdminAudit('Reassigned customer', { userId, previousAdminId: target.ownerAdminId || null, adminId: updated.ownerAdminId, assignedRole: owner?.role || 'super-admin' });
        return sendJson(res, 200, { user: publicUser(updated) });
      }

      if (sub === 'messages' && method === 'POST') {
        const body = await readBody(req);
        const subject = cleanText(body.subject || 'Chase Client Operations Update', 120);
        const text = cleanText(body.body, 2000);
        const category = ['general', 'wire', 'dispute', 'security', 'account'].includes(body.category)
          ? body.category
          : 'general';
        if (!text) return sendJson(res, 400, { error: 'Enter a message body.' });
        updated.messages = updated.messages.map((m) => ({ ...m, readByAdmin: true }));
        const msg = {
          id: uid(),
          subject,
          category,
          sender: 'advisor',
          senderName: `${auditActor} · Chase Client Desk`,
          body: text,
          createdAt: new Date().toISOString(),
          readByCustomer: false,
          readByAdmin: true,
        };
        updated.messages.unshift(msg);
        updateUser(updated);
        recordAdminAudit('Sent secure message to customer', { userId, username: target.username, subject, category });
        return sendJson(res, 201, { user: publicUser(updated), message: msg });
      }

      if (sub === 'messages/read' && method === 'POST') {
        updated.messages = updated.messages.map((m) => ({ ...m, readByAdmin: true }));
        updateUser(updated);
        return sendJson(res, 200, { user: publicUser(updated) });
      }

      if (sub === 'notice' && method === 'PUT') {
        const body = await readBody(req);
        if (!body.notice) {
          updated.accountNotice = null;
          updateUser(updated);
          recordAdminAudit('Cleared custom customer dashboard banner', { userId, username: target.username });
          return sendJson(res, 200, { user: publicUser(updated) });
        }
        const n = body.notice;
        const tone = ['info', 'warning', 'urgent', 'success'].includes(n.tone) ? n.tone : 'info';
        const title = cleanText(n.title, 100);
        const message = cleanText(n.message, 500);
        if (!title || !message) return sendJson(res, 400, { error: 'Provide a banner title and message.' });
        updated.accountNotice = {
          id: uid(),
          tone,
          title,
          message,
          dismissible: n.dismissible !== false,
          createdAt: new Date().toISOString(),
        };
        updateUser(updated);
        recordAdminAudit('Published custom customer dashboard banner', { userId, username: target.username, tone, title });
        return sendJson(res, 200, { user: publicUser(updated) });
      }
    }

    if (pathname === '/api/admin/backup' && adminSession.role !== 'admin') return sendJson(res, 403, { error: 'Only admin-role accounts may export or restore backups.' });
    if (pathname === '/api/admin/backup' && method === 'GET') {
      const currentSettings = getSimulatorSettings();
      const users = findAllUsers();
      const adminAccounts = listAdminAccountsRaw();
      recordAdminAudit('Exported simulator backup', { usersCount: users.length, adminAccountsCount: adminAccounts.length });
      return sendJson(res, 200, {
        format: 'chase-simulator-backup-v1',
        backupVersion: 2,
        createdAt: new Date().toISOString(),
        users,
        adminAccounts,
        settings: {
          allowEnrollment: currentSettings.allowEnrollment,
          allowCustomerPasswordReset: currentSettings.allowCustomerPasswordReset,
          rootSupportContact: currentSettings.rootSupportContact,
        },
      });
    }
    if (pathname === '/api/admin/backup' && method === 'POST') {
      const body = await readBody(req, 20_000_000);
      if (body.confirmText !== 'RESTORE SIMULATOR BACKUP') return sendJson(res, 400, { error: 'Type RESTORE SIMULATOR BACKUP to confirm.' });
      if (body.format !== 'chase-simulator-backup-v1' || !Array.isArray(body.users) || body.users.length > 5000) return sendJson(res, 400, { error: 'Unsupported or invalid simulator backup file.' });

      const restoreAdmins = body.restoreAdmins === true && Array.isArray(body.adminAccounts);
      const seenUsers = new Set();
      const userIdSet = new Set();
      const userById = new Map();
      const validUsers = body.users.every((user) => {
        const username = String(user?.username || '').trim().toLowerCase();
        if (!user || typeof user.id !== 'string' || !user.id.trim() || userIdSet.has(user.id) || !/^[a-z0-9._-]{4,32}$/.test(username) || !Array.isArray(user.accounts) || typeof user.passwordHash !== 'string' || !user.passwordHash.includes(':') || seenUsers.has(username) || username === CHASE_ADMIN_USERNAME.toLowerCase()) return false;
        seenUsers.add(username);
        userIdSet.add(user.id);
        userById.set(user.id, user);
        return user.accounts.every((account) => account && typeof account.id === 'string' && ['checking', 'savings', 'credit-card', 'cd', 'auto-loan', 'mortgage'].includes(account.type) && Number.isFinite(Number(account.balance)) && Array.isArray(account.transactions || []));
      });
      if (!validUsers) return sendJson(res, 400, { error: 'Backup contains invalid, duplicate, or incomplete user records.' });

      let validatedAdmins = null;
      if (restoreAdmins) {
        if (body.adminAccounts.length > 500) return sendJson(res, 400, { error: 'Backup contains too many staff administrator accounts.' });
        const seenAdminIds = new Set();
        const seenAdminUsernames = new Set();
        const seenLinkedUserIds = new Set();
        const validAdmins = body.adminAccounts.every((admin) => {
          const uname = String(admin?.username || '').trim().toLowerCase();
          if (!admin || typeof admin.id !== 'string' || !admin.id.trim() || admin.id === '__root__' || seenAdminIds.has(admin.id)) return false;
          if (!/^[a-z0-9._-]{4,32}$/.test(uname) || uname === CHASE_ADMIN_USERNAME.toLowerCase() || seenAdminUsernames.has(uname)) return false;
          if (!['admin', 'auditor'].includes(admin.role) || !['active', 'disabled'].includes(admin.status)) return false;
          if (typeof admin.passwordHash !== 'string' || !admin.passwordHash.includes(':')) return false;
          if (admin.linkedUserId) {
            const linked = userById.get(admin.linkedUserId);
            if (!linked || seenLinkedUserIds.has(admin.linkedUserId) || linked.username.toLowerCase() !== uname) return false;
            seenLinkedUserIds.add(admin.linkedUserId);
          } else if (seenUsers.has(uname)) {
            return false;
          }
          seenAdminIds.add(admin.id);
          seenAdminUsernames.add(uname);
          return true;
        });
        if (!validAdmins) return sendJson(res, 400, { error: 'Backup contains invalid, conflicting, or broken staff administrator records.' });
        validatedAdmins = body.adminAccounts;
      } else {
        const currentAdmins = listAdminAccounts();
        if (currentAdmins.some(a => a.linkedUserId)) return sendJson(res, 409, { error: 'Remove linked administrator access before restoring a users-only backup, or enable restoring staff accounts from a full backup.' });
        const adminUsernameSet = new Set(currentAdmins.map(a => a.username.toLowerCase()));
        if (body.users.some(u => adminUsernameSet.has(String(u.username || '').trim().toLowerCase()))) {
          return sendJson(res, 409, { error: 'One or more restored customer usernames collide with existing staff administrator usernames.' });
        }
      }

      const activeAdminIds = new Set((validatedAdmins || listAdminAccounts()).map(a => a.id));
      const sanitizedUsers = body.users.map((u) => ({
        ...u,
        ownerAdminId: u.ownerAdminId && activeAdminIds.has(u.ownerAdminId) ? u.ownerAdminId : null,
      }));

      let safeSettings = null;
      if (body.settings && typeof body.settings.allowEnrollment === 'boolean' && typeof body.settings.allowCustomerPasswordReset === 'boolean') {
        const contact = body.settings.rootSupportContact ? validateSupportContact(body.settings.rootSupportContact) : null;
        safeSettings = {
          allowEnrollment: body.settings.allowEnrollment,
          allowCustomerPasswordReset: body.settings.allowCustomerPasswordReset,
          ...(contact ? { rootSupportContact: contact } : {}),
        };
      }

      restoreBackupAtomic({ users: sanitizedUsers, settings: safeSettings, adminAccounts: validatedAdmins });
      recordAdminAudit('Restored simulator backup', { usersRestored: sanitizedUsers.length, adminsRestored: validatedAdmins ? validatedAdmins.length : 0 });
      return sendJson(res, 200, { ok: true, usersRestored: sanitizedUsers.length, adminsRestored: validatedAdmins ? validatedAdmins.length : 0 });
    }

    if (pathname === '/api/admin/users/bulk' && method === 'POST') {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => typeof id === 'string'))] : [];
      if (!ids.length || ids.length > 100 || !['suspend', 'reactivate', 'delete'].includes(body.action)) return sendJson(res, 400, { error: 'Select between 1 and 100 users and a supported bulk action.' });
      if (body.action === 'delete' && body.confirmText !== 'DELETE SELECTED USERS') return sendJson(res, 400, { error: 'Type DELETE SELECTED USERS to confirm.' });
      const targets = ids.map(findUserById).filter(Boolean);
      if (targets.length !== ids.length) return sendJson(res, 404, { error: 'One or more selected users no longer exist.' });
      if (!isSuperAdmin && targets.some(u => u.ownerAdminId !== operator.id)) {
        return sendJson(res, 404, { error: 'One or more selected users were not found in your assigned scope.' });
      }
      if (body.action === 'delete' && targets.some(u => listAdminAccounts().some(a => a.linkedUserId === u.id))) return sendJson(res, 409, { error: 'Remove linked administrator access before deleting these customers.' });
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
      const phone = cleanText(body.phone || '', 40);
      const address = cleanText(body.address || '', 200);
      const password = String(body.password || '');
      if (!/^[a-zA-Z0-9._-]{4,32}$/.test(username)) return sendJson(res, 400, { error: 'Username must be 4–32 letters, numbers, periods, underscores, or hyphens.' });
      if (username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase()) return sendJson(res, 400, { error: 'That username is reserved for the administrator.' });
      if (password.length < 8) return sendJson(res, 400, { error: 'Temporary password must be at least 8 characters.' });
      if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Enter a full name and valid email address.' });
      if (findAdminByUsername(username) || findAllUsers().some((u) => u.username.toLowerCase() === username.toLowerCase())) return sendJson(res, 409, { error: 'That username is already in use.' });
      let ownerAdminId = isSuperAdmin ? null : operator.id;
      if (isSuperAdmin && body.ownerAdminId !== undefined && body.ownerAdminId !== null && body.ownerAdminId !== '') {
        const assigned = listAdminAccounts().find(a => a.id === String(body.ownerAdminId) && a.status === 'active' && ['admin', 'auditor'].includes(a.role));
        if (!assigned) return sendJson(res, 400, { error: 'Select an active administrator or auditor as owner.' });
        ownerAdminId = assigned.id;
      }
      const sampleUser = {
        id: uid(), username, fullName, email, phone, address, passwordHash: hashPassword(password),
        status: 'active', adminCreated: true, ownerAdminId,
        accounts: [], payees: [], scheduledPayments: [], disputes: [], messages: [],
        travelNotices: [], travelBookings: [], createdAt: new Date().toISOString(),
      };
      insertUser(sampleUser);
      recordAdminAudit('Created simulator user', { userId: sampleUser.id, username, ownerAdminId });
      return sendJson(res, 201, { user: publicUser(sampleUser) });
    }

    if (pathname === '/api/admin/reset' && method === 'POST') {
      const body = await readBody(req);
      if (body.confirmText !== 'RESET SIMULATOR') return sendJson(res, 400, { error: 'Type RESET SIMULATOR to confirm.' });
      if (listAdminAccounts().some(a => a.linkedUserId)) return sendJson(res, 409, { error: 'Remove linked administrator access before resetting customer data.' });
      resetUsers([]);
      recordAdminAudit('Reset simulator customer data');
      return sendJson(res, 200, { ok: true });
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
        const openedDate = normalizeOpenedDate(body.openedDate);
        if (openedDate === null) return sendJson(res, 400, { error: 'Provide a valid account opening date (YYYY-MM-DD).' });
        if (!allowed.has(type) || !name || !Number.isFinite(balance) || Math.abs(balance) > 100000000 || (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > 100000000))) {
          return sendJson(res, 400, { error: 'Provide a valid account type, name, balance, and optional credit limit.' });
        }
        const nowIso = new Date().toISOString();
        const routingNumber = body.routingNumber !== undefined ? cleanText(String(body.routingNumber), 34).replace(/\s/g, '') : '';
        const accountNumber = body.accountNumber !== undefined ? cleanText(String(body.accountNumber), 34).replace(/\s/g, '') : '';
        const accountDigits = accountNumber.replace(/\D/g, '');
        const account = {
          id: uid(), type, name, mask: accountDigits.length >= 4 ? accountDigits.slice(-4) : mask4(), balance: round2(balance),
          ...(creditLimit !== undefined ? { creditLimit: round2(creditLimit) } : {}),
          ...(openedDate ? { openedDate } : {}),
          ...(routingNumber ? { routingNumber } : {}),
          ...(accountNumber ? { accountNumber } : {}),
          locked: false, autopay: false, transactions: [], createdAt: nowIso,
        };
        const updated = { ...target, accounts: [...accounts, account] };
        updateUser(updated);
        recordAdminAudit('Created simulator account', {
          userId,
          username: target.username,
          accountId: account.id,
          accountName: account.name,
          accountMask: account.mask,
          type,
          balance: account.balance,
          ...(account.openedDate ? { openedDate: account.openedDate } : {}),
        }, {
          category: 'accounts',
          summary: `${auditActor} created ${account.name} (…${account.mask}) for ${target.fullName} (@${target.username}) with starting balance ${formatUsdSimple(account.balance)}.`,
          target: { type: 'account', id: account.id, label: `${account.name} (…${account.mask}) · ${target.fullName}` },
        });
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
        if (patch.nickname !== undefined) next.nickname = cleanText(patch.nickname, 60);
        if (patch.mask !== undefined && /^\d{4}$/.test(String(patch.mask))) next.mask = String(patch.mask);
        if (patch.routingNumber !== undefined) {
          const r = cleanText(String(patch.routingNumber), 34).replace(/\s/g, '');
          if (r) next.routingNumber = r;
        }
        if (patch.accountNumber !== undefined) {
          const a = cleanText(String(patch.accountNumber), 34).replace(/\s/g, '');
          if (a) {
            next.accountNumber = a;
            const digits = a.replace(/\D/g, '');
            if (digits.length >= 4 && patch.mask === undefined) next.mask = digits.slice(-4);
          }
        }
        if (patch.replacedAt !== undefined) next.replacedAt = String(patch.replacedAt);
        if (patch.openedDate !== undefined) {
          const normalized = normalizeOpenedDate(patch.openedDate);
          if (normalized === null) return sendJson(res, 400, { error: 'Provide a valid account opening date (YYYY-MM-DD).' });
          if (normalized === undefined) delete next.openedDate;
          else next.openedDate = normalized;
        }
        for (const field of ['balance', 'creditLimit', 'statementBalance', 'apr', 'monthlyPayment', 'rewardsPoints']) {
          if ((field === 'creditLimit' || field === 'statementBalance') && patch[field] === null) {
            delete next[field];
            continue;
          }
          if (patch[field] !== undefined) {
            const value = Number(patch[field]);
            if (!Number.isFinite(value) || Math.abs(value) > 100000000 || (!['balance', 'statementBalance'].includes(field) && value < 0)) return sendJson(res, 400, { error: `Invalid account ${field}.` });
            next[field] = field === 'rewardsPoints' ? Math.round(value) : round2(value);
          }
        }
        for (const field of ['locked', 'autopay', 'hidden', 'favorite', 'isPrimary']) if (patch[field] !== undefined) next[field] = !!patch[field];
        const updated = { ...target, accounts: accounts.map((account, i) => i === index ? next : account) };
        updateUser(updated);
        const balanceChanged = Number(existing.balance) !== Number(next.balance);
        recordAdminAudit('Updated simulator account', {
          userId,
          username: target.username,
          accountId,
          accountName: next.name,
          accountMask: next.mask,
          fields: Object.keys(patch),
          ...(balanceChanged ? { previousBalance: existing.balance, newBalance: next.balance } : {}),
        }, {
          category: balanceChanged ? 'money' : 'accounts',
          severity: balanceChanged ? 'high' : 'low',
          summary: balanceChanged
            ? `${auditActor} changed ${next.name} (…${next.mask}) balance for ${target.fullName} (@${target.username}) from ${formatUsdSimple(existing.balance)} to ${formatUsdSimple(next.balance)}.`
            : `${auditActor} updated ${next.name} (…${next.mask}) settings for ${target.fullName} (@${target.username}).`,
          target: { type: 'account', id: next.id, label: `${next.name} (…${next.mask}) · ${target.fullName}` },
        });
        return sendJson(res, 200, { user: publicUser(updated), account: next });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm account deletion.' });
        const removed = accounts[index];
        const updated = { ...target, accounts: accounts.filter((account) => account.id !== accountId) };
        updateUser(updated);
        recordAdminAudit('Deleted simulator account', {
          userId,
          username: target.username,
          accountId,
          accountName: removed?.name,
          accountMask: removed?.mask,
          previousBalance: removed?.balance,
        }, {
          category: 'accounts',
          outcome: 'warning',
          severity: 'high',
          summary: `${auditActor} deleted ${removed?.name || 'account'} (…${removed?.mask || '????'}) from ${target.fullName} (@${target.username}).`,
          target: { type: 'account', id: accountId, label: `${removed?.name || 'Account'} (…${removed?.mask || '????'}) · ${target.fullName}` },
        });
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
        const description = sanitizeCustomerDescription(transaction.description, '');
        const category = cleanText(transaction.category || 'Other', 48);
        if (!account || !description || !Number.isFinite(amount) || Math.abs(amount) > 10000000 || Number.isNaN(+date) || !['posted', 'pending'].includes(transaction.status || 'posted')) return sendJson(res, 400, { error: 'Choose an account and provide valid transaction details.' });
        const previousBalance = Number(account.balance || 0);
        const created = { id: uid(), date: date.toISOString(), description, amount: round2(amount), category, status: transaction.status || 'posted' };
        account.transactions.push(created);
        account.transactions = sortTransactionsDesc(account.transactions);
        account.balance = round2(previousBalance + created.amount);
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Created simulator ledger transaction', {
          userId,
          username: target.username,
          accountId: account.id,
          accountName: account.name,
          accountMask: account.mask,
          transactionId: created.id,
          description: created.description,
          category: created.category,
          amount: created.amount,
          previousBalance,
          newBalance: account.balance,
        }, {
          category: 'money',
          severity: Math.abs(created.amount) >= 10000 ? 'high' : 'medium',
          summary: `${auditActor} added ${formatUsdSimple(created.amount)} ("${created.description}") on ${account.name} (…${account.mask}) for ${target.fullName} — balance ${formatUsdSimple(previousBalance)} → ${formatUsdSimple(account.balance)}.`,
          target: { type: 'account', id: account.id, label: `${account.name} (…${account.mask}) · ${target.fullName}` },
        });
        return sendJson(res, 201, { user: publicUser(updated), transaction: { ...created, accountId: account.id, accountName: account.name, accountType: account.type } });
      }
      if (matches.length !== 1) return sendJson(res, matches.length ? 409 : 404, { error: matches.length ? 'Transaction ID is not unique.' : 'Simulator transaction not found.' });
      const { account, index } = matches[0];
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = body.transaction || {};
        const existing = account.transactions[index];
        const previousBalance = Number(account.balance || 0);
        const updatedTransaction = { ...existing };
        if (patch.description !== undefined) updatedTransaction.description = sanitizeCustomerDescription(patch.description, '');
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
        account.balance = round2(previousBalance + updatedTransaction.amount - Number(existing.amount || 0));
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        account.transactions[index] = updatedTransaction;
        account.transactions = sortTransactionsDesc(account.transactions);
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Updated simulator ledger transaction', {
          userId,
          username: target.username,
          accountId: account.id,
          accountName: account.name,
          accountMask: account.mask,
          transactionId,
          description: updatedTransaction.description,
          previousAmount: existing.amount,
          newAmount: updatedTransaction.amount,
          previousBalance,
          newBalance: account.balance,
        }, {
          category: 'money',
          severity: 'medium',
          summary: `${auditActor} edited "${updatedTransaction.description}" on ${account.name} (…${account.mask}) for ${target.fullName} (amount ${formatUsdSimple(existing.amount)} → ${formatUsdSimple(updatedTransaction.amount)}, balance ${formatUsdSimple(previousBalance)} → ${formatUsdSimple(account.balance)}).`,
          target: { type: 'account', id: account.id, label: `${account.name} (…${account.mask}) · ${target.fullName}` },
        });
        return sendJson(res, 200, { user: publicUser(updated), transaction: { ...updatedTransaction, accountId: account.id, accountName: account.name, accountType: account.type } });
      }
      if (method === 'DELETE') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm transaction deletion.' });
        const previousBalance = Number(account.balance || 0);
        const [deletedTransaction] = account.transactions.splice(index, 1);
        account.balance = round2(previousBalance - Number(deletedTransaction.amount || 0));
        if (account.type === 'credit-card') account.statementBalance = account.balance;
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Deleted simulator ledger transaction', {
          userId,
          username: target.username,
          accountId: account.id,
          accountName: account.name,
          accountMask: account.mask,
          transactionId,
          description: deletedTransaction.description,
          reversedAmount: deletedTransaction.amount,
          previousBalance,
          newBalance: account.balance,
        }, {
          category: 'money',
          outcome: 'warning',
          severity: 'high',
          summary: `${auditActor} deleted ${formatUsdSimple(deletedTransaction.amount)} ("${deletedTransaction.description}") from ${account.name} (…${account.mask}) for ${target.fullName} — balance automatically reversed from ${formatUsdSimple(previousBalance)} to ${formatUsdSimple(account.balance)}.`,
          target: { type: 'account', id: account.id, label: `${account.name} (…${account.mask}) · ${target.fullName}` },
        });
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
      const transferTypeKey = TRANSFER_TYPE_CONFIG[body.transferType] ? body.transferType : 'internal';
      const transferMeta = TRANSFER_TYPE_CONFIG[transferTypeKey];
      const accounts = JSON.parse(JSON.stringify(target.accounts || []));
      const to = accounts.find((account) => account.id === body.toAccountId);
      const date = new Date(body.date || Date.now());
      if (Number.isNaN(+date)) return sendJson(res, 400, { error: 'Choose a valid transfer date.' });
      if (!to || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return sendJson(res, 400, { error: 'Choose valid accounts and a positive transfer amount.' });
      }
      if (['auto-loan', 'mortgage'].includes(to.type) && amount > Number(to.balance || 0)) {
        return sendJson(res, 400, { error: 'Payment amount cannot exceed the loan principal balance.' });
      }

      const transferId = uid();
      const customNote = cleanText(body.description, 100);
      const customerFrom = accounts.find((account) => account.id === body.fromAccountId && DEPOSIT_TYPES.has(account.type));

      if (!isSuperAdmin && !customerFrom && operator?.linkedUserId && operator.linkedUserId !== target.id) {
        const linkedOwner = findUserById(operator.linkedUserId);
        if (!linkedOwner) return sendJson(res, 400, { error: 'Linked personal funding account is unavailable.' });
        const ownerCopy = JSON.parse(JSON.stringify(linkedOwner));
        const fundingAccount = (ownerCopy.accounts || []).find(
          (account) => account.type === 'checking' && (!body.fromAccountId || account.id === body.fromAccountId)
        );
        if (!fundingAccount) {
          return sendJson(res, 400, { error: 'You must have an active personal checking account to fund transfers.' });
        }
        if (Number(fundingAccount.balance || 0) < amount) {
          return sendJson(res, 400, { error: 'Your linked personal checking account has insufficient funds.' });
        }
        const debitLabel = sanitizeCustomerDescription(customNote || `${transferMeta.label} to ${target.fullName}`, `${transferMeta.label} to ${target.fullName}`);
        const creditLabel = sanitizeCustomerDescription(customNote || `${transferMeta.label} from ${linkedOwner.fullName}`, `${transferMeta.label} from ${linkedOwner.fullName}`);
        fundingAccount.balance = round2(Number(fundingAccount.balance || 0) - amount);
        fundingAccount.transactions = sortTransactionsDesc([
          { id: uid(), transferId, date: date.toISOString(), description: debitLabel, amount: -amount, category: transferMeta.fromCategory, status: 'posted' },
          ...(fundingAccount.transactions || []),
        ]);
        const paysDebt = ['credit-card', 'auto-loan', 'mortgage'].includes(to.type);
        if (paysDebt) {
          to.balance = round2(Number(to.balance || 0) - amount);
          to.transactions = sortTransactionsDesc([
            { id: uid(), transferId, date: date.toISOString(), description: creditLabel, amount: -amount, category: to.type === 'credit-card' ? 'Card payment' : 'Loan payment', status: 'posted' },
            ...(to.transactions || []),
          ]);
        } else {
          to.balance = round2(Number(to.balance || 0) + amount);
          to.transactions = sortTransactionsDesc([
            { id: uid(), transferId, date: date.toISOString(), description: creditLabel, amount, category: transferMeta.toCategory, status: 'posted' },
            ...(to.transactions || []),
          ]);
        }
        if (to.type === 'credit-card') to.statementBalance = to.balance;
        updateUser(ownerCopy);
        const updated = { ...target, accounts };
        updateUser(updated);
        recordAdminAudit('Completed funded transfer', { userId, username: target.username, fromOwnerId: linkedOwner.id, fromAccountId: fundingAccount.id, toAccountId: to.id, amount, transferType: transferTypeKey }, {
          category: 'money',
          outcome: 'success',
          severity: 'medium',
          summary: `${auditActor} sent ${formatUsdSimple(amount)} (${transferMeta.label}) from ${fundingAccount.name} (…${fundingAccount.mask}) to ${target.fullName}'s ${to.name} (…${to.mask}).`,
          target: { type: 'customer', id: target.id, label: `${target.fullName} (@${target.username})` },
        });
        return sendJson(res, 200, { user: publicUser(updated), transferId, amount, transferType: transferTypeKey });
      }

      if (!customerFrom || customerFrom.id === to.id) {
        return sendJson(res, 400, { error: 'Choose valid source/destination accounts and a positive transfer amount.' });
      }
      if (Number(customerFrom.balance || 0) < amount) {
        return sendJson(res, 400, { error: 'The source simulator account has insufficient balance.' });
      }
      const fromLabel = sanitizeCustomerDescription(customNote || `${transferMeta.label} to ${to.name}`, `${transferMeta.label} to ${to.name}`);
      const toLabel = sanitizeCustomerDescription(
        customNote || `${transferMeta.label} from ${customerFrom.name}`,
        `${transferMeta.label} from ${customerFrom.name}`
      );
      customerFrom.balance = round2(Number(customerFrom.balance || 0) - amount);
      customerFrom.transactions = sortTransactionsDesc([
        { id: uid(), transferId, date: date.toISOString(), description: fromLabel, amount: -amount, category: transferMeta.fromCategory, status: 'posted' },
        ...(customerFrom.transactions || []),
      ]);
      const paysDebt = ['credit-card', 'auto-loan', 'mortgage'].includes(to.type);
      if (paysDebt) {
        to.balance = round2(Number(to.balance || 0) - amount);
        to.transactions = sortTransactionsDesc([
          { id: uid(), transferId, date: date.toISOString(), description: toLabel, amount: -amount, category: to.type === 'credit-card' ? 'Card payment' : 'Loan payment', status: 'posted' },
          ...(to.transactions || []),
        ]);
      } else {
        to.balance = round2(Number(to.balance || 0) + amount);
        to.transactions = sortTransactionsDesc([
          { id: uid(), transferId, date: date.toISOString(), description: toLabel, amount, category: transferMeta.toCategory, status: 'posted' },
          ...(to.transactions || []),
        ]);
      }
      if (to.type === 'credit-card') to.statementBalance = to.balance;
      const updated = { ...target, accounts };
      updateUser(updated);
      recordAdminAudit('Completed simulated admin transfer', { userId, username: target.username, fromAccountId: customerFrom.id, toAccountId: to.id, amount, transferType: transferTypeKey }, {
        category: 'money',
        outcome: 'success',
        severity: 'medium',
        summary: `${auditActor} posted a ${formatUsdSimple(amount)} ${transferMeta.label} from ${customerFrom.name} (…${customerFrom.mask}) to ${to.name} (…${to.mask}) for ${target.fullName}.`,
        target: { type: 'customer', id: target.id, label: `${target.fullName} (@${target.username})` },
      });
      return sendJson(res, 200, { user: publicUser(updated), transferId, amount, transferType: transferTypeKey });
    }

    const sendFromCheckingRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/send-from-checking$/);
    if (sendFromCheckingRoute && method === 'POST') {
      if (isSuperAdmin || !operator?.linkedUserId) {
        return sendJson(res, 400, { error: 'This administrator account does not have a linked checking account.' });
      }
      const sender = findUserById(operator.linkedUserId);
      if (!sender || sender.status !== 'active') {
        return sendJson(res, 403, { error: 'Your linked customer profile is unavailable or suspended.' });
      }
      const userId = decodeURIComponent(sendFromCheckingRoute[1]);
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });
      if (target.id === sender.id) {
        return sendJson(res, 400, { error: 'Choose one of your assigned users rather than your own profile.' });
      }
      const body = await readBody(req);
      const amount = round2(Number(body.amount));
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return sendJson(res, 400, { error: 'Enter a valid positive transfer amount.' });
      }
      const senderAccounts = JSON.parse(JSON.stringify(sender.accounts || []));
      const fromAccount = senderAccounts.find((a) => a.id === body.fromAccountId && a.type === 'checking');
      if (!fromAccount) {
        return sendJson(res, 400, { error: 'Select one of your linked checking accounts.' });
      }
      if (fromAccount.locked) {
        return sendJson(res, 400, { error: 'Your linked checking account is locked.' });
      }
      if (Number(fromAccount.balance || 0) < amount) {
        return sendJson(res, 400, { error: 'Insufficient balance in your linked checking account.' });
      }
      const targetAccounts = JSON.parse(JSON.stringify(target.accounts || []));
      const toAccount = targetAccounts.find((a) => a.id === body.toAccountId && DEPOSIT_TYPES.has(a.type));
      if (!toAccount) {
        return sendJson(res, 400, { error: 'Select a valid deposit account for the recipient user.' });
      }
      if (toAccount.locked) {
        return sendJson(res, 400, { error: 'The recipient account is currently locked.' });
      }
      const date = new Date(body.date || Date.now());
      if (Number.isNaN(+date)) {
        return sendJson(res, 400, { error: 'Choose a valid transfer date.' });
      }
      const dateIso = date.toISOString();
      const transferTypeKey = TRANSFER_TYPE_CONFIG[body.transferType] ? body.transferType : 'internal';
      const transferMeta = TRANSFER_TYPE_CONFIG[transferTypeKey];
      const rawMemo = cleanText(body.memo || '', 100);
      const memo = rawMemo ? sanitizeCustomerDescription(rawMemo, '') : '';
      const transferId = uid();
      const prevFromBal = round2(Number(fromAccount.balance || 0));
      const prevToBal = round2(Number(toAccount.balance || 0));

      fromAccount.balance = round2(prevFromBal - amount);
      fromAccount.transactions = sortTransactionsDesc([
        {
          id: uid(),
          transferId,
          date: dateIso,
          description: memo
            ? `Transfer to ${target.fullName} (@${target.username}) — ${memo}`
            : `Transfer to ${target.fullName} (@${target.username})`,
          amount: -amount,
          category: transferMeta.fromCategory,
          status: 'posted',
        },
        ...(fromAccount.transactions || []),
      ]);

      toAccount.balance = round2(prevToBal + amount);
      toAccount.transactions = sortTransactionsDesc([
        {
          id: uid(),
          transferId,
          date: dateIso,
          description: memo
            ? `Transfer from ${sender.fullName} — ${memo}`
            : `Transfer from ${sender.fullName}`,
          amount,
          category: transferMeta.toCategory,
          status: 'posted',
        },
        ...(toAccount.transactions || []),
      ]);

      const senderUpdated = { ...sender, accounts: senderAccounts };
      const targetUpdated = { ...target, accounts: targetAccounts };
      updateUser(senderUpdated);
      updateUser(targetUpdated);
      recordAdminAudit('Sent funds from linked checking account to user', {
        fromUserId: sender.id,
        fromUsername: sender.username,
        fromAccountId: fromAccount.id,
        toUserId: target.id,
        toUsername: target.username,
        toAccountId: toAccount.id,
        amount,
        previousSenderBalance: prevFromBal,
        newSenderBalance: fromAccount.balance,
        previousRecipientBalance: prevToBal,
        newRecipientBalance: toAccount.balance,
        transferId,
      }, {
        category: 'money',
        outcome: 'success',
        severity: 'medium',
        summary: `${auditActor} sent ${formatUsdSimple(amount)} from linked checking ${fromAccount.name} (…${fromAccount.mask}) to ${target.fullName}'s ${toAccount.name} (…${toAccount.mask}).`,
        target: { type: 'customer', id: target.id, label: `${target.fullName} (@${target.username})` },
      });
      return sendJson(res, 200, {
        user: publicUser(targetUpdated),
        linkedCheckingAccounts: getLinkedCheckingAccounts(sender.id),
        transferId,
        amount,
      });
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

    const userRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/(impersonate|reset-password|generate-transactions|revoke-sessions|promote))?$/);
    if (userRoute) {
      const userId = decodeURIComponent(userRoute[1]);
      const action = userRoute[2] || '';
      const target = findUserById(userId);
      if (!target) return sendJson(res, 404, { error: 'Simulator user not found.' });

      if (action === 'promote' && method === 'POST') {
        if (!isSuperAdmin) return sendJson(res, 403, { error: 'Super administrator access required.' });
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Confirm promotion to administrator.' });
        if (target.status !== 'active') return sendJson(res, 400, { error: 'Only active customers can be promoted.' });
        const role = body.role !== undefined ? body.role : 'admin';
        if (!['admin', 'auditor'].includes(role)) return sendJson(res, 400, { error: 'Role must be admin or auditor.' });
        if (!/^[a-zA-Z0-9._-]{4,32}$/.test(target.username) || target.username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || findAdminByUsername(target.username) || listAdminAccounts().some(a => a.linkedUserId === target.id)) return sendJson(res, 409, { error: 'This customer cannot be promoted because the username or account is already in use.' });
        const admin = { id: uid(), username: target.username, fullName: target.fullName, role, status: 'active', linkedUserId: target.id, passwordHash: target.passwordHash, createdAt: new Date().toISOString() };
        promoteCustomerToAdmin(target.id, admin);
        recordAdminAudit('Promoted test customer to administrator', { userId: target.id, adminId: admin.id, username: target.username, role });
        const { passwordHash, ...safeAdmin } = admin;
        return sendJson(res, 201, { admin: { ...safeAdmin, permissions: normalizePermissions(safeAdmin.permissions), capabilities: normalizeCapabilities(safeAdmin.capabilities) } });
      }

      if (!action && method === 'GET') return sendJson(res, 200, { user: publicUser(target) });

      if (action === 'revoke-sessions' && method === 'POST') {
        const revokedLinkedAdmin = revokeAllSessionsForUserAndLinkedAdmin(target.id);
        recordAdminAudit('Revoked simulator user sessions', { userId: target.id, username: target.username, revokedLinkedAdmin });
        return sendJson(res, 200, { ok: true, revokedLinkedAdmin });
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
        const requestedAccountId = typeof body.accountId === 'string' && body.accountId.trim() ? body.accountId.trim() : 'all';
        const selectedAccounts = requestedAccountId === 'all'
          ? accounts
          : accounts.filter((a) => a.id === requestedAccountId);
        if (!selectedAccounts.length) {
          return sendJson(res, 404, { error: 'Selected simulator account not found.' });
        }
        const checkingAccounts = selectedAccounts.filter((a) => a.type === 'checking');
        const savingsAccounts = selectedAccounts.filter((a) => a.type === 'savings');
        const creditCards = selectedAccounts.filter((a) => a.type === 'credit-card');
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
        const isOpenOnDate = (account, date) => {
          const openIso = effectiveAccountOpenIso(account);
          return !openIso || String(openIso).slice(0, 10) <= date.toISOString().slice(0, 10);
        };
        const addTransaction = (account, description, amount, category, date) => {
          if (transactionCount === eventRowStartCount) eventsGenerated += 1;
          if (!Array.isArray(account.transactions)) account.transactions = [];
          const occurredAt = new Date(date);
          occurredAt.setUTCHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
          const openIso = effectiveAccountOpenIso(account);
          const opened = openIso ? new Date(openIso) : null;
          if (opened && !Number.isNaN(+opened) && occurredAt < opened) occurredAt.setTime(opened.getTime());
          account.transactions.push({
            id: uid(),
            date: occurredAt.toISOString(),
            description,
            amount: roundAmount(amount),
            category,
            status: 'posted',
            simulated: true,
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
            const eligibleCheckings = checkingAccounts.filter((a) => isOpenOnDate(a, date));
            const eligibleChecking = eligibleCheckings.length ? eligibleCheckings[eventIndex % eligibleCheckings.length] : null;
            const eligibleSavingsList = savingsAccounts.filter((a) => isOpenOnDate(a, date));
            const eligibleSavings = eligibleSavingsList.length ? eligibleSavingsList[eventIndex % eligibleSavingsList.length] : null;
            const eligibleCards = creditCards.filter((card) => isOpenOnDate(card, date) && Number(card.balance) < Number(card.creditLimit || 100000));
            const eligibleYieldAccount = selectedAccounts.find((account) => ['savings', 'cd'].includes(account.type) && isOpenOnDate(account, date));
            const eligibleLoan = selectedAccounts.find((account) => ['mortgage', 'auto-loan'].includes(account.type) && isOpenOnDate(account, date) && Number(account.balance || 0) > 0);

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
              const amount = Math.min(amountBetween(purchase.min, purchase.max), Math.max(0, Number(eligibleChecking.balance || 0) - 5));
              if (amount >= 1) {
                eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) - amount);
                addTransaction(eligibleChecking, `${purchase.merchant} · simulated debit`, -amount, purchase.category, date);
                continue;
              }
            }

            if (roll < 0.83 && eligibleChecking) {
              const amount = amountBetween(850, 3400);
              eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) + amount);
              addTransaction(eligibleChecking, 'Direct deposit · Northstar Payroll', amount, 'Income', date);
              continue;
            }

            if (roll < 0.93 && eligibleChecking && eligibleSavings && Number(eligibleChecking.balance || 0) > 100) {
              const amount = Math.min(amountBetween(50, 425), Number(eligibleChecking.balance || 0) - 25);
              eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) - amount);
              eligibleSavings.balance = roundAmount(Number(eligibleSavings.balance || 0) + amount);
              addTransaction(eligibleChecking, `Transfer to ${eligibleSavings.name} · simulated`, -amount, 'Transfer', date);
              addTransaction(eligibleSavings, `Transfer from ${eligibleChecking.name} · simulated`, amount, 'Transfer', date);
              continue;
            }

            if (eligibleChecking && eligibleCards.length) {
              const card = creditCards.filter((item) => isOpenOnDate(item, date) && Number(item.balance || 0) > 0)[0];
              if (card) {
                const amount = Math.min(amountBetween(35, 250), Number(card.balance), Number(eligibleChecking.balance || 0));
                if (amount >= 1) {
                  eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) - amount);
                  card.balance = roundAmount(Number(card.balance || 0) - amount);
                  addTransaction(eligibleChecking, `Payment to ${card.name} · simulated`, -amount, 'Credit card payment', date);
                  addTransaction(card, 'Payment received — thank you · simulated', -amount, 'Payment', date);
                  continue;
                }
              }
            }

            if (eligibleChecking && eligibleLoan && cadence === 'monthly' && date.getUTCDate() <= 5) {
              const due = Number(eligibleLoan.monthlyPayment || 250);
              const amount = Math.min(due, Number(eligibleLoan.balance || 0), Number(eligibleChecking.balance || 0));
              if (amount >= 1) {
                eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) - amount);
                eligibleLoan.balance = roundAmount(Number(eligibleLoan.balance || 0) - amount);
                addTransaction(eligibleChecking, `Payment to ${eligibleLoan.name} · simulated`, -amount, 'Loan payment', date);
                addTransaction(eligibleLoan, 'Monthly loan payment received · simulated', -amount, 'Loan payment', date);
                continue;
              }
            }

            if (eligibleChecking) {
              const amount = amountBetween(850, 3400);
              eligibleChecking.balance = roundAmount(Number(eligibleChecking.balance || 0) + amount);
              addTransaction(eligibleChecking, 'Direct deposit · Northstar Payroll', amount, 'Income', date);
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
          account.transactions = sortTransactionsDesc(account.transactions);
          if (account.type === 'credit-card') account.statementBalance = roundAmount(Number(account.balance || 0));
        }
        updateUser(updated);
        recordAdminAudit('Generated simulator transaction history', {
          userId: target.id, username: target.username, accountId: requestedAccountId, startDate: body.startDate, endDate: body.endDate,
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
        const hasLinkedAdmin = Boolean(findAdminByLinkedUserId(target.id));
        const minLen = hasLinkedAdmin ? 10 : 8;
        if (password.length < minLen) return sendJson(res, 400, { error: `Password must be at least ${minLen} characters${hasLinkedAdmin ? ' for a linked administrator account' : ''}.` });
        const updated = { ...target, passwordHash: hashPassword(password) };
        updateUser(updated);
        revokeAllSessionsForUserAndLinkedAdmin(target.id);
        recordAdminAudit('Reset simulator user password', { userId: target.id, username: target.username, linkedAdmin: hasLinkedAdmin });
        return sendJson(res, 200, { ok: true });
      }

      if (!action && method === 'PUT') {
        const body = await readBody(req);
        if (!body.user || typeof body.user !== 'object' || Array.isArray(body.user)) return sendJson(res, 400, { error: 'Provide a simulator user record.' });
        const patch = body.user;
        const username = cleanText(patch.username ?? target.username, 32);
        if (username !== target.username && listAdminAccounts().some(a => a.linkedUserId === target.id)) return sendJson(res, 400, { error: 'The username of a linked administrator cannot be changed.' });
        if (!username || username.toLowerCase() === CHASE_ADMIN_USERNAME.toLowerCase() || (username.toLowerCase() !== target.username.toLowerCase() && findAdminByUsername(username)) || findAllUsers().some((u) => u.id !== target.id && u.username.toLowerCase() === username.toLowerCase())) {
          return sendJson(res, 400, { error: 'Choose a unique username that is not reserved for the administrator.' });
        }
        const accounts = patch.accounts ?? target.accounts;
        if (!Array.isArray(accounts) || accounts.some((a) => !a || typeof a.id !== 'string' || !['checking', 'savings', 'credit-card', 'cd', 'auto-loan', 'mortgage'].includes(a.type) || !Number.isFinite(Number(a.balance)) || Math.abs(Number(a.balance)) > 100000000)) {
          return sendJson(res, 400, { error: 'Each account needs an ID, valid account type, and a finite simulated balance.' });
        }
        const status = patch.status ?? target.status ?? 'active';
        if (!['active', 'suspended'].includes(status)) return sendJson(res, 400, { error: 'Status must be active or suspended.' });
        const normalizedAccounts = [];
        for (const a of accounts) {
          const normalizedOpen = a.openedDate !== undefined ? normalizeOpenedDate(a.openedDate) : undefined;
          if (normalizedOpen === null) return sendJson(res, 400, { error: 'Each account opening date must be a valid YYYY-MM-DD date.' });
          const nextAcc = { ...a, balance: round2(Number(a.balance)), transactions: sortTransactionsDesc(a.transactions) };
          if (normalizedOpen) nextAcc.openedDate = normalizedOpen;
          else if (a.openedDate === '' || a.openedDate === null) delete nextAcc.openedDate;
          normalizedAccounts.push(nextAcc);
        }
        const updated = {
          ...target,
          ...patch,
          id: target.id,
          ownerAdminId: target.ownerAdminId || null,
          staffNotes: target.staffNotes || [],
          messages: target.messages || [],
          supportStatus: target.supportStatus || 'open',
          username,
          fullName: cleanText(patch.fullName ?? target.fullName, 80),
          email: cleanText(patch.email ?? target.email, 120),
          phone: cleanText(patch.phone ?? target.phone ?? '', 40),
          address: cleanText(patch.address ?? target.address ?? '', 200),
          status,
          accounts: normalizedAccounts,
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
        if (listAdminAccounts().some(a => a.linkedUserId === target.id)) return sendJson(res, 409, { error: 'Remove the linked administrator access before deleting this customer.' });
        const deleted = deleteUserById(target.id);
        if (!deleted) return sendJson(res, 404, { error: 'Simulator user not found.' });
        recordAdminAudit('Deleted simulator user', { userId: target.id, username: target.username });
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/logout' && method === 'POST') {
      for (const tok of requestSessionTokens(req, url, 'admin')) revokeSession(tok);
      recordAdminAudit('Admin sign-out');
      return sendJson(res, 200, { ok: true }, sessionCookieHeader(req, '', adminSession.role));
    }

    return sendJson(res, 404, { error: 'Admin endpoint not found.' });
  }

  /* ------------------------- Authenticated routes ------------------------- */
  const resolvedAuth = getAuthUserResolved(req, url);
  const user = resolvedAuth.user;
  if (!user) return sendJson(res, 401, { error: 'Not signed in' });
  const customerTarget = { type: 'customer', id: user.id, label: `${user.fullName} (@${user.username})` };
  const recordCustomerAudit = (action, opts = {}) =>
    recordAuditEvent({
      actor: user.username,
      actorType: 'customer',
      action,
      target: opts.target || customerTarget,
      ...opts,
      details: {
        userId: user.id,
        username: user.username,
        ...(resolvedAuth.sessionRole === 'impersonated' ? { viaImpersonation: true } : {}),
        ...(opts.details || {}),
      },
    });

  if (pathname === '/api/auth/me' && method === 'GET') {
    const linkedAdmin = resolvedAuth.sessionRole === 'impersonated' ? null : buildLinkedAdminSummary(user.id);
    return sendJson(res, 200, { user: publicUser(user), token: resolvedAuth.token, ...(linkedAdmin ? { linkedAdmin } : {}) });
  }

  if (pathname === '/api/auth/switch-to-admin' && method === 'POST') {
    if (resolvedAuth.sessionRole === 'impersonated') {
      recordCustomerAudit('Blocked switch to admin console', {
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'Switching into the administrator console is not allowed while inside an impersonated customer preview.',
        summary: `Blocked switch-to-admin attempt on ${user.fullName} (@${user.username}) from impersonated preview mode.`,
      });
      return sendJson(res, 403, { error: 'Cannot switch to administrator console from an impersonated customer preview.' });
    }
    const linked = findAdminByLinkedUserId(user.id);
    if (!linked) {
      recordCustomerAudit('Blocked switch to admin console', {
        category: 'security',
        outcome: 'blocked',
        severity: 'medium',
        reason: 'This customer account does not have linked administrator access.',
        summary: `Customer ${user.fullName} (@${user.username}) attempted to open the admin console without admin privileges.`,
      });
      return sendJson(res, 403, { error: 'This customer account does not have administrator access.' });
    }
    if (linked.status === 'disabled') {
      recordCustomerAudit('Blocked switch to admin console', {
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: linked.lockMessage || 'Linked administrator access is currently disabled by the Super Administrator.',
        summary: `Blocked ${user.fullName} (@${user.username}) from switching to the admin console because their admin access is disabled.`,
      });
      return sendJson(res, 403, { error: linked.lockMessage || 'This administrator account is disabled. Contact the super administrator.' });
    }
    if (linked.username.toLowerCase() !== user.username.toLowerCase() || linked.passwordHash !== user.passwordHash) {
      recordCustomerAudit('Blocked switch to admin console', {
        category: 'security',
        outcome: 'blocked',
        severity: 'high',
        reason: 'Linked customer and administrator credentials are out of sync.',
        summary: `Blocked ${user.fullName} (@${user.username}) from switching to the admin console due to out-of-sync credentials.`,
      });
      return sendJson(res, 403, { error: 'Linked administrator credentials are out of sync. Sign in again or contact the super administrator.' });
    }
    const token = createAdminToken(linked.username, linked.role);
    createSession(token, `admin:${linked.username}`, linked.role);
    auditAdmin('Switched from customer view to admin console', { userId: user.id, adminId: linked.id, username: linked.username, role: linked.role }, linked.username, {
      actorType: linked.role === 'auditor' ? 'auditor' : 'admin',
      category: 'auth',
      outcome: 'success',
      severity: 'low',
      summary: `${user.fullName} (@${linked.username}) switched from customer banking into the Admin Console.`,
    });
    return sendJson(res, 200, {
      token,
      admin: {
        username: linked.username,
        label: linked.fullName,
        role: linked.role,
        isSuperAdmin: false,
        permissions: normalizePermissions(linked.permissions),
        capabilities: normalizeCapabilities(linked.capabilities),
        linkedUserId: linked.linkedUserId,
      },
    }, sessionCookieHeader(req, token, linked.role));
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const body = await readBody(req);
    if (!verifyPassword(String(body.currentPassword || ''), user.passwordHash)) {
      recordCustomerAudit('Failed password change attempt', {
        category: 'auth',
        outcome: 'failed',
        severity: 'medium',
        reason: 'The current password entered was incorrect.',
        summary: `Customer ${user.fullName} (@${user.username}) tried to change their password, but entered the wrong current password.`,
      });
      return sendJson(res, 400, { error: 'Your current password is incorrect.' });
    }
    const linkedAdmin = findAdminByLinkedUserId(user.id);
    const minLen = linkedAdmin ? 10 : 8;
    if (String(body.newPassword || '').length < minLen) {
      recordCustomerAudit('Failed password change attempt', {
        category: 'auth',
        outcome: 'failed',
        severity: 'low',
        reason: `New password was shorter than the required ${minLen}-character minimum.`,
        summary: `Customer ${user.fullName} (@${user.username}) entered a new password that was too short.`,
      });
      return sendJson(res, 400, { error: `New password must be at least ${minLen} characters${linkedAdmin ? ' because this account has linked administrator access' : ''}.` });
    }
    const updatedUser = { ...user, passwordHash: hashPassword(String(body.newPassword)) };
    updateUser(updatedUser, { preserveToken: resolvedAuth.token });
    if (linkedAdmin) {
      auditAdmin('Linked customer changed shared password', { userId: user.id, adminId: linkedAdmin.id, username: user.username }, user.username, {
        actorType: linkedAdmin.role === 'auditor' ? 'auditor' : 'admin',
        category: 'auth',
        outcome: 'success',
        severity: 'high',
        summary: `${user.fullName} (@${user.username}) changed their shared customer & administrator password; other sessions were signed out.`,
        target: customerTarget,
      });
    } else {
      recordCustomerAudit('Customer changed password', {
        category: 'auth',
        outcome: 'success',
        severity: 'high',
        summary: `Customer ${user.fullName} (@${user.username}) changed their online banking password; other sessions were signed out.`,
      });
    }
    const linkedSummary = resolvedAuth.sessionRole === 'impersonated' ? null : buildLinkedAdminSummary(user.id);
    return sendJson(res, 200, { ok: true, user: publicUser(updatedUser), ...(linkedSummary ? { linkedAdmin: linkedSummary } : {}) });
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
    const createdAcct = buildAccount(product, deposit);
    updated.accounts.push(createdAcct);
    updateUser(updated);
    recordCustomerAudit('Customer opened new account', {
      category: 'accounts',
      outcome: 'success',
      severity: 'info',
      summary: `${user.fullName} (@${user.username}) opened a new ${createdAcct.name} (…${createdAcct.mask}) with ${formatUsdSimple(deposit)} opening deposit.`,
      target: { type: 'account', id: createdAcct.id, label: `${createdAcct.name} (…${createdAcct.mask}) · ${user.fullName}` },
      details: { accountId: createdAcct.id, accountName: createdAcct.name, accountMask: createdAcct.mask, product: product.name, openingDeposit: deposit },
    });
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
      recordCustomerAudit('Failed customer transfer', {
        category: 'money',
        outcome: 'failed',
        severity: 'medium',
        reason: `Insufficient funds in ${from.name} (…${from.mask}) — tried to send ${formatUsdSimple(amount)} with only ${formatUsdSimple(from.balance)} available.`,
        summary: `${user.fullName} (@${user.username}) tried to transfer ${formatUsdSimple(amount)} from ${from.name} (…${from.mask}) to ${to.name} (…${to.mask}), but did not have enough funds.`,
        details: { fromAccount: `${from.name} (…${from.mask})`, toAccount: `${to.name} (…${to.mask})`, amount, availableBalance: from.balance },
      });
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
    recordCustomerAudit('Customer completed internal transfer', {
      category: 'money',
      outcome: 'success',
      severity: amount >= 10000 ? 'high' : 'medium',
      summary: `${user.fullName} (@${user.username}) transferred ${formatUsdSimple(amount)} from ${from.name} (…${from.mask}) to ${to.name} (…${to.mask}).`,
      details: { fromAccount: `${from.name} (…${from.mask})`, toAccount: `${to.name} (…${to.mask})`, amount, memo: body.memo || '' },
    });
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
      recordCustomerAudit('Failed bill payment', {
        category: 'money',
        outcome: 'failed',
        severity: 'medium',
        reason: `Insufficient funds in ${from.name} (…${from.mask}) — tried to pay ${formatUsdSimple(amount)} with ${formatUsdSimple(from.balance)} available.`,
        summary: `${user.fullName} (@${user.username}) could not pay ${formatUsdSimple(amount)} to ${payee.name} due to insufficient funds.`,
        details: { payee: payee.name, fromAccount: `${from.name} (…${from.mask})`, amount, availableBalance: from.balance },
      });
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
    recordCustomerAudit('Customer paid bill', {
      category: 'money',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) paid ${formatUsdSimple(amount)} to ${payee.name} from ${from.name} (…${from.mask}).`,
      details: { payee: payee.name, fromAccount: `${from.name} (…${from.mask})`, amount },
    });
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/zelle' && method === 'POST') {
    const body = await readBody(req);
    const recipient = String(body.to || '').trim();
    if (!recipient) {
      return sendJson(res, 400, { error: 'Enter a recipient.' });
    }
    if (Number(body.amount) > 2500) {
      recordCustomerAudit('Blocked Zelle payment (limit exceeded)', {
        category: 'money',
        outcome: 'blocked',
        severity: 'medium',
        reason: `Requested Zelle payment of ${formatUsdSimple(body.amount)} exceeded the $2,500.00 per-payment limit.`,
        summary: `${user.fullName} (@${user.username}) tried to send ${formatUsdSimple(body.amount)} via Zelle to ${recipient}, which exceeded the $2,500 limit.`,
        details: { recipient, amount: Number(body.amount), limit: 2500 },
      });
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
      recordCustomerAudit('Failed Zelle payment', {
        category: 'money',
        outcome: 'failed',
        severity: 'medium',
        reason: `Insufficient funds in ${from.name} (…${from.mask}) — tried to send ${formatUsdSimple(amount)} with ${formatUsdSimple(from.balance)} available.`,
        summary: `${user.fullName} (@${user.username}) could not send ${formatUsdSimple(amount)} via Zelle to ${recipient} due to insufficient funds.`,
        details: { recipient, amount, fromAccount: `${from.name} (…${from.mask})`, availableBalance: from.balance },
      });
      return sendJson(res, 400, { error: 'Insufficient funds in your checking account.' });
    }
    from.balance = round2(from.balance - amount);
    from.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Zelle payment to ${recipient}${body.memo ? ` — ${body.memo}` : ''}`,
      amount: -amount,
      category: 'Zelle',
      status: 'posted',
    });
    updateUser(updated);
    recordCustomerAudit('Customer sent Zelle payment', {
      category: 'money',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) sent ${formatUsdSimple(amount)} via Zelle to ${recipient} from ${from.name} (…${from.mask}).`,
      details: { recipient, amount, fromAccount: `${from.name} (…${from.mask})`, memo: body.memo || '' },
    });
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
    recordCustomerAudit('Customer paid credit card', {
      category: 'money',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) paid ${formatUsdSimple(amount)} toward ${card.name} (…${card.mask}) from ${from.name} (…${from.mask}).`,
      details: { card: `${card.name} (…${card.mask})`, fromAccount: `${from.name} (…${from.mask})`, amount },
    });
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
    recordCustomerAudit('Customer deposited check (QuickDeposit)', {
      category: 'money',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) deposited check #${String(body.checkNumber || '1042').trim()} for ${formatUsdSimple(amount)} into ${acct.name} (…${acct.mask}).`,
      details: { account: `${acct.name} (…${acct.mask})`, checkNumber: String(body.checkNumber || '1042').trim(), amount },
    });
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  const checkDepositMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/check-deposit$/);
  if (checkDepositMatch && method === 'POST') {
    const accountId = decodeURIComponent(checkDepositMatch[1]);
    const body = await readBody(req);
    const amount = money(body.amount);
    const checkNumber = cleanText(body.checkNumber || '', 30);
    if (amount === null || amount <= 0) {
      return sendJson(res, 400, { error: 'Enter a valid check amount.' });
    }
    const updated = JSON.parse(JSON.stringify(user));
    const target = updated.accounts.find((a) => a.id === accountId && (a.type === 'checking' || a.type === 'savings'));
    if (!target) return sendJson(res, 404, { error: 'Deposit account not found.' });
    const tx = {
      id: `chk-${uid()}`,
      date: today(),
      description: checkNumber ? `Mobile Check Deposit #${checkNumber}` : 'Mobile Check Deposit',
      category: 'Deposit',
      amount: round2(amount),
      status: 'posted',
    };
    target.balance = round2(target.balance + tx.amount);
    target.transactions = [tx, ...(target.transactions || [])];
    updateUser(updated);
    recordCustomerAudit('Mobile check deposit', {
      category: 'money',
      outcome: 'success',
      severity: 'info',
      summary: `${user.fullName} (@${user.username}) deposited a ${formatUsdSimple(tx.amount)} check${checkNumber ? ` (#${checkNumber})` : ''} into ${target.name} (…${target.mask}).`,
      details: { accountId: target.id, accountName: target.name, amount: tx.amount, checkNumber: checkNumber || null },
    });
    return sendJson(res, 200, { user: sanitizeUser(updated), transaction: tx });
  }

  if (pathname === '/api/wires' && method === 'POST') {
    const body = await readBody(req);
    const amount = money(body.amount);
    const wireType = body.wireType === 'international' ? 'international' : 'domestic';
    const fee = wireType === 'international' ? 40 : 25;
    const recipient = cleanText(body.recipient, 80);
    const routingNumber = cleanText(body.routingNumber, 34).replace(/\s/g, '');
    const accountNumber = cleanText(body.accountNumber || '', 34).replace(/\s/g, '');
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
      recordCustomerAudit('Failed wire transfer', {
        category: 'money',
        outcome: 'failed',
        severity: 'high',
        reason: `Insufficient funds in ${from.name} (…${from.mask}) — needed ${formatUsdSimple(amount + fee)} (including $${fee} wire fee) with ${formatUsdSimple(from.balance)} available.`,
        summary: `${user.fullName} (@${user.username}) could not send a ${formatUsdSimple(amount)} ${wireType} wire to ${recipient} due to insufficient funds.`,
        details: { wireType, recipient, amount, fee, fromAccount: `${from.name} (…${from.mask})`, availableBalance: from.balance },
      });
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
    recordCustomerAudit('Customer sent wire transfer', {
      category: 'money',
      outcome: 'success',
      severity: 'high',
      summary: `${user.fullName} (@${user.username}) sent a ${formatUsdSimple(amount)} ${wireType} wire (+$${fee} fee) to ${recipient} from ${from.name} (…${from.mask}).`,
      details: { wireType, recipient, amount, fee, fromAccount: `${from.name} (…${from.mask})` },
    });
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
    const changesDesc = [
      typeof body.locked === 'boolean' ? (body.locked ? 'locked card' : 'unlocked card') : null,
      typeof body.autopay === 'boolean' ? (body.autopay ? 'enabled autopay' : 'disabled autopay') : null,
    ].filter(Boolean).join(' & ') || 'updated card controls';
    recordCustomerAudit('Customer updated card controls', {
      category: 'accounts',
      outcome: 'success',
      severity: typeof body.locked === 'boolean' ? 'medium' : 'info',
      summary: `${user.fullName} (@${user.username}) ${changesDesc} on ${acct.name} (…${acct.mask}).`,
      target: { type: 'account', id: acct.id, label: `${acct.name} (…${acct.mask}) · ${user.fullName}` },
      details: { accountId: acct.id, accountName: acct.name, accountMask: acct.mask, locked: acct.locked, autopay: acct.autopay },
    });
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/cards/reveal' && method === 'POST') {
    const body = await readBody(req);
    const card = user.accounts.find((a) => a.id === body.cardId && a.type === 'credit-card');
    if (!card) return sendJson(res, 404, { error: 'Card not found.' });
    if (!verifyPassword(String(body.password || ''), user.passwordHash)) {
      const attemptCount = recordFailure(req, `reveal:${user.id}`, 15 * 60 * 1000);
      recordCustomerAudit('Failed card detail reveal', {
        category: 'security',
        outcome: 'failed',
        severity: 'high',
        reason: `The account password entered to reveal ${card.name} (…${card.mask}) card number was incorrect (attempt ${attemptCount}).`,
        summary: `Customer ${user.fullName} (@${user.username}) failed password verification while trying to view card details for ${card.name} (…${card.mask}).`,
        target: { type: 'account', id: card.id, label: `${card.name} (…${card.mask}) · ${user.fullName}` },
        details: { accountId: card.id, accountName: card.name, accountMask: card.mask, attemptCount },
      });
      sendJson(res, 400, { error: 'That password is incorrect.' });
      return;
    }
    recordCustomerAudit('Customer revealed card details', {
      category: 'security',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) verified their password and viewed card details for ${card.name} (…${card.mask}).`,
      target: { type: 'account', id: card.id, label: `${card.name} (…${card.mask}) · ${user.fullName}` },
      details: { accountId: card.id, accountName: card.name, accountMask: card.mask },
    });
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
    const oldMask = card.mask;
    card.mask = mask4();
    card.locked = true;
    card.replacedAt = new Date().toISOString();
    card.replacementReason = body.reason;
    if (!Array.isArray(updated.disputes)) updated.disputes = [];
    updateUser(updated);
    recordCustomerAudit('Customer requested card replacement', {
      category: 'security',
      outcome: 'warning',
      severity: body.reason === 'stolen' ? 'high' : 'medium',
      reason: `Card reported as "${body.reason}" — old card …${oldMask} locked and replaced with …${card.mask}.`,
      summary: `${user.fullName} (@${user.username}) replaced ${card.name} (…${oldMask} → …${card.mask}) because it was ${body.reason}.`,
      target: { type: 'account', id: card.id, label: `${card.name} (…${card.mask}) · ${user.fullName}` },
      details: { accountId: card.id, oldMask, newMask: card.mask, replacementReason: body.reason },
    });
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
    recordCustomerAudit('Customer opened transaction dispute', {
      category: 'support',
      outcome: 'warning',
      severity: 'high',
      reason: body.reason,
      summary: `${user.fullName} (@${user.username}) disputed a ${formatUsdSimple(transaction.amount)} charge ("${transaction.description}") on ${account.name} (…${account.mask}).`,
      details: { accountName: account.name, accountMask: account.mask, merchant: transaction.description, amount: transaction.amount, disputeReason: body.reason },
    });
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
    recordCustomerAudit('Customer placed investment trade', {
      category: 'money',
      outcome: 'success',
      severity: total >= 10000 ? 'high' : 'medium',
      summary: `${user.fullName} (@${user.username}) ${side === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${quote.symbol} (${formatUsdSimple(total)}).`,
      details: { side, symbol: quote.symbol, shares, price: quote.price, total },
    });
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
    recordCustomerAudit('Customer signed out of all devices', {
      category: 'security',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) revoked all active sign-in sessions across all devices.`,
    });
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
    const changedFields = [];
    if (fullName !== user.fullName) changedFields.push('full name');
    if (email !== user.email) changedFields.push('email');
    if (phone !== user.phone) changedFields.push('phone');
    if (address !== user.address) changedFields.push('address');
    const updated = { ...user, fullName, email, phone, address };
    updateUser(updated);
    recordCustomerAudit('Customer updated profile', {
      category: 'customers',
      outcome: 'success',
      severity: changedFields.includes('email') || changedFields.includes('phone') ? 'medium' : 'info',
      summary: `${user.fullName} (@${user.username}) updated their contact profile (${changedFields.length ? changedFields.join(', ') : 'confirmed details'}).`,
      details: { changedFields, email, phone },
    });
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
    recordCustomerAudit('Customer updated security settings', {
      category: 'security',
      outcome: 'success',
      severity: 'medium',
      summary: `${user.fullName} (@${user.username}) updated their account security preferences (${Object.entries(patch).map(([k, v]) => `${k}: ${v ? 'On' : 'Off'}`).join(', ') || 'saved'}).`,
      details: patch,
    });
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/messages' && method === 'GET') {
    const owner = user.ownerAdminId
      ? listAdminAccounts().find(a => a.id === user.ownerAdminId && a.status === 'active')
      : null;
    const ownerContact = formatSupportContactOrNull(owner?.supportContact);
    const rootContact = formatSupportContactOrNull(getSimulatorSettings().rootSupportContact);
    return sendJson(res, 200, { messages: user.messages || [], supportContact: ownerContact || (!owner ? rootContact : null) });
  }

  if (pathname === '/api/messages' && method === 'POST') {
    const body = await readBody(req);
    const subject = cleanText(body.subject || 'Account Inquiry', 120);
    const text = cleanText(body.body, 2000);
    const category = ['general', 'wire', 'dispute', 'security', 'account'].includes(body.category)
      ? body.category
      : 'general';
    if (!text) return sendJson(res, 400, { error: 'Please enter a message before sending.' });
    const updated = JSON.parse(JSON.stringify(user));
    if (!Array.isArray(updated.messages)) updated.messages = [];
    updated.supportStatus = 'open';
    updated.messages.unshift({
      id: uid(),
      subject,
      category,
      sender: 'customer',
      senderName: updated.fullName,
      body: text,
      createdAt: new Date().toISOString(),
      readByCustomer: true,
      readByAdmin: false,
    });
    updateUser(updated);
    recordCustomerAudit('Customer sent secure message', {
      category: 'support',
      outcome: 'success',
      severity: category === 'security' || category === 'dispute' ? 'medium' : 'info',
      summary: `${user.fullName} (@${user.username}) sent a ${category} message: "${subject}".`,
      details: { subject, category },
    });
    return sendJson(res, 201, { user: publicUser(updated) });
  }

  if (pathname === '/api/messages/read' && method === 'POST') {
    const updated = JSON.parse(JSON.stringify(user));
    if (Array.isArray(updated.messages)) {
      updated.messages = updated.messages.map((m) => ({ ...m, readByCustomer: true }));
      updateUser(updated);
    }
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/notice/dismiss' && method === 'POST') {
    const updated = JSON.parse(JSON.stringify(user));
    if (updated.accountNotice && updated.accountNotice.dismissible !== false) {
      updated.accountNotice = null;
      updateUser(updated);
    }
    return sendJson(res, 200, { user: publicUser(updated) });
  }

  if (pathname === '/api/offers/toggle' && method === 'POST') {
    const body = await readBody(req);
    const offerId = String(body.offerId || '');
    const updated = JSON.parse(JSON.stringify(user));
    if (Array.isArray(updated.customOffers)) {
      updated.customOffers = updated.customOffers.map((o) =>
        o.id === offerId ? { ...o, activated: !o.activated } : o
      );
      updateUser(updated);
    }
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

// A single process shares one in-memory snapshot; serialize complete API requests.
let apiQueue = Promise.resolve();
async function dispatchApi(req, res, url) {
  const previous = apiQueue;
  let release;
  apiQueue = new Promise(resolve => { release = resolve; });
  await previous;
  const originalWriteHead = res.writeHead.bind(res);
  const originalEnd = res.end.bind(res);
  let headArgs;
  let endArgs;
  res.writeHead = (...args) => { headArgs = args; return res; };
  res.end = (...args) => { endArgs = args; return res; };
  try {
    await handleApi(req, res, url);
    await flushRemoteSave();
    res.writeHead = originalWriteHead;
    res.end = originalEnd;
    if (headArgs) originalWriteHead(...headArgs);
    originalEnd(...(endArgs || []));
  } catch (error) {
    console.error('API request failed:', error.message);
    res.writeHead = originalWriteHead;
    res.end = originalEnd;
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    else originalEnd();
  } finally {
    currentRequestMeta = null;
    release();
  }
}

export async function handleVercelRequest(req, res) {
  return dispatchApi(req, res, new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`));
}

export async function handleCloudflareRequest(request, env) {
  process.env.CLOUDFLARE_WORKERS = '1';
  syncRuntimeEnv(env);
  const url = new URL(request.url);
  const headersObj = {};
  for (const [k, v] of request.headers.entries()) {
    headersObj[k.toLowerCase()] = v;
  }
  if (!headersObj['x-forwarded-proto']) {
    headersObj['x-forwarded-proto'] = url.protocol.replace(/:$/, '');
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const rawBody = hasBody ? await request.text() : '';
  const reqShim = {
    method: request.method.toUpperCase(),
    url: `${url.pathname}${url.search}`,
    headers: headersObj,
    socket: { encrypted: url.protocol === 'https:', remoteAddress: headersObj['cf-connecting-ip'] || '' },
    body: hasBody ? rawBody : undefined,
  };
  let statusCode = 200;
  const responseHeaders = new Headers();
  const chunks = [];
  const resShim = {
    headersSent: false,
    writeHead(status, hdrs = {}) {
      statusCode = status;
      this.headersSent = true;
      for (const [key, val] of Object.entries(hdrs)) {
        if (val === undefined || val === null) continue;
        if (Array.isArray(val)) {
          for (const item of val) responseHeaders.append(key, String(item));
        } else {
          responseHeaders.set(key, String(val));
        }
      }
      return this;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      }
      return this;
    },
  };
  await dispatchApi(reqShim, resShim, url);
  return new Response(chunks.join(''), { status: statusCode, headers: responseHeaders });
}

const HOST = process.env.HOST || '0.0.0.0';
if (process.env.VERCEL !== '1' && process.env.CLOUDFLARE_WORKERS !== '1' && !IS_CLOUDFLARE_WORKERS) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return dispatchApi(req, res, url);
    serveStatic(req, res, url);
  });
  server.listen(PORT, HOST, () => {
    console.log(`Chase banking app server running at http://${HOST}:${PORT}`);
    console.log(`API health: http://${HOST}:${PORT}/api/health`);
  });
}
