/*
 * Python file editor: an IDE-like tab, the read-only template code above and below (collapsible), and the student's
 * step in CodeMirror 6 with line numbers that continue from the context. Owner: Keya. PROJECT_PLAN.md 5.3.
 */
import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { ChevronDown, ChevronRight, FileCode2, Lock } from 'lucide-react';

import { CODE_SETUP, READONLY_SETUP, codeTheme, lineCount, useIsDarkMode, usePythonExtensions } from './codemirror';
import type { StepEditorProps } from './types';

interface ContextBlockProps {
  label: string;
  text: string;
  firstLine: number;
  integrity: StepEditorProps['integrity'];
  dark: boolean;
  defaultOpen: boolean;
}

/** Read-only template code, collapsed to one line until the student opens it. */
export function ContextBlock({ label, text, firstLine, integrity, dark, defaultOpen }: ContextBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const display = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = lineCount(text);
  const extensions = usePythonExtensions(firstLine, integrity);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div className="bg-[var(--c3-style-basic-bg-secondary)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-c3-regular-body-p3 flex w-full items-center gap-1 px-3 py-1 text-left text-[var(--c3-style-basic-fg-secondary)] hover:text-[var(--c3-style-basic-fg-primary)]"
      >
        <Icon className="size-4" />
        <Lock className="size-3" />
        {label} · {lines} {lines === 1 ? 'line' : 'lines'}, read-only
      </button>
      {open ? (
        <div className="opacity-80">
          <CodeMirror
            value={display}
            editable={false}
            readOnly
            basicSetup={READONLY_SETUP}
            extensions={extensions}
            theme={codeTheme(dark)}
            aria-label={`${label}, read-only`}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PyEditor({ value, onChange, readOnly, contextBefore, contextAfter, integrity, fileName, startLine = 1 }: StepEditorProps) {
  const dark = useIsDarkMode();
  const beforeLines = lineCount(contextBefore);
  const extensions = usePythonExtensions(startLine + beforeLines, integrity);
  const afterFirstLine = startLine + beforeLines + lineCount(value);

  return (
    <div data-integrity-managed="true" className="flex flex-col overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]">
      <div className="flex items-center border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)]">
        <span className="text-c3-bold-label-l3 flex items-center gap-1 border-r border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-3 py-2 text-[var(--c3-style-basic-fg-primary)]">
          <FileCode2 className="size-4" />
          {fileName ?? 'main.py'}
        </span>
        {readOnly ? (
          <span className="text-c3-regular-body-p3 flex items-center gap-1 px-3 text-[var(--c3-style-basic-fg-secondary)]">
            <Lock className="size-3" /> Read-only
          </span>
        ) : null}
      </div>
      {contextBefore ? (
        <ContextBlock label="Code above" text={contextBefore} firstLine={startLine} integrity={integrity} dark={dark} defaultOpen />
      ) : null}
      <div className="border-y-2 border-[var(--c3-style-basic-border-accent)]">
        <CodeMirror
          value={value}
          onChange={onChange}
          editable={!readOnly}
          readOnly={readOnly}
          basicSetup={CODE_SETUP}
          extensions={extensions}
          theme={codeTheme(dark)}
          minHeight="160px"
          indentWithTab
          aria-label="Python code for this step"
        />
      </div>
      {contextAfter ? (
        <ContextBlock label="Code below" text={contextAfter} firstLine={afterFirstLine} integrity={integrity} dark={dark} defaultOpen={false} />
      ) : null}
    </div>
  );
}
