/*
 * Renders untrusted HTML (DOCX starter content, student answers) and Markdown (instructions). Owner: Rohith.
 * HTML is sanitized with DOMPurify and limited to the tags the DOCX assembler understands.
 */
import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

/** Tags EduAssembler turns into Word content (keep in sync with _HtmlBlocks in EduAssembler.py). */
export const DOCX_HTML_TAGS = [
  'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'code', 'pre',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote',
];

const richText = cn(
  'text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)] flex flex-col gap-2',
  '[&_h1]:text-c3-bold-heading-h4 [&_h2]:text-c3-bold-heading-h5 [&_h3]:text-c3-bold-heading-h6',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_code]:font-mono [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_pre]:bg-[var(--c3-style-basic-bg-secondary)] [&_pre]:p-2',
  '[&_table]:border-collapse [&_td]:border [&_td]:border-[var(--c3-style-basic-border-border)] [&_td]:px-2',
  '[&_th]:border [&_th]:border-[var(--c3-style-basic-border-border)] [&_th]:px-2 [&_a]:underline'
);

export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html || '', { ALLOWED_TAGS: DOCX_HTML_TAGS, ALLOWED_ATTR: [] }), [html]);
  if (!clean.trim()) {
    return <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">(empty)</p>;
  }
  // Sanitized above with an allow-list of formatting tags and no attributes.
  // eslint-disable-next-line react/no-danger
  return <div className={cn(richText, className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) {
    return <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">(no instructions)</p>;
  }
  return (
    <div className={cn(richText, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
