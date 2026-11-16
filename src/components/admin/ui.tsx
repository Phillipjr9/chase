/* -------------------------------------------------------------------------- */
/* Admin Console — shared UI primitives (TailAdmin/shadcn-style cards, tables, */
/* badges, drawer, modal, toasts)                                             */
/* -------------------------------------------------------------------------- */
import React, { useCallback, useSyncExternalStore } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  X,
  CheckCircle2,
  AlertCircle,
  Info,
  Download,
} from 'lucide-react';
import { cn } from '../../utils/cn';

/* --------------------------------- Format --------------------------------- */

export function fmtMoneyFull(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtSignedMoney(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${fmtMoneyFull(Math.abs(n))}`;
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return fmtDateShort(iso);
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

export function fmtBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/* ---------------------------------- Card ---------------------------------- */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div
    className={cn(
      'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
      className
    )}
    {...rest}
  />
);

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className }) => (
  <div className={cn('flex items-start justify-between gap-3 px-5 pt-5 pb-4', className)}>
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90 truncate">{title}</h3>
      {subtitle && <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* --------------------------------- Badges --------------------------------- */

export type BadgeTone = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary' | 'violet';

const BADGE_TONES: Record<BadgeTone, string> = {
  success: 'bg-success-50 text-success-700 border-success-200 dark:bg-success-500/15 dark:text-[#32D583] dark:border-success-500/30',
  error: 'bg-error-50 text-error-700 border-error-200 dark:bg-error-500/15 dark:text-[#F97066] dark:border-error-500/30',
  warning: 'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/15 dark:text-[#FDB022] dark:border-warning-500/30',
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-[#5EA0EF] dark:border-sky-500/30',
  primary: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/15 dark:text-[#5EA0EF] dark:border-blue-500/30',
  violet: 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/15 dark:text-[#A78BFA] dark:border-violet-500/30',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10',
};

export const Badge: React.FC<{ tone?: BadgeTone; children: React.ReactNode; className?: string }> = ({
  tone = 'neutral',
  children,
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
      BADGE_TONES[tone],
      className
    )}
  >
    {children}
  </span>
);

export const DeltaBadge: React.FC<{ pct: number | null; suffix?: string; invert?: boolean }> = ({ pct, suffix = '', invert }) => {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return <Badge tone="neutral">new</Badge>;
  }
  const positive = invert ? pct < 0 : pct > 0;
  const tone: BadgeTone = pct === 0 ? 'neutral' : positive ? 'success' : 'error';
  const Arrow = pct < 0 ? ArrowDown : ArrowUp;
  return (
    <Badge tone={tone}>
      {pct !== 0 && <Arrow className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%{suffix}
    </Badge>
  );
};

export const StatusPill: React.FC<{ status: 'active' | 'frozen' }> = ({ status }) => (
  <Badge tone={status === 'active' ? 'success' : 'error'}>
    <span className={cn('w-1.5 h-1.5 rounded-full', status === 'active' ? 'bg-[#12B76A]' : 'bg-[#F04438]')} />
    {status === 'active' ? 'Active' : 'Frozen'}
  </Badge>
);

export const RolePill: React.FC<{ role: 'admin' | 'member' }> = ({ role }) => (
  <Badge tone={role === 'admin' ? 'violet' : 'neutral'}>{role === 'admin' ? 'Admin' : 'Member'}</Badge>
);

/* --------------------------------- Buttons -------------------------------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md';
};

export const Btn: React.FC<BtnProps> = ({ variant = 'secondary', size = 'sm', className, ...rest }) => (
  <button
    type="button"
    className={cn(
      'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
      size === 'xs' && 'text-[11.5px] px-2.5 py-1.5',
      size === 'sm' && 'text-[12.5px] px-3.5 py-2',
      size === 'md' && 'text-[13.5px] px-4 py-2.5',
      variant === 'primary' && 'bg-[#0060F0] text-white hover:bg-[#004EC4] shadow-[0_1px_2px_rgba(0,96,240,0.3)]',
      variant === 'secondary' &&
        'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
      variant === 'ghost' && 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200',
      variant === 'danger' && 'bg-[#F04438] text-white hover:bg-[#D92D20]',
      variant === 'success' && 'bg-[#12B76A] text-white hover:bg-[#0DA15D]',
      className
    )}
    {...rest}
  />
);

export const ExportBtn: React.FC<{ onClick: () => void; label?: string; disabled?: boolean }> = ({
  onClick,
  label = 'Export CSV',
  disabled,
}) => (
  <Btn onClick={onClick} disabled={disabled} variant="secondary" size="sm">
    <Download className="w-3.5 h-3.5" />
    {label}
  </Btn>
);

/* ---------------------------------- Inputs --------------------------------- */

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input
    className={cn(
      'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[#0060F0] focus:ring-2 focus:ring-[#0060F0]/20 dark:border-gray-700 dark:bg-white/5 dark:text-gray-100 dark:placeholder-gray-500',
      className
    )}
    {...rest}
  />
);

export const SelectInput: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...rest }) => (
  <select
    className={cn(
      'rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[12.5px] font-medium text-gray-700 outline-none transition-colors focus:border-[#0060F0] focus:ring-2 focus:ring-[#0060F0]/20 cursor-pointer dark:border-gray-700 dark:bg-[#111C2E] dark:text-gray-200',
      className
    )}
    {...rest}
  >
    {children}
  </select>
);

export const Checkbox: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input
    type="checkbox"
    className={cn(
      'w-4 h-4 rounded border-gray-300 accent-[#0060F0] cursor-pointer dark:border-gray-600 dark:bg-white/5',
      className
    )}
    {...rest}
  />
);

/* ---------------------------------- Table ---------------------------------- */

export const Th: React.FC<{
  children: React.ReactNode;
  sortKey?: string;
  activeSort?: string;
  onSort?: (key: string) => void;
  className?: string;
}> = ({ children, sortKey, activeSort, onSort, className }) => {
  const active = sortKey && activeSort && activeSort.startsWith(sortKey);
  const inner = (
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey && (
        <ChevronsUpDown className={cn('w-3 h-3', active ? 'text-[#0060F0] dark:text-[#5EA0EF]' : 'text-gray-300 dark:text-gray-600')} />
      )}
    </span>
  );
  return (
    <th className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap', className)}>
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
          {inner}
        </button>
      ) : (
        inner
      )}
    </th>
  );
};

export const Td: React.FC<{ children: React.ReactNode; className?: string; colSpan?: number }> = ({ children, className, colSpan }) => (
  <td colSpan={colSpan} className={cn('px-4 py-3 text-[13px] text-gray-700 dark:text-gray-300 align-middle', className)}>
    {children}
  </td>
);

export const TableShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-w-0 max-w-full overflow-x-auto admin-scroll">
    <table className="w-full border-collapse min-w-[720px]">{children}</table>
  </div>
);

export const Pagination: React.FC<{
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun?: string;
}> = ({ page, pages, total, pageSize, onPage, noun = 'results' }) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-gray-200 dark:border-gray-800">
      <p className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
        Showing <span className="font-medium text-gray-700 dark:text-gray-200">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        <Btn variant="ghost" size="xs" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </Btn>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          let p: number;
          if (pages <= 7) p = i + 1;
          else if (page <= 4) p = i + 1;
          else if (page >= pages - 3) p = pages - 6 + i;
          else p = page - 3 + i;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cn(
                'min-w-[30px] h-[30px] rounded-lg text-[12.5px] font-medium tabular-nums cursor-pointer transition-colors',
                p === page
                  ? 'bg-[#0060F0] text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'
              )}
            >
              {p}
            </button>
          );
        })}
        <Btn variant="ghost" size="xs" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </Btn>
      </div>
    </div>
  );
};

/* --------------------------------- Avatar ---------------------------------- */

const AVATAR_COLORS = ['#0060F0', '#12B76A', '#F79009', '#7A5AF8', '#0BA5EC', '#D92D20', '#EC4899', '#0F766E'];

export const Avatar: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 36, className }) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const color = AVATAR_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 select-none', className)}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
};

/* ---------------------------------- Drawer --------------------------------- */

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, subtitle, children, width = 'max-w-[560px]' }) => {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );
  React.useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onKey]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-900/45 dark:bg-black/60 admin-fade" onClick={onClose} />
      <div className={cn('absolute right-0 top-0 h-full w-full bg-white dark:bg-[#0D1829] shadow-2xl admin-slide-in flex flex-col', width)}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <div className="text-[15.5px] font-semibold text-gray-800 dark:text-white/90 truncate">{title}</div>
            {subtitle && <div className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200 cursor-pointer"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto admin-scroll px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

/* ---------------------------------- Modal ---------------------------------- */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, children, footer, width = 'max-w-[460px]' }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-900/45 dark:bg-black/60 admin-fade" onClick={onClose} />
      <div className={cn('relative w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#101D31] border border-gray-200 dark:border-gray-800 shadow-2xl admin-fade-up', width)}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-[17px] h-[17px]" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800">{footer}</div>}
      </div>
    </div>
  );
};

/* ------------------------------ Empty / loading ---------------------------- */

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; detail?: string }> = ({ icon, title, detail }) => (
  <div className="flex flex-col items-center justify-center py-14 text-center">
    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 dark:text-gray-500 mb-3">
      {icon || <Info className="w-5 h-5" />}
    </div>
    <p className="text-[13.5px] font-semibold text-gray-700 dark:text-gray-200">{title}</p>
    {detail && <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 max-w-[320px]">{detail}</p>}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-lg bg-gray-200/70 dark:bg-white/10', className)} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 5 }) => (
  <div className="px-4 py-3 space-y-3">
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="flex gap-4">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

/* ---------------------------------- Toasts ---------------------------------- */

export interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  text: string;
}

let toastList: ToastItem[] = [];
const toastListeners = new Set<() => void>();

function emitToasts() {
  toastListeners.forEach((l) => l());
}

export function pushToast(kind: ToastItem['kind'], text: string) {
  const id = Math.random().toString(36).slice(2);
  toastList = [...toastList, { id, kind, text }];
  emitToasts();
  window.setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    emitToasts();
  }, 4200);
}

function subscribeToasts(cb: () => void) {
  toastListeners.add(cb);
  return () => toastListeners.delete(cb);
}

export const ToastStack: React.FC = () => {
  const toasts = useSyncExternalStore(
    subscribeToasts,
    () => toastList,
    () => [] as ToastItem[]
  );
  return (
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 w-[min(360px,calc(100vw-40px))]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] shadow-lg admin-fade-up bg-white dark:bg-[#13203A]',
            t.kind === 'success' && 'border-[#B5E2C4] text-[#14532D] dark:border-[#12B76A]/40 dark:text-[#6CE9A6]',
            t.kind === 'error' && 'border-[#F5C2C7] text-[#B42318] dark:border-[#F04438]/40 dark:text-[#F97066]',
            t.kind === 'info' && 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200'
          )}
        >
          {t.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : t.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  );
};

/* ---------------------------------- CSV ------------------------------------ */

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
