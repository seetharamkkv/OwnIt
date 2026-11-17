/*
 * Editor contract shared by all three editors. Owner: Keya (agreed with Seetharam). PROJECT_PLAN.md 5.2.
 * The notebook fields are optional additions; editors that don't need them ignore them.
 */
import type { FileKind } from '@/common/eduTypes';
import type { IntegrityHooks } from '@/features/integrity/types';

/** One notebook cell as the notebook editor draws it. Step cells already carry the student's current answer. */
export interface NotebookCell {
  cellType: 'code' | 'markdown' | 'raw';
  source: string;
  /** Step order when this cell is a step's answer cell. */
  stepOrder?: number;
}

export interface StepEditorProps {
  fileKind: FileKind;
  /** Code, or sanitized HTML for DOCX. */
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** Read-only template content above the step. */
  contextBefore?: string;
  /** Read-only template content below the step. */
  contextAfter?: string;
  /** From Seetharam's useLockdown(). Editors must route copy, paste, and drop through these. */
  integrity: IntegrityHooks;
  /** Name shown on the editor's file tab, for example `hw1.py`. */
  fileName?: string;
  /** PY: line number of the first line of {@link contextBefore} in the whole file, so numbering matches the file. */
  startLine?: number;
  /** IPYNB: every cell of the notebook. Without it the notebook editor shows contextBefore/contextAfter as text. */
  notebookCells?: NotebookCell[];
  /** IPYNB: index in {@link notebookCells} of the cell being edited. */
  activeCellIndex?: number;
  /** IPYNB: text output per cell index, from the test runner (Shreenidhi's runCells). */
  cellOutputs?: Record<number, string>;
}
