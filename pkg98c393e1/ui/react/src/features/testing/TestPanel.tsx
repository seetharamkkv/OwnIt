/*
 * "Run tests for this step" panel in the student workspace. Owner: Shreenidhi. PROJECT_PLAN.md 7.1.
 *
 * Loads the assignment's visible tests once, runs this step's tests in the browser (Pyodide worker) against the
 * program up to this step, shows pass/fail per test function, and saves the run with EduTestRun.recordMine
 * (feedback only; it never changes a grade). In preview mode (no submission) runs are not saved.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, Play, XCircle } from 'lucide-react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import type { EduAttachment, EduSubmission, EduTestResult } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';
import { useLockdownState } from '@/features/integrity/useLockdownState';

import { fetchVisibleTests, recordMyRun } from './api';
import { DEFAULT_TEST_TIMEOUT_MS } from './config';
import { runTests, testFilesFrom, warmUp } from './runner';

export interface TestPanelProps {
  /** Assignment whose visible tests to load. */
  assignmentId: string;
  /** Empty in preview mode: runs are shown but not saved. */
  submissionId: string;
  stepId: string;
  /** Returns the program made of earlier steps plus this step. */
  getProgramUpTo: () => Promise<string>;
  files: EduAttachment[];
}

interface StepRun {
  results: EduTestResult[];
  ranAt: Date;
  saveError?: string;
}

export function TestPanel({ assignmentId, submissionId, stepId, getProgramUpTo, files }: TestPanelProps) {
  const queryClient = useQueryClient();
  const { locked } = useLockdownState();
  const tests = useQuery({
    queryKey: queryKeys.visibleTests(assignmentId),
    queryFn: () => fetchVisibleTests(assignmentId),
    enabled: !!assignmentId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const stepTests = useMemo(() => (tests.data ?? []).filter((t) => t.step?.id === stepId), [tests.data, stepId]);
  const hasTests = stepTests.length > 0;

  const [runs, setRuns] = useState<Record<string, StepRun>>({});
  const [running, setRunning] = useState(false);
  const [firstRun, setFirstRun] = useState(true);
  const [runError, setRunError] = useState<string | null>(null);

  // Start loading Python as soon as the student is on a step with tests.
  useEffect(() => {
    if (hasTests) {
      warmUp();
    }
  }, [hasTests]);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const program = await getProgramUpTo();
      const results = await runTests({
        program,
        tests: stepTests.map((t) => ({ id: t.id, name: t.testName, code: t.code, timeoutMs: t.timeoutMs })),
        files: testFilesFrom(files),
        timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
      });
      let saveError: string | undefined;
      if (submissionId) {
        try {
          const saved = await recordMyRun(stepId, results);
          queryClient.setQueryData<EduSubmission>(queryKeys.mySubmission(assignmentId), (old) =>
            old
              ? {
                  ...old,
                  responses: old.responses?.map((r) =>
                    r.step?.id === stepId
                      ? { ...r, lastVisibleResult: { passedCount: saved.passedCount, totalCount: saved.totalCount, ranAt: new Date().toISOString() } }
                      : r
                  ),
                }
              : old
          );
        } catch (err) {
          saveError = eduErrorMessage(err);
        }
      }
      setRuns((prev) => ({ ...prev, [stepId]: { results, ranAt: new Date(), saveError } }));
    } catch (err) {
      setRunError(eduErrorMessage(err));
    } finally {
      setRunning(false);
      setFirstRun(false);
    }
  };

  const current = runs[stepId];
  const passed = current?.results.filter((r) => r.passed).length ?? 0;

  return (
    <Container title="Tests" size="sm" subtitle="Feedback only — your grade comes from your instructor's checks.">
      <div className="flex flex-col gap-3">
        {tests.isLoading ? (
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">Loading tests…</span>
          </div>
        ) : tests.error ? (
          <Alert variant="soft" appearance="destructive">
            <AlertAppearanceIcon appearance="destructive" />
            <AlertContent>
              <AlertTitle>Could not load the tests</AlertTitle>
              <AlertDescription>{eduErrorMessage(tests.error)}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : !hasTests ? (
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">This step has no tests you can run.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-c3-regular-body-p3 flex items-center gap-1 text-[var(--c3-style-basic-fg-secondary)]">
                <FlaskConical className="size-4" />
                {stepTests.length} {stepTests.length === 1 ? 'test' : 'tests'}
              </span>
              <Button variant="solid" appearance="accent" size="sm" leadingIcon={<Play />} loading={running} disabled={locked || running} onClick={run}>
                Run tests for this step
              </Button>
            </div>
            {running && firstRun ? (
              <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">Starting Python in your browser. The first run takes a few seconds.</p>
            ) : null}
            {runError ? (
              <Alert variant="soft" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>The tests could not run</AlertTitle>
                  <AlertDescription>{runError}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            {current ? (
              <div className="flex flex-col gap-2" aria-live="polite">
                <p
                  className={cn(
                    'text-c3-bold-label-l3',
                    passed === current.results.length ? 'text-[var(--c3-style-basic-fg-success)]' : 'text-[var(--c3-style-basic-fg-danger)]'
                  )}
                >
                  {passed} of {current.results.length} passed
                </p>
                <ul className="flex flex-col gap-2">
                  {current.results.map((r, i) => (
                    <ResultRow key={`${r.testId}-${r.testName ?? i}`} result={r} />
                  ))}
                </ul>
                {current.saveError ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-warning)]">{`Results were not saved: ${current.saveError}`}</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Container>
  );
}

function ResultRow({ result }: { result: EduTestResult }) {
  return (
    <li className="flex flex-col gap-1 rounded-xs border border-[var(--c3-style-basic-border-border)] p-2">
      <div className="flex items-start gap-2">
        {result.passed ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-success)]" aria-label="Passed" />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-danger)]" aria-label="Failed" />
        )}
        <span className="text-c3-regular-body-p3 min-w-0 flex-1 break-words font-mono text-[var(--c3-style-basic-fg-primary)]">{result.testName}</span>
        {result.durationMs != null ? (
          <span className="text-c3-regular-body-p3 shrink-0 text-[var(--c3-style-basic-fg-secondary)]">{result.durationMs} ms</span>
        ) : null}
      </div>
      {result.message ? (
        <pre className="text-c3-regular-body-p3 m-0 whitespace-pre-wrap break-words pl-6 font-mono text-[var(--c3-style-basic-fg-danger)]">{result.message}</pre>
      ) : null}
      {result.stdout ? (
        <details className="pl-6">
          <summary className="text-c3-regular-body-p3 cursor-pointer text-[var(--c3-style-basic-fg-secondary)]">Output</summary>
          <pre className="text-c3-regular-body-p3 m-0 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[var(--c3-style-basic-fg-primary)]">{result.stdout}</pre>
        </details>
      ) : null}
    </li>
  );
}
