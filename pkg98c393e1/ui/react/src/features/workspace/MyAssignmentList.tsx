/*
 * A student's assignments in a course with status, due date, and step progress (EduSubmission.myAssignments).
 * Shown on the course home's Assignments tab for students. Owner: Keya.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import type { BadgeAppearance } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

import type { MyAssignmentRow, SubmissionStatus } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';

import { fetchMyAssignments } from './api';
import { formatDateTime, formatRemaining, useNow } from './deadline';

const STATUS: Record<SubmissionStatus, { label: string; appearance: BadgeAppearance; action: string }> = {
  NOT_STARTED: { label: 'Not started', appearance: 'secondary', action: 'Start' },
  IN_PROGRESS: { label: 'In progress', appearance: 'info', action: 'Continue' },
  SUBMITTED: { label: 'Submitted', appearance: 'success', action: 'View' },
  GRADED: { label: 'Graded', appearance: 'success', action: 'View' },
  RETURNED: { label: 'Returned', appearance: 'accent', action: 'View' },
};

const KIND: Record<string, string> = { PY: 'Python', IPYNB: 'Notebook', DOCX: 'Word document' };

function DueText({ row, now }: { row: MyAssignmentRow; now: number }) {
  if (!row.dueAt) {
    return <>No due date</>;
  }
  const due = new Date(row.dueAt).getTime();
  const open = row.status === 'NOT_STARTED' || row.status === 'IN_PROGRESS';
  if (open && due > now) {
    return (
      <>
        Due {formatDateTime(row.dueAt)} · {formatRemaining(due - now)} left
      </>
    );
  }
  return <>{open ? 'Was due' : 'Due'} {formatDateTime(row.dueAt)}</>;
}

export function MyAssignmentList({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const list = useQuery({ queryKey: queryKeys.myAssignments(courseId), queryFn: () => fetchMyAssignments(courseId) });

  if (list.isLoading) {
    return <Spinner />;
  }
  if (list.error) {
    return <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(list.error)}</p>;
  }
  const rows = list.data ?? [];
  if (!rows.length) {
    return <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No assignments have been released yet.</p>;
  }

  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const status = STATUS[row.status ?? 'NOT_STARTED'];
        const total = row.totalSteps ?? 0;
        const done = row.completedSteps ?? 0;
        return (
          <li key={row.assignmentId} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c3-style-basic-border-border)] py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{row.title ?? row.assignmentId}</span>
              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                {KIND[row.fileKind ?? 'PY']} · <DueText row={row} now={now} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex w-40 flex-col gap-1">
                <Progress value={total ? (done / total) * 100 : 0} size="sm" aria-label={`${done} of ${total} steps done`} />
                <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  {done} of {total} steps done
                </span>
              </div>
              <Badge variant="soft" appearance={status.appearance}>
                {status.label}
              </Badge>
              {row.late ? (
                <Badge variant="outline" appearance="danger">
                  Late
                </Badge>
              ) : null}
              <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.workspace(row.assignmentId))}>
                {status.action}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
