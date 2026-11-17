/*
 * Markdown field with Edit / Preview tabs. Owner: Rohith.
 */
import React, { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { Markdown } from './RichText';

interface MarkdownFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function MarkdownField({ id, label, value, onChange, rows = 4 }: MarkdownFieldProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Tabs variant="boxed" size="sm" value={mode} onValueChange={(v) => setMode(v as 'edit' | 'preview')}>
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode === 'edit' ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
      ) : (
        <div className="min-h-[60px] rounded-xs border border-[var(--c3-style-basic-border-border)] p-2">
          <Markdown text={value} />
        </div>
      )}
    </div>
  );
}
