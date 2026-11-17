/*
 * Submit confirmation and the "submitted" summary with the download link. Owner: Keya. PROJECT_PLAN.md 5.1.
 */
import React, { useState } from 'react';
import { Download, Send } from 'lucide-react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { eduErrorMessage } from '@/common/errors';
import { submissionDownloadLink } from '@/features/authoring/api';

import { formatDateTime } from './deadline';

interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepsDone: number;
  stepsTotal: number;
  late: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
}

export function SubmitDialog({ open, onOpenChange, stepsDone, stepsTotal, late, submitting, error, onConfirm }: SubmitDialogProps) {
  const notDone = stepsTotal - stepsDone;
  return (
    <Modal open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <ModalContent width={520}>
        <ModalHeader hideClose={submitting}>
          <ModalTitle>Submit this assignment?</ModalTitle>
          <ModalSubtitle>Once submitted, your answers are locked and the final file is built.</ModalSubtitle>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-3">
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              {stepsDone} of {stepsTotal} steps are marked done.
            </p>
            {notDone > 0 ? (
              <Alert variant="soft" appearance="warning">
                <AlertAppearanceIcon appearance="warning" />
                <AlertContent>
                  <AlertTitle>
                    {notDone} {notDone === 1 ? 'step is' : 'steps are'} not marked done
                  </AlertTitle>
                  <AlertDescription>They are submitted as they are now, including any unchanged starter code.</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            {late ? (
              <Alert variant="soft" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>This submission is late</AlertTitle>
                  <AlertDescription>The due date has passed; a late penalty may apply.</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            {submitting ? (
              <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                Saving your answers and assembling the file. This can take up to a minute.
              </p>
            ) : null}
            {error ? (
              <Alert variant="soft" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>Could not submit</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalFooterActions className="gap-2">
            <Button variant="outline" appearance="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Keep working
            </Button>
            <Button variant="solid" appearance="accent" loading={submitting} leadingIcon={<Send />} onClick={onConfirm}>
              Submit
            </Button>
          </ModalFooterActions>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface SubmittedBannerProps {
  submissionId: string;
  submittedAt?: string;
  late?: boolean;
  fileName: string;
  stepsDone: number;
  stepsTotal: number;
}

export function SubmittedBanner({ submissionId, submittedAt, late, fileName, stepsDone, stepsTotal }: SubmittedBannerProps) {
  const { reportError } = useErrorBoundary();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const url = await submissionDownloadLink(submissionId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Alert variant="soft" appearance={late ? 'warning' : 'success'}>
      <AlertAppearanceIcon appearance={late ? 'warning' : 'success'} />
      <AlertContent>
        <AlertTitle>
          Submitted {formatDateTime(submittedAt)}
          {late ? ' (late)' : ''}
        </AlertTitle>
        <AlertDescription>
          {stepsDone} of {stepsTotal} steps marked done. Your answers are locked.
          {error ? ` Download failed: ${error}` : ''}
        </AlertDescription>
      </AlertContent>
      <Button variant="outline" appearance="secondary" size="sm" leadingIcon={<Download />} loading={downloading} onClick={download}>
        Download {fileName}
      </Button>
    </Alert>
  );
}
