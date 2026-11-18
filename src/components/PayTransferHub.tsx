import React, { useEffect, useId, useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { Spinner } from './Loading';
import {
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  CreditCard,
  Globe,
  House,
  ReceiptText,
  ShieldCheck,
  Landmark,
  CalendarClock,
  XCircle,
} from 'lucide-react';
import {
  ChaseIcon,
  ChaseCardImage,
  ZelleLogo,
  cardProductFor,
} from './ChaseAssets';
import {
  User,
  Account,
  fmtMoney,
  round2,
  transferFunds,
  addPayee as apiAddPayee,
  payBill as apiPayBill,
  sendZelle as apiSendZelle,
  payCard as apiPayCard,
  depositCheck as apiDepositCheck,
  sendWire as apiSendWire,
  ScheduledPayment,
  payLoan as apiPayLoan,
  schedulePayment as apiSchedulePayment,
  cancelScheduledPayment as apiCancelScheduled,
  manageScheduledPayment as apiManageScheduled,
  fmtDueDate,
  nextDueDate,
} from '../banking/store';

const BTN_BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

export type PayPage =
  | 'overview'
  | 'transfer'
  | 'zelle'
  | 'deposit'
  | 'paycard'
  | 'loan'
  | 'billpay'
  | 'wire';

interface HubProps {
  user: User;
  onUpdateUser: (u: User) => void;
  initialPage?: PayPage;
  onOpenAccount: () => void;
}

type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputCls =
  'w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px] text-[#131313] bg-white focus:border-[#1A4488] focus:ring-1 focus:ring-[#1A4488] outline-none';
const selectCls = inputCls;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const confNumber = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => {
  const fieldId = useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, { id: fieldId })
    : children;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-[12.5px] font-semibold text-[#353535] mb-1.5">
        {label}
      </label>
      {child}
      {hint && <p className="mt-1 text-[11.5px] text-[#8A929A]">{hint}</p>}
    </div>
  );
};

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

const PrimaryBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}> = ({ children, onClick, disabled, busy }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    aria-busy={busy || undefined}
    className="inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60 transition-colors"
    style={{ backgroundColor: BTN_BLUE }}
    onMouseEnter={(e) => {
      if (!disabled && !busy) e.currentTarget.style.backgroundColor = '#143669';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = BTN_BLUE;
    }}
  >
    {busy && <Spinner size="sm" tone="white" />}
    {children}
  </button>
);

const GhostBtn: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({
  children,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center justify-center gap-1.5 border bg-white hover:bg-[#F2F6FB] font-semibold text-[13.5px] px-5 py-2.5 rounded-[4px] cursor-pointer"
    style={{ borderColor: BTN_BLUE, color: BTN_BLUE }}
  >
    {children}
  </button>
);

interface Receipt {
  ref: string;
  title: string;
  rows: { k: string; v: string }[];
}

const ReceiptCard: React.FC<{ receipt: Receipt; onReset: () => void; onAccounts: () => void }> = ({
  receipt,
  onReset,
  onAccounts,
}) => (
  <div className="border rounded-[6px] bg-white p-6 text-center" style={{ borderColor: LINE }}>
    <span className="mx-auto w-12 h-12 rounded-full bg-[#EAF7EE] flex items-center justify-center">
      <CheckCircle2 className="w-6 h-6 text-[#138842]" />
    </span>
    <h3 className="mt-3 text-[19px] font-semibold" style={{ color: INK }}>
      {receipt.title}
    </h3>
    <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
      Confirmation <strong className="font-mono">{receipt.ref}</strong> · {fmtDateTime(new Date().toISOString())}
    </p>
    <dl className="mt-4 text-left border rounded-[5px] divide-y" style={{ borderColor: LINE }}>
      {receipt.rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3 px-4 py-2.5 text-[13px]">
          <dt style={{ color: MUTED }}>{r.k}</dt>
          <dd className="font-semibold text-right" style={{ color: INK }}>
            {r.v}
          </dd>
        </div>
      ))}
    </dl>
    <div className="mt-5 flex flex-wrap justify-center gap-2.5 print:hidden">
      <PrimaryBtn onClick={onReset}>Make another</PrimaryBtn>
      <GhostBtn onClick={() => window.print()}>Print / Save PDF</GhostBtn>
      <GhostBtn onClick={onAccounts}>View accounts</GhostBtn>
    </div>
  </div>
);

const MENU: { id: PayPage; label: string; desc: string }[] = [
  { id: 'transfer', label: 'Transfer money', desc: 'Between your Chase accounts' },
  { id: 'zelle', label: 'Send money with Zelle®', desc: 'To friends & family in minutes' },
  { id: 'deposit', label: 'Deposit a check', desc: 'Chase QuickDeposit℠' },
  { id: 'paycard', label: 'Pay credit card', desc: 'Minimum, statement or custom' },
  { id: 'loan', label: 'Pay a loan', desc: 'Mortgage & auto loan payments' },
  { id: 'billpay', label: 'Pay bills', desc: 'Payees & one-time payments' },
  { id: 'wire', label: 'Wire transfers', desc: 'Domestic & international' },
];

const menuIcon = (id: PayPage) => {
  switch (id) {
    case 'transfer':
      return <ArrowRightLeft className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    case 'zelle':
      return <ZelleLogo className="h-[18px] w-auto" />;
    case 'deposit':
      return <Camera className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    case 'paycard':
      return <CreditCard className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    case 'loan':
      return <Landmark className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    case 'billpay':
      return <House className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    case 'wire':
      return <Globe className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
    default:
      return <ReceiptText className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />;
  }
};

export const PayTransferHub: React.FC<HubProps> = ({
  user,
  onUpdateUser,
  initialPage = 'overview',
  onOpenAccount,
}) => {
  const [page, setPage] = useState<PayPage>(initialPage);
  const [hubNotice, setHubNotice] = useState<Notice>(null);
  const isMobile = useIsMobile();
  // Transfers between accounts are hidden on mobile; redirect any such link.
  useEffect(() => {
    if (isMobile && page === 'transfer') setPage('overview');
  }, [isMobile, page]);
  const menu = isMobile ? MENU.filter((m) => m.id !== 'transfer') : MENU;

  const deposits = useMemo(
    () => user.accounts.filter((a) => ['checking', 'savings', 'cd'].includes(a.type)),
    [user.accounts]
  );
  const cards = useMemo(() => user.accounts.filter((a) => a.type === 'credit-card'), [user.accounts]);

  const moneyMovement = useMemo(() => {
    const out: { date: string; text: string; amount: number; id: string }[] = [];
    for (const a of user.accounts) {
      for (const t of a.transactions) {
        if (['Transfer', 'Zelle', 'Bill pay', 'Credit card payment', 'Deposit', 'Wire', 'Payment', 'Fee'].includes(t.category)) {
          out.push({ date: t.date, text: `${t.description} · ${a.name}`, amount: t.amount, id: t.id });
        }
      }
    }
    return out.sort((x, y) => +new Date(y.date) - +new Date(x.date)).slice(0, 5);
  }, [user.accounts]);

  const go = (p: PayPage) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scheduled = useMemo(
    () =>
      [...(user.scheduledPayments || [])]
        .filter((sp) => sp.status === 'scheduled' || sp.status === 'paused')
        .sort((a, b) => a.date.localeCompare(b.date)),
    [user.scheduledPayments]
  );

  const cancelScheduled = async (id: string, label: string) => {
    try {
      const updated = await apiCancelScheduled(id);
      onUpdateUser(updated);
      setHubNotice({ kind: 'success', text: `Scheduled payment to ${label} was cancelled.` });
    } catch (e) {
      setHubNotice({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not cancel the scheduled payment.',
      });
    }
  };

  const manageScheduled = async (id: string, label: string, patch: { action: 'pause' | 'resume' | 'edit'; amount?: number; date?: string }) => {
    try {
      onUpdateUser(await apiManageScheduled(id, patch));
      setHubNotice({ kind: 'success', text: `Scheduled payment to ${label} updated.` });
    } catch (e) {
      setHubNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update the scheduled payment.' });
    }
  };

  const active = MENU.find((m) => m.id === page);

  return (
    <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6">
      {/* Breadcrumb + title */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px]" style={{ color: MUTED }}>
        <button type="button" onClick={() => go('overview')} className="hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>
          Pay &amp; Transfer
        </button>
        {page !== 'overview' && active && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span style={{ color: INK }}>{active.label}</span>
          </>
        )}
      </nav>

      <h1 className="mt-1.5 text-[26px] font-light" style={{ color: INK }}>
        {page === 'overview' ? 'Pay & Transfer' : active?.label}
      </h1>
      {hubNotice && (
        <div className="mt-2">
          <NoticeBox msg={hubNotice} />
        </div>
      )}
      <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
        {page === 'overview'
          ? 'Choose a service to move money — each one has its own dedicated page.'
          : active?.desc}
      </p>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left service menu */}
        <aside className="lg:col-span-3">
          <label className="lg:hidden block">
            <span className="sr-only">Choose a payment service</span>
            <select
              className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] text-[16px] bg-white"
              value={page}
              onChange={(e) => go(e.target.value as PayPage)}
            >
              <option value="overview">All services</option>
              {menu.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <div className="hidden lg:block border rounded-[6px] bg-white overflow-hidden lg:sticky lg:top-4" style={{ borderColor: LINE }}>
            <button
              type="button"
              onClick={() => go('overview')}
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-[13.5px] font-semibold cursor-pointer border-b ${
                page === 'overview' ? 'bg-[#F2F6FB]' : 'hover:bg-[#FAFBFC]'
              }`}
              style={{ borderColor: LINE, color: page === 'overview' ? BTN_BLUE : INK }}
            >
              <ReceiptText className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />
              All services
            </button>
            {menu.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => go(m.id)}
                aria-current={page === m.id ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer border-b last:border-b-0 ${
                  page === m.id ? 'bg-[#F2F6FB]' : 'hover:bg-[#FAFBFC]'
                }`}
                style={{ borderColor: LINE }}
              >
                {menuIcon(m.id)}
                <span>
                  <span className="block text-[13.5px] font-semibold" style={{ color: page === m.id ? BTN_BLUE : INK }}>
                    {m.label}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: FAINT }}>
                    {m.desc}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0" style={{ color: FAINT }} />
              </button>
            ))}
          </div>

          <div className="mt-4 border rounded-[6px] bg-[#F7FAFD] p-4 hidden lg:block" style={{ borderColor: '#CFE0F0' }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: BTN_BLUE }} />
              <p className="text-[13px] font-semibold" style={{ color: INK }}>Protected transfers</p>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: MUTED }}>
              Every payment is verified against your available balance before it posts, and appears instantly in
              your account activity.
            </p>
          </div>
        </aside>

        {/* Main page */}
        <div className="lg:col-span-9">
          {page === 'overview' && (
            <OverviewPage
              deposits={deposits}
              cards={cards}
              movement={moneyMovement}
              scheduled={scheduled}
              onCancelScheduled={cancelScheduled}
              onManageScheduled={manageScheduled}
              menu={menu}
              go={go}
              onOpenAccount={onOpenAccount}
            />
          )}
          {page === 'transfer' && (
            <TransferPage user={user} deposits={deposits} onUpdateUser={onUpdateUser} />
          )}
          {page === 'zelle' && (
            <ZellePage user={user} onUpdateUser={onUpdateUser} />
          )}
          {page === 'deposit' && (
            <DepositPage user={user} deposits={deposits} onUpdateUser={onUpdateUser} />
          )}
          {page === 'paycard' && (
            <PayCardPage
              user={user}
              cards={cards}
              deposits={deposits}
              onUpdateUser={onUpdateUser}
              onOpenAccount={onOpenAccount}
            />
          )}
          {page === 'loan' && (
            <LoanPage user={user} deposits={deposits} onUpdateUser={onUpdateUser} onOpenAccount={onOpenAccount} />
          )}
          {page === 'billpay' && (
            <BillPayPage user={user} deposits={deposits} onUpdateUser={onUpdateUser} />
          )}
          {page === 'wire' && (
            <WirePage user={user} deposits={deposits} onUpdateUser={onUpdateUser} />
          )}
        </div>
      </div>
    </div>
  );
};

/* ================================ OVERVIEW ================================ */
const KIND_LABEL: Record<string, string> = {
  transfer: 'Transfer between accounts',
  bill: 'Bill payment',
  card: 'Credit card payment',
  loan: 'Loan payment',
};

const ScheduledPanel: React.FC<{
  scheduled: ScheduledPayment[];
  onCancel: (id: string, label: string) => void;
  onManage: (id: string, label: string, patch: { action: 'pause' | 'resume' | 'edit'; amount?: number; date?: string }) => void;
}> = ({ scheduled, onCancel, onManage }) => (
  <div className="mt-5 border rounded-[6px] bg-white" style={{ borderColor: LINE }}>
    <div className="px-5 py-3.5 border-b flex items-center justify-between gap-3" style={{ borderColor: LINE }}>
      <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: INK }}>
        <CalendarClock className="w-4 h-4" style={{ color: BTN_BLUE }} />
        Scheduled payments
      </h2>
      <span className="text-[12px]" style={{ color: MUTED }}>
        {scheduled.length} upcoming
      </span>
    </div>
    {scheduled.length === 0 ? (
      <p className="px-5 py-5 text-[13px]" style={{ color: MUTED }}>
        Nothing scheduled. Choose a future date on any payment to schedule it.
      </p>
    ) : (
      <ul className="px-5 pb-2">
        {scheduled.map((sp, i) => (
          <li
            key={sp.id}
            className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t' : ''}`}
            style={{ borderColor: '#EFF0F1' }}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold truncate" style={{ color: INK }}>
                {sp.label}
              </span>
              <span className="block text-[11.5px]" style={{ color: FAINT }}>
                {fmtDueDate(sp.date)} · {sp.frequency === 'monthly' ? 'Repeats monthly' : 'One time'} ·{' '}
                {KIND_LABEL[sp.kind] || sp.kind}{sp.status === 'paused' ? ' · Paused' : ''}
              </span>
            </span>
            <span className="text-[13.5px] font-semibold shrink-0" style={{ color: INK }}>
              {fmtMoney(sp.amount)}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={() => {
                const amountText = window.prompt('New payment amount', sp.amount.toFixed(2));
                if (amountText === null) return;
                const dateText = window.prompt('New payment date (YYYY-MM-DD)', sp.date);
                if (dateText === null) return;
                onManage(sp.id, sp.label, { action: 'edit', amount: Number(amountText), date: dateText.trim() });
              }} className="text-[11.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>Edit</button>
              {sp.frequency === 'monthly' && <button type="button" onClick={() => onManage(sp.id, sp.label, { action: sp.status === 'paused' ? 'resume' : 'pause' })} className="text-[11.5px] font-semibold hover:underline cursor-pointer" style={{ color: BTN_BLUE }}>{sp.status === 'paused' ? 'Resume' : 'Pause'}</button>}
              <button type="button" aria-label={`Cancel scheduled payment to ${sp.label}`} onClick={() => onCancel(sp.id, sp.label)} className="p-1.5 text-[#B42318] hover:bg-[#FEF2F2] rounded cursor-pointer shrink-0">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const OverviewPage: React.FC<{
  deposits: Account[];
  cards: Account[];
  movement: { date: string; text: string; amount: number; id: string }[];
  scheduled: ScheduledPayment[];
  onCancelScheduled: (id: string, label: string) => void;
  onManageScheduled: (id: string, label: string, patch: { action: 'pause' | 'resume' | 'edit'; amount?: number; date?: string }) => void;
  go: (p: PayPage) => void;
  onOpenAccount: () => void;
  menu: typeof MENU;
}> = ({ deposits, cards, movement, scheduled, onCancelScheduled, onManageScheduled, go, onOpenAccount, menu }) => (
  <div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {menu.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => go(m.id)}
          className="border rounded-[6px] bg-white p-5 text-left hover:bg-[#F7FAFD] cursor-pointer group"
          style={{ borderColor: LINE }}
        >
          <span className="w-10 h-10 rounded-full bg-[#EEF3F8] flex items-center justify-center">
            {menuIcon(m.id)}
          </span>
          <span className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: BTN_BLUE }}>
            {m.label}
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
          <span className="mt-1 block text-[12.5px]" style={{ color: MUTED }}>
            {m.desc}
          </span>
        </button>
      ))}
    </div>

    <ScheduledPanel scheduled={scheduled} onCancel={onCancelScheduled} onManage={onManageScheduled} />

    <div className="mt-5 border rounded-[6px] bg-white" style={{ borderColor: LINE }}>
      <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
        <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Recent money movement</h2>
        <span className="text-[12px]" style={{ color: MUTED }}>
          {deposits.length} funding account{deposits.length === 1 ? '' : 's'} · {cards.length} card{cards.length === 1 ? '' : 's'}
        </span>
      </div>
      {movement.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[13.5px] font-semibold" style={{ color: INK }}>No money movement yet</p>
          <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
            Transfers, Zelle®, deposits, card payments and wires will appear here.
          </p>
          <div className="mt-4">
            <GhostBtn onClick={onOpenAccount}>Open an account to get started</GhostBtn>
          </div>
        </div>
      ) : (
        <ul className="px-5">
          {movement.map((m, i) => (
            <li
              key={m.id}
              className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t' : ''}`}
              style={{ borderColor: '#EFF0F1' }}
            >
              <span className="text-[12px] w-[86px] shrink-0" style={{ color: MUTED }}>
                {new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className="flex-1 min-w-0 text-[13.5px] truncate" style={{ color: INK }}>
                {m.text}
              </span>
              <span className={`text-[13.5px] font-semibold shrink-0 ${m.amount < 0 ? '' : 'text-[#138842]'}`}>
                {m.amount < 0 ? `-${fmtMoney(Math.abs(m.amount))}` : fmtMoney(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

/* ============================ TRANSFER MONEY PAGE ============================ */
const TransferPage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
}> = ({ deposits, onUpdateUser }) => {
  const [fromId, setFromId] = useState(deposits[0]?.id || '');
  const [toId, setToId] = useState(deposits[1]?.id || deposits[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [when, setWhen] = useState<'now' | 'scheduled'>('now');
  const [schedDate, setSchedDate] = useState(nextDueDate(1));
  const [frequency, setFrequency] = useState<'once' | 'monthly'>('once');
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const from = deposits.find((a) => a.id === fromId);
  const to = deposits.find((a) => a.id === toId);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!from || !to) return setMsg({ kind: 'error', text: 'Select both a "from" and "to" account.' });
    if (from.id === to.id) return setMsg({ kind: 'error', text: 'Choose two different accounts.' });
    if (isNaN(amt) || amt <= 0) return setMsg({ kind: 'error', text: 'Enter an amount greater than $0.' });
    if (amt > from.balance) return setMsg({ kind: 'error', text: 'Insufficient funds in the "from" account.' });
    setBusy(true);
    try {
      if (when === 'scheduled') {
        const u = await apiSchedulePayment({
          kind: 'transfer',
          label: `Transfer to ${to.name}`,
          fromAccountId: from.id,
          toAccountId: to.id,
          amount: round2(amt),
          date: schedDate,
          frequency,
        });
        onUpdateUser(u);
        setReceipt({
          ref: confNumber('CHSC'),
          title: frequency === 'monthly' ? 'Recurring transfer scheduled' : 'Transfer scheduled',
          rows: [
            { k: 'From', v: `${from.name} (…${from.mask})` },
            { k: 'To', v: `${to.name} (…${to.mask})` },
            { k: 'Amount', v: fmtMoney(amt) },
            { k: 'Starts', v: fmtDueDate(schedDate) },
            { k: 'Repeats', v: frequency === 'monthly' ? 'Monthly' : 'One time' },
            ...(memo.trim() ? [{ k: 'Memo', v: memo.trim() }] : []),
          ],
        });
      } else {
        const u = await transferFunds(from.id, to.id, amt, memo.trim());
        onUpdateUser(u);
        setReceipt({
          ref: confNumber('CHTR'),
          title: 'Transfer complete',
          rows: [
            { k: 'From', v: `${from.name} (…${from.mask})` },
            { k: 'To', v: `${to.name} (…${to.mask})` },
            { k: 'Amount', v: fmtMoney(amt) },
            { k: 'When', v: 'Immediately' },
            ...(memo.trim() ? [{ k: 'Memo', v: memo.trim() }] : []),
          ],
        });
      }
      setMsg(null);
      setAmount('');
      setMemo('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Transfer failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <ReceiptCard
        receipt={receipt}
        onReset={() => setReceipt(null)}
        onAccounts={() => window.scrollTo({ top: 0 })}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-1">
          <ChaseIcon name="checkMultiple" size={24} />
          <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Transfer between your accounts</h2>
        </div>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Move money instantly between your Chase checking, savings and CDs.
        </p>
        <div className="space-y-4">
          <Field label="From account">
            <select className={selectCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)} available
                </option>
              ))}
            </select>
          </Field>
          <Field label="To account">
            <select className={selectCls} value={toId} onChange={(e) => setToId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                <input className={`${inputCls} pl-7`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </Field>
            <Field label="When">
              <select className={selectCls} value={when} onChange={(e) => setWhen(e.target.value as 'now' | 'scheduled')}>
                <option value="now">Now — arrives immediately</option>
                <option value="scheduled">Schedule for a future date</option>
              </select>
            </Field>
          </div>
          <Field label="Memo (optional)" hint="Shown on both accounts' activity.">
            <input className={inputCls} placeholder="e.g. Monthly savings" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          {when === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="First delivery date">
                <input className={inputCls} type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
              </Field>
              <Field label="Repeat">
                <select className={selectCls} value={frequency} onChange={(e) => setFrequency(e.target.value as 'once' | 'monthly')}>
                  <option value="once">One time</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
            </div>
          )}
          <NoticeBox msg={msg} />
          <PrimaryBtn onClick={submit} disabled={busy || deposits.length < 2}>
            {busy
              ? 'Working…'
              : when === 'scheduled'
                ? `Schedule${amount ? ` ${fmtMoney(parseFloat(amount) || 0)}` : ''}`
                : `Transfer${amount ? ` ${fmtMoney(parseFloat(amount) || 0)}` : ''}`}
          </PrimaryBtn>
          {deposits.length < 2 && (
            <p className="text-[12px]" style={{ color: MUTED }}>
              You need at least two deposit accounts to transfer. Open a savings account to get started.
            </p>
          )}
        </div>
      </div>
      <AsideCard
        title="Transfer details"
        rows={[
          { k: 'Speed', v: 'Immediate between Chase accounts' },
          { k: 'Fee', v: '$0' },
          { k: 'Limits', v: 'Up to available balance' },
          { k: 'Cutoff', v: '11:59 PM ET, 7 days a week' },
        ]}
        help="Transfers post immediately and appear on both accounts' activity with your memo."
      />
    </div>
  );
};

/* ================================ ZELLE PAGE ================================ */
const ZellePage: React.FC<{
  user: User;
  onUpdateUser: (u: User) => void;
}> = ({ user, onUpdateUser }) => {
  const checking = user.accounts.find((a) => a.type === 'checking');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!to.trim()) return setMsg({ kind: 'error', text: 'Enter a recipient name, email, or U.S. mobile number.' });
    if (isNaN(amt) || amt <= 0) return setMsg({ kind: 'error', text: 'Enter an amount greater than $0.' });
    if (!checking) return setMsg({ kind: 'error', text: 'You need a checking account to send money with Zelle®.' });
    if (amt > checking.balance)
      return setMsg({ kind: 'error', text: 'Insufficient funds in your checking account.' });
    setBusy(true);
    try {
      const u = await apiSendZelle(to.trim(), amt, memo.trim());
      onUpdateUser(u);
      setReceipt({
        ref: confNumber('CHZL'),
        title: `Sent ${fmtMoney(amt)} with Zelle®`,
        rows: [
          { k: 'To', v: to.trim() },
          { k: 'From', v: `${checking.name} (…${checking.mask})` },
          { k: 'Amount', v: fmtMoney(amt) },
          ...(memo.trim() ? [{ k: 'Memo', v: memo.trim() }] : []),
          { k: 'Delivery', v: 'Typically within minutes' },
        ],
      });
      setMsg(null);
      setTo('');
      setAmount('');
      setMemo('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Zelle® payment failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return <ReceiptCard receipt={receipt} onReset={() => setReceipt(null)} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-6" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-1">
          <ZelleLogo className="h-[24px] w-auto" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6D1ED4]">Fast · Free · Direct</span>
        </div>
        <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Send money with Zelle®</h2>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Send to friends and family with a U.S. bank account — funded from{' '}
          {checking ? `${checking.name} (…${checking.mask})` : 'your checking account'}.
        </p>
        <div className="space-y-4">
          <Field label="Recipient">
            <input className={inputCls} placeholder="Name, email or U.S. mobile number" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                <input className={`${inputCls} pl-7`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </Field>
            <Field label="Memo (optional)">
              <input className={inputCls} placeholder="e.g. Rent split" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          </div>
          <NoticeBox msg={msg} />
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            aria-busy={busy || undefined}
            className="inline-flex items-center gap-2 bg-[#6D1ED4] hover:bg-[#5A17B0] disabled:opacity-60 text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
          >
            {busy && <Spinner size="sm" tone="white" />}
            {busy ? 'Sending…' : 'Send with Zelle®'}
          </button>
        </div>
      </div>
      <AsideCard
        title="Good to know"
        rows={[
          { k: 'Fee', v: '$0 with Chase' },
          { k: 'Delivery', v: 'Typically minutes' },
          { k: 'Daily limit', v: '$2,500' },
          { k: 'From', v: checking ? `${checking.name} (…${checking.mask})` : 'Checking required' },
        ]}
        help="Only send to people you know and trust. Zelle® payments generally can't be reversed once the recipient enrolls."
      />
    </div>
  );
};

/* ============================ QUICKDEPOSIT PAGE ============================ */
const DEPOSIT_LIMIT = 25000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const CheckPhotoSlot: React.FC<{
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
}> = ({ label, hint, file, onPick }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div>
      <span className="block text-[12.5px] font-semibold mb-1.5" style={{ color: '#353535' }}>{label}</span>
      <label
        className="relative flex h-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-[6px] border-2 border-dashed"
        style={{ borderColor: file ? '#138842' : '#B7BEC6', background: '#FAFBFC' }}
      >
        {url ? (
          <img src={url} alt={`${label} preview`} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center">
            <Camera className="w-6 h-6" style={{ color: BTN_BLUE }} />
            <span className="text-[12.5px] font-semibold" style={{ color: INK }}>Take a photo or upload</span>
            <span className="text-[11px]" style={{ color: FAINT }}>{hint}</span>
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <div className="mt-1.5 flex items-center justify-between text-[11.5px]" style={{ color: MUTED }}>
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={() => onPick(null)} className="font-semibold underline cursor-pointer" style={{ color: BTN_BLUE }}>
            Retake
          </button>
        </div>
      )}
    </div>
  );
};

const DepositPage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
}> = ({ deposits, onUpdateUser }) => {
  // Mobile deposits go to checking or savings accounts only.
  const eligible = deposits.filter((a) => a.type === 'checking' || a.type === 'savings');
  const [acctId, setAcctId] = useState(eligible[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [checkNo, setCheckNo] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [msg, setMsg] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const acct = eligible.find((a) => a.id === acctId);
  const amt = parseFloat(amount);
  const amountOk = !isNaN(amt) && amt > 0 && amt <= DEPOSIT_LIMIT;

  const reset = () => {
    setStep(1);
    setAmount('');
    setCheckNo('');
    setFront(null);
    setBack(null);
    setAgreed(false);
    setMsg(null);
    setReceipt(null);
  };

  const continueToPhotos = () => {
    if (!acct) return setMsg({ kind: 'error', text: 'Choose a checking or savings account to deposit into.' });
    if (!amountOk) return setMsg({ kind: 'error', text: `Enter an amount between $0.01 and ${fmtMoney(DEPOSIT_LIMIT)}.` });
    setMsg(null);
    setStep(2);
  };

  const submit = async () => {
    if (!acct) return setMsg({ kind: 'error', text: 'Choose an account.' });
    if (!front || !back) return setMsg({ kind: 'error', text: 'Add a photo of both the front and the back of the check.' });
    if (front.size > MAX_PHOTO_BYTES || back.size > MAX_PHOTO_BYTES)
      return setMsg({ kind: 'error', text: 'Each photo must be smaller than 10 MB. Try a smaller image.' });
    if (!agreed) return setMsg({ kind: 'error', text: 'Confirm the endorsement and single-check requirements to continue.' });
    setBusy(true);
    try {
      const u = await apiDepositCheck(acct.id, round2(amt), checkNo.trim() || '1048');
      onUpdateUser(u);
      setReceipt({
        ref: confNumber('CHQD'),
        title: 'Deposit received',
        rows: [
          { k: 'Deposited to', v: `${acct.name} (…${acct.mask})` },
          { k: 'Check amount', v: fmtMoney(amt) },
          { k: 'Check number', v: checkNo.trim() || 'Not provided' },
          { k: 'Status', v: 'Under review — we’ll email you when it’s accepted' },
          { k: 'Funds available', v: 'Next business day if received before 11 PM ET' },
        ],
      });
      setStep(3);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Deposit could not be submitted. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (eligible.length === 0) {
    return (
      <div className="border rounded-[6px] bg-white p-6 text-center" style={{ borderColor: LINE }}>
        <p className="text-[15px] font-semibold" style={{ color: INK }}>Open a checking or savings account first</p>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>QuickDeposit℠ works with Chase checking and savings accounts.</p>
      </div>
    );
  }

  if (step === 3 && receipt) {
    return <ReceiptCard receipt={receipt} onReset={reset} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  const steps = ['Details', 'Photos & review', 'Done'];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-1">
          <ChaseIcon name="checkMultiple" size={24} />
          <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Chase QuickDeposit℠</h2>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: MUTED }}>
          Deposit a paper check with photos of the front and back. It takes about a minute.
        </p>

        {/* Step indicator */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Deposit steps">
          {steps.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n;
            const current = step === n;
            return (
              <li key={label} className="flex items-center gap-2 min-w-0" aria-current={current ? 'step' : undefined}>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0"
                  style={{
                    background: done ? '#138842' : current ? BTN_BLUE : '#E4E6E8',
                    color: done || current ? '#fff' : MUTED,
                  }}
                >
                  {done ? '✓' : n}
                </span>
                <span className={`text-[12.5px] truncate ${current ? 'font-semibold' : ''}`} style={{ color: current ? INK : MUTED }}>
                  {label}
                </span>
                {i < steps.length - 1 && <span className="hidden sm:block w-8 h-px bg-[#D5DAE0]" />}
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Deposit to">
              <select className={selectCls} value={acctId} onChange={(e) => setAcctId(e.target.value)}>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (…{a.mask})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Check amount" hint={`Up to ${fmtMoney(DEPOSIT_LIMIT)} per check in this Chase experience.`}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                  <input
                    className={`${inputCls} pl-7`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={amount !== '' && !amountOk}
                  />
                </div>
              </Field>
              <Field label="Check number (optional)" hint="Printed at the top right of the check.">
                <input className={inputCls} placeholder="e.g. 1048" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} />
              </Field>
            </div>
            <NoticeBox msg={msg} />
            <PrimaryBtn onClick={continueToPhotos}>Continue</PrimaryBtn>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CheckPhotoSlot label="Front of check" hint="Include all four corners" file={front} onPick={setFront} />
              <CheckPhotoSlot label="Back of check" hint="Sign and write “For Deposit Only”" file={back} onPick={setBack} />
            </div>

            <div className="border rounded-[5px] p-4" style={{ borderColor: LINE, background: '#FAFBFC' }}>
              <p className="text-[12.5px] font-semibold mb-2" style={{ color: INK }}>Review</p>
              <dl className="text-[13px] space-y-1.5">
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Account</dt><dd style={{ color: INK }}>{acct?.name} (…{acct?.mask})</dd></div>
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Amount</dt><dd className="font-semibold" style={{ color: INK }}>{fmtMoney(amt || 0)}</dd></div>
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Check number</dt><dd style={{ color: INK }}>{checkNo.trim() || 'Not provided'}</dd></div>
              </dl>
              <button type="button" onClick={() => setStep(1)} className="mt-2 text-[12.5px] font-semibold underline cursor-pointer" style={{ color: BTN_BLUE }}>
                Edit details
              </button>
            </div>

            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed cursor-pointer" style={{ color: INK }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#1A4488] shrink-0"
              />
              <span>
                The back of this check is signed and marked “For Deposit Only,” and this is the only check in this deposit.
                Third-party checks can’t be deposited this way.
              </span>
            </label>

            <NoticeBox msg={msg} />
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <GhostBtn onClick={() => setStep(1)}>Back</GhostBtn>
              <PrimaryBtn onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : `Deposit ${fmtMoney(amt || 0)}`}
              </PrimaryBtn>
            </div>
          </div>
        )}
      </div>

      <AsideCard
        title="Deposit details"
        rows={[
          { k: 'Availability', v: 'Next business day if received before 11 PM ET' },
          { k: 'Limit', v: `Up to ${fmtMoney(DEPOSIT_LIMIT)} per check` },
          { k: 'Accepted checks', v: 'Personal, business and cashier’s checks payable to you' },
          { k: 'Fee', v: '$0' },
        ]}
        help="Write “For Deposit Only” and today’s date on the back. Keep the paper check for two business days after you get our acceptance email, then destroy it. Don’t deposit the same check twice."
      />
    </div>
  );
};

/* ============================ PAY CREDIT CARD PAGE ============================ */
const PayCardPage: React.FC<{
  user: User;
  cards: Account[];
  deposits: Account[];
  onUpdateUser: (u: User) => void;
  onOpenAccount: () => void;
}> = ({ cards, deposits, onUpdateUser, onOpenAccount }) => {
  const [cardId, setCardId] = useState(cards[0]?.id || '');
  const [fromId, setFromId] = useState(deposits[0]?.id || '');
  const [mode, setMode] = useState<'minimum' | 'statement' | 'current' | 'custom'>('statement');
  const [custom, setCustom] = useState('');
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const card = cards.find((c) => c.id === cardId);
  const from = deposits.find((a) => a.id === fromId);

  const minimum = card ? round2(Math.min(card.balance, Math.max(35, card.balance * 0.02))) : 0;
  const amount = !card ? 0 : mode === 'minimum' ? minimum : mode === 'statement' ? card.balance : mode === 'current' ? card.balance : parseFloat(custom) || 0;

  if (cards.length === 0) {
    return (
      <div className="border rounded-[6px] bg-white p-8 text-center" style={{ borderColor: LINE }}>
        <p className="text-[16px] font-semibold" style={{ color: INK }}>No credit card yet</p>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
          Open a Sapphire, Freedom or Ink® card to make payments here.
        </p>
        <div className="mt-4">
          <PrimaryBtn onClick={onOpenAccount}>Compare credit cards</PrimaryBtn>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!card || !from) return setMsg({ kind: 'error', text: 'Select a card and a payment account.' });
    if (isNaN(amount) || amount <= 0) return setMsg({ kind: 'error', text: 'Enter an amount greater than $0.' });
    if (amount > card.balance)
      return setMsg({ kind: 'error', text: `Amount exceeds your current balance of ${fmtMoney(card.balance)}.` });
    if (amount > from.balance) return setMsg({ kind: 'error', text: 'Insufficient funds in the selected account.' });
    setBusy(true);
    try {
      const u = await apiPayCard(card.id, from.id, round2(amount));
      onUpdateUser(u);
      setReceipt({
        ref: confNumber('CHCP'),
        title: `Paid ${fmtMoney(amount)} to ${card.name}`,
        rows: [
          { k: 'Card', v: `${card.name} (…${card.mask})` },
          { k: 'Paid from', v: `${from.name} (…${from.mask})` },
          { k: 'Amount', v: fmtMoney(amount) },
          { k: 'Payment type', v: mode === 'minimum' ? 'Minimum payment' : mode === 'custom' ? 'Custom amount' : 'Full balance' },
        ],
      });
      setMsg(null);
      setCustom('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Payment failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return <ReceiptCard receipt={receipt} onReset={() => setReceipt(null)} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-6" style={{ borderColor: LINE }}>
        <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Pay your credit card</h2>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Choose what to pay — minimum, statement balance, or a custom amount.
        </p>
        <div className="space-y-4">
          <Field label="Card to pay">
            <select className={selectCls} value={cardId} onChange={(e) => { setCardId(e.target.value); setMode('statement'); }}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (…{c.mask}) — {fmtMoney(c.balance)} owed
                </option>
              ))}
            </select>
          </Field>
          {card && (
            <div className="flex items-center gap-3 border rounded-[5px] p-3" style={{ borderColor: LINE, background: '#FAFBFC' }}>
              <span className="w-[86px] shrink-0">
                <ChaseCardImage product={cardProductFor(card.name, card.type)} className="rounded-[4px]" />
              </span>
              <div className="text-[12.5px]" style={{ color: MUTED }}>
                <p><strong style={{ color: INK }}>{fmtMoney(card.balance)}</strong> current balance</p>
                <p>Available credit {fmtMoney(Math.max(0, (card.creditLimit || 0) - card.balance))}</p>
                {card.rewardsPoints !== undefined && <p>{card.rewardsPoints.toLocaleString()} Ultimate Rewards® pts</p>}
              </div>
            </div>
          )}
          <div>
            <span className="block text-[12.5px] font-semibold text-[#353535] mb-1.5">Payment amount</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: 'minimum', label: 'Minimum', sub: card ? fmtMoney(minimum) : '—' },
                  { id: 'statement', label: 'Statement / full', sub: card ? fmtMoney(card.balance) : '—' },
                  { id: 'custom', label: 'Custom', sub: 'You choose' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setMode(o.id)}
                  aria-pressed={mode === o.id || (o.id === 'statement' && mode === 'current')}
                  className={`p-3 rounded-[5px] border text-left cursor-pointer ${mode === o.id || (o.id === 'statement' && mode === 'current') ? 'bg-[#F2F6FB]' : 'bg-white'}`}
                  style={{ borderColor: mode === o.id || (o.id === 'statement' && mode === 'current') ? BTN_BLUE : LINE }}
                >
                  <span className="block text-[13px] font-semibold" style={{ color: INK }}>{o.label}</span>
                  <span className="block text-[12px]" style={{ color: MUTED }}>{o.sub}</span>
                </button>
              ))}
            </div>
            {mode === 'custom' && (
              <div className="relative max-w-[220px] mt-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                <input className={`${inputCls} pl-7`} inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value)} />
              </div>
            )}
          </div>
          <Field label="Pay from">
            <select className={selectCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)}
                </option>
              ))}
            </select>
          </Field>
          <NoticeBox msg={msg} />
          <PrimaryBtn onClick={submit} busy={busy}>
            {busy ? 'Processing…' : `Pay ${fmtMoney(amount || 0)}`}
          </PrimaryBtn>
        </div>
      </div>
      <AsideCard
        title="Payment details"
        rows={[
          { k: 'Due date', v: 'Aug 1, 2026' },
          { k: 'Minimum due', v: card ? fmtMoney(minimum) : '—' },
          { k: 'Posting', v: 'Same business day before 8 PM ET' },
          { k: 'Autopay', v: card?.autopay ? 'On' : 'Off — manage in Security' },
        ]}
        help="Pay at least the minimum by the due date to avoid late fees and protect your credit score."
      />
    </div>
  );
};

/* ================================ BILL PAY PAGE ================================ */
const BillPayPage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
}> = ({ user, deposits, onUpdateUser }) => {
  const [fromId, setFromId] = useState(deposits[0]?.id || '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [acct, setAcct] = useState('');
  const [cat, setCat] = useState('Utilities');
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const from = deposits.find((a) => a.id === fromId);

  const addPayee = async () => {
    if (!name.trim() || !acct.trim()) return setMsg({ kind: 'error', text: 'Enter a payee name and account number.' });
    try {
      const u = await apiAddPayee(name.trim(), acct.trim(), cat);
      onUpdateUser(u);
      setMsg({ kind: 'success', text: `${name.trim()} added to your payees.` });
      setName('');
      setAcct('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not add payee.' });
    }
  };

  const pay = async (payeeId: string) => {
    const amt = parseFloat(amounts[payeeId] || '');
    const payee = user.payees.find((p) => p.id === payeeId);
    if (!payee || !from) return setMsg({ kind: 'error', text: 'Select a "pay from" account.' });
    if (isNaN(amt) || amt <= 0) return setMsg({ kind: 'error', text: `Enter an amount greater than $0 for ${payee.name}.` });
    if (amt > from.balance) return setMsg({ kind: 'error', text: 'Insufficient funds in the selected account.' });
    setBusyId(payeeId);
    try {
      const u = await apiPayBill(payeeId, from.id, amt);
      onUpdateUser(u);
      setReceipt({
        ref: confNumber('CHBP'),
        title: `Paid ${fmtMoney(amt)} to ${payee.name}`,
        rows: [
          { k: 'Payee', v: `${payee.name} (${payee.accountNumber})` },
          { k: 'From', v: `${from.name} (…${from.mask})` },
          { k: 'Amount', v: fmtMoney(amt) },
          { k: 'Delivery', v: '1–2 business days (electronic)' },
        ],
      });
      setMsg(null);
      setAmounts((p) => ({ ...p, [payeeId]: '' }));
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Payment failed.' });
    } finally {
      setBusyId(null);
    }
  };

  if (receipt) {
    return <ReceiptCard receipt={receipt} onReset={() => setReceipt(null)} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-6" style={{ borderColor: LINE }}>
        <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Pay bills</h2>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Pay companies and people from one place. Add a payee once, then pay in seconds.
        </p>
        <div className="space-y-4">
          <Field label="Pay from">
            <select className={selectCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)}
                </option>
              ))}
            </select>
          </Field>
          {user.payees.length === 0 ? (
            <p className="text-[13px] border border-dashed rounded-[5px] p-4 text-center" style={{ borderColor: '#B7BEC6', color: MUTED }}>
              No payees yet — add your first payee below.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {user.payees.map((p) => (
                <li key={p.id} className="border rounded-[5px] p-3" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{p.name}</p>
                      <p className="text-[11.5px]" style={{ color: FAINT }}>{p.category} · {p.accountNumber}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="relative flex-1 max-w-[170px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: MUTED }}>$</span>
                      <input
                        className="w-full h-10 pl-7 pr-2 border border-[#B7BEC6] rounded-[4px] text-[13px]"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amounts[p.id] || ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => pay(p.id)}
                      disabled={busyId === p.id}
                      className="inline-flex items-center gap-2 text-white text-[13px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                      style={{ backgroundColor: BTN_BLUE }}
                    >
                      {busyId === p.id && <Spinner size="sm" tone="white" />}
                      {busyId === p.id ? 'Paying…' : 'Pay'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-4" style={{ borderColor: LINE }}>
            <p className="text-[12px] font-bold uppercase tracking-wider mb-2.5" style={{ color: FAINT }}>
              Add a new payee
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company or person">
                <input className={inputCls} placeholder="e.g. Con Edison" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Account number">
                <input className={inputCls} placeholder="As shown on your bill" value={acct} onChange={(e) => setAcct(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[150px]">
                <Field label="Category">
                  <select className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)}>
                    <option>Utilities</option>
                    <option>Credit card</option>
                    <option>Rent</option>
                    <option>Insurance</option>
                    <option>Other</option>
                  </select>
                </Field>
              </div>
              <button
                type="button"
                onClick={addPayee}
                className="border bg-white hover:bg-[#F2F6FB] font-semibold text-[13.5px] px-5 py-2.5 rounded-[4px] cursor-pointer"
                style={{ borderColor: BTN_BLUE, color: BTN_BLUE }}
              >
                Add payee
              </button>
            </div>
          </div>
          <NoticeBox msg={msg} />
        </div>
      </div>
      <AsideCard
        title="Bill pay details"
        rows={[
          { k: 'Delivery', v: 'Electronic: 1–2 days' },
          { k: 'Check by mail', v: 'Up to 5 business days' },
          { k: 'Fee', v: '$0' },
          { k: 'Reminders', v: 'Due-date alerts by default' },
        ]}
        help="Schedule payments at least 2 business days before the due date so they arrive on time."
      />
    </div>
  );
};

/* ================================ WIRE PAGE ================================ */
const WirePage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
}> = ({ deposits, onUpdateUser }) => {
  const [fromId, setFromId] = useState(deposits[0]?.id || '');
  const [recipient, setRecipient] = useState('');
  const [routing, setRouting] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'domestic' | 'international'>('domestic');
  const saveRecipient = true;
  const [savedRecipients, setSavedRecipients] = useState<
    { id: string; name: string; routing: string; accountNumber: string; type: 'domestic' | 'international' }[]
  >(() => {
    try {
      const raw = localStorage.getItem('chase_app_wire_recipients');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const fee = type === 'international' ? 40 : 25;
  const from = deposits.find((a) => a.id === fromId);

  const submit = async () => {
    const amt = parseFloat(amount);
    const cleanRouting = routing.trim().replace(/\s+/g, '');
    const cleanAcct = accountNumber.trim().replace(/\s+/g, '');
    if (!recipient.trim() || !cleanRouting || !cleanAcct)
      return setMsg({ kind: 'error', text: 'Enter the recipient name, ABA routing / SWIFT code, and account number.' });
    if (type === 'domestic' && !/^\d{9}$/.test(cleanRouting))
      return setMsg({ kind: 'error', text: 'Domestic ABA routing number must be exactly 9 digits.' });
    if (type === 'international' && !/^[A-Za-z0-9]{8,11}$/.test(cleanRouting))
      return setMsg({ kind: 'error', text: 'International SWIFT / BIC code must be 8 to 11 letters/numbers.' });
    if (cleanAcct.length < 4)
      return setMsg({ kind: 'error', text: 'Enter a valid recipient account number or IBAN (at least 4 characters).' });
    if (isNaN(amt) || amt <= 0) return setMsg({ kind: 'error', text: 'Enter a wire amount greater than $0.' });
    if (!from) return setMsg({ kind: 'error', text: 'Select a funding account.' });
    if (amt + fee > from.balance)
      return setMsg({ kind: 'error', text: `Insufficient funds — you need ${fmtMoney(amt + fee)} including the $${fee} fee.` });
    setBusy(true);
    try {
      const u = await apiSendWire(from.id, recipient.trim(), cleanRouting, amt, type, cleanAcct);
      onUpdateUser(u);
      if (saveRecipient) {
        const nextEntry = {
          id: `${recipient.trim().toLowerCase()}-${cleanRouting}-${cleanAcct.slice(-4)}`,
          name: recipient.trim(),
          routing: cleanRouting,
          accountNumber: cleanAcct,
          type,
        };
        const updatedList = [nextEntry, ...savedRecipients.filter((r) => r.id !== nextEntry.id)].slice(0, 8);
        setSavedRecipients(updatedList);
        try {
          localStorage.setItem('chase_app_wire_recipients', JSON.stringify(updatedList));
        } catch {
          // ignore storage quota errors
        }
      }
      setReceipt({
        ref: confNumber('CHWR'),
        title: `${type === 'domestic' ? 'Domestic' : 'International'} wire initiated`,
        rows: [
          { k: 'To', v: `${recipient.trim()} (${routing.trim()})` },
          { k: 'Account number', v: `…${accountNumber.trim().slice(-4)}` },
          { k: 'From', v: `${from.name} (…${from.mask})` },
          { k: 'Amount', v: fmtMoney(amt) },
          { k: 'Wire fee', v: fmtMoney(fee) },
          { k: 'Total debited', v: fmtMoney(round2(amt + fee)) },
        ],
      });
      setMsg(null);
      setRecipient('');
      setRouting('');
      setAccountNumber('');
      setAmount('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Wire transfer failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return <ReceiptCard receipt={receipt} onReset={() => setReceipt(null)} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-6" style={{ borderColor: LINE }}>
        <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Send a wire transfer</h2>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Same-day guaranteed funds for closings, tuition, and large purchases.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['domestic', 'international'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={`py-2.5 text-[13px] font-semibold rounded-[4px] border capitalize cursor-pointer ${
                  type === t ? 'text-white' : 'bg-white'
                }`}
                style={type === t ? { backgroundColor: BTN_BLUE, borderColor: BTN_BLUE } : { borderColor: '#B7BEC6', color: INK }}
              >
                {t} · ${t === 'domestic' ? '25' : '40'} fee
              </button>
            ))}
          </div>
          {savedRecipients.length > 0 && (
            <div>
              <p className="text-[11.5px] font-semibold mb-1.5" style={{ color: MUTED }}>Saved wire recipients</p>
              <div className="flex flex-wrap gap-1.5">
                {savedRecipients.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setType(r.type);
                      setRecipient(r.name);
                      setRouting(r.routing);
                      setAccountNumber(r.accountNumber);
                    }}
                    className="text-[12px] px-2.5 py-1 rounded-[4px] border bg-[#FAFBFC] hover:bg-[#F2F6FB] cursor-pointer"
                    style={{ borderColor: LINE, color: INK }}
                  >
                    {r.name} (…{r.accountNumber.slice(-4)})
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label="From account">
            <select className={selectCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Recipient full name">
              <input className={inputCls} placeholder="As on their account" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </Field>
            <Field label={type === 'domestic' ? 'ABA routing number' : 'SWIFT / BIC code'} hint={type === 'domestic' ? '9 digits, e.g. 021000021' : 'e.g. CHASUS33'}>
              <input className={inputCls} placeholder={type === 'domestic' ? '021000021' : 'CHASUS33'} value={routing} onChange={(e) => setRouting(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={type === 'domestic' ? 'Recipient account number' : 'Account number / IBAN'} hint={type === 'domestic' ? 'Checking or savings account number' : 'IBAN or local account number'}>
              <input className={inputCls} placeholder={type === 'domestic' ? 'e.g. 1234567890' : 'e.g. GB29NWBK60161331926819'} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </Field>
            <Field label="Wire amount">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                <input className={`${inputCls} pl-7`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </Field>
          </div>
          <NoticeBox msg={msg} />
          <PrimaryBtn onClick={submit} busy={busy}>
            {busy ? 'Sending wire…' : `Send wire · ${fmtMoney((parseFloat(amount) || 0) + fee)} total`}
          </PrimaryBtn>
        </div>
      </div>
      <AsideCard
        title="Wire details"
        rows={[
          { k: 'Domestic fee', v: '$25' },
          { k: 'International fee', v: '$40' },
          { k: 'Cutoff', v: '4:00 PM ET business days' },
          { k: 'Delivery', v: 'Same day if before cutoff' },
        ]}
        help="Double-check the recipient and routing code — wires generally can't be reversed once released."
      />
    </div>
  );
};

/* ================================ LOAN PAGE ================================ */
const LoanPage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
  onOpenAccount: () => void;
}> = ({ user, deposits, onUpdateUser, onOpenAccount }) => {
  const loans = user.accounts.filter((a) => a.type === 'mortgage' || a.type === 'auto-loan');
  const [loanId, setLoanId] = useState(loans[0]?.id || '');
  const [fromId, setFromId] = useState(deposits[0]?.id || '');
  const [mode, setMode] = useState<'monthly' | 'payoff' | 'custom'>('monthly');
  const [custom, setCustom] = useState('');
  const [when, setWhen] = useState<'now' | 'scheduled'>('now');
  const [schedDate, setSchedDate] = useState(nextDueDate(1));
  const [msg, setMsg] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const loan = loans.find((l) => l.id === loanId);
  const from = deposits.find((a) => a.id === fromId);
  const monthly = loan?.monthlyPayment || 0;
  const amount = !loan ? 0 : mode === 'monthly' ? monthly : mode === 'payoff' ? loan.balance : parseFloat(custom) || 0;
  const home = user.home;

  if (loans.length === 0) {
    return (
      <div className="border rounded-[6px] bg-white p-8 text-center" style={{ borderColor: LINE }}>
        <p className="text-[16px] font-semibold" style={{ color: INK }}>No loans yet</p>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
          Finance a vehicle with Chase Auto to see loan payments here.
        </p>
        <div className="mt-4 flex justify-center">
          <PrimaryBtn onClick={onOpenAccount}>Explore financing</PrimaryBtn>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!loan || !from) return setMsg({ kind: 'error', text: 'Choose a loan and a funding account.' });
    if (isNaN(amount) || amount <= 0) return setMsg({ kind: 'error', text: 'Enter an amount greater than $0.' });
    if (amount > loan.balance)
      return setMsg({ kind: 'error', text: `Amount exceeds the remaining balance of ${fmtMoney(loan.balance)}.` });
    if (amount > from.balance) return setMsg({ kind: 'error', text: 'Insufficient funds in the selected account.' });

    setBusy(true);
    try {
      if (when === 'scheduled') {
        const u = await apiSchedulePayment({
          kind: 'loan',
          label: loan.name,
          fromAccountId: from.id,
          toAccountId: loan.id,
          amount: round2(amount),
          date: schedDate,
          frequency: 'once',
        });
        onUpdateUser(u);
        setReceipt({
          ref: confNumber('CHSC'),
          title: 'Payment scheduled',
          rows: [
            { k: 'Loan', v: `${loan.name} (…${loan.mask})` },
            { k: 'From', v: `${from.name} (…${from.mask})` },
            { k: 'Amount', v: fmtMoney(amount) },
            { k: 'Delivers', v: fmtDueDate(schedDate) },
          ],
        });
      } else {
        const u = await apiPayLoan(loan.id, from.id, round2(amount));
        onUpdateUser(u);
        const paidOff = round2(loan.balance - amount) <= 0;
        setReceipt({
          ref: confNumber('CHLP'),
          title: paidOff ? 'Loan paid in full' : 'Loan payment complete',
          rows: [
            { k: 'Loan', v: `${loan.name} (…${loan.mask})` },
            { k: 'Paid from', v: `${from.name} (…${from.mask})` },
            { k: 'Amount', v: fmtMoney(amount) },
            { k: 'Remaining balance', v: fmtMoney(Math.max(0, round2(loan.balance - amount))) },
          ],
        });
      }
      setMsg(null);
      setCustom('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Payment could not be completed.' });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return <ReceiptCard receipt={receipt} onReset={() => setReceipt(null)} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  const isMortgage = loan?.type === 'mortgage';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-[18px] h-[18px]" style={{ color: BTN_BLUE }} />
          <h2 className="text-[17px] font-semibold" style={{ color: INK }}>
            {isMortgage ? 'Pay your mortgage' : 'Pay your auto loan'}
          </h2>
        </div>
        <p className="text-[12.5px] mb-5" style={{ color: MUTED }}>
          Payments post the same business day when submitted before 8 PM ET.
        </p>

        <div className="space-y-4">
          <Field label="Loan">
            <select className={selectCls} value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} (…{l.mask}) — {fmtMoney(l.balance)} remaining
                </option>
              ))}
            </select>
          </Field>

          {loan && (
            <div className="border rounded-[5px] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderColor: LINE, background: '#FAFBFC' }}>
              {[
                { k: 'Remaining balance', v: fmtMoney(loan.balance) },
                { k: 'Monthly payment', v: fmtMoney(monthly) },
                { k: 'Interest rate', v: `${loan.apr}%` },
                { k: 'Next due', v: fmtDueDate(nextDueDate(home?.dueDay ?? 1)) },
              ].map((item) => (
                <div key={item.k}>
                  <p className="text-[11px]" style={{ color: FAINT }}>{item.k}</p>
                  <p className="mt-0.5 text-[14px] font-semibold" style={{ color: INK }}>{item.v}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <span className="block text-[12.5px] font-semibold text-[#353535] mb-1.5">Payment amount</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: 'monthly', label: 'Monthly payment', sub: fmtMoney(monthly) },
                  { id: 'payoff', label: 'Pay off loan', sub: loan ? fmtMoney(loan.balance) : '—' },
                  { id: 'custom', label: 'Custom amount', sub: 'You choose' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setMode(o.id)}
                  aria-pressed={mode === o.id}
                  className={`p-3 rounded-[5px] border text-left cursor-pointer ${mode === o.id ? 'bg-[#F2F6FB]' : 'bg-white hover:bg-[#FAFBFC]'}`}
                  style={{ borderColor: mode === o.id ? BTN_BLUE : LINE }}
                >
                  <span className="block text-[13px] font-semibold" style={{ color: INK }}>{o.label}</span>
                  <span className="block text-[12px]" style={{ color: MUTED }}>{o.sub}</span>
                </button>
              ))}
            </div>
            {mode === 'custom' && (
              <div className="relative max-w-[220px] mt-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                <input
                  className={`${inputCls} pl-7`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </div>
            )}
          </div>

          <Field label="Pay from">
            <select className={selectCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {deposits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (…{a.mask}) — {fmtMoney(a.balance)}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="block text-[12.5px] font-semibold text-[#353535] mb-1.5">When</span>
            <div className="grid grid-cols-2 gap-2">
              {(['now', 'scheduled'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWhen(w)}
                  aria-pressed={when === w}
                  className={`py-2.5 text-[13px] font-semibold rounded-[4px] border cursor-pointer ${when === w ? 'text-white' : 'bg-white'}`}
                  style={when === w ? { backgroundColor: BTN_BLUE, borderColor: BTN_BLUE } : { borderColor: '#B7BEC6', color: INK }}
                >
                  {w === 'now' ? 'Pay now' : 'Schedule'}
                </button>
              ))}
            </div>
            {when === 'scheduled' && (
              <div className="mt-3 max-w-[220px]">
                <Field label="Delivery date">
                  <input className={inputCls} type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <NoticeBox msg={msg} />
          <PrimaryBtn onClick={submit} busy={busy}>
            {busy
              ? 'Working…'
              : when === 'scheduled'
                ? `Schedule ${fmtMoney(amount || 0)}`
                : `Pay ${fmtMoney(amount || 0)}`}
          </PrimaryBtn>
        </div>
      </div>

      <AsideCard
        title={isMortgage ? 'Mortgage details' : 'Loan details'}
        rows={[
          { k: 'Posting', v: 'Same business day before 8 PM ET' },
          { k: 'Fee', v: '$0' },
          { k: 'Extra principal', v: 'Applied after the monthly payment' },
          { k: 'Escrow', v: isMortgage && home ? `${fmtMoney(home.monthlyEscrow)} monthly` : 'Not applicable' },
        ]}
        help="Paying more than the monthly amount reduces principal and can shorten the life of the loan. Scheduled payments can be cancelled any time before the delivery date."
      />
    </div>
  );
};

/* ============================== SHARED ASIDE ============================== */
const AsideCard: React.FC<{
  title: string;
  rows: { k: string; v: string }[];
  help: string;
}> = ({ title, rows, help }) => (
  <div className="xl:col-span-5 min-w-0">
    <div className="border rounded-[6px] bg-white p-5" style={{ borderColor: LINE }}>
      <h3 className="text-[15px] font-semibold" style={{ color: INK }}>{title}</h3>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between items-baseline gap-4 border-b border-[#EFF0F1] pb-2 last:border-b-0 last:pb-0">
            <dt className="shrink-0" style={{ color: MUTED }}>{r.k}</dt>
            <dd className="font-medium text-right" style={{ color: INK }}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
    <div className="mt-4 border rounded-[6px] bg-[#F7FAFD] p-4" style={{ borderColor: '#CFE0F0' }}>
      <p className="text-[12.5px] leading-relaxed" style={{ color: MUTED }}>{help}</p>
    </div>
  </div>
);
