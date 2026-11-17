/* -------------------------------------------------------------------------- */
/* Admin Console — Executive Overview, Analytics Charts & Financial Reports   */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CircleDollarSign,
  Eye,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  ACCOUNT_TYPE_COLORS,
  AreaChart,
  BarChart,
  CHART_COLORS,
  DonutChart,
  RadialGauge,
  Sparkline,
  fmtCompactMoney,
} from './charts';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  EmptyState,
  ExportBtn,
  Td,
  TextInput,
  Th,
  TableShell,
  downloadCsv,
  fmtMoneyFull,
  relTime,
} from './ui';
import {
  AdminMetrics,
  AdminTab,
  AdminUserRow,
  AuditEntry,
  CashflowRange,
  GlobalTransaction,
  OverviewAnalytics,
  inputDate,
} from './types';

interface Props {
  metrics: AdminMetrics | null;
  analytics: OverviewAnalytics | null;
  range: CashflowRange;
  onRangeChange: (r: CashflowRange) => void;
  users: AdminUserRow[];
  globalTransactions: GlobalTransaction[];
  audit: AuditEntry[];
  isReadOnly: boolean;
  busy: boolean;
  onNavigate: (tab: AdminTab) => void;
  onSelectUser: (id: string, targetTab?: AdminTab) => void;
  onImpersonateById: (id: string, fullName: string) => void;
}

export const OverviewTab: React.FC<Props> = ({
  metrics,
  analytics,
  range,
  onRangeChange,
  users,
  globalTransactions,
  audit,
  isReadOnly,
  onNavigate,
  onSelectUser,
  onImpersonateById,
}) => {
  const [reportFrom, setReportFrom] = useState(() => inputDate(180));
  const [reportThrough, setReportThrough] = useState(() => inputDate(0));

  const reportRows = useMemo(
    () =>
      globalTransactions.filter(
        (entry) => entry.date.slice(0, 10) >= reportFrom && entry.date.slice(0, 10) <= reportThrough
      ),
    [globalTransactions, reportFrom, reportThrough]
  );

  const reportStats = useMemo(() => {
    let credits = 0;
    let debits = 0;
    for (const r of reportRows) {
      const amt = Number(r.amount || 0);
      if (r.accountType === 'credit-card') {
        if (amt > 0) debits += amt;
        else credits += Math.abs(amt);
      } else if (amt >= 0) {
        credits += amt;
      } else {
        debits += Math.abs(amt);
      }
    }
    return {
      credits,
      debits,
      net: credits - debits,
    };
  }, [reportRows]);

  const monthlySix = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        const year = date.getFullYear();
        const month = date.getMonth();
        const entries = globalTransactions.filter((entry) => {
          const d = new Date(entry.date);
          return d.getFullYear() === year && d.getMonth() === month;
        });
        return {
          label: date.toLocaleDateString('en-US', { month: 'short' }),
          count: entries.length,
          net: entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
        };
      }),
    [globalTransactions]
  );

  const areaPoints = useMemo(
    () =>
      (analytics?.cashflow || []).map((p) => ({
        label: p.label,
        a: p.inflow,
        b: p.outflow,
      })),
    [analytics]
  );

  const inflowSpark = useMemo(() => areaPoints.map((p) => p.a), [areaPoints]);
  const outflowSpark = useMemo(() => areaPoints.map((p) => p.b), [areaPoints]);

  const donutSlices = useMemo(
    () =>
      (analytics?.accountMix || []).map((item, idx) => ({
        label: item.label,
        value: item.count,
        color: ACCOUNT_TYPE_COLORS[item.type] || CHART_COLORS[idx % CHART_COLORS.length],
        meta: fmtCompactMoney(item.balance),
      })),
    [analytics]
  );

  const categoryBars = useMemo(
    () =>
      (analytics?.categorySpend || []).map((c) => ({
        label: c.category,
        value: c.amount,
        meta: `${c.count} transactions`,
      })),
    [analytics]
  );

  const targetPct = useMemo(() => {
    if (!analytics || !analytics.monthlyTarget) return 0;
    return Math.min(100, (analytics.monthlyInflow / analytics.monthlyTarget) * 100);
  }, [analytics]);

  const openDisputes = useMemo(
    () => (analytics?.disputes || []).filter((d) => d.status === 'open'),
    [analytics]
  );

  const kpis = [
    {
      label: 'Customer Profiles',
      value: String(metrics?.users ?? 0),
      sub:
        metrics && metrics.suspendedUsers > 0
          ? `${metrics.suspendedUsers} suspended · ${metrics.users - metrics.suspendedUsers} active`
          : 'All profiles active',
      icon: <Users className="w-5 h-5 text-[#0060F0]" />,
      iconBg: 'bg-blue-50 dark:bg-blue-500/15',
      spark: [2, 3, 4, 4, 5, Math.max(1, metrics?.users ?? 1)],
      sparkColor: '#0060F0',
      onClick: () => onNavigate('users'),
    },
    {
      label: 'Total Deposit Balances',
      value: fmtCompactMoney(metrics?.deposits ?? 0),
      sub: fmtMoneyFull(metrics?.deposits ?? 0),
      icon: <CircleDollarSign className="w-5 h-5 text-[#12B76A]" />,
      iconBg: 'bg-emerald-50 dark:bg-emerald-500/15',
      spark: inflowSpark.length > 1 ? inflowSpark : [12, 18, 16, 22, 25, 29],
      sparkColor: '#12B76A',
      onClick: () => onNavigate('accounts'),
    },
    {
      label: 'Revolving Card Balances',
      value: fmtCompactMoney(metrics?.cardBalances ?? 0),
      sub: `${metrics?.accounts ?? 0} total open accounts`,
      icon: <WalletCards className="w-5 h-5 text-[#7A5AF8]" />,
      iconBg: 'bg-violet-50 dark:bg-violet-500/15',
      spark: outflowSpark.length > 1 ? outflowSpark : [8, 11, 9, 14, 12, 15],
      sparkColor: '#7A5AF8',
      onClick: () => onNavigate('accounts'),
    },
    {
      label: 'Posted & Pending Ledger',
      value: (metrics?.transactions ?? 0).toLocaleString(),
      sub: `${metrics?.scheduledPayments ?? 0} scheduled · ${openDisputes.length} open disputes`,
      icon: <Activity className="w-5 h-5 text-[#F79009]" />,
      iconBg: 'bg-amber-50 dark:bg-amber-500/15',
      spark: monthlySix.map((m) => m.count),
      sparkColor: '#F79009',
      onClick: () => onNavigate('transactions'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Executive KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            onClick={kpi.onClick}
            className="p-5 cursor-pointer transition-all hover:border-[#0060F0]/50 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.iconBg}`}>
                {kpi.icon}
              </div>
              <Sparkline data={kpi.spark} color={kpi.sparkColor} width={92} height={32} />
            </div>
            <div className="mt-4">
              <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{kpi.label}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className="text-[26px] font-bold tracking-tight text-gray-900 dark:text-white tabular-nums">
                  {kpi.value}
                </p>
                <ArrowUpRight className="w-4 h-4 text-gray-400" />
              </div>
              <p className="mt-1 text-[11.5px] text-gray-500 dark:text-gray-400 truncate">{kpi.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Row 2: Cashflow Area Chart (7D / 30D / 12W) + Monthly Inflow Target Gauge */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Cashflow Velocity
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                Deposits &amp; credits vs. purchases &amp; outgoing payments across all customer ledgers
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-[12px] text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0060F0]" /> Inflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F04438]" /> Outflows
                </span>
              </div>
              <div
                role="group"
                aria-label="Cashflow range"
                className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 p-0.5"
              >
                {(['7d', '30d', '12w'] as CashflowRange[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onRangeChange(opt)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold uppercase transition-colors cursor-pointer ${
                      range === opt
                        ? 'bg-white dark:bg-[#0060F0] text-[#0060F0] dark:text-white shadow-xs'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {areaPoints.length > 0 ? (
            <AreaChart data={areaPoints} aLabel="Inflows" bLabel="Outflows" height={270} />
          ) : (
            <EmptyState title="No ledger cashflow yet" detail="Generate test customer activity to populate the curve." />
          )}
        </Card>

        <Card className="xl:col-span-4 p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
              Current-Month Deposit Pace
            </h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Monthly inflow benchmark across active profiles
            </p>
          </div>
          <div className="my-2">
            <RadialGauge
              pct={targetPct}
              label={`${fmtCompactMoney(analytics?.monthlyInflow ?? 0)} of ${fmtCompactMoney(
                analytics?.monthlyTarget ?? 75000
              )}`}
              sub="Current calendar month non-transfer inflows"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200 dark:border-gray-800 text-center">
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Inflow</p>
              <p className="text-[13px] font-semibold text-[#12B76A] tabular-nums">
                {fmtCompactMoney(analytics?.monthlyInflow ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Outflow</p>
              <p className="text-[13px] font-semibold text-[#F04438] tabular-nums">
                {fmtCompactMoney(analytics?.monthlyOutflow ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Net</p>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                {fmtCompactMoney((analytics?.monthlyInflow ?? 0) - (analytics?.monthlyOutflow ?? 0))}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 3: Account Mix Donut + Spending Category Bar Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-5 p-5">
          <CardHeader
            title="Account Portfolio Mix"
            subtitle="Distribution of open deposit, card & loan accounts"
            action={
              <Btn variant="ghost" size="xs" onClick={() => onNavigate('accounts')}>
                Manage accounts
              </Btn>
            }
          />
          <div className="mt-4">
            {donutSlices.length > 0 ? (
              <DonutChart
                slices={donutSlices}
                centerValue={String(metrics?.accounts ?? 0)}
                centerLabel="Total accounts"
              />
            ) : (
              <EmptyState title="No accounts" />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-7 p-5">
          <CardHeader
            title="Spending by Merchant Category"
            subtitle="Aggregated customer card & debit spend across categories"
            action={
              <Btn variant="ghost" size="xs" onClick={() => onNavigate('transactions')}>
                Explore ledger
              </Btn>
            }
          />
          <div className="mt-3">
            {categoryBars.length > 0 ? (
              <BarChart data={categoryBars} color="#0060F0" height={225} />
            ) : (
              <EmptyState title="No category spend recorded" />
            )}
          </div>
        </Card>
      </div>

      {/* Row 4: Date-Range Financial Activity Report (from 8f9d1770) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0060F0]" />
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Date-Range Ledger Activity Report
              </h3>
            </div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Inclusive multi-customer ledger reconciliation &amp; 6-month volume breakdown
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">From</span>
              <TextInput
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className="w-[152px] py-1.5"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Through</span>
              <TextInput
                type="date"
                value={reportThrough}
                onChange={(e) => setReportThrough(e.target.value)}
                className="w-[152px] py-1.5"
              />
            </label>
            <ExportBtn
              label="Export Report CSV"
              onClick={() =>
                downloadCsv(
                  `chase-ledger-report-${reportFrom}-to-${reportThrough}.csv`,
                  ['Date', 'Username', 'Customer', 'Account', 'Type', 'Description', 'Category', 'Status', 'Amount'],
                  reportRows.map((r) => [
                    r.date,
                    r.username,
                    r.fullName,
                    r.accountName,
                    r.accountType,
                    r.description,
                    r.category,
                    r.status,
                    r.amount,
                  ])
                )
              }
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3.5 border border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Matching Entries</p>
            <p className="mt-1 text-[18px] font-bold text-gray-900 dark:text-white tabular-nums">
              {reportRows.length.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3.5 border border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Gross Credits / Inflows</p>
            <p className="mt-1 text-[18px] font-bold text-[#12B76A] tabular-nums">
              {fmtMoneyFull(reportStats.credits)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3.5 border border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Gross Debits / Purchases</p>
            <p className="mt-1 text-[18px] font-bold text-[#F04438] tabular-nums">
              {fmtMoneyFull(reportStats.debits)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3.5 border border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Net Flow</p>
            <p className="mt-1 text-[18px] font-bold text-gray-900 dark:text-white tabular-nums">
              {fmtMoneyFull(reportStats.net)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {monthlySix.map((m) => {
            const peak = Math.max(1, ...monthlySix.map((x) => x.count));
            const pct = Math.max(8, Math.round((m.count / peak) * 100));
            return (
              <div
                key={m.label}
                className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col justify-between bg-white dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{m.label}</span>
                  <span className="text-gray-400 tabular-nums">{m.count} tx</span>
                </div>
                <div className="my-2.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-[#0060F0]" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums truncate">
                  Net {fmtCompactMoney(m.net)}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Row 5: Customer Roster Snapshot + Open Disputes & Live Audit Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-7 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Customer Households
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                Click a customer to inspect accounts, generate history, or preview their banking session
              </p>
            </div>
            <Btn variant="secondary" size="xs" onClick={() => onNavigate('users')}>
              All users ({users.length})
            </Btn>
          </div>
          <TableShell>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Deposits</Th>
                <Th>Card Debt</Th>
                <Th className="text-right">Quick Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {users.slice(0, 6).map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]">
                  <Td>
                    <button
                      type="button"
                      onClick={() => onSelectUser(u.id, 'users')}
                      className="flex items-center gap-2.5 text-left cursor-pointer group"
                    >
                      <Avatar name={u.fullName} size={32} />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white group-hover:text-[#0060F0]">
                          {u.fullName}
                        </p>
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
                          @{u.username} · {u.accountCount} accts
                        </p>
                      </div>
                    </button>
                  </Td>
                  <Td>
                    <Badge tone={u.status === 'active' ? 'success' : 'error'}>
                      {u.status}
                    </Badge>
                  </Td>
                  <Td className="font-semibold tabular-nums">{fmtMoneyFull(u.depositBalance)}</Td>
                  <Td className="tabular-nums text-gray-600 dark:text-gray-300">
                    {fmtMoneyFull(u.cardBalance)}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Btn variant="secondary" size="xs" onClick={() => onSelectUser(u.id, 'users')}>
                        Manage
                      </Btn>
                      {!isReadOnly && (
                        <Btn
                          variant="ghost"
                          size="xs"
                          onClick={() => onImpersonateById(u.id, u.fullName)}
                          title={`Open customer view as ${u.fullName}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Preview
                        </Btn>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>

        <div className="xl:col-span-5 space-y-5">
          {/* Open disputes watch */}
          <Card className="p-5">
            <CardHeader
              title="Open Card Disputes"
              subtitle={
                openDisputes.length
                  ? `${openDisputes.length} chargeback case${openDisputes.length === 1 ? '' : 's'} awaiting resolution`
                  : 'Zero unresolved card disputes'
              }
              action={
                <Btn variant="ghost" size="xs" onClick={() => onNavigate('operations')}>
                  Disputes desk
                </Btn>
              }
            />
            {openDisputes.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-gray-500 dark:text-gray-400">
                All customer card disputes are currently resolved. You can open or refund disputes in Payments &amp; Disputes.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                {openDisputes.slice(0, 3).map((d) => (
                  <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {d.description} · {fmtMoneyFull(d.amount)}
                      </p>
                      <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                        {d.fullName} (@{d.username}) — {d.reason}
                      </p>
                    </div>
                    <Btn
                      variant="secondary"
                      size="xs"
                      onClick={() => onSelectUser(d.userId, 'operations')}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F79009]" />
                      Review
                    </Btn>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Live audit stream */}
          <Card className="p-5">
            <CardHeader
              title="Recent Admin Audit Trail"
              subtitle="Latest operator & compliance events"
              action={
                <Btn variant="ghost" size="xs" onClick={() => onNavigate('audit')}>
                  Full log ({audit.length})
                </Btn>
              }
            />
            {audit.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-gray-500 dark:text-gray-400">
                Administrative actions and impersonation events appear here automatically.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                {audit.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {entry.action}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        by <span className="font-medium">{entry.actor}</span>
                        {Object.keys(entry.details || {}).length > 0 &&
                          ` · ${Object.entries(entry.details)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}`}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                      {relTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
