/*
 * Testing backend calls. Owner: Shreenidhi.
 */
import { c3Call } from '@/c3Action';
import type { EduStepTest, EduTestResult, EduTestRun } from '@/common/eduTypes';

/** Visible tests of every step of an assignment (what a student may see). */
export const fetchVisibleTests = async (assignmentId: string): Promise<EduStepTest[]> =>
  (await c3Call('EduStepTest', 'visibleTests', null, [assignmentId])) ?? [];

/** Visible and hidden tests of an assignment (staff, for regrading). */
export const fetchRegradeBundle = async (assignmentId: string): Promise<EduStepTest[]> =>
  (await c3Call('EduStepTest', 'regradeBundle', null, [assignmentId])) ?? [];

/** Visible and hidden tests of one step (staff, for the test editor). */
export const fetchStepTests = async (stepId: string): Promise<EduStepTest[]> => (await c3Call('EduStepTest', 'stepTests', null, [stepId])) ?? [];

/** Creates or updates a step test (needs EDIT_CONTENT in the course). */
export const saveStepTest = (test: Partial<EduStepTest> & { step: { id: string } }): Promise<EduStepTest> =>
  c3Call('EduStepTest', 'saveForStep', null, [test]);

export const removeStepTest = (testId: string): Promise<boolean> => c3Call('EduStepTest', 'removeForStep', null, [testId]);

/** Saves a browser run of visible tests for the caller's own submission (feedback only). */
export const recordMyRun = (stepId: string, results: EduTestResult[]): Promise<EduTestRun> =>
  c3Call('EduTestRun', 'recordMine', null, [stepId, results]);

export const recordRegrade = (submissionId: string, stepId: string, results: EduTestResult[]): Promise<EduTestRun> =>
  c3Call('EduTestRun', 'recordRegrade', null, [submissionId, stepId, results]);
