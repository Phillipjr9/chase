/* -------------------------------------------------------------------------- */
/* Chase Clone — JSON file database (users + sessions)                         */
/* Swap this module for SQLite/Postgres in production; the API stays the same. */
/* -------------------------------------------------------------------------- */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.users)) cache.users = [];
    if (!cache.sessions || typeof cache.sessions !== 'object') cache.sessions = {};
    if (!Array.isArray(cache.revokedSessions)) cache.revokedSessions = [];
    if (!Array.isArray(cache.auditLog)) cache.auditLog = [];
    if (!cache.simulatorSettings || typeof cache.simulatorSettings !== 'object') cache.simulatorSettings = {};
    if (!Array.isArray(cache.adminAccounts)) cache.adminAccounts = [];
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
    cache = { users: [], sessions: {}, revokedSessions: [], auditLog: [], simulatorSettings: {}, adminAccounts: [] };
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2));
  fs.renameSync(tempFile, DB_FILE);
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
    if (session.role !== 'admin') delete db.sessions[token];
  }
  save();
}

export function appendAudit(entry) {
  const db = load();
  db.auditLog.unshift(entry);
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
  db.adminAccounts[index] = { ...db.adminAccounts[index], ...patch };
  if (patch.passwordHash || patch.role || patch.status === 'disabled') {
    const sessionUserId = `admin:${db.adminAccounts[index].username}`;
    for (const [token, session] of Object.entries(db.sessions)) if (session.userId === sessionUserId) delete db.sessions[token];
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
    for (const [token, session] of Object.entries(db.sessions)) if (session.userId === `admin:${removed.username}`) delete db.sessions[token];
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
