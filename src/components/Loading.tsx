import React from 'react';
import { ChaseLogo } from './ChaseLogo';

type Tone = 'blue' | 'white' | 'muted';
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-9 h-9' };
const TRACK: Record<Tone, string> = {
  blue: 'border-[#C9DDF2] border-t-[#0060F0]',
  white: 'border-white/30 border-t-white',
  muted: 'border-[#DCE2E8] border-t-[#6E7781]',
};

/**
 * Chase uses a simple spinning ring while Online Banking loads. This is the
 * same pattern: a thin ring with a single colored arc, no bouncing dots.
 */
export const Spinner: React.FC<{
  size?: Size;
  tone?: Tone;
  label?: string;
  className?: string;
}> = ({ size = 'md', tone = 'blue', label, className = '' }) => (
  <span
    role={label ? 'status' : undefined}
    aria-hidden={label ? undefined : true}
    className={`inline-flex items-center justify-center shrink-0 ${className}`}
  >
    <span
      className={`${SIZES[size]} rounded-full border-2 animate-spin ${TRACK[tone]}`}
      style={{ animationDuration: '700ms' }}
    />
    {label && <span className="sr-only">{label}</span>}
  </span>
);

/** Button label with an inline spinner; used for every async Chase action. */
export const BusyLabel: React.FC<{
  busy: boolean;
  idle: React.ReactNode;
  busyText: React.ReactNode;
  tone?: Tone;
}> = ({ busy, idle, busyText, tone = 'white' }) => (
  <>
    {busy && <Spinner size="sm" tone={tone} />}
    <span>{busy ? busyText : idle}</span>
  </>
);

/**
 * Full-page Chase loading screen: solid Chase blue with the white octagon
 * lockup and a spinning ring, matching the screen Chase shows after sign-in.
 */
export const ChasePageLoader: React.FC<{ message?: string; detail?: string }> = ({
  message = 'Loading your accounts…',
  detail = 'Securely connecting to Online Banking.',
}) => (
  <div
    className="min-h-screen bg-[#005EB8] text-white flex flex-col items-center justify-center px-6"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col items-center text-center">
      <ChaseLogo variant="white" className="opacity-95" />
      <span
        className="mt-8 w-11 h-11 rounded-full border-[3px] border-white/25 border-t-white animate-spin"
        style={{ animationDuration: '750ms' }}
        aria-hidden="true"
      />
      <p className="mt-6 text-[15px] font-semibold">{message}</p>
      <p className="mt-1.5 text-[12.5px] text-white/75">{detail}</p>
      <span className="sr-only">Please wait</span>
    </div>
  </div>
);

/** Shimmering placeholder block. */
export const Skeleton: React.FC<{ className?: string; rounded?: string }> = ({
  className = '',
  rounded = 'rounded-[4px]',
}) => (
  <span
    aria-hidden="true"
    className={`block bg-[#E9EDF1] relative overflow-hidden ${rounded} ${className}`}
  >
    <span className="absolute inset-0 chase-shimmer" />
  </span>
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 2,
  className = '',
}) => (
  <span className={`block space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </span>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`border border-[#E4E6E8] bg-white rounded-[6px] p-5 ${className}`}
    aria-hidden="true"
  >
    <div className="flex items-start gap-4">
      <Skeleton className="w-[70px] h-[44px]" rounded="rounded-[5px]" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="w-24 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2.5 w-2/3 ml-auto" />
      </div>
    </div>
  </div>
);

/** Dashboard skeleton shown while the signed-in session is being restored. */
export const DashboardSkeleton: React.FC = () => (
  <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6" role="status" aria-live="polite">
    <span className="sr-only">Loading your accounts</span>
    <div className="flex items-end justify-between gap-4 pb-4 border-b border-[#E4E6E8]">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="h-9 w-[130px]" />
        <Skeleton className="h-9 w-[105px]" />
      </div>
    </div>
    <div className="mt-5 border border-[#E4E6E8] rounded-[6px] grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#E4E6E8]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-5 py-4 space-y-2.5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      ))}
    </div>
    <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-[86px]" rounded="rounded-[6px]" />
      ))}
    </div>
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
        <Skeleton className="h-4 w-32" />
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="lg:col-span-4 space-y-3">
        <Skeleton className="h-[180px]" rounded="rounded-[6px]" />
        <Skeleton className="h-[120px]" rounded="rounded-[6px]" />
      </div>
    </div>
    <div className="mt-5 flex items-center justify-center gap-2.5 text-[12.5px] text-[#5C5C5C]">
      <Spinner size="sm" />
      <span>Loading account data…</span>
    </div>
  </div>
);

/** Credit-card page skeleton while the card activity loads. */
export const CardPageSkeleton: React.FC = () => (
  <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6" role="status" aria-live="polite">
    <span className="sr-only">Loading your credit card</span>
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="w-[164px] h-[102px]" rounded="rounded-[7px]" />
    </div>
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
    <div className="mt-6 flex gap-2.5 border-t border-[#E4E6E8] pt-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-11 w-[130px]" />
      ))}
    </div>
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Skeleton className="h-[164px]" rounded="rounded-[6px]" />
      <Skeleton className="h-[164px]" rounded="rounded-[6px]" />
    </div>
    <div className="mt-5 flex items-center justify-center gap-2.5 text-[12.5px] text-[#5C5C5C]">
      <Spinner size="sm" />
      <span>Loading card activity…</span>
    </div>
  </div>
);
