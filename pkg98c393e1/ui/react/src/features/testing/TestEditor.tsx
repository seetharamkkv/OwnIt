/*
 * Test editor embedded in Rohith's assignment builder (one per step). Owner: Shreenidhi. PROJECT_PLAN.md 7.2.
 *
 * Lists the step's tests (visible and hidden) and lets staff add, edit and delete them. Test code is Python: every
 * top-level `def test_*()` is collected, with the student's program up to this step already loaded.
 * Saving needs EDIT_CONTENT in the course; the server checks it (EduStepTest.saveForStep).
 *
 * Also used by the quiz builder for CODE questions: pass `questionId` instead of `stepId` (EduStepTest.questionTests /
 * saveForQuestion / removeForQuestion). Quiz code answers are graded by hand; the tests help students and graders.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { EyeOff, Plus, Save, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import type { EduStepTest, TestVisibility } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';
import { CODE_SETUP, codeTheme, useIsDarkMode } from '@/features/editors/codemirror';

import { fetchQuestionTests, removeQuestionTest, saveQuestionTest } from '@/features/quiz/api';

import { fetchStepTests, removeStepTest, saveStepTest } from './api';

const NEW_TEST_CODE = `def test_example():
    # The student's code up to this step is already loaded, so call their functions directly.
    result = None  # e.g. result = my_function(2)
    assert result is not None, "my_function returned None"
`;

const PYTHON = [python()];

/** Whose tests these are: an assignment step or a quiz CODE question. */
type TestOwner = { kind: 'step'; id: string } | { kind: 'question'; id: string };

export function TestEditor({ stepId, questionId }: { stepId?: string; questionId?: string }) {
  const queryClient = useQueryClient();
  const owner: TestOwner = questionId ? { kind: 'question', id: questionId } : { kind: 'step', id: stepId ?? '' };
  const ownerKey = owner.kind === 'question' ? queryKeys.quizQuestionTests(owner.id) : queryKeys.stepTests(owner.id);
  const tests = useQuery({
    queryKey: ownerKey,
    queryFn: () => (owner.kind === 'question' ? fetchQuestionTests(owner.id) : fetchStepTests(owner.id)),
    enabled: !!owner.id,
    retry: false,
  });
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    setAdding(false);
    void queryClient.invalidateQueries({ queryKey: ownerKey });
    // Students' visible test lists are keyed by assignment; drop them all so previews pick up the change.
    void queryClient.invalidateQueries({ queryKey: ['edu', 'testing', 'visibleTests'] });
  };

  const list = tests.data ?? [];
  const visibleCount = list.filter((t) => t.visibility !== 'HIDDEN').length;

  return (
    <Container
      size="sm"
      title={owner.kind === 'question' ? 'Code tests' : 'Step tests'}
      subtitle={
        tests.data
          ? owner.kind === 'question'
            ? `${visibleCount} visible · ${list.length - visibleCount} hidden. Students can run visible tests during the quiz; code answers are graded by hand when you review attempts.`
            : `${visibleCount} visible · ${list.length - visibleCount} hidden. Students run visible tests for feedback; hidden tests only run when you regrade.`
          : undefined
      }
      actions={
        <Button variant="outline" appearance="secondary" size="sm" leadingIcon={<Plus />} disabled={adding || !owner.id} onClick={() => setAdding(true)}>
          Add test
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {tests.isLoading ? (
          <Spinner />
        ) : tests.error ? (
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{`Could not load the tests: ${eduErrorMessage(tests.error)}`}</p>
        ) : null}
        {list.map((t) => (
          <TestForm key={t.id} owner={owner} test={t} onSaved={refresh} />
        ))}
        {adding ? <TestForm owner={owner} onSaved={refresh} onCancel={() => setAdding(false)} /> : null}
        {tests.data && !list.length && !adding ? (
          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">No tests yet. Add one so students can check their work.</p>
        ) : null}
      </div>
    </Container>
  );
}

interface TestFormProps {
  owner: TestOwner;
  /** Unset for a new test. */
  test?: EduStepTest;
  onSaved: () => void;
  onCancel?: () => void;
}

function TestForm({ owner, test, onSaved, onCancel }: TestFormProps) {
  const { reportError } = useErrorBoundary();
  const dark = useIsDarkMode();
  const idPrefix = `test-${test?.id ?? `new-${owner.id}`}`;
  const [name, setName] = useState(test?.testName ?? '');
  const [code, setCode] = useState(test?.code ?? NEW_TEST_CODE);
  const [visibility, setVisibility] = useState<TestVisibility>(test?.visibility ?? 'VISIBLE');
  const [points, setPoints] = useState(test?.points != null ? String(test.points) : '1');
  const [timeoutSec, setTimeoutSec] = useState(String((test?.timeoutMs ?? 5000) / 1000));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !test ||
    name !== test.testName ||
    code !== test.code ||
    visibility !== (test.visibility ?? 'VISIBLE') ||
    points !== (test.points != null ? String(test.points) : '1') ||
    timeoutSec !== String((test.timeoutMs ?? 5000) / 1000);

  const save = async () => {
    const pts = points.trim() === '' ? undefined : Number(points);
    const secs = Number(timeoutSec);
    if (pts !== undefined && (!Number.isFinite(pts) || pts < 0)) {
      setError('Points must be a number of 0 or more.');
      return;
    }
    if (!Number.isFinite(secs) || secs < 0.1 || secs > 60) {
      setError('The time limit must be between 0.1 and 60 seconds.');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const fields = { id: test?.id, testName: name, code, visibility, points: pts, timeoutMs: Math.round(secs * 1000), testOrder: test?.testOrder };
      if (owner.kind === 'question') {
        await saveQuestionTest({ ...fields, question: { id: owner.id } });
      } else {
        await saveStepTest({ ...fields, step: { id: owner.id } });
      }
      onSaved();
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!test) {
      onCancel?.();
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      await (owner.kind === 'question' ? removeQuestionTest(test.id) : removeStepTest(test.id));
      onSaved();
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-border)] p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_96px_96px]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input id={`${idPrefix}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="load_data returns a DataFrame" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Who sees it</span>
          <Tabs variant="boxed" size="sm" value={visibility} onValueChange={(v) => setVisibility(v as TestVisibility)}>
            <TabsList>
              <TabsTrigger value="VISIBLE">Visible</TabsTrigger>
              <TabsTrigger value="HIDDEN">Hidden</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-points`}>Points</Label>
          <Input id={`${idPrefix}-points`} inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-timeout`}>Limit (s)</Label>
          <Input id={`${idPrefix}-timeout`} inputMode="decimal" value={timeoutSec} onChange={(e) => setTimeoutSec(e.target.value)} />
        </div>
      </div>
      <div className="overflow-hidden rounded-xs border border-[var(--c3-style-basic-border-border)]">
        <CodeMirror
          value={code}
          onChange={setCode}
          basicSetup={CODE_SETUP}
          extensions={PYTHON}
          theme={codeTheme(dark)}
          minHeight="120px"
          maxHeight="360px"
          indentWithTab
          aria-label="Python test code"
        />
      </div>
      {error ? <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {visibility === 'HIDDEN' ? (
            <Badge variant="soft" appearance="secondary">
              <EyeOff className="size-3" /> Never sent to students
            </Badge>
          ) : null}
          {!test ? (
            <Badge variant="soft" appearance="info">
              New
            </Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" appearance="danger" size="sm" leadingIcon={<Trash2 />} loading={busy === 'delete'} disabled={busy !== null} onClick={remove}>
            {test ? 'Delete' : 'Cancel'}
          </Button>
          <Button variant="solid" appearance="accent" size="sm" leadingIcon={<Save />} loading={busy === 'save'} disabled={busy !== null || !dirty} onClick={save}>
            Save test
          </Button>
        </div>
      </div>
    </div>
  );
}
