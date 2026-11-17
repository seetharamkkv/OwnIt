/*
 * Core backend calls. Owner: Shreya. Components never call c3Call directly; each area has its own api.ts.
 */
import { c3Call } from '@/c3Action';

import type { CoursePermission, EduCourse, EduMe, EduUserProfile, FetchResult } from './eduTypes';

export const fetchMe = (): Promise<EduMe> => c3Call('EduSession', 'me', null, []);

export const setDevPersona = (personaId: string | null): Promise<EduMe> =>
  c3Call('EduSession', 'setDevPersona', null, [personaId]);

export const fetchPersonas = async (): Promise<EduUserProfile[]> => {
  const res: FetchResult<EduUserProfile> = await c3Call('EduUserProfile', 'fetch', null, [
    {
      filter: "startsWith(id, 'seed_user_')",
      include: 'id, displayName, platformRole',
      order: 'ascending(id)',
      limit: 50,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
};

/** One course by id, or null when it does not exist. */
export const fetchCourse = (courseId: string): Promise<EduCourse | null> =>
  c3Call('EduCourse', 'get', { id: courseId }, ['id, code, title, term, descriptionMd, archived']);

/** The caller's permissions in a course (all for instructors and admins, the TA set for TAs, none for students). */
export const fetchMyPermissions = (courseId: string): Promise<CoursePermission[]> =>
  c3Call('EduEnrollment', 'myPermissions', null, [courseId]);
