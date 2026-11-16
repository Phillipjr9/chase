/* -------------------------------------------------------------------------- */
/* Admin Console — Payments & Disputes, Audit Trail, Settings & Backup        */
/* -------------------------------------------------------------------------- */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Camera,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Globe,
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
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { ZelleLogo } from '../ChaseAssets';
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
  onCreateLedgerEntry: (payload: {
    userId: string;
    accountId: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    status: 'posted' | 'pending';
  }) => Promise<boolean>;
  onProcessScheduled?: (opts: {
    userId?: string;
    paymentId?: string;
    forceAll?: boolean;
  }) => Promise<void>;
  onRunMonthEndClose?: (opts: { userId?: string }) => Promise<void>;
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
  onCreateLedgerEntry,
  onProcessScheduled,
  onRunMonthEndClose,
}) => {
  // Zelle / Wire / QuickDeposit test environment rail state
  const [railMode, setRailMode] = useState<'zelle' | 'wire' | 'deposit'>('zelle');
  const [railDirection, setRailDirection] = useState<'in' | 'out'>('in');
  const [railAccountId, setRailAccountId] = useState('');
  const [railCounterparty, setRailCounterparty] = useState('Jordan Taylor');
  const [railAmount, setRailAmount] = useState('350');
  const [railMemo, setRailMemo] = useState('Rent split');

  // Transfer state
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmt, setTransferAmt] = useState('');
  const [transferDesc, setTransferDesc] = useState('Admin test transfer');

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
            Transfers, payees, and scheduled items apply to the selected test customer (no real payment rails)
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

      {/* Batch Engine: Executable Scheduled Payments & Month-End Statement Close */}
      <Card className="p-5 border-t-[3px] border-t-[#117ACA]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
                Batch Scheduled Processing &amp; Month-End Statement Close Engine
              </h3>
              <Badge tone="primary">Live Core Engine</Badge>
            </div>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
              Execute due or upcoming scheduled bills/transfers onto account ledgers, credit monthly Savings &amp; CD APY interest, cut credit-card statement balances, and award Ultimate Rewards® points.
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedUser && onProcessScheduled && (
                <Btn
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void onProcessScheduled({ userId: selectedUser.id, forceAll: true })
                  }
                >
                  <Play className="w-3.5 h-3.5 text-[#12B76A]" /> Execute {selectedUser.fullName.split(' ')[0]}&apos;s Schedules
                </Btn>
              )}
              {selectedUser && onRunMonthEndClose && (
                <Btn
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onRunMonthEndClose({ userId: selectedUser.id })}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#117ACA]" /> Month-End Close ({selectedUser.fullName.split(' ')[0]})
                </Btn>
              )}
              {onRunMonthEndClose && (
                <Btn
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onRunMonthEndClose({})}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Bank-Wide Month-End Close
                </Btn>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Row 0: Zelle®, Wire Transfers & QuickDeposit℠ Check Deposit (matching Customer Pay & Transfer) */}
      <Card className="p-5 border-t-[3px] border-t-[#1A4488]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-[15.5px] font-semibold text-gray-900 dark:text-white">
              Zelle®, Wire Transfers &amp; QuickDeposit℠ Simulator
            </h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              Post incoming or outgoing Zelle® payments, domestic/international wires, or mobile check deposits directly onto customer deposit accounts
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-white/5">
            <button
              type="button"
              onClick={() => {
                setRailMode('zelle');
                setRailCounterparty('Jordan Taylor');
                setRailMemo('Rent split');
              }}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                railMode === 'zelle'
                  ? 'bg-white dark:bg-gray-800 text-[#6D1ED4] shadow-sm'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              <ZelleLogo className="h-3.5 w-auto" />
              <span>Zelle®</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRailMode('wire');
                setRailCounterparty('JPMorgan Private Bank Escrow');
                setRailMemo('Domestic Fedwire Ref #88412');
              }}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                railMode === 'wire'
                  ? 'bg-white dark:bg-gray-800 text-[#1A4488] shadow-sm'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Wire Transfer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRailMode('deposit');
                setRailDirection('in');
                setRailCounterparty('Check #1094');
                setRailMemo('Chase QuickDeposit℠ Mobile Check');
              }}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                railMode === 'deposit'
                  ? 'bg-white dark:bg-gray-800 text-[#1A4488] shadow-sm'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>QuickDeposit℠</span>
            </button>
          </div>
        </div>

        {!selectedUser || depositAccounts.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-gray-500">
            Select a customer with a checking or savings account to simulate Zelle®, Wires, or QuickDeposit℠.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const targetAcct = railAccountId || depositAccounts[0]?.id;
              if (!targetAcct) return;
              const raw = Math.abs(Number(railAmount) || 0);
              if (raw <= 0) return;
              const effectiveIn = railMode === 'deposit' ? true : railDirection === 'in';
              const signed = effectiveIn ? raw : -raw;
              const desc =
                railMode === 'zelle'
                  ? `Zelle® ${effectiveIn ? 'payment from' : 'payment to'} ${railCounterparty}${railMemo ? ` — ${railMemo}` : ''}`
                  : railMode === 'wire'
                  ? `${effectiveIn ? 'Incoming Wire —' : 'Outgoing Wire —'} ${railCounterparty}${railMemo ? ` (${railMemo})` : ''}`
                  : `Chase QuickDeposit℠ — ${railCounterparty}${railMemo ? ` (${railMemo})` : ''}`;
              const cat =
                railMode === 'zelle' ? 'Zelle' : railMode === 'wire' ? 'Transfer' : 'Income';

              const ok = await onCreateLedgerEntry({
                userId: selectedUser.id,
                accountId: targetAcct,
                description: desc,
                amount: signed,
                category: cat,
                date: inputDate(0),
                status: 'posted',
              });
              if (ok) setRailAmount('');
            }}
            className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Deposit Account
              </span>
              <SelectInput
                value={railAccountId || depositAccounts[0]?.id || ''}
                onChange={(e) => setRailAccountId(e.target.value)}
                className="w-full"
              >
                {depositAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({fmtMoneyFull(a.balance)})
                  </option>
                ))}
              </SelectInput>
            </label>
            {railMode !== 'deposit' && (
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Direction
                </span>
                <SelectInput
                  value={railDirection}
                  onChange={(e) => setRailDirection(e.target.value as 'in' | 'out')}
                  className="w-full"
                >
                  <option value="in">Incoming (+ Credit)</option>
                  <option value="out">Outgoing (− Debit)</option>
                </SelectInput>
              </label>
            )}
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                {railMode === 'zelle'
                  ? 'Recipient / Sender'
                  : railMode === 'wire'
                  ? 'Beneficiary / Originating Bank'
                  : 'Check Reference'}
              </span>
              <TextInput
                value={railCounterparty}
                onChange={(e) => setRailCounterparty(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Amount ($)
              </span>
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                value={railAmount}
                onChange={(e) => setRailAmount(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Memo / Reference
              </span>
              <TextInput value={railMemo} onChange={(e) => setRailMemo(e.target.value)} />
            </label>
            <Btn type="submit" variant="primary" disabled={busy || isReadOnly || !railAmount}>
              <Send className="w-3.5 h-3.5" />
              Post {railMode === 'zelle' ? 'Zelle®' : railMode === 'wire' ? 'Wire' : 'Check Deposit'}
            </Btn>
          </form>
        )}
      </Card>

      {/* Row 1: Simulated Internal / Debt Transfer + Payees Manager */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="xl:col-span-6 p-5">
          <CardHeader
            title="Test Account / Debt Transfer"
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
                  Post Test Transfer
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
          subtitle="Create, pause, resume, edit, or cancel test scheduled transfers and bill payments"
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
                          {sp.status === 'scheduled' && onProcessScheduled && selectedUser && (
                            <Btn
                              variant="secondary"
                              size="xs"
                              disabled={busy}
                              onClick={() =>
                                void onProcessScheduled({
                                  userId: selectedUser.id,
                                  paymentId: sp.id,
                                  forceAll: true,
                                })
                              }
                              title="Execute this scheduled payment immediately"
                            >
                              Run Now
                            </Btn>
                          )}
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
              Card Disputes &amp; Test Chargeback Refunds
            </h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              Issuing a test refund posts a card-credit transaction, reduces the card balance, and resolves the dispute
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
              detail="Open a test dispute above on any customer card purchase to test chargeback resolution and card-credit refunds."
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
    patch: { username?: string; fullName?: string; lockMessage?: string; role?: 'admin' | 'auditor'; status?: 'active' | 'disabled'; password?: string; permissions?: { createUsers: boolean; generateActivity: boolean; sendMessages: boolean } }
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
  const [editStaff, setEditStaff] = useState<AdminAccountRow | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [lockStaff, setLockStaff] = useState<AdminAccountRow | null>(null);
  const [lockMessage, setLockMessage] = useState('');

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
            title="Test Environment Access Guardrails"
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
            subtitle="Live Node.js process health, session counts & test storage footprint"
            action={<Badge tone="success">Test Environment Only</Badge>}
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
                <Database className="w-3.5 h-3.5 text-[#F79009]" />{' '}
                {system?.storageBackend === 'supabase-postgres' ? 'Supabase DB' : 'DB Store'}
              </p>
              <p className="mt-1 font-bold text-gray-900 dark:text-white">
                {fmtBytes(system?.dbSizeBytes ?? 0)}
              </p>
              <p className="text-[11px] text-gray-400">
                {system?.storageBackend === 'supabase-postgres'
                  ? 'Postgres 17 synced'
                  : `${system?.auditCount ?? 0} audit rows`}
              </p>
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
          subtitle="Admins manage their assigned customers; auditors have read-only access to their assigned customers"
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
                <Th>Permissions</Th>
                <Th>Customers / unread</Th>
                <Th>Last activity</Th>
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
                      </Badge>{adm.status === 'disabled' && adm.lockMessage && <p className="text-xs mt-1">{adm.lockMessage}</p>}
                    </Td>
                    <Td>{!adm.protected && (['createUsers', 'generateActivity', 'sendMessages'] as const).map(key => <label className="block text-xs whitespace-nowrap" key={key}><input type="checkbox" className="mr-1" disabled={busy || isReadOnly} checked={adm.permissions?.[key] ?? true} onChange={e => void onUpdateAdmin(adm, { permissions: { createUsers: adm.permissions?.createUsers ?? true, generateActivity: adm.permissions?.generateActivity ?? true, sendMessages: adm.permissions?.sendMessages ?? true, [key]: e.target.checked } })} />{key === 'createUsers' ? 'Create customers' : key === 'generateActivity' ? 'Generate activity' : 'Send messages'}</label>)}</Td>
                    <Td>{adm.protected ? "—" : `${adm.customerCount ?? 0} / ${adm.unreadCount ?? 0}`}</Td>
                    <Td>{adm.lastActivity ? new Date(adm.lastActivity).toLocaleString() : "—"}</Td>
                    {!isReadOnly && (
                      <Td className="text-right">
                        {!adm.protected && (
                          <div className="inline-flex items-center gap-1.5">
                            <Btn
                              variant="secondary"
                              size="xs"
                              disabled={busy || isSelf}
                              onClick={() => {
                                if (adm.status === 'active') { setLockStaff(adm); setLockMessage(adm.lockMessage || 'This administrator account is disabled. Contact the super administrator.'); }
                                else void onUpdateAdmin(adm, { status: 'active' });
                              }}
                            >
                              {adm.status === 'active' ? 'Disable' : 'Enable'}
                            </Btn>
                            {adm.status === 'disabled' && <Btn variant="secondary" size="xs" disabled={busy} onClick={() => { setLockStaff(adm); setLockMessage(adm.lockMessage || 'This administrator account is disabled. Contact the super administrator.'); }}>Edit lock message</Btn>}
                            <Btn variant="secondary" size="xs" disabled={busy || isSelf} onClick={() => { setEditStaff(adm); setEditUsername(adm.username); setEditName(adm.fullName); }}>Edit credentials</Btn>
                            <Btn
                              variant="secondary"
                              size="xs"
                              disabled={busy || isSelf}
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
            subtitle="Export or restore all test customers, accounts, ledgers & settings (`chase-simulator-backup-v1`)"
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
            title="Reset Test Environment"
            subtitle="Deletes customer profiles and customer sessions while retaining audit history"
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

      <Modal open={!!editStaff} onClose={() => setEditStaff(null)} title="Edit administrator credentials" footer={<><Btn variant="secondary" onClick={() => setEditStaff(null)}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={async () => { if (editStaff && await onUpdateAdmin(editStaff, { username: editUsername.trim(), fullName: editName.trim() })) setEditStaff(null); }}>Save</Btn></>}>
        <p className="text-sm mb-3">Passwords cannot be viewed. Use Reset Password to set a new one.</p>
        <label className="block mb-3">Username<TextInput value={editUsername} onChange={e => setEditUsername(e.target.value)} /></label>
        <label className="block">Full name<TextInput value={editName} onChange={e => setEditName(e.target.value)} /></label>
      </Modal>
      <Modal open={!!lockStaff} onClose={() => setLockStaff(null)} title="Disable administrator" footer={<><Btn variant="secondary" onClick={() => setLockStaff(null)}>Cancel</Btn><Btn variant="danger" disabled={busy || !lockMessage.trim()} onClick={async () => { if (lockStaff && await onUpdateAdmin(lockStaff, { status: 'disabled', lockMessage: lockMessage.trim() })) setLockStaff(null); }}>Disable administrator</Btn></>}>
        <p className="text-sm mb-3">This message is shown when the administrator enters the correct password. Existing sessions will be invalidated.</p>
        <label className="block">Sign-in error message<TextInput maxLength={300} value={lockMessage} onChange={e => setLockMessage(e.target.value)} /></label>
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
        title="Restore Test Environment Backup"
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
          Restoring replaces all test customer records and revokes active customer sessions. Type{' '}
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
        title="Confirm Full Test Environment Reset"
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
          Deletes all customer profiles and their sessions. No sample customer will be restored. Type{' '}
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
