import React from 'react';
import { CHASE_ASSETS, ChaseCardImage } from './ChaseAssets';

interface LogoProps {
  variant?: 'default' | 'white';
  className?: string;
}

/**
 * Official Chase logo lockup (CHASE wordmark + Octagon), served from the
 * asset Chase publishes at chase.com/content/dam/.../logo_chase_headerfooter.svg
 * — not a redrawn approximation.
 */
export const ChaseLogo: React.FC<LogoProps> = ({ variant = 'default', className = '' }) => (
  <img
    src={CHASE_ASSETS.logo}
    alt="Chase"
    draggable={false}
    className={`h-[24px] w-auto ${variant === 'white' ? 'brightness-0 invert' : ''} ${className}`}
  />
);

/**
 * The Chase Octagon, cropped from the official logo mark itself so the
 * geometry is exact rather than reconstructed.
 */
export const ChaseOctagon: React.FC<{ color?: string; size?: number; className?: string }> = ({
  color = '#117ACA',
  size = 28,
  className = '',
}) => (
  <span
    className={`relative inline-block overflow-hidden ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  >
    <img
      src={CHASE_ASSETS.logo}
      alt=""
      draggable={false}
      className="absolute top-0 h-auto max-w-none"
      style={{
        width: size * (126 / 24),
        right: 0,
        filter: color === '#FFFFFF' ? 'brightness(0) invert(1)' : 'none',
      }}
    />
  </span>
);

/* -------------------------------------------------------------------------- */
/* Legacy exports kept for the marketing sections. They now render the real   */
/* Chase card artwork downloaded from creditcards.chase.com.                  */
/* -------------------------------------------------------------------------- */

export const FreedomUnlimitedCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <ChaseCardImage product="freedom" className={className} />
);

export const TotalCheckingDebitCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <ChaseCardImage product="debit" className={className} />
);
