import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  CircleDollarSign,
  FileText,
  KeyRound,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import type { AccountType, Transaction, User } from '../banking/store';
import { Footer } from './Footer';
import { Header } from './Header';
import { Spinner } from './Loading';

const BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';
const ADMIN_TOKEN_KEY = 'chase_sim_admin_token';

class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

type AdminTab = 'overview' | 'users' | 'accounts' | 'transactions' | 'operations' | 'audit' | 'settings';
interface AdminUserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  status: 'active' | 'suspended';
  createdAt: string;
  accountCount: number;
  depositBalance: number;
  cardBalance: number;
}
interface Metrics {
  users: number;
  suspendedUsers: number;
  accounts: number;
  deposits: number;
  cardBalances: number;
  scheduledPayments: number;
  transactions: number;
}
interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}
interface AdminAccountRow {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'auditor';
  status: 'active' | 'disabled';
  createdAt?: string;
  protected?: boolean;
}
interface GlobalTransaction extends Transaction {
  userId: string;
  username: string;
  fullName: string;
  accountId: string;
  accountName: string;
  accountType: string;
}

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
const dateTime = (date: string) => new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const inputDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const fieldCls = 'w-full h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px] text-[#131313] bg-white focus:border-[#1A4488] outline-none';

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)] ${className}`} style={{ borderColor: LINE }}>{children}</section>
);

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  tone?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, type = 'button', tone = 'outline', disabled, className = '' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center justify-center gap-2 min-h-10 px-4 py-2 border rounded-[4px] text-[13px] font-semibold cursor-pointer disabled:opacity-60 ${className}`}
    style={tone === 'primary'
      ? { backgroundColor: BLUE, color: '#fff', borderColor: BLUE }
      : tone === 'danger'
        ? { backgroundColor: '#fff', color: '#B42318', borderColor: '#E7B8B6' }
        : { backgroundColor: '#fff', color: BLUE, borderColor: BLUE }}
  >{children}</button>
);

export const AdminPage: React.FC<{
  initialToken?: string;
  onExit: () => void;
  onImpersonate: (user: User, token: string) => void;
}> = ({ initialToken = '', onExit, onImpersonate }) => {
  const [token, setToken] = useState(() => {
    if (initialToken) return initialToken;
    try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
  });
  const [adminName, setAdminName] = useState('Chase administrator');
  const [currentAdminRole, setCurrentAdminRole] = useState<'admin' | 'auditor'>('admin');
  const [currentAdminUsername, setCurrentAdminUsername] = useState('admin');
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'auditor'>('auditor');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('chaseadmin123');
  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [globalTransactions, setGlobalTransactions] = useState<GlobalTransaction[]>([]);
  const [reportFrom, setReportFrom] = useState(() => inputDate(180));
  const [reportThrough, setReportThrough] = useState(() => inputDate());
  const [usersPage, setUsersPage] = useState(0);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [auditPage, setAuditPage] = useState(0);
  const [globalPage, setGlobalPage] = useState(0);
  const [simulatorSettings, setSimulatorSettings] = useState({ allowEnrollment: true, allowCustomerPasswordReset: true });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userJson, setUserJson] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [auditQuery, setAuditQuery] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('checking');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('0');
  const [newAccountLimit, setNewAccountLimit] = useState('');
  const [accountDrafts, setAccountDrafts] = useState<Record<string, { name: string; balance: string; creditLimit: string; locked: boolean; autopay: boolean }>>({});
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [ledgerDescription, setLedgerDescription] = useState('');
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState('Other');
  const [ledgerDate, setLedgerDate] = useState(() => inputDate());
  const [ledgerStatus, setLedgerStatus] = useState<'posted' | 'pending'>('posted');
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | 'posted' | 'pending'>('all');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('all');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerThrough, setLedgerThrough] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [payeeAccount, setPayeeAccount] = useState('');
  const [payeeCategory, setPayeeCategory] = useState('Utilities');
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDescription, setTransferDescription] = useState('Admin simulated transfer');
  const [scheduleKind, setScheduleKind] = useState<'transfer' | 'bill' | 'card' | 'loan'>('bill');
  const [scheduleLabel, setScheduleLabel] = useState('');
  const [scheduleFromId, setScheduleFromId] = useState('');
  const [scheduleTargetId, setScheduleTargetId] = useState('');
  const [schedulePayeeId, setSchedulePayeeId] = useState('');
  const [scheduleAmount, setScheduleAmount] = useState('');
  const [scheduleDate, setScheduleDate] = useState(() => inputDate());
  const [scheduleFrequency, setScheduleFrequency] = useState<'once' | 'monthly'>('monthly');
  const [disputePurchase, setDisputePurchase] = useState('');
  const [disputeReason, setDisputeReason] = useState('Unauthorized purchase');
  const [loginError, setLoginError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('chase123');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const [activityStart, setActivityStart] = useState(() => inputDate(90));
  const [activityEnd, setActivityEnd] = useState(() => inputDate());
  const [activityCadence, setActivityCadence] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [perPeriod, setPerPeriod] = useState('1');

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}, authToken = token): Promise<T> => {
    const response = await fetch(path, {
      ...init,
      credentials: init.credentials || 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new AdminApiError(`${data.error || `Request failed (${response.status}).`} · ${path}`, response.status);
    return data as T;
  }, [token]);

  const loadData = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    const [overview, userData, auditData, transactionData] = await Promise.all([
      api<{ metrics: Metrics; recentAudit: AuditEntry[] }>('/api/admin/overview', {}, activeToken),
      api<{ users: AdminUserRow[] }>('/api/admin/users', {}, activeToken),
      api<{ audit: AuditEntry[] }>('/api/admin/audit?limit=5000', {}, activeToken),
      api<{ transactions: GlobalTransaction[] }>('/api/admin/transactions?limit=5000', {}, activeToken),
    ]);
    setMetrics(overview.metrics);
    setUsers(userData.users);
    setAudit(auditData.audit);
    setGlobalTransactions(transactionData.transactions);
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      let identity: { admin: { username: string; label: string; role: 'admin' | 'auditor' } };
      try {
        identity = await api<{ admin: { username: string; label: string; role: 'admin' | 'auditor' } }>('/api/admin/me');
      } catch (error) {
        if (!active) return;
        if (error instanceof AdminApiError && error.status === 401) {
          try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* unavailable */ }
          setToken('');
        } else {
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not verify administrator session.' });
        }
        return;
      }
      if (!active) return;
      setAdminName(identity.admin.label);
      setCurrentAdminRole(identity.admin.role || 'admin');
      setCurrentAdminUsername(identity.admin.username);
      try {
        const [settingsResult, adminResult] = await Promise.all([
          api<{ settings: typeof simulatorSettings }>('/api/admin/settings'),
          api<{ admins: AdminAccountRow[] }>('/api/admin/admins'),
        ]);
        if (active) {
          setSimulatorSettings(settingsResult.settings);
          setAdminAccounts(adminResult.admins);
        }
        await loadData(token);
      } catch (error) {
        if (!active) return;
        setNotice({
          kind: 'error',
          text: error instanceof Error ? `${error.message} Your admin session is still active; use Refresh data to retry.` : 'Could not load administrator data. Your session is still active; please retry.',
        });
      }
    })();
    return () => { active = false; };
  }, [api, loadData, token]);

  const filteredUsers = useMemo(() => users.filter((user) =>
    (statusFilter === 'all' || user.status === statusFilter) &&
    `${user.fullName} ${user.username} ${user.email} ${user.status}`.toLowerCase().includes(query.toLowerCase())
  ), [users, query, statusFilter]);
  const filteredAudit = useMemo(() => audit.filter((entry) => `${entry.actor} ${entry.action} ${JSON.stringify(entry.details)}`.toLowerCase().includes(auditQuery.toLowerCase())), [audit, auditQuery]);
  const filteredGlobalTransactions = useMemo(() => globalTransactions.filter((entry) =>
    `${entry.username} ${entry.fullName} ${entry.accountName} ${entry.description} ${entry.category}`.toLowerCase().includes(ledgerQuery.toLowerCase()) &&
    (ledgerStatusFilter === 'all' || entry.status === ledgerStatusFilter) &&
    (ledgerTypeFilter === 'all' || entry.accountType === ledgerTypeFilter) &&
    (!ledgerFrom || entry.date.slice(0, 10) >= ledgerFrom) && (!ledgerThrough || entry.date.slice(0, 10) <= ledgerThrough)
  ), [globalTransactions, ledgerQuery, ledgerStatusFilter, ledgerTypeFilter, ledgerFrom, ledgerThrough]);
  const reportRows = useMemo(() => globalTransactions.filter((entry) => entry.date.slice(0, 10) >= reportFrom && entry.date.slice(0, 10) <= reportThrough), [globalTransactions, reportFrom, reportThrough]);
  const monthlyReport = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index));
    const year = date.getFullYear(); const month = date.getMonth();
    const entries = globalTransactions.filter((entry) => { const d = new Date(entry.date); return d.getFullYear() === year && d.getMonth() === month; });
    return { label: date.toLocaleDateString('en-US', { month: 'short' }), count: entries.length, net: entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) };
  }), [globalTransactions]);

  useEffect(() => setUsersPage(0), [query, statusFilter]);
  useEffect(() => setAuditPage(0), [auditQuery]);
  useEffect(() => setGlobalPage(0), [ledgerQuery, ledgerStatusFilter, ledgerTypeFilter, ledgerFrom, ledgerThrough]);

  const signIn = async (
    event?: React.FormEvent,
    credentials: { username: string; password: string } = { username, password }
  ) => {
    event?.preventDefault();
    setBusy(true);
    setLoginError('');
    try {
      const result = await api<{ token: string; admin: { label: string } }>('/api/admin/login', {
        method: 'POST', body: JSON.stringify(credentials),
      }, '');
      sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      setToken(result.token);
      setAdminName(result.admin.label);
      await loadData(result.token);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Admin sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const selectUser = async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`);
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      setLedgerAccountId(result.user.accounts[0]?.id || '');
      setTransferFromId(result.user.accounts.find((account) => ['checking', 'savings', 'cd'].includes(account.type))?.id || '');
      setTransferToId('');
      setScheduleFromId(result.user.accounts.find((account) => ['checking', 'savings', 'cd'].includes(account.type))?.id || '');
      setScheduleTargetId('');
      setSchedulePayeeId(result.user.payees[0]?.id || '');
      setAccountDrafts(Object.fromEntries(result.user.accounts.map((account) => [account.id, { name: account.name, balance: String(account.balance), creditLimit: account.creditLimit == null ? '' : String(account.creditLimit), locked: !!account.locked, autopay: !!account.autopay }])));
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load this simulator profile.' });
    } finally {
      setBusy(false);
    }
  };

  const acceptUpdatedUser = async (updated: User, successText: string) => {
    setSelectedUser(updated);
    setUserJson(JSON.stringify(updated, null, 2));
    setSelectedAccountIds((ids) => ids.filter((id) => updated.accounts.some((account) => account.id === id)));
    setAccountDrafts(Object.fromEntries(updated.accounts.map((account) => [account.id, {
      name: account.name,
      balance: String(account.balance),
      creditLimit: account.creditLimit == null ? '' : String(account.creditLimit),
      locked: !!account.locked,
      autopay: !!account.autopay,
    }])));
    await loadData();
    setNotice({ kind: 'success', text: successText });
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>('/api/admin/users/' + encodeURIComponent(selectedUser.id) + '/accounts', {
        method: 'POST', body: JSON.stringify({ type: newAccountType, name: newAccountName, balance: Number(newAccountBalance), creditLimit: newAccountLimit === '' ? undefined : Number(newAccountLimit) }),
      });
      setNewAccountName(''); setNewAccountBalance('0'); setNewAccountLimit('');
      await acceptUpdatedUser(result.user, 'Simulated account created.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create account.' });
    } finally { setBusy(false); }
  };

  const saveAccount = async (accountId: string) => {
    if (!selectedUser) return;
    const draft = accountDrafts[accountId];
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT', body: JSON.stringify({ account: { name: draft.name, balance: Number(draft.balance), creditLimit: draft.creditLimit === '' ? null : Number(draft.creditLimit), locked: draft.locked, autopay: draft.autopay } }),
      });
      await acceptUpdatedUser(result.user, 'Account settings saved.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save account.' });
    } finally { setBusy(false); }
  };

  const deleteAccount = async (accountId: string) => {
    if (!selectedUser || !window.confirm('Delete this simulated account and its attached ledger history?')) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE', body: JSON.stringify({ confirm: true }),
      });
      await acceptUpdatedUser(result.user, 'Simulated account and attached activity deleted.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete account.' });
    } finally { setBusy(false); }
  };

  const bulkAccounts = async (action: 'lock' | 'unlock' | 'delete') => {
    if (!selectedUser || !selectedAccountIds.length) return;
    let confirmText: string | undefined;
    if (action === 'delete') {
      confirmText = window.prompt(`This permanently deletes ${selectedAccountIds.length} accounts and their ledger entries. Type DELETE SELECTED ACCOUNTS.`) || '';
      if (confirmText !== 'DELETE SELECTED ACCOUNTS') return;
    } else if (!window.confirm(`${action === 'lock' ? 'Lock' : 'Unlock'} ${selectedAccountIds.length} selected simulator accounts?`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/bulk`, { method: 'POST', body: JSON.stringify({ accountIds: selectedAccountIds, action, ...(confirmText ? { confirmText } : {}) }) });
      setSelectedAccountIds([]);
      await acceptUpdatedUser(result.user, `Bulk account ${action} completed.`);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Bulk account action failed.' }); }
    finally { setBusy(false); }
  };

  const createLedgerEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>('/api/admin/users/' + encodeURIComponent(selectedUser.id) + '/transactions', {
        method: 'POST', body: JSON.stringify({ accountId: ledgerAccountId, transaction: { description: ledgerDescription, amount: Number(ledgerAmount), category: ledgerCategory, date: new Date(`${ledgerDate}T12:00:00`).toISOString(), status: ledgerStatus } }),
      });
      setLedgerDescription(''); setLedgerAmount('');
      await acceptUpdatedUser(result.user, 'Simulated ledger entry created and the account balance was adjusted.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create ledger entry.' });
    } finally { setBusy(false); }
  };

  const editLedgerEntry = async (transactionId: string, original: { description: string; amount: number; category: string; status: 'posted' | 'pending' }) => {
    if (!selectedUser) return;
    const description = window.prompt('Transaction description', original.description);
    if (description === null) return;
    const amountText = window.prompt('Signed amount (negative for debit, positive for credit)', String(original.amount));
    if (amountText === null) return;
    const category = window.prompt('Category', original.category);
    if (category === null) return;
    const status = window.prompt('Status: posted or pending', original.status);
    if (status === null) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'PUT', body: JSON.stringify({ transaction: { description, amount: Number(amountText), category, status } }),
      });
      await acceptUpdatedUser(result.user, 'Ledger entry updated and the account balance was adjusted by the amount difference.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update ledger entry.' });
    } finally { setBusy(false); }
  };

  const deleteLedgerEntry = async (transactionId: string) => {
    if (!selectedUser || !window.confirm('Permanently delete this simulated ledger entry? The account balance will not change.')) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'DELETE', body: JSON.stringify({ confirm: true }),
      });
      await acceptUpdatedUser(result.user, 'Ledger entry deleted and its amount was reversed from the account balance.');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete ledger entry.' });
    } finally { setBusy(false); }
  };

  const bulkUsers = async (action: 'suspend' | 'reactivate' | 'delete') => {
    if (!selectedUserIds.length) return;
    if (action === 'delete') {
      const confirmation = window.prompt(`This permanently deletes ${selectedUserIds.length} simulated customer records. Type DELETE SELECTED USERS to continue.`);
      if (confirmation !== 'DELETE SELECTED USERS') return;
    } else if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${selectedUserIds.length} selected simulator users?`)) return;
    setBusy(true);
    try {
      await api('/api/admin/users/bulk', { method: 'POST', body: JSON.stringify({ ids: selectedUserIds, action, ...(action === 'delete' ? { confirmText: 'DELETE SELECTED USERS' } : {}) }) });
      if (selectedUser && selectedUserIds.includes(selectedUser.id)) {
        if (action === 'delete') { setSelectedUser(null); setUserJson(''); }
        else {
          const updated = { ...selectedUser, status: action === 'suspend' ? 'suspended' : 'active' } as User;
          setSelectedUser(updated);
          setUserJson(JSON.stringify(updated, null, 2));
        }
      }
      setSelectedUserIds([]);
      await loadData();
      setNotice({ kind: 'success', text: `Bulk ${action} completed for ${selectedUserIds.length} users.` });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Bulk user action failed.' }); }
    finally { setBusy(false); }
  };

  const downloadBackup = async () => {
    setBusy(true);
    try {
      const backup = await api<Record<string, unknown>>('/api/admin/backup');
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = blobUrl; link.download = `chase-simulator-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setNotice({ kind: 'success', text: 'Backup downloaded. It contains password hashes; store it securely.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create backup.' }); }
    finally { setBusy(false); }
  };

  const restoreBackup = async () => {
    if (!backupFile) return;
    const confirmText = window.prompt('Restoring replaces all customer records and settings, and revokes customer sessions. Type RESTORE SIMULATOR BACKUP.');
    if (confirmText !== 'RESTORE SIMULATOR BACKUP') return;
    setBusy(true);
    try {
      const backup = JSON.parse(await backupFile.text());
      const result = await api<{ usersRestored: number }>('/api/admin/backup', { method: 'POST', body: JSON.stringify({ ...backup, confirmText }) });
      setBackupFile(null); setSelectedUser(null); setUserJson(''); setSelectedUserIds([]);
      await loadData();
      setNotice({ kind: 'success', text: `Restored ${result.usersRestored} simulator users from backup.` });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not restore this backup file.' }); }
    finally { setBusy(false); }
  };

  const createAdminTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !window.confirm(`Post a simulated transfer of ${money(Number(transferAmount))}? Source and destination account balances and ledger entries will update.`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/transfers`, { method: 'POST', body: JSON.stringify({ fromAccountId: transferFromId, toAccountId: transferToId, amount: Number(transferAmount), description: transferDescription }) });
      setTransferAmount('');
      await acceptUpdatedUser(result.user, 'Simulated transfer posted and both account ledgers were reconciled. No real funds moved.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not post simulated transfer.' }); }
    finally { setBusy(false); }
  };

  const createPayee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees`, { method: 'POST', body: JSON.stringify({ name: payeeName, accountNumber: payeeAccount, category: payeeCategory }) });
      setPayeeName(''); setPayeeAccount('');
      await acceptUpdatedUser(result.user, 'Simulated payee created.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create payee.' }); }
    finally { setBusy(false); }
  };

  const editPayee = async (payee: User['payees'][number]) => {
    if (!selectedUser) return;
    const name = window.prompt('Payee name', payee.name);
    if (name === null) return;
    const accountNumber = window.prompt('Masked destination reference', payee.accountNumber);
    if (accountNumber === null) return;
    const category = window.prompt('Category', payee.category);
    if (category === null) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees/${encodeURIComponent(payee.id)}`, { method: 'PUT', body: JSON.stringify({ payee: { name, accountNumber, category } }) });
      await acceptUpdatedUser(result.user, 'Simulated payee updated.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update payee.' }); }
    finally { setBusy(false); }
  };

  const deletePayee = async (payee: User['payees'][number]) => {
    if (!selectedUser || !window.confirm(`Delete payee “${payee.name}”? Any scheduled payments using it will also be removed.`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees/${encodeURIComponent(payee.id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
      await acceptUpdatedUser(result.user, 'Simulated payee and linked schedules removed.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete payee.' }); }
    finally { setBusy(false); }
  };

  const createScheduledPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled`, { method: 'POST', body: JSON.stringify({ payment: { kind: scheduleKind, label: scheduleLabel, fromAccountId: scheduleFromId, toAccountId: scheduleTargetId || undefined, payeeId: scheduleKind === 'bill' ? schedulePayeeId : undefined, amount: Number(scheduleAmount), date: new Date(`${scheduleDate}T12:00:00`).toISOString(), frequency: scheduleFrequency } }) });
      setScheduleLabel(''); setScheduleAmount('');
      await acceptUpdatedUser(result.user, 'Simulated scheduled payment created. It will not execute against a real payment network.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create scheduled payment.' }); }
    finally { setBusy(false); }
  };

  const editSchedule = async (payment: NonNullable<User['scheduledPayments']>[number]) => {
    if (!selectedUser) return;
    const label = window.prompt('Scheduled item label', payment.label);
    if (label === null) return;
    const amountText = window.prompt('Simulated amount', String(payment.amount));
    if (amountText === null) return;
    const dateText = window.prompt('Next date (YYYY-MM-DD)', payment.date.slice(0, 10));
    if (dateText === null) return;
    const frequency = window.prompt('Frequency: once or monthly', payment.frequency);
    if (frequency === null) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled/${encodeURIComponent(payment.id)}`, { method: 'PUT', body: JSON.stringify({ payment: { label, amount: Number(amountText), date: new Date(`${dateText}T12:00:00`).toISOString(), frequency } }) });
      await acceptUpdatedUser(result.user, 'Scheduled payment updated.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not edit scheduled payment.' }); }
    finally { setBusy(false); }
  };

  const updateScheduleStatus = async (paymentId: string, status: 'scheduled' | 'paused' | 'cancelled') => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled/${encodeURIComponent(paymentId)}`, { method: 'PUT', body: JSON.stringify({ payment: { status } }) });
      await acceptUpdatedUser(result.user, `Schedule ${status}.`);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update schedule.' }); }
    finally { setBusy(false); }
  };

  const deleteSchedule = async (paymentId: string, label: string) => {
    if (!selectedUser || !window.confirm(`Delete scheduled item “${label}”?`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled/${encodeURIComponent(paymentId)}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
      await acceptUpdatedUser(result.user, 'Scheduled item deleted.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete schedule.' }); }
    finally { setBusy(false); }
  };

  const openDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    const [accountId, transactionId] = disputePurchase.split('|');
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/disputes`, { method: 'POST', body: JSON.stringify({ accountId, transactionId, reason: disputeReason }) });
      setDisputePurchase('');
      await acceptUpdatedUser(result.user, 'Simulated dispute opened.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not open dispute.' }); }
    finally { setBusy(false); }
  };

  const setDisputeStatus = async (disputeId: string, status: 'open' | 'resolved' | 'denied') => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/disputes/${encodeURIComponent(disputeId)}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await acceptUpdatedUser(result.user, `Dispute marked ${status}.`);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update dispute.' }); }
    finally { setBusy(false); }
  };

  const issueDisputeRefund = async (dispute: NonNullable<User['disputes']>[number]) => {
    if (!selectedUser || !window.confirm(`Issue a simulated refund of ${money(dispute.amount)} to ${dispute.description}? The card balance will be adjusted.`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/disputes/${encodeURIComponent(dispute.id)}/refund`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
      await acceptUpdatedUser(result.user, 'Simulated refund posted and dispute resolved. No external payment was made.');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not issue simulated refund.' }); }
    finally { setBusy(false); }
  };

  const createAdminAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ admin: AdminAccountRow }>('/api/admin/admins', {
        method: 'POST', body: JSON.stringify({ username: newAdminUsername, fullName: newAdminName, password: newAdminPassword, role: newAdminRole }),
      });
      setAdminAccounts((items) => [...items, result.admin]);
      setNewAdminUsername(''); setNewAdminName(''); setNewAdminPassword('');
      setNotice({ kind: 'success', text: `Created ${result.admin.role} account for ${result.admin.username}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create admin account.' });
    } finally { setBusy(false); }
  };

  const updateAdminAccount = async (admin: AdminAccountRow, patch: { role?: AdminAccountRow['role']; status?: AdminAccountRow['status']; password?: string }) => {
    setBusy(true);
    try {
      const result = await api<{ admin: AdminAccountRow }>(`/api/admin/admins/${encodeURIComponent(admin.id)}`, { method: 'PUT', body: JSON.stringify({ ...patch, ...(patch.password ? { confirm: true } : {}) }) });
      setAdminAccounts((items) => items.map((item) => item.id === admin.id ? result.admin : item));
      setNotice({ kind: 'success', text: `Updated administrator ${admin.username}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update admin account.' });
    } finally { setBusy(false); }
  };

  const resetAdminPassword = async (admin: AdminAccountRow) => {
    if (!window.confirm(`Reset the password for ${admin.username}? Their current sessions will be revoked.`)) return;
    const password = window.prompt('Enter a new password (at least 10 characters)');
    if (password === null) return;
    if (password.length < 10) { setNotice({ kind: 'error', text: 'Admin passwords must be at least 10 characters.' }); return; }
    await updateAdminAccount(admin, { password });
  };

  const changeOwnAdminPassword = async () => {
    if (adminAccounts.some((admin) => admin.protected && admin.username === currentAdminUsername)) {
      setNotice({ kind: 'error', text: 'The environment-configured root admin password is managed outside this portal.' });
      return;
    }
    const currentPassword = window.prompt('Current admin password');
    if (currentPassword === null) return;
    const newPassword = window.prompt('New admin password (at least 10 characters)');
    if (newPassword === null) return;
    const confirmPassword = window.prompt('Confirm new admin password');
    if (confirmPassword === null) return;
    if (newPassword !== confirmPassword || newPassword.length < 10) { setNotice({ kind: 'error', text: 'New passwords must match and contain at least 10 characters.' }); return; }
    setBusy(true);
    try {
      await api('/api/admin/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword, confirm: true }) });
      try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* unavailable */ }
      setLoginError('Password changed. Sign in again with your new administrator password.');
      setToken('');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not change admin password.' }); }
    finally { setBusy(false); }
  };

  const deleteAdmin = async (admin: AdminAccountRow) => {
    if (!window.confirm(`Permanently delete admin account ${admin.username}?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/admins/${encodeURIComponent(admin.id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
      setAdminAccounts((items) => items.filter((item) => item.id !== admin.id));
      setNotice({ kind: 'success', text: `Deleted admin account ${admin.username}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete admin account.' });
    } finally { setBusy(false); }
  };

  const saveSimulatorSettings = async () => {
    setBusy(true);
    try {
      const result = await api<{ settings: typeof simulatorSettings }>('/api/admin/settings', {
        method: 'PUT', body: JSON.stringify({ settings: simulatorSettings }),
      });
      setSimulatorSettings(result.settings);
      await loadData();
      setNotice({ kind: 'success', text: 'Simulator access settings saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save simulator settings.' });
    } finally { setBusy(false); }
  };

  const editGlobalLedgerEntry = async (transaction: GlobalTransaction) => {
    const description = window.prompt('Transaction description', transaction.description);
    if (description === null) return;
    const amountText = window.prompt('Signed amount (negative for debit, positive for credit)', String(transaction.amount));
    if (amountText === null) return;
    const category = window.prompt('Category', transaction.category);
    if (category === null) return;
    const status = window.prompt('Status: posted or pending', transaction.status);
    if (status === null) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(transaction.userId)}/transactions/${encodeURIComponent(transaction.id)}`, {
        method: 'PUT', body: JSON.stringify({ transaction: { description, amount: Number(amountText), category, status } }),
      });
      if (selectedUser?.id === transaction.userId) { setSelectedUser(result.user); setUserJson(JSON.stringify(result.user, null, 2)); }
      await loadData();
      setNotice({ kind: 'success', text: 'Ledger entry updated and the account balance was adjusted by the amount difference.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update ledger entry.' }); }
    finally { setBusy(false); }
  };

  const deleteGlobalLedgerEntry = async (transaction: GlobalTransaction) => {
    if (!window.confirm(`Delete simulated transaction “${transaction.description}” for ${transaction.username}? Its amount will be reversed from the account balance.`)) return;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(transaction.userId)}/transactions/${encodeURIComponent(transaction.id)}`, {
        method: 'DELETE', body: JSON.stringify({ confirm: true }),
      });
      if (selectedUser?.id === transaction.userId) { setSelectedUser(result.user); setUserJson(JSON.stringify(result.user, null, 2)); }
      await loadData();
      setNotice({ kind: 'success', text: 'Ledger entry deleted and its amount was reversed from the account balance.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete ledger entry.' }); }
    finally { setBusy(false); }
  };

  const revokeSessions = async () => {
    if (!selectedUser || !window.confirm(`Sign out all active sessions for ${selectedUser.username}?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/revoke-sessions`, { method: 'POST', body: '{}' });
      await loadData();
      setNotice({ kind: 'success', text: `All sessions for ${selectedUser.username} were revoked.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not revoke sessions.' });
    } finally { setBusy(false); }
  };

  const exportCsv = (filename: string, headers: string[], rows: unknown[][]) => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportUsers = () => exportCsv('simulator-users.csv', ['Username', 'Full name', 'Email', 'Status', 'Created', 'Accounts', 'Deposits', 'Card balances'], filteredUsers.map((user) => [user.username, user.fullName, user.email, user.status, user.createdAt, user.accountCount, user.depositBalance, user.cardBalance]));

  const saveRecord = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(userJson) as User;
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PUT', body: JSON.stringify({ user: parsed }),
      });
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      await loadData();
      setNotice({ kind: 'success', text: 'All simulated profile data saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The simulator record could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const updated = { ...selectedUser, status: selectedUser.status === 'suspended' ? 'active' : 'suspended' } as User;
      const result = await api<{ user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PUT', body: JSON.stringify({ user: updated }),
      });
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      await loadData();
      setNotice({ kind: 'success', text: `Simulator user ${result.user.status}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Status could not be changed.' });
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ user: User }>('/api/admin/users', {
        method: 'POST', body: JSON.stringify({ username: newUsername, fullName: newName, email: newEmail, password: newPassword }),
      });
      await loadData();
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      setShowCreate(false);
      setNewUsername(''); setNewName(''); setNewEmail(''); setNewPassword('chase123');
      setNotice({ kind: 'success', text: `Created simulator profile “${result.user.username}”.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create simulator user.' });
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (!selectedUser || !window.confirm(`Permanently delete simulator user “${selectedUser.username}” and all of their simulated data?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
      setSelectedUser(null); setUserJson('');
      setSelectedUserIds((ids) => ids.filter((id) => id !== selectedUser.id));
      await loadData();
      setNotice({ kind: 'success', text: 'Simulator user and associated data deleted.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete simulator user.' });
    } finally {
      setBusy(false);
    }
  };

  const resetUserPassword = async () => {
    if (!selectedUser || !window.confirm(`Reset the password for ${selectedUser.username}? All of their active sessions will be revoked.`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/reset-password`, {
        method: 'POST', body: JSON.stringify({ password: resetPassword, confirm: true }),
      });
      setResetPassword('');
      setNotice({ kind: 'success', text: `Password reset for ${selectedUser.username}.` });
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Password could not be reset.' });
    } finally {
      setBusy(false);
    }
  };

  const generateHistory = async () => {
    if (!selectedUser) return;
    if (userJson !== JSON.stringify(selectedUser, null, 2)) {
      setNotice({ kind: 'error', text: 'Save or discard the edited simulator record before generating activity.' });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User; eventsGenerated: number; transactionsAdded: number }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/generate-transactions`,
        {
          method: 'POST',
          body: JSON.stringify({ startDate: activityStart, endDate: activityEnd, cadence: activityCadence, perPeriod: Number(perPeriod) }),
        }
      );
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      await loadData();
      setNotice({ kind: 'success', text: `Generated ${result.transactionsAdded.toLocaleString()} posted ledger entries across ${result.eventsGenerated.toLocaleString()} simulated activity events.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not generate simulator activity.' });
    } finally {
      setBusy(false);
    }
  };

  const impersonate = async () => {
    if (!selectedUser || !window.confirm(`Open the simulator as ${selectedUser.fullName}? The admin session will remain available for returning.`)) return;
    setBusy(true);
    try {
      const result = await api<{ token: string; user: User }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/impersonate`, {
        method: 'POST', body: JSON.stringify({}),
      });
      onImpersonate(result.user, result.token);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not start simulator preview.' });
    } finally {
      setBusy(false);
    }
  };

  const resetSimulator = async () => {
    if (resetText !== 'RESET SIMULATOR') return;
    setBusy(true);
    try {
      await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirmText: resetText }) });
      setSelectedUser(null); setUserJson(''); setResetText(''); setConfirmReset(false);
      await loadData();
      setNotice({ kind: 'success', text: 'Simulator reset to a fresh sample customer. Admin audit history was retained.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Simulator reset failed.' });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* local admin session still removed */ }
    try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* unavailable */ }
    setToken('');
    onExit();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F1F1F0] flex items-center justify-center px-4 py-10">
        <Panel className="w-full max-w-[440px] p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,22,60,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><LockKeyhole className="w-5 h-5" style={{ color: BLUE }} /><p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>Chase Online</p></div>
            <button type="button" onClick={onExit} className="text-[12px] font-semibold hover:underline" style={{ color: BLUE }}>Back to site</button>
          </div>
          <h1 className="mt-5 text-[24px] font-light" style={{ color: INK }}>Administrator sign in</h1>
          <p className="mt-1 text-[13px]" style={{ color: MUTED }}>Chase admin controls for the simulated banking environment.</p>
          {loginError && <p role="alert" className="mt-4 rounded-[4px] bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[13px] text-[#B42318]">{loginError}</p>}
          <form className="mt-5 space-y-4" onSubmit={signIn}>
            <label className="block"><span className="block text-[12.5px] font-semibold mb-1.5" style={{ color: MUTED }}>Admin username</span><input className={fieldCls} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
            <label className="block"><span className="block text-[12.5px] font-semibold mb-1.5" style={{ color: MUTED }}>Password</span><input className={fieldCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <Button type="submit" tone="primary" className="w-full" disabled={busy}>{busy && <Spinner size="sm" tone="white" />}{busy ? 'Signing in…' : 'Sign in as administrator'}</Button>
          </form>
          <Button type="button" tone="outline" className="mt-3 w-full" disabled={busy} onClick={() => void signIn(undefined, { username: 'admin', password: 'chaseadmin123' })}>
            <UserRound className="w-4 h-4" /> One-click Chase admin sign in
          </Button>
          <div className="mt-4 rounded-[4px] bg-[#F7FAFD] border px-3 py-2.5 text-[12px] leading-relaxed" style={{ borderColor: '#CFE0F0', color: MUTED }}>
            Chase admin credentials: <strong style={{ color: INK }}>admin / chaseadmin123</strong>. This portal only changes simulated data; it has no connection to real accounts or payment networks.
          </div>
        </Panel>
      </div>
    );
  }

  const nav: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Users & simulator data', icon: <Users className="w-4 h-4" /> },
    { id: 'accounts', label: 'Accounts', icon: <WalletCards className="w-4 h-4" /> },
    { id: 'transactions', label: 'Ledger activity', icon: <FileText className="w-4 h-4" /> },
    { id: 'operations', label: 'Payments & disputes', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'audit', label: 'Admin audit log', icon: <BookOpenCheck className="w-4 h-4" /> },
    { id: 'settings', label: 'Simulator settings', icon: <LockKeyhole className="w-4 h-4" /> },
  ];

  const handleAdminToolbarAction = (actionId: string) => {
    const map: Record<string, AdminTab> = {
      'footer-accounts': 'overview',
      'footer-pay': 'operations',
      'footer-statements': 'transactions',
      'footer-security': 'settings',
      'footer-budgeting': 'overview',
      'footer-offers': 'overview',
      'footer-advisors': 'overview',
      'footer-locations': 'overview',
    };
    if (map[actionId]) {
      setTab(map[actionId]);
      return;
    }
    if (actionId === 'admin-login') {
      return;
    }
    onExit();
  };

  const metricCards = metrics ? [
    { label: 'Simulator users', value: String(metrics.users), icon: <Users className="w-4 h-4" /> },
    { label: 'Deposit balances', value: money(metrics.deposits), icon: <CircleDollarSign className="w-4 h-4" /> },
    { label: 'Card balances', value: money(metrics.cardBalances), icon: <WalletCards className="w-4 h-4" /> },
    { label: 'Simulated accounts', value: String(metrics.accounts), icon: <Activity className="w-4 h-4" /> },
    { label: 'Transactions', value: String(metrics.transactions), icon: <FileText className="w-4 h-4" /> },
    { label: 'Scheduled payments', value: String(metrics.scheduledPayments), icon: <RefreshCw className="w-4 h-4" /> },
  ] : [];

  return (
    <div className="min-h-screen bg-[#edf2f7] text-[#131313]">
      <Header
        activeSegment="personal"
        onSegmentChange={() => setTab('overview')}
        onAction={handleAdminToolbarAction}
        spanishMode={false}
        onToggleSpanish={() => undefined}
        onFocusSignIn={onExit}
        user={null}
        onGoToDashboard={onExit}
        onSignOut={signOut}
      />

      <main className="mx-auto max-w-[1700px] px-3 py-5 sm:px-5 lg:px-6">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex min-h-[calc(100vh-200px)]">
            <aside className="hidden w-[280px] shrink-0 bg-gradient-to-b from-[#071a3a] via-[#0a2148] to-[#11295d] p-5 text-white lg:flex lg:flex-col">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/10 text-sm font-bold tracking-[0.22em]">C</div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/80">Chase</p>
                  <h2 className="text-base font-semibold">Admin Console</h2>
                </div>
              </div>

              <div className="mt-6 space-y-1">
                {nav.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium transition ${tab === item.id ? 'bg-white text-[#0d1d43] shadow-sm' : 'text-slate-200 hover:bg-white/5'}`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-[9px] ${tab === item.id ? 'bg-[#edf4ff] text-[#1a4488]' : 'bg-white/10 text-current'}`}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-auto rounded-[16px] border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/70">Current admin</p>
                <p className="mt-2 text-[15px] font-semibold">{adminName}</p>
                <p className="text-[12px] text-slate-200">{currentAdminRole === 'admin' ? 'Full admin access' : 'Read-only auditor'}</p>
              </div>
            </aside>

            <div className="flex-1 bg-[#f5f7fb]">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] bg-white px-4 py-5 sm:px-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: BLUE }}>Operations control center</p>
                  <h1 className="mt-1 text-[28px] font-light tracking-[-0.03em]" style={{ color: INK }}>Chase banking administration</h1>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden items-center gap-2 rounded-[10px] border border-[#dfe6ef] bg-[#f8fafc] px-3 py-2 text-sm text-[#5C5C5C] md:flex">
                    <Search className="h-4 w-4" />
                    <span>Search dashboard</span>
                  </div>
                  <Button tone="outline" onClick={() => loadData().then(() => setNotice({ kind: 'success', text: 'Simulator data refreshed.' })).catch((e) => setNotice({ kind: 'error', text: e.message }))}><RefreshCw className="w-4 h-4" /> Refresh data</Button>
                </div>
              </header>

              <div className="p-4 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: BLUE }}>Executive overview</p>
                    <p className="mt-1 text-[13px]" style={{ color: MUTED }}>Monitor customer activity, account health, transfer behavior, and operational controls in a single workspace.</p>
                  </div>
                </div>

                {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-[10px] border px-3 py-2.5 text-[13px] ${notice.kind === 'error' ? 'bg-[#FEF2F2] border-[#F5C2C7] text-[#B42318]' : 'bg-[#EAF7EE] border-[#B5E2C4] text-[#14532D]'}`}>{notice.text}</div>}
                {currentAdminRole === 'auditor' && <div className="mt-3 rounded-[10px] border border-[#CFE0F0] bg-[#F2F7FC] px-3 py-2 text-[12px] text-[#1A4488]">Read-only auditor access: you can inspect, search, and export simulator data. Changes are blocked by the server.</div>}

                <div className="mt-5 rounded-[16px] border border-[#e2e8f0] bg-white p-2 shadow-sm">
                  <nav className="flex gap-1 overflow-x-auto" style={{ borderColor: LINE }} aria-label="Admin sections">
                    {nav.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[13px] ${tab === item.id ? 'font-semibold shadow-sm' : ''}`} style={{ backgroundColor: tab === item.id ? '#eef4ff' : 'transparent', color: tab === item.id ? BLUE : MUTED }}>{item.icon}{item.label}</button>)}
                  </nav>
                </div>

        {tab === 'overview' && (
          <div className="mt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((card) => (
                <Panel key={card.label} className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>{card.label}</p>
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#edf4ff]" style={{ color: BLUE }}>{card.icon}</span>
                  </div>
                  <p className="mt-4 text-[30px] font-light leading-none tracking-[-0.04em]" style={{ color: INK }}>{card.value}</p>
                </Panel>
              ))}
            </div>
            {metrics && metrics.suspendedUsers > 0 && <p className="mt-3 text-[12.5px]" style={{ color: MUTED }}>{metrics.suspendedUsers} simulator user{metrics.suspendedUsers === 1 ? '' : 's'} suspended.</p>}
            <Panel className="mt-4 p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[14px] font-semibold">Activity report</h2><p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>Based on simulated ledger entries; date range is inclusive.</p></div><div className="flex flex-wrap gap-2"><label className="text-[10px] font-semibold">From<input className={`${fieldCls} mt-1`} type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></label><label className="text-[10px] font-semibold">Through<input className={`${fieldCls} mt-1`} type="date" value={reportThrough} onChange={(event) => setReportThrough(event.target.value)} /></label></div></div><div className="mt-3 flex flex-wrap gap-6 text-[12px]"><span><strong>{reportRows.length.toLocaleString()}</strong> entries</span><span><strong>{money(reportRows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0))}</strong> net ledger amount</span></div><div className="mt-4 grid grid-cols-6 gap-3 items-end h-24" aria-label="Monthly transaction counts for the last six months">{monthlyReport.map((month) => { const peak = Math.max(1, ...monthlyReport.map((item) => item.count)); return <div key={month.label} className="flex h-full flex-col items-center justify-end gap-1"><span className="text-[9px]" style={{ color: MUTED }}>{month.count}</span><div className="w-full max-w-10 rounded-t bg-[#1A4488]" style={{ height: `${Math.max(4, month.count / peak * 70)}%` }} /><span className="text-[9px]" style={{ color: FAINT }}>{month.label}</span></div>; })}</div></Panel>
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
              <Panel className="lg:col-span-8 overflow-hidden"><div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h2 className="text-[15px] font-semibold">Customer profiles</h2><button type="button" onClick={() => setTab('users')} className="text-[12.5px] font-semibold hover:underline" style={{ color: BLUE }}>Manage users <ChevronRight className="inline w-3.5 h-3.5" /></button></div><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-[#F7F8F9] text-[11px] uppercase tracking-wide" style={{ color: MUTED }}><tr><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Accounts</th><th className="px-4 py-2.5">Deposits</th></tr></thead><tbody>{users.slice(0, 6).map((user) => <tr key={user.id} className="border-t" style={{ borderColor: LINE }}><td className="px-4 py-3"><button type="button" onClick={() => { setTab('users'); void selectUser(user.id); }} className="text-left hover:underline"><span className="block text-[13px] font-semibold" style={{ color: BLUE }}>{user.fullName}</span><span className="text-[11.5px]" style={{ color: MUTED }}>@{user.username}</span></button></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${user.status === 'active' ? 'bg-[#EAF7EE] text-[#138842]' : 'bg-[#FEF2F2] text-[#B42318]'}`}>{user.status}</span></td><td className="px-4 py-3 text-[12.5px]">{user.accountCount}</td><td className="px-4 py-3 text-[12.5px]">{money(user.depositBalance)}</td></tr>)}</tbody></table></div></Panel>
              <Panel className="lg:col-span-4 p-5"><h2 className="text-[15px] font-semibold">Recent admin activity</h2>{audit.length === 0 ? <p className="mt-3 text-[12.5px]" style={{ color: MUTED }}>Admin actions will be recorded here.</p> : <ul className="mt-3 space-y-3">{audit.slice(0, 6).map((entry) => <li key={entry.id} className="border-t pt-2.5 first:border-0 first:pt-0" style={{ borderColor: LINE }}><p className="text-[12.5px] font-semibold">{entry.action}</p><p className="mt-0.5 text-[11px]" style={{ color: FAINT }}>{dateTime(entry.createdAt)}</p></li>)}</ul>}</Panel>
            </div>
            <Panel className="mt-5 p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-semibold">Start over with a clean simulator</p><p className="text-[11.5px]" style={{ color: MUTED }}>Deletes all simulated customer records and sessions, then restores the sample Chase profile. Admin audit history remains.</p></div><Button tone="danger" onClick={() => setConfirmReset(true)}><RefreshCw className="w-4 h-4" /> Reset simulator</Button></Panel>
            {confirmReset && <Panel className="mt-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#B42318]">Confirm full simulator reset</p><p className="mt-1 text-[12px]" style={{ color: MUTED }}>This permanently removes all customer profiles and simulated history. Type <strong>RESET SIMULATOR</strong>.</p></div><button type="button" onClick={() => { setConfirmReset(false); setResetText(''); }} aria-label="Close reset confirmation"><X className="w-4 h-4" /></button></div><div className="mt-3 flex flex-wrap gap-2"><input className={`${fieldCls} max-w-[280px]`} value={resetText} onChange={(e) => setResetText(e.target.value)} /><Button tone="danger" disabled={busy || resetText !== 'RESET SIMULATOR'} onClick={() => void resetSimulator()}>{busy && <Spinner size="sm" />} Confirm reset</Button></div></Panel>}
          </div>
        )}

        {tab === 'users' && (
          <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <Panel className="xl:col-span-4 overflow-hidden">
              <div className="p-4 border-b" style={{ borderColor: LINE }}><div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Simulator users</h2><div className="flex gap-1"><Button onClick={exportUsers} className="min-h-8 px-2.5 text-[11px]"><FileText className="w-3.5 h-3.5" /> Export</Button><Button onClick={() => setShowCreate((v) => !v)} className="min-h-8 px-2.5 text-[11.5px]"><Plus className="w-3.5 h-3.5" /> New user</Button></div></div><div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"><div className="relative sm:col-span-2"><Search className="absolute left-3 top-3 w-4 h-4" style={{ color: FAINT }} /><input className={`${fieldCls} pl-9`} placeholder="Search users" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select className={fieldCls} aria-label="Filter users by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="active">Active only</option><option value="suspended">Suspended only</option></select></div></div>
              {showCreate && <form onSubmit={createUser} className="p-4 bg-[#F7FAFD] border-b space-y-2.5" style={{ borderColor: LINE }}><p className="text-[12.5px] font-semibold">Create sample profile</p><input className={fieldCls} placeholder="Username (4–32 characters)" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required minLength={4} /><input className={fieldCls} placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} required /><input className={fieldCls} type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /><input className={fieldCls} type="password" placeholder="Temporary password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /><Button type="submit" tone="primary" disabled={busy}><Plus className="w-4 h-4" /> Create simulator user</Button></form>}
              <div className="flex items-center justify-between px-4 py-2 text-[10.5px]" style={{ color: MUTED }}><span>{filteredUsers.length.toLocaleString()} customers</span><div className="flex items-center gap-2"><button type="button" disabled={usersPage === 0} onClick={() => setUsersPage((page) => Math.max(0, page - 1))}>Previous</button><span>{usersPage + 1}/{Math.max(1, Math.ceil(filteredUsers.length / 25))}</span><button type="button" disabled={(usersPage + 1) * 25 >= filteredUsers.length} onClick={() => setUsersPage((page) => page + 1)}>Next</button></div></div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 bg-[#FBFCFD]">
                <label className="inline-flex items-center gap-2 text-[10.5px]" style={{ color: MUTED }}><input type="checkbox" checked={filteredUsers.slice(usersPage * 25, usersPage * 25 + 25).length > 0 && filteredUsers.slice(usersPage * 25, usersPage * 25 + 25).every((user) => selectedUserIds.includes(user.id))} onChange={(event) => setSelectedUserIds((ids) => event.target.checked ? [...new Set([...ids, ...filteredUsers.slice(usersPage * 25, usersPage * 25 + 25).map((user) => user.id)])] : ids.filter((id) => !filteredUsers.slice(usersPage * 25, usersPage * 25 + 25).some((user) => user.id === id)))} />Select page</label>
                <div className="flex flex-wrap gap-1"><Button className="min-h-7 px-2 text-[9.5px]" disabled={busy || !selectedUserIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkUsers('suspend')}>Suspend selected</Button><Button className="min-h-7 px-2 text-[9.5px]" disabled={busy || !selectedUserIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkUsers('reactivate')}>Reactivate</Button><Button tone="danger" className="min-h-7 px-2 text-[9.5px]" disabled={busy || !selectedUserIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkUsers('delete')}>Delete</Button></div>
              </div>
              <ul className="max-h-[680px] overflow-y-auto">{filteredUsers.slice(usersPage * 25, usersPage * 25 + 25).map((user) => <li key={user.id} className="flex items-center border-b last:border-0" style={{ borderColor: LINE }}><input className="ml-3" aria-label={`Select ${user.username}`} type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={(event) => setSelectedUserIds((ids) => event.target.checked ? [...new Set([...ids, user.id])] : ids.filter((id) => id !== user.id))} /><button type="button" onClick={() => void selectUser(user.id)} className={`min-w-0 flex-1 text-left px-3 py-3 hover:bg-[#F7FAFD] ${selectedUser?.id === user.id ? 'bg-[#F2F6FB]' : ''}`}><span className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold truncate" style={{ color: BLUE }}>{user.fullName}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${user.status === 'active' ? 'bg-[#EAF7EE] text-[#138842]' : 'bg-[#FEF2F2] text-[#B42318]'}`}>{user.status}</span></span><span className="block text-[11.5px]" style={{ color: MUTED }}>@{user.username} · {user.accountCount} accounts</span><span className="block mt-1 text-[11px]" style={{ color: FAINT }}>Deposits {money(user.depositBalance)} · Cards {money(user.cardBalance)}</span></button></li>)}{filteredUsers.length === 0 && <li className="p-5 text-[12.5px]" style={{ color: MUTED }}>No simulator users match this search.</li>}</ul>
            </Panel>

            <div className="xl:col-span-8 space-y-4">
              {!selectedUser ? <Panel className="p-8 text-center"><UserRound className="mx-auto w-7 h-7" style={{ color: BLUE }} /><p className="mt-2 text-[14px] font-semibold">Choose a simulator user</p><p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>You can manage their complete simulated profile, or open a customer-view session.</p></Panel> : <>
                <Panel className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Selected simulator customer</p><h2 className="mt-0.5 text-[20px] font-light">{selectedUser.fullName}</h2><p className="text-[12.5px]" style={{ color: MUTED }}>@{selectedUser.username} · {selectedUser.email}</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => void impersonate()} disabled={busy}><UserRound className="w-4 h-4" /> View as user</Button><Button onClick={() => void changeStatus()} disabled={busy} tone={selectedUser.status === 'suspended' ? 'primary' : 'outline'}>{selectedUser.status === 'suspended' ? 'Reactivate' : 'Suspend'}</Button><Button onClick={() => void revokeSessions()} disabled={busy}>Revoke sessions</Button><Button tone="danger" onClick={() => void deleteUser()} disabled={busy}><Trash2 className="w-4 h-4" /> Delete</Button></div></div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"><div className="rounded-[4px] bg-[#F7F8F9] p-3"><p className="text-[10.5px]" style={{ color: FAINT }}>Accounts</p><p className="text-[15px] font-semibold">{selectedUser.accounts.length}</p></div><div className="rounded-[4px] bg-[#F7F8F9] p-3"><p className="text-[10.5px]" style={{ color: FAINT }}>Deposits</p><p className="text-[15px] font-semibold">{money(selectedUser.accounts.filter((a) => ['checking', 'savings', 'cd'].includes(a.type)).reduce((s, a) => s + a.balance, 0))}</p></div><div className="rounded-[4px] bg-[#F7F8F9] p-3"><p className="text-[10.5px]" style={{ color: FAINT }}>Card balances</p><p className="text-[15px] font-semibold">{money(selectedUser.accounts.filter((a) => a.type === 'credit-card').reduce((s, a) => s + a.balance, 0))}</p></div><div className="rounded-[4px] bg-[#F7F8F9] p-3"><p className="text-[10.5px]" style={{ color: FAINT }}>Credit score</p><p className="text-[15px] font-semibold">{selectedUser.credit?.score ?? '—'}</p></div></div>
                </Panel>
                <Panel className="p-5">
                  <div className="flex items-start gap-2"><CalendarDays className="w-4 h-4 mt-0.5" style={{ color: BLUE }} /><div><h3 className="text-[15px] font-semibold">Generate transaction history</h3><p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Create posted, simulated activity over any date range—including days, months, or multiple years. Balances and rewards update with the generated ledger entries.</p></div></div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>From</span><input type="date" className={fieldCls} value={activityStart} max={activityEnd || inputDate()} onChange={(e) => setActivityStart(e.target.value)} /></label>
                    <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Through</span><input type="date" className={fieldCls} value={activityEnd} min={activityStart} max={inputDate()} onChange={(e) => setActivityEnd(e.target.value)} /></label>
                    <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Activity cadence</span><select className={fieldCls} value={activityCadence} onChange={(e) => setActivityCadence(e.target.value as typeof activityCadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
                    <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Entries per cadence</span><select className={fieldCls} value={perPeriod} onChange={(e) => setPerPeriod(e.target.value)}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} per interval</option>)}</select></label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px]" style={{ color: FAINT }}>Maximum 2,500 activity events per run. Transfers and card payments create matching ledger entries; no external services are contacted.</p><Button tone="primary" onClick={() => void generateHistory()} disabled={busy || !activityStart || !activityEnd || activityStart > activityEnd}><Sparkles className="w-4 h-4" /> Generate simulated transactions</Button></div>
                </Panel>
                <Panel className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-[15px] font-semibold">Complete simulator record</h3><p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Edit profile, accounts, ledger transactions, payments, rewards, credit, budgets, preferences, and more in one record. Password hashes are never exposed or editable.</p></div><Button tone="primary" onClick={() => void saveRecord()} disabled={busy}><FileText className="w-4 h-4" /> Save all data</Button></div><textarea aria-label="Complete simulator user JSON" spellCheck={false} value={userJson} onChange={(e) => setUserJson(e.target.value)} className="mt-3 w-full min-h-[420px] resize-y rounded-[4px] border border-[#B7BEC6] bg-[#FBFCFD] px-3 py-2.5 text-[12px] leading-relaxed text-[#131313] outline-none focus:border-[#1A4488]" /><p className="mt-1.5 text-[11px]" style={{ color: FAINT }}>JSON is validated by the server before saving. Account IDs, types, and balances are checked.</p></Panel>
                <Panel className="p-5"><div className="flex items-center gap-2"><KeyRound className="w-4 h-4" style={{ color: BLUE }} /><h3 className="text-[14px] font-semibold">Reset customer password</h3></div><div className="mt-2.5 flex flex-wrap gap-2"><input className={`${fieldCls} max-w-[280px]`} type="password" minLength={8} placeholder="New password (8+ characters)" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} /><Button onClick={() => void resetUserPassword()} disabled={busy || resetPassword.length < 8}>Reset password</Button></div></Panel>
              </>}
            </div>
          </div>
        )}

        {tab === 'accounts' && (
          <div className="mt-5 space-y-4">
            <Panel className="p-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[260px] flex-1"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Simulator customer</span><select className={fieldCls} value={selectedUser?.id || ''} onChange={(event) => { if (event.target.value) void selectUser(event.target.value); }}><option value="">Choose a customer</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} (@{user.username})</option>)}</select></label>
              {selectedUser && <p className="text-[12px]" style={{ color: MUTED }}>{selectedUser.accounts.length} account{selectedUser.accounts.length === 1 ? '' : 's'} · {selectedUser.status}</p>}
            </Panel>
            {selectedUser && <>
              <Panel className="p-3 flex flex-wrap items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-[11px]"><input type="checkbox" checked={selectedUser.accounts.length > 0 && selectedUser.accounts.every((account) => selectedAccountIds.includes(account.id))} onChange={(event) => setSelectedAccountIds(event.target.checked ? selectedUser.accounts.map((account) => account.id) : [])} />Select all accounts</label><div className="flex flex-wrap gap-2"><Button className="min-h-8 px-2 text-[10px]" disabled={busy || !selectedAccountIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkAccounts('lock')}>Lock selected</Button><Button className="min-h-8 px-2 text-[10px]" disabled={busy || !selectedAccountIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkAccounts('unlock')}>Unlock selected</Button><Button tone="danger" className="min-h-8 px-2 text-[10px]" disabled={busy || !selectedAccountIds.length || currentAdminRole !== 'admin'} onClick={() => void bulkAccounts('delete')}>Delete selected</Button></div></Panel>
              <Panel className="p-5">
                <h2 className="text-[15px] font-semibold">Add simulated account</h2>
                <form onSubmit={createAccount} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Account type</span><select className={fieldCls} value={newAccountType} onChange={(event) => setNewAccountType(event.target.value as AccountType)}><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit-card">Credit card</option><option value="cd">CD</option><option value="auto-loan">Auto loan</option><option value="mortgage">Mortgage</option></select></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Display name</span><input className={fieldCls} value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} required maxLength={80} placeholder="Account name" /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Balance</span><input className={fieldCls} type="number" step="0.01" value={newAccountBalance} onChange={(event) => setNewAccountBalance(event.target.value)} required /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Credit limit (optional)</span><input className={fieldCls} type="number" min="0" step="0.01" value={newAccountLimit} onChange={(event) => setNewAccountLimit(event.target.value)} /></label>
                  <Button type="submit" tone="primary" disabled={busy}><Plus className="w-4 h-4" /> Add account</Button>
                </form>
              </Panel>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {selectedUser.accounts.map((account) => {
                  const draft = accountDrafts[account.id] || { name: account.name, balance: String(account.balance), creditLimit: account.creditLimit == null ? '' : String(account.creditLimit), locked: !!account.locked, autopay: !!account.autopay };
                  return <Panel key={account.id} className="p-4">
                    <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><input className="mt-1" type="checkbox" aria-label={`Select ${account.name}`} checked={selectedAccountIds.includes(account.id)} onChange={(event) => setSelectedAccountIds((ids) => event.target.checked ? [...new Set([...ids, account.id])] : ids.filter((id) => id !== account.id))} /><div><p className="text-[14px] font-semibold">{account.name}</p><p className="text-[11.5px]" style={{ color: MUTED }}>{account.type} · •••• {account.mask} · {account.transactions.length} ledger entries</p></div></div><span className="rounded-full bg-[#F2F6FB] px-2 py-1 text-[10px] font-semibold" style={{ color: BLUE }}>{account.type}</span></div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="block"><span className="block text-[10.5px] font-semibold mb-1">Name</span><input className={fieldCls} value={draft.name} onChange={(event) => setAccountDrafts((previous) => ({ ...previous, [account.id]: { ...draft, name: event.target.value } }))} /></label>
                      <label className="block"><span className="block text-[10.5px] font-semibold mb-1">Balance</span><input className={fieldCls} type="number" step="0.01" value={draft.balance} onChange={(event) => setAccountDrafts((previous) => ({ ...previous, [account.id]: { ...draft, balance: event.target.value } }))} /></label>
                      <label className="block"><span className="block text-[10.5px] font-semibold mb-1">Credit limit</span><input className={fieldCls} type="number" min="0" step="0.01" value={draft.creditLimit} onChange={(event) => setAccountDrafts((previous) => ({ ...previous, [account.id]: { ...draft, creditLimit: event.target.value } }))} /></label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-4 text-[12px]"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={draft.locked} onChange={(event) => setAccountDrafts((previous) => ({ ...previous, [account.id]: { ...draft, locked: event.target.checked } }))} /> Locked</label><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={draft.autopay} onChange={(event) => setAccountDrafts((previous) => ({ ...previous, [account.id]: { ...draft, autopay: event.target.checked } }))} /> Autopay</label></div><div className="flex gap-2"><Button onClick={() => void saveAccount(account.id)} disabled={busy}>Save</Button><Button tone="danger" onClick={() => void deleteAccount(account.id)} disabled={busy}><Trash2 className="w-4 h-4" /> Delete</Button></div></div>
                  </Panel>;
                })}
              </div>
              {selectedUser.accounts.length === 0 && <Panel className="p-8 text-center text-[13px] text-[#5C5C5C]">No simulated accounts yet. Add one above.</Panel>}
            </>}
          </div>
        )}

        {tab === 'transactions' && (
          <div className="mt-5 space-y-4">
            <Panel className="p-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[260px] flex-1"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Simulator customer</span><select className={fieldCls} value={selectedUser?.id || '__all__'} onChange={(event) => { if (event.target.value === '__all__') { setSelectedUser(null); setUserJson(''); } else void selectUser(event.target.value); }}><option value="__all__">All customers</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} (@{user.username})</option>)}</select></label>
              <label className="block min-w-[220px] flex-1"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Filter ledger</span><input className={fieldCls} placeholder="Search customer, account, description, category" value={ledgerQuery} onChange={(event) => setLedgerQuery(event.target.value)} /></label>
              <select className={fieldCls} aria-label="Filter ledger status" value={ledgerStatusFilter} onChange={(event) => setLedgerStatusFilter(event.target.value as typeof ledgerStatusFilter)}><option value="all">All statuses</option><option value="posted">Posted</option><option value="pending">Pending</option></select>
              <select className={fieldCls} aria-label="Filter account type" value={ledgerTypeFilter} onChange={(event) => setLedgerTypeFilter(event.target.value)}><option value="all">All account types</option><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit-card">Credit card</option><option value="cd">CD</option><option value="auto-loan">Auto loan</option><option value="mortgage">Mortgage</option></select>
              <label className="block"><span className="block text-[10px] font-semibold">From</span><input type="date" className={fieldCls} value={ledgerFrom} onChange={(event) => setLedgerFrom(event.target.value)} /></label>
              <label className="block"><span className="block text-[10px] font-semibold">Through</span><input type="date" className={fieldCls} value={ledgerThrough} onChange={(event) => setLedgerThrough(event.target.value)} /></label>
              {selectedUser ? <Button onClick={() => exportCsv(`ledger-${selectedUser.username}.csv`, ['Date', 'Account', 'Description', 'Category', 'Status', 'Amount'], globalTransactions.filter((transaction) => transaction.userId === selectedUser.id && `${transaction.description} ${transaction.category} ${transaction.accountName}`.toLowerCase().includes(ledgerQuery.toLowerCase()) && (ledgerStatusFilter === 'all' || transaction.status === ledgerStatusFilter) && (ledgerTypeFilter === 'all' || transaction.accountType === ledgerTypeFilter) && (!ledgerFrom || transaction.date.slice(0, 10) >= ledgerFrom) && (!ledgerThrough || transaction.date.slice(0, 10) <= ledgerThrough)).map((transaction) => [transaction.date, transaction.accountName, transaction.description, transaction.category, transaction.status, transaction.amount]))}><FileText className="w-4 h-4" /> Export CSV</Button> : <Button onClick={() => exportCsv('all-simulator-ledger.csv', ['Date', 'Username', 'Customer', 'Account', 'Description', 'Category', 'Status', 'Amount'], filteredGlobalTransactions.map((transaction) => [transaction.date, transaction.username, transaction.fullName, transaction.accountName, transaction.description, transaction.category, transaction.status, transaction.amount]))}><FileText className="w-4 h-4" /> Export all CSV</Button>}
            </Panel>
            {!selectedUser && <Panel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-[#F7F8F9] text-[10.5px] uppercase tracking-wide" style={{ color: MUTED }}><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{filteredGlobalTransactions.slice(globalPage * 50, globalPage * 50 + 50).map((transaction) => <tr key={`${transaction.userId}-${transaction.id}`} className="border-t" style={{ borderColor: LINE }}><td className="px-3 py-2 text-[11px] whitespace-nowrap">{new Date(transaction.date).toLocaleDateString()}</td><td className="px-3 py-2 text-[11px]">{transaction.fullName}<span className="block" style={{ color: MUTED }}>@{transaction.username}</span></td><td className="px-3 py-2 text-[11px]">{transaction.accountName}</td><td className="px-3 py-2 text-[11px]">{transaction.description}</td><td className="px-3 py-2 text-[11px]">{transaction.status}</td><td className="px-3 py-2 text-[11px] text-right">{money(transaction.amount)}</td><td className="px-3 py-2"><div className="flex gap-1"><Button className="min-h-8 px-2 text-[10px]" onClick={() => void editGlobalLedgerEntry(transaction)} disabled={busy}>Edit</Button><Button tone="danger" className="min-h-8 px-2 text-[10px]" onClick={() => void deleteGlobalLedgerEntry(transaction)} disabled={busy}>Delete</Button></div></td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-2 border-t p-3 text-[11px]" style={{ borderColor: LINE }}><span>{filteredGlobalTransactions.length.toLocaleString()} matching ledger entries</span><div className="flex gap-2"><Button className="min-h-8 px-2 text-[10px]" disabled={globalPage === 0} onClick={() => setGlobalPage((page) => Math.max(0, page - 1))}>Previous</Button><span className="self-center">Page {globalPage + 1} of {Math.max(1, Math.ceil(filteredGlobalTransactions.length / 50))}</span><Button className="min-h-8 px-2 text-[10px]" disabled={(globalPage + 1) * 50 >= filteredGlobalTransactions.length} onClick={() => setGlobalPage((page) => page + 1)}>Next</Button></div></div></Panel>}
            {selectedUser && <>
              <Panel className="p-5">
                <h2 className="text-[15px] font-semibold">Add ledger activity</h2>
                <p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>This edits simulated ledger history and applies the signed amount to the account balance. Negative amounts are debits.</p>
                <form onSubmit={createLedgerEntry} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                  <label className="block lg:col-span-2"><span className="block text-[11px] font-semibold mb-1">Account</span><select className={fieldCls} value={ledgerAccountId || selectedUser.accounts[0]?.id || ''} onChange={(event) => setLedgerAccountId(event.target.value)} required>{selectedUser.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · •••• {account.mask}</option>)}</select></label>
                  <label className="block lg:col-span-2"><span className="block text-[11px] font-semibold mb-1">Description</span><input className={fieldCls} value={ledgerDescription} onChange={(event) => setLedgerDescription(event.target.value)} required maxLength={120} /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Signed amount</span><input className={fieldCls} type="number" step="0.01" value={ledgerAmount} onChange={(event) => setLedgerAmount(event.target.value)} required /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Date</span><input className={fieldCls} type="date" value={ledgerDate} onChange={(event) => setLedgerDate(event.target.value)} required /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Category</span><input className={fieldCls} value={ledgerCategory} onChange={(event) => setLedgerCategory(event.target.value)} /></label>
                  <label className="block"><span className="block text-[11px] font-semibold mb-1">Status</span><select className={fieldCls} value={ledgerStatus} onChange={(event) => setLedgerStatus(event.target.value as 'posted' | 'pending')}><option value="posted">Posted</option><option value="pending">Pending</option></select></label>
                  <Button type="submit" tone="primary" disabled={busy || selectedUser.accounts.length === 0}><Plus className="w-4 h-4" /> Add entry</Button>
                </form>
              </Panel>
              <Panel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-[#F7F8F9] text-[10.5px] uppercase tracking-wide" style={{ color: MUTED }}><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{selectedUser.accounts.flatMap((account) => account.transactions.map((transaction) => ({ ...transaction, accountName: account.name, accountType: account.type }))).filter((transaction) => `${transaction.description} ${transaction.category} ${transaction.accountName}`.toLowerCase().includes(ledgerQuery.toLowerCase()) && (ledgerStatusFilter === 'all' || transaction.status === ledgerStatusFilter) && (ledgerTypeFilter === 'all' || transaction.accountType === ledgerTypeFilter) && (!ledgerFrom || transaction.date.slice(0, 10) >= ledgerFrom) && (!ledgerThrough || transaction.date.slice(0, 10) <= ledgerThrough)).sort((a, b) => b.date.localeCompare(a.date)).map((transaction) => <tr key={transaction.id} className="border-t" style={{ borderColor: LINE }}><td className="px-4 py-3 text-[11.5px] whitespace-nowrap">{new Date(transaction.date).toLocaleDateString()}</td><td className="px-4 py-3 text-[11.5px]">{transaction.accountName}</td><td className="px-4 py-3"><span className="block text-[12px] font-semibold">{transaction.description}</span><span className="text-[10.5px]" style={{ color: MUTED }}>{transaction.category}</span></td><td className="px-4 py-3 text-[11.5px]">{transaction.status}</td><td className="px-4 py-3 text-[12px] text-right font-semibold">{money(transaction.amount)}</td><td className="px-4 py-3"><div className="flex gap-1"><Button className="min-h-8 px-2 text-[11px]" onClick={() => void editLedgerEntry(transaction.id, transaction)} disabled={busy}>Edit</Button><Button tone="danger" className="min-h-8 px-2 text-[11px]" onClick={() => void deleteLedgerEntry(transaction.id)} disabled={busy}>Delete</Button></div></td></tr>)}</tbody></table></div>{selectedUser.accounts.every((account) => account.transactions.length === 0) && <p className="p-6 text-center text-[12px]" style={{ color: MUTED }}>No ledger entries for this customer.</p>}</Panel>
              <Panel className="p-3 text-[11.5px] text-[#5C5C5C]">All activity is simulated. Ledger edits do not initiate transfers, contact payment networks, or move real money.</Panel>
            </>}
          </div>
        )}

        {tab === 'operations' && (
          <div className="mt-5 space-y-4">
            <Panel className="p-4"><label className="block max-w-xl"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: MUTED }}>Simulator customer</span><select className={fieldCls} value={selectedUser?.id || ''} onChange={(event) => { if (event.target.value) void selectUser(event.target.value); }}><option value="">Choose a customer</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} (@{user.username})</option>)}</select></label></Panel>
            {selectedUser && <>
              <Panel className="p-5"><h2 className="text-[15px] font-semibold">Post a simulated transfer or payment</h2><p className="mt-1 text-[11px]" style={{ color: MUTED }}>Moves only sample balances between this customer’s accounts; no external service is contacted.</p><form onSubmit={createAdminTransfer} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end"><label className="block"><span className="block text-[10.5px] font-semibold mb-1">From checking/savings</span><select className={fieldCls} value={transferFromId || selectedUser.accounts.find((account) => ['checking', 'savings', 'cd'].includes(account.type))?.id || ''} onChange={(event) => { setTransferFromId(event.target.value); if (event.target.value === transferToId) setTransferToId(''); }} required>{selectedUser.accounts.filter((account) => ['checking', 'savings', 'cd'].includes(account.type)).map((account) => <option key={account.id} value={account.id}>{account.name} · {money(account.balance)}</option>)}</select></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">To account / pay down</span><select className={fieldCls} value={transferToId} onChange={(event) => setTransferToId(event.target.value)} required><option value="">Choose destination</option>{selectedUser.accounts.filter((account) => account.id !== (transferFromId || selectedUser.accounts.find((item) => ['checking', 'savings', 'cd'].includes(item.type))?.id)).map((account) => <option key={account.id} value={account.id}>{account.name} · {money(account.balance)}</option>)}</select></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Amount</span><input className={fieldCls} type="number" min="0.01" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} required /></label><label className="block lg:col-span-1"><span className="block text-[10.5px] font-semibold mb-1">Description</span><input className={fieldCls} value={transferDescription} onChange={(event) => setTransferDescription(event.target.value)} maxLength={100} required /></label><Button type="submit" tone="primary" disabled={busy || currentAdminRole !== 'admin' || selectedUser.accounts.filter((account) => ['checking', 'savings', 'cd'].includes(account.type)).length === 0 || selectedUser.accounts.length < 2}>Post simulated transfer</Button></form></Panel>
              <Panel className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold">Payees</h2><p className="mt-1 text-[11px]" style={{ color: MUTED }}>Manage masked Chase destinations only.</p></div></div>
                <form onSubmit={createPayee} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Name</span><input className={fieldCls} value={payeeName} onChange={(event) => setPayeeName(event.target.value)} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Masked account reference</span><input className={fieldCls} value={payeeAccount} onChange={(event) => setPayeeAccount(event.target.value)} required placeholder="•••• 1234" /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Category</span><input className={fieldCls} value={payeeCategory} onChange={(event) => setPayeeCategory(event.target.value)} /></label><Button type="submit" tone="primary" disabled={busy || currentAdminRole !== 'admin'}><Plus className="w-4 h-4" /> Add payee</Button></form>
                <ul className="mt-3 divide-y" style={{ borderColor: LINE }}>{selectedUser.payees.map((payee) => <li key={payee.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-[12.5px]">{payee.name}</strong><span className="ml-2 text-[11px]" style={{ color: MUTED }}>{payee.category} · {payee.accountNumber}</span></div><div className="flex gap-2"><Button className="min-h-8 px-2.5 text-[10.5px]" onClick={() => void editPayee(payee)} disabled={busy || currentAdminRole !== 'admin'}>Edit</Button><Button tone="danger" className="min-h-8 px-2.5 text-[10.5px]" onClick={() => void deletePayee(payee)} disabled={busy || currentAdminRole !== 'admin'}>Delete</Button></div></li>)}{selectedUser.payees.length === 0 && <li className="py-4 text-[12px]" style={{ color: MUTED }}>No payees saved.</li>}</ul>
              </Panel>

              <Panel className="p-5"><h2 className="text-[15px] font-semibold">Scheduled simulator payments</h2><p className="mt-1 text-[11px]" style={{ color: MUTED }}>Schedules are records only and do not execute against payment networks.</p>
                <form onSubmit={createScheduledPayment} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end"><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Kind</span><select className={fieldCls} value={scheduleKind} onChange={(event) => setScheduleKind(event.target.value as typeof scheduleKind)}><option value="bill">Bill</option><option value="transfer">Transfer</option><option value="card">Card payment</option><option value="loan">Loan payment</option></select></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Label</span><input className={fieldCls} value={scheduleLabel} onChange={(event) => setScheduleLabel(event.target.value)} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">From account</span><select className={fieldCls} value={scheduleFromId || selectedUser.accounts[0]?.id || ''} onChange={(event) => setScheduleFromId(event.target.value)} required>{selectedUser.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{scheduleKind === 'bill' ? <label className="block"><span className="block text-[10.5px] font-semibold mb-1">Payee</span><select className={fieldCls} value={schedulePayeeId || selectedUser.payees[0]?.id || ''} onChange={(event) => setSchedulePayeeId(event.target.value)} required>{selectedUser.payees.map((payee) => <option key={payee.id} value={payee.id}>{payee.name}</option>)}</select></label> : <label className="block"><span className="block text-[10.5px] font-semibold mb-1">Destination account (optional)</span><select className={fieldCls} value={scheduleTargetId} onChange={(event) => setScheduleTargetId(event.target.value)}><option value="">Not specified</option>{selectedUser.accounts.filter((account) => account.id !== (scheduleFromId || selectedUser.accounts[0]?.id)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}<label className="block"><span className="block text-[10.5px] font-semibold mb-1">Amount</span><input className={fieldCls} type="number" min="0.01" step="0.01" value={scheduleAmount} onChange={(event) => setScheduleAmount(event.target.value)} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Next date</span><input className={fieldCls} type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Frequency</span><select className={fieldCls} value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value as typeof scheduleFrequency)}><option value="once">Once</option><option value="monthly">Monthly</option></select></label><Button type="submit" tone="primary" disabled={busy || currentAdminRole !== 'admin' || selectedUser.accounts.length === 0 || (scheduleKind === 'bill' && selectedUser.payees.length === 0)}><Plus className="w-4 h-4" /> Add schedule</Button></form>
                <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead className="bg-[#F7F8F9] text-[10.5px] uppercase" style={{ color: MUTED }}><tr><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Date / cadence</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{(selectedUser.scheduledPayments || []).map((payment) => <tr key={payment.id} className="border-t" style={{ borderColor: LINE }}><td className="px-3 py-2 text-[11.5px]">{payment.label}<span className="block" style={{ color: MUTED }}>{payment.kind}</span></td><td className="px-3 py-2 text-[11px]">{new Date(payment.date).toLocaleDateString()} · {payment.frequency}</td><td className="px-3 py-2 text-[11px]">{payment.status}</td><td className="px-3 py-2 text-right text-[11px]">{money(payment.amount)}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-1"><Button className="min-h-8 px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} onClick={() => void editSchedule(payment)}>Edit</Button><Button className="min-h-8 px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} onClick={() => void updateScheduleStatus(payment.id, payment.status === 'paused' ? 'scheduled' : 'paused')}>{payment.status === 'paused' ? 'Resume' : 'Pause'}</Button><Button className="min-h-8 px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} onClick={() => void updateScheduleStatus(payment.id, 'cancelled')}>Cancel</Button><Button tone="danger" className="min-h-8 px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} onClick={() => void deleteSchedule(payment.id, payment.label)}>Delete</Button></div></td></tr>)}</tbody></table></div>
              </Panel>

              <Panel className="p-5"><h2 className="text-[15px] font-semibold">Card disputes & simulated refunds</h2><p className="mt-1 text-[11px]" style={{ color: MUTED }}>A refund adds a simulated card-credit ledger entry and adjusts the Chase card balance only.</p>
                <form onSubmit={openDispute} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"><label className="block sm:col-span-2"><span className="block text-[10.5px] font-semibold mb-1">Card purchase</span><select className={fieldCls} value={disputePurchase} onChange={(event) => setDisputePurchase(event.target.value)} required><option value="">Choose an eligible purchase</option>{selectedUser.accounts.filter((account) => account.type === 'credit-card').flatMap((account) => account.transactions.filter((transaction) => transaction.amount > 0 && !(selectedUser.disputes || []).some((dispute) => dispute.transactionId === transaction.id && dispute.status === 'open')).map((transaction) => <option key={transaction.id} value={`${account.id}|${transaction.id}`}>{account.name} · {transaction.description} · {money(transaction.amount)}</option>))}</select></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Reason</span><input className={fieldCls} value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} required /></label><Button type="submit" tone="primary" disabled={busy || currentAdminRole !== 'admin'}><Plus className="w-4 h-4" /> Open dispute</Button></form>
                <ul className="mt-3 divide-y" style={{ borderColor: LINE }}>{(selectedUser.disputes || []).map((dispute) => <li key={dispute.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="block text-[12px]">{dispute.description} · {money(dispute.amount)}</strong><span className="text-[11px]" style={{ color: MUTED }}>{dispute.reason} · {dispute.status} · {dateTime(dispute.createdAt)}</span></div><div className="flex flex-wrap gap-1"><select className="h-8 rounded border px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} value={dispute.status} onChange={(event) => void setDisputeStatus(dispute.id, event.target.value as 'open' | 'resolved' | 'denied')}><option value="open">Open</option><option value="resolved">Resolved</option><option value="denied">Denied</option></select>{dispute.status === 'open' && <Button tone="primary" className="min-h-8 px-2 text-[10px]" disabled={busy || currentAdminRole !== 'admin'} onClick={() => void issueDisputeRefund(dispute)}>Issue simulated refund</Button>}</div></li>)}{!(selectedUser.disputes || []).length && <li className="py-4 text-[12px]" style={{ color: MUTED }}>No disputes on this profile.</li>}</ul>
              </Panel>
            </>}
          </div>
        )}

        {tab === 'audit' && <Panel className="mt-5 overflow-hidden"><div className="px-5 py-4 border-b" style={{ borderColor: LINE }}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[15px] font-semibold">Administrator audit log</h2><p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Administrative mutations and impersonation actions are recorded locally; latest 5,000 retained entries shown.</p></div><Button onClick={() => exportCsv('admin-audit.csv', ['Date', 'Actor', 'Action', 'Details'], filteredAudit.map((entry) => [entry.createdAt, entry.actor, entry.action, JSON.stringify(entry.details)]))}><FileText className="w-4 h-4" /> Export CSV</Button></div><input className={`${fieldCls} mt-3`} placeholder="Filter by actor, action, or details" value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} /></div>{audit.length === 0 ? <p className="px-5 py-6 text-[13px]" style={{ color: MUTED }}>No admin actions recorded yet.</p> : <><ul>{filteredAudit.slice(auditPage * 50, auditPage * 50 + 50).map((entry) => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 border-b last:border-0" style={{ borderColor: LINE }}><div><p className="text-[13px] font-semibold">{entry.action}</p><p className="mt-0.5 text-[11.5px]" style={{ color: MUTED }}>{entry.actor}{Object.keys(entry.details || {}).length ? ` · ${Object.entries(entry.details).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}` : ''}</p></div><time className="text-[11px] shrink-0" style={{ color: FAINT }}>{dateTime(entry.createdAt)}</time></li>)}</ul><div className="flex items-center justify-between border-t p-3 text-[11px]" style={{ borderColor: LINE }}><span>{filteredAudit.length.toLocaleString()} matching audit entries</span><div className="flex gap-2"><Button className="min-h-8 px-2 text-[10px]" disabled={auditPage === 0} onClick={() => setAuditPage((page) => Math.max(0, page - 1))}>Previous</Button><span className="self-center">Page {auditPage + 1} of {Math.max(1, Math.ceil(filteredAudit.length / 50))}</span><Button className="min-h-8 px-2 text-[10px]" disabled={(auditPage + 1) * 50 >= filteredAudit.length} onClick={() => setAuditPage((page) => page + 1)}>Next</Button></div></div></>}</Panel>}

        {tab === 'settings' && (
          <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel className="p-5"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5" style={{ color: BLUE }} /><div><h2 className="text-[15px] font-semibold">Simulator access controls</h2><p className="mt-1 text-[12px]" style={{ color: MUTED }}>These settings only affect the Chase simulator environment and are enforced by the server.</p></div></div>
              <div className="mt-4 space-y-4"><label className="flex items-start gap-3 rounded border p-3" style={{ borderColor: LINE }}><input className="mt-1" type="checkbox" checked={simulatorSettings.allowEnrollment} onChange={(event) => setSimulatorSettings((settings) => ({ ...settings, allowEnrollment: event.target.checked }))} /><span><strong className="block text-[13px]">Allow customer enrollment</strong><span className="text-[11.5px]" style={{ color: MUTED }}>When off, new simulator customer registrations are rejected.</span></span></label>
                <label className="flex items-start gap-3 rounded border p-3" style={{ borderColor: LINE }}><input className="mt-1" type="checkbox" checked={simulatorSettings.allowCustomerPasswordReset} onChange={(event) => setSimulatorSettings((settings) => ({ ...settings, allowCustomerPasswordReset: event.target.checked }))} /><span><strong className="block text-[13px]">Allow customer password recovery</strong><span className="text-[11.5px]" style={{ color: MUTED }}>When off, public password reset requests are rejected.</span></span></label>
              </div><Button className="mt-4" tone="primary" onClick={() => void saveSimulatorSettings()} disabled={busy}>Save access settings</Button>
            </Panel>
            <Panel className="p-5"><h2 className="text-[15px] font-semibold">Environment & guardrails</h2><dl className="mt-3 space-y-2 text-[12px]"><div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: LINE }}><dt style={{ color: MUTED }}>Data mode</dt><dd className="font-semibold">Simulated only</dd></div><div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: LINE }}><dt style={{ color: MUTED }}>Real payment connections</dt><dd className="font-semibold">Disabled</dd></div><div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: LINE }}><dt style={{ color: MUTED }}>Admin actions logged</dt><dd className="font-semibold">Yes</dd></div><div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>User session control</dt><dd className="font-semibold">Revoke per user or suspend</dd></div></dl><p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>Customer accounts, balances, transfers, and ledger entries are simulated Chase records only.</p></Panel>
            <Panel className="p-5 xl:col-span-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold">Administrator accounts & roles</h2><p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>Admins can change simulator data. Auditors can read and export but cannot mutate it.</p></div><Button className="min-h-8 px-2 text-[10.5px]" disabled={busy} onClick={() => void changeOwnAdminPassword()}>Change my password</Button></div>
              {currentAdminRole === 'admin' && <form onSubmit={createAdminAccount} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end"><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Username</span><input className={fieldCls} value={newAdminUsername} onChange={(event) => setNewAdminUsername(event.target.value)} minLength={4} maxLength={32} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Full name</span><input className={fieldCls} value={newAdminName} onChange={(event) => setNewAdminName(event.target.value)} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Initial password (10+ chars)</span><input className={fieldCls} type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} minLength={10} required /></label><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Role</span><select className={fieldCls} value={newAdminRole} onChange={(event) => setNewAdminRole(event.target.value as typeof newAdminRole)}><option value="admin">Admin</option><option value="auditor">Read-only auditor</option></select></label><Button type="submit" tone="primary" disabled={busy}><Plus className="w-4 h-4" /> Add admin</Button></form>}
              <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead className="bg-[#F7F8F9] text-[10.5px] uppercase tracking-wide" style={{ color: MUTED }}><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{adminAccounts.map((admin) => <tr key={admin.id} className="border-t" style={{ borderColor: LINE }}><td className="px-3 py-3"><strong className="block text-[12px]">{admin.fullName}</strong><span className="text-[11px]" style={{ color: MUTED }}>@{admin.username}{admin.username === currentAdminUsername ? ' · you' : ''}</span></td><td className="px-3 py-3"><select className="h-8 rounded border px-2 text-[11px]" disabled={busy || currentAdminRole !== 'admin' || admin.protected} value={admin.role} onChange={(event) => void updateAdminAccount(admin, { role: event.target.value as AdminAccountRow['role'] })}><option value="admin">Admin</option><option value="auditor">Auditor</option></select></td><td className="px-3 py-3 text-[11px]">{admin.status}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-1">{!admin.protected && currentAdminRole === 'admin' && <><Button className="min-h-8 px-2 text-[10px]" disabled={busy || admin.username === currentAdminUsername} onClick={() => void updateAdminAccount(admin, { status: admin.status === 'active' ? 'disabled' : 'active' })}>{admin.status === 'active' ? 'Disable' : 'Enable'}</Button><Button className="min-h-8 px-2 text-[10px]" disabled={busy || admin.username === currentAdminUsername || admin.status === 'disabled'} onClick={() => void resetAdminPassword(admin)}>Reset password</Button><Button tone="danger" className="min-h-8 px-2 text-[10px]" disabled={busy || admin.username === currentAdminUsername} onClick={() => void deleteAdmin(admin)}>Delete</Button></>}</div></td></tr>)}</tbody></table></div>
            </Panel>
            <Panel className="p-5 xl:col-span-2"><h2 className="text-[15px] font-semibold">Backup & restore</h2><p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>A backup includes customer data and password hashes, but excludes admin accounts and sessions. Treat downloaded backups as sensitive.</p><div className="mt-3 flex flex-wrap items-end gap-3"><Button onClick={() => void downloadBackup()} disabled={busy || currentAdminRole !== 'admin'}><FileText className="w-4 h-4" /> Download full backup</Button><label className="block"><span className="block text-[10.5px] font-semibold mb-1">Restore JSON backup</span><input className="block max-w-full text-[11px]" type="file" accept="application/json,.json" onChange={(event) => setBackupFile(event.target.files?.[0] || null)} /></label><Button tone="danger" onClick={() => void restoreBackup()} disabled={busy || !backupFile || currentAdminRole !== 'admin'}>Restore backup</Button></div></Panel>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11.5px]" style={{ color: FAINT }}><span>Secure testing environment · no real funds or external payment services</span><button type="button" onClick={onExit} className="font-semibold hover:underline" style={{ color: BLUE }}><ArrowLeft className="inline w-3.5 h-3.5" /> Return to Chase.com</button></div>
      </div>
      </div>
      </div>
      </div>
      </main>

      <Footer
        variant="dashboard"
        userLabel={adminName}
        onAction={handleAdminToolbarAction}
        onHome={() => setTab('overview')}
      />
    </div>
  );
};
