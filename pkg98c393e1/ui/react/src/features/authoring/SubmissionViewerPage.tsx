/*
 * Submission viewer (/course/:courseId/submissions/:submissionId). Owner: Rohith. PROJECT_PLAN.md 4.3.
 * Shows each step's answer, the assembled program, a download of the final file, and Seetharam's integrity timeline.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileCode } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Spinner } from '@/components/ui/spinner';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { routes } from '@/common/routes';
import { IntegrityTimeline } from '@/features/integrity/IntegrityTimeline';

import { assembleUpTo, fetchAssignmentSteps, fetchSubmission, fetchSubmissionResponses, submissionDownloadLink } from './api';
import { FILE_KIND_LABEL, formatDate } from './format';
import { SafeHtml } from './RichText';

const preClass =
  'text-c3-regular-body-p3 m-0 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xs border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] p-2 font-mono text-[var(--c3-style-basic-fg-primary)]';

export default function SubmissionViewerPage() {
  const { courseId = '', submissionId = '' } = useParams();
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();
  const [program, setProgram] = useState<string | null>(null);
  const [busy, setBusy] = useState<'program' | 'download' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sub = useQuery({ queryKey: ['edu', 'authoring', 'submission', submissionId], queryFn: () => fetchSubmission(submissionId) });
  const assignmentId = sub.data?.assignment.id;
  const steps = useQuery({
    queryKey: ['edu', 'authoring', 'steps', assignmentId],
    queryFn: () => fetchAssignmentSteps(assignmentId as string),
    enabled: Boolean(assignmentId),
  });
  const responses = useQuery({
    queryKey: ['edu', 'authoring', 'responses', submissionId],
    queryFn: () => fetchSubmissionResponses(submissionId),
  });

  const byStep = useMemo(() => new Map((responses.data ?? []).map((r) => [r.step.id, r])), [responses.data]);
  const lastOrder = useMemo(() => Math.max(0, ...(steps.data ?? []).map((s) => s.stepOrder)), [steps.data]);
  const fileKind = sub.data?.assignment.fileKind;

  const showProgram = async () => {
    setBusy('program');
    setActionError(null);
    try {
      setProgram(await assembleUpTo(submissionId, lastOrder));
    } catch (err) {
      setActionError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('download');
    setActionError(null);
    try {
      window.open(await submissionDownloadLink(submissionId), '_blank', 'noopener');
    } catch (err) {
      setActionError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  if (sub.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (sub.error) {
    return <PageMessage title="Could not load the submission" message={eduErrorMessage(sub.error)} />;
  }
  if (!sub.data) {
    return <PageMessage title="Submission not found" />;
  }
  const s = sub.data;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
            {s.student.displayName ?? s.student.id} · {s.assignment.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="soft" appearance={s.status === 'SUBMITTED' || s.status === 'GRADED' ? 'success' : 'secondary'}>
              {s.status ?? 'NOT_STARTED'}
            </Badge>
            {s.late ? (
              <Badge variant="soft" appearance="warning">
                Late
              </Badge>
            ) : null}
            {fileKind ? (
              <Badge variant="outline" appearance="secondary">
                {FILE_KIND_LABEL[fileKind]}
              </Badge>
            ) : null}
            <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Started {formatDate(s.startedAt)} · submitted {formatDate(s.submittedAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            appearance="secondary"
            onClick={() => (assignmentId ? navigate(routes.assignmentEdit(courseId, assignmentId)) : navigate(routes.course(courseId)))}
          >
            Back to assignment
          </Button>
          {fileKind !== 'DOCX' ? (
            <Button variant="outline" appearance="secondary" leadingIcon={<FileCode />} loading={busy === 'program'} disabled={!lastOrder} onClick={showProgram}>
              Show assembled program
            </Button>
          ) : null}
          <Button variant="solid" appearance="accent" leadingIcon={<Download />} loading={busy === 'download'} onClick={download}>
            Download file
          </Button>
        </div>
      </div>

      {actionError ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{actionError}</p> : null}

      {program !== null ? (
        <Container title="Assembled program" subtitle={fileKind === 'IPYNB' ? 'Code cells only' : undefined}>
          <pre className={preClass}>{program}</pre>
        </Container>
      ) : null}

      {steps.isLoading || responses.isLoading ? <Spinner /> : null}
      {steps.error || responses.error ? (
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(steps.error ?? responses.error)}</p>
      ) : null}

      {(steps.data ?? []).map((step) => {
        const r = byStep.get(step.id);
        const result = r?.lastVisibleResult;
        return (
          <Container
            key={step.id}
            title={`${step.stepOrder}. ${step.title}`}
            subtitle={r ? `Revision ${r.revision ?? 0}` : 'Not answered (starter code shown)'}
            actions={
              <div className="flex items-center gap-2">
                {r?.completed ? (
                  <Badge variant="soft" appearance="success">
                    Done
                  </Badge>
                ) : null}
                {result?.totalCount ? (
                  <Badge variant="soft" appearance={result.passedCount === result.totalCount ? 'success' : 'warning'}>
                    {result.passedCount ?? 0}/{result.totalCount} tests
                  </Badge>
                ) : null}
              </div>
            }
          >
            {fileKind === 'DOCX' ? (
              <SafeHtml html={r?.content ?? step.starterContent ?? ''} />
            ) : (
              <pre className={preClass}>{r?.content ?? step.starterContent ?? ''}</pre>
            )}
          </Container>
        );
      })}

      <IntegrityTimeline contextId={submissionId} />
    </div>
  );
}
