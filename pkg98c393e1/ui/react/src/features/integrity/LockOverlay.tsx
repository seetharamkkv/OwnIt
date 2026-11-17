/*
 * Shown over the work while the server says the session is locked (too many tab switches). Owner: Seetharam.
 * Plan task 3.2 (early version). The provider makes the work inert and polls the server; this is just the card.
 */
import React from 'react';
import { Lock } from 'lucide-react';

interface LockOverlayProps {
  tabSwitchCount: number;
}

export function LockOverlay({ tabSwitchCount }: LockOverlayProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="edu-lock-title"
      aria-describedby="edu-lock-body"
      className="fixed inset-0 z-[var(--z-lock-overlay,40)] flex items-center justify-center bg-[var(--c3-style-basic-bg-primary)]/60 p-6"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-6 text-center shadow-lg">
        <Lock className="size-6 text-[var(--c3-style-basic-fg-danger)]" />
        <h2 id="edu-lock-title" className="text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">
          Your work is locked
        </h2>
        <p id="edu-lock-body" className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          {`You left this page ${tabSwitchCount} times, so your work is paused. Your instructor has been notified and can unlock it. Your saved answers are safe.`}
        </p>
        <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">This page checks every 20 seconds and continues as soon as you are unlocked.</p>
      </div>
    </div>
  );
}
