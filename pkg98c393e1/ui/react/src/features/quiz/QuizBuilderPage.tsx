/*
 * Quiz builder (/course/:courseId/quizzes/new and /:quizId/edit). Owner: Shreenidhi. PROJECT_PLAN.md 7.4.
 *
 * Settings (EduQuiz.saveForCourse; every setting is sent, unset clears), the question pool (EduQuizQuestion.saveForQuiz
 * per question: single / multi choice, true-false, short answer, code with tests), publish checks
 * (EduQuizQuestion.checkQuiz) and status (EduQuiz.setStatus). TAs edit drafts; publishing needs PUBLISH_CONTENT,
 * which the server checks. The answer key never leaves staff screens.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { ArrowDown, ArrowUp, ArrowLeft, Lock, Plus, Save, Send, Trash2, Users, X } from 'lucide-react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Container } from '@/components/ui/container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useCourseRole, useMe } from '@/common/auth/useMe';
import type { EduQuiz, EduQuizOption, EduQuizQuestion, QuestionKind, QuizStatus, ResultsVisibility } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { MarkdownField } from '@/features/authoring/MarkdownField';
import { CODE_SETUP, codeTheme, useIsDarkMode } from '@/features/editors/codemirror';
import { TestEditor } from '@/features/testing/TestEditor';

import { checkQuiz, fetchQuizAttempts, fetchQuizForEdit, fetchQuizQuestions, removeDraftQuiz, removeQuizQuestion, saveQuizForCourse, saveQuizQuestion, setQuizStatus } from './api';
import { fromLocalInput, KIND_LABEL, pts, QUIZ_STATUS_LABEL, RESULTS_LABEL, toLocalInput } from './format';

const PYTHON = [python()];
const KINDS: QuestionKind[] = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'CODE'];
const MUTED = 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]';
const DANGER = 'text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]';

export default function QuizBuilderPage() {
  const { courseId = '', quizId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useMe();
  const courseRole = useCourseRole(courseId);
  const canPublish = me?.platformRole === 'ADMIN' || courseRole === 'INSTRUCTOR';

  const quiz = useQuery({ queryKey: queryKeys.quizForEdit(quizId ?? ''), queryFn: () => fetchQuizForEdit(quizId as string), enabled: !!quizId, retry: false });
  const questions = useQuery({ queryKey: queryKeys.quizQuestions(quizId ?? ''), queryFn: () => fetchQuizQuestions(quizId as string), enabled: !!quizId });
  const problems = useQuery({ queryKey: ['edu', 'quiz', 'check', quizId ?? ''], queryFn: () => checkQuiz(quizId as string), enabled: !!quizId });
  const attempts = useQuery({ queryKey: queryKeys.quizAttempts(quizId ?? ''), queryFn: () => fetchQuizAttempts(quizId as string), enabled: !!quizId });
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshQuestions = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizQuestions(quizId ?? '') });
    void queryClient.invalidateQueries({ queryKey: ['edu', 'quiz', 'check', quizId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.courseQuizzes(courseId) });
  };

  const changeStatus = async (next: QuizStatus) => {
    if (!quizId) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    try {
      const saved = await setQuizStatus(quizId, next);
      queryClient.setQueryData(queryKeys.quizForEdit(quizId), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.courseQuizzes(courseId) });
    } catch (err) {
      setStatusError(eduErrorMessage(err));
    } finally {
      setStatusBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!quizId || !window.confirm('Delete this draft quiz and all its questions?')) {
      return;
    }
    setStatusBusy(true);
    try {
      await removeDraftQuiz(quizId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.courseQuizzes(courseId) });
      navigate(routes.course(courseId));
    } catch (err) {
      setStatusError(eduErrorMessage(err));
      setStatusBusy(false);
    }
  };

  if (quizId && quiz.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (quiz.error) {
    return <PageMessage title="Could not load the quiz" message={eduErrorMessage(quiz.error)} />;
  }

  const status: QuizStatus = quiz.data?.status ?? 'DRAFT';
  const list = questions.data ?? [];
  const problemList = problems.data ?? [];
  const attemptCount = attempts.data?.length ?? 0;
  const totalPoints = list.reduce((s, q) => s + (q.points ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <button type="button" className={`${MUTED} flex items-center gap-1 hover:underline`} onClick={() => navigate(routes.course(courseId))}>
            <ArrowLeft className="size-4" /> Back to the course
          </button>
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">{quizId ? quiz.data?.title ?? 'Edit quiz' : 'New quiz'}</h1>
          {quizId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft" appearance={status === 'PUBLISHED' ? 'success' : status === 'CLOSED' ? 'warning' : 'secondary'}>
                {QUIZ_STATUS_LABEL[status]}
              </Badge>
              <span className={MUTED}>
                {list.length} question{list.length === 1 ? '' : 's'} · {pts(totalPoints)} in the pool · {attemptCount} attempt{attemptCount === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
        {quizId ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" appearance="secondary" leadingIcon={<Users />} onClick={() => navigate(routes.quizAttempts(courseId, quizId))}>
              Attempts
            </Button>
            {status === 'DRAFT' ? (
              <Button variant="ghost" appearance="danger" leadingIcon={<Trash2 />} disabled={statusBusy || attemptCount > 0} onClick={() => void deleteDraft()}>
                Delete draft
              </Button>
            ) : null}
            {status === 'PUBLISHED' ? (
              <Button
                variant="outline"
                appearance="secondary"
                leadingIcon={<Lock />}
                disabled={statusBusy || !canPublish}
                onClick={() => {
                  if (window.confirm('Close the quiz now? Attempts still in progress are submitted immediately.')) {
                    void changeStatus('CLOSED');
                  }
                }}
              >
                Close quiz
              </Button>
            ) : null}
            {status === 'PUBLISHED' && attemptCount === 0 ? (
              <Button variant="outline" appearance="secondary" disabled={statusBusy || !canPublish} onClick={() => void changeStatus('DRAFT')}>
                Back to draft
              </Button>
            ) : null}
            {status !== 'PUBLISHED' ? (
              <Button
                variant="solid"
                appearance="accent"
                leadingIcon={<Send />}
                loading={statusBusy}
                disabled={statusBusy || !canPublish || problemList.length > 0}
                title={!canPublish ? 'Only instructors can publish' : problemList.length ? 'Fix the problems listed below first' : undefined}
                onClick={() => void changeStatus('PUBLISHED')}
              >
                {status === 'CLOSED' ? 'Reopen' : 'Publish'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {statusError ? (
        <Alert variant="soft" appearance="destructive">
          <AlertAppearanceIcon appearance="destructive" />
          <AlertContent>
            <AlertTitle>Could not change the quiz</AlertTitle>
            <AlertDescription>{statusError}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
      {quizId && !canPublish ? (
        <Alert variant="soft" appearance="info">
          <AlertAppearanceIcon appearance="info" />
          <AlertContent>
            <AlertTitle>TAs can edit drafts; an instructor publishes.</AlertTitle>
          </AlertContent>
        </Alert>
      ) : null}
      {quizId && attemptCount > 0 ? (
        <Alert variant="soft" appearance="warning">
          <AlertAppearanceIcon appearance="warning" />
          <AlertContent>
            <AlertTitle>{`${attemptCount} attempt${attemptCount === 1 ? ' has' : 's have'} started`}</AlertTitle>
            <AlertDescription>
              Questions can&apos;t be removed or change kind any more. Edits to prompts, options and the answer key apply to regrades
              and to attempts started from now on.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
      {quizId && problemList.length && status !== 'PUBLISHED' ? (
        <Alert variant="soft" appearance="warning">
          <AlertAppearanceIcon appearance="warning" />
          <AlertContent>
            <AlertTitle>Before you can publish</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {problemList.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <SettingsForm
        courseId={courseId}
        quiz={quiz.data}
        onCreated={(created) => navigate(routes.quizEdit(courseId, created.id), { replace: true })}
        onSaved={(saved) => {
          queryClient.setQueryData(queryKeys.quizForEdit(saved.id), saved);
          void queryClient.invalidateQueries({ queryKey: ['edu', 'quiz', 'check', saved.id] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.courseQuizzes(courseId) });
        }}
      />

      {quizId ? <QuestionPool quizId={quizId} questions={list} loading={questions.isLoading} error={questions.error} locked={attemptCount > 0} onChanged={refreshQuestions} /> : null}
    </div>
  );
}

/* ---- settings -------------------------------------------------------------------------------------------------- */

interface SettingsState {
  title: string;
  instructionsMd: string;
  opensAt: string;
  closesAt: string;
  timeLimitMin: string;
  attemptsAllowed: string;
  questionsPerAttempt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: ResultsVisibility;
}

function settingsFrom(q?: EduQuiz): SettingsState {
  return {
    title: q?.title ?? '',
    instructionsMd: q?.instructionsMd ?? '',
    opensAt: toLocalInput(q?.opensAt),
    closesAt: toLocalInput(q?.closesAt),
    timeLimitMin: q?.timeLimitMin != null ? String(q.timeLimitMin) : '',
    attemptsAllowed: String(q?.attemptsAllowed ?? 1),
    questionsPerAttempt: q?.questionsPerAttempt != null ? String(q.questionsPerAttempt) : '',
    shuffleQuestions: !!q?.shuffleQuestions,
    shuffleOptions: !!q?.shuffleOptions,
    showResults: q?.showResults ?? 'AFTER_SUBMIT',
  };
}

function intOrUndef(s: string): number | undefined {
  const t = s.trim();
  return t === '' ? undefined : Math.round(Number(t));
}

function SettingsForm({ courseId, quiz, onCreated, onSaved }: { courseId: string; quiz?: EduQuiz; onCreated: (q: EduQuiz) => void; onSaved: (q: EduQuiz) => void }) {
  const [form, setForm] = useState<SettingsState>(() => settingsFrom(quiz));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const baseline = JSON.stringify(settingsFrom(quiz));
  const dirty = !quiz || JSON.stringify(form) !== baseline;

  useEffect(() => {
    setForm(JSON.parse(baseline) as SettingsState);
  }, [baseline]);

  const set =
    <K extends keyof SettingsState>(key: K) =>
    (value: SettingsState[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const nums = [form.timeLimitMin, form.attemptsAllowed, form.questionsPerAttempt].map((s) => (s.trim() === '' ? 0 : Number(s)));
    if (nums.some((n) => !Number.isFinite(n))) {
      setError('Time limit, attempts and questions per attempt must be numbers.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<EduQuiz> = {
        id: quiz?.id,
        course: { id: courseId },
        title: form.title,
        instructionsMd: form.instructionsMd || undefined,
        opensAt: fromLocalInput(form.opensAt),
        closesAt: fromLocalInput(form.closesAt),
        timeLimitMin: intOrUndef(form.timeLimitMin),
        attemptsAllowed: intOrUndef(form.attemptsAllowed) ?? 1,
        questionsPerAttempt: intOrUndef(form.questionsPerAttempt),
        shuffleQuestions: form.shuffleQuestions,
        shuffleOptions: form.shuffleOptions,
        showResults: form.showResults,
      };
      const saved = await saveQuizForCourse(payload);
      setSavedAt(Date.now());
      if (quiz) {
        onSaved(saved);
      } else {
        onCreated(saved);
      }
    } catch (err) {
      setError(eduErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container
      title="Settings"
      subtitle="The integrity policy comes from the course and platform defaults (paste blocking, tab tracking, watermark)."
      actions={
        <div className="flex items-center gap-3">
          {savedAt && !dirty ? <span className={MUTED}>Saved</span> : null}
          <Button variant="solid" appearance="accent" size="sm" leadingIcon={<Save />} loading={busy} disabled={busy || !dirty || !form.title.trim()} onClick={() => void save()}>
            {quiz ? 'Save settings' : 'Create quiz'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="quiz-title">Title</Label>
          <Input id="quiz-title" value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="Quiz 2: grouping and joins" />
        </div>
        <MarkdownField id="quiz-instructions" label="Instructions (Markdown, shown on the start screen)" value={form.instructionsMd} onChange={set('instructionsMd')} rows={4} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiz-opens">Opens</Label>
            <Input id="quiz-opens" type="datetime-local" value={form.opensAt} onChange={(e) => set('opensAt')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiz-closes">Closes</Label>
            <Input id="quiz-closes" type="datetime-local" value={form.closesAt} onChange={(e) => set('closesAt')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiz-limit">Time limit (min)</Label>
            <Input id="quiz-limit" type="number" min={1} max={600} value={form.timeLimitMin} onChange={(e) => set('timeLimitMin')(e.target.value)} placeholder="None" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiz-attempts">Attempts allowed</Label>
            <Input id="quiz-attempts" type="number" min={1} max={20} value={form.attemptsAllowed} onChange={(e) => set('attemptsAllowed')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiz-draw">Questions per attempt</Label>
            <Input id="quiz-draw" type="number" min={1} value={form.questionsPerAttempt} onChange={(e) => set('questionsPerAttempt')(e.target.value)} placeholder="All" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Checkbox checked={form.shuffleQuestions} onCheckedChange={(v) => set('shuffleQuestions')(v === true)} label="Shuffle questions" />
          <Checkbox checked={form.shuffleOptions} onCheckedChange={(v) => set('shuffleOptions')(v === true)} label="Shuffle answer options" subText="True / false keeps its order" />
          <div className="flex flex-col gap-1">
            <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Students see results</span>
            <Tabs variant="boxed" size="sm" value={form.showResults} onValueChange={(v) => set('showResults')(v as ResultsVisibility)}>
              <TabsList>
                {(Object.keys(RESULTS_LABEL) as ResultsVisibility[]).map((k) => (
                  <TabsTrigger key={k} value={k}>
                    {RESULTS_LABEL[k]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
        <p className={MUTED}>
          With questions per attempt set, each student gets a random draw from the pool. With pool tags, the draw takes questions
          from every tag in turn, so each attempt covers each topic.
        </p>
        {error ? <p className={DANGER}>{error}</p> : null}
      </div>
    </Container>
  );
}

/* ---- questions ------------------------------------------------------------------------------------------------- */

function QuestionPool({
  quizId,
  questions,
  loading,
  error,
  locked,
  onChanged,
}: {
  quizId: string;
  questions: EduQuizQuestion[];
  loading: boolean;
  error: unknown;
  locked: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<QuestionKind | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const move = async (i: number, dir: -1 | 1) => {
    const a = questions[i];
    const b = questions[i + dir];
    if (!a || !b) {
      return;
    }
    setMoveError(null);
    try {
      const oa = a.questionOrder ?? i + 1;
      const ob = b.questionOrder ?? i + dir + 1;
      await Promise.all([saveQuizQuestion({ ...a, questionOrder: ob === oa ? oa + dir : ob }), saveQuizQuestion({ ...b, questionOrder: oa })]);
      onChanged();
    } catch (err) {
      setMoveError(eduErrorMessage(err));
    }
  };

  return (
    <Container title="Questions" subtitle="Each question saves on its own. Students never receive the answer key or hidden tests.">
      <div className="flex flex-col gap-4">
        {loading ? <Spinner /> : null}
        {error ? <p className={DANGER}>{eduErrorMessage(error)}</p> : null}
        {moveError ? <p className={DANGER}>{moveError}</p> : null}
        {questions.map((q, i) => (
          <QuestionForm
            key={q.id}
            quizId={quizId}
            question={q}
            number={i + 1}
            locked={locked}
            onSaved={onChanged}
            onMoveUp={i > 0 ? () => void move(i, -1) : undefined}
            onMoveDown={i < questions.length - 1 ? () => void move(i, 1) : undefined}
          />
        ))}
        {adding ? (
          <QuestionForm
            key={`new-${adding}`}
            quizId={quizId}
            kind={adding}
            number={questions.length + 1}
            locked={false}
            onSaved={() => {
              setAdding(null);
              onChanged();
            }}
            onCancel={() => setAdding(null)}
          />
        ) : null}
        {!loading && !questions.length && !adding ? <p className={MUTED}>No questions yet. Add the first one below.</p> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c3-style-basic-border-border)] pt-4">
          <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Add a question:</span>
          {KINDS.map((k) => (
            <Button key={k} variant="outline" appearance="secondary" size="sm" leadingIcon={<Plus />} disabled={!!adding} onClick={() => setAdding(k)}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </div>
    </Container>
  );
}

const TF_OPTIONS: EduQuizOption[] = [
  { optionId: 'true', label: 'True' },
  { optionId: 'false', label: 'False' },
];

function nextOptionId(options: EduQuizOption[]): string {
  const used = new Set(options.map((o) => o.optionId));
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(97 + i);
    if (!used.has(id)) {
      return id;
    }
  }
  let n = options.length + 1;
  while (used.has(`o${n}`)) {
    n++;
  }
  return `o${n}`;
}

interface QuestionDraft {
  questionKind: QuestionKind;
  promptMd: string;
  points: string;
  poolTag: string;
  options: EduQuizOption[];
  correctOptionIds: string[];
  acceptedAnswers: string;
  codeStarter: string;
}

function draftFrom(q: EduQuizQuestion | undefined, kind: QuestionKind): QuestionDraft {
  const k = q?.questionKind ?? kind;
  const defaultOptions =
    k === 'TRUE_FALSE'
      ? TF_OPTIONS
      : k === 'SINGLE_CHOICE' || k === 'MULTI_CHOICE'
        ? [
            { optionId: 'a', label: '' },
            { optionId: 'b', label: '' },
          ]
        : [];
  return {
    questionKind: k,
    promptMd: q?.promptMd ?? '',
    points: q?.points != null ? String(q.points) : k === 'CODE' ? '3' : '1',
    poolTag: q?.poolTag ?? '',
    options: q?.options?.length ? q.options.map((o) => ({ optionId: o.optionId, label: o.label })) : defaultOptions,
    correctOptionIds: q?.correctOptionIds ?? [],
    acceptedAnswers: (q?.acceptedAnswers ?? []).join('\n'),
    codeStarter: q?.codeStarter ?? (k === 'CODE' ? 'def solve():\n    # Your code here\n    pass\n' : ''),
  };
}

interface QuestionFormProps {
  quizId: string;
  question?: EduQuizQuestion;
  kind?: QuestionKind;
  number: number;
  locked: boolean;
  onSaved: () => void;
  onCancel?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function QuestionForm({ quizId, question, kind = 'SINGLE_CHOICE', number, locked, onSaved, onCancel, onMoveUp, onMoveDown }: QuestionFormProps) {
  const dark = useIsDarkMode();
  // Keyed on content, so a refetch after another question saves doesn't wipe this one's unsaved edits.
  const questionKey = JSON.stringify(question ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => draftFrom(question, kind), [questionKey, kind]);
  const [d, setD] = useState<QuestionDraft>(initial);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!question);
  const dirty = !question || JSON.stringify(d) !== JSON.stringify(initial);
  const idp = `q-${question?.id ?? `new-${number}`}`;

  useEffect(() => {
    setD(initial);
  }, [initial]);

  const isChoice = d.questionKind === 'SINGLE_CHOICE' || d.questionKind === 'MULTI_CHOICE';
  const update = (patch: Partial<QuestionDraft>) => setD((x) => ({ ...x, ...patch }));

  const changeKind = (k: QuestionKind) => {
    const fresh = draftFrom(undefined, k);
    update({
      questionKind: k,
      options: k === 'TRUE_FALSE' ? TF_OPTIONS : (k === 'SINGLE_CHOICE' || k === 'MULTI_CHOICE') && isChoice ? d.options : fresh.options,
      correctOptionIds: k === 'SINGLE_CHOICE' ? d.correctOptionIds.slice(0, 1) : k === 'MULTI_CHOICE' && isChoice ? d.correctOptionIds : [],
      codeStarter: k === 'CODE' ? d.codeStarter || fresh.codeStarter : d.codeStarter,
    });
  };

  const toggleCorrect = (id: string) => {
    if (d.questionKind === 'MULTI_CHOICE') {
      update({ correctOptionIds: d.correctOptionIds.includes(id) ? d.correctOptionIds.filter((x) => x !== id) : [...d.correctOptionIds, id] });
    } else {
      update({ correctOptionIds: [id] });
    }
  };

  const save = async () => {
    const points = d.points.trim() === '' ? 0 : Number(d.points);
    if (!Number.isFinite(points) || points < 0) {
      setError('Points must be a number of 0 or more.');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const k = d.questionKind;
      const choice = k === 'SINGLE_CHOICE' || k === 'MULTI_CHOICE' || k === 'TRUE_FALSE';
      await saveQuizQuestion({
        id: question?.id,
        quiz: { id: quizId },
        questionOrder: question?.questionOrder,
        questionKind: k,
        promptMd: d.promptMd,
        points,
        poolTag: d.poolTag.trim() || undefined,
        options: choice ? d.options.map((o) => ({ optionId: o.optionId, label: o.label.trim() })) : undefined,
        correctOptionIds: choice ? d.correctOptionIds.filter((id) => d.options.some((o) => o.optionId === id)) : undefined,
        acceptedAnswers:
          k === 'SHORT_ANSWER'
            ? d.acceptedAnswers
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        codeStarter: k === 'CODE' ? d.codeStarter : undefined,
      });
      onSaved();
    } catch (err) {
      setError(eduErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!question) {
      onCancel?.();
      return;
    }
    if (!window.confirm(`Delete question ${number}?`)) {
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      await removeQuizQuestion(question.id);
      onSaved();
    } catch (err) {
      setError(eduErrorMessage(err));
      setBusy(null);
    }
  };

  const summary = d.promptMd.split('\n')[0].replace(/[#*_`]/g, '').slice(0, 120) || 'No prompt yet';

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[var(--c3-style-basic-border-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">Q{number}</span>
          <Badge variant="soft" appearance="info">
            {KIND_LABEL[d.questionKind]}
          </Badge>
          <span className={MUTED}>{pts(Number(d.points) || 0)}</span>
          {d.poolTag ? (
            <Badge variant="outline" appearance="secondary">
              {d.poolTag}
            </Badge>
          ) : null}
          {!open ? <span className={`${MUTED} truncate`}>{summary}</span> : null}
          {question && dirty ? (
            <Badge variant="soft" appearance="warning">
              Unsaved
            </Badge>
          ) : null}
          {!question ? (
            <Badge variant="soft" appearance="info">
              New
            </Badge>
          ) : null}
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" appearance="secondary" size="sm" aria-label="Move up" disabled={!onMoveUp} onClick={onMoveUp} leadingIcon={<ArrowUp />} />
          <Button variant="ghost" appearance="secondary" size="sm" aria-label="Move down" disabled={!onMoveDown} onClick={onMoveDown} leadingIcon={<ArrowDown />} />
          <Button variant="ghost" appearance="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Collapse' : 'Edit'}
          </Button>
        </div>
      </div>

      {open ? (
        <>
          <div className="grid gap-3 md:grid-cols-[auto_96px_160px]">
            <div className="flex flex-col gap-1">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Kind</span>
              <Tabs variant="boxed" size="sm" value={d.questionKind} onValueChange={(v) => changeKind(v as QuestionKind)}>
                <TabsList>
                  {KINDS.map((k) => (
                    <TabsTrigger key={k} value={k} disabled={locked && !!question && k !== question.questionKind}>
                      {KIND_LABEL[k]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idp}-points`}>Points</Label>
              <Input id={`${idp}-points`} inputMode="decimal" value={d.points} onChange={(e) => update({ points: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idp}-tag`}>Pool tag</Label>
              <Input id={`${idp}-tag`} value={d.poolTag} onChange={(e) => update({ poolTag: e.target.value })} placeholder="optional, e.g. joins" />
            </div>
          </div>

          <MarkdownField id={`${idp}-prompt`} label="Prompt (Markdown)" value={d.promptMd} onChange={(v) => update({ promptMd: v })} rows={3} />

          {isChoice ? (
            <div className="flex flex-col gap-2">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                Options · mark {d.questionKind === 'MULTI_CHOICE' ? 'every correct option' : 'the correct option'}
              </span>
              {d.options.map((o, i) => (
                <div key={o.optionId} className="flex items-center gap-2">
                  <input
                    type={d.questionKind === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                    name={`${idp}-correct`}
                    checked={d.correctOptionIds.includes(o.optionId)}
                    onChange={() => toggleCorrect(o.optionId)}
                    aria-label={`Option ${i + 1} is correct`}
                    className="size-4 accent-[var(--c3-style-basic-fg-accent)]"
                  />
                  <span className={`${MUTED} w-5 font-mono`}>{o.optionId}</span>
                  <Input
                    value={o.label}
                    onChange={(e) => update({ options: d.options.map((x) => (x.optionId === o.optionId ? { ...x, label: e.target.value } : x)) })}
                    placeholder={`Option ${i + 1} (Markdown allowed)`}
                    aria-label={`Option ${i + 1} text`}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    appearance="secondary"
                    size="sm"
                    aria-label={`Remove option ${i + 1}`}
                    leadingIcon={<X />}
                    disabled={d.options.length <= 2}
                    onClick={() =>
                      update({ options: d.options.filter((x) => x.optionId !== o.optionId), correctOptionIds: d.correctOptionIds.filter((x) => x !== o.optionId) })
                    }
                  />
                </div>
              ))}
              <div>
                <Button
                  variant="outline"
                  appearance="secondary"
                  size="sm"
                  leadingIcon={<Plus />}
                  disabled={d.options.length >= 20}
                  onClick={() => update({ options: [...d.options, { optionId: nextOptionId(d.options), label: '' }] })}
                >
                  Add option
                </Button>
              </div>
            </div>
          ) : null}

          {d.questionKind === 'TRUE_FALSE' ? (
            <div className="flex flex-col gap-1">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Correct answer</span>
              <Tabs variant="boxed" size="sm" value={d.correctOptionIds[0] ?? ''} onValueChange={(v) => update({ correctOptionIds: [v] })}>
                <TabsList>
                  <TabsTrigger value="true">True</TabsTrigger>
                  <TabsTrigger value="false">False</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          ) : null}

          {d.questionKind === 'SHORT_ANSWER' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idp}-accepted`}>Accepted answers, one per line</Label>
              <textarea
                id={`${idp}-accepted`}
                value={d.acceptedAnswers}
                onChange={(e) => update({ acceptedAnswers: e.target.value })}
                rows={3}
                className="rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-2 font-mono text-[13px] text-[var(--c3-style-basic-fg-primary)]"
              />
              <span className={MUTED}>Matching ignores capitals and extra spaces.</span>
            </div>
          ) : null}

          {d.questionKind === 'CODE' ? (
            <div className="flex flex-col gap-2">
              <span className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]">Starter code (students edit this in answer.py)</span>
              <div className="overflow-hidden rounded-xs border border-[var(--c3-style-basic-border-border)]">
                <CodeMirror
                  value={d.codeStarter}
                  onChange={(v) => update({ codeStarter: v })}
                  basicSetup={CODE_SETUP}
                  extensions={PYTHON}
                  theme={codeTheme(dark)}
                  minHeight="100px"
                  maxHeight="320px"
                  indentWithTab
                  aria-label="Starter code"
                />
              </div>
              <span className={MUTED}>Code answers are graded by hand from the Attempts page. An answer left as the starter code scores 0 automatically.</span>
            </div>
          ) : null}

          {error ? <p className={DANGER}>{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" appearance="danger" size="sm" leadingIcon={<Trash2 />} loading={busy === 'delete'} disabled={busy !== null || (locked && !!question)} onClick={() => void remove()}>
              {question ? 'Delete' : 'Cancel'}
            </Button>
            <Button variant="solid" appearance="accent" size="sm" leadingIcon={<Save />} loading={busy === 'save'} disabled={busy !== null || !dirty} onClick={() => void save()}>
              Save question
            </Button>
          </div>

          {question && d.questionKind === 'CODE' && question.questionKind === 'CODE' ? <TestEditor questionId={question.id} /> : null}
          {!question && d.questionKind === 'CODE' ? <p className={MUTED}>Save the question to add code tests.</p> : null}
        </>
      ) : null}
    </div>
  );
}
