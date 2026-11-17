/*
 * Notebook editor: In [ ] / Out [ ] gutters, Markdown cells rendered as text, code cells in CodeMirror, and only the
 * current step's cell editable. Owner: Keya. PROJECT_PLAN.md 5.3.
 * Output under a cell comes from `cellOutputs` (Shreenidhi's Pyodide runCells), when the runner provides it.
 */
import React, { useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { BookOpen, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { CODE_SETUP, READONLY_SETUP, codeTheme, useIsDarkMode, usePythonExtensions } from './codemirror';
import { MarkdownView } from './MarkdownView';
import type { NotebookCell, StepEditorProps } from './types';

interface CodeCellProps {
  cell: NotebookCell;
  active: boolean;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  integrity: StepEditorProps['integrity'];
  dark: boolean;
  output?: string;
}

function CodeCell({ cell, active, value, onChange, readOnly, integrity, dark, output }: CodeCellProps) {
  const extensions = usePythonExtensions(1, integrity, active);
  const editable = active && !readOnly;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <span
          className={cn(
            'text-c3-regular-body-p3 w-14 shrink-0 pt-1 text-right font-mono',
            active ? 'text-[var(--c3-style-basic-fg-accent)]' : 'text-[var(--c3-style-basic-fg-secondary)]'
          )}
        >
          In [ ]:
        </span>
        <div
          className={cn(
            'min-w-0 flex-1 overflow-hidden rounded-xs border',
            active ? 'border-2 border-[var(--c3-style-basic-border-accent)]' : 'border-[var(--c3-style-basic-border-border)] opacity-80'
          )}
        >
          {cell.stepOrder !== undefined && !active ? (
            <div className="text-c3-regular-body-p3 flex items-center gap-1 bg-[var(--c3-style-basic-bg-secondary)] px-2 py-0.5 text-[var(--c3-style-basic-fg-secondary)]">
              <Lock className="size-3" /> Step {cell.stepOrder} · your answer
            </div>
          ) : null}
          <CodeMirror
            value={active ? value : cell.source}
            onChange={editable ? onChange : undefined}
            editable={editable}
            readOnly={!editable}
            basicSetup={editable ? CODE_SETUP : READONLY_SETUP}
            extensions={extensions}
            theme={codeTheme(dark)}
            minHeight={active ? '120px' : undefined}
            indentWithTab={editable}
            aria-label={active ? 'Notebook cell for this step' : 'Notebook cell, read-only'}
          />
        </div>
      </div>
      {output ? (
        <div className="flex gap-2">
          <span className="text-c3-regular-body-p3 w-14 shrink-0 text-right font-mono text-[var(--c3-style-basic-fg-secondary)]">Out [ ]:</span>
          <pre className="text-c3-regular-body-p3 m-0 min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap font-mono text-[var(--c3-style-basic-fg-primary)]">
            {output}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function NotebookEditor({
  value,
  onChange,
  readOnly,
  contextBefore,
  contextAfter,
  integrity,
  fileName,
  notebookCells,
  activeCellIndex,
  cellOutputs,
}: StepEditorProps) {
  const dark = useIsDarkMode();
  const activeRef = useRef<HTMLDivElement>(null);

  // Bring the step's cell into view when the step changes.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCellIndex]);

  // Without the notebook JSON, fall back to one editable cell between the text context.
  const cells: NotebookCell[] = notebookCells?.length
    ? notebookCells
    : [
        ...(contextBefore ? [{ cellType: 'markdown' as const, source: contextBefore }] : []),
        { cellType: 'code' as const, source: value },
        ...(contextAfter ? [{ cellType: 'markdown' as const, source: contextAfter }] : []),
      ];
  const active = notebookCells?.length ? activeCellIndex ?? -1 : contextBefore ? 1 : 0;

  return (
    <div data-integrity-managed="true" className="flex flex-col overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] px-3 py-2">
        <BookOpen className="size-4 text-[var(--c3-style-basic-fg-secondary)]" />
        <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">{fileName ?? 'notebook.ipynb'}</span>
        <Badge variant="outline" appearance="secondary" size="sm">
          Python 3
        </Badge>
        {readOnly ? (
          <span className="text-c3-regular-body-p3 flex items-center gap-1 text-[var(--c3-style-basic-fg-secondary)]">
            <Lock className="size-3" /> Read-only
          </span>
        ) : null}
      </div>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3">
        {cells.map((cell, index) => (
          // Cells have no ids in the template; their position is stable for a given assignment.
          <div key={index} ref={index === active ? activeRef : undefined}>
            {cell.cellType === 'code' ? (
              <CodeCell
                cell={cell}
                active={index === active}
                value={value}
                onChange={onChange}
                readOnly={!!readOnly}
                integrity={integrity}
                dark={dark}
                output={cellOutputs?.[index]}
              />
            ) : (
              <div className="pl-16">
                {cell.cellType === 'markdown' ? (
                  <MarkdownView source={cell.source} />
                ) : (
                  <pre className="text-c3-regular-body-p3 m-0 whitespace-pre-wrap font-mono text-[var(--c3-style-basic-fg-secondary)]">{cell.source}</pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
