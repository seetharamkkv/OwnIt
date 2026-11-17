/*
 * Current-user hooks. Owner: Shreya. PROJECT_PLAN.md 12.5.
 */
import { useContext } from 'react';

import type { CourseRole, FeatureFlag } from '../eduTypes';
import { MeContext, MeContextValue } from './meContext';

/** The effective user (a dev persona while one is active). `me` is null while loading or on error. */
export function useMe(): MeContextValue {
  return useContext(MeContext);
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { me } = useMe();
  return Boolean(me?.enabledFlags?.includes(flag));
}

/** The caller's role in a course, or null when not enrolled. Admins are not enrolled by default. */
export function useCourseRole(courseId: string | undefined): CourseRole | null {
  const { me } = useMe();
  if (!courseId || !me?.courses) {
    return null;
  }
  return me.courses.find((c) => c.courseId === courseId)?.courseRole ?? null;
}
