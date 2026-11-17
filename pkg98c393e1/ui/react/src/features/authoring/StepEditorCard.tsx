/*
 * One step in the builder: title, points, instructions, and its tests. Owner: Rohith.
 * Starter content and context come from the template; edit the template to change them.
 */
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import type { EduAssignmentStep, FileKind } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { TestEditor } from '@/features/testing/TestEditor';

import { updateStep } from './api';
import { MarkdownField } from './MarkdownField';
import { SafeHtml } from './RichText';

interface StepEditorCardProps {
  step: EduAssignmentStep;
  fileKind: FileKind;
  onSaved: () => void;
}

export function StepEditorCard({ step, fileKind, onSaved }: StepEditorCardProps) {
  const { reportError } = useErrorBoundary();
  const [title, setTitle] = useState(step.title);
  const [points, setPoints] = useState(step.points != null ? String(step.points) : '');
  const [instructions, setInstructions] = useState(step.instructionsMd ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== step.title ||
    instructions !== (step.instructionsMd ?? '') ||
    points !== (step.points != null ? String(step.points) : '');

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateStep({ id: step.id, title, instructionsMd: instructions, points: points ? Number(points) : undefined });
      onSaved();
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const idPrefix = `step-${step.id}`;

  return (
    <Container
      title={`${step.stepOrder}. ${step.title}`}
      subtitle={`Marker id: ${step.markerId}`}
      actions={
        <Button variant="outline" appearance="secondary" size="sm" disabled={!dirty || saving} loading={saving} onClick={save}>
          Save step
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-title`}>Title</Label>
              <Input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-points`}>Points</Label>
              <Input id={`${idPrefix}-points`} type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
          </div>
          <MarkdownField id={`${idPrefix}-instr`} label="Instructions (Markdown)" value={instructions} onChange={setInstructions} />
          {error ? <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{error}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">
              {fileKind === 'DOCX' ? 'Starter text' : 'Starter code'}
            </span>
            <Badge variant="outline" appearance="secondary">
              from template
            </Badge>
          </div>
          {fileKind === 'DOCX' ? (
            <div className="max-h-[200px] overflow-auto rounded-xs border border-[var(--c3-style-basic-border-border)] p-2">
              <SafeHtml html={step.starterContent ?? ''} />
            </div>
          ) : (
            <pre className="text-c3-regular-body-p3 m-0 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-xs border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] p-2 font-mono text-[var(--c3-style-basic-fg-primary)]">
              {step.starterContent || '(empty)'}
            </pre>
          )}
        </div>
      </div>
      {fileKind !== 'DOCX' ? (
        <div className="mt-4">
          <TestEditor stepId={step.id} />
        </div>
      ) : null}
    </Container>
  );
}
