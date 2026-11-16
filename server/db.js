/* -------------------------------------------------------------------------- */
/* Chase Clone — JSON file database (users + sessions)                         */
/* Swap this module for SQLite/Postgres in production; the API stays the same. */
/* -------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cache = null;
let cacheMtimeMs = 0;

function diskMtimeMs() {
  try {
    return fs.statSync(DB_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

function load() {
  const currentMtime = diskMtimeMs();
  if (cache && (currentMtime === 0 || currentMtime === cacheMtimeMs)) return cache;
  let existing = false;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cache = JSON.parse(raw);
    cacheMtimeMs = currentMtime || diskMtimeMs();
    existing = true;
    if (!Array.isArray(cache.users)) cache.users = [];
    if (!cache.sessions || typeof cache.sessions !== 'object') cache.sessions = {};
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Preserve a corrupt database for inspection instead of silently wiping it.
      try {
        fs.renameSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}.json`);
      } catch {
        /* The file may already be gone; start with an empty database below. */
      }
      console.error('Database file was corrupt; a backup copy was preserved.');
    }
    cache = { users: [], sessions: {} };
    cacheMtimeMs = 0;
  }
  if (!Array.isArray(cache.audit)) cache.audit = [];
  /* One-time migration: backfill role + status for users created before the admin console. */
  let migrated = false;
  for (const u of cache.users) {
    if (!u.status) {
      u.status = 'active';
      migrated = true;
    }
    if (!u.role || (u.username === 'chase' && u.role !== 'admin')) {
      u.role = u.username === 'chase' ? 'admin' : 'member';
      migrated = true;
    }
  }
  if (migrated && existing) save();
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2));
  fs.renameSync(tempFile, DB_FILE);
  cacheMtimeMs = diskMtimeMs();
}

export function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return load().users.find((u) => u.username.toLowerCase() === needle) || null;
}

export function findUserById(id) {
  return load().users.find((u) => u.id === id) || null;
}

export function countUsers() {
  return load().users.length;
}

export function listUsers() {
  return load().users;
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

export function createSession(token, userId) {
  load().sessions[token] = { userId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
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

/* ------------------------------ Admin console ----------------------------- */

export function countActiveSessions() {
  const db = load();
  const now = Date.now();
  return Object.values(db.sessions).filter((s) => s.expiresAt > now).length;
}

export function countSessionsForUser(userId) {
  const db = load();
  const now = Date.now();
  return Object.values(db.sessions).filter((s) => s.userId === userId && s.expiresAt > now).length;
}

const AUDIT_LIMIT = 600;

export function appendAudit(entry) {
  const db = load();
  db.audit.unshift(entry);
  if (db.audit.length > AUDIT_LIMIT) db.audit.length = AUDIT_LIMIT;
  save();
}

export function listAudit() {
  return load().audit;
}

export function dbStats() {
  try {
    const st = fs.statSync(DB_FILE);
    return { bytes: st.size, modifiedAt: st.mtime.toISOString() };
  } catch {
    return { bytes: 0, modifiedAt: null };
  }
}
