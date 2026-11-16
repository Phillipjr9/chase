/* -------------------------------------------------------------------------- */
/* Admin Console — Accounts Portfolio CRUD & Global/Customer Ledger Studio    */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  Check,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  WalletCards,
} from 'lucide-react';
import type { AccountType } from '../../banking/store';
import { ACCOUNT_TYPE_COLORS } from './charts';
import {
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
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtDateShort,
  fmtMoneyFull,
  fmtSignedMoney,
} from './ui';
import { AdminUserRow, GlobalTransaction, User, inputDate } from './types';

/* ============================== 1. ACCOUNTS TAB ============================ */

interface AccountsProps {
  users: AdminUserRow[];
  selectedUser: User | null;
  isReadOnly: boolean;
  busy: boolean;
  onSelectUser: (id: string) => void;
  onCreateAccount: (payload: {
    type: AccountType;
    name: string;
    balance: number;
    creditLimit?: number;
  }) => Promise<boolean>;
  onSaveAccount: (
    accountId: string,
    patch: {
      name: string;
      balance: number;
      creditLimit: number | null;
      locked: boolean;
      autopay: boolean;
    }
  ) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onBulkAccounts: (
    accountIds: string[],
    action: 'lock' | 'unlock' | 'delete',
    confirmText?: string
  ) => Promise<boolean>;
}

export const AccountsTab: React.FC<AccountsProps> = ({
  users,
  selectedUser,
  isReadOnly,
  busy,
  onSelectUser,
  onCreateAccount,
  onSaveAccount,
  onDeleteAccount,
  onBulkAccounts,
}) => {
  const [newType, setNewType] = useState<AccountType>('checking');
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('2500');
  const [newLimit, setNewLimit] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<
    Record<
      string,
      { name: string; balance: string; creditLimit: string; locked: boolean; autopay: boolean }
    >
  >({});

  React.useEffect(() => {
    setSelectedAccountIds([]);
    if (!selectedUser) {
      setDrafts({});
      return;
    }
    setDrafts(
      Object.fromEntries(
        (selectedUser.accounts || []).map((a) => [
          a.id,
          {
            name: a.name,
            balance: String(a.balance),
            creditLimit: a.creditLimit == null ? '' : String(a.creditLimit),
            locked: !!a.locked,
            autopay: !!a.autopay,
          },
        ])
      )
    );
  }, [selectedUser]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onCreateAccount({
      type: newType,
      name: newName.trim(),
      balance: Number(newBalance) || 0,
      creditLimit: newLimit === '' ? undefined : Number(newLimit),
    });
    if (ok) {
      setNewName('');
      setNewBalance('0');
      setNewLimit('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Customer selector + Create Account */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-4 p-5">
          <CardHeader
            title="Active Customer Portfolio"
            subtitle="Choose whose simulated accounts to inspect or reconcile"
          />
          <div className="mt-3">
            <SelectInput
              aria-label="Choose simulator customer"
              value={selectedUser?.id || ''}
              onChange={(e) => e.target.value && onSelectUser(e.target.value)}
              className="w-full"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username}) — {u.accountCount} accts
                </option>
              ))}
            </SelectInput>
          </div>
          {selectedUser && (
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-[12px]">
              <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
                <span className="text-gray-500 dark:text-gray-400">Liquid Deposits</span>
                <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                  {fmtMoneyFull(
                    selectedUser.accounts
                      .filter((a) => ['checking', 'savings', 'cd'].includes(a.type))
                      .reduce((s, a) => s + Number(a.balance || 0), 0)
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
                <span className="text-gray-500 dark:text-gray-400">Card &amp; Loan Debt</span>
                <p className="mt-0.5 text-[15px] font-bold text-gray-900 dark:text-white tabular-nums">
                  {fmtMoneyFull(
                    selectedUser.accounts
                      .filter((a) => ['credit-card', 'auto-loan', 'mortgage'].includes(a.type))
                      .reduce((s, a) => s + Number(a.balance || 0), 0)
                  )}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-8 p-5">
          <CardHeader
            title="Open New Simulated Account"
            subtitle="Provision checking, savings, CD, credit card, auto loan, or mortgage with instant balance & mask"
          />
          <form onSubmit={handleCreate} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Account Type
              </span>
              <SelectInput
                value={newType}
                onChange={(e) => setNewType(e.target.value as AccountType)}
                className="w-full"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="cd">Certificate of Deposit (CD)</option>
                <option value="credit-card">Credit Card</option>
                <option value="auto-loan">Auto Loan</option>
                <option value="mortgage">Mortgage</option>
              </SelectInput>
            </label>
            <label className="block lg:col-span-2">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Account Display Name
              </span>
              <TextInput
                placeholder="e.g. Chase Premier Plus Checking"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Opening Balance ($)
              </span>
              <TextInput
                type="number"
                step="0.01"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Credit Limit (opt.)
              </span>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                placeholder="15000"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
              <Btn type="submit" variant="primary" disabled={busy || isReadOnly || !selectedUser}>
                <Plus className="w-4 h-4" />
                Add Simulated Account
              </Btn>
            </div>
          </form>
        </Card>
      </div>

      {/* Bulk Account Controls */}
      {selectedAccountIds.length > 0 && !isReadOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 px-4 py-2.5 text-[12.5px]">
          <span className="font-semibold text-[#0060F0] dark:text-blue-300">
            {selectedAccountIds.length} account{selectedAccountIds.length === 1 ? '' : 's'} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Btn
              variant="secondary"
              size="xs"
              disabled={busy}
              onClick={async () => {
                const ok = await onBulkAccounts(selectedAccountIds, 'lock');
                if (ok) setSelectedAccountIds([]);
              }}
            >
              <Lock className="w-3.5 h-3.5" /> Lock Selected
            </Btn>
            <Btn
              variant="secondary"
              size="xs"
              disabled={busy}
              onClick={async () => {
                const ok = await onBulkAccounts(selectedAccountIds, 'unlock');
                if (ok) setSelectedAccountIds([]);
              }}
            >
              <Unlock className="w-3.5 h-3.5" /> Unlock Selected
            </Btn>
            <Btn variant="danger" size="xs" disabled={busy} onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </Btn>
          </div>
        </div>
      )}

      {/* Account Cards Grid */}
      {!selectedUser || selectedUser.accounts.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<WalletCards className="w-5 h-5" />}
            title="No simulated accounts on this profile"
            detail="Use the form above to provision a checking, savings, card, CD, or loan account."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {selectedUser.accounts.map((account) => {
            const draft = drafts[account.id] || {
              name: account.name,
              balance: String(account.balance),
              creditLimit: account.creditLimit == null ? '' : String(account.creditLimit),
              locked: !!account.locked,
              autopay: !!account.autopay,
            };
            const dotColor = ACCOUNT_TYPE_COLORS[account.type] || '#0060F0';
            return (
              <Card key={account.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {!isReadOnly && (
                      <Checkbox
                        checked={selectedAccountIds.includes(account.id)}
                        onChange={(e) =>
                          setSelectedAccountIds((prev) =>
                            e.target.checked
                              ? [...new Set([...prev, account.id])]
                              : prev.filter((id) => id !== account.id)
                          )
                        }
                        className="mt-1"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        <h4 className="text-[14.5px] font-semibold text-gray-900 dark:text-white">
                          {account.name}
                        </h4>
                      </div>
                      <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                        •••• {account.mask} · {(account.transactions || []).length} ledger entries
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {account.locked && <Badge tone="warning">Locked</Badge>}
                    <Badge tone="primary">{account.type}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Account Name
                    </span>
                    <TextInput
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [account.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Balance ($)
                    </span>
                    <TextInput
                      type="number"
                      step="0.01"
                      value={draft.balance}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [account.id]: { ...draft, balance: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Credit Limit ($)
                    </span>
                    <TextInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="N/A"
                      value={draft.creditLimit}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [account.id]: { ...draft, creditLimit: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-[12.5px] text-gray-600 dark:text-gray-300">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={draft.locked}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [account.id]: { ...draft, locked: e.target.checked },
                          }))
                        }
                      />
                      Card / Acct Locked
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={draft.autopay}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [account.id]: { ...draft, autopay: e.target.checked },
                          }))
                        }
                      />
                      Autopay On
                    </label>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-2">
                      <Btn
                        variant="primary"
                        size="xs"
                        disabled={busy}
                        onClick={() =>
                          void onSaveAccount(account.id, {
                            name: draft.name,
                            balance: Number(draft.balance),
                            creditLimit:
                              draft.creditLimit === '' ? null : Number(draft.creditLimit),
                            locked: draft.locked,
                            autopay: draft.autopay,
                          })
                        }
                      >
                        <Check className="w-3.5 h-3.5" /> Save
                      </Btn>
                      <Btn
                        variant="danger"
                        size="xs"
                        disabled={busy}
                        onClick={() => setDeleteTargetId(account.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Btn>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bulk Delete Accounts Modal */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => {
          setBulkDeleteOpen(false);
          setBulkDeleteConfirm('');
        }}
        title={`Delete ${selectedAccountIds.length} Simulated Accounts`}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || bulkDeleteConfirm !== 'DELETE SELECTED ACCOUNTS'}
              onClick={async () => {
                const ok = await onBulkAccounts(
                  selectedAccountIds,
                  'delete',
                  bulkDeleteConfirm
                );
                if (ok) {
                  setSelectedAccountIds([]);
                  setBulkDeleteConfirm('');
                  setBulkDeleteOpen(false);
                }
              }}
            >
              Delete Accounts
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Type <code className="font-mono font-bold text-[#F04438]">DELETE SELECTED ACCOUNTS</code> to permanently delete the selected simulated accounts and their attached ledger history:
        </p>
        <TextInput
          className="mt-3"
          value={bulkDeleteConfirm}
          onChange={(e) => setBulkDeleteConfirm(e.target.value)}
          placeholder="DELETE SELECTED ACCOUNTS"
        />
      </Modal>

      {/* Single Account Delete Modal */}
      <Modal
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Simulated Account"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteTargetId(null)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (deleteTargetId) await onDeleteAccount(deleteTargetId);
                setDeleteTargetId(null);
              }}
            >
              Delete Account
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Delete this simulated account and all of its attached ledger entries?
        </p>
      </Modal>
    </div>
  );
};

/* =============================== 2. LEDGER TAB ============================= */

interface LedgerProps {
  users: AdminUserRow[];
  selectedUser: User | null;
  globalTransactions: GlobalTransaction[];
  isReadOnly: boolean;
  busy: boolean;
  onSelectUser: (id: string | null) => void;
  onCreateLedgerEntry: (payload: {
    userId: string;
    accountId: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    status: 'posted' | 'pending';
  }) => Promise<boolean>;
  onUpdateLedgerEntry: (
    userId: string,
    txId: string,
    patch: {
      description: string;
      amount: number;
      category: string;
      status: 'posted' | 'pending';
    }
  ) => Promise<boolean>;
  onDeleteLedgerEntry: (userId: string, txId: string) => Promise<void>;
}

export const LedgerTab: React.FC<LedgerProps> = ({
  users,
  selectedUser,
  globalTransactions,
  isReadOnly,
  busy,
  onSelectUser,
  onCreateLedgerEntry,
  onUpdateLedgerEntry,
  onDeleteLedgerEntry,
}) => {
  const [scopeUserId, setScopeUserId] = useState<string>('__all__');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'pending'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [throughDate, setThroughDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Add Ledger Entry Form
  const [targetAccountId, setTargetAccountId] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Shopping');
  const [txDate, setTxDate] = useState(() => inputDate(0));
  const [txStatus, setTxStatus] = useState<'posted' | 'pending'>('posted');

  // Edit Modal state
  const [editingTx, setEditingTx] = useState<GlobalTransaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editStatus, setEditStatus] = useState<'posted' | 'pending'>('posted');
  const [deletingTx, setDeletingTx] = useState<GlobalTransaction | null>(null);

  React.useEffect(() => {
    if (selectedUser && selectedUser.accounts.length > 0) {
      setTargetAccountId((prev) =>
        selectedUser.accounts.some((a) => a.id === prev) ? prev : selectedUser.accounts[0].id
      );
    }
  }, [selectedUser]);

  const filtered = useMemo(
    () =>
      globalTransactions.filter((t) => {
        if (scopeUserId !== '__all__' && t.userId !== scopeUserId) return false;
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (typeFilter !== 'all' && t.accountType !== typeFilter) return false;
        if (fromDate && t.date.slice(0, 10) < fromDate) return false;
        if (throughDate && t.date.slice(0, 10) > throughDate) return false;
        if (q.trim()) {
          const hay = `${t.username} ${t.fullName} ${t.accountName} ${t.description} ${t.category}`.toLowerCase();
          if (!hay.includes(q.trim().toLowerCase())) return false;
        }
        return true;
      }),
    [globalTransactions, scopeUserId, statusFilter, typeFilter, fromDate, throughDate, q]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !targetAccountId) return;
    const ok = await onCreateLedgerEntry({
      userId: selectedUser.id,
      accountId: targetAccountId,
      description: desc.trim(),
      amount: Number(amount),
      category,
      date: new Date(`${txDate}T12:00:00`).toISOString(),
      status: txStatus,
    });
    if (ok) {
      setDesc('');
      setAmount('');
    }
  };

  const openEdit = (tx: GlobalTransaction) => {
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmount(String(tx.amount));
    setEditCat(tx.category);
    setEditStatus(tx.status);
  };

  return (
    <div className="space-y-5">
      {/* Add Ledger Entry Studio */}
      {!isReadOnly && selectedUser && (
        <Card className="p-5">
          <CardHeader
            title={`Post Simulated Ledger Entry — ${selectedUser.fullName}`}
            subtitle="Applies the signed amount directly to the selected account balance (negative = debit, positive = credit / card purchase)"
            action={
              <SelectInput
                aria-label="Posting customer"
                value={selectedUser.id}
                onChange={(e) => onSelectUser(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    Post to: {u.fullName} (@{u.username})
                  </option>
                ))}
              </SelectInput>
            }
          />
          <form onSubmit={handleAddEntry} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <label className="block lg:col-span-2">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Account
              </span>
              <SelectInput
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                className="w-full"
              >
                {selectedUser.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (•••• {a.mask}) · {fmtMoneyFull(a.balance)}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block lg:col-span-2">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Description
              </span>
              <TextInput
                placeholder="e.g. Wire credit · Acme Advisory"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Signed Amount ($)
              </span>
              <TextInput
                type="number"
                step="0.01"
                placeholder="-42.50 or 1200"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Category
              </span>
              <SelectInput
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full"
              >
                <option value="Income">Income</option>
                <option value="Shopping">Shopping</option>
                <option value="Dining">Dining</option>
                <option value="Groceries">Groceries</option>
                <option value="Travel">Travel</option>
                <option value="Bills">Bills</option>
                <option value="Transfer">Transfer</option>
                <option value="Subscriptions">Subscriptions</option>
                <option value="Other">Other</option>
              </SelectInput>
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Date
              </span>
              <TextInput type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Status
              </span>
              <SelectInput
                value={txStatus}
                onChange={(e) => setTxStatus(e.target.value as 'posted' | 'pending')}
                className="w-full"
              >
                <option value="posted">Posted</option>
                <option value="pending">Pending</option>
              </SelectInput>
            </label>
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <Btn
                type="submit"
                variant="primary"
                disabled={busy || selectedUser.accounts.length === 0}
              >
                <Plus className="w-4 h-4" />
                Post &amp; Reconcile Balance
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {/* Global / Filtered Ledger Explorer */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Global Simulator Ledger ({filtered.length.toLocaleString()})
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                Editing or deleting any entry automatically adjusts the underlying account balance by the delta
              </p>
            </div>
            <ExportBtn
              label="Export Ledger CSV"
              onClick={() =>
                downloadCsv(
                  'chase-simulator-ledger.csv',
                  ['Date', 'Username', 'Customer', 'Account', 'Type', 'Description', 'Category', 'Status', 'Amount'],
                  filtered.map((t) => [
                    t.date,
                    t.username,
                    t.fullName,
                    t.accountName,
                    t.accountType,
                    t.description,
                    t.category,
                    t.status,
                    t.amount,
                  ])
                )
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <TextInput
                placeholder="Search merchant, customer, category…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <SelectInput
              aria-label="Scope customer"
              value={scopeUserId}
              onChange={(e) => {
                setScopeUserId(e.target.value);
                if (e.target.value !== '__all__') onSelectUser(e.target.value);
                setPage(1);
              }}
            >
              <option value="__all__">All Customers</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </SelectInput>
            <SelectInput
              aria-label="Filter status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="posted">Posted</option>
              <option value="pending">Pending</option>
            </SelectInput>
            <SelectInput
              aria-label="Filter account type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Account Types</option>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cd">CD</option>
              <option value="credit-card">Credit Card</option>
              <option value="auto-loan">Auto Loan</option>
              <option value="mortgage">Mortgage</option>
            </SelectInput>
            <div className="flex gap-1.5">
              <TextInput
                type="date"
                aria-label="From date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="px-2"
              />
              <TextInput
                type="date"
                aria-label="Through date"
                value={throughDate}
                onChange={(e) => {
                  setThroughDate(e.target.value);
                  setPage(1);
                }}
                className="px-2"
              />
            </div>
          </div>
        </div>

        {paged.length === 0 ? (
          <EmptyState title="No ledger transactions match these filters" />
        ) : (
          <TableShell>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Account</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                {!isReadOnly && <Th className="text-right">Actions</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {paged.map((t) => (
                <tr
                  key={`${t.userId}-${t.id}`}
                  className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                >
                  <Td className="whitespace-nowrap text-[12px] text-gray-500">
                    {fmtDateShort(t.date)}
                  </Td>
                  <Td>
                    <p className="font-medium text-gray-900 dark:text-white text-[12.5px]">
                      {t.fullName}
                    </p>
                    <p className="text-[11px] text-gray-400">@{t.username}</p>
                  </Td>
                  <Td>
                    <p className="text-[12.5px] text-gray-800 dark:text-gray-200">{t.accountName}</p>
                    <p className="text-[11px] text-gray-400">{t.accountType}</p>
                  </Td>
                  <Td className="max-w-[260px] truncate font-medium text-gray-800 dark:text-gray-100">
                    {t.description}
                  </Td>
                  <Td>
                    <Badge tone="neutral">{t.category}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={t.status === 'posted' ? 'success' : 'warning'}>
                      {t.status}
                    </Badge>
                  </Td>
                  <Td
                    className={`text-right font-semibold tabular-nums ${
                      t.amount >= 0 ? 'text-[#12B76A]' : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {fmtSignedMoney(t.amount)}
                  </Td>
                  {!isReadOnly && (
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Btn variant="ghost" size="xs" onClick={() => openEdit(t)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Btn>
                        <Btn variant="ghost" size="xs" onClick={() => setDeletingTx(t)}>
                          <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
                        </Btn>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
          noun="ledger entries"
        />
      </Card>

      {/* Edit Ledger Entry Modal */}
      <Modal
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Edit Simulated Ledger Entry"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditingTx(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (!editingTx) return;
                const ok = await onUpdateLedgerEntry(editingTx.userId, editingTx.id, {
                  description: editDesc,
                  amount: Number(editAmount),
                  category: editCat,
                  status: editStatus,
                });
                if (ok) setEditingTx(null);
              }}
            >
              Save &amp; Reconcile
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Account balance will automatically adjust by the difference from the prior amount.
          </p>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">Description</span>
            <TextInput value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">Signed Amount ($)</span>
            <TextInput
              type="number"
              step="0.01"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">Category</span>
            <TextInput value={editCat} onChange={(e) => setEditCat(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">Status</span>
            <SelectInput
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as 'posted' | 'pending')}
              className="w-full"
            >
              <option value="posted">Posted</option>
              <option value="pending">Pending</option>
            </SelectInput>
          </label>
        </div>
      </Modal>

      {/* Delete Ledger Entry Modal */}
      <Modal
        open={!!deletingTx}
        onClose={() => setDeletingTx(null)}
        title="Delete Ledger Entry & Reverse Balance"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeletingTx(null)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (deletingTx) await onDeleteLedgerEntry(deletingTx.userId, deletingTx.id);
                setDeletingTx(null);
              }}
            >
              Delete &amp; Reverse
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Delete <strong>{deletingTx?.description}</strong> ({fmtMoneyFull(deletingTx?.amount ?? 0)}) from{' '}
          <strong>{deletingTx?.accountName}</strong>? Its amount will be reversed from the account balance.
        </p>
      </Modal>
    </div>
  );
};
