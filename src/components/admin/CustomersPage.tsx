/* -------------------------------------------------------------------------- */
/* Admin Console — Customers (data table + management drawer)                  */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  UserCog,
  Snowflake,
  Sun,
  LogOut,
  Scale,
  ChevronRight,
  Users,
  CreditCard,
  ShieldCheck,
  CalendarClock,
} from 'lucide-react';
import {
  AdminCustomerDetail,
  AdminCustomerSummary,
  User,
  adminAdjustBalance,
  adminCustomerDetail,
  adminCustomers,
  adminSetCustomerRole,
  adminSetCustomerStatus,
  adminSignOutCustomer,
} from '../../banking/store';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  Checkbox,
  EmptyState,
  ExportBtn,
  Modal,
  Pagination,
  RolePill,
  SelectInput,
  Skeleton,
  StatusPill,
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtDateShort,
  fmtDateTime,
  fmtMoneyFull,
  fmtSignedMoney,
  pushToast,
  relTime,
} from './ui';
import { Drawer } from './ui';
import { fmtCompactMoney } from './charts';

const ACCOUNT_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  'credit-card': 'Credit card',
  cd: 'CD',
  mortgage: 'Mortgage',
  'auto-loan': 'Auto loan',
};

interface Props {
  actor: User;
  focusId: string | null;
  onFocusHandled: () => void;
  onChanged: () => void;
}

export const CustomersPage: React.FC<Props> = ({ actor, focusId, onFocusHandled, onChanged }) => {
  const [rows, setRows] = useState<AdminCustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'frozen'>('all');
  const [role, setRole] = useState<'all' | 'admin' | 'member'>('all');
  const [sort, setSort] = useState('joined-desc');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* Modals */
  const [freezeTarget, setFreezeTarget] = useState<AdminCustomerSummary | null>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [roleTarget, setRoleTarget] = useState<AdminCustomerSummary | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<AdminCustomerSummary | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdminCustomerSummary | null>(null);
  const [adjustAccount, setAdjustAccount] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [busy, setBusy] = useState(false);

  /* Debounced search */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminCustomers({ q, status, role, sort, page, pageSize });
      setRows(data.customers);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [q, status, role, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  /* External focus request (from global search / overview) */
  useEffect(() => {
    if (focusId) {
      setDrawerId(focusId);
      onFocusHandled();
    }
  }, [focusId, onFocusHandled]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await adminCustomerDetail(id));
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load customer.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (drawerId) loadDetail(drawerId);
    else setDetail(null);
  }, [drawerId, loadDetail]);

  const onSort = (key: string) => {
    setSort((prev) => {
      if (prev.startsWith(key)) return prev.endsWith('-asc') ? `${key}-desc` : `${key}-asc`;
      return key === 'name' ? 'name-asc' : `${key}-desc`;
    });
    setPage(1);
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (nextStatus: 'active' | 'frozen') => {
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        await adminSetCustomerStatus(actor, id, nextStatus, nextStatus === 'frozen' ? 'Bulk action from customer table' : undefined);
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setSelected(new Set());
    pushToast(failed ? 'error' : 'success', `${nextStatus === 'frozen' ? 'Froze' : 'Reactivated'} ${done} customer${done === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`);
    await load();
    onChanged();
  };

  const exportCsv = () => {
    downloadCsv(
      `chase-customers-page${page}.csv`,
      ['Name', 'Username', 'Email', 'Phone', 'Role', 'Status', 'Accounts', 'Deposits', 'Liabilities', 'Joined', 'Last login'],
      rows.map((r) => [r.fullName, r.username, r.email, r.phone, r.role, r.status, r.accountCount, r.deposits.toFixed(2), r.liabilities.toFixed(2), r.joinedAt, r.lastLoginAt || ''])
    );
    pushToast('info', `Exported ${rows.length} customers on page ${page}.`);
  };

  /* ---------------------------- Drawer actions ---------------------------- */

  const submitFreeze = async () => {
    if (!freezeTarget) return;
    setBusy(true);
    try {
      await adminSetCustomerStatus(actor, freezeTarget.id, 'frozen', freezeReason.trim() || undefined);
      pushToast('success', `${freezeTarget.fullName}'s account was frozen and all sessions ended.`);
      setFreezeTarget(null);
      setFreezeReason('');
      await Promise.all([load(), drawerId === freezeTarget.id ? loadDetail(freezeTarget.id) : Promise.resolve()]);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to freeze account.');
    } finally {
      setBusy(false);
    }
  };

  const submitUnfreeze = async (target: AdminCustomerSummary) => {
    setBusy(true);
    try {
      await adminSetCustomerStatus(actor, target.id, 'active');
      pushToast('success', `${target.fullName}'s account was reactivated.`);
      await Promise.all([load(), drawerId === target.id ? loadDetail(target.id) : Promise.resolve()]);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to reactivate account.');
    } finally {
      setBusy(false);
    }
  };

  const submitRole = async () => {
    if (!roleTarget) return;
    const nextRole = roleTarget.role === 'admin' ? 'member' : 'admin';
    setBusy(true);
    try {
      await adminSetCustomerRole(actor, roleTarget.id, nextRole);
      pushToast('success', `${roleTarget.fullName} is now ${nextRole === 'admin' ? 'an administrator' : 'a regular member'}.`);
      setRoleTarget(null);
      await Promise.all([load(), drawerId === roleTarget.id ? loadDetail(roleTarget.id) : Promise.resolve()]);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to change role.');
    } finally {
      setBusy(false);
    }
  };

  const submitSignOut = async () => {
    if (!signOutTarget) return;
    setBusy(true);
    try {
      await adminSignOutCustomer(actor, signOutTarget.id);
      pushToast('success', `Ended all sessions for ${signOutTarget.fullName}.`);
      setSignOutTarget(null);
      if (drawerId === signOutTarget.id) await loadDetail(signOutTarget.id);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to sign out customer.');
    } finally {
      setBusy(false);
    }
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const amount = Number(adjustAmount);
    if (!adjustAccount) {
      pushToast('error', 'Choose an account to adjust.');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      pushToast('error', 'Enter a non-zero adjustment amount.');
      return;
    }
    if (!adjustReason.trim()) {
      pushToast('error', 'A reason is required for audit purposes.');
      return;
    }
    setBusy(true);
    try {
      await adminAdjustBalance(actor, adjustTarget.id, adjustAccount, amount, adjustReason.trim());
      pushToast('success', `Applied ${fmtSignedMoney(amount)} adjustment to ${adjustTarget.fullName}'s account.`);
      setAdjustTarget(null);
      setAdjustAccount('');
      setAdjustAmount('');
      setAdjustReason('');
      await Promise.all([load(), drawerId === adjustTarget.id ? loadDetail(adjustTarget.id) : Promise.resolve()]);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Adjustment failed.');
    } finally {
      setBusy(false);
    }
  };

  const drawerSummary = detail?.summary || rows.find((r) => r.id === drawerId) || null;

  const filterCount = useMemo(
    () => (q ? 1 : 0) + (status !== 'all' ? 1 : 0) + (role !== 'all' ? 1 : 0),
    [q, status, role]
  );

  return (
    <div className="space-y-5">
      <Card>
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 pt-5 pb-4">
          <div className="relative flex-1 max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <TextInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, username, or email…"
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
            </SelectInput>
            <SelectInput value={role} onChange={(e) => { setRole(e.target.value as typeof role); setPage(1); }} aria-label="Filter by role">
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="member">Members</option>
            </SelectInput>
            {filterCount > 0 && (
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => { setSearchInput(''); setStatus('all'); setRole('all'); setPage(1); }}
              >
                Clear filters ({filterCount})
              </Btn>
            )}
            <div className="ml-auto flex items-center gap-2">
              {selected.size > 0 && (
                <>
                  <span className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">{selected.size} selected</span>
                  <Btn variant="danger" size="sm" disabled={busy} onClick={() => runBulk('frozen')}>
                    <Snowflake className="w-3.5 h-3.5" /> Freeze
                  </Btn>
                  <Btn variant="success" size="sm" disabled={busy} onClick={() => runBulk('active')}>
                    <Sun className="w-3.5 h-3.5" /> Reactivate
                  </Btn>
                </>
              )}
              <ExportBtn onClick={exportCsv} disabled={rows.length === 0} />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading && rows.length === 0 ? (
          <div className="px-5 pb-5 space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="No customers match your filters"
            detail="Try a different search term, or clear the filters to see everyone."
          />
        ) : (
          <TableShell>
            <thead className="border-y border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all customers on this page" />
                </th>
                <Th sortKey="name" activeSort={sort} onSort={onSort}>Customer</Th>
                <Th>Role / Status</Th>
                <Th className="text-right">Accounts</Th>
                <Th sortKey="deposits" activeSort={sort} onSort={onSort} className="text-right">Deposits</Th>
                <Th className="text-right">Liabilities</Th>
                <Th sortKey="joined" activeSort={sort} onSort={onSort}>Joined</Th>
                <Th>Last login</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${selected.has(r.id) ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}`}
                >
                  <Td>
                    <Checkbox checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`Select ${r.fullName}`} />
                  </Td>
                  <Td>
                    <button type="button" onClick={() => setDrawerId(r.id)} className="flex items-center gap-3 cursor-pointer text-left group">
                      <Avatar name={r.fullName} size={36} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-gray-800 dark:text-white/90 group-hover:text-[#0060F0] dark:group-hover:text-[#5EA0EF] transition-colors truncate">
                          {r.fullName}
                        </span>
                        <span className="block text-[11.5px] text-gray-400 dark:text-gray-500 truncate">@{r.username} · {r.email}</span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <RolePill role={r.role} />
                      <StatusPill status={r.status} />
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{r.accountCount}</Td>
                  <Td className="text-right font-semibold tabular-nums text-gray-800 dark:text-white/90">{fmtMoneyFull(r.deposits)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.liabilities > 0 ? (
                      <span>
                        {fmtCompactMoney(r.liabilities)}
                        {r.flaggedCount > 0 && <Badge tone="error" className="ml-1.5">{r.flaggedCount} flagged</Badge>}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDateShort(r.joinedAt)}</Td>
                  <Td className="whitespace-nowrap text-gray-500 dark:text-gray-400">{relTime(r.lastLoginAt)}</Td>
                  <Td>
                    <span className="flex items-center justify-end gap-1">
                      {r.status === 'active' ? (
                        <Btn variant="ghost" size="xs" onClick={() => { setFreezeTarget(r); setFreezeReason(''); }} aria-label={`Freeze ${r.fullName}`} title="Freeze account">
                          <Snowflake className="w-3.5 h-3.5 text-[#0BA5EC]" />
                        </Btn>
                      ) : (
                        <Btn variant="ghost" size="xs" onClick={() => submitUnfreeze(r)} aria-label={`Reactivate ${r.fullName}`} title="Reactivate account">
                          <Sun className="w-3.5 h-3.5 text-[#F79009]" />
                        </Btn>
                      )}
                      <Btn variant="ghost" size="xs" onClick={() => setDrawerId(r.id)} aria-label={`View ${r.fullName}`} title="View details">
                        <ChevronRight className="w-4 h-4" />
                      </Btn>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPage={setPage} noun="customers" />
      </Card>

      {/* ------------------------------ Drawer ------------------------------ */}
      <Drawer
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        title={
          drawerSummary ? (
            <span className="flex items-center gap-3">
              <Avatar name={drawerSummary.fullName} size={40} />
              <span>
                <span className="block">{drawerSummary.fullName}</span>
                <span className="block text-[12px] font-normal text-gray-400 dark:text-gray-500">@{drawerSummary.username}</span>
              </span>
            </span>
          ) : (
            'Customer'
          )
        }
        subtitle={drawerSummary ? <span className="flex items-center gap-1.5"><RolePill role={drawerSummary.role} /><StatusPill status={drawerSummary.status} /></span> : undefined}
      >
        {detailLoading && !detail ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail ? (
          <div className="space-y-6 pb-4">
            {/* Management actions */}
            <div className="grid grid-cols-2 gap-2">
              {detail.summary.status === 'active' ? (
                <Btn variant="danger" size="md" onClick={() => { setFreezeTarget(detail.summary); setFreezeReason(''); }}>
                  <Snowflake className="w-4 h-4" /> Freeze account
                </Btn>
              ) : (
                <Btn variant="success" size="md" onClick={() => submitUnfreeze(detail.summary)}>
                  <Sun className="w-4 h-4" /> Reactivate account
                </Btn>
              )}
              <Btn variant="secondary" size="md" onClick={() => setAdjustTarget(detail.summary)}>
                <Scale className="w-4 h-4" /> Adjust balance
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => setRoleTarget(detail.summary)}>
                <UserCog className="w-4 h-4" />
                {detail.summary.role === 'admin' ? 'Revoke admin' : 'Make admin'}
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => setSignOutTarget(detail.summary)}>
                <LogOut className="w-4 h-4" /> Force sign-out
              </Btn>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Deposits', value: fmtCompactMoney(detail.summary.deposits) },
                { label: 'Liabilities', value: fmtCompactMoney(detail.summary.liabilities) },
                { label: 'Transactions', value: String(detail.summary.txCount) },
                { label: 'Credit score', value: detail.creditScore ? String(detail.creditScore) : '—' },
                { label: 'Sessions', value: String(detail.sessions) },
                { label: 'Disputes', value: String(detail.disputes.filter((d) => d.status === 'open').length) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2.5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-[15px] font-bold text-gray-800 dark:text-white/90 tabular-nums mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Profile */}
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2.5">Profile</h4>
              <dl className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 text-[13px]">
                {[
                  ['Email', detail.summary.email],
                  ['Phone', detail.summary.phone || '—'],
                  ['Address', detail.summary.address || '—'],
                  ['Joined', fmtDateTime(detail.summary.joinedAt)],
                  ['Last login', detail.summary.lastLoginAt ? fmtDateTime(detail.summary.lastLoginAt) : 'Never'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <dt className="text-gray-500 dark:text-gray-400 shrink-0">{k}</dt>
                    <dd className="text-gray-800 dark:text-gray-100 text-right break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Accounts */}
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2.5">
                Accounts ({detail.accounts.length})
              </h4>
              <ul className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {detail.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0060F0] dark:bg-blue-500/15 dark:text-[#5EA0EF] shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-gray-800 dark:text-white/90 truncate">{a.name}</span>
                      <span className="block text-[11.5px] text-gray-400 dark:text-gray-500">
                        {ACCOUNT_LABELS[a.type] || a.type} · ••••{a.mask} · {a.txCount} tx
                        {a.locked ? ' · locked' : ''}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold text-gray-800 dark:text-white/90 tabular-nums shrink-0">
                      {fmtMoneyFull(a.balance)}
                    </span>
                  </li>
                ))}
                {detail.accounts.length === 0 && (
                  <li className="px-4 py-4 text-[12.5px] text-gray-400">No accounts on file.</li>
                )}
              </ul>
            </section>

            {/* Recent transactions */}
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2.5">
                Recent transactions
              </h4>
              <ul className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {detail.recentTx.map((t) => (
                  <li key={`${t.accountId}-${t.id}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-medium text-gray-800 dark:text-white/90 truncate">
                        {t.description}
                        {t.flagged && <Badge tone="error" className="ml-1.5">flagged</Badge>}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                        {relTime(t.date)} · {t.accountName} (••{t.accountMask}) · {t.category}
                      </span>
                    </span>
                    <span className={`text-[12.5px] font-semibold tabular-nums shrink-0 ${t.amount >= 0 ? 'text-success-600 dark:text-[#32D583]' : 'text-gray-800 dark:text-white/90'}`}>
                      {fmtSignedMoney(t.amount)}
                    </span>
                  </li>
                ))}
                {detail.recentTx.length === 0 && (
                  <li className="px-4 py-4 text-[12.5px] text-gray-400">No transactions recorded.</li>
                )}
              </ul>
            </section>

            {/* Scheduled + security */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11.5px] text-gray-500 dark:text-gray-400">
                  <CalendarClock className="w-3.5 h-3.5" /> Scheduled payments
                </p>
                <p className="text-[16px] font-bold text-gray-800 dark:text-white/90 mt-1">{detail.scheduledPayments.length}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11.5px] text-gray-500 dark:text-gray-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> Two-factor auth
                </p>
                <p className="mt-1">
                  {detail.security?.twoFactor ? <Badge tone="success">enabled</Badge> : <Badge tone="warning">disabled</Badge>}
                </p>
              </div>
            </section>
          </div>
        ) : (
          <EmptyState title="Customer not found" />
        )}
      </Drawer>

      {/* ------------------------------- Modals ------------------------------ */}
      <Modal
        open={!!freezeTarget}
        onClose={() => !busy && setFreezeTarget(null)}
        title={`Freeze ${freezeTarget?.fullName || ''}?`}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setFreezeTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" size="sm" onClick={submitFreeze} disabled={busy}>{busy ? 'Freezing…' : 'Freeze account'}</Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          Freezing blocks sign-in, ends all active sessions, and revokes API access immediately. The action is written to the audit log.
        </p>
        <label className="block mt-4">
          <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Reason (optional, stored in audit log)</span>
          <TextInput
            value={freezeReason}
            onChange={(e) => setFreezeReason(e.target.value)}
            placeholder="e.g. Suspicious activity reported by customer"
            className="mt-1.5"
            autoFocus
          />
        </label>
      </Modal>

      <Modal
        open={!!roleTarget}
        onClose={() => !busy && setRoleTarget(null)}
        title={roleTarget?.role === 'admin' ? 'Revoke administrator access?' : 'Grant administrator access?'}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setRoleTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={submitRole} disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          {roleTarget?.role === 'admin'
            ? `${roleTarget?.fullName} will lose access to the Admin Console, including customer management and the audit log.`
            : `${roleTarget?.fullName} will gain full access to the Admin Console: customer management, transaction monitoring, disputes, and the audit log.`}
        </p>
      </Modal>

      <Modal
        open={!!signOutTarget}
        onClose={() => !busy && setSignOutTarget(null)}
        title={`Force sign-out for ${signOutTarget?.fullName || ''}?`}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setSignOutTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={submitSignOut} disabled={busy}>{busy ? 'Working…' : 'End all sessions'}</Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          Every active session token for this customer will be invalidated. They will need to sign in again on all devices.
        </p>
      </Modal>

      <Modal
        open={!!adjustTarget}
        onClose={() => !busy && setAdjustTarget(null)}
        title={`Adjust balance — ${adjustTarget?.fullName || ''}`}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setAdjustTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={submitAdjust} disabled={busy}>{busy ? 'Applying…' : 'Apply adjustment'}</Btn>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Account</span>
            <SelectInput className="w-full mt-1.5" value={adjustAccount} onChange={(e) => setAdjustAccount(e.target.value)}>
              <option value="">Select an account…</option>
              {(detail && adjustTarget && detail.summary.id === adjustTarget.id ? detail.accounts : []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (••••{a.mask}) — {fmtMoneyFull(a.balance)}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Amount (negative to debit)</span>
            <TextInput
              type="number"
              step="0.01"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. 250.00 or -75.50"
              className="mt-1.5"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Reason (required — recorded in the audit log and on the transaction)</span>
            <TextInput
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Fee reimbursement per case #4417"
              className="mt-1.5"
            />
          </label>
          <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
            Adjustments post immediately as an “Admin adjustment” transaction and appear in the customer's activity feed.
          </p>
        </div>
      </Modal>
    </div>
  );
};
