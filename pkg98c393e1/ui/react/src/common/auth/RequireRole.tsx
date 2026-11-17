/*
 * Route guard. Owner: Shreya. UI convenience only: every server method also checks access itself.
 */
import React from 'react';
import { useParams } from 'react-router-dom';

import { Spinner } from '@/components/ui/spinner';

import type { CourseRole, PlatformRole } from '../eduTypes';
import { eduErrorMessage } from '../errors';
import { PageMessage } from '../PageMessage';
import { useCourseRole, useMe } from './useMe';

interface RequireRoleProps {
  /** Platform roles allowed. ADMIN always passes. */
  platform?: PlatformRole[];
  /** Course roles allowed in the course from the `:courseId` route param. ADMIN always passes. */
  course?: CourseRole[];
  children: React.ReactNode;
}

export function RequireRole({ platform, course, children }: RequireRoleProps) {
  const { me, loading, error } = useMe();
  const { courseId } = useParams();
  const courseRole = useCourseRole(courseId);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (error || !me) {
    return <PageMessage title="Could not load your profile" message={eduErrorMessage(error)} />;
  }
  if (me.platformRole === 'ADMIN') {
    return <>{children}</>;
  }
  const platformOk = !platform || platform.includes(me.platformRole);
  const courseOk = !course || (courseRole !== null && course.includes(courseRole));
  if (!platformOk || !courseOk) {
    return <PageMessage title="No access" message="You don't have access to this page." />;
  }
  return <>{children}</>;
}
