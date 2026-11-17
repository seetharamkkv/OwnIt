/*
 * Quiz attempts and manual grading (/course/:courseId/quizzes/:quizId/attempts). Owner: Shreenidhi. PROJECT_PLAN.md 7.4.
 *
 * Lists every attempt (EduQuizAttempt.forQuiz); opening one shows the staff review (reviewAttempt: answers, key,
 * points). CODE answers are graded here (EduQuizAnswer.gradeManually, audited); staff can run the question's
 * visible and hidden tests in their browser first. "Regrade" re-applies the current answer key (regradeAttempt).
 * Grading needs EDIT_GRADES in the course; the server checks it.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Play, RefreshCw, Save, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { BadgeAppearance } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { EduQuizAttempt, EduTestResult, QuizAttemptStatus, QuizResultQuestion } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { MarkdownView } from '@/features/editors/MarkdownView';
import { DEFAULT_TEST_TIMEOUT_MS } from '@/features/testing/config';
import { runTests } from '@/features/testing/runner';

import { fetchQuestionTests, fetchQuizAttempts, fetchQuizForEdit, gradeAnswerManually, regradeAttempt, reviewAttempt } from './api';
import { dateTime, KIND_LABEL, scoreText } from './format';

const MUTED = 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]';
const DANGER = 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]';

const STATUS: Record<QuizAttemptStatus, { label: string; appearance: BadgeAppearance }> = {
  IN_PROGRESS: { label: 'In progress', appearance: 'info' },
  SUBMITTED: { label: 'Needs grading', appearance: 'warning' },
  GRADED: { label: 'Graded', appearance: 'success' },
};

type Filter = 'all' | 'grading' | 'graded' | 'progress';

export default function QuizAttemptsPage() {
  const { courseId = '', quizId = '' } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const quiz = useQuery({ queryKey: queryKeys.quizForEdit(quizId), queryFn: () => fetchQuizForEdit(quizId), enabled: !!quizId, retry: false });
  const attempts = useQuery({ queryKey: queryKeys.quizAttempts(quizId), queryFn: () => fetchQuizAttempts(quizId), enabled: !!quizId });

  const rows = useMemo(() => attempts.data ?? [], [attempts.data]);
  const counts = {
    all: rows.length,
    grading: rows.filter((a) => a.status === 'SUBMITTED').length,
    graded: rows.filter((a) => a.status === 'GRADED').length,
    progress: rows.filter((a) => a.status === 'IN_PROGRESS').length,
  };
  const shown = rows.filter(
    (a) =>
      filter === 'all' ||
      (filter === 'grading' && a.status === 'SUBMITTED') ||
      (filter === 'graded' && a.status === 'GRADED') ||
      (filter === 'progress' && a.status === 'IN_PROGRESS')
  );

  if (quiz.error) {
    return <PageMessage title="Could not load the quiz" message={eduErrorMessage(quiz.error)} />;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <button type="button" className={`${MUTED} flex items-center gap-1 hover:underline`} onClick={() => navigate(routes.quizEdit(courseId, quizId))}>
          <ArrowLeft className="size-4" /> Back to the quiz
        </button>
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Attempts · {quiz.data?.title ?? quizId}</h1>
      </div>

      <Tabs variant="boxed" size="sm" value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All {counts.all}</TabsTrigger>
          <TabsTrigger value="grading">Needs grading {counts.grading}</TabsTrigger>
          <TabsTrigger value="graded">Graded {counts.graded}</TabsTrigger>
          <TabsTrigger value="progress">In progress {counts.progress}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <Container title="Students" size="sm">
          {attempts.isLoading ? <Spinner /> : null}
          {attempts.error ? <p className={DANGER}>{eduErrorMessage(attempts.error)}</p> : null}
          {!attempts.isLoading && !shown.length ? <p className={MUTED}>No attempts in this view.</p> : null}
          <ul className="flex flex-col">
            {shown.map((a) => (
              <AttemptRow key={a.id} a={a} active={a.id === openId} onOpen={() => setOpenId(a.id)} />
            ))}
          </ul>
        </Container>
        {openId ? <AttemptReview key={openId} attemptId={openId} quizId={quizId} /> : <Container size="sm"><p className={MUTED}>Pick an attempt to review it.</p></Container>}
      </div>
    </div>
  );
}

function AttemptRow({ a, active, onOpen }: { a: EduQuizAttempt; active: boolean; onOpen: () => void }) {
  const s = STATUS[a.status ?? 'IN_PROGRESS'];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] px-2 py-2.5 text-left ${
          active ? 'bg-[var(--c3-style-basic-bg-secondary)]' : 'hover:bg-[var(--c3-style-basic-bg-secondary)]'
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
            {a.student?.displayName ?? a.student?.id ?? 'Student'}
            {a.student?.studentNumber ? <span className={`${MUTED} ml-2`}>{a.student.studentNumber}</span> : null}
          </span>
          <span className={MUTED}>
            Attempt {a.attemptNo ?? 1} · {a.submittedAt ? `submitted ${dateTime(a.submittedAt)}` : `started ${dateTime(a.startedAt)}`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{a.score != null ? scoreText(a.score, undefined) : '—'}</span>
          <Badge variant="soft" appearance={s.appearance}>
            {s.label}
          </Badge>
        </span>
      </button>
    </li>
  );
}

function AttemptReview({ attemptId, quizId }: { attemptId: string; quizId: string }) {
  const queryClient = useQueryClient();
  const review = useQuery({ queryKey: queryKeys.quizReview(attemptId), queryFn: () => reviewAttempt(attemptId) });
  const [regrading, setRegrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizReview(attemptId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizAttempts(quizId) });
    void queryClient.invalidateQueries({ queryKey: ['edu', 'quiz', 'courseQuizzes'] });
    void queryClient.invalidateQueries({ queryKey: ['edu', 'grading', 'gradebook'] });
  };

  const regrade = async () => {
    setRegrading(true);
    setError(null);
    try {
      await regradeAttempt(attemptId);
      refresh();
    } catch (err) {
      setError(eduErrorMessage(err));
    } finally {
      setRegrading(false);
    }
  };

  if (review.isLoading) {
    return (
      <Container size="sm">
        <Spinner />
      </Container>
    );
  }
  if (review.error || !review.data) {
    return (
      <Container size="sm">
        <p className={DANGER}>{eduErrorMessage(review.error)}</p>
      </Container>
    );
  }
  const r = review.data;
  const inProgress = r.attempt.status === 'IN_PROGRESS';

  return (
    <Container
      title={`${r.studentName ?? 'Student'} · attempt ${r.attempt.attemptNo ?? 1}`}
      subtitle={`Score ${scoreText(r.score, r.maxScore)}${r.pendingManualGrading ? ' · code answers still to grade' : ''}${inProgress ? ' · still in progress' : ''}`}
      size="sm"
      actions={
        <Button variant="outline" appearance="secondary" size="sm" leadingIcon={<RefreshCw />} loading={regrading} disabled={regrading || inProgress} onClick={() => void regrade()}>
          Regrade with current key
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <p className={DANGER}>{error}</p> : null}
        {(r.questions ?? []).map((q, i) => (
          <ReviewQuestion key={q.questionId} q={q} index={i} canGrade={!inProgress} onGraded={refresh} />
        ))}
      </div>
    </Container>
  );
}

function ReviewQuestion({ q, index, canGrade, onGraded }: { q: QuizResultQuestion; index: number; canGrade: boolean; onGraded: () => void }) {
  const isCode = q.questionKind === 'CODE';
  const chosen = q.selectedOptionIds ?? [];
  const correct = q.correctOptionIds ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-[var(--c3-style-basic-border-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">Q{index + 1}</span>
          <Badge variant="soft" appearance="info">
            {KIND_LABEL[q.questionKind]}
          </Badge>
          {isCode ? (
            q.needsManualGrading ? (
              <Badge variant="soft" appearance="warning">
                Needs grading
              </Badge>
            ) : null
          ) : q.correct ? (
            <Badge variant="soft" appearance="success">
              Correct
            </Badge>
          ) : (
            <Badge variant="soft" appearance="danger">
              Incorrect
            </Badge>
          )}
          {q.manualScore != null ? (
            <Badge variant="outline" appearance="secondary">
              Graded by hand
            </Badge>
          ) : null}
        </span>
        <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{scoreText(q.pointsEarned, q.points)}</span>
      </div>
      <MarkdownView source={q.promptMd ?? ''} />

      {(q.options ?? []).length ? (
        <ul className="flex flex-col gap-1">
          {(q.options ?? []).map((o) => {
            const picked = chosen.includes(o.optionId);
            const right = correct.includes(o.optionId);
            return (
              <li key={o.optionId} className="flex items-center gap-2">
                <span className="w-4">
                  {right ? <Check className="size-4 text-[var(--c3-style-basic-fg-success)]" /> : picked ? <X className="size-4 text-[var(--c3-style-basic-fg-danger)]" /> : null}
                </span>
                <MarkdownView source={o.label} className="[&_p]:!m-0" />
                {picked ? <span className={MUTED}>(chosen)</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {q.questionKind === 'SHORT_ANSWER' ? (
        <div className={MUTED}>
          Answer: <span className="font-mono text-[var(--c3-style-basic-fg-primary)]">{q.answerText || '—'}</span> · accepted: {(q.acceptedAnswers ?? []).join(', ') || '—'}
        </div>
      ) : null}

      {isCode ? <CodeReview q={q} /> : null}

      {q.answerId && canGrade ? <ManualGrade q={q} onGraded={onGraded} /> : !q.answerId ? <span className={MUTED}>Not answered.</span> : null}
    </div>
  );
}

function CodeReview({ q }: { q: QuizResultQuestion }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EduTestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const tests = await fetchQuestionTests(q.questionId);
      if (!tests.length) {
        setError('This question has no tests.');
        return;
      }
      setResults(
        await runTests({
          program: q.code ?? '',
          tests: tests.map((t) => ({ id: t.id, name: t.testName, code: t.code, timeoutMs: t.timeoutMs })),
          files: [],
          timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
        })
      );
    } catch (err) {
      setError(eduErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-[320px] overflow-auto rounded-xs border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] p-2 font-mono text-[12px] text-[var(--c3-style-basic-fg-primary)]">
        {q.code || '(no answer)'}
      </pre>
      {q.code ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" appearance="secondary" size="sm" leadingIcon={<Play />} loading={running} disabled={running} onClick={() => void run()}>
            Run all tests in my browser
          </Button>
          {results ? (
            <span className={MUTED}>
              {results.filter((r) => r.passed).length} of {results.length} passing
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <p className={DANGER}>{error}</p> : null}
      {results?.length ? (
        <ul className="flex flex-col gap-1">
          {results.map((r, i) => (
            <li key={`${r.testId}-${i}`} className="text-c3-regular-body-p3 flex flex-col">
              <span className="flex items-center gap-1.5">
                {r.passed ? <Check className="size-4 text-[var(--c3-style-basic-fg-success)]" /> : <X className="size-4 text-[var(--c3-style-basic-fg-danger)]" />}
                <span className="font-mono">{r.testName ?? r.testId}</span>
              </span>
              {!r.passed && r.message ? <pre className="ml-6 whitespace-pre-wrap font-mono text-[12px] text-[var(--c3-style-basic-fg-secondary)]">{r.message}</pre> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ManualGrade({ q, onGraded }: { q: QuizResultQuestion; onGraded: () => void }) {
  const isCode = q.questionKind === 'CODE';
  const [open, setOpen] = useState(isCode && !!q.needsManualGrading);
  const [points, setPoints] = useState(q.manualScore != null ? String(q.manualScore) : q.pointsEarned != null ? String(q.pointsEarned) : '');
  const [feedback, setFeedback] = useState(q.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idp = `grade-${q.answerId}`;

  const save = async () => {
    const n = Number(points);
    if (points.trim() === '' || !Number.isFinite(n) || n < 0 || n > (q.points ?? 0)) {
      setError(`Points must be between 0 and ${q.points ?? 0}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await gradeAnswerManually(q.answerId as string, n, feedback.trim() || undefined);
      onGraded();
    } catch (err) {
      setError(eduErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div>
        <Button variant="ghost" appearance="secondary" size="sm" onClick={() => setOpen(true)}>
          {isCode ? 'Change grade' : 'Override points'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--c3-style-basic-border-border)] pt-2">
      <div className="grid gap-2 md:grid-cols-[96px_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idp}-pts`}>Points (of {q.points ?? 0})</Label>
          <Input id={`${idp}-pts`} inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idp}-fb`}>Feedback for the student (optional)</Label>
          <Input id={`${idp}-fb`} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Handles missing values well; returns a float instead of an int." />
        </div>
      </div>
      {error ? <p className={DANGER}>{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" appearance="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button variant="solid" appearance="accent" size="sm" leadingIcon={<Save />} loading={busy} disabled={busy} onClick={() => void save()}>
          Save grade
        </Button>
      </div>
    </div>
  );
}
