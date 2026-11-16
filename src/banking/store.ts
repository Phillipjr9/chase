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
  status: 'scheduled' | 'paid' | 'cancelled';
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
  /** Admin console role — 'admin' unlocks the /api/admin surface. */
  role?: 'admin' | 'member';
  /** Account standing — 'frozen' blocks sign-in and API access. */
  status?: 'active' | 'frozen';
  lastLoginAt?: string | null;
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

function tx(description: string, amount: number, category: string, daysAgo: number): Transaction {
  return {
    id: uid(),
    date: daysAgoIso(daysAgo),
    description,
    amount,
    category,
    status: 'posted',
  };
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
      { id: 'payment-history', label: 'Payment history', status: 'good', weight: 'High impact', detail: '100% on-time payments reported across your accounts.' },
      { id: 'credit-utilization', label: 'Credit utilization', status: 'good', weight: 'High impact', detail: 'Using 8% of your available revolving credit.' },
      { id: 'balances', label: 'Balances', status: 'fair', weight: 'Medium impact', detail: 'Card balances rose $120 since last week.' },
      { id: 'credit-history', label: 'Credit history', status: 'good', weight: 'Medium impact', detail: 'Oldest account is 4 years 3 months old.' },
      { id: 'credit-checks', label: 'Credit checks', status: 'good', weight: 'Low impact', detail: '1 inquiry in the past 12 months; 0 in the last 6 months.' },
      { id: 'available-credit', label: 'Available credit', status: 'good', weight: 'Low impact', detail: '$10,759 available across 2 cards.' },
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

/* ------------------------------ API client -------------------------------- */

const TOKEN_KEY = 'chase_clone_token_v1';
const USERS_KEY = 'chase_clone_users_v2';
const SESSION_KEY = 'chase_clone_session_v2';

function readStoredToken(): string | null {
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

let token: string | null = readStoredToken();

function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable */
  }
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

let apiMode: boolean | null = null;

async function detectApi(): Promise<boolean> {
  if (apiMode !== null) return apiMode;
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    const data = await res.json().catch(() => null);
    apiMode = !!(data && data.status === 'ok');
  } catch {
    apiMode = false;
  }
  return apiMode;
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

function withSessionParam(path: string, tok: string | null): string {
  if (!tok || !path.startsWith('/api/')) return path;
  if (PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix))) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}_st=${encodeURIComponent(tok)}`;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const activeToken = token || readStoredToken();
  if (activeToken && !token) token = activeToken;
  const url = withSessionParam(path, activeToken);
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
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
      setToken(null);
      setLocalSession(null);
      window.dispatchEvent(new CustomEvent('chase:session-expired'));
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

function buildChaseUserLocal(): User {
  const checking: Account = {
    id: uid(),
    type: 'checking',
    name: 'Chase Total Checking®',
    mask: '4821',
    balance: 6482.19,
    locked: false,
    isPrimary: true,
    createdAt: daysAgoIso(400),
    transactions: [
      tx('Payroll deposit — ACME CORP', 3850.0, 'Income', 2),
      tx('Whole Foods Market', -86.42, 'Groceries', 3),
      tx('Zelle payment to Maya Johnson', -150.0, 'Zelle', 5),
      tx('Electric bill — Con Edison', -112.87, 'Bills', 7),
      tx('Transfer to Chase Savings℠', -250.0, 'Transfer', 9),
      tx('Netflix', -15.49, 'Subscriptions', 11),
      tx('ATM withdrawal', -200.0, 'Cash', 13),
      tx('Payroll deposit — ACME CORP', 3850.0, 'Income', 16),
      tx('Shell Oil', -54.2, 'Transportation', 18),
      tx('Transfer to Chase Savings℠', -250.0, 'Transfer', 23),
    ],
  };
  const savings: Account = {
    id: uid(),
    type: 'savings',
    name: 'Chase Savings℠',
    mask: '9014',
    balance: 18350.0,
    createdAt: daysAgoIso(400),
    transactions: [
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 9),
      tx('Interest payment', 12.4, 'Interest', 15),
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 23),
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 37),
    ],
  };
  const card: Account = {
    id: uid(),
    type: 'credit-card',
    name: 'Chase Sapphire Preferred®',
    mask: '3308',
    balance: 1240.55,
    creditLimit: 12000,
    statementBalance: 980.20,
    rewardsPoints: 68420,
    apr: 21.49,
    locked: false,
    autopay: false,
    createdAt: daysAgoIso(300),
    transactions: [
      tx('United Airlines', 412.3, 'Travel', 4),
      tx('Starbucks', 14.85, 'Dining', 5),
      tx('Chipotle Mexican Grill', 28.65, 'Dining', 6),
      tx('Payment received — thank you', -500.0, 'Payment', 8),
      tx('Target', 89.99, 'Shopping', 10),
      tx('Uber', 34.5, 'Transportation', 12),
    ],
  };
  const freedomCard: Account = {
    id: uid(),
    type: 'credit-card',
    name: 'Chase Freedom Unlimited®',
    mask: '6194',
    balance: 342.18,
    creditLimit: 7500,
    statementBalance: 342.18,
    rewardsPoints: 18940,
    apr: 19.99,
    locked: false,
    autopay: true,
    createdAt: daysAgoIso(210),
    transactions: [
      tx('DoorDash', 46.20, 'Dining', 3),
      tx('Spotify', 11.99, 'Subscriptions', 6),
      tx('Nike.com', 142.00, 'Shopping', 9),
      tx('Lyft', 24.50, 'Transportation', 14),
    ],
  };
  const conEdisonId = uid();
  const mortgage: Account = {
    id: uid(),
    type: 'mortgage',
    name: 'Chase Home Lending Mortgage',
    mask: '5527',
    balance: 412400,
    apr: 6.375,
    monthlyPayment: 3187,
    createdAt: daysAgoIso(900),
    transactions: [
      tx('Mortgage payment received', -3187, 'Loan payment', 30),
      tx('Mortgage payment received', -3187, 'Loan payment', 61),
      tx('Escrow analysis adjustment', 42.18, 'Escrow', 74),
    ],
  };
  const autoLoan: Account = {
    id: uid(),
    type: 'auto-loan',
    name: 'Chase Auto Loan',
    mask: '8834',
    balance: 21840.55,
    apr: 6.9,
    monthlyPayment: 486.22,
    createdAt: daysAgoIso(520),
    transactions: [
      tx('Auto loan payment received', -486.22, 'Loan payment', 12),
      tx('Auto loan payment received', -486.22, 'Loan payment', 43),
    ],
  };
  return {
    id: uid(),
    username: 'chase',
    password: 'chase123',
    fullName: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    phone: '(212) 555-0147',
    address: '350 Fifth Avenue, New York, NY 10118',
    accounts: [checking, savings, card, freedomCard, mortgage, autoLoan],
    payees: [
      { id: conEdisonId, name: 'Con Edison', accountNumber: '•••• 7741', category: 'Utilities' },
      { id: uid(), name: 'T-Mobile', accountNumber: '•••• 2209', category: 'Utilities' },
      { id: uid(), name: 'State Farm Insurance', accountNumber: '•••• 4410', category: 'Insurance' },
    ],
    investments: defaultInvestments(),
    security: defaultSecurity(),
    preferences: defaultPreferences(),
    credit: defaultCredit(),
    home: defaultHome(),
    scheduledPayments: [
      {
        id: uid(),
        kind: 'bill',
        label: 'Con Edison',
        fromAccountId: checking.id,
        payeeId: conEdisonId,
        amount: 112.87,
        date: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
        frequency: 'monthly',
        status: 'scheduled',
        createdAt: daysAgoIso(40),
      },
    ],
    travelNotices: [],
    travelBookings: [
      {
        id: uid(),
        title: 'New York (EWR) → Lisbon (LIS)',
        provider: 'United Airlines',
        brand: 'united',
        dates: 'Oct 12 – Oct 19, 2026',
        pointsUsed: 42000,
        status: 'Confirmed',
      },
    ],
    role: 'admin',
    status: 'active',
    lastLoginAt: null,
    createdAt: daysAgoIso(400),
  };
}

function hydrateDefaults(user: User | null | undefined): User {
  if (!user || typeof user !== 'object') {
    throw new Error('Your session data could not be loaded. Please sign in again.');
  }
  return {
    ...user,
    investments: user.investments || defaultInvestments(),
    security: user.security || defaultSecurity(),
    preferences: user.preferences || defaultPreferences(),
    credit: user.credit || defaultCredit(),
    travelNotices: user.travelNotices || [],
    travelBookings: user.travelBookings || [],
    scheduledPayments: user.scheduledPayments || [],
    disputes: user.disputes || [],
    home: user.home ?? null,
    role: user.role || (user.username === 'chase' ? 'admin' : 'member'),
    status: user.status || 'active',
  };
}

/* --------------------------- Exported async API --------------------------- */

export async function seedSampleUserIfNeeded(): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/seed', { method: 'POST' }).catch(() => undefined);
    return;
  }
  const users = loadUsers();
  const existingIdx = users.findIndex((u) => u.username.toLowerCase() === 'chase');
  if (existingIdx >= 0) {
    if (users[existingIdx].role !== 'admin') {
      users[existingIdx] = {
        ...users[existingIdx],
        role: 'admin',
        status: users[existingIdx].status || 'active',
      };
      saveUsers(users);
    }
    return;
  }
  users.push(buildChaseUserLocal());
  saveUsers(users);
}

export async function fetchMe(): Promise<User | null> {
  if (await detectApi()) {
    try {
      const data = await apiFetch('/api/auth/me', { method: 'GET' });
      if (data.token) setToken(data.token);
      return hydrateDefaults(data.user as User);
    } catch {
      setToken(null);
      return null;
    }
  }
  const u = getLocalSessionUser();
  return u ? hydrateDefaults(u) : null;
}

export async function authenticate(
  username: string,
  password: string
): Promise<{ user: User } | { error: string }> {
  if (await detectApi()) {
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      return { user: hydrateDefaults(data.user as User) };
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
  if (user.status === 'frozen') {
    return { error: 'This account has been frozen by an administrator. Please contact support.' };
  }
  setLocalSession(user.id);
  return { user: hydrateDefaults(user) };
}

export async function logout(): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    return;
  }
  setLocalSession(null);
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
  const updated: User = JSON.parse(JSON.stringify(requireLocalUser()));
  const card = updated.accounts.find((a) => a.id === payload.cardId && a.type === 'credit-card');
  if (!card || (card.rewardsPoints || 0) < payload.points) {
    throw new Error('Not enough Ultimate Rewards® points on selected card.');
  }
  card.rewardsPoints = (card.rewardsPoints || 0) - payload.points;
  if (!updated.travelBookings) updated.travelBookings = [];
  if (payload.kind === 'cashback') {
    const credit = round2(payload.points / 100);
    card.balance = round2(Math.max(0, card.balance - credit));
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
    setToken(null);
    return;
  }
  setLocalSession(null);
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return;
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
}

/* ========================================================================== */
/* Admin Console API client (+ local fallback mirroring server/admin.js)      */
/* ========================================================================== */

export interface AdminKpis {
  totalUsers: number;
  newUsers30: number;
  newUsersDeltaPct: number | null;
  activeUsers: number;
  frozenUsers: number;
  totalDeposits: number;
  depositsDeltaPct: number | null;
  netFlow30: number;
  txVolume30: number;
  txVolumeDeltaPct: number | null;
  txCount30: number;
  cardBalance: number;
  loanBalance: number;
  creditUtilizationPct: number;
  flaggedTx: number;
  openDisputes: number;
  riskItems: number;
  activeSessions: number;
  monthInflow: number;
  monthlyTarget: number;
  monthlyTargetPct: number;
}

export interface AdminCashflowPoint {
  label: string;
  inflow: number;
  outflow: number;
}

export interface AdminDailyPoint {
  label: string;
  count: number;
  amount: number;
}

export interface AdminMixSlice {
  type: AccountType;
  count: number;
  balance: number;
}

export interface AdminActivityItem {
  id: string;
  kind: 'signup' | 'transaction' | 'admin';
  at: string;
  text: string;
  detail: string;
  userId: string | null;
  flagged?: boolean;
}

/** Time-range bucketing for the overview cashflow chart. */
export type AdminRange = '7d' | '30d' | '12w';

export interface AdminOverview {
  generatedAt: string;
  range: AdminRange;
  kpis: AdminKpis;
  sparklines: { signups: number[]; inflow: number[]; volume: number[] };
  cashflow: AdminCashflowPoint[];
  daily: AdminDailyPoint[];
  accountMix: AdminMixSlice[];
  topCustomers: AdminCustomerSummary[];
  activity: AdminActivityItem[];
}

export interface AdminCustomerSummary {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: 'admin' | 'member';
  status: 'active' | 'frozen';
  joinedAt: string;
  lastLoginAt: string | null;
  accountCount: number;
  deposits: number;
  liabilities: number;
  txCount: number;
  flaggedCount: number;
  openDisputes: number;
}

export interface AdminCustomerAccount {
  id: string;
  type: AccountType;
  name: string;
  mask: string;
  balance: number;
  creditLimit?: number;
  apr?: number;
  locked: boolean;
  autopay: boolean;
  createdAt: string;
  txCount: number;
}

export interface AdminTxRow {
  id: string;
  userId: string;
  userName: string;
  username: string;
  accountId: string;
  accountName: string;
  accountMask: string;
  accountType: AccountType;
  date: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  flagged: boolean;
  flagNote: string | null;
}

export interface AdminCustomerDetail {
  summary: AdminCustomerSummary;
  accounts: AdminCustomerAccount[];
  recentTx: AdminTxRow[];
  disputes: CardDispute[];
  payees: Payee[];
  scheduledPayments: ScheduledPayment[];
  sessions: number;
  security: SecuritySettings | null;
  creditScore: number | null;
}

export interface AdminDisputeRow {
  id: string;
  userId: string;
  userName: string;
  username: string;
  accountName: string;
  accountMask: string;
  transactionId: string;
  description: string;
  amount: number;
  reason: string;
  status: 'open' | 'resolved' | 'denied';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
}

export interface AdminAuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  detail: string;
}

export interface AdminSystemInfo {
  status: string;
  version: string;
  node: string;
  platform: string;
  pid: number;
  port: number;
  startedAt: string;
  uptimeSec: number;
  memoryMb: number;
  heapMb: number;
  users: number;
  admins: number;
  frozenUsers: number;
  activeSessions: number;
  auditEntries: number;
  products: number;
  db: { bytes: number; modifiedAt: string | null };
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface CustomerQuery {
  q?: string;
  status?: 'all' | 'active' | 'frozen';
  role?: 'all' | 'admin' | 'member';
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionQuery {
  q?: string;
  type?: string;
  min?: number | null;
  max?: number | null;
  from?: string | null;
  to?: string | null;
  sort?: string;
  page?: number;
  pageSize?: number;
}

function toParams(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/* --------------------------- Local fallback mode -------------------------- */

const AUDIT_KEY = 'chase_clone_audit_v1';

function loadAuditLocal(): AdminAuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdminAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function appendAuditLocal(me: User, action: string, target: string, detail: string): void {
  const entries = loadAuditLocal();
  entries.unshift({
    id: uid(),
    at: new Date().toISOString(),
    actorId: me.id,
    actorName: me.fullName,
    action,
    target,
    detail,
  });
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(0, 600)));
  } catch {
    /* storage unavailable */
  }
}

function flattenLocal(users: User[]): AdminTxRow[] {
  const rows: AdminTxRow[] = [];
  for (const u of users) {
    for (const a of u.accounts || []) {
      for (const t of a.transactions || []) {
        rows.push({
          id: t.id,
          userId: u.id,
          userName: u.fullName,
          username: u.username,
          accountId: a.id,
          accountName: a.name,
          accountMask: a.mask,
          accountType: a.type,
          date: t.date,
          description: t.description,
          amount: t.amount,
          category: t.category,
          status: t.status,
          flagged: !!(t as Transaction & { flagged?: boolean }).flagged,
          flagNote: (t as Transaction & { flagNote?: string }).flagNote || null,
        });
      }
    }
  }
  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return rows;
}

function summaryLocal(u: User): AdminCustomerSummary {
  const accounts = u.accounts || [];
  let txCount = 0;
  let flaggedCount = 0;
  for (const a of accounts) {
    for (const t of a.transactions || []) {
      txCount += 1;
      if ((t as Transaction & { flagged?: boolean }).flagged) flaggedCount += 1;
    }
  }
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone || '',
    address: u.address || '',
    role: (u.role || 'member') as 'admin' | 'member',
    status: (u.status || 'active') as 'active' | 'frozen',
    joinedAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    accountCount: accounts.length,
    deposits: round2(accounts.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((s, a) => s + a.balance, 0)),
    liabilities: round2(
      accounts.filter((a) => a.type === 'credit-card' || a.type === 'mortgage' || a.type === 'auto-loan').reduce((s, a) => s + a.balance, 0)
    ),
    txCount,
    flaggedCount,
    openDisputes: (u.disputes || []).filter((d) => d.status === 'open').length,
  };
}

function paginateLocal<T>(list: T[], page = 1, pageSize = 10): AdminPage<T> {
  const p = Math.max(1, page);
  const size = Math.min(50, Math.max(5, pageSize));
  const start = (p - 1) * size;
  return {
    items: list.slice(start, start + size),
    total: list.length,
    page: p,
    pageSize: size,
    pages: Math.max(1, Math.ceil(list.length / size)),
  };
}

function deltaPctLocal(curr: number, prev: number): number | null {
  if (!prev) return null;
  return round2(((curr - prev) / Math.abs(prev)) * 100);
}

function overviewLocal(users: User[], range: AdminRange = '12w'): AdminOverview {
  const txs = flattenLocal(users);
  const now = Date.now();
  const DAY_MS = 86400000;
  const age = (iso: string) => now - new Date(iso).getTime();

  const totalDeposits = users.reduce(
    (s, u) => s + (u.accounts || []).filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((x, a) => x + a.balance, 0),
    0
  );
  const cardAccounts = users.flatMap((u) => (u.accounts || []).filter((a) => a.type === 'credit-card'));
  const cardBalance = cardAccounts.reduce((s, a) => s + a.balance, 0);
  const cardLimits = cardAccounts.reduce((s, a) => s + (a.creditLimit || 0), 0);
  const loanBalance = users.reduce(
    (s, u) => s + (u.accounts || []).filter((a) => a.type === 'mortgage' || a.type === 'auto-loan').reduce((x, a) => x + a.balance, 0),
    0
  );

  const tx30 = txs.filter((t) => age(t.date) < 30 * DAY_MS);
  const txPrev30 = txs.filter((t) => age(t.date) >= 30 * DAY_MS && age(t.date) < 60 * DAY_MS);
  const vol = (list: AdminTxRow[]) => list.reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = (list: AdminTxRow[]) => list.reduce((s, t) => s + t.amount, 0);
  const newUsers30 = users.filter((u) => age(u.createdAt) < 30 * DAY_MS).length;
  const newUsersPrev30 = users.filter((u) => age(u.createdAt) >= 30 * DAY_MS && age(u.createdAt) < 60 * DAY_MS).length;

  /* Cashflow — bucketed per requested range (7d/30d daily, 12w weekly) */
  const cashflowMidnight = new Date();
  cashflowMidnight.setHours(0, 0, 0, 0);
  const cashflow: AdminCashflowPoint[] = [];
  const pushCashflowBucket = (from: number, to: number, labelDate: Date) => {
    const bucket = txs.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= from && ts < to;
    });
    cashflow.push({
      label: labelDate.toISOString().slice(5, 10).replace('-', '/'),
      inflow: round2(bucket.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      outflow: round2(bucket.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)),
    });
  };
  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    for (let i = days - 1; i >= 0; i -= 1) {
      const from = cashflowMidnight.getTime() - i * DAY_MS;
      pushCashflowBucket(from, from + DAY_MS, new Date(from));
    }
  } else {
    for (let i = 11; i >= 0; i -= 1) {
      const to = now - i * 7 * DAY_MS;
      pushCashflowBucket(to - 7 * DAY_MS, to, new Date(to - DAY_MS));
    }
  }

  /* Sparkline sources stay on a stable 12-week history regardless of chart range */
  const weeklyInflow: number[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const to = now - i * 7 * DAY_MS;
    const from = to - 7 * DAY_MS;
    weeklyInflow.push(
      round2(
        txs
          .filter((t) => t.amount > 0 && new Date(t.date).getTime() >= from && new Date(t.date).getTime() < to)
          .reduce((s, t) => s + t.amount, 0)
      )
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const daily: AdminDailyPoint[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const from = todayStart.getTime() - i * DAY_MS;
    const to = from + DAY_MS;
    const bucket = txs.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= from && ts < to;
    });
    daily.push({
      label: new Date(from).toISOString().slice(5, 10).replace('-', '/'),
      count: bucket.length,
      amount: round2(vol(bucket)),
    });
  }

  const signups: number[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const cutoff = now - i * 7 * DAY_MS;
    signups.push(users.filter((u) => new Date(u.createdAt).getTime() <= cutoff).length);
  }

  const mixMap = new Map<AccountType, AdminMixSlice>();
  for (const u of users) {
    for (const a of u.accounts || []) {
      const entry = mixMap.get(a.type) || { type: a.type, count: 0, balance: 0 };
      entry.count += 1;
      entry.balance = round2(entry.balance + a.balance);
      mixMap.set(a.type, entry);
    }
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthInflow = round2(
    txs.filter((t) => t.amount > 0 && new Date(t.date).getTime() >= monthStart.getTime()).reduce((s, t) => s + t.amount, 0)
  );

  const activity: AdminActivityItem[] = [];
  for (const u of users) {
    activity.push({ id: `signup-${u.id}`, kind: 'signup', at: u.createdAt, text: `${u.fullName} enrolled`, detail: `@${u.username}`, userId: u.id });
  }
  for (const t of txs.slice(0, 200)) {
    activity.push({
      id: `tx-${t.userId}-${t.id}`,
      kind: 'transaction',
      at: t.date,
      text: t.description,
      detail: `${t.userName} · ${t.accountName} (••${t.accountMask}) · ${t.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(t.amount))}`,
      userId: t.userId,
      flagged: t.flagged,
    });
  }
  for (const e of loadAuditLocal().slice(0, 50)) {
    if (/^(customer|dispute|transaction)\./.test(e.action)) {
      activity.push({ id: `audit-${e.id}`, kind: 'admin', at: e.at, text: e.detail || e.action, detail: `${e.actorName} → ${e.target}`, userId: null });
    }
  }
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const flaggedTx = txs.filter((t) => t.flagged).length;
  const openDisputes = users.reduce((s, u) => s + (u.disputes || []).filter((d) => d.status === 'open').length, 0);
  const frozenUsers = users.filter((u) => u.status === 'frozen').length;
  const monthlyTarget = 250000;

  return {
    generatedAt: new Date().toISOString(),
    range,
    kpis: {
      totalUsers: users.length,
      newUsers30,
      newUsersDeltaPct: deltaPctLocal(newUsers30, newUsersPrev30),
      activeUsers: users.filter((u) => u.status !== 'frozen').length,
      frozenUsers,
      totalDeposits: round2(totalDeposits),
      depositsDeltaPct: deltaPctLocal(net(tx30), net(txPrev30)),
      netFlow30: round2(net(tx30)),
      txVolume30: round2(vol(tx30)),
      txVolumeDeltaPct: deltaPctLocal(vol(tx30), vol(txPrev30)),
      txCount30: tx30.length,
      cardBalance: round2(cardBalance),
      loanBalance: round2(loanBalance),
      creditUtilizationPct: cardLimits ? round2((cardBalance / cardLimits) * 100) : 0,
      flaggedTx,
      openDisputes,
      riskItems: flaggedTx + openDisputes,
      activeSessions: getLocalSession(null) ? 1 : 0,
      monthInflow,
      monthlyTarget,
      monthlyTargetPct: round2((monthInflow / monthlyTarget) * 100),
    },
    sparklines: { signups, inflow: weeklyInflow, volume: daily.map((d) => d.amount) },
    cashflow,
    daily,
    accountMix: [...mixMap.values()].sort((a, b) => b.count - a.count),
    topCustomers: users.map(summaryLocal).sort((a, b) => b.deposits - a.deposits).slice(0, 5),
    activity: activity.slice(0, 12),
  };
}

function getLocalSession(_unused: null): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function mutateLocalUser(id: string, mutate: (u: User) => string | null): void {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) throw new Error('Customer not found');
  const updated: User = JSON.parse(JSON.stringify(users[idx]));
  const error = mutate(updated);
  if (error) throw new Error(error);
  users[idx] = updated;
  saveUsers(users);
}

/* --------------------------- Exported admin API --------------------------- */

export async function adminOverview(range: AdminRange = '12w'): Promise<AdminOverview> {
  if (await detectApi()) return apiFetch(`/api/admin/overview${toParams({ range })}`, { method: 'GET' });
  return overviewLocal(loadUsers(), range);
}

export async function adminCustomers(query: CustomerQuery): Promise<{
  customers: AdminCustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  if (await detectApi()) return apiFetch(`/api/admin/customers${toParams({ ...query })}`, { method: 'GET' });
  const q = (query.q || '').trim().toLowerCase();
  let rows = loadUsers().map(summaryLocal);
  if (q) {
    rows = rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
    );
  }
  if (query.status && query.status !== 'all') rows = rows.filter((r) => r.status === query.status);
  if (query.role && query.role !== 'all') rows = rows.filter((r) => r.role === query.role);
  const sorters: Record<string, (a: AdminCustomerSummary, b: AdminCustomerSummary) => number> = {
    'name-asc': (a, b) => a.fullName.localeCompare(b.fullName),
    'name-desc': (a, b) => b.fullName.localeCompare(a.fullName),
    'joined-desc': (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
    'joined-asc': (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    'deposits-desc': (a, b) => b.deposits - a.deposits,
    'deposits-asc': (a, b) => a.deposits - b.deposits,
  };
  rows.sort(sorters[query.sort || 'joined-desc'] || sorters['joined-desc']);
  const page = paginateLocal(rows, query.page, query.pageSize);
  return { customers: page.items, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages };
}

export async function adminCustomerDetail(id: string): Promise<AdminCustomerDetail> {
  if (await detectApi()) return apiFetch(`/api/admin/customers/detail${toParams({ id })}`, { method: 'GET' }).then((d) => d.customer);
  const u = loadUsers().find((x) => x.id === id);
  if (!u) throw new Error('Customer not found');
  return {
    summary: summaryLocal(u),
    accounts: (u.accounts || []).map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      mask: a.mask,
      balance: a.balance,
      creditLimit: a.creditLimit,
      apr: a.apr,
      locked: !!a.locked,
      autopay: !!a.autopay,
      createdAt: a.createdAt,
      txCount: (a.transactions || []).length,
    })),
    recentTx: flattenLocal([u]).slice(0, 12),
    disputes: u.disputes || [],
    payees: u.payees || [],
    scheduledPayments: u.scheduledPayments || [],
    sessions: getLocalSession(null) === u.id ? 1 : 0,
    security: u.security || null,
    creditScore: u.credit?.score ?? null,
  };
}

export async function adminSetCustomerStatus(
  actor: User,
  id: string,
  status: 'active' | 'frozen',
  reason?: string
): Promise<AdminCustomerSummary> {
  if (await detectApi()) {
    const data = await apiFetch('/api/admin/customers/status', {
      method: 'POST',
      body: JSON.stringify({ id, status, reason }),
    });
    return data.customer;
  }
  if (id === actor.id && status === 'frozen') throw new Error('You cannot freeze your own account.');
  const users = loadUsers();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error('Customer not found');
  target.status = status;
  saveUsers(users);
  appendAuditLocal(actor, status === 'frozen' ? 'customer.frozen' : 'customer.reactivated', target.username, reason || `Set status to ${status}`);
  return summaryLocal(target);
}

export async function adminSetCustomerRole(
  actor: User,
  id: string,
  role: 'admin' | 'member'
): Promise<AdminCustomerSummary> {
  if (await detectApi()) {
    const data = await apiFetch('/api/admin/customers/role', {
      method: 'POST',
      body: JSON.stringify({ id, role }),
    });
    return data.customer;
  }
  if (id === actor.id && role === 'member') throw new Error('You cannot remove your own administrator role.');
  const users = loadUsers();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error('Customer not found');
  if (role === 'member' && target.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
    throw new Error('At least one administrator must remain.');
  }
  target.role = role;
  saveUsers(users);
  appendAuditLocal(actor, 'customer.role', target.username, `Role changed to ${role}`);
  return summaryLocal(target);
}

export async function adminAdjustBalance(
  actor: User,
  id: string,
  accountId: string,
  amount: number,
  reason: string
): Promise<AdminCustomerSummary> {
  if (await detectApi()) {
    const data = await apiFetch('/api/admin/customers/adjust', {
      method: 'POST',
      body: JSON.stringify({ id, accountId, amount, reason }),
    });
    return data.customer;
  }
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Enter a non-zero adjustment amount.');
  if (!reason.trim()) throw new Error('A reason is required for balance adjustments.');
  let result: AdminCustomerSummary | null = null;
  mutateLocalUser(id, (u) => {
    const account = (u.accounts || []).find((a) => a.id === accountId);
    if (!account) return 'Account not found';
    if (amount < 0 && account.balance + amount < 0) return 'Adjustment would make the balance negative.';
    account.balance = round2(account.balance + amount);
    account.transactions.unshift({
      id: uid(),
      date: new Date().toISOString(),
      description: `Admin adjustment — ${reason.trim()}`,
      amount: round2(amount),
      category: 'Adjustment',
      status: 'posted',
    });
    result = summaryLocal(u);
    return null;
  });
  appendAuditLocal(
    actor,
    'customer.adjustment',
    id,
    `${amount > 0 ? '+' : '−'}${fmtMoney(Math.abs(round2(amount)))} — ${reason.trim()}`
  );
  return result!;
}

export async function adminSignOutCustomer(actor: User, id: string): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/admin/customers/sign-out', { method: 'POST', body: JSON.stringify({ id }) });
    return;
  }
  const users = loadUsers();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error('Customer not found');
  appendAuditLocal(actor, 'customer.signout', target.username, 'Ended all active sessions');
}

export async function adminTransactions(query: TransactionQuery): Promise<{
  transactions: AdminTxRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  summary: { count: number; inflow: number; outflow: number };
}> {
  if (await detectApi()) return apiFetch(`/api/admin/transactions${toParams({ ...query })}`, { method: 'GET' });
  const q = (query.q || '').trim().toLowerCase();
  let rows = flattenLocal(loadUsers());
  if (q) {
    rows = rows.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.accountName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }
  const typeFilters: Record<string, (t: AdminTxRow) => boolean> = {
    all: () => true,
    in: (t) => t.amount > 0,
    out: (t) => t.amount < 0,
    transfer: (t) => t.category === 'Transfer',
    zelle: (t) => t.category === 'Zelle',
    card: (t) => t.accountType === 'credit-card',
    loan: (t) => t.accountType === 'mortgage' || t.accountType === 'auto-loan',
    adjustment: (t) => t.category === 'Adjustment',
    flagged: (t) => t.flagged,
  };
  rows = rows.filter(typeFilters[query.type || 'all'] || typeFilters.all);
  if (query.min != null && Number.isFinite(query.min)) rows = rows.filter((t) => Math.abs(t.amount) >= (query.min as number));
  if (query.max != null && Number.isFinite(query.max) && (query.max as number) > 0) rows = rows.filter((t) => Math.abs(t.amount) <= (query.max as number));
  if (query.from) rows = rows.filter((t) => t.date.slice(0, 10) >= (query.from as string));
  if (query.to) rows = rows.filter((t) => t.date.slice(0, 10) <= (query.to as string));
  if (query.sort === 'amount-desc') rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  else if (query.sort === 'amount-asc') rows.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  else if (query.sort === 'date-asc') rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const summary = {
    count: rows.length,
    inflow: round2(rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
    outflow: round2(rows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)),
  };
  const page = paginateLocal(rows, query.page, query.pageSize);
  return { transactions: page.items, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages, summary };
}

export async function adminFlagTransaction(
  actor: User,
  ref: { userId: string; accountId: string; txId: string },
  flagged: boolean,
  note?: string
): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/admin/transactions/flag', {
      method: 'POST',
      body: JSON.stringify({ ...ref, flagged, note }),
    });
    return;
  }
  let description = '';
  let amount = 0;
  mutateLocalUser(ref.userId, (u) => {
    const account = (u.accounts || []).find((a) => a.id === ref.accountId);
    const tx = account && (account.transactions || []).find((t) => t.id === ref.txId);
    if (!tx) return 'Transaction not found';
    (tx as Transaction & { flagged?: boolean; flagNote?: string }).flagged = flagged;
    (tx as Transaction & { flagNote?: string }).flagNote = flagged ? note || 'Flagged by administrator' : undefined;
    description = tx.description;
    amount = tx.amount;
    return null;
  });
  appendAuditLocal(
    actor,
    flagged ? 'transaction.flagged' : 'transaction.unflagged',
    actor.username,
    `${flagged ? 'Flagged' : 'Cleared'} "${description}" (${fmtMoney(Math.abs(amount))})${note ? ` — ${note}` : ''}`
  );
}

export async function adminDisputes(status: 'all' | 'open' | 'resolved' | 'denied' = 'all', page = 1, pageSize = 10): Promise<{
  disputes: AdminDisputeRow[];
  total: number;
  open: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  if (await detectApi()) return apiFetch(`/api/admin/disputes${toParams({ status, page, pageSize })}`, { method: 'GET' });
  let rows: AdminDisputeRow[] = [];
  for (const u of loadUsers()) {
    for (const d of u.disputes || []) {
      const account = (u.accounts || []).find((a) => a.id === d.accountId);
      rows.push({
        id: d.id,
        userId: u.id,
        userName: u.fullName,
        username: u.username,
        accountName: account ? account.name : 'Card account',
        accountMask: account ? account.mask : '----',
        transactionId: d.transactionId,
        description: d.description,
        amount: d.amount,
        reason: d.reason,
        status: d.status,
        createdAt: d.createdAt,
        resolvedAt: (d as CardDispute & { resolvedAt?: string }).resolvedAt || null,
        resolutionNote: (d as CardDispute & { resolutionNote?: string }).resolutionNote || null,
        resolvedBy: (d as CardDispute & { resolvedBy?: string }).resolvedBy || null,
      });
    }
  }
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const open = rows.filter((d) => d.status === 'open').length;
  if (status !== 'all') rows = rows.filter((d) => d.status === status);
  const paged = paginateLocal(rows, page, pageSize);
  return { disputes: paged.items, total: paged.total, open, page: paged.page, pageSize: paged.pageSize, pages: paged.pages };
}

export async function adminResolveDispute(
  actor: User,
  userId: string,
  disputeId: string,
  resolution: 'approved' | 'denied',
  note?: string
): Promise<void> {
  if (await detectApi()) {
    await apiFetch('/api/admin/disputes/resolve', {
      method: 'POST',
      body: JSON.stringify({ userId, disputeId, resolution, note }),
    });
    return;
  }
  let description = '';
  mutateLocalUser(userId, (u) => {
    const dispute = (u.disputes || []).find((d) => d.id === disputeId);
    if (!dispute) return 'Dispute not found';
    if (dispute.status !== 'open') return 'That dispute has already been resolved.';
    dispute.status = resolution === 'approved' ? 'resolved' : 'denied';
    (dispute as CardDispute & { resolvedAt?: string; resolvedBy?: string; resolutionNote?: string }).resolvedAt = new Date().toISOString();
    (dispute as CardDispute & { resolvedBy?: string }).resolvedBy = actor.username;
    (dispute as CardDispute & { resolutionNote?: string | null }).resolutionNote = note || null;
    if (resolution === 'approved') {
      const account = (u.accounts || []).find((a) => a.id === dispute.accountId);
      if (account) {
        account.balance = round2(Math.max(0, account.balance - dispute.amount));
        account.transactions.unshift({
          id: uid(),
          date: new Date().toISOString(),
          description: `Dispute refund — ${dispute.description}`,
          amount: -round2(dispute.amount),
          category: 'Dispute refund',
          status: 'posted',
        });
      }
    }
    description = dispute.description;
    return null;
  });
  appendAuditLocal(
    actor,
    resolution === 'approved' ? 'dispute.approved' : 'dispute.denied',
    actor.username,
    `${resolution === 'approved' ? 'Approved refund' : 'Denied dispute'} for "${description}"${note ? ` — ${note}` : ''}`
  );
}

export async function adminAudit(query: {
  q?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ entries: AdminAuditEntry[]; total: number; page: number; pageSize: number; pages: number; actions: string[] }> {
  if (await detectApi()) return apiFetch(`/api/admin/audit${toParams({ ...query })}`, { method: 'GET' });
  const q = (query.q || '').trim().toLowerCase();
  let rows = loadAuditLocal();
  if (q) {
    rows = rows.filter(
      (e) =>
        e.actorName.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        (e.detail || '').toLowerCase().includes(q)
    );
  }
  const action = query.action || 'all';
  if (action !== 'all') rows = rows.filter((e) => e.action === action || e.action.startsWith(`${action}.`));
  const actions = [...new Set(loadAuditLocal().map((e) => e.action))].sort();
  const page = paginateLocal(rows, query.page, query.pageSize || 12);
  return { entries: page.items, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages, actions };
}

export async function adminSystem(): Promise<AdminSystemInfo> {
  if (await detectApi()) return apiFetch('/api/admin/system', { method: 'GET' });
  const users = loadUsers();
  return {
    status: 'local',
    version: '1.0.0',
    node: 'browser fallback',
    platform: navigator.platform || 'web',
    pid: 0,
    port: 0,
    startedAt: new Date().toISOString(),
    uptimeSec: 0,
    memoryMb: 0,
    heapMb: 0,
    users: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    frozenUsers: users.filter((u) => u.status === 'frozen').length,
    activeSessions: getLocalSession(null) ? 1 : 0,
    auditEntries: loadAuditLocal().length,
    products: PRODUCTS.length,
    db: { bytes: 0, modifiedAt: null },
  };
}
