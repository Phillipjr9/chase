/* -------------------------------------------------------------------------- */
/* Chase Clone — fullstack banking API client + local fallback                */
/* -------------------------------------------------------------------------- */

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  status: 'posted' | 'pending';
  simulated?: boolean;
  disputedAt?: string;
}

export type AccountType = 'checking' | 'savings' | 'credit-card' | 'cd' | 'auto-loan' | 'mortgage';

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  mask: string;
  balance: number;
  creditLimit?: number;
  /** Balance shown on the most recent card statement. */
  statementBalance?: number;
  rewardsPoints?: number;
  apr?: number;
  monthlyPayment?: number;
  locked?: boolean;
  autopay?: boolean;
  nickname?: string;
  isPrimary?: boolean;
  hidden?: boolean;
  favorite?: boolean;
  autopayFromId?: string;
  autopayAmount?: 'minimum' | 'statement' | 'current';
  autopayDay?: number;
  replacedAt?: string;
  replacementReason?: string;
  openedDate?: string;
  transactions: Transaction[];
  createdAt: string;
}

export interface Payee {
  id: string;
  name: string;
  accountNumber: string;
  category: string;
}

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  price: number;
}

export interface InvestmentPortfolio {
  accountMask: string;
  cash: number;
  holdings: Holding[];
}

export interface SecuritySettings {
  twoFactor: boolean;
  loginAlerts: boolean;
  fraudAlerts: boolean;
  paperless: boolean;
}

export interface UserPreferences {
  balanceAlerts: boolean;
  paymentReminders: boolean;
  transactionAlerts: boolean;
  travelAlerts: boolean;
  offerEmails: boolean;
  textAlerts: boolean;
  affiliateSharing: boolean;
  thirdPartyMarketing: boolean;
}

export interface TravelNotice {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  accountId?: string;
}

export type ScheduledKind = 'transfer' | 'bill' | 'card' | 'loan';
export type ScheduledFrequency = 'once' | 'monthly';

export interface ScheduledPayment {
  id: string;
  kind: ScheduledKind;
  /** Human label shown in the scheduled list. */
  label: string;
  fromAccountId: string;
  /** Destination account (transfers), card/loan being paid, or payee id. */
  toAccountId?: string;
  payeeId?: string;
  amount: number;
  date: string;
  frequency: ScheduledFrequency;
  status: 'scheduled' | 'paused' | 'paid' | 'cancelled';
  createdAt: string;
}

export interface CardDispute {
  id: string;
  transactionId: string;
  accountId: string;
  description: string;
  amount: number;
  reason: string;
  status: 'open' | 'resolved' | 'denied';
  createdAt: string;
}

export type CreditFactorStatus = 'excellent' | 'good' | 'fair' | 'needs-work';

export interface CreditFactor {
  id: string;
  label: string;
  status: CreditFactorStatus;
  weight: string;
  detail: string;
}

export interface CreditChange {
  id: string;
  date: string;
  delta: number;
  reason: string;
}

export interface CreditReportAccount {
  name: string;
  type: string;
  status: string;
  balance: number;
  limit: number;
  opened: string;
}

export interface CreditInquiry {
  name: string;
  date: string;
  type: string;
  removed?: boolean;
}

export interface CreditReport {
  pulledAt: string;
  accounts: CreditReportAccount[];
  inquiries: CreditInquiry[];
  publicRecords: string[];
  collections: string[];
}

export interface DarkWebItem {
  id: string;
  email?: string;
  phone?: string;
  source: string;
  foundAt: string;
  status: string;
}

export interface CreditAlert {
  id: string;
  date: string;
  title: string;
  detail: string;
  read: boolean;
}

export interface CreditSimulation {
  id: string;
  scenario: string;
  estimatedScore: number;
  low: number;
  high: number;
  note: string;
  createdAt: string;
}

export interface CreditProfile {
  score: number;
  bureau: string;
  model: string;
  goal: number;
  enrolledAt: string;
  history: { weeksAgo: number; score: number }[];
  factors: CreditFactor[];
  changes: CreditChange[];
  report: CreditReport;
  darkWeb: DarkWebItem[];
  alerts: CreditAlert[];
  simulations?: CreditSimulation[];
}

export interface HomeProperty {
  address: string;
  estimatedValue: number;
  appreciationPct: number;
  monthlyEscrow: number;
  dueDay: number;
}

export interface TravelBooking {
  id: string;
  title: string;
  provider: string;
  brand: 'united' | 'southwest' | 'airbnb';
  dates: string;
  pointsUsed: number;
  status: string;
}

export type SecureMessageCategory = 'general' | 'wire' | 'dispute' | 'security' | 'account';

export interface SecureMessage {
  id: string;
  subject: string;
  category: SecureMessageCategory;
  sender: 'customer' | 'advisor';
  senderName: string;
  body: string;
  createdAt: string;
  readByCustomer: boolean;
  readByAdmin: boolean;
}

export interface AccountNotice {
  id: string;
  tone: 'info' | 'warning' | 'urgent' | 'success';
  title: string;
  message: string;
  dismissible: boolean;
  createdAt: string;
}

export interface CustomChaseOffer {
  id: string;
  merchant: string;
  cashback: string;
  detail: string;
  expires: string;
  activated?: boolean;
}

export interface LinkedAdminSummary {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'auditor';
  status: 'active' | 'disabled';
  permissions?: { createUsers: boolean; generateActivity: boolean; sendMessages: boolean };
  capabilities?: {
    manageAccounts: boolean;
    editLedger: boolean;
    impersonateUsers: boolean;
    manageCustomerAccess: boolean;
    manageDisputes: boolean;
    publishNotices: boolean;
  };
}

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  accounts: Account[];
  payees: Payee[];
  investments?: InvestmentPortfolio;
  security?: SecuritySettings;
  preferences?: UserPreferences;
  travelNotices?: TravelNotice[];
  travelBookings?: TravelBooking[];
  scheduledPayments?: ScheduledPayment[];
  credit?: CreditProfile;
  disputes?: CardDispute[];
  home?: HomeProperty | null;
  budgets?: Record<string, number>;
  messages?: SecureMessage[];
  accountNotice?: AccountNotice | null;
  customOffers?: CustomChaseOffer[];
  status?: 'active' | 'suspended';
  adminCreated?: boolean;
  ownerAdminId?: string | null;
  linkedAdmin?: LinkedAdminSummary | null;
  createdAt: string;
}

export type ProductId =
  | 'total-checking'
  | 'secure-banking'
  | 'business-checking'
  | 'savings'
  | 'sapphire'
  | 'sapphire-reserve'
  | 'freedom'
  | 'freedom-flex'
  | 'ink-unlimited'
  | 'ink-preferred'
  | 'ink-cash';

export interface ProductInfo {
  id: ProductId;
  name: string;
  type: AccountType;
  tagline: string;
  bonus?: string;
  creditLimit?: number;
  apr?: number;
}

export const MARKET_QUOTES = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', price: 548.20, changePct: 0.84 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 264.50, changePct: 1.22 },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 229.40, changePct: 0.56 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 446.80, changePct: 1.05 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 512.15, changePct: 0.92 },
  { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', price: 58.90, changePct: 0.31 },
];

export const PRODUCTS: ProductInfo[] = [
  {
    id: 'total-checking',
    name: 'Chase Total Checking®',
    type: 'checking',
    tagline: 'Everyday checking with more than 14,000 ATMs and 5,000 branches.',
    bonus: 'Enjoy $400 as a new customer',
  },
  {
    id: 'secure-banking',
    name: 'Chase Secure Banking℠',
    type: 'checking',
    tagline: 'No overdraft fees. $0 monthly service fee for customers aged 17–24.',
    bonus: 'Get $175 as a new customer',
  },
  {
    id: 'business-checking',
    name: 'Chase Business Complete Banking®',
    type: 'checking',
    tagline: 'Built-in card payments with QuickAccept℠ and same-day deposits.',
    bonus: 'Earn $300 as a new customer',
  },
  {
    id: 'savings',
    name: 'Chase Savings℠',
    type: 'savings',
    tagline: 'Grow your savings with Autosave and FDIC-insured deposits.',
    bonus: 'Autosave starting at $1/day',
  },
  {
    id: 'sapphire',
    name: 'Chase Sapphire Preferred®',
    type: 'credit-card',
    tagline: '60,000 bonus points and 5x on travel purchased through Chase Travel℠.',
    creditLimit: 12000,
    apr: 21.49,
  },
  {
    id: 'sapphire-reserve',
    name: 'Chase Sapphire Reserve®',
    type: 'credit-card',
    tagline: '$300 Annual Travel Credit, Sapphire Lounges & 10x on Chase Travel hotels.',
    creditLimit: 25000,
    apr: 22.49,
  },
  {
    id: 'freedom',
    name: 'Chase Freedom Unlimited®',
    type: 'credit-card',
    tagline: 'Unlimited 1.5% cash back or more on all purchases, $0 annual fee.',
    creditLimit: 5000,
    apr: 19.99,
  },
  {
    id: 'freedom-flex',
    name: 'Chase Freedom Flex®',
    type: 'credit-card',
    tagline: '5% cash back on rotating quarterly categories, 3% on dining & drugstores.',
    creditLimit: 6500,
    apr: 20.49,
  },
  {
    id: 'ink-unlimited',
    name: 'Chase Ink Business Unlimited®',
    type: 'credit-card',
    tagline: 'Unlimited 1.5% cash back on every business purchase, $0 annual fee.',
    creditLimit: 15000,
    apr: 18.49,
  },
  {
    id: 'ink-preferred',
    name: 'Chase Ink Business Preferred®',
    type: 'credit-card',
    tagline: '100,000 bonus points & 3x on travel, shipping, internet and ads.',
    creditLimit: 25000,
    apr: 21.24,
  },
  {
    id: 'ink-cash',
    name: 'Chase Ink Business Cash®',
    type: 'credit-card',
    tagline: '5% cash back on office supplies, internet, cable & phone services.',
    creditLimit: 12000,
    apr: 18.49,
  },
];

/* ------------------------------ Pure helpers ------------------------------ */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function mask4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Account types that can fund a payment. Mirrors the server-side rule. */
export const DEPOSIT_TYPES = new Set<AccountType>(['checking', 'savings', 'cd']);

export function nextDueDate(dueDay: number): string {
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (due < now) due.setMonth(due.getMonth() + 1);
  return due.toISOString().slice(0, 10);
}

export function fmtDueDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function defaultInvestments(): InvestmentPortfolio {
  return {
    accountMask: '7192',
    cash: 2450.0,
    holdings: [
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', shares: 24, avgCost: 492.10, price: 548.20 },
      { symbol: 'JPM', name: 'JPMorgan Chase & Co.', shares: 30, avgCost: 218.40, price: 264.50 },
      { symbol: 'AAPL', name: 'Apple Inc.', shares: 18, avgCost: 196.00, price: 229.40 },
      { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', shares: 65, avgCost: 56.10, price: 58.90 },
    ],
  };
}

export function defaultSecurity(): SecuritySettings {
  return {
    twoFactor: true,
    loginAlerts: true,
    fraudAlerts: true,
    paperless: true,
  };
}

export function defaultCredit(): CreditProfile {
  const history = [
    { weeksAgo: 11, score: 764 },
    { weeksAgo: 10, score: 767 },
    { weeksAgo: 9, score: 765 },
    { weeksAgo: 8, score: 770 },
    { weeksAgo: 7, score: 772 },
    { weeksAgo: 6, score: 771 },
    { weeksAgo: 5, score: 775 },
    { weeksAgo: 4, score: 778 },
    { weeksAgo: 3, score: 776 },
    { weeksAgo: 2, score: 780 },
    { weeksAgo: 1, score: 788 },
    { weeksAgo: 0, score: 782 },
  ];
  return {
    score: 782,
    bureau: 'Experian',
    model: 'VantageScore® 3.0',
    goal: 800,
    enrolledAt: daysAgoIso(140),
    history,
    factors: [
      { id: 'payment-history', label: 'Payment history', status: 'good', weight: 'Extremely influential', detail: 'No late payments appear in this sample credit file.' },
      { id: 'credit-utilization', label: 'Credit utilization', status: 'good', weight: 'Highly influential', detail: 'Reported revolving utilization is about 8%.' },
      { id: 'balances', label: 'Balances', status: 'fair', weight: 'Moderately influential', detail: 'Reported card balances increased $120 since the prior update.' },
      { id: 'credit-history', label: 'Credit history', status: 'good', weight: 'Highly influential', detail: 'Your oldest reported account is about 6 years old.' },
      { id: 'credit-checks', label: 'Recent credit behavior', status: 'good', weight: 'Less influential', detail: '1 hard inquiry in the past 12 months; none in the past 6 months.' },
      { id: 'available-credit', label: 'Available credit', status: 'good', weight: 'Less influential', detail: '$17,917 available across 2 open cards in this sample file.' },
    ],
    changes: [
      { id: 'chg-latest', date: daysAgoIso(6), delta: -6, reason: 'Card balance increased by $120 this week.' },
      { id: 'chg-prev', date: daysAgoIso(13), delta: 8, reason: 'Your Target balance decreased by $89.99.' },
      { id: 'chg-prior', date: daysAgoIso(20), delta: 2, reason: 'On-time payment reported by Chase.' },
    ],
    report: {
      pulledAt: daysAgoIso(3),
      accounts: [
        { name: 'Chase Sapphire Preferred®', type: 'Credit card', status: 'Open', balance: 1240.55, limit: 12000, opened: daysAgoIso(300) },
        { name: 'Chase Freedom Unlimited®', type: 'Credit card', status: 'Open', balance: 342.18, limit: 7500, opened: daysAgoIso(210) },
        { name: 'Student loan — serviced by Navient', type: 'Installment', status: 'Closed', balance: 0, limit: 0, opened: daysAgoIso(2200) },
      ],
      inquiries: [
        { name: 'Chase Card Services', date: daysAgoIso(210), type: 'Hard inquiry' },
        { name: 'Capital One', date: daysAgoIso(190), type: 'Removed', removed: true },
      ],
      publicRecords: [],
      collections: [],
    },
    darkWeb: [
      { id: 'dw-1', email: 'a***@example.com', source: 'Retail data breach', foundAt: daysAgoIso(80), status: 'Monitoring' },
      { id: 'dw-2', phone: '(212) 555-0147', source: 'Marketing list exposure', foundAt: daysAgoIso(340), status: 'Resolved' },
    ],
    alerts: [
      { id: 'ca-1', date: daysAgoIso(6), title: 'Balance increased', detail: 'Sapphire Preferred balance rose $120.', read: false },
      { id: 'ca-2', date: daysAgoIso(13), title: 'Score increased 8 points', detail: 'A card balance decreased.', read: false },
    ],
    simulations: [],
  };
}

export function defaultHome(): HomeProperty {
  return {
    address: '350 Fifth Avenue, Apt 22B, New York, NY 10118',
    estimatedValue: 815000,
    appreciationPct: 4.2,
    monthlyEscrow: 964,
    dueDay: 1,
  };
}

export function defaultPreferences(): UserPreferences {
  return {
    balanceAlerts: true,
    paymentReminders: true,
    transactionAlerts: false,
    travelAlerts: true,
    offerEmails: false,
    textAlerts: false,
    affiliateSharing: false,
    thirdPartyMarketing: false,
  };
}

export function defaultBudgets(): Record<string, number> {
  return {
    Groceries: 400,
    Dining: 250,
    Travel: 600,
    Shopping: 350,
    Bills: 300,
    Transportation: 200,
    Subscriptions: 60,
  };
}

/* ------------------------------ API client -------------------------------- */

const TOKEN_KEY = 'chase_clone_token_v1';
const USERS_KEY = 'chase_clone_users_v2';
const SESSION_KEY = 'chase_clone_session_v2';
export const ADMIN_TOKEN_KEY = 'chase_sim_admin_token';

function readCustomerToken(): string | null {
  try {
    const v = localStorage.getItem(TOKEN_KEY);
    if (v) return v;
  } catch {
    /* localStorage unavailable */
  }
  try {
    const v = sessionStorage.getItem(TOKEN_KEY);
    if (v) return v;
  } catch {
    /* sessionStorage unavailable */
  }
  return null;
}

let token: string | null = readCustomerToken();

function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function readAdminToken(): string {
  try {
    const s = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (s) return s;
  } catch {
    /* unavailable */
  }
  try {
    const l = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (l) return l;
  } catch {
    /* unavailable */
  }
  return '';
}

export function writeAdminToken(t: string | null): void {
  try {
    if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* unavailable */
  }
  try {
    if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* unavailable */
  }
}

function clearUserSessionState(preserveAdmin = false) {
  setToken(null);
  setLocalSession(null);
  if (!preserveAdmin) writeAdminToken(null);
}

export function adoptSessionToken(sessionToken: string): void {
  setToken(sessionToken);
}

let apiMode: boolean | null = null;

async function detectApi(): Promise<boolean> {
  if (apiMode === true) return true;
  try {
    const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (data && data.status === 'ok') {
      apiMode = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function sortTransactionsDesc(list: Transaction[] | undefined | null): Transaction[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const ta = new Date(a?.date || 0).getTime();
    const tb = new Date(b?.date || 0).getTime();
    if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
    return String(b?.date || '').localeCompare(String(a?.date || ''));
  });
}

interface ApiError extends Error {
  status?: number;
}

const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/rates',
  '/api/locations',
  '/api/offers',
  '/api/seed',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/check-username',
  '/api/auth/reset-password',
];

function withCustomerTokenParam(path: string, tok: string | null): string {
  if (!tok || !path.startsWith('/api/') || path.startsWith('/api/admin/')) return path;
  if (PUBLIC_API_PREFIXES.some((p) => path.startsWith(p))) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}_st=${encodeURIComponent(tok)}`;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const activeToken = token || readCustomerToken();
  if (activeToken && !token) token = activeToken;
  const url = withCustomerTokenParam(path, activeToken);
  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: options.credentials || 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(activeToken
        ? {
            Authorization: `Bearer ${activeToken}`,
            'X-Chase-Token': activeToken,
          }
        : {}),
      ...((options.headers as Record<string, string> | undefined) || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (
      res.status === 401 &&
      activeToken &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/reset-password') &&
      !path.startsWith('/api/auth/me')
    ) {
      try {
        const sessionCheck = await fetch(withCustomerTokenParam('/api/auth/me', activeToken), {
          credentials: 'same-origin',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'X-Chase-Token': activeToken,
          },
        });
        if (sessionCheck.status === 401 || sessionCheck.status === 403) {
          setToken(null);
          setLocalSession(null);
          window.dispatchEvent(new CustomEvent('chase:session-expired'));
        }
      } catch {
        // A temporary network failure is not proof that the session expired.
      }
    }
    const err = new Error(data.error || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ------------------------- Local fallback storage ------------------------- */

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as User[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: User[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* storage unavailable */
  }
}

export function persistUser(updated: User): void {
  const users = loadUsers().map((u) => (u.id === updated.id ? updated : u));
  saveUsers(users);
}

function getLocalSessionUser(): User | null {
  try {
    const sid = localStorage.getItem(SESSION_KEY);
    if (!sid) return null;
    return loadUsers().find((u) => u.id === sid) || null;
  } catch {
    return null;
  }
}

function setLocalSession(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

function findUserByUsernameLocal(username: string): User | undefined {
  const needle = username.trim().toLowerCase();
  return loadUsers().find((u) => u.username.toLowerCase() === needle);
}

function buildAccount(product: ProductInfo, openingDeposit: number): Account {
  const isCard = product.type === 'credit-card';
  const account: Account = {
    id: uid(),
    type: product.type,
    name: product.name,
    mask: mask4(),
    balance: isCard ? 0 : round2(openingDeposit),
    creditLimit: product.creditLimit,
    apr: product.apr,
    rewardsPoints: isCard ? 0 : undefined,
    locked: false,
    autopay: false,
    transactions: [],
    createdAt: new Date().toISOString(),
  };
  if (!isCard && openingDeposit > 0) {
    account.transactions.push({
      id: uid(),
      date: new Date().toISOString(),
      description: 'Opening deposit',
      amount: round2(openingDeposit),
      category: 'Deposit',
      status: 'posted',
    });
  }
  return account;
}

function hydrateDefaults(user: User | null | undefined): User {
  if (!user || typeof user !== 'object') {
    throw new Error('Your session data could not be loaded. Please sign in again.');
  }
  return {
    ...user,
    accounts: Array.isArray(user.accounts)
      ? user.accounts.map((acc) => ({
          ...acc,
          transactions: sortTransactionsDesc(acc.transactions),
        }))
      : [],
    investments: user.investments || defaultInvestments(),
    security: user.security || defaultSecurity(),
    preferences: user.preferences || defaultPreferences(),
    budgets: user.budgets || defaultBudgets(),
    credit: user.credit || defaultCredit(),
    travelNotices: user.travelNotices || [],
    travelBookings: user.travelBookings || [],
    scheduledPayments: user.scheduledPayments || [],
    disputes: user.disputes || [],
    home: user.home ?? null,
  };
}

/* --------------------------- Exported async API --------------------------- */

export async function fetchSupportInbox(): Promise<{ messages: SecureMessage[]; supportContact: { email: string; phone: string } | null }> {
  if (!(await detectApi())) throw new Error('Support inbox requires the server connection.');
  return apiFetch('/api/messages', { method: 'GET' });
}

export async function seedSampleUserIfNeeded(): Promise<void> {
  // Demo identities are not provisioned automatically.
}

export async function fetchMe(): Promise<User | null> {
  const tokenBefore = token || readCustomerToken();
  if (await detectApi()) {
    if ((token || readCustomerToken()) !== tokenBefore) return null;
    try {
      const data = await apiFetch('/api/auth/me', { method: 'GET' });
      if ((token || readCustomerToken()) !== tokenBefore) return null;
      if (data.token) setToken(data.token);
      const u = hydrateDefaults(data.user as User);
      if (data.linkedAdmin) u.linkedAdmin = data.linkedAdmin as LinkedAdminSummary;
      return u;
    } catch (e) {
      const err = e as ApiError;
      if ((err.status === 401 || err.status === 403) && (token || readCustomerToken()) === tokenBefore) {
        setToken(null);
      }
      return null;
    }
  }
  if ((token || readCustomerToken()) !== tokenBefore) return null;
  const u = getLocalSessionUser();
  return u ? hydrateDefaults(u) : null;
}

export async function switchToAdmin(): Promise<{
  admin: { username: string; label: string; role: 'admin' | 'auditor'; isSuperAdmin?: boolean; linkedUserId?: string | null };
  token: string;
}> {
  if (!(await detectApi())) throw new Error('Administrator console requires the server connection.');
  const data = await apiFetch('/api/auth/switch-to-admin', { method: 'POST', body: JSON.stringify({}) });
  if (data.token) writeAdminToken(data.token);
  return { admin: data.admin, token: data.token };
}

export async function authenticate(
  username: string,
  password: string
): Promise<
  | { user: User; linkedAdmin?: LinkedAdminSummary | null }
  | { admin: { username: string; label: string; role?: 'admin' | 'auditor'; isSuperAdmin?: boolean }; token: string }
  | { error: string }
> {
  if (await detectApi()) {
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (data.admin) {
        setToken(null);
        writeAdminToken(data.token);
        return { admin: data.admin, token: data.token };
      }
      setToken(data.token);
      const hydrated = hydrateDefaults(data.user as User);
      if (data.linkedAdmin) hydrated.linkedAdmin = data.linkedAdmin as LinkedAdminSummary;
      return { user: hydrated, linkedAdmin: (data.linkedAdmin as LinkedAdminSummary) || null };
    } catch (e) {
      const err = e as ApiError;
      if (err.status && err.status >= 400 && err.status < 500) return { error: err.message };
      throw err;
    }
  }
  const user = findUserByUsernameLocal(username);
  if (!user) {
    return {
      error: "We don't recognize this username. Please check your username or enroll in Chase Online.",
    };
  }
  if (user.password !== password) {
    return { error: 'The username or password you entered is incorrect. Please try again.' };
  }
  setLocalSession(user.id);
  return { user: hydrateDefaults(user) };
}

export async function logout(preserveAdmin = false): Promise<void> {
  if (await detectApi()) {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local customer state even if backend token was already expired.
    }
    clearUserSessionState(preserveAdmin);
    return;
  }
  clearUserSessionState(preserveAdmin);
}

export async function resetPassword(
  username: string,
  email: string,
  newPassword: string
): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, email, newPassword }),
    });
    setToken(null);
    return;
  }
  const users = loadUsers();
  const idx = users.findIndex((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  const user = idx >= 0 ? users[idx] : null;
  if (!user || user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error("We couldn't verify that username and email. Check them and try again.");
  }
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
  users[idx] = { ...user, password: newPassword };
  saveUsers(users);
  setLocalSession(null);
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  if (await detectApi()) {
    const data = await apiFetch(
      `/api/auth/check-username?username=${encodeURIComponent(username)}`,
      { method: 'GET' }
    );
    return !!data.taken;
  }
  return !!findUserByUsernameLocal(username);
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  ssnLast4: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  username: string;
  password: string;
  product: ProductId;
  openingDeposit: number;
}

export async function createUser(input: RegisterInput): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setToken(data.token);
    return hydrateDefaults(data.user as User);
  }
  const product = PRODUCTS.find((p) => p.id === input.product) as ProductInfo;
  const user: User = {
    id: uid(),
    username: input.username.trim(),
    password: input.password,
    fullName: `${input.firstName.trim()} ${input.lastName.trim()}`,
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: `${input.address.trim()}, ${input.city.trim()}, ${input.state.trim()} ${input.zip.trim()}`,
    accounts: [buildAccount(product, input.openingDeposit)],
    payees: [],
    investments: defaultInvestments(),
    security: defaultSecurity(),
    preferences: defaultPreferences(),
    credit: defaultCredit(),
    travelNotices: [],
    travelBookings: [],
    scheduledPayments: [],
    disputes: [],
    home: null,
    createdAt: new Date().toISOString(),
  };
  const users = loadUsers();
  users.push(user);
  saveUsers(users);
  setLocalSession(user.id);
  return user;
}

export async function addAccountToUser(
  userId: string,
  productId: ProductId,
  openingDeposit: number
): Promise<User | null> {
  if (await detectApi()) {
    const data = await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ product: productId, openingDeposit }),
    });
    return hydrateDefaults(data.user as User);
  }
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  const product = PRODUCTS.find((p) => p.id === productId) as ProductInfo;
  const updated: User = hydrateDefaults(JSON.parse(JSON.stringify(users[idx])));
  updated.accounts.push(buildAccount(product, openingDeposit));
  users[idx] = updated;
  saveUsers(users);
  return updated;
}

function requireLocalUser(): User {
  const user = getLocalSessionUser();
  if (!user) throw new Error('Not signed in');
  return hydrateDefaults(user);
}

export async function transferFunds(
  fromId: string,
  toId: string,
  amount: number,
  memo: string
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/transfers', {
      method: 'POST',
      body: JSON.stringify({ fromId, toId, amount, memo }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const from = updated.accounts.find((a) => a.id === fromId);
  const to = updated.accounts.find((a) => a.id === toId);
  if (!from || !to) throw new Error('Account not found.');
  if (from.id === to.id) throw new Error('Choose two different accounts.');
  if (amount > from.balance) throw new Error('Insufficient funds in the "from" account.');
  from.balance = round2(from.balance - amount);
  to.balance = round2(to.balance + amount);
  const suffix = memo ? ` — ${memo}` : '';
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Transfer to ${to.name}${suffix}`,
    amount: -amount,
    category: 'Transfer',
    status: 'posted',
  });
  to.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Transfer from ${from.name}${suffix}`,
    amount,
    category: 'Transfer',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export async function addPayee(
  name: string,
  accountNumber: string,
  category: string
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/payees', {
      method: 'POST',
      body: JSON.stringify({ name, accountNumber, category }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.payees.push({
    id: uid(),
    name,
    accountNumber: `•••• ${accountNumber.trim().slice(-4)}`,
    category,
  });
  persistUser(updated);
  return updated;
}

export async function payBill(payeeId: string, fromId: string, amount: number): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/billpay', {
      method: 'POST',
      body: JSON.stringify({ payeeId, fromId, amount }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const payee = updated.payees.find((p) => p.id === payeeId);
  const from = updated.accounts.find((a) => a.id === fromId);
  if (!payee || !from) throw new Error('Payee or account not found.');
  if (amount > from.balance) throw new Error('Insufficient funds in the selected account.');
  from.balance = round2(from.balance - amount);
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Payment to ${payee.name}`,
    amount: -amount,
    category: 'Bill pay',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export async function sendZelle(to: string, amount: number, memo: string): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/zelle', {
      method: 'POST',
      body: JSON.stringify({ to, amount, memo }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const from = updated.accounts.find((a) => a.type === 'checking');
  if (!from) throw new Error('You need a checking account to send money with Zelle®.');
  if (amount > from.balance) throw new Error('Insufficient funds in your checking account.');
  from.balance = round2(from.balance - amount);
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Zelle payment to ${to}${memo ? ` — ${memo}` : ''}`,
    amount: -amount,
    category: 'Zelle',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export async function payCard(cardId: string, fromId: string, amount: number): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/cards/pay', {
      method: 'POST',
      body: JSON.stringify({ cardId, fromId, amount }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const card = updated.accounts.find((a) => a.id === cardId && a.type === 'credit-card');
  const from = updated.accounts.find((a) => a.id === fromId);
  if (!card || !from) throw new Error('Card or account not found.');
  if (amount > card.balance) {
    throw new Error(`Amount exceeds your current balance of ${fmtMoney(card.balance)}.`);
  }
  if (amount > from.balance) throw new Error('Insufficient funds in the selected account.');
  from.balance = round2(from.balance - amount);
  card.balance = round2(card.balance - amount);
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Payment to ${card.name}`,
    amount: -amount,
    category: 'Credit card payment',
    status: 'posted',
  });
  card.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: 'Payment received — thank you',
    amount: -amount,
    category: 'Payment',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export async function applyAutoLoan(
  price: number,
  downPayment: number,
  term: number
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/auto/apply', {
      method: 'POST',
      body: JSON.stringify({ price, downPayment, term }),
    });
    return hydrateDefaults(data.user as User);
  }
  const loan = price - downPayment;
  if (loan <= 0) throw new Error('Vehicle price must be greater than the down payment.');
  const APR = 6.9;
  const r = APR / 100 / 12;
  const monthly = (loan * r) / (1 - Math.pow(1 + r, -term));
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.accounts.push({
    id: uid(),
    type: 'auto-loan',
    name: 'Chase Auto Loan',
    mask: mask4(),
    balance: loan,
    apr: APR,
    monthlyPayment: round2(monthly),
    transactions: [
      {
        id: uid(),
        date: new Date().toISOString(),
        description: 'Vehicle purchase financed',
        amount: loan,
        category: 'Loan',
        status: 'posted',
      },
    ],
    createdAt: new Date().toISOString(),
  });
  persistUser(updated);
  return updated;
}

export async function depositCheck(
  accountId: string,
  amount: number,
  checkNumber: string
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/deposit', {
      method: 'POST',
      body: JSON.stringify({ accountId, amount, checkNumber }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const acct = updated.accounts.find((a) => a.id === accountId);
  if (!acct) throw new Error('Account not found.');
  acct.balance = round2(acct.balance + amount);
  acct.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `QuickDeposit℠ Check #${checkNumber || '1042'}`,
    amount: round2(amount),
    category: 'Deposit',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export async function sendWire(
  fromId: string,
  recipient: string,
  routingNumber: string,
  amount: number,
  wireType: 'domestic' | 'international'
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/wires', {
      method: 'POST',
      body: JSON.stringify({ fromId, recipient, routingNumber, amount, wireType }),
    });
    return hydrateDefaults(data.user as User);
  }
  const fee = wireType === 'international' ? 40 : 25;
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const from = updated.accounts.find((a) => a.id === fromId);
  if (!from) throw new Error('Source account not found.');
  if (amount + fee > from.balance) throw new Error(`Insufficient funds (includes $${fee} wire fee).`);
  from.balance = round2(from.balance - amount - fee);
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Outgoing ${wireType === 'international' ? 'Intl' : 'Domestic'} Wire to ${recipient}`,
    amount: -round2(amount),
    category: 'Wire',
    status: 'posted',
  });
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: 'Wire transfer fee',
    amount: -fee,
    category: 'Fee',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export interface CardControlPatch {
  locked?: boolean;
  autopay?: boolean;
  autopayFromId?: string;
  autopayAmount?: 'minimum' | 'statement' | 'current';
  autopayDay?: number;
}

export async function updateCardControls(
  accountId: string,
  patch: CardControlPatch
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/cards/controls', {
      method: 'POST',
      body: JSON.stringify({ accountId, ...patch }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const acct = updated.accounts.find((a) => a.id === accountId);
  if (!acct) throw new Error('Account not found.');
  if (typeof patch.locked === 'boolean') acct.locked = patch.locked;
  if (typeof patch.autopay === 'boolean') acct.autopay = patch.autopay;
  if (patch.autopayFromId) {
    const from = updated.accounts.find((a) => a.id === patch.autopayFromId && DEPOSIT_TYPES.has(a.type));
    if (!from) throw new Error('Choose an eligible autopay account.');
    acct.autopayFromId = from.id;
  }
  if (patch.autopayAmount) acct.autopayAmount = patch.autopayAmount;
  if (typeof patch.autopayDay === 'number') {
    acct.autopayDay = Math.min(28, Math.max(1, Math.round(patch.autopayDay)));
  }
  persistUser(updated);
  return updated;
}

export async function revealCardNumber(
  cardId: string,
  password: string
): Promise<{ cardNumber: string; expiry: string; cvv: string }> {
  if (await detectApi()) {
    const data = await apiFetch('/api/cards/reveal', {
      method: 'POST',
      body: JSON.stringify({ cardId, password }),
    });
    return { cardNumber: data.cardNumber, expiry: data.expiry, cvv: data.cvv };
  }
  const user = requireLocalUser();
  const card = user.accounts.find((a) => a.id === cardId && a.type === 'credit-card');
  if (!card) throw new Error('Card not found.');
  if (user.password !== password) throw new Error('That password is incorrect.');
  return { cardNumber: `4117 8234 5690 ${card.mask}`, expiry: '08/29', cvv: '482' };
}

export async function replaceCard(
  cardId: string,
  reason: 'lost' | 'stolen' | 'damaged' | 'not-received'
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/cards/replace', {
      method: 'POST',
      body: JSON.stringify({ cardId, reason }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const card = updated.accounts.find((a) => a.id === cardId && a.type === 'credit-card');
  if (!card) throw new Error('Card not found.');
  card.mask = mask4();
  card.locked = true;
  card.replacedAt = new Date().toISOString();
  card.replacementReason = reason;
  persistUser(updated);
  return updated;
}

export async function disputeTransaction(
  accountId: string,
  transactionId: string,
  reason: string
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/cards/dispute', {
      method: 'POST',
      body: JSON.stringify({ accountId, transactionId, reason }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const account = updated.accounts.find((a) => a.id === accountId && a.type === 'credit-card');
  if (!account) throw new Error('Card account not found.');
  const transaction = account.transactions.find((t) => t.id === transactionId);
  if (!transaction) throw new Error('Transaction not found.');
  if (transaction.amount <= 0) throw new Error('Only purchases can be disputed.');
  if (!Array.isArray(updated.disputes)) updated.disputes = [];
  if (updated.disputes.some((d) => d.transactionId === transaction.id && d.status === 'open')) {
    throw new Error('This transaction already has an open dispute.');
  }
  updated.disputes.unshift({
    id: uid(),
    transactionId: transaction.id,
    accountId: account.id,
    description: transaction.description,
    amount: transaction.amount,
    reason,
    status: 'open',
    createdAt: new Date().toISOString(),
  });
  transaction.disputedAt = new Date().toISOString();
  persistUser(updated);
  return updated;
}

export async function tradeInvestment(
  symbol: string,
  side: 'buy' | 'sell',
  shares: number
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/investments/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol, side, shares }),
    });
    return hydrateDefaults(data.user as User);
  }
  const quote = MARKET_QUOTES.find((q) => q.symbol === symbol);
  if (!quote) throw new Error('Invalid symbol.');
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  if (!updated.investments) updated.investments = defaultInvestments();
  const total = round2(shares * quote.price);
  const existing = updated.investments.holdings.find((h) => h.symbol === symbol);
  if (side === 'buy') {
    if (total > updated.investments.cash) {
      throw new Error(`Insufficient buying power (${fmtMoney(updated.investments.cash)} available).`);
    }
    updated.investments.cash = round2(updated.investments.cash - total);
    if (existing) {
      const newShares = round2(existing.shares + shares);
      existing.avgCost = round2((existing.shares * existing.avgCost + total) / newShares);
      existing.shares = newShares;
    } else {
      updated.investments.holdings.push({
        symbol,
        name: quote.name,
        shares: round2(shares),
        avgCost: quote.price,
        price: quote.price,
      });
    }
  } else {
    if (!existing || shares > existing.shares) {
      throw new Error(`You don't hold ${shares} shares of ${symbol}.`);
    }
    updated.investments.cash = round2(updated.investments.cash + total);
    existing.shares = round2(existing.shares - shares);
    if (existing.shares <= 0) {
      updated.investments.holdings = updated.investments.holdings.filter((h) => h.symbol !== symbol);
    }
  }
  persistUser(updated);
  return updated;
}

export async function redeemPoints(payload: {
  cardId: string;
  points: number;
  kind: 'travel' | 'transfer' | 'cashback';
  title?: string;
  provider?: string;
  brand?: 'united' | 'southwest' | 'airbnb';
  dates?: string;
}): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/travel/redeem', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return hydrateDefaults(data.user as User);
  }
  if (!Number.isInteger(payload.points) || payload.points < 1000 || payload.points > 1000000 || !['travel', 'transfer', 'cashback'].includes(payload.kind)) {
    throw new Error('Enter a valid redemption of at least 1,000 Ultimate Rewards® points.');
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const card = updated.accounts.find((a) => a.id === payload.cardId && a.type === 'credit-card');
  if (!card || (card.rewardsPoints || 0) < payload.points) {
    throw new Error('Not enough Ultimate Rewards® points on selected card.');
  }
  card.rewardsPoints = (card.rewardsPoints || 0) - payload.points;
  if (!updated.travelBookings) updated.travelBookings = [];
  if (payload.kind === 'cashback') {
    const credit = round2(payload.points / 100);
    card.balance = round2(card.balance - credit);
    card.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Ultimate Rewards® Cash Back (${payload.points.toLocaleString()} pts)`,
      amount: -credit,
      category: 'Rewards',
      status: 'posted',
    });
  } else {
    updated.travelBookings.unshift({
      id: uid(),
      title: payload.title || 'Chase Travel℠ Booking',
      provider: payload.provider || 'Chase Travel℠',
      brand: payload.brand || 'united',
      dates: payload.dates || 'Flexible dates · 2026',
      pointsUsed: payload.points,
      status: payload.kind === 'transfer' ? 'Transferred 1:1' : 'Confirmed',
    });
  }
  persistUser(updated);
  return updated;
}

export async function simulateCredit(scenario: string): Promise<{
  estimatedScore: number;
  low: number;
  high: number;
  note: string;
  user: User;
}> {
  if (await detectApi()) {
    const data = await apiFetch('/api/credit/simulate', {
      method: 'POST',
      body: JSON.stringify({ scenario, simulate: true }),
    });
    return {
      estimatedScore: data.estimatedScore,
      low: data.low,
      high: data.high,
      note: data.note,
      user: hydrateDefaults(data.user as User),
    };
  }
  const user = requireLocalUser();
  const credit = user.credit || defaultCredit();
  const estimates: Record<string, { low: number; high: number; note: string }> = {
    'pay-down': { low: 8, high: 20, note: 'Paying revolving balances down can help your utilization.' },
    'new-card': { low: -12, high: -5, note: 'A new card adds a hard inquiry and lowers your average account age.' },
    'missed-payment': { low: -95, high: -60, note: 'A 30-day late payment is a serious negative mark.' },
    'higher-limit': { low: 3, high: 11, note: 'A higher limit can lower utilization if balances stay the same.' },
    'close-oldest': { low: -20, high: -6, note: 'Closing your oldest account shortens your credit history.' },
    inquiry: { low: -7, high: -2, note: 'A single hard inquiry has a small, temporary effect.' },
  };
  const estimate = estimates[scenario];
  if (!estimate) throw new Error('Choose a valid credit scenario.');
  const clamp = (n: number) => Math.min(850, Math.max(300, n));
  const result = {
    low: clamp(credit.score + estimate.low),
    high: clamp(credit.score + estimate.high),
    note: `${estimate.note} Estimate only — results are directional, not a forecast.`,
  };
  const updated: User = JSON.parse(JSON.stringify(user));
  updated.credit = {
    ...credit,
    simulations: [
      { id: uid(), scenario, estimatedScore: result.high, low: result.low, high: result.high, note: result.note, createdAt: new Date().toISOString() },
      ...(credit.simulations || []),
    ].slice(0, 12),
  };
  persistUser(updated);
  return { ...result, estimatedScore: result.high, user: updated };
}

export async function saveBudgets(budgets: Record<string, number>): Promise<User> {
  const cleaned = Object.fromEntries(Object.entries(budgets).map(([category, amount]) => {
    const value = Number(amount);
    if (!category.trim() || !Number.isFinite(value) || value < 0 || value > 1000000) {
      throw new Error('Enter valid monthly budget amounts.');
    }
    return [category, round2(value)];
  }));
  if (await detectApi()) {
    const data = await apiFetch('/api/budgets', { method: 'POST', body: JSON.stringify({ budgets: cleaned }) });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.budgets = cleaned;
  persistUser(updated);
  return updated;
}

export async function setCreditGoal(goal: number): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/credit/goal', {
      method: 'POST',
      body: JSON.stringify({ goal }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const credit = updated.credit || defaultCredit();
  if (goal <= credit.score) throw new Error('Choose a goal above your current score.');
  if (goal < 300 || goal > 850) throw new Error('Please choose a score between 300 and 850.');
  updated.credit = { ...credit, goal };
  persistUser(updated);
  return updated;
}

export async function markCreditAlertsRead(): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/credit/alerts/read', { method: 'POST' });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const credit = updated.credit || defaultCredit();
  updated.credit = { ...credit, alerts: credit.alerts.map((a) => ({ ...a, read: true })) };
  persistUser(updated);
  return updated;
}

export async function updateSecuritySettings(patch: Partial<SecuritySettings>): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/security/settings', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.security = { ...(updated.security || defaultSecurity()), ...patch };
  persistUser(updated);
  return updated;
}

export interface ProfileUpdate {
  fullName: string;
  email: string;
  phone: string;
  address: string;
}

export async function updateProfile(input: ProfileUpdate): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.fullName = input.fullName.trim();
  updated.email = input.email.trim();
  updated.phone = input.phone.trim();
  updated.address = input.address.trim();
  persistUser(updated);
  return updated;
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/settings/preferences', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.preferences = { ...(updated.preferences || defaultPreferences()), ...patch };
  persistUser(updated);
  return updated;
}

export async function updateAccountSettings(
  accountId: string,
  patch: { nickname?: string; isPrimary?: boolean; hidden?: boolean; favorite?: boolean }
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/accounts/settings', {
      method: 'POST',
      body: JSON.stringify({ accountId, ...patch }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const acct = updated.accounts.find((a) => a.id === accountId);
  if (!acct) throw new Error('Account not found.');
  if (typeof patch.nickname === 'string') acct.nickname = patch.nickname.trim().slice(0, 30);
  if (typeof patch.hidden === 'boolean') acct.hidden = patch.hidden;
  if (typeof patch.favorite === 'boolean') acct.favorite = patch.favorite;
  if (patch.isPrimary) {
    for (const a of updated.accounts) a.isPrimary = a.id === accountId;
  } else if (typeof patch.isPrimary === 'boolean') {
    acct.isPrimary = false;
  }
  persistUser(updated);
  return updated;
}

export async function addTravelNotice(input: {
  destination: string;
  startDate: string;
  endDate: string;
  accountId?: string;
}): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/travel/notices', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  if (!updated.travelNotices) updated.travelNotices = [];
  updated.travelNotices.unshift({ id: uid(), ...input, destination: input.destination.trim() });
  persistUser(updated);
  return updated;
}

export async function deleteTravelNotice(id: string): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/travel/notices/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.travelNotices = (updated.travelNotices || []).filter((n) => n.id !== id);
  persistUser(updated);
  return updated;
}

export async function payLoan(
  loanId: string,
  fromId: string,
  amount: number
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/loans/pay', {
      method: 'POST',
      body: JSON.stringify({ loanId, fromId, amount }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const loan = updated.accounts.find((a) => a.id === loanId);
  const from = updated.accounts.find((a) => a.id === fromId);
  if (!loan || !['auto-loan', 'mortgage'].includes(loan.type)) throw new Error('Loan not found.');
  if (!from || !DEPOSIT_TYPES.has(from.type)) throw new Error('Choose an eligible funding account.');
  if (amount > loan.balance) throw new Error(`Amount exceeds the remaining balance of ${fmtMoney(loan.balance)}.`);
  if (amount > from.balance) throw new Error('Insufficient funds in the selected account.');
  from.balance = round2(from.balance - amount);
  loan.balance = round2(loan.balance - amount);
  from.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: `Payment to ${loan.name}`,
    amount: -amount,
    category: 'Loan payment',
    status: 'posted',
  });
  loan.transactions.unshift({
    id: uid(),
    date: new Date().toISOString(),
    description: 'Loan payment received',
    amount: -amount,
    category: 'Loan payment',
    status: 'posted',
  });
  persistUser(updated);
  return updated;
}

export interface ScheduleInput {
  kind: ScheduledKind;
  label: string;
  fromAccountId: string;
  toAccountId?: string;
  payeeId?: string;
  amount: number;
  date: string;
  frequency: ScheduledFrequency;
}

export async function schedulePayment(input: ScheduleInput): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/scheduled', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const from = updated.accounts.find((a) => a.id === input.fromAccountId);
  if (!from) throw new Error('Choose an eligible funding account.');
  if (!Array.isArray(updated.scheduledPayments)) updated.scheduledPayments = [];
  updated.scheduledPayments.unshift({
    id: uid(),
    ...input,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  });
  persistUser(updated);
  return updated;
}

export async function manageScheduledPayment(
  id: string,
  patch: { action: 'pause' | 'resume' | 'edit'; amount?: number; date?: string }
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/scheduled/manage', {
      method: 'POST',
      body: JSON.stringify({ id, ...patch }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const item = (updated.scheduledPayments || []).find((s) => s.id === id);
  if (!item) throw new Error('Scheduled payment not found.');
  if (patch.action === 'pause') item.status = 'paused';
  if (patch.action === 'resume') item.status = 'scheduled';
  if (patch.action === 'edit') {
    if (!Number.isFinite(patch.amount) || !patch.amount || patch.amount < 0.01) throw new Error('Enter a valid amount.');
    if (!patch.date || !/^\d{4}-\d{2}-\d{2}$/.test(patch.date) || new Date(`${patch.date}T23:59:59`) < new Date()) {
      throw new Error('Choose a future delivery date.');
    }
    item.amount = round2(patch.amount);
    item.date = patch.date;
  }
  persistUser(updated);
  return updated;
}

export async function cancelScheduledPayment(id: string): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/scheduled/cancel', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const item = (updated.scheduledPayments || []).find((s) => s.id === id);
  if (!item) throw new Error('Scheduled payment not found.');
  item.status = 'cancelled';
  updated.scheduledPayments = (updated.scheduledPayments || []).filter((s) => s.id !== id);
  persistUser(updated);
  return updated;
}

export async function signOutAllDevices(): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/auth/sign-out-all', { method: 'POST' }).catch(() => undefined);
    clearUserSessionState();
    return;
  }
  clearUserSessionState();
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<User | null> {
  if (await detectApi()) {
    const data = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (data?.user) {
      const hydrated = hydrateDefaults(data.user as User);
      if (data.linkedAdmin) hydrated.linkedAdmin = data.linkedAdmin as LinkedAdminSummary;
      return hydrated;
    }
    return fetchMe();
  }
  const user = requireLocalUser();
  if (user.password !== currentPassword) {
    throw new Error('Your current password is incorrect.');
  }
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
  const updated: User = JSON.parse(JSON.stringify(user));
  updated.password = newPassword;
  persistUser(updated);
  return hydrateDefaults(updated);
}

export async function sendSecureMessage(
  subject: string,
  category: SecureMessageCategory,
  body: string
): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ subject, category, body }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  if (!Array.isArray(updated.messages)) updated.messages = [];
  updated.messages.unshift({
    id: `msg-${Date.now()}`,
    subject,
    category,
    sender: 'customer',
    senderName: updated.fullName,
    body,
    createdAt: new Date().toISOString(),
    readByCustomer: true,
    readByAdmin: false,
  });
  persistUser(updated);
  return updated;
}

export async function markSecureMessagesRead(): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/messages/read', { method: 'POST' });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  if (Array.isArray(updated.messages)) {
    updated.messages = updated.messages.map((m) => ({ ...m, readByCustomer: true }));
    persistUser(updated);
  }
  return updated;
}

export async function dismissAccountNotice(): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/notice/dismiss', { method: 'POST' });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  updated.accountNotice = null;
  persistUser(updated);
  return updated;
}

export async function toggleCustomOffer(offerId: string): Promise<User> {
  if (await detectApi()) {
    const data = await apiFetch('/api/offers/toggle', {
      method: 'POST',
      body: JSON.stringify({ offerId }),
    });
    return hydrateDefaults(data.user as User);
  }
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  if (Array.isArray(updated.customOffers)) {
    updated.customOffers = updated.customOffers.map((o) =>
      o.id === offerId ? { ...o, activated: !o.activated } : o
    );
    persistUser(updated);
  }
  return updated;
}
