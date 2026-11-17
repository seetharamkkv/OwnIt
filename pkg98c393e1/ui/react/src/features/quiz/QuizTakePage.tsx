/*
 * Taking a quiz (/quiz/:quizId). Owner: Shreenidhi. PROJECT_PLAN.md 7.4, mockup board 4d.
 *
 * Three views: the start screen (EduQuiz.myQuiz), the attempt (EduQuizAttempt.startMine → paper, autosave through
 * saveAnswerMine, countdown to deadlineAt, submitMine) and the result (resultMine). The server draws the questions,
 * owns the deadline (plus 5 s grace) and auto-submits expired attempts; the page only mirrors that. The attempt runs
 * inside the LockdownProvider with the quiz's effective integrity policy, like the assignment workspace.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Flag, Loader2, Lock, Play, Send, X } from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';

import { useMe } from '@/common/auth/useMe';
import type { EduIntegrityPolicy, EduTestResult, MyQuizRow, PaperQuestion, QuizPaper, QuizResult, QuizResultQuestion } from '@/common/eduTypes';
import { eduErrorCode, eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { Eyebrow, KindBadge, SwCard } from '@/common/stepwise/ui';
import { MarkdownView } from '@/features/editors/MarkdownView';
import { StepEditor } from '@/features/editors/StepEditor';
import { fetchEffectivePolicy } from '@/features/integrity/api';
import { LockdownProvider } from '@/features/integrity/LockdownProvider';
import { useLockdown } from '@/features/integrity/useLockdown';
import { useLockdownState } from '@/features/integrity/useLockdownState';
import { DEFAULT_TEST_TIMEOUT_MS } from '@/features/testing/config';
import { runTests, warmUp } from '@/features/testing/runner';
import { useNow } from '@/features/workspace/deadline';

import { fetchMyQuiz, fetchMyResult, saveMyAnswer, startMyAttempt, submitMyAttempt } from './api';
import type { QuizAnswerInput } from './api';
import { clock, dateTime, KIND_HINT, KIND_LABEL, pts, quizRowState, RESULTS_LABEL, scoreText } from './format';

const MD = '!text-[var(--sw-fg-2)] [&_code]:!bg-[var(--sw-card-2)] [&_code]:!text-[var(--sw-fg)]';
const BTN_PRIMARY =
  'inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[var(--sw-accent-strong)] bg-[var(--sw-accent-bg)] px-4 text-[13px] font-medium text-[var(--sw-fg)] hover:border-[var(--sw-accent)] disabled:opacity-50';
const BTN_GHOST =
  'inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[var(--sw-border-strong)] px-4 text-[13px] text-[var(--sw-fg-muted)] hover:text-[var(--sw-fg)] disabled:opacity-40';

type View = { kind: 'start' } | { kind: 'attempt'; paper: QuizPaper; clockOffsetMs: number } | { kind: 'result'; attemptId: string };

export default function QuizTakePage() {
  const { quizId = '' } = useParams();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>({ kind: 'start' });

  const row = useQuery({ queryKey: queryKeys.myQuiz(quizId), queryFn: () => fetchMyQuiz(quizId), enabled: !!quizId, retry: false });
  const policy = useQuery({
    queryKey: queryKeys.policy('QUIZ', quizId),
    queryFn: () => fetchEffectivePolicy('QUIZ', quizId),
    enabled: !!quizId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () => startMyAttempt(quizId),
    onSuccess: (paper) => {
      setView({ kind: 'attempt', paper, clockOffsetMs: new Date(paper.serverNow).getTime() - Date.now() });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.myQuiz(quizId) }),
  });

  const finished = useCallback(
    (attemptId: string) => {
      setView({ kind: 'result', attemptId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myQuiz(quizId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myDashboard() });
      if (row.data?.courseId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.myQuizzes(row.data.courseId) });
      }
    },
    [queryClient, quizId, row.data?.courseId]
  );

  if (row.isLoading || policy.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (row.error) {
    const forbidden = eduErrorCode(row.error) === 'EDU_FORBIDDEN';
    return (
      <PageMessage
        title="Could not open this quiz"
        message={forbidden ? 'Only students enrolled in the course take quizzes. Staff can review attempts from the course page.' : eduErrorMessage(row.error)}
      />
    );
  }
  if (policy.error) {
    return <PageMessage title="Could not load the integrity policy" message={eduErrorMessage(policy.error)} />;
  }
  if (!row.data || !policy.data) {
    return <PageMessage title="Quiz not found" />;
  }

  if (view.kind === 'attempt') {
    return <AttemptView paper={view.paper} clockOffsetMs={view.clockOffsetMs} policy={policy.data} onFinished={finished} />;
  }
  if (view.kind === 'result') {
    return <ResultView quiz={row.data} attemptId={view.attemptId} onRetake={() => start.mutate()} retaking={start.isPending} retakeError={start.error} />;
  }
  return (
    <StartView
      quiz={row.data}
      starting={start.isPending}
      startError={start.error}
      onStart={() => start.mutate()}
      onViewResult={(attemptId) => setView({ kind: 'result', attemptId })}
    />
  );
}

/* ---- start screen ---------------------------------------------------------------------------------------------- */

function StartView({
  quiz,
  starting,
  startError,
  onStart,
  onViewResult,
}: {
  quiz: MyQuizRow;
  starting: boolean;
  startError: unknown;
  onStart: () => void;
  onViewResult: (attemptId: string) => void;
}) {
  const now = useNow(30_000);
  const state = quizRowState(quiz, now);
  const used = quiz.attemptsUsed ?? 0;
  const allowed = quiz.attemptsAllowed ?? 1;
  const limit = quiz.effectiveTimeLimitMin ?? quiz.timeLimitMin;

  return (
    <main className="mx-auto max-w-[820px] px-6 pb-16 pt-8">
      <BackLink courseId={quiz.courseId} label={quiz.courseCode ?? 'Course'} />
      <div className="mt-4 flex items-center gap-3">
        <KindBadge kind="QUIZ" />
        <span className="text-[13px] text-[var(--sw-fg-faint)]">{quiz.courseCode}</span>
      </div>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">{quiz.title ?? quiz.quizId}</h1>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Fact label="Questions" value={quiz.questionCount != null ? String(quiz.questionCount) : '—'} />
        <Fact label="Points" value={quiz.maxScore != null ? String(quiz.maxScore) : 'varies'} />
        <Fact
          label="Time limit"
          value={limit ? `${Math.round(limit)} min` : 'None'}
          note={quiz.extraTimePct ? `includes +${quiz.extraTimePct}% extra time` : undefined}
        />
        <Fact label="Attempts" value={`${used} of ${allowed} used`} />
      </div>

      <SwCard className="mt-4 p-5">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-[var(--sw-fg-muted)]">
          <span>Opens {dateTime(quiz.opensAt)}</span>
          <span>Closes {dateTime(quiz.closesAt)}</span>
          {quiz.showResults ? <span>Results: {RESULTS_LABEL[quiz.showResults].toLowerCase()}</span> : null}
          {quiz.bestScore != null && quiz.resultsVisible ? <span className="text-[var(--sw-success)]">Best score {scoreText(quiz.bestScore, quiz.maxScore)}</span> : null}
        </div>
        {quiz.instructionsMd ? <MarkdownView source={quiz.instructionsMd} className={`mt-4 ${MD}`} /> : null}
      </SwCard>

      <SwCard className="mt-4 p-5" tone="warn">
        <div className="flex gap-3 text-[13px] text-[var(--sw-fg-2)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--sw-warn)]" />
          <div>
            This quiz is proctored. Pasting text from outside the quiz is blocked, and tab switches and full-screen exits are
            logged for your instructor. The timer keeps running if you leave the page, and when it runs out your answers are
            submitted automatically.
          </div>
        </div>
      </SwCard>

      {startError ? <p className="mt-4 text-[13px] text-[var(--sw-danger)]">{eduErrorMessage(startError)}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {state === 'in-progress' ? (
          <button type="button" className={BTN_PRIMARY} onClick={onStart} disabled={starting}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Resume attempt {used}
          </button>
        ) : state === 'available' ? (
          <button type="button" className={BTN_PRIMARY} onClick={onStart} disabled={starting}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {used ? `Start attempt ${used + 1}` : 'Start quiz'}
          </button>
        ) : (
          <span className="text-[13px] text-[var(--sw-fg-muted)]">
            {quiz.unavailableReason ??
              (state === 'upcoming' ? `Opens ${dateTime(quiz.opensAt)}` : state === 'done' ? 'No attempts left.' : 'This quiz is closed.')}
          </span>
        )}
        {quiz.lastAttemptId && state !== 'in-progress' ? (
          <button type="button" className={BTN_GHOST} onClick={() => onViewResult(quiz.lastAttemptId as string)}>
            View last attempt
          </button>
        ) : null}
      </div>
    </main>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-[var(--sw-border)] bg-[var(--sw-card-2)] px-3 py-2.5">
      <div className="text-[18px] font-semibold">{value}</div>
      <div className="text-[12px] text-[var(--sw-fg-muted)]">{label}</div>
      {note ? <div className="mt-0.5 text-[11px] text-[var(--sw-fg-faint)]">{note}</div> : null}
    </div>
  );
}

function BackLink({ courseId, label }: { courseId?: string; label: string }) {
  return (
    <Link to={courseId ? routes.course(courseId) : routes.courses} className="inline-flex items-center gap-1.5 text-[13px] !text-[var(--sw-fg-muted)] no-underline hover:!text-[var(--sw-fg)]">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}

/* ---- attempt --------------------------------------------------------------------------------------------------- */

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface AttemptProps {
  paper: QuizPaper;
  clockOffsetMs: number;
  policy: EduIntegrityPolicy;
  onFinished: (attemptId: string) => void;
}

function AttemptView(props: AttemptProps) {
  const { me } = useMe();
  return (
    <LockdownProvider
      policy={props.policy}
      context={{ contextKind: 'QUIZ', contextId: props.paper.attempt.id, courseId: props.paper.courseId ?? '' }}
      student={{ name: me?.displayName ?? 'Student', studentNumber: me?.studentNumber }}
      courseCode={props.paper.courseCode}
    >
      <AttemptBody {...props} />
    </LockdownProvider>
  );
}

function initialAnswers(paper: QuizPaper): Record<string, QuizAnswerInput> {
  const out: Record<string, QuizAnswerInput> = {};
  (paper.answers ?? []).forEach((a) => {
    out[a.question.id] = { selectedOptionIds: a.selectedOptionIds ?? [], answerText: a.answerText ?? '', code: a.code ?? undefined };
  });
  (paper.questions ?? []).forEach((q) => {
    if (q.questionKind === 'CODE' && out[q.questionId]?.code == null) {
      out[q.questionId] = { ...out[q.questionId], code: q.codeStarter ?? '' };
    }
  });
  return out;
}

function isAnswered(q: PaperQuestion, a: QuizAnswerInput | undefined): boolean {
  if (!a) {
    return false;
  }
  if (q.questionKind === 'SHORT_ANSWER') {
    return !!a.answerText?.trim();
  }
  if (q.questionKind === 'CODE') {
    return !!a.code?.trim() && a.code.trim() !== (q.codeStarter ?? '').trim();
  }
  return (a.selectedOptionIds?.length ?? 0) > 0;
}

function AttemptBody({ paper, clockOffsetMs, policy, onFinished }: AttemptProps) {
  const attemptId = paper.attempt.id;
  const questions = useMemo(() => paper.questions ?? [], [paper]);
  const { locked } = useLockdownState();

  const [answers, setAnswers] = useState<Record<string, QuizAnswerInput>>(() => initialAnswers(paper));
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const flagKey = `edu.quiz.flags.${attemptId}`;
  const [flags, setFlags] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(flagKey) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, Promise<void>>>({});
  const dirty = useRef<Set<string>>(new Set());
  const finishing = useRef(false);

  useEffect(() => {
    sessionStorage.setItem(flagKey, JSON.stringify([...flags]));
  }, [flagKey, flags]);

  useEffect(() => {
    if (questions.some((q) => q.questionKind === 'CODE')) {
      warmUp();
    }
  }, [questions]);

  const finish = useCallback(async () => {
    if (finishing.current) {
      return;
    }
    finishing.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitMyAttempt(attemptId);
      onFinished(attemptId);
    } catch (err) {
      finishing.current = false;
      setSubmitting(false);
      setSubmitError(eduErrorMessage(err));
    }
  }, [attemptId, onFinished]);

  const saveNow = useCallback(
    (questionId: string): Promise<void> => {
      clearTimeout(timers.current[questionId]);
      if (!dirty.current.has(questionId)) {
        return pending.current[questionId] ?? Promise.resolve();
      }
      dirty.current.delete(questionId);
      const value = answersRef.current[questionId] ?? {};
      setSaveState((s) => ({ ...s, [questionId]: 'saving' }));
      const run = (pending.current[questionId] ?? Promise.resolve())
        .then(() => saveMyAnswer(attemptId, questionId, value))
        .then(() => {
          setSaveError(null);
          setSaveState((s) => ({ ...s, [questionId]: dirty.current.has(questionId) ? 'dirty' : 'saved' }));
        })
        .catch((err: unknown) => {
          dirty.current.add(questionId);
          setSaveState((s) => ({ ...s, [questionId]: 'error' }));
          const code = eduErrorCode(err);
          if (code === 'EDU_DEADLINE_PASSED') {
            // Time is up on the server (or the quiz was closed): it has been or will be submitted there.
            void finish();
          } else {
            setSaveError(eduErrorMessage(err));
          }
        });
      pending.current[questionId] = run;
      return run;
    },
    [attemptId, finish]
  );

  const flushAll = useCallback(async () => {
    const ids = new Set([...dirty.current, ...Object.keys(pending.current)]);
    await Promise.all([...ids].map((id) => saveNow(id)));
  }, [saveNow]);

  const setAnswer = useCallback(
    (q: PaperQuestion, value: QuizAnswerInput, immediate: boolean) => {
      setAnswers((a) => ({ ...a, [q.questionId]: value }));
      answersRef.current = { ...answersRef.current, [q.questionId]: value };
      dirty.current.add(q.questionId);
      setSaveState((s) => ({ ...s, [q.questionId]: 'dirty' }));
      clearTimeout(timers.current[q.questionId]);
      if (immediate) {
        void saveNow(q.questionId);
      } else {
        timers.current[q.questionId] = setTimeout(() => void saveNow(q.questionId), 900);
      }
    },
    [saveNow]
  );

  // Warn before leaving with unsaved answers; the timer keeps running on the server either way.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Countdown against the server clock.
  const deadline = paper.attempt.deadlineAt ? new Date(paper.attempt.deadlineAt).getTime() : null;
  const now = useNow(1000) + clockOffsetMs;
  const remaining = deadline != null ? deadline - now : null;
  useEffect(() => {
    if (remaining != null && remaining <= 0 && !finishing.current) {
      void flushAll()
        .catch(() => undefined)
        .then(() => finish());
    }
  }, [remaining, flushAll, finish]);

  const goTo = (i: number) => {
    const cur = questions[index];
    if (cur) {
      void saveNow(cur.questionId);
    }
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
  };

  const submit = async () => {
    await flushAll();
    if (dirty.current.size) {
      setSubmitError('Some answers could not be saved. Check your connection and try again.');
      return;
    }
    await finish();
  };

  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.questionId])).length;
  const states = Object.values(saveState);
  const headerSave = states.includes('error')
    ? { text: 'Not saved', cls: 'text-[var(--sw-danger)]' }
    : states.includes('saving') || states.includes('dirty')
      ? { text: 'Saving…', cls: 'text-[var(--sw-fg-muted)]' }
      : states.length
        ? { text: 'All answers saved', cls: 'text-[var(--sw-success)]' }
        : { text: 'Answers save automatically', cls: 'text-[var(--sw-fg-faint)]' };

  const q = questions[index];
  const readOnly = locked || submitting;

  if (!questions.length) {
    return <PageMessage title={paper.quizTitle ?? 'Quiz'} message="This attempt has no questions. Ask your instructor." />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--sw-border)] bg-[var(--sw-bg-elevated)]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-6 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--sw-fg-faint)]">
              {paper.courseCode} · Quiz · Attempt {paper.attempt.attemptNo ?? 1}
            </div>
            <div className="truncate text-[17px] font-semibold">{paper.quizTitle}</div>
          </div>
          <span className={`text-[13px] ${headerSave.cls}`} aria-live="polite">
            {headerSave.text}
          </span>
          {remaining != null ? <TimerPill remainingMs={remaining} /> : null}
          <button type="button" className={BTN_PRIMARY} onClick={() => setConfirming(true)} disabled={submitting || locked}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit quiz
          </button>
        </div>
      </header>

      {locked ? (
        <div className="mx-auto mt-4 w-full max-w-[1200px] px-6">
          <SwCard tone="warn" className="flex items-center gap-2 p-3 text-[13px]">
            <Lock className="size-4 text-[var(--sw-warn)]" /> This attempt is locked by the integrity rules. Your instructor can unlock it; the timer keeps running.
          </SwCard>
        </div>
      ) : null}
      {saveError || submitError ? (
        <div className="mx-auto mt-4 w-full max-w-[1200px] px-6">
          <p className="text-[13px] text-[var(--sw-danger)]">{submitError ?? saveError}</p>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-5 px-6 py-5 md:grid-cols-[240px_1fr]">
        <aside className="flex flex-col gap-4">
          <SwCard className="p-4">
            <Eyebrow>Questions</Eyebrow>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {questions.map((qq, i) => {
                const answered = isAnswered(qq, answers[qq.questionId]);
                const current = i === index;
                const flagged = flags.has(qq.questionId);
                return (
                  <button
                    key={qq.questionId}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={current ? 'step' : undefined}
                    aria-label={`Question ${i + 1}${answered ? ', answered' : ''}${flagged ? ', flagged' : ''}`}
                    className={`relative flex h-9 items-center justify-center rounded-lg border text-[13px] font-medium ${
                      current
                        ? 'border-[var(--sw-accent)] bg-[var(--sw-accent-bg)] text-[var(--sw-fg)]'
                        : answered
                          ? 'border-[var(--sw-success)]/40 bg-[var(--sw-success-bg)] text-[var(--sw-success)]'
                          : 'border-[var(--sw-border-strong)] text-[var(--sw-fg-muted)] hover:text-[var(--sw-fg)]'
                    }`}
                  >
                    {i + 1}
                    {flagged ? <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[var(--sw-warn)]" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--sw-fg-faint)]">
              <Legend cls="bg-[var(--sw-success-bg)] border-[var(--sw-success)]/40">Answered</Legend>
              <Legend cls="bg-[var(--sw-accent-bg)] border-[var(--sw-accent)]">Current</Legend>
              <Legend cls="bg-[var(--sw-warn)] border-transparent rounded-full">Flagged</Legend>
            </div>
            <div className="mt-4 text-[13px] text-[var(--sw-fg-muted)]">
              {answeredCount} of {questions.length} answered
            </div>
          </SwCard>
          <SwCard className="p-4 text-[12px] leading-5 text-[var(--sw-fg-muted)]">
            {deadline != null ? (
              <>
                Time ends at <span className="text-[var(--sw-fg)]">{new Date(deadline).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                {paper.extraTimePct ? ` (includes +${paper.extraTimePct}% extra time)` : ''}. Your answers are submitted automatically when it runs out.
              </>
            ) : (
              'No time limit. Submit when you are done.'
            )}
          </SwCard>
        </aside>

        {q ? (
          <QuestionCard
            key={q.questionId}
            q={q}
            index={index}
            count={questions.length}
            value={answers[q.questionId]}
            onChange={(v, immediate) => setAnswer(q, v, immediate)}
            readOnly={readOnly}
            flagged={flags.has(q.questionId)}
            onToggleFlag={() =>
              setFlags((f) => {
                const next = new Set(f);
                if (next.has(q.questionId)) {
                  next.delete(q.questionId);
                } else {
                  next.add(q.questionId);
                }
                return next;
              })
            }
            saveState={saveState[q.questionId]}
            allowCopy={!!policy.allowCopyOfQuestion}
            onPrev={index > 0 ? () => goTo(index - 1) : undefined}
            onNext={index < questions.length - 1 ? () => goTo(index + 1) : undefined}
            onFinish={() => setConfirming(true)}
          />
        ) : null}
      </div>

      {confirming ? (
        <SubmitModal
          answered={answeredCount}
          total={questions.length}
          flagged={flags.size}
          remainingMs={remaining}
          submitting={submitting}
          onCancel={() => setConfirming(false)}
          onSubmit={() => void submit()}
        />
      ) : null}
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-sm border ${cls}`} />
      {children}
    </span>
  );
}

function TimerPill({ remainingMs }: { remainingMs: number }) {
  const tone =
    remainingMs <= 60_000
      ? 'border-[var(--sw-danger)] bg-[var(--sw-danger-bg)] text-[var(--sw-danger)]'
      : remainingMs <= 5 * 60_000
        ? 'border-[var(--sw-warn-border)] bg-[var(--sw-warn-bg)] text-[var(--sw-warn)]'
        : 'border-[var(--sw-border-strong)] text-[var(--sw-fg)]';
  return (
    <span className={`inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3 font-[family-name:var(--sw-mono)] text-[14px] font-semibold ${tone}`} role="timer">
      <Clock className="size-4" />
      {clock(remainingMs)} left
    </span>
  );
}

interface QuestionCardProps {
  q: PaperQuestion;
  index: number;
  count: number;
  value: QuizAnswerInput | undefined;
  onChange: (v: QuizAnswerInput, immediate: boolean) => void;
  readOnly: boolean;
  flagged: boolean;
  onToggleFlag: () => void;
  saveState?: SaveState;
  allowCopy: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onFinish: () => void;
}

function QuestionCard({ q, index, count, value, onChange, readOnly, flagged, onToggleFlag, saveState, allowCopy, onPrev, onNext, onFinish }: QuestionCardProps) {
  const guard = allowCopy
    ? {}
    : { onCopy: (e: React.ClipboardEvent) => e.preventDefault(), onCut: (e: React.ClipboardEvent) => e.preventDefault() };

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SwCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow accent>
            Question {index + 1} of {count} · {KIND_LABEL[q.questionKind]} · {pts(q.points)}
          </Eyebrow>
          <div className="flex items-center gap-3">
            <SaveDot state={saveState} />
            <button
              type="button"
              onClick={onToggleFlag}
              aria-pressed={flagged}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] ${
                flagged ? 'border-[var(--sw-warn-border)] bg-[var(--sw-warn-bg)] text-[var(--sw-warn)]' : 'border-[var(--sw-border-strong)] text-[var(--sw-fg-muted)]'
              }`}
            >
              <Flag className="size-3.5" /> {flagged ? 'Flagged' : 'Flag for review'}
            </button>
          </div>
        </div>
        <div className={`mt-4 ${allowCopy ? '' : 'select-none'}`} data-edu-question="true" {...guard}>
          <MarkdownView source={q.promptMd ?? ''} className={`text-[15px] ${MD}`} />
        </div>
        <p className="mt-3 text-[12px] text-[var(--sw-fg-faint)]">{KIND_HINT[q.questionKind]}</p>

        <div className="mt-4">
          {q.questionKind === 'SHORT_ANSWER' ? (
            <input
              type="text"
              value={value?.answerText ?? ''}
              onChange={(e) => onChange({ answerText: e.target.value }, false)}
              disabled={readOnly}
              maxLength={2000}
              placeholder="Type your answer"
              aria-label="Your answer"
              className="h-11 w-full rounded-[10px] border border-[var(--sw-border-strong)] bg-[var(--sw-input)] px-3 text-[14px] text-[var(--sw-fg)] outline-none focus:border-[var(--sw-accent)]"
            />
          ) : q.questionKind === 'CODE' ? (
            <CodeAnswer q={q} code={value?.code ?? q.codeStarter ?? ''} onChange={(code) => onChange({ code }, false)} readOnly={readOnly} />
          ) : (
            <ChoiceAnswer q={q} selected={value?.selectedOptionIds ?? []} onChange={(ids) => onChange({ selectedOptionIds: ids }, true)} readOnly={readOnly} />
          )}
        </div>
      </SwCard>

      <div className="flex items-center justify-between">
        <button type="button" className={BTN_GHOST} onClick={onPrev} disabled={!onPrev}>
          <ChevronLeft className="size-4" /> Previous
        </button>
        {onNext ? (
          <button type="button" className={BTN_GHOST} onClick={onNext}>
            Next <ChevronRight className="size-4" />
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={onFinish} disabled={readOnly}>
            Review and submit <Send className="size-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function SaveDot({ state }: { state?: SaveState }) {
  if (!state) {
    return null;
  }
  const map: Record<SaveState, { text: string; cls: string }> = {
    saved: { text: 'Answer saved', cls: 'text-[var(--sw-success)]' },
    dirty: { text: 'Saving…', cls: 'text-[var(--sw-fg-faint)]' },
    saving: { text: 'Saving…', cls: 'text-[var(--sw-fg-faint)]' },
    error: { text: 'Not saved, retrying on next change', cls: 'text-[var(--sw-danger)]' },
  };
  return <span className={`text-[12px] ${map[state].cls}`}>{map[state].text}</span>;
}

function ChoiceAnswer({ q, selected, onChange, readOnly }: { q: PaperQuestion; selected: string[]; onChange: (ids: string[]) => void; readOnly: boolean }) {
  const multi = q.questionKind === 'MULTI_CHOICE';
  const name = `q-${q.questionId}`;
  return (
    <fieldset className="flex flex-col gap-2" disabled={readOnly}>
      <legend className="sr-only">Answer options</legend>
      {(q.options ?? []).map((o) => {
        const on = selected.includes(o.optionId);
        return (
          <label
            key={o.optionId}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
              on ? 'border-[var(--sw-accent)] bg-[var(--sw-accent-bg)]' : 'border-[var(--sw-border-strong)] hover:bg-[var(--sw-row-hover)]'
            } ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={name}
              checked={on}
              onChange={() => {
                if (multi) {
                  onChange(on ? selected.filter((id) => id !== o.optionId) : [...selected, o.optionId]);
                } else {
                  onChange([o.optionId]);
                }
              }}
              className="mt-1 size-4 accent-[var(--sw-accent)]"
            />
            <MarkdownView source={o.label} className={`[&_p]:!m-0 ${MD}`} />
          </label>
        );
      })}
    </fieldset>
  );
}

function CodeAnswer({ q, code, onChange, readOnly }: { q: PaperQuestion; code: string; onChange: (code: string) => void; readOnly: boolean }) {
  const integrity = useLockdown();
  const tests = q.visibleTests ?? [];
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EduTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await runTests({
        program: code,
        tests: tests.map((t) => ({ id: t.id, name: t.testName, code: t.code, timeoutMs: t.timeoutMs })),
        files: [],
        timeoutMs: DEFAULT_TEST_TIMEOUT_MS,
      });
      setResults(r);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const passed = results?.filter((r) => r.passed).length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <StepEditor fileKind="PY" value={code} onChange={onChange} readOnly={readOnly} integrity={integrity} fileName="answer.py" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BTN_GHOST} onClick={() => void run()} disabled={running || !tests.length}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {tests.length ? 'Run visible tests' : 'No visible tests'}
        </button>
        {results ? (
          <span className={`text-[13px] ${passed === results.length ? 'text-[var(--sw-success)]' : 'text-[var(--sw-warn)]'}`}>
            {passed} of {results.length} passing
          </span>
        ) : running ? (
          <span className="text-[12px] text-[var(--sw-fg-faint)]">The first run loads Python in your browser and can take a few seconds.</span>
        ) : null}
      </div>
      {runError ? <p className="text-[13px] text-[var(--sw-danger)]">{runError}</p> : null}
      {results?.length ? (
        <ul className="flex flex-col gap-1.5">
          {results.map((r, i) => (
            <li key={`${r.testId}-${r.testName}-${i}`} className="rounded-lg border border-[var(--sw-border)] bg-[var(--sw-card-2)] px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                {r.passed ? <Check className="size-4 text-[var(--sw-success)]" /> : <X className="size-4 text-[var(--sw-danger)]" />}
                <span className="font-[family-name:var(--sw-mono)]">{r.testName ?? r.testId}</span>
                {r.durationMs != null ? <span className="ml-auto text-[11px] text-[var(--sw-fg-faint)]">{r.durationMs} ms</span> : null}
              </div>
              {!r.passed && r.message ? (
                <pre className="mt-1.5 whitespace-pre-wrap font-[family-name:var(--sw-mono)] text-[12px] text-[var(--sw-fg-muted)]">{r.message}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SubmitModal({
  answered,
  total,
  flagged,
  remainingMs,
  submitting,
  onCancel,
  onSubmit,
}: {
  answered: number;
  total: number;
  flagged: number;
  remainingMs: number | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-submit-title">
      <SwCard className="w-full max-w-[440px] p-6">
        <h2 id="quiz-submit-title" className="text-[18px] font-semibold">
          Submit this quiz?
        </h2>
        <p className="mt-2 text-[13px] text-[var(--sw-fg-muted)]">You can&apos;t change your answers after you submit.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Fact label="answered" value={`${answered} / ${total}`} />
          <Fact label="flagged" value={String(flagged)} />
          <Fact label="time left" value={remainingMs != null ? clock(remainingMs) : '—'} />
        </div>
        {answered < total ? (
          <p className="mt-3 text-[13px] text-[var(--sw-warn)]">
            {total - answered} question{total - answered === 1 ? ' is' : 's are'} unanswered and will score 0.
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={BTN_GHOST} onClick={onCancel} disabled={submitting} autoFocus>
            Keep working
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={onSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit
          </button>
        </div>
      </SwCard>
    </div>
  );
}

/* ---- result ---------------------------------------------------------------------------------------------------- */

function ResultView({
  quiz,
  attemptId,
  onRetake,
  retaking,
  retakeError,
}: {
  quiz: MyQuizRow;
  attemptId: string;
  onRetake: () => void;
  retaking: boolean;
  retakeError: unknown;
}) {
  const result = useQuery({ queryKey: queryKeys.quizResult(attemptId), queryFn: () => fetchMyResult(attemptId), retry: false });

  if (result.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (result.error || !result.data) {
    return <PageMessage title="Could not load your result" message={eduErrorMessage(result.error)} />;
  }
  const r: QuizResult = result.data;

  return (
    <main className="mx-auto max-w-[820px] px-6 pb-16 pt-8">
      <BackLink courseId={quiz.courseId} label={quiz.courseCode ?? 'Course'} />
      <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em]">{r.quizTitle ?? quiz.title}</h1>
      <p className="mt-1 text-[13px] text-[var(--sw-fg-muted)]">
        Attempt {r.attempt.attemptNo ?? 1} · submitted {dateTime(r.attempt.submittedAt)}
      </p>

      <SwCard className="mt-5 flex flex-wrap items-center gap-6 p-5" tone={r.resultsVisible ? 'accent' : 'default'}>
        {r.resultsVisible ? (
          <>
            <div>
              <Eyebrow>Score</Eyebrow>
              <div className="mt-1 text-[30px] font-semibold">{scoreText(r.score, r.maxScore)}</div>
            </div>
            {r.pendingManualGrading ? (
              <p className="max-w-[420px] text-[13px] text-[var(--sw-fg-muted)]">
                Your code answers are waiting for your instructor to grade them, so this score can still go up.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[14px] text-[var(--sw-fg-2)]">
            Your answers were submitted.{' '}
            {quiz.showResults === 'AFTER_CLOSE' ? `Results show after the quiz closes (${dateTime(quiz.closesAt)}).` : 'Your instructor will share results separately.'}
          </p>
        )}
      </SwCard>

      {r.resultsVisible ? (
        <div className="mt-5 flex flex-col gap-3">
          {(r.questions ?? []).map((q, i) => (
            <ResultQuestionCard key={q.questionId} q={q} index={i} />
          ))}
        </div>
      ) : null}

      {retakeError ? <p className="mt-4 text-[13px] text-[var(--sw-danger)]">{eduErrorMessage(retakeError)}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {quiz.canStart ? (
          <button type="button" className={BTN_PRIMARY} onClick={onRetake} disabled={retaking}>
            {retaking ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Start attempt {(quiz.attemptsUsed ?? 0) + 1} of {quiz.attemptsAllowed ?? 1}
          </button>
        ) : null}
        <Link to={quiz.courseId ? routes.course(quiz.courseId) : routes.home} className={`${BTN_GHOST} no-underline`}>
          Back to the course
        </Link>
      </div>
    </main>
  );
}

function ResultQuestionCard({ q, index }: { q: QuizResultQuestion; index: number }) {
  const isCode = q.questionKind === 'CODE';
  const status = isCode
    ? q.needsManualGrading
      ? { text: 'Waiting for grading', cls: 'text-[var(--sw-warn)]' }
      : { text: `${scoreText(q.pointsEarned, q.points)} pts`, cls: 'text-[var(--sw-fg-muted)]' }
    : q.correct
      ? { text: 'Correct', cls: 'text-[var(--sw-success)]' }
      : { text: 'Incorrect', cls: 'text-[var(--sw-danger)]' };
  const options = q.options ?? [];
  const chosen = q.selectedOptionIds ?? [];
  const correct = q.correctOptionIds ?? [];

  return (
    <SwCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>
          Question {index + 1} · {KIND_LABEL[q.questionKind]}
        </Eyebrow>
        <span className="flex items-center gap-3 text-[13px]">
          <span className={status.cls}>{status.text}</span>
          {!isCode ? <span className="text-[var(--sw-fg-faint)]">{scoreText(q.pointsEarned, q.points)} pts</span> : null}
        </span>
      </div>
      <MarkdownView source={q.promptMd ?? ''} className={`mt-3 ${MD}`} />

      {options.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {options.map((o) => {
            const picked = chosen.includes(o.optionId);
            const right = correct.includes(o.optionId);
            return (
              <li
                key={o.optionId}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] ${
                  right ? 'border-[var(--sw-success)]/40 bg-[var(--sw-success-bg)]' : picked ? 'border-[var(--sw-danger)]/40 bg-[var(--sw-danger-bg)]' : 'border-[var(--sw-border)]'
                }`}
              >
                <span className="mt-0.5 w-4 shrink-0">
                  {right ? <Check className="size-4 text-[var(--sw-success)]" /> : picked ? <X className="size-4 text-[var(--sw-danger)]" /> : null}
                </span>
                <MarkdownView source={o.label} className={`[&_p]:!m-0 ${MD}`} />
                {picked ? <span className="ml-auto shrink-0 text-[11px] text-[var(--sw-fg-faint)]">your answer</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {q.questionKind === 'SHORT_ANSWER' ? (
        <div className="mt-3 text-[13px]">
          <div>
            Your answer: <span className="font-[family-name:var(--sw-mono)]">{q.answerText || '—'}</span>
          </div>
          {q.acceptedAnswers?.length ? <div className="mt-1 text-[var(--sw-fg-muted)]">Accepted: {q.acceptedAnswers.join(', ')}</div> : null}
        </div>
      ) : null}

      {isCode ? (
        <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-[var(--sw-border)] bg-[var(--sw-card-2)] p-3 font-[family-name:var(--sw-mono)] text-[12px] text-[var(--sw-fg-2)]">
          {q.code || '(no answer)'}
        </pre>
      ) : null}

      {q.feedback ? (
        <div className="mt-3 rounded-lg border border-[var(--sw-accent-border)] bg-[var(--sw-accent-card)] p-3 text-[13px]">
          <Eyebrow accent>Feedback</Eyebrow>
          <p className="mt-1 whitespace-pre-wrap text-[var(--sw-fg-2)]">{q.feedback}</p>
        </div>
      ) : null}
    </SwCard>
  );
}
