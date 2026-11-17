/*
 * OwnIt logomark: a ring ("O") with a check mark inside, on the brand colour. Used in both shells.
 * Owner: Shreya (shell).
 */
import React from 'react';

interface OwnItLogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** When true, draws on a transparent background in the current text colour (for the staff top bar's 20 px slot). */
  mono?: boolean;
  className?: string;
}

export function OwnItLogo({ size = 28, mono = false, className = '' }: OwnItLogoProps) {
  const stroke = mono ? 'currentColor' : '#0B0B0D';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-label="OwnIt"
      className={className}
      fill="none"
    >
      {mono ? null : <rect width="28" height="28" rx="8" fill="#8B7CF6" />}
      <circle cx="14" cy="14" r="7.5" stroke={stroke} strokeWidth="2.4" />
      <path d="M10.4 14.2l2.4 2.4 4.9-5" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Brand name as shown next to the mark. */
export const APP_NAME = 'OwnIt';
