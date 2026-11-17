/*
 * Small display helpers shared by the quiz pages. Owner: Shreenidhi. PROJECT_PLAN.md 7.4.
 */
import type { MyQuizRow, QuestionKind, QuizStatus, ResultsVisibility } from '@/common/eduTypes';

export const KIND_LABEL: Record<QuestionKind, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTI_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  SHORT_ANSWER: 'Short answer',
  CODE: 'Code',
};

export const KIND_HINT: Record<QuestionKind, string> = {
  SINGLE_CHOICE: 'Pick one answer.',
  MULTI_CHOICE: 'Select all that apply. Only a fully correct selection earns the points.',
  TRUE_FALSE: 'Pick true or false.',
  SHORT_ANSWER: 'Spaces and capitals are ignored.',
  CODE: 'Write Python. The visible test gives feedback only; hidden tests and your instructor decide the grade.',
};

export const QUIZ_STATUS_LABEL: Record<QuizStatus, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', CLOSED: 'Closed' };

export const RESULTS_LABEL: Record<ResultsVisibility, string> = {
  AFTER_SUBMIT: 'Right after submitting',
  AFTER_CLOSE: 'After the quiz closes',
  NEVER: 'Never (score only to staff)',
};

export function pts(n: number | undefined | null): string {
  const v = n ?? 0;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${s} pt${v === 1 ? '' : 's'}`;
}

export function scoreText(score: number | undefined | null, max: number | undefined | null): string {
  if (score == null) {
    return '—';
  }
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  return max != null ? `${fmt(score)} / ${fmt(max)}` : fmt(score);
}

/** "14:32" or "1:04:09" for a countdown. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function dateTime(iso: string | undefined | null): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Student-facing state of a quiz row for lists and the start screen. */
export type QuizRowState = 'in-progress' | 'available' | 'upcoming' | 'done' | 'closed';

export function quizRowState(q: MyQuizRow, now: number): QuizRowState {
  if (q.openAttemptId) {
    return 'in-progress';
  }
  if (q.canStart) {
    return 'available';
  }
  if (q.opensAt && new Date(q.opensAt).getTime() > now) {
    return 'upcoming';
  }
  if ((q.attemptsUsed ?? 0) > 0) {
    return 'done';
  }
  return 'closed';
}

export const ROW_STATE_LABEL: Record<QuizRowState, string> = {
  'in-progress': 'In progress',
  available: 'Open',
  upcoming: 'Upcoming',
  done: 'Submitted',
  closed: 'Closed',
};

/** datetime-local input value (local time, minutes) ⇄ ISO string. */
export function toLocalInput(iso: string | undefined | null): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | undefined {
  return v ? new Date(v).toISOString() : undefined;
}
