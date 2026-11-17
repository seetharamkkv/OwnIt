/*
 * Student "My courses": one card per active enrollment with role, instructor, open / done / grade stats and the next
 * due item. Mockup board 2 (resource/mockups/STUDENT_UI_MOCKUPS.md). Data: EduSession.me (memberships) joined with
 * EduSubmission.myDashboard (assignments and quizzes per course). Owner: Shreya.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';

import { useMe } from '@/common/auth/useMe';
import type { CourseMembership, MyAssignmentRow, MyQuizRow } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { dueLabel, Eyebrow, remainingLabel, SwCard } from '@/common/stepwise/ui';
import { fetchMyDashboard } from '@/features/workspace/api';
import { useNow } from '@/features/workspace/deadline';

interface CourseStats {
  open: number;
  done: number;
  /** Average of released scores as a percentage, or null when nothing is released yet. */
  gradePct: number | null;
  next?: { title: string; dueAt?: string; href: string };
}

const ROLE_LABEL: Record<CourseMembership['courseRole'], string> = { STUDENT: 'Student', TA: 'TA', INSTRUCTOR: 'Instructor' };

function isOpenAssignment(a: MyAssignmentRow, now: number): boolean {
  if (a.status !== 'NOT_STARTED' && a.status !== 'IN_PROGRESS') {
    return false;
  }
  const last = a.lateUntil ?? a.dueAt;
  return !last || new Date(last).getTime() > now;
}

function isOpenQuiz(q: MyQuizRow, now: number): boolean {
  const closes = q.closesAt ? new Date(q.closesAt).getTime() : null;
  const handedIn = (q.attemptsUsed ?? 0) > 0 && !q.openAttemptId && !q.canStart;
  return !handedIn && (closes === null || closes > now);
}

function statsFor(courseId: string, assignments: MyAssignmentRow[], quizzes: MyQuizRow[], now: number): CourseStats {
  const mine = assignments.filter((a) => a.courseId === courseId);
  const myQuizzes = quizzes.filter((q) => q.courseId === courseId);

  const openA = mine.filter((a) => isOpenAssignment(a, now));
  const openQ = myQuizzes.filter((q) => isOpenQuiz(q, now));
  const doneA = mine.filter((a) => a.status === 'SUBMITTED' || a.status === 'GRADED' || a.status === 'RETURNED');
  const doneQ = myQuizzes.filter((q) => (q.attemptsUsed ?? 0) > 0 && !q.openAttemptId && !isOpenQuiz(q, now));

  const released = mine.filter((a) => a.gradesReleasedAt && a.score != null && a.totalPoints);
  const quizScored = myQuizzes.filter((q) => q.resultsVisible && q.bestScore != null && q.maxScore);
  const pcts = [
    ...released.map((a) => ((a.score as number) / (a.totalPoints as number)) * 100),
    ...quizScored.map((q) => ((q.bestScore as number) / (q.maxScore as number)) * 100),
  ];
  const gradePct = pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;

  const candidates = [
    ...openA.map((a) => ({ title: a.title ?? a.assignmentId, dueAt: a.dueAt, href: routes.workspace(a.assignmentId) })),
    ...openQ.map((q) => ({ title: q.title ?? q.quizId, dueAt: q.closesAt, href: routes.quizTake(q.quizId) })),
  ].sort((x, y) => (x.dueAt ? new Date(x.dueAt).getTime() : Infinity) - (y.dueAt ? new Date(y.dueAt).getTime() : Infinity));

  return { open: openA.length + openQ.length, done: doneA.length + doneQ.length, gradePct, next: candidates[0] };
}

/** Short tile text from a course code: "CS101-F26" → "CS101". */
function shortCode(code: string | undefined): string {
  return (code ?? '?').split('-')[0].slice(0, 6);
}

export default function StudentCoursesPage() {
  const { me, loading, error } = useMe();
  const now = useNow(60_000);
  const dashboard = useQuery({ queryKey: queryKeys.myDashboard(), queryFn: fetchMyDashboard, staleTime: 30_000 });

  const courses = useMemo(() => me?.courses ?? [], [me]);
  const stats = useMemo(() => {
    const a = dashboard.data?.assignments ?? [];
    const q = dashboard.data?.quizzes ?? [];
    return new Map(courses.map((c) => [c.courseId, statsFor(c.courseId, a, q, now)]));
  }, [courses, dashboard.data, now]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (error || !me) {
    return <PageMessage title="Could not load your courses" message={eduErrorMessage(error)} />;
  }

  const asStudent = courses.filter((c) => c.courseRole === 'STUDENT').length;
  const asTa = courses.filter((c) => c.courseRole === 'TA').length;
  const term = courses.find((c) => c.courseTerm)?.courseTerm;
  const roleSummary = [asStudent ? `${asStudent} as a student` : null, asTa ? `${asTa} as a TA` : null].filter(Boolean).join(', ');

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-16 pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em]">My courses</h1>
          <p className="mt-2 text-[15px] text-[var(--sw-fg-muted)]">
            {courses.length} course{courses.length === 1 ? '' : 's'}
            {term ? ` this semester` : ''}
            {roleSummary ? ` · ${roleSummary}` : ''}
          </p>
        </div>
        {term ? (
          <span className="rounded-full border border-[var(--sw-border-strong)] px-3 py-1.5 text-[13px] text-[var(--sw-fg-muted)]">{term}</span>
        ) : null}
      </div>

      {dashboard.error ? (
        <p className="mb-4 text-[13px] text-[var(--sw-danger)]">Could not load progress: {eduErrorMessage(dashboard.error)}</p>
      ) : null}

      {courses.length === 0 ? (
        <SwCard className="p-6 text-[var(--sw-fg-muted)]">You&apos;re not enrolled in any course yet. Your instructor or an admin adds you to a course.</SwCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => (
            <CourseCard key={c.courseId} course={c} stats={stats.get(c.courseId)} loadingStats={dashboard.isLoading} now={now} />
          ))}
        </div>
      )}

      <p className="mt-8 text-[13px] text-[var(--sw-fg-faint)]">
        Past semesters stay read-only. You can still open your submissions and download the assembled files.
      </p>
    </main>
  );
}

function CourseCard({ course, stats, loadingStats, now }: { course: CourseMembership; stats?: CourseStats; loadingStats: boolean; now: number }) {
  const grade = stats?.gradePct == null ? '—' : `${Math.round(stats.gradePct)}%`;
  return (
    <SwCard className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--sw-accent-bg)] font-[family-name:var(--sw-mono)] text-[13px] font-semibold text-[var(--sw-accent-soft)]">
          {shortCode(course.courseCode)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[var(--sw-fg-faint)]">
            {course.courseCode}
            {course.courseTerm ? ` · ${course.courseTerm}` : ''}
          </div>
          <Link to={routes.course(course.courseId)} className="mt-0.5 block text-[17px] font-semibold !text-[var(--sw-fg)] no-underline hover:underline">
            {course.courseTitle ?? course.courseId}
          </Link>
          <div className="mt-1 text-[13px] text-[var(--sw-fg-muted)]">
            {course.instructorNames?.length ? course.instructorNames.join(', ') : 'Instructor not assigned yet'}
          </div>
        </div>
        <span className="rounded-full border border-[var(--sw-border-strong)] px-2.5 py-[3px] text-[12px] text-[var(--sw-fg-muted)]">
          {ROLE_LABEL[course.courseRole]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={loadingStats ? '…' : String(stats?.open ?? 0)} label="open" />
        <Stat value={loadingStats ? '…' : String(stats?.done ?? 0)} label="handed in" />
        <Stat value={loadingStats ? '…' : grade} label={stats?.gradePct == null ? 'no grades yet' : 'avg grade'} tone={stats?.gradePct != null ? 'success' : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sw-border)] pt-3">
        {stats?.next ? (
          <div className="min-w-0">
            <Eyebrow>Next</Eyebrow>
            <div className="mt-0.5 truncate text-[14px]">{stats.next.title}</div>
            {stats.next.dueAt ? (
              <div className="text-[12px] text-[var(--sw-fg-faint)]">
                Due {dueLabel(stats.next.dueAt, now)} · {remainingLabel(stats.next.dueAt, now)}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-[13px] text-[var(--sw-fg-faint)]">{loadingStats ? 'Loading…' : 'Nothing open right now'}</div>
        )}
        <Link
          to={stats?.next?.href ?? routes.course(course.courseId)}
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[var(--sw-accent-strong)] bg-[var(--sw-accent-bg)] px-4 text-[13px] font-medium !text-[var(--sw-fg)] no-underline"
        >
          {stats?.next ? 'Continue' : 'Open course'}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </SwCard>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'success' }) {
  return (
    <div className="rounded-xl border border-[var(--sw-border)] bg-[var(--sw-card-2)] px-3 py-2.5">
      <div className={`text-[20px] font-semibold ${tone === 'success' ? 'text-[var(--sw-success)]' : ''}`}>{value}</div>
      <div className="text-[12px] text-[var(--sw-fg-muted)]">{label}</div>
    </div>
  );
}
