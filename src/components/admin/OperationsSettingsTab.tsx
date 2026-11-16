/* -------------------------------------------------------------------------- */
/* Admin Console — Payments & Disputes, Audit Trail, Settings & Backup        */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Btn,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ExportBtn,
  Modal,
  Pagination,
  SelectInput,
  TableShell,
  Td,
  TextInput,
  Th,
  downloadCsv,
  fmtBytes,
  fmtDateShort,
  fmtDateTime,
  fmtMoneyFull,
  fmtUptime,
} from './ui';
import {
  AdminAccountRow,
  AdminUserRow,
  AuditEntry,
  GlobalDispute,
  OverviewAnalytics,
  SimulatorSettings,
  User,
  inputDate,
} from './types';

/* ======================== 1. PAYMENTS & DISPUTES TAB ======================= */

interface OperationsProps {
  users: AdminUserRow[];
  selectedUser: User | null;
  globalDisputes: GlobalDispute[];
  isReadOnly: boolean;
  busy: boolean;
  onSelectUser: (id: string) => void;
  onTransfer: (payload: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
  }) => Promise<boolean>;
  onCreatePayee: (payload: {
    name: string;
    accountNumber: string;
    category: string;
  }) => Promise<boolean>;
  onUpdatePayee: (
    payeeId: string,
    patch: { name: string; accountNumber: string; category: string }
  ) => Promise<boolean>;
  onDeletePayee: (payeeId: string) => Promise<void>;
  onCreateSchedule: (payload: {
    kind: 'transfer' | 'bill' | 'card' | 'loan';
    label: string;
    fromAccountId: string;
    toAccountId?: string;
    payeeId?: string;
    amount: number;
    date: string;
    frequency: 'once' | 'monthly';
  }) => Promise<boolean>;
  onUpdateSchedule: (
    paymentId: string,
    patch: {
      label?: string;
      amount?: number;
      date?: string;
      frequency?: 'once' | 'monthly';
      status?: 'scheduled' | 'paused' | 'cancelled';
    }
  ) => Promise<boolean>;
  onDeleteSchedule: (paymentId: string) => Promise<void>;
  onOpenDispute: (payload: {
    accountId: string;
    transactionId: string;
    reason: string;
  }) => Promise<boolean>;
  onSetDisputeStatus: (
    userId: string,
    disputeId: string,
    status: 'open' | 'resolved' | 'denied'
  ) => Promise<void>;
  onIssueRefund: (userId: string, disputeId: string) => Promise<void>;
}

export const OperationsTab: React.FC<OperationsProps> = ({
  users,
  selectedUser,
  globalDisputes,
  isReadOnly,
  busy,
  onSelectUser,
  onTransfer,
  onCreatePayee,
  onUpdatePayee,
  onDeletePayee,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onOpenDispute,
  onSetDisputeStatus,
  onIssueRefund,
}) => {
  // Transfer state
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmt, setTransferAmt] = useState('');
  const [transferDesc, setTransferDesc] = useState('Admin simulated transfer');

  // Payee state
  const [payeeName, setPayeeName] = useState('');
  const [payeeAcct, setPayeeAcct] = useState('');
  const [payeeCat, setPayeeCat] = useState('Utilities');
  const [editingPayee, setEditingPayee] = useState<User['payees'][number] | null>(null);

  // Schedule state
  const [schedKind, setSchedKind] = useState<'transfer' | 'bill' | 'card' | 'loan'>('bill');
  const [schedLabel, setSchedLabel] = useState('');
  const [schedFromId, setSchedFromId] = useState('');
  const [schedTargetId, setSchedTargetId] = useState('');
  const [schedPayeeId, setSchedPayeeId] = useState('');
  const [schedAmt, setSchedAmt] = useState('');
  const [schedDate, setSchedDate] = useState(() => inputDate(-3));
  const [schedFreq, setSchedFreq] = useState<'once' | 'monthly'>('monthly');
  const [editingSched, setEditingSched] = useState<NonNullable<User['scheduledPayments']>[number] | null>(null);

  // Dispute state
  const [disputePurchase, setDisputePurchase] = useState('');
  const [disputeReason, setDisputeReason] = useState('Unauthorized merchant charge');
  const [disputeScope, setDisputeScope] = useState<'customer' | 'global'>('global');

  React.useEffect(() => {
    if (!selectedUser) return;
    const deposits = selectedUser.accounts.filter((a) =>
      ['checking', 'savings', 'cd'].includes(a.type)
    );
    const defaultFrom = deposits[0]?.id || selectedUser.accounts[0]?.id || '';
    setFromId(defaultFrom);
    const second = selectedUser.accounts.find((a) => a.id !== defaultFrom)?.id || '';
    setToId(second);
    setSchedFromId(defaultFrom);
    setSchedTargetId(second);
    setSchedPayeeId(selectedUser.payees?.[0]?.id || '');
  }, [selectedUser]);

  const depositAccounts = useMemo(
    () =>
      (selectedUser?.accounts || []).filter((a) =>
        ['checking', 'savings', 'cd'].includes(a.type)
      ),
    [selectedUser]
  );

  const eligiblePurchases = useMemo(() => {
    if (!selectedUser) return [];
    const openIds = new Set(
      (selectedUser.disputes || [])
        .filter((d) => d.status === 'open')
        .map((d) => d.transactionId)
    );
    return selectedUser.accounts
      .filter((a) => a.type === 'credit-card')
      .flatMap((card) =>
        (card.transactions || [])
          .filter((tx) => tx.amount > 0 && !openIds.has(tx.id))
          .slice(0, 40)
          .map((tx) => ({
            value: `${card.id}|${tx.id}`,
            label: `${card.name} · ${tx.description} · ${fmtMoneyFull(tx.amount)} (${fmtDateShort(tx.date)})`,
          }))
      );
  }, [selectedUser]);

  const displayedDisputes: GlobalDispute[] = useMemo(() => {
    if (disputeScope === 'global' || !selectedUser) return globalDisputes;
    return (selectedUser.disputes || []).map((d) => ({
      ...d,
      userId: selectedUser.id,
      username: selectedUser.username,
      fullName: selectedUser.fullName,
    }));
  }, [disputeScope, globalDisputes, selectedUser]);

  return (
    <div className="space-y-5">
      {/* Active Customer Switcher */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white">
            Operations Target Customer
          </p>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Transfers, payees, and scheduled items apply to the selected simulator customer (no real payment rails)
          </p>
        </div>
        <SelectInput
          aria-label="Operations customer"
          value={selectedUser?.id || ''}
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

      {/* Row 1: Simulated Internal / Debt Transfer + Payees Manager */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-6 p-5">
          <CardHeader
            title="Simulated Account / Debt Transfer"
            subtitle="Reconciles both source deposit balance and destination deposit, card, or loan ledger"
            action={<ArrowRightLeft className="w-4 h-4 text-[#0060F0]" />}
          />
          {!selectedUser || depositAccounts.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-gray-500">
              Select a customer with at least one deposit account to run transfers.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await onTransfer({
                  fromAccountId: fromId,
                  toAccountId: toId,
                  amount: Number(transferAmt),
                  description: transferDesc,
                });
                if (ok) setTransferAmt('');
              }}
              className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  From Deposit Account
                </span>
                <SelectInput
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full"
                >
                  {depositAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({fmtMoneyFull(a.balance)})
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  To Account / Card / Loan
                </span>
                <SelectInput
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full"
                >
                  {selectedUser.accounts
                    .filter((a) => a.id !== fromId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({fmtMoneyFull(a.balance)})
                      </option>
                    ))}
                </SelectInput>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Amount ($)
                </span>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="250.00"
                  value={transferAmt}
                  onChange={(e) => setTransferAmt(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Memo / Ledger Label
                </span>
                <TextInput
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  required
                />
              </label>
              <div className="sm:col-span-2 flex justify-end pt-1">
                <Btn
                  type="submit"
                  variant="primary"
                  disabled={busy || isReadOnly || !toId || !transferAmt}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Post Simulated Transfer
                </Btn>
              </div>
            </form>
          )}
        </Card>

        {/* Bill-Pay Payees */}
        <Card className="xl:col-span-6 p-5">
          <CardHeader
            title="Bill-Pay Payees"
            subtitle={`Registered payees for ${selectedUser?.fullName || 'customer'}`}
          />
          {!isReadOnly && selectedUser && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await onCreatePayee({
                  name: payeeName.trim(),
                  accountNumber: payeeAcct.trim(),
                  category: payeeCat,
                });
                if (ok) {
                  setPayeeName('');
                  setPayeeAcct('');
                }
              }}
              className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
            >
              <TextInput
                placeholder="Payee name (e.g. ConEd)"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                required
              />
              <TextInput
                placeholder="Acct ref (•••• 4821)"
                value={payeeAcct}
                onChange={(e) => setPayeeAcct(e.target.value)}
                required
              />
              <SelectInput
                value={payeeCat}
                onChange={(e) => setPayeeCat(e.target.value)}
                className="w-full"
              >
                <option value="Utilities">Utilities</option>
                <option value="Rent">Rent</option>
                <option value="Insurance">Insurance</option>
                <option value="Credit card">Credit card</option>
                <option value="Other">Other</option>
              </SelectInput>
              <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                <Plus className="w-3.5 h-3.5" /> Add Payee
              </Btn>
            </form>
          )}

          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800 max-h-[210px] overflow-y-auto admin-scroll">
            {(selectedUser?.payees || []).length === 0 ? (
              <li className="py-5 text-center text-[12.5px] text-gray-400">
                No bill-pay payees configured on this profile.
              </li>
            ) : (
              (selectedUser?.payees || []).map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                      {p.name}
                    </p>
                    <p className="text-[11.5px] text-gray-500">
                      {p.accountNumber} · {p.category}
                    </p>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1">
                      <Btn variant="ghost" size="xs" onClick={() => setEditingPayee(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => void onDeletePayee(p.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
                      </Btn>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* Row 2: Scheduled Payments Manager */}
      <Card className="p-5">
        <CardHeader
          title="Scheduled Payments & Recurring Instructions"
          subtitle="Create, pause, resume, edit, or cancel simulated scheduled transfers and bill payments"
          action={<CalendarClock className="w-4 h-4 text-[#0060F0]" />}
        />
        {!isReadOnly && selectedUser && selectedUser.accounts.length > 0 && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onCreateSchedule({
                kind: schedKind,
                label: schedLabel.trim(),
                fromAccountId: schedFromId,
                toAccountId: schedKind !== 'bill' && schedTargetId ? schedTargetId : undefined,
                payeeId: schedKind === 'bill' ? schedPayeeId : undefined,
                amount: Number(schedAmt),
                date: new Date(`${schedDate}T12:00:00`).toISOString(),
                frequency: schedFreq,
              });
              if (ok) {
                setSchedLabel('');
                setSchedAmt('');
              }
            }}
            className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 items-end"
          >
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Kind
              </span>
              <SelectInput
                value={schedKind}
                onChange={(e) => setSchedKind(e.target.value as typeof schedKind)}
                className="w-full"
              >
                <option value="bill">Bill Pay</option>
                <option value="transfer">Transfer</option>
                <option value="card">Card Payment</option>
                <option value="loan">Loan Payment</option>
              </SelectInput>
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Label
              </span>
              <TextInput
                placeholder="ConEd Autopay"
                value={schedLabel}
                onChange={(e) => setSchedLabel(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                From Account
              </span>
              <SelectInput
                value={schedFromId}
                onChange={(e) => setSchedFromId(e.target.value)}
                className="w-full"
              >
                {selectedUser.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectInput>
            </label>
            {schedKind === 'bill' ? (
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Payee
                </span>
                <SelectInput
                  value={schedPayeeId}
                  onChange={(e) => setSchedPayeeId(e.target.value)}
                  className="w-full"
                >
                  {(selectedUser.payees || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </label>
            ) : (
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Destination
                </span>
                <SelectInput
                  value={schedTargetId}
                  onChange={(e) => setSchedTargetId(e.target.value)}
                  className="w-full"
                >
                  <option value="">None</option>
                  {selectedUser.accounts
                    .filter((a) => a.id !== schedFromId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </SelectInput>
              </label>
            )}
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Amount ($)
              </span>
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                value={schedAmt}
                onChange={(e) => setSchedAmt(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Next Date
              </span>
              <TextInput
                type="date"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                required
              />
            </label>
            <div className="flex gap-1.5 items-end">
              <SelectInput
                aria-label="Schedule frequency"
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value as 'once' | 'monthly')}
              >
                <option value="monthly">Monthly</option>
                <option value="once">Once</option>
              </SelectInput>
              <Btn
                type="submit"
                variant="primary"
                disabled={busy || (schedKind === 'bill' && (selectedUser.payees || []).length === 0)}
              >
                <Plus className="w-4 h-4" />
              </Btn>
            </div>
          </form>
        )}

        <div className="mt-4">
          {(selectedUser?.scheduledPayments || []).length === 0 ? (
            <p className="text-[12.5px] text-gray-400 py-4 text-center">
              No scheduled payments on {selectedUser?.fullName || 'this profile'}.
            </p>
          ) : (
            <TableShell>
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                  <Th>Instruction</Th>
                  <Th>Kind</Th>
                  <Th>Next Date / Cadence</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  {!isReadOnly && <Th className="text-right">Controls</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {(selectedUser?.scheduledPayments || []).map((sp) => (
                  <tr key={sp.id}>
                    <Td className="font-semibold text-gray-900 dark:text-white">{sp.label}</Td>
                    <Td>
                      <Badge tone="neutral">{sp.kind}</Badge>
                    </Td>
                    <Td className="text-[12px]">
                      {fmtDateShort(sp.date)} · {sp.frequency}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          sp.status === 'scheduled'
                            ? 'success'
                            : sp.status === 'paused'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {sp.status}
                      </Badge>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {fmtMoneyFull(sp.amount)}
                    </Td>
                    {!isReadOnly && (
                      <Td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Btn variant="ghost" size="xs" onClick={() => setEditingSched(sp)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Btn>
                          <Btn
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              void onUpdateSchedule(sp.id, {
                                status: sp.status === 'paused' ? 'scheduled' : 'paused',
                              })
                            }
                            title={sp.status === 'paused' ? 'Resume' : 'Pause'}
                          >
                            {sp.status === 'paused' ? (
                              <Play className="w-3.5 h-3.5 text-[#12B76A]" />
                            ) : (
                              <Pause className="w-3.5 h-3.5 text-[#F79009]" />
                            )}
                          </Btn>
                          <Btn
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() => void onUpdateSchedule(sp.id, { status: 'cancelled' })}
                            title="Cancel schedule"
                          >
                            <XCircle className="w-3.5 h-3.5 text-gray-400" />
                          </Btn>
                          <Btn
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() => void onDeleteSchedule(sp.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
                          </Btn>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </Card>

      {/* Row 3: Card Disputes & Simulated Refunds */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
              Card Disputes &amp; Simulated Chargeback Refunds
            </h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Issuing a simulated refund posts a card-credit transaction, reduces the card balance, and resolves the dispute
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setDisputeScope('global')}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold cursor-pointer ${
                disputeScope === 'global'
                  ? 'bg-white dark:bg-[#0060F0] text-[#0060F0] dark:text-white shadow-xs'
                  : 'text-gray-500'
              }`}
            >
              All Customers ({globalDisputes.length})
            </button>
            <button
              type="button"
              onClick={() => setDisputeScope('customer')}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold cursor-pointer ${
                disputeScope === 'customer'
                  ? 'bg-white dark:bg-[#0060F0] text-[#0060F0] dark:text-white shadow-xs'
                  : 'text-gray-500'
              }`}
            >
              {selectedUser?.fullName.split(' ')[0] || 'Selected'} (
              {(selectedUser?.disputes || []).length})
            </button>
          </div>
        </div>

        {/* Open new dispute on selected customer */}
        {!isReadOnly && selectedUser && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!disputePurchase) return;
              const [accountId, transactionId] = disputePurchase.split('|');
              const ok = await onOpenDispute({
                accountId,
                transactionId,
                reason: disputeReason.trim(),
              });
              if (ok) setDisputePurchase('');
            }}
            className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end rounded-xl bg-gray-50 dark:bg-white/[0.03] p-3.5 border border-gray-100 dark:border-gray-800"
          >
            <label className="block sm:col-span-6">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Open Dispute for {selectedUser.fullName} — Eligible Card Purchase
              </span>
              <SelectInput
                value={disputePurchase}
                onChange={(e) => setDisputePurchase(e.target.value)}
                className="w-full"
              >
                <option value="">Choose card purchase…</option>
                {eligiblePurchases.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block sm:col-span-4">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Dispute Reason
              </span>
              <TextInput
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                required
              />
            </label>
            <div className="sm:col-span-2">
              <Btn
                type="submit"
                variant="primary"
                className="w-full"
                disabled={busy || !disputePurchase}
              >
                <Plus className="w-4 h-4" /> Open Case
              </Btn>
            </div>
          </form>
        )}

        <div className="mt-4">
          {displayedDisputes.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="w-5 h-5" />}
              title="No card disputes in this view"
              detail="Open a simulated dispute above on any customer card purchase to test chargeback resolution and card-credit refunds."
            />
          ) : (
            <TableShell>
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                  <Th>Customer</Th>
                  <Th>Merchant / Purchase</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  {!isReadOnly && <Th className="text-right">Resolution</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {displayedDisputes.map((d) => (
                  <tr key={`${d.userId}-${d.id}`}>
                    <Td>
                      <p className="font-medium text-gray-900 dark:text-white text-[12.5px]">
                        {d.fullName}
                      </p>
                      <p className="text-[11px] text-gray-400">@{d.username}</p>
                    </Td>
                    <Td>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">
                        {d.description}
                      </p>
                      <p className="text-[11px] text-gray-400">{fmtDateTime(d.createdAt)}</p>
                    </Td>
                    <Td className="max-w-[240px] truncate">{d.reason}</Td>
                    <Td>
                      <Badge
                        tone={
                          d.status === 'open'
                            ? 'warning'
                            : d.status === 'resolved'
                            ? 'success'
                            : 'error'
                        }
                      >
                        {d.status}
                      </Badge>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {fmtMoneyFull(d.amount)}
                    </Td>
                    {!isReadOnly && (
                      <Td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <SelectInput
                            aria-label="Dispute status"
                            value={d.status}
                            disabled={busy}
                            onChange={(e) =>
                              void onSetDisputeStatus(
                                d.userId,
                                d.id,
                                e.target.value as 'open' | 'resolved' | 'denied'
                              )
                            }
                            className="py-1 text-[11.5px]"
                          >
                            <option value="open">Open</option>
                            <option value="resolved">Resolved</option>
                            <option value="denied">Denied</option>
                          </SelectInput>
                          {d.status === 'open' && (
                            <Btn
                              variant="success"
                              size="xs"
                              disabled={busy}
                              onClick={() => void onIssueRefund(d.userId, d.id)}
                            >
                              Issue Refund
                            </Btn>
                          )}
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </Card>

      {/* Edit Payee Modal */}
      <Modal
        open={!!editingPayee}
        onClose={() => setEditingPayee(null)}
        title="Edit Bill-Pay Payee"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditingPayee(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (!editingPayee) return;
                const ok = await onUpdatePayee(editingPayee.id, {
                  name: editingPayee.name,
                  accountNumber: editingPayee.accountNumber,
                  category: editingPayee.category,
                });
                if (ok) setEditingPayee(null);
              }}
            >
              Save Payee
            </Btn>
          </>
        }
      >
        {editingPayee && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Payee Name</span>
              <TextInput
                value={editingPayee.name}
                onChange={(e) => setEditingPayee({ ...editingPayee, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Account Reference</span>
              <TextInput
                value={editingPayee.accountNumber}
                onChange={(e) =>
                  setEditingPayee({ ...editingPayee, accountNumber: e.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Category</span>
              <TextInput
                value={editingPayee.category}
                onChange={(e) => setEditingPayee({ ...editingPayee, category: e.target.value })}
              />
            </label>
          </div>
        )}
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal
        open={!!editingSched}
        onClose={() => setEditingSched(null)}
        title="Edit Scheduled Payment"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditingSched(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (!editingSched) return;
                const ok = await onUpdateSchedule(editingSched.id, {
                  label: editingSched.label,
                  amount: Number(editingSched.amount),
                  date: new Date(`${editingSched.date.slice(0, 10)}T12:00:00`).toISOString(),
                  frequency: editingSched.frequency,
                });
                if (ok) setEditingSched(null);
              }}
            >
              Save Schedule
            </Btn>
          </>
        }
      >
        {editingSched && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Label</span>
              <TextInput
                value={editingSched.label}
                onChange={(e) => setEditingSched({ ...editingSched, label: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Amount ($)</span>
              <TextInput
                type="number"
                step="0.01"
                value={String(editingSched.amount)}
                onChange={(e) =>
                  setEditingSched({ ...editingSched, amount: Number(e.target.value) })
                }
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Next Date</span>
              <TextInput
                type="date"
                value={editingSched.date.slice(0, 10)}
                onChange={(e) => setEditingSched({ ...editingSched, date: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium mb-1">Frequency</span>
              <SelectInput
                value={editingSched.frequency}
                onChange={(e) =>
                  setEditingSched({
                    ...editingSched,
                    frequency: e.target.value as 'once' | 'monthly',
                  })
                }
                className="w-full"
              >
                <option value="monthly">Monthly</option>
                <option value="once">Once</option>
              </SelectInput>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ============================== 2. AUDIT LOG TAB =========================== */

export const AuditTab: React.FC<{ audit: AuditEntry[] }> = ({ audit }) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const filtered = useMemo(
    () =>
      audit.filter((entry) =>
        `${entry.actor} ${entry.action} ${JSON.stringify(entry.details || {})}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    [audit, query]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
            Immutable Administrator Audit Trail ({filtered.length.toLocaleString()})
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Retains up to 5,000 administrative mutations, logins, backups, and impersonation sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-[260px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <TextInput
              placeholder="Filter actor, action, details…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <ExportBtn
            label="Export Audit CSV"
            onClick={() =>
              downloadCsv(
                'chase-admin-audit.csv',
                ['Timestamp', 'Actor', 'Action', 'Details'],
                filtered.map((e) => [
                  e.createdAt,
                  e.actor,
                  e.action,
                  JSON.stringify(e.details || {}),
                ])
              )
            }
          />
        </div>
      </div>

      {paged.length === 0 ? (
        <EmptyState title="No audit events match this filter" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
              <Th>Timestamp</Th>
              <Th>Operator</Th>
              <Th>Action</Th>
              <Th>Context / Metadata</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
            {paged.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]">
                <Td className="whitespace-nowrap text-[12px] text-gray-500">
                  {fmtDateTime(entry.createdAt)}
                </Td>
                <Td>
                  <Badge tone="primary">{entry.actor}</Badge>
                </Td>
                <Td className="font-semibold text-gray-900 dark:text-white">{entry.action}</Td>
                <Td className="font-mono text-[11.5px] text-gray-500 dark:text-gray-400 max-w-[420px] truncate">
                  {Object.keys(entry.details || {}).length > 0
                    ? Object.entries(entry.details)
                        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                        .join(' · ')
                    : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Pagination
        page={page}
        pages={pages}
        total={filtered.length}
        pageSize={pageSize}
        onPage={setPage}
        noun="audit events"
      />
    </Card>
  );
};

/* ====================== 3. SETTINGS, STAFF & BACKUP TAB ==================== */

interface SettingsProps {
  settings: SimulatorSettings;
  onChangeSettings: (s: SimulatorSettings) => void;
  onSaveSettings: () => Promise<void>;
  adminAccounts: AdminAccountRow[];
  currentAdminUsername: string;
  isReadOnly: boolean;
  busy: boolean;
  system: OverviewAnalytics['system'] | undefined;
  onCreateAdmin: (payload: {
    username: string;
    fullName: string;
    password: string;
    role: 'admin' | 'auditor';
  }) => Promise<boolean>;
  onUpdateAdmin: (
    admin: AdminAccountRow,
    patch: { role?: 'admin' | 'auditor'; status?: 'active' | 'disabled'; password?: string }
  ) => Promise<boolean>;
  onDeleteAdmin: (admin: AdminAccountRow) => Promise<void>;
  onChangeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  onDownloadBackup: () => Promise<void>;
  onRestoreBackup: (file: File, confirmText: string) => Promise<boolean>;
  onResetSimulator: (confirmText: string) => Promise<boolean>;
}

export const SettingsTab: React.FC<SettingsProps> = ({
  settings,
  onChangeSettings,
  onSaveSettings,
  adminAccounts,
  currentAdminUsername,
  isReadOnly,
  busy,
  system,
  onCreateAdmin,
  onUpdateAdmin,
  onDeleteAdmin,
  onChangeOwnPassword,
  onDownloadBackup,
  onRestoreBackup,
  onResetSimulator,
}) => {
  const [staffUser, setStaffUser] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPwd, setStaffPwd] = useState('');
  const [staffRole, setStaffRole] = useState<'admin' | 'auditor'>('auditor');

  // Modals
  const [ownPwdOpen, setOwnPwdOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');

  const [resetStaffTarget, setResetStaffTarget] = useState<AdminAccountRow | null>(null);
  const [resetStaffPwd, setResetStaffPwd] = useState('');

  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState('');

  const [resetSimOpen, setResetSimOpen] = useState(false);
  const [resetSimConfirm, setResetSimConfirm] = useState('');

  const isRootProtected = adminAccounts.some(
    (a) => a.protected && a.username.toLowerCase() === currentAdminUsername.toLowerCase()
  );

  return (
    <div className="space-y-5">
      {/* Row 1: Access Controls + Live Runtime Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-6 p-5">
          <CardHeader
            title="Simulator Access Guardrails"
            subtitle="Server-enforced public customer enrollment & password recovery controls"
            action={<LockKeyhole className="w-4 h-4 text-[#0060F0]" />}
          />
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 cursor-pointer">
              <Checkbox
                checked={settings.allowEnrollment}
                disabled={isReadOnly}
                onChange={(e) =>
                  onChangeSettings({ ...settings, allowEnrollment: e.target.checked })
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white">
                  Allow public customer enrollment
                </p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                  When disabled, `/api/auth/register` rejects new sign-ups while existing customers continue normally.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 cursor-pointer">
              <Checkbox
                checked={settings.allowCustomerPasswordReset}
                disabled={isReadOnly}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    allowCustomerPasswordReset: e.target.checked,
                  })
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white">
                  Allow self-service customer password reset
                </p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                  When disabled, only administrators can reset customer passwords from Users Studio.
                </p>
              </div>
            </label>

            {!isReadOnly && (
              <div className="pt-1 flex justify-end">
                <Btn variant="primary" disabled={busy} onClick={() => void onSaveSettings()}>
                  <CheckCircle2 className="w-4 h-4" />
                  Save Access Settings
                </Btn>
              </div>
            )}
          </div>
        </Card>

        {/* System Telemetry */}
        <Card className="xl:col-span-6 p-5">
          <CardHeader
            title="Environment & Runtime Telemetry"
            subtitle="Live Node.js process health, session counts & simulated storage footprint"
            action={<Badge tone="success">Simulated Rails Only</Badge>}
          />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#0060F0]" /> Runtime
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {system?.nodeVersion || 'Node.js'}
              </p>
              <p className="text-[11px] text-gray-400">{system?.platform || 'linux'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-[#12B76A]" /> Uptime
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {fmtUptime(system?.uptimeSeconds ?? 0)}
              </p>
              <p className="text-[11px] text-gray-400">Zero external rails</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#7A5AF8]" /> Memory
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {system?.heapUsedMb ?? 0} MB heap
              </p>
              <p className="text-[11px] text-gray-400">RSS {system?.rssMb ?? 0} MB</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#F79009]" /> DB File
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {fmtBytes(system?.dbSizeBytes ?? 0)}
              </p>
              <p className="text-[11px] text-gray-400">{system?.auditCount ?? 0} audit rows</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0060F0]" /> Admin Sessions
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {system?.activeAdminSessions ?? 1}
              </p>
              <p className="text-[11px] text-gray-400">HMAC + DB verified</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] p-3">
              <p className="text-gray-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#0BA5EC]" /> User Sessions
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {system?.activeCustomerSessions ?? 0}
              </p>
              <p className="text-[11px] text-gray-400">24h rolling TTL</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 2: Administrator & Read-Only Auditor Accounts */}
      <Card className="p-5">
        <CardHeader
          title="Administrator & Read-Only Auditor Staff Accounts"
          subtitle="Admins have full write privileges; Auditors can inspect, search, and export CSVs without mutating data"
          action={
            !isRootProtected && (
              <Btn variant="secondary" size="xs" onClick={() => setOwnPwdOpen(true)}>
                <KeyRound className="w-3.5 h-3.5" /> Change My Password
              </Btn>
            )
          }
        />

        {!isReadOnly && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onCreateAdmin({
                username: staffUser.trim(),
                fullName: staffName.trim(),
                password: staffPwd,
                role: staffRole,
              });
              if (ok) {
                setStaffUser('');
                setStaffName('');
                setStaffPwd('');
              }
            }}
            className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end"
          >
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Staff Username
              </span>
              <TextInput
                placeholder="compliance.jane"
                value={staffUser}
                onChange={(e) => setStaffUser(e.target.value)}
                minLength={4}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Full Name
              </span>
              <TextInput
                placeholder="Jane Doe"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Initial Password (10+ chars)
              </span>
              <TextInput
                type="password"
                placeholder="••••••••••"
                value={staffPwd}
                onChange={(e) => setStaffPwd(e.target.value)}
                minLength={10}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Role
              </span>
              <SelectInput
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as 'admin' | 'auditor')}
                className="w-full"
              >
                <option value="auditor">Read-only Auditor</option>
                <option value="admin">Full Administrator</option>
              </SelectInput>
            </label>
            <Btn type="submit" variant="primary" disabled={busy}>
              <UserPlus className="w-4 h-4" /> Add Staff Account
            </Btn>
          </form>
        )}

        <div className="mt-4">
          <TableShell>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02]">
                <Th>Operator</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                {!isReadOnly && <Th className="text-right">Controls</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {adminAccounts.map((adm) => {
                const isSelf = adm.username.toLowerCase() === currentAdminUsername.toLowerCase();
                return (
                  <tr key={adm.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {adm.fullName}
                        </span>
                        {isSelf && <Badge tone="primary">You</Badge>}
                        {adm.protected && <Badge tone="violet">Root Env</Badge>}
                      </div>
                      <p className="text-[11.5px] text-gray-500">@{adm.username}</p>
                    </Td>
                    <Td>
                      {adm.protected || isReadOnly ? (
                        <Badge tone={adm.role === 'admin' ? 'violet' : 'info'}>{adm.role}</Badge>
                      ) : (
                        <SelectInput
                          value={adm.role}
                          disabled={busy}
                          onChange={(e) =>
                            void onUpdateAdmin(adm, {
                              role: e.target.value as 'admin' | 'auditor',
                            })
                          }
                          className="py-1 text-[12px]"
                        >
                          <option value="admin">Admin</option>
                          <option value="auditor">Auditor</option>
                        </SelectInput>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={adm.status === 'active' ? 'success' : 'error'}>
                        {adm.status}
                      </Badge>
                    </Td>
                    {!isReadOnly && (
                      <Td className="text-right">
                        {!adm.protected && (
                          <div className="inline-flex items-center gap-1.5">
                            <Btn
                              variant="secondary"
                              size="xs"
                              disabled={busy || isSelf}
                              onClick={() =>
                                void onUpdateAdmin(adm, {
                                  status: adm.status === 'active' ? 'disabled' : 'active',
                                })
                              }
                            >
                              {adm.status === 'active' ? 'Disable' : 'Enable'}
                            </Btn>
                            <Btn
                              variant="secondary"
                              size="xs"
                              disabled={busy || isSelf || adm.status === 'disabled'}
                              onClick={() => {
                                setResetStaffTarget(adm);
                                setResetStaffPwd('');
                              }}
                            >
                              Reset Password
                            </Btn>
                            <Btn
                              variant="danger"
                              size="xs"
                              disabled={busy || isSelf}
                              onClick={() => void onDeleteAdmin(adm)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Btn>
                          </div>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </div>
      </Card>

      {/* Row 3: Backup & Restore + Danger Zone Simulator Reset */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-7 p-5">
          <CardHeader
            title="Encrypted-Hash JSON Backup & Restore"
            subtitle="Export or restore all simulated customers, accounts, ledgers & settings (`chase-simulator-backup-v1`)"
          />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Btn
              variant="primary"
              disabled={busy || isReadOnly}
              onClick={() => void onDownloadBackup()}
            >
              <Download className="w-4 h-4" />
              Download Full Backup (.json)
            </Btn>
            <label className="block flex-1 min-w-[200px]">
              <span className="block text-[11px] font-medium text-gray-500 mb-1">
                Select Backup JSON File
              </span>
              <input
                type="file"
                accept="application/json,.json"
                disabled={isReadOnly}
                onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                className="block w-full text-[12px] text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-white/10 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
              />
            </label>
            <Btn
              variant="danger"
              disabled={busy || isReadOnly || !backupFile}
              onClick={() => setRestoreOpen(true)}
            >
              <Upload className="w-4 h-4" />
              Restore Backup
            </Btn>
          </div>
        </Card>

        <Card className="xl:col-span-5 p-5 border-red-200 dark:border-red-500/30">
          <CardHeader
            title="Reset Simulator Environment"
            subtitle="Wipes customer profiles & sessions back to a clean Alex Rivera (`chase`) baseline while retaining audit history"
            action={<ShieldAlert className="w-4 h-4 text-[#F04438]" />}
          />
          <div className="mt-4 flex justify-end">
            <Btn
              variant="danger"
              disabled={busy || isReadOnly}
              onClick={() => setResetSimOpen(true)}
            >
              <RotateCcw className="w-4 h-4" />
              Reset Simulator…
            </Btn>
          </div>
        </Card>
      </div>

      {/* Change Own Admin Password Modal */}
      <Modal
        open={ownPwdOpen}
        onClose={() => setOwnPwdOpen(false)}
        title="Change My Administrator Password"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOwnPwdOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy || nextPwd.length < 10}
              onClick={async () => {
                const ok = await onChangeOwnPassword(curPwd, nextPwd);
                if (ok) {
                  setOwnPwdOpen(false);
                  setCurPwd('');
                  setNextPwd('');
                }
              }}
            >
              Update Password
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">Current Password</span>
            <TextInput
              type="password"
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1">New Password (10+ characters)</span>
            <TextInput
              type="password"
              value={nextPwd}
              onChange={(e) => setNextPwd(e.target.value)}
            />
          </label>
        </div>
      </Modal>

      {/* Reset Staff Password Modal */}
      <Modal
        open={!!resetStaffTarget}
        onClose={() => setResetStaffTarget(null)}
        title={`Reset Password — @${resetStaffTarget?.username}`}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setResetStaffTarget(null)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={busy || resetStaffPwd.length < 10}
              onClick={async () => {
                if (!resetStaffTarget) return;
                const ok = await onUpdateAdmin(resetStaffTarget, { password: resetStaffPwd });
                if (ok) {
                  setResetStaffTarget(null);
                  setResetStaffPwd('');
                }
              }}
            >
              Reset Staff Password
            </Btn>
          </>
        }
      >
        <label className="block">
          <span className="block text-[12px] font-medium mb-1">
            New Password (minimum 10 characters)
          </span>
          <TextInput
            type="password"
            value={resetStaffPwd}
            onChange={(e) => setResetStaffPwd(e.target.value)}
          />
        </label>
      </Modal>

      {/* Restore Backup Modal */}
      <Modal
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreConfirm('');
        }}
        title="Restore Simulator Backup"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || restoreConfirm !== 'RESTORE SIMULATOR BACKUP' || !backupFile}
              onClick={async () => {
                if (!backupFile) return;
                const ok = await onRestoreBackup(backupFile, restoreConfirm);
                if (ok) {
                  setBackupFile(null);
                  setRestoreConfirm('');
                  setRestoreOpen(false);
                }
              }}
            >
              Confirm Restore
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Restoring replaces all simulated customer records and revokes active customer sessions. Type{' '}
          <code className="font-mono font-bold text-[#F04438]">RESTORE SIMULATOR BACKUP</code>:
        </p>
        <TextInput
          className="mt-3"
          value={restoreConfirm}
          onChange={(e) => setRestoreConfirm(e.target.value)}
          placeholder="RESTORE SIMULATOR BACKUP"
        />
      </Modal>

      {/* Reset Simulator Modal */}
      <Modal
        open={resetSimOpen}
        onClose={() => {
          setResetSimOpen(false);
          setResetSimConfirm('');
        }}
        title="Confirm Full Simulator Reset"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setResetSimOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || resetSimConfirm !== 'RESET SIMULATOR'}
              onClick={async () => {
                const ok = await onResetSimulator(resetSimConfirm);
                if (ok) {
                  setResetSimConfirm('');
                  setResetSimOpen(false);
                }
              }}
            >
              Reset Simulator
            </Btn>
          </>
        }
      >
        <p className="text-[13px] text-gray-600 dark:text-gray-300">
          Deletes all customer profiles and sessions, restoring a clean <strong>chase</strong> (Alex Rivera) baseline. Type{' '}
          <code className="font-mono font-bold text-[#F04438]">RESET SIMULATOR</code>:
        </p>
        <TextInput
          className="mt-3"
          value={resetSimConfirm}
          onChange={(e) => setResetSimConfirm(e.target.value)}
          placeholder="RESET SIMULATOR"
        />
      </Modal>
    </div>
  );
};
