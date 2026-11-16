import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Calendar,
  MapPin,
  Phone,
  AlertCircle,
} from 'lucide-react';
import { OfferModalPayload } from '../data/chaseData';
import { ProductId, User, fmtMoney, applyAutoLoan } from '../banking/store';

/* -------------------------------------------------------------------------- */
/* 1. Offer & Article Detail Modal                                             */
/* -------------------------------------------------------------------------- */
interface OfferDetailModalProps {
  offer: OfferModalPayload | null;
  onClose: () => void;
  onOpenMortgage?: () => void;
  onOpenWizard?: (product: ProductId) => void;
  onOpenAuto?: () => void;
}

const WIZARD_MAP: Record<string, ProductId> = {
  'total-checking-300': 'total-checking',
  'secure-banking': 'secure-banking',
  'business-complete-300': 'business-checking',
  'chase-savings-cds': 'savings',
  'sapphire-preferred': 'sapphire',
  'freedom-unlimited': 'freedom',
};

export const OfferDetailModal: React.FC<OfferDetailModalProps> = ({
  offer,
  onClose,
  onOpenMortgage,
  onOpenWizard,
  onOpenAuto,
}) => {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(false);
  }, [offer]);

  if (!offer) return null;

  const isGreen = offer.ctaColor === 'green';
  const wizardProduct = WIZARD_MAP[offer.id];

  const handleCta = () => {
    if (wizardProduct && onOpenWizard) {
      onClose();
      onOpenWizard(wizardProduct);
      return;
    }
    if (offer.id === 'chase-auto' && onOpenAuto) {
      onClose();
      onOpenAuto();
      return;
    }
    if (offer.id === 'article-homebuying' && onOpenMortgage) {
      onClose();
      onOpenMortgage();
      return;
    }
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offer-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] bg-white rounded-[4px] shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#005EB8] px-6 py-5 text-white flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
                {offer.eyebrow}
              </span>
              {offer.badge && (
                <span className="text-[10.5px] font-semibold bg-white/20 px-2 py-0.5 rounded-full text-white">
                  {offer.badge}
                </span>
              )}
            </div>
            <h2 id="offer-modal-title" className="text-[22px] font-light leading-snug">
              {offer.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {offer.rateOrBonus && (
            <div className="inline-flex items-center gap-2 bg-[#EAF2FA] border border-[#C6DDF5] text-[#005EB8] px-3 py-1.5 rounded-[4px] text-[13px] font-semibold">
              <span>{offer.rateOrBonus}</span>
            </div>
          )}

          <p className="text-[14px] text-[#353535] leading-relaxed">{offer.subtitle}</p>

          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#565A5D] mb-3">
              Key benefits &amp; details
            </h3>
            <ul className="space-y-2.5">
              {offer.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] text-[#131313]">
                  <CheckCircle2 className="w-4 h-4 text-[#138842] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {submitted ? (
            <div className="rounded-[4px] bg-[#EAF7EE] border border-[#B5E2C4] p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#138842] shrink-0 mt-0.5" />
              <div className="text-[13.5px] text-[#14532D]">
                <p className="font-semibold">You&apos;re ready to continue!</p>
                <p className="mt-0.5">
                  This is a frontend Chase.com homepage showcase. On chase.com, this action launches the encrypted online enrollment workflow.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleCta}
                className={`font-semibold text-[14px] text-white px-6 py-2.5 rounded-[4px] cursor-pointer ${
                  isGreen
                    ? 'bg-[#138842] hover:bg-[#0F6E35]'
                    : 'bg-[#0060F0] hover:bg-[#004EC4]'
                }`}
              >
                {offer.ctaLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[14px] font-medium text-[#353535] hover:text-[#131313] px-4 py-2.5 cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          <p className="text-[11px] text-[#565A5D] leading-relaxed border-t border-[#E9E9E9] pt-4">
            {offer.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Interactive Mortgage Payment Estimator Modal                             */
/* -------------------------------------------------------------------------- */
interface MortgageCalculatorModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: () => void;
}

export const MortgageCalculatorModal: React.FC<MortgageCalculatorModalProps> = ({
  open,
  onClose,
  onSchedule,
}) => {
  const [homePrice, setHomePrice] = useState(450000);
  const [downPercent, setDownPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(6.375);
  const [termYears, setTermYears] = useState<30 | 15>(30);

  if (!open) return null;

  const downPayment = Math.round((homePrice * downPercent) / 100);
  const principal = Math.max(0, homePrice - downPayment);
  const monthlyRate = interestRate / 100 / 12;
  const numPayments = termYears * 12;

  const principalAndInterest =
    monthlyRate === 0
      ? principal / numPayments
      : (principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
        (Math.pow(1 + monthlyRate, numPayments) - 1);

  const estimatedTax = Math.round((homePrice * 0.0115) / 12);
  const estimatedInsurance = Math.round((homePrice * 0.0035) / 12);
  const estimatedPmi = downPercent < 20 ? Math.round((principal * 0.0055) / 12) : 0;
  const totalMonthly = Math.round(principalAndInterest + estimatedTax + estimatedInsurance + estimatedPmi);

  const fmt = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mortgage-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[700px] bg-white rounded-[4px] shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#005EB8] px-6 py-5 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
              Chase Home Lending
            </p>
            <h2 id="mortgage-modal-title" className="text-[22px] font-light">
              Mortgage Payment Estimator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 space-y-5">
            <div>
              <div className="flex justify-between text-[13.5px] mb-1.5">
                <label htmlFor="home-price" className="font-semibold text-[#131313]">
                  Home price
                </label>
                <span className="font-bold text-[#005EB8]">{fmt(homePrice)}</span>
              </div>
              <input
                id="home-price"
                type="range"
                min={150000}
                max={1500000}
                step={10000}
                value={homePrice}
                onChange={(e) => setHomePrice(Number(e.target.value))}
                className="w-full chase-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[13.5px] mb-1.5">
                <label htmlFor="down-pct" className="font-semibold text-[#131313]">
                  Down payment ({downPercent}%)
                </label>
                <span className="font-bold text-[#005EB8]">{fmt(downPayment)}</span>
              </div>
              <input
                id="down-pct"
                type="range"
                min={3}
                max={40}
                step={1}
                value={downPercent}
                onChange={(e) => setDownPercent(Number(e.target.value))}
                className="w-full chase-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[13.5px] mb-1.5">
                <label htmlFor="rate-slider" className="font-semibold text-[#131313]">
                  Interest rate
                </label>
                <span className="font-bold text-[#005EB8]">{interestRate.toFixed(3)}%</span>
              </div>
              <input
                id="rate-slider"
                type="range"
                min={4.5}
                max={8.5}
                step={0.125}
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                className="w-full chase-slider"
              />
            </div>

            <div>
              <span className="block text-[13.5px] font-semibold text-[#131313] mb-2">
                Loan term
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {([30, 15] as const).map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setTermYears(yr);
                      setInterestRate(yr === 30 ? 6.375 : 5.75);
                    }}
                    className={`py-2 text-[13.5px] font-semibold rounded-[4px] border cursor-pointer ${
                      termYears === yr
                        ? 'bg-[#005EB8] text-white border-[#005EB8]'
                        : 'bg-white text-[#131313] border-[#B9C4D0] hover:border-[#005EB8]'
                    }`}
                  >
                    {yr}-Year Fixed
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-5 bg-[#F1F1F0] border border-[#E9E9E9] rounded-[4px] p-5 flex flex-col justify-between">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#565A5D]">
                Estimated Monthly Payment
              </p>
              <p className="mt-1 text-[34px] font-light text-[#131313] leading-tight">
                {fmt(totalMonthly)}
                <span className="text-[14px] text-[#565A5D]">/mo</span>
              </p>
              <p className="text-[12px] text-[#565A5D] mt-0.5">
                Loan amount: {fmt(principal)}
              </p>

              <div className="mt-4 pt-4 border-t border-[#D8D8D8] space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#353535]">Principal &amp; Interest</span>
                  <strong className="text-[#131313]">{fmt(Math.round(principalAndInterest))}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#353535]">Est. Property Taxes</span>
                  <strong className="text-[#131313]">{fmt(estimatedTax)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#353535]">Est. Home Insurance</span>
                  <strong className="text-[#131313]">{fmt(estimatedInsurance)}</strong>
                </div>
                {estimatedPmi > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#353535]">Est. Mortgage Insurance</span>
                    <strong className="text-[#131313]">{fmt(estimatedPmi)}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSchedule();
                }}
                className="w-full bg-[#138842] hover:bg-[#0F6E35] text-white font-semibold text-[14px] py-2.5 rounded-[4px] cursor-pointer"
              >
                Speak with a Home Lending Advisor
              </button>
              <p className="mt-2.5 text-[10.5px] text-[#565A5D] leading-snug">
                Estimates are illustrative only and do not represent a loan commitment. Equal Housing Opportunity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Schedule a Meeting Modal                                                 */
/* -------------------------------------------------------------------------- */
interface ScheduleMeetingModalProps {
  open: boolean;
  onClose: () => void;
}

export const ScheduleMeetingModal: React.FC<ScheduleMeetingModalProps> = ({ open, onClose }) => {
  const [topic, setTopic] = useState('Everyday Banking & Checking');
  const [mode, setMode] = useState<'branch' | 'phone'>('branch');
  const [zip, setZip] = useState('10017');
  const [slot, setSlot] = useState('Tomorrow • 10:30 AM');
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (open) setBooked(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] bg-white rounded-[4px] shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#005EB8] px-6 py-5 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
              Chase Appointments
            </p>
            <h2 id="schedule-modal-title" className="text-[21px] font-light">
              Schedule a meeting with a banker
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scheduler"
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {booked ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#EAF7EE] text-[#138842] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-[20px] font-semibold text-[#131313]">
                Appointment Confirmed
              </h3>
              <p className="text-[14px] text-[#353535] max-w-[380px] mx-auto">
                Your <strong>{mode === 'branch' ? 'In-Branch' : 'Phone'}</strong> consultation for{' '}
                <strong>{topic}</strong> is reserved for <strong>{slot}</strong>
                {mode === 'branch' ? ` near ZIP ${zip}` : ''}.
              </p>
              <p className="text-[12px] font-mono bg-[#F1F1F0] inline-block px-3 py-1 rounded border border-[#E9E9E9] text-[#005EB8]">
                Confirmation #: CH-{Math.floor(100000 + Math.random() * 899999)}
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-7 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setBooked(true);
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="meeting-topic" className="block text-[13px] font-semibold text-[#131313] mb-1.5">
                  How can we help you?
                </label>
                <select
                  id="meeting-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full h-[40px] px-3 border border-[#B9C4D0] rounded-[4px] text-[14px] bg-white focus:border-[#0060F0] outline-none"
                >
                  <option>Everyday Banking &amp; Checking</option>
                  <option>Credit Cards &amp; Rewards</option>
                  <option>Home Lending &amp; Mortgages</option>
                  <option>J.P. Morgan Wealth Management</option>
                  <option>Chase for Business®</option>
                </select>
              </div>

              <div>
                <span className="block text-[13px] font-semibold text-[#131313] mb-1.5">
                  Meeting format
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('branch')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-[4px] border text-[13.5px] font-semibold cursor-pointer ${
                      mode === 'branch'
                        ? 'bg-[#EAF2FA] border-[#0060F0] text-[#005EB8]'
                        : 'border-[#B9C4D0] text-[#353535]'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    <span>In Branch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('phone')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-[4px] border text-[13.5px] font-semibold cursor-pointer ${
                      mode === 'phone'
                        ? 'bg-[#EAF2FA] border-[#0060F0] text-[#005EB8]'
                        : 'border-[#B9C4D0] text-[#353535]'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>By Phone</span>
                  </button>
                </div>
              </div>

              {mode === 'branch' && (
                <div>
                  <label htmlFor="branch-zip" className="block text-[13px] font-semibold text-[#131313] mb-1.5">
                    ZIP code for nearest Chase branch
                  </label>
                  <input
                    id="branch-zip"
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full h-[40px] px-3 border border-[#B9C4D0] rounded-[4px] text-[14px] focus:border-[#0060F0] outline-none"
                  />
                </div>
              )}

              <div>
                <span className="block text-[13px] font-semibold text-[#131313] mb-1.5">
                  Preferred time slot
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Tomorrow • 10:30 AM',
                    'Tomorrow • 2:00 PM',
                    'Thu • 11:00 AM',
                    'Fri • 3:30 PM',
                  ].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSlot(time)}
                      className={`px-3 py-2 text-[12.5px] font-medium rounded-[4px] border flex items-center gap-1.5 cursor-pointer ${
                        slot === time
                          ? 'bg-[#005EB8] text-white border-[#005EB8]'
                          : 'bg-white text-[#131313] border-[#B9C4D0] hover:border-[#005EB8]'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>{time}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-[14px] text-[#353535] hover:text-[#131313] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Reserve appointment
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Chase Auto Loan Application Modal                                        */
/* -------------------------------------------------------------------------- */
interface AutoLoanModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onUpdateUser: (user: User) => void;
  onEnroll: () => void;
}

export const AutoLoanModal: React.FC<AutoLoanModalProps> = ({
  open,
  onClose,
  user,
  onUpdateUser,
  onEnroll,
}) => {
  const [price, setPrice] = useState(32000);
  const [down, setDown] = useState(5000);
  const [term, setTerm] = useState(60);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const APR = 6.9;
  const loan = Math.max(0, price - down);
  const r = APR / 100 / 12;
  const monthly = loan > 0 ? (loan * r) / (1 - Math.pow(1 + r, -term)) : 0;

  const fmt = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const [applying, setApplying] = useState(false);

  const submit = async () => {
    if (!user) {
      setError('Please sign in or enroll to apply for auto financing.');
      return;
    }
    if (loan <= 0) {
      setError('Vehicle price must be greater than the down payment.');
      return;
    }
    setApplying(true);
    try {
      const updated = await applyAutoLoan(price, down, term);
      onUpdateUser(updated);
      setError(null);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Application failed. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-white rounded-[4px] shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#005EB8] px-6 py-5 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
              Chase Auto
            </p>
            <h2 id="auto-modal-title" className="text-[22px] font-light">
              Apply for auto financing
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close application"
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {submitted ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#EAF7EE] text-[#138842] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-[20px] font-semibold text-[#131313]">Application approved</h3>
              <p className="text-[14px] text-[#353535] max-w-[400px] mx-auto">
                Your Chase Auto Loan of <strong>{fmt(loan)}</strong> is funded. Estimated monthly payment:{' '}
                <strong>{fmtMoney(Math.round(monthly * 100) / 100)}</strong> over {term} months at {APR}% APR.
              </p>
              <p className="text-[12px] text-[#565A5D]">Your loan now appears in your Chase Online accounts.</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-7 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-[13.5px] mb-1.5">
                  <label htmlFor="vehicle-price" className="font-semibold text-[#131313]">Vehicle price</label>
                  <span className="font-bold text-[#005EB8]">{fmt(price)}</span>
                </div>
                <input
                  id="vehicle-price"
                  type="range"
                  min={8000}
                  max={90000}
                  step={500}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full chase-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[13.5px] mb-1.5">
                  <label htmlFor="down-payment" className="font-semibold text-[#131313]">Down payment</label>
                  <span className="font-bold text-[#005EB8]">{fmt(down)}</span>
                </div>
                <input
                  id="down-payment"
                  type="range"
                  min={0}
                  max={40000}
                  step={500}
                  value={down}
                  onChange={(e) => setDown(Number(e.target.value))}
                  className="w-full chase-slider"
                />
              </div>

              <div>
                <span className="block text-[13.5px] font-semibold text-[#131313] mb-2">Loan term</span>
                <div className="grid grid-cols-4 gap-2">
                  {[36, 48, 60, 72].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerm(t)}
                      className={`py-2 text-[13px] font-semibold rounded-[4px] border cursor-pointer ${
                        term === t
                          ? 'bg-[#005EB8] text-white border-[#005EB8]'
                          : 'bg-white text-[#131313] border-[#B9C4D0] hover:border-[#005EB8]'
                      }`}
                    >
                      {t} mo
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#F1F1F0] border border-[#E9E9E9] rounded-[4px] p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#565A5D]">Loan amount</p>
                  <p className="mt-1 text-[16px] font-semibold text-[#131313]">{fmt(loan)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#565A5D]">Est. payment</p>
                  <p className="mt-1 text-[16px] font-semibold text-[#131313]">{fmt(Math.round(monthly))}/mo</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#565A5D]">APR</p>
                  <p className="mt-1 text-[16px] font-semibold text-[#131313]">{APR}%</p>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-[4px] bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[12.5px] text-[#B42318]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3">
                {!user && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEnroll();
                    }}
                    className="text-[14px] font-semibold text-[#005EB8] hover:underline cursor-pointer"
                  >
                    Enroll in Chase Online
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={applying}
                  className="bg-[#0060F0] hover:bg-[#004EC4] disabled:opacity-60 text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  {applying ? 'Submitting…' : 'Submit application'}
                </button>
              </div>

              <p className="text-[10.5px] text-[#565A5D] leading-snug">
                Estimates are illustrative only. Auto financing is subject to credit approval and vehicle eligibility.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
