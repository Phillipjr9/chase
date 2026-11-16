import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lock,
  Minus,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  CreditFactor,
  CreditSimulation,
  User,
  fmtMoney,
  markCreditAlertsRead,
  setCreditGoal,
  simulateCredit,
} from '../banking/store';
import { Spinner } from './Loading';

type Tab = 'overview' | 'factors' | 'changes' | 'report' | 'plan' | 'simulator' | 'monitoring';

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
}

const BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// VantageScore® 3.0 consumer ranges (not generic FICO® ranges).
const BANDS = [
  { label: 'Subprime', min: 300, max: 600, color: '#B42318' },
  { label: 'Near prime', min: 601, max: 660, color: '#D97706' },
  { label: 'Prime', min: 661, max: 780, color: '#138842' },
  { label: 'Superprime', min: 781, max: 850, color: '#0B6B33' },
];

const bandFor = (score: number) =>
  BANDS.find((band) => score >= band.min && score <= band.max) ?? BANDS[2];

const STATUS_STYLE: Record<CreditFactor['status'], { color: string; label: string; icon: React.ReactNode }> = {
  excellent: { color: '#0B6B33', label: 'Excellent', icon: <CheckCircle2 className="w-4 h-4" /> },
  good: { color: '#138842', label: 'Good', icon: <CheckCircle2 className="w-4 h-4" /> },
  fair: { color: '#B26A00', label: 'Fair', icon: <Minus className="w-4 h-4" /> },
  'needs-work': { color: '#B42318', label: 'Needs work', icon: <AlertCircle className="w-4 h-4" /> },
};

const SCENARIOS: { id: string; label: string; detail: string }[] = [
  { id: 'pay-down', label: 'Pay down card balances', detail: 'Reduce revolving balances by $500' },
  { id: 'higher-limit', label: 'Get a higher credit limit', detail: 'Increase a card limit by $5,000' },
  { id: 'new-card', label: 'Open a new credit card', detail: 'Adds a hard inquiry and a new account' },
  { id: 'inquiry', label: 'Apply for one new card', detail: 'A single hard credit inquiry' },
  { id: 'close-oldest', label: 'Close your oldest account', detail: 'Shortens your credit history' },
  { id: 'missed-payment', label: 'Miss a payment by 30 days', detail: 'A serious negative mark' },
];

const ScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 260 }) => {
  const band = bandFor(score);
  const clamped = Math.min(850, Math.max(300, score));
  const pct = (clamped - 300) / 550;
  const radius = 100;
  const circumference = Math.PI * radius;
  const dash = circumference * pct;
  return (
    <div style={{ width: size }} className="relative mx-auto">
      <svg viewBox="0 0 240 140" className="w-full h-auto" role="img" aria-label={`Credit score ${score}, ${band.label}`}>
        <path d="M 20 122 A 100 100 0 0 1 220 122" fill="none" stroke="#E9EDF1" strokeWidth="18" strokeLinecap="round" />
        <path
          d="M 20 122 A 100 100 0 0 1 220 122"
          fill="none"
          stroke={band.color}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
        <text x="120" y="94" textAnchor="middle" className="fill-[#131313]" style={{ fontSize: 46, fontWeight: 300 }}>
          {score}
        </text>
        <text x="120" y="116" textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: band.color, letterSpacing: '0.08em' }}>
          {band.label.toUpperCase()}
        </text>
        <text x="22" y="136" textAnchor="middle" style={{ fontSize: 9.5, fill: '#8A929A' }}>300</text>
        <text x="218" y="136" textAnchor="middle" style={{ fontSize: 9.5, fill: '#8A929A' }}>850</text>
      </svg>
    </div>
  );
};

const Sparkline: React.FC<{ points: { weeksAgo: number; score: number }[] }> = ({ points }) => {
  if (points.length < 2) return null;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores) - 6;
  const max = Math.max(...scores) + 6;
  const w = 560;
  const h = 130;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p.score - min) / (max - min)) * h;
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full h-auto" role="img" aria-label="Credit score history for the past 12 weeks">
      <defs>
        <linearGradient id="credit-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A4488" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#1A4488" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#credit-area)" />
      <path d={path} fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 4.5 : 2.5} fill={i === coords.length - 1 ? BLUE : '#9FB4CC'} />
      ))}
      <text x={last[0] - 4} y={Math.max(12, last[1] - 10)} textAnchor="end" style={{ fontSize: 11, fontWeight: 700, fill: BLUE }}>
        {points[points.length - 1].score}
      </text>
      <text x="0" y={h + 16} style={{ fontSize: 9.5, fill: '#8A929A' }}>12 weeks ago</text>
      <text x={w} y={h + 16} textAnchor="end" style={{ fontSize: 9.5, fill: '#8A929A' }}>This week</text>
    </svg>
  );
};

const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', style }) => (
  <section className={`bg-white border rounded-[6px] ${className}`} style={{ borderColor: LINE, ...style }}>
    {children}
  </section>
);

const OutlineBtn: React.FC<{ children: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({
  children,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center gap-2 border bg-white hover:bg-[#F2F6FB] text-[13.5px] font-semibold px-4 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
    style={{ borderColor: BLUE, color: BLUE }}
  >
    {children}
  </button>
);

export const CreditJourney: React.FC<Props> = ({ user, onUpdateUser }) => {
  const credit = user.credit!;
  const [tab, setTab] = useState<Tab>('overview');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [scenario, setScenario] = useState('pay-down');
  const [estimate, setEstimate] = useState<CreditSimulation | null>(null);
  const [goalDraft, setGoalDraft] = useState(String(credit.goal));

  const band = bandFor(credit.score);
  const latestChange = credit.changes[0];
  const unread = (credit.alerts || []).filter((a) => !a.read).length;
  const utilization = useMemo(() => {
    const cards = user.accounts.filter((a) => a.type === 'credit-card');
    const balance = cards.reduce((sum, card) => sum + card.balance, 0);
    const limit = cards.reduce((sum, card) => sum + (card.creditLimit || 0), 0);
    return { balance, limit, pct: limit ? Math.round((balance / limit) * 100) : 0 };
  }, [user.accounts]);

  const reportCards = credit.report.accounts;
  const openReportAccounts = reportCards.filter((a) => a.status === 'Open');
  const totalDebt = reportCards.reduce((sum, a) => sum + a.balance, 0);

  const saveGoal = async () => {
    const goal = Number(goalDraft);
    if (!Number.isFinite(goal) || goal <= credit.score) {
      setNotice({ kind: 'error', text: `Choose a goal above your current score of ${credit.score}.` });
      return;
    }
    setSavingGoal(true);
    try {
      onUpdateUser(await setCreditGoal(goal));
      setNotice({ kind: 'success', text: `Goal set to ${goal}. We'll track your progress each week.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Goal could not be saved.' });
    } finally {
      setSavingGoal(false);
    }
  };

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const result = await simulateCredit(scenario);
      onUpdateUser(result.user);
      setEstimate({
        id: 'estimate',
        scenario,
        estimatedScore: result.estimatedScore,
        low: result.low,
        high: result.high,
        note: result.note,
        createdAt: new Date().toISOString(),
      });
      setNotice(null);
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Simulation failed.' });
    } finally {
      setSimulating(false);
    }
  };

  const markRead = async () => {
    try {
      onUpdateUser(await markCreditAlertsRead());
    } catch {
      setNotice({ kind: 'error', text: 'Alerts could not be updated.' });
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'factors', label: 'Score factors' },
    { id: 'changes', label: 'What changed' },
    { id: 'report', label: 'Credit report' },
    { id: 'plan', label: 'Score plan' },
    { id: 'simulator', label: 'Score simulator' },
    { id: 'monitoring', label: 'Dark web monitoring' },
  ];

  const scoreMove = credit.history.length >= 2
    ? credit.history[credit.history.length - 1].score - credit.history[credit.history.length - 2].score
    : 0;
  const progressToGoal = Math.max(
    0,
    Math.min(100, Math.round(((credit.score - 300) / (credit.goal - 300)) * 100))
  );

  return (
    <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-light" style={{ color: INK }}>Credit Journey®</h1>
            <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: '#EAF2FA', color: BLUE }}>
              Profile
            </span>
          </div>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            {credit.model} score based on the latest {credit.bureau}® file. Checking a score does not affect it.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px]" style={{ color: FAINT }}>File updated</p>
          <p className="text-[13px] font-semibold" style={{ color: INK }}>{fmtDate(credit.report.pulledAt)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 border-b flex gap-1 overflow-x-auto" role="tablist" aria-label="Credit Journey sections" style={{ borderColor: LINE }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-[3px] cursor-pointer ${
              tab === t.id ? 'font-semibold' : 'border-transparent hover:text-[#1A4488]'
            }`}
            style={{ borderColor: tab === t.id ? BLUE : 'transparent', color: tab === t.id ? BLUE : INK }}
          >
            {t.label}
            {t.id === 'monitoring' && unread > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#B42318] text-white text-[10px] font-bold">
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-3 flex items-start gap-2 rounded-[4px] px-3 py-2 text-[13px] ${
            notice.kind === 'success'
              ? 'bg-[#EAF7EE] border border-[#B5E2C4] text-[#14532D]'
              : 'bg-[#FEF2F2] border border-[#F5C2C7] text-[#B42318]'
          }`}
        >
          {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {tab === 'overview' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-7 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>
                  {credit.model} · {credit.bureau}®
                </p>
                <h2 className="mt-0.5 text-[16px] font-semibold" style={{ color: INK }}>Your credit score</h2>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: '#EAF7EE', color: '#138842' }}>
                <ShieldCheck className="w-3.5 h-3.5" /> No impact to your credit
              </span>
            </div>

            <div className="mt-2">
              <ScoreGauge score={credit.score} />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <span className={`inline-flex items-center gap-1 text-[14px] font-semibold ${scoreMove >= 0 ? 'text-[#138842]' : 'text-[#B42318]'}`}>
                {scoreMove >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                {scoreMove >= 0 ? '+' : ''}{scoreMove} points this week
              </span>
              <span className="text-[12.5px]" style={{ color: MUTED }}>Goal {credit.goal}</span>
              <span className="text-[12.5px]" style={{ color: MUTED }}>Band: {band.label}</span>
            </div>

            <div className="mt-3 h-2 rounded-full bg-[#E9EDF1] overflow-hidden" role="progressbar" aria-valuenow={progressToGoal} aria-valuemin={0} aria-valuemax={100} aria-label="Progress toward your credit goal">
              <div className="h-full rounded-full" style={{ width: `${progressToGoal}%`, backgroundColor: band.color }} />
            </div>
            <p className="mt-1.5 text-[11.5px]" style={{ color: FAINT }}>
              {progressToGoal}% of the way from 300 to your goal of {credit.goal}
            </p>

            <div className="mt-4 border-t pt-4" style={{ borderColor: LINE }}>
              <h3 className="text-[14px] font-semibold" style={{ color: INK }}>Score history (12 weeks)</h3>
              <Sparkline points={credit.history} />
            </div>
          </Panel>

          <div className="lg:col-span-5 space-y-4">
            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: BLUE }} />
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Set a goal</h2>
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
                Pick a target score. We'll chart your progress each week.
              </p>
              <div className="mt-3 flex items-center gap-2.5">
                <label htmlFor="credit-goal" className="sr-only">Credit score goal</label>
                <input
                  id="credit-goal"
                  type="number"
                  min={credit.score + 1}
                  max={850}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-[110px] h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]"
                />
                <button
                  type="button"
                  onClick={saveGoal}
                  disabled={savingGoal}
                  className="inline-flex items-center gap-2 text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: BLUE }}
                >
                  {savingGoal && <Spinner size="sm" tone="white" />}
                  {savingGoal ? 'Saving…' : 'Save goal'}
                </button>
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold" style={{ color: INK }}>What changed</h2>
                <button type="button" onClick={() => setTab('changes')} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                  See all
                </button>
              </div>
              {latestChange ? (
                <div className="mt-2.5 flex items-start gap-2.5">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: latestChange.delta >= 0 ? '#EAF7EE' : '#FEF2F2', color: latestChange.delta >= 0 ? '#138842' : '#B42318' }}
                  >
                    {latestChange.delta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: INK }}>
                      {latestChange.delta >= 0 ? '+' : ''}{latestChange.delta} points · {fmtShortDate(latestChange.date)}
                    </p>
                    <p className="text-[12.5px] mt-0.5" style={{ color: MUTED }}>{latestChange.reason}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px]" style={{ color: MUTED }}>No score changes reported yet.</p>
              )}
            </Panel>

            <Panel className="p-5">
              <h2 className="text-[15px] font-semibold" style={{ color: INK }}>Top score factors</h2>
              <ul className="mt-3 space-y-3">
                {credit.factors.slice(0, 3).map((factor) => {
                  const style = STATUS_STYLE[factor.status];
                  return (
                    <li key={factor.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: INK }}>{factor.label}</span>
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: style.color }}>
                          {style.icon} {style.label}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[#EDF0F3] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: factor.status === 'good' || factor.status === 'excellent' ? '88%' : factor.status === 'fair' ? '58%' : '30%',
                            backgroundColor: style.color,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>{factor.detail}</p>
                    </li>
                  );
                })}
              </ul>
              <button type="button" onClick={() => setTab('factors')} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                See all six factors <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </Panel>
          </div>

          <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Open accounts', value: String(openReportAccounts.length), detail: 'From your credit report', tab: 'report' as Tab },
              { label: 'Credit utilization', value: `${utilization.pct}%`, detail: `${fmtMoney(utilization.balance)} of ${fmtMoney(utilization.limit)}`, tab: 'factors' as Tab },
              { label: 'Total debt reported', value: fmtMoney(totalDebt), detail: 'Across open accounts', tab: 'report' as Tab },
              { label: 'Simulator', value: 'Try a scenario', detail: 'Estimate a score change', tab: 'simulator' as Tab },
            ].map((card) => (
              <Panel key={card.label} className="p-4">
                <p className="text-[11.5px]" style={{ color: FAINT }}>{card.label}</p>
                <p className="mt-1 text-[20px] font-light" style={{ color: INK }}>{card.value}</p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: MUTED }}>{card.detail}</p>
                <button type="button" onClick={() => setTab(card.tab)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                  Open <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Panel>
            ))}
          </div>
        </div>
      )}

      {tab === 'factors' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-8 overflow-hidden">
            <h2 className="px-5 pt-5 text-[18px] font-semibold" style={{ color: INK }}>What's affecting your score</h2>
            <p className="px-5 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
              The six factors VantageScore® 3.0 uses, and how your {credit.bureau}® file looks today.
            </p>
            <ul className="mt-3">
              {credit.factors.map((factor, index) => {
                const style = STATUS_STYLE[factor.status];
                return (
                  <li key={factor.id} className={`px-5 py-4 ${index > 0 ? 'border-t' : ''}`} style={{ borderColor: LINE }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#EAF2FA', color: BLUE }}>
                          {factor.weight === 'Extremely influential' || factor.weight === 'Highly influential' ? <TrendingUp className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </span>
                        <div>
                          <p className="text-[14px] font-semibold" style={{ color: INK }}>{factor.label}</p>
                          <p className="text-[11.5px]" style={{ color: FAINT }}>{factor.weight}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: style.color }}>
                        {style.icon} {style.label}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px]" style={{ color: MUTED }}>{factor.detail}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <aside className="lg:col-span-4 space-y-4">
            <Panel className="p-5" style={{ background: '#F7FAFD', borderColor: '#CFE0F0' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>How factors are weighted</h2>
              <ul className="mt-2 space-y-2 text-[12.5px]" style={{ color: MUTED }}>
                <li><strong style={{ color: INK }}>Extremely influential:</strong> payment history.</li>
                <li><strong style={{ color: INK }}>Highly influential:</strong> age and type of credit, and percent of credit used.</li>
                <li><strong style={{ color: INK }}>Moderately influential:</strong> total balances and debt.</li>
                <li><strong style={{ color: INK }}>Less influential:</strong> recent credit behavior and available credit.</li>
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: FAINT }}>
                Lenders may use different scoring models, such as FICO® or scores from another bureau.
              </p>
            </Panel>
            <Panel className="p-5">
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Ask us to verify something</h2>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
                If an account, balance or inquiry looks wrong, review the credit report tab and contact the bureau to dispute it.
              </p>
              <OutlineBtn onClick={() => setTab('report')}>Review credit report</OutlineBtn>
            </Panel>
          </aside>
        </div>
      )}

      {tab === 'changes' && (
        <Panel className="mt-5 overflow-hidden">
          <h2 className="px-5 pt-5 text-[18px] font-semibold" style={{ color: INK }}>What changed your score</h2>
          <p className="px-5 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
            Chase reports the point change and the item from your {credit.bureau}® file responsible for it.
          </p>
          <ul className="mt-3">
            {credit.changes.map((change, index) => (
              <li key={change.id} className={`flex items-start gap-3 px-5 py-4 ${index > 0 ? 'border-t' : ''}`} style={{ borderColor: LINE }}>
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: change.delta >= 0 ? '#EAF7EE' : '#FEF2F2', color: change.delta >= 0 ? '#138842' : '#B42318' }}
                >
                  {change.delta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold" style={{ color: INK }}>
                    {change.delta >= 0 ? '+' : ''}{change.delta} points
                    <span className="ml-2 text-[11.5px] font-normal" style={{ color: FAINT }}>{fmtDate(change.date)}</span>
                  </p>
                  <p className="text-[12.5px] mt-0.5" style={{ color: MUTED }}>{change.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === 'report' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-8 overflow-hidden">
            <div className="px-5 pt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Your {credit.bureau}® credit report</h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>Pulled {fmtDate(credit.report.pulledAt)} · refreshes weekly</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[#EAF2FA]" style={{ color: BLUE }}>
                <Lock className="w-3.5 h-3.5" /> Secure
              </span>
            </div>

            <h3 className="px-5 mt-4 text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Accounts</h3>
            <ul className="mt-1">
              {reportCards.map((account, index) => (
                <li key={`${account.name}-${index}`} className={`px-5 py-3 ${index > 0 ? 'border-t' : ''}`} style={{ borderColor: LINE }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold truncate" style={{ color: INK }}>{account.name}</p>
                      <p className="text-[11.5px]" style={{ color: MUTED }}>
                        {account.type} · Opened {fmtDate(account.opened)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold" style={{ color: INK }}>{fmtMoney(account.balance)}</p>
                      <p className="text-[11.5px]" style={{ color: account.status === 'Open' ? '#138842' : MUTED }}>
                        {account.status}{account.limit > 0 ? ` · Limit ${fmtMoney(account.limit)}` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="px-5 mt-3 text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Credit inquiries</h3>
            <ul className="mt-1">
              {credit.report.inquiries.map((inquiry) => (
                <li key={`${inquiry.name}-${inquiry.date}`} className="flex items-center justify-between gap-2 px-5 py-2.5 border-t" style={{ borderColor: LINE }}>
                  <div>
                    <p className="text-[13px]" style={{ color: INK }}>{inquiry.name}</p>
                    <p className="text-[11.5px]" style={{ color: FAINT }}>{fmtDate(inquiry.date)}</p>
                  </div>
                  <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: inquiry.removed ? '#EAF7EE' : '#F1F4F7', color: inquiry.removed ? '#138842' : MUTED }}>
                    {inquiry.type}
                  </span>
                </li>
              ))}
            </ul>

            <div className="px-5 py-4 border-t" style={{ borderColor: LINE }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Public records</h3>
                  <p className="mt-1 text-[13px]" style={{ color: credit.report.publicRecords.length ? INK : '#138842' }}>
                    {credit.report.publicRecords.length ? credit.report.publicRecords.join(', ') : 'None reported'}
                  </p>
                </div>
                <div>
                  <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Collections</h3>
                  <p className="mt-1 text-[13px]" style={{ color: credit.report.collections.length ? INK : '#138842' }}>
                    {credit.report.collections.length ? credit.report.collections.join(', ') : 'None reported'}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <aside className="lg:col-span-4 space-y-4">
            <Panel className="p-5">
              <h2 className="text-[15px] font-semibold" style={{ color: INK }}>One bureau, one model</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                Credit Journey shows a VantageScore® 3.0 based on your {credit.bureau}® file. A lender may use a
                FICO® score or another bureau, so numbers can differ.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                For reports from all three bureaus, use AnnualCreditReport.com.
              </p>
            </Panel>
            <Panel className="p-5" style={{ background: '#F7FAFD', borderColor: '#CFE0F0' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Spotting a mistake?</h2>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
                Errors on your report can lower your score. Contact the bureau that supplied the data, and the
                company that reported it.
              </p>
            </Panel>
          </aside>
        </div>
      )}

      {tab === 'plan' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-8 p-5 sm:p-6">
            <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Your path to {credit.goal}</h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
              Personalized steps based on your score factors. Tap a step to see why it matters.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                {
                  title: 'Bring card balances below 30%',
                  detail: `You're using ${utilization.pct}% of your ${fmtMoney(utilization.limit)} limit. Paying down $500 would lower utilization and usually helps within one or two billing cycles.`,
                  status: utilization.pct > 30 ? 'Do this first' : 'On track',
                  color: utilization.pct > 30 ? '#B26A00' : '#138842',
                },
                {
                  title: 'Keep every payment on time',
                  detail: 'Payment history is the highest-impact factor. Set up automatic payments for at least the minimum on each card.',
                  status: 'On track',
                  color: '#138842',
                },
                {
                  title: 'Avoid opening several accounts at once',
                  detail: 'Each application adds a hard inquiry. Space them out; inquiries fade in about 12 months.',
                  status: 'Watch',
                  color: '#B26A00',
                },
                {
                  title: 'Let your credit history age',
                  detail: 'Keep your oldest no-fee card open and active with a small recurring charge.',
                  status: 'Good',
                  color: '#138842',
                },
              ].map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: '#EAF2FA', color: BLUE }}>
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{step.title}</p>
                      <span className="text-[10.5px] uppercase tracking-wide font-bold" style={{ color: step.color }}>{step.status}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: FAINT }}>
              This score improvement resource doesn't guarantee results. Other factors can affect your VantageScore,
              and lenders may use a different score. Educational use only.
            </p>
          </Panel>
          <aside className="lg:col-span-4 space-y-4">
            <Panel className="p-5 text-center">
              <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Goal progress</p>
              <ScoreGauge score={credit.score} size={200} />
              <p className="text-[13px] font-semibold" style={{ color: INK }}>{credit.goal - credit.score} points to go</p>
              <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Goal {credit.goal} · current {credit.score}</p>
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: BLUE }} />
                <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Change your goal</h2>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  aria-label="Credit score goal"
                  type="number"
                  min={credit.score + 1}
                  max={850}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-[104px] h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]"
                />
                <button
                  type="button"
                  onClick={saveGoal}
                  disabled={savingGoal}
                  className="inline-flex items-center gap-2 text-white text-[13px] font-semibold px-4 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: BLUE }}
                >
                  {savingGoal && <Spinner size="sm" tone="white" />}
                  {savingGoal ? 'Saving…' : 'Save'}
                </button>
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {tab === 'simulator' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-7 p-5 sm:p-6">
            <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Score simulator</h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
              Simulate what your score could be. Start with your current {credit.score}, then choose one scenario.
            </p>
            <fieldset className="mt-4">
              <legend className="sr-only">Choose a scenario</legend>
              <div className="space-y-2">
                {SCENARIOS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 border rounded-[5px] p-3 cursor-pointer ${scenario === option.id ? 'bg-[#F2F6FB]' : 'bg-white hover:bg-[#FAFBFC]'}`}
                    style={{ borderColor: scenario === option.id ? BLUE : LINE }}
                  >
                    <input
                      type="radio"
                      name="credit-scenario"
                      value={option.id}
                      checked={scenario === option.id}
                      onChange={() => setScenario(option.id)}
                      className="mt-1 w-4 h-4 accent-[#1A4488]"
                    />
                    <span>
                      <span className="block text-[13.5px] font-semibold" style={{ color: INK }}>{option.label}</span>
                      <span className="block text-[11.5px]" style={{ color: MUTED }}>{option.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <button
                type="button"
                onClick={runSimulation}
                disabled={simulating}
                className="inline-flex items-center gap-2 text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: BLUE }}
              >
                {simulating && <Spinner size="sm" tone="white" />}
                {simulating ? 'Estimating…' : 'Simulate this scenario'}
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: FAINT }}>
              Simulations estimate a range. They aren't predictions of your actual score. This Chase Online reference doesn't
              change your real credit file.
            </p>
          </Panel>

          <aside className="lg:col-span-5 space-y-4">
            <Panel className="p-5" style={{ background: '#F7FAFD', borderColor: '#CFE0F0' }}>
              <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Current score</p>
              <p className="mt-1 text-[34px] font-light leading-none" style={{ color: INK }}>{credit.score}</p>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>{credit.model} · {credit.bureau}®</p>
            </Panel>

            {estimate ? (
              <Panel className="p-5">
                <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Estimated score</p>
                <p className="mt-1 text-[34px] font-light leading-none" style={{ color: bandFor(estimate.estimatedScore).color }}>
                  {estimate.low}–{estimate.high}
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
                  {SCENARIOS.find((s) => s.id === estimate.scenario)?.label}
                </p>
                <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>{estimate.note}</p>
              </Panel>
            ) : (
              <Panel className="p-5 text-center">
                <TrendingUp className="w-8 h-8 mx-auto" style={{ color: BLUE }} />
                <p className="mt-2 text-[13px] font-semibold" style={{ color: INK }}>Choose a scenario</p>
                <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>Your estimated range appears here.</p>
              </Panel>
            )}

            {(credit.simulations || []).length > 0 && (
              <Panel className="p-5">
                <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Recent simulations</h2>
                <ul className="mt-2 space-y-2">
                  {(credit.simulations || []).slice(0, 4).map((sim) => (
                    <li key={sim.id} className="flex items-center justify-between gap-2 text-[12.5px] border-b last:border-b-0 pb-2 last:pb-0" style={{ borderColor: LINE }}>
                      <span style={{ color: MUTED }}>{SCENARIOS.find((s) => s.id === sim.scenario)?.label || sim.scenario}</span>
                      <span className="font-semibold" style={{ color: INK }}>{sim.low}–{sim.high}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>
        </div>
      )}

      {tab === 'monitoring' && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Panel className="lg:col-span-7 overflow-hidden">
            <div className="px-5 pt-5 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: '#138842' }} />
              <h2 className="text-[18px] font-semibold" style={{ color: INK }}>Credit alerts &amp; dark web monitoring</h2>
            </div>
            <p className="px-5 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
              Included free with Credit Journey. We alert you when your {credit.bureau}® file changes or your
              information appears in a breach.
            </p>

            <h3 className="px-5 mt-4 text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Credit alerts</h3>
            <ul className="mt-1">
              {(credit.alerts || []).map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-5 py-3 border-t" style={{ borderColor: LINE }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#EAF2FA', color: BLUE }}>
                    <Bell className="w-4 h-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: INK }}>
                      {alert.title}
                      {!alert.read && <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: '#B42318' }}>New</span>}
                    </p>
                    <p className="text-[12px]" style={{ color: MUTED }}>{alert.detail}</p>
                    <p className="text-[11px]" style={{ color: FAINT }}>{fmtDate(alert.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
            {unread > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: LINE }}>
                <OutlineBtn onClick={markRead}>Mark alerts as read</OutlineBtn>
              </div>
            )}

            <h3 className="px-5 mt-3 text-[12px] font-bold uppercase tracking-wide" style={{ color: FAINT }}>Dark web results</h3>
            <ul className="mt-1 pb-3">
              {(credit.darkWeb || []).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-t" style={{ borderColor: LINE }}>
                  <div>
                    <p className="text-[13px]" style={{ color: INK }}>{item.email || item.phone}</p>
                    <p className="text-[11.5px]" style={{ color: MUTED }}>{item.source} · {fmtDate(item.foundAt)}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: item.status === 'Resolved' ? '#EAF7EE' : '#F1F4F7', color: item.status === 'Resolved' ? '#138842' : MUTED }}>
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <aside className="lg:col-span-5 space-y-4">
            <Panel className="p-5">
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>What we monitor</h2>
              <ul className="mt-2 space-y-2 text-[12.5px]" style={{ color: MUTED }}>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#138842]" /> New accounts opened in your name</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#138842]" /> Changes to your score or balances</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#138842]" /> Hard credit inquiries</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#138842]" /> Email and phone numbers found in breaches</li>
              </ul>
            </Panel>
            <Panel className="p-5">
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>How to enroll</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                Credit Journey is free and you don't need a Chase account. Monitoring is on for your signed-in profile; the alert
                toggles live in Settings → Alerts.
              </p>
            </Panel>
            <Panel className="p-5" style={{ background: '#F7FAFD', borderColor: '#CFE0F0' }}>
              <h2 className="text-[14px] font-semibold" style={{ color: INK }}>Free for everyone</h2>
              <p className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
                Weekly VantageScore® 3.0, score factors, a full {credit.bureau}® report, the simulator, and dark web
                monitoring — at no cost.
              </p>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
};

export default CreditJourney;
