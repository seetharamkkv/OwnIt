/*
 * Markdown for step instructions and notebook text cells (react-markdown 8 + remark-gfm 3). Owner: Keya.
 * Raw HTML in the Markdown is not rendered (react-markdown's default), so instructor text cannot inject markup.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import './markdown.css';

interface MarkdownViewProps {
  source: string;
  className?: string;
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  return (
    <div className={cn('edu-markdown text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} linkTarget="_blank">
        {source}
      </ReactMarkdown>
    </div>
  );
}
