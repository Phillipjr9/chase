/* -------------------------------------------------------------------------- */
/* Admin Console — Users Directory, Activity Generator & Full Profile Studio  */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Eye,
  KeyRound,
  LogOut,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ExportBtn,
  Modal,
  Pagination,
  SelectInput,
  TextInput,
  downloadCsv,
  fmtDateShort,
  fmtMoneyFull,
} from './ui';
import { AdminTab, AdminUserRow, User, inputDate } from './types';

interface Props {
  users: AdminUserRow[];
  selectedUser: User | null;
  userJson: string;
  onChangeUserJson: (val: string) => void;
  isReadOnly: boolean;
  busy: boolean;
  onSelectUser: (id: string) => void;
  onCreateUser: (payload: {
    username: string;
    fullName: string;
    email: string;
    password: string;
  }) => Promise<boolean>;
  onBulkUsers: (
    ids: string[],
    action: 'suspend' | 'reactivate' | 'delete',
    confirmText?: string
  ) => Promise<boolean>;
  onSaveUserObject: (updated: User, msg?: string) => Promise<boolean>;
  onSaveRawJson: () => Promise<void>;
  onToggleUserStatus: () => Promise<void>;
  onDeleteUser: () => Promise<void>;
  onRevokeSessions: () => Promise<void>;
  onResetUserPassword: (password: string) => Promise<boolean>;
  onGenerateHistory: (payload: {
    startDate: string;
    endDate: string;
    cadence: 'daily' | 'weekly' | 'monthly' | 'yearly';
    perPeriod: number;
  }) => Promise<void>;
  onImpersonate: () => void;
  onNavigate: (tab: AdminTab) => void;
}

export const UsersTab: React.FC<Props> = ({
  users,
  selectedUser,
  userJson,
  onChangeUserJson,
  isReadOnly,
  busy,
  onSelectUser,
  onCreateUser,
  onBulkUsers,
  onSaveUserObject,
  onSaveRawJson,
  onToggleUserStatus,
  onDeleteUser,
  onRevokeSessions,
  onResetUserPassword,
  onGenerateHistory,
  onImpersonate,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);

  const [newCustomerPwd, setNewCustomerPwd] = useState('');
  const [activityStart, setActivityStart] = useState(() => inputDate(90));
  const [activityEnd, setActivityEnd] = useState(() => inputDate(0));
  const [activityCadence, setActivityCadence] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [perPeriod, setPerPeriod] = useState('2');
  const [studioMode, setStudioMode] = useState<'quick' | 'json'>('quick');

  // Quick profile edit local fields synced from selectedUser
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editCreditScore, setEditCreditScore] = useState('742');

  React.useEffect(() => {
    if (selectedUser) {
      setEditName(selectedUser.fullName || '');
      setEditEmail(selectedUser.email || '');
      setEditUsername(selectedUser.username || '');
      setEditCreditScore(String(selectedUser.credit?.score ?? 742));
    }
  }, [selectedUser]);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          (statusFilter === 'all' || u.status === statusFilter) &&
          `${u.fullName} ${u.username} ${u.email} ${u.status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
      ),
    [users, query, statusFilter]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const selectedTotals = useMemo(() => {
    if (!selectedUser) return { deposits: 0, cards: 0, loans: 0, txCount: 0, points: 0 };
    let deposits = 0;
    let cards = 0;
    let loans = 0;
    let txCount = 0;
    let points = 0;
    for (const a of selectedUser.accounts || []) {
      txCount += (a.transactions || []).length;
      points += Number(a.rewardsPoints || 0);
      if (['checking', 'savings', 'cd'].includes(a.type)) deposits += Number(a.balance || 0);
      else if (a.type === 'credit-card') cards += Number(a.balance || 0);
      else loans += Number(a.balance || 0);
    }
    return { deposits, cards, loans, txCount, points };
  }, [selectedUser]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onCreateUser({
      username: newUsername,
      fullName: newFullName,
      email: newEmail,
      password: newPassword,
    });
    if (ok) {
      setCreateOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
    }
  };

  const handleQuickProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const score = Math.min(850, Math.max(300, Math.round(Number(editCreditScore) || 742)));
    const next: User = {
      ...selectedUser,
      fullName: editName.trim(),
      email: editEmail.trim(),
      username: editUsername.trim(),
      credit: selectedUser.credit
        ? { ...selectedUser.credit, score }
        : undefined,
    };
    await onSaveUserObject(next, 'Customer profile & credit score updated.');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left: Customer Directory */}
      <Card className="xl:col-span-5 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Customer profiles ({filtered.length})
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                Select any profile to manage accounts, ledger, or preview banking
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <ExportBtn
                label="CSV"
                onClick={() =>
                  downloadCsv(
                    'simulator-users.csv',
                    ['Username', 'Full Name', 'Email', 'Status', 'Created', 'Accounts', 'Deposits', 'Card Balances'],
                    filtered.map((u) => [
                      u.username,
                      u.fullName,
                      u.email,
                      u.status,
                      u.createdAt,
                      u.accountCount,
                      u.depositBalance,
                      u.cardBalance,
                    ])
                  )
                }
              />
              {!isReadOnly && (
                <Btn variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  New Customer
                </Btn>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <TextInput
                placeholder="Search name, @username, email…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <SelectInput
              aria-label="Filter status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(1);
              }}
            >
              <option value="all">All ({users.length})</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </SelectInput>
          </div>

          {/* Bulk action bar */}
          {selectedIds.length > 0 && !isReadOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 px-3 py-2 text-[12px]">
              <span className="font-semibold text-[#0060F0] dark:text-blue-300">
                {selectedIds.length} selected
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Btn
                  variant="secondary"
                  size="xs"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await onBulkUsers(selectedIds, 'suspend');
                    if (ok) setSelectedIds([]);
                  }}
                >
                  Suspend
                </Btn>
                <Btn
                  variant="secondary"
                  size="xs"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await onBulkUsers(selectedIds, 'reactivate');
                    if (ok) setSelectedIds([]);
                  }}
                >
                  Reactivate
                </Btn>
                <Btn
                  variant="danger"
                  size="xs"
                  disabled={busy}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete
                </Btn>
              </div>
            </div>
          )}
        </div>

        {paged.length === 0 ? (
          <EmptyState title="No customers match your filter" detail="Try clearing the search query or create a new customer." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800/80">
            {paged.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              const isChecked = selectedIds.includes(u.id);
              return (
                <li
                  key={u.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-500/15'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  {!isReadOnly && (
                    <Checkbox
                      checked={isChecked}
                      aria-label={`Select ${u.username}`}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...new Set([...prev, u.id])] : prev.filter((id) => id !== u.id)
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectUser(u.id)}
                    className="flex-1 flex items-center justify-between gap-3 text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={u.fullName} size={34} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-semibold text-gray-900 dark:text-white truncate">
                            {u.fullName}
                          </span>
                          <Badge tone={u.status === 'active' ? 'success' : 'error'}>
                            {u.status}
                          </Badge>
                        </div>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                          @{u.username} · {u.email}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                        {fmtMoneyFull(u.depositBalance)}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                        {u.accountCount} accts · Card {fmtMoneyFull(u.cardBalance)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
          noun="customers"
        />
      </Card>

      {/* Right: Customer Studio */}
      <div className="xl:col-span-7 space-y-5">
        {!selectedUser ? (
          <Card className="p-10">
            <EmptyState
              title="Select a customer profile"
              detail="Pick any customer from the directory on the left to inspect accounts, generate realistic ledger history, edit JSON state, or launch an impersonation preview."
            />
          </Card>
        ) : (
          <>
            {/* Customer Summary & Operator Actions */}
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar name={selectedUser.fullName} size={48} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">
                        {selectedUser.fullName}
                      </h2>
                      <Badge tone={selectedUser.status === 'suspended' ? 'error' : 'success'}>
                        {selectedUser.status || 'active'}
                      </Badge>
                      {selectedUser.credit?.score && (
                        <Badge tone="primary">VantageScore {selectedUser.credit.score}</Badge>
                      )}
                    </div>
                    <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                      @{selectedUser.username} · {selectedUser.email} · Enrolled{' '}
                      {fmtDateShort(selectedUser.createdAt)}
                    </p>
                  </div>
                </div>

                {!isReadOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="primary" size="sm" disabled={busy} onClick={onImpersonate}>
                      <Eye className="w-4 h-4" />
                      Switch to customer
                    </Btn>
                    <Btn variant="secondary" size="sm" disabled={busy} onClick={onToggleUserStatus}>
                      {selectedUser.status === 'suspended' ? (
                        <>
                          <UserCheck className="w-4 h-4 text-[#12B76A]" /> Reactivate
                        </>
                      ) : (
                        <>
                          <UserX className="w-4 h-4 text-[#F79009]" /> Suspend
                        </>
                      )}
                    </Btn>
                    <Btn variant="secondary" size="sm" disabled={busy} onClick={onRevokeSessions}>
                      <LogOut className="w-3.5 h-3.5" />
                      Revoke Sessions
                    </Btn>
                    <Btn
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeleteUserOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Btn>
                  </div>
                )}
              </div>

              {/* Portfolio mini-metrics */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('accounts')}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-[#0060F0] transition-colors cursor-pointer"
                >
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Deposits</p>
                  <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                    {fmtMoneyFull(selectedTotals.deposits)}
                  </p>
                  <p className="text-[11px] text-[#0060F0] mt-0.5">
                    {selectedUser.accounts.length} accounts →
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('accounts')}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-[#0060F0] transition-colors cursor-pointer"
                >
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Card Balances</p>
                  <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                    {fmtMoneyFull(selectedTotals.cards)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {selectedTotals.points.toLocaleString()} UR pts
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('transactions')}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-[#0060F0] transition-colors cursor-pointer"
                >
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Ledger Entries</p>
                  <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                    {selectedTotals.txCount.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-[#0060F0] mt-0.5">Open ledger →</p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('operations')}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-[#0060F0] transition-colors cursor-pointer"
                >
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Schedules &amp; Disputes</p>
                  <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                    {(selectedUser.scheduledPayments || []).length} / {(selectedUser.disputes || []).length}
                  </p>
                  <p className="text-[11px] text-[#0060F0] mt-0.5">Manage ops →</p>
                </button>
              </div>
            </Card>

            {/* Customer activity history generator */}
            <Card className="p-5">
              <CardHeader
                title="Customer activity generator"
                subtitle="Synthesize realistic payroll deposits, merchant card purchases, transfers, interest, and loan payments across any date range"
                action={<Badge tone="violet">Activity engine</Badge>} 
              />
              {selectedUser.accounts.length === 0 && (
                <p className="mt-3 text-sm text-amber-700">Create an account for this customer in Accounts &amp; cards before generating transactions.</p>
              )}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Start Date
                  </span>
                  <TextInput
                    type="date"
                    value={activityStart}
                    onChange={(e) => setActivityStart(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    End Date
                  </span>
                  <TextInput
                    type="date"
                    value={activityEnd}
                    onChange={(e) => setActivityEnd(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Cadence
                  </span>
                  <SelectInput
                    value={activityCadence}
                    onChange={(e) => setActivityCadence(e.target.value as typeof activityCadence)}
                    className="w-full"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </SelectInput>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Events / Period (1–5)
                  </span>
                  <TextInput
                    type="number"
                    min={1}
                    max={5}
                    value={perPeriod}
                    onChange={(e) => setPerPeriod(e.target.value)}
                  />
                </label>
                <Btn
                  variant="primary"
                  disabled={busy || isReadOnly || selectedUser.accounts.length === 0}
                  onClick={() =>
                    void onGenerateHistory({
                      startDate: activityStart,
                      endDate: activityEnd,
                      cadence: activityCadence,
                      perPeriod: Number(perPeriod) || 1,
                    })
                  }
                >
                  <Sparkles className="w-4 h-4" />
                  Generate
                </Btn>
              </div>
            </Card>

            {/* Profile Editor + Full JSON Record Studio */}
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                    Customer Record &amp; Credentials Studio
                  </h3>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400">
                    Edit identity, VantageScore, password, or full raw JSON simulator record (accounts, rewards, investments, budgets)
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStudioMode('quick')}
                    className={`px-3 py-1 rounded-md text-[12px] font-semibold cursor-pointer ${
                      studioMode === 'quick'
                        ? 'bg-white dark:bg-[#0060F0] text-[#0060F0] dark:text-white shadow-xs'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    Form Controls
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioMode('json')}
                    className={`px-3 py-1 rounded-md text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      studioMode === 'json'
                        ? 'bg-white dark:bg-[#0060F0] text-[#0060F0] dark:text-white shadow-xs'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Full JSON Record
                  </button>
                </div>
              </div>

              {studioMode === 'quick' ? (
                <div className="mt-4 space-y-5">
                  <form onSubmit={handleQuickProfileSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label className="block">
                      <span className="block text-[11.5px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Full Name
                      </span>
                      <TextInput
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11.5px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Username
                      </span>
                      <TextInput
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11.5px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Email Address
                      </span>
                      <TextInput
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11.5px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Credit score (300–850)
                      </span>
                      <TextInput
                        type="number"
                        min={300}
                        max={850}
                        value={editCreditScore}
                        onChange={(e) => setEditCreditScore(e.target.value)}
                      />
                    </label>
                    <div className="sm:col-span-2 flex justify-end">
                      <Btn type="submit" variant="primary" disabled={busy || isReadOnly}>
                        <CheckCircle2 className="w-4 h-4" />
                        Save Profile Changes
                      </Btn>
                    </div>
                  </form>

                  {/* Password Reset Subpanel */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-[#0060F0]" />
                      Reset Customer Password
                    </p>
                    <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Sets a new password (8+ characters) and immediately revokes active customer sessions.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <TextInput
                        type="password"
                        placeholder="New password (8+ chars)"
                        value={newCustomerPwd}
                        onChange={(e) => setNewCustomerPwd(e.target.value)}
                        className="max-w-[260px]"
                      />
                      <Btn
                        variant="secondary"
                        disabled={busy || isReadOnly || newCustomerPwd.length < 8}
                        onClick={async () => {
                          const ok = await onResetUserPassword(newCustomerPwd);
                          if (ok) setNewCustomerPwd('');
                        }}
                      >
                        Reset Password
                      </Btn>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <textarea
                    aria-label="Simulator customer JSON record"
                    value={userJson}
                    onChange={(e) => onChangeUserJson(e.target.value)}
                    rows={16}
                    spellCheck={false}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-950 text-emerald-300 font-mono text-[12px] leading-relaxed p-4 outline-none focus:border-[#0060F0]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Btn
                        variant="secondary"
                        size="xs"
                        onClick={() => onChangeUserJson(JSON.stringify(selectedUser, null, 2))}
                      >
                        Discard Unsaved Edits
                      </Btn>
                    </div>
                    <Btn
                      variant="primary"
                      size="sm"
                      disabled={busy || isReadOnly}
                      onClick={() => void onSaveRawJson()}
                    >
                      Save Full Simulator Record
                    </Btn>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Create New Customer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create customer profile"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={busy} onClick={(e) => void handleCreateSubmit(e as any)}>
              Create Customer
            </Btn>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-3.5">
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
            Provisions a complete Chase household with checking, savings, Sapphire Preferred card, payees, investments, and credit profile.
          </p>
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username (4–32 chars)
            </span>
            <TextInput
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. sarah.connor"
              required
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name
            </span>
            <TextInput
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="e.g. Sarah Connor"
              required
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </span>
            <TextInput
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="sarah@example.com"
              required
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
              Initial Password (8+ chars)
            </span>
            <TextInput
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
        </form>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => {
          setBulkDeleteOpen(false);
          setBulkDeleteConfirm('');
        }}
        title={`Delete ${selectedIds.length} selected customers`}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || bulkDeleteConfirm !== 'DELETE SELECTED USERS'}
              onClick={async () => {
                const ok = await onBulkUsers(selectedIds, 'delete', bulkDeleteConfirm);
                if (ok) {
                  setSelectedIds([]);
                  setBulkDeleteConfirm('');
                  setBulkDeleteOpen(false);
                }
              }}
            >
              Permanently Delete
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          This permanently removes <strong>{selectedIds.length}</strong> customer profiles and their accounts. Type{' '}
          <code className="font-mono font-bold text-[#F04438]">DELETE SELECTED USERS</code> to confirm:
        </p>
        <TextInput
          className="mt-3"
          value={bulkDeleteConfirm}
          onChange={(e) => setBulkDeleteConfirm(e.target.value)}
          placeholder="DELETE SELECTED USERS"
        />
      </Modal>

      {/* Single Delete Modal */}
      <Modal
        open={deleteUserOpen}
        onClose={() => setDeleteUserOpen(false)}
        title="Delete customer"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteUserOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await onDeleteUser();
                setDeleteUserOpen(false);
              }}
            >
              Delete Customer
            </Btn>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#F04438] shrink-0 mt-0.5" />
          <p className="text-[13px] text-gray-600 dark:text-gray-300">
            Permanently delete simulator profile <strong>{selectedUser?.fullName}</strong> (@
            {selectedUser?.username}) and all attached accounts, transactions, and sessions?
          </p>
        </div>
      </Modal>
    </div>
  );
};
