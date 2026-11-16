/* -------------------------------------------------------------------------- */
/* Chase Clone — Admin Console API                                             */
/*                                                                           */
/* Mounted from server/index.js at /api/admin/* for users with role 'admin'.  */
/* Provides operational analytics, customer management, transaction           */
/* monitoring, dispute resolution, an audit trail, and system health.         */
/* -------------------------------------------------------------------------- */
import {
  listUsers,
  findUserById,
  updateUser,
  deleteSessionsForUser,
  countUsers,
  countActiveSessions,
  countSessionsForUser,
  listAudit,
  appendAudit,
  dbStats,
} from './db.js';
import { PRODUCTS, DEPOSIT_TYPES, uid, round2 } from './domain.js';

const DAY = 24 * 60 * 60 * 1000;
const STARTED_AT = new Date().toISOString();
const MONTHLY_INFLOW_TARGET = 250000;

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

function cleanText(value, max = 200) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

/* ------------------------------ Analytics -------------------------------- */

function flattenTransactions() {
  const rows = [];
  for (const u of listUsers()) {
    for (const a of u.accounts || []) {
      for (const t of a.transactions || []) {
        rows.push({
          id: t.id,
          userId: u.id,
          userName: u.fullName,
          username: u.username,
          accountId: a.id,
          accountName: a.name,
          accountMask: a.mask,
          accountType: a.type,
          date: t.date,
          description: t.description,
          amount: t.amount,
          category: t.category,
          status: t.status || 'posted',
          flagged: !!t.flagged,
          flagNote: t.flagNote || null,
        });
      }
    }
  }
  rows.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
  return rows;
}

const LIABILITY_TYPES = new Set(['credit-card', 'mortgage', 'auto-loan']);

function customerSummary(u) {
  const accounts = u.accounts || [];
  const deposits = accounts
    .filter((a) => DEPOSIT_TYPES.has(a.type))
    .reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts
    .filter((a) => LIABILITY_TYPES.has(a.type))
    .reduce((s, a) => s + a.balance, 0);
  let txCount = 0;
  let flaggedCount = 0;
  for (const a of accounts) {
    for (const t of a.transactions || []) {
      txCount += 1;
      if (t.flagged) flaggedCount += 1;
    }
  }
  const openDisputes = (u.disputes || []).filter((d) => d.status === 'open').length;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone || '',
    address: u.address || '',
    role: u.role || 'member',
    status: u.status || 'active',
    joinedAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    accountCount: accounts.length,
    deposits: round2(deposits),
    liabilities: round2(liabilities),
    txCount,
    flaggedCount,
    openDisputes,
  };
}

function deltaPct(curr, prev) {
  if (!prev) return null;
  return round2(((curr - prev) / Math.abs(prev)) * 100);
}

const OVERVIEW_RANGES = new Set(['7d', '30d', '12w']);

function buildOverview(range = '12w') {
  const users = listUsers();
  const txs = flattenTransactions();
  const now = Date.now();

  const totalDeposits = users.reduce(
    (s, u) => s + (u.accounts || []).filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((x, a) => x + a.balance, 0),
    0
  );
  const cardAccounts = users.flatMap((u) => (u.accounts || []).filter((a) => a.type === 'credit-card'));
  const cardBalance = cardAccounts.reduce((s, a) => s + a.balance, 0);
  const cardLimits = cardAccounts.reduce((s, a) => s + (a.creditLimit || 0), 0);
  const loanBalance = users.reduce(
    (s, u) => s + (u.accounts || []).filter((a) => a.type === 'mortgage' || a.type === 'auto-loan').reduce((x, a) => x + a.balance, 0),
    0
  );

  const age = (iso) => now - new Date(iso).getTime();
  const tx30 = txs.filter((t) => age(t.date) < 30 * DAY);
  const txPrev30 = txs.filter((t) => age(t.date) >= 30 * DAY && age(t.date) < 60 * DAY);
  const vol = (list) => list.reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = (list) => list.reduce((s, t) => s + t.amount, 0);

  const newUsers30 = users.filter((u) => age(u.createdAt) < 30 * DAY).length;
  const newUsersPrev30 = users.filter((u) => age(u.createdAt) >= 30 * DAY && age(u.createdAt) < 60 * DAY).length;

  /* Cashflow series — bucketed per requested range (7d/30d daily, 12w weekly) */
  const cashflowMidnight = new Date();
  cashflowMidnight.setHours(0, 0, 0, 0);
  const cashflow = [];
  const pushCashflowBucket = (from, to, labelDate) => {
    const bucket = txs.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= from && ts < to;
    });
    cashflow.push({
      label: labelDate.toISOString().slice(5, 10).replace('-', '/'),
      inflow: round2(bucket.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      outflow: round2(bucket.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)),
    });
  };
  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    for (let i = days - 1; i >= 0; i -= 1) {
      const from = cashflowMidnight.getTime() - i * DAY;
      pushCashflowBucket(from, from + DAY, new Date(from));
    }
  } else {
    for (let i = 11; i >= 0; i -= 1) {
      const to = now - i * 7 * DAY;
      pushCashflowBucket(to - 7 * DAY, to, new Date(to - DAY));
    }
  }

  /* Sparkline sources stay on a stable 12-week history regardless of chart range */
  const weeklyInflow = [];
  for (let i = 11; i >= 0; i -= 1) {
    const to = now - i * 7 * DAY;
    const from = to - 7 * DAY;
    weeklyInflow.push(
      round2(
        txs
          .filter((t) => t.amount > 0 && new Date(t.date).getTime() >= from && new Date(t.date).getTime() < to)
          .reduce((s, t) => s + t.amount, 0)
      )
    );
  }

  /* 14-day transaction volume */
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const daily = [];
  for (let i = 13; i >= 0; i -= 1) {
    const from = todayStart.getTime() - i * DAY;
    const to = from + DAY;
    const bucket = txs.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= from && ts < to;
    });
    daily.push({
      label: new Date(from).toISOString().slice(5, 10).replace('-', '/'),
      count: bucket.length,
      amount: round2(vol(bucket)),
    });
  }

  /* Cumulative signups per week (sparkline) */
  const signups = [];
  for (let i = 11; i >= 0; i -= 1) {
    const cutoff = now - i * 7 * DAY;
    signups.push(users.filter((u) => new Date(u.createdAt).getTime() <= cutoff).length);
  }

  /* Account mix */
  const mixMap = new Map();
  for (const u of users) {
    for (const a of u.accounts || []) {
      const entry = mixMap.get(a.type) || { type: a.type, count: 0, balance: 0 };
      entry.count += 1;
      entry.balance = round2(entry.balance + a.balance);
      mixMap.set(a.type, entry);
    }
  }
  const accountMix = [...mixMap.values()].sort((x, y) => y.count - x.count);

  /* This month inflow vs target */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthInflow = round2(
    txs.filter((t) => t.amount > 0 && new Date(t.date).getTime() >= monthStart.getTime()).reduce((s, t) => s + t.amount, 0)
  );

  /* Blended recent activity feed */
  const activity = [];
  for (const u of users) {
    activity.push({
      id: `signup-${u.id}`,
      kind: 'signup',
      at: u.createdAt,
      text: `${u.fullName} enrolled`,
      detail: `@${u.username}`,
      userId: u.id,
    });
  }
  for (const t of txs.slice(0, 200)) {
    activity.push({
      id: `tx-${t.userId}-${t.id}`,
      kind: 'transaction',
      at: t.date,
      text: `${t.description}`,
      detail: `${t.userName} · ${t.accountName} (••${t.accountMask}) · ${t.amount >= 0 ? '+' : '−'}$${Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      userId: t.userId,
      flagged: t.flagged,
    });
  }
  for (const e of listAudit().slice(0, 50)) {
    if (/^(customer|dispute|transaction)\./.test(e.action)) {
      activity.push({
        id: `audit-${e.id}`,
        kind: 'admin',
        at: e.at,
        text: e.detail || e.action,
        detail: `${e.actorName} → ${e.target}`,
        userId: null,
      });
    }
  }
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const flaggedTx = txs.filter((t) => t.flagged).length;
  const openDisputes = users.reduce((s, u) => s + (u.disputes || []).filter((d) => d.status === 'open').length, 0);
  const frozenUsers = users.filter((u) => u.status === 'frozen').length;

  return {
    generatedAt: new Date().toISOString(),
    range,
    kpis: {
      totalUsers: users.length,
      newUsers30,
      newUsersDeltaPct: deltaPct(newUsers30, newUsersPrev30),
      activeUsers: users.filter((u) => u.status !== 'frozen').length,
      frozenUsers,
      totalDeposits: round2(totalDeposits),
      depositsDeltaPct: deltaPct(net(tx30), net(txPrev30)),
      netFlow30: round2(net(tx30)),
      txVolume30: round2(vol(tx30)),
      txVolumeDeltaPct: deltaPct(vol(tx30), vol(txPrev30)),
      txCount30: tx30.length,
      cardBalance: round2(cardBalance),
      loanBalance: round2(loanBalance),
      creditUtilizationPct: cardLimits ? round2((cardBalance / cardLimits) * 100) : 0,
      flaggedTx,
      openDisputes,
      riskItems: flaggedTx + openDisputes,
      activeSessions: countActiveSessions(),
      monthInflow,
      monthlyTarget: MONTHLY_INFLOW_TARGET,
      monthlyTargetPct: round2((monthInflow / MONTHLY_INFLOW_TARGET) * 100),
    },
    sparklines: {
      signups,
      inflow: weeklyInflow,
      volume: daily.map((d) => d.amount),
    },
    cashflow,
    daily,
    accountMix,
    topCustomers: users.map(customerSummary).sort((a, b) => b.deposits - a.deposits).slice(0, 5),
    activity: activity.slice(0, 12),
  };
}

function paginate(list, url, defaultPageSize = 10) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(url.searchParams.get('pageSize') || String(defaultPageSize), 10) || defaultPageSize));
  const start = (page - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(list.length / pageSize)),
  };
}

function auditAction(me, action, target, detail) {
  appendAudit({
    id: uid(),
    at: new Date().toISOString(),
    actorId: me.id,
    actorName: me.fullName,
    action,
    target,
    detail: cleanText(detail, 240),
  });
}

/* -------------------------------- Routes --------------------------------- */

export async function handleAdmin(req, res, url, me) {
  const method = req.method;
  const pathname = url.pathname;

  /* ---------------------------- Overview ---------------------------- */
  if (pathname === '/api/admin/overview' && method === 'GET') {
    const requested = url.searchParams.get('range');
    const range = OVERVIEW_RANGES.has(requested) ? requested : '12w';
    return sendJson(res, 200, buildOverview(range));
  }

  /* ---------------------------- Customers --------------------------- */
  if (pathname === '/api/admin/customers' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || 'all';
    const role = url.searchParams.get('role') || 'all';
    const sort = url.searchParams.get('sort') || 'joined-desc';
    let rows = listUsers().map(customerSummary);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      );
    }
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    if (role !== 'all') rows = rows.filter((r) => r.role === role);
    const sorters = {
      'name-asc': (a, b) => a.fullName.localeCompare(b.fullName),
      'name-desc': (a, b) => b.fullName.localeCompare(a.fullName),
      'joined-desc': (a, b) => new Date(b.joinedAt) - new Date(a.joinedAt),
      'joined-asc': (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt),
      'deposits-desc': (a, b) => b.deposits - a.deposits,
      'deposits-asc': (a, b) => a.deposits - b.deposits,
    };
    rows.sort(sorters[sort] || sorters['joined-desc']);
    const page = paginate(rows, url);
    return sendJson(res, 200, { customers: page.items, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages });
  }

  if (pathname === '/api/admin/customers/detail' && method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const u = findUserById(id);
    if (!u) return sendJson(res, 404, { error: 'Customer not found' });
    const summary = customerSummary(u);
    const recentTx = flattenTransactions().filter((t) => t.userId === u.id).slice(0, 12);
    const accounts = (u.accounts || []).map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      mask: a.mask,
      balance: a.balance,
      creditLimit: a.creditLimit,
      apr: a.apr,
      locked: !!a.locked,
      autopay: !!a.autopay,
      createdAt: a.createdAt,
      txCount: (a.transactions || []).length,
    }));
    return sendJson(res, 200, {
      customer: {
        summary,
        accounts,
        recentTx,
        disputes: u.disputes || [],
        payees: u.payees || [],
        scheduledPayments: u.scheduledPayments || [],
        sessions: countSessionsForUser(u.id),
        security: u.security || null,
        creditScore: u.credit?.score ?? null,
      },
    });
  }

  if (pathname === '/api/admin/customers/status' && method === 'POST') {
    const body = await readBody(req);
    const target = findUserById(body.id || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    if (!['active', 'frozen'].includes(body.status)) {
      return sendJson(res, 400, { error: 'Status must be "active" or "frozen"' });
    }
    if (target.id === me.id && body.status === 'frozen') {
      return sendJson(res, 400, { error: 'You cannot freeze your own account.' });
    }
    const updated = { ...target, status: body.status };
    updateUser(updated);
    if (body.status === 'frozen') deleteSessionsForUser(updated.id);
    auditAction(
      me,
      body.status === 'frozen' ? 'customer.frozen' : 'customer.reactivated',
      updated.username,
      body.reason ? `${body.status === 'frozen' ? 'Froze' : 'Reactivated'} account — ${cleanText(body.reason, 160)}` : `${body.status === 'frozen' ? 'Froze' : 'Reactivated'} account`
    );
    return sendJson(res, 200, { ok: true, customer: customerSummary(updated) });
  }

  if (pathname === '/api/admin/customers/role' && method === 'POST') {
    const body = await readBody(req);
    const target = findUserById(body.id || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    if (!['admin', 'member'].includes(body.role)) {
      return sendJson(res, 400, { error: 'Role must be "admin" or "member"' });
    }
    if (target.id === me.id && body.role === 'member') {
      return sendJson(res, 400, { error: 'You cannot remove your own administrator role.' });
    }
    if (body.role === 'member' && (target.role === 'admin')) {
      const admins = listUsers().filter((u) => u.role === 'admin');
      if (admins.length <= 1) {
        return sendJson(res, 400, { error: 'At least one administrator must remain.' });
      }
    }
    const updated = { ...target, role: body.role };
    updateUser(updated);
    auditAction(me, 'customer.role', updated.username, `Role changed to ${body.role}`);
    return sendJson(res, 200, { ok: true, customer: customerSummary(updated) });
  }

  if (pathname === '/api/admin/customers/adjust' && method === 'POST') {
    const body = await readBody(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 250000) {
      return sendJson(res, 400, { error: 'Adjustment must be a non-zero amount up to $250,000.' });
    }
    const reason = cleanText(body.reason || '', 120);
    if (!reason) return sendJson(res, 400, { error: 'A reason is required for balance adjustments.' });
    const target = findUserById(body.id || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    const updated = JSON.parse(JSON.stringify(target));
    const account = (updated.accounts || []).find((a) => a.id === body.accountId);
    if (!account) return sendJson(res, 404, { error: 'Account not found' });
    if (amount < 0 && account.balance + amount < 0) {
      return sendJson(res, 400, { error: 'Adjustment would make the balance negative.' });
    }
    account.balance = round2(account.balance + amount);
    account.transactions = account.transactions || [];
    account.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Admin adjustment — ${reason}`,
      amount: round2(amount),
      category: 'Adjustment',
      status: 'posted',
      adminActor: me.username,
    });
    updateUser(updated);
    auditAction(
      me,
      'customer.adjustment',
      updated.username,
      `${amount > 0 ? '+' : '−'}$${Math.abs(round2(amount)).toFixed(2)} on ${account.name} (••${account.mask}) — ${reason}`
    );
    return sendJson(res, 200, { ok: true, customer: customerSummary(updated) });
  }

  if (pathname === '/api/admin/customers/sign-out' && method === 'POST') {
    const body = await readBody(req);
    const target = findUserById(body.id || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    deleteSessionsForUser(target.id);
    auditAction(me, 'customer.signout', target.username, 'Ended all active sessions');
    return sendJson(res, 200, { ok: true });
  }

  /* --------------------------- Transactions -------------------------- */
  if (pathname === '/api/admin/transactions' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const type = url.searchParams.get('type') || 'all';
    const min = Number(url.searchParams.get('min'));
    const max = Number(url.searchParams.get('max'));
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const sort = url.searchParams.get('sort') || 'date-desc';

    let rows = flattenTransactions();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.userName.toLowerCase().includes(q) ||
          t.username.toLowerCase().includes(q) ||
          t.accountName.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }
    const typeFilters = {
      all: () => true,
      in: (t) => t.amount > 0,
      out: (t) => t.amount < 0,
      transfer: (t) => t.category === 'Transfer',
      zelle: (t) => t.category === 'Zelle',
      card: (t) => t.accountType === 'credit-card',
      loan: (t) => t.accountType === 'mortgage' || t.accountType === 'auto-loan',
      adjustment: (t) => t.category === 'Adjustment',
      flagged: (t) => t.flagged,
    };
    rows = rows.filter(typeFilters[type] || typeFilters.all);
    if (Number.isFinite(min)) rows = rows.filter((t) => Math.abs(t.amount) >= min);
    if (Number.isFinite(max) && max > 0) rows = rows.filter((t) => Math.abs(t.amount) <= max);
    if (from) rows = rows.filter((t) => t.date.slice(0, 10) >= from);
    if (to) rows = rows.filter((t) => t.date.slice(0, 10) <= to);
    if (sort === 'amount-desc') rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    else if (sort === 'amount-asc') rows.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    else if (sort === 'date-asc') rows.sort((a, b) => new Date(a.date) - new Date(b.date));

    const summary = {
      count: rows.length,
      inflow: round2(rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      outflow: round2(rows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)),
    };
    const page = paginate(rows, url);
    return sendJson(res, 200, {
      transactions: page.items,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      pages: page.pages,
      summary,
    });
  }

  if (pathname === '/api/admin/transactions/flag' && method === 'POST') {
    const body = await readBody(req);
    const target = findUserById(body.userId || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    const updated = JSON.parse(JSON.stringify(target));
    const account = (updated.accounts || []).find((a) => a.id === body.accountId);
    const tx = account && (account.transactions || []).find((t) => t.id === body.txId);
    if (!tx) return sendJson(res, 404, { error: 'Transaction not found' });
    tx.flagged = !!body.flagged;
    tx.flagNote = tx.flagged ? cleanText(body.note || 'Flagged by administrator', 160) : undefined;
    updateUser(updated);
    auditAction(
      me,
      tx.flagged ? 'transaction.flagged' : 'transaction.unflagged',
      updated.username,
      `${tx.flagged ? 'Flagged' : 'Cleared'} "${tx.description}" ($${Math.abs(tx.amount).toFixed(2)}) on ${account.name} (••${account.mask})${tx.flagNote ? ` — ${tx.flagNote}` : ''}`
    );
    return sendJson(res, 200, { ok: true, flagged: tx.flagged });
  }

  /* ----------------------------- Disputes ---------------------------- */
  if (pathname === '/api/admin/disputes' && method === 'GET') {
    const status = url.searchParams.get('status') || 'all';
    let rows = [];
    for (const u of listUsers()) {
      for (const d of u.disputes || []) {
        const account = (u.accounts || []).find((a) => a.id === d.accountId);
        rows.push({
          id: d.id,
          userId: u.id,
          userName: u.fullName,
          username: u.username,
          accountName: account ? account.name : 'Card account',
          accountMask: account ? account.mask : '----',
          transactionId: d.transactionId,
          description: d.description,
          amount: d.amount,
          reason: d.reason,
          status: d.status,
          createdAt: d.createdAt,
          resolvedAt: d.resolvedAt || null,
          resolutionNote: d.resolutionNote || null,
          resolvedBy: d.resolvedBy || null,
        });
      }
    }
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (status !== 'all') rows = rows.filter((d) => d.status === status);
    const open = rows.filter((d) => d.status === 'open').length;
    const page = paginate(rows, url);
    return sendJson(res, 200, {
      disputes: page.items,
      total: page.total,
      open,
      page: page.page,
      pageSize: page.pageSize,
      pages: page.pages,
    });
  }

  if (pathname === '/api/admin/disputes/resolve' && method === 'POST') {
    const body = await readBody(req);
    if (!['approved', 'denied'].includes(body.resolution)) {
      return sendJson(res, 400, { error: 'Resolution must be "approved" or "denied"' });
    }
    const target = findUserById(body.userId || '');
    if (!target) return sendJson(res, 404, { error: 'Customer not found' });
    const updated = JSON.parse(JSON.stringify(target));
    const dispute = (updated.disputes || []).find((d) => d.id === body.disputeId);
    if (!dispute) return sendJson(res, 404, { error: 'Dispute not found' });
    if (dispute.status !== 'open') return sendJson(res, 400, { error: 'That dispute has already been resolved.' });
    dispute.status = body.resolution === 'approved' ? 'resolved' : 'denied';
    dispute.resolvedAt = new Date().toISOString();
    dispute.resolvedBy = me.username;
    dispute.resolutionNote = cleanText(body.note || '', 200) || null;
    if (body.resolution === 'approved') {
      const account = (updated.accounts || []).find((a) => a.id === dispute.accountId);
      if (account) {
        account.balance = round2(Math.max(0, account.balance - dispute.amount));
        account.transactions = account.transactions || [];
        account.transactions.unshift({
          id: uid(),
          date: new Date().toISOString(),
          description: `Dispute refund — ${dispute.description}`,
          amount: -round2(dispute.amount),
          category: 'Dispute refund',
          status: 'posted',
        });
      }
    }
    updateUser(updated);
    auditAction(
      me,
      body.resolution === 'approved' ? 'dispute.approved' : 'dispute.denied',
      updated.username,
      `${body.resolution === 'approved' ? 'Approved refund' : 'Denied dispute'} for "${dispute.description}" ($${Number(dispute.amount).toFixed(2)})${dispute.resolutionNote ? ` — ${dispute.resolutionNote}` : ''}`
    );
    return sendJson(res, 200, { ok: true });
  }

  /* ------------------------------ Audit ------------------------------ */
  if (pathname === '/api/admin/audit' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const action = url.searchParams.get('action') || 'all';
    let rows = listAudit();
    if (q) {
      rows = rows.filter(
        (e) =>
          (e.actorName || '').toLowerCase().includes(q) ||
          (e.action || '').toLowerCase().includes(q) ||
          (e.target || '').toLowerCase().includes(q) ||
          (e.detail || '').toLowerCase().includes(q)
      );
    }
    if (action !== 'all') rows = rows.filter((e) => e.action === action || e.action.startsWith(`${action}.`));
    const actions = [...new Set(listAudit().map((e) => e.action))].sort();
    const page = paginate(rows, url, 12);
    return sendJson(res, 200, {
      entries: page.items,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      pages: page.pages,
      actions,
    });
  }

  /* ------------------------------ System ----------------------------- */
  if (pathname === '/api/admin/system' && method === 'GET') {
    const users = listUsers();
    const mem = process.memoryUsage();
    return sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      pid: process.pid,
      port: Number(process.env.PORT || 3000),
      startedAt: STARTED_AT,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round((mem.rss / 1048576) * 10) / 10,
      heapMb: Math.round((mem.heapUsed / 1048576) * 10) / 10,
      users: countUsers(),
      admins: users.filter((u) => u.role === 'admin').length,
      frozenUsers: users.filter((u) => u.status === 'frozen').length,
      activeSessions: countActiveSessions(),
      auditEntries: listAudit().length,
      products: PRODUCTS.length,
      db: dbStats(),
    });
  }

  return sendJson(res, 404, { error: 'Unknown admin endpoint' });
}
