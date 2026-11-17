/*
 * Submissions for one assignment, shown in the builder. Owner: Rohith.
 * The extension button and modal come from Keya's workspace feature (EduSubmission.grantExtension).
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Spinner } from '@/components/ui/spinner';

import { useCoursePermission } from '@/common/auth/useCoursePermission';
import { eduErrorMessage } from '@/common/errors';
import { routes } from '@/common/routes';
import { ExtensionModal } from '@/features/workspace/ExtensionModal';
import type { ExtensionTarget } from '@/features/workspace/ExtensionModal';

import { fetchAssignmentSubmissions } from './api';
import { formatDate } from './format';

const HANDED_IN = ['SUBMITTED', 'GRADED', 'RETURNED'];

interface AssignmentSubmissionsProps {
  courseId: string;
  assignmentId: string;
  /** Assignment due date, for the extension dialog. */
  dueAt?: string;
}

export function AssignmentSubmissions({ courseId, assignmentId, dueAt }: AssignmentSubmissionsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canExtend = useCoursePermission(courseId, 'GRANT_EXTENSIONS');
  const [extending, setExtending] = useState<ExtensionTarget | null>(null);
  const queryKey = ['edu', 'authoring', 'submissions', assignmentId];
  const subs = useQuery({
    queryKey,
    queryFn: () => fetchAssignmentSubmissions(assignmentId),
  });
  const rows = subs.data ?? [];

  return (
    <Container title="Submissions" subtitle={subs.data ? `${rows.length} started` : undefined}>
      {subs.isLoading ? <Spinner /> : null}
      {subs.error ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(subs.error)}</p> : null}
      {subs.data && rows.length === 0 ? (
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No student has started yet.</p>
      ) : null}
      <ul className="flex flex-col">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] py-2">
            <div className="flex flex-col">
              <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{s.student.displayName ?? s.student.id}</span>
              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                {s.student.studentNumber ?? ''} · submitted {formatDate(s.submittedAt)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft" appearance={s.status === 'SUBMITTED' || s.status === 'GRADED' ? 'success' : 'secondary'}>
                {s.status ?? 'NOT_STARTED'}
              </Badge>
              {s.late ? (
                <Badge variant="soft" appearance="warning">
                  Late
                </Badge>
              ) : null}
              {s.extensionUntil ? (
                <Badge variant="outline" appearance="info">
                  Extended to {formatDate(s.extensionUntil)}
                </Badge>
              ) : null}
              {s.flagCount ? (
                <Badge variant="soft" appearance="danger">
                  {s.flagCount} flags
                </Badge>
              ) : null}
              {canExtend && !HANDED_IN.includes(s.status ?? '') ? (
                <Button
                  variant="ghost"
                  appearance="secondary"
                  size="sm"
                  leadingIcon={<CalendarClock />}
                  onClick={() =>
                    setExtending({ assignmentId, studentId: s.student.id, studentName: s.student.displayName, extensionUntil: s.extensionUntil })
                  }
                >
                  Extension
                </Button>
              ) : null}
              <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.submissionViewer(courseId, s.id))}>
                View
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ExtensionModal
        target={extending}
        dueAt={dueAt}
        onClose={() => setExtending(null)}
        onSaved={() => {
          setExtending(null);
          void queryClient.invalidateQueries({ queryKey });
        }}
      />
    </Container>
  );
}
