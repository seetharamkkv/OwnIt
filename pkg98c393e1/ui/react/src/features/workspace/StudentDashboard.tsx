/*
 * Student home page section: summary tiles, open work across every course, and recently released grades
 * (EduSubmission.myDashboard). Owner: Keya. Shown by HomePage for users who are a student in at least one course.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { MetricCard, MetricCardHeader, MetricCardLabel, MetricCardValue } from '@/components/ui/metric-card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

import type { MyAssignmentRow, MyQuizRow } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';

import { fetchMyDashboard } from './api';
import { formatDateTime, formatRemaining, useNow } from './deadline';

/** Open items shown in "Up next"; the course pages list everything. */
const MAX_UP_NEXT = 8;

const isOpen = (row: MyAssignmentRow) => row.status === 'NOT_STARTED' || row.status === 'IN_PROGRESS';

function stillAccepting(row: MyAssignmentRow, now: number): boolean {
  const last = [row.dueAt, row.lateUntil].filter(Boolean).map((d) => new Date(d as string).getTime());
  return !last.length || Math.max(...last) > now;
}

function dueLabel(due: string | undefined, now: number): { text: string; late: boolean } {
  if (!due) {
    return { text: 'No due date', late: false };
  }
  const ms = new Date(due).getTime() - now;
  return ms > 0 ? { text: `Due ${formatDateTime(due)} · ${formatRemaining(ms)} left`, late: false } : { text: `Was due ${formatDateTime(due)}`, late: true };
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const dash = useQuery({ queryKey: queryKeys.myDashboard(), queryFn: fetchMyDashboard, staleTime: 60_000 });

  const upNextAssignments = useMemo(
    () => (dash.data?.assignments ?? []).filter((a) => isOpen(a) && stillAccepting(a, now)).slice(0, MAX_UP_NEXT),
    [dash.data, now]
  );
  const openQuizzes = useMemo(
    () => (dash.data?.quizzes ?? []).filter((q: MyQuizRow) => q.openAttemptId || q.canStart).slice(0, MAX_UP_NEXT),
    [dash.data]
  );

  if (dash.isLoading) {
    return (
      <Container title="My work">
        <Spinner />
      </Container>
    );
  }
  if (dash.error || !dash.data) {
    return (
      <Container title="My work">
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(dash.error)}</p>
      </Container>
    );
  }

  const d = dash.data;
  const graded = d.recentlyGraded ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Due in the next 7 days" value={d.dueSoonCount ?? 0} />
        <Tile label="In progress" value={d.inProgressCount ?? 0} />
        <Tile label="Past due, late window open" value={d.lateWindowCount ?? 0} />
      </div>

      <Container title="Up next" subtitle="Assignments and quizzes you can still work on">
        {upNextAssignments.length === 0 && openQuizzes.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{"You're all caught up."}</p>
        ) : (
          <ul className="flex flex-col">
            {upNextAssignments.map((a) => {
              const due = dueLabel(a.dueAt, now);
              const total = a.totalSteps ?? 0;
              const done = a.completedSteps ?? 0;
              const step = a.nextStepOrder;
              return (
                <li key={a.assignmentId} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                      {a.courseCode ? `${a.courseCode} · ` : ''}
                      {a.title ?? a.assignmentId}
                    </span>
                    <span className={due.late ? 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]' : 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]'}>
                      {due.text}
                      {a.failingVisibleTests ? ` · ${a.failingVisibleTests} failing ${a.failingVisibleTests === 1 ? 'test' : 'tests'}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex w-36 flex-col gap-1">
                      <Progress value={total ? (done / total) * 100 : 0} size="sm" aria-label={`${done} of ${total} steps done`} />
                      <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                        {done} of {total} steps done
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      appearance="secondary"
                      size="sm"
                      trailingIcon={<ArrowRight />}
                      onClick={() => navigate(step ? `${routes.workspace(a.assignmentId)}?step=${step}` : routes.workspace(a.assignmentId))}
                    >
                      {a.status === 'NOT_STARTED' ? 'Start' : step ? `Continue step ${step}` : 'Review'}
                    </Button>
                  </div>
                </li>
              );
            })}
            {openQuizzes.map((q) => (
              <li key={q.quizId} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-c3-bold-body-p2 flex items-center gap-2 text-[var(--c3-style-basic-fg-primary)]">
                    {q.courseCode ? `${q.courseCode} · ` : ''}
                    {q.title ?? q.quizId}
                    <Badge variant="outline" appearance="secondary" size="sm">
                      Quiz
                    </Badge>
                  </span>
                  <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {q.closesAt ? `Closes ${formatDateTime(q.closesAt)}` : 'No closing date'}
                    {q.effectiveTimeLimitMin ? ` · ${q.effectiveTimeLimitMin} min` : ''}
                  </span>
                </div>
                <Button variant="outline" appearance="secondary" size="sm" trailingIcon={<ArrowRight />} onClick={() => navigate(routes.quizTake(q.quizId))}>
                  {q.openAttemptId ? 'Resume' : 'Start'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container title="Recently graded">
        {graded.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No grades have been released yet.</p>
        ) : (
          <ul className="flex flex-col">
            {graded.map((g) => (
              <li key={`${g.itemKind}-${g.itemId}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] py-2">
                <span className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                  {g.courseCode ? `${g.courseCode} · ` : ''}
                  {g.title ?? g.itemId}
                </span>
                <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                  {g.score ?? '—'}
                  {g.maxScore != null ? ` / ${g.maxScore}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <MetricCard className="p-4">
      <MetricCardHeader>
        <MetricCardLabel>{label}</MetricCardLabel>
      </MetricCardHeader>
      <MetricCardValue>{value}</MetricCardValue>
    </MetricCard>
  );
}
