/*
 * Messages between runner.ts (page) and pyodide.worker.ts (Web Worker). Owner: Shreenidhi.
 */
import type { EduTestResult } from '@/common/eduTypes';

export interface RunnableTest {
  id: string;
  name: string;
  code: string;
  timeoutMs?: number;
}

export interface TestFile {
  /** Path inside Pyodide's file system, relative to the working directory, e.g. `data/sales.csv`. */
  path: string;
  url: string;
}

export interface CellOutput {
  index: number;
  stdout: string;
  error?: string;
}

export type WorkerRequest =
  | { id: number; kind: 'prepare'; code: string; files: TestFile[] }
  | { id: number; kind: 'runTest'; program: string; test: RunnableTest }
  | { id: number; kind: 'runCells'; cells: string[]; uptoIndex: number };

export type WorkerResponse =
  | { id: number; kind: 'prepared' }
  | { id: number; kind: 'testResults'; results: EduTestResult[] }
  | { id: number; kind: 'cellOutputs'; outputs: CellOutput[] }
  | { id: number; kind: 'error'; message: string };
