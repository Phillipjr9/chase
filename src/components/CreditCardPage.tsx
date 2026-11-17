import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  HelpCircle,
  KeyRound,
  Lock,
  Minus,
  Plane,
  Plus,
  Search,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { BrandLogo, ChaseCardImage, cardProductFor } from './ChaseAssets';
import { CardPageSkeleton, Spinner } from './Loading';
import { OFFERS } from '../data/chaseFeatures';
import {
  Account,
  User,
  fmtMoney,
  nextDueDate,
  fmtDueDate,
  updateCardControls,
  updateSecuritySettings,
  revealCardNumber,
  replaceCard,
  disputeTransaction,
} from '../banking/store';
import type { Section as SettingsSection } from './SettingsPage';

interface Props {
  account: Account;
  user: User;
  onUpdateUser: (u: User) => void;
  onBack: () => void;
  onPay: () => void;
  onStatements: () => void;
  onSettings: (section: SettingsSection) => void;
  onSecurity: () => void;
  onTravel: () => void;
  onOffers: () => void;
}

const BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

const Dotted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="border-b border-dotted border-[#8A929A] pb-px">{children}</span>
);

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-white border rounded-[6px] ${className}`} style={{ borderColor: LINE }}>
    {children}
  </section>
);

const OutlineBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, className = '', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[132px] border bg-white hover:bg-[#F2F6FB] text-[15px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60 ${className}`}
    style={{ borderColor: BLUE, color: BLUE }}
  >
    {children}
  </button>
);

const TextButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}> = ({ children, onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1 font-semibold hover:underline cursor-pointer ${className}`}
    style={{ color: BLUE }}
  >
    {children}
  </button>
);

interface BonusRule {
  spend: number;
  deadline: string;
  reward: string;
}

function bonusRuleFor(account: Account): BonusRule {
  const name = account.name.toLowerCase();
  if (name.includes('ink business preferred')) {
    return { spend: 8000, deadline: 'Aug 1, 2026', reward: '100,000 bonus points' };
  }
  if (name.includes('ink')) {
    return { spend: 6000, deadline: 'Aug 1, 2026', reward: '$750 cash back' };
  }
  if (name.includes('reserve')) {
    return { spend: 6000, deadline: 'Aug 1, 2026', reward: '150,000 bonus points' };
  }
  if (name.includes('sapphire')) {
    return { spend: 4000, deadline: 'Aug 1, 2026', reward: '60,000 bonus points' };
  }
  return { spend: 500, deadline: 'Aug 1, 2026', reward: '$200 cash back' };
}

function cardBenefits(account: Account): { title: string; detail: string }[] {
  const name = account.name.toLowerCase();
  if (name.includes('ink')) {
    return [
      { title: 'Business rewards', detail: 'Earn rewards on eligible business purchases with no preset spending limit categories.' },
      { title: 'Employee cards', detail: 'Issue additional cards to employees at no additional cost and track spending by card.' },
      { title: 'Purchase protection', detail: 'Covered purchases are protected against damage and theft for the first 120 days.' },
    ];
  }
  if (name.includes('reserve')) {
    return [
      { title: '$300 Annual Travel Credit', detail: 'Automatically receive statement credits for the first $300 in travel purchases each account anniversary year.' },
      { title: 'Chase Sapphire Lounge by The Club', detail: 'Complimentary airport lounge access for you and guests with a Priority Pass™ Select membership.' },
      { title: 'Global Entry, TSA PreCheck® or NEXUS', detail: 'Up to $100 statement credit every 4 years for the application fee.' },
    ];
  }
  if (name.includes('sapphire')) {
    return [
      { title: '5x on Chase Travel℠', detail: 'Earn 5 total points per $1 spent on travel purchased through Chase Travel℠, excluding eligible hotel stays that qualify for the $50 hotel credit.' },
      { title: '$50 Annual Chase Travel Hotel Credit', detail: 'Automatically receive statement credits each account anniversary year for hotel stays booked through Chase Travel℠.' },
      { title: '3x on dining', detail: 'Earn 3 points per $1 on dining, select streaming services, and online grocery purchases.' },
    ];
  }
  return [
    { title: 'Unlimited 1.5% cash back', detail: 'Earn unlimited 1.5% cash back or more on every purchase, with no rotating categories.' },
    { title: '3% on dining and drugstores', detail: 'Earn 3% cash back on dining at restaurants and drugstore purchases.' },
    { title: '5% on Chase Travel℠', detail: 'Earn 5% cash back on travel purchased through Chase Travel℠.' },
  ];
}

function purchases(account: Account): number {
  return account.transactions.reduce((sum, t) => {
    const excluded = ['Payment', 'Rewards', 'Credit', 'Fee', 'Interest'];
    return t.amount > 0 && !excluded.includes(t.category) ? sum + t.amount : sum;
  }, 0);
}

const offerKey = (userId: string, accountId: string) => `chase_card_offers_${userId}_${accountId}`;

export const CreditCardPage: React.FC<Props> = ({
  account,
  user,
  onUpdateUser,
  onBack,
  onPay,
  onStatements,
  onSettings,
  onSecurity,
  onTravel,
  onOffers,
}) => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [account.id]);

  const [cardReady, setCardReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setCardReady(true), 420);
    return () => window.clearTimeout(timer);
  }, [account.id]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealPassword, setRevealPassword] = useState('');
  const [revealed, setRevealed] = useState<{ cardNumber: string; expiry: string; cvv: string } | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceReason, setReplaceReason] = useState<'lost' | 'stolen' | 'damaged' | 'not-received'>('lost');
  const [autopayOpen, setAutopayOpen] = useState(false);
  const [autopayFrom, setAutopayFrom] = useState(user.accounts.find((a) => a.type === 'checking')?.id || '');
  const [autopayAmount, setAutopayAmount] = useState<'minimum' | 'statement' | 'current'>(account.autopayAmount || 'statement');
  const [autopayDay, setAutopayDay] = useState(account.autopayDay || 1);
  const [disputeTx, setDisputeTx] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('I did not make this purchase');
  const [detailTx, setDetailTx] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'purchases' | 'credits'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'largest'>('newest');
  const [showAll, setShowAll] = useState(false);
  const [addedOffers, setAddedOffers] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(offerKey(user.id, account.id)) || '[]');
      return Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  const limit = account.creditLimit || 0;
  const availableCredit = Math.max(0, limit - account.balance);
  const statementBalance = account.statementBalance ?? account.balance;
  const minimumPayment = Math.min(statementBalance, Math.max(35, statementBalance * 0.02));
  const dueDate = fmtDueDate(nextDueDate(user.home?.dueDay ?? 1));
  const benefits = useMemo(() => cardBenefits(account), [account]);
  const rule = useMemo(() => bonusRuleFor(account), [account]);
  const spent = purchases(account);
  const remaining = Math.max(0, rule.spend - spent);
  const progress = Math.min(100, (spent / rule.spend) * 100);

  const activity = useMemo(() => {
    const filtered = account.transactions.filter((t) => {
      const matchesFilter =
        activityFilter === 'all' ||
        (activityFilter === 'purchases' ? t.amount > 0 : t.amount < 0);
      return matchesFilter && `${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase());
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'oldest') return +new Date(a.date) - +new Date(b.date);
      if (sort === 'largest') return Math.abs(b.amount) - Math.abs(a.amount);
      return +new Date(b.date) - +new Date(a.date);
    });
  }, [account.transactions, activityFilter, search, sort]);

  const visibleActivity = showAll ? activity : activity.slice(0, 25);

  const changeControl = async (patch: { locked?: boolean; autopay?: boolean }) => {
    setBusy(typeof patch.locked === 'boolean' ? 'lock' : 'autopay');
    try {
      onUpdateUser(await updateCardControls(account.id, patch));
      setNotice({
        kind: 'success',
        text:
          typeof patch.locked === 'boolean'
            ? patch.locked
              ? 'Card locked. New purchases and ATM withdrawals are blocked.'
              : 'Card unlocked and ready to use.'
            : `Automatic payments turned ${patch.autopay ? 'on' : 'off'}.`,
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update card settings.' });
    } finally {
      setBusy(null);
    }
  };

  const toggleOffer = (offerId: string) => {
    setAddedOffers((current) => {
      const next = current.includes(offerId)
        ? current.filter((id) => id !== offerId)
        : [...current, offerId];
      try {
        localStorage.setItem(offerKey(user.id, account.id), JSON.stringify(next));
      } catch {
        /* The selection remains available for this session if storage is unavailable. */
      }
      return next;
    });
  };

  const changePaperless = async (paperless: boolean) => {
    setBusy('paperless');
    try {
      onUpdateUser(await updateSecuritySettings({ paperless }));
      setNotice({
        kind: 'success',
        text: paperless ? 'Paperless turned on. Future statements will be available online.' : 'Paperless turned off.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update paperless settings.' });
    } finally {
      setBusy(null);
    }
  };

  const paperless = user.security?.paperless ?? true;
  const disputes = user.disputes || [];
  const openDisputes = disputes.filter((d) => d.status === 'open' && d.accountId === account.id);
  const payments = account.transactions.filter((t) => t.category === 'Payment').slice(0, 4);
  const fundingAccounts = user.accounts.filter((a) => ['checking', 'savings'].includes(a.type));

  const doReveal = async () => {
    setBusy('reveal');
    try {
      const data = await revealCardNumber(account.id, revealPassword);
      setRevealed(data);
      setRevealPassword('');
      setNotice({ kind: 'success', text: 'Card number revealed. Never share it with anyone who contacts you.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Card number could not be revealed.' });
    } finally {
      setBusy(null);
    }
  };

  const doReplace = async () => {
    setBusy('replace');
    try {
      const updated = await replaceCard(account.id, replaceReason);
      onUpdateUser(updated);
      setReplaceOpen(false);
      setNotice({
        kind: 'success',
        text: 'Replacement ordered. Your new card arrives in 5–7 business days and the old card is locked.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Replacement could not be ordered.' });
    } finally {
      setBusy(null);
    }
  };

  const doAutopay = async () => {
    setBusy('autopay');
    try {
      const updated = await updateCardControls(account.id, {
        autopay: true,
        autopayFromId: autopayFrom,
        autopayAmount,
        autopayDay,
      });
      onUpdateUser(updated);
      setAutopayOpen(false);
      setNotice({ kind: 'success', text: `Automatic payments are on. We'll pay the ${autopayAmount === 'minimum' ? 'minimum' : autopayAmount === 'current' ? 'current balance' : 'statement balance'} on day ${autopayDay}.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Automatic payments could not be set up.' });
    } finally {
      setBusy(null);
    }
  };

  const doDispute = async () => {
    if (!disputeTx) return;
    setBusy('dispute');
    try {
      const updated = await disputeTransaction(account.id, disputeTx, disputeReason);
      onUpdateUser(updated);
      setDisputeTx(null);
      setDetailTx(null);
      setNotice({ kind: 'success', text: 'Dispute submitted. We’ll review it and send updates to your secure messages; provisional credit may apply.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Dispute could not be submitted.' });
    } finally {
      setBusy(null);
    }
  };

  const downloadCardStatement = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount'],
      ...account.transactions.map((t) => [
        new Date(t.date).toLocaleDateString('en-US'),
        `"${t.description.replace(/"/g, '""')}"`,
        t.category,
        t.amount.toFixed(2),
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${account.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-statement.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!cardReady) return <CardPageSkeleton />;

  return (
    <div className="bg-white">
      <div className="max-w-[1260px] mx-auto px-4 sm:px-8 pt-4">
        <TextButton onClick={onBack} className="text-[13px]">
          <ArrowLeft className="w-4 h-4" /> Accounts
        </TextButton>
      </div>

      {/* Chase card account header */}
      <div className="max-w-[1260px] mx-auto px-4 sm:px-8 pt-4 pb-5">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-[22px] font-light" style={{ color: INK }}>
              {account.nickname?.trim() || account.name}{' '}
              <span style={{ color: FAINT }}>(…{account.mask})</span>
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[15px]" style={{ color: '#353535' }}>
                <Dotted>Current balance</Dotted>
              </span>
              <span className="text-[#C9CDD1]">|</span>
              <TextButton
                onClick={() => setDetailsOpen((v) => !v)}
                className="text-[15px]"
              >
                {detailsOpen ? 'Hide details' : 'Show details'}
                <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </TextButton>
            </div>
            <p className="mt-1.5 text-[44px] leading-none font-light" style={{ color: INK }}>
              {fmtMoney(account.balance)}
            </p>
            <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
              <Dotted>Remaining statement balance {fmtMoney(statementBalance)}</Dotted>
            </p>
          </div>
          <div className="w-[132px] sm:w-[164px] shrink-0">
            <ChaseCardImage
              product={cardProductFor(account.name, account.type)}
              className="rounded-[7px] shadow-[0_2px_8px_rgba(0,22,60,0.24)]"
            />
          </div>
        </div>

        {/* Chase's inline account metrics */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          <div>
            <p className="text-[17px]" style={{ color: INK }}>{fmtMoney(availableCredit)}</p>
            <p className="mt-0.5 text-[12px]" style={{ color: FAINT }}>Available credit</p>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <TextButton
                onClick={() => setAutopayOpen(true)}
                className="text-[17px] disabled:opacity-60"
              >
                {busy === 'autopay' ? <Spinner size="sm" /> : account.autopay ? 'On' : 'Off'}
                <span className="text-[#C9CDD1] mx-1">|</span>
                {account.autopay ? 'Manage' : 'Set up'}
                <ChevronRight className="w-4 h-4" />
              </TextButton>
              <p className="mt-0.5 text-[12px]" style={{ color: FAINT }}>Automatic payments</p>
            </div>
          </div>
          <div>
            <TextButton onClick={onTravel} className="text-[17px]">
              {(account.rewardsPoints || 0).toLocaleString()}
              <span className="text-[#C9CDD1] mx-1">|</span>
              Redeem <ChevronRight className="w-4 h-4" />
            </TextButton>
            <p className="mt-0.5 text-[12px]" style={{ color: FAINT }}>Ultimate Rewards® points</p>
          </div>
        </div>

        {detailsOpen && (
          <dl className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-t pt-4" style={{ borderColor: LINE }}>
            {[
              { k: 'Current balance', v: fmtMoney(account.balance) },
              { k: 'Statement balance', v: fmtMoney(statementBalance) },
              { k: 'Minimum payment due', v: fmtMoney(minimumPayment) },
              { k: 'Payment due date', v: dueDate },
              { k: 'Credit limit', v: limit ? fmtMoney(limit) : 'Not available' },
              { k: 'Available credit', v: fmtMoney(availableCredit) },
              { k: 'Purchase APR', v: `${account.apr ?? 0}%` },
              { k: 'Card status', v: account.locked ? 'Locked' : 'Active' },
            ].map((item) => (
              <div key={item.k}>
                <dt className="text-[11px]" style={{ color: FAINT }}>{item.k}</dt>
                <dd className="mt-0.5 text-[13.5px]" style={{ color: INK }}>{item.v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="max-w-[1260px] mx-auto px-4 sm:px-8">
        <hr style={{ borderColor: LINE }} />
        <div className="py-4 flex flex-wrap items-center gap-2.5">
          <OutlineBtn onClick={onPay}>Pay card</OutlineBtn>
          <OutlineBtn onClick={onStatements}>Statements</OutlineBtn>
          <OutlineBtn onClick={() => changePaperless(!paperless)} disabled={busy === 'paperless'} className={busy === 'paperless' ? 'opacity-60' : ''}>
            {busy === 'paperless' && <Spinner size="sm" />}
            Paperless{paperless ? ' (on)' : ' (off)'}
          </OutlineBtn>
          <div className="relative">
            <OutlineBtn
              onClick={() => setMoreOpen((v) => !v)}
              className="min-w-[112px]"
            >
              More <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </OutlineBtn>
            {moreOpen && (
              <div className="absolute left-0 top-[50px] z-30 w-[240px] bg-white border rounded-[5px] shadow-[0_10px_30px_rgba(0,22,60,0.18)] overflow-hidden" style={{ borderColor: LINE }}>
                {[
                  {
                    label: busy === 'lock' ? 'Updating card…' : account.locked ? 'Unlock card' : 'Lock card',
                    icon: account.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />,
                    action: () => changeControl({ locked: !account.locked }),
                  },
                  {
                    label: revealed ? 'Hide card number' : 'View card number',
                    icon: <KeyRound className="w-4 h-4" />,
                    action: () => {
                      if (revealed) {
                        setRevealed(null);
                        setNotice({ kind: 'success', text: 'Card number hidden.' });
                      } else {
                        setRevealOpen(true);
                      }
                    },
                  },
                  { label: 'Replace card', icon: <CreditCard className="w-4 h-4" />, action: () => setReplaceOpen(true) },
                  { label: 'Set up automatic payments', icon: <FileText className="w-4 h-4" />, action: () => setAutopayOpen(true) },
                  { label: 'Account settings', icon: <ShieldCheck className="w-4 h-4" />, action: () => onSettings('accounts') },
                  { label: 'Travel notices', icon: <Plane className="w-4 h-4" />, action: () => onSettings('travel') },
                  { label: 'Alert preferences', icon: <Bell className="w-4 h-4" />, action: () => onSettings('alerts') },
                  { label: 'Security & fraud center', icon: <ShieldCheck className="w-4 h-4" />, action: onSecurity },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      item.action();
                    }}
                    className="w-full px-4 py-3 flex items-center gap-2.5 text-left text-[13px] hover:bg-[#F7FAFD] border-b last:border-b-0 cursor-pointer"
                    style={{ borderColor: LINE, color: INK }}
                  >
                    <span style={{ color: BLUE }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="max-w-[1260px] mx-auto px-4 sm:px-8 pb-3">
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-[4px] px-3 py-2 text-[13px] ${
              notice.kind === 'success'
                ? 'bg-[#EAF7EE] border border-[#B5E2C4] text-[#14532D]'
                : 'bg-[#FEF2F2] border border-[#F5C2C7] text-[#B42318]'
            }`}
          >
            {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        </div>
      )}

      {/* Chase's pale card-content area */}
      <div className="bg-[#F4F5F6] border-t" style={{ borderColor: LINE }}>
        <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* New card bonus */}
            <Panel className="p-5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>New card bonus</h2>
                <HelpCircle className="w-4 h-4" style={{ color: FAINT }} />
              </div>
              <p className="mt-2 text-[14px]" style={{ color: INK }}>
                Spend {fmtMoney(rule.spend)} by {rule.deadline} to earn {rule.reward}.
              </p>
              <div className="mt-3 h-2 rounded-full bg-[#D8DBDE] overflow-hidden" role="progressbar" aria-label="Bonus spending progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-[#0060F0]" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px]" style={{ color: MUTED }}>
                <span>{fmtMoney(spent)} spent</span>
                <span>{remaining > 0 ? `${fmtMoney(remaining)} to go` : 'Offer complete'}</span>
              </div>
            </Panel>

            {/* Chase Offers */}
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Chase Offers</h2>
                <TextButton onClick={onOffers} className="text-[13px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#1A4488] text-white">{OFFERS.length}</span>
                  <ChevronRight className="w-4 h-4" />
                </TextButton>
              </div>
              <p className="mt-1 text-[13px]" style={{ color: MUTED }}>Add deals, shop and get cash back</p>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {OFFERS.slice(0, 2).map((offer) => {
                  const added = addedOffers.includes(offer.id);
                  return (
                    <li key={offer.id} className="border rounded-[5px] p-3 flex items-center gap-2.5" style={{ borderColor: LINE }}>
                      <BrandLogo brand={offer.brand} alt={offer.merchant} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] truncate" style={{ color: MUTED }}>{offer.merchant}</p>
                        <p className="text-[14px] font-semibold" style={{ color: INK }}>{offer.value}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`${added ? 'Remove' : 'Add'} ${offer.merchant} offer`}
                        aria-pressed={added}
                        onClick={() => toggleOffer(offer.id)}
                        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${added ? 'text-white' : 'hover:bg-[#F2F6FB]'}`}
                        style={{ borderColor: BLUE, backgroundColor: added ? BLUE : 'white', color: added ? 'white' : BLUE }}
                      >
                        {added ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Account activity */}
            <Panel className="lg:col-span-8 overflow-hidden">
              <div className="px-4 sm:px-5 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Account activity</h2>
                  <div className="flex flex-wrap gap-1">
                    {([
                      ['all', 'All'],
                      ['purchases', 'Purchases'],
                      ['credits', 'Payments & credits'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActivityFilter(id)}
                        aria-pressed={activityFilter === id}
                        className={`px-3 py-1.5 text-[12px] font-semibold rounded-[3px] cursor-pointer ${
                          activityFilter === id ? 'bg-[#1A4488] text-white' : 'text-[#353535] hover:bg-[#F2F6FB]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_190px] gap-2.5 pb-4 border-b" style={{ borderColor: LINE }}>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search transactions"
                      aria-label="Search card transactions"
                      className="w-full h-10 pl-9 pr-3 border border-[#B7BEC6] rounded-[4px] text-[14px] outline-none focus:border-[#1A4488]"
                    />
                  </div>
                  <label className="sr-only" htmlFor="card-activity-sort">Sort transactions</label>
                  <select
                    id="card-activity-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="h-10 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[13px] outline-none focus:border-[#1A4488]"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="largest">Largest amount</option>
                  </select>
                </div>
              </div>

              {visibleActivity.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px]" style={{ color: MUTED }}>
                  No activity matches your filters.
                </p>
              ) : (
                <ul className="px-4 sm:px-5">
                  {visibleActivity.map((t, i) => (
                    <li key={t.id} className={`${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#EFF0F1' }}>
                      <button
                        type="button"
                        onClick={() => setDetailTx(t.id)}
                        className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-[#F7FAFD] cursor-pointer"
                        aria-label={`View transaction ${t.description}`}
                      >
                        <span className="w-[78px] shrink-0 text-[12px]" style={{ color: MUTED }}>
                          {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] truncate" style={{ color: INK }}>{t.description}</span>
                          <span className="block text-[11px] mt-0.5" style={{ color: FAINT }}>
                            {t.category}{t.status === 'pending' ? ' · Pending' : ' · Posted'}
                            {t.disputedAt && <span className="ml-1.5 font-semibold" style={{ color: BLUE }}>· Disputed</span>}
                          </span>
                        </span>
                        <span className={`text-[13.5px] font-medium shrink-0 ${t.amount < 0 ? 'text-[#138842]' : 'text-[#131313]'}`}>
                          {t.amount < 0 ? `-${fmtMoney(Math.abs(t.amount))}` : fmtMoney(t.amount)}
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {activity.length > 25 && (
                <div className="px-4 sm:px-5 py-3 border-t" style={{ borderColor: '#EFF0F1' }}>
                  <TextButton onClick={() => setShowAll((v) => !v)} className="text-[12.5px]">
                    {showAll ? 'Show fewer transactions' : `Show all ${activity.length} transactions`}
                  </TextButton>
                </div>
              )}
            </Panel>

            {/* Card-specific right rail */}
            <aside className="lg:col-span-4 space-y-4">
              <Panel className="p-4">
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Payment due</h2>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[22px] font-light" style={{ color: INK }}>{fmtMoney(minimumPayment)}</p>
                    <p className="text-[11.5px]" style={{ color: FAINT }}>Minimum payment</p>
                  </div>
                  <p className="text-[13px] font-semibold text-right" style={{ color: INK }}>{dueDate}</p>
                </div>
                <p className="mt-2 text-[12px]" style={{ color: MUTED }}>
                  Pay your statement balance of {fmtMoney(statementBalance)} by the due date to avoid interest.
                </p>
                <div className="mt-3">
                  <TextButton onClick={onPay} className="text-[13px]">Make a payment <ChevronRight className="w-3.5 h-3.5" /></TextButton>
                </div>
              </Panel>

              <Panel className="p-4">
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Card benefits</h2>
                <ul className="mt-3 space-y-3">
                  {benefits.map((benefit) => (
                    <li key={benefit.title}>
                      <p className="text-[13px] font-semibold" style={{ color: BLUE }}>{benefit.title}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>{benefit.detail}</p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Statements &amp; documents</h2>
                  <FileText className="w-4 h-4" style={{ color: BLUE }} />
                </div>
                <ul className="mt-2.5">
                  {[0, 1, 2].map((offset) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - offset);
                    return (
                      <li key={offset} className="flex items-center gap-2 py-2 border-b last:border-b-0" style={{ borderColor: '#EFF0F1' }}>
                        <span className="flex-1 min-w-0 text-[12.5px]" style={{ color: INK }}>
                          {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} statement
                        </span>
                        <button
                          type="button"
                          onClick={downloadCardStatement}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline cursor-pointer"
                          style={{ color: BLUE }}
                          aria-label={`Download ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} statement`}
                        >
                          <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <TextButton onClick={onStatements} className="mt-2.5 text-[12.5px]">
                  View all statements <ChevronRight className="w-3.5 h-3.5" />
                </TextButton>
              </Panel>

              <Panel className="p-4">
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Recent payments</h2>
                {payments.length === 0 ? (
                  <p className="mt-2 text-[12.5px]" style={{ color: MUTED }}>No payments yet.</p>
                ) : (
                  <ul className="mt-2.5">
                    {payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 text-[12.5px]" style={{ borderColor: '#EFF0F1' }}>
                        <span style={{ color: MUTED }}>
                          {new Date(payment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="flex-1 min-w-0 truncate" style={{ color: INK }}>{payment.description}</span>
                        <span className="font-medium text-[#138842]">{fmtMoney(Math.abs(payment.amount))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {openDisputes.length > 0 && (
                <Panel className="p-4">
                  <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Open disputes</h2>
                  <ul className="mt-2.5 space-y-2">
                    {openDisputes.map((dispute) => (
                      <li key={dispute.id} className="border rounded-[5px] p-2.5" style={{ borderColor: LINE }}>
                        <p className="text-[12.5px] font-semibold" style={{ color: INK }}>{dispute.description}</p>
                        <p className="text-[11.5px] mt-0.5" style={{ color: MUTED }}>
                          {fmtMoney(dispute.amount)} · {dispute.reason}
                        </p>
                        <p className="text-[11px] mt-1 font-semibold uppercase tracking-wide" style={{ color: BLUE }}>
                          {dispute.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel className="p-4">
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Account details</h2>
                <dl className="mt-2.5 space-y-2 text-[12.5px]">
                  {[
                    { k: 'Account number', v: `…${account.mask}` },
                    { k: 'Credit limit', v: limit ? fmtMoney(limit) : 'Not available' },
                    { k: 'Available credit', v: fmtMoney(availableCredit) },
                    { k: 'Purchase APR', v: `${account.apr ?? 0}%` },
                    { k: 'Card status', v: account.locked ? 'Locked' : 'Active' },
                    { k: 'Automatic payments', v: account.autopay ? 'On' : 'Off' },
                    { k: 'Paperless', v: paperless ? 'On' : 'Off' },
                    {
                      k: 'Opened',
                      v: new Date(
                        /^\d{4}-\d{2}-\d{2}$/.test(account.openedDate || '')
                          ? `${account.openedDate}T12:00:00`
                          : account.openedDate || account.createdAt
                      ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    },
                  ].map((row) => (
                    <div key={row.k} className="flex justify-between gap-3 border-b border-[#EFF0F1] pb-2 last:border-b-0">
                      <dt style={{ color: MUTED }}>{row.k}</dt>
                      <dd style={{ color: INK }}>{row.v}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </aside>
          </div>
        </div>
      </div>

      {detailTx && (() => {
        const tx = account.transactions.find((t) => t.id === detailTx);
        if (!tx) return null;
        const disputed = !!tx.disputedAt;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailTx(null)}>
            <div className="w-full max-w-[520px] bg-white rounded-[6px] shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: LINE }}>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Card transaction</p>
                  <h2 className="text-[18px] font-semibold" style={{ color: INK }}>{tx.description}</h2>
                </div>
                <button type="button" onClick={() => setDetailTx(null)} aria-label="Close transaction details" className="p-2 cursor-pointer" style={{ color: MUTED }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4">
                <dl className="space-y-2 text-[13px]">
                  {[
                    { k: 'Amount', v: fmtMoney(tx.amount) },
                    { k: 'Date', v: new Date(tx.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
                    { k: 'Category', v: tx.category },
                    { k: 'Status', v: disputed ? 'Disputed' : tx.status === 'pending' ? 'Pending' : 'Posted' },
                    { k: 'Card', v: `${account.name} (…${account.mask})` },
                  ].map((row) => (
                    <div key={row.k} className="flex justify-between gap-3 border-b pb-2 last:border-b-0" style={{ borderColor: '#EFF0F1' }}>
                      <dt style={{ color: MUTED }}>{row.k}</dt>
                      <dd className="text-right font-medium" style={{ color: INK }}>{row.v}</dd>
                    </div>
                  ))}
                </dl>
                {tx.amount > 0 && !disputed && (
                  <div className="mt-4">
                    <label htmlFor="dispute-reason" className="block text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>
                      Problem with this transaction?
                    </label>
                    <select
                      id="dispute-reason"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[14px]"
                    >
                      <option>I did not make this purchase</option>
                      <option>I was charged the wrong amount</option>
                      <option>The merchant did not deliver the item or service</option>
                      <option>I cancelled and was still charged</option>
                      <option>Duplicate charge</option>
                    </select>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <OutlineBtn onClick={() => setDisputeTx(tx.id)}>Dispute transaction</OutlineBtn>
                      <button type="button" onClick={() => setDetailTx(null)} className="text-[13px] font-semibold px-3 cursor-pointer" style={{ color: MUTED }}>
                        Close
                      </button>
                    </div>
                  </div>
                )}
                {disputed && (
                  <p className="mt-4 text-[12.5px] rounded-[4px] bg-[#EAF2FA] border border-[#CFE0F0] px-3 py-2" style={{ color: BLUE }}>
                    This transaction has an open dispute. We'll send updates to your secure messages.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {disputeTx && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setDisputeTx(null)}>
          <div className="w-full max-w-[460px] bg-white rounded-[6px] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Submit dispute?</h2>
            <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
              Reason: <strong style={{ color: INK }}>{disputeReason}</strong>. We may ask for receipts or additional details.
              Your card isn't frozen while we review.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={doDispute}
                disabled={busy === 'dispute'}
                className="inline-flex items-center gap-2 text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: BLUE }}
              >
                {busy === 'dispute' && <Spinner size="sm" tone="white" />}
                {busy === 'dispute' ? 'Submitting…' : 'Submit dispute'}
              </button>
              <button type="button" onClick={() => setDisputeTx(null)} className="text-[13.5px] font-semibold px-3 cursor-pointer" style={{ color: MUTED }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {revealOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRevealOpen(false)}>
          <div className="w-full max-w-[460px] bg-white rounded-[6px] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>{account.name}</p>
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>View card number</h2>
              </div>
              <button type="button" onClick={() => setRevealOpen(false)} aria-label="Close card number" className="p-1.5 cursor-pointer" style={{ color: MUTED }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {revealed ? (
              <div className="mt-4">
                <div className="border rounded-[6px] p-4" style={{ borderColor: LINE, background: '#F7FAFD' }}>
                  <p className="text-[11px] font-semibold" style={{ color: MUTED }}>Card number</p>
                  <p className="text-[20px] font-mono tracking-wider" style={{ color: INK }}>{revealed.cardNumber}</p>
                  <div className="mt-2 flex gap-6 text-[12.5px]">
                    <span style={{ color: MUTED }}>Expires <strong style={{ color: INK }}>{revealed.expiry}</strong></span>
                    <span style={{ color: MUTED }}>CVV <strong style={{ color: INK }}>{revealed.cvv}</strong></span>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
                  Sample number only. This site does not store real card numbers. Never share a card
                  number with someone who contacts you unexpectedly.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-[13px]" style={{ color: MUTED }}>
                  Enter your Chase Online password to view the card number for {account.nickname || account.name} (…{account.mask}).
                </p>
                <label htmlFor="reveal-password" className="block mt-3 text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>
                  Password
                </label>
                <input
                  id="reveal-password"
                  type="password"
                  autoComplete="current-password"
                  value={revealPassword}
                  onChange={(e) => setRevealPassword(e.target.value)}
                  className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]"
                />
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={doReveal}
                    disabled={busy === 'reveal' || revealPassword.length === 0}
                    className="inline-flex items-center gap-2 text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: BLUE }}
                  >
                    {busy === 'reveal' && <Spinner size="sm" tone="white" />}
                    {busy === 'reveal' ? 'Verifying…' : 'View card number'}
                  </button>
                  <button type="button" onClick={() => setRevealOpen(false)} className="text-[13.5px] font-semibold px-3 cursor-pointer" style={{ color: MUTED }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {replaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReplaceOpen(false)}>
          <div className="w-full max-w-[480px] bg-white rounded-[6px] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>{account.name}</p>
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Replace your card</h2>
              </div>
              <button type="button" onClick={() => setReplaceOpen(false)} aria-label="Close replacement" className="p-1.5 cursor-pointer" style={{ color: MUTED }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <label htmlFor="replace-reason" className="block mt-4 text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>
              Why do you need a new card?
            </label>
            <select
              id="replace-reason"
              value={replaceReason}
              onChange={(e) => setReplaceReason(e.target.value as typeof replaceReason)}
              className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[14px]"
            >
              <option value="lost">Lost card</option>
              <option value="stolen">Stolen card</option>
              <option value="damaged">Damaged card</option>
              <option value="not-received">Never received the card</option>
            </select>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: MUTED }}>
              The current card is locked immediately. The new card arrives in 5–7 business days with a new
              number; recurring payments continue.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={doReplace}
                disabled={busy === 'replace'}
                className="inline-flex items-center gap-2 text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: BLUE }}
              >
                {busy === 'replace' && <Spinner size="sm" tone="white" />}
                {busy === 'replace' ? 'Ordering…' : 'Order replacement'}
              </button>
              <button type="button" onClick={() => setReplaceOpen(false)} className="text-[13.5px] font-semibold px-3 cursor-pointer" style={{ color: MUTED }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {autopayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAutopayOpen(false)}>
          <div className="w-full max-w-[500px] bg-white rounded-[6px] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>{account.name}</p>
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Automatic payments</h2>
              </div>
              <button type="button" onClick={() => setAutopayOpen(false)} aria-label="Close automatic payments" className="p-1.5 cursor-pointer" style={{ color: MUTED }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="autopay-from" className="block text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>Pay from</label>
                <select
                  id="autopay-from"
                  value={autopayFrom}
                  onChange={(e) => setAutopayFrom(e.target.value)}
                  className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[14px]"
                >
                  {fundingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (…{a.mask})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="autopay-amount" className="block text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>Amount</label>
                <select
                  id="autopay-amount"
                  value={autopayAmount}
                  onChange={(e) => setAutopayAmount(e.target.value as typeof autopayAmount)}
                  className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[14px]"
                >
                  <option value="statement">Statement balance</option>
                  <option value="current">Current balance</option>
                  <option value="minimum">Minimum payment</option>
                </select>
              </div>
              <div>
                <label htmlFor="autopay-day" className="block text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>Payment date</label>
                <select
                  id="autopay-day"
                  value={autopayDay}
                  onChange={(e) => setAutopayDay(Number(e.target.value))}
                  className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] bg-white text-[14px]"
                >
                  {Array.from({ length: 28 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>Day {i + 1} of each month</option>
                  ))}
                </select>
              </div>
              {account.autopay && (
                <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: LINE }}>
                  <span className="text-[13px]" style={{ color: INK }}>Automatic payments are on</span>
                  <button
                    type="button"
                    onClick={() => changeControl({ autopay: false })}
                    className="text-[13px] font-semibold hover:underline cursor-pointer"
                    style={{ color: '#B42318' }}
                  >
                    Turn off
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={doAutopay}
                  disabled={busy === 'autopay'}
                  className="inline-flex items-center gap-2 text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: BLUE }}
                >
                  {busy === 'autopay' && <Spinner size="sm" tone="white" />}
                  {busy === 'autopay' ? 'Saving…' : account.autopay ? 'Update automatic payments' : 'Turn on automatic payments'}
                </button>
                <button type="button" onClick={() => setAutopayOpen(false)} className="text-[13.5px] font-semibold px-3 cursor-pointer" style={{ color: MUTED }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditCardPage;
