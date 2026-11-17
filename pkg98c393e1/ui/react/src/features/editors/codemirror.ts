/*
 * Helpers shared by the CodeMirror-based editors (PyEditor, NotebookEditor). Owner: Keya.
 */
import { useEffect, useMemo, useState } from 'react';
import { python } from '@codemirror/lang-python';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type { BasicSetupOptions } from '@uiw/react-codemirror';

import type { IntegrityHooks } from '@/features/integrity/types';

/**
 * Inserts at least this long that did not come from a paste, drop, or autocomplete are reported through
 * `onLargeInsert`. Normal typing (one character, or Enter plus indentation) stays below it; LockdownProvider applies
 * the policy's `largeInsertChars` threshold on top.
 */
export const MIN_REPORTED_INSERT = 20;

/** True while the app is in dark mode (useTheme toggles the `dark` class on <html>). */
export function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => setDark(html.classList.contains('dark')));
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function selectedText(view: EditorView): string {
  return view.state.selection.ranges.map((r) => view.state.sliceDoc(r.from, r.to)).join('\n');
}

/** Routes copy, cut, paste, and drop through the lockdown hooks, and reports large non-paste inserts. */
export function integrityExtension(integrity: IntegrityHooks): Extension {
  return [
    EditorView.domEventHandlers({
      paste(event) {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!integrity.onPaste(text)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      drop(event) {
        const text = event.dataTransfer?.getData('text/plain') ?? '';
        if (!integrity.onDrop(text)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      copy(_event, view) {
        integrity.onCopy(selectedText(view));
        return false;
      },
      cut(_event, view) {
        integrity.onCopy(selectedText(view));
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return;
      }
      for (const tr of update.transactions) {
        const typed = tr.isUserEvent('input') && !tr.isUserEvent('input.paste') && !tr.isUserEvent('input.drop') && !tr.isUserEvent('input.complete');
        if (!typed) {
          continue;
        }
        let inserted = 0;
        tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => {
          inserted += text.length;
        });
        if (inserted >= MIN_REPORTED_INSERT) {
          integrity.onLargeInsert(inserted);
        }
      }
    }),
  ];
}

/** Number of lines a context block takes before the student's area (a trailing newline does not start a line). */
export function lineCount(text?: string): number {
  if (!text) {
    return 0;
  }
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed.split('\n').length;
}

/** Basic setup without the stock gutter, so each block can number its lines from its place in the file. */
export const CODE_SETUP: BasicSetupOptions = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
};

export const READONLY_SETUP: BasicSetupOptions = {
  ...CODE_SETUP,
  highlightActiveLine: false,
  highlightSelectionMatches: false,
  autocompletion: false,
  closeBrackets: false,
  bracketMatching: false,
};

/** Python language + line numbers that start after `firstLine - 1` lines of earlier content. */
export function usePythonExtensions(firstLine: number, integrity: IntegrityHooks, withGutter = true): Extension[] {
  return useMemo(() => {
    const ext: Extension[] = [python(), integrityExtension(integrity), EditorView.lineWrapping];
    if (withGutter) {
      ext.push(lineNumbers({ formatNumber: (n) => String(n + firstLine - 1) }));
    }
    return ext;
  }, [firstLine, integrity, withGutter]);
}

export function codeTheme(dark: boolean): Extension | 'light' {
  return dark ? oneDark : 'light';
}
