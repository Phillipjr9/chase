import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Menu,
  X,
  MapPin,
  Calendar,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { ChaseLogo } from './ChaseLogo';
import { NAV_CATEGORIES, SEARCH_ITEMS, SegmentKey } from '../data/chaseData';
import { User } from '../banking/store';

interface HeaderProps {
  activeSegment: SegmentKey;
  onSegmentChange: (seg: SegmentKey) => void;
  onAction: (actionId: string) => void;
  spanishMode: boolean;
  onToggleSpanish: () => void;
  onFocusSignIn: () => void;
  user: User | null;
  onGoToDashboard: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSegment,
  onSegmentChange,
  onAction,
  spanishMode,
  onToggleSpanish,
  onFocusSignIn,
  user,
  onGoToDashboard,
  onSignOut,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
        setServiceMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
        setServiceMenuOpen(false);
        setSearchOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  const activeCategory = NAV_CATEGORIES.find((cat) => cat.id === openMenuId) || null;

  const filteredSearch = searchQuery.trim()
    ? SEARCH_ITEMS.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_ITEMS.slice(0, 5);

  const segmentLabels: { key: SegmentKey; en: string; es: string }[] = [
    { key: 'personal', en: 'Personal', es: 'Personal' },
    { key: 'business', en: 'Business', es: 'Negocios' },
    { key: 'commercial', en: 'Commercial', es: 'Comercial' },
  ];

  const handleLinkAction = (actionId?: string) => {
    setOpenMenuId(null);
    setServiceMenuOpen(false);
    setSearchOpen(false);
    setMobileMenuOpen(false);
    if (actionId) onAction(actionId);
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-40 bg-white">
      {/* ROW 1: Utility bar */}
      <div className="hidden lg:block border-b border-[#E9E9E9]">
        <div className="max-w-[1200px] mx-auto px-6 h-[36px] flex items-center justify-between text-[13px]">
          <nav aria-label="Banking segments" className="flex items-center h-full gap-6">
            {segmentLabels.map((seg) => {
              const isActive = activeSegment === seg.key;
              return (
                <button
                  key={seg.key}
                  type="button"
                  onClick={() => onSegmentChange(seg.key)}
                  className={`relative h-full inline-flex items-center transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#131313] font-semibold'
                      : 'text-[#353535] hover:text-[#005EB8]'
                  }`}
                >
                  {spanishMode ? seg.es : seg.en}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#005EB8]" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-6 text-[#353535]">
            {user && (
              <>
                <span className="font-semibold text-[#131313]">
                  Welcome, {user.fullName.split(' ')[0]}
                </span>
                <button
                  type="button"
                  onClick={onGoToDashboard}
                  className="text-[#005EB8] font-semibold hover:underline cursor-pointer"
                >
                  My accounts
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="hover:text-[#005EB8] hover:underline cursor-pointer"
                >
                  Sign out
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => handleLinkAction('open-schedule-meeting')}
              className="hover:text-[#005EB8] hover:underline cursor-pointer"
            >
              {spanishMode ? 'Programar una cita' : 'Schedule a meeting'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setServiceMenuOpen((prev) => !prev);
                  setOpenMenuId(null);
                }}
                aria-expanded={serviceMenuOpen}
                className="inline-flex items-center gap-1 hover:text-[#005EB8] cursor-pointer"
              >
                <span>{spanishMode ? 'Servicio al cliente' : 'Customer service'}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${serviceMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {serviceMenuOpen && (
                <div className="absolute right-0 top-[30px] w-[280px] bg-white border border-[#E9E9E9] shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3 z-50">
                  <button
                    type="button"
                    onClick={() => handleLinkAction('open-schedule-meeting')}
                    className="w-full flex items-center gap-2.5 px-2 py-2 text-left text-[13px] hover:bg-[#F1F1F0] text-[#131313] cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-[#005EB8] shrink-0" />
                    <span>Find an ATM or Branch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLinkAction('open-schedule-meeting')}
                    className="w-full flex items-center gap-2.5 px-2 py-2 text-left text-[13px] hover:bg-[#F1F1F0] text-[#131313] cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-[#005EB8] shrink-0" />
                    <span>Schedule a meeting</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLinkAction('chase-mobile')}
                    className="w-full flex items-center gap-2.5 px-2 py-2 text-left text-[13px] hover:bg-[#F1F1F0] text-[#131313] cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#005EB8] shrink-0" />
                    <span>Security &amp; Fraud Center</span>
                  </button>
                  <div className="mt-2 pt-2 border-t border-[#E9E9E9] px-2 text-[12px] text-[#565A5D]">
                    24/7 Support: <strong className="text-[#131313]">1-800-935-9935</strong>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleLinkAction('admin-login')}
              className="inline-flex items-center gap-1 font-semibold text-[#005EB8] hover:underline cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>

            <button
              type="button"
              onClick={onToggleSpanish}
              className={`hover:text-[#005EB8] hover:underline cursor-pointer ${spanishMode ? 'font-semibold text-[#005EB8]' : ''}`}
            >
              {spanishMode ? 'English' : 'Español'}
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchOpen((prev) => !prev);
                setOpenMenuId(null);
                setServiceMenuOpen(false);
              }}
              aria-label="Search Chase.com"
              className="p-1 text-[#353535] hover:text-[#005EB8] cursor-pointer"
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ROW 2: Logo row */}
      <div className="border-b border-[#E9E9E9]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[56px] flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="p-2 -ml-2 text-[#131313] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              onSegmentChange('personal');
              setOpenMenuId(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="shrink-0 flex items-center"
            aria-label="Chase Home"
          >
            <ChaseLogo />
          </a>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              aria-label="Search"
              className="p-2 text-[#353535] cursor-pointer"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={user ? onGoToDashboard : onFocusSignIn}
              className="px-4 py-1.5 bg-[#0060F0] text-white text-[13px] font-semibold rounded-[4px] cursor-pointer"
            >
              {user ? 'Accounts' : 'Sign in'}
            </button>
          </div>

          {/* Desktop right side on logo row (nav is below) */}
          <div className="hidden lg:block text-[13px] text-[#565A5D]">
            {user ? (
              <button
                type="button"
                onClick={onGoToDashboard}
                className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[13px] px-4 py-1.5 rounded-[4px] cursor-pointer"
              >
                My accounts
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleLinkAction('open-schedule-meeting')}
                className="hover:text-[#005EB8] hover:underline cursor-pointer"
              >
                Find an ATM or branch
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: Primary nav (desktop) */}
      <div className="hidden lg:block border-b border-[#E9E9E9] bg-white">
        <div className="max-w-[1200px] mx-auto px-6 h-[44px] flex items-center gap-1">
          {NAV_CATEGORIES.map((category) => {
            const isOpen = openMenuId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setOpenMenuId(isOpen ? null : category.id);
                  setServiceMenuOpen(false);
                  setSearchOpen(false);
                }}
                aria-expanded={isOpen}
                className={`px-3 py-2 text-[14px] whitespace-nowrap inline-flex items-center gap-1 cursor-pointer ${
                  isOpen
                    ? 'text-[#005EB8] font-semibold'
                    : 'text-[#131313] hover:text-[#005EB8]'
                }`}
              >
                <span>{category.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#565A5D] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Search drawer */}
      {searchOpen && (
        <div className="border-b border-[#E9E9E9] bg-[#F1F1F0]">
          <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-4">
            <div className="relative">
              <Search className="w-5 h-5 text-[#565A5D] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredSearch[0]) {
                    e.preventDefault();
                    handleLinkAction(filteredSearch[0].actionId);
                  }
                }}
                placeholder="Search Chase.com"
                className="w-full pl-11 pr-10 py-2.5 bg-white border border-[#B9C4D0] rounded-[4px] text-[14px] text-[#131313] focus:border-[#0060F0] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#565A5D] cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#565A5D] mb-2">
                {searchQuery.trim() ? 'Results' : 'Popular searches'}
              </p>
              {filteredSearch.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {filteredSearch.map((item) => (
                    <li key={item.title}>
                      <button
                        type="button"
                        onClick={() => handleLinkAction(item.actionId)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left bg-white hover:bg-[#EAF2FA] border border-[#E9E9E9] rounded-[4px] group cursor-pointer"
                      >
                        <div>
                          <p className="text-[13px] font-semibold text-[#131313] group-hover:text-[#005EB8]">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[#565A5D]">{item.category}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#005EB8] shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-[#353535] py-2">
                  No results for “{searchQuery}”. Try “checking”, “Sapphire”, “CD”, or “mortgage”.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop mega-menu: simple link columns, no featured box */}
      {activeCategory && (
        <div className="hidden lg:block absolute left-0 right-0 top-full bg-white border-b border-[#E9E9E9] shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-50">
          <div className="max-w-[1200px] mx-auto px-6 py-6 grid grid-cols-12 gap-8">
            {activeCategory.columns.map((col) => (
              <div key={col.heading} className="col-span-4">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#565A5D] mb-3 pb-2 border-b border-[#E9E9E9]">
                  {col.heading}
                </h3>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => handleLinkAction(link.modalId)}
                        className="group inline-flex items-center gap-2 text-[14px] text-[#131313] hover:text-[#005EB8] text-left cursor-pointer"
                      >
                        <span className="group-hover:underline">{link.label}</span>
                        {link.badge && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EAF2FA] text-[#005EB8]">
                            {link.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-[#E9E9E9] max-h-[82vh] overflow-y-auto">
          <div className="flex border-b border-[#E9E9E9] bg-[#F1F1F0]">
            {segmentLabels.map((seg) => (
              <button
                key={seg.key}
                type="button"
                onClick={() => {
                  onSegmentChange(seg.key);
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-3 text-[13px] font-semibold text-center border-b-2 cursor-pointer ${
                  activeSegment === seg.key
                    ? 'border-[#005EB8] text-[#131313] bg-white'
                    : 'border-transparent text-[#353535]'
                }`}
              >
                {spanishMode ? seg.es : seg.en}
              </button>
            ))}
          </div>

          <div className="divide-y divide-[#E9E9E9]">
            {NAV_CATEGORIES.map((category) => {
              const expanded = mobileExpandedId === category.id;
              return (
                <div key={category.id}>
                  <button
                    type="button"
                    onClick={() => setMobileExpandedId(expanded ? null : category.id)}
                    className="w-full px-5 py-3.5 flex items-center justify-between text-[15px] font-medium text-[#131313] cursor-pointer"
                  >
                    <span>{category.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#565A5D] transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expanded && (
                    <div className="px-5 pb-4 pt-1 bg-[#F8F8F8] space-y-3">
                      {category.columns.map((col) => (
                        <div key={col.heading}>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[#565A5D] mb-1.5">
                            {col.heading}
                          </p>
                          <ul className="space-y-2">
                            {col.links.map((link) => (
                              <li key={link.label}>
                                <button
                                  type="button"
                                  onClick={() => handleLinkAction(link.modalId)}
                                  className="text-[14px] text-[#005EB8] hover:underline text-left cursor-pointer"
                                >
                                  {link.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-5 bg-[#F1F1F0] border-t border-[#E9E9E9] flex flex-wrap gap-4 text-[13px] font-medium text-[#005EB8]">
            <button
              type="button"
              onClick={() => handleLinkAction('open-schedule-meeting')}
              className="hover:underline cursor-pointer"
            >
              Schedule a meeting
            </button>
            <button
              type="button"
              onClick={onToggleSpanish}
              className="hover:underline cursor-pointer"
            >
              {spanishMode ? 'English' : 'Español'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
