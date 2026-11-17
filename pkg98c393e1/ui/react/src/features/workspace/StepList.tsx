/*
 * Left column of the workspace: overall progress and the steps with their status. Owner: Keya.
 */
import React from 'react';
import { CheckCircle2, Circle, CircleDot, FlaskConical } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { WorkspaceStep } from './model';
import type { Draft } from './useStepDrafts';

type StepStatus = 'done' | 'passing' | 'inProgress' | 'notStarted';

function stepStatus(step: WorkspaceStep, draft: Draft | undefined): StepStatus {
  if (draft?.completed) {
    return 'done';
  }
  const result = step.saved?.lastVisibleResult;
  if (result?.totalCount && result.passedCount === result.totalCount) {
    return 'passing';
  }
  const value = draft?.value ?? step.starterContent;
  return value !== step.starterContent ? 'inProgress' : 'notStarted';
}

const STATUS: Record<StepStatus, { label: string; icon: React.ReactNode }> = {
  done: { label: 'Done', icon: <CheckCircle2 className="size-4 text-[var(--c3-style-basic-fg-success)]" /> },
  passing: { label: 'Tests passing', icon: <FlaskConical className="size-4 text-[var(--c3-style-basic-fg-success)]" /> },
  inProgress: { label: 'In progress', icon: <CircleDot className="size-4 text-[var(--c3-style-basic-fg-warning)]" /> },
  notStarted: { label: 'Not started', icon: <Circle className="size-4 text-[var(--c3-style-basic-fg-secondary)]" /> },
};

interface StepListProps {
  steps: WorkspaceStep[];
  drafts: Record<string, Draft>;
  currentStepId: string;
  onSelect: (stepId: string) => void;
}

export function StepList({ steps, drafts, currentStepId, onSelect }: StepListProps) {
  return (
    <nav aria-label="Steps" className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {steps.map((s) => {
          const status = stepStatus(s, drafts[s.id]);
          const active = s.id === currentStepId;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex w-full items-start gap-2 rounded-xs px-2 py-2 text-left',
                  active ? 'bg-[var(--c3-style-basic-bg-selected)]' : 'hover:bg-[var(--c3-style-basic-bg-hover)]'
                )}
              >
                <span className="mt-0.5" title={STATUS[status].label}>
                  {STATUS[status].icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                    {s.stepOrder}. {s.title}
                  </span>
                  <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {STATUS[status].label}
                    {s.points ? ` · ${s.points} pt${s.points === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
