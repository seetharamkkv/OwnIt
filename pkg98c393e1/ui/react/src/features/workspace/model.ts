/*
 * The workspace's view of an assignment, the same for students (from their submission) and staff previews.
 * Also rebuilds programs and notebook cells in the browser with the same rules as Rohith's EduAssembler, so the test
 * panel gets unsaved edits instantly instead of waiting on a server round trip. Owner: Keya.
 */
import type {
  EduAssignment,
  EduAssignmentStep,
  EduAttachment,
  EduSubmission,
  EduTestSummary,
  FileKind,
  SubmissionStatus,
} from '@/common/eduTypes';
import type { NotebookCell } from '@/features/editors/types';

export interface WorkspaceStep {
  id: string;
  stepOrder: number;
  title: string;
  instructionsMd: string;
  starterContent: string;
  contextBefore: string;
  contextAfter: string;
  cellIndex?: number;
  points?: number;
  /** Saved answer (student mode). Preview mode starts every step from its starter content. */
  saved?: { content: string; revision: number; completed: boolean; lastVisibleResult?: EduTestSummary; updatedAt?: string };
}

export interface WorkspaceModel {
  mode: 'student' | 'preview';
  assignment: {
    id: string;
    title: string;
    descriptionMd?: string;
    fileKind: FileKind;
    status?: string;
    dueAt?: string;
    lateUntil?: string;
    templateContent?: string;
    testDataFiles: EduAttachment[];
    courseId: string;
    courseCode?: string;
  };
  submission?: {
    id: string;
    status: SubmissionStatus;
    submittedAt?: string;
    extensionUntil?: string;
    assembledFileUrl?: string;
    canaryToken?: string;
    late?: boolean;
    studentName?: string;
    studentNumber?: string;
  };
  steps: WorkspaceStep[];
}

const toStep = (s: Partial<EduAssignmentStep> & { id: string }): WorkspaceStep => ({
  id: s.id,
  stepOrder: s.stepOrder ?? 0,
  title: s.title ?? s.markerId ?? s.id,
  instructionsMd: s.instructionsMd ?? '',
  starterContent: s.starterContent ?? '',
  contextBefore: s.contextBefore ?? '',
  contextAfter: s.contextAfter ?? '',
  cellIndex: s.cellIndex,
  points: s.points,
});

export function modelFromSubmission(sub: EduSubmission): WorkspaceModel {
  const a = sub.assignment;
  const steps = (sub.responses ?? [])
    .map((r) => ({
      ...toStep(r.step),
      saved: {
        content: r.content ?? '',
        revision: r.revision ?? 0,
        completed: !!r.completed,
        lastVisibleResult: r.lastVisibleResult,
        updatedAt: r.meta?.updated,
      },
    }))
    .sort((x, y) => x.stepOrder - y.stepOrder);
  return {
    mode: 'student',
    assignment: {
      id: a.id,
      title: a.title ?? 'Assignment',
      descriptionMd: a.descriptionMd,
      fileKind: a.fileKind ?? 'PY',
      status: a.status,
      dueAt: a.dueAt,
      lateUntil: a.lateUntil,
      templateContent: a.templateContent,
      testDataFiles: a.testDataFiles ?? [],
      courseId: a.course?.id ?? '',
      courseCode: a.course?.code,
    },
    submission: {
      id: sub.id,
      status: sub.status ?? 'NOT_STARTED',
      submittedAt: sub.submittedAt,
      extensionUntil: sub.extensionUntil,
      assembledFileUrl: sub.assembledFileUrl,
      canaryToken: sub.canaryToken,
      late: sub.late,
      studentName: sub.student?.displayName,
      studentNumber: sub.student?.studentNumber,
    },
    steps,
  };
}

export function modelForPreview(a: EduAssignment, steps: EduAssignmentStep[]): WorkspaceModel {
  return {
    mode: 'preview',
    assignment: {
      id: a.id,
      title: a.title,
      descriptionMd: a.descriptionMd,
      fileKind: a.fileKind,
      status: a.status,
      dueAt: a.dueAt,
      lateUntil: a.lateUntil,
      templateContent: a.templateContent,
      testDataFiles: a.testDataFiles ?? [],
      courseId: a.course?.id ?? '',
      courseCode: a.course?.code,
    },
    steps: steps.map(toStep).sort((x, y) => x.stepOrder - y.stepOrder),
  };
}

const EXT: Record<FileKind, string> = { PY: 'py', IPYNB: 'ipynb', DOCX: 'docx' };

/** File name for the editor tab and the download, from the assignment title. */
export function fileNameFor(model: WorkspaceModel): string {
  const slug =
    model.assignment.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'assignment';
  return `${slug}.${EXT[model.assignment.fileKind]}`;
}

interface RawCell {
  cell_type?: string;
  source?: string | string[];
}

function parseCells(templateContent?: string): RawCell[] | null {
  if (!templateContent) {
    return null;
  }
  try {
    const nb = JSON.parse(templateContent) as { cells?: RawCell[] };
    return Array.isArray(nb.cells) ? nb.cells : null;
  } catch {
    return null;
  }
}

const cellSource = (c: RawCell) => (Array.isArray(c.source) ? c.source.join('') : c.source ?? '');

/** Every notebook cell, with each step's cell showing `valueOf(step)`. Null when the template has no notebook. */
export function notebookCells(model: WorkspaceModel, valueOf: (step: WorkspaceStep) => string): NotebookCell[] | null {
  const cells = parseCells(model.assignment.templateContent);
  if (!cells) {
    return null;
  }
  const byCell = new Map(model.steps.filter((s) => s.cellIndex !== undefined).map((s) => [s.cellIndex as number, s]));
  return cells.map((c, index) => {
    const step = byCell.get(index);
    const cellType = c.cell_type === 'code' || c.cell_type === 'markdown' ? c.cell_type : 'raw';
    return step ? { cellType, source: valueOf(step), stepOrder: step.stepOrder } : { cellType, source: cellSource(c) };
  });
}

/**
 * PY: line number in the assembled file where `step`'s contextBefore starts (earlier steps' context plus answers,
 * each answer ending in a newline, as in {@link programUpTo}).
 */
export function startLineFor(model: WorkspaceModel, valueOf: (step: WorkspaceStep) => string, step: WorkspaceStep): number {
  let prefix = '';
  for (const s of model.steps) {
    if (s.stepOrder >= step.stepOrder) {
      break;
    }
    const text = valueOf(s);
    prefix += s.contextBefore + (!text || text.endsWith('\n') ? text : `${text}\n`);
  }
  return (prefix.match(/\n/g) ?? []).length + 1;
}

/**
 * The program as far as step `stepOrder`: answers for steps 1..stepOrder and starter code after that.
 * PY: sum of (contextBefore + answer) per step, then the last step's contextAfter (EduAssembler._build_py).
 * IPYNB: code cells up to and including the step's cell, joined by blank lines (EduAssembler.assembleUpTo).
 */
export function programUpTo(model: WorkspaceModel, valueOf: (step: WorkspaceStep) => string, stepOrder: number): string {
  const answer = (s: WorkspaceStep) => (s.stepOrder <= stepOrder ? valueOf(s) : s.starterContent);
  const steps = model.steps;
  if (model.assignment.fileKind === 'PY') {
    const parts: string[] = [];
    steps.forEach((s) => {
      parts.push(s.contextBefore);
      const text = answer(s);
      parts.push(!text || text.endsWith('\n') ? text : `${text}\n`);
    });
    if (steps.length) {
      parts.push(steps[steps.length - 1].contextAfter);
    }
    return parts.join('');
  }
  if (model.assignment.fileKind === 'IPYNB') {
    const target = steps.find((s) => s.stepOrder === stepOrder);
    const cells = parseCells(model.assignment.templateContent);
    if (!target || target.cellIndex === undefined || !cells) {
      throw new Error('EDU_VALIDATION: this notebook has no template cells to run');
    }
    const byCell = new Map(steps.filter((s) => s.cellIndex !== undefined).map((s) => [s.cellIndex as number, s]));
    return cells
      .slice(0, target.cellIndex + 1)
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.cell_type === 'code')
      .map(({ c, index }) => {
        const step = byCell.get(index);
        return step ? answer(step) : cellSource(c);
      })
      .join('\n\n');
  }
  throw new Error('EDU_VALIDATION: Word documents have no runnable program');
}
