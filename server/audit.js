/* -------------------------------------------------------------------------- */
/* Chase Admin — Plain-English Audit Enrichment & Request Metadata Helpers    */
/* Turns raw technical audit records into simple, human-readable summaries    */
/* while keeping the underlying cryptographic immutable record untouched.     */
/* -------------------------------------------------------------------------- */

function fmtUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function describeUserAgent(rawUa) {
  const ua = String(rawUa || '').trim();
  if (!ua) return 'Unknown device';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/curl|node|undici|postman|insomnia|python|got\//i.test(ua)) return 'API / Automated client';

  let os = '';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

export function inferCategory(action, details = {}) {
  const text = String(action || '').toLowerCase();
  if (text.includes('blocked') || text.includes('unauthorized') || text.includes('cross-tenant') || text.includes('rate limit') || text.includes('revoke') || text.includes('security') || text.includes('reveal') || text.includes('impersonat') || text.includes('sign-out-all') || text.includes('all devices')) {
    return 'security';
  }
  if (text.includes('sign-in') || text.includes('signed in') || text.includes('sign-out') || text.includes('signed out') || text.includes('login') || text.includes('password') || text.includes('switched from')) {
    return 'auth';
  }
  if (text.includes('overdraft') || text.includes('transfer') || text.includes('zelle') || text.includes('wire') || text.includes('payment') || text.includes('bill pay') || text.includes('deposit') || text.includes('ledger transaction') || text.includes('transaction history') || text.includes('backfilled') || text.includes('interest') || text.includes('refund') || text.includes('trade') || text.includes('redeem')) {
    return 'money';
  }
  if (text.includes('account') || text.includes('card') || text.includes('payee') || text.includes('loan')) {
    return 'accounts';
  }
  if (text.includes('administrator') || text.includes('admin') || text.includes('auditor') || text.includes('promoted') || text.includes('linked') || text.includes('reassign')) {
    return 'staff';
  }
  if (text.includes('message') || text.includes('dispute') || text.includes('banner') || text.includes('notice') || text.includes('staff note') || text.includes('support') || text.includes('saved replies')) {
    return 'support';
  }
  if (text.includes('backup') || text.includes('settings') || text.includes('reset simulator') || text.includes('month-end')) {
    return 'system';
  }
  if (text.includes('user') || text.includes('customer') || text.includes('enrolled') || text.includes('profile') || details?.userId) {
    return 'customers';
  }
  return 'system';
}

export function inferOutcome(action, details = {}) {
  const text = String(action || '').toLowerCase();
  if (text.includes('blocked') || text.includes('denied') || text.includes('rate limit')) return 'blocked';
  if (text.includes('failed') || text.includes('rejected') || text.includes('error')) return 'failed';
  if (text.includes('suspended') || text.includes('deleted') || text.includes('revoked') || text.includes('reset simulator') || text.includes('impersonat') || details?.status === 'suspended') {
    return 'warning';
  }
  return 'success';
}

export function inferSeverity(action, outcome, category) {
  const text = String(action || '').toLowerCase();
  if (text.includes('reset simulator') || text.includes('restored simulator backup') || text.includes('cross-tenant') || text.includes('deleted simulator user') || text.includes('deleted simulator administrator')) {
    return 'critical';
  }
  if (outcome === 'blocked' || text.includes('overdraft') || text.includes('rate limit') || text.includes('suspended') || text.includes('impersonat') || text.includes('password') || text.includes('promoted') || text.includes('revoked') || text.includes('wire') || text.includes('card detail reveal')) {
    return 'high';
  }
  if (outcome === 'failed' || text.includes('deleted') || text.includes('backup') || text.includes('settings') || category === 'money') {
    return 'medium';
  }
  if (text.includes('sign-in') || text.includes('signed in') || text.includes('sign-out') || text.includes('signed out')) {
    return 'low';
  }
  return 'info';
}

function resolveUserLabel(details, usersById, usersByUsername) {
  const byId = details?.userId ? usersById.get(String(details.userId)) : null;
  const byName = !byId && details?.username ? usersByUsername.get(String(details.username).toLowerCase()) : null;
  const user = byId || byName;
  if (user) return `${user.fullName} (@${user.username})`;
  if (details?.customerName && details?.username) return `${details.customerName} (@${details.username})`;
  if (details?.username) return `@${details.username}`;
  if (details?.userId) return `Customer #${String(details.userId).slice(0, 8)}`;
  return null;
}

function resolveAccountLabel(details, usersById, accountsById) {
  if (details?.accountName) {
    return details.accountMask ? `${details.accountName} (…${details.accountMask})` : String(details.accountName);
  }
  const acctId = details?.accountId || details?.toAccountId || details?.fromAccountId;
  if (acctId && accountsById.has(String(acctId))) {
    const a = accountsById.get(String(acctId));
    return `${a.name} (…${a.mask})`;
  }
  if (details?.userId && details?.accountId) {
    const u = usersById.get(String(details.userId));
    const a = u?.accounts?.find((x) => x.id === details.accountId);
    if (a) return `${a.name} (…${a.mask})`;
  }
  return null;
}

function buildLegacySummary(entry, context) {
  const { usersById, usersByUsername, accountsById } = context;
  const d = entry.details || {};
  const actor = entry.actor || 'System';
  const action = String(entry.action || '');
  const lower = action.toLowerCase();
  const userLabel = resolveUserLabel(d, usersById, usersByUsername);
  const acctLabel = resolveAccountLabel(d, usersById, accountsById);

  if (lower === 'admin sign-in') {
    const roleLabel = d.isSuperAdmin ? 'Super Administrator' : d.role === 'auditor' ? 'Read-Only Auditor' : 'Administrator';
    return `${roleLabel} ${actor} signed in to the Admin Console.`;
  }
  if (lower === 'admin sign-in through customer login') {
    const roleLabel = d.isSuperAdmin ? 'Super Administrator' : d.role === 'auditor' ? 'Read-Only Auditor' : 'Administrator';
    return `${roleLabel} ${actor} signed in via the main Chase sign-in page.`;
  }
  if (lower === 'admin sign-out') {
    return `${actor} signed out of the Admin Console.`;
  }
  if (lower === 'failed admin sign-in attempt') {
    const who = d.username && d.username !== '(empty)' ? `"${d.username}"` : 'an empty username';
    const where = d.path === '/api/auth/login' ? 'the main sign-in page' : 'the admin login page';
    return `Failed administrator sign-in for ${who} on ${where}.`;
  }
  if (lower.includes('blocked admin sign-in') && lower.includes('disabled')) {
    return `Blocked sign-in for administrator ${actor} because the account is disabled.`;
  }
  if (lower.includes('blocked admin sign-in') && lower.includes('suspended')) {
    return `Blocked sign-in for administrator ${actor} because their linked customer profile is suspended.`;
  }
  if (lower === 'started user impersonation') {
    return `${actor} opened customer preview mode as ${userLabel || 'a customer'}.`;
  }
  if (lower === 'created simulator user') {
    return `${actor} created a new customer profile for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'updated simulator user record') {
    const fields = Array.isArray(d.fields) && d.fields.length ? d.fields.join(', ') : 'profile details';
    return `${actor} updated ${userLabel || 'a customer'} (${fields}).`;
  }
  if (lower === 'deleted simulator user') {
    return `${actor} permanently deleted customer ${userLabel || 'profile'}.`;
  }
  if (lower === 'reset simulator user password') {
    return `${actor} reset the password for ${userLabel || 'a customer'}${d.linkedAdmin ? ' (also updated their linked admin login)' : ''} and signed out their active sessions.`;
  }
  if (lower === 'revoked simulator user sessions') {
    return `${actor} forced sign-out on all active sessions for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'created simulator account') {
    return `${actor} opened a new ${d.type || ''} account${acctLabel ? ` (${acctLabel})` : ''} for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'updated simulator account') {
    const fields = Array.isArray(d.fields) && d.fields.length ? d.fields.join(', ') : 'settings';
    return `${actor} updated ${acctLabel || 'an account'} for ${userLabel || 'a customer'} (${fields}).`;
  }
  if (lower === 'deleted simulator account') {
    return `${actor} deleted ${acctLabel || 'an account'} from ${userLabel || 'a customer'}.`;
  }
  if (lower === 'overdrafted simulator account balance') {
    const prev = d.previousBalance != null ? fmtUsd(d.previousBalance) : '';
    const next = d.newBalance != null ? fmtUsd(d.newBalance) : '';
    return `${actor} overdrafted ${acctLabel || 'an account'} for ${userLabel || 'a customer'}${prev && next ? ` (${prev} → ${next})` : ''}.`;
  }
  if (lower === 'created simulator ledger transaction') {
    const amt = d.amount != null ? fmtUsd(d.amount) : '';
    return `${actor} posted a ${amt} transaction on ${acctLabel || 'an account'} for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'updated simulator ledger transaction') {
    return `${actor} edited a transaction on ${acctLabel || 'an account'} for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'deleted simulator ledger transaction') {
    return `${actor} deleted a transaction on ${acctLabel || 'an account'} for ${userLabel || 'a customer'} (balance adjusted automatically).`;
  }
  if (lower === 'completed funded transfer' || lower === 'completed simulated admin transfer') {
    const amt = d.amount != null ? fmtUsd(d.amount) : '';
    return `${actor} completed a ${amt} ${d.transferType || ''} transfer for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'promoted test customer to administrator') {
    return `${actor} granted linked ${d.role === 'auditor' ? 'read-only auditor' : 'administrator'} access to ${userLabel || 'a customer'}.`;
  }
  if (lower === 'linked customer changed shared password') {
    return `${userLabel || actor} changed their shared customer & administrator password.`;
  }
  if (lower === 'exported simulator backup') {
    return `${actor} downloaded a full system backup (${d.usersCount ?? 0} customers, ${d.adminAccountsCount ?? 0} staff accounts).`;
  }
  if (lower === 'restored simulator backup') {
    return `${actor} restored a system backup (${d.usersRestored ?? 0} customers restored).`;
  }
  if (lower.includes('backfilled')) {
    return `${actor} backfilled ${d.transactionsAdded ?? 0} historical transactions (${d.range || 'past history'}) for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'generated simulator transaction history') {
    return `${actor} generated ${d.transactionsAdded ?? 0} historical transactions for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'sent secure message to customer') {
    return `${actor} sent a secure message ("${d.subject || 'Inquiry'}") to ${userLabel || 'a customer'}.`;
  }
  if (lower === 'published custom customer dashboard banner') {
    return `${actor} published a dashboard alert banner ("${d.title || 'Notice'}") for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'cleared custom customer dashboard banner') {
    return `${actor} removed the custom dashboard banner for ${userLabel || 'a customer'}.`;
  }
  if (lower === 'updated simulator administrator') {
    return `${actor} updated staff administrator @${d.username || d.adminId || 'account'}.`;
  }
  if (lower === 'revoked linked administrator access' || lower === 'deleted simulator administrator') {
    return `${actor} removed administrator access for @${d.username || d.adminId || 'account'}.`;
  }

  return userLabel
    ? `${actor} performed "${action}" on ${userLabel}.`
    : `${actor} performed "${action}".`;
}

function buildLegacyReason(entry) {
  if (entry.reason) return entry.reason;
  const lower = String(entry.action || '').toLowerCase();
  if (lower === 'failed admin sign-in attempt') {
    return 'Incorrect username or password (recorded before detailed failure reasons were enabled)';
  }
  if (lower.includes('blocked') && lower.includes('disabled')) {
    return 'Administrator account is disabled';
  }
  if (lower.includes('blocked') && lower.includes('suspended')) {
    return 'Linked customer account is suspended';
  }
  return null;
}

export function buildAuditContext({ users = [], adminAccounts = [], rootAdminUsername = '' }) {
  const usersById = new Map();
  const usersByUsername = new Map();
  const accountsById = new Map();
  for (const u of users) {
    usersById.set(String(u.id), u);
    usersByUsername.set(String(u.username || '').toLowerCase(), u);
    for (const a of u.accounts || []) {
      accountsById.set(String(a.id), { ...a, userId: u.id, username: u.username, fullName: u.fullName });
    }
  }
  const adminsByUsername = new Map();
  for (const a of adminAccounts) {
    adminsByUsername.set(String(a.username || '').toLowerCase(), a);
  }
  return {
    usersById,
    usersByUsername,
    accountsById,
    adminsByUsername,
    rootAdminLower: String(rootAdminUsername || '').toLowerCase(),
  };
}

export function inferActorType(entry, context) {
  if (entry.actorType) return entry.actorType;
  const actorLower = String(entry.actor || '').toLowerCase();
  if (!actorLower || actorLower === 'unknown' || actorLower === '(empty)') return 'anonymous';
  if (actorLower === 'system' || actorLower === 'chase administrator') return 'system';
  if (context.rootAdminLower && actorLower === context.rootAdminLower) return 'super_admin';
  const admin = context.adminsByUsername.get(actorLower);
  if (admin) return admin.role === 'auditor' ? 'auditor' : 'admin';
  if (context.usersByUsername.has(actorLower)) return 'customer';
  return 'anonymous';
}

export function enrichAuditEntry(entry, context, tamperedIds = new Set()) {
  const d = entry.details || {};
  const category = entry.category || inferCategory(entry.action, d);
  const outcome = entry.outcome || inferOutcome(entry.action, d);
  const severity = entry.severity || inferSeverity(entry.action, outcome, category);
  const actorType = inferActorType(entry, context);
  const summary = entry.summary || buildLegacySummary(entry, context);
  const reason = buildLegacyReason(entry);

  let target = entry.target || null;
  if (!target) {
    const userLabel = resolveUserLabel(d, context.usersById, context.usersByUsername);
    const acctLabel = resolveAccountLabel(d, context.usersById, context.accountsById);
    if (acctLabel && userLabel) {
      target = { type: 'account', id: String(d.accountId || ''), label: `${acctLabel} · ${userLabel}` };
    } else if (userLabel) {
      target = { type: 'customer', id: String(d.userId || ''), label: userLabel };
    } else if (d.adminId || (category === 'staff' && d.username)) {
      target = { type: 'admin', id: String(d.adminId || ''), label: d.username ? `@${d.username}` : `Admin #${String(d.adminId).slice(0, 8)}` };
    }
  }

  return {
    ...entry,
    actorType,
    category,
    outcome,
    severity,
    summary,
    reason,
    target,
    chained: typeof entry.entryHash === 'string' && typeof entry.seq === 'number',
    tampered: tamperedIds.has(entry.id),
  };
}

export function computeAuditStats(entries) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let last24h = 0;
  let failedCount = 0;
  let blockedCount = 0;
  let authEvents = 0;
  let moneyEvents = 0;
  let securityAlerts = 0;
  let customerEvents = 0;
  let adminEvents = 0;

  for (const e of entries) {
    const ts = Date.parse(e.createdAt || '');
    if (Number.isFinite(ts) && now - ts <= dayMs) last24h += 1;
    if (e.outcome === 'failed') failedCount += 1;
    if (e.outcome === 'blocked') blockedCount += 1;
    if (e.category === 'auth' || e.category === 'security') authEvents += 1;
    if (e.category === 'money') moneyEvents += 1;
    if (e.outcome === 'failed' || e.outcome === 'blocked' || e.severity === 'high' || e.severity === 'critical') {
      securityAlerts += 1;
    }
    if (e.actorType === 'customer' || e.actorType === 'anonymous') customerEvents += 1;
    else adminEvents += 1;
  }

  return {
    total: entries.length,
    last24h,
    failedCount,
    blockedCount,
    authEvents,
    moneyEvents,
    securityAlerts,
    customerEvents,
    adminEvents,
  };
}
