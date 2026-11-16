/**
 * Comprehensive verification suite for all Super Admin, linked Admin/Customer
 * identity, delegation, capability, auditor, ownership, session revocation,
 * backup/restore, and security controls.
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3009';
const ROOT_USER = process.env.CHASE_ADMIN_USERNAME || 'dianasmith6525@gmail.com';
const ROOT_PASS =
  process.env.CHASE_ADMIN_PASSWORD ||
  process.env.TEST_ROOT_PASSWORD ||
  'Temporary-test-password-92!';

async function api(path, { method, body, token, expected = 200, headers = {} } = {}) {
  const m = method || (body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`${BASE}${path}`, {
    method: m,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(res.status, expected, `${m} ${path}: expected ${expected}, got ${res.status} ${JSON.stringify(data)}`);
  return data;
}

/* 1. Root login returns full metadata; query-param _ast is rejected; 12 successful logins don't trip rate limit */
const rootLogin = await api('/api/admin/login', { body: { username: ROOT_USER, password: ROOT_PASS } });
assert.equal(rootLogin.admin.isSuperAdmin, true);
assert.equal(rootLogin.admin.role, 'admin');
assert.ok(rootLogin.admin.permissions && rootLogin.admin.capabilities);
let root = rootLogin.token;

// Verify ?_ast= query token is rejected
const astRes = await fetch(`${BASE}/api/admin/me?_ast=${encodeURIComponent(root)}`);
assert.equal(astRes.status, 401, 'admin token in _ast query string must be rejected');

// Verify successful logins do NOT trigger rate limit (12 consecutive valid logins)
for (let i = 0; i < 12; i += 1) {
  await api('/api/admin/login', { body: { username: ROOT_USER, password: ROOT_PASS } });
}

/* 2. Super Admin session revocation */
const oldRootSession = (await api('/api/admin/login', { body: { username: ROOT_USER, password: ROOT_PASS } })).token;
const revokeRes = await api('/api/admin/me/revoke-all-sessions', { method: 'POST', token: root, body: {} });
assert.ok(revokeRes.token, 'revoke-all-sessions issues fresh active token');
await api('/api/admin/me', { token: oldRootSession, expected: 401 });
root = revokeRes.token;
assert.equal((await api('/api/admin/me', { token: root })).admin.isSuperAdmin, true);

/* 3. Create staff admin WITH linked personal customer profile + unified switching */
const linkedCreated = await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: {
    username: 'staff.linked',
    fullName: 'Staff Linked One',
    password: 'LinkedStaffPassword1!',
    role: 'admin',
    createCustomerProfile: true,
    email: 'staff.linked@example.test',
  },
});
assert.equal(linkedCreated.admin.linkedUserId, linkedCreated.user.id);
assert.equal(linkedCreated.user.ownerAdminId ?? null, null);

// Customer login returns linkedAdmin metadata, and /api/auth/me includes linkedAdmin
const linkedCustLogin = await api('/api/auth/login', {
  body: { username: 'staff.linked', password: 'LinkedStaffPassword1!' },
});
assert.equal(linkedCustLogin.linkedAdmin.id, linkedCreated.admin.id);
assert.equal(linkedCustLogin.linkedAdmin.role, 'admin');
const linkedCustMe = await api('/api/auth/me', { token: linkedCustLogin.token });
assert.equal(linkedCustMe.linkedAdmin.id, linkedCreated.admin.id);

// Customer -> Admin switch works seamlessly
const switchedToAdmin = await api('/api/auth/switch-to-admin', {
  token: linkedCustLogin.token,
  body: {},
});
assert.equal(switchedToAdmin.admin.username, 'staff.linked');
assert.equal(switchedToAdmin.admin.linkedUserId, linkedCreated.user.id);

// Admin -> Customer switch works seamlessly
const switchedToCust = await api('/api/admin/switch-to-customer', {
  token: switchedToAdmin.token,
  body: {},
});
assert.equal(switchedToCust.user.id, linkedCreated.user.id);
assert.equal(switchedToCust.linkedAdmin.id, linkedCreated.admin.id);

// Impersonation session NEVER exposes linkedAdmin or allows switch-to-admin
const impersonated = await api(`/api/admin/users/${linkedCreated.user.id}/impersonate`, {
  token: root,
  body: {},
});
const impMe = await api('/api/auth/me', { token: impersonated.token });
assert.equal(impMe.linkedAdmin, undefined, 'impersonated session must not expose linkedAdmin');
await api('/api/auth/switch-to-admin', { token: impersonated.token, body: {}, expected: 403 });

/* 4. Linked password length (10+), preserve customer session, fullName sync, revoke-sessions, suspended 403 */
// Customer change-password enforces 10+ chars for linked admins
await api('/api/auth/change-password', {
  token: switchedToCust.token,
  expected: 400,
  body: { currentPassword: 'LinkedStaffPassword1!', newPassword: 'short89!' },
});
await api('/api/auth/change-password', {
  token: switchedToCust.token,
  body: { currentPassword: 'LinkedStaffPassword1!', newPassword: 'UpdatedLinkedPass99!' },
});
// Current customer session is preserved, while admin session is revoked
await api('/api/auth/me', { token: switchedToCust.token, expected: 200 });
await api('/api/admin/me', { token: switchedToAdmin.token, expected: 401 });

// Admin reset-password enforces 10+ chars for linked admins
await api(`/api/admin/users/${linkedCreated.user.id}/reset-password`, {
  token: root,
  expected: 400,
  body: { password: 'short999', confirm: true },
});
await api(`/api/admin/users/${linkedCreated.user.id}/reset-password`, {
  token: root,
  body: { password: 'AdminResetPass123!', confirm: true },
});

// Bidirectional fullName sync
await api(`/api/admin/admins/${linkedCreated.admin.id}`, {
  method: 'PUT',
  token: root,
  body: { fullName: 'Staff Linked Renamed' },
});
assert.equal((await api(`/api/admin/users/${linkedCreated.user.id}`, { token: root })).user.fullName, 'Staff Linked Renamed');
const userRec = (await api(`/api/admin/users/${linkedCreated.user.id}`, { token: root })).user;
await api(`/api/admin/users/${linkedCreated.user.id}`, {
  method: 'PUT',
  token: root,
  body: { user: { ...userRec, fullName: 'Staff Linked Final' } },
});
const adminsAfterRename = (await api('/api/admin/admins', { token: root })).admins;
assert.equal(adminsAfterRename.find((a) => a.id === linkedCreated.admin.id).fullName, 'Staff Linked Final');

// revoke-sessions revokes BOTH customer AND linked admin sessions
const freshLinkedAdmin = (await api('/api/admin/login', {
  body: { username: 'staff.linked', password: 'AdminResetPass123!' },
})).token;
const freshLinkedCust = (await api('/api/auth/login', {
  body: { username: 'staff.linked', password: 'AdminResetPass123!' },
})).token;
await api(`/api/admin/users/${linkedCreated.user.id}/revoke-sessions`, { token: root, body: {} });
await api('/api/auth/me', { token: freshLinkedCust, expected: 401 });
await api('/api/admin/me', { token: freshLinkedAdmin, expected: 401 });

// Suspending linked customer yields clear 403 on /api/admin/login
await api('/api/admin/users/bulk', { token: root, body: { ids: [linkedCreated.user.id], action: 'suspend' } });
const suspLogin = await api('/api/admin/login', {
  expected: 403,
  body: { username: 'staff.linked', password: 'AdminResetPass123!' },
});
assert.match(suspLogin.error, /suspended/i);
await api('/api/admin/users/bulk', { token: root, body: { ids: [linkedCreated.user.id], action: 'reactivate' } });

/* 5. Linking standalone staff to new customer & existing customer */
const staffStandalone1 = (await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: { username: 'standalone.one', fullName: 'Standalone One', password: 'StandalonePassword1!', role: 'admin' },
})).admin;
const linkedNew = await api(`/api/admin/admins/${staffStandalone1.id}/link-customer`, {
  token: root,
  expected: 201,
  body: { mode: 'create', email: 'standalone.one@example.test' },
});
assert.equal(linkedNew.admin.linkedUserId, linkedNew.user.id);
await api('/api/auth/login', { body: { username: 'standalone.one', password: 'StandalonePassword1!' } });

const staffStandalone2 = (await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: { username: 'standalone.two', fullName: 'Standalone Two', password: 'StandalonePassword2!', role: 'admin' },
})).admin;
const existingCust = (await api('/api/admin/users', {
  token: root,
  expected: 201,
  body: { username: 'existing.person', fullName: 'Existing Person', email: 'existing@example.test', password: 'ExistingPassword1!' },
})).user;
const linkedExisting = await api(`/api/admin/admins/${staffStandalone2.id}/link-customer`, {
  token: root,
  body: { mode: 'existing', userId: existingCust.id, passwordSource: 'customer', confirm: true },
});
assert.equal(linkedExisting.admin.username, 'existing.person');
assert.equal(linkedExisting.admin.linkedUserId, existingCust.id);
await api('/api/admin/login', { body: { username: 'existing.person', password: 'ExistingPassword1!' } });

// Linked admin's customer cannot be assigned to another limited admin
await api(`/api/admin/users/${existingCust.id}/assign-admin`, {
  method: 'PUT',
  token: root,
  expected: 409,
  body: { adminId: staffStandalone1.id },
});

/* 6. Auditor customer assignment, read-only isolation, own audit log, own password change, no runtime telemetry */
const auditor = (await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: { username: 'auditor.one', fullName: 'Auditor One', password: 'AuditorPassword123!', role: 'auditor' },
})).admin;
const auditedCust = (await api('/api/admin/users', {
  token: root,
  expected: 201,
  body: {
    username: 'audited.cust',
    fullName: 'Audited Customer',
    email: 'audited@example.test',
    password: 'CustomerPassword1!',
    ownerAdminId: auditor.id,
  },
})).user;
assert.equal(auditedCust.ownerAdminId, auditor.id);
const auditorTok = (await api('/api/admin/login', {
  body: { username: 'auditor.one', password: 'AuditorPassword123!' },
})).token;
const auditorUsers = (await api('/api/admin/users', { token: auditorTok })).users;
assert.deepEqual(auditorUsers.map((u) => u.id), [auditedCust.id], 'auditor sees assigned customer');
const auditorOverview = await api('/api/admin/overview', { token: auditorTok });
assert.equal(auditorOverview.analytics.system, undefined, 'non-super-admin overview omits server system telemetry');
const auditorAudit = await api('/api/admin/audit', { token: auditorTok });
assert.ok(auditorAudit.audit.length >= 1 && auditorAudit.audit.every((e) => e.actor === 'auditor.one'), 'auditor sees own audit entries');
// Auditor can change own password
await api('/api/admin/me/password', {
  method: 'PUT',
  token: auditorTok,
  body: { currentPassword: 'AuditorPassword123!', newPassword: 'AuditorNewPassword9!', confirm: true },
});
await api('/api/admin/me', { token: auditorTok, expected: 401 });
const auditorNewTok = (await api('/api/admin/login', {
  body: { username: 'auditor.one', password: 'AuditorNewPassword9!' },
})).token;
// Auditor still blocked on data mutations
await api(`/api/admin/users/${auditedCust.id}/accounts`, {
  token: auditorNewTok,
  expected: 403,
  body: { type: 'checking', name: 'Nope', balance: 10 },
});

/* 7. Limited admin bulk actions on own customers + granular capabilities enforcement */
const opA = (await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: { username: 'op.bulk', fullName: 'Op Bulk', password: 'OpBulkPassword123!', role: 'admin' },
})).admin;
const opATok = (await api('/api/admin/login', { body: { username: 'op.bulk', password: 'OpBulkPassword123!' } })).token;
const opCust1 = (await api('/api/admin/users', {
  token: opATok,
  expected: 201,
  body: { username: 'opcust.one', fullName: 'Op Cust One', email: 'op1@example.test', password: 'CustPassword1!' },
})).user;

// Bulk suspend & reactivate own customer succeeds
await api('/api/admin/users/bulk', { token: opATok, body: { ids: [opCust1.id], action: 'suspend' } });
await api('/api/admin/users/bulk', { token: opATok, body: { ids: [opCust1.id], action: 'reactivate' } });
// Including a foreign customer fails with 404
await api('/api/admin/users/bulk', { token: opATok, expected: 404, body: { ids: [opCust1.id, auditedCust.id], action: 'suspend' } });

// Restrict capabilities and confirm server enforces every one
await api(`/api/admin/admins/${opA.id}`, {
  method: 'PUT',
  token: root,
  body: {
    capabilities: {
      manageAccounts: false,
      editLedger: false,
      impersonateUsers: false,
      manageCustomerAccess: false,
      manageDisputes: false,
      publishNotices: false,
    },
  },
});
await api(`/api/admin/users/${opCust1.id}/accounts`, { token: opATok, expected: 403, body: { type: 'checking', name: 'Blocked', balance: 100 } });
await api(`/api/admin/users/${opCust1.id}/impersonate`, { token: opATok, expected: 403, body: {} });
await api(`/api/admin/users/${opCust1.id}/notice`, { method: 'PUT', token: opATok, expected: 403, body: { notice: { title: 'Hi', message: 'Test', tone: 'info' } } });
await api('/api/admin/users/bulk', { token: opATok, expected: 403, body: { ids: [opCust1.id], action: 'suspend' } });

/* 8. Root supportContact & disabled admin supportContact fallback */
await api('/api/admin/admins/__root__', { method: 'PUT', token: root, expected: 400, body: { role: 'auditor' } });
await api('/api/admin/admins/__root__', {
  method: 'PUT',
  token: root,
  body: { supportContact: { email: 'root.desk@chase-sim.test', phone: '+1 (800) 555-0199' } },
});
const unassignedCust = (await api('/api/admin/users', {
  token: root,
  expected: 201,
  body: { username: 'unassigned.one', fullName: 'Unassigned One', email: 'un@example.test', password: 'CustPassword1!' },
})).user;
const unTok = (await api('/api/auth/login', { body: { username: 'unassigned.one', password: 'CustPassword1!' } })).token;
const unMsgs = await api('/api/messages', { token: unTok });
assert.deepEqual(unMsgs.supportContact, { email: 'root.desk@chase-sim.test', phone: '+1 (800) 555-0199' });

// Set opA supportContact, then disable opA -> opCust1 must NOT see disabled opA's contact (falls back to root)
await api(`/api/admin/admins/${opA.id}`, {
  method: 'PUT',
  token: root,
  body: { supportContact: { email: 'op.disabled@example.test', phone: '+1 (555) 111-2222' } },
});
await api(`/api/admin/admins/${opA.id}`, {
  method: 'PUT',
  token: root,
  body: { status: 'disabled', lockMessage: 'Paused' },
});
const opCustTok = (await api('/api/auth/login', { body: { username: 'opcust.one', password: 'CustPassword1!' } })).token;
const opCustMsgs = await api('/api/messages', { token: opCustTok });
assert.deepEqual(opCustMsgs.supportContact, { email: 'root.desk@chase-sim.test', phone: '+1 (800) 555-0199' });

/* 9. Atomic bulk reassign-and-delete (and preserving linked customer) */
const opB = (await api('/api/admin/admins', {
  token: root,
  expected: 201,
  body: { username: 'op.target', fullName: 'Op Target', password: 'OpTargetPassword1!', role: 'admin' },
})).admin;
// Re-enable opA, delete WITHOUT replacement -> 409; delete WITH replacement -> 200 atomic!
await api(`/api/admin/admins/${opA.id}`, { method: 'PUT', token: root, body: { status: 'active' } });
await api(`/api/admin/admins/${opA.id}`, { method: 'DELETE', token: root, expected: 409, body: { confirm: true } });
const atomicDel = await api(`/api/admin/admins/${opA.id}`, {
  method: 'DELETE',
  token: root,
  body: { confirm: true, replacementAdminId: opB.id },
});
assert.equal(atomicDel.reassignedCount, 1);
assert.equal((await api(`/api/admin/users/${opCust1.id}`, { token: root })).user.ownerAdminId, opB.id);

// Bulk reassign all from opB to Super Admin (null)
const bulkReassign = await api(`/api/admin/admins/${opB.id}/reassign-customers`, {
  token: root,
  body: { replacementAdminId: null },
});
assert.equal(bulkReassign.reassignedCount, 1);
assert.equal((await api(`/api/admin/users/${opCust1.id}`, { token: root })).user.ownerAdminId, null);

/* 10. Full Backup v2 (with adminAccounts) + Audit completeness (failed logins, backup export, admin diffs) */
// Trigger failed logins and verify audit + rate limit on a distinct forwarded IP
for (let i = 0; i < 10; i += 1) {
  await api('/api/admin/login', {
    expected: 401,
    headers: { 'x-forwarded-for': '203.0.113.55' },
    body: { username: 'nonexistent.staff', password: 'wrongpassword' },
  });
}
await api('/api/admin/login', {
  expected: 429,
  headers: { 'x-forwarded-for': '203.0.113.55' },
  body: { username: 'nonexistent.staff', password: 'wrongpassword' },
});

const backupV2 = await api('/api/admin/backup', { token: root });
assert.equal(backupV2.format, 'chase-simulator-backup-v1');
assert.equal(backupV2.backupVersion, 2);
assert.ok(Array.isArray(backupV2.adminAccounts) && backupV2.adminAccounts.length >= 3);

// Users-only restore blocked while linked admins exist
await api('/api/admin/backup', {
  token: root,
  expected: 409,
  body: { ...backupV2, confirmText: 'RESTORE SIMULATOR BACKUP', restoreAdmins: false },
});

// Full restore WITH restoreAdmins: true succeeds atomically!
const fullRestore = await api('/api/admin/backup', {
  token: root,
  body: { ...backupV2, confirmText: 'RESTORE SIMULATOR BACKUP', restoreAdmins: true },
});
assert.equal(fullRestore.usersRestored, backupV2.users.length);
assert.equal(fullRestore.adminsRestored, backupV2.adminAccounts.length);

// Verify audit log recorded failed logins, backup export, and detailed admin diffs
const fullAudit = (await api('/api/admin/audit?limit=5000', { token: root })).audit;
assert.ok(fullAudit.some((e) => e.action === 'Failed admin sign-in attempt'), 'failed admin sign-in audited');
assert.ok(fullAudit.some((e) => e.action === 'Exported simulator backup'), 'backup export audited');
assert.ok(fullAudit.some((e) => e.action === 'Linked customer changed shared password'), 'linked password change audited');
assert.ok(
  fullAudit.some((e) => e.action === 'Updated simulator administrator' && e.details?.changes),
  'admin updates record before/after diffs'
);

console.log('ALL Super Admin, linked identity, view switching, auditor, capabilities, ownership, session revocation, backup v2, and security tests passed!');
