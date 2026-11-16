/* -------------------------------------------------------------------------- */
/* Admin Console — Overview (metrics, cashflow, volume, mix, activity)         */
/* -------------------------------------------------------------------------- */
import React from 'react';
import {
  Users,
  Landmark,
  ArrowLeftRight,
  ShieldAlert,
  UserPlus,
  ShieldCheck,
  Flag,
  ChevronRight,
} from 'lucide-react';
import { AdminOverview, AdminRange } from '../../banking/store';
import { AreaChart, BarChart, DonutChart, RadialGauge, Sparkline, ACCOUNT_TYPE_COLORS, fmtCompactMoney } from './charts';
import { Avatar, Badge, Card, CardHeader, DeltaBadge, EmptyState, Skeleton, StatusPill, fmtMoneyFull, relTime } from './ui';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  'credit-card': 'Credit cards',
  cd: 'CDs',
  mortgage: 'Mortgages',
  'auto-loan': 'Auto loans',
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string;
  badge?: React.ReactNode;
  sub?: string;
  spark?: number[];
  sparkColor?: string;
}> = ({ icon, title, value, badge, sub, spark, sparkColor = '#0060F0' }) => (
  <Card className="p-5 md:p-6 admin-fade-up">
    <div className="flex items-center justify-between">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/90">
        {icon}
      </div>
      {badge}
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[13px] text-gray-500 dark:text-gray-400">{title}</span>
        <h4 className="mt-1 text-[24px] leading-tight font-bold text-gray-800 dark:text-white/90 tabular-nums truncate">{value}</h4>
        {sub && <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
      {spark && spark.length > 1 && (
        <div className="shrink-0 mb-1">
          <Sparkline data={spark} color={sparkColor} width={104} height={38} />
        </div>
      )}
    </div>
  </Card>
);

const RANGE_OPTIONS: { id: AdminRange; label: string; phrase: string }[] = [
  { id: '7d', label: '7D', phrase: 'last 7 days' },
  { id: '30d', label: '30D', phrase: 'last 30 days' },
  { id: '12w', label: '12W', phrase: 'last 12 weeks' },
];

/** shadcn-style segmented range switch for the cashflow chart. */
const RangeToggle: React.FC<{ value: AdminRange; onChange: (r: AdminRange) => void }> = ({ value, onChange }) => (
  <div
    role="tablist"
    aria-label="Cashflow time range"
    className="inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/[0.06]"
  >
    {RANGE_OPTIONS.map((opt) => {
      const active = opt.id === value;
      return (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
            active
              ? 'bg-white text-gray-800 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

interface Props {
  overview: AdminOverview | null;
  loading: boolean;
  range: AdminRange;
  onRangeChange: (range: AdminRange) => void;
  onOpenCustomer: (id: string) => void;
  onNavigate: (page: 'transactions' | 'disputes' | 'customers') => void;
}

export const OverviewPage: React.FC<Props> = ({ overview, loading, range, onRangeChange, onOpenCustomer, onNavigate }) => {
  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="h-3.5 w-28 mt-5" />
              <Skeleton className="h-7 w-36 mt-2" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <Card className="col-span-12 xl:col-span-8 h-[360px] p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-[280px] w-full mt-4" />
          </Card>
          <Card className="col-span-12 xl:col-span-4 h-[360px] p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[260px] w-full mt-4 rounded-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (!overview) {
    return <EmptyState title="No analytics available" detail="The admin API could not be reached. Try again in a moment." />;
  }

  const { kpis, cashflow, daily, accountMix, topCustomers, activity, sparklines } = overview;

  return (
    <div className="space-y-6">
      {/* KPI metric row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        <MetricCard
          icon={<Users className="w-[22px] h-[22px]" />}
          title="Total customers"
          value={kpis.totalUsers.toLocaleString('en-US')}
          badge={<DeltaBadge pct={kpis.newUsersDeltaPct} />}
          sub={`+${kpis.newUsers30} new in the last 30 days`}
          spark={sparklines.signups}
          sparkColor="#0060F0"
        />
        <MetricCard
          icon={<Landmark className="w-[22px] h-[22px]" />}
          title="Total deposits"
          value={fmtCompactMoney(kpis.totalDeposits)}
          badge={<DeltaBadge pct={kpis.depositsDeltaPct} />}
          sub={`${kpis.netFlow30 >= 0 ? '+' : '−'}${fmtCompactMoney(Math.abs(kpis.netFlow30))} net flow, last 30 days`}
          spark={sparklines.inflow}
          sparkColor="#12B76A"
        />
        <MetricCard
          icon={<ArrowLeftRight className="w-[22px] h-[22px]" />}
          title="Transaction volume (30d)"
          value={fmtCompactMoney(kpis.txVolume30)}
          badge={<DeltaBadge pct={kpis.txVolumeDeltaPct} />}
          sub={`${kpis.txCount30.toLocaleString('en-US')} transactions processed`}
          spark={sparklines.volume}
          sparkColor="#7A5AF8"
        />
        <MetricCard
          icon={<ShieldAlert className="w-[22px] h-[22px]" />}
          title="Open risk items"
          value={String(kpis.riskItems)}
          badge={
            kpis.riskItems > 0 ? (
              <Badge tone="error">needs review</Badge>
            ) : (
              <Badge tone="success">all clear</Badge>
            )
          }
          sub={`${kpis.flaggedTx} flagged · ${kpis.openDisputes} disputes · ${kpis.frozenUsers} frozen`}
          sparkColor="#F04438"
        />
      </div>

      {/* Cashflow + monthly target */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card className="col-span-12 xl:col-span-8 admin-fade-up">
          <CardHeader
            title="Cashflow"
            subtitle={`Money in vs money out · ${RANGE_OPTIONS.find((r) => r.id === range)?.phrase || 'last 12 weeks'}`}
            action={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[11.5px] text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0060F0]" /> Inflow
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F04438]" /> Outflow
                </span>
                <RangeToggle value={range} onChange={onRangeChange} />
              </div>
            }
          />
          <div className={`px-3 pb-4 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
            <AreaChart
              data={cashflow.map((c) => ({ label: c.label, a: c.inflow, b: c.outflow }))}
              aLabel="Inflow"
              bLabel="Outflow"
            />
          </div>
        </Card>

        <Card className="col-span-12 xl:col-span-4 admin-fade-up">
          <CardHeader title="Monthly inflow target" subtitle="Deposits received this calendar month" />
          <div className="px-5 pb-6 flex flex-col items-center">
            <RadialGauge
              pct={kpis.monthlyTargetPct}
              label={fmtCompactMoney(kpis.monthInflow)}
              sub={`Target ${fmtCompactMoney(kpis.monthlyTarget)}`}
            />
            <div className="grid grid-cols-2 gap-3 w-full mt-5">
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-4 py-3">
                <p className="text-[11.5px] text-gray-500 dark:text-gray-400">Active sessions</p>
                <p className="text-[17px] font-bold text-gray-800 dark:text-white/90 tabular-nums mt-0.5">{kpis.activeSessions}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-4 py-3">
                <p className="text-[11.5px] text-gray-500 dark:text-gray-400">Card utilization</p>
                <p className="text-[17px] font-bold text-gray-800 dark:text-white/90 tabular-nums mt-0.5">{kpis.creditUtilizationPct.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Daily volume + account mix */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card className="col-span-12 xl:col-span-8 admin-fade-up">
          <CardHeader
            title="Transaction volume"
            subtitle="Processed per day · last 14 days"
            action={
              <button
                type="button"
                onClick={() => onNavigate('transactions')}
                className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#0060F0] hover:underline cursor-pointer dark:text-[#5EA0EF]"
              >
                View ledger <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="px-3 pb-4">
            <BarChart data={daily.map((d) => ({ label: d.label, value: d.amount, meta: `${d.count} transactions` }))} />
          </div>
        </Card>

        <Card className="col-span-12 xl:col-span-4 admin-fade-up">
          <CardHeader
            title="Accounts by product"
            subtitle={`${accountMix.reduce((s, m) => s + m.count, 0)} open accounts`}
          />
          <div className="px-5 pb-6">
            {accountMix.length === 0 ? (
              <EmptyState title="No accounts yet" />
            ) : (
              <DonutChart
                slices={accountMix.map((m) => ({
                  label: ACCOUNT_TYPE_LABELS[m.type] || m.type,
                  value: m.count,
                  color: ACCOUNT_TYPE_COLORS[m.type] || '#94A3B8',
                  meta: fmtCompactMoney(m.balance),
                }))}
                centerValue={String(accountMix.reduce((s, m) => s + m.count, 0))}
                centerLabel="accounts"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Top customers + activity */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card className="col-span-12 xl:col-span-5 admin-fade-up">
          <CardHeader
            title="Top customers by deposits"
            subtitle="Highest combined deposit balances"
            action={
              <button
                type="button"
                onClick={() => onNavigate('customers')}
                className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#0060F0] hover:underline cursor-pointer dark:text-[#5EA0EF]"
              >
                All customers <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <ul className="px-2 pb-3">
            {topCustomers.length === 0 && (
              <li>
                <EmptyState title="No customers yet" />
              </li>
            )}
            {topCustomers.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenCustomer(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-left"
                >
                  <span className="w-5 text-center text-[12px] font-bold text-gray-300 dark:text-gray-600 tabular-nums">{i + 1}</span>
                  <Avatar name={c.fullName} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-800 dark:text-white/90 truncate">{c.fullName}</span>
                    <span className="block text-[11.5px] text-gray-400 dark:text-gray-500 truncate">
                      @{c.username} · {c.accountCount} accounts
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[13px] font-semibold text-gray-800 dark:text-white/90 tabular-nums">{fmtMoneyFull(c.deposits)}</span>
                    <span className="block mt-0.5">
                      <StatusPill status={c.status} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 xl:col-span-7 admin-fade-up">
          <CardHeader title="Recent activity" subtitle="Signups, transactions, and admin actions across the bank" />
          <ul className="px-5 pb-5 space-y-0">
            {activity.length === 0 && <EmptyState title="No activity recorded yet" />}
            {activity.map((item) => {
              const Icon = item.kind === 'signup' ? UserPlus : item.kind === 'admin' ? ShieldCheck : item.flagged ? Flag : ArrowLeftRight;
              const tone =
                item.kind === 'signup'
                  ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-[#32D583]'
                  : item.kind === 'admin'
                    ? 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-[#A78BFA]'
                    : item.flagged
                      ? 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-[#F97066]'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-[#5EA0EF]';
              return (
                <li key={item.id} className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-gray-800 dark:text-white/90 truncate">{item.text}</span>
                    <span className="block text-[11.5px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{item.detail}</span>
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap pt-0.5">{relTime(item.at)}</span>
                  {item.userId && (
                    <button
                      type="button"
                      onClick={() => onOpenCustomer(item.userId as string)}
                      className="text-gray-300 hover:text-[#0060F0] dark:text-gray-600 dark:hover:text-[#5EA0EF] cursor-pointer pt-1"
                      aria-label="Open customer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
};
