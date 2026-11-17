/*
 * Due dates, late windows, and countdowns for the student workspace. Owner: Keya.
 * Mirrors EduSubmission.finalDeadline on the server; the server stays the authority and rejects late saves itself.
 */
import { useEffect, useState } from 'react';

import type { WorkspaceModel } from './model';

const toDate = (iso?: string) => (iso ? new Date(iso) : null);

/** When work becomes late: the extension if granted, otherwise the due date. */
export function dueDate(model: WorkspaceModel): Date | null {
  return toDate(model.submission?.extensionUntil) ?? toDate(model.assignment.dueAt);
}

/** Last moment the student may still save or submit: the latest of extension, late window, and due date. */
export function finalDeadline(model: WorkspaceModel): Date | null {
  const dates = [model.submission?.extensionUntil, model.assignment.lateUntil, model.assignment.dueAt]
    .map(toDate)
    .filter((d): d is Date => d !== null);
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

/** "2d 4h", "3h 12m", "45m", or "under a minute". */
export function formatRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return 'under a minute';
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) {
    return '—';
  }
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Current time, refreshed every `intervalMs` (30 s by default) so countdowns move. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type DeadlineState =
  | { kind: 'none' }
  | { kind: 'open'; due: Date; remainingMs: number }
  | { kind: 'late'; due: Date; until: Date; remainingMs: number }
  | { kind: 'closed'; due: Date | null };

export function deadlineState(model: WorkspaceModel, now: number): DeadlineState {
  const due = dueDate(model);
  const last = finalDeadline(model);
  if (model.assignment.status === 'CLOSED') {
    return { kind: 'closed', due };
  }
  if (!due || !last) {
    return { kind: 'none' };
  }
  if (now < due.getTime()) {
    return { kind: 'open', due, remainingMs: due.getTime() - now };
  }
  if (now < last.getTime()) {
    return { kind: 'late', due, until: last, remainingMs: last.getTime() - now };
  }
  return { kind: 'closed', due };
}
