/* -------------------------------------------------------------------------- */
/* Admin Console — Wealth (J.P. Morgan Investing), Ultimate Rewards® & Travel,*/
/* Chase Credit Journey®, Chase MyHome®, and Security & Alert Controls        */
/* Mirrors every feature visible on Customer User Pages (BankingDashboard)    */
/* -------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BellPlus,
  Check,
  Home,
  Plane,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type {
  CreditFactorStatus,
  CreditInquiry,
  CreditReportAccount,
  CustomChaseOffer,
  Holding,
  TravelBooking,
  TravelNotice,
  User,
} from '../../banking/store';
import { defaultBudgets, defaultCredit } from '../../banking/store';
import { ChaseIcon, JpmwmLogo } from '../ChaseAssets';
import { RadialGauge } from './charts';
import { AdminUserRow, inputDate } from './types';
import {
  Badge,
  Btn,
  Card,
  CardHeader,
  Checkbox,
  SelectInput,
  TableShell,
  Td,
  TextInput,
  Th,
  fmtMoneyFull,
} from './ui';

interface WealthCreditProps {
  users: AdminUserRow[];
  selectedUser: User | null;
  isReadOnly: boolean;
  busy: boolean;
  onSelectUser: (id: string) => void;
  onSaveUserObject: (updated: User, successMsg?: string) => Promise<boolean>;
}

const uidLocal = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const WealthCreditTab: React.FC<WealthCreditProps> = ({
  users,
  selectedUser,
  isReadOnly,
  busy,
  onSelectUser,
  onSaveUserObject,
}) => {
  // Investing state
  const [cash, setCash] = useState('0');
  const [symbol, setSymbol] = useState('NVDA');
  const [holdingName, setHoldingName] = useState('NVIDIA Corp.');
  const [shares, setShares] = useState('15');
  const [avgCost, setAvgCost] = useState('118.50');
  const [price, setPrice] = useState('142.80');

  // Credit Journey state
  const [score, setScore] = useState('760');
  const [goal, setGoal] = useState('800');
  const [changeReason, setChangeReason] = useState('On-time statement payment & lower utilization');
  const [alertTitle, setAlertTitle] = useState('Experian® inquiry alert');
  const [alertDetail, setAlertDetail] = useState('Simulated credit inquiry recorded on file.');

  // Ultimate Rewards & Travel state
  const [pointsCardId, setPointsCardId] = useState('');
  const [pointsDelta, setPointsDelta] = useState('25000');
  const [tripDest, setTripDest] = useState('Tokyo, Japan');
  const [tripStart, setTripStart] = useState(() => inputDate(0));
  const [tripEnd, setTripEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().slice(0, 10);
  });
  const [bookingTitle, setBookingTitle] = useState('Roundtrip NYC (EWR) → London (LHR)');
  const [bookingBrand, setBookingBrand] = useState<'united' | 'southwest' | 'airbnb'>('united');
  const [bookingDates, setBookingDates] = useState('Dec 12 – Dec 19, 2026');
  const [bookingPoints, setBookingPoints] = useState('58000');

  // MyHome & Contact/Security state
  const [homeAddr, setHomeAddr] = useState('');
  const [homeVal, setHomeVal] = useState('685000');
  const [homeAppr, setHomeAppr] = useState('4.8');
  const [homeEscrow, setHomeEscrow] = useState('740');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Experian Credit Bureau Tradeline & Hard Inquiry editor state
  const [tlName, setTlName] = useState('American Express® Gold');
  const [tlType, setTlType] = useState('Credit card');
  const [tlStatus, setTlStatus] = useState('Open');
  const [tlBalance, setTlBalance] = useState('640');
  const [tlLimit, setTlLimit] = useState('15000');
  const [inqName, setInqName] = useState('JPMorgan Chase Auto');
  const [inqDate, setInqDate] = useState(() => inputDate(0));

  // Monthly Category Budgets & Targeted Chase Offers state
  const [budgetsDraft, setBudgetsDraft] = useState<Record<string, number>>(() => defaultBudgets());
  const [offerMerchant, setOfferMerchant] = useState('Four Seasons Hotels & Resorts');
  const [offerCashback, setOfferCashback] = useState('15% cash back');
  const [offerDetail, setOfferDetail] = useState('Earn up to $150 back when you spend $500+ on your Chase card.');
  const [offerExpires, setOfferExpires] = useState('12/31');

  useEffect(() => {
    if (!selectedUser) return;
    setCash(String(selectedUser.investments?.cash ?? 12500));
    setScore(String(selectedUser.credit?.score ?? 760));
    setGoal(String(selectedUser.credit?.goal ?? 800));
    const cards = (selectedUser.accounts || []).filter((a) => a.type === 'credit-card');
    setPointsCardId(cards[0]?.id || '');
    setHomeAddr(selectedUser.home?.address || selectedUser.address || '245 Park Ave, New York, NY 10167');
    setHomeVal(String(selectedUser.home?.estimatedValue ?? 685000));
    setHomeAppr(String(selectedUser.home?.appreciationPct ?? 4.8));
    setHomeEscrow(String(selectedUser.home?.monthlyEscrow ?? 740));
    setPhone(selectedUser.phone || '(212) 555-0148');
    setAddress(selectedUser.address || '245 Park Ave, New York, NY 10167');
    setBudgetsDraft({ ...defaultBudgets(), ...(selectedUser.budgets || {}) });
  }, [selectedUser]);

  const portfolioStats = useMemo(() => {
    const inv = selectedUser?.investments;
    const holdings = inv?.holdings || [];
    const marketValue = holdings.reduce((s, h) => s + h.shares * h.price, 0);
    const costBasis = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
    const cashBal = Number(inv?.cash ?? 0);
    return {
      holdings,
      cashBal,
      marketValue,
      totalValue: marketValue + cashBal,
      gainLoss: marketValue - costBasis,
    };
  }, [selectedUser]);

  const cardAccounts = useMemo(
    () => (selectedUser?.accounts || []).filter((a) => a.type === 'credit-card'),
    [selectedUser]
  );

  const totalRewardsPoints = useMemo(
    () => cardAccounts.reduce((s, a) => s + Number(a.rewardsPoints || 0), 0),
    [cardAccounts]
  );

  if (!selectedUser) {
    return (
      <Card className="p-8 text-center text-gray-500">
        Select a test customer above to manage Investing, Ultimate Rewards®, Credit Journey®, MyHome®, and Security settings.
      </Card>
    );
  }

  /* ------------------------------ Handlers ------------------------------ */

  const saveCashBalance = async () => {
    const inv = selectedUser.investments || { accountMask: '8841', cash: 0, holdings: [] };
    await onSaveUserObject(
      {
        ...selectedUser,
        investments: { ...inv, cash: Math.max(0, Number(cash) || 0) },
      },
      'Brokerage cash balance updated.'
    );
  };

  const addOrUpdateHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const inv = selectedUser.investments || { accountMask: '8841', cash: Number(cash) || 0, holdings: [] };
    const nextItem: Holding = {
      symbol: sym,
      name: holdingName.trim() || sym,
      shares: Math.max(0.01, Number(shares) || 1),
      avgCost: Math.max(0.01, Number(avgCost) || 1),
      price: Math.max(0.01, Number(price) || 1),
    };
    const exists = inv.holdings.some((h) => h.symbol.toUpperCase() === sym);
    const nextHoldings = exists
      ? inv.holdings.map((h) => (h.symbol.toUpperCase() === sym ? nextItem : h))
      : [...inv.holdings, nextItem];

    await onSaveUserObject(
      {
        ...selectedUser,
        investments: { ...inv, holdings: nextHoldings },
      },
      `${exists ? 'Updated' : 'Added'} ${sym} position in J.P. Morgan Self-Directed Investing.`
    );
  };

  const removeHolding = async (sym: string) => {
    const inv = selectedUser.investments;
    if (!inv) return;
    await onSaveUserObject(
      {
        ...selectedUser,
        investments: {
          ...inv,
          holdings: inv.holdings.filter((h) => h.symbol !== sym),
        },
      },
      `Removed ${sym} from brokerage holdings.`
    );
  };

  const saveCreditJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextScore = Math.min(850, Math.max(300, Math.round(Number(score) || 760)));
    const nextGoal = Math.min(850, Math.max(300, Math.round(Number(goal) || 800)));
    const prevScore = selectedUser.credit?.score ?? nextScore;
    const delta = nextScore - prevScore;
    const baseCredit = selectedUser.credit || {
      score: nextScore,
      bureau: 'Experian®',
      model: 'VantageScore® 3.0',
      goal: nextGoal,
      enrolledAt: selectedUser.createdAt,
      history: [{ weeksAgo: 0, score: nextScore }],
      factors: [],
      changes: [],
      report: { pulledAt: new Date().toISOString(), accounts: [], inquiries: [], publicRecords: [], collections: [] },
      darkWeb: [],
      alerts: [],
    };

    const nextHistory = [
      { weeksAgo: 0, score: nextScore },
      ...(baseCredit.history || []).filter((h) => h.weeksAgo > 0),
    ];
    const nextChanges =
      delta !== 0 || changeReason.trim()
        ? [
            {
              id: uidLocal(),
              date: new Date().toISOString().slice(0, 10),
              delta,
              reason: changeReason.trim() || 'Admin credit profile update',
            },
            ...(baseCredit.changes || []).slice(0, 19),
          ]
        : baseCredit.changes;

    await onSaveUserObject(
      {
        ...selectedUser,
        credit: {
          ...baseCredit,
          score: nextScore,
          goal: nextGoal,
          history: nextHistory,
          changes: nextChanges,
        },
      },
      `Updated Chase Credit Journey® score to ${nextScore} (Goal ${nextGoal}).`
    );
  };

  const updateFactorStatus = async (factorId: string, status: CreditFactorStatus) => {
    if (!selectedUser.credit) return;
    const nextFactors = (selectedUser.credit.factors || []).map((f) =>
      f.id === factorId ? { ...f, status } : f
    );
    await onSaveUserObject(
      {
        ...selectedUser,
        credit: { ...selectedUser.credit, factors: nextFactors },
      },
      'Updated Credit Journey® score factor.'
    );
  };

  const addCreditAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser.credit) return;
    await onSaveUserObject(
      {
        ...selectedUser,
        credit: {
          ...selectedUser.credit,
          alerts: [
            {
              id: uidLocal(),
              date: new Date().toISOString().slice(0, 10),
              title: alertTitle.trim(),
              detail: alertDetail.trim(),
              read: false,
            },
            ...(selectedUser.credit.alerts || []),
          ],
        },
      },
      'Posted Credit Journey® alert to customer profile.'
    );
  };

  const adjustRewardsPoints = async (mode: 'add' | 'set') => {
    const targetId = pointsCardId || cardAccounts[0]?.id;
    if (!targetId) return;
    const pts = Math.round(Number(pointsDelta) || 0);
    const nextAccounts = selectedUser.accounts.map((a) => {
      if (a.id !== targetId) return a;
      const updatedPts =
        mode === 'set' ? Math.max(0, pts) : Math.max(0, Number(a.rewardsPoints || 0) + pts);
      return { ...a, rewardsPoints: updatedPts };
    });
    await onSaveUserObject(
      { ...selectedUser, accounts: nextAccounts },
      'Updated Chase Ultimate Rewards® points balance.'
    );
  };

  const addTravelNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    const notice: TravelNotice = {
      id: uidLocal(),
      destination: tripDest.trim(),
      startDate: tripStart,
      endDate: tripEnd,
    };
    await onSaveUserObject(
      {
        ...selectedUser,
        travelNotices: [notice, ...(selectedUser.travelNotices || [])],
      },
      `Added travel notice for ${notice.destination}.`
    );
  };

  const removeTravelNotice = async (id: string) => {
    await onSaveUserObject(
      {
        ...selectedUser,
        travelNotices: (selectedUser.travelNotices || []).filter((t) => t.id !== id),
      },
      'Removed travel notice.'
    );
  };

  const addTravelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const providerMap = {
      united: 'United Airlines',
      southwest: 'Southwest Airlines',
      airbnb: 'Airbnb',
    };
    const booking: TravelBooking = {
      id: uidLocal(),
      title: bookingTitle.trim(),
      provider: providerMap[bookingBrand],
      brand: bookingBrand,
      dates: bookingDates.trim(),
      pointsUsed: Math.max(0, Math.round(Number(bookingPoints) || 0)),
      status: 'Confirmed',
    };
    await onSaveUserObject(
      {
        ...selectedUser,
        travelBookings: [booking, ...(selectedUser.travelBookings || [])],
      },
      `Added Chase Travel℠ booking (${booking.provider}).`
    );
  };

  const removeTravelBooking = async (id: string) => {
    await onSaveUserObject(
      {
        ...selectedUser,
        travelBookings: (selectedUser.travelBookings || []).filter((b) => b.id !== id),
      },
      'Removed Chase Travel℠ booking.'
    );
  };

  const saveHomeAndContact = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveUserObject(
      {
        ...selectedUser,
        phone: phone.trim(),
        address: address.trim(),
        home: {
          address: homeAddr.trim() || address.trim(),
          estimatedValue: Math.max(0, Number(homeVal) || 0),
          appreciationPct: Number(homeAppr) || 0,
          monthlyEscrow: Math.max(0, Number(homeEscrow) || 0),
          dueDay: selectedUser.home?.dueDay || 1,
        },
      },
      'Saved Chase MyHome® property & customer contact details.'
    );
  };

  const toggleSecurity = async (key: 'twoFactor' | 'loginAlerts' | 'fraudAlerts' | 'paperless') => {
    const sec = selectedUser.security || {
      twoFactor: true,
      loginAlerts: true,
      fraudAlerts: true,
      paperless: true,
    };
    await onSaveUserObject(
      {
        ...selectedUser,
        security: { ...sec, [key]: !sec[key] },
      },
      `Toggled customer ${key} setting.`
    );
  };

  const togglePref = async (
    key: 'balanceAlerts' | 'paymentReminders' | 'transactionAlerts' | 'travelAlerts' | 'textAlerts'
  ) => {
    const prefs = selectedUser.preferences || {
      balanceAlerts: true,
      paymentReminders: true,
      transactionAlerts: true,
      travelAlerts: true,
      offerEmails: false,
      textAlerts: true,
      affiliateSharing: false,
      thirdPartyMarketing: false,
    };
    await onSaveUserObject(
      {
        ...selectedUser,
        preferences: { ...prefs, [key]: !prefs[key] },
      },
      `Updated customer alert preference (${key}).`
    );
  };

  return (
    <div className="space-y-5">
      {/* Customer Switcher + Portfolio KPI Strip */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-4 border-t-[3px] border-t-[#1A4488]">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4488]">
              Customer Wealth, Rewards &amp; Credit Studio
            </p>
            <p className="text-[12.5px] text-gray-500">
              Every change here updates {selectedUser.fullName}’s live Investments, Travel, Credit Journey®, MyHome®, and Security pages
            </p>
          </div>
        </div>
        <SelectInput
          aria-label="Wealth studio customer"
          value={selectedUser.id}
          onChange={(e) => e.target.value && onSelectUser(e.target.value)}
          className="min-w-[260px]"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} (@{u.username})
            </option>
          ))}
        </SelectInput>
      </Card>

      {/* Row 1: J.P. Morgan Self-Directed Investing + Chase Credit Journey® */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* J.P. Morgan Investing */}
        <Card className="xl:col-span-7 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <JpmwmLogo className="h-6 w-auto" />
              <div>
                <h3 className="text-[15.5px] font-semibold text-gray-900">
                  Self-Directed Investing Portfolio
                </h3>
                <p className="text-[11.5px] text-gray-500">
                  Account •••• {selectedUser.investments?.accountMask || '8841'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[20px] font-light text-gray-900 tabular-nums">
                {fmtMoneyFull(portfolioStats.totalValue)}
              </p>
              <p
                className={`text-[11.5px] font-semibold tabular-nums ${
                  portfolioStats.gainLoss >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {portfolioStats.gainLoss >= 0 ? '+' : ''}
                {fmtMoneyFull(portfolioStats.gainLoss)} unrealized
              </p>
            </div>
          </div>

          {/* Brokerage Cash Editor */}
          <div className="flex flex-wrap items-end gap-3 bg-[#F7F9FC] rounded-lg p-3 border border-[#E4E6E8]">
            <label className="flex-1 min-w-[180px]">
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">
                Sweep / Brokerage Cash Balance ($)
              </span>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
              />
            </label>
            <Btn
              variant="primary"
              size="sm"
              disabled={busy || isReadOnly}
              onClick={() => void saveCashBalance()}
            >
              <Check className="w-3.5 h-3.5" /> Update Cash
            </Btn>
          </div>

          {/* Add / Update Position Form */}
          <form
            onSubmit={addOrUpdateHolding}
            className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end"
          >
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Ticker</span>
              <TextInput
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Security Name</span>
              <TextInput
                value={holdingName}
                onChange={(e) => setHoldingName(e.target.value)}
                placeholder="Apple Inc."
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Shares</span>
              <TextInput
                type="number"
                step="0.01"
                min="0.01"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Avg Cost</span>
              <TextInput
                type="number"
                step="0.01"
                min="0.01"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Mkt Price</span>
              <TextInput
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <div className="col-span-2 sm:col-span-6 flex justify-end">
              <Btn type="submit" variant="secondary" size="xs" disabled={busy || isReadOnly}>
                <TrendingUp className="w-3.5 h-3.5" /> Add / Update Position
              </Btn>
            </div>
          </form>

          {/* Holdings Table */}
          <TableShell>
            <thead>
              <tr>
                <Th>Symbol</Th>
                <Th className="text-right">Shares</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Market Value</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {portfolioStats.holdings.map((h) => (
                <tr key={h.symbol} className="border-t border-gray-100">
                  <Td>
                    <button
                      type="button"
                      onClick={() => {
                        setSymbol(h.symbol);
                        setHoldingName(h.name);
                        setShares(String(h.shares));
                        setAvgCost(String(h.avgCost));
                        setPrice(String(h.price));
                      }}
                      className="text-left hover:underline cursor-pointer"
                    >
                      <span className="font-bold text-[#1A4488]">{h.symbol}</span>
                      <span className="block text-[11px] text-gray-500">{h.name}</span>
                    </button>
                  </Td>
                  <Td className="text-right">{h.shares}</Td>
                  <Td className="text-right">{fmtMoneyFull(h.avgCost)}</Td>
                  <Td className="text-right">{fmtMoneyFull(h.price)}</Td>
                  <Td className="text-right font-semibold">
                    {fmtMoneyFull(h.shares * h.price)}
                  </Td>
                  <Td className="text-right">
                    {!isReadOnly && (
                      <Btn
                        variant="danger"
                        size="xs"
                        disabled={busy}
                        onClick={() => void removeHolding(h.symbol)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Btn>
                    )}
                  </Td>
                </tr>
              ))}
              {portfolioStats.holdings.length === 0 && (
                <tr>
                  <Td colSpan={6} className="text-center text-gray-400 py-4">
                    No equity holdings yet — add a ticker above.
                  </Td>
                </tr>
              )}
            </tbody>
          </TableShell>
        </Card>

        {/* Chase Credit Journey® */}
        <Card className="xl:col-span-5 p-5 space-y-4">
          <CardHeader
            title="Chase Credit Journey® Control"
            subtitle="VantageScore® 3.0 by Experian® — score, goal, factors & alerts"
            action={<ChaseIcon name="creditScore" size={24} />}
          />

          <div className="flex items-center justify-around gap-4 bg-[#F7F9FC] rounded-xl p-3 border border-[#E4E6E8]">
            <RadialGauge
              pct={Math.round(((Number(score) - 300) / 550) * 100)}
              label={`${score} / 850`}
              sub={`Goal ${goal}`}
              color={Number(score) >= 740 ? '#12B76A' : Number(score) >= 670 ? '#0060F0' : '#F79009'}
              size={140}
            />
            <div className="space-y-1 text-[12px]">
              <p className="font-semibold text-gray-900">
                Current Score: <span className="text-[#1A4488] text-[16px]">{selectedUser.credit?.score ?? 760}</span>
              </p>
              <p className="text-gray-500">Target Goal: {selectedUser.credit?.goal ?? 800}</p>
              <p className="text-gray-500">
                Unread Alerts: {(selectedUser.credit?.alerts || []).filter((a) => !a.read).length}
              </p>
            </div>
          </div>

          <form onSubmit={saveCreditJourney} className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Score (300–850)
              </span>
              <TextInput
                type="number"
                min="300"
                max="850"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Score Goal (300–850)
              </span>
              <TextInput
                type="number"
                min="300"
                max="850"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
              />
            </label>
            <label className="block col-span-2">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Score Change Reason (shown in Credit Journey®)
              </span>
              <TextInput
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </label>
            <div className="col-span-2 flex justify-end">
              <Btn type="submit" variant="primary" size="xs" disabled={busy || isReadOnly}>
                <Sparkles className="w-3.5 h-3.5" /> Save Credit Score &amp; Goal
              </Btn>
            </div>
          </form>

          {/* Credit Factors */}
          {(selectedUser.credit?.factors || []).length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Score Factors
              </p>
              {(selectedUser.credit?.factors || []).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 text-[12px] py-1"
                >
                  <span className="font-medium text-gray-800 truncate">{f.label}</span>
                  <SelectInput
                    value={f.status}
                    disabled={busy || isReadOnly}
                    onChange={(e) =>
                      void updateFactorStatus(f.id, e.target.value as CreditFactorStatus)
                    }
                    className="h-7 text-[11px] py-0"
                  >
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="needs-work">Needs work</option>
                  </SelectInput>
                </div>
              ))}
            </div>
          )}

          {/* Post Credit Alert */}
          <form onSubmit={addCreditAlert} className="pt-2 border-t border-gray-100 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Push Credit / Dark Web Alert
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <TextInput
                placeholder="Alert title"
                value={alertTitle}
                onChange={(e) => setAlertTitle(e.target.value)}
                required
              />
              <TextInput
                placeholder="Detail message"
                value={alertDetail}
                onChange={(e) => setAlertDetail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end">
              <Btn type="submit" variant="secondary" size="xs" disabled={busy || isReadOnly}>
                <BellPlus className="w-3.5 h-3.5" /> Push Alert
              </Btn>
            </div>
          </form>
        </Card>
      </div>

      {/* Row 2: Ultimate Rewards® & Travel + Chase MyHome® & Security */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Ultimate Rewards & Travel */}
        <Card className="xl:col-span-6 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2.5">
              <ChaseIcon name="planeTravel" size={24} />
              <div>
                <h3 className="text-[15.5px] font-semibold text-gray-900">
                  Chase Ultimate Rewards® &amp; Travel
                </h3>
                <p className="text-[11.5px] text-gray-500">
                  Points balance, Travel Notices &amp; Chase Travel℠ reservations
                </p>
              </div>
            </div>
            <Badge tone="primary">{totalRewardsPoints.toLocaleString()} total pts</Badge>
          </div>

          {/* Grant / Set Points */}
          {cardAccounts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end bg-[#F7F9FC] p-3 rounded-lg border border-[#E4E6E8]">
              <label className="block sm:col-span-2">
                <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                  Rewards Card
                </span>
                <SelectInput
                  value={pointsCardId}
                  onChange={(e) => setPointsCardId(e.target.value)}
                  className="w-full"
                >
                  {cardAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({(c.rewardsPoints || 0).toLocaleString()} pts)
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label className="block">
                <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">Points</span>
                <TextInput
                  type="number"
                  step="100"
                  value={pointsDelta}
                  onChange={(e) => setPointsDelta(e.target.value)}
                />
              </label>
              <div className="flex gap-1.5">
                <Btn
                  variant="primary"
                  size="xs"
                  disabled={busy || isReadOnly}
                  onClick={() => void adjustRewardsPoints('add')}
                >
                  <Award className="w-3.5 h-3.5" /> +Grant
                </Btn>
                <Btn
                  variant="secondary"
                  size="xs"
                  disabled={busy || isReadOnly}
                  onClick={() => void adjustRewardsPoints('set')}
                >
                  Set
                </Btn>
              </div>
            </div>
          )}

          {/* Travel Notices */}
          <form onSubmit={addTravelNotice} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <label className="block sm:col-span-2">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">
                Travel Notice Destination
              </span>
              <TextInput
                value={tripDest}
                onChange={(e) => setTripDest(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Depart</span>
              <TextInput
                type="date"
                value={tripStart}
                onChange={(e) => setTripStart(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Return</span>
              <TextInput
                type="date"
                value={tripEnd}
                onChange={(e) => setTripEnd(e.target.value)}
                required
              />
            </label>
            <div className="sm:col-span-4 flex justify-end">
              <Btn type="submit" variant="secondary" size="xs" disabled={busy || isReadOnly}>
                <Plane className="w-3.5 h-3.5" /> Add Travel Notice
              </Btn>
            </div>
          </form>

          {(selectedUser.travelNotices || []).length > 0 && (
            <ul className="divide-y divide-gray-100 text-[12px]">
              {(selectedUser.travelNotices || []).map((n) => (
                <li key={n.id} className="py-2 flex items-center justify-between">
                  <span>
                    <strong>{n.destination}</strong> · {n.startDate} → {n.endDate}
                  </span>
                  {!isReadOnly && (
                    <Btn
                      variant="danger"
                      size="xs"
                      disabled={busy}
                      onClick={() => void removeTravelNotice(n.id)}
                    >
                      Remove
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Travel Bookings */}
          <form
            onSubmit={addTravelBooking}
            className="pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end"
          >
            <label className="block col-span-2">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">
                Itinerary Title
              </span>
              <TextInput
                value={bookingTitle}
                onChange={(e) => setBookingTitle(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Partner</span>
              <SelectInput
                value={bookingBrand}
                onChange={(e) =>
                  setBookingBrand(e.target.value as 'united' | 'southwest' | 'airbnb')
                }
                className="w-full"
              >
                <option value="united">United Airlines</option>
                <option value="southwest">Southwest</option>
                <option value="airbnb">Airbnb</option>
              </SelectInput>
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Pts Used</span>
              <TextInput
                type="number"
                value={bookingPoints}
                onChange={(e) => setBookingPoints(e.target.value)}
              />
            </label>
            <label className="block col-span-2 sm:col-span-3">
              <span className="block text-[10.5px] font-semibold text-gray-500 mb-1">Dates</span>
              <TextInput
                value={bookingDates}
                onChange={(e) => setBookingDates(e.target.value)}
                required
              />
            </label>
            <Btn type="submit" variant="secondary" size="xs" disabled={busy || isReadOnly}>
              <Plus className="w-3.5 h-3.5" /> Add Booking
            </Btn>
          </form>

          {(selectedUser.travelBookings || []).length > 0 && (
            <ul className="divide-y divide-gray-100 text-[12px]">
              {(selectedUser.travelBookings || []).map((b) => (
                <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-gray-900">{b.title}</strong>
                    <span className="block text-[11px] text-gray-500">
                      {b.provider} · {b.dates} · {(b.pointsUsed || 0).toLocaleString()} pts
                    </span>
                  </div>
                  {!isReadOnly && (
                    <Btn
                      variant="danger"
                      size="xs"
                      disabled={busy}
                      onClick={() => void removeTravelBooking(b.id)}
                    >
                      Cancel
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Chase MyHome® + Customer Security & Contact Settings */}
        <Card className="xl:col-span-6 p-5 space-y-4">
          <CardHeader
            title="Chase MyHome®, Contact & Security Center"
            subtitle="Property valuation, contact address/phone, 2-step verification & alerts"
            action={<Home className="w-5 h-5 text-[#1A4488]" />}
          />

          <form onSubmit={saveHomeAndContact} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Customer Phone
              </span>
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Mailing Address
              </span>
              <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                MyHome® Property Address
              </span>
              <TextInput value={homeAddr} onChange={(e) => setHomeAddr(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                Estimated Property Value ($)
              </span>
              <TextInput
                type="number"
                value={homeVal}
                onChange={(e) => setHomeVal(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                  1Y Appr. (%)
                </span>
                <TextInput
                  type="number"
                  step="0.1"
                  value={homeAppr}
                  onChange={(e) => setHomeAppr(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">
                  Escrow ($/mo)
                </span>
                <TextInput
                  type="number"
                  value={homeEscrow}
                  onChange={(e) => setHomeEscrow(e.target.value)}
                />
              </label>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Btn type="submit" variant="primary" size="xs" disabled={busy || isReadOnly}>
                <Check className="w-3.5 h-3.5" /> Save MyHome® &amp; Contact Info
              </Btn>
            </div>
          </form>

          {/* Security Center Toggles */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1A4488]" />
              Customer Security &amp; Alert Toggles
            </p>
            <div className="grid grid-cols-2 gap-2.5 text-[12.5px]">
              {(
                [
                  ['twoFactor', '2-Step Verification'],
                  ['loginAlerts', 'Sign-In Security Alerts'],
                  ['fraudAlerts', 'Real-Time Fraud Alerts'],
                  ['paperless', 'Paperless Statements'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <Checkbox
                    checked={selectedUser.security?.[key] ?? true}
                    disabled={busy || isReadOnly}
                    onChange={() => void toggleSecurity(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
              {(
                [
                  ['balanceAlerts', 'Low Balance Alerts'],
                  ['transactionAlerts', 'Card Purchase Alerts'],
                  ['paymentReminders', 'Bill Due Reminders'],
                  ['textAlerts', 'SMS Mobile Alerts'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <Checkbox
                    checked={selectedUser.preferences?.[key] ?? true}
                    disabled={busy || isReadOnly}
                    onChange={() => void togglePref(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Row 3: Experian® Credit Bureau Tradelines & Hard Inquiries + Budgets & Targeted Chase Offers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 5. Experian® Credit Bureau Tradelines & Inquiries Visual Editor */}
        <Card className="p-5 space-y-4">
          <CardHeader
            title="Experian® Credit Bureau Tradelines &amp; Hard Inquiries"
            subtitle="Visually edit reported bureau accounts and inquiries displayed in Customer Credit Journey® → Credit Report"
          />

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Reported Bureau Tradelines ({(selectedUser.credit?.report?.accounts || []).length})
            </p>
            {(selectedUser.credit?.report?.accounts || []).length === 0 ? (
              <p className="text-xs text-gray-400">No bureau tradelines recorded yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {(selectedUser.credit?.report?.accounts || []).map((acct, idx) => (
                  <div key={`${acct.name}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div>
                      <span className="font-semibold text-gray-900">{acct.name}</span>{' '}
                      <Badge tone={acct.status === 'Open' ? 'success' : acct.status.includes('late') ? 'error' : 'neutral'}>
                        {acct.status}
                      </Badge>
                      <div className="text-[11px] text-gray-500">
                        {acct.type} · Balance {fmtMoneyFull(acct.balance)} / Limit {fmtMoneyFull(acct.limit)}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <Btn
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={async () => {
                          const baseCredit = selectedUser.credit || defaultCredit();
                          const nextAccounts = (baseCredit.report?.accounts || []).filter((_, i) => i !== idx);
                          await onSaveUserObject(
                            {
                              ...selectedUser,
                              credit: {
                                ...baseCredit,
                                report: {
                                  ...(baseCredit.report || defaultCredit().report),
                                  accounts: nextAccounts,
                                },
                              },
                            },
                            'Removed Experian® tradeline'
                          );
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isReadOnly && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const baseCredit = selectedUser.credit || defaultCredit();
                  const entry: CreditReportAccount = {
                    name: tlName.trim() || 'Reported Credit Account',
                    type: tlType,
                    status: tlStatus,
                    balance: Math.max(0, Number(tlBalance) || 0),
                    limit: Math.max(0, Number(tlLimit) || 0),
                    opened: new Date().toISOString(),
                  };
                  await onSaveUserObject(
                    {
                      ...selectedUser,
                      credit: {
                        ...baseCredit,
                        report: {
                          ...(baseCredit.report || defaultCredit().report),
                          pulledAt: new Date().toISOString(),
                          accounts: [entry, ...(baseCredit.report?.accounts || [])],
                        },
                      },
                    },
                    `Added tradeline "${entry.name}" to Experian® file`
                  );
                }}
                className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1 items-end"
              >
                <label className="col-span-2">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Creditor / Product</span>
                  <TextInput value={tlName} onChange={(e) => setTlName(e.target.value)} required />
                </label>
                <label>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Type</span>
                  <SelectInput value={tlType} onChange={(e) => setTlType(e.target.value)}>
                    <option value="Credit card">Credit card</option>
                    <option value="Installment">Installment</option>
                    <option value="Auto loan">Auto loan</option>
                    <option value="Mortgage">Mortgage</option>
                  </SelectInput>
                </label>
                <label>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Status</span>
                  <SelectInput value={tlStatus} onChange={(e) => setTlStatus(e.target.value)}>
                    <option value="Open">Open</option>
                    <option value="Paid as agreed">Paid as agreed</option>
                    <option value="30 days late">30 days late</option>
                    <option value="Closed">Closed</option>
                  </SelectInput>
                </label>
                <label>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Balance ($)</span>
                  <TextInput type="number" value={tlBalance} onChange={(e) => setTlBalance(e.target.value)} />
                </label>
                <div className="flex gap-1 items-end">
                  <TextInput
                    type="number"
                    aria-label="Tradeline credit limit"
                    placeholder="Limit"
                    value={tlLimit}
                    onChange={(e) => setTlLimit(e.target.value)}
                  />
                  <Btn type="submit" variant="primary" size="xs" disabled={busy}>
                    <Plus className="w-3.5 h-3.5" />
                  </Btn>
                </div>
              </form>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Hard Inquiries ({(selectedUser.credit?.report?.inquiries || []).length})
            </p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {(selectedUser.credit?.report?.inquiries || []).map((inq, idx) => (
                <div key={`${inq.name}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-gray-900">{inq.name}</span>{' '}
                    <Badge tone={inq.removed ? 'neutral' : 'warning'}>
                      {inq.removed ? 'Removed' : inq.type || 'Hard inquiry'}
                    </Badge>
                    <span className="ml-2 text-gray-500">{String(inq.date).slice(0, 10)}</span>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1">
                      <Btn
                        variant="secondary"
                        size="xs"
                        disabled={busy}
                        onClick={async () => {
                          const baseCredit = selectedUser.credit || defaultCredit();
                          const nextInq = (baseCredit.report?.inquiries || []).map((item, i) =>
                            i === idx
                              ? { ...item, removed: !item.removed, type: !item.removed ? 'Removed' : 'Hard inquiry' }
                              : item
                          );
                          await onSaveUserObject(
                            {
                              ...selectedUser,
                              credit: {
                                ...baseCredit,
                                report: { ...(baseCredit.report || defaultCredit().report), inquiries: nextInq },
                              },
                            },
                            'Updated inquiry status'
                          );
                        }}
                      >
                        {inq.removed ? 'Restore' : 'Suppress'}
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={async () => {
                          const baseCredit = selectedUser.credit || defaultCredit();
                          const nextInq = (baseCredit.report?.inquiries || []).filter((_, i) => i !== idx);
                          await onSaveUserObject(
                            {
                              ...selectedUser,
                              credit: {
                                ...baseCredit,
                                report: { ...(baseCredit.report || defaultCredit().report), inquiries: nextInq },
                              },
                            },
                            'Deleted hard inquiry'
                          );
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!isReadOnly && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const baseCredit = selectedUser.credit || defaultCredit();
                  const entry: CreditInquiry = {
                    name: inqName.trim() || 'Chase Card Services',
                    date: new Date(`${inqDate}T12:00:00Z`).toISOString(),
                    type: 'Hard inquiry',
                  };
                  await onSaveUserObject(
                    {
                      ...selectedUser,
                      credit: {
                        ...baseCredit,
                        report: {
                          ...(baseCredit.report || defaultCredit().report),
                          inquiries: [entry, ...(baseCredit.report?.inquiries || [])],
                        },
                      },
                    },
                    `Recorded hard inquiry from ${entry.name}`
                  );
                }}
                className="flex flex-wrap gap-2 pt-1 items-end"
              >
                <div className="flex-1 min-w-[160px]">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Inquiring Institution</span>
                  <TextInput value={inqName} onChange={(e) => setInqName(e.target.value)} required />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Inquiry Date</span>
                  <TextInput type="date" value={inqDate} onChange={(e) => setInqDate(e.target.value)} required />
                </div>
                <Btn type="submit" variant="secondary" size="xs" disabled={busy}>
                  <Plus className="w-3.5 h-3.5" /> Add Inquiry
                </Btn>
              </form>
            )}
          </div>
        </Card>

        {/* 6. Monthly Category Spending Budgets & Targeted Chase Offers Studio */}
        <Card className="p-5 space-y-4">
          <CardHeader
            title="Spending Budgets &amp; Targeted Chase Offers Studio"
            subtitle="Configure monthly category budgets (Plan &amp; Track) and push custom cash-back offers to Customer Chase Offers"
          />

          {/* Monthly Budgets */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onSaveUserObject(
                { ...selectedUser, budgets: budgetsDraft },
                'Saved customer monthly category budgets'
              );
            }}
            className="space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Monthly Category Budgets (USD)
              </p>
              {!isReadOnly && (
                <Btn type="submit" variant="primary" size="xs" disabled={busy}>
                  <Check className="w-3.5 h-3.5" /> Save Budgets
                </Btn>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(budgetsDraft).map(([cat, amt]) => (
                <label key={cat} className="block">
                  <span className="block text-[10.5px] font-semibold text-gray-600 truncate mb-0.5">
                    {cat}
                  </span>
                  <TextInput
                    type="number"
                    min="0"
                    step="10"
                    disabled={isReadOnly}
                    value={String(amt)}
                    onChange={(e) =>
                      setBudgetsDraft((prev) => ({
                        ...prev,
                        [cat]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </form>

          {/* Targeted Chase Offers */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#117ACA]" />
              Targeted Chase Offers ({(selectedUser.customOffers || []).length})
            </p>
            {(selectedUser.customOffers || []).length > 0 && (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {(selectedUser.customOffers || []).map((offer) => (
                  <div key={offer.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900">{offer.merchant}</span>{' '}
                      <Badge tone="info">{offer.cashback}</Badge>{' '}
                      {offer.activated && <Badge tone="success">Added by Customer</Badge>}
                      <p className="text-[11px] text-gray-500 truncate">{offer.detail}</p>
                    </div>
                    {!isReadOnly && (
                      <Btn
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={async () => {
                          const nextOffers = (selectedUser.customOffers || []).filter(
                            (o) => o.id !== offer.id
                          );
                          await onSaveUserObject(
                            { ...selectedUser, customOffers: nextOffers },
                            'Removed targeted Chase Offer'
                          );
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isReadOnly && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const created: CustomChaseOffer = {
                    id: `offer-${uidLocal()}`,
                    merchant: offerMerchant.trim() || 'Chase Partner Merchant',
                    cashback: offerCashback.trim() || '10% cash back',
                    detail: offerDetail.trim() || 'Statement credit automatically applied within 7 business days.',
                    expires: offerExpires.trim() || '12/31',
                    activated: false,
                  };
                  await onSaveUserObject(
                    {
                      ...selectedUser,
                      customOffers: [created, ...(selectedUser.customOffers || [])],
                    },
                    `Published "${created.merchant}" offer to customer`
                  );
                }}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
              >
                <label className="sm:col-span-2">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Merchant</span>
                  <TextInput value={offerMerchant} onChange={(e) => setOfferMerchant(e.target.value)} required />
                </label>
                <label>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Reward Value</span>
                  <TextInput value={offerCashback} onChange={(e) => setOfferCashback(e.target.value)} required />
                </label>
                <label>
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Expires</span>
                  <TextInput value={offerExpires} onChange={(e) => setOfferExpires(e.target.value)} required />
                </label>
                <label className="sm:col-span-3">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-1">Offer Terms</span>
                  <TextInput value={offerDetail} onChange={(e) => setOfferDetail(e.target.value)} required />
                </label>
                <Btn type="submit" variant="primary" size="xs" disabled={busy}>
                  <Plus className="w-3.5 h-3.5" /> Push Offer
                </Btn>
              </form>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
