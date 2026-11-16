/* -------------------------------------------------------------------------- */
/* Chase Online — Executive Simulator Admin Console (/admin)                  */
/* Combines full simulator operations (users, accounts, ledger, history       */
/* generator, transfers, payees, schedules, disputes/refunds, impersonation,  */
/* staff RBAC, backup/restore) with TailAdmin/Stripe-style analytics & shell. */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  BarChart3,
  BookOpenCheck,
  Command,
  Eye,
  FileText,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { readAdminToken, writeAdminToken, type AccountType, type User } from '../banking/store';
import { ChaseOctagon } from './ChaseLogo';
import { Spinner } from './Loading';
import { AccountsTab, LedgerTab } from './admin/AccountsLedgerTab';
import { AuditTab, OperationsTab, SettingsTab } from './admin/OperationsSettingsTab';
import { OverviewTab } from './admin/OverviewTab';
import { UsersTab } from './admin/UsersTab';
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
} from './admin/types';
import { Avatar, Badge, Btn, Modal, ToastStack, fmtMoneyFull, pushToast } from './admin/ui';

const THEME_KEY = 'chase_admin_dark_v1';

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
  const [currentAdminUsername, setCurrentAdminUsername] = useState('admin');
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);

  // Sign-in form
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('chaseadmin123');
  const [loginError, setLoginError] = useState('');

  // Shell UI state
  const [tab, setTab] = useState<AdminTab>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Simulator datasets
  const [range, setRange] = useState<CashflowRange>('12w');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [analytics, setAnalytics] = useState<OverviewAnalytics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [globalTransactions, setGlobalTransactions] = useState<GlobalTransaction[]>([]);
  const [simulatorSettings, setSimulatorSettings] = useState<SimulatorSettings>({
    allowEnrollment: true,
    allowCustomerPasswordReset: true,
  });

  // Active selected customer for deep inspection across tabs
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userJson, setUserJson] = useState('');
  const [busy, setBusy] = useState(false);

  const isReadOnly = currentAdminRole === 'auditor';

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, dark ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [dark]);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      return result.user;
    },
    [api, token]
  );

  const loadData = useCallback(
    async (activeToken = token, activeRange = range) => {
      const [overviewRes, userRes, auditRes, txRes] = await Promise.all([
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
      ]);
      setMetrics(overviewRes.metrics);
      if (overviewRes.analytics) setAnalytics(overviewRes.analytics);
      setUsers(userRes.users);
      setAudit(auditRes.audit);
      setGlobalTransactions(txRes.transactions);
      return userRes.users;
    },
    [api, range, token]
  );

  // Sync initialToken changes from parent App.tsx
  useEffect(() => {
    if (initialToken && initialToken !== token) {
      setToken(initialToken);
      writeAdminToken(initialToken);
    }
  }, [initialToken, token]);

  // Verify session on mount / token change (also works via HttpOnly cookie when token === '')
  useEffect(() => {
    let active = true;
    (async () => {
      setCheckingAuth(true);
      try {
        const me = await api<{
          admin: { username: string; label: string; role: 'admin' | 'auditor' };
          token?: string;
        }>('/api/admin/me', {}, token);
        if (!active) return;
        const resolvedTok = me.token || token;
        if (resolvedTok && resolvedTok !== token) {
          setToken(resolvedTok);
          writeAdminToken(resolvedTok);
        }
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

        // Auto-select Alex Rivera ('chase') or first customer so every tab opens rich & populated
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

  const handleSeedDemoRoster = async () => {
    setBusy(true);
    try {
      const res = await api<{ added: number }>('/api/admin/seed-demo', {
        method: 'POST',
        body: '{}',
      });
      const loaded = await loadData();
      if (!selectedUser && loaded[0]) await loadSelectedUser(loaded[0].id);
      notify(
        'success',
        res.added > 0
          ? `Added ${res.added} sample customer households to the simulator.`
          : 'Sample roster is already present.'
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not seed sample roster.');
    } finally {
      setBusy(false);
    }
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
      await acceptUpdatedUser(res.user, `Created simulator profile @${res.user.username}.`);
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
      notify('success', `Deleted simulator profile @${removedUsername}.`);
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
        `Generated ${res.transactionsAdded.toLocaleString()} ledger entries across ${res.eventsGenerated.toLocaleString()} simulated events.`
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

  const handleSaveAccount = async (
    accountId: string,
    patch: {
      name: string;
      balance: number;
      creditLimit: number | null;
      locked: boolean;
      autopay: boolean;
    }
  ) => {
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
      await acceptUpdatedUser(res.user, 'Opened simulated card dispute.');
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
    patch: { role?: 'admin' | 'auditor'; status?: 'active' | 'disabled'; password?: string }
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
      notify('success', `Restored ${res.usersRestored} simulator customer profiles from backup.`);
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
      notify('success', 'Simulator reset to fresh Alex Rivera (chase) baseline.');
      return true;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Simulator reset failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------- Navigation Config -------------------------- */

  const openDisputesCount = useMemo(
    () => (analytics?.disputes || []).filter((d) => d.status === 'open').length,
    [analytics]
  );

  const navItems: {
    id: AdminTab;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    badge?: string | number;
    badgeTone?: 'primary' | 'warning' | 'neutral';
  }[] = [
    {
      id: 'overview',
      label: 'Executive Overview',
      subtitle: 'KPIs, cashflow velocity, portfolio mix & date-range ledger reports',
      icon: <BarChart3 className="w-[18px] h-[18px]" />,
    },
    {
      id: 'users',
      label: 'Users & Simulator',
      subtitle: 'Customer directory, impersonation, history generator & JSON studio',
      icon: <Users className="w-[18px] h-[18px]" />,
      badge: metrics?.users ?? users.length,
    },
    {
      id: 'accounts',
      label: 'Accounts Portfolio',
      subtitle: 'Provision, lock/unlock, edit balances & reconcile credit limits',
      icon: <WalletCards className="w-[18px] h-[18px]" />,
      badge: metrics?.accounts,
    },
    {
      id: 'transactions',
      label: 'Ledger Activity',
      subtitle: 'Global ledger explorer & balance-reconciled entry studio',
      icon: <FileText className="w-[18px] h-[18px]" />,
      badge: metrics?.transactions,
    },
    {
      id: 'operations',
      label: 'Payments & Disputes',
      subtitle: 'Transfers, payees, recurring schedules & card chargeback refunds',
      icon: <ArrowRightLeft className="w-[18px] h-[18px]" />,
      badge: openDisputesCount > 0 ? openDisputesCount : undefined,
      badgeTone: 'warning',
    },
    {
      id: 'audit',
      label: 'Admin Audit Log',
      subtitle: 'Immutable 5,000-entry compliance & operator audit trail',
      icon: <BookOpenCheck className="w-[18px] h-[18px]" />,
    },
    {
      id: 'settings',
      label: 'Settings & Backup',
      subtitle: 'Access guardrails, RBAC staff, JSON backup/restore & telemetry',
      icon: <Settings className="w-[18px] h-[18px]" />,
    },
  ];

  const activeNav = navItems.find((n) => n.id === tab) || navItems[0];

  /* ------------------------- Unauthenticated Gate ------------------------- */

  if (checkingAuth && !authenticated) {
    return (
      <div className="min-h-screen bg-[#071A3A] text-white flex flex-col items-center justify-center gap-3">
        <Spinner size="md" tone="white" />
        <p className="text-[13.5px] text-blue-100/80">Verifying Chase Administrator session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#061531] via-[#0B234E] to-[#113674] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[460px] rounded-2xl bg-white shadow-[0_28px_80px_rgba(0,10,30,0.45)] border border-white/20 p-7 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ChaseOctagon size={28} color="#005EB8" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#005EB8]">
                  Chase Online
                </p>
                <p className="text-[12px] text-gray-500">Operations Control Center</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#005EB8] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Chase.com
            </button>
          </div>

          <h1 className="mt-6 text-[24px] font-bold tracking-tight text-gray-900">
            Administrator Sign In
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Role-protected console for managing simulated customers, ledgers, disputes, and environment controls.
          </p>

          {loginError && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-[#FEF2F2] border border-[#F5C2C7] px-3.5 py-2.5 text-[12.5px] text-[#B42318]"
            >
              {loginError}
            </p>
          )}

          <form className="mt-5 space-y-4" onSubmit={signIn}>
            <label className="block">
              <span className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                Administrator Username
              </span>
              <input
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-lg border border-gray-300 text-[14px] text-gray-900 outline-none focus:border-[#0060F0] focus:ring-2 focus:ring-[#0060F0]/20"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-lg border border-gray-300 text-[14px] text-gray-900 outline-none focus:border-[#0060F0] focus:ring-2 focus:ring-[#0060F0]/20"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-[#0060F0] hover:bg-[#004EC4] disabled:opacity-60 text-white font-semibold text-[13.5px] inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {busy && <Spinner size="sm" tone="white" />}
              {busy ? 'Signing in…' : 'Sign in to Admin Console'}
            </button>
          </form>

          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn(undefined, { username: 'admin', password: 'chaseadmin123' })}
            className="mt-3 w-full h-10 rounded-lg border border-[#005EB8] bg-[#F2F7FC] hover:bg-[#E4EFFA] text-[#005EB8] font-semibold text-[13px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserRound className="w-4 h-4" />
            One-click Chase Admin Sign In
          </button>

          <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3 text-[12px] text-gray-600 leading-relaxed">
            <div className="flex items-center justify-between font-semibold text-gray-800 mb-1">
              <span>Root Admin Credentials</span>
              <span className="font-mono text-[#005EB8]">admin / chaseadmin123</span>
            </div>
            Customer sample login (<code className="font-mono">chase / chase123</code> — Alex Rivera) signs into Personal Banking. All records here are simulated only.
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------- Authenticated Shell ----------------------- */

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full text-white">
      {/* Brand header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0060F0] flex items-center justify-center shrink-0 shadow-sm">
            <ChaseOctagon size={20} color="#FFFFFF" />
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-blue-200/80">
                Chase Online
              </p>
              <p className="text-[14.5px] font-bold tracking-tight truncate">Admin Simulator</p>
            </div>
          )}
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="p-1.5 rounded-lg text-blue-100 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-blue-200/70 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto admin-scroll" aria-label="Admin navigation">
        {navItems.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setMobileNavOpen(false);
              }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-[#0060F0] text-white shadow-[0_4px_14px_rgba(0,96,240,0.4)]'
                  : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="shrink-0">{item.icon}</span>
                {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
              </span>
              {(!collapsed || isMobile) && item.badge !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                    active
                      ? 'bg-white/20 text-white'
                      : item.badgeTone === 'warning'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Operator Footer */}
      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
        {(!collapsed || isMobile) && (
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={adminName} size={32} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{adminName}</p>
                <p className="text-[11px] text-blue-200/80 truncate">
                  @{currentAdminUsername} · {isReadOnly ? 'Auditor (RO)' : 'Full Admin'}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className={`flex ${collapsed && !isMobile ? 'flex-col' : 'items-center'} gap-1.5`}>
          <button
            type="button"
            onClick={onExit}
            title="Return to Chase.com"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-2 text-[12px] font-medium text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {(!collapsed || isMobile) && <span>Chase.com</span>}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out of Admin Console"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-2 text-[12px] font-medium text-red-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {(!collapsed || isMobile) && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen flex bg-[#F4F6FA] dark:bg-[#0B1424] text-gray-900 dark:text-gray-100">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 bg-gradient-to-b from-[#071A3A] via-[#0A2148] to-[#0E2A5C] transition-all duration-200 sticky top-0 h-screen ${
            collapsed ? 'w-[74px]' : 'w-[264px]'
          }`}
        >
          {renderSidebarContent(false)}
        </aside>

        {/* Mobile Sidebar Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-[95] lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative w-[272px] h-full bg-gradient-to-b from-[#071A3A] to-[#0E2A5C] shadow-2xl">
              {renderSidebarContent(true)}
            </aside>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sticky Topbar */}
          <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0F1B2E]/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[16.5px] sm:text-[18px] font-bold text-gray-900 dark:text-white truncate">
                    {activeNav.label}
                  </h1>
                  <Badge tone={isReadOnly ? 'warning' : 'primary'}>
                    {isReadOnly ? 'Read-Only Auditor' : 'Simulator Mode'}
                  </Badge>
                </div>
                <p className="hidden sm:block text-[12px] text-gray-500 dark:text-gray-400 truncate">
                  {activeNav.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Quick ⌘K Search Trigger */}
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className="hidden md:inline-flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 hover:border-[#0060F0] px-3 py-1.5 text-[12.5px] text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Jump to user or tool…</span>
                <kbd className="rounded bg-white dark:bg-white/10 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[10.5px] font-mono">
                  ⌘K
                </kbd>
              </button>

              {/* Active Customer Context Pill */}
              {selectedUser && (
                <div className="hidden xl:flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-white/5 pl-2.5 pr-1.5 py-1">
                  <Avatar name={selectedUser.fullName} size={24} />
                  <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 max-w-[130px] truncate">
                    {selectedUser.fullName}
                  </span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void impersonateById(selectedUser.id, selectedUser.fullName)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0060F0] hover:bg-[#004EC4] text-white px-2 py-1 text-[11px] font-semibold cursor-pointer"
                      title={`Preview banking dashboard as ${selectedUser.fullName}`}
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                  )}
                </div>
              )}

              <Btn
                variant="secondary"
                size="xs"
                disabled={busy}
                onClick={() =>
                  loadData()
                    .then(() => notify('info', 'Simulator metrics & ledgers refreshed.'))
                    .catch((e) => notify('error', e.message))
                }
                title="Refresh simulator data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Btn>

              <button
                type="button"
                onClick={() => setDark((d) => !d)}
                aria-label="Toggle color theme"
                className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer"
              >
                {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Auditor Notice */}
          {isReadOnly && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 px-6 py-2 text-[12px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <LockKeyhole className="w-3.5 h-3.5 shrink-0" />
              Read-only auditor session: inspection, global search, and CSV exports are enabled; state-changing mutations are blocked by the server.
            </div>
          )}

          {/* Page Content */}
          <main className="flex-1 p-4 sm:p-6 max-w-[1640px] w-full mx-auto">
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
                onSeedDemoRoster={() => void handleSeedDemoRoster()}
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
              />
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

          {/* Footer Bar */}
          <footer className="px-6 py-3.5 border-t border-gray-200 dark:border-gray-800 text-[11.5px] text-gray-500 dark:text-gray-400 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0060F0]" />
              Chase Simulator Operations Console · Simulated records only — no external payment networks
            </span>
            <button
              type="button"
              onClick={onExit}
              className="font-semibold text-[#0060F0] hover:underline cursor-pointer"
            >
              ← Return to Chase.com
            </button>
          </footer>
        </div>

        {/* ⌘K Command Palette */}
        <Modal
          open={cmdOpen}
          onClose={() => {
            setCmdOpen(false);
            setCmdQuery('');
          }}
          title="Quick Command & Customer Jump"
          width="max-w-[540px]"
        >
          <div className="space-y-3">
            <div className="relative">
              <Command className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                placeholder="Search tabs, customers (@username), or actions…"
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 pl-9 pr-3 py-2.5 text-[13.5px] outline-none focus:border-[#0060F0]"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto admin-scroll divide-y divide-gray-100 dark:divide-gray-800">
              <div className="py-2">
                <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                  Sections
                </p>
                {navItems
                  .filter((n) =>
                    `${n.label} ${n.subtitle}`.toLowerCase().includes(cmdQuery.toLowerCase())
                  )
                  .map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setTab(n.id);
                        setCmdOpen(false);
                        setCmdQuery('');
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-left text-[13px] cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 font-medium">
                        {n.icon}
                        {n.label}
                      </span>
                      <span className="text-[11px] text-gray-400">Open tab</span>
                    </button>
                  ))}
              </div>

              <div className="py-2">
                <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                  Customers
                </p>
                {users
                  .filter((u) =>
                    `${u.fullName} ${u.username} ${u.email}`
                      .toLowerCase()
                      .includes(cmdQuery.toLowerCase())
                  )
                  .slice(0, 8)
                  .map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void selectUserAndMaybeGo(u.id, 'users');
                          setCmdOpen(false);
                          setCmdQuery('');
                        }}
                        className="flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        <Avatar name={u.fullName} size={28} />
                        <div>
                          <p className="text-[13px] font-semibold">{u.fullName}</p>
                          <p className="text-[11px] text-gray-400">
                            @{u.username} · {fmtMoneyFull(u.depositBalance)}
                          </p>
                        </div>
                      </button>
                      {!isReadOnly && (
                        <Btn
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setCmdOpen(false);
                            setCmdQuery('');
                            void impersonateById(u.id, u.fullName);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </Btn>
                      )}
                    </div>
                  ))}
              </div>

              {!isReadOnly && (
                <div className="py-2">
                  <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                    Quick Simulator Actions
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCmdOpen(false);
                      void handleSeedDemoRoster();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-left text-[13px] cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-[#0060F0]" />
                    Populate sample Private Client &amp; Sapphire households
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>

        <ToastStack />
      </div>
    </div>
  );
};

export default AdminPage;
