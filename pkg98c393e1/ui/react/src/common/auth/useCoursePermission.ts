/*
 * Per-course permission hooks. Owner: Shreya. UI convenience only: the server re-checks every action with
 * EduEnrollment.requireCoursePermission, so hiding a button here is never the security boundary.
 */
import { useQuery } from '@tanstack/react-query';

import { fetchMyPermissions } from '../api';
import type { CoursePermission } from '../eduTypes';
import { queryKeys } from '../queryKeys';
import { useMe } from './useMe';

const NONE: CoursePermission[] = [];

/** The caller's permissions in a course. Empty while loading, for students, and when not enrolled. */
export function useCoursePermissions(courseId: string | undefined): {
  permissions: CoursePermission[];
  loading: boolean;
} {
  const { me } = useMe();
  const query = useQuery({
    queryKey: queryKeys.myPermissions(courseId ?? ''),
    queryFn: () => fetchMyPermissions(courseId as string),
    enabled: Boolean(courseId && me),
    staleTime: 60_000,
  });
  return { permissions: query.data ?? NONE, loading: query.isLoading };
}

/** True when the caller holds `permission` in the course. */
export function useCoursePermission(courseId: string | undefined, permission: CoursePermission): boolean {
  const { permissions } = useCoursePermissions(courseId);
  return permissions.includes(permission);
}
