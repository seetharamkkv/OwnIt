/*
 * Browser test runner API. Owner: Shreenidhi. PROJECT_PLAN.md 7.1–7.2 and 12.5.
 *
 * One Pyodide Web Worker is created on first use and reused. Each EduStepTest runs as its own request with its own
 * time limit; when a test runs too long (an infinite loop), the worker is terminated, that test fails with a
 * timeout message, and a fresh worker is started for the next one. Loading Pyodide and packages (first run) has its
 * own, longer limit.
 *
 * Results from here are feedback only. Grades come from instructor regrades or server runs (trusted runs).
 */
import type { EduAttachment, EduTestResult } from '@/common/eduTypes';

import { DEFAULT_TEST_TIMEOUT_MS, PREPARE_TIMEOUT_MS } from './config';
import type { CellOutput, RunnableTest, TestFile, WorkerRequest, WorkerResponse } from './protocol';

export type { CellOutput, RunnableTest, TestFile } from './protocol';

export interface RunTestsRequest {
  /** Program made of earlier steps plus this step. */
  program: string;
  tests: RunnableTest[];
  files: TestFile[];
  /** Fallback time limit for tests without their own timeoutMs. */
  timeoutMs: number;
}

export interface RunCellsRequest {
  cells: string[];
  uptoIndex: number;
  files: TestFile[];
  timeoutMs: number;
}

class TimeoutError extends Error {}

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
/** Files already written into the current worker, by path → url. */
let preparedFiles = new Map<string, string>();
let preparedCode = new Set<string>();

function resetWorker(reason: string): void {
  worker?.terminate();
  worker = null;
  preparedFiles = new Map();
  preparedCode = new Set();
  pending.forEach((p) => p.reject(new Error(reason)));
  pending.clear();
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const p = pending.get(event.data.id);
      if (p) {
        pending.delete(event.data.id);
        p.resolve(event.data);
      }
    };
    w.onerror = (event) => {
      event.preventDefault();
      resetWorker(`The Python runner failed to start: ${event.message || 'unknown error'}`);
    };
    worker = w;
  }
  return worker;
}

type Body = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

function call(body: Body, timeoutMs: number): Promise<WorkerResponse> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<WorkerResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resetWorker('The Python runner was restarted');
        reject(new TimeoutError(`Timed out after ${timeoutMs} ms`));
      }
    }, timeoutMs);
    pending.set(id, {
      resolve: (r) => {
        window.clearTimeout(timer);
        if (r.kind === 'error') {
          reject(new Error(r.message));
        } else {
          resolve(r);
        }
      },
      reject: (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ ...body, id } as WorkerRequest);
  });
}

/** Loads packages for `code` and writes `files`, skipping what this worker already has. */
async function prepare(code: string, files: TestFile[]): Promise<void> {
  const newFiles = files.filter((f) => preparedFiles.get(f.path) !== f.url);
  if (preparedCode.has(code) && !newFiles.length) {
    return;
  }
  await call({ kind: 'prepare', code, files: newFiles }, PREPARE_TIMEOUT_MS);
  preparedCode.add(code);
  newFiles.forEach((f) => preparedFiles.set(f.path, f.url));
}

/** Test data files as Pyodide paths: names without a folder go under `data/`. */
export function testFilesFrom(attachments: EduAttachment[] | undefined): TestFile[] {
  return (attachments ?? []).map((a) => ({ path: a.fileName.includes('/') ? a.fileName : `data/${a.fileName}`, url: a.url }));
}

/** Runs each test's def test_*() functions against `program`. One result per test function. */
export async function runTests(request: RunTestsRequest): Promise<EduTestResult[]> {
  const results: EduTestResult[] = [];
  const allCode = [request.program, ...request.tests.map((t) => t.code)].join('\n');
  for (const test of request.tests) {
    const limit = test.timeoutMs ?? request.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
    await prepare(allCode, request.files);
    const started = performance.now();
    try {
      const res = await call({ kind: 'runTest', program: request.program, test }, limit);
      if (res.kind === 'testResults') {
        results.push(...res.results);
      }
    } catch (err) {
      results.push({
        testId: test.id,
        testName: test.name,
        passed: false,
        message:
          err instanceof TimeoutError
            ? `Timed out after ${limit / 1000} s. Check for an infinite loop or very slow code.`
            : `The test could not run: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Math.round(performance.now() - started),
      });
    }
  }
  return results;
}

/** Runs notebook cells 0..uptoIndex in one namespace; stops at the first error. */
export async function runCells(request: RunCellsRequest): Promise<CellOutput[]> {
  await prepare(request.cells.join('\n'), request.files);
  try {
    const res = await call({ kind: 'runCells', cells: request.cells, uptoIndex: request.uptoIndex }, request.timeoutMs);
    return res.kind === 'cellOutputs' ? res.outputs : [];
  } catch (err) {
    if (err instanceof TimeoutError) {
      return [{ index: request.uptoIndex, stdout: '', error: `Timed out after ${request.timeoutMs / 1000} s` }];
    }
    throw err;
  }
}

/** Starts the worker and loads Pyodide in the background, so the first run is faster. Safe to call repeatedly. */
export function warmUp(): void {
  prepare('', []).catch(() => {
    // Warming up is best effort; the next real run reports any load error to the student.
  });
}
