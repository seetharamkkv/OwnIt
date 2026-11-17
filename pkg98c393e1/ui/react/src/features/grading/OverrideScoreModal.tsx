/*
 * Score override for one gradebook cell. Owner: Shreenidhi. PROJECT_PLAN.md 7.3.
 * The server checks EDIT_GRADES, the range and the reason, and writes the audit log entry.
 */
import React, { useEffect, useState } from 'react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';

import type { GradebookCell, GradebookItem, GradebookRow } from '@/common/eduTypes';

import { formatScore } from './format';

export interface OverrideTarget {
  row: GradebookRow;
  item: GradebookItem;
  cell: GradebookCell;
}

interface OverrideScoreModalProps {
  target: OverrideTarget | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (score: number, reason: string) => void;
  onClear: (reason: string) => void;
}

export function OverrideScoreModal({ target, saving, error, onClose, onSave, onClear }: OverrideScoreModalProps) {
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setScore(target?.cell.score != null ? String(target.cell.score) : '');
    setReason('');
  }, [target]);

  const max = target?.item.maxScore ?? 0;
  const value = score.trim() === '' ? NaN : Number(score);
  const scoreValid = Number.isFinite(value) && value >= 0 && value <= max;
  const reasonValid = reason.trim().length > 0;

  return (
    <Modal open={target != null} onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <ModalContent width={520}>
        <ModalHeader hideClose={saving}>
          <ModalTitle>Override score</ModalTitle>
          <ModalSubtitle>
            {target ? `${target.row.displayName ?? target.row.studentId} · ${target.item.title ?? target.item.itemId}` : ''}
          </ModalSubtitle>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-3">
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
              Score from tests: {formatScore(target?.cell.autoScore)} / {formatScore(max)}.
              {target?.cell.overridden ? ` Current override: ${formatScore(target.cell.score)}.` : ''}
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="gradebook-override-score">Score (0 to {formatScore(max)})</Label>
              <Input
                id="gradebook-override-score"
                type="number"
                min={0}
                max={max}
                step="0.5"
                value={score}
                appearance={score !== '' && !scoreValid ? 'danger' : 'default'}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="gradebook-override-reason">Reason (required, kept in the audit log)</Label>
              <Textarea id="gradebook-override-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error ? (
              <Alert variant="soft" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>Could not save</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalFooterActions className="gap-2">
            {target?.cell.overridden ? (
              <Button variant="outline" appearance="danger" disabled={saving || !reasonValid} onClick={() => onClear(reason.trim())}>
                Remove override
              </Button>
            ) : null}
            <Button variant="outline" appearance="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="solid"
              appearance="accent"
              loading={saving}
              disabled={!scoreValid || !reasonValid}
              onClick={() => onSave(value, reason.trim())}
            >
              Save override
            </Button>
          </ModalFooterActions>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
