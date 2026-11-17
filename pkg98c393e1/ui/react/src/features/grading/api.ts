/*
 * Gradebook backend calls. Owner: Shreenidhi.
 */
import { c3Call } from '@/c3Action';
import type { EduAssignment, EduSubmission, GradebookGrid } from '@/common/eduTypes';

export const fetchGradebook = (courseId: string): Promise<GradebookGrid> =>
  c3Call('EduGradebook', 'courseGrid', null, [courseId]);

/** Sets the score override (needs EDIT_GRADES; audited). */
export const overrideScore = (submissionId: string, score: number, reason: string): Promise<EduSubmission> =>
  c3Call('EduGradebook', 'overrideScore', null, [submissionId, score, reason]);

/** Removes the score override so the computed score counts again (needs EDIT_GRADES; audited). */
export const clearScoreOverride = (submissionId: string, reason: string): Promise<EduSubmission> =>
  c3Call('EduGradebook', 'clearOverride', null, [submissionId, reason]);

/** Makes an assignment's scores visible to students (needs RELEASE_GRADES; audited). */
export const releaseGrades = (assignmentId: string): Promise<EduAssignment> =>
  c3Call('EduGradebook', 'releaseGrades', null, [assignmentId]);

/** Canvas-style CSV text of the course gradebook. */
export const exportGradebookCsv = (courseId: string): Promise<string> =>
  c3Call('EduGradebook', 'exportCsv', null, [courseId]);
