/*
 * Student workspace backend calls. Owner: Keya. Components never call c3Call directly (PROJECT_PLAN.md 12.3).
 */
import { c3Call } from '@/c3Action';
import type { EduAssignment, EduAssignmentStep, EduStepResponse, EduSubmission, FetchResult, MyAssignmentRow, StudentDashboard } from '@/common/eduTypes';

/** Opens the assignment for the student: creates the submission on first visit and returns it with every step. */
export const startMySubmission = (assignmentId: string): Promise<EduSubmission> =>
  c3Call('EduSubmission', 'startMine', null, [assignmentId]);

export const fetchMySubmission = (assignmentId: string): Promise<EduSubmission | null> =>
  c3Call('EduSubmission', 'mySubmission', null, [assignmentId]);

/** Hands the work in. The first call after a quiet period can take up to a minute while the file is assembled. */
export const submitMine = (assignmentId: string): Promise<EduSubmission> =>
  c3Call('EduSubmission', 'submitMine', null, [assignmentId]);

export const fetchMyAssignments = (courseId: string): Promise<MyAssignmentRow[]> =>
  c3Call('EduSubmission', 'myAssignments', null, [courseId]);

/** Student home page: open work across every course, summary counts, and recently released grades. */
export const fetchMyDashboard = (): Promise<StudentDashboard> => c3Call('EduSubmission', 'myDashboard', null, []);

export const saveMyStep = (stepId: string, content: string, revision: number): Promise<EduStepResponse> =>
  c3Call('EduStepResponse', 'saveMine', null, [stepId, content, revision]);

export const setMyStepCompleted = (stepId: string, completed: boolean): Promise<EduStepResponse> =>
  c3Call('EduStepResponse', 'setCompletedMine', null, [stepId, completed]);

/**
 * Staff (GRANT_EXTENSIONS): gives a student a personal deadline for an assignment, or removes it when `until` is
 * undefined. `until` is an ISO-8601 UTC string. The server checks the permission and writes the audit log entry.
 */
export const grantExtension = (assignmentId: string, studentId: string, reason: string, until?: string): Promise<EduSubmission> =>
  c3Call('EduSubmission', 'grantExtension', null, [assignmentId, studentId, reason, until ?? null]);

const quote = (value: string) => value.replace(/"/g, '');

/** Preview mode (instructor, TA, admin): the assignment as students will see it. Staff may read it directly. */
export const fetchPreviewAssignment = (assignmentId: string): Promise<EduAssignment | null> =>
  c3Call('EduAssignment', 'get', { id: assignmentId }, [
    'id, title, descriptionMd, fileKind, status, releaseAt, dueAt, lateUntil, templateContent, testDataFiles, course.id, course.code, course.title',
  ]);

/** Preview mode: the assignment's steps in order. */
export const fetchPreviewSteps = async (assignmentId: string): Promise<EduAssignmentStep[]> => {
  const res: FetchResult<EduAssignmentStep> = await c3Call('EduAssignmentStep', 'fetch', null, [
    {
      filter: `assignment.id == "${quote(assignmentId)}"`,
      include:
        'id, stepOrder, markerId, title, instructionsMd, starterContent, contextBefore, contextAfter, cellIndex, points, independentOfPrevious, assignment.id',
      order: 'ascending(stepOrder)',
      limit: 100,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
};
