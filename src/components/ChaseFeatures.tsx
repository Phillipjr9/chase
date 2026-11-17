import React, { useEffect, useState } from 'react';
import {
  Search,
  MapPin,
  Clock,
  TrendingUp,
  ShieldCheck,
  Plus,
  CheckCircle2,
  AlertCircle,
  Phone,
  CalendarDays,
  Lock,
  Unlock,
  ArrowUpRight,
} from 'lucide-react';
import {
  ChaseIcon,
  ChaseCardImage,
  BrandLogo,
  JpmwmLogo,
  PrivateClientLogo,
  ChaseTravelLogo,
  ChaseBusinessLogo,
  cardProductFor,
} from './ChaseAssets';
import {
  LOCATIONS,
  OFFERS,
  ADVISORS,
  INK_CARDS,
  TRAVEL_DEALS,
  ChaseLocation,
  ChaseOffer,
} from '../data/chaseFeatures';
import {
  User,
  ProductId,
  MARKET_QUOTES,
  fmtMoney,
  round2,
  defaultHome,
  nextDueDate,
  fmtDueDate,
  tradeInvestment,
  redeemPoints,
  updateSecuritySettings,
  updateCardControls,
  defaultBudgets,
  saveBudgets,
  sendSecureMessage,
  fetchSupportInbox,
  SecureMessage,
  markSecureMessagesRead,
  toggleCustomOffer,
  SecureMessageCategory,
} from '../banking/store';

/* Real Chase tokens */
const NAVY = '#081427';
const BLUE = '#1A4488';
const BLUE_DARK = '#143669';
const INK = '#131313';
const MUT = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

const inputCls =
  'w-full h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px] text-[#131313] bg-white focus:border-[#1A4488] outline-none';

const H1: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h1 className={`text-[26px] font-light tracking-[-0.01em] ${className}`} style={{ color: INK }}>
    {children}
  </h1>
);

const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', style }) => (
  <div className={`bg-white border rounded-[6px] ${className}`} style={{ borderColor: LINE, ...style }}>
    {children}
  </div>
);

const Outline: React.FC<{ children: React.ReactNode; onClick: () => void; size?: 'sm' | 'md'; disabled?: boolean }> = ({
  children,
  onClick,
  size = 'md',
  disabled = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center justify-center gap-1.5 border bg-white hover:bg-[#F2F6FB] font-semibold rounded-[4px] cursor-pointer disabled:opacity-60 ${
      size === 'sm' ? 'text-[12.5px] px-3.5 py-2' : 'text-[14px] px-5 py-2.5'
    }`}
    style={{ borderColor: BLUE, color: BLUE }}
  >
    {children}
  </button>
);

const Solid: React.FC<{ children: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({
  children,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-55 transition-colors"
    style={{ backgroundColor: BLUE }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_DARK)}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
  >
    {children}
  </button>
);

const DottedLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="border-b border-dotted border-[#8A929A] pb-px">{children}</span>
);

const Row: React.FC<{ k: string; v: string; bold?: boolean }> = ({ k, v, bold }) => (
  <div className="flex justify-between gap-3">
    <dt style={{ color: MUT }}>{k}</dt>
    <dd className={bold ? 'font-semibold' : 'font-medium'} style={{ color: INK }}>{v}</dd>
  </div>
);

const InlineNotice: React.FC<{ msg: { kind: 'success' | 'error'; text: string } | null }> = ({ msg }) =>
  msg ? (
    <div
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

/* ============================ 1. INVESTMENTS BY J.P. MORGAN ============================ */
export const InvestmentsView: React.FC<{
  user: User;
  onUpdateUser: (u: User) => void;
}> = ({ user, onUpdateUser }) => {
  const portfolio = user.investments || { accountMask: '7192', cash: 2450, holdings: [] };
  const [symbol, setSymbol] = useState(MARKET_QUOTES[0].symbol);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [shares, setShares] = useState('1');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedQuote = MARKET_QUOTES.find((q) => q.symbol === symbol) || MARKET_QUOTES[0];
  const holdingsValue = portfolio.holdings.reduce((sum, h) => sum + h.shares * h.price, 0);
  const costBasis = portfolio.holdings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
  const totalValue = holdingsValue + portfolio.cash;
  const gain = holdingsValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;

  const sharesNum = parseFloat(shares) || 0;
  const estTotal = sharesNum * selectedQuote.price;

  const submitTrade = async () => {
    if (sharesNum <= 0) {
      setNotice({ kind: 'error', text: 'Enter a valid number of shares.' });
      return;
    }
    setBusy(true);
    try {
      const updated = await tradeInvestment(symbol, side, sharesNum);
      onUpdateUser(updated);
      setNotice({
        kind: 'success',
        text: `${side === 'buy' ? 'Bought' : 'Sold'} ${sharesNum} share${sharesNum === 1 ? '' : 's'} of ${symbol} at ${fmtMoney(selectedQuote.price)} ($0 online commission).`,
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Trade could not be completed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: LINE }}>
        <div>
          <JpmwmLogo className="h-[24px] w-auto mb-2" />
          <p className="text-[13px]" style={{ color: MUT }}>
            J.P. Morgan Self-Directed Investing (…{portfolio.accountMask}) · $0 online commission trades
          </p>
        </div>
        <span className="text-[12px] font-semibold px-3 py-1 rounded-full bg-[#EAF7EE] text-[#138842]">
          Markets open · Real-time quotes
        </span>
      </div>

      {/* Portfolio metrics */}
      <Panel className="mt-5 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#E4E6E8]">
          <div className="px-5 py-4">
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Total account value</DottedLabel></p>
            <p className="mt-1.5 text-[26px] font-light leading-none" style={{ color: INK }}>{fmtMoney(totalValue)}</p>
            <p className="mt-1.5 text-[11.5px]" style={{ color: FAINT }}>Investments + sweep cash</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Unrealized gain/loss</DottedLabel></p>
            <p className={`mt-1.5 text-[24px] font-light leading-none ${gain >= 0 ? 'text-[#138842]' : 'text-[#B42318]'}`}>
              {gain >= 0 ? '+' : ''}{fmtMoney(gain)}
            </p>
            <p className={`mt-1.5 text-[11.5px] font-semibold ${gain >= 0 ? 'text-[#138842]' : 'text-[#B42318]'}`}>
              {gain >= 0 ? '+' : ''}{gainPct.toFixed(2)}% overall
            </p>
          </div>
          <div className="px-5 py-4 border-t lg:border-t-0">
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Market value</DottedLabel></p>
            <p className="mt-1.5 text-[24px] font-light leading-none" style={{ color: INK }}>{fmtMoney(holdingsValue)}</p>
            <p className="mt-1.5 text-[11.5px]" style={{ color: FAINT }}>{portfolio.holdings.length} positions</p>
          </div>
          <div className="px-5 py-4 border-t lg:border-t-0">
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Available to trade</DottedLabel></p>
            <p className="mt-1.5 text-[24px] font-light leading-none" style={{ color: INK }}>{fmtMoney(portfolio.cash)}</p>
            <p className="mt-1.5 text-[11.5px]" style={{ color: FAINT }}>JPMorgan U.S. Gov Money Market</p>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Holdings table */}
        <div className="lg:col-span-8">
          <Panel className="overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
              <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Positions</h2>
              <span className="text-[12px]" style={{ color: MUT }}>Click a ticker to trade</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[540px]">
                <thead>
                  <tr className="bg-[#F7F8F9] text-left text-[11.5px] uppercase tracking-wider" style={{ color: MUT }}>
                    <th className="px-5 py-2.5 font-semibold">Symbol</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Shares</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Price</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Market Value</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Total Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h) => {
                    const mv = h.shares * h.price;
                    const g = mv - h.shares * h.avgCost;
                    const gPct = h.avgCost > 0 ? ((h.price - h.avgCost) / h.avgCost) * 100 : 0;
                    return (
                      <tr
                        key={h.symbol}
                        onClick={() => setSymbol(h.symbol)}
                        className="border-t hover:bg-[#F7FAFD] cursor-pointer"
                        style={{ borderColor: '#EFF0F1' }}
                      >
                        <td className="px-5 py-3">
                          <span className="font-bold block" style={{ color: BLUE }}>{h.symbol}</span>
                          <span className="text-[11.5px]" style={{ color: MUT }}>{h.name}</span>
                        </td>
                        <td className="px-3 py-3 text-right">{h.shares}</td>
                        <td className="px-3 py-3 text-right">{fmtMoney(h.price)}</td>
                        <td className="px-3 py-3 text-right font-semibold">{fmtMoney(mv)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${g >= 0 ? 'text-[#138842]' : 'text-[#B42318]'}`}>
                          {g >= 0 ? '+' : ''}{fmtMoney(g)} ({g >= 0 ? '+' : ''}{gPct.toFixed(1)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Market Watchlist */}
          <Panel className="mt-5 p-5">
            <h2 className="text-[15px] font-semibold mb-3" style={{ color: INK }}>J.P. Morgan Watchlist</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {MARKET_QUOTES.map((q) => (
                <button
                  key={q.symbol}
                  type="button"
                  onClick={() => setSymbol(q.symbol)}
                  className={`p-3 rounded-[5px] border text-left cursor-pointer ${
                    symbol === q.symbol ? 'bg-[#F2F6FB]' : 'bg-white hover:bg-[#FAFBFC]'
                  }`}
                  style={{ borderColor: symbol === q.symbol ? BLUE : LINE }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[13.5px]" style={{ color: BLUE }}>{q.symbol}</span>
                    <span className="text-[11.5px] font-semibold text-[#138842]">+{q.changePct}%</span>
                  </div>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: MUT }}>{q.name}</p>
                  <p className="text-[14px] font-semibold mt-1" style={{ color: INK }}>{fmtMoney(q.price)}</p>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* Trade ticket */}
        <aside className="lg:col-span-4 space-y-4">
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Trade stocks &amp; ETFs</h2>
              <ChaseIcon name="chartLine" size={22} />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['buy', 'sell'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`py-2 text-[13px] font-semibold rounded-[4px] border capitalize cursor-pointer ${
                    side === s ? 'text-white' : 'bg-white hover:bg-[#F7FAFD]'
                  }`}
                  style={side === s ? { backgroundColor: BLUE, borderColor: BLUE } : { borderColor: '#B7BEC6', color: INK }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>Symbol</label>
                <select className={inputCls} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  {MARKET_QUOTES.map((q) => (
                    <option key={q.symbol} value={q.symbol}>
                      {q.symbol} — {q.name} ({fmtMoney(q.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>Shares</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </div>
              <dl className="border-t pt-3 space-y-1.5 text-[12.5px]" style={{ borderColor: LINE }}>
                <Row k="Order type" v="Market" />
                <Row k="Commission" v="$0.00" />
                <Row k="Estimated total" v={fmtMoney(estTotal)} bold />
              </dl>
              <InlineNotice msg={notice} />
              <Solid onClick={submitTrade} disabled={busy}>
                {busy ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
              </Solid>
            </div>
          </Panel>

          <p className="text-[11px] leading-relaxed px-1" style={{ color: FAINT }}>
            INVESTMENT AND INSURANCE PRODUCTS ARE: NOT A DEPOSIT · NOT FDIC INSURED · NO BANK GUARANTEE · MAY LOSE VALUE. Securities offered by J.P. Morgan Securities LLC (JPMS), Member FINRA/SIPC.
          </p>
        </aside>
      </div>
    </div>
  );
};

/* ============================ 2. CHASE TRAVEL & REWARDS ============================ */
export const TravelView: React.FC<{
  user: User;
  onUpdateUser: (u: User) => void;
}> = ({ user, onUpdateUser }) => {
  const cards = user.accounts.filter((a) => a.type === 'credit-card');
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id || '');
  const [transferPartner, setTransferPartner] = useState<'united' | 'southwest'>('united');
  const [transferPts, setTransferPts] = useState('10000');
  const [cashPts, setCashPts] = useState('5000');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const activeCard = cards.find((c) => c.id === selectedCardId) || cards[0];
  const totalPts = cards.reduce((s, c) => s + (c.rewardsPoints || 0), 0);
  const bookings = user.travelBookings || [];

  const handleRedeem = async (payload: Parameters<typeof redeemPoints>[0], okText: string) => {
    setBusy(true);
    try {
      const updated = await redeemPoints(payload);
      onUpdateUser(updated);
      setNotice({ kind: 'success', text: okText });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Redemption failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: LINE }}>
        <div>
          <ChaseTravelLogo className="h-[28px] w-auto mb-1.5" />
          <p className="text-[13px]" style={{ color: MUT }}>
            Book flights, hotels and curated stays with Ultimate Rewards® points or transfer 1:1 to partners.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] uppercase tracking-wider font-semibold" style={{ color: FAINT }}>
            Total Ultimate Rewards®
          </p>
          <p className="text-[26px] font-light leading-tight" style={{ color: INK }}>
            {totalPts.toLocaleString()} <span className="text-[13px]" style={{ color: MUT }}>pts</span>
          </p>
        </div>
      </div>

      {cards.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] font-semibold" style={{ color: MUT }}>Redeeming from:</span>
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCardId(c.id)}
              className={`inline-flex items-center gap-2.5 px-3 py-2 rounded-[5px] border cursor-pointer ${
                c.id === activeCard?.id ? 'bg-[#F2F6FB]' : 'bg-white'
              }`}
              style={{ borderColor: c.id === activeCard?.id ? BLUE : LINE }}
            >
              <span className="w-[42px] shrink-0">
                <ChaseCardImage product={cardProductFor(c.name, c.type)} className="rounded-[2px]" />
              </span>
              <span className="text-left">
                <span className="block text-[12.5px] font-semibold" style={{ color: INK }}>{c.name}</span>
                <span className="block text-[11.5px]" style={{ color: BLUE }}>{(c.rewardsPoints || 0).toLocaleString()} pts</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4"><InlineNotice msg={notice} /></div>

      {/* Featured Chase Travel trips */}
      <h2 className="mt-6 text-[16px] font-semibold mb-3" style={{ color: INK }}>Book with Chase Travel℠</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TRAVEL_DEALS.map((deal) => (
          <Panel key={deal.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <BrandLogo brand={deal.brand} alt={deal.provider} />
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: MUT }}>{deal.provider}</p>
                  <p className="text-[11.5px]" style={{ color: FAINT }}>{deal.dates}</p>
                </div>
              </div>
              <p className="mt-3 text-[15px] font-semibold" style={{ color: INK }}>{deal.title}</p>
              <p className="mt-1 text-[12.5px]" style={{ color: MUT }}>{deal.subtitle}</p>
            </div>
            <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: LINE }}>
              <div>
                <p className="text-[17px] font-semibold" style={{ color: INK }}>{deal.points.toLocaleString()} pts</p>
                <p className="text-[11px]" style={{ color: '#138842' }}>Est. value ${deal.cashValue} (1.25¢/pt)</p>
              </div>
              <Solid
                disabled={busy || !activeCard}
                onClick={() =>
                  activeCard &&
                  handleRedeem(
                    {
                      cardId: activeCard.id,
                      points: deal.points,
                      kind: 'travel',
                      title: deal.title,
                      provider: deal.provider,
                      brand: deal.brand,
                      dates: deal.dates,
                    },
                    `Booked ${deal.title} using ${deal.points.toLocaleString()} Ultimate Rewards® points.`
                  )
                }
              >
                Book trip
              </Solid>
            </div>
          </Panel>
        ))}
      </div>

      {/* Transfer 1:1 + Cash Back + My Trips */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-4 p-5">
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Transfer points 1:1</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: MUT }}>
            1,000 Ultimate Rewards® points = 1,000 airline miles.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(
              [
                { id: 'united', name: 'United MileagePlus' },
                { id: 'southwest', name: 'Southwest Rapid Rewards' },
              ] as const
            ).map((partner) => (
              <button
                key={partner.id}
                type="button"
                onClick={() => setTransferPartner(partner.id)}
                className={`p-3 rounded-[5px] border flex flex-col items-center gap-2 text-center cursor-pointer ${
                  transferPartner === partner.id ? 'bg-[#F2F6FB]' : 'bg-white'
                }`}
                style={{ borderColor: transferPartner === partner.id ? BLUE : LINE }}
              >
                <BrandLogo brand={partner.id} alt={partner.name} size="sm" />
                <span className="text-[11.5px] font-semibold" style={{ color: INK }}>{partner.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>Points (increments of 1,000)</label>
            <input className={inputCls} inputMode="numeric" value={transferPts} onChange={(e) => setTransferPts(e.target.value)} />
          </div>
          <div className="mt-3">
            <Solid
              disabled={busy || !activeCard}
              onClick={() => {
                const pts = parseInt(transferPts, 10) || 0;
                if (!activeCard) return;
                handleRedeem(
                  {
                    cardId: activeCard.id,
                    points: pts,
                    kind: 'transfer',
                    title: `1:1 Transfer to ${transferPartner === 'united' ? 'United MileagePlus®' : 'Southwest Rapid Rewards®'}`,
                    provider: transferPartner === 'united' ? 'United Airlines' : 'Southwest Airlines',
                    brand: transferPartner,
                    dates: 'Instant transfer',
                  },
                  `Transferred ${pts.toLocaleString()} points 1:1 to ${transferPartner === 'united' ? 'United MileagePlus®' : 'Southwest Rapid Rewards®'}.`
                );
              }}
            >
              Transfer points
            </Solid>
          </div>
        </Panel>

        <Panel className="lg:col-span-4 p-5">
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Redeem for Cash Back</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: MUT }}>
            Apply a statement credit directly toward your card balance at 1¢ per point.
          </p>
          <div className="mt-4">
            <label className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>Points to redeem</label>
            <input className={inputCls} type="number" min="1000" step="1000" max={activeCard?.rewardsPoints || 0} inputMode="numeric" value={cashPts} onChange={(e) => setCashPts(e.target.value)} />
            <p className="mt-1 text-[11.5px]" style={{ color: MUT }}>Available on this card: {(activeCard?.rewardsPoints || 0).toLocaleString()} points. Redemptions post as a statement credit.</p>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[#138842]">
              Statement credit value: {fmtMoney((parseInt(cashPts, 10) || 0) / 100)}
            </p>
          </div>
          <div className="mt-4">
            <Outline
              disabled={busy || !activeCard || !Number.isInteger(Number(cashPts)) || Number(cashPts) < 1000 || Number(cashPts) > (activeCard?.rewardsPoints || 0)}
              onClick={() => {
                const pts = parseInt(cashPts, 10) || 0;
                if (!activeCard) return;
                handleRedeem(
                  { cardId: activeCard.id, points: pts, kind: 'cashback' },
                  `Redeemed ${pts.toLocaleString()} points for a ${fmtMoney(pts / 100)} statement credit.`
                );
              }}
            >
              Apply statement credit
            </Outline>
          </div>
        </Panel>

        <Panel className="lg:col-span-4 p-5">
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Your trips &amp; transfers</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-[13px]" style={{ color: MUT }}>No recent bookings yet.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border rounded-[5px] p-2.5" style={{ borderColor: LINE }}>
                  <BrandLogo brand={b.brand} alt={b.provider} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold truncate" style={{ color: INK }}>{b.title}</p>
                    <p className="text-[11px]" style={{ color: MUT }}>{b.dates} · {b.pointsUsed.toLocaleString()} pts</p>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#EAF7EE] text-[#138842] shrink-0">
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};

/* ============================ 3. SPENDING & BUDGETING ============================ */
export const SpendingView: React.FC<{ user: User; onUpdateUser: (user: User) => void }> = ({ user, onUpdateUser }) => {
  const [budgets, setBudgets] = useState<Record<string, number>>(user.budgets || defaultBudgets());
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null);
  useEffect(() => setBudgets(user.budgets || defaultBudgets()), [user.budgets]);
  const persistBudgets = async () => {
    try {
      onUpdateUser(await saveBudgets(budgets));
      setBudgetNotice('Monthly budgets saved.');
    } catch (error) {
      setBudgetNotice(error instanceof Error ? error.message : 'Could not save budgets.');
    }
  };

  // Aggregate current-month outgoing spending from all accounts
  const now = new Date();
  const totals: Record<string, number> = {};
  for (const acct of user.accounts) {
    for (const t of acct.transactions) {
      const date = new Date(t.date);
      if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) continue;
      const isExpense = acct.type === 'credit-card' ? t.amount > 0 : t.amount < 0;
      if (!isExpense) continue;
      if (['Transfer', 'Payment', 'Cash', 'Fee', 'Wire'].includes(t.category)) continue;
      totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
    }
  }

  const categories = Object.keys(budgets);
  const totalSpent = categories.reduce((s, c) => s + (totals[c] || 0), 0);
  const totalBudget = categories.reduce((s, c) => s + budgets[c], 0);

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b" style={{ borderColor: LINE }}>
        <div>
          <H1>Spending &amp; Budgeting</H1>
          <p className="mt-1 text-[13px]" style={{ color: MUT }}>
            Track spending across your Chase checking accounts and credit cards automatically.
          </p>
        </div>
        <ChaseIcon name="piggy" size={32} />
      </div>

      {budgetNotice && <p role="status" className="mt-3 text-[12.5px]" style={{ color: MUT }}>{budgetNotice}</p>}
      <Panel className="mt-5 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Total tracked spending</DottedLabel></p>
            <p className="mt-1 text-[28px] font-light" style={{ color: INK }}>{fmtMoney(totalSpent)}</p>
          </div>
          <div>
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Monthly budget target</DottedLabel></p>
            <p className="mt-1 text-[28px] font-light" style={{ color: INK }}>{fmtMoney(totalBudget)}</p>
          </div>
          <div>
            <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>Remaining this month</DottedLabel></p>
            <p className={`mt-1 text-[28px] font-light ${totalBudget - totalSpent >= 0 ? 'text-[#138842]' : 'text-[#B42318]'}`}>
              {fmtMoney(totalBudget - totalSpent)}
            </p>
          </div>
        </div>
      </Panel>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const spent = totals[cat] || 0;
          const limit = budgets[cat];
          const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const over = spent > limit;
          return (
            <Panel key={cat} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14.5px] font-semibold" style={{ color: INK }}>{cat}</p>
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-semibold" style={{ color: over ? '#B42318' : INK }}>{fmtMoney(spent)}</span>
                  <span style={{ color: FAINT }}>of</span>
                  <input
                    aria-label={`${cat} monthly budget`}
                    type="number"
                    min={20}
                    step={25}
                    value={limit}
                    onChange={(e) =>
                      setBudgets((prev) => ({ ...prev, [cat]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    onBlur={persistBudgets}
                    className="w-[78px] h-7 px-2 border rounded-[3px] text-[12.5px] text-right"
                    style={{ borderColor: '#B7BEC6' }}
                  />
                </div>
              </div>
              <div className="mt-2.5 h-2 rounded-full bg-[#E9E9E9] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: over ? '#B42318' : pct > 80 ? '#D97706' : BLUE,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: over ? '#B42318' : MUT }}>
                {over ? `Over budget by ${fmtMoney(spent - limit)}` : `${fmtMoney(limit - spent)} left · ${pct}% used`}
              </p>
            </Panel>
          );
        })}
      </div>
    </div>
  );
};

/* ============================ 4. SECURITY & PRIVACY CENTER ============================ */
export const SecurityCenterView: React.FC<{
  user: User;
  onUpdateUser: (u: User) => void;
}> = ({ user, onUpdateUser }) => {
  const sec = user.security || { twoFactor: true, loginAlerts: true, fraudAlerts: true, paperless: true };
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const toggleSec = async (key: keyof typeof sec) => {
    try {
      const updated = await updateSecuritySettings({ [key]: !sec[key] });
      onUpdateUser(updated);
      setNotice({ kind: 'success', text: 'Security preference saved.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Update failed.' });
    }
  };

  const toggleLock = async (accountId: string, currentlyLocked: boolean) => {
    try {
      const updated = await updateCardControls(accountId, { locked: !currentlyLocked });
      onUpdateUser(updated);
      setNotice({
        kind: 'success',
        text: !currentlyLocked
          ? 'Card locked. New purchases and ATM withdrawals are blocked until you unlock it.'
          : 'Card unlocked and ready for use.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Update failed.' });
    }
  };

  const lockable = user.accounts.filter((a) => a.type === 'checking' || a.type === 'credit-card');

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: LINE }}>
        <div>
          <H1>Chase Security Center</H1>
          <p className="mt-1 text-[13px]" style={{ color: MUT }}>
            24/7 fraud monitoring, card lock controls, and sign-in protection.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-[#EAF7EE] text-[#138842]">
          <ShieldCheck className="w-4 h-4" /> Account protection active
        </span>
      </div>

      <div className="mt-4"><InlineNotice msg={notice} /></div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lock/Unlock cards with real Chase card artwork */}
        <div className="lg:col-span-7">
          <Panel className="p-5">
            <h2 className="text-[15px] font-semibold mb-1" style={{ color: INK }}>Lock &amp; unlock your cards</h2>
            <p className="text-[12.5px] mb-4" style={{ color: MUT }}>
              Misplaced a debit or credit card? Lock it instantly. Recurring bills continue undisturbed.
            </p>
            <div className="space-y-3">
              {lockable.map((acct) => (
                <div key={acct.id} className="flex items-center gap-4 border rounded-[6px] p-3.5" style={{ borderColor: LINE }}>
                  <span className="w-[74px] shrink-0">
                    <ChaseCardImage
                      product={cardProductFor(acct.name, acct.type)}
                      className={`rounded-[4px] ${acct.locked ? 'grayscale opacity-65' : ''}`}
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate" style={{ color: INK }}>{acct.name}</p>
                    <p className="text-[12px]" style={{ color: MUT }}>
                      Card ending in {acct.mask} ·{' '}
                      <strong className={acct.locked ? 'text-[#B42318]' : 'text-[#138842]'}>
                        {acct.locked ? 'Locked' : 'Active'}
                      </strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLock(acct.id, !!acct.locked)}
                    className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-[4px] border cursor-pointer ${
                      acct.locked ? 'text-white' : 'bg-white hover:bg-[#F2F6FB]'
                    }`}
                    style={
                      acct.locked
                        ? { backgroundColor: BLUE, borderColor: BLUE }
                        : { borderColor: BLUE, color: BLUE }
                    }
                  >
                    {acct.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {acct.locked ? 'Unlock' : 'Lock card'}
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Security Toggles */}
        <div className="lg:col-span-5 space-y-4">
          <Panel className="p-5">
            <h2 className="text-[15px] font-semibold mb-3" style={{ color: INK }}>Sign-in &amp; alert protections</h2>
            <div className="divide-y" style={{ borderColor: LINE }}>
              {(
                [
                  { k: 'twoFactor', label: '2-Step Verification', desc: 'Require a one-time code on unrecognized devices' },
                  { k: 'loginAlerts', label: 'Sign-in notifications', desc: 'Alert by email & push when a new device signs in' },
                  { k: 'fraudAlerts', label: 'Real-time fraud monitoring', desc: '24/7 unusual activity checks & text verification' },
                  { k: 'paperless', label: 'Paperless statements', desc: 'Protect mailed documents by receiving statements online' },
                ] as const
              ).map((item) => (
                <div key={item.k} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{item.label}</p>
                    <p className="text-[11.5px]" style={{ color: MUT }}>{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sec[item.k]}
                    onClick={() => toggleSec(item.k)}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      sec[item.k] ? 'bg-[#138842]' : 'bg-[#C9CDD1]'
                    }`}
                  >
                    <span
                      className={`block w-4.5 h-4.5 rounded-full bg-white shadow absolute top-[3px] transition-all ${
                        sec[item.k] ? 'left-[23px]' : 'left-[3px]'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[14.5px] font-semibold mb-2" style={{ color: INK }}>Recognized devices</h2>
            <ul className="text-[12.5px] space-y-2" style={{ color: MUT }}>
              <li className="flex justify-between"><span>This browser · Current session</span><strong className="text-[#138842]">Trusted</strong></li>
              <li className="flex justify-between"><span>Chase Mobile® on iPhone</span><span>Last active today</span></li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
};

/* ============================ 5. ATM & BRANCH LOCATOR ============================ */
export const LocationsView: React.FC<{ onSchedule: () => void }> = ({ onSchedule }) => {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'All' | 'Branch' | 'ATM'>('All');

  const results = LOCATIONS.filter((l) => {
    const matchesType = type === 'All' || l.type === type;
    const needle = q.trim().toLowerCase();
    const matchesQ =
      !needle ||
      l.name.toLowerCase().includes(needle) ||
      l.address.toLowerCase().includes(needle) ||
      l.features.some((f) => f.toLowerCase().includes(needle));
    return matchesType && matchesQ;
  });

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>Find an ATM or branch</H1>
          <p className="mt-1 text-[13px]" style={{ color: MUT }}>
            More than 14,000 Chase ATMs and 5,000 branches nationwide.
          </p>
        </div>
        <button type="button" onClick={onSchedule} className="inline-flex items-center gap-2 text-[13px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
          <CalendarDays className="w-4 h-4" /> Schedule a meeting
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-7 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Enter an address, ZIP or landmark"
            className="w-full h-11 pl-9 pr-3 border rounded-[4px] text-[14px] bg-white focus:border-[#1A4488] outline-none"
            style={{ borderColor: '#B7BEC6' }}
          />
        </div>
        <div className="md:col-span-3 flex gap-2">
          {(['All', 'Branch', 'ATM'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 h-11 text-[13px] font-semibold rounded-[4px] border cursor-pointer ${
                type === t ? 'text-white' : 'bg-white hover:bg-[#F7FAFD]'
              }`}
              style={type === t ? { backgroundColor: BLUE, borderColor: BLUE } : { borderColor: '#B7BEC6', color: INK }}
            >
              {t === 'ATM' ? 'ATMs' : t}
            </button>
          ))}
        </div>
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={() => setQ('New York, NY')}
            className="w-full h-11 inline-flex items-center justify-center gap-2 text-[13px] font-semibold rounded-[4px] border bg-white hover:bg-[#F7FAFD] cursor-pointer"
            style={{ borderColor: BLUE, color: BLUE }}
          >
            <MapPin className="w-4 h-4" /> Near me
          </button>
        </div>
      </div>

      <p className="mt-4 text-[12.5px]" style={{ color: MUT }}>
        Showing {results.length} of {LOCATIONS.length} locations near New York, NY
      </p>

      <div className="mt-3 space-y-3">
        {results.map((loc: ChaseLocation) => (
          <Panel key={loc.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[#EEF3F8]">
                  <ChaseIcon name={loc.type === 'Branch' ? 'house' : 'creditCards'} size={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-semibold" style={{ color: BLUE }}>{loc.name}</p>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full bg-[#EAF2FA]" style={{ color: BLUE }}>
                      {loc.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px]" style={{ color: INK }}>{loc.address}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: MUT }}>
                    <Clock className="w-3.5 h-3.5" /> {loc.hours}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {loc.features.map((f) => (
                      <span key={f} className="text-[11.5px] px-2.5 py-1 rounded-full border" style={{ borderColor: LINE, color: MUT }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: BLUE }}>
                  <MapPin className="w-4 h-4" /> {loc.distance}
                </span>
                {loc.type === 'Branch' && (
                  <Outline size="sm" onClick={onSchedule}>Schedule a meeting</Outline>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
};

/* ================================ 6. CHASE MYHOME ================================ */
export const MyHomeView: React.FC<{
  user: User;
  onUpdateUser: (u: User) => void;
  onPayLoan: () => void;
  onOpenAccount: () => void;
}> = ({ user, onPayLoan, onOpenAccount }) => {
  const mortgage = user.accounts.find((a) => a.type === 'mortgage') || null;
  const home = user.home || defaultHome();
  const loanBalance = mortgage?.balance ?? 0;
  const equity = Math.max(0, home.estimatedValue - loanBalance);
  const equityPct = home.estimatedValue > 0 ? Math.round((equity / home.estimatedValue) * 100) : 0;
  const totalPayment = round2(mortgage?.monthlyPayment ?? 0);
  const principalInterest = round2(Math.max(0, totalPayment - home.monthlyEscrow));
  const dueDate = fmtDueDate(nextDueDate(home.dueDay));
  const trend = [3.2, 3.6, 3.9, 4.4, 4.1, 4.8, 5.2, 5.6, 5.9, 6.3, 6.6, 7.0];

  const tile = (label: string, value: React.ReactNode, hint: string) => (
    <div className="px-4 sm:px-5 py-4">
      <p className="text-[12px]" style={{ color: MUT }}><DottedLabel>{label}</DottedLabel></p>
      <p className="mt-1.5 text-[24px] leading-none font-light" style={{ color: INK }}>{value}</p>
      <p className="mt-1.5 text-[11.5px]" style={{ color: FAINT }}>{hint}</p>
    </div>
  );

  if (!mortgage) {
    return (
      <div className="max-w-[900px] mx-auto px-4 sm:px-8 py-6">
        <H1>Chase MyHome®</H1>
        <div className="mt-5 border rounded-[6px] bg-white p-8 text-center" style={{ borderColor: LINE }}>
          <span className="mx-auto w-12 h-12 rounded-full bg-[#EEF3F8] flex items-center justify-center">
            <ChaseIcon name="house" size={26} />
          </span>
          <p className="mt-3 text-[16px] font-semibold" style={{ color: INK }}>No mortgage on this profile</p>
          <p className="mt-1 text-[13px]" style={{ color: MUT }}>
            MyHome tracks your home value, equity and mortgage payments. Explore Chase Home Lending to see current rates.
          </p>
          <div className="mt-4">
            <Outline onClick={onOpenAccount}>Explore home lending</Outline>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <H1>Chase MyHome®</H1>
      <p className="mt-1 text-[13px]" style={{ color: MUT }}>
        Your home value, mortgage balance, equity and payment details in one place.
      </p>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8">
          <Panel className="overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: LINE }}>
              <span className="w-11 h-11 rounded-full flex items-center justify-center bg-[#EEF3F8]">
                <ChaseIcon name="house" size={24} />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold truncate" style={{ color: INK }}>{home.address}</p>
                <p className="text-[12px]" style={{ color: MUT }}>
                  {mortgage.name} (…{mortgage.mask}) · {mortgage.apr}% APR
                </p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#EAF7EE] text-[#138842]">
                <TrendingUp className="w-3.5 h-3.5" /> +{home.appreciationPct}% this year
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0" style={{ borderColor: LINE }}>
              {tile('Estimated home value', fmtMoney(home.estimatedValue), 'Based on comparable sales')}
              {tile('Loan balance', fmtMoney(loanBalance), 'Principal remaining')}
              {tile('Home equity', fmtMoney(equity), `${equityPct}% of your home’s value`)}
              {tile('Next payment', fmtMoney(totalPayment), `Due ${dueDate} · incl. escrow`)}
            </div>

            <div className="px-5 py-4 border-t" style={{ borderColor: LINE }}>
              <div className="flex items-center justify-between text-[12px]" style={{ color: MUT }}>
                <span>Home equity</span>
                <span>{equityPct}%</span>
              </div>
              <div className="mt-2 h-2.5 rounded-full overflow-hidden bg-[#E9E9E9]">
                <div className="h-full rounded-full bg-[#138842] transition-all" style={{ width: `${equityPct}%` }} />
              </div>
            </div>
          </Panel>

          <Panel className="mt-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Home value trend (12 months)</h2>
              <span className="text-[12px] font-semibold text-[#138842]">+{home.appreciationPct}% YoY</span>
            </div>
            <div className="mt-4 h-[140px] flex items-end gap-2">
              {trend.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[3px] transition-all hover:opacity-80"
                  style={{ height: `${h * 14}%`, backgroundColor: i === trend.length - 1 ? BLUE : '#C9D8EA' }}
                />
              ))}
            </div>
          </Panel>

          <Panel className="mt-5 overflow-hidden">
            <h2 className="px-5 pt-4 text-[15px] font-semibold" style={{ color: INK }}>Mortgage activity</h2>
            <ul className="px-5 pb-2 mt-1">
              {mortgage.transactions.slice(0, 5).map((t, i) => (
                <li key={t.id} className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#EFF0F1' }}>
                  <span className="w-[80px] shrink-0 text-[12px]" style={{ color: MUT }}>
                    {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="flex-1 min-w-0 text-[13.5px] truncate" style={{ color: INK }}>{t.description}</span>
                  <span className={`text-[13.5px] font-medium shrink-0 ${t.amount < 0 ? '' : 'text-[#138842]'}`}>
                    {t.amount < 0 ? `-${fmtMoney(Math.abs(t.amount))}` : fmtMoney(t.amount)}
                  </span>
                </li>
              ))}
              {mortgage.transactions.length === 0 && (
                <li className="py-6 text-center text-[13px]" style={{ color: MUT }}>No mortgage activity yet.</li>
              )}
            </ul>
          </Panel>
        </div>

        <aside className="lg:col-span-4 space-y-5">
          <Panel className="p-5">
            <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Payment breakdown</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              <Row k="Principal & interest" v={fmtMoney(principalInterest)} />
              <Row k="Escrow (taxes & insurance)" v={fmtMoney(home.monthlyEscrow)} />
              <Row k="Total monthly payment" v={fmtMoney(totalPayment)} bold />
              <Row k="Due date" v={dueDate} />
              <Row k="Remaining balance" v={fmtMoney(loanBalance)} />
            </dl>
            <div className="mt-4">
              <button
                type="button"
                onClick={onPayLoan}
                className="w-full inline-flex items-center justify-center gap-2 text-white text-[14px] font-semibold py-2.5 rounded-[4px] cursor-pointer"
                style={{ backgroundColor: BLUE }}
              >
                Pay mortgage
              </button>
            </div>
          </Panel>

          <Panel className="p-5" style={{ background: '#F7FAFD', borderColor: '#CFE0F0' }}>
            <p className="text-[13px] font-semibold" style={{ color: INK }}>Chase Home Lending Advisors</p>
            <p className="mt-1 text-[12px]" style={{ color: MUT }}>Questions about refinancing or HELOC options?</p>
            <p className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: BLUE }}>
              <Phone className="w-4 h-4" /> 1-800-848-9116
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
};

/* ============================== 7. PRIVATE CLIENT ============================== */
export const AdvisorsView: React.FC<{ user: User; onSchedule: () => void }> = ({ onSchedule }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: LINE }}>
        <div>
          <PrivateClientLogo className="h-[22px] w-auto mb-2" />
          <p className="text-[13px]" style={{ color: MUT }}>
            Dedicated Chase Private Client Bankers &amp; J.P. Morgan Private Client Advisors.
          </p>
        </div>
        <JpmwmLogo className="h-[20px] w-auto opacity-85" />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-4">
          {ADVISORS.map((a) => {
            const isOpen = selected === a.id;
            return (
              <Panel key={a.id} className="p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span
                    className="w-13 h-13 rounded-full flex items-center justify-center text-[17px] font-semibold text-white shrink-0"
                    style={{ background: NAVY }}
                  >
                    {a.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-semibold" style={{ color: INK }}>{a.name}</p>
                    <p className="text-[13px] font-medium" style={{ color: BLUE }}>{a.title}</p>
                    <p className="mt-1 text-[12.5px]" style={{ color: MUT }}>{a.focus}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: MUT }}>
                      <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {a.location}</span>
                      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {a.years} years experience</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Next available {a.available}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {booked === a.id ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 text-[#138842]">
                        <CheckCircle2 className="w-4 h-4" /> Meeting requested
                      </span>
                    ) : (
                      <>
                        <Solid onClick={() => setBooked(a.id)}>Request meeting</Solid>
                        <Outline size="sm" onClick={() => setSelected(isOpen ? null : a.id)}>
                          {isOpen ? 'Hide profile' : 'View profile'}
                        </Outline>
                      </>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: BLUE }}>
                      <Phone className="w-3.5 h-3.5" /> {a.phone}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ borderColor: LINE }}>
                    {[
                      { t: 'About', d: `${a.name.split(' ')[0]} works with Chase Private Client members on ${a.focus.toLowerCase()}.` },
                      { t: 'Credentials', d: 'Series 7 & 66, CFP® — J.P. Morgan Wealth Management / Chase Private Client.' },
                      { t: 'First review', d: `Book a 30-minute consultation at ${a.location} or by phone.` },
                    ].map((c) => (
                      <div key={c.t}>
                        <p className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: FAINT }}>{c.t}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: MUT }}>{c.d}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <aside className="lg:col-span-4 space-y-5">
          <Panel className="p-5">
            <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Chase Private Client benefits</h2>
            <ul className="mt-3 space-y-2.5 text-[12.5px]" style={{ color: MUT }}>
              {[
                'Dedicated Chase Private Client Banker',
                'J.P. Morgan Private Client Advisor access',
                'No fees on everyday banking & worldwide ATMs',
                'Relationship mortgage & auto rate discounts',
                'Complimentary incoming and outgoing wire transfers',
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#138842]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4"><Outline onClick={onSchedule}>Schedule a meeting</Outline></div>
          </Panel>
        </aside>
      </div>
    </div>
  );
};

/* ================================= 8. INK BUSINESS CARDS ================================= */
export const InkView: React.FC<{ onApplyProduct: (productId: ProductId) => void }> = ({
  onApplyProduct,
}) => (
  <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: LINE }}>
      <div>
        <ChaseBusinessLogo className="h-[34px] w-auto mb-1.5" />
        <p className="text-[13px]" style={{ color: MUT }}>
          Chase Ink® business credit cards built for every stage of growth.
        </p>
      </div>
      <Outline onClick={() => onApplyProduct('business-checking')}>Open Business Complete Banking®</Outline>
    </div>

    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      {INK_CARDS.map((card) => (
        <Panel key={card.id} className="overflow-hidden flex flex-col">
          {/* Genuine Chase Ink Card Artwork */}
          <div className="bg-[#F4F6F9] px-6 py-6 flex items-center justify-center border-b" style={{ borderColor: LINE }}>
            <div className="w-[220px]">
              <ChaseCardImage product={card.cardProduct} className="rounded-[8px] shadow-[0_8px_22px_rgba(0,22,60,0.22)]" />
            </div>
          </div>
          <div className="p-5 flex-1 flex flex-col">
            <p className="text-[17px] font-semibold leading-snug" style={{ color: INK }}>{card.name}</p>
            <p className="mt-1.5 text-[13px]" style={{ color: MUT }}>{card.tagline}</p>
            <div className="mt-3 inline-flex self-start items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#EAF7EE] text-[#138842]">
              <ArrowUpRight className="w-3.5 h-3.5" /> {card.bonus}
            </div>
            <ul className="mt-4 space-y-2 text-[12.5px]" style={{ color: INK }}>
              {card.earn.map((e) => (
                <li key={e} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#138842]" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 pt-4 border-t space-y-1.5 text-[12px]" style={{ borderColor: LINE }}>
              <Row k="APR" v={card.apr} />
              <Row k="Example credit line" v={fmtMoney(card.creditLimit)} />
              <Row k="Employee cards" v="At no additional cost" />
            </dl>
            <div className="mt-5 pt-1">
              <Solid onClick={() => onApplyProduct(card.id)}>Apply now</Solid>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  </div>
);

/* ================================ 9. CHASE OFFERS (100% REAL LOGOS + TARGETED ADMIN OFFERS) ================================ */
export const OffersView: React.FC<{ user?: User; onUpdateUser?: (user: User) => void }> = ({ user, onUpdateUser }) => {
  const [added, setAdded] = useState<string[]>([]);
  const toggle = (id: string) =>
    setAdded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const customOffers = user?.customOffers || [];
  const totalAdded = added.length + customOffers.filter((c) => c.activated).length;
  const totalCount = OFFERS.length + customOffers.length;

  const handleToggleCustom = async (offerId: string) => {
    try {
      const next = await toggleCustomOffer(offerId);
      if (onUpdateUser) onUpdateUser(next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>Chase Offers</H1>
          <p className="mt-1 text-[13px]" style={{ color: MUT }}>
            Add deals to your eligible Chase cards, shop and get cash back automatically.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: MUT }}>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A4488] text-white">{totalAdded}</span>
          of {totalCount} added
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {customOffers.map((co) => {
          const isAdded = Boolean(co.activated);
          return (
            <Panel key={co.id} className="overflow-hidden flex flex-col ring-1 ring-[#117ACA]/30">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-[#F0F7FD]" style={{ borderColor: LINE }}>
                <div className="min-w-0">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#0B5FA5]">
                    Targeted for you
                  </span>
                  <p className="text-[14px] font-semibold truncate" style={{ color: INK }}>{co.merchant}</p>
                </div>
                <span className="text-[11px] shrink-0" style={{ color: FAINT }}>Exp {co.expires}</span>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-[18px] font-semibold leading-tight" style={{ color: INK }}>{co.cashback}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed flex-1" style={{ color: MUT }}>{co.detail}</p>
                <button
                  type="button"
                  onClick={() => handleToggleCustom(co.id)}
                  className={`mt-4 inline-flex items-center justify-center gap-1.5 border text-[13px] font-semibold py-2 rounded-[4px] cursor-pointer ${
                    isAdded ? 'text-white' : 'bg-white hover:bg-[#F2F6FB]'
                  }`}
                  style={isAdded ? { backgroundColor: BLUE, borderColor: BLUE } : { borderColor: BLUE, color: BLUE }}
                >
                  {isAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isAdded ? 'Added to card' : 'Add to card'}
                </button>
              </div>
            </Panel>
          );
        })}
        {OFFERS.map((o: ChaseOffer) => {
          const isAdded = added.includes(o.id);
          return (
            <Panel key={o.id} className="overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: LINE }}>
                <BrandLogo brand={o.brand} alt={o.merchant} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold truncate" style={{ color: INK }}>{o.merchant}</p>
                  <p className="text-[11px]" style={{ color: FAINT }}>{o.spendMax}</p>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-[18px] font-semibold leading-tight" style={{ color: INK }}>{o.value}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed flex-1" style={{ color: MUT }}>{o.note}</p>
                <button
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`mt-4 inline-flex items-center justify-center gap-1.5 border text-[13px] font-semibold py-2 rounded-[4px] cursor-pointer ${
                    isAdded ? 'text-white' : 'bg-white hover:bg-[#F2F6FB]'
                  }`}
                  style={isAdded ? { backgroundColor: BLUE, borderColor: BLUE } : { borderColor: BLUE, color: BLUE }}
                >
                  {isAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isAdded ? 'Added to card' : 'Add to card'}
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
};

/* ================================ 10. SECURE MESSAGE CENTER ================================ */
export const SecureMessagesView: React.FC<{ user: User; onUpdateUser: (user: User) => void }> = ({
  user,
  onUpdateUser,
}) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SecureMessageCategory>('general');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [messages, setMessages] = useState<SecureMessage[]>(user.messages || []);
  const [supportContact, setSupportContact] = useState<{ email: string; phone: string } | null>(null);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const inbox = await fetchSupportInbox();
        if (active) { setMessages(inbox.messages); setSupportContact(inbox.supportContact); setRefreshError(false); }
      } catch { if (active) setRefreshError(true); }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user.id]);

  useEffect(() => {
    if (messages.some((m) => m.sender === 'advisor' && !m.readByCustomer)) {
      markSecureMessagesRead()
        .then((u) => { setMessages(u.messages || []); onUpdateUser(u); })
        .catch(() => undefined);
    }
  }, [messages]);

  const submitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      const updated = await sendSecureMessage(
        subject.trim() || 'Client Operations Inquiry',
        category,
        body.trim()
      );
      onUpdateUser(updated);
      setMessages(updated.messages || []);
      setSubject('');
      setBody('');
      setNotice('Your message has been sent to Support.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to send secure message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <H1>Secure Message Center</H1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full bg-[#EAF3FB] text-[#0B5FA5]">
          <ShieldCheck className="w-4 h-4" /> 256-bit TLS · Authenticated Session
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <Panel className="p-5">
            <h2 className="text-[16px] font-bold" style={{ color: INK }}>
              Send a new inquiry
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: MUT }}>
              Messages are delivered securely to Support within a few seconds.
            </p>
            {supportContact && (supportContact.email || supportContact.phone) && <div className="mt-3 text-sm"><strong>Support contact:</strong>{supportContact.email && <p>Email: <a className="underline" href={`mailto:${supportContact.email}`}>{supportContact.email}</a></p>}{supportContact.phone && <p>Phone: <a className="underline" href={`tel:${supportContact.phone.replace(/[^+0-9]/g, '')}`}>{supportContact.phone}</a></p>}</div>}
            {refreshError && <p role="status" className="mt-3 text-sm text-red-700">Unable to refresh messages. Retrying.</p>}
            <form onSubmit={submitMessage} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: INK }}>
                  Topic
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SecureMessageCategory)}
                  className="w-full rounded-[4px] border px-3 py-2 text-[13px] bg-white"
                  style={{ borderColor: LINE, color: INK }}
                >
                  <option value="general">General account inquiry</option>
                  <option value="wire">Wire transfer & limits</option>
                  <option value="dispute">Card billing dispute</option>
                  <option value="security">Security & fraud protection</option>
                  <option value="account">Statements & tax documents</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: INK }}>
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Domestic wire limit increase request"
                  className="w-full rounded-[4px] border px-3 py-2 text-[13px]"
                  style={{ borderColor: LINE, color: INK }}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: INK }}>
                  Message
                </label>
                <textarea
                  rows={4}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message for a Chase specialist..."
                  className="w-full rounded-[4px] border px-3 py-2 text-[13px]"
                  style={{ borderColor: LINE, color: INK }}
                />
              </div>
              {notice && (
                <div className="rounded-[4px] bg-[#EAF7EE] border border-[#B5DFC4] px-3 py-2 text-[12px] text-[#138842]">
                  {notice}
                </div>
              )}
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center justify-center rounded-[4px] px-4 py-2.5 text-[13px] font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: BLUE }}
              >
                {sending ? 'Sending...' : 'Send secure message'}
              </button>
            </form>
          </Panel>
        </div>

        <div className="lg:col-span-7">
          <Panel className="p-5">
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: LINE }}>
              <h2 className="text-[16px] font-bold" style={{ color: INK }}>
                Inbox & Advisor Correspondence ({messages.length})
              </h2>
            </div>
            {messages.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[14px] font-semibold" style={{ color: INK }}>
                  No secure messages yet
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: MUT }}>
                  Official notices from your Chase Private Client or Operations specialist will appear here.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {messages.map((m) => {
                  const isAdvisor = m.sender === 'advisor';
                  return (
                    <div
                      key={m.id}
                      className={`rounded-[6px] border p-4 ${
                        isAdvisor ? 'bg-[#F5F9FE] border-[#117ACA]/35' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              isAdvisor
                                ? 'bg-[#117ACA] text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isAdvisor ? 'Chase Specialist' : 'You'}
                          </span>
                          <span className="text-[13px] font-bold" style={{ color: INK }}>
                            {m.subject}
                          </span>
                        </div>
                        <span className="text-[11px]" style={{ color: FAINT }}>
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] whitespace-pre-line leading-relaxed" style={{ color: INK }}>
                        {m.body}
                      </p>
                      <p className="mt-2 text-[11px]" style={{ color: MUT }}>
                        From: {m.senderName} · Topic: <span className="capitalize">{m.category}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};
