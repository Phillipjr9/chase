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
  const latestChained = next.auditLog.find((e) => typeof e.seq === 'number' && typeof e.entryHash === 'string');
  if (!next.auditMeta || typeof next.auditMeta !== 'object') {
    next.auditMeta = {
      lastSeq: latestChained ? latestChained.seq : 0,
      lastHash: latestChained ? latestChained.entryHash : null,
      chainStartedAt: latestChained ? latestChained.createdAt : null,
    };
  } else {
    const storedSeq = Number(next.auditMeta.lastSeq || 0);
    if (latestChained && latestChained.seq > storedSeq) {
      next.auditMeta.lastSeq = latestChained.seq;
      next.auditMeta.lastHash = latestChained.entryHash;
    }
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

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function computeAuditHash(entry) {
  const payload = {
    id: entry.id,
    seq: entry.seq,
    createdAt: entry.createdAt,
    actor: entry.actor,
    actorType: entry.actorType ?? null,
    action: entry.action,
    summary: entry.summary ?? null,
    reason: entry.reason ?? null,
    category: entry.category ?? null,
    outcome: entry.outcome ?? null,
    severity: entry.severity ?? null,
    target: entry.target ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    path: entry.path ?? null,
    method: entry.method ?? null,
    details: entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details) ? entry.details : {},
    prevHash: entry.prevHash ?? null,
  };
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
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
    if (entry.target && typeof entry.target !== 'object') details.target = entry.target;
    if (entry.detail) details.note = entry.detail;
  }
  const out = {
    id: entry.id || `audit-${index}-${Date.now()}`,
    actor,
    action,
    details,
    createdAt,
  };
  if (typeof entry.seq === 'number') out.seq = entry.seq;
  if (entry.actorType != null) out.actorType = entry.actorType;
  if (entry.summary != null) out.summary = entry.summary;
  if (entry.reason != null) out.reason = entry.reason;
  if (entry.category != null) out.category = entry.category;
  if (entry.outcome != null) out.outcome = entry.outcome;
  if (entry.severity != null) out.severity = entry.severity;
  if (entry.target && typeof entry.target === 'object') out.target = entry.target;
  if (entry.ip != null) out.ip = entry.ip;
  if (entry.userAgent != null) out.userAgent = entry.userAgent;
  if (entry.path != null) out.path = entry.path;
  if (entry.method != null) out.method = entry.method;
  if (entry.prevHash != null) out.prevHash = entry.prevHash;
  if (entry.entryHash != null) out.entryHash = entry.entryHash;
  return out;
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
  const base = normalizeAuditEntry(entry);
  const latestChained = db.auditLog.find((e) => typeof e.seq === 'number' && typeof e.entryHash === 'string');
  const prevSeq = Math.max(Number(db.auditMeta?.lastSeq || 0), latestChained ? latestChained.seq : 0);
  const prevHash = (latestChained && latestChained.seq >= Number(db.auditMeta?.lastSeq || 0))
    ? latestChained.entryHash
    : (db.auditMeta?.lastHash || 'GENESIS');
  const seq = prevSeq + 1;
  // Clone details through JSON to guarantee clean plain JSON values before hashing.
  let cleanDetails = {};
  try {
    cleanDetails = JSON.parse(JSON.stringify(base.details || {}));
  } catch {
    cleanDetails = {};
  }
  const chained = {
    ...base,
    details: cleanDetails,
    seq,
    prevHash,
  };
  chained.entryHash = computeAuditHash(chained);
  db.auditMeta = {
    lastSeq: seq,
    lastHash: chained.entryHash,
    chainStartedAt: db.auditMeta?.chainStartedAt || chained.createdAt,
  };
  db.auditLog.unshift(chained);
  db.auditLog = db.auditLog.slice(0, 5000);
  save();
  return chained;
}

export function getAuditLog(limit = 100) {
  return load().auditLog.slice(0, limit);
}

export function verifyAuditIntegrity(entries = null) {
  const db = load();
  const list = Array.isArray(entries) ? entries : db.auditLog;
  const chained = list
    .filter((e) => typeof e?.seq === 'number' && typeof e?.entryHash === 'string')
    .sort((a, b) => a.seq - b.seq);
  const legacyCount = list.length - chained.length;
  const tamperedIds = [];

  for (let i = 0; i < chained.length; i += 1) {
    const curr = chained[i];
    const expectedHash = computeAuditHash(curr);
    if (curr.entryHash !== expectedHash) {
      tamperedIds.push(curr.id);
      continue;
    }
    if (i === 0) {
      if (curr.seq === 1 && curr.prevHash !== 'GENESIS') {
        tamperedIds.push(curr.id);
      }
    } else {
      const prev = chained[i - 1];
      if (curr.seq !== prev.seq + 1 || curr.prevHash !== prev.entryHash) {
        tamperedIds.push(curr.id);
      }
    }
  }

  const latest = chained.length ? chained[chained.length - 1] : null;
  const status = tamperedIds.length > 0
    ? 'tampered'
    : chained.length > 0
      ? 'verified'
      : 'legacy_only';
  return {
    valid: tamperedIds.length === 0,
    status,
    totalEntries: list.length,
    chainedCount: chained.length,
    legacyCount,
    tamperedIds,
    lastSeq: latest ? latest.seq : Number(db.auditMeta?.lastSeq || 0),
    lastHash: latest ? latest.entryHash : (db.auditMeta?.lastHash || null),
    chainStartedAt: db.auditMeta?.chainStartedAt || (chained[0]?.createdAt || null),
  };
}

const DEFAULT_SIMULATOR_SETTINGS = {
  allowEnrollment: true,
  allowCustomerPasswordReset: true,
  rootSupportContact: { email: '', phone: '' },
  superAdminSessionVersion: 0,
};

export function getSimulatorSettings() {
  const stored = load().simulatorSettings || {};
  return {
    ...DEFAULT_SIMULATOR_SETTINGS,
    ...stored,
    rootSupportContact: {
      email: stored.rootSupportContact?.email || '',
      phone: stored.rootSupportContact?.phone || '',
    },
    superAdminSessionVersion: Number(stored.superAdminSessionVersion || 0),
  };
}

export function updateSimulatorSettings(patch) {
  const db = load();
  db.simulatorSettings = { ...DEFAULT_SIMULATOR_SETTINGS, ...(db.simulatorSettings || {}), ...patch };
  save();
  return getSimulatorSettings();
}

export function bumpSuperAdminSessionVersion(preserveToken = null) {
  const db = load();
  const current = Number(db.simulatorSettings?.superAdminSessionVersion || 0);
  db.simulatorSettings = {
    ...DEFAULT_SIMULATOR_SETTINGS,
    ...(db.simulatorSettings || {}),
    superAdminSessionVersion: current + 1,
  };
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === '__chase_admin__' && token !== preserveToken) {
      delete db.sessions[token];
    }
  }
  save();
  return db.simulatorSettings.superAdminSessionVersion;
}

export function findAdminByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return (load().adminAccounts || []).find((admin) => admin.username.toLowerCase() === needle) || null;
}

export function findAdminById(id) {
  return (load().adminAccounts || []).find((admin) => admin.id === id) || null;
}

export function findAdminByLinkedUserId(userId) {
  if (!userId) return null;
  return (load().adminAccounts || []).find((admin) => admin.linkedUserId === userId) || null;
}

export function listAdminAccounts() {
  return (load().adminAccounts || []).map(({ passwordHash, ...admin }) => admin);
}

export function listAdminAccountsRaw() {
  return load().adminAccounts || [];
}

export function promoteCustomerToAdmin(userId, admin) {
  const db = load();
  const index = db.users.findIndex(user => user.id === userId);
  if (index < 0) throw new Error('Customer not found');
  db.users[index] = { ...db.users[index], ownerAdminId: null };
  db.adminAccounts.push(admin);
  save();
}

export function createAdminWithCustomer(admin, customer) {
  const db = load();
  db.users.push(customer);
  db.adminAccounts.push(admin);
  save();
}

export function linkAdminToCustomer(adminId, { newCustomer, existingUserId, passwordHash }) {
  const db = load();
  const adminIdx = db.adminAccounts.findIndex((a) => a.id === adminId);
  if (adminIdx < 0) throw new Error('Administrator not found');
  const admin = db.adminAccounts[adminIdx];
  const oldAdminUsername = admin.username;

  let linkedUser;
  if (newCustomer) {
    db.users.push(newCustomer);
    linkedUser = newCustomer;
    db.adminAccounts[adminIdx] = {
      ...admin,
      linkedUserId: newCustomer.id,
      sessionVersion: (admin.sessionVersion || 0) + 1,
    };
  } else {
    const userIdx = db.users.findIndex((u) => u.id === existingUserId);
    if (userIdx < 0) throw new Error('Customer not found');
    const user = db.users[userIdx];
    const resolvedHash = passwordHash || admin.passwordHash;
    linkedUser = {
      ...user,
      ownerAdminId: null,
      passwordHash: resolvedHash,
      updatedAt: new Date().toISOString(),
    };
    db.users[userIdx] = linkedUser;
    db.adminAccounts[adminIdx] = {
      ...admin,
      username: linkedUser.username,
      fullName: linkedUser.fullName || admin.fullName,
      passwordHash: resolvedHash,
      linkedUserId: linkedUser.id,
      sessionVersion: (admin.sessionVersion || 0) + 1,
    };
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === linkedUser.id) delete db.sessions[token];
    }
  }

  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === `admin:${oldAdminUsername}` || session.userId === `admin:${db.adminAccounts[adminIdx].username}`) {
      delete db.sessions[token];
    }
  }

  save();
  const { passwordHash: _ph, ...publicAdmin } = db.adminAccounts[adminIdx];
  return { admin: publicAdmin, user: linkedUser };
}

export function reassignAdminCustomers(fromAdminId, replacementAdminId) {
  const db = load();
  let reassignedCount = 0;
  for (let i = 0; i < db.users.length; i += 1) {
    if (db.users[i].ownerAdminId === fromAdminId) {
      db.users[i] = { ...db.users[i], ownerAdminId: replacementAdminId || null };
      reassignedCount += 1;
    }
  }
  if (reassignedCount > 0) save();
  return reassignedCount;
}

export function reassignAndRemoveAdmin(adminId, replacementAdminId) {
  const db = load();
  const removed = db.adminAccounts.find((admin) => admin.id === adminId);
  if (!removed) return null;
  let reassignedCount = 0;
  for (let i = 0; i < db.users.length; i += 1) {
    if (db.users[i].ownerAdminId === adminId) {
      db.users[i] = { ...db.users[i], ownerAdminId: replacementAdminId || null };
      reassignedCount += 1;
    }
  }
  db.adminAccounts = db.adminAccounts.filter((admin) => admin.id !== adminId);
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === `admin:${removed.username}`) delete db.sessions[token];
  }
  save();
  return { removed, reassignedCount };
}

export function insertAdminAccount(admin) {
  const db = load();
  db.adminAccounts.push(admin);
  save();
  return admin;
}

export function updateAdminAccount(id, patch, { replacementAdminId } = {}) {
  const db = load();
  const index = db.adminAccounts.findIndex((admin) => admin.id === id);
  if (index < 0) return null;
  const oldUsername = db.adminAccounts[index].username;
  const linkedUserId = db.adminAccounts[index].linkedUserId;
  if (linkedUserId && (patch.passwordHash || patch.fullName)) {
    const user = db.users.find(u => u.id === linkedUserId);
    if (!user && patch.passwordHash) throw new Error('Linked customer not found');
    if (user) {
      if (patch.passwordHash) {
        user.passwordHash = patch.passwordHash;
        for (const [token, session] of Object.entries(db.sessions)) if (session.userId === user.id) delete db.sessions[token];
      }
      if (patch.fullName) {
        user.fullName = patch.fullName;
      }
    }
  }
  let reassignedCount = 0;
  if (replacementAdminId !== undefined) {
    for (let i = 0; i < db.users.length; i += 1) {
      if (db.users[i].ownerAdminId === id) {
        db.users[i] = { ...db.users[i], ownerAdminId: replacementAdminId || null };
        reassignedCount += 1;
      }
    }
  }
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
  return replacementAdminId !== undefined ? { ...publicAdmin, _reassignedCount: reassignedCount } : publicAdmin;
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

export function updateUser(user, { preserveToken = null } = {}) {
  const db = load();
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    const previous = db.users[idx];
    const linked = db.adminAccounts.find((a) => a.linkedUserId === user.id);
    const passwordChanged = previous.passwordHash !== user.passwordHash;
    const statusChanged = previous.status !== user.status;
    const nameChanged = previous.fullName !== user.fullName && user.fullName;

    if (linked) {
      if (nameChanged) {
        linked.fullName = user.fullName;
      }
      if (passwordChanged || statusChanged) {
        linked.passwordHash = user.passwordHash;
        linked.sessionVersion = (linked.sessionVersion || 0) + 1;
        for (const [token, session] of Object.entries(db.sessions)) {
          if (session.userId === `admin:${linked.username}` || (session.userId === user.id && token !== preserveToken)) {
            delete db.sessions[token];
          }
        }
      }
    }

    if (passwordChanged) {
      for (const [token, session] of Object.entries(db.sessions)) {
        if (session.userId === user.id && token !== preserveToken) {
          delete db.sessions[token];
        }
      }
    }

    db.users[idx] = user;
    save();
  }
}

export function revokeAllSessionsForUserAndLinkedAdmin(userId) {
  const db = load();
  let changed = false;
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === userId) {
      delete db.sessions[token];
      changed = true;
    }
  }
  const linked = db.adminAccounts.find((a) => a.linkedUserId === userId);
  if (linked) {
    linked.sessionVersion = (linked.sessionVersion || 0) + 1;
    changed = true;
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === `admin:${linked.username}`) {
        delete db.sessions[token];
      }
    }
  }
  if (changed) save();
  return Boolean(linked);
}

export function restoreBackupAtomic({ users, settings, adminAccounts = null }) {
  const db = load();
  db.users = users;
  if (adminAccounts !== null) {
    db.adminAccounts = adminAccounts;
  }
  if (settings) {
    db.simulatorSettings = {
      ...DEFAULT_SIMULATOR_SETTINGS,
      ...(db.simulatorSettings || {}),
      allowEnrollment: settings.allowEnrollment,
      allowCustomerPasswordReset: settings.allowCustomerPasswordReset,
      ...(settings.rootSupportContact ? { rootSupportContact: settings.rootSupportContact } : {}),
    };
  }
  for (const [token, session] of Object.entries(db.sessions)) {
    if (adminAccounts !== null) {
      if (session.userId !== '__chase_admin__') delete db.sessions[token];
    } else if (session.role !== 'admin' && session.role !== 'auditor') {
      delete db.sessions[token];
    }
  }
  save();
}

export function createSession(token, userId, role = 'user') {
  const ttlMs = (role === 'admin' || role === 'auditor') ? 8 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  load().sessions[token] = { userId, role, expiresAt: Date.now() + ttlMs };
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
