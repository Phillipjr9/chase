/* -------------------------------------------------------------------------- */
/* Admin Console — System status (runtime, database, security posture)         */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Database,
  MemoryStick,
  Clock,
  ShieldCheck,
  Users,
  RefreshCw,
  Package,
  ScrollText,
} from 'lucide-react';
import { AdminSystemInfo, adminSystem } from '../../banking/store';
import { Badge, Btn, Card, CardHeader, EmptyState, Skeleton, fmtBytes, fmtDateTime, fmtUptime, pushToast } from './ui';

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'default' | 'good' | 'warn';
}> = ({ icon, label, value, sub, tone = 'default' }) => (
  <Card className="p-5 admin-fade-up">
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
          tone === 'good'
            ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-[#32D583]'
            : tone === 'warn'
              ? 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-[#FDB022]'
              : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] text-gray-500 dark:text-gray-400">{label}</span>
        <span className="block text-[17px] font-bold text-gray-800 dark:text-white/90 tabular-nums truncate">{value}</span>
        {sub && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</span>}
      </span>
    </div>
  </Card>
);

const API_SURFACE = [
  ['GET', '/api/admin/overview', 'KPIs, cashflow, volume, mix, activity'],
  ['GET', '/api/admin/customers', 'Searchable, sortable, paginated roster'],
  ['GET', '/api/admin/customers/detail', 'Full customer profile + accounts'],
  ['POST', '/api/admin/customers/status', 'Freeze / reactivate (ends sessions)'],
  ['POST', '/api/admin/customers/role', 'Grant / revoke administrator'],
  ['POST', '/api/admin/customers/adjust', 'Audited balance adjustment'],
  ['POST', '/api/admin/customers/sign-out', 'Force sign-out on all devices'],
  ['GET', '/api/admin/transactions', 'Global ledger with filters + summary'],
  ['POST', '/api/admin/transactions/flag', 'Fraud flag / unflag with note'],
  ['GET', '/api/admin/disputes', 'Dispute resolution queue'],
  ['POST', '/api/admin/disputes/resolve', 'Approve (refunds) or deny'],
  ['GET', '/api/admin/audit', 'Immutable audit trail'],
  ['GET', '/api/admin/system', 'Runtime + database health'],
];

export const SystemPage: React.FC = () => {
  const [info, setInfo] = useState<AdminSystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      setInfo(await adminSystem());
      setLastSync(new Date());
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load system info.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !info) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (!info) return <EmptyState title="System information unavailable" />;

  const localMode = info.status === 'local';

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card className="flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 admin-fade-up">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${localMode ? 'bg-warning-400' : 'bg-success-400'}`} />
          <span className={`relative inline-flex rounded-full h-3 w-3 ${localMode ? 'bg-warning-500' : 'bg-success-500'}`} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
            {localMode ? 'Running in browser-local fallback mode' : 'All systems operational'}
          </h3>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">
            {localMode
              ? 'The Node API is unreachable, so the console is reading from browser storage. Start the server for live analytics.'
              : `API v${info.version} · Node ${info.node} on ${info.platform} · listening on port ${info.port} (PID ${info.pid})`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastSync && <span className="text-[11.5px] text-gray-400 dark:text-gray-500">Synced {lastSync.toLocaleTimeString('en-US')}</span>}
          <Btn variant="secondary" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Btn>
        </div>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        <StatTile
          icon={<Clock className="w-[18px] h-[18px]" />}
          label="Uptime"
          value={localMode ? '—' : fmtUptime(info.uptimeSec)}
          sub={localMode ? undefined : `Started ${fmtDateTime(info.startedAt)}`}
        />
        <StatTile
          icon={<Activity className="w-[18px] h-[18px]" />}
          label="Active sessions"
          value={info.activeSessions}
          sub="Signed-in devices right now"
          tone={info.activeSessions > 0 ? 'good' : 'default'}
        />
        <StatTile
          icon={<MemoryStick className="w-[18px] h-[18px]" />}
          label="Memory (RSS)"
          value={localMode ? '—' : `${info.memoryMb} MB`}
          sub={localMode ? undefined : `Heap used ${info.heapMb} MB`}
        />
        <StatTile
          icon={<Database className="w-[18px] h-[18px]" />}
          label="Database size"
          value={localMode ? 'localStorage' : fmtBytes(info.db.bytes)}
          sub={info.db.modifiedAt ? `Last write ${fmtDateTime(info.db.modifiedAt)}` : 'JSON file store (server/data/db.json)'}
        />
        <StatTile
          icon={<Users className="w-[18px] h-[18px]" />}
          label="Customers"
          value={info.users}
          sub={`${info.admins} administrator${info.admins === 1 ? '' : 's'} · ${info.frozenUsers} frozen`}
          tone={info.frozenUsers > 0 ? 'warn' : 'default'}
        />
        <StatTile
          icon={<ScrollText className="w-[18px] h-[18px]" />}
          label="Audit entries"
          value={info.auditEntries}
          sub="Capped at the most recent 600"
        />
        <StatTile
          icon={<Package className="w-[18px] h-[18px]" />}
          label="Products live"
          value={info.products}
          sub="Checking, cards, savings & loans"
        />
        <StatTile
          icon={<ShieldCheck className="w-[18px] h-[18px]" />}
          label="Security posture"
          value="Hardened"
          sub="scrypt hashing · 24h tokens · throttled sign-in"
          tone="good"
        />
      </div>

      {/* Runtime details + API surface */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card className="col-span-12 xl:col-span-5 admin-fade-up">
          <CardHeader title="Runtime" subtitle="Server process details" />
          <dl className="px-5 pb-5 space-y-0 text-[13px]">
            {[
              ['Status', <Badge key="s" tone={localMode ? 'warning' : 'success'}>{localMode ? 'local fallback' : 'operational'}</Badge>],
              ['API version', `v${info.version}`],
              ['Node.js', info.node],
              ['Platform', info.platform],
              ['Process ID', localMode ? '—' : String(info.pid)],
              ['Port', localMode ? '—' : String(info.port)],
              ['Started', localMode ? '—' : fmtDateTime(info.startedAt)],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0">
                <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-100 tabular-nums">{v as React.ReactNode}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="col-span-12 xl:col-span-7 admin-fade-up">
          <CardHeader title="Admin API surface" subtitle="Every endpoint below requires an administrator session token" />
          <ul className="px-5 pb-5 space-y-1.5">
            {API_SURFACE.map(([method, endpoint, desc]) => (
              <li key={endpoint} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                <Badge tone={method === 'GET' ? 'info' : 'warning'} className="w-[46px] justify-center font-mono">{method}</Badge>
                <code className="text-[12px] font-mono text-gray-700 dark:text-gray-200 shrink-0">{endpoint}</code>
                <span className="text-[11.5px] text-gray-400 dark:text-gray-500 truncate ml-auto text-right">{desc}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};
