/*
 * Gradebook (/course/:courseId/gradebook). Owner: Shreenidhi. PROJECT_PLAN.md 7.3.
 *
 * Students × assignments and quizzes from EduGradebook.courseGrid, with late and integrity-flag markers, score
 * overrides (EDIT_GRADES), grade release (RELEASE_GRADES), Canvas-style CSV export, and "Regrade all in my browser",
 * which runs visible and hidden tests here and saves trusted runs (see regrade.ts). The server checks every action.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Pencil, RefreshCw, Send, Square } from 'lucide-react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { useCoursePermission } from '@/common/auth/useCoursePermission';
import type { GradebookCell, GradebookGrid, GradebookItem } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';

import { clearScoreOverride, exportGradebookCsv, fetchGradebook, overrideScore, releaseGrades } from './api';
import { formatDateTime, formatDay, formatScore, statusLabel } from './format';
import { OverrideScoreModal, type OverrideTarget } from './OverrideScoreModal';
import { errorText, regradeAll, regradeWork, type RegradeOutcome, type RegradeProgress } from './regrade';

const PAGE_ROWS = 100;
const DONE_STATUSES = ['SUBMITTED', 'GRADED', 'RETURNED'];

export default function GradebookPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { reportError } = useErrorBoundary();
  const canEditGrades = useCoursePermission(courseId, 'EDIT_GRADES');
  const canRelease = useCoursePermission(courseId, 'RELEASE_GRADES');

  const grid = useQuery({
    queryKey: queryKeys.gradebook(courseId),
    queryFn: () => fetchGradebook(courseId),
    enabled: !!courseId,
  });
  const data: GradebookGrid | undefined = grid.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const allRows = useMemo(() => data?.rows ?? [], [data]);

  const [search, setSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(false);
  const [shown, setShown] = useState(PAGE_ROWS);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allRows.filter((r) => `${r.displayName ?? ''} ${r.studentNumber ?? ''}`.toLowerCase().includes(q))
      : allRows;
    return sortDesc ? [...filtered].reverse() : filtered;
  }, [allRows, search, sortDesc]);

  // ---- Regrade all ----
  const [progress, setProgress] = useState<RegradeProgress | null>(null);
  const [outcome, setOutcome] = useState<RegradeOutcome | null>(null);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const regrading = progress != null;
  const regradeCount = useMemo(() => (data ? regradeWork(data).reduce((n, a) => n + a.work.length, 0) : 0), [data]);

  const startRegrade = async () => {
    if (!data) return;
    cancelRef.current = false;
    setCancelling(false);
    setOutcome(null);
    setRegradeError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await regradeAll(data, { isCancelled: () => cancelRef.current, onProgress: setProgress });
      setOutcome(result);
    } catch (err) {
      setRegradeError(errorText(err));
      reportError(err);
    } finally {
      setProgress(null);
      setCancelling(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.gradebook(courseId) });
    }
  };

  // ---- Export ----
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const csv = await exportGradebookCsv(courseId);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(data?.courseCode || courseId).replace(/[^\w.-]+/g, '_')}-grades.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(errorText(err));
      reportError(err);
    } finally {
      setExporting(false);
    }
  };

  // ---- Release ----
  const [releaseTarget, setReleaseTarget] = useState<GradebookItem | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const confirmRelease = async () => {
    if (!releaseTarget) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      await releaseGrades(releaseTarget.itemId);
      setReleaseTarget(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.gradebook(courseId) });
    } catch (err) {
      setReleaseError(errorText(err));
      reportError(err);
    } finally {
      setReleasing(false);
    }
  };

  // ---- Override ----
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const saveOverride = async (action: () => Promise<unknown>) => {
    setOverrideSaving(true);
    setOverrideError(null);
    try {
      await action();
      setOverrideTarget(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.gradebook(courseId) });
    } catch (err) {
      setOverrideError(errorText(err));
      reportError(err);
    } finally {
      setOverrideSaving(false);
    }
  };
  const openOverride = (target: OverrideTarget) => {
    setOverrideError(null);
    setOverrideTarget(target);
  };

  if (grid.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (grid.error || !data) {
    return <PageMessage title="Could not load the gradebook" message={grid.error ? eduErrorMessage(grid.error) : undefined} />;
  }

  const submittedCount = (index: number) =>
    allRows.filter((r) => {
      const s = r.cells?.[index]?.status;
      return !!s && DONE_STATUSES.includes(s);
    }).length;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Gradebook"
        description={[data.courseCode, data.courseTitle].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" appearance="secondary" onClick={() => navigate(routes.course(courseId))}>
              Back to course
            </Button>
            <Button variant="outline" appearance="secondary" leadingIcon={<Download />} loading={exporting} onClick={exportCsv}>
              Export CSV
            </Button>
            {canEditGrades ? (
              <Button
                variant="solid"
                appearance="accent"
                leadingIcon={<RefreshCw />}
                disabled={regrading || regradeCount === 0}
                title={regradeCount === 0 ? 'No submitted Python or notebook work to regrade' : undefined}
                onClick={startRegrade}
              >
                Regrade all in my browser
              </Button>
            ) : null}
          </div>
        }
      />

      {exportError ? <ErrorAlert title="Could not export" message={exportError} /> : null}
      {regradeError ? <ErrorAlert title="Regrade stopped" message={regradeError} /> : null}

      {progress ? (
        <Container
          title="Regrading in your browser"
          subtitle="Runs visible and hidden tests for every submitted step and saves trusted results. Keep this tab open."
          actions={
            <Button
              variant="outline"
              appearance="danger"
              size="sm"
              leadingIcon={<Square />}
              disabled={cancelling}
              onClick={() => {
                cancelRef.current = true;
                setCancelling(true);
              }}
            >
              {cancelling ? 'Stopping after this step…' : 'Cancel'}
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              {progress.total ? `${progress.done} of ${progress.total} steps` : 'Preparing…'}
            </p>
            {progress.current ? (
              <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{progress.current}</p>
            ) : null}
          </div>
        </Container>
      ) : null}

      {outcome ? <RegradeSummary outcome={outcome} onDismiss={() => setOutcome(null)} /> : null}

      <Container title="Assignments and quizzes" subtitle={`${items.length} graded ${items.length === 1 ? 'item' : 'items'}`}>
        {items.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No published assignments or quizzes yet.</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item, index) => (
              <li
                key={item.itemId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] py-2"
              >
                <div className="flex flex-col">
                  <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{item.title ?? item.itemId}</span>
                  <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                    {item.itemKind === 'QUIZ' ? 'Quiz' : (item.fileKind ?? 'Assignment')} · due {formatDay(item.dueAt)} · {formatScore(item.maxScore)} points ·{' '}
                    {submittedCount(index)} of {allRows.length} submitted
                  </span>
                </div>
                {item.itemKind === 'ASSIGNMENT' ? (
                  item.gradesReleasedAt ? (
                    <Badge variant="soft" appearance="success">
                      Released {formatDateTime(item.gradesReleasedAt)}
                    </Badge>
                  ) : canRelease ? (
                    <Button
                      variant="outline"
                      appearance="secondary"
                      size="sm"
                      leadingIcon={<Send />}
                      onClick={() => {
                        setReleaseError(null);
                        setReleaseTarget(item);
                      }}
                    >
                      Release grades
                    </Button>
                  ) : (
                    <Badge variant="soft" appearance="secondary">
                      Not released
                    </Badge>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container
        title="Students"
        subtitle={`${allRows.length} active ${allRows.length === 1 ? 'student' : 'students'}`}
        actions={
          <Input
            aria-label="Search students"
            placeholder="Search by name or number"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE_ROWS);
            }}
          />
        }
      >
        {allRows.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No students are enrolled yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <DataGrid>
              <DataGridHeader>
                <DataGridRow>
                  <DataGridHead filterable={false} sortDirection={sortDesc ? 'desc' : 'asc'} onSort={() => setSortDesc((d) => !d)}>
                    Student
                  </DataGridHead>
                  {items.map((item) => (
                    <DataGridHead key={item.itemId} sortable={false} filterable={false}>
                      {item.title ?? item.itemId} ({formatScore(item.maxScore)})
                    </DataGridHead>
                  ))}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody>
                {rows.slice(0, shown).map((row) => (
                  <DataGridRow key={row.studentId}>
                    <DataGridCell>
                      <div className="flex flex-col">
                        <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{row.displayName ?? row.studentId}</span>
                        {row.studentNumber ? (
                          <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{row.studentNumber}</span>
                        ) : null}
                      </div>
                    </DataGridCell>
                    {items.map((item, index) => {
                      const cell = row.cells?.[index];
                      return (
                        <DataGridCell key={item.itemId}>
                          {cell ? (
                            <ScoreCell
                              item={item}
                              cell={cell}
                              canOverride={canEditGrades}
                              onOpen={() => {
                                if (cell.workId) {
                                  navigate(routes.submissionViewer(courseId, cell.workId));
                                }
                              }}
                              onOverride={() => openOverride({ row, item, cell })}
                            />
                          ) : (
                            '—'
                          )}
                        </DataGridCell>
                      );
                    })}
                  </DataGridRow>
                ))}
              </DataGridBody>
            </DataGrid>
            {rows.length === 0 ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No students match the search.</p>
            ) : null}
            {rows.length > shown ? (
              <div>
                <Button variant="outline" appearance="secondary" size="sm" onClick={() => setShown((n) => n + PAGE_ROWS)}>
                  Show more ({rows.length - shown} left)
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Container>

      <OverrideScoreModal
        target={overrideTarget}
        saving={overrideSaving}
        error={overrideError}
        onClose={() => setOverrideTarget(null)}
        onSave={(score, reason) => {
          const workId = overrideTarget?.cell.workId;
          if (workId) {
            void saveOverride(() => overrideScore(workId, score, reason));
          }
        }}
        onClear={(reason) => {
          const workId = overrideTarget?.cell.workId;
          if (workId) {
            void saveOverride(() => clearScoreOverride(workId, reason));
          }
        }}
      />

      <Modal open={releaseTarget != null} onOpenChange={(open) => (!open && !releasing ? setReleaseTarget(null) : undefined)}>
        <ModalContent width={480}>
          <ModalHeader hideClose={releasing}>
            <ModalTitle>Release grades?</ModalTitle>
            <ModalSubtitle>{releaseTarget?.title ?? ''}</ModalSubtitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-3">
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                Students will see their scores for this assignment. Later regrades and overrides are visible to them right away.
              </p>
              {releaseError ? <ErrorAlert title="Could not release" message={releaseError} /> : null}
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions className="gap-2">
              <Button variant="outline" appearance="secondary" disabled={releasing} onClick={() => setReleaseTarget(null)}>
                Cancel
              </Button>
              <Button variant="solid" appearance="accent" loading={releasing} leadingIcon={<Send />} onClick={confirmRelease}>
                Release grades
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function ScoreCell({
  item,
  cell,
  canOverride,
  onOpen,
  onOverride,
}: {
  item: GradebookItem;
  cell: GradebookCell;
  canOverride: boolean;
  onOpen: () => void;
  onOverride: () => void;
}) {
  const isAssignment = item.itemKind === 'ASSIGNMENT';
  const text = cell.score != null ? `${formatScore(cell.score)} / ${formatScore(item.maxScore)}` : statusLabel(cell.status);
  const textClass =
    cell.score != null ? 'text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]' : 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]';

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        {cell.workId && isAssignment ? (
          <button
            type="button"
            className={`${textClass} cursor-pointer text-left hover:text-[var(--c3-style-basic-fg-accent)] hover:underline`}
            title="Open the submission"
            onClick={onOpen}
          >
            {text}
          </button>
        ) : (
          <span className={textClass}>{text}</span>
        )}
        {canOverride && cell.workId && isAssignment ? (
          <Button variant="ghost" appearance="secondary" size="icon-sm" aria-label="Override score" title="Override score" onClick={onOverride}>
            <Pencil />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {cell.score != null && cell.status && cell.status !== 'GRADED' ? (
          <Badge variant="soft" appearance="secondary" size="sm">
            {statusLabel(cell.status)}
          </Badge>
        ) : null}
        {cell.overridden ? (
          <Badge variant="soft" appearance="info" size="sm">
            Override
          </Badge>
        ) : null}
        {cell.late ? (
          <Badge variant="soft" appearance="warning" size="sm">
            Late
          </Badge>
        ) : null}
        {cell.flagCount ? (
          <Badge variant="soft" appearance="danger" size="sm">
            {cell.flagCount} {cell.flagCount === 1 ? 'flag' : 'flags'}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function RegradeSummary({ outcome, onDismiss }: { outcome: RegradeOutcome; onDismiss: () => void }) {
  const failed = outcome.failures.length;
  const appearance = failed ? 'warning' : outcome.cancelled ? 'info' : 'success';
  const title = outcome.cancelled
    ? `Regrade cancelled after ${outcome.done} of ${outcome.total} steps`
    : outcome.total === 0 && !failed
      ? 'Nothing to regrade: no submitted step has tests'
      : `Regraded ${outcome.done - failed} of ${outcome.total} steps`;
  return (
    <Alert variant="soft" appearance={appearance}>
      <AlertAppearanceIcon appearance={appearance} />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {failed ? (
            <ul className="flex flex-col gap-1">
              {outcome.failures.slice(0, 20).map((f, i) => (
                <li key={`${f.label}-${i}`}>
                  <span className="text-c3-bold-body-p3">{f.label}:</span> {f.message}
                </li>
              ))}
              {failed > 20 ? <li>…and {failed - 20} more</li> : null}
            </ul>
          ) : (
            'Scores were recomputed from the new trusted runs.'
          )}
        </AlertDescription>
      </AlertContent>
      <Button variant="ghost" appearance="secondary" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </Alert>
  );
}

function ErrorAlert({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="soft" appearance="destructive">
      <AlertAppearanceIcon appearance="destructive" />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

