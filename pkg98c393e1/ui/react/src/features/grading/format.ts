/*
 * Gradebook formatting helpers. Owner: Shreenidhi.
 */

/** A score with at most two decimals, or an em dash when there is none. */
export function formatScore(score?: number | null): string {
  if (score == null || Number.isNaN(score)) {
    return '—';
  }
  return String(Math.round(score * 100) / 100);
}

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Not graded yet',
  GRADED: 'Graded',
  RETURNED: 'Returned',
};

export function statusLabel(status?: string): string {
  return STATUS_LABEL[status ?? 'NOT_STARTED'] ?? status ?? 'Not started';
}

export function formatDay(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export function formatDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}
