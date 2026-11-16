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
  deleteSessionsForUser,
  countUsers,
  appendAudit,
} from './db.js';
import { handleAdmin } from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 3000;

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

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
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

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function getAuthUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const user = findUserById(session.userId);
  // Frozen accounts lose API access immediately, even with a still-valid token.
  if (user && user.status === 'frozen') return null;
  return user;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
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

  if (pathname === '/api/auth/register' && method === 'POST') {
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
      role: 'member',
      status: 'active',
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    insertUser(user);
    const token = newToken();
    createSession(token, user.id);
    appendAudit({
      id: uid(),
      at: user.createdAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'user.registered',
      target: user.username,
      detail: `Enrolled with ${product.name}`,
    });
    return sendJson(res, 201, { user: publicUser(user), token });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
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
    if (user.status === 'frozen') {
      appendAudit({
        id: uid(),
        at: new Date().toISOString(),
        actorId: user.id,
        actorName: user.fullName,
        action: 'auth.login.blocked',
        target: user.username,
        detail: 'Sign-in attempted on a frozen account',
      });
      return sendJson(
        res,
        403,
        { error: 'This account has been frozen by an administrator. Please contact support.' }
      );
    }
    clearFailures(req, bucket);
    user.lastLoginAt = new Date().toISOString();
    updateUser(user);
    appendAudit({
      id: uid(),
      at: user.lastLoginAt,
      actorId: user.id,
      actorName: user.fullName,
      action: 'auth.login',
      target: user.username,
      detail: `Signed in from ${clientKey(req)}`,
    });
    const token = newToken();
    createSession(token, user.id);
    return sendJson(res, 200, { user: publicUser(user), token });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = bearerToken(req);
    if (token) deleteSession(token);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/check-username' && method === 'GET') {
    const username = url.searchParams.get('username') || '';
    return sendJson(res, 200, { taken: !!findUserByUsername(username) });
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
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

  /* ------------------------- Authenticated routes ------------------------- */
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not signed in' });

  /* ------------------------ Admin console routes ------------------------- */
  if (pathname.startsWith('/api/admin')) {
    if (user.role !== 'admin') {
      return sendJson(res, 403, { error: 'Administrator access required' });
    }
    return handleAdmin(req, res, url, user);
  }

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
      card.balance = round2(Math.max(0, card.balance - credit));
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
    return sendJson(res, 200, { ok: true });
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
