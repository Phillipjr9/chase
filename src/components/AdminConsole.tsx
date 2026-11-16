/* -------------------------------------------------------------------------- */
/* Chase Clone — Admin Console shell                                           */
/* Professional dashboard layout patterned after AdminLTE / TailAdmin /        */
/* shadcn-admin: fixed dark sidebar, sticky topbar with global search (⌘K),    */
/* notifications, dark mode, and sectioned pages.                              */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  FileWarning,
  ScrollText,
  Activity,
  Menu,
  X,
  ChevronsLeft,
  Search,
  Bell,
  Moon,
  Sun,
  RefreshCw,
  LogOut,
  Landmark,
  ShieldCheck,
  Flag,
  Gavel,
  Snowflake,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { ChaseLogo } from './ChaseLogo';
import {
  AdminCustomerSummary,
  AdminOverview,
  AdminRange,
  AdminTxRow,
  User,
  adminCustomers,
  adminOverview,
  adminTransactions,
} from '../banking/store';
import { OverviewPage } from './admin/OverviewPage';
import { CustomersPage } from './admin/CustomersPage';
import { TransactionsPage } from './admin/TransactionsPage';
import { DisputesPage } from './admin/DisputesPage';
import { AuditPage } from './admin/AuditPage';
import { SystemPage } from './admin/SystemPage';
import { Avatar, Badge, Btn, ToastStack, fmtMoneyFull, pushToast, relTime } from './admin/ui';
import { cn } from '../utils/cn';

export type AdminPageId = 'overview' | 'customers' | 'transactions' | 'disputes' | 'audit' | 'system';

const PAGES: {
  id: AdminPageId;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  section: string;
}[] = [
  { id: 'overview', label: 'Overview', title: 'Overview', subtitle: 'Bank-wide performance at a glance', icon: <LayoutDashboard className="w-[18px] h-[18px]" />, section: 'Main' },
  { id: 'customers', label: 'Customers', title: 'Customers', subtitle: 'Manage accounts, roles, and access', icon: <Users className="w-[18px] h-[18px]" />, section: 'Management' },
  { id: 'transactions', label: 'Transactions', title: 'Transactions', subtitle: 'Monitor the ledger and review fraud flags', icon: <ArrowLeftRight className="w-[18px] h-[18px]" />, section: 'Management' },
  { id: 'disputes', label: 'Disputes', title: 'Disputes', subtitle: 'Resolve cardholder disputes and refunds', icon: <FileWarning className="w-[18px] h-[18px]" />, section: 'Management' },
  { id: 'audit', label: 'Audit Log', title: 'Audit Log', subtitle: 'Immutable trail of every sensitive action', icon: <ScrollText className="w-[18px] h-[18px]" />, section: 'Insights' },
  { id: 'system', label: 'System Status', title: 'System Status', subtitle: 'Runtime health, database, and API surface', icon: <Activity className="w-[18px] h-[18px]" />, section: 'Insights' },
];

const SECTIONS = ['Main', 'Management', 'Insights'];

interface Props {
  user: User;
  onExitToBanking: () => void;
  onSignOut: () => void;
}

export const AdminConsole: React.FC<Props> = ({ user, onExitToBanking, onSignOut }) => {
  const [page, setPage] = useState<AdminPageId>('overview');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('chase_admin_sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileNav, setMobileNav] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('chase_admin_theme');
      if (saved) return saved === 'dark';
    } catch {
      /* storage unavailable */
    }
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  });

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewRange, setOverviewRange] = useState<AdminRange>('12w');

  const [customerFocus, setCustomerFocus] = useState<string | null>(null);
  const [txFocus, setTxFocus] = useState<string | null>(null);

  /* Topbar popovers */
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /* Global search */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<{ customers: AdminCustomerSummary[]; txs: AdminTxRow[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ------------------------------- Theme --------------------------------- */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('chase_admin_theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [dark]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove('dark');
    },
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem('chase_admin_sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  /* ------------------------------ Overview -------------------------------- */
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      setOverview(await adminOverview(overviewRange));
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load analytics.');
    } finally {
      setOverviewLoading(false);
    }
  }, [overviewRange]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  /* --------------------------- Popover handling ---------------------------- */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bellOpen && bellRef.current && !bellRef.current.contains(target)) setBellOpen(false);
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (searchOpen && searchWrapRef.current && !searchWrapRef.current.contains(target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bellOpen, menuOpen, searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
      if (e.key === 'Escape') {
        setBellOpen(false);
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---------------------------- Global search ------------------------------ */
  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const [c, tx] = await Promise.all([
          adminCustomers({ q, pageSize: 5 }),
          adminTransactions({ q, pageSize: 5 }),
        ]);
        setSearchResults({ customers: c.customers, txs: tx.transactions });
      } catch {
        setSearchResults({ customers: [], txs: [] });
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const openCustomer = (id: string) => {
    setSearchOpen(false);
    setCustomerFocus(id);
    setPage('customers');
  };

  const openTxSearch = (q: string) => {
    setSearchOpen(false);
    setTxFocus(q);
    setPage('transactions');
  };

  const go = (id: AdminPageId) => {
    setPage(id);
    setMobileNav(false);
    setBellOpen(false);
    setMenuOpen(false);
  };

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    loadOverview();
    pushToast('info', 'Refreshing console data…');
  };

  /* -------------------------------- Derived -------------------------------- */
  const activePage = PAGES.find((p) => p.id === page) || PAGES[0];
  const kpis = overview?.kpis;
  const notifications: { id: string; icon: React.ReactNode; tone: string; text: string; detail: string; go: AdminPageId }[] = [];
  if (kpis) {
    if (kpis.flaggedTx > 0) {
      notifications.push({
        id: 'flagged',
        icon: <Flag className="w-4 h-4" />,
        tone: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-[#F97066]',
        text: `${kpis.flaggedTx} flagged transaction${kpis.flaggedTx === 1 ? '' : 's'}`,
        detail: 'Awaiting fraud review in the ledger',
        go: 'transactions',
      });
    }
    if (kpis.openDisputes > 0) {
      notifications.push({
        id: 'disputes',
        icon: <Gavel className="w-4 h-4" />,
        tone: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-[#FDB022]',
        text: `${kpis.openDisputes} open dispute${kpis.openDisputes === 1 ? '' : 's'}`,
        detail: 'Cardholders waiting on a resolution',
        go: 'disputes',
      });
    }
    if (kpis.frozenUsers > 0) {
      notifications.push({
        id: 'frozen',
        icon: <Snowflake className="w-4 h-4" />,
        tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-[#5EA0EF]',
        text: `${kpis.frozenUsers} frozen customer${kpis.frozenUsers === 1 ? '' : 's'}`,
        detail: 'Sign-in blocked until reactivated',
        go: 'customers',
      });
    }
  }

  const firstName = user.fullName.split(' ')[0];

  /* --------------------------------- Sidebar -------------------------------- */
  const SidebarNav = (
    <nav className="flex-1 overflow-y-auto admin-scroll px-3 py-4 space-y-5" aria-label="Admin sections">
      {SECTIONS.map((section) => (
        <div key={section}>
          <p className={cn('px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500', collapsed && 'lg:text-center lg:px-0')}>
            {collapsed ? <span className="hidden lg:inline">•••</span> : section}
          </p>
          <ul className="space-y-0.5">
            {PAGES.filter((p) => p.section === section).map((p) => {
              const active = p.id === page;
              const badge =
                p.id === 'disputes' && kpis && kpis.openDisputes > 0
                  ? kpis.openDisputes
                  : p.id === 'transactions' && kpis && kpis.flaggedTx > 0
                    ? kpis.flaggedTx
                    : null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => go(p.id)}
                    title={collapsed ? p.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium cursor-pointer transition-colors relative',
                      active
                        ? 'bg-[#0060F0] text-white shadow-[0_4px_12px_rgba(0,96,240,0.35)]'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
                      collapsed && 'lg:justify-center lg:px-0'
                    )}
                  >
                    <span className="shrink-0">{p.icon}</span>
                    <span className={cn('flex-1 text-left', collapsed && 'lg:hidden')}>{p.label}</span>
                    {badge !== null && (
                      <span
                        className={cn(
                          'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                          active ? 'bg-white text-[#0060F0]' : 'bg-[#F04438] text-white',
                          collapsed && 'lg:absolute lg:top-1.5 lg:right-1.5 lg:min-w-[14px] lg:h-[14px] lg:p-0'
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const SidebarFooter = (
    <div className="border-t border-white/10 p-3 space-y-1">
      <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', collapsed && 'lg:justify-center lg:px-0')}>
        <Avatar name={user.fullName} size={34} />
        <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <p className="text-[12.5px] font-semibold text-white truncate">{user.fullName}</p>
          <p className="text-[10.5px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#32D583]" /> Administrator
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onExitToBanking}
        title={collapsed ? 'Back to banking' : undefined}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer transition-colors',
          collapsed && 'lg:justify-center lg:px-0'
        )}
      >
        <Landmark className="w-[17px] h-[17px] shrink-0" />
        <span className={collapsed ? 'lg:hidden' : ''}>Back to banking</span>
      </button>
      <button
        type="button"
        onClick={onSignOut}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer transition-colors',
          collapsed && 'lg:justify-center lg:px-0'
        )}
      >
        <LogOut className="w-[17px] h-[17px] shrink-0" />
        <span className={collapsed ? 'lg:hidden' : ''}>Sign out</span>
      </button>
    </div>
  );

  const SidebarHeader = (
    <div className={cn('flex items-center gap-2.5 px-4 h-[62px] border-b border-white/10 shrink-0', collapsed && 'lg:justify-center lg:px-2')}>
      <ChaseLogo variant="white" />
      <div className={cn('leading-tight', collapsed && 'lg:hidden')}>
        <p className="text-[13px] font-bold text-white tracking-wide">Admin Console</p>
        <p className="text-[10px] text-slate-400">Operations & risk</p>
      </div>
    </div>
  );

  /* ---------------------------------- View ---------------------------------- */
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0B1526] p-6">
        <div className="max-w-[420px] text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-[#F97066] flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="mt-4 text-[18px] font-bold text-gray-800 dark:text-white/90">Administrator access required</h1>
          <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">
            Your account (@{user.username}) doesn't have the admin role. Sign in with the sample Chase administrator account to open the console.
          </p>
          <Btn variant="primary" size="md" className="mt-5" onClick={onExitToBanking}>
            Back to banking
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1526] text-[#131313] dark:text-gray-100 transition-colors">
      {/* ------------------------------ Sidebar ------------------------------ */}
      {/* Mobile off-canvas */}
      {mobileNav && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-gray-900/50 admin-fade" onClick={() => setMobileNav(false)} />
          <aside className="absolute left-0 top-0 h-full w-[270px] bg-[#0B1B33] flex flex-col admin-slide-in" style={{ animationDirection: 'normal' }}>
            <div className="flex items-center justify-between pr-3">
              <div className="flex-1">{SidebarHeader}</div>
              <button type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation" className="p-2 text-slate-300 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {SidebarNav}
            {SidebarFooter}
          </aside>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-40 hidden lg:flex flex-col bg-[#0B1B33] transition-[width] duration-200',
          collapsed ? 'w-[76px]' : 'w-[248px]'
        )}
        aria-label="Admin navigation"
      >
        {SidebarHeader}
        {SidebarNav}
        {SidebarFooter}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-3 top-[74px] hidden lg:flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-[#0060F0] cursor-pointer dark:border-gray-700 dark:bg-[#13203A] dark:text-gray-300 transition-transform',
            collapsed && 'rotate-180'
          )}
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
      </aside>

      {/* ------------------------------- Main -------------------------------- */}
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-[#0D1829]/90">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-[62px]">
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 hidden sm:block">
                Admin Console <span className="mx-1">/</span> {activePage.title}
              </p>
              <h1 className="text-[16px] font-bold text-gray-800 dark:text-white/90 leading-tight truncate">{activePage.title}</h1>
            </div>

            {/* Global search */}
            <div ref={searchWrapRef} className="relative ml-auto w-full max-w-[380px] hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
              <input
                ref={searchRef}
                value={searchOpen ? searchInput : ''}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search customers & transactions…"
                aria-label="Global search"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-14 py-2 text-[12.5px] text-gray-800 placeholder-gray-400 outline-none transition-all focus:border-[#0060F0] focus:bg-white focus:ring-2 focus:ring-[#0060F0]/15 dark:border-gray-700 dark:bg-white/5 dark:text-gray-100 dark:focus:bg-white/10"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:border-gray-700 dark:bg-white/5 dark:text-gray-500 pointer-events-none">
                ⌘K
              </kbd>

              {searchOpen && searchInput.trim().length >= 2 && (
                <div className="absolute top-[calc(100%+8px)] left-0 right-0 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#101D31] overflow-hidden admin-fade-up z-50">
                  {searching ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                    </div>
                  ) : searchResults && (searchResults.customers.length > 0 || searchResults.txs.length > 0) ? (
                    <div className="max-h-[420px] overflow-y-auto admin-scroll">
                      {searchResults.customers.length > 0 && (
                        <div className="p-2">
                          <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Customers</p>
                          {searchResults.customers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => openCustomer(c.id)}
                              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-left"
                            >
                              <Avatar name={c.fullName} size={30} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[12.5px] font-semibold text-gray-800 dark:text-white/90 truncate">{c.fullName}</span>
                                <span className="block text-[11px] text-gray-400 truncate">@{c.username} · {fmtMoneyFull(c.deposits)} deposits</span>
                              </span>
                              {c.status === 'frozen' && <Badge tone="error">frozen</Badge>}
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.txs.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                          <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Transactions</p>
                          {searchResults.txs.map((t) => (
                            <button
                              key={`${t.userId}-${t.id}`}
                              type="button"
                              onClick={() => openTxSearch(t.description)}
                              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-left"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#0060F0] dark:bg-blue-500/15 dark:text-[#5EA0EF] shrink-0">
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[12.5px] font-medium text-gray-800 dark:text-white/90 truncate">{t.description}</span>
                                <span className="block text-[11px] text-gray-400 truncate">{t.userName} · {relTime(t.date)}</span>
                              </span>
                              <span className={cn('text-[12px] font-semibold tabular-nums shrink-0', t.amount >= 0 ? 'text-success-600 dark:text-[#32D583]' : 'text-gray-700 dark:text-gray-200')}>
                                {t.amount >= 0 ? '+' : '−'}{fmtMoneyFull(Math.abs(t.amount))}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openTxSearch(searchInput.trim())}
                        className="w-full px-4 py-2.5 text-[12px] font-semibold text-[#0060F0] dark:text-[#5EA0EF] hover:bg-gray-50 dark:hover:bg-white/5 border-t border-gray-100 dark:border-gray-800 cursor-pointer text-left"
                      >
                        See all results for “{searchInput.trim()}” in the ledger →
                      </button>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-[12.5px] text-gray-400">No matches for “{searchInput.trim()}”</div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 md:ml-3 ml-auto">
              <button
                type="button"
                onClick={refresh}
                aria-label="Refresh data"
                title="Refresh data"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
              >
                <RefreshCw className={cn('w-[17px] h-[17px]', overviewLoading && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={() => setDark((v) => !v)}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light mode' : 'Dark mode'}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
              >
                {dark ? <Sun className="w-[17px] h-[17px]" /> : <Moon className="w-[17px] h-[17px]" />}
              </button>

              {/* Notifications */}
              <div ref={bellRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setBellOpen((v) => !v); setMenuOpen(false); }}
                  aria-label={notifications.length ? `Notifications, ${notifications.length} unread` : 'Notifications'}
                  aria-expanded={bellOpen}
                  className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
                >
                  <Bell className="w-[17px] h-[17px]" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[#F04438] text-white text-[9px] font-bold flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#101D31] overflow-hidden admin-fade-up z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <h2 className="text-[13.5px] font-semibold text-gray-800 dark:text-white/90">Notifications</h2>
                      {notifications.length > 0 && <Badge tone="error">{notifications.length} need attention</Badge>}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <CheckCircle2 className="w-7 h-7 text-success-500 mx-auto" />
                        <p className="mt-2 text-[13px] font-medium text-gray-700 dark:text-gray-200">You're all caught up</p>
                        <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-0.5">No flagged transactions, disputes, or frozen accounts.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {notifications.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => go(n.go)}
                              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-left"
                            >
                              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', n.tone)}>{n.icon}</span>
                              <span className="min-w-0">
                                <span className="block text-[12.5px] font-semibold text-gray-800 dark:text-white/90">{n.text}</span>
                                <span className="block text-[11.5px] text-gray-400 dark:text-gray-500 mt-0.5">{n.detail}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* User menu */}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 p-1 pr-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <Avatar name={user.fullName} size={30} />
                  <span className="hidden xl:block text-left leading-tight">
                    <span className="block text-[12px] font-semibold text-gray-800 dark:text-white/90">{firstName}</span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">Administrator</span>
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] w-[240px] rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#101D31] overflow-hidden admin-fade-up z-50">
                    <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90 truncate">{user.fullName}</p>
                      <p className="text-[11.5px] text-gray-400 dark:text-gray-500 truncate">@{user.username} · {user.email}</p>
                    </div>
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={onExitToBanking}
                        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <Landmark className="w-4 h-4" /> Back to banking
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
                        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-error-600 hover:bg-error-50 dark:text-[#F97066] dark:hover:bg-error-500/10 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 sm:px-6 py-6 max-w-[1500px] mx-auto">
          <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mb-4 -mt-1">{activePage.subtitle}</p>
          {page === 'overview' && (
            <OverviewPage
              key={`overview-${refreshKey}`}
              overview={overview}
              loading={overviewLoading}
              range={overviewRange}
              onRangeChange={setOverviewRange}
              onOpenCustomer={openCustomer}
              onNavigate={(p) => go(p)}
            />
          )}
          {page === 'customers' && (
            <CustomersPage
              key={`customers-${refreshKey}`}
              actor={user}
              focusId={customerFocus}
              onFocusHandled={() => setCustomerFocus(null)}
              onChanged={loadOverview}
            />
          )}
          {page === 'transactions' && (
            <TransactionsPage
              key={`transactions-${refreshKey}`}
              actor={user}
              focusQuery={txFocus}
              onFocusHandled={() => setTxFocus(null)}
              onOpenCustomer={openCustomer}
            />
          )}
          {page === 'disputes' && (
            <DisputesPage
              key={`disputes-${refreshKey}`}
              actor={user}
              onChanged={loadOverview}
              onOpenCustomer={openCustomer}
            />
          )}
          {page === 'audit' && <AuditPage key={`audit-${refreshKey}`} />}
          {page === 'system' && <SystemPage key={`system-${refreshKey}`} />}
        </main>
      </div>

      <ToastStack />
    </div>
  );
};

export default AdminConsole;
