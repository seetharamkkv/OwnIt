/*
 * Word-style document editor: a white page on a grey background with a Word-like toolbar, built on TipTap 3
 * (StarterKit, TableKit, Placeholder). Owner: Keya. PROJECT_PLAN.md 5.3.
 * Paste and drop go through the lockdown hooks (editorProps.handlePaste / handleDrop); the HTML sent to onChange is
 * sanitized with DOMPurify. Supported formatting is deliberately basic so the DOCX round trip stays reliable.
 */
import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import {
  Bold,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Lock,
  Redo2,
  Table as TableIcon,
  Underline,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { MIN_REPORTED_INSERT } from './codemirror';
import type { StepEditorProps } from './types';

import './docEditor.css';

const sanitize = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

/**
 * Characters of text a transaction typed into the document, for large-insert reporting. Pastes and drops (already
 * checked by handlePaste / handleDrop), cuts, and undo/redo don't count, so only typing, autotypers, and extensions
 * that write into the page are measured.
 */
function typedInsertLength(tr: Transaction): number {
  const ui = tr.getMeta('uiEvent') as string | undefined;
  if (ui === 'paste' || ui === 'drop' || ui === 'cut' || tr.getMeta('paste') || tr.getMeta('history$')) {
    return 0;
  }
  let inserted = 0;
  tr.steps.forEach((step) => {
    if (step instanceof ReplaceStep) {
      const content = step.slice.content;
      inserted += content.textBetween(0, content.size, '\n').length;
    }
  });
  return inserted;
}

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  h1: boolean;
  h2: boolean;
  bullet: boolean;
  ordered: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const state = useEditorState<ToolbarState>({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      codeBlock: e.isActive('codeBlock'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const tools: { label: string; icon: React.ReactNode; active?: boolean; enabled?: boolean; run: () => void }[] = [
    { label: 'Undo', icon: <Undo2 />, enabled: state.canUndo, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', icon: <Redo2 />, enabled: state.canRedo, run: () => editor.chain().focus().redo().run() },
    { label: 'Heading 1', icon: <Heading1 />, active: state.h1, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'Heading 2', icon: <Heading2 />, active: state.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bold', icon: <Bold />, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: <Italic />, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Underline', icon: <Underline />, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Bulleted list', icon: <List />, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: <ListOrdered />, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Code block', icon: <Code2 />, active: state.codeBlock, run: () => editor.chain().focus().toggleCodeBlock().run() },
    {
      label: 'Insert table',
      icon: <TableIcon />,
      run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-2 py-1">
      {tools.map((t) => (
        <Button
          key={t.label}
          variant={t.active ? 'soft' : 'ghost'}
          appearance={t.active ? 'accent' : 'secondary'}
          size="icon-sm"
          aria-label={t.label}
          aria-pressed={t.active}
          title={t.label}
          disabled={disabled || t.enabled === false}
          onClick={t.run}
        >
          {t.icon}
        </Button>
      ))}
    </div>
  );
}

/** Read-only template text around the answer, as paragraphs on the page. */
function DocContext({ text, label }: { text: string; label: string }) {
  return (
    <div aria-label={label} className="edu-doc-context">
      {looksLikeHtml(text) ? (
        // Sanitized template HTML from the instructor's document.
        <div dangerouslySetInnerHTML={{ __html: sanitize(text) }} />
      ) : (
        text
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((p) => <p key={p.slice(0, 40) + p.length}>{p}</p>)
      )}
    </div>
  );
}

export function DocEditor({ value, onChange, readOnly, contextBefore, contextAfter, integrity, fileName }: StepEditorProps) {
  // TipTap reads its options once; refs keep the handlers current without recreating the editor.
  const integrityRef = useRef(integrity);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    integrityRef.current = integrity;
    onChangeRef.current = onChange;
  }, [integrity, onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Write your answer here…' }),
    ],
    content: sanitize(value),
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'edu-doc-answer', 'aria-label': 'Document answer for this step', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => !integrityRef.current.onPaste(event.clipboardData?.getData('text/plain') ?? ''),
      handleDrop: (_view, event) => !integrityRef.current.onDrop((event as DragEvent).dataTransfer?.getData('text/plain') ?? ''),
      handleDOMEvents: {
        copy: () => {
          integrityRef.current.onCopy(window.getSelection()?.toString() ?? '');
          return false;
        },
        cut: () => {
          integrityRef.current.onCopy(window.getSelection()?.toString() ?? '');
          return false;
        },
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      const typed = typedInsertLength(transaction);
      if (typed >= MIN_REPORTED_INSERT) {
        integrityRef.current.onLargeInsert(typed);
      }
      onChangeRef.current(sanitize(e.getHTML()));
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Accept a new value from outside (for example "use the saved version"), but never while the student is typing.
  useEffect(() => {
    if (editor && !editor.isFocused && sanitize(editor.getHTML()) !== sanitize(value)) {
      editor.commands.setContent(sanitize(value), { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div data-integrity-managed="true" className="flex flex-col overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-border)]">
      <div className="flex items-center gap-2 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] px-3 py-2">
        <FileText className="size-4 text-[var(--c3-style-basic-fg-secondary)]" />
        <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">{fileName ?? 'document.docx'}</span>
        {readOnly ? (
          <span className="text-c3-regular-body-p3 flex items-center gap-1 text-[var(--c3-style-basic-fg-secondary)]">
            <Lock className="size-3" /> Read-only
          </span>
        ) : null}
      </div>
      {editor ? <Toolbar editor={editor} disabled={!!readOnly} /> : null}
      <div className="max-h-[70vh] overflow-y-auto bg-[var(--c3-style-basic-bg-secondary)] px-4 py-6">
        <div className="edu-doc-page mx-auto w-full max-w-[816px] bg-[var(--c3-style-basic-bg-primary)] shadow-sm">
          {contextBefore ? <DocContext text={contextBefore} label="Document text above, read-only" /> : null}
          <div className={cn('edu-doc-answer-frame', readOnly && 'edu-doc-answer-frame--readonly')}>
            <EditorContent editor={editor} />
          </div>
          {contextAfter ? <DocContext text={contextAfter} label="Document text below, read-only" /> : null}
        </div>
      </div>
    </div>
  );
}
