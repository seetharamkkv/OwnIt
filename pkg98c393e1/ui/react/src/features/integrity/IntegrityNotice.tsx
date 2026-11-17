/*
 * Integrity notices: a small stack of alerts in the bottom-right corner (the template has no toast component).
 * Owner: Seetharam. Plan task 1.8. Auto-dismissed after 4 s, at most 3 at once, announced politely to screen readers.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import { Alert, AlertAppearanceIcon, AlertClose, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';

import type { IntegrityNoticeItem } from './types';

interface IntegrityNoticeProps {
  notices: IntegrityNoticeItem[];
  onDismiss: (id: number) => void;
}

export function IntegrityNotice({ notices, onDismiss }: IntegrityNoticeProps) {
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast,70)] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((n) => (
        <Alert key={n.id} variant="solid" appearance={n.tone} className="pointer-events-auto shadow-md">
          <AlertAppearanceIcon appearance={n.tone} />
          <AlertContent>
            <AlertTitle>{n.title}</AlertTitle>
            {n.message ? <AlertDescription>{n.message}</AlertDescription> : null}
          </AlertContent>
          <AlertClose onClick={() => onDismiss(n.id)} />
        </Alert>
      ))}
    </div>,
    document.body
  );
}
