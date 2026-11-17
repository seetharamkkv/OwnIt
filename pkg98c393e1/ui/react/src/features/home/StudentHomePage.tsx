/*
 * Student home: "Up next", upcoming deadlines grouped by day, summary tiles, recently graded, proctoring notice.
 * Mockup board 1 (resource/mockups/STUDENT_UI_MOCKUPS.md). Data: EduSubmission.myDashboard. Owner: Keya.
 * Personal to-dos from the mockup are not built yet (they need an EduStudentTodo entity).
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';

import { useMe } from '@/common/auth/useMe';
import { eduErrorMessage } from '@/common/errors';
import type { GradedRow, MyAssignmentRow, MyQuizRow } from '@/common/eduTypes';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import {
  Chips,
  DUE_GROUP_ORDER,
  dayOfMonth,
  dueGroup,
  dueLabel,
  Eyebrow,
  formatScore,
  greeting,
  type ItemKind,
  KindBadge,
  kindFileName,
  longDate,
  monthShort,
  PercentBar,
  remainingLabel,
  shortDate,
  StepBar,
  SwCard,
} from '@/common/stepwise/ui';
import { fetchMyDashboard } from '@/features/workspace/api';
import { useNow } from '@/features/workspace/deadline';

/** A row in the deadline list: an open assignment or an open quiz, normalised for display. */
interface DeadlineItem {
  id: string;
  kind: ItemKind;
  title: string;
  courseCode: string;
  meta: string;
  due?: string;
  done: number;
  total: number;
  progress: string;
  tone: 'warn' | 'late' | 'soon' | 'normal';
  dueText: string;
  dueSub: string;
  href: string;
  late: boolean;
}

type Filter = 'all' | 'hw' | 'quiz';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function assignmentItem(a: MyAssignmentRow, now: number): DeadlineItem | null {
  const open = a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS';
  if (!open) {
    return null;
  }
  const dueMs = a.dueAt ? new Date(a.dueAt).getTime() : null;
  const pastDue = dueMs !== null && dueMs < now;
  const lateOpen = pastDue && !!a.lateUntil && new Date(a.lateUntil).getTime() > now;
  if (pastDue && !lateOpen) {
    return null; // closed for good; the course page lists it
  }
  const done = a.completedSteps ?? 0;
  const total = a.totalSteps ?? 0;
  let tone: DeadlineItem['tone'] = 'normal';
  if (lateOpen) {
    tone = 'late';
  } else if (dueMs !== null && dueMs - now < DAY_MS) {
    tone = 'warn';
  } else if (dueMs !== null && dueMs - now < 2 * DAY_MS) {
    tone = 'soon';
  }
  const meta = lateOpen
    ? `Late window${a.latePenaltyPct ? ` · −${a.latePenaltyPct}%` : ''}`
    : a.status === 'IN_PROGRESS' && a.nextStepOrder
      ? `Step ${a.nextStepOrder} of ${total}`
      : `${total} steps${a.totalPoints ? ` · ${a.totalPoints} pts` : ''}`;
  return {
    id: a.assignmentId,
    kind: a.fileKind ?? 'PY',
    title: a.title ?? a.assignmentId,
    courseCode: a.courseCode ?? '',
    meta,
    due: lateOpen ? a.lateUntil : a.dueAt,
    done,
    total,
    progress: `${done} / ${total} steps`,
    tone,
    dueText: lateOpen ? `Late until ${shortDate(a.lateUntil)}` : a.dueAt ? dueLabel(a.dueAt, now) : 'No due date',
    dueSub: lateOpen ? `Was due ${shortDate(a.dueAt)}` : a.dueAt ? remainingLabel(a.dueAt, now) : '',
    href: routes.workspace(a.assignmentId),
    late: lateOpen,
  };
}

function quizItem(q: MyQuizRow, now: number): DeadlineItem | null {
  const closes = q.closesAt ? new Date(q.closesAt).getTime() : null;
  const handedIn = (q.attemptsUsed ?? 0) > 0 && !q.openAttemptId && !q.canStart;
  if (handedIn || (closes !== null && closes < now)) {
    return null;
  }
  const opensLater = q.opensAt && new Date(q.opensAt).getTime() > now;
  const limit = q.effectiveTimeLimitMin ?? q.timeLimitMin;
  return {
    id: q.quizId,
    kind: 'QUIZ',
    title: q.title ?? q.quizId,
    courseCode: q.courseCode ?? '',
    meta: `${limit ? `${limit} min` : 'No time limit'} · ${q.attemptsAllowed ?? 1} attempt${(q.attemptsAllowed ?? 1) === 1 ? '' : 's'}`,
    due: q.closesAt,
    done: q.openAttemptId ? 1 : 0,
    total: 1,
    progress: opensLater ? `Opens ${dueLabel(q.opensAt as string, now)}` : q.openAttemptId ? 'Attempt in progress' : 'Not started',
    tone: closes !== null && closes - now < DAY_MS ? 'warn' : 'normal',
    dueText: q.closesAt ? dueLabel(q.closesAt, now) : 'No close date',
    dueSub: q.closesAt ? `Closes ${remainingLabel(q.closesAt, now).replace(' left', '')} from now` : '',
    href: routes.quizTake(q.quizId),
    late: false,
  };
}

const TONE_CLASS: Record<DeadlineItem['tone'], string> = {
  warn: 'text-[var(--sw-warn)]',
  late: 'text-[var(--sw-danger)]',
  soon: 'text-[var(--sw-fg)]',
  normal: 'text-[var(--sw-fg-2)]',
};

export default function StudentHomePage() {
  const { me } = useMe();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>('all');
  const dashboard = useQuery({ queryKey: queryKeys.myDashboard(), queryFn: fetchMyDashboard, staleTime: 30_000 });

  const items = useMemo(() => {
    const d = dashboard.data;
    if (!d) {
      return [] as DeadlineItem[];
    }
    const rows = [
      ...(d.assignments ?? []).map((a) => assignmentItem(a, now)),
      ...(d.quizzes ?? []).map((q) => quizItem(q, now)),
    ].filter((x): x is DeadlineItem => x !== null);
    rows.sort((a, b) => (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity));
    return rows;
  }, [dashboard.data, now]);

  const counts = useMemo(
    () => ({ all: items.length, hw: items.filter((i) => i.kind !== 'QUIZ').length, quiz: items.filter((i) => i.kind === 'QUIZ').length }),
    [items]
  );

  const groups = useMemo(() => {
    const kept = items.filter((i) => filter === 'all' || (filter === 'quiz' ? i.kind === 'QUIZ' : i.kind !== 'QUIZ'));
    return DUE_GROUP_ORDER.map((label) => ({ label, items: kept.filter((i) => dueGroup(i.due, now) === label) })).filter(
      (g) => g.items.length > 0
    );
  }, [items, filter, now]);

  const upNext = items[0];
  const dueWeek = items.filter((i) => i.due && new Date(i.due).getTime() - now < 7 * DAY_MS).length;

  if (dashboard.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (dashboard.error) {
    return <PageMessage title="Could not load your work" message={eduErrorMessage(dashboard.error)} />;
  }
  const d = dashboard.data;
  const firstName = (me?.displayName ?? '').split(' ')[0];

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-16 pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em]">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-2 text-[15px] text-[var(--sw-fg-muted)]">
            {longDate(now)} · {dueWeek} thing{dueWeek === 1 ? '' : 's'} due in the next 7 days
          </p>
        </div>
        <Link to={routes.courses} className="px-1 py-3 text-[14px] no-underline">
          All courses →
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="up-next" className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {upNext ? <UpNext item={upNext} now={now} assignment={d?.assignments?.find((a) => a.assignmentId === upNext.id)} /> : <NothingDue />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold">Upcoming deadlines</h2>
            <Chips<Filter>
              label="Filter deadlines"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'hw', label: 'Homework', count: counts.hw },
                { id: 'quiz', label: 'Quizzes', count: counts.quiz },
              ]}
            />
          </div>

          {groups.length === 0 ? (
            <p className="text-[var(--sw-fg-muted)]">Nothing in this view.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-2">
                <h3 className="mb-0.5 mt-1">
                  <Eyebrow>{g.label}</Eyebrow>
                </h3>
                {g.items.map((it) => (
                  <DeadlineRow key={`${it.kind}-${it.id}`} item={it} />
                ))}
              </div>
            ))
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <div className="grid grid-cols-3 gap-2.5">
            <Tile value={d?.dueSoonCount ?? 0} label="Due in 7 days" />
            <Tile value={d?.inProgressCount ?? 0} label="In progress" />
            <Tile value={d?.lateWindowCount ?? 0} label="In late window" warn={(d?.lateWindowCount ?? 0) > 0} />
          </div>

          <SwCard className="p-5">
            <h2 className="mb-3 text-[16px] font-semibold">Recently graded</h2>
            {d?.recentlyGraded?.length ? (
              <div className="flex flex-col gap-3">
                {d.recentlyGraded.map((g) => (
                  <GradedLine key={`${g.itemKind}-${g.itemId}`} row={g} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[var(--sw-fg-faint)]">No grades released yet. Scores appear here once your instructor releases them.</p>
            )}
          </SwCard>

          <SwCard className="p-5 text-[13px] leading-relaxed text-[var(--sw-fg-muted)]">
            <h2 className="mb-1.5 text-[14px] font-semibold text-[var(--sw-fg)]">How proctored homework works</h2>
            Pasting from outside the app is blocked, and tab switches are logged. Your name appears as a watermark. We never store
            the text you paste.
          </SwCard>
        </aside>
      </div>
    </main>
  );
}

function UpNext({ item, now, assignment }: { item: DeadlineItem; now: number; assignment?: MyAssignmentRow }) {
  const isQuiz = item.kind === 'QUIZ';
  const dueSoon = item.due && new Date(item.due).getTime() - now < 24 * HOUR_MS;
  const nextStep = assignment?.nextStepOrder;
  const failing = assignment?.failingVisibleTests ?? 0;
  return (
    <SwCard tone="accent" className="flex flex-col gap-[18px] p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <Eyebrow accent>Up next</Eyebrow>
        {item.due ? (
          <span
            className={`rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${
              item.late
                ? 'bg-[var(--sw-danger-bg)] text-[var(--sw-danger)]'
                : dueSoon
                  ? 'bg-[var(--sw-warn-bg)] text-[var(--sw-warn)]'
                  : 'bg-[var(--sw-accent-bg)] text-[var(--sw-accent-soft)]'
            }`}
          >
            {item.late ? `Late window closes in ${remainingLabel(item.due, now).replace(' left', '')}` : `Due in ${remainingLabel(item.due, now).replace(' left', '')}`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 id="up-next" className="text-[22px] font-semibold">
            {item.title}
          </h2>
          <p className="mt-1.5 text-[var(--sw-fg-muted)]">
            {item.courseCode}
            {assignment?.courseTitle ? ` · ${assignment.courseTitle}` : ''} ·{' '}
            <span className="font-[family-name:var(--sw-mono)] text-[12px] text-[var(--sw-kind-py)]">{kindFileName(item.kind)}</span>
          </p>
          {!isQuiz && nextStep ? (
            <p className="mt-3 text-[var(--sw-fg-2)]">
              Next: <strong className="font-semibold">Step {nextStep}{assignment?.nextStepTitle ? ` — ${assignment.nextStepTitle}` : ''}</strong>
              {failing > 0 ? ` · ${failing} test${failing === 1 ? '' : 's'} failing` : ''}
            </p>
          ) : null}
        </div>
        <Link
          to={item.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[var(--sw-accent)] px-5 font-semibold !text-[var(--sw-bg)] no-underline"
        >
          {isQuiz ? (item.done ? 'Resume quiz' : 'Start quiz') : nextStep ? `Continue step ${nextStep}` : 'Open'}
          <ArrowRight className="size-4" strokeWidth={2.2} />
        </Link>
      </div>
      {!isQuiz ? (
        <div>
          <div className="mb-2 flex justify-between text-[12px] text-[var(--sw-fg-muted)]">
            <span>
              {item.done} of {item.total} steps done
            </span>
            <span>{item.due ? `Due ${dueGroup(item.due, now) === 'Today' ? 'today, ' : ''}${dueLabel(item.due, now)}` : 'No due date'}</span>
          </div>
          <StepBar done={item.done} total={item.total} current />
        </div>
      ) : null}
    </SwCard>
  );
}

function NothingDue() {
  return (
    <SwCard tone="accent" className="p-6">
      <Eyebrow accent>Up next</Eyebrow>
      <h2 className="mt-2 text-[22px] font-semibold">You&apos;re all caught up</h2>
      <p className="mt-1.5 text-[var(--sw-fg-muted)]">Nothing is open right now. New homework shows up here when your instructor releases it.</p>
    </SwCard>
  );
}

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const pct = item.total ? (item.done / item.total) * 100 : 0;
  return (
    <Link
      to={item.href}
      className="sw-row flex flex-wrap items-center gap-4 rounded-xl border border-[var(--sw-border)] bg-[var(--sw-card)] px-4 py-3.5 !text-inherit no-underline"
    >
      <div className="w-12 shrink-0 text-center">
        <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--sw-fg-faint)]">{item.due ? monthShort(item.due) : '—'}</div>
        <div className="text-[20px] font-semibold leading-tight">{item.due ? dayOfMonth(item.due) : ''}</div>
      </div>
      <KindBadge kind={item.kind} />
      <div className="min-w-0 flex-[1_1_220px]">
        <div className="text-[15px] font-medium text-[var(--sw-fg)]">{item.title}</div>
        <div className="mt-[3px] text-[13px] text-[var(--sw-fg-muted)]">
          {item.courseCode} · {item.meta}
        </div>
      </div>
      <div className="w-[120px] shrink-0">
        <PercentBar pct={pct} complete={item.total > 0 && item.done >= item.total} />
        <div className="mt-1.5 text-[12px] text-[var(--sw-fg-faint)]">{item.progress}</div>
      </div>
      <div className="w-[150px] shrink-0 text-right">
        <div className={`text-[13px] font-semibold ${TONE_CLASS[item.tone]}`}>{item.dueText}</div>
        <div className="mt-[3px] text-[12px] text-[var(--sw-fg-faint)]">{item.dueSub}</div>
      </div>
      <ChevronRight className="size-4 text-[var(--sw-fg-faint)]" />
    </Link>
  );
}

function Tile({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <SwCard tone={warn ? 'warn' : 'default'} className="rounded-xl p-3.5">
      <div className={`text-[24px] font-semibold ${warn ? 'text-[var(--sw-warn)]' : ''}`}>{value}</div>
      <div className="mt-0.5 text-[12px] text-[var(--sw-fg-muted)]">{label}</div>
    </SwCard>
  );
}

function GradedLine({ row }: { row: GradedRow }) {
  return (
    <div className="flex justify-between gap-3">
      <div>
        <div className="text-[14px]">{row.title}</div>
        <div className="mt-0.5 text-[12px] text-[var(--sw-fg-faint)]">
          {row.courseCode} · {shortDate(row.gradedAt)}
        </div>
      </div>
      <div className="font-semibold text-[var(--sw-success)]">{formatScore(row.score, row.maxScore)}</div>
    </div>
  );
}
