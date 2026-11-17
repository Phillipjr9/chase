/* -------------------------------------------------------------------------- */
/* Admin Console — Immutable Administrator Audit Trail (Plain-English View)   */
/* Built so Super Admins can see every login, failed attempt + exact reason,  */
/* money movement, customer action, and staff change in simple everyday terms */
/* with tamper-evident SHA-256 hash-chain verification.                       */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  RefreshCw,
  Download,
  ChevronRight,
  Clock,
  Globe,
  Monitor,
  User as UserIcon,
  DollarSign,
  KeyRound,
  Activity,
  ChevronDown,
  Copy,
  Check,
  Filter,
} from 'lucide-react';
import {
  Card,
  Badge,
  Btn,
  ExportBtn,
  TextInput,
  SelectInput,
  TableShell,
  Th,
  Td,
  Pagination,
  Drawer,
  EmptyState,
  fmtDateTime,
  fmtMoneyFull,
  relTime,
  downloadCsv,
  BadgeTone,
} from './ui';
import {
  AuditActorType,
  AuditCategory,
  AuditEntry,
  AuditIntegrity,
  AuditOutcome,
  AuditStats,
} from './types';

interface Props {
  audit: AuditEntry[];
  isSuperAdmin?: boolean;
  integrity?: AuditIntegrity | null;
  stats?: AuditStats | null;
  onRefresh?: () => Promise<void> | void;
  busy?: boolean;
}

type CategoryFilter = 'all' | 'failed_blocked' | AuditCategory;
type TimeRangeFilter = 'all' | '24h' | '7d' | '30d';

const CATEGORY_META: Record<AuditCategory, { label: string; tone: BadgeTone }> = {
  auth: { label: 'Logins & Passwords', tone: 'primary' },
  security: { label: 'Security & Access', tone: 'error' },
  money: { label: 'Money & Transfers', tone: 'success' },
  accounts: { label: 'Accounts & Cards', tone: 'info' },
  customers: { label: 'Customers', tone: 'violet' },
  staff: { label: 'Admin & Staff', tone: 'warning' },
  support: { label: 'Messages & Disputes', tone: 'info' },
  system: { label: 'System & Backups', tone: 'neutral' },
};

const ACTOR_TYPE_LABEL: Record<AuditActorType, { label: string; tone: BadgeTone }> = {
  super_admin: { label: 'Super Admin', tone: 'primary' },
  admin: { label: 'Staff Admin', tone: 'violet' },
  auditor: { label: 'Auditor', tone: 'info' },
  customer: { label: 'Customer', tone: 'success' },
  anonymous: { label: 'Visitor / Unknown', tone: 'warning' },
  system: { label: 'System', tone: 'neutral' },
};

const OUTCOME_META: Record<AuditOutcome, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  success: {
    label: 'Succeeded',
    tone: 'success',
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
  },
  failed: {
    label: 'Failed',
    tone: 'error',
    icon: <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />,
  },
  blocked: {
    label: 'Blocked',
    tone: 'error',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />,
  },
  warning: {
    label: 'Notice',
    tone: 'warning',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
  },
};

const SEVERITY_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  critical: { label: 'Critical', tone: 'error' },
  high: { label: 'High Priority', tone: 'warning' },
  medium: { label: 'Medium', tone: 'info' },
  low: { label: 'Routine', tone: 'neutral' },
  info: { label: 'Info', tone: 'neutral' },
};

const FIELD_LABELS: Record<string, string> = {
  username: 'Username',
  customerName: 'Customer Name',
  accountName: 'Account',
  accountMask: 'Account Ending In',
  fromAccount: 'From Account',
  toAccount: 'To Account',
  amount: 'Amount',
  previousBalance: 'Balance Before',
  newBalance: 'Balance After',
  availableBalance: 'Available Balance',
  previousAmount: 'Previous Amount',
  newAmount: 'New Amount',
  reversedAmount: 'Reversed Amount',
  openingDeposit: 'Opening Deposit',
  fee: 'Fee',
  recipient: 'Recipient',
  payee: 'Payee',
  merchant: 'Merchant',
  description: 'Description',
  memo: 'Memo / Note',
  category: 'Category',
  product: 'Banking Product',
  type: 'Account Type',
  transferType: 'Transfer Method',
  wireType: 'Wire Type',
  attemptCount: 'Failed Attempt #',
  attemptsRemaining: 'Tries Left Before Lockout',
  lockoutMinutes: 'Lockout Duration (mins)',
  maxAttempts: 'Max Attempts Allowed',
  role: 'Role',
  isSuperAdmin: 'Super Administrator',
  linkedAdmin: 'Linked Admin Access',
  viaImpersonation: 'Done During Customer Preview',
  status: 'Status',
  subject: 'Message Subject',
  title: 'Banner Title',
  tone: 'Banner Tone',
  disputeReason: 'Dispute Reason',
  replacementReason: 'Replacement Reason',
  oldMask: 'Old Card Ending In',
  newMask: 'New Card Ending In',
  fields: 'Fields Changed',
  changedFields: 'Fields Updated',
  changes: 'Detailed Changes',
  usersCount: 'Customers Backed Up',
  adminAccountsCount: 'Staff Accounts Backed Up',
  usersRestored: 'Customers Restored',
  adminsRestored: 'Staff Accounts Restored',
  transactionsAdded: 'Transactions Added',
  range: 'Date Range',
  endpoint: 'Requested Action Path',
  method: 'HTTP Method',
  targetUsername: 'Target Customer',
  checkNumber: 'Check Number',
  symbol: 'Stock Ticker',
  shares: 'Shares',
  side: 'Trade Side',
  total: 'Total Value',
  card: 'Credit Card',
};

const MONEY_FIELDS = new Set([
  'amount',
  'previousBalance',
  'newBalance',
  'availableBalance',
  'previousAmount',
  'newAmount',
  'reversedAmount',
  'openingDeposit',
  'fee',
  'total',
  'refundAmount',
  'totalAmount',
  'interestCredited',
]);

const HIDDEN_TECHNICAL_KEYS = new Set(['userId', 'accountId', 'transactionId', 'adminId', 'targetUserId', 'fromAccountId', 'toAccountId', 'fromOwnerId', 'path']);

function formatFriendlyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (MONEY_FIELDS.has(key) && Number.isFinite(Number(value))) {
    return fmtMoneyFull(Number(value));
  }
  if (key === 'accountMask' || key === 'oldMask' || key === 'newMask') {
    return `•••• ${String(value)}`;
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => String(v)).join(', ') : 'None';
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return 'None';
    return entries
      .map(([k, v]) => {
        if (v && typeof v === 'object' && 'from' in (v as Record<string, unknown>) && 'to' in (v as Record<string, unknown>)) {
          const diff = v as { from: unknown; to: unknown };
          return `${k}: ${String(diff.from ?? 'empty')} → ${String(diff.to ?? 'empty')}`;
        }
        return `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
      })
      .join(' · ');
  }
  return String(value);
}

function getActionGuidance(entry: AuditEntry): string | null {
  const lowerAction = String(entry.action || '').toLowerCase();
  const outcome = entry.outcome || 'success';
  if (outcome === 'success') return null;
  if (lowerAction.includes('rate limit')) {
    return 'This IP hit 10 failed sign-ins and is automatically locked for 15 minutes. If this is a real customer, check if they forgot their password; if unfamiliar, keep an eye on the IP address.';
  }
  if (lowerAction.includes('failed') && (lowerAction.includes('sign-in') || lowerAction.includes('login'))) {
    if (String(entry.reason || '').toLowerCase().includes('unknown username')) {
      return 'Someone typed a username that does not exist. Occasional typos are normal, but repeated unknown usernames from one IP can indicate credential probing.';
    }
    return 'The wrong password was entered. If the user is locked out or forgot their password, you can reset it cleanly from Customers → Security.';
  }
  if (lowerAction.includes('suspended')) {
    return 'This customer account is currently suspended. To let them back in, open Customers, select their profile, and change status back to Active.';
  }
  if (lowerAction.includes('disabled')) {
    return 'This staff administrator account is disabled. You can re-enable it anytime in Settings & Staff if they should regain access.';
  }
  if (lowerAction.includes('cross-tenant') || lowerAction.includes('unauthorized') || lowerAction.includes('missing permission') || lowerAction.includes('auditor write')) {
    return 'The server automatically stopped this action because the staff member does not have permission for it. Review their role or capabilities in Settings & Staff if they legitimately need access.';
  }
  if (lowerAction.includes('card detail reveal')) {
    return 'Someone failed password verification while trying to view a customer’s card number. Confirm with the customer if repeated failures appear.';
  }
  if (lowerAction.includes('deleted simulator ledger transaction')) {
    return 'Reminder: deleting a ledger entry automatically reverses its dollar effect on the account balance. Review the Balance Before → Balance After values below to confirm the balance is what you expect.';
  }
  return null;
}

function getSimpleHeadline(entry: AuditEntry): string {
  const lower = String(entry.action || '').toLowerCase();
  if (lower === 'failed customer sign-in attempt') return 'Customer sign-in failed';
  if (lower === 'failed admin sign-in attempt') return 'Admin sign-in failed';
  if (lower === 'blocked customer sign-in (rate limit)') return 'Customer login locked (too many tries)';
  if (lower === 'blocked admin sign-in (rate limit)') return 'Admin login locked (too many tries)';
  if (lower === 'blocked customer sign-in (account suspended)') return 'Suspended customer tried to sign in';
  if (lower === 'blocked admin sign-in (disabled)' || lower === 'blocked admin sign-in through customer login (disabled)') return 'Disabled admin tried to sign in';
  if (lower === 'blocked admin sign-in (linked customer suspended)') return 'Admin sign-in blocked (linked customer suspended)';
  if (lower === 'admin sign-in' || lower === 'admin sign-in through customer login') return 'Administrator signed in';
  if (lower === 'admin sign-out') return 'Administrator signed out';
  if (lower === 'started user impersonation') return 'Admin previewed customer account';
  if (lower === 'created simulator ledger transaction') return 'Admin added a transaction';
  if (lower === 'updated simulator ledger transaction') return 'Admin edited a transaction';
  if (lower === 'deleted simulator ledger transaction') return 'Admin deleted a transaction';
  if (lower === 'updated simulator account') return 'Admin updated an account';
  if (lower === 'created simulator account') return 'Admin opened an account';
  if (lower === 'deleted simulator account') return 'Admin deleted an account';
  if (lower === 'reset simulator user password') return 'Admin reset a customer password';
  if (lower === 'promoted test customer to administrator') return 'Customer granted admin access';
  if (lower === 'linked customer changed shared password') return 'Shared customer/admin password changed';
  return entry.action;
}

function getInlineChips(entry: AuditEntry): Array<{ label: string; tone?: 'neutral' | 'money' | 'alert' }> {
  const d = entry.details || {};
  const chips: Array<{ label: string; tone?: 'neutral' | 'money' | 'alert' }> = [];

  if (entry.target?.label) {
    chips.push({ label: entry.target.label });
  }
  if (d.previousBalance !== undefined && d.newBalance !== undefined) {
    chips.push({
      label: `Balance: ${fmtMoneyFull(Number(d.previousBalance))} → ${fmtMoneyFull(Number(d.newBalance))}`,
      tone: 'money',
    });
  } else if (d.amount !== undefined && Number.isFinite(Number(d.amount))) {
    chips.push({ label: `Amount: ${fmtMoneyFull(Number(d.amount))}`, tone: 'money' });
  }
  if (d.attemptCount !== undefined) {
    chips.push({
      label: `Attempt ${String(d.attemptCount)} of 10`,
      tone: Number(d.attemptCount) >= 5 ? 'alert' : 'neutral',
    });
  }
  if (entry.ip && entry.ip !== 'unknown') {
    chips.push({ label: `IP: ${entry.ip}` });
  }
  if (entry.userAgent && entry.userAgent !== 'Unknown device') {
    chips.push({ label: entry.userAgent });
  }
  return chips.slice(0, 4);
}

export const AuditTrailTab: React.FC<Props> = ({
  audit,
  isSuperAdmin = true,
  integrity,
  stats,
  onRefresh,
  busy = false,
}) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | AuditOutcome>('all');
  const [actorTypeFilter, setActorTypeFilter] = useState<'all' | AuditActorType>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const pageSize = 25;

  const computedStats = useMemo<AuditStats>(() => {
    if (stats) return stats;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      total: audit.length,
      last24h: audit.filter((e) => now - Date.parse(e.createdAt || '') <= dayMs).length,
      failedCount: audit.filter((e) => e.outcome === 'failed').length,
      blockedCount: audit.filter((e) => e.outcome === 'blocked').length,
      authEvents: audit.filter((e) => e.category === 'auth' || e.category === 'security').length,
      moneyEvents: audit.filter((e) => e.category === 'money').length,
      securityAlerts: audit.filter((e) => e.outcome === 'failed' || e.outcome === 'blocked').length,
      customerEvents: audit.filter((e) => e.actorType === 'customer' || e.actorType === 'anonymous').length,
      adminEvents: audit.filter((e) => e.actorType !== 'customer' && e.actorType !== 'anonymous').length,
    };
  }, [audit, stats]);

  const failedBlockedCount = computedStats.failedCount + computedStats.blockedCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const maxAgeMs =
      timeRange === '24h'
        ? 24 * 60 * 60 * 1000
        : timeRange === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : timeRange === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : null;

    return audit.filter((entry) => {
      if (categoryFilter === 'failed_blocked') {
        if (entry.outcome !== 'failed' && entry.outcome !== 'blocked') return false;
      } else if (categoryFilter !== 'all' && (entry.category || 'system') !== categoryFilter) {
        return false;
      }
      if (outcomeFilter !== 'all' && (entry.outcome || 'success') !== outcomeFilter) return false;
      if (actorTypeFilter !== 'all' && (entry.actorType || 'system') !== actorTypeFilter) return false;
      if (maxAgeMs !== null) {
        const ts = Date.parse(entry.createdAt || '');
        if (!Number.isFinite(ts) || now - ts > maxAgeMs) return false;
      }
      if (q) {
        const haystack = [
          entry.actor,
          entry.action,
          getSimpleHeadline(entry),
          entry.summary || '',
          entry.reason || '',
          entry.target?.label || '',
          entry.ip || '',
          entry.userAgent || '',
          entry.entryHash || '',
          JSON.stringify(entry.details || {}),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [audit, query, categoryFilter, outcomeFilter, actorTypeFilter, timeRange]);

  const hasActiveFilters =
    query.trim() !== '' ||
    categoryFilter !== 'all' ||
    outcomeFilter !== 'all' ||
    actorTypeFilter !== 'all' ||
    timeRange !== 'all';

  const clearFilters = () => {
    setQuery('');
    setCategoryFilter('all');
    setOutcomeFilter('all');
    setActorTypeFilter('all');
    setTimeRange('all');
    setPage(1);
  };

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportJsonProof = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      trailType: isSuperAdmin ? 'Immutable Administrator Audit Trail' : 'Operator Activity Trail',
      integrity: integrity || null,
      totalExported: filtered.length,
      events: filtered,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chase-immutable-audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      window.setTimeout(() => setCopiedHash(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const categoryPills: Array<{ id: CategoryFilter; label: string; count?: number; alert?: boolean }> = [
    { id: 'all', label: 'All Activity', count: audit.length },
    { id: 'failed_blocked', label: 'Failed & Blocked', count: failedBlockedCount, alert: failedBlockedCount > 0 },
    { id: 'auth', label: 'Logins & Passwords' },
    { id: 'security', label: 'Security & Access' },
    { id: 'money', label: 'Money & Transfers' },
    { id: 'accounts', label: 'Accounts & Cards' },
    { id: 'customers', label: 'Customers' },
    { id: 'staff', label: 'Admin & Staff' },
    { id: 'support', label: 'Messages & Disputes' },
    { id: 'system', label: 'System & Backups' },
  ];

  const readableDetails = useMemo(() => {
    if (!selectedEntry) return [];
    return Object.entries(selectedEntry.details || {})
      .filter(([k, v]) => !HIDDEN_TECHNICAL_KEYS.has(k) && v !== undefined && v !== null && v !== '')
      .map(([k, v]) => ({
        key: k,
        label: FIELD_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
        value: formatFriendlyValue(k, v),
      }));
  }, [selectedEntry]);

  return (
    <div className="space-y-4">
      {/* Immutability & Chain Verification Banner */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                integrity?.status === 'tampered'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                  : 'bg-[#EBF4FF] text-[#0B6EFD] dark:bg-[#0B6EFD]/20 dark:text-[#60A5FA]'
              }`}
            >
              {integrity?.status === 'tampered' ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white">
                  {isSuperAdmin ? 'Immutable Administrator Audit Trail' : 'Your Activity Audit Trail'}
                </h3>
                {isSuperAdmin && integrity && (
                  integrity.status === 'tampered' ? (
                    <Badge tone="error">Integrity Alert · Chain Mismatch</Badge>
                  ) : (
                    <Badge tone="success">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Verified Append-Only Chain
                      </span>
                    </Badge>
                  )
                )}
              </div>
              <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1">
                {isSuperAdmin
                  ? 'Every admin action, customer login, failed sign-in (with exact reason), money transfer, and security event is permanently recorded in simple terms. Records cannot be edited or deleted.'
                  : 'Permanent history of your own administrator sign-ins and actions recorded in plain English.'}
              </p>
              {isSuperAdmin && integrity && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-500 dark:text-gray-400">
                  <span>
                    <strong className="text-gray-700 dark:text-gray-200">{integrity.chainedCount.toLocaleString()}</strong> SHA-256 chained records verified
                  </span>
                  {integrity.legacyCount > 0 && (
                    <span>
                      · <strong className="text-gray-700 dark:text-gray-200">{integrity.legacyCount.toLocaleString()}</strong> earlier pre-chain records preserved
                    </span>
                  )}
                  {integrity.lastHash && (
                    <span className="font-mono text-[11px]">
                      · Latest seal #{integrity.lastSeq}: {integrity.lastHash.slice(0, 12)}…
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
              <Btn variant="secondary" size="sm" onClick={() => void onRefresh()} disabled={busy}>
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                Refresh
              </Btn>
            )}
            <ExportBtn
              label="Export CSV"
              onClick={() =>
                downloadCsv(
                  `chase-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`,
                  [
                    'Seq',
                    'Date & Time',
                    'Status',
                    'Who',
                    'Role',
                    'Category',
                    'What Happened',
                    'Reason (If Failed / Blocked)',
                    'Target',
                    'IP Address',
                    'Device',
                    'SHA-256 Hash',
                  ],
                  filtered.map((e) => [
                    e.seq ?? 'legacy',
                    e.createdAt,
                    (OUTCOME_META[e.outcome || 'success'] || OUTCOME_META.success).label,
                    e.actor,
                    (ACTOR_TYPE_LABEL[e.actorType || 'system'] || ACTOR_TYPE_LABEL.system).label,
                    (CATEGORY_META[e.category || 'system'] || CATEGORY_META.system).label,
                    e.summary || e.action,
                    e.reason || '',
                    e.target?.label || '',
                    e.ip || '',
                    e.userAgent || '',
                    e.entryHash || '',
                  ])
                )
              }
            />
            {isSuperAdmin && (
              <Btn variant="secondary" size="sm" onClick={exportJsonProof}>
                <Download className="w-3.5 h-3.5" />
                JSON Proof
              </Btn>
            )}
          </div>
        </div>
      </Card>

      {/* 4 Plain-English Quick Summary Cards (Click to Filter) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={clearFilters}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer bg-white dark:bg-[#0D1829] ${
            categoryFilter === 'all' && outcomeFilter === 'all'
              ? 'border-[#0B6EFD] ring-2 ring-[#0B6EFD]/15'
              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">Total Activity</span>
            <Activity className="w-4 h-4 text-[#0B6EFD]" />
          </div>
          <div className="mt-1.5 text-[22px] font-bold text-gray-900 dark:text-white">
            {computedStats.total.toLocaleString()}
          </div>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
            {computedStats.last24h.toLocaleString()} events in the last 24 hours
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('failed_blocked');
            setOutcomeFilter('all');
            setPage(1);
          }}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer bg-white dark:bg-[#0D1829] ${
            categoryFilter === 'failed_blocked'
              ? 'border-red-500 ring-2 ring-red-500/15'
              : failedBlockedCount > 0
              ? 'border-red-200 dark:border-red-900/60 hover:border-red-300'
              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">Failed & Blocked</span>
            <ShieldAlert className={`w-4 h-4 ${failedBlockedCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
          </div>
          <div
            className={`mt-1.5 text-[22px] font-bold ${
              failedBlockedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
            }`}
          >
            {failedBlockedCount.toLocaleString()}
          </div>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
            {computedStats.failedCount} failed · {computedStats.blockedCount} blocked (click to inspect)
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('auth');
            setOutcomeFilter('all');
            setPage(1);
          }}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer bg-white dark:bg-[#0D1829] ${
            categoryFilter === 'auth'
              ? 'border-[#0B6EFD] ring-2 ring-[#0B6EFD]/15'
              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">Logins & Security</span>
            <KeyRound className="w-4 h-4 text-violet-500" />
          </div>
          <div className="mt-1.5 text-[22px] font-bold text-gray-900 dark:text-white">
            {computedStats.authEvents.toLocaleString()}
          </div>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
            Sign-ins, password changes, sessions & card reveals
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('money');
            setOutcomeFilter('all');
            setPage(1);
          }}
          className={`text-left rounded-xl border p-4 transition-all cursor-pointer bg-white dark:bg-[#0D1829] ${
            categoryFilter === 'money'
              ? 'border-emerald-500 ring-2 ring-emerald-500/15'
              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">Money & Balances</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-[22px] font-bold text-gray-900 dark:text-white">
            {computedStats.moneyEvents.toLocaleString()}
          </div>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
            Transfers, Zelle, wires, deposits & balance edits
          </p>
        </button>
      </div>

      {/* Main Filterable Audit Table Card */}
      <Card className="overflow-hidden">
        {/* Category Pills */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {categoryPills.map((pill) => {
              const active = categoryFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(pill.id);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? pill.id === 'failed_blocked'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#0B6EFD] text-white'
                      : pill.alert
                      ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/80'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.12]'
                  }`}
                >
                  <span>{pill.label}</span>
                  {pill.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-semibold ${
                        active
                          ? 'bg-white/20 text-white'
                          : pill.alert
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-200/80 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                      }`}
                    >
                      {pill.count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search & Simple Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[230px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <TextInput
                placeholder="Search person, reason, customer, amount, or IP address…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            <SelectInput
              aria-label="Filter by outcome"
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value as 'all' | AuditOutcome);
                setPage(1);
              }}
              className="w-[150px]"
            >
              <option value="all">All Outcomes</option>
              <option value="success">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="warning">Notices / Deletions</option>
            </SelectInput>

            {isSuperAdmin && (
              <SelectInput
                aria-label="Filter by who"
                value={actorTypeFilter}
                onChange={(e) => {
                  setActorTypeFilter(e.target.value as 'all' | AuditActorType);
                  setPage(1);
                }}
                className="w-[175px]"
              >
                <option value="all">Everyone</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Staff Admins</option>
                <option value="auditor">Read-Only Auditors</option>
                <option value="customer">Customers</option>
                <option value="anonymous">Unknown / Visitors</option>
              </SelectInput>
            )}

            <SelectInput
              aria-label="Filter by time range"
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value as TimeRangeFilter);
                setPage(1);
              }}
              className="w-[145px]"
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </SelectInput>

            {hasActiveFilters && (
              <Btn variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="w-3.5 h-3.5" />
                Reset
              </Btn>
            )}
          </div>
        </div>

        {/* Plain-English Event Rows */}
        {paged.length === 0 ? (
          <EmptyState
            title="No audit events match your filters"
            detail={hasActiveFilters ? 'Try clearing one of your filters or broadening the time range.' : 'Activity will appear here automatically as soon as anyone signs in or makes a change.'}
          />
        ) : (
          <TableShell>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                <Th>When</Th>
                <Th>Result</Th>
                <Th>Who</Th>
                <Th>What Happened (Simple Terms)</Th>
                <Th className="text-right">Inspect</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {paged.map((entry) => {
                const outcome = entry.outcome || 'success';
                const outcomeMeta = OUTCOME_META[outcome] || OUTCOME_META.success;
                const actorType = entry.actorType || 'system';
                const actorMeta = ACTOR_TYPE_LABEL[actorType] || ACTOR_TYPE_LABEL.system;
                const category = entry.category || 'system';
                const catMeta = CATEGORY_META[category] || CATEGORY_META.system;
                const chips = getInlineChips(entry);
                const isIssue = outcome === 'failed' || outcome === 'blocked';

                return (
                  <tr
                    key={entry.id}
                    onClick={() => {
                      setSelectedEntry(entry);
                      setShowRawJson(false);
                    }}
                    className={`transition-colors cursor-pointer ${
                      entry.tampered
                        ? 'bg-red-50/80 dark:bg-red-950/30 hover:bg-red-100/70'
                        : isIssue
                        ? 'bg-red-50/30 dark:bg-red-950/15 hover:bg-red-50/60 dark:hover:bg-red-950/25'
                        : 'hover:bg-gray-50/80 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <Td className="whitespace-nowrap align-top">
                      <div className="text-[12.5px] font-medium text-gray-800 dark:text-gray-100">
                        {relTime(entry.createdAt)}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {fmtDateTime(entry.createdAt)}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10.5px] text-gray-400">
                        {entry.chained ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-mono">
                            <Lock className="w-2.5 h-2.5" />#{entry.seq}
                          </span>
                        ) : (
                          <span>Pre-chain</span>
                        )}
                      </div>
                    </Td>

                    <Td className="whitespace-nowrap align-top">
                      <div className="inline-flex items-center gap-1.5">
                        {outcomeMeta.icon}
                        <Badge tone={outcomeMeta.tone}>{outcomeMeta.label}</Badge>
                      </div>
                      <div className="mt-1">
                        <Badge tone={catMeta.tone}>{catMeta.label}</Badge>
                      </div>
                    </Td>

                    <Td className="whitespace-nowrap align-top">
                      <div className="text-[13px] font-semibold text-gray-900 dark:text-white max-w-[190px] truncate">
                        {entry.actor}
                      </div>
                      <div className="mt-0.5">
                        <Badge tone={actorMeta.tone}>{actorMeta.label}</Badge>
                      </div>
                    </Td>

                    <Td className="align-top max-w-[560px]">
                      <div className="text-[13.5px] font-semibold text-gray-900 dark:text-white leading-snug">
                        {getSimpleHeadline(entry)}
                      </div>
                      <p className="text-[12.5px] text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed whitespace-normal">
                        {entry.summary || entry.action}
                      </p>

                      {entry.reason && (
                        <div
                          className={`mt-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug whitespace-normal border ${
                            outcome === 'failed' || outcome === 'blocked'
                              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-200'
                              : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200'
                          }`}
                        >
                          <span className="font-semibold">Why: </span>
                          {entry.reason}
                        </div>
                      )}

                      {chips.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {chips.map((chip, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                chip.tone === 'money'
                                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : chip.tone === 'alert'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300'
                              }`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>

                    <Td className="text-right whitespace-nowrap align-top">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntry(entry);
                          setShowRawJson(false);
                        }}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0B6EFD] hover:underline cursor-pointer"
                      >
                        Details
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        <Pagination
          page={safePage}
          pages={pages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
          noun="audit events"
        />
      </Card>

      {/* Plain-English Event Inspection Drawer */}
      <Drawer
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry ? getSimpleHeadline(selectedEntry) : 'Audit Event'}
        subtitle={
          selectedEntry
            ? `${fmtDateTime(selectedEntry.createdAt)} · ${relTime(selectedEntry.createdAt)}`
            : undefined
        }
        width="max-w-[600px]"
      >
        {selectedEntry && (
          <div className="space-y-5">
            {/* Plain-English Summary */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1">
                  {(OUTCOME_META[selectedEntry.outcome || 'success'] || OUTCOME_META.success).icon}
                  <Badge tone={(OUTCOME_META[selectedEntry.outcome || 'success'] || OUTCOME_META.success).tone}>
                    {(OUTCOME_META[selectedEntry.outcome || 'success'] || OUTCOME_META.success).label}
                  </Badge>
                </span>
                <Badge tone={(CATEGORY_META[selectedEntry.category || 'system'] || CATEGORY_META.system).tone}>
                  {(CATEGORY_META[selectedEntry.category || 'system'] || CATEGORY_META.system).label}
                </Badge>
                {selectedEntry.severity && SEVERITY_LABEL[selectedEntry.severity] && (
                  <Badge tone={SEVERITY_LABEL[selectedEntry.severity].tone}>
                    {SEVERITY_LABEL[selectedEntry.severity].label}
                  </Badge>
                )}
              </div>
              <p className="text-[14px] text-gray-900 dark:text-white leading-relaxed font-medium">
                {selectedEntry.summary || selectedEntry.action}
              </p>
              <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-1.5">
                Event type: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedEntry.action}</span>
              </p>
            </div>

            {/* Highlighted Reason & Recommended Next Step */}
            {(selectedEntry.reason || getActionGuidance(selectedEntry)) && (
              <div
                className={`rounded-xl border p-4 space-y-2 ${
                  selectedEntry.outcome === 'failed' || selectedEntry.outcome === 'blocked'
                    ? 'bg-red-50/80 border-red-200 dark:bg-red-950/35 dark:border-red-900/60'
                    : 'bg-amber-50/80 border-amber-200 dark:bg-amber-950/35 dark:border-amber-900/60'
                }`}
              >
                {selectedEntry.reason && (
                  <div>
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                      Exact Reason
                    </div>
                    <p className="text-[13.5px] font-medium text-gray-900 dark:text-white mt-0.5 leading-relaxed">
                      {selectedEntry.reason}
                    </p>
                  </div>
                )}
                {getActionGuidance(selectedEntry) && (
                  <div className="pt-2 border-t border-black/10 dark:border-white/10">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      What this means for you
                    </div>
                    <p className="text-[12.5px] text-gray-700 dark:text-gray-200 mt-0.5 leading-relaxed">
                      {getActionGuidance(selectedEntry)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* At-a-Glance Who / When / Where Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <UserIcon className="w-3.5 h-3.5" /> Who
                </div>
                <div className="mt-1 text-[13.5px] font-semibold text-gray-900 dark:text-white break-all">
                  {selectedEntry.actor}
                </div>
                <div className="mt-1">
                  <Badge tone={(ACTOR_TYPE_LABEL[selectedEntry.actorType || 'system'] || ACTOR_TYPE_LABEL.system).tone}>
                    {(ACTOR_TYPE_LABEL[selectedEntry.actorType || 'system'] || ACTOR_TYPE_LABEL.system).label}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <Clock className="w-3.5 h-3.5" /> When
                </div>
                <div className="mt-1 text-[13.5px] font-semibold text-gray-900 dark:text-white">
                  {fmtDateTime(selectedEntry.createdAt)}
                </div>
                <div className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {relTime(selectedEntry.createdAt)}
                </div>
              </div>

              {selectedEntry.target?.label && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 sm:col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Affected Account / Person
                  </div>
                  <div className="mt-1 text-[13.5px] font-semibold text-gray-900 dark:text-white">
                    {selectedEntry.target.label}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <Globe className="w-3.5 h-3.5" /> IP Address
                </div>
                <div className="mt-1 text-[13px] font-mono text-gray-900 dark:text-white">
                  {selectedEntry.ip || 'Not recorded (earlier record)'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <Monitor className="w-3.5 h-3.5" /> Browser / Device
                </div>
                <div className="mt-1 text-[13px] text-gray-900 dark:text-white">
                  {selectedEntry.userAgent || 'Not recorded (earlier record)'}
                </div>
              </div>
            </div>

            {/* Readable Key-Value Breakdown */}
            {readableDetails.length > 0 && (
              <div>
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Event Details (Simple Terms)
                </h4>
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {readableDetails.map((row) => (
                    <div key={row.key} className="px-3.5 py-2.5 flex items-start justify-between gap-4 text-[12.5px]">
                      <span className="text-gray-500 dark:text-gray-400 shrink-0">{row.label}</span>
                      <span className="font-medium text-gray-900 dark:text-white text-right break-words">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Immutable Cryptographic Proof */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.02] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Immutable Trail Verification
                </span>
                {selectedEntry.tampered ? (
                  <Badge tone="error">Tamper Detected</Badge>
                ) : selectedEntry.chained ? (
                  <Badge tone="success">SHA-256 Sealed #{selectedEntry.seq}</Badge>
                ) : (
                  <Badge tone="neutral">Pre-Chain Legacy Record</Badge>
                )}
              </div>

              {selectedEntry.chained && selectedEntry.entryHash ? (
                <div className="space-y-1.5 text-[11.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Record Hash</span>
                    <button
                      type="button"
                      onClick={() => void copyHash(selectedEntry.entryHash!)}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-[#0B6EFD] hover:underline cursor-pointer"
                    >
                      {selectedEntry.entryHash.slice(0, 20)}…
                      {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Previous Seal</span>
                    <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300">
                      {selectedEntry.prevHash === 'GENESIS'
                        ? 'GENESIS (First chained record)'
                        : `${String(selectedEntry.prevHash || '').slice(0, 20)}…`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                  This record was created before SHA-256 hash chaining was enabled and is preserved read-only.
                </p>
              )}
            </div>

            {/* Optional Technical Record Disclosure */}
            <div>
              <button
                type="button"
                onClick={() => setShowRawJson((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRawJson ? 'rotate-180' : ''}`} />
                {showRawJson ? 'Hide raw technical record' : 'Show raw technical record'}
              </button>
              {showRawJson && (
                <pre className="mt-2 p-3 rounded-lg bg-gray-900 text-gray-100 text-[11px] font-mono overflow-x-auto max-h-[260px]">
                  {JSON.stringify(selectedEntry, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
