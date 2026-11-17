/*
 * Small building blocks shared by the Stepwise student pages (mockups: resource/mockups/STUDENT_UI_MOCKUPS.md).
 * Owner: Keya (student workspace) with Shreya (shell). Colors come from styles/stepwise.css.
 */
import React from 'react';

import type { FileKind } from '@/common/eduTypes';

/** What a row on the student pages is about: an assignment file kind, or a quiz. */
export type ItemKind = FileKind | 'QUIZ';

const KIND_LABEL: Record<ItemKind, string> = { PY: '.py', IPYNB: '.ipynb', DOCX: '.docx', QUIZ: 'Quiz' };
const KIND_CLASS: Record<ItemKind, string> = {
  PY: 'text-[var(--sw-kind-py)] bg-[var(--sw-kind-py-bg)]',
  IPYNB: 'text-[var(--sw-kind-ipynb)] bg-[var(--sw-kind-ipynb-bg)]',
  DOCX: 'text-[var(--sw-kind-docx)] bg-[var(--sw-kind-docx-bg)]',
  QUIZ: 'text-[var(--sw-kind-quiz)] bg-[var(--sw-kind-quiz-bg)]',
};

/** `.py` / `.ipynb` / `.docx` / `Quiz` chip in the kind's color. */
export function KindBadge({ kind }: { kind: ItemKind }) {
  return (
    <span
      className={`inline-flex min-w-[44px] items-center justify-center rounded-md px-2 py-1 font-[family-name:var(--sw-mono)] text-[11px] font-medium ${KIND_CLASS[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

/** Short file name for the kind, used next to the course name. */
export function kindFileName(kind: ItemKind): string {
  return kind === 'QUIZ' ? 'quiz' : KIND_LABEL[kind].slice(1);
}

/** Segmented progress bar: one segment per step, green when done, accent for the current one. */
export function StepBar({ done, total, current = false, height = 6 }: { done: number; total: number; current?: boolean; height?: number }) {
  const count = Math.max(total, 1);
  const segments = Array.from({ length: count }, (_, i) => {
    if (i < done) {
      return 'bg-[var(--sw-success)]';
    }
    if (i === done && current && done < total) {
      return 'bg-[var(--sw-accent)]';
    }
    return 'bg-[var(--sw-track)]';
  });
  return (
    <div className={`grid gap-1 ${gridCols(count)}`}>
      {segments.map((cls, i) => (
        <div key={i} className={`rounded ${cls} ${height === 4 ? 'h-1' : 'h-1.5'}`} />
      ))}
    </div>
  );
}

/** Tailwind needs literal class names; steps are capped at 12 segments for layout. */
function gridCols(n: number): string {
  const cols = [
    '',
    'grid-cols-1',
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-5',
    'grid-cols-6',
    'grid-cols-7',
    'grid-cols-8',
    'grid-cols-9',
    'grid-cols-10',
    'grid-cols-11',
    'grid-cols-12',
  ];
  return cols[Math.min(n, 12)] ?? 'grid-cols-12';
}

/** Thin single bar with a percentage fill. */
export function PercentBar({ pct, complete }: { pct: number; complete: boolean }) {
  const width = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="h-1 overflow-hidden rounded bg-[var(--sw-track)]">
      <div
        className={`h-1 rounded ${complete ? 'bg-[var(--sw-success)]' : 'bg-[var(--sw-accent)]'}`}
        // Width is data-driven; Tailwind cannot generate arbitrary percentages ahead of time.
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/** Filter chips row ("All 9 · Homework 8 · Quizzes 1"). */
export function Chips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count: number }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`min-h-9 rounded-full border px-3.5 text-[13px] ${
              on
                ? 'border-[var(--sw-accent)] bg-[var(--sw-accent-bg)] text-[var(--sw-fg)]'
                : 'border-[var(--sw-border-strong)] bg-transparent text-[var(--sw-fg-muted)] hover:text-[var(--sw-fg)]'
            }`}
          >
            {o.label} <span className="opacity-70">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Card surface used across the student pages. */
export function SwCard({ children, className = '', tone = 'default' }: { children: React.ReactNode; className?: string; tone?: 'default' | 'accent' | 'warn' }) {
  const toneClass =
    tone === 'accent'
      ? 'border-[var(--sw-accent-border)] bg-[var(--sw-accent-card)]'
      : tone === 'warn'
        ? 'border-[var(--sw-warn-border)] bg-[var(--sw-warn-card)]'
        : 'border-[var(--sw-border)] bg-[var(--sw-card)]';
  return <div className={`rounded-2xl border ${toneClass} ${className}`}>{children}</div>;
}

/** Uppercase tracking label ("UP NEXT", "TODAY"). */
export function Eyebrow({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${accent ? 'text-[var(--sw-accent-soft)]' : 'text-[var(--sw-fg-faint)]'}`}>
      {children}
    </span>
  );
}

/* ---- dates ------------------------------------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Tomorrow", "This week" (next 7 days) or "Later"; "Overdue" when the time has passed. */
export function dueGroup(dueIso: string | undefined, now: number): 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Later' | 'No due date' {
  if (!dueIso) {
    return 'No due date';
  }
  const due = new Date(dueIso).getTime();
  if (due < now) {
    return 'Overdue';
  }
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  return days <= 7 ? 'This week' : 'Later';
}

export const DUE_GROUP_ORDER = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No due date'] as const;

export function monthShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

export function dayOfMonth(iso: string): string {
  return String(new Date(iso).getDate());
}

/** "11:59 PM" for today, "Wed 11:59 PM" within a week, else "Nov 23". */
export function dueLabel(iso: string, now: number): string {
  const due = new Date(iso);
  const days = Math.round((startOfDay(due.getTime()) - startOfDay(now)) / DAY_MS);
  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) {
    return time;
  }
  if (days > 0 && days <= 7) {
    return `${due.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "10h 54m left", "3 days left", "2 weeks left". */
export function remainingLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) {
    return 'past due';
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `${Math.max(minutes, 1)}m left`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m left`;
  }
  const days = Math.floor(hours / 24);
  if (days < 14) {
    return `${days} day${days === 1 ? '' : 's'} left`;
  }
  return `${Math.floor(days / 7)} weeks left`;
}

export function shortDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) {
    return 'Good morning';
  }
  return h < 18 ? 'Good afternoon' : 'Good evening';
}

export function longDate(now: number): string {
  return new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function initials(name: string | undefined): string {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

export function formatScore(score: number | undefined, max: number | undefined): string {
  if (score == null) {
    return '—';
  }
  const s = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return max != null ? `${s} / ${Number.isInteger(max) ? max : max.toFixed(1)}` : s;
}
