/* -------------------------------------------------------------------------- */
/* Admin Console — Dispute resolution queue                                    */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useState } from 'react';
import { Gavel, Check, X as XIcon, FileWarning } from 'lucide-react';
import { AdminDisputeRow, User, adminDisputes, adminResolveDispute } from '../../banking/store';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  EmptyState,
  ExportBtn,
  Modal,
  Pagination,
  Skeleton,
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtDateTime,
  fmtMoneyFull,
  pushToast,
  relTime,
} from './ui';
import { cn } from '../../utils/cn';

const STATUS_TABS: { id: 'open' | 'resolved' | 'denied' | 'all'; label: string }[] = [
  { id: 'open', label: 'Open queue' },
  { id: 'resolved', label: 'Approved' },
  { id: 'denied', label: 'Denied' },
  { id: 'all', label: 'All' },
];

interface Props {
  actor: User;
  onChanged: () => void;
  onOpenCustomer: (id: string) => void;
}

export const DisputesPage: React.FC<Props> = ({ actor, onChanged, onOpenCustomer }) => {
  const [rows, setRows] = useState<AdminDisputeRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'open' | 'resolved' | 'denied' | 'all'>('open');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [resolveTarget, setResolveTarget] = useState<{ row: AdminDisputeRow; resolution: 'approved' | 'denied' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminDisputes(status, page, pageSize);
      setRows(data.disputes);
      setTotal(data.total);
      setPages(data.pages);
      setOpenCount(data.open);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to load disputes.');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const submitResolution = async () => {
    if (!resolveTarget) return;
    setBusy(true);
    try {
      await adminResolveDispute(
        actor,
        resolveTarget.row.userId,
        resolveTarget.row.id,
        resolveTarget.resolution,
        note.trim() || undefined
      );
      pushToast(
        'success',
        resolveTarget.resolution === 'approved'
          ? `Dispute approved — ${fmtMoneyFull(resolveTarget.row.amount)} refunded to the customer's card.`
          : 'Dispute denied. The customer was notified in their dispute history.'
      );
      setResolveTarget(null);
      setNote('');
      await load();
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Failed to resolve dispute.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `chase-disputes-${status}.csv`,
      ['Created', 'Customer', 'Username', 'Account', 'Transaction', 'Amount', 'Reason', 'Status', 'Resolved at', 'Resolved by', 'Note'],
      rows.map((d) => [
        d.createdAt,
        d.userName,
        d.username,
        `${d.accountName} (${d.accountMask})`,
        d.description,
        d.amount.toFixed(2),
        d.reason,
        d.status,
        d.resolvedAt || '',
        d.resolvedBy || '',
        d.resolutionNote || '',
      ])
    );
    pushToast('info', `Exported ${rows.length} disputes.`);
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 pt-5 pb-4">
          <div className="flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-white/5 p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setStatus(tab.id); setPage(1); }}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer transition-colors whitespace-nowrap',
                  status === tab.id
                    ? 'bg-white text-gray-800 shadow-sm dark:bg-[#0060F0] dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                {tab.label}
                {tab.id === 'open' && openCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#F04438] text-white text-[10px] font-bold align-middle">
                    {openCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="md:ml-auto">
            <ExportBtn onClick={exportCsv} disabled={rows.length === 0} />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-5 pb-5 space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileWarning className="w-5 h-5" />}
            title={status === 'open' ? 'The dispute queue is clear' : 'No disputes here'}
            detail={status === 'open' ? 'Every cardholder dispute has been reviewed. New disputes appear here instantly.' : undefined}
          />
        ) : (
          <TableShell>
            <thead className="border-y border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]">
              <tr>
                <Th>Filed</Th>
                <Th>Customer</Th>
                <Th>Disputed transaction</Th>
                <Th>Account</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th className="text-right">Resolution</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {rows.map((d) => (
                <tr key={`${d.userId}-${d.id}`} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                  <Td className="whitespace-nowrap">
                    <span className="block text-[12.5px] text-gray-700 dark:text-gray-300">{relTime(d.createdAt)}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">{fmtDateTime(d.createdAt)}</span>
                  </Td>
                  <Td>
                    <button type="button" onClick={() => onOpenCustomer(d.userId)} className="flex items-center gap-2 cursor-pointer group">
                      <Avatar name={d.userName} size={28} />
                      <span className="text-[12.5px] text-gray-700 dark:text-gray-300 group-hover:text-[#0060F0] dark:group-hover:text-[#5EA0EF] truncate max-w-[130px]">
                        {d.userName}
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <span className="block text-[13px] font-medium text-gray-800 dark:text-white/90 max-w-[240px] truncate">{d.description}</span>
                    <span className="block text-[11.5px] text-gray-400 dark:text-gray-500 mt-0.5">Reason: {d.reason}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px]">
                    <span className="block text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{d.accountName}</span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">••••{d.accountMask}</span>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums whitespace-nowrap text-gray-800 dark:text-white/90">
                    {fmtMoneyFull(d.amount)}
                  </Td>
                  <Td>
                    {d.status === 'open' ? (
                      <Badge tone="warning">open</Badge>
                    ) : d.status === 'resolved' ? (
                      <Badge tone="success">refunded</Badge>
                    ) : (
                      <Badge tone="error">denied</Badge>
                    )}
                  </Td>
                  <Td>
                    {d.status === 'open' ? (
                      <span className="flex items-center justify-end gap-1.5">
                        <Btn variant="success" size="xs" onClick={() => { setResolveTarget({ row: d, resolution: 'approved' }); setNote(''); }}>
                          <Check className="w-3 h-3" /> Approve
                        </Btn>
                        <Btn variant="secondary" size="xs" onClick={() => { setResolveTarget({ row: d, resolution: 'denied' }); setNote(''); }}>
                          <XIcon className="w-3 h-3" /> Deny
                        </Btn>
                      </span>
                    ) : (
                      <span className="text-right block">
                        <span className="block text-[11.5px] text-gray-500 dark:text-gray-400">
                          {d.resolvedBy ? `by ${d.resolvedBy}` : ''} {d.resolvedAt ? `· ${relTime(d.resolvedAt)}` : ''}
                        </span>
                        {d.resolutionNote && (
                          <span className="block text-[11px] text-gray-400 dark:text-gray-500 max-w-[180px] truncate ml-auto" title={d.resolutionNote}>
                            “{d.resolutionNote}”
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPage={setPage} noun="disputes" />
      </Card>

      <Modal
        open={!!resolveTarget}
        onClose={() => !busy && setResolveTarget(null)}
        title={resolveTarget?.resolution === 'approved' ? 'Approve dispute & issue refund?' : 'Deny this dispute?'}
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={() => setResolveTarget(null)} disabled={busy}>Cancel</Btn>
            <Btn
              variant={resolveTarget?.resolution === 'approved' ? 'success' : 'danger'}
              size="sm"
              onClick={submitResolution}
              disabled={busy}
            >
              <Gavel className="w-3.5 h-3.5" />
              {busy ? 'Saving…' : resolveTarget?.resolution === 'approved' ? 'Approve & refund' : 'Deny dispute'}
            </Btn>
          </>
        }
      >
        {resolveTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 px-4 py-3 text-[12.5px]">
              <p className="font-semibold text-gray-800 dark:text-white/90">{resolveTarget.row.description}</p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {fmtMoneyFull(resolveTarget.row.amount)} · {resolveTarget.row.userName} (@{resolveTarget.row.username}) · {resolveTarget.row.reason}
              </p>
            </div>
            {resolveTarget.resolution === 'approved' ? (
              <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
                The disputed amount will be credited back to the card as a “Dispute refund” transaction, and the case is recorded in the audit log.
              </p>
            ) : (
              <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
                The dispute will be closed without a refund. Add a note so the customer understands the decision.
              </p>
            )}
            <label className="block">
              <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">Resolution note (optional)</span>
              <TextInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={resolveTarget.resolution === 'approved' ? 'e.g. Merchant confirmed duplicate charge' : 'e.g. Charge verified with merchant; signed receipt on file'}
                className="mt-1.5"
                autoFocus
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
};
