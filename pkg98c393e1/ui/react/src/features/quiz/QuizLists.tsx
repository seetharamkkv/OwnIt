/*
 * Quiz lists for the course home's Quizzes tab. Owner: Shreenidhi. PROJECT_PLAN.md 7.4.
 *   MyQuizList      students: EduQuiz.myQuizzes (attempts used, best score, start / resume).
 *   CourseQuizList  staff: EduQuiz.courseQuizzes (status, attempts, grading queue; edit, publish, close, review).
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { BadgeAppearance } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import type { QuizStatus } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { useNow } from '@/features/workspace/deadline';

import { fetchCourseQuizzes, fetchMyQuizzes, setQuizStatus } from './api';
import { dateTime, QUIZ_STATUS_LABEL, quizRowState, ROW_STATE_LABEL, scoreText } from './format';
import type { QuizRowState } from './format';

const ROW_APPEARANCE: Record<QuizRowState, BadgeAppearance> = {
  'in-progress': 'info',
  available: 'accent',
  upcoming: 'secondary',
  done: 'success',
  closed: 'secondary',
};

const STATUS_APPEARANCE: Record<QuizStatus, BadgeAppearance> = { DRAFT: 'secondary', PUBLISHED: 'success', CLOSED: 'warning' };

const MUTED = 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]';

export function MyQuizList({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const list = useQuery({ queryKey: queryKeys.myQuizzes(courseId), queryFn: () => fetchMyQuizzes(courseId) });

  if (list.isLoading) {
    return <Spinner />;
  }
  if (list.error) {
    return <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(list.error)}</p>;
  }
  const rows = list.data ?? [];
  if (!rows.length) {
    return <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No quizzes have been published yet.</p>;
  }

  return (
    <ul className="flex flex-col">
      {rows.map((q) => {
        const state = quizRowState(q, now);
        const limit = q.effectiveTimeLimitMin ?? q.timeLimitMin;
        return (
          <li key={q.quizId} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{q.title ?? q.quizId}</span>
              <span className={MUTED}>
                {q.questionCount ?? 0} questions · {limit ? `${Math.round(limit)} min` : 'no time limit'} · closes {dateTime(q.closesAt)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={MUTED}>
                {q.attemptsUsed ?? 0} of {q.attemptsAllowed ?? 1} attempts
                {q.resultsVisible && q.bestScore != null ? ` · best ${scoreText(q.bestScore, q.maxScore)}` : ''}
              </span>
              <Badge variant="soft" appearance={ROW_APPEARANCE[state]}>
                {ROW_STATE_LABEL[state]}
              </Badge>
              <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.quizTake(q.quizId))}>
                {state === 'in-progress' ? 'Resume' : state === 'available' ? ((q.attemptsUsed ?? 0) ? 'Retake' : 'Start') : 'View'}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CourseQuizList({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.courseQuizzes(courseId), queryFn: () => fetchCourseQuizzes(courseId) });
  const status = useMutation({
    mutationFn: ({ quizId, next }: { quizId: string; next: QuizStatus }) => setQuizStatus(quizId, next),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.courseQuizzes(courseId) }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="solid" appearance="accent" leadingIcon={<Plus />} onClick={() => navigate(routes.quizNew(courseId))}>
          New quiz
        </Button>
      </div>
      {list.isLoading ? <Spinner /> : null}
      {list.error ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(list.error)}</p> : null}
      {status.error ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(status.error)}</p> : null}
      {list.data && list.data.length === 0 ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No quizzes yet.</p> : null}
      <ul className="flex flex-col">
        {(list.data ?? []).map((row) => {
          const q = row.quiz;
          const s = q.status ?? 'DRAFT';
          const busy = status.isPending && status.variables?.quizId === q.id;
          return (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{q.title}</span>
                <span className={MUTED}>
                  {row.questionCount ?? 0} questions · {row.maxScore ?? 0} pts · {q.timeLimitMin ? `${q.timeLimitMin} min` : 'no time limit'} · {dateTime(q.opensAt)} –{' '}
                  {dateTime(q.closesAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={MUTED}>
                  {row.attemptCount ?? 0} attempts{row.needsGradingCount ? ` · ${row.needsGradingCount} to grade` : ''}
                </span>
                <Badge variant="soft" appearance={STATUS_APPEARANCE[s]}>
                  {QUIZ_STATUS_LABEL[s]}
                </Badge>
                {row.needsGradingCount ? (
                  <Badge variant="outline" appearance="warning">
                    Needs grading
                  </Badge>
                ) : null}
                <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.quizEdit(courseId, q.id))}>
                  Edit
                </Button>
                {s === 'PUBLISHED' ? (
                  <Button
                    variant="outline"
                    appearance="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Close this quiz now? Attempts still in progress are submitted on the next auto-submit run.')) {
                        status.mutate({ quizId: q.id, next: 'CLOSED' });
                      }
                    }}
                  >
                    Close
                  </Button>
                ) : null}
                {s === 'CLOSED' ? (
                  <Button variant="outline" appearance="secondary" size="sm" disabled={busy} onClick={() => status.mutate({ quizId: q.id, next: 'PUBLISHED' })}>
                    Reopen
                  </Button>
                ) : null}
                <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.quizAttempts(courseId, q.id))}>
                  Attempts
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
