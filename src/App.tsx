import { useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { ProductCarousel } from './components/ProductCarousel';
import { FeaturedOffersGrid } from './components/FeaturedOffersGrid';
import { EditorialSections } from './components/EditorialSections';
import { Footer } from './components/Footer';
import {
  OfferDetailModal,
  MortgageCalculatorModal,
  ScheduleMeetingModal,
  AutoLoanModal,
} from './components/Modals';
import { SignUpWizard } from './components/SignUpWizard';
import { BankingDashboard } from './components/BankingDashboard';
import { AdminPage } from './components/AdminPage';
import ProductsPage from './components/ProductsPage';
import type { DashboardView } from './components/BankingDashboard';
import { OFFER_MODALS, SegmentKey } from './data/chaseData';
import {
  User,
  ProductId,
  fetchMe,
  logout,
  authenticate,
  switchToAdmin,
  resetPassword,
  persistUser,
  seedSampleUserIfNeeded,
  adoptSessionToken,
  readAdminToken,
  writeAdminToken,
} from './banking/store';

type View = 'home' | 'wizard' | 'dashboard' | 'products' | 'admin';

const isAdminPath = () =>
  /^\/admin\/?$/.test(window.location.pathname) ||
  window.location.hash.replace(/^#\/?/, '') === 'admin';

export function App() {
  const [view, setView] = useState<View>(() => (isAdminPath() ? 'admin' : 'home'));
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('personal');
  const [spanishMode, setSpanishMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminTokenForView, setAdminTokenForView] = useState(() => readAdminToken());
  const [adminSessionInfo, setAdminSessionInfo] = useState<{
    username: string;
    label: string;
    role?: 'admin' | 'auditor';
    isSuperAdmin?: boolean;
    linkedUserId?: string | null;
  } | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [workspaceChooserOpen, setWorkspaceChooserOpen] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [sessionNotice, setSessionNotice] = useState(false);
  const [dashboardStart, setDashboardStart] = useState<DashboardView>('accounts');
  const [productTab, setProductTab] = useState<'checking' | 'cards' | 'rates'>('checking');
  const [wizardProduct, setWizardProduct] = useState<ProductId | null>(null);
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [mortgageOpen, setMortgageOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const authMutationSeqRef = useRef(0);

  /* Restore any active session in the background without blocking the homepage */
  useEffect(() => {
    let active = true;
    const seq = authMutationSeqRef.current;
    (async () => {
      try {
        await seedSampleUserIfNeeded();
        const me = await fetchMe();
        if (active && me && authMutationSeqRef.current === seq) {
          setCurrentUser(me);
        }
      } catch {
        /* Stay signed out when storage or the local API is unavailable. */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onPopState = () => setView(isAdminPath() ? 'admin' : 'home');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    const onExpired = () => {
      authMutationSeqRef.current += 1;
      setCurrentUser(null);
      setDashboardStart('accounts');
      setView('home');
      setSessionNotice(true);
    };
    window.addEventListener('chase:session-expired', onExpired);
    return () => window.removeEventListener('chase:session-expired', onExpired);
  }, []);

  const updateCurrentUser = (updated: User) => {
    persistUser(updated);
    setCurrentUser(updated);
  };

  const handleSignIn = async (username: string, password: string): Promise<string | null> => {
    const result = await authenticate(username, password);
    if ('error' in result) return result.error;
    authMutationSeqRef.current += 1;
    setSessionNotice(false);
    setSwitchError('');
    if ('admin' in result) {
      writeAdminToken(result.token);
      setAdminTokenForView(result.token);
      setAdminSessionInfo(result.admin);
      setCurrentUser(null);
      setIsImpersonating(false);
      setWorkspaceChooserOpen(false);
      if (window.location.pathname !== '/admin') {
        try { window.history.pushState({}, '', '/admin'); } catch { /* ignore */ }
      }
      setView('admin');
      return null;
    }
    writeAdminToken(null);
    setAdminTokenForView('');
    setAdminSessionInfo(null);
    setCurrentUser(result.user);
    setIsImpersonating(false);
    if (result.linkedAdmin) {
      setWorkspaceChooserOpen(true);
    } else {
      setView('dashboard');
    }
    return null;
  };

  const handleSwitchToAdmin = async () => {
    setSwitchingWorkspace(true);
    setSwitchError('');
    try {
      const switched = await switchToAdmin();
      writeAdminToken(switched.token);
      setAdminTokenForView(switched.token);
      setAdminSessionInfo(switched.admin);
      setIsImpersonating(false);
      setWorkspaceChooserOpen(false);
      if (window.location.pathname !== '/admin') {
        try { window.history.pushState({}, '', '/admin'); } catch { /* ignore */ }
      }
      setView('admin');
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'Could not open administrator console.');
    } finally {
      setSwitchingWorkspace(false);
    }
  };

  const handleSwitchToCustomer = (user: User, sessionToken: string) => {
    authMutationSeqRef.current += 1;
    adoptSessionToken(sessionToken);
    setCurrentUser(user);
    setIsImpersonating(false);
    setWorkspaceChooserOpen(false);
    setDashboardStart('accounts');
    if (window.location.pathname !== '/') {
      try { window.history.pushState({}, '', '/'); } catch { /* ignore */ }
    }
    setView('dashboard');
  };

  const handleResetPassword = async (
    username: string,
    email: string,
    newPassword: string
  ): Promise<string | null> => {
    try {
      await resetPassword(username, email, newPassword);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Password reset failed. Please try again.';
    }
  };

  const handleSignOut = async () => {
    authMutationSeqRef.current += 1;
    await logout(false);
    writeAdminToken(null);
    setAdminTokenForView('');
    setAdminSessionInfo(null);
    setCurrentUser(null);
    setIsImpersonating(false);
    setDashboardStart('accounts');
    setView('home');
    if (window.location.pathname !== '/') {
      try { window.history.pushState({}, '', '/'); } catch { /* ignore */ }
    }
  };

  const goHome = () => {
    setDashboardStart('accounts');
    setView('home');
    if (window.location.pathname !== '/') {
      try { window.history.pushState({}, '', '/'); } catch { /* ignore */ }
    }
  };

  const openAdmin = () => {
    setAdminTokenForView(readAdminToken());
    if (window.location.pathname !== '/admin') {
      try { window.history.pushState({}, '', '/admin'); } catch { /* ignore */ }
    }
    setView('admin');
  };

  const exitAdmin = () => {
    const latestAdminToken = readAdminToken();
    setAdminTokenForView(latestAdminToken);
    if (!latestAdminToken) setAdminSessionInfo(null);
    if (window.location.pathname !== '/') {
      try { window.history.pushState({}, '', '/'); } catch { /* ignore */ }
    }
    setView('home');
  };

  const startImpersonation = (user: User, sessionToken: string) => {
    authMutationSeqRef.current += 1;
    adoptSessionToken(sessionToken);
    setCurrentUser(user);
    setIsImpersonating(true);
    setDashboardStart('accounts');
    if (window.location.pathname !== '/') {
      try { window.history.pushState({}, '', '/'); } catch { /* ignore */ }
    }
    setView('dashboard');
  };

  const exitImpersonation = async () => {
    authMutationSeqRef.current += 1;
    await logout(true);
    setCurrentUser(null);
    setIsImpersonating(false);
    setAdminTokenForView(readAdminToken());
    if (window.location.pathname !== '/admin') {
      try { window.history.pushState({}, '', '/admin'); } catch { /* ignore */ }
    }
    setView('admin');
  };

  const openWizard = (product: ProductId | null = null) => {
    setWizardProduct(product);
    setView('wizard');
  };

  const handleWizardComplete = (user: User) => {
    authMutationSeqRef.current += 1;
    setCurrentUser(user);
    setView('dashboard');
  };

  const openProducts = (tab: 'checking' | 'cards' | 'rates') => {
    setProductTab(tab);
    setView('products');
    window.scrollTo({ top: 0 });
  };

  const handleAction = (actionId: string) => {
    if (actionId === 'admin-login') {
      openAdmin();
      return;
    }
    if (actionId === 'open-products-checking' || actionId === 'open-products-savings') {
      openProducts('checking');
      return;
    }
    if (actionId === 'open-products-cards') {
      openProducts('cards');
      return;
    }
    if (actionId === 'open-products-rates') {
      openProducts('rates');
      return;
    }
    const footerViews: Record<string, DashboardView> = {
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
    };
    if (footerViews[actionId]) {
      setDashboardStart(footerViews[actionId]);
      if (currentUser) setView('dashboard');
      else handleFocusSignIn();
      return;
    }
    if (actionId === 'open-mortgage-calculator') {
      setMortgageOpen(true);
      return;
    }
    if (actionId === 'open-schedule-meeting') {
      setScheduleOpen(true);
      return;
    }
    if (actionId === 'open-signup') {
      openWizard(null);
      return;
    }
    if (OFFER_MODALS[actionId]) {
      setActiveOfferId(actionId);
    }
  };

  const handleFocusSignIn = () => {
    if (currentUser) {
      setView('dashboard');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      usernameInputRef.current?.focus();
    }, 350);
  };

  const activeOffer = activeOfferId ? OFFER_MODALS[activeOfferId] : null;

  /* ------------------------------ Admin view -------------------------------- */
  if (view === 'admin') {
    return (
      <AdminPage
        initialToken={adminTokenForView}
        initialAdmin={adminSessionInfo}
        onTokenChange={(nextToken) => {
          setAdminTokenForView(nextToken);
          if (!nextToken) setAdminSessionInfo(null);
        }}
        onExit={exitAdmin}
        onImpersonate={startImpersonation}
        onSwitchToCustomer={handleSwitchToCustomer}
      />
    );
  }

  /* ------------------------------ Wizard view ------------------------------ */
  if (view === 'wizard') {
    return (
      <SignUpWizard
        preselectedProduct={wizardProduct}
        existingUser={currentUser}
        onComplete={handleWizardComplete}
        onCancel={() => setView(currentUser ? 'dashboard' : 'home')}
      />
    );
  }

  /* ---------------------------- Dashboard view ----------------------------- */
  if (view === 'dashboard' && currentUser) {
    return (
      <BankingDashboard
        user={currentUser}
        onUpdateUser={updateCurrentUser}
        onSignOut={handleSignOut}
        onBackHome={goHome}
        onOpenAccount={(product?: ProductId) => openWizard(product ?? null)}
        initialView={dashboardStart}
        spanishMode={spanishMode}
        onToggleSpanish={() => setSpanishMode((v) => !v)}
        isImpersonating={isImpersonating}
        onExitImpersonation={exitImpersonation}
        onSwitchToAdmin={currentUser.linkedAdmin ? () => void handleSwitchToAdmin() : undefined}
      />
    );
  }

  /* ----------------------------- Products view ----------------------------- */
  if (view === 'products') {
    return (
      <ProductsPage
        initialTab={productTab}
        spanishMode={spanishMode}
        onBack={() => setView('home')}
        onApply={(product: ProductId) => openWizard(product)}
        onAction={handleAction}
      />
    );
  }

  /* ------------------------------- Home view ------------------------------- */
  return (
    <div className="min-h-screen flex flex-col bg-white text-[#131313]">
      {/* Skip to main content link for banking accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[#0060F0] focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      {sessionNotice && (
        <div role="alert" className="bg-[#FEF2F2] border-b border-[#F5C2C7] text-[#B42318]">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 text-[13px]">
            <span>Your session expired. Please sign in again.</span>
            <button
              type="button"
              onClick={() => setSessionNotice(false)}
              className="font-semibold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <Header
        activeSegment={activeSegment}
        onSegmentChange={setActiveSegment}
        onAction={handleAction}
        spanishMode={spanishMode}
        onToggleSpanish={() => setSpanishMode((prev) => !prev)}
        onFocusSignIn={handleFocusSignIn}
        user={currentUser}
        onGoToDashboard={() => setView('dashboard')}
        onSignOut={handleSignOut}
      />

      <main id="main-content" className="flex-1">
        <HeroSection
          activeSegment={activeSegment}
          spanishMode={spanishMode}
          user={currentUser}
          onAction={handleAction}
          onSignIn={handleSignIn}
          onResetPassword={handleResetPassword}
          onSignUp={() => openWizard(null)}
          onGoToDashboard={() => setView('dashboard')}
          onSignOut={handleSignOut}
          usernameInputRef={usernameInputRef}
        />

        <ProductCarousel onAction={handleAction} onCompare={openProducts} />

        <FeaturedOffersGrid onAction={handleAction} />

        <EditorialSections onAction={handleAction} />
      </main>

      <Footer
        onAction={handleAction}
        onHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        spanishMode={spanishMode}
      />

      {/* Interactive Modals */}
      <OfferDetailModal
        offer={activeOffer}
        onClose={() => setActiveOfferId(null)}
        onOpenMortgage={() => setMortgageOpen(true)}
        onOpenWizard={(product) => openWizard(product)}
        onOpenAuto={() => setAutoOpen(true)}
      />

      <MortgageCalculatorModal
        open={mortgageOpen}
        onClose={() => setMortgageOpen(false)}
        onSchedule={() => setScheduleOpen(true)}
      />

      <ScheduleMeetingModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
      />

      <AutoLoanModal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        user={currentUser}
        onUpdateUser={updateCurrentUser}
        onEnroll={() => openWizard(null)}
      />

      {/* Unified Workspace Chooser Modal for Linked Admin/Customer Identities */}
      {workspaceChooserOpen && currentUser?.linkedAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-chooser-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-[460px] rounded-xl bg-white shadow-2xl border border-[#E4E6E8] overflow-hidden">
            <div className="bg-[#081427] px-6 py-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                Linked Identity Detected
              </p>
              <h2 id="workspace-chooser-title" className="mt-0.5 text-[18px] font-bold">
                Choose your workspace, {currentUser.fullName.split(' ')[0]}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-[#5C5C5C]">
                Your account (<strong>@{currentUser.username}</strong>) has both personal Chase banking and{' '}
                <strong>
                  {currentUser.linkedAdmin.role === 'auditor' ? 'Read-Only Auditor' : 'Limited Administrator'}
                </strong>{' '}
                access. You can switch between views at any time.
              </p>
              {switchError && (
                <p role="alert" className="rounded bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[12.5px] text-[#B42318]">
                  {switchError}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  disabled={switchingWorkspace}
                  onClick={() => {
                    setWorkspaceChooserOpen(false);
                    setView('dashboard');
                  }}
                  className="w-full rounded-lg border border-[#D0D5DD] hover:border-[#1A4488] hover:bg-[#F7FAFD] p-4 text-left transition-colors cursor-pointer"
                >
                  <span className="block text-[14.5px] font-semibold text-[#131313]">
                    Personal Banking Dashboard
                  </span>
                  <span className="block mt-0.5 text-[12px] text-[#5C5C5C]">
                    View your personal accounts, cards, transfers, and statements.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={switchingWorkspace}
                  onClick={() => void handleSwitchToAdmin()}
                  className="w-full rounded-lg bg-[#1A4488] hover:bg-[#143669] p-4 text-left text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  <span className="block text-[14.5px] font-semibold">
                    {switchingWorkspace ? 'Opening Administrator Console…' : 'Administrator Console'}
                  </span>
                  <span className="block mt-0.5 text-[12px] text-blue-100">
                    Open your{' '}
                    {currentUser.linkedAdmin.role === 'auditor' ? 'read-only auditor' : 'staff operator'} workspace for assigned customers.
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
