/*
 * Integrity timeline for one submission or quiz attempt. Owner: Seetharam. Embedded by Rohith's submission viewer.
 * SCAFFOLD. TODO(Seetharam, phase 2, plan task 2.6): fetchTimeline(contextKind, contextId) (the backend method
 * EduIntegrityEvent.timeline already works), severity filter, plain-language labels, "Load more".
 */
import React from 'react';

import type { ContextKind } from '@/common/eduTypes';
import { Container } from '@/components/ui/container';

interface IntegrityTimelineProps {
  /** Defaults to ASSIGNMENT (the submission viewer). */
  contextKind?: ContextKind;
  contextId: string;
}

export function IntegrityTimeline({ contextKind = 'ASSIGNMENT', contextId }: IntegrityTimelineProps) {
  return (
    <Container title="Integrity timeline" subtitle={`Owner: Seetharam · ${contextKind.toLowerCase()} ${contextId}`}>
      <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">Not built yet.</p>
    </Container>
  );
}
