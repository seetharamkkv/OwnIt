/*
 * Grant, change, or remove one student's extension on an assignment. Owner: Keya (EduSubmission.extensionUntil).
 * Shown to staff who hold GRANT_EXTENSIONS. The server checks the permission, the date and the reason, and writes
 * the audit log entry (extension.grant / extension.clear).
 */
import React, { useEffect, useState } from 'react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import type { EduSubmission } from '@/common/eduTypes';
import { eduErrorCode, eduErrorMessage } from '@/common/errors';
import { fromLocalInput, toLocalInput } from '@/features/authoring/format';

import { grantExtension } from './api';
import { formatDateTime } from './deadline';

/** The server's own wording for EDU_VALIDATION (for example "must end after the due date"), which is specific. */
function validationDetail(err: unknown): string | null {
  if (eduErrorCode(err) !== 'EDU_VALIDATION' || !(err instanceof Error)) {
    return null;
  }
  const match = err.message.match(/EDU_VALIDATION:\s*([^(]+)/);
  return match ? match[1].trim() : null;
}

export interface ExtensionTarget {
  assignmentId: string;
  studentId: string;
  studentName?: string;
  /** Current personal deadline, if any. */
  extensionUntil?: string;
}

interface ExtensionModalProps {
  target: ExtensionTarget | null;
  /** Assignment due date; the extension must end after it. */
  dueAt?: string;
  onClose: () => void;
  onSaved: (submission: EduSubmission) => void;
}

export function ExtensionModal({ target, dueAt, onClose, onSaved }: ExtensionModalProps) {
  const { reportError } = useErrorBoundary();
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUntil(toLocalInput(target?.extensionUntil));
    setReason('');
    setError(null);
  }, [target]);

  const untilIso = fromLocalInput(until);
  const afterDue = !untilIso || !dueAt || new Date(untilIso).getTime() > new Date(dueAt).getTime();
  const reasonValid = reason.trim().length > 0;

  const save = async (clear: boolean) => {
    if (!target) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sub = await grantExtension(target.assignmentId, target.studentId, reason.trim(), clear ? undefined : untilIso);
      onSaved(sub);
    } catch (err) {
      setError(validationDetail(err) ?? eduErrorMessage(err));
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={target != null} onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <ModalContent width={520}>
        <ModalHeader hideClose={saving}>
          <ModalTitle>Extension</ModalTitle>
          <ModalSubtitle>{target ? `${target.studentName ?? target.studentId} · due ${formatDateTime(dueAt)}` : ''}</ModalSubtitle>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-3">
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
              {target?.extensionUntil ? `Current extension: ${formatDateTime(target.extensionUntil)}.` : 'No extension yet.'} Work saved
              before the new date is on time; the assignment&apos;s late window still applies after the due date.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edu-extension-until">New deadline</Label>
              <Input
                id="edu-extension-until"
                type="datetime-local"
                value={until}
                appearance={until && !afterDue ? 'danger' : 'default'}
                onChange={(e) => setUntil(e.target.value)}
              />
              {until && !afterDue ? (
                <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">Pick a time after the due date.</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edu-extension-reason">Reason (required, kept in the audit log)</Label>
              <Textarea id="edu-extension-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error ? (
              <Alert variant="soft" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>Could not save the extension</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalFooterActions className="gap-2">
            {target?.extensionUntil ? (
              <Button variant="outline" appearance="danger" disabled={saving || !reasonValid} onClick={() => void save(true)}>
                Remove extension
              </Button>
            ) : null}
            <Button variant="outline" appearance="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="solid" appearance="accent" loading={saving} disabled={!untilIso || !afterDue || !reasonValid} onClick={() => void save(false)}>
              Save extension
            </Button>
          </ModalFooterActions>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
