/*
 * "Run cells" for notebook assignments. Owner: Keya. PROJECT_PLAN.md 7.1: running a cell runs every code cell up to
 * and including it (earlier steps' answers, the template's own cells, and this step) and shows the output under each
 * cell. Uses Shreenidhi's Pyodide runner (runCells); output is feedback only and is never saved.
 */
import { useCallback, useState } from 'react';

import type { EduAttachment } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import type { NotebookCell } from '@/features/editors/types';
import { runCells, testFilesFrom } from '@/features/testing/runner';

/** Time limit for one run of all cells up to the step (loading Pyodide has its own, longer limit in the runner). */
export const NOTEBOOK_RUN_TIMEOUT_MS = 30_000;

export interface NotebookRun {
  /** Output per notebook cell index, from the latest run. */
  outputs: Record<number, string>;
  running: boolean;
  error: string | null;
  /** Runs every code cell up to and including the cell at `cellIndex`. */
  run: (cells: NotebookCell[], cellIndex: number) => Promise<void>;
}

export function useNotebookRun(files: EduAttachment[]): NotebookRun {
  const [outputs, setOutputs] = useState<Record<number, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (cells: NotebookCell[], cellIndex: number) => {
      // The runner takes code cells only; remember where each one sits in the notebook.
      const code = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.cellType === 'code');
      const upto = code.findIndex(({ index }) => index === cellIndex);
      if (upto < 0) {
        setError('This step has no code cell to run.');
        return;
      }
      setRunning(true);
      setError(null);
      try {
        const results = await runCells({
          cells: code.map(({ cell }) => cell.source),
          uptoIndex: upto,
          files: testFilesFrom(files),
          timeoutMs: NOTEBOOK_RUN_TIMEOUT_MS,
        });
        const next: Record<number, string> = {};
        results.forEach((r) => {
          const target = code[r.index];
          const text = [r.stdout.replace(/\n$/, ''), r.error ?? ''].filter(Boolean).join('\n');
          if (target && text) {
            next[target.index] = text;
          }
        });
        setOutputs(next);
        const failed = results.find((r) => r.error);
        if (failed && failed.index < upto) {
          setError('An earlier cell stopped with an error, so the cells after it did not run.');
        }
      } catch (err) {
        setError(eduErrorMessage(err));
      } finally {
        setRunning(false);
      }
    },
    [files]
  );

  return { outputs, running, error, run };
}
