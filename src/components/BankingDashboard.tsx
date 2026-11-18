import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Unlock,
  Plus,
  FileText,
  Download,
  MapPin,
  Clock,
  HelpCircle,
  Camera,
  Menu,
  X,
  Mail,
  Printer,
} from 'lucide-react';
import { ChaseLogo } from './ChaseLogo';
import { Footer } from './Footer';
import { AutoLoanModal, MortgageCalculatorModal, ScheduleMeetingModal } from './Modals';
import { StatementModal } from './StatementModal';
import {
  ChaseIcon,
  ChaseCardImage,
  BrandLogo,
  ZelleLogo,
  JpmwmLogo,
  cardProductFor,
  iconForAccountType,
} from './ChaseAssets';
import {
  InvestmentsView,
  TravelView,
  SpendingView,
  SecurityCenterView,
  LocationsView,
  MyHomeView,
  AdvisorsView,
  InkView,
  OffersView,
  SecureMessagesView,
} from './ChaseFeatures';
import { OFFERS } from '../data/chaseFeatures';
import {
  User,
  Account,
  Transaction,
  ProductId,
  fmtMoney,
  fetchMe,
  sortTransactionsDesc,
  updateCardControls as apiUpdateCardControls,
  dismissAccountNotice,
  fmtDueDate,
  nextDueDate,
} from '../banking/store';
import { PayTransferHub, PayPage } from './PayTransferHub';
import { SettingsPage } from './SettingsPage';
import type { Section as SettingsSection } from './SettingsPage';
import { CreditCardPage } from './CreditCardPage';
import { CreditJourney } from './CreditJourney';
import { DashboardSkeleton } from './Loading';
import { useIsMobile } from '../hooks/useIsMobile';

/* Authentic Chase Online colors sampled from secure.chase.com */
const NAVY = '#081427';
const BTN_BLUE = '#1A4488';
const BTN_BLUE_HOVER = '#143669';
const INK = '#131313';
const MUTED = '#5C5C5C';
const LINE = '#E4E6E8';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onSignOut: () => void;
  onBackHome: () => void;
  onOpenAccount: (product?: ProductId) => void;
  initialView?: DashboardView;
  spanishMode?: boolean;
  onToggleSpanish?: () => void;
  isImpersonating?: boolean;
  onExitImpersonation?: () => void;
}

export type DashboardView =
  | 'accounts'
  | 'account'
  | 'pay'
  | 'investments'
  | 'travel'
  | 'spending'
  | 'statements'
  | 'credit'
  | 'offers'
  | 'locations'
  | 'myhome'
  | 'advisors'
  | 'ink'
  | 'security'
  | 'messages'
  | 'profile';

type View = DashboardView;

type Notice = { kind: 'success' | 'error'; text: string } | null;

const cleanTxDesc = (s: string) =>
  String(s || '').replace(/\s*[—–]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const Dotted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="border-b border-dotted border-[#8A929A] pb-px">{children}</span>
);

const NoticeBox: React.FC<{ msg: Notice }> = ({ msg }) =>
  msg ? (
    <div
      role={msg.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-[4px] px-3 py-2 text-[13px] ${
        msg.kind === 'success'
          ? 'bg-[#EAF7EE] border border-[#B5E2C4] text-[#14532D]'
          : 'bg-[#FEF2F2] border border-[#F5C2C7] text-[#B42318]'
      }`}
    >
      {msg.kind === 'success' ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <span>{msg.text}</span>
    </div>
  ) : null;

const OutlineBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  size?: 'sm' | 'md';
  full?: boolean;
}> = ({ children, onClick, size = 'md', full }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-1.5 border bg-white hover:bg-[#F2F6FB] font-semibold rounded-[4px] cursor-pointer ${
      size === 'sm' ? 'text-[12.5px] px-3.5 py-2' : 'text-[14px] px-5 py-2.5'
    } ${full ? 'w-full' : ''}`}
    style={{ borderColor: BTN_BLUE, color: BTN_BLUE }}
  >
    {children}
  </button>
);

const SolidBtn: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[4px] cursor-pointer transition-colors"
    style={{ backgroundColor: BTN_BLUE }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE_HOVER)}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BTN_BLUE)}
  >
    {children}
  </button>
);

const balanceLabel = (a: Account) =>
  a.type === 'credit-card'
    ? 'Remaining statement balance'
    : a.type === 'auto-loan' || a.type === 'mortgage'
      ? 'Remaining loan balance'
      : 'Available balance';

export const isLoan = (a: Account) => a.type === 'auto-loan' || a.type === 'mortgage';

const accountIcon = (t: Account['type']) => (
  <ChaseIcon name={iconForAccountType(t)} size={22} />
);

/* Real Chase card artwork (Chase Debit, Sapphire, Freedom, Ink) */
const CardArt: React.FC<{ account: Account; className: string }> = ({ account, className }) => (
  <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
    <ChaseCardImage
      product={cardProductFor(account.name, account.type)}
      alt={`${account.name} card`}
      className={`rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,.22)] ${account.locked ? 'grayscale opacity-60' : ''}`}
    />
  </span>
);

export const BankingDashboard: React.FC<Props> = ({
  user,
  onUpdateUser,
  onSignOut,
  onBackHome,
  onOpenAccount,
  initialView = 'accounts',
  spanishMode = false,
  onToggleSpanish,
  isImpersonating = false,
  onExitImpersonation,
}) => {
  const t = (en: string, es: string) => (spanishMode ? es : en);
  const [view, setView] = useState<View>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAcctNums, setShowAcctNums] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState<string | null>(null);
  const copyDetail = (key: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedDetail(key);
    setTimeout(() => setCopiedDetail((prev) => (prev === key ? null : prev)), 2000);
  };
  const [showDetails, setShowDetails] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payStart, setPayStart] = useState<PayPage>('overview');
  const [settingsStart, setSettingsStart] = useState<SettingsSection>('overview');
  const [dashboardReady, setDashboardReady] = useState(false);
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsRead, setAlertsRead] = useState(() => {
    try {
      return (
        localStorage.getItem(`chase_app_alerts_read_${user.id}`) === '1' ||
        localStorage.getItem(`chase_clone_alerts_read_${user.id}`) === '1'
      );
    } catch {
      return false;
    }
  });
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    // Brief skeleton on first entry, matching Chase's account-loading screen.
    const timer = window.setTimeout(() => setDashboardReady(true), 420);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onExpired = () => setDashboardReady(false);
    window.addEventListener('chase:session-expired', onExpired);
    return () => window.removeEventListener('chase:session-expired', onExpired);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [txSearch, setTxSearch] = useState('');
  const [showAllOverviewTx, setShowAllOverviewTx] = useState(false);
  const [detailTx, setDetailTx] = useState<{ tx: Transaction; account: Account } | null>(null);
  const [addedOffers, setAddedOffers] = useState<string[]>([]);
  const [footerMeetingOpen, setFooterMeetingOpen] = useState(false);
  const [footerMortgageOpen, setFooterMortgageOpen] = useState(false);
  const [footerAutoOpen, setFooterAutoOpen] = useState(false);
  const firstName = user.fullName.split(' ')[0];

  const onUpdateUserRef = useRef(onUpdateUser);
  onUpdateUserRef.current = onUpdateUser;
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    let active = true;
    const syncFreshUser = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastSyncAtRef.current < 4000) return;
      lastSyncAtRef.current = now;
      try {
        const fresh = await fetchMe();
        if (active && fresh && fresh.id === user.id) {
          onUpdateUserRef.current(fresh);
        }
      } catch {
        // Keep current dashboard state if background refresh cannot reach server.
      }
    };
    void syncFreshUser(true);
    const onFocus = () => void syncFreshUser(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncFreshUser(false);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user.id]);

  useEffect(() => {
    if (!detailTx) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailTx(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailTx]);

  const visibleAccounts = user.accounts.filter((a) => !a.hidden);
  const deposits = visibleAccounts.filter((a) => ['checking', 'savings', 'cd'].includes(a.type));
  const cards = visibleAccounts.filter((a) => a.type === 'credit-card');
  const loans = visibleAccounts.filter((a) => a.type === 'auto-loan' || a.type === 'mortgage');
  const selected = user.accounts.find((a) => a.id === selectedId) || null;

  // Dashboard sections are client-side views, so the browser does not perform
  // its normal page-navigation scroll reset. Reset before paint on each route,
  // including switching directly between account detail pages.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view, selectedId]);

  const inv = user.investments || { accountMask: '7192', cash: 2450, holdings: [] };
  const totalInvestments =
    inv.cash + inv.holdings.reduce((sum, h) => sum + h.shares * h.price, 0);

  const totalBank = deposits.reduce((s, a) => s + a.balance, 0);
  const totalCards = cards.reduce((s, a) => s + a.balance, 0);
  const totalLoans = loans.reduce((s, a) => s + a.balance, 0);
  const points = cards.reduce((s, a) => s + (a.rewardsPoints || 0), 0);
  const netWorth = totalBank + totalInvestments - totalCards - totalLoans;

  const groups = [
    { key: 'bank', label: 'Bank accounts', accounts: deposits },
    { key: 'cards', label: 'Credit cards', accounts: cards },
    { key: 'loans', label: 'Loans & lines of credit', accounts: loans },
  ].filter((g) => g.accounts.length > 0);

  const alerts = [
    ...user.accounts
      .filter((a) => a.locked)
      .map((a) => ({
        id: `locked-${a.id}`,
        title: 'Card locked',
        detail: `${a.name} (…${a.mask}) is locked. Unlock it when you're ready to use it.`,
        action: () => go('security'),
      })),
    ...cards
      .filter((a) => a.balance > 0)
      .map((a) => ({
        id: `due-${a.id}`,
        title: 'Credit card payment due Aug 1',
        detail: `${a.name} (…${a.mask}) — minimum ${fmtMoney(Math.min(a.balance, Math.max(35, a.balance * 0.02)))} of ${fmtMoney(a.balance)}.`,
        action: () => openAccount(a.id),
      })),
    ...(deposits.find((a) => a.type === 'checking' && a.balance < 500)
      ? [{
          id: 'low-balance',
          title: 'Low checking balance',
          detail: `Your checking balance is below $500. Review recent spending before scheduling payments.`,
          action: () => go('spending'),
        }]
      : []),
    ...(points >= 10000
      ? [{
          id: 'rewards',
          title: 'Ultimate Rewards® points available',
          detail: `You have ${points.toLocaleString()} points across your Chase cards.`,
          action: () => go('travel'),
        }]
      : []),
    ...(user.security && !user.security.twoFactor
      ? [{
          id: 'two-factor',
          title: 'Turn on 2-step verification',
          detail: 'Add a one-time code check for sign-ins from new devices.',
          action: () => go('security'),
        }]
      : []),
  ];
  const unreadAlerts = alertsRead ? 0 : alerts.length;

  const openAccount = (id: string) => {
    setSelectedId(id);
    setShowDetails(false);
    setShowAllTx(false);
    setTxFilter('all');
    setTxSearch('');
    setView('account');
  };
  const go = (v: View) => {
    setView(v);
    setMenuOpen(false);
    if (v !== 'account') setSelectedId(null);
  };

  const goPay = (p: PayPage) => {
    setPayStart(p);
    setView('pay');
    setSelectedId(null);
  };

  const goSettings = (section: SettingsSection) => {
    setSettingsStart(section);
    go('profile');
  };

  const handleFooterAction = (actionId: string) => {
    const destinations: Record<string, View> = {
      'footer-accounts': 'accounts',
      'footer-pay': 'pay',
      'footer-statements': 'statements',
      'footer-offers': 'offers',
      'footer-budgeting': 'spending',
      'footer-advisors': 'advisors',
      'footer-locations': 'locations',
      'footer-security': 'security',
      'footer-myhome': 'myhome',
      'footer-ink': 'ink',
      'jp-morgan-investing': 'investments',
      'chase-travel': 'travel',
      'credit-journey': 'credit',
    };
    if (destinations[actionId]) {
      if (actionId === 'footer-pay') setPayStart('overview');
      go(destinations[actionId]);
      return;
    }
    if (actionId === 'open-schedule-meeting') {
      setFooterMeetingOpen(true);
    } else if (actionId === 'open-mortgage-calculator') {
      setFooterMortgageOpen(true);
    } else if (actionId === 'chase-auto') {
      setFooterAutoOpen(true);
    } else if (actionId === 'business-complete-300') {
      go('ink');
    } else if (actionId === 'chase-mobile') {
      window.open('https://www.chase.com/digital/mobile-banking', '_blank', 'noopener,noreferrer');
    } else {
      const type = actionId === 'chase-savings-cds' ? 'savings' : actionId === 'sapphire-preferred' ? 'credit-card' : 'checking';
      const account = user.accounts.find((item) => item.type === type);
      if (account) openAccount(account.id);
      else onOpenAccount(type === 'savings' ? 'savings' : type === 'credit-card' ? 'sapphire' : 'total-checking');
    }
  };

  /* --------------------------- Account Controls -------------------------- */
  const [controlMsg, setControlMsg] = useState<Notice>(null);
  const [statementModal, setStatementModal] = useState<{
    accountId?: string;
    tab?: 'statement' | 'tax-1099' | 'tax-1098';
  } | null>(null);
  const unreadAdvisorMessages = (user.messages || []).filter(
    (m) => m.sender === 'advisor' && !m.readByCustomer
  ).length;

  const handleDismissNotice = async () => {
    try {
      const next = await dismissAccountNotice();
      onUpdateUser(next);
    } catch {
      /* ignore */
    }
  };
  const toggleAccountControl = async (acct: Account, patch: { locked?: boolean; autopay?: boolean }) => {
    try {
      const u = await apiUpdateCardControls(acct.id, patch);
      onUpdateUser(u);
      setControlMsg({
        kind: 'success',
        text:
          typeof patch.locked === 'boolean'
            ? patch.locked
              ? 'Card locked. Purchases and ATM withdrawals are paused.'
              : 'Card unlocked and active.'
            : patch.autopay
              ? 'Automatic payments turned On for this card.'
              : 'Automatic payments turned Off.',
      });
    } catch (e) {
      setControlMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update setting.' });
    }
  };

  /* ------------------------------ Statements ----------------------------- */
  const downloadStatement = (account: Account, monthOffset = 0) => {
    const period = new Date();
    period.setDate(1);
    period.setMonth(period.getMonth() - monthOffset);
    const start = new Date(period.getFullYear(), period.getMonth(), 1);
    const end = new Date(period.getFullYear(), period.getMonth() + 1, 1);
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Description', 'Category', 'Amount'],
      ...account.transactions
        .filter((t) => {
          const date = new Date(t.date);
          return date >= start && date < end;
        })
        .map((t) => [fmtDate(t.date), t.description, t.category, t.amount.toFixed(2)]),
    ];
    const blob = new Blob(['\uFEFF', rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${account.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${period.toISOString().slice(0, 7)}-statement.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* -------------------------------- Nav ---------------------------------- */
  const navItems: { id: View; label: string }[] = [
    { id: 'accounts', label: t('Accounts', 'Cuentas') },
    { id: 'pay', label: t('Pay & Transfer', 'Pagos y transferencias') },
    { id: 'investments', label: t('Investments', 'Inversiones') },
    { id: 'travel', label: t('Travel & Rewards', 'Viajes y recompensas') },
    { id: 'spending', label: t('Spending & Budget', 'Gastos y presupuesto') },
    { id: 'offers', label: t('Chase Offers', 'Ofertas de Chase') },
    { id: 'credit', label: t('Credit Journey®', 'Credit Journey®') },
    { id: 'myhome', label: t('MyHome®', 'MyHome®') },
    { id: 'ink', label: t('Business & Ink®', 'Negocios e Ink®') },
    { id: 'advisors', label: t('Private Client', 'Cliente Privado') },
    { id: 'locations', label: t('ATMs & Branches', 'Cajeros y sucursales') },
    { id: 'security', label: t('Security', 'Seguridad') },
    { id: 'statements', label: t('Statements', 'Estados de cuenta') },
    { id: 'profile', label: t('Profile & Settings', 'Perfil y configuración') },
  ];
  const activeNav = view === 'account' ? 'accounts' : view;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const sections = navItems
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, 4)
      .map((item) => ({
        key: `section-${item.id}`,
        type: 'Section',
        label: item.label,
        detail: 'Online banking',
        action: () => go(item.id),
      }));
    const accountResults = user.accounts
      .filter((a) => `${a.name} ${a.type} ${a.mask}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((a) => ({
        key: `account-${a.id}`,
        type: 'Account',
        label: a.nickname?.trim() || a.name,
        detail: `…${a.mask} · ${fmtMoney(a.balance)}`,
        action: () => openAccount(a.id),
      }));
    const payeeResults = user.payees
      .filter((payee) => `${payee.name} ${payee.category}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((payee) => ({
        key: `payee-${payee.id}`,
        type: 'Payee',
        label: payee.name,
        detail: `${payee.category} · ${payee.accountNumber}`,
        action: () => goPay('billpay'),
      }));
    const settingsShortcuts = [
      { key: 'set-personal', type: 'Settings', label: 'Personal details', detail: 'Name, email, phone, address', section: 'personal' as SettingsSection },
      { key: 'set-security', type: 'Settings', label: 'Sign-in & security', detail: 'Password and 2-step verification', section: 'security' as SettingsSection },
      { key: 'set-accounts', type: 'Settings', label: 'Account settings', detail: 'Nicknames, primary and paperless', section: 'accounts' as SettingsSection },
      { key: 'set-travel', type: 'Settings', label: 'Travel notices', detail: 'Trips and card travel alerts', section: 'travel' as SettingsSection },
      { key: 'set-alerts', type: 'Settings', label: 'Alerts', detail: 'Balance, payment and text alerts', section: 'alerts' as SettingsSection },
      { key: 'set-privacy', type: 'Settings', label: 'Privacy choices', detail: 'Sharing and marketing preferences', section: 'privacy' as SettingsSection },
    ]
      .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((item) => ({
        key: item.key,
        type: 'Settings',
        label: item.label,
        detail: item.detail,
        action: () => goSettings(item.section),
      }));
    const offerResults = OFFERS.filter((offer) => `${offer.merchant} ${offer.value}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((offer) => ({
        key: `offer-${offer.id}`,
        type: 'Offer',
        label: `${offer.merchant} — ${offer.value}`,
        detail: 'Chase Offers',
        action: () => go('offers'),
      }));
    const creditShortcuts = [
      { key: 'credit-factors', label: 'Credit score factors', detail: 'What affects your score', action: () => go('credit') },
      { key: 'credit-report', label: 'Credit report', detail: 'Accounts and inquiries', action: () => go('credit') },
      { key: 'credit-simulator', label: 'Score simulator', detail: 'Estimate a score change', action: () => go('credit') },
      { key: 'travel-notice', label: 'Travel notice', detail: 'Add a trip to your cards', action: () => goSettings('travel') },
      { key: 'statements', label: 'Statements and documents', detail: 'Download tax and monthly statements', action: () => go('statements') },
      { key: 'security-center', label: 'Security and fraud center', detail: 'Lock cards and enable 2-step', action: () => go('security') },
      { key: 'autopay', label: 'Automatic payments', detail: 'Manage card autopay', action: () => goPay('paycard') },
      { key: 'scheduled', label: 'Scheduled payments', detail: 'Upcoming and recurring payments', action: () => goPay('overview') },
    ]
      .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((item) => ({
        key: item.key,
        type: 'Shortcut',
        label: item.label,
        detail: item.detail,
        action: item.action,
      }));
    const transactionResults: typeof accountResults = [];
    for (const account of user.accounts) {
      for (const transaction of account.transactions) {
        if (`${transaction.description} ${transaction.category}`.toLowerCase().includes(q)) {
          transactionResults.push({
            key: `tx-${transaction.id}`,
            type: 'Transaction',
            label: transaction.description,
            detail: `${account.name} · ${fmtDate(transaction.date)} · ${fmtMoney(transaction.amount)}`,
            action: () => openAccount(account.id),
          });
          if (transactionResults.length >= 4) break;
        }
      }
      if (transactionResults.length >= 4) break;
    }
    return [...sections, ...accountResults, ...payeeResults, ...settingsShortcuts, ...creditShortcuts, ...offerResults, ...transactionResults].slice(0, 10);
  }, [searchQuery, user.accounts]);

  const runSearchResult = (result: (typeof searchResults)[number]) => {
    setSearchOpen(false);
    setSearchQuery('');
    setAlertsOpen(false);
    result.action();
  };

  const markAlertsRead = () => {
    setAlertsRead(true);
    try {
      localStorage.setItem(`chase_app_alerts_read_${user.id}`, '1');
      localStorage.removeItem(`chase_clone_alerts_read_${user.id}`);
    } catch {
      /* Browser storage is unavailable. */
    }
  };

  const allRecentActivity = useMemo(() => {
    const items: { tx: Transaction; account: Account }[] = [];
    for (const account of visibleAccounts) {
      for (const tx of sortTransactionsDesc(account.transactions)) {
        items.push({ tx, account });
      }
    }
    return items.sort((a, b) => {
      const ta = new Date(a.tx.date || 0).getTime();
      const tb = new Date(b.tx.date || 0).getTime();
      if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
      return String(b.tx.date || '').localeCompare(String(a.tx.date || ''));
    });
  }, [visibleAccounts]);

  const txns = useMemo(() => {
    if (!selected) return [];
    const q = txSearch.trim().toLowerCase();
    return sortTransactionsDesc(selected.transactions).filter((t) => {
      if (txFilter === 'in' && t.amount <= 0) return false;
      if (txFilter === 'out' && t.amount >= 0) return false;
      if (q) {
        const hay = `${cleanTxDesc(t.description)} ${t.category} ${fmtDate(t.date)} ${t.date} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selected, txFilter, txSearch]);
  const visibleTxns = showAllTx ? txns : txns.slice(0, 25);

  /* =============================== MARKUP =============================== */
  return (
    <div className="min-h-screen flex flex-col bg-white text-[#131313]">
      {isImpersonating && (
        <div role="status" className="bg-[#EAF2FA] border-b border-[#CFE0F0]">
          <div className="max-w-[1260px] mx-auto px-4 sm:px-8 min-h-[38px] flex flex-wrap items-center justify-between gap-2 text-[12px]" style={{ color: BTN_BLUE }}>
            <span><ShieldCheck className="inline w-3.5 h-3.5 mr-1" /> Preview mode · viewing {user.fullName}</span>
            <button type="button" onClick={onExitImpersonation} className="font-semibold underline cursor-pointer">Exit preview</button>
          </div>
        </div>
      )}
      {/* Utility strip */}
      <div className="bg-[#F4F5F6] border-b border-[#E4E6E8]">
        <div className="max-w-[1260px] mx-auto px-4 sm:px-8 h-[30px] flex items-center justify-end gap-3 text-[11.5px] text-[#5C5C5C]">
          <button type="button" onClick={onBackHome} className="hover:underline cursor-pointer">{t('Chase.com', 'Chase.com')}</button>
          <span className="text-[#C9CDD1]">|</span>
          <button type="button" onClick={() => go('locations')} className="hover:underline cursor-pointer">{t('ATMs & branches', 'Cajeros y sucursales')}</button>
          <span className="text-[#C9CDD1]">|</span>
          <button type="button" onClick={() => go('messages')} className="hover:underline cursor-pointer inline-flex items-center gap-1">
            {t('Secure messages', 'Mensajes seguros')}
            {unreadAdvisorMessages > 0 && (
              <span className="px-1.5 py-px rounded-full bg-[#D92D20] text-white text-[10px] font-bold">
                {unreadAdvisorMessages}
              </span>
            )}
          </button>
          <span className="text-[#C9CDD1]">|</span>
          <button type="button" onClick={() => go('security')} className="hover:underline cursor-pointer">{t('Security center', 'Centro de seguridad')}</button>
          <span className="text-[#C9CDD1]">|</span>
          <button type="button" onClick={onToggleSpanish} className="hover:underline cursor-pointer">{spanishMode ? 'English' : 'Español'}</button>
        </div>
      </div>

      {/* Real Chase Online dark navy header */}
      <header style={{ backgroundColor: NAVY }} className="text-white">
        <div className="max-w-[1260px] mx-auto px-4 sm:px-8">
          <div className="h-[58px] flex items-center justify-between gap-4">
            <button type="button" onClick={() => go('accounts')} aria-label="Chase home" className="shrink-0 cursor-pointer">
              <ChaseLogo variant="white" />
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="dashboard-menu"
                className="md:hidden p-2 hover:bg-white/10 rounded cursor-pointer"
              >
                {menuOpen ? <X className="w-[20px] h-[20px]" /> : <Menu className="w-[20px] h-[20px]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setAlertsOpen(false);
                }}
                aria-label="Search accounts, payees, settings, offers, and transactions"
                aria-expanded={searchOpen}
                aria-controls="dashboard-search"
                className="p-2 hover:bg-white/10 rounded cursor-pointer"
              >
                <Search className="w-[17px] h-[17px]" />
              </button>
              <button
                type="button"
                onClick={() => go('messages')}
                aria-label={unreadAdvisorMessages ? `Secure messages, ${unreadAdvisorMessages} unread` : 'Secure messages'}
                className="relative p-2 hover:bg-white/10 rounded cursor-pointer"
                title="Secure Message Center"
              >
                <Mail className="w-[17px] h-[17px]" />
                {unreadAdvisorMessages > 0 && (
                  <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[#D92D20] text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadAdvisorMessages}
                  </span>
                )}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setAlertsOpen((v) => !v);
                    setSearchOpen(false);
                  }}
                  aria-label={unreadAlerts ? `Alerts, ${unreadAlerts} unread` : 'Alerts'}
                  aria-expanded={alertsOpen}
                  aria-controls="dashboard-alerts"
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
                    id="dashboard-alerts"
                    className="absolute right-0 top-[42px] w-[min(360px,calc(100vw-32px))] bg-white text-[#131313] border rounded-[6px] shadow-[0_16px_40px_rgba(0,20,50,0.25)] z-50 overflow-hidden"
                    style={{ borderColor: LINE }}
                  >
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
                      <h2 className="text-[14px] font-semibold">Alerts</h2>
                      {unreadAlerts > 0 && (
                        <button type="button" onClick={markAlertsRead} className="text-[12px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    {alerts.length === 0 ? (
                      <p className="px-4 py-5 text-[13px]" style={{ color: MUTED }}>You're all caught up.</p>
                    ) : (
                      <ul className="max-h-[360px] overflow-y-auto">
                        {alerts.map((alert) => (
                          <li key={alert.id} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAlertsOpen(false);
                                alert.action();
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-[#F7FAFD] cursor-pointer"
                            >
                              <span className="block text-[13px] font-semibold" style={{ color: INK }}>{alert.title}</span>
                              <span className="block mt-0.5 text-[12px] leading-relaxed" style={{ color: MUTED }}>{alert.detail}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <span className="hidden md:inline text-[12.5px] text-white/80">
                {t('Welcome', 'Bienvenido')}, {firstName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="border border-white/45 hover:bg-white/10 text-white text-[12.5px] font-semibold px-3.5 py-1.5 rounded-[4px] cursor-pointer"
              >
                {t('Sign out', 'Cerrar sesión')}
              </button>
            </div>
          </div>

          {/* Primary nav row (tablet and desktop) */}
          <nav aria-label="Online banking sections" className="hidden md:flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-none">
            {navItems.filter((item) => !(isMobile && item.id === 'pay')).map((item) => {
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-3 text-[13px] whitespace-nowrap border-b-[3px] cursor-pointer ${
                    active ? 'border-white text-white font-semibold' : 'border-transparent text-white/75 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {searchOpen && (
          <div id="dashboard-search" className="border-t border-white/15" style={{ backgroundColor: NAVY }}>
            <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-3">
              <div className="relative max-w-[720px]" role="search">
                <Search className="w-4 h-4 text-[#5C5C5C] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults[0]) {
                      e.preventDefault();
                      runSearchResult(searchResults[0]);
                    }
                    if (e.key === 'Escape') setSearchOpen(false);
                  }}
                  placeholder="Search accounts, payees, settings, offers, or transactions"
                  aria-label="Search accounts, payees, settings, offers, or transactions"
                  className="w-full h-11 pl-10 pr-10 rounded-[4px] bg-white text-[#131313] text-[16px] md:text-[14px] outline-none"
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
                <div className="mt-2 max-w-[720px] bg-white rounded-[6px] overflow-hidden shadow-[0_16px_40px_rgba(0,20,50,0.25)]">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-4 text-[13px]" style={{ color: MUTED }}>
                      No matches for “{searchQuery}”. Try an account name, section, or merchant.
                    </p>
                  ) : (
                    <ul>
                      {searchResults.map((result) => (
                        <li key={result.key} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                          <button
                            type="button"
                            onClick={() => runSearchResult(result)}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#F7FAFD] cursor-pointer"
                          >
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold truncate" style={{ color: INK }}>{result.label}</span>
                              <span className="block text-[12px] truncate" style={{ color: MUTED }}>{result.detail}</span>
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-wide shrink-0" style={{ color: BTN_BLUE }}>
                              {result.type}
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

        {/* Phone menu drawer */}
        {menuOpen && (
          <nav
            id="dashboard-menu"
            aria-label="Online banking sections"
            className="md:hidden border-t border-white/15 max-h-[70vh] overflow-y-auto"
            style={{ backgroundColor: NAVY }}
          >
            <ul className="px-4 py-2">
              {navItems.filter((item) => !(isMobile && item.id === 'pay')).map((item) => {
                const active = activeNav === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => go(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center justify-between py-3 text-left text-[15px] border-b border-white/10 cursor-pointer ${
                        active ? 'text-white font-semibold' : 'text-white/80'
                      }`}
                    >
                      {item.label}
                      <ChevronRight className="w-4 h-4 opacity-60" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-3 flex gap-4 text-[13px] text-white/75">
              <button type="button" onClick={onBackHome} className="underline cursor-pointer">Chase.com</button>
              <button type="button" onClick={onSignOut} className="underline cursor-pointer">Sign out</button>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {!dashboardReady && <DashboardSkeleton />}
        {dashboardReady && (
        <>
        {user.accountNotice && (
          <div
            role="status"
            className={`border-b ${
              user.accountNotice.tone === 'urgent'
                ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#912018]'
                : user.accountNotice.tone === 'warning'
                ? 'bg-[#FFFAEB] border-[#FEDF89] text-[#93370D]'
                : user.accountNotice.tone === 'success'
                ? 'bg-[#EAF7EE] border-[#B5E2C4] text-[#14532D]'
                : 'bg-[#F0F7FD] border-[#B9DCFA] text-[#0B5FA5]'
            }`}
          >
            <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold mr-2">{user.accountNotice.title}:</span>
                  <span>{user.accountNotice.message}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => go('messages')}
                  className="text-[12px] font-bold underline cursor-pointer"
                >
                  Reply via Secure Messages
                </button>
                {user.accountNotice.dismissible !== false && (
                  <button
                    type="button"
                    onClick={handleDismissNotice}
                    aria-label="Dismiss account notice"
                    className="p-1 rounded hover:bg-black/5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* ============================== ACCOUNTS ============================== */}
        {view === 'accounts' && (
          <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b" style={{ borderColor: LINE }}>
              <div>
                <h1 className="text-[26px] font-light" style={{ color: INK }}>{t('Accounts', 'Cuentas')}</h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
                  <Clock className="w-3.5 h-3.5" />
                  {t('Last updated', 'Última actualización')} {new Date().toLocaleString(spanishMode ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <OutlineBtn size="sm" onClick={() => onOpenAccount()}>
                  <Plus className="w-3.5 h-3.5" /> {t('Open an account', 'Abrir una cuenta')}
                </OutlineBtn>
                <OutlineBtn size="sm" onClick={() => go('statements')}>
                  <FileText className="w-3.5 h-3.5" /> {t('Statements', 'Estados de cuenta')}
                </OutlineBtn>
              </div>
            </div>

            {/* Net worth & balances summary */}
            <section className="mt-5 border rounded-[6px] bg-white" style={{ borderColor: LINE }}>
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#E4E6E8]">
                {[
                  { label: t('Net worth', 'Patrimonio neto'), value: netWorth, hint: t('Bank + J.P. Morgan − debt', 'Banco + J.P. Morgan − deuda') },
                  { label: t('Bank accounts', 'Cuentas bancarias'), value: totalBank, hint: `${deposits.length} ${t(deposits.length === 1 ? 'account' : 'accounts', deposits.length === 1 ? 'cuenta' : 'cuentas')}` },
                  { label: t('Investments', 'Inversiones'), value: totalInvestments, hint: t('J.P. Morgan Self-Directed', 'J.P. Morgan autodirigido') },
                  { label: t('Credit cards', 'Tarjetas de crédito'), value: totalCards, hint: `${cards.length} ${t(cards.length === 1 ? 'card' : 'cards', cards.length === 1 ? 'tarjeta' : 'tarjetas')} · ${t('balance owed', 'saldo adeudado')}` },
                ].map((item, i) => (
                  <div key={item.label} className={`px-4 sm:px-5 py-4 ${i > 1 ? 'border-t lg:border-t-0' : ''}`}>
                    <p className="text-[12px]" style={{ color: MUTED }}><Dotted>{item.label}</Dotted></p>
                    <p className="mt-1.5 text-[24px] leading-none font-light" style={{ color: INK }}>{fmtMoney(item.value)}</p>
                    <p className="mt-1.5 text-[11.5px]" style={{ color: '#8A929A' }}>{item.hint}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick actions with Official Chase Icons & real Zelle logo */}
            <section className="mt-5">
              <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: INK }}>{t('Things you can do', 'Cosas que puede hacer')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {[
                  { label: t('Transfer money', 'Transferir dinero'), icon: <ChaseIcon name="checkMultiple" size={24} />, action: () => goPay('transfer') },
                  { label: t('Send with Zelle®', 'Enviar con Zelle®'), icon: <ZelleLogo className="h-[22px] w-auto" />, action: () => goPay('zelle') },
                  { label: t('Deposit a check', 'Depositar un cheque'), icon: <Camera className="w-5 h-5" style={{ color: BTN_BLUE }} />, action: () => goPay('deposit') },
                  { label: t('Pay credit card', 'Pagar tarjeta de crédito'), icon: <ChaseIcon name="creditCards" size={24} />, action: () => goPay('paycard') },
                  { label: t('Pay a loan', 'Pagar un préstamo'), icon: <ChaseIcon name="house" size={24} />, action: () => goPay('loan') },
                  { label: t('Book Chase Travel℠', 'Reservar con Chase Travel℠'), icon: <ChaseIcon name="planeTravel" size={24} />, action: () => go('travel') },
                ].filter((a) => !(isMobile && a.label === 'Transfer money')).map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.action}
                    className="flex flex-col items-start gap-2.5 p-3.5 border rounded-[6px] bg-white hover:bg-[#F7FAFD] cursor-pointer text-left"
                    style={{ borderColor: LINE }}
                  >
                    <span className="h-6 flex items-center">{a.icon}</span>
                    <span className="text-[13px] font-semibold leading-snug" style={{ color: INK }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Account groups */}
              <div className="lg:col-span-8">
                {groups.map((g) => (
                  <section key={g.key} className="mb-5">
                    <div className="flex items-baseline justify-between mb-2">
                      <h2 className="text-[15px] font-semibold" style={{ color: INK }}>{spanishMode ? ({ bank: 'Cuentas bancarias', cards: 'Tarjetas de crédito', loans: 'Préstamos y líneas de crédito' } as Record<string,string>)[g.key] : g.label}</h2>
                      <span className="text-[12px]" style={{ color: MUTED }}>
                        {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="border rounded-[6px] bg-white overflow-hidden" style={{ borderColor: LINE }}>
                      {g.accounts.map((account, idx) => {
                        const isOpen = expanded === account.id;
                        return (
                          <div key={account.id} className={idx > 0 ? 'border-t' : ''} style={{ borderColor: LINE }}>
                            <div className="flex items-center gap-3 sm:gap-4 px-4 py-3.5 hover:bg-[#FAFBFC]">
                              {account.type === 'credit-card' || account.type === 'checking' ? (
                                <CardArt account={account} className="w-[70px] h-[44px]" />
                              ) : (
                                <span className="w-[70px] h-[44px] rounded-[5px] bg-[#EEF3F8] flex items-center justify-center shrink-0">
                                  {accountIcon(account.type)}
                                </span>
                              )}

                              <button type="button" onClick={() => openAccount(account.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                                <span className="flex items-center gap-2">
                                  <span className="text-[14.5px] font-semibold text-[#1A4488] hover:underline truncate">
                                    {account.nickname?.trim() || account.name}
                                  </span>
                                  {account.locked && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#B42318]">
                                      Locked
                                    </span>
                                  )}
                                </span>
                                <span className="block text-[12px]" style={{ color: MUTED }}>
                                  Account ending in {account.mask}
                                  {account.type === 'credit-card' && account.creditLimit
                                    ? ` · Available credit ${fmtMoney(Math.max(0, account.creditLimit - account.balance))}`
                                    : (account.type === 'auto-loan' || account.type === 'mortgage') && account.monthlyPayment
                                      ? ` · ${account.type === 'mortgage' ? 'Monthly payment' : 'Next payment'} ${fmtMoney(account.monthlyPayment)}`
                                      : ''}
                                </span>
                              </button>

                              <button type="button" onClick={() => openAccount(account.id)} className="text-right shrink-0 cursor-pointer">
                                <span className="block text-[19px] leading-tight font-light" style={{ color: INK }}>
                                  {fmtMoney(account.balance)}
                                </span>
                                <span className="block text-[10.5px] uppercase tracking-[0.03em]" style={{ color: '#8A929A' }}>
                                  {balanceLabel(account)}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setExpanded(isOpen ? null : account.id)}
                                aria-label={isOpen ? `Hide ${account.name} activity` : `Show ${account.name} activity`}
                                className="p-1.5 text-[#5C5C5C] hover:text-[#1A4488] cursor-pointer"
                              >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </div>

                            {isOpen && (
                              <div className="border-t bg-[#FAFBFC]" style={{ borderColor: LINE }}>
                                <div className="px-4 py-2.5 flex items-center justify-between">
                                  <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                                    Recent activity ({account.transactions.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openAccount(account.id)}
                                    className="text-[12.5px] font-semibold hover:underline cursor-pointer"
                                    style={{ color: BTN_BLUE }}
                                  >
                                    View all activity
                                  </button>
                                </div>
                                {account.transactions.length === 0 ? (
                                  <p className="px-4 pb-3 text-[12.5px]" style={{ color: MUTED }}>No posted transactions yet.</p>
                                ) : (
                                  <ul className="px-4">
                                    {sortTransactionsDesc(account.transactions).slice(0, 6).map((t) => (
                                      <li key={t.id} className="border-t border-[#EDEFF0]">
                                        <button
                                          type="button"
                                          onClick={() => setDetailTx({ tx: t, account })}
                                          className="w-full flex items-center gap-3 py-2 text-left text-[12.5px] hover:bg-[#F2F5F8] -mx-2 px-2 rounded cursor-pointer"
                                        >
                                          <span className="w-[84px] shrink-0" style={{ color: MUTED }}>{fmtDate(t.date)}</span>
                                          <span className="flex-1 min-w-0 truncate" style={{ color: INK }}>{cleanTxDesc(t.description)}</span>
                                          <span className={`shrink-0 font-medium ${t.amount < 0 ? '' : 'text-[#138842]'}`}>
                                            {t.amount < 0 ? `-${fmtMoney(Math.abs(t.amount))}` : fmtMoney(t.amount)}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {/* Recent transactions across all accounts */}
                {allRecentActivity.length > 0 && (
                  <section className="mb-5">
                    <div className="flex items-baseline justify-between mb-2">
                      <h2 className="text-[15px] font-semibold" style={{ color: INK }}>
                        {t('Recent transactions', 'Transacciones recientes')}
                      </h2>
                      <span className="text-[12px]" style={{ color: MUTED }}>
                        {allRecentActivity.length} transaction{allRecentActivity.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="border rounded-[6px] bg-white overflow-hidden" style={{ borderColor: LINE }}>
                      <ul className="divide-y divide-[#EFF0F1]">
                        {(showAllOverviewTx ? allRecentActivity : allRecentActivity.slice(0, 8)).map(({ tx, account }) => (
                          <li key={`${account.id}-${tx.id}`}>
                            <button
                              type="button"
                              onClick={() => setDetailTx({ tx, account })}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FAFBFC] cursor-pointer"
                            >
                              <span className="w-[84px] shrink-0 text-[12px]" style={{ color: MUTED }}>{fmtDate(tx.date)}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13.5px] truncate" style={{ color: INK }}>{cleanTxDesc(tx.description)}</span>
                                <span className="block text-[11px] truncate" style={{ color: '#8A929A' }}>
                                  {account.nickname?.trim() || account.name} (…{account.mask}) · {tx.category}
                                </span>
                              </span>
                              <span className={`text-[13.5px] font-medium shrink-0 ${tx.amount < 0 ? '' : 'text-[#138842]'}`}>
                                {tx.amount < 0 ? `-${fmtMoney(Math.abs(tx.amount))}` : fmtMoney(tx.amount)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {allRecentActivity.length > 8 && (
                        <div className="px-4 py-2.5 border-t bg-[#FAFBFC]" style={{ borderColor: LINE }}>
                          <button
                            type="button"
                            onClick={() => setShowAllOverviewTx((v) => !v)}
                            className="text-[12.5px] font-semibold hover:underline cursor-pointer"
                            style={{ color: BTN_BLUE }}
                          >
                            {showAllOverviewTx ? 'Show fewer transactions' : `Show all ${allRecentActivity.length} transactions`}
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Integrated J.P. Morgan Investments account group (just like real secure.chase.com) */}
                <section className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Investments by J.P. Morgan</h2>
                    <JpmwmLogo className="h-[16px] w-auto opacity-85" />
                  </div>
                  <button
                    type="button"
                    onClick={() => go('investments')}
                    className="w-full border rounded-[6px] bg-white hover:bg-[#FAFBFC] px-4 py-3.5 flex items-center gap-4 text-left cursor-pointer"
                    style={{ borderColor: LINE }}
                  >
                    <span className="w-[70px] h-[44px] rounded-[5px] bg-[#EEF3F8] flex items-center justify-center shrink-0">
                      <ChaseIcon name="chartLine" size={24} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-semibold text-[#1A4488]">
                        J.P. Morgan Self-Directed Investing
                      </span>
                      <span className="block text-[12px]" style={{ color: MUTED }}>
                        Account ending in {inv.accountMask} · {inv.holdings.length} holdings · {fmtMoney(inv.cash)} buying power
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[19px] leading-tight font-light" style={{ color: INK }}>
                        {fmtMoney(totalInvestments)}
                      </span>
                      <span className="block text-[10.5px] uppercase tracking-[0.03em]" style={{ color: '#8A929A' }}>
                        Total value
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#8A929A] shrink-0 hidden sm:block" />
                  </button>
                </section>
              </div>

              {/* Right rail — 100% real merchant brand logos */}
              <aside className="lg:col-span-4 space-y-4">
                <div className="border rounded-[6px] bg-white overflow-hidden" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between px-4 pt-4">
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Chase Offers</h2>
                    <button
                      type="button"
                      onClick={() => go('offers')}
                      className="inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="min-w-[24px] h-[20px] px-1.5 rounded-full bg-[#1A4488] text-white text-[11.5px] font-semibold flex items-center justify-center">
                        {OFFERS.length}
                      </span>
                      <ChevronRight className="w-4 h-4" style={{ color: BTN_BLUE }} />
                    </button>
                  </div>
                  <p className="px-4 mt-0.5 text-[12px]" style={{ color: MUTED }}>Add deals, shop and get cash back</p>
                  <ul className="p-4 space-y-2">
                    {OFFERS.slice(0, 4).map((o) => {
                      const added = addedOffers.includes(o.id);
                      return (
                        <li key={o.id} className="flex items-center gap-2.5 border rounded-[5px] p-2.5" style={{ borderColor: LINE }}>
                          <BrandLogo brand={o.brand} alt={o.merchant} size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11.5px]" style={{ color: MUTED }}>{o.merchant}</span>
                            <span className="block text-[13px] font-semibold" style={{ color: INK }}>{o.value}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setAddedOffers((p) => (added ? p.filter((x) => x !== o.id) : [...p, o.id]))}
                            aria-label={added ? `Remove ${o.merchant}` : `Add ${o.merchant}`}
                            className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                              added ? 'bg-[#1A4488] border-[#1A4488] text-white' : 'text-[#1A4488] hover:bg-[#F2F6FB]'
                            }`}
                            style={{ borderColor: BTN_BLUE }}
                          >
                            {added ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="px-4 pb-3.5">
                    <button type="button" onClick={() => go('offers')} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                      See all {OFFERS.length} Chase Offers
                    </button>
                  </div>
                </div>

                {/* Credit Journey */}
                <div className="border rounded-[6px] bg-white p-4" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Credit Journey®</h2>
                    <ChaseIcon name="creditScore" size={22} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-[86px] shrink-0">
                      <svg viewBox="0 0 120 72" className="w-full h-auto" aria-hidden="true">
                        <path d="M 12 62 A 48 48 0 0 1 108 62" fill="none" stroke="#E9E9E9" strokeWidth="11" strokeLinecap="round" />
                        <path d="M 12 62 A 48 48 0 0 1 99 34" fill="none" stroke="#138842" strokeWidth="11" strokeLinecap="round" />
                        <text x="60" y="54" textAnchor="middle" className="fill-[#131313] font-semibold" style={{ fontSize: '24px' }}>782</text>
                      </svg>
                    </div>
                    <div>
                      <p className="text-[12.5px] font-semibold text-[#138842]">Very good</p>
                      <p className="text-[11.5px]" style={{ color: MUTED }}>VantageScore® 3.0 · Experian®</p>
                      <p className="text-[11.5px]" style={{ color: MUTED }}>Updated weekly</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => go('credit')} className="mt-2.5 text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                    View your Credit Journey®
                  </button>
                </div>

                {/* Ultimate Rewards */}
                <div className="border rounded-[6px] bg-white p-4" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Ultimate Rewards®</h2>
                    <ChaseIcon name="planeTravel" size={22} />
                  </div>
                  <p className="mt-1 text-[24px] font-light" style={{ color: INK }}>{points.toLocaleString()}</p>
                  <p className="text-[11.5px] mb-3" style={{ color: MUTED }}>Points available · Worth up to {fmtMoney((points * 1.25) / 100)} in Chase Travel℠</p>
                  <SolidBtn onClick={() => go('travel')}>Redeem points</SolidBtn>
                </div>

                {/* Help */}
                <div className="border rounded-[6px] bg-[#F7FAFD] p-4" style={{ borderColor: '#CFE0F0' }}>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" style={{ color: BTN_BLUE }} />
                    <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Need help?</h2>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-[12.5px]">
                    <li>
                      <button type="button" onClick={() => go('locations')} className="inline-flex items-center gap-1.5 hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                        <MapPin className="w-3.5 h-3.5" /> Find an ATM or branch
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => go('security')} className="inline-flex items-center gap-1.5 hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                        <ShieldCheck className="w-3.5 h-3.5" /> Lock a misplaced card
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => go('advisors')} className="inline-flex items-center gap-1.5 hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                        <Clock className="w-3.5 h-3.5" /> Meet with a Chase Advisor
                      </button>
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* ====================== CREDIT CARD ACCOUNT PAGE ====================== */}
        {view === 'account' && selected?.type === 'credit-card' && (
          <CreditCardPage
            account={selected}
            user={user}
            onUpdateUser={onUpdateUser}
            onBack={() => go('accounts')}
            onPay={() => goPay('paycard')}
            onStatements={() => go('statements')}
            onSettings={goSettings}
            onSecurity={() => go('security')}
            onTravel={() => go('travel')}
            onOffers={() => go('offers')}
          />
        )}

        {/* ==================== BANK & LOAN ACCOUNT DETAIL ==================== */}
        {view === 'account' && selected && !['credit-card'].includes(selected.type) && (
          <div>
            <div className="max-w-[1260px] mx-auto px-4 sm:px-8 pt-4">
              <button type="button" onClick={() => go('accounts')} className="inline-flex items-center gap-1.5 text-[13px] hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                <ArrowLeft className="w-4 h-4" /> Accounts
              </button>
            </div>

            <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-5">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex-1 min-w-[280px]">
                  <h1 className="text-[21px] font-light" style={{ color: INK }}>
                    {selected.nickname?.trim() || selected.name} <span style={{ color: '#8A929A' }}>(…{selected.mask})</span>
                  </h1>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-[14px]" style={{ color: '#353535' }}>
                      <Dotted>
                        {selected.type === 'credit-card'
                          ? 'Current balance'
                          : selected.type === 'auto-loan'
                            ? 'Loan balance'
                            : 'Available balance'}
                      </Dotted>
                    </span>
                    <span className="text-[#C9CDD1]">|</span>
                    <button
                      type="button"
                      onClick={() => setShowDetails((v) => !v)}
                      className="inline-flex items-center gap-1 text-[14px] font-semibold hover:underline cursor-pointer"
                      style={{ color: BTN_BLUE }}
                    >
                      {showDetails ? 'Hide details' : 'Show details'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  <p className="mt-1.5 flex items-baseline" style={{ color: INK }}>
                    <span className="text-[44px] leading-none font-light">{fmtMoney(selected.balance).split('.')[0]}</span>
                    <span className="text-[25px] leading-none font-light">.{fmtMoney(selected.balance).split('.')[1]}</span>
                  </p>
                  <p className="mt-1.5 text-[12.5px]" style={{ color: MUTED }}>{balanceLabel(selected)}</p>

                  {showDetails && (
                    <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t pt-4 max-w-[620px]" style={{ borderColor: LINE }}>
                      {(isLoan(selected)
                        ? [
                            { k: 'Remaining balance', v: fmtMoney(selected.balance) },
                            { k: 'Monthly payment', v: fmtMoney(selected.monthlyPayment || 0) },
                            { k: 'Next payment due', v: fmtDueDate(nextDueDate(user.home?.dueDay ?? 1)) },
                            { k: 'Interest rate', v: `${selected.apr ?? 0}%` },
                          ]
                        : [
                            { k: 'Statement balance', v: fmtMoney(selected.balance) },
                            { k: 'Minimum payment due', v: fmtMoney(Math.min(selected.balance, Math.max(35, selected.balance * 0.02))) },
                            { k: 'Payment due date', v: fmtDueDate(nextDueDate(user.home?.dueDay ?? 1)) },
                            { k: selected.type === 'credit-card' ? 'Purchase APR' : 'APY', v: `${selected.apr ?? 0.01}%` },
                          ]
                      ).map((r) => (
                        <div key={r.k}>
                          <dt className="text-[11px]" style={{ color: '#8A929A' }}>{r.k}</dt>
                          <dd className="mt-0.5 text-[13.5px]" style={{ color: INK }}>{r.v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                <div className="flex flex-col items-end gap-4">
                  {(selected.type === 'credit-card' || selected.type === 'checking') && (
                    <CardArt account={selected} className="w-[116px] h-[74px]" />
                  )}
                  <div className="flex items-center gap-6 sm:gap-8 text-right">
                    {selected.type === 'credit-card' ? (
                      <>
                        <div>
                          <p className="text-[14px]" style={{ color: '#353535' }}>
                            {fmtMoney(Math.max(0, (selected.creditLimit || 0) - selected.balance))}
                          </p>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Available credit</p>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleAccountControl(selected, { autopay: !selected.autopay })}
                            className="text-[14px] font-semibold hover:underline cursor-pointer"
                            style={{ color: selected.autopay ? '#138842' : BTN_BLUE }}
                          >
                            {selected.autopay ? 'On' : 'Off · Set up'}
                          </button>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Automatic payments</p>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => go('travel')}
                            className="text-[14px] font-semibold hover:underline cursor-pointer"
                            style={{ color: BTN_BLUE }}
                          >
                            {(selected.rewardsPoints || 0).toLocaleString()}
                          </button>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Ultimate Rewards® points</p>
                        </div>
                      </>
                    ) : isLoan(selected) ? (
                      <>
                        <div>
                          <p className="text-[14px]" style={{ color: '#353535' }}>{fmtMoney(selected.monthlyPayment || 0)}</p>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Monthly payment</p>
                        </div>
                        <div>
                          <p className="text-[14px]" style={{ color: '#353535' }}>{selected.apr}%</p>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Interest rate</p>
                        </div>
                        <div>
                          <p className="text-[14px]" style={{ color: '#353535' }}>{fmtDueDate(nextDueDate(user.home?.dueDay ?? 1))}</p>
                          <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Next due</p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-[14px]" style={{ color: '#353535' }}>{selected.transactions.length}</p>
                        <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Recent transactions</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <hr className="mt-5" style={{ borderColor: LINE }} />

              <div className="mt-4 flex flex-wrap gap-2.5">
                {selected.type === 'credit-card' ? (
                  <>
                    <OutlineBtn onClick={() => goPay('paycard')}>Pay card</OutlineBtn>
                    <OutlineBtn onClick={() => go('statements')}>Statements</OutlineBtn>
                    <OutlineBtn onClick={() => toggleAccountControl(selected, { locked: !selected.locked })}>
                      {selected.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {selected.locked ? 'Unlock card' : 'Lock card'}
                    </OutlineBtn>
                    <OutlineBtn onClick={() => go('travel')}>Redeem points</OutlineBtn>
                  </>
                ) : isLoan(selected) ? (
                  <>
                    <OutlineBtn onClick={() => goPay('loan')}>Make a payment</OutlineBtn>
                    <OutlineBtn onClick={() => go('statements')}>Statements</OutlineBtn>
                    <OutlineBtn onClick={() => downloadStatement(selected)}>Download statement</OutlineBtn>
                    {selected.type === 'mortgage' && (
                      <OutlineBtn onClick={() => go('myhome')}>Chase MyHome®</OutlineBtn>
                    )}
                  </>
                ) : (
                  <>
                    {!isMobile && <OutlineBtn onClick={() => goPay('transfer')}>Transfer money</OutlineBtn>}
                    <OutlineBtn onClick={() => goPay('deposit')}>Deposit check</OutlineBtn>
                    <OutlineBtn onClick={() => downloadStatement(selected)}>Download statement</OutlineBtn>
                    {selected.type === 'checking' && (
                      <OutlineBtn onClick={() => toggleAccountControl(selected, { locked: !selected.locked })}>
                        {selected.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        {selected.locked ? 'Unlock debit card' : 'Lock debit card'}
                      </OutlineBtn>
                    )}
                  </>
                )}
              </div>

              {controlMsg && <div className="mt-4 max-w-[540px]"><NoticeBox msg={controlMsg} /></div>}
            </div>

            <div className="bg-[#F4F5F6] border-t" style={{ borderColor: LINE }}>
              <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-8">
                  <div className="bg-white border rounded-[6px] overflow-hidden" style={{ borderColor: LINE }}>
                    <div className="px-4 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Account activity</h2>
                        <p className="text-[11.5px]" style={{ color: MUTED }}>
                          Showing {visibleTxns.length} of {txns.length} transaction{txns.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A929A]" />
                          <input
                            type="search"
                            value={txSearch}
                            onChange={(e) => setTxSearch(e.target.value)}
                            placeholder="Search transactions"
                            aria-label="Search account transactions"
                            className="pl-8 pr-2.5 py-1 text-[12px] border rounded-[4px] w-[165px] focus:outline-none focus:border-[#1A4488]"
                            style={{ borderColor: LINE, color: INK }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          {(['all', 'in', 'out'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setTxFilter(f)}
                              className={`px-3 py-1.5 text-[12px] font-semibold rounded-[3px] cursor-pointer ${
                                txFilter === f ? 'bg-[#1A4488] text-white' : 'text-[#353535] hover:bg-[#F2F6FB]'
                              }`}
                            >
                              {f === 'all'
                                ? 'All'
                                : f === 'in'
                                  ? selected.type === 'credit-card' ? 'Purchases' : 'Deposits'
                                  : selected.type === 'credit-card' ? 'Payments' : 'Withdrawals'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {visibleTxns.length === 0 ? (
                      <p className="px-4 py-8 text-center text-[13px]" style={{ color: MUTED }}>No transactions to show.</p>
                    ) : (
                      <ul className="px-4">
                        {visibleTxns.map((t, i) => (
                          <li key={t.id} className={i > 0 ? 'border-t' : ''} style={{ borderColor: '#EFF0F1' }}>
                            <button
                              type="button"
                              onClick={() => setDetailTx({ tx: t, account: selected })}
                              className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#FAFBFC] -mx-2 px-2 rounded cursor-pointer"
                            >
                              <span className="w-[84px] shrink-0 text-[12px]" style={{ color: MUTED }}>{fmtDate(t.date)}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13.5px] truncate" style={{ color: INK }}>{cleanTxDesc(t.description)}</span>
                                <span className="block text-[11px]" style={{ color: '#8A929A' }}>
                                  {t.category}{t.status === 'pending' ? ' · Pending' : ''}
                                </span>
                              </span>
                              <span className={`text-[13.5px] font-medium shrink-0 ${t.amount < 0 ? '' : 'text-[#138842]'}`}>
                                {t.amount < 0 ? `-${fmtMoney(Math.abs(t.amount))}` : fmtMoney(t.amount)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {txns.length > 25 && (
                      <div className="px-4 py-3 border-t" style={{ borderColor: '#EFF0F1' }}>
                        <button type="button" onClick={() => setShowAllTx((v) => !v)} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                          {showAllTx ? 'Show fewer transactions' : `Show all ${txns.length} transactions`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <aside className="lg:col-span-4 space-y-4">
                  <div className="bg-white border rounded-[6px] p-4" style={{ borderColor: LINE }}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Account details</h2>
                      {(selected.type === 'checking' || selected.type === 'savings' || selected.type === 'cd') && (
                        <button
                          type="button"
                          onClick={() => setShowAcctNums((v) => !v)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline cursor-pointer"
                          style={{ color: BTN_BLUE }}
                        >
                          {showAcctNums ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {showAcctNums ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    <dl className="mt-2.5 space-y-2 text-[12.5px]">
                      {(selected.type === 'checking' || selected.type === 'savings' || selected.type === 'cd') ? (
                        <>
                          <div className="flex justify-between items-center gap-2 border-b border-[#EFF0F1] pb-2">
                            <dt style={{ color: MUTED }}>Routing number</dt>
                            <dd className="flex items-center gap-1.5 font-mono" style={{ color: INK }}>
                              <span>{showAcctNums ? (selected.routingNumber || '021000021') : `•••••${(selected.routingNumber || '021000021').slice(-4)}`}</span>
                              <button
                                type="button"
                                onClick={() => copyDetail('routing', selected.routingNumber || '021000021')}
                                className="p-0.5 rounded hover:bg-[#F2F6FB] cursor-pointer"
                                style={{ color: BTN_BLUE }}
                                title="Copy routing number"
                              >
                                {copiedDetail === 'routing' ? <Check className="w-3.5 h-3.5 text-[#0F7B45]" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </dd>
                          </div>
                          <div className="flex justify-between items-center gap-2 border-b border-[#EFF0F1] pb-2">
                            <dt style={{ color: MUTED }}>Account number</dt>
                            <dd className="flex items-center gap-1.5 font-mono" style={{ color: INK }}>
                              <span>{showAcctNums ? (selected.accountNumber || `000000${selected.mask || '0000'}`) : `••••••${(selected.accountNumber || selected.mask || '0000').slice(-4)}`}</span>
                              <button
                                type="button"
                                onClick={() => copyDetail('account', selected.accountNumber || `000000${selected.mask || '0000'}`)}
                                className="p-0.5 rounded hover:bg-[#F2F6FB] cursor-pointer"
                                style={{ color: BTN_BLUE }}
                                title="Copy account number"
                              >
                                {copiedDetail === 'account' ? <Check className="w-3.5 h-3.5 text-[#0F7B45]" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between gap-3 border-b border-[#EFF0F1] pb-2">
                          <dt style={{ color: MUTED }}>Account number</dt>
                          <dd style={{ color: INK }}>…{selected.mask}</dd>
                        </div>
                      )}
                      {[
                        { k: 'Account type', v: selected.type.replace('-', ' ') },
                        ...(selected.creditLimit ? [{ k: 'Credit limit', v: fmtMoney(selected.creditLimit) }] : []),
                        ...(selected.apr ? [{ k: selected.type === 'credit-card' ? 'Purchase APR' : 'APR', v: `${selected.apr}%` }] : []),
                        { k: 'Card status', v: selected.locked ? 'Locked' : 'Active' },
                        { k: 'Opened', v: fmtDate(selected.openedDate || selected.createdAt) },
                      ].map((r) => (
                        <div key={r.k} className="flex justify-between gap-3 border-b border-[#EFF0F1] pb-2 last:border-b-0">
                          <dt style={{ color: MUTED }}>{r.k}</dt>
                          <dd className="capitalize" style={{ color: INK }}>{r.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {selected.type === 'credit-card' && (
                    <div className="bg-white border rounded-[6px] p-4" style={{ borderColor: LINE }}>
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-[15px] font-semibold" style={{ color: INK }}>New card bonus</h2>
                        <HelpCircle className="w-3.5 h-3.5" style={{ color: '#8A929A' }} />
                      </div>
                      <p className="mt-1.5 text-[12.5px]" style={{ color: '#353535' }}>
                        Spend $4,000 by Aug 1, 2026 to earn 60,000 bonus points.
                      </p>
                      <div className="mt-2.5 h-2 rounded-full bg-[#D8DBDE] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: '68%', backgroundColor: BTN_BLUE }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11.5px]" style={{ color: '#8A929A' }}>
                        <span>$2,720.00 spent</span>
                        <span>$1,280.00 to go</span>
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            </div>
          </div>
        )}

        {/* ============================== PAY & TRANSFER ============================== */}
        {view === 'pay' && (
          <PayTransferHub
            key={payStart}
            user={user}
            onUpdateUser={onUpdateUser}
            initialPage={payStart}
            onOpenAccount={() => onOpenAccount()}
          />
        )}

        {/* ============================= ALL CHASE VIEWS ============================= */}
        {view === 'investments' && <InvestmentsView user={user} onUpdateUser={onUpdateUser} />}
        {view === 'travel' && <TravelView user={user} onUpdateUser={onUpdateUser} />}
        {view === 'spending' && <SpendingView user={user} onUpdateUser={onUpdateUser} />}
        {view === 'security' && <SecurityCenterView user={user} onUpdateUser={onUpdateUser} />}
        {view === 'locations' && <LocationsView onSchedule={() => go('profile')} />}
        {view === 'myhome' && (
          <MyHomeView
            user={user}
            onUpdateUser={onUpdateUser}
            onPayLoan={() => goPay('loan')}
            onOpenAccount={() => onOpenAccount()}
          />
        )}
        {view === 'advisors' && <AdvisorsView user={user} onSchedule={() => go('profile')} />}
        {view === 'ink' && <InkView onApplyProduct={(pid) => onOpenAccount(pid)} />}
        {view === 'offers' && <OffersView user={user} onUpdateUser={onUpdateUser} />}
        {view === 'messages' && <SecureMessagesView user={user} onUpdateUser={onUpdateUser} />}

        {/* ============================== STATEMENTS ============================== */}
        {view === 'statements' && (
          <div className="max-w-[1000px] mx-auto px-4 sm:px-8 py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[26px] font-light" style={{ color: INK }}>Statements &amp; Documents</h1>
                <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
                  View printable Chase-branded monthly statements, export CSV ledgers, and access annual IRS tax forms.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <OutlineBtn size="sm" onClick={() => setStatementModal({ tab: 'tax-1099' })}>
                  <FileText className="w-3.5 h-3.5" /> Form 1099-INT
                </OutlineBtn>
                <OutlineBtn size="sm" onClick={() => setStatementModal({ tab: 'tax-1098' })}>
                  <FileText className="w-3.5 h-3.5" /> Form 1098
                </OutlineBtn>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {user.accounts.map((a) => (
                <div key={a.id} className="border rounded-[6px] overflow-hidden bg-white" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8F9] border-b" style={{ borderColor: LINE }}>
                    <div className="flex items-center gap-3">
                      {a.type === 'credit-card' || a.type === 'checking' ? (
                        <CardArt account={a} className="w-[46px] h-[29px]" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[#EEF3F8] flex items-center justify-center shrink-0">
                          {accountIcon(a.type)}
                        </span>
                      )}
                      <div>
                        <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{a.name}</p>
                        <p className="text-[11.5px]" style={{ color: '#8A929A' }}>Account ending in {a.mask}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatementModal({ accountId: a.id, tab: 'statement' })}
                      className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1A4488] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#143669] cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> View Printable Statement
                    </button>
                  </div>
                  {[0, 1, 2].map((off) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - off);
                    return (
                      <div key={off} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: '#EFF0F1' }}>
                        <FileText className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px]" style={{ color: INK }}>
                            {d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} statement
                          </p>
                          <p className="text-[11px]" style={{ color: '#8A929A' }}>Official Chase monthly statement &amp; CSV activity</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setStatementModal({ accountId: a.id, tab: 'statement' })}
                            className="inline-flex items-center gap-1 text-[12.5px] font-semibold hover:underline cursor-pointer"
                            style={{ color: BTN_BLUE }}
                          >
                            <Printer className="w-3.5 h-3.5" /> Print / PDF
                          </button>
                          <button type="button" onClick={() => downloadStatement(a, off)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
                            <Download className="w-3.5 h-3.5" /> CSV
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'credit' && (
          <CreditJourney user={user} onUpdateUser={onUpdateUser} />
        )}

        {view === 'profile' && (
          <SettingsPage
            key={settingsStart}
            user={user}
            onUpdateUser={onUpdateUser}
            onSignOut={onSignOut}
            initialSection={settingsStart}
          />
        )}
        </>
        )}
      </main>

      <Footer
        variant="dashboard"
        onAction={handleFooterAction}
        onHome={() => go('accounts')}
        userLabel={user.fullName}
      />
      <ScheduleMeetingModal open={footerMeetingOpen} onClose={() => setFooterMeetingOpen(false)} />
      <MortgageCalculatorModal
        open={footerMortgageOpen}
        onClose={() => setFooterMortgageOpen(false)}
        onSchedule={() => setFooterMeetingOpen(true)}
      />
      <AutoLoanModal
        open={footerAutoOpen}
        onClose={() => setFooterAutoOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onEnroll={() => onOpenAccount()}
      />
      {statementModal && (
        <StatementModal
          user={user}
          initialAccountId={statementModal.accountId}
          initialTab={statementModal.tab}
          onClose={() => setStatementModal(null)}
        />
      )}
      {detailTx && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-detail-heading"
          onClick={() => setDetailTx(null)}
        >
          <div
            className="w-full max-w-[440px] bg-white rounded-[8px] shadow-xl border overflow-hidden"
            style={{ borderColor: LINE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: LINE }}>
              <h2 id="tx-detail-heading" className="text-[16px] font-semibold" style={{ color: INK }}>
                Transaction details
              </h2>
              <button
                type="button"
                onClick={() => setDetailTx(null)}
                aria-label="Close transaction details"
                className="p-1 text-[#5C5C5C] hover:text-[#131313] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[15px] font-semibold" style={{ color: INK }}>{detailTx.tx.description}</p>
                <p className={`text-[20px] font-light shrink-0 ${detailTx.tx.amount < 0 ? '' : 'text-[#138842]'}`}>
                  {detailTx.tx.amount < 0 ? `-${fmtMoney(Math.abs(detailTx.tx.amount))}` : fmtMoney(detailTx.tx.amount)}
                </p>
              </div>
              <dl className="space-y-2.5 text-[13px] border-t pt-3" style={{ borderColor: LINE }}>
                {[
                  { k: 'Account', v: `${detailTx.account.nickname?.trim() || detailTx.account.name} (…${detailTx.account.mask})` },
                  { k: 'Date', v: fmtDate(detailTx.tx.date) },
                  { k: 'Category', v: detailTx.tx.category },
                  { k: 'Status', v: detailTx.tx.status === 'pending' ? 'Pending' : 'Posted' },
                  { k: 'Reference ID', v: detailTx.tx.id },
                ].map((row) => (
                  <div key={row.k} className="flex justify-between gap-3">
                    <dt style={{ color: MUTED }}>{row.k}</dt>
                    <dd className="text-right font-medium break-all" style={{ color: INK }}>{row.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: LINE }}>
                {view !== 'account' && (
                  <button
                    type="button"
                    onClick={() => {
                      const acctId = detailTx.account.id;
                      setDetailTx(null);
                      openAccount(acctId);
                    }}
                    className="px-3.5 py-2 text-[12.5px] font-semibold rounded-[4px] border cursor-pointer hover:bg-[#F2F6FB]"
                    style={{ borderColor: BTN_BLUE, color: BTN_BLUE }}
                  >
                    View account
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold rounded-[4px] border cursor-pointer hover:bg-[#F4F5F6]"
                  style={{ borderColor: LINE, color: INK }}
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTx(null)}
                  className="px-4 py-2 text-[12.5px] font-semibold rounded-[4px] text-white cursor-pointer"
                  style={{ background: BTN_BLUE }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankingDashboard;
