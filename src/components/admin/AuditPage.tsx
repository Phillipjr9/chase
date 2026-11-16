/* -------------------------------------------------------------------------- */
/* Admin Console — Audit log (immutable trail of auth + admin activity)        */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useState } from 'react';
import { Search, ScrollText, ShieldCheck } from 'lucide-react';
import { AdminAuditEntry, adminAudit } from '../../banking/store';
import {
  Avatar,
  Badge,
  BadgeTone,
  Card,
  EmptyState,
  ExportBtn,
  Pagination,
  SelectInput,
  Skeleton,
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtDateTime,
  pushToast,
  relTime,
} from './ui';

const ACTION_LABELS: Record<string, string> = {
  'user.registered': 'New enrollment',
  'auth.login': 'Sign-in',
  'auth.login.blocked': 'Blocked sign-in',
  'customer.frozen': 'Account frozen',
  'customer.reactivated': 'Account reactivated',
  'customer.role': 'Role changed',
  'customer.adjustment': 'Balance adjustment',
  'customer.signout': 'Forced sign-out',
  'transaction.flagged': 'Transaction flagged',
  'transaction.unflagged': 'Flag removed',
  'dispute.approved': 'Dispute approved',
  'dispute.denied': 'Dispute denied',
};

function actionTone(action: string): BadgeTone {
  if (action === 'customer.frozen' || action === 'auth.login.blocked' || action === 'dispute.denied' || action === 'transaction.flagged') return 'error';
  if (action === 'customer.adjustment') return 'info';
  if (action === 'dispute.approved' || action === 'customer.reactivated' || action === 'transaction.unflagged') return 'success';
  if (action === 'customer.role') return 'violet';
  if (action === 'user.registered') return 'primary';
  if (action === 'customer.signout') return 'warning';
  return 'neutral';
}

const ACTION_GROUPS = [
  { value: 'all', label: 'All actions' },
  { value: 'auth', label: 'Authentication' },
  { value: 'user', label: 'Enrollment' },
  { value: 'customer', label: 'Customer management' },
  { value: 'transaction', label: 'Transaction review' },
  { value: 'dispute', label: 'Disputes' },
];

export const AuditPage: React.FC = () => {
  const [rows, setRows] = useState<AdminAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAudit({ q, action, page, pageSize });
      setRows(data.entries);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [q, action, page]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    downloadCsv(
      `chase-audit-log-page${page}.csv`,
      ['Timestamp', 'Actor', 'Action', 'Target', 'Detail'],
      rows.map((e) => [e.at, e.actorName, e.action, e.target, e.detail])
    );
    pushToast('info', `Exported ${rows.length} audit entries on page ${page}.`);
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 pt-5 pb-4">
          <div className="relative flex-1 max-w-[380px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <TextInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search actor, action, target, detail…"
              className="pl-9"
              aria-label="Search audit log"
            />
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <SelectInput value={action.startsWith('all') ? 'all' : action.split('.')[0]} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action group">
              {ACTION_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </SelectInput>
            <ExportBtn onClick={exportCsv} disabled={rows.length === 0} />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-5 pb-5 space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="w-5 h-5" />}
            title="No audit entries yet"
            detail="Sign-ins, enrollments, and every admin action are recorded here automatically."
          />
        ) : (
          <TableShell>
            <thead className="border-y border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <Th>Timestamp</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {rows.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                  <Td className="whitespace-nowrap">
                    <span className="block text-[12.5px] text-gray-700 dark:text-gray-300">{relTime(e.at)}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">{fmtDateTime(e.at)}</span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={e.actorName} size={26} />
                      <span className="text-[12.5px] text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{e.actorName}</span>
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone={actionTone(e.action)}>
                      {actionTone(e.action) === 'error' && <ShieldCheck className="w-3 h-3" />}
                      {ACTION_LABELS[e.action] || e.action}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-gray-600 dark:text-gray-300">@{e.target}</Td>
                  <Td className="max-w-[320px]">
                    <span className="block text-[12.5px] text-gray-500 dark:text-gray-400 truncate" title={e.detail}>
                      {e.detail || '—'}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPage={setPage} noun="entries" />
      </Card>

      <p className="text-[11.5px] text-gray-400 dark:text-gray-500 px-1">
        The audit log keeps the most recent {`${Math.max(total, rows.length)}`} entries (server cap 600) and cannot be edited from the console —
        every administrator action is recorded with actor, timestamp, and detail.
      </p>
    </div>
  );
};
