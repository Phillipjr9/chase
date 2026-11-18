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
  const