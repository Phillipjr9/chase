/* -------------------------------------------------------------------------- */
/* Chase Admin Simulator — shared types & proxy-safe API client               */
/* -------------------------------------------------------------------------- */
import type { Transaction, User } from '../../banking/store';

export type AdminTab =
  | 'overview'
  | 'users'
  | 'accounts'
  | 'transactions'
  | 'operations'
  | 'wealth'
  | 'messages'
  | 'audit'
  | 'settings';

export type CashflowRange = '7d' | '30d' | '12w';

export interface AdminPermissions {
  createUsers: boolean;
  generateActivity: boolean;
  sendMessages: boolean;
}

export interface AdminCapabilities {
  manageAccounts: boolean;
  editLedger: boolean;
  impersonateUsers: boolean;
  manageCustomerAccess: boolean;
  manageDisputes: boolean;
  publishNotices: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  createUsers: true,
  generateActivity: true,
  sendMessages: true,
};

export const DEFAULT_ADMIN_CAPABILITIES: AdminCapabilities = {
  manageAccounts: true,
  editLedger: true,
  impersonateUsers: true,
  manageCustomerAccess: true,
  manageDisputes: true,
  publishNotices: true,
};

export interface AdminUserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  status: 'active' | 'suspended';
  ownerAdminId?: string | null;
  linkedAdminId?: string | null;
  linkedAdminRole?: 'admin' | 'auditor' | null;
  linkedAdminStatus?: 'active' | 'disabled' | null;
  creditScore?: number;
  createdAt: string;
  accountCount: number;
  transactionCount?: number;
  depositBalance: number;
  cardBalance: number;
  loanBalance?: number;
}

export interface AdminMetrics {
  users: number;
  suspendedUsers: number;
  accounts: number;
  deposits: number;
  cardBalances: number;
  loanBalances?: number;
  scheduledPayments: number;
  openDisputes?: number;
  transactions: number;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAccountRow {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'auditor';
  status: 'active' | 'disabled';
  createdAt?: string;
  protected?: boolean;
  linkedUserId?: string;
  linkedCustomer?: {
    id: string;
    username: string;
    fullName: string;
    email: string;
    status: 'active' | 'suspended';
  } | null;
  lockMessage?: string;
  supportContact?: { email: string; phone: string };
  permissions?: AdminPermissions;
  capabilities?: AdminCapabilities;
  customerCount?: number;
  unreadCount?: number;
  lastActivity?: string | null;
}

export interface GlobalTransaction extends Transaction {
  userId: string;
  username: string;
  fullName: string;
  accountId: string;
  accountName: string;
  accountType: string;
}

export interface GlobalDispute {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  transactionId: string;
  accountId: string;
  accountName?: string;
  description: string;
  amount: number;
  reason: string;
  status: 'open' | 'resolved' | 'denied';
  createdAt: string;
  refundAt?: string;
}

export interface OverviewAnalytics {
  range: CashflowRange;
  cashflow: { label: string; inflow: number; outflow: number }[];
  accountMix: { type: string; label: string; count: number; balance: number; totalBalance?: number }[];
  categorySpend: { category: string; amount: number; count: number }[];
  categories?: { category: string; total: number; count: number }[];
  credit?: {
    totalCreditBalance: number;
    totalCreditLimit: number;
    utilizationPct: number;
  };
  monthlyInflow: number;
  monthlyOutflow: number;
  monthlyTarget: number;
  disputes: GlobalDispute[];
  unreadMessagesCount?: number;
  system?: {
    storageBackend?: string;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
    memoryMb?: { rss: number; heapUsed: number; heapTotal: number };
    activeCustomerSessions: number;
    activeUserSessions?: number;
    activeAdminSessions: number;
    revokedSessionCount?: number;
    auditCount: number;
    dbSizeBytes: number;
    db?: { path: string; sizeBytes: number; mtimeMs: number };
  };
}

export interface SimulatorSettings {
  allowEnrollment: boolean;
  allowCustomerPasswordReset: boolean;
  rootSupportContact?: { email: string; phone: string };
}

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  authToken = ''
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: init.credentials || 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken
        ? {
            Authorization: `Bearer ${authToken}`,
            'X-Chase-Admin-Token': authToken,
          }
        : {}),
      ...((init.headers as Record<string, string> | undefined) || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(
      data.error || `Request failed (${response.status}).`,
      response.status
    );
  }
  return data as T;
}

export function inputDate(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export type { User };
