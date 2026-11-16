/* -------------------------------------------------------------------------- */
/* Chase Clone — JSON file database (users, sessions, admins & audit log)     */
/* Swap this module for SQLite/Postgres in production; the API stays the same. */
/* -------------------------------------------------------------------------- */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = process.env.VERCEL === '1' ? '/tmp' : path.join(__dirname, 'data');
const DB_FILE = process.env.CHASE_DB_PATH || path.join(DEFAULT_DATA_DIR, 'db.json');
const DATA_DIR = path.dirname(DB_FILE);

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_ROW_ID = process.env.CHASE_SUPABASE_ROW_ID || 'primary';

export function isSupabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && !process.env.CHASE_DB_PATH);
}

let cache = null;
let cacheMtimeMs = -1;
let remoteHydratedAt = 0;
let remoteVersion = null;
let remoteDirty = false;

function sanitizeLoadedDb(parsed) {
  const next = parsed && typeof parsed === 'object' ? parsed : {};
  if (!Array.isArray(next.users)) next.users = [];
  if (!next.sessions || typeof next.sessions !== 'object') next.sessions = {};
  if (!Array.isArray(next.revokedSessions)) next.revokedSessions = [];
  if (!Array.isArray(next.auditLog)) {
    next.auditLog = Array.isArray(next.audit) ? next.audit.map(normalizeAuditEntry) : [];
  } else {
    next.auditLog = next.auditLog.map(normalizeAuditEntry);
  }
  if (!next.simulatorSettings || typeof next.simulatorSettings !== 'object') next.simulatorSettings = {};
  if (!Array.isArray(next.adminAccounts)) next.adminAccounts = [];
  for (const u of next.users) {
    if (u.status === 'frozen') u.status = 'suspended';
    if (!u.status) u.status = 'active';
    if (u.username === 'chase' && u.role === 'admin') {
      delete u.role;
    }
  }
  return next;
}

function diskMtimeMs() {
  try {
    return fs.statSync(DB_FILE).mtimeMs;
  } catch {
    return -1;
  }
}

function normalizeAuditEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') {
    return {
      id: `audit-${index}`,
      actor: 'Chase administrator',
      action: 'System event',
      details: {},
      createdAt: new Date().toISOString(),
    };
  }
  const actor = entry.actor || entry.actorName || 'Chase administrator';
  const action = entry.action || 'Admin event';
  const createdAt = entry.createdAt || entry.at || new Date().toISOString();
  let details = entry.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    details = {};
    if (entry.target) details.target = entry.target;
    if (entry.detail) details.note = entry.detail;
  }
  return {
    id: entry.id || `audit-${index}-${Date.now()}`,
    actor,
    action,
    details,
    createdAt,
  };
}

function load() {
  if (isSupabaseEnabled() && cache) return cache;
  const currentMtime = diskMtimeMs();
  if (cache && currentMtime === cacheMtimeMs) return cache;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cache = sanitizeLoadedDb(JSON.parse(raw));
    cacheMtimeMs = currentMtime;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      try {
        fs.renameSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}.json`);
      } catch {
        /* File may already be gone. */
      }
      console.error('Database file was corrupt; a backup copy was preserved.');
    }
    cache = sanitizeLoadedDb({});
    cacheMtimeMs = -1;
  }
  return cache;
}

function save() {
  if (isSupabaseEnabled()) {
    remoteDirty = true;
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2));
  fs.renameSync(tempFile, DB_FILE);
  cacheMtimeMs = diskMtimeMs();
}

const remoteHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

export async function ensureDbReady() {
  if (!isSupabaseEnabled()) { load(); return; }
  // Every request starts from a fresh remote snapshot, never a stale /tmp fallback.
  remoteDirty = false;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/chase_simulator_state?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=state,updated_at`, { headers: remoteHeaders() });
  } catch (cause) { throw Object.assign(new Error('Database connection unavailable'), { status: 503, cause }); }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const code = typeof detail.code === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(detail.code) ? `, code ${detail.code}` : '';
    throw Object.assign(new Error(`Database returned HTTP ${res.status}${code}`), { status: 503 });
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length > 1) throw Object.assign(new Error('Invalid database response'), { status: 503 });
  cache = sanitizeLoadedDb(rows[0]?.state || {});
  remoteVersion = rows[0]?.updated_at || null;
  remoteHydratedAt = Date.now();
}

export async function flushRemoteSave() {
  if (!isSupabaseEnabled() || !remoteDirty) return;
  // Compare-and-swap rejects concurrent writes from different serverless instances.
  const updatedAt = new Date(Math.max(Date.now(), remoteVersion ? Date.parse(remoteVersion) + 1 : 0)).toISOString();
  const endpoint = `${SUPABASE_URL}/rest/v1/chase_simulator_state`;
  const query = remoteVersion ? `?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&updated_at=eq.${encodeURIComponent(remoteVersion)}` : '';
  let res;
  try {
    res = await fetch(endpoint + query, {
      method: remoteVersion ? 'PATCH' : 'POST',
      headers: { ...remoteHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(remoteVersion ? { state: cache, updated_at: updatedAt } : { id: SUPABASE_ROW_ID, state: cache, updated_at: updatedAt }),
    });
  } catch (cause) { cache = null; remoteDirty = false; throw Object.assign(new Error('Database save failed'), { status: 503, cause }); }
  if (!res.ok) {
    cache = null; remoteDirty = false;
    throw Object.assign(new Error(res.status === 409 ? 'Data changed concurrently; retry the request.' : 'Database save failed'), { status: res.status === 409 ? 409 : 503 });
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    cache = null; remoteDirty = false;
    throw Object.assign(new Error('Data changed concurrently; retry the request.'), { status: 409 });
  }
  remoteVersion = rows[0].updated_at;
  remoteDirty = false;
  remoteHydratedAt = Date.now();
}

export function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return load().users.find((u) => u.username.toLowerCase() === needle) || null;
}

export function findUserById(id) {
  return load().users.find((u) => u.id === id) || null;
}

export function findAllUsers() {
  return load().users;
}

export function deleteUserById(id) {
  const db = load();
  const before = db.users.length;
  db.users = db.users.filter((user) => user.id !== id);
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === id) delete db.sessions[token];
  }
  if (db.users.length !== before) save();
  return db.users.length !== before;
}

export function resetUsers(users) {
  const db = load();
  db.users = users;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.role !== 'admin' && session.role !== 'auditor') delete db.sessions[token];
  }
  save();
}

export function appendAudit(entry) {
  const db = load();
  db.auditLog.unshift(normalizeAuditEntry(entry));
  db.auditLog = db.auditLog.slice(0, 5000);
  save();
}

export function getAuditLog(limit = 100) {
  return load().auditLog.slice(0, limit);
}

const DEFAULT_SIMULATOR_SETTINGS = { allowEnrollment: true, allowCustomerPasswordReset: true };

export function getSimulatorSettings() {
  const stored = load().simulatorSettings || {};
  return { ...DEFAULT_SIMULATOR_SETTINGS, ...stored };
}

export function updateSimulatorSettings(patch) {
  const db = load();
  db.simulatorSettings = { ...DEFAULT_SIMULATOR_SETTINGS, ...(db.simulatorSettings || {}), ...patch };
  save();
  return db.simulatorSettings;
}

export function findAdminByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return (load().adminAccounts || []).find((admin) => admin.username.toLowerCase() === needle) || null;
}

export function listAdminAccounts() {
  return (load().adminAccounts || []).map(({ passwordHash, ...admin }) => admin);
}

export function insertAdminAccount(admin) {
  const db = load();
  db.adminAccounts.push(admin);
  save();
  return admin;
}

export function updateAdminAccount(id, patch) {
  const db = load();
  const index = db.adminAccounts.findIndex((admin) => admin.id === id);
  if (index < 0) return null;
  const oldUsername = db.adminAccounts[index].username;
  if (patch.passwordHash || patch.role || patch.status || patch.username) patch.sessionVersion = (db.adminAccounts[index].sessionVersion || 0) + 1;
  db.adminAccounts[index] = { ...db.adminAccounts[index], ...patch };
  if (patch.passwordHash || patch.role || patch.status || patch.username) {
    const sessionUserId = `admin:${oldUsername}`;
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === sessionUserId) delete db.sessions[token];
    }
  }
  save();
  const { passwordHash, ...publicAdmin } = db.adminAccounts[index];
  return publicAdmin;
}

export function deleteAdminAccount(id) {
  const db = load();
  const before = db.adminAccounts.length;
  const removed = db.adminAccounts.find((admin) => admin.id === id);
  db.adminAccounts = db.adminAccounts.filter((admin) => admin.id !== id);
  if (db.adminAccounts.length !== before) {
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === `admin:${removed.username}`) delete db.sessions[token];
    }
    save();
  }
  return db.adminAccounts.length !== before;
}

export function countUsers() {
  return load().users.length;
}

export function insertUser(user) {
  load().users.push(user);
  save();
}

export function updateUser(user) {
  const db = load();
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    db.users[idx] = user;
    save();
  }
}

export function createSession(token, userId, role = 'user') {
  load().sessions[token] = { userId, role, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  save();
}

export function getSession(token) {
  const db = load();
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete db.sessions[token];
    save();
    return null;
  }
  return session;
}

export function deleteSession(token) {
  const db = load();
  if (db.sessions[token]) {
    delete db.sessions[token];
    save();
  }
}

export function revokeSession(token) {
  if (!token) return;
  const db = load();
  const digest = crypto.createHash('sha256').update(String(token)).digest('hex');
  let changed = false;
  if (!db.revokedSessions.includes(digest)) {
    db.revokedSessions.push(digest);
    db.revokedSessions = db.revokedSessions.slice(-5000);
    changed = true;
  }
  if (db.sessions[token]) {
    delete db.sessions[token];
    changed = true;
  }
  if (changed) save();
}

export function isSessionRevoked(token) {
  if (!token) return false;
  const digest = crypto.createHash('sha256').update(String(token)).digest('hex');
  return load().revokedSessions.includes(digest);
}

export function deleteSessionsForUser(userId) {
  const db = load();
  let changed = false;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === userId) {
      delete db.sessions[token];
      changed = true;
    }
  }
  if (changed) save();
}

export function getDbStats() {
  const db = load();
  const now = Date.now();
  let activeCustomerSessions = 0;
  let activeAdminSessions = 0;
  for (const s of Object.values(db.sessions)) {
    if (!s || s.expiresAt < now) continue;
    if (s.role === 'admin' || s.role === 'auditor') activeAdminSessions += 1;
    else activeCustomerSessions += 1;
  }
  let dbSizeBytes = 0;
  let dbMtimeMs = Date.now();
  try {
    const st = fs.statSync(DB_FILE);
    dbSizeBytes = st.size;
    dbMtimeMs = st.mtimeMs;
  } catch {
    dbSizeBytes = Buffer.byteLength(JSON.stringify(db), 'utf8');
  }
  return {
    storageBackend: isSupabaseEnabled() ? 'supabase-postgres' : 'local-json',
    activeCustomerSessions,
    activeUserSessions: activeCustomerSessions,
    activeAdminSessions,
    revokedSessionCount: db.revokedSessions.length,
    auditCount: db.auditLog.length,
    dbSizeBytes,
    db: {
      path: isSupabaseEnabled() ? `supabase://chase_simulator_state/${SUPABASE_ROW_ID}` : DB_FILE,
      sizeBytes: dbSizeBytes,
      mtimeMs: dbMtimeMs,
    },
  };
}
