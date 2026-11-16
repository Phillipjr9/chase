/* -------------------------------------------------------------------------- */
/* Chase Online — Banking Administration & Simulator Console (/admin)         */
/* Matches the authentic Chase Online user pages (utility strip, #081427      */
/* dark navy header with ChaseLogo, global search drawer, alerts bell,        */
/* horizontal underlined nav tabs, and <Footer variant="dashboard" />)        */
/* while providing full administrative control over every customer feature.   */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  Bell,
  Check,
  Eye,
  LockKeyhole,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  readAdminToken,
  writeAdminToken,
  type AccountType,
  type SecureMessageCategory,
  type User,
} from '../banking/store';
import { ChaseLogo } from './ChaseLogo';
import { Footer } from './Footer';
import { Header } from './Header';
import { Spinner } from './Loading';
import { AccountPatchPayload, AccountsTab, LedgerTab } from './admin/AccountsLedgerTab';
import { CustomerSupportTools } from './admin/CustomerSupportTools';
import { AdminMessageThread, MessagesSupportTab } from './admin/MessagesSupportTab';
import { AuditTab, OperationsTab, SettingsTab } from './admin/OperationsSettingsTab';
import { OverviewTab } from './admin/OverviewTab';
import { UsersTab } from './admin/UsersTab';
import { WealthCreditTab } from './admin/WealthCreditTab';
import {
  AdminAccountRow,
  AdminApiError,
  AdminMetrics,
  AdminTab,
  AdminUserRow,
  AuditEntry,
  CashflowRange,
  GlobalTransaction,
  OverviewAnalytics,
  SimulatorSettings,
  adminFetch,
  inputDate,
} from './admin/types';
import {
  Avatar,
  Badge,
  Btn,
  Modal,
  SelectInput,
  TextInput,
  ToastStack,
  fmtMoneyFull,
  pushToast,
} from './admin/ui';
import type { SegmentKey } from '../data/chaseData';

/* Authentic Chase Online colors sampled from secure.chase.com (same as BankingDashboard) */
const NAVY = '#081427';
const BTN_BLUE = '#1A4488';
const BTN_BLUE_HOVER = '#143669';
const INK = '#131313';
const MUTED = '#5C5C5C';
const LINE = '#E4E6E8';

export const AdminPage: React.FC<{
  initialToken?: string;
  onExit: () => void;
  onImpersonate: (user: User, token: string) => void;
}> = ({ initialToken = '', onExit, onImpersonate }) => {
  const [token, setToken] = useState<string>(() => initialToken || readAdminToken());
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);

  // Admin identity & staff
  const [adminName, setAdminName] = useState('Chase administrator');
  const [currentAdminRole, setCurrentAdminRole] = useState<'admin' | 'auditor'>('admin');
  const [currentAdminUsername, setCurrentAdminUsername] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState({ createUsers: false, generateActivity: false, sendMessages: false });
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);

  // Public header state (for unauthenticated sign-in view)
  const [publicSegment, setPublicSegment] = useState<SegmentKey>('personal');
  const [spanishMode, setSpanishMode] = useState(false);

  // Sign-in form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Chase Online shell state (matching BankingDashboard.tsx)
  const [tab, setTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsRead, setAlertsRead] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Quick Global Balance Adjustment modal (accessible from sub-bar on any tab)
  const [quickAdjustOpen, setQuickAdjustOpen] = useState(false);
  const [quickAcctId, setQuickAcctId] = useState('');
  const [quickDir, setQuickDir] = useState<'credit' | 'debit'>('credit');
  const [quickAmt, setQuickAmt] = useState('1000');
  const [quickMemo, setQuickMemo] = useState('Direct Deposit — Payroll Credit');

  // Simulator datasets
  const [range, setRange] = useState<CashflowRange>('12w');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [analytics, setAnalytics] = useState<OverviewAnalytics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [globalTransactions, setGlobalTransactions] = useState<GlobalTransaction[]>([]);
  const [messageThreads, setMessageThreads] = useState<AdminMessageThread[]>([]);
  const [simulatorSettings, setSimulatorSettings] = useState<SimulatorSettings>({
    allowEnrollment: true,
    allowCustomerPasswordReset: true,
  });

  // Active selected customer for deep inspection across all customer tabs
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userJson, setUserJson] = useState('');
  const [busy, setBusy] = useState(false);

  const isReadOnly = currentAdminRole === 'auditor';
  const t = (en: string, es: string) => (spanishMode ? es : en);

  // ⌘K / Ctrl+K opens Chase Online global search bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        setAlertsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [searchOpen]);

  const notify = useCallback((kind: 'success' | 'error' | 'info', text: string) => {
    pushToast(kind, text);
  }, []);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}, overrideToken?: string): Promise<T> => {
      const activeTok = overrideToken !== undefined ? overrideToken : token;
      return adminFetch<T>(path, init, activeTok);
    },
    [token]
  );

  const loadSelectedUser = useCallback(
    async (id: string, activeToken = token) => {
      const result = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {},
        activeToken
      );
      setSelectedUser(result.user);
      setUserJson(JSON.stringify(result.user, null, 2));
      setQuickAcctId(result.user.accounts?.[0]?.id || '');
      return result.user;
    },
    [api, token]
  );

  const loadData = useCallback(
    async (activeToken = token, activeRange = range) => {
      const [overviewRes, userRes, auditRes, txRes, msgRes] = await Promise.all([
        api<{ metrics: AdminMetrics; recentAudit: AuditEntry[]; analytics?: OverviewAnalytics }>(
          `/api/admin/overview?range=${activeRange}`,
          {},
          activeToken
        ),
        api<{ users: AdminUserRow[] }>('/api/admin/users', {}, activeToken),
        api<{ audit: AuditEntry[] }>('/api/admin/audit?limit=5000', {}, activeToken),
        api<{ transactions: GlobalTransaction[] }>(
          '/api/admin/transactions?limit=5000',
          {},
          activeToken
        ),
        api<{ threads: AdminMessageThread[] }>('/api/admin/messages', {}, activeToken).catch(
          () => ({ threads: [] })
        ),
      ]);
      setMetrics(overviewRes.metrics);
      if (overviewRes.analytics) setAnalytics(overviewRes.analytics);
      setUsers(userRes.users);
      setAudit(auditRes.audit);
      setGlobalTransactions(txRes.transactions);
      setMessageThreads(msgRes.threads || []);
      return userRes.users;
    },
    [api, range, token]
  );

  useEffect(() => {
    if (initialToken && initialToken !== token) {
      setToken(initialToken);
      writeAdminToken(initialToken);
    }
  }, [initialToken, token]);

  useEffect(() => {
    if (!authenticated || !token) return;
    const timer = window.setInterval(() => { void loadData().catch(() => undefined); }, 30000);
    return () => window.clearInterval(timer);
  }, [authenticated, token, loadData]);

  // Refresh only the support inbox frequently; the larger dashboard refresh remains separate.
  useEffect(() => {
    if (!authenticated || !token) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await api<{ threads: AdminMessageThread[] }>('/api/admin/messages', {}, token);
        const me = await api<{ admin: { permissions: { createUsers: boolean; generateActivity: boolean; sendMessages: boolean } } }>('/api/admin/me', {}, token);
        if (active) { setMessageThreads(result.threads); setPermissions(me.admin.permissions); }
      } catch { /* Retry on the next interval. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authenticated, token, api]);

  // Verify session on mount / token change
  useEffect(() => {
    let active = true;
    (async () => {
      setCheckingAuth(true);
      try {
        const me = await api<{
          admin: { username: string; label: string; role: 'admin' | 'auditor'; isSuperAdmin?: boolean; permissions: { createUsers: boolean; generateActivity: boolean; sendMessages: boolean } };
          token?: string;
        }>('/api/admin/me', {}, token);
        if (!active) return;
        const resolvedTok = me.token || token;
        if (resolvedTok && resolvedTok !== token) {
          setToken(resolvedTok);
          writeAdminToken(resolvedTok);
        }
        setIsSuperAdmin(me.admin.isSuperAdmin === true);
        setPermissions(me.admin.permissions);
        setAdminName(me.admin.label);
        setCurrentAdminRole(me.admin.role || 'admin');
        setCurrentAdminUsername(me.admin.username);
        setAuthenticated(true);

        const [settingsRes, adminsRes, loadedUsers] = await Promise.all([
          api<{ settings: SimulatorSettings }>('/api/admin/settings', {}, resolvedTok),
          api<{ admins: AdminAccountRow[] }>('/api/admin/admins', {}, resolvedTok),
          loadData(resolvedTok, range),
        ]);
        if (!active) return;
        setSimulatorSettings(settingsRes.settings);
        setAdminAccounts(adminsRes.admins);

        if (loadedUsers.length > 0) {
          const preferred =
            loadedUsers.find((u) => u.username === 'chase') || loadedUsers[0];
          await loadSelectedUser(preferred.id, resolvedTok).catch(() => undefined);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof AdminApiError && err.status === 401) {
          writeAdminToken(null);
          setToken('');
          setAuthenticated(false);
        } else {
          notify('error', err instanceof Error ? err.message : 'Could not verify admin session.');
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleRangeChange = async (nextRange: CashflowRange) => {
    setRange(nextRange);
    try {
      const overviewRes = await api<{
        metrics: AdminMetrics;
        analytics?: OverviewAnalytics;
      }>(`/api/admin/overview?range=${nextRange}`);
      setMetrics(overviewRes.metrics);
      if (overviewRes.analytics) setAnalytics(overviewRes.analytics);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update chart range.');
    }
  };

  const signIn = async (
    e?: React.FormEvent,
    creds: { username: string; password: string } = { username: loginUser, password: loginPass }
  ) => {
    e?.preventDefault();
    setBusy(true);
    setLoginError('');
    try {
      const res = await api<{
        token: string;
        admin: { username: string; label: string; role: 'admin' | 'auditor' };
      }>(
        '/api/admin/login',
        { method: 'POST', body: JSON.stringify(creds) },
        ''
      );
      writeAdminToken(res.token);
      setAdminName(res.admin.label);
      setCurrentAdminRole(res.admin.role || 'admin');
      setCurrentAdminUsername(res.admin.username);
      setToken(res.token);
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Administrator sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    writeAdminToken(null);
    setToken('');
    setAuthenticated(false);
    onExit();
  };

  const acceptUpdatedUser = async (updated: User, successMsg: string) => {
    setSelectedUser(updated);
    setUserJson(JSON.stringify(updated, null, 2));
    await loadData();
    notify('success', successMsg);
  };

  const selectUserAndMaybeGo = async (id: string | null, targetTab?: AdminTab) => {
    if (!id) {
      setSelectedUser(null);
      setUserJson('');
      return;
    }
    setBusy(true);
    try {
      await loadSelectedUser(id);
      if (targetTab) setTab(targetTab);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not load customer profile.');
    } finally {
      setBusy(false);
    }
  };

  const impersonateById = async (id: string, fullName?: string) => {
    setBusy(true);
    try {
      const res = await api<{ token: string; user: User }>(
        `/api/admin/users/${encodeURIComponent(id)}/impersonate`,
        { method: 'POST', body: '{}' }
      );
      notify('info', `Opening customer banking preview as ${fullName || res.user.fullName}…`);
      onImpersonate(res.user, res.token);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not launch customer preview.');
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------- Mutation Handlers -------------------------- */


  const handlePromote = async (): Promise<boolean> => {
    if (!selectedUser || !isSuperAdmin) return false;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/promote`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
      const result = await api<{ admins: AdminAccountRow[] }>('/api/admin/admins');
      setAdminAccounts(result.admins);
      notify('success', 'Limited test administrator access enabled. Use the administrator sign-in with the existing username and password.');
      return true;
    } catch (err) { notify('error', err instanceof Error ? err.message : 'Could not promote customer.'); return false; }
    finally { setBusy(false); }
  };

  const handleCreateUser = async (payload: {
    username: string;
    fullName: string;
    email: string;
    password: string;
  }): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await acceptUpdatedUser(res.user, `Created test profile @${res.user.username}.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not create customer.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleBulkUsers = async (
    ids: string[],
    action: 'suspend' | 'reactivate' | 'delete',
    confirmText?: string
  ): Promise<boolean> => {
    setBusy(true);
    try {
      await api('/api/admin/users/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, action, ...(confirmText ? { confirmText } : {}) }),
      });
      const loaded = await loadData();
      if (selectedUser && ids.includes(selectedUser.id)) {
        if (action === 'delete') {
          if (loaded[0]) await loadSelectedUser(loaded[0].id);
          else {
            setSelectedUser(null);
            setUserJson('');
          }
        } else {
          await loadSelectedUser(selectedUser.id);
        }
      }
      notify('success', `Bulk ${action} completed (${ids.length} customers).`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Bulk action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUserObject = async (updated: User, msg = 'Profile saved.'): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(updated.id)}`,
        { method: 'PUT', body: JSON.stringify({ user: updated }) }
      );
      await acceptUpdatedUser(res.user, msg);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not save customer record.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRawJson = async () => {
    if (!selectedUser) return;
    try {
      const parsed = JSON.parse(userJson) as User;
      await handleSaveUserObject({ ...parsed, id: selectedUser.id }, 'Full simulator JSON record saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Invalid JSON syntax.');
    }
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === 'suspended' ? 'active' : 'suspended';
    await handleSaveUserObject(
      { ...selectedUser, status: nextStatus },
      `Customer @${selectedUser.username} marked ${nextStatus}.`
    );
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const removedUsername = selectedUser.username;
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      });
      const loaded = await loadData();
      if (loaded[0]) await loadSelectedUser(loaded[0].id);
      else {
        setSelectedUser(null);
        setUserJson('');
      }
      notify('success', `Deleted test profile @${removedUsername}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete customer.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/revoke-sessions`, {
        method: 'POST',
        body: '{}',
      });
      await loadData();
      notify('success', `Revoked all active sessions for @${selectedUser.username}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not revoke sessions.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetUserPassword = async (password: string): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password, confirm: true }),
      });
      await loadData();
      notify('success', `Password updated & sessions revoked for @${selectedUser.username}.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not reset password.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateHistory = async (payload: {
    startDate: string;
    endDate: string;
    cadence: 'daily' | 'weekly' | 'monthly' | 'yearly';
    perPeriod: number;
  }) => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const res = await api<{
        user: User;
        eventsGenerated: number;
        transactionsAdded: number;
      }>(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/generate-transactions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await acceptUpdatedUser(
        res.user,
        `Generated ${res.transactionsAdded.toLocaleString()} ledger entries across ${res.eventsGenerated.toLocaleString()} test events.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not generate history.');
    } finally {
      setBusy(false);
    }
  };

  // Account CRUD
  const handleCreateAccount = async (payload: {
    type: AccountType;
    name: string;
    balance: number;
    creditLimit?: number;
  }): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      await acceptUpdatedUser(res.user, `Opened simulated ${payload.type} account.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not create account.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAccount = async (accountId: string, patch: AccountPatchPayload) => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/${encodeURIComponent(
          accountId
        )}`,
        { method: 'PUT', body: JSON.stringify({ account: patch }) }
      );
      await acceptUpdatedUser(res.user, 'Account settings & balance saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not save account.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/${encodeURIComponent(
          accountId
        )}`,
        { method: 'DELETE', body: JSON.stringify({ confirm: true }) }
      );
      await acceptUpdatedUser(res.user, 'Simulated account deleted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete account.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAccounts = async (
    accountIds: string[],
    action: 'lock' | 'unlock' | 'delete',
    confirmText?: string
  ): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/accounts/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ accountIds, action, ...(confirmText ? { confirmText } : {}) }),
        }
      );
      await acceptUpdatedUser(res.user, `Bulk account ${action} completed.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Bulk account action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Ledger CRUD
  const handleCreateLedgerEntry = async (payload: {
    userId: string;
    accountId: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    status: 'posted' | 'pending';
  }): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(payload.userId)}/transactions`,
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: payload.accountId,
            transaction: {
              description: payload.description,
              amount: payload.amount,
              category: payload.category,
              date: payload.date,
              status: payload.status,
            },
          }),
        }
      );
      if (selectedUser?.id === payload.userId) {
        await acceptUpdatedUser(res.user, 'Ledger entry posted & account balance reconciled.');
      } else {
        await loadData();
        notify('success', 'Ledger entry posted & balance reconciled.');
      }
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not post ledger entry.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateLedgerEntry = async (
    userId: string,
    txId: string,
    patch: {
      description: string;
      amount: number;
      category: string;
      status: 'posted' | 'pending';
    }
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/transactions/${encodeURIComponent(txId)}`,
        { method: 'PUT', body: JSON.stringify({ transaction: patch }) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify('success', 'Ledger entry updated & balance adjusted by delta.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update ledger entry.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLedgerEntry = async (userId: string, txId: string) => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/transactions/${encodeURIComponent(txId)}`,
        { method: 'DELETE', body: JSON.stringify({ confirm: true }) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify('success', 'Ledger entry deleted & amount reversed from balance.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete ledger entry.');
    } finally {
      setBusy(false);
    }
  };

  // Operations: Transfers, Payees, Schedules, Disputes
  const handleAdminTransfer = async (payload: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
  }): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/transfers`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      await acceptUpdatedUser(res.user, 'Simulated transfer posted & both accounts reconciled.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Transfer failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePayee = async (payload: {
    name: string;
    accountNumber: string;
    category: string;
  }): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      await acceptUpdatedUser(res.user, `Added payee ${payload.name}.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not add payee.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePayee = async (
    payeeId: string,
    patch: { name: string; accountNumber: string; category: string }
  ): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees/${encodeURIComponent(
          payeeId
        )}`,
        { method: 'PUT', body: JSON.stringify({ payee: patch }) }
      );
      await acceptUpdatedUser(res.user, 'Payee updated.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update payee.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePayee = async (payeeId: string) => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/payees/${encodeURIComponent(
          payeeId
        )}`,
        { method: 'DELETE', body: JSON.stringify({ confirm: true }) }
      );
      await acceptUpdatedUser(res.user, 'Payee & linked schedules removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete payee.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSchedule = async (payload: {
    kind: 'transfer' | 'bill' | 'card' | 'loan';
    label: string;
    fromAccountId: string;
    toAccountId?: string;
    payeeId?: string;
    amount: number;
    date: string;
    frequency: 'once' | 'monthly';
  }): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled`,
        { method: 'POST', body: JSON.stringify({ payment: payload }) }
      );
      await acceptUpdatedUser(res.user, 'Scheduled instruction created.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not create schedule.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateSchedule = async (
    paymentId: string,
    patch: Record<string, unknown>
  ): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled/${encodeURIComponent(
          paymentId
        )}`,
        { method: 'PUT', body: JSON.stringify({ payment: patch }) }
      );
      await acceptUpdatedUser(res.user, 'Scheduled instruction updated.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update schedule.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSchedule = async (paymentId: string) => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/scheduled/${encodeURIComponent(
          paymentId
        )}`,
        { method: 'DELETE', body: JSON.stringify({ confirm: true }) }
      );
      await acceptUpdatedUser(res.user, 'Scheduled instruction deleted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete schedule.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDispute = async (payload: {
    accountId: string;
    transactionId: string;
    reason: string;
  }): Promise<boolean> => {
    if (!selectedUser) return false;
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/disputes`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      await acceptUpdatedUser(res.user, 'Opened test card dispute.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not open dispute.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSetDisputeStatus = async (
    userId: string,
    disputeId: string,
    status: 'open' | 'resolved' | 'denied'
  ) => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/disputes/${encodeURIComponent(disputeId)}`,
        { method: 'PUT', body: JSON.stringify({ status }) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify('success', `Dispute marked ${status}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update dispute.');
    } finally {
      setBusy(false);
    }
  };

  const handleIssueRefund = async (userId: string, disputeId: string) => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/disputes/${encodeURIComponent(
          disputeId
        )}/refund`,
        { method: 'POST', body: JSON.stringify({ confirm: true }) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify('success', 'Simulated card-credit refund posted & dispute resolved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not issue refund.');
    } finally {
      setBusy(false);
    }
  };

  // Batch Scheduled Payments & Month-End Statement Close Engine
  const handleProcessScheduled = async (opts: {
    userId?: string;
    paymentId?: string;
    forceAll?: boolean;
  }) => {
    setBusy(true);
    try {
      const res = await api<{
        processedCount: number;
        totalAmount: number;
        user?: User;
      }>('/api/admin/process-scheduled', {
        method: 'POST',
        body: JSON.stringify(opts),
      });
      if (res.user && selectedUser?.id === res.user.id) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      } else if (selectedUser) {
        await loadSelectedUser(selectedUser.id).catch(() => undefined);
      }
      await loadData();
      notify(
        'success',
        res.processedCount > 0
          ? `Executed ${res.processedCount} scheduled payment(s) totaling ${fmtMoneyFull(res.totalAmount)}.`
          : 'No scheduled payments were eligible to execute.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not process scheduled payments.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunMonthEndClose = async (opts: { userId?: string }) => {
    setBusy(true);
    try {
      const res = await api<{
        interestCredited: number;
        statementsCut: number;
        pointsAwarded: number;
        user?: User;
      }>('/api/admin/month-end-close', {
        method: 'POST',
        body: JSON.stringify(opts),
      });
      if (res.user && selectedUser?.id === res.user.id) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      } else if (selectedUser) {
        await loadSelectedUser(selectedUser.id).catch(() => undefined);
      }
      await loadData();
      notify(
        'success',
        `Month-end close complete: ${fmtMoneyFull(res.interestCredited)} APY interest credited, ${res.statementsCut} card statement(s) cut, +${res.pointsAwarded.toLocaleString()} pts.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not run month-end close.');
    } finally {
      setBusy(false);
    }
  };

  // Secure Client Messaging & Custom Dashboard Banner Handlers
  const handleSendAdvisorMessage = async (
    userId: string,
    payload: { subject: string; category: SecureMessageCategory; body: string }
  ) => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/messages`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify('success', 'Secure advisor message delivered to customer inbox.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkThreadRead = async (userId: string) => {
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/messages/read`,
        { method: 'POST' }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
    } catch {
      /* ignore */
    }
  };

  const handleUpdateAccountNotice = async (
    userId: string,
    notice: {
      tone: 'info' | 'warning' | 'urgent' | 'success';
      title: string;
      message: string;
      dismissible: boolean;
    } | null
  ) => {
    setBusy(true);
    try {
      const res = await api<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(userId)}/notice`,
        { method: 'PUT', body: JSON.stringify({ notice }) }
      );
      if (selectedUser?.id === userId) {
        setSelectedUser(res.user);
        setUserJson(JSON.stringify(res.user, null, 2));
      }
      await loadData();
      notify(
        'success',
        notice
          ? 'Published custom banner onto customer online banking dashboard.'
          : 'Cleared custom dashboard banner.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update customer banner.');
    } finally {
      setBusy(false);
    }
  };

  // Settings, Staff, Backup & Reset
  const handleSaveSettings = async () => {
    setBusy(true);
    try {
      const res = await api<{ settings: SimulatorSettings }>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: simulatorSettings }),
      });
      setSimulatorSettings(res.settings);
      await loadData();
      notify('success', 'Simulator access guardrails saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAdmin = async (payload: {
    username: string;
    fullName: string;
    password: string;
    role: 'admin' | 'auditor';
  }): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ admin: AdminAccountRow }>('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAdminAccounts((prev) => [...prev, res.admin]);
      await loadData();
      notify('success', `Created ${res.admin.role} account @${res.admin.username}.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not create staff account.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAdmin = async (
    admin: AdminAccountRow,
    patch: { supportContact?: { email: string; phone: string }; username?: string; fullName?: string; lockMessage?: string; role?: 'admin' | 'auditor'; status?: 'active' | 'disabled'; password?: string; permissions?: { createUsers: boolean; generateActivity: boolean; sendMessages: boolean } }
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await api<{ admin: AdminAccountRow }>(
        `/api/admin/admins/${encodeURIComponent(admin.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ ...patch, ...(patch.password ? { confirm: true } : {}) }),
        }
      );
      setAdminAccounts((prev) => prev.map((a) => (a.id === admin.id ? res.admin : a)));
      await loadData();
      notify('success', `Updated staff account @${admin.username}.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update staff account.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAdmin = async (admin: AdminAccountRow) => {
    setBusy(true);
    try {
      await api(`/api/admin/admins/${encodeURIComponent(admin.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      });
      setAdminAccounts((prev) => prev.filter((a) => a.id !== admin.id));
      await loadData();
      notify('success', `Deleted staff account @${admin.username}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete staff account.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeOwnPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    setBusy(true);
    try {
      await api('/api/admin/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword, confirm: true }),
      });
      writeAdminToken(null);
      setToken('');
      setAuthenticated(false);
      setLoginError('Password updated. Please sign in with your new administrator password.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not change password.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    setBusy(true);
    try {
      const backup = await api<Record<string, unknown>>('/api/admin/backup');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `chase-simulator-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('success', 'Full simulator backup JSON downloaded.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not download backup.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreBackup = async (file: File, confirmText: string): Promise<boolean> => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      const res = await api<{ usersRestored: number }>('/api/admin/backup', {
        method: 'POST',
        body: JSON.stringify({ ...parsed, confirmText }),
      });
      const loaded = await loadData();
      if (loaded[0]) await loadSelectedUser(loaded[0].id);
      notify('success', `Restored ${res.usersRestored} test customer profiles from backup.`);
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not restore backup file.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleResetSimulator = async (confirmText: string): Promise<boolean> => {
    setBusy(true);
    try {
      await api('/api/admin/reset', {
        method: 'POST',
        body: JSON.stringify({ confirmText }),
      });
      const loaded = await loadData();
      if (loaded[0]) await loadSelectedUser(loaded[0].id);
      notify('success', 'Test customer data was reset.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Simulator reset failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* ------------------- Navigation, Search & Alerts Model ------------------ */

  const openDisputesCount = useMemo(
    () => (analytics?.disputes || []).filter((d) => d.status === 'open').length,
    [analytics]
  );

  const unreadMessagesCount = useMemo(
    () =>
      messageThreads.reduce((sum, t) => sum + (t.unreadForAdmin || 0), 0) ||
      analytics?.unreadMessagesCount ||
      0,
    [messageThreads, analytics]
  );

  const navItems: {
    id: AdminTab;
    label: string;
    esLabel: string;
    badge?: number;
  }[] = [
    { id: 'overview', label: 'Overview', esLabel: 'Resumen' },
    { id: 'users', label: 'Customers', esLabel: 'Clientes', badge: metrics?.users ?? users.length },
    { id: 'accounts', label: 'Accounts & cards', esLabel: 'Cuentas y tarjetas', badge: metrics?.accounts },
    { id: 'transactions', label: 'Ledger & statements', esLabel: 'Movimientos y estados' },
    {
      id: 'operations',
      label: 'Pay, Zelle® & disputes',
      esLabel: 'Pagos, Zelle® y disputas',
      badge: openDisputesCount > 0 ? openDisputesCount : undefined,
    },
    { id: 'wealth', label: 'Wealth, rewards & credit', esLabel: 'Inversiones, puntos y crédito' },
    {
      id: 'messages',
      label: 'Messages & notices',
      esLabel: 'Mensajes y avisos',
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
    },
    { id: 'audit', label: 'Audit log', esLabel: 'Auditoría' },
    ...(isSuperAdmin ? [{ id: 'settings' as const, label: 'Settings & backup', esLabel: 'Configuración y respaldo' }] : []),
  ];

  // Live Alerts (identical pattern to BankingDashboard.tsx)
  const adminAlerts = useMemo(() => {
    const list: { id: string; title: string; detail: string; action: () => void }[] = [];
    for (const thread of messageThreads.filter(t => t.unreadForAdmin > 0).slice(0, 5)) {
      list.push({ id: `message-${thread.userId}`, title: `${thread.unreadForAdmin} unread message(s) · ${thread.fullName}`, detail: 'Open the customer support conversation.', action: () => { void selectUserAndMaybeGo(thread.userId, 'messages'); } });
    }
    for (const d of (analytics?.disputes || []).filter((x) => x.status === 'open').slice(0, 4)) {
      list.push({
        id: `disp-${d.id}`,
        title: `Open card dispute · ${fmtMoneyFull(d.amount)}`,
        detail: `${d.fullName} (@${d.username}) — ${d.description}: ${d.reason}`,
        action: () => {
          void selectUserAndMaybeGo(d.userId, 'operations');
        },
      });
    }
    for (const u of users.filter((x) => x.status === 'suspended')) {
      list.push({
        id: `susp-${u.id}`,
        title: `Suspended profile · ${u.fullName}`,
        detail: `@${u.username} currently has API sign-in suspended.`,
        action: () => {
          void selectUserAndMaybeGo(u.id, 'users');
        },
      });
    }
    const pendingCount = globalTransactions.filter((tx) => tx.status === 'pending').length;
    if (pendingCount > 0) {
      list.push({
        id: 'pending-tx',
        title: `${pendingCount} pending ledger authorization${pendingCount === 1 ? '' : 's'}`,
        detail: 'Review or settle pending transactions in Ledger & statements.',
        action: () => setTab('transactions'),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, users, globalTransactions, messageThreads]);

  const unreadAlerts = alertsRead ? 0 : adminAlerts.length;

  // Global Chase Online search results across sections, customers, disputes, and transactions
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: {
      key: string;
      type: string;
      label: string;
      detail: string;
      action: () => void;
    }[] = [];

    for (const item of navItems) {
      if (item.label.toLowerCase().includes(q)) {
        results.push({
          key: `nav-${item.id}`,
          type: 'Section',
          label: item.label,
          detail: 'Admin Console tab',
          action: () => setTab(item.id),
        });
      }
    }

    for (const u of users) {
      if (`${u.fullName} ${u.username} ${u.email}`.toLowerCase().includes(q)) {
        results.push({
          key: `u-${u.id}`,
          type: 'Customer',
          label: `${u.fullName} (@${u.username})`,
          detail: `${u.accountCount} accounts · Deposits ${fmtMoneyFull(u.depositBalance)} · Credit ${u.creditScore ?? 750}`,
          action: () => void selectUserAndMaybeGo(u.id, 'users'),
        });
      }
      if (results.length >= 8) break;
    }

    for (const tx of globalTransactions) {
      if (`${tx.description} ${tx.category} ${tx.username} ${tx.accountName}`.toLowerCase().includes(q)) {
        results.push({
          key: `tx-${tx.id}`,
          type: 'Transaction',
          label: tx.description,
          detail: `${tx.fullName} · ${tx.accountName} · ${fmtMoneyFull(tx.amount)}`,
          action: () => void selectUserAndMaybeGo(tx.userId, 'transactions'),
        });
      }
      if (results.length >= 12) break;
    }

    return results.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, users, globalTransactions]);

  const handleFooterAction = (actionId: string) => {
    const map: Record<string, AdminTab> = {
      'footer-accounts': 'accounts',
      'footer-pay': 'operations',
      'footer-statements': 'transactions',
      'footer-security': 'wealth',
      'footer-budgeting': 'overview',
      'footer-offers': 'wealth',
      'footer-advisors': 'wealth',
      'footer-locations': 'overview',
    };
    if (map[actionId]) {
      setTab(map[actionId]);
      return;
    }
    if (actionId === 'admin-login') return;
    onExit();
  };

  /* ------------------------- Unauthenticated Gate ------------------------- */

  if (checkingAuth && !authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-white" style={{ backgroundColor: NAVY }}>
        <Spinner size="md" tone="white" />
        <p className="text-[13.5px] text-white/80">Verifying Chase Online Administrator session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-white text-[#131313]">
        {/* Authentic Chase.com 3-Row Public Header */}
        <Header
          activeSegment={publicSegment}
          onSegmentChange={setPublicSegment}
          onAction={(actionId) => {
            if (actionId === 'admin-login') return;
            onExit();
          }}
          spanishMode={spanishMode}
          onToggleSpanish={() => setSpanishMode((s) => !s)}
          onFocusSignIn={() => undefined}
          user={null}
          onGoToDashboard={onExit}
          onSignOut={onExit}
        />

        {/* Authentic Chase Blue Sign-In Hero matching HeroSection.tsx */}
        <main className="flex-1 bg-gradient-to-r from-[#00468B] via-[#005EB8] to-[#08306B] py-12 px-4 sm:px-8">
          <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 text-white space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-[11.5px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                Chase Online · Operations &amp; Simulator Control
              </p>
              <h1 className="text-[32px] sm:text-[42px] font-light leading-tight tracking-tight">
                {t(
                  'Complete banking administration in one Chase Online workspace.',
                  'Administración bancaria completa en un solo espacio de Chase Online.'
                )}
              </h1>
              <p className="text-[15.5px] text-blue-100 max-w-[600px] leading-relaxed">
                {t(
                  'Manage customer profiles, checking & Sapphire cards, balance-reconciled ledgers, Zelle® & wire transfers, J.P. Morgan investments, Credit Journey®, and card dispute refunds — or preview any account live as the customer.',
                  'Administre perfiles de clientes, cuentas y tarjetas Sapphire, libros contables, transferencias Zelle® y cables, inversiones J.P. Morgan y Credit Journey®.'
                )}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onExit}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-white/60 bg-white/10 hover:bg-white/20 px-4 py-2.5 text-[13.5px] font-semibold text-white cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('Back to Personal Banking Sign In', 'Volver a Banca Personal')}
                </button>
              </div>
            </div>

            {/* Right Authentic Chase Sign-In Card */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-[8px] shadow-[0_14px_40px_rgba(0,18,50,0.32)] p-6 sm:p-7 text-[#131313] max-w-[420px] lg:ml-auto">
                <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: LINE }}>
                  <div className="flex items-center gap-2">
                    <LockKeyhole className="w-4 h-4" style={{ color: BTN_BLUE }} />
                    <h2 className="text-[18px] font-semibold" style={{ color: INK }}>
                      {t('Administrator Sign In', 'Acceso de Administrador')}
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#EAF2FA]" style={{ color: BTN_BLUE }}>
                    /admin
                  </span>
                </div>

                {loginError && (
                  <p
                    role="alert"
                    className="mt-4 rounded-[4px] bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[12.5px] text-[#B42318]"
                  >
                    {loginError}
                  </p>
                )}

                <form className="mt-4 space-y-4" onSubmit={signIn}>
                  <label className="block">
                    <span className="block text-[12px] font-semibold mb-1" style={{ color: MUTED }}>
                      {t('Admin username', 'Usuario administrador')}
                    </span>
                    <input
                      autoComplete="username"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      required
                      className="w-full h-10 px-3 border border-[#8A929A] rounded-[4px] text-[14px] text-[#131313] focus:border-[#1A4488] outline-none"
                    />
                  </label>
                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold" style={{ color: MUTED }}>
                        {t('Password', 'Contraseña')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="text-[12px] font-semibold hover:underline cursor-pointer"
                        style={{ color: BTN_BLUE }}
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      required
                      className="w-full h-10 px-3 border border-[#8A929A] rounded-[4px] text-[14px] text-[#131313] focus:border-[#1A4488] outline-none"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-10 rounded-[4px] text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                    style={{ backgroundColor: BTN_BLUE }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE_HOVER)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE)}
                  >
                    {busy && <Spinner size="sm" tone="white" />}
                    {busy ? 'Signing in…' : t('Sign in as administrator', 'Iniciar sesión')}
                  </button>
                </form>

              </div>
            </div>
          </div>
        </main>

        {/* Authentic Chase.com Public Footer */}
        <Footer
          variant="public"
          spanishMode={spanishMode}
          onAction={(actionId) => {
            if (actionId === 'admin-login') return;
            onExit();
          }}
          onHome={onExit}
        />
      </div>
    );
  }

  /* ------------- Authenticated Chase Online Shell (matches User Pages) ---- */

  const selectedUserDeposits = selectedUser
    ? selectedUser.accounts
        .filter((a) => ['checking', 'savings', 'cd'].includes(a.type))
        .reduce((s, a) => s + Number(a.balance || 0), 0)
    : 0;
  const selectedUserCards = selectedUser
    ? selectedUser.accounts
        .filter((a) => a.type === 'credit-card')
        .reduce((s, a) => s + Number(a.balance || 0), 0)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-[#131313]">
      {/* 1. Top Chase Online Utility Strip — identical to BankingDashboard.tsx */}
      <div className="bg-[#F4F5F6] border-b border-[#E4E6E8]">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-8 h-[30px] flex items-center justify-between gap-3 text-[11.5px] text-[#5C5C5C]">
          <span className="hidden sm:inline-flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1A4488]" />
            Chase Online Administration · Simulated Banking Environment
          </span>
          <div className="flex items-center gap-3 ml-auto">
            <button type="button" onClick={onExit} className="hover:underline cursor-pointer">
              {t('Chase.com', 'Chase.com')}
            </button>
            <span className="text-[#C9CDD1]">|</span>
            {selectedUser && !isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={() => void impersonateById(selectedUser.id, selectedUser.fullName)}
                  className="hidden sm:inline font-semibold text-[#1A4488] hover:underline cursor-pointer"
                >
                  {t(`Preview ${selectedUser.fullName.split(' ')[0]}’s Banking`, `Ver banca de ${selectedUser.fullName.split(' ')[0]}`)}
                </button>
                <span className="hidden sm:inline text-[#C9CDD1]">|</span>
              </>
            )}
            <button type="button" onClick={() => setTab('audit')} className="hover:underline cursor-pointer">
              {t('Security & audit', 'Seguridad y auditoría')}
            </button>
            <span className="text-[#C9CDD1]">|</span>
            <button
              type="button"
              onClick={() => setSpanishMode((s) => !s)}
              className="hover:underline cursor-pointer"
            >
              {spanishMode ? 'English' : 'Español'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Authentic Chase Online Dark Navy Header (#081427) — identical to BankingDashboard.tsx */}
      <header style={{ backgroundColor: NAVY }} className="text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-8">
          <div className="h-[58px] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setTab('overview')}
                aria-label="Chase Administration home"
                className="shrink-0 cursor-pointer"
              >
                <ChaseLogo variant="white" />
              </button>
              <span className="hidden sm:inline-block h-4 w-px bg-white/25" />
              <span className="hidden sm:inline-block text-[12px] font-semibold tracking-wide uppercase text-blue-200 truncate">
                {isReadOnly ? 'Auditor Console (Read-Only)' : 'Operations & Simulator'}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3.5">
              {/* Mobile hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                className="lg:hidden p-2 hover:bg-white/10 rounded cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Global Search button (matches BankingDashboard) */}
              <button
                type="button"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setAlertsOpen(false);
                }}
                aria-label="Search customers, accounts, transactions, or sections"
                className="inline-flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/10 rounded cursor-pointer text-[12.5px]"
              >
                <Search className="w-[17px] h-[17px]" />
                <span className="hidden xl:inline text-white/80">Search</span>
                <kbd className="hidden xl:inline rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/75">
                  ⌘K
                </kbd>
              </button>

              {/* Alerts Bell with Unread Badge (matches BankingDashboard) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setAlertsOpen((v) => !v);
                    setSearchOpen(false);
                  }}
                  aria-label={unreadAlerts ? `Alerts, ${unreadAlerts} unread` : 'Alerts'}
                  className="relative p-2 hover:bg-white/10 rounded cursor-pointer"
                >
                  <Bell className="w-[17px] h-[17px]" />
                  {unreadAlerts > 0 && (
                    <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[#D92D20] text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadAlerts}
                    </span>
                  )}
                </button>

                {alertsOpen && (
                  <div
                    className="absolute right-0 top-[42px] w-[min(380px,calc(100vw-32px))] bg-white text-[#131313] border rounded-[6px] shadow-[0_16px_40px_rgba(0,20,50,0.25)] z-50 overflow-hidden"
                    style={{ borderColor: LINE }}
                  >
                    <div
                      className="px-4 py-3 border-b flex items-center justify-between"
                      style={{ borderColor: LINE }}
                    >
                      <h2 className="text-[14px] font-semibold">Operational Alerts</h2>
                      {unreadAlerts > 0 && (
                        <button
                          type="button"
                          onClick={() => setAlertsRead(true)}
                          className="text-[12px] font-semibold hover:underline cursor-pointer"
                          style={{ color: BTN_BLUE }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    {adminAlerts.length === 0 ? (
                      <p className="px-4 py-5 text-[13px]" style={{ color: MUTED }}>
                        No open disputes or risk alerts right now.
                      </p>
                    ) : (
                      <ul className="max-h-[340px] overflow-y-auto">
                        {adminAlerts.map((alert) => (
                          <li key={alert.id} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAlertsOpen(false);
                                alert.action();
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-[#F7FAFD] cursor-pointer"
                            >
                              <span className="block text-[13px] font-semibold" style={{ color: INK }}>
                                {alert.title}
                              </span>
                              <span className="block mt-0.5 text-[12px] leading-relaxed" style={{ color: MUTED }}>
                                {alert.detail}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <span className="hidden md:inline text-[12.5px] text-white/85">
                {t('Welcome', 'Bienvenido')}, {adminName.split(' ')[0]}
              </span>

              <button
                type="button"
                onClick={() => void signOut()}
                className="border border-white/45 hover:bg-white/10 text-white text-[12.5px] font-semibold px-3.5 py-1.5 rounded-[4px] cursor-pointer"
              >
                {t('Sign out', 'Cerrar sesión')}
              </button>
            </div>
          </div>

          {/* Primary Horizontal Navigation Row — identical to BankingDashboard.tsx */}
          <nav
            aria-label="Admin sections"
            className="hidden lg:flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-none"
          >
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3.5 py-3 text-[13px] whitespace-nowrap border-b-[3px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'border-white text-white font-semibold'
                      : 'border-transparent text-white/75 hover:text-white'
                  }`}
                >
                  <span>{spanishMode ? item.esLabel : item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-bold tabular-nums ${
                        item.id === 'operations'
                          ? 'bg-[#F79009] text-white'
                          : active
                          ? 'bg-white/25 text-white'
                          : 'bg-white/12 text-white/85'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/15 px-4 py-3 space-y-1" style={{ backgroundColor: NAVY }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-left text-[13.5px] ${
                  tab === item.id ? 'bg-white/15 font-semibold text-white' : 'text-white/80'
                }`}
              >
                <span>{spanishMode ? item.esLabel : item.label}</span>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px]">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Expandable Global Search Drawer — identical to BankingDashboard.tsx */}
        {searchOpen && (
          <div className="border-t border-white/15" style={{ backgroundColor: NAVY }}>
            <div className="max-w-[1380px] mx-auto px-4 sm:px-8 py-3">
              <div className="relative max-w-[740px]" role="search">
                <Search className="w-4 h-4 text-[#5C5C5C] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults[0]) {
                      e.preventDefault();
                      const top = searchResults[0];
                      setSearchOpen(false);
                      setSearchQuery('');
                      top.action();
                    }
                    if (e.key === 'Escape') setSearchOpen(false);
                  }}
                  placeholder="Search customers (@username, email), transactions, accounts, or admin sections…"
                  className="w-full h-11 pl-10 pr-10 rounded-[4px] bg-white text-[#131313] text-[14px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  aria-label="Close search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#5C5C5C] hover:text-[#131313] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {searchQuery.trim() && (
                <div className="mt-2 max-w-[740px] bg-white rounded-[6px] overflow-hidden shadow-[0_16px_40px_rgba(0,20,50,0.25)]">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-4 text-[13px]" style={{ color: MUTED }}>
                      No matches for “{searchQuery}”.
                    </p>
                  ) : (
                    <ul>
                      {searchResults.map((res) => (
                        <li key={res.key} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchQuery('');
                              res.action();
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#F7FAFD] cursor-pointer"
                          >
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-[#131313] truncate">
                                {res.label}
                              </span>
                              <span className="block text-[11.5px] text-[#5C5C5C] truncate">
                                {res.detail}
                              </span>
                            </span>
                            <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EAF2FA] text-[#1A4488]">
                              {res.type}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 3. Active Customer Context & Quick Banking Actions Sub-Bar */}
      <div className="bg-white border-b" style={{ borderColor: LINE }}>
        <div className="max-w-[1380px] mx-auto px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C5C5C]">
              Active Customer:
            </span>
            <SelectInput
              aria-label="Active test customer"
              value={selectedUser?.id || ''}
              onChange={(e) => e.target.value && void selectUserAndMaybeGo(e.target.value)}
              className="min-w-[230px] h-9 text-[13px] font-semibold"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username}) {u.status === 'suspended' ? '· SUSPENDED' : ''}
                </option>
              ))}
            </SelectInput>

            {selectedUser && (
              <div className="hidden xl:flex items-center gap-4 pl-2 text-[12px] text-[#5C5C5C]">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={selectedUser.fullName} size={22} />
                  <Badge tone={selectedUser.status === 'suspended' ? 'error' : 'success'}>
                    {selectedUser.status || 'active'}
                  </Badge>
                </span>
                <span>
                  Deposits: <strong className="text-[#131313]">{fmtMoneyFull(selectedUserDeposits)}</strong>
                </span>
                <span>
                  Card Bal: <strong className="text-[#131313]">{fmtMoneyFull(selectedUserCards)}</strong>
                </span>
                <span>
                  Credit Score:{' '}
                  <strong className="text-[#1A4488]">{selectedUser.credit?.score ?? 750}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isReadOnly && selectedUser && selectedUser.accounts.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setQuickAcctId(selectedUser.accounts[0]?.id || '');
                  setQuickAdjustOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-[4px] border bg-white hover:bg-[#F2F6FB] px-3 py-1.5 text-[12px] font-semibold cursor-pointer"
                style={{ borderColor: BTN_BLUE, color: BTN_BLUE }}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Deposit / Adjust Balance
              </button>
            )}

            {!isReadOnly && selectedUser && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void impersonateById(selectedUser.id, selectedUser.fullName)}
                className="inline-flex items-center gap-1.5 rounded-[4px] text-white px-3.5 py-1.5 text-[12px] font-semibold cursor-pointer transition-colors"
                style={{ backgroundColor: BTN_BLUE }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE)}
              >
                <Eye className="w-3.5 h-3.5" />
                View as Customer
              </button>
            )}

            {!isReadOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setTab('users')}
                title="Create or manage customers"
                className="inline-flex items-center gap-1 rounded-[4px] border border-[#D0D5DD] bg-white hover:bg-gray-50 px-2.5 py-1.5 text-[12px] font-medium text-[#344054] cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Customers</span>
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                loadData()
                  .then(() => notify('info', 'Simulator metrics & ledgers refreshed.'))
                  .catch((e) => notify('error', e.message))
              }
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#D0D5DD] bg-white hover:bg-gray-50 px-2.5 py-1.5 text-[12px] font-medium text-[#344054] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Auditor Read-Only Banner */}
      {isReadOnly && (
        <div className="bg-[#EAF2FA] border-b border-[#CFE0F0]">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-8 py-2 text-[12px] text-[#1A4488] flex items-center gap-2">
            <LockKeyhole className="w-3.5 h-3.5 shrink-0" />
            Read-only auditor access: inspection, global search, and CSV exports are enabled; state-changing mutations are blocked by the server.
          </div>
        </div>
      )}

      {/* 4. Main Workspace Container */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-8 py-6">
        {tab === 'overview' && (
          <OverviewTab
            metrics={metrics}
            analytics={analytics}
            range={range}
            onRangeChange={handleRangeChange}
            users={users}
            globalTransactions={globalTransactions}
            audit={audit}
            isReadOnly={isReadOnly}
            busy={busy}
            onNavigate={setTab}
            onSelectUser={(id, nextTab) => void selectUserAndMaybeGo(id, nextTab)}
            onImpersonateById={(id, name) => void impersonateById(id, name)}
          />
        )}

        {tab === 'users' && (
          <UsersTab
            users={users}
            selectedUser={selectedUser}
            userJson={userJson}
            onChangeUserJson={setUserJson}
            isReadOnly={isReadOnly}
            busy={busy}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            isSuperAdmin={isSuperAdmin}
            isLinkedAdmin={adminAccounts.some(a => a.linkedUserId === selectedUser?.id)}
            onPromote={handlePromote}
            canCreateUsers={permissions.createUsers}
            canGenerateActivity={permissions.generateActivity}
            onCreateUser={handleCreateUser}
            onBulkUsers={handleBulkUsers}
            onSaveUserObject={handleSaveUserObject}
            onSaveRawJson={handleSaveRawJson}
            onToggleUserStatus={handleToggleUserStatus}
            onDeleteUser={handleDeleteUser}
            onRevokeSessions={handleRevokeSessions}
            onResetUserPassword={handleResetUserPassword}
            onGenerateHistory={handleGenerateHistory}
            onImpersonate={() =>
              selectedUser && void impersonateById(selectedUser.id, selectedUser.fullName)
            }
            onNavigate={setTab}
          />
        )}

        {tab === 'accounts' && (
          <AccountsTab
            users={users}
            selectedUser={selectedUser}
            isReadOnly={isReadOnly}
            busy={busy}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            onCreateAccount={handleCreateAccount}
            onSaveAccount={handleSaveAccount}
            onDeleteAccount={handleDeleteAccount}
            onBulkAccounts={handleBulkAccounts}
            onCreateLedgerEntry={handleCreateLedgerEntry}
          />
        )}

        {tab === 'transactions' && (
          <LedgerTab
            users={users}
            selectedUser={selectedUser}
            globalTransactions={globalTransactions}
            isReadOnly={isReadOnly}
            busy={busy}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            onCreateLedgerEntry={handleCreateLedgerEntry}
            onUpdateLedgerEntry={handleUpdateLedgerEntry}
            onDeleteLedgerEntry={handleDeleteLedgerEntry}
          />
        )}

        {tab === 'operations' && (
          <OperationsTab
            users={users}
            selectedUser={selectedUser}
            globalDisputes={analytics?.disputes || []}
            isReadOnly={isReadOnly}
            busy={busy}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            onTransfer={handleAdminTransfer}
            onCreatePayee={handleCreatePayee}
            onUpdatePayee={handleUpdatePayee}
            onDeletePayee={handleDeletePayee}
            onCreateSchedule={handleCreateSchedule}
            onUpdateSchedule={handleUpdateSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            onOpenDispute={handleOpenDispute}
            onSetDisputeStatus={handleSetDisputeStatus}
            onIssueRefund={handleIssueRefund}
            onCreateLedgerEntry={handleCreateLedgerEntry}
            onProcessScheduled={handleProcessScheduled}
            onRunMonthEndClose={handleRunMonthEndClose}
          />
        )}

        {tab === 'wealth' && (
          <WealthCreditTab
            users={users}
            selectedUser={selectedUser}
            isReadOnly={isReadOnly}
            busy={busy}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            onSaveUserObject={handleSaveUserObject}
          />
        )}

        {tab === 'messages' && (
          <>
          {selectedUser && <CustomerSupportTools key={selectedUser.id} userId={selectedUser.id} token={token} isSuperAdmin={isSuperAdmin} admins={adminAccounts} ownerId={users.find(u => u.id === selectedUser.id)?.ownerAdminId} status={messageThreads.find(t => t.userId === selectedUser.id)?.supportStatus} onRefresh={() => loadData()} readOnly={isReadOnly} />}
          <MessagesSupportTab
            token={token}
            users={users}
            selectedUser={selectedUser}
            threads={messageThreads}
            readOnly={isReadOnly}
            onSelectUser={(id) => void selectUserAndMaybeGo(id)}
            canSendMessages={permissions.sendMessages}
            onSendAdvisorMessage={handleSendAdvisorMessage}
            onMarkThreadRead={handleMarkThreadRead}
            onUpdateAccountNotice={handleUpdateAccountNotice}
          />
          </>
        )}

        {tab === 'audit' && <AuditTab audit={audit} />}

        {tab === 'settings' && (
          <SettingsTab
            settings={simulatorSettings}
            onChangeSettings={setSimulatorSettings}
            onSaveSettings={handleSaveSettings}
            adminAccounts={adminAccounts}
            currentAdminUsername={currentAdminUsername}
            isReadOnly={isReadOnly}
            busy={busy}
            system={analytics?.system}
            onCreateAdmin={handleCreateAdmin}
            onUpdateAdmin={handleUpdateAdmin}
            onDeleteAdmin={handleDeleteAdmin}
            onChangeOwnPassword={handleChangeOwnPassword}
            onDownloadBackup={handleDownloadBackup}
            onRestoreBackup={handleRestoreBackup}
            onResetSimulator={handleResetSimulator}
          />
        )}
      </main>

      {/* Quick Deposit / Adjust Customer Balance Modal (available from sub-bar on every tab) */}
      <Modal
        open={quickAdjustOpen}
        onClose={() => setQuickAdjustOpen(false)}
        title={`Deposit or Adjust Balance — ${selectedUser?.fullName || ''}`}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setQuickAdjustOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy || !quickAcctId || !quickAmt}
              onClick={async () => {
                if (!selectedUser || !quickAcctId) return;
                const acct = selectedUser.accounts.find((a) => a.id === quickAcctId);
                if (!acct) return;
                const raw = Math.abs(Number(quickAmt) || 0);
                if (raw <= 0) return;
                const isDebt =
                  acct.type === 'credit-card' ||
                  acct.type === 'auto-loan' ||
                  acct.type === 'mortgage';
                const signed = isDebt
                  ? quickDir === 'credit'
                    ? -raw
                    : raw
                  : quickDir === 'credit'
                    ? raw
                    : -raw;
                const ok = await handleCreateLedgerEntry({
                  userId: selectedUser.id,
                  accountId: acct.id,
                  description: quickMemo.trim() || 'Admin balance adjustment',
                  amount: signed,
                  category: quickDir === 'credit' ? 'Income' : 'Bills',
                  date: inputDate(0),
                  status: 'posted',
                });
                if (ok) setQuickAdjustOpen(false);
              }}
            >
              <Check className="w-3.5 h-3.5" /> Post &amp; Reconcile Balance
            </Btn>
          </>
        }
      >
        {selectedUser && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[11.5px] font-semibold text-gray-700 mb-1">
                Target Account
              </span>
              <SelectInput
                value={quickAcctId}
                onChange={(e) => setQuickAcctId(e.target.value)}
                className="w-full"
              >
                {selectedUser.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (•••• {a.mask}) — {fmtMoneyFull(a.balance)}
                  </option>
                ))}
              </SelectInput>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11.5px] font-semibold text-gray-700 mb-1">
                  Adjustment Type
                </span>
                <SelectInput
                  value={quickDir}
                  onChange={(e) => {
                    const next = e.target.value as 'credit' | 'debit';
                    setQuickDir(next);
                    setQuickMemo(
                      next === 'credit'
                        ? 'Direct Deposit — Payroll Credit'
                        : 'Account Debit Adjustment'
                    );
                  }}
                  className="w-full"
                >
                  <option value="credit">Deposit / Credit Funds (+)</option>
                  <option value="debit">Withdrawal / Charge (−)</option>
                </SelectInput>
              </label>
              <label className="block">
                <span className="block text-[11.5px] font-semibold text-gray-700 mb-1">
                  Amount ($)
                </span>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quickAmt}
                  onChange={(e) => setQuickAmt(e.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-[11.5px] font-semibold text-gray-700 mb-1">
                Statement Description / Memo
              </span>
              <TextInput
                value={quickMemo}
                onChange={(e) => setQuickMemo(e.target.value)}
              />
            </label>
          </div>
        )}
      </Modal>

      {/* 5. Authentic Chase Online Dashboard Footer — identical to BankingDashboard.tsx */}
      <Footer
        variant="dashboard"
        userLabel={adminName}
        spanishMode={spanishMode}
        onAction={handleFooterAction}
        onHome={() => setTab('overview')}
      />

      <ToastStack />
    </div>
  );
};

export default AdminPage;
