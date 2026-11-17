/*
 * "Regrade all in my browser". Owner: Shreenidhi. PROJECT_PLAN.md 7.3 (phase 1).
 *
 * Runs every step's visible AND hidden tests for each submitted submission in the instructor's browser, then saves
 * each run with EduTestRun.recordRegrade (trusted), which recomputes the submission's score on the server. Hidden
 * tests are fetched only here, by staff, through EduStepTest.regradeBundle.
 */
import type { EduStepTest, FileKind, GradebookGrid, GradebookItem } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { assembleUpTo, fetchAssignment } from '@/features/authoring/api';
import { fetchRegradeBundle, recordRegrade } from '@/features/testing/api';
import { DEFAULT_TEST_TIMEOUT_MS } from '@/features/testing/config';
import { runTests, testFilesFrom, type TestFile } from '@/features/testing/runner';

/** Submission statuses that are regraded. */
export const REGRADE_STATUSES = ['SUBMITTED', 'GRADED', 'RETURNED'];

/** File kinds with runnable tests. */
export const RUNNABLE_KINDS: FileKind[] = ['PY', 'IPYNB'];

export interface RegradeProgress {
  done: number;
  total: number;
  /** What is running now, e.g. "Sam Student · HW1 · step 2". */
  current?: string;
}

export interface RegradeFailure {
  label: string;
  message: string;
}

export interface RegradeOutcome {
  done: number;
  total: number;
  failures: RegradeFailure[];
  cancelled: boolean;
}

interface StepPlan {
  stepId: string;
  stepOrder: number;
  tests: EduStepTest[];
}

interface WorkItem {
  submissionId: string;
  studentName: string;
}

interface AssignmentPlan {
  item: GradebookItem;
  steps: StepPlan[];
  files: TestFile[];
  work: WorkItem[];
}

/** An error as user text: the friendly code message plus the server's detail. */
export function errorText(err: unknown): string {
  const friendly = eduErrorMessage(err);
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const detail = raw.match(/EDU_[A-Z_]+:\s*([^\n(]+)/);
  return detail ? `${friendly} ${detail[1].trim()}` : friendly;
}

/** Regradable assignments of the grid with the submissions to regrade in each. */
export function regradeWork(grid: GradebookGrid): { item: GradebookItem; work: WorkItem[] }[] {
  const items = grid.items ?? [];
  const rows = grid.rows ?? [];
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.itemKind === 'ASSIGNMENT' && !!item.fileKind && RUNNABLE_KINDS.includes(item.fileKind))
    .map(({ item, index }) => ({
      item,
      work: rows.flatMap((row) => {
        const cell = row.cells?.[index];
        return cell?.workId && cell.status && REGRADE_STATUSES.includes(cell.status)
          ? [{ submissionId: cell.workId, studentName: row.displayName ?? row.studentId }]
          : [];
      }),
    }))
    .filter((a) => a.work.length > 0);
}

function stepsOf(tests: EduStepTest[]): StepPlan[] {
  const byStep = new Map<string, StepPlan>();
  tests.forEach((t) => {
    const stepId = t.step?.id;
    if (!stepId) {
      return;
    }
    const plan = byStep.get(stepId) ?? { stepId, stepOrder: t.step?.stepOrder ?? 0, tests: [] };
    plan.tests.push(t);
    byStep.set(stepId, plan);
  });
  return Array.from(byStep.values()).sort((a, b) => a.stepOrder - b.stepOrder);
}

export async function regradeAll(
  grid: GradebookGrid,
  options: { isCancelled: () => boolean; onProgress: (progress: RegradeProgress) => void }
): Promise<RegradeOutcome> {
  const failures: RegradeFailure[] = [];
  const plans: AssignmentPlan[] = [];

  options.onProgress({ done: 0, total: 0, current: 'Loading tests…' });
  for (const { item, work } of regradeWork(grid)) {
    if (options.isCancelled()) {
      return { done: 0, total: 0, failures, cancelled: true };
    }
    try {
      const [bundle, assignment] = await Promise.all([fetchRegradeBundle(item.itemId), fetchAssignment(item.itemId)]);
      const steps = stepsOf(bundle);
      if (steps.length) {
        plans.push({ item, steps, files: testFilesFrom(assignment?.testDataFiles), work });
      }
    } catch (err) {
      failures.push({ label: item.title ?? item.itemId, message: `Could not load the tests: ${errorText(err)}` });
    }
  }

  const total = plans.reduce((sum, p) => sum + p.steps.length * p.work.length, 0);
  let done = 0;
  for (const plan of plans) {
    for (const work of plan.work) {
      for (const step of plan.steps) {
        if (options.isCancelled()) {
          return { done, total, failures, cancelled: true };
        }
        const label = `${work.studentName} · ${plan.item.title ?? plan.item.itemId} · step ${step.stepOrder}`;
        options.onProgress({ done, total, current: label });
        try {
          const program = await assembleUpTo(work.submissionId, step.stepOrder);
          const results = await runTests({
            program,
            tests: step.tests.map((t) => ({ id: t.id, name: t.testName, code: t.code, timeoutMs: t.timeoutMs })),
            files: plan.files,
            timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
          });
          await recordRegrade(work.submissionId, step.stepId, results);
        } catch (err) {
          failures.push({ label, message: errorText(err) });
        }
        done += 1;
        options.onProgress({ done, total, current: label });
      }
    }
  }
  return { done, total, failures, cancelled: false };
}
