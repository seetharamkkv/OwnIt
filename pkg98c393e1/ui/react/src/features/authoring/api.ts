/*
 * Authoring backend calls. Owner: Rohith.
 */
import { c3Call } from '@/c3Action';
import type {
  EduAssignment,
  EduAssignmentStep,
  EduAttachment,
  EduAttachmentContent,
  EduStepResponse,
  EduSubmission,
  FetchResult,
  FileKind,
  TemplateParseResult,
} from '@/common/eduTypes';

const quote = (value: string) => value.replace(/"/g, '');

/** Reads a browser File as base64 (no data: prefix). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** Stores a test data file (replaces one with the same name). Returns the assignment's file list. */
export const uploadTestData = (assignmentId: string, fileName: string, contentBase64: string): Promise<EduAttachment[]> =>
  c3Call('EduAssignment.Files', 'uploadTestData', null, [assignmentId, fileName, contentBase64]);

export const removeTestData = (assignmentId: string, fileName: string): Promise<EduAttachment[]> =>
  c3Call('EduAssignment.Files', 'removeTestData', null, [assignmentId, fileName]);

/** Contents of every test data file (Shreenidhi's test runner writes these into Pyodide's file system). */
export const readTestData = (assignmentId: string): Promise<EduAttachmentContent[]> =>
  c3Call('EduAssignment.Files', 'readTestData', null, [assignmentId]);

/** `content` is text for PY / IPYNB and base64 of the file for DOCX. */
export const parseTemplate = (fileKind: FileKind, content: string): Promise<TemplateParseResult> =>
  c3Call('EduTemplateParser', 'parse', null, [fileKind, content]);

/**
 * Stores the template on the assignment and upserts its steps. `content` is text (PY / IPYNB) or base64 (DOCX);
 * null re-imports the stored template.
 */
export const importTemplate = (assignmentId: string, content: string | null): Promise<TemplateParseResult> =>
  c3Call('EduTemplateParser', 'importTemplate', null, [assignmentId, content, null]);

/** One-hour download link for the template filled with starter code. */
export const previewTemplate = (assignmentId: string): Promise<string> =>
  c3Call('EduAssembler', 'previewTemplate', null, [assignmentId]);

/** One-hour download link for a submission's assembled file. */
export const submissionDownloadLink = (submissionId: string): Promise<string> =>
  c3Call('EduAssembler', 'downloadLink', null, [submissionId]);

/** Program text of steps 1..stepOrder (answers) plus starter code after that. */
export const assembleUpTo = (submissionId: string, stepOrder: number): Promise<string> =>
  c3Call('EduAssembler', 'assembleUpTo', null, [submissionId, stepOrder]);

export const fetchAssignment = (assignmentId: string): Promise<EduAssignment | null> =>
  c3Call('EduAssignment', 'get', { id: assignmentId }, ['this']);

export const createAssignment = (assignment: Omit<EduAssignment, 'id'>): Promise<EduAssignment> =>
  c3Call('EduAssignment', 'create', assignment);

export const updateAssignment = (assignment: Partial<EduAssignment> & { id: string }): Promise<EduAssignment> =>
  c3Call('EduAssignment', 'merge', assignment);

export const updateStep = (step: Partial<EduAssignmentStep> & { id: string }): Promise<EduAssignmentStep> =>
  c3Call('EduAssignmentStep', 'merge', step);

export const fetchCourseAssignments = async (courseId: string, limit = 50, offset = 0): Promise<EduAssignment[]> => {
  const res: FetchResult<EduAssignment> = await c3Call('EduAssignment', 'fetch', null, [
    {
      filter: `course.id == "${quote(courseId)}"`,
      include: 'id, title, fileKind, status, releaseAt, dueAt',
      order: 'descending(meta.created)',
      limit,
      offset,
    },
  ]);
  return res.objs ?? [];
};

export const fetchAssignmentSteps = async (assignmentId: string): Promise<EduAssignmentStep[]> => {
  const res: FetchResult<EduAssignmentStep> = await c3Call('EduAssignmentStep', 'fetch', null, [
    {
      filter: `assignment.id == "${quote(assignmentId)}"`,
      order: 'ascending(stepOrder)',
      limit: 100,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
};

/** Number of submissions (started or submitted) for an assignment. */
export const countSubmissions = (assignmentId: string): Promise<number> =>
  c3Call('EduSubmission', 'fetchCount', null, [{ filter: `assignment.id == "${quote(assignmentId)}"` }]);

export const fetchAssignmentSubmissions = async (assignmentId: string, limit = 100, offset = 0): Promise<EduSubmission[]> => {
  const res: FetchResult<EduSubmission> = await c3Call('EduSubmission', 'fetch', null, [
    {
      filter: `assignment.id == "${quote(assignmentId)}"`,
      include:
        'id, status, submittedAt, late, flagCount, score, scoreOverride, extensionUntil, student.id, student.displayName, student.studentNumber',
      order: 'ascending(student.displayName)',
      limit,
      offset,
    },
  ]);
  return res.objs ?? [];
};

export const fetchSubmission = (submissionId: string): Promise<EduSubmission | null> =>
  c3Call('EduSubmission', 'get', { id: submissionId }, [
    'this, assignment.id, assignment.title, assignment.fileKind, assignment.dueAt, student.id, student.displayName, student.studentNumber',
  ]);

export const fetchSubmissionResponses = async (submissionId: string): Promise<EduStepResponse[]> => {
  const res: FetchResult<EduStepResponse> = await c3Call('EduStepResponse', 'fetch', null, [
    {
      filter: `submission.id == "${quote(submissionId)}"`,
      include: 'id, content, revision, completed, lastVisibleResult, step.id, meta.updated',
      limit: 200,
      offset: 0,
    },
  ]);
  return res.objs ?? [];
};
