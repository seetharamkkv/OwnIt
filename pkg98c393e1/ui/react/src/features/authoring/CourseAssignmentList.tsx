/*
 * Course assignment list for staff, shown on the course home's Assignments tab. Owner: Rohith.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { eduErrorMessage } from '@/common/errors';
import { routes } from '@/common/routes';

import { fetchCourseAssignments } from './api';
import { FILE_KIND_LABEL, formatDate } from './format';

export function CourseAssignmentList({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ['edu', 'authoring', 'courseAssignments', courseId], queryFn: () => fetchCourseAssignments(courseId) });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="solid" appearance="accent" leadingIcon={<Plus />} onClick={() => navigate(routes.assignmentNew(courseId))}>
          New assignment
        </Button>
      </div>
      {list.isLoading ? <Spinner /> : null}
      {list.error ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(list.error)}</p> : null}
      {list.data && list.data.length === 0 ? (
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No assignments yet.</p>
      ) : null}
      <ul className="flex flex-col">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] py-2">
            <div className="flex flex-col">
              <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{a.title}</span>
              <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                {FILE_KIND_LABEL[a.fileKind]} · due {formatDate(a.dueAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="soft" appearance={a.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                {a.status ?? 'DRAFT'}
              </Badge>
              <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.assignmentEdit(courseId, a.id))}>
                Edit
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
