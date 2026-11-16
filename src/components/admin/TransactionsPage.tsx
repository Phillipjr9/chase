/* -------------------------------------------------------------------------- */
/* Admin Console — Transaction monitoring (global ledger + fraud flags)        */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useState } from 'react';
import { Search, Flag, SlidersHorizontal, ReceiptText, TrendingUp, TrendingDown, ListFilter } from 'lucide-react';
import {
  AdminTxRow,
  User,
  adminFlagTransaction,
  adminTransactions,
} from '../../banking/store';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  EmptyState,
  ExportBtn,
  Modal,
  Pagination,
  SelectInput,
  Skeleton,
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtDateTime,
  fmtMoneyFull,
  fmtSignedMoney,
  pushToast,
  relTime,
} from './ui';
import { cn } from '../../utils/cn';

const TYPE_CHIPS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Inflow' },
  { id: 'out', label: 'Outflow' },
  { id: 'transfer', label: 'Transfers' },
  { id: 'zelle', label: 'Zelle®' },
  { id: 'card', label: 'Card' },
  { id: 'loan', label: 'Loans' },
  { id: 'adjustment', label: 'Adjustments' },
  { id: 'flagged', label: 'Flagged' },
];

interface Props {
  actor: User;
  focusQuery: string | null;
  onFocusHandled: () => void;
  onOpenCustomer: (id: string) => void;
}

export const TransactionsPage: React.FC<Props> = ({ actor, focusQuery, onFocusHandled, onOpenCustomer }) => {
  const [rows, setRows] = useState<AdminTxRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, inflow: 0, outflow: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const [page, setPage] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const pageSize = 12;

  const [flagTarget, setFlagTarget] = useState<AdminTxRow | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (focusQuery) {
      setSearchInput(focusQuery);
      setQ(focusQuery);
      setPage(1);
      onFocusHandled();
    }
  }, [focusQuery, onFocusHandled]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminTransactions({
        q,
        type,
        sort,
        page,
        pageSize,
        min: min ? Number(min) : null,
        max: max ? Number(max) : null,
        from: from || null,
        to: to || null,
      });
      setRows(data.transactions);
      setSummary(data.summary);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [q, type, sort, page, min, max, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const onSort = (key: string) => {
    setSort((prev) => {
      if (prev.startsWith(key)) return prev.endsWith('-asc') ? `${key}-desc` : `${key}-asc`;
      return key === 'amount' ? 'amount-desc' : 'date-desc';
    });
    setPage(1);
  };

  const submitFlag = async () => {
    if (!flagTarget) return;
    setBusy(true);
    const next = !flagTarget.flagged;
    try {
      await adminFlagTransaction(
        actor,
        { userId: flagTarget.userId, accountId: flagTarget.accountId, txId: flagTarget.id },
        next,
        next ? flagNote.trim() || undefined : undefined
      );
      pushToast('success', next ? 'Transaction flagged for fraud review.' : 'Flag removed from transaction.');
      setFlagTarget(null);
      setFlagNote('');
      await load();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to update flag.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `chase-transactions-page${page}.csv`,
      ['Date', 'Description', 'Category', 'Customer', 'Username', 'Account', 'Amount', 'Status', 'Flagged', 'Flag note'],
      rows.map((t) => [
        t.date,
        t.description,
        t.category,
        t.userName,
        t.username,
        `${t.accountName} (${t.accountMask})`,
        t.amount.toFixed(2),
        t.status,
        t.flagged ? 'yes' : 'no',
        t.flagNote || '',
      ])
    );
    pushToast('info', `Exported ${rows.length} transactions on page ${page}.`);
  };

  const activeFilters =
    (q ? 1 : 0) + (type !== 'all' ? 1 : 0) + (min ? 1 : 0) + (max ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4 p-5 admin-fade-up">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/90">
            <ListFilter className="w-[20px] h-[20px]" />
          </span>
          <span>
            <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">Matching transactions</span>
            <span className="block text-[20px] font-bold text-gray-800 dark:text-white/90 tabular-nums">{summary.count.toLocaleString('en-US')}</span>
          </span>
        </Card>
        <Card className="flex items-center gap-4 p-5 admin-fade-up">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-[#32D583]">
            <TrendingUp className="w-[20px] h-[20px]" />
          </span>
          <span>
            <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">Inflow (filtered)</span>
            <span className="block text-[20px] font-bold text-success-600 dark:text-[#32D583] tabular-nums">{fmtMoneyFull(summary.inflow)}</span>
          </span>
        </Card>
        <Card className="flex items-center gap-4 p-5 admin-fade-up">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-[#F97066]">
            <TrendingDown className="w-[20px] h-[20px]" />
          </span>
          <span>
            <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">Outflow (filtered)</span>
            <span className="block text-[20px] font-bold text-gray-800 dark:text-white/90 tabular-nums">{fmtMoneyFull(summary.outflow)}</span>
          </span>
        </Card>
      </div>

      <Card>
        {/* Toolbar */}
        <div className="px-5 pt-5 pb-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-[420px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <TextInput
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search description, customer, account, category…"
                className="pl-9"
                aria-label="Search transactions"
              />
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <SelectInput value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort transactions">
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="amount-desc">Largest amount</option>
                <option value="amount-asc">Smallest amount</option>
              </SelectInput>
              <Btn variant={advancedOpen || activeFilters > 1 ? 'primary' : 'secondary'} size="sm" onClick={() => setAdvancedOpen((v) => !v)}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
              </Btn>
              <ExportBtn onClick={exportCsv} disabled={rows.length === 0} />
            </div>
          </div>

          {/* Type chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto admin-scroll pb-1">
            {TYPE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => { setType(chip.id); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors border',
                  type === chip.id
                    ? 'bg-[#0060F0] border-[#0060F0] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10'
                )}
              >
                {chip.label}
                {chip.id === 'flagged' && summary.count >= 0 && rows.some((r) => r.flagged) && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#F04438] align-middle" />
                )}
              </button>
            ))}
          </div>

          {/* Advanced filters */}
          {advancedOpen && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 p-4 admin-fade-up">
              <label className="block">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Min amount</span>
                <TextInput type="number" min="0" step="1" value={min} onChange={(e) => { setMin(e.target.value); setPage(1); }} placeholder="0" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Max amount</span>
                <TextInput type="number" min="0" step="1" value={max} onChange={(e) => { setMax(e.target.value); setPage(1); }} placeholder="∞" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">From date</span>
                <TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">To date</span>
                <TextInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1" />
              </label>
              <div className="flex items-end">
                <Btn
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => { setMin(''); setMax(''); setFrom(''); setTo(''); setSearchInput(''); setType('all'); setPage(1); }}
                >
                  Reset all filters
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* Ledger table */}
        {loading && rows.length === 0 ? (
          <div className="px-5 pb-5 space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="w-5 h-5" />}
            title="No transactions match your filters"
            detail="Adjust the search, chips, or advanced filters to widen the results."
          />
        ) : (
          <TableShell>
            <thead className="border-y border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <Th sortKey="date" activeSort={sort} onSort={onSort}>Date</Th>
                <Th>Transaction</Th>
                <Th>Customer</Th>
                <Th>Account</Th>
                <Th sortKey="amount" activeSort={sort} onSort={onSort} className="text-right">Amount</Th>
                <Th className="text-right">Review</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {rows.map((t) => (
                <tr key={`${t.userId}-${t.accountId}-${t.id}`} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                  <Td className="whitespace-nowrap">
                    <span className="block text-[12.5px] text-gray-700 dark:text-gray-300">{relTime(t.date)}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">{fmtDateTime(t.date)}</span>
                  </Td>
                  <Td>
                    <span className="block text-[13px] font-medium text-gray-800 dark:text-white/90 max-w-[280px] truncate">
                      {t.description}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone="neutral">{t.category}</Badge>
                      {t.status === 'pending' && <Badge tone="warning">pending</Badge>}
                      {t.flagged && (
                        <span title={t.flagNote || undefined}>
                          <Badge tone="error"><Flag className="w-3 h-3" /> flagged</Badge>
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>
                    <button type="button" onClick={() => onOpenCustomer(t.userId)} className="flex items-center gap-2 cursor-pointer group">
                      <Avatar name={t.userName} size={28} />
                      <span className="text-[12.5px] text-gray-700 dark:text-gray-300 group-hover:text-[#0060F0] dark:group-hover:text-[#5EA0EF] truncate max-w-[140px]">
                        {t.userName}
                      </span>
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-[12.5px] text-gray-700 dark:text-gray-300 max-w-[170px] truncate">{t.accountName}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">••••{t.accountMask} · {t.accountType}</span>
                  </Td>
                  <Td className={cn('text-right font-semibold tabular-nums whitespace-nowrap', t.amount >= 0 ? 'text-success-600 dark:text-[#32D583]' : 'text-gray-800 dark:text-white/90')}>
                    {fmtSignedMoney(t.amount)}
                  </Td>
                  <Td>
                    <span className="flex justify-end">
                      <Btn
                        variant={t.flagged ? 'danger' : 'secondary'}
                        size="xs"
                        onClick={() => { setFlagTarget(t); setFlagNote(t.flagNote || ''); }}
                      >
                        <Flag className="w-3 h-3" />
                        {t.flagged ? 'Unflag' : 'Flag'}
                      </Btn>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPage={setPage} noun="transactions" />
      </Card>

      {/* Flag modal */}
      <Modal
        open={!!flagTarget}
        onClose={() => !busy && setFlagTarget(null)}
        title={flagTarget?.flagged ? 'Remove fraud flag?' : 'Flag transaction for review'}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setFlagTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn variant={flagTarget?.flagged ? 'primary' : 'danger'} size="sm" onClick={submitFlag} disabled={busy}>
              {busy ? 'Saving…' : flagTarget?.flagged ? 'Remove flag' : 'Flag transaction'}
            </Btn>
          </>
        }
      >
        {flagTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 px-4 py-3 text-[12.5px]">
              <p className="font-semibold text-gray-800 dark:text-white/90">{flagTarget.description}</p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {fmtMoneyFull(Math.abs(flagTarget.amount))} · {flagTarget.userName} (@{flagTarget.username}) · {flagTarget.accountName} (••{flagTarget.accountMask})
              </p>
              <p className="text-gray-400 dark:text-gray-500 mt-0.5">{fmtDateTime(flagTarget.date)} · {flagTarget.category}</p>
            </div>
            {!flagTarget.flagged && (
              <label className="block">
                <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Review note (stored in the audit log)</span>
                <TextInput
                  value={flagNote}
                  onChange={(e) => setFlagNote(e.target.value)}
                  placeholder="e.g. Velocity check — 6 wires in 24h"
                  className="mt-1.5"
                  autoFocus
                />
              </label>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
