/*
 * Pyodide Web Worker. Owner: Shreenidhi. PROJECT_PLAN.md 7.1.
 *
 * Loads Pyodide once (from PYODIDE_INDEX_URL) and handles three messages from runner.ts:
 *   prepare  – load the packages the code imports (pandas, numpy, ...) and write the test data files
 *   runTest  – run the student's program and one EduStepTest's def test_*() functions → EduTestResult[]
 *   runCells – run notebook cells up to an index → CellOutput[]
 * Timeouts are enforced by runner.ts, which terminates this worker and starts a new one.
 */
import type { PyodideInterface } from 'pyodide';

import { PYODIDE_INDEX_URL } from './config';
import { HARNESS_PY } from './harness';
import type { CellOutput, WorkerRequest, WorkerResponse } from './protocol';
import type { EduTestResult } from '@/common/eduTypes';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}
const scope = self as unknown as WorkerScope;

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideInterface>;

let pyodidePromise: Promise<PyodideInterface> | null = null;

function getPyodide(): Promise<PyodideInterface> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const mod = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as { loadPyodide: LoadPyodide };
      const py = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
      await py.runPythonAsync(HARNESS_PY);
      return py;
    })();
    pyodidePromise.catch(() => {
      pyodidePromise = null;
    });
  }
  return pyodidePromise;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}

/** Converts a Python list of dicts (a PyProxy) into plain objects and frees the proxy. */
function toPlain<T>(value: unknown): T {
  const proxy = value as { toJs: (o: { dict_converter: (e: Iterable<[string, unknown]>) => unknown }) => T; destroy: () => void };
  try {
    return proxy.toJs({ dict_converter: Object.fromEntries });
  } finally {
    proxy.destroy();
  }
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  const py = await getPyodide();
  switch (req.kind) {
    case 'prepare': {
      await py.loadPackagesFromImports(req.code);
      for (const file of req.files) {
        const res = await fetch(file.url, { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Could not download the test file ${file.path} (HTTP ${res.status})`);
        }
        const dir = dirname(file.path);
        if (dir) {
          py.FS.mkdirTree(dir);
        }
        py.FS.writeFile(file.path, new Uint8Array(await res.arrayBuffer()));
      }
      return { id: req.id, kind: 'prepared' };
    }
    case 'runTest': {
      const fn = py.globals.get('_edu_run_test') as (...args: string[]) => unknown;
      const results = toPlain<EduTestResult[]>(fn(req.program, req.test.id, req.test.name, req.test.code));
      return { id: req.id, kind: 'testResults', results };
    }
    case 'runCells': {
      const fn = py.globals.get('_edu_run_cells') as (cells: unknown, upto: number) => unknown;
      const cells = py.toPy(req.cells);
      try {
        const outputs = toPlain<{ index: number; stdout: string; error: string | null }[]>(fn(cells, req.uptoIndex));
        return {
          id: req.id,
          kind: 'cellOutputs',
          outputs: outputs.map((o): CellOutput => ({ index: o.index, stdout: o.stdout, error: o.error ?? undefined })),
        };
      } finally {
        (cells as { destroy?: () => void }).destroy?.();
      }
    }
    default:
      return { id: (req as { id: number }).id, kind: 'error', message: 'Unknown request' };
  }
}

scope.onmessage = (event) => {
  const req = event.data;
  handle(req)
    .then((res) => scope.postMessage(res))
    .catch((err: unknown) => scope.postMessage({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) }));
};
