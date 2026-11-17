/*
 * Student grades: released scores for every assignment and quiz, grouped by course, with course and overall
 * averages. Only released scores are shown (EduAssignment.gradesReleasedAt, EduQuiz.showResults); everything else
 * says why it is not visible yet. Data: EduSubmission.myDashboard. Owner: Shreenidhi (grading) with Shreya (shell).
 *
 * `StudentGradesList` is also used on the course page's Grades tab (one course).
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Spinner } from '@/components/ui/spinner';

import { useMe } from '@/common/auth/useMe';
import type { CourseMembership, MyAssignmentRow, MyQuizRow } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { Eyebrow, formatScore, type ItemKind, KindBadge, shortDate, SwCard } from '@/common/stepwise/ui';
import { fetchMyDashboard } from '@/features/workspace/api';

/** One line in the grades table, normalised from an assignment or a quiz. */
interface GradeRow {
  id: string;
  kind: ItemKind;
  title: string;
  courseId: string;
  /** Due date for assignments, close date for quizzes. */
  dateIso?: string;
  dateLabel: string;
  status: 'released' | 'waiting' | 'open' | 'missing' | 'hidden';
  statusText: string;
  score?: number;
  maxScore?: number;
  late: boolean;
  latePenaltyPct?: number;
  href: string;
}

function assignmentRow(a: MyAssignmentRow, now: number): GradeRow {
  const handedIn = a.status === 'SUBMITTED' || a.status === 'GRADED' || a.status === 'RETURNED';
  const lastChance = a.lateUntil ?? a.dueAt;
  const closed = !!lastChance && new Date(lastChance).getTime() < now;
  let status: GradeRow['status'];
  let statusText: string;
  if (handedIn && a.gradesReleasedAt && a.score != null) {
    status = 'released';
    statusText = `Released ${shortDate(a.gradesReleasedAt)}`;
  } else if (handedIn) {
    status = 'waiting';
    statusText = `Submitted ${shortDate(a.submittedAt)} · grade not released yet`;
  } else if (closed) {
    status = 'missing';
    statusText = 'Not submitted';
  } else {
    status = 'open';
    statusText = a.status === 'IN_PROGRESS' ? `In progress · ${a.completedSteps ?? 0}/${a.totalSteps ?? 0} steps` : 'Not started';
  }
  return {
    id: a.assignmentId,
    kind: a.fileKind ?? 'PY',
    title: a.title ?? a.assignmentId,
    courseId: a.courseId ?? '',
    dateIso: a.dueAt,
    dateLabel: a.dueAt ? `Due ${shortDate(a.dueAt)}` : 'No due date',
    status,
    statusText,
    score: status === 'released' ? a.score : undefined,
    maxScore: a.totalPoints,
    late: !!a.late,
    latePenaltyPct: a.latePenaltyPct,
    href: routes.workspace(a.assignmentId),
  };
}

function quizRow(q: MyQuizRow, now: number): GradeRow {
  const taken = (q.attemptsUsed ?? 0) > 0 && !q.openAttemptId;
  const closed = !!q.closesAt && new Date(q.closesAt).getTime() < now;
  let status: GradeRow['status'];
  let statusText: string;
  if (taken && q.resultsVisible && q.bestScore != null) {
    status = 'released';
    statusText = `${q.attemptsUsed} of ${q.attemptsAllowed ?? 1} attempt${(q.attemptsAllowed ?? 1) === 1 ? '' : 's'} · best score`;
  } else if (taken && q.showResults === 'NEVER') {
    status = 'hidden';
    statusText = 'Taken · results are not shown for this quiz';
  } else if (taken) {
    status = 'waiting';
    statusText = q.showResults === 'AFTER_CLOSE' ? `Taken · results after it closes ${shortDate(q.closesAt)}` : 'Taken · results not released yet';
  } else if (q.openAttemptId) {
    status = 'open';
    statusText = 'Attempt in progress';
  } else if (closed) {
    status = 'missing';
    statusText = 'Not taken';
  } else {
    status = 'open';
    statusText = 'Not taken yet';
  }
  return {
    id: q.quizId,
    kind: 'QUIZ',
    title: q.title ?? q.quizId,
    courseId: q.courseId ?? '',
    dateIso: q.closesAt,
    dateLabel: q.closesAt ? `Closes ${shortDate(q.closesAt)}` : 'No close date',
    status,
    statusText,
    score: status === 'released' ? q.bestScore : undefined,
    maxScore: q.maxScore,
    late: false,
    href: routes.quizTake(q.quizId),
  };
}

function pct(row: GradeRow): number | null {
  return row.score != null && row.maxScore ? (row.score / row.maxScore) * 100 : null;
}

function average(rows: GradeRow[]): number | null {
  const released = rows.filter((r) => r.status === 'released' && r.maxScore);
  if (!released.length) {
    return null;
  }
  // Points-weighted: sum of scores over sum of maximums, so a 2-point warm-up doesn't count like a 30-point project.
  const earned = released.reduce((s, r) => s + (r.score ?? 0), 0);
  const possible = released.reduce((s, r) => s + (r.maxScore ?? 0), 0);
  return possible ? (earned / possible) * 100 : null;
}

function letter(p: number): string {
  if (p >= 93) return 'A';
  if (p >= 90) return 'A−';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B−';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C−';
  if (p >= 60) return 'D';
  return 'F';
}

const STATUS_CLASS: Record<GradeRow['status'], string> = {
  released: 'text-[var(--sw-success)] bg-[var(--sw-success-bg)]',
  waiting: 'text-[var(--sw-accent-soft)] bg-[var(--sw-accent-bg)]',
  open: 'text-[var(--sw-fg-muted)] bg-[var(--sw-row-hover)]',
  missing: 'text-[var(--sw-danger)] bg-[var(--sw-danger-bg)]',
  hidden: 'text-[var(--sw-fg-faint)] bg-[var(--sw-row-hover)]',
};
const STATUS_LABEL: Record<GradeRow['status'], string> = {
  released: 'Graded',
  waiting: 'Awaiting grade',
  open: 'Open',
  missing: 'Missing',
  hidden: 'Hidden',
};

/** Grades for one course (when `courseId` is given) or every course, as a list of course sections. */
export function StudentGradesList({ courseId }: { courseId?: string }) {
  const { me } = useMe();
  const dashboard = useQuery({ queryKey: queryKeys.myDashboard(), queryFn: fetchMyDashboard, staleTime: 30_000 });
  const now = Date.now();

  const sections = useMemo(() => {
    const d = dashboard.data;
    const memberships = (me?.courses ?? []).filter((c) => !courseId || c.courseId === courseId);
    if (!d) {
      return [] as { course: CourseMembership; rows: GradeRow[]; avg: number | null }[];
    }
    const rows = [...(d.assignments ?? []).map((a) => assignmentRow(a, now)), ...(d.quizzes ?? []).map((q) => quizRow(q, now))];
    return memberships.map((course) => {
      const mine = rows
        .filter((r) => r.courseId === course.courseId)
        .sort((a, b) => (a.dateIso ? new Date(a.dateIso).getTime() : Infinity) - (b.dateIso ? new Date(b.dateIso).getTime() : Infinity));
      return { course, rows: mine, avg: average(mine) };
    });
  }, [dashboard.data, me, courseId, now]);

  if (dashboard.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (dashboard.error) {
    return <p className="text-[13px] text-[var(--sw-danger)]">Could not load grades: {eduErrorMessage(dashboard.error)}</p>;
  }
  if (!sections.length) {
    return <SwCard className="p-6 text-[var(--sw-fg-muted)]">No courses yet, so nothing to grade.</SwCard>;
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ course, rows, avg }) => (
        <section key={course.courseId} aria-labelledby={`grades-${course.courseId}`}>
          <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>{course.courseCode}</Eyebrow>
              <h2 id={`grades-${course.courseId}`} className="text-[18px] font-semibold">
                {courseId ? 'Your grades' : course.courseTitle}
              </h2>
            </div>
            <div className="text-right">
              <div className={`text-[22px] font-semibold ${avg == null ? 'text-[var(--sw-fg-faint)]' : 'text-[var(--sw-success)]'}`}>
                {avg == null ? '—' : `${Math.round(avg)}% · ${letter(avg)}`}
              </div>
              <div className="text-[12px] text-[var(--sw-fg-faint)]">
                {avg == null ? 'no grades released yet' : `average of ${rows.filter((r) => r.status === 'released').length} released`}
              </div>
            </div>
          </div>
          {rows.length === 0 ? (
            <SwCard className="p-5 text-[13px] text-[var(--sw-fg-muted)]">Nothing has been released in this course yet.</SwCard>
          ) : (
            <SwCard className="overflow-hidden">
              <ul className="divide-y divide-[var(--sw-border)]">
                {rows.map((r) => (
                  <GradeLine key={`${r.kind}-${r.id}`} row={r} />
                ))}
              </ul>
            </SwCard>
          )}
        </section>
      ))}
    </div>
  );
}

function GradeLine({ row }: { row: GradeRow }) {
  const p = pct(row);
  return (
    <li className="sw-row flex flex-wrap items-center gap-4 px-4 py-3.5">
      <KindBadge kind={row.kind} />
      <div className="min-w-0 flex-[1_1_240px]">
        <Link to={row.href} className="block truncate text-[15px] font-medium !text-[var(--sw-fg)] no-underline hover:underline">
          {row.title}
        </Link>
        <div className="mt-[3px] text-[12px] text-[var(--sw-fg-faint)]">
          {row.dateLabel} · {row.statusText}
          {row.late ? (
            <span className="ml-2 rounded px-1.5 py-px text-[11px] font-semibold text-[var(--sw-warn)] bg-[var(--sw-warn-bg)]">
              Late{row.latePenaltyPct ? ` · −${row.latePenaltyPct}%` : ''}
            </span>
          ) : null}
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
      <div className="w-[150px] shrink-0 text-right">
        <div className={`text-[15px] font-semibold ${row.status === 'released' ? 'text-[var(--sw-success)]' : 'text-[var(--sw-fg-faint)]'}`}>
          {row.status === 'released' ? formatScore(row.score, row.maxScore) : row.maxScore ? `— / ${row.maxScore}` : '—'}
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-[var(--sw-track)]">
          {p != null ? (
            <div
              className={`h-1 rounded ${p >= 70 ? 'bg-[var(--sw-success)]' : 'bg-[var(--sw-warn)]'}`}
              // Width is data-driven; Tailwind cannot generate arbitrary percentages ahead of time.
              style={{ width: `${Math.max(0, Math.min(100, Math.round(p)))}%` }}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function StudentGradesPage() {
  const { me, loading, error } = useMe();
  const dashboard = useQuery({ queryKey: queryKeys.myDashboard(), queryFn: fetchMyDashboard, staleTime: 30_000 });

  const summary = useMemo(() => {
    const d = dashboard.data;
    const now = Date.now();
    const rows = d ? [...(d.assignments ?? []).map((a) => assignmentRow(a, now)), ...(d.quizzes ?? []).map((q) => quizRow(q, now))] : [];
    return {
      overall: average(rows),
      released: rows.filter((r) => r.status === 'released').length,
      waiting: rows.filter((r) => r.status === 'waiting').length,
      missing: rows.filter((r) => r.status === 'missing').length,
      late: rows.filter((r) => r.late).length,
    };
  }, [dashboard.data]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (error || !me) {
    return <PageMessage title="Could not load your grades" message={eduErrorMessage(error)} />;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-16 pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em]">Grades</h1>
          <p className="mt-2 text-[15px] text-[var(--sw-fg-muted)]">Scores appear here once your instructor releases them. Visible-test results in the workspace are feedback, not grades.</p>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile value={summary.overall == null ? '—' : `${Math.round(summary.overall)}%`} label={summary.overall == null ? 'Overall · nothing released' : `Overall · ${letter(summary.overall)}`} tone={summary.overall != null ? 'success' : undefined} />
        <Tile value={String(summary.released)} label="Graded" />
        <Tile value={String(summary.waiting)} label="Awaiting grade" />
        <Tile value={String(summary.missing)} label="Missing" tone={summary.missing > 0 ? 'danger' : undefined} />
      </div>

      <StudentGradesList />

      <p className="mt-8 text-[13px] text-[var(--sw-fg-faint)]">
        Course averages are points-weighted over released items only. Late work shows the penalty your instructor set; the score here already includes it.
      </p>
    </main>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'success' | 'danger' }) {
  return (
    <SwCard className="rounded-xl p-3.5">
      <div className={`text-[24px] font-semibold ${tone === 'success' ? 'text-[var(--sw-success)]' : tone === 'danger' ? 'text-[var(--sw-danger)]' : ''}`}>{value}</div>
      <div className="mt-0.5 text-[12px] text-[var(--sw-fg-muted)]">{label}</div>
    </SwCard>
  );
}
