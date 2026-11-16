import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUp, ArrowUpRight, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { ChaseLogo } from './ChaseLogo';
import { ChaseIcon, FdicBadge } from './ChaseAssets';
import { CONTACT_CARDS, DIGITAL_LINKS, FOOTER_GROUPS, LEGAL_LINKS, PRODUCT_PILLARS, SOCIAL_LINKS } from '../data/footerData';
import type { FooterDialogId, FooterLink } from '../data/footerData';
import './Footer.css';

interface FooterProps {
  onAction: (actionId: string) => void;
  onHome?: () => void;
  variant?: 'public' | 'dashboard';
  userLabel?: string | null;
  spanishMode?: boolean;
}

const DIALOG_TITLES: Record<FooterDialogId, string> = {
  support: 'How can we help?',
  privacy: 'Your privacy on Chase.com',
  accessibility: 'Accessibility',
  directory: 'Explore the site',
  feedback: 'Help us improve Chase.com',
};

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

export function Footer({ onAction, onHome, variant = 'public', userLabel, spanishMode = false }: FooterProps) {
  const [openGroups, setOpenGroups] = useState<string[]>(['support']);
  const [openPillars, setOpenPillars] = useState(false);
  const [activeDialog, setActiveDialog] = useState<FooterDialogId | null>(null);
  const id = useId();
  const isDashboard = variant === 'dashboard';

  const navigate = (actionId: string) => {
    setActiveDialog(null);
    onAction(actionId);
    // Wait for a closing dialog to restore focus before scrolling to the new view.
    window.requestAnimationFrame(scrollToTop);
  };

  const renderLink = (link: FooterLink, className = 'footer-link') => {
    if (link.href) {
      return (
        <a className={className} href={link.href} target="_blank" rel="noopener noreferrer">
          {link.label}
          <ArrowUpRight className="footer-external" aria-hidden="true" />
          <span className="sr-only"> (official external site, opens in a new tab)</span>
        </a>
      );
    }
    return (
      <button
        type="button"
        className={className}
        onClick={() => link.dialog ? setActiveDialog(link.dialog) : navigate(link.actionId!)}
      >
        {link.label}
      </button>
    );
  };

  return (
    <>
      <footer className="site-footer" aria-label={isDashboard ? 'Online banking footer' : 'Website footer'}>
        <section className="footer-help" aria-labelledby={`${id}-help`}>
          <div className="footer-container footer-help-inner">
            <div>
              <h2 id={`${id}-help`}>
                {spanishMode ? 'Estamos aquí para ayudar.' : isDashboard && userLabel ? `How can we help, ${userLabel.split(' ')[0]}?` : 'We’re here to help.'}
              </h2>
              <p>
                {spanishMode
                  ? 'Encuentre respuestas, obtenga ayuda y dé el siguiente paso con confianza.'
                  : isDashboard
                    ? 'Manage accounts, find branches, lock cards, and get answers — all from your dashboard footer.'
                    : 'Find answers, get support, and take your next step with confidence.'}
              </p>
              {isDashboard && userLabel && (
                <p className="footer-signed-in">
                  Signed in as <strong>{userLabel}</strong>
                  <span aria-hidden="true"> · </span>
                  <button type="button" onClick={() => navigate('footer-accounts')} className="footer-inline-link">
                    View accounts
                  </button>
                </p>
              )}
            </div>
            <div className="footer-help-actions">
              <button type="button" onClick={() => navigate('footer-locations')} className="footer-locator">
                <ChaseIcon name="house" size={23} />
                Find an ATM or branch
              </button>
              <button type="button" onClick={() => setActiveDialog('support')} className="footer-contact">
                Contact &amp; support
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="footer-container footer-contact-cards">
            {CONTACT_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() =>
                  card.id === 'visit'
                    ? navigate('footer-locations')
                    : card.id === 'secure'
                      ? navigate('footer-security')
                      : setActiveDialog('support')
                }
                className="footer-contact-card"
              >
                <span className="footer-contact-title">{card.title}</span>
                <span className="footer-contact-detail">{card.detail}</span>
                <span className="footer-contact-link">
                  {card.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="footer-container">
          <section className="footer-pillars" aria-label="Featured Chase products">
            <div className="footer-pillars-head">
              <h2>Explore featured products</h2>
              <button
                type="button"
                className="footer-pillars-toggle md:hidden"
                aria-expanded={openPillars}
                aria-controls={`${id}-pillars`}
                onClick={() => setOpenPillars((v) => !v)}
              >
                {openPillars ? 'Hide products' : 'Show products'}
                <ChevronDown className={`h-4 w-4 transition-transform ${openPillars ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
            <div id={`${id}-pillars`} className={`${openPillars ? 'block' : 'hidden'} md:block`}>
              <div className="footer-pillars-grid">
                {PRODUCT_PILLARS.map((item) => (
                  <article key={item.title} className="footer-pillar">
                    <button type="button" onClick={() => navigate(item.actionId)} className="footer-pillar-title">
                      {item.title}
                    </button>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <div className="footer-brand-row">
            <button
              type="button"
              onClick={() => { onHome?.(); scrollToTop(); }}
              className="footer-brand"
              aria-label={isDashboard ? 'Back to accounts overview' : 'Back to homepage top'}
            >
              <ChaseLogo />
            </button>
            <div className="footer-social-row">
              <span>Follow Chase</span>
              <ul aria-label="Chase social channels">
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.name}>
                    <a
                      className="footer-social-link"
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Chase on ${social.name} (opens in a new tab)`}
                    >
                      <img src={social.image} alt="" width={28} height={28} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <nav className="footer-directory" aria-label="Products, planning, support, and company">
            {FOOTER_GROUPS.map((group) => {
              const isOpen = openGroups.includes(group.id);
              const toggleGroup = () => setOpenGroups((prev) =>
                prev.includes(group.id) ? prev.filter((g) => g !== group.id) : [...prev, group.id]
              );
              return (
                <section key={group.id} className="footer-group">
                  <h3>
                    <span className="hidden md:block">{group.title}</span>
                    <button
                      type="button"
                      className="footer-group-toggle md:hidden"
                      aria-expanded={isOpen}
                      aria-controls={`${id}-${group.id}`}
                      onClick={toggleGroup}
                    >
                      {group.title}
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </h3>
                  <ul id={`${id}-${group.id}`} className={`${isOpen ? 'block' : 'hidden'} md:block`}>
                    {group.links.map((link) => <li key={link.label}>{renderLink(link)}</li>)}
                  </ul>
                </section>
              );
            })}
          </nav>

          <nav className="footer-digital" aria-label="Digital banking services">
            <p>More ways to bank</p>
            <ul>
              {DIGITAL_LINKS.map((link) => <li key={link.label}>{renderLink(link, 'footer-link footer-blue-link')}</li>)}
            </ul>
          </nav>

          <section className="footer-disclosures" aria-label="Important information">
            <p className="footer-investment-label">Investment and insurance products are:</p>
            <ul className="footer-investment-notice">
              <li>Not FDIC insured</li>
              <li>Not a deposit</li>
              <li>No bank guarantee</li>
              <li>May lose value</li>
            </ul>
            <p>
              Investment products are not insured by any federal government agency. Investing involves risk,
              including the possible loss of principal. This website is for informational purposes only and does not offer investment advice or financial services.
            </p>
            <p>
              Chase, J.P. Morgan, the Octagon Symbol, and related product names are trademarks of their respective owners.
              Brand artwork is shown for informational and educational purposes only.
            </p>
          </section>

          <div className="footer-legal-row">
            <nav aria-label="Privacy, legal, and accessibility">
              <ul>{LEGAL_LINKS.map((link) => <li key={link.label}>{renderLink(link, 'footer-legal-link')}</li>)}</ul>
            </nav>
            <button type="button" onClick={scrollToTop} className="footer-back-top">
              Back to top <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="footer-bottom-row">
            <span>&copy; {new Date().getFullYear()} Chase Online banking website.</span>
            <div className="footer-regulatory-links">
              {!isDashboard && <button type="button" onClick={() => onAction('admin-login')} className="footer-legal-link">Demo admin sign in</button>}
              <a href="https://www.fdic.gov/resources/deposit-insurance" target="_blank" rel="noopener noreferrer">
                <FdicBadge className="h-[15px] w-auto" />
                About FDIC insurance
                <span className="sr-only"> (external site, opens in a new tab)</span>
              </a>
              <a href="https://www.chase.com/personal/mortgage/fair-lending" target="_blank" rel="noopener noreferrer">
                Equal Housing Opportunity
                <span className="sr-only"> (official external site, opens in a new tab)</span>
              </a>
            </div>
          </div>
        </div>

      </footer>

      {activeDialog && (
        <FooterDialog
          key={activeDialog}
          kind={activeDialog}
          onClose={() => setActiveDialog(null)}
          onNavigate={navigate}
        />
      )}
    </>
  );
}

interface FooterDialogProps {
  kind: FooterDialogId;
  onClose: () => void;
  onNavigate: (actionId: string) => void;
}

function FooterDialog({ kind, onClose, onNavigate }: FooterDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [category, setCategory] = useState('Something is not working');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  const close = () => ref.current?.close();

  const saveFeedback = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim().length < 10) {
      setError('Please add at least 10 characters so your feedback is useful.');
      return;
    }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('chase_feedback_v1') || '[]');
      const entries = Array.isArray(stored) ? stored : [];
      entries.push({ category, message: message.trim(), createdAt: new Date().toISOString() });
      localStorage.setItem('chase_feedback_v1', JSON.stringify(entries.slice(-50)));
      setError('');
      setSaved(true);
    } catch {
      setError('Browser storage is unavailable. Your feedback has not been saved.');
    }
  };

  return (
    <dialog
      ref={ref}
      className="footer-dialog"
      aria-labelledby={titleId}
      onClose={() => { if (!ref.current?.open) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="footer-dialog-inner">
        <div className="footer-dialog-header">
          <h2 id={titleId}>{DIALOG_TITLES[kind]}</h2>
          <button type="button" onClick={close} aria-label="Close dialog" className="footer-dialog-close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {kind === 'support' && (
          <div className="footer-dialog-body">
            <p>Choose a Chase experience below to explore common banking needs and digital tools.</p>
            <ul className="footer-support-options">
              {[
                { title: 'Account access & statements', detail: 'View Chase balances, activity, and documents.', action: 'footer-accounts' },
                { title: 'Card security & account settings', detail: 'Manage Chase card controls and preferences.', action: 'footer-security' },
                { title: 'ATMs, branches & meetings', detail: 'Explore the Chase locator and appointment flow.', action: 'footer-locations' },
              ].map((item) => (
                <li key={item.action}>
                  <button type="button" onClick={() => onNavigate(item.action)}>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <a className="footer-dialog-external" href="https://www.chase.com/digital/customer-service" target="_blank" rel="noopener noreferrer">
              Need help with a real Chase account? Visit official Chase support.
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}

        {kind === 'privacy' && (
          <div className="footer-dialog-body footer-dialog-prose">
            <h3>What this site stores</h3>
            <p>Account choices and preferences are kept in your browser or the local app database so the experience feels familiar across sessions.</p>
            <h3>Your feedback</h3>
            <p>Feedback submitted here is saved only in this browser and is not shared with an external Chase support team.</p>
            <h3>External websites</h3>
            <p>Corporate, social, and regulatory links open external websites in a new tab. Their own privacy policies apply after you leave Chase.</p>
          </div>
        )}

        {kind === 'accessibility' && (
          <div className="footer-dialog-body footer-dialog-prose">
            <p>This experience includes keyboard-operable footer navigation, visible focus indicators, labeled links, and expandable navigation sections on smaller screens.</p>
            <h3>Keyboard navigation</h3>
            <p>Use Tab and Shift + Tab to move between links. Press Enter or Space to open a footer section. Press Escape to close this dialog.</p>
            <h3>Display preferences</h3>
            <p>Use your browser&apos;s zoom controls to enlarge text. Footer animations respect your device&apos;s reduced-motion preference.</p>
            <a className="footer-dialog-external" href="https://www.chase.com/digital/resources/accessibility" target="_blank" rel="noopener noreferrer">
              Official Chase accessibility resources <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}

        {kind === 'directory' && (
          <div className="footer-dialog-body footer-dialog-directory">
            {FOOTER_GROUPS.slice(0, 3).map((group) => (
              <section key={group.id}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.filter((link) => link.actionId).map((link) => (
                    <li key={link.label}>
                      <button type="button" className="footer-blue-link" onClick={() => onNavigate(link.actionId!)}>
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section>
              <h3>Digital banking</h3>
              <ul>{DIGITAL_LINKS.map((link) => (
                <li key={link.label}>
                  <button type="button" className="footer-blue-link" onClick={() => onNavigate(link.actionId!)}>{link.label}</button>
                </li>
              ))}</ul>
            </section>
          </div>
        )}

        {kind === 'feedback' && (
          <div className="footer-dialog-body">
            {saved ? (
              <div className="footer-feedback-saved" role="status">
                <CheckCircle2 className="h-9 w-9 text-[#138842]" aria-hidden="true" />
                <h3>Your feedback is saved.</h3>
                <p>It is stored in this browser only. Nothing was sent to Chase or a support team.</p>
                <button type="button" className="footer-contact" onClick={close}>Close</button>
              </div>
            ) : (
              <form onSubmit={saveFeedback} className="footer-feedback-form" noValidate>
                <p>Tell us about this Chase experience. Please do not include passwords, card numbers, or personal information.</p>
                <label htmlFor={`${titleId}-category`}>What would you like to share?</label>
                <select id={`${titleId}-category`} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option>Something is not working</option>
                  <option>Design feedback</option>
                  <option>Accessibility feedback</option>
                  <option>A feature suggestion</option>
                </select>
                <label htmlFor={`${titleId}-message`}>Your feedback</label>
                <textarea
                  id={`${titleId}-message`}
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); setError(''); }}
                  placeholder="What could we improve?"
                  rows={4}
                  maxLength={1200}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${titleId}-error` : undefined}
                />
                <span className="footer-feedback-count">{message.length}/1,200 characters</span>
                {error && <p id={`${titleId}-error`} role="alert" className="footer-form-error">{error}</p>}
                <button type="submit" className="footer-contact">Save feedback locally <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                <small>Feedback is saved on this device only.</small>
              </form>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}