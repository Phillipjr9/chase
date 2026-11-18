import React, { useMemo, useState } from 'react';
import { Printer, Download, X, FileText, Landmark } from 'lucide-react';
import type { Account, User } from '../banking/store';
import { ChaseLogo } from './ChaseLogo';

const cleanTxDesc = (s: string) =>
  String(s || '')
    .replace(/\s*·?\s*simulated debit/gi, '')
    .replace(/\s*[—–]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

interface StatementModalProps {
  user: User;
  initialAccountId?: string;
  initialTab?: 'statement' | 'tax-1099' | 'tax-1098';
  onClose: () => void;
}

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const fmtShortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function buildStatementPeriods(account?: Account) {
  const periods: { id: string; label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const monthKeys = new Set<string>();

  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  for (const tx of account?.transactions || []) {
    const parsed = new Date(tx.date);
    if (!Number.isNaN(+parsed)) {
      monthKeys.add(`${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`);
    }
  }

  const sortedKeys = [...monthKeys].sort((a, b) => b.localeCompare(a));
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const key of sortedKeys) {
    const [yStr, mStr] = key.split('-');
    const year = Number(yStr);
    const monthIdx = Number(mStr) - 1;
    const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
    const end = key === currentMonthKey
      ? endOfToday
      : new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
    periods.push({
      id: key,
      label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      start,
      end,
    });
  }

  const txDates = (account?.transactions || [])
    .map((t) => new Date(t.date))
    .filter((d) => !Number.isNaN(+d))
    .sort((a, b) => a.getTime() - b.getTime());
  const earliest = txDates[0] || new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  periods.push({
    id: 'all',
    label: `All activity (${earliest.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${endOfToday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`,
    start: new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate(), 0, 0, 0, 0),
    end: endOfToday,
  });

  return periods;
}

export const StatementModal: React.FC<StatementModalProps> = ({
  user,
  initialAccountId,
  initialTab = 'statement',
  onClose,
}) => {
  const accounts = user.accounts || [];
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId && accounts.some((a) => a.id === initialAccountId)
      ? initialAccountId
      : accounts[0]?.id || ''
  );
  const account: Account | undefined =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const periods = useMemo(() => buildStatementPeriods(account), [account]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(periods[0]?.id || '');
  const [tab, setTab] = useState<'statement' | 'tax-1099' | 'tax-1098'>(initialTab);
  const period = periods.find((p) => p.id === selectedPeriodId) || periods[0];

  const statementSummary = useMemo(() => {
    if (!account || !period) {
      return {
        txs: [],
        openingBalance: 0,
        closingBalance: 0,
        totalCredits: 0,
        totalDebits: 0,
      };
    }
    const sorted = [...(account.transactions || [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const isLiability = ['credit-card', 'auto-loan', 'mortgage'].includes(account.type);

    const afterPeriod = sorted.filter((t) => new Date(t.date) > period.end);
    const inPeriod = sorted.filter((t) => {
      const d = new Date(t.date);
      return d >= period.start && d <= period.end;
    });

    const netAfter = afterPeriod.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const closingBalance = Number(account.balance || 0) - netAfter;
    const netInPeriod = inPeriod.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const openingBalance = closingBalance - netInPeriod;

    let totalCredits = 0;
    let totalDebits = 0;
    for (const t of inPeriod) {
      const amt = Number(t.amount || 0);
      if (isLiability) {
        if (amt < 0) totalCredits += Math.abs(amt);
        else totalDebits += amt;
      } else {
        if (amt >= 0) totalCredits += amt;
        else totalDebits += Math.abs(amt);
      }
    }

    return {
      txs: [...inPeriod].reverse(),
      openingBalance,
      closingBalance,
      totalCredits,
      totalDebits,
    };
  }, [account, period]);

  const taxSummary = useMemo(() => {
    const year = new Date().getFullYear();
    const interestBearing = accounts.filter((a) => a.type === 'savings' || a.type === 'cd');
    let postedInterest = 0;
    for (const a of interestBearing) {
      for (const t of a.transactions || []) {
        if (
          Number(t.amount) > 0 &&
          /interest|apy|dividend/i.test(`${cleanTxDesc(t.description)} ${t.category}`)
        ) {
          postedInterest += Number(t.amount);
        }
      }
    }
    if (postedInterest === 0) {
      for (const a of interestBearing) {
        const rate = (Number(a.apr) || (a.type === 'cd' ? 4.25 : 2.15)) / 100;
        postedInterest += Math.max(0, Number(a.balance || 0)) * rate * 0.75;
      }
    }

    const mortgage = accounts.find((a) => a.type === 'mortgage');
    const mortgagePrincipal = Number(mortgage?.balance || 0);
    const mortgageRate = (Number(mortgage?.apr) || 6.25) / 100;
    const mortgageInterestPaid = mortgage ? mortgagePrincipal * mortgageRate * 0.85 : 0;

    return {
      year,
      interestIncome: Math.round(postedInterest * 100) / 100,
      interestAccounts: interestBearing,
      mortgage,
      mortgagePrincipal,
      mortgageInterestPaid: Math.round(mortgageInterestPaid * 100) / 100,
    };
  }, [accounts]);

  const downloadCsv = () => {
    if (!account) return;
    const rows = [
      ['Date', 'Description', 'Category', 'Status', 'Amount'].join(','),
      ...statementSummary.txs.map((t) =>
        [
          t.date.slice(0, 10),
          `"${String(t.description || '').replace(/"/g, '""')}"`,
          `"${String(t.category || '').replace(/"/g, '""')}"`,
          t.status,
          t.amount.toFixed(2),
        ].join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chase-statement-${account.mask}-${selectedPeriodId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/65 p-3 sm:p-6 print:static print:bg-white print:p-0"
      onClick={onClose}
    >
      <style>{`
        @media print {
          body > *:not(:last-child) { display: block; }
          .chase-no-print { display: none !important; }
          .chase-print-sheet {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>
      <div
        className="chase-print-sheet my-4 w-full max-w-4xl rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Toolbar (hidden when printing) */}
        <div className="chase-no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#081427] px-5 py-3.5 text-white rounded-t-lg">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('statement')}
              className={`rounded px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === 'statement'
                  ? 'bg-[#117ACA] text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <FileText className="mr-1.5 inline h-3.5 w-3.5" />
              Monthly Statement
            </button>
            <button
              type="button"
              onClick={() => setTab('tax-1099')}
              className={`rounded px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === 'tax-1099'
                  ? 'bg-[#117ACA] text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <Landmark className="mr-1.5 inline h-3.5 w-3.5" />
              Form 1099-INT
            </button>
            <button
              type="button"
              onClick={() => setTab('tax-1098')}
              className={`rounded px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === 'tax-1098'
                  ? 'bg-[#117ACA] text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <Landmark className="mr-1.5 inline h-3.5 w-3.5" />
              Form 1098 (Mortgage)
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'statement' && (
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center gap-1.5 rounded border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-[#117ACA] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0F6AB0]"
            >
              <Printer className="h-3.5 w-3.5" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement viewer"
              className="rounded p-1.5 text-white/75 hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Selector Bar for Monthly Statement */}
        {tab === 'statement' && accounts.length > 0 && (
          <div className="chase-no-print flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs">
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              Account:
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (•••• {a.mask})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              Statement cycle:
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8">
          {/* Official Chase Masthead */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#117ACA] pb-5">
            <div>
              <ChaseLogo variant="default" />
              <p className="mt-2 text-xs text-slate-500">
                JPMorgan Chase Bank, N.A. · P.O. Box 182051 · Columbus, OH 43218-2051
              </p>
              <div className="mt-4 rounded bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 border border-slate-200">
                <p className="font-bold text-slate-900 uppercase">{user.fullName}</p>
                <p>{user.address || '350 Fifth Avenue, New York, NY 10118'}</p>
                <p className="text-slate-500 mt-0.5">{user.email}</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="inline-block rounded bg-[#EAF3FB] px-3 py-1 font-bold uppercase tracking-wider text-[#0B5FA5]">
                {tab === 'statement'
                  ? 'Monthly Account Statement'
                  : tab === 'tax-1099'
                  ? `IRS Form 1099-INT · Tax Year ${taxSummary.year}`
                  : `IRS Form 1098 · Tax Year ${taxSummary.year}`}
              </div>
              {tab === 'statement' && account && period && (
                <div className="mt-3 space-y-1 text-slate-700">
                  <p>
                    <span className="text-slate-500">Statement Period:</span>{' '}
                    <span className="font-bold text-slate-900">{period.label}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Account Number:</span>{' '}
                    <span className="font-mono font-bold text-slate-900">•••• •••• {account.mask}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Product:</span>{' '}
                    <span className="font-semibold text-slate-900">{account.name}</span>
                  </p>

                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Customer Service: 1-800-935-9935 · chase.com
              </p>
            </div>
          </div>

          {tab === 'statement' && account && (
            <>
              {/* Account Summary Grid */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#081427] border-b border-slate-300 pb-1.5">
                  Account Summary
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      Beginning Balance
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                      {fmtCurrency(statementSummary.openingBalance)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      {account.type === 'credit-card' ? 'Payments & Credits' : 'Deposits & Additions'}
                    </div>
                    <div className="mt-1 text-lg font-bold text-emerald-700 tabular-nums">
                      +{fmtCurrency(statementSummary.totalCredits)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      {account.type === 'credit-card' ? 'Purchases & Charges' : 'Withdrawals & Debits'}
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                      -{fmtCurrency(statementSummary.totalDebits)}
                    </div>
                  </div>
                  <div className="rounded border border-[#117ACA]/35 bg-[#F0F7FD] p-3">
                    <div className="text-[11px] font-bold uppercase text-[#0B5FA5]">
                      Ending Balance
                    </div>
                    <div className="mt-1 text-lg font-bold text-[#081427] tabular-nums">
                      {fmtCurrency(statementSummary.closingBalance)}
                    </div>
                  </div>
                </div>

                {/* Authentic Chase Customer Service Information Bar */}
                <div className="mb-4 rounded border border-slate-300 bg-[#F8FAFC] px-4 py-2.5 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[#081427]">Customer Service Information</span>
                    <span className="ml-2 text-slate-500">JPMorgan Chase Bank, N.A. · P.O. Box 182051, Columbus, OH 43218-2051</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-slate-700">
                    <span>Web site: <strong>Chase.com</strong></span>
                    <span>Service Center: <strong>1-800-935-9935</strong></span>
                    <span>TDD: <strong>1-800-242-7383</strong></span>
                  </div>
                </div>

                {/* Credit Card / Loan APR & Rewards Disclosure Box */}
                {['credit-card', 'auto-loan', 'mortgage', 'savings', 'cd'].includes(account.type) && (
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-slate-200 bg-white p-3 text-xs sm:grid-cols-4">
                    {account.creditLimit !== undefined && (
                      <div>
                        <span className="text-slate-500 block">Credit Access Line</span>
                        <span className="font-bold text-slate-900">{fmtCurrency(account.creditLimit)}</span>
                      </div>
                    )}
                    {account.creditLimit !== undefined && (
                      <div>
                        <span className="text-slate-500 block">Available Credit</span>
                        <span className="font-bold text-slate-900">
                          {fmtCurrency(Math.max(0, account.creditLimit - account.balance))}
                        </span>
                      </div>
                    )}
                    {account.apr !== undefined && (
                      <div>
                        <span className="text-slate-500 block">
                          {['savings', 'cd'].includes(account.type) ? 'Annual Percentage Yield' : 'Annual Percentage Rate'}
                        </span>
                        <span className="font-bold text-slate-900">{Number(account.apr).toFixed(2)}%</span>
                      </div>
                    )}
                    {account.monthlyPayment !== undefined && (
                      <div>
                        <span className="text-slate-500 block">Monthly Payment Due</span>
                        <span className="font-bold text-slate-900">{fmtCurrency(account.monthlyPayment)}</span>
                      </div>
                    )}
                    {account.rewardsPoints !== undefined && (
                      <div>
                        <span className="text-slate-500 block">Ultimate Rewards® Balance</span>
                        <span className="font-bold text-[#117ACA]">
                          {Number(account.rewardsPoints || 0).toLocaleString()} pts
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Itemized Transaction Activity */}
              <div className="mt-6">
                <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#081427]">
                    Transaction Detail ({statementSummary.txs.length} items in period)
                  </h3>
                  <span className="text-[11px] text-slate-500">All amounts in USD</span>
                </div>

                {statementSummary.txs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No posted or pending transactions fell within this statement cycle. Choose another cycle above to view prior activity.
                  </p>
                ) : (
                  <table className="mt-2 w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                        <th className="py-2 pr-3">Post Date</th>
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Category</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statementSummary.txs.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-600 tabular-nums">
                            {fmtShortDate(t.date)}
                          </td>
                          <td className="py-2 pr-3 font-medium text-slate-900">{cleanTxDesc(t.description)}</td>
                          <td className="py-2 pr-3 text-slate-500">{t.category}</td>
                          <td className="py-2 pr-3 capitalize text-slate-500">{t.status}</td>
                          <td
                            className={`py-2 text-right font-semibold tabular-nums ${
                              t.amount >= 0 && !['credit-card', 'auto-loan', 'mortgage'].includes(account.type)
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                            }`}
                          >
                            {t.amount >= 0 ? `+${fmtCurrency(t.amount)}` : fmtCurrency(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {tab === 'tax-1099' && (
            <div className="mt-6 space-y-4">
              <div className="rounded border-2 border-slate-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      OMB No. 1545-0112 · Copy B For Recipient
                    </div>
                    <h3 className="mt-0.5 text-lg font-extrabold text-slate-900">
                      Form 1099-INT — Interest Income ({taxSummary.year})
                    </h3>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>PAYER&apos;S TIN: <span className="font-mono font-bold">13-4994650</span></div>
                    <div>RECIPIENT&apos;S TIN: <span className="font-mono font-bold">•••-••-{user.accounts[0]?.mask || '4821'}</span></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">Box 1. Interest income</div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">
                      {fmtCurrency(taxSummary.interestIncome)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">Box 2. Early withdrawal penalty</div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">$0.00</div>
                  </div>
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">Box 4. Federal income tax withheld</div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">$0.00</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-600">
                  <p className="font-bold text-slate-800 mb-1">Covered Deposit Accounts:</p>
                  {taxSummary.interestAccounts.length === 0 ? (
                    <p>No interest-bearing savings or CD accounts active during tax year {taxSummary.year}.</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5">
                      {taxSummary.interestAccounts.map((a) => (
                        <li key={a.id}>
                          {a.name} (•••• {a.mask}) — Current Balance {fmtCurrency(a.balance)} · APY{' '}
                          {(Number(a.apr) || (a.type === 'cd' ? 4.25 : 2.15)).toFixed(2)}%
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'tax-1098' && (
            <div className="mt-6 space-y-4">
              <div className="rounded border-2 border-slate-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      OMB No. 1545-1380 · Copy B For Payer/Borrower
                    </div>
                    <h3 className="mt-0.5 text-lg font-extrabold text-slate-900">
                      Form 1098 — Mortgage Interest Statement ({taxSummary.year})
                    </h3>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>RECIPIENT&apos;S/LENDER&apos;S TIN: <span className="font-mono font-bold">13-4994650</span></div>
                    <div>LOAN ACCOUNT: <span className="font-mono font-bold">•••• {taxSummary.mortgage?.mask || 'N/A'}</span></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">
                      Box 1. Mortgage interest received from payer(s)/borrower(s)
                    </div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">
                      {fmtCurrency(taxSummary.mortgageInterestPaid)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">
                      Box 2. Outstanding mortgage principal
                    </div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">
                      {fmtCurrency(taxSummary.mortgagePrincipal)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-300 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-600">
                      Box 10. Real estate taxes / escrow paid
                    </div>
                    <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">
                      {fmtCurrency(taxSummary.mortgage ? Number(user.home?.monthlyEscrow || 964) * 12 : 0)}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-600">
                  <span className="font-bold text-slate-800">Box 8. Address of property securing mortgage:</span>{' '}
                  {taxSummary.mortgage
                    ? user.home?.address || user.address || 'Primary Residence on File'
                    : 'No active Chase Home Lending mortgage held in this profile.'}
                </p>
              </div>
            </div>
          )}

          {/* Legal & Regulatory Footer */}
          <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
            JPMorgan Chase Bank, N.A. Member FDIC. Equal Housing Opportunity Lender.
          </div>
        </div>
      </div>
    </div>
  );
};
