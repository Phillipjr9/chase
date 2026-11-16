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
import ProductsPage from './components/ProductsPage';
import { ChasePageLoader } from './components/Loading';
import type { DashboardView } from './components/BankingDashboard';
import { OFFER_MODALS, SegmentKey } from './data/chaseData';
import {
  User,
  ProductId,
  fetchMe,
  logout,
  authenticate,
  resetPassword,
  persistUser,
  seedSampleUserIfNeeded,
} from './banking/store';

type View = 'home' | 'wizard' | 'dashboard' | 'products';

export function App() {
  const [view, setView] = useState<View>('home');
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('personal');
  const [spanishMode, setSpanishMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState(false);
  const [dashboardStart, setDashboardStart] = useState<DashboardView>('accounts');
  const [productTab, setProductTab] = useState<'checking' | 'cards' | 'rates'>('checking');
  const [wizardProduct, setWizardProduct] = useState<ProductId | null>(null);
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [mortgageOpen, setMortgageOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  /* Seed Chase sample data and restore the session on load */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await seedSampleUserIfNeeded();
        const me = await fetchMe();
        if (active && me) setCurrentUser(me);
      } catch {
        /* Stay signed out when storage or the local API is unavailable. */
      } finally {
        if (active) setAuthReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    const onExpired = () => {
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
    setSessionNotice(false);
    setCurrentUser(result.user);
    setView('dashboard');
    return null;
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
    await logout();
    setCurrentUser(null);
    setDashboardStart('accounts');
    setView('home');
  };

  const goHome = () => {
    setDashboardStart('accounts');
    setView('home');
  };

  const openWizard = (product: ProductId | null = null) => {
    setWizardProduct(product);
    setView('wizard');
  };

  const handleWizardComplete = (user: User) => {
    setCurrentUser(user);
    setView('dashboard');
  };

  const openProducts = (tab: 'checking' | 'cards' | 'rates') => {
    setProductTab(tab);
    setView('products');
    window.scrollTo({ top: 0 });
  };

  const handleAction = (actionId: string) => {
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

  if (!authReady) {
    return (
      <ChasePageLoader
        message="Loading Chase Online…"
        detail="Restoring your sample session securely."
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
    </div>
  );
}

export default App;
