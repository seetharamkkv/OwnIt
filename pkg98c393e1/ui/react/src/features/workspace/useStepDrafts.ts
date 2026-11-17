/*
 * Step drafts and autosave for the workspace. Owner: Keya. PROJECT_PLAN.md 5.1.
 *  - Saves 1.5 s after typing stops, when the step changes (flush), before tests run or submit, and on leave.
 *  - Sends the revision it last saw; the server answers EDU_REVISION_CONFLICT when another tab saved first, and the
 *    student chooses which version to keep.
 *  - One save per step at a time; edits made during a save are saved right after it.
 *  - Preview mode (persist = false) keeps everything in memory.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { eduErrorCode, eduErrorMessage } from '@/common/errors';

import { fetchMySubmission, saveMyStep, setMyStepCompleted } from './api';
import type { WorkspaceModel } from './model';

export const AUTOSAVE_DELAY_MS = 1500;

export type DraftState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'locked';

export interface Draft {
  value: string;
  /** Revision of the last version the server confirmed. */
  revision: number;
  /** Content the server holds at `revision`. */
  saved: string;
  completed: boolean;
  state: DraftState;
  error?: string;
}

export type SaveSummary = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict' | 'locked' | 'local';

function summarize(drafts: Record<string, Draft>, persist: boolean): SaveSummary {
  if (!persist) {
    return 'local';
  }
  const states = Object.values(drafts).map((d) => d.state);
  if (states.includes('locked')) return 'locked';
  if (states.includes('conflict')) return 'conflict';
  if (states.includes('error')) return 'error';
  if (states.includes('saving')) return 'saving';
  if (states.includes('dirty')) return 'unsaved';
  return 'saved';
}

function initialDrafts(model: WorkspaceModel): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  model.steps.forEach((s) => {
    const content = s.saved ? s.saved.content : s.starterContent;
    out[s.id] = { value: content, saved: content, revision: s.saved?.revision ?? 0, completed: !!s.saved?.completed, state: 'saved' };
  });
  return out;
}

export function useStepDrafts(model: WorkspaceModel | undefined, persist: boolean) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef<Record<string, Draft>>({});
  const timers = useRef<Record<string, number>>({});
  const inFlight = useRef<Record<string, Promise<void> | undefined>>({});
  const loadedFor = useRef('');

  const patch = useCallback((stepId: string, change: Partial<Draft>) => {
    const current = draftsRef.current[stepId];
    if (!current) {
      return;
    }
    draftsRef.current = { ...draftsRef.current, [stepId]: { ...current, ...change } };
    setDrafts(draftsRef.current);
  }, []);

  // Load drafts once per submission (or preview); later refetches must not wipe what the student is typing.
  useEffect(() => {
    if (!model) {
      return;
    }
    const key = model.submission ? `${model.submission.id}:${model.steps.length}` : `preview:${model.assignment.id}`;
    if (loadedFor.current === key) {
      return;
    }
    loadedFor.current = key;
    draftsRef.current = { ...initialDrafts(model), ...draftsRef.current };
    setDrafts(draftsRef.current);
  }, [model]);

  const saveNow = useCallback(
    async (stepId: string): Promise<void> => {
      if (!persist) {
        return;
      }
      window.clearTimeout(timers.current[stepId]);
      const running = inFlight.current[stepId];
      if (running) {
        await running;
      }
      const draft = draftsRef.current[stepId];
      if (!draft || draft.value === draft.saved || draft.state === 'conflict' || draft.state === 'locked') {
        return;
      }
      const sending = draft.value;
      patch(stepId, { state: 'saving', error: undefined });
      const request = saveMyStep(stepId, sending, draft.revision)
        .then((res) => {
          const latest = draftsRef.current[stepId];
          const stillDirty = latest.value !== sending;
          patch(stepId, { revision: res.revision ?? draft.revision + 1, saved: sending, state: stillDirty ? 'dirty' : 'saved' });
          if (stillDirty) {
            timers.current[stepId] = window.setTimeout(() => void saveNow(stepId), AUTOSAVE_DELAY_MS);
          }
        })
        .catch((err: unknown) => {
          const code = eduErrorCode(err);
          const state: DraftState = code === 'EDU_REVISION_CONFLICT' ? 'conflict' : code === 'EDU_DEADLINE_PASSED' ? 'locked' : 'error';
          patch(stepId, { state, error: eduErrorMessage(err) });
        })
        .finally(() => {
          inFlight.current[stepId] = undefined;
        });
      inFlight.current[stepId] = request;
      await request;
    },
    [patch, persist]
  );

  const setValue = useCallback(
    (stepId: string, value: string) => {
      const draft = draftsRef.current[stepId];
      if (!draft || draft.value === value) {
        return;
      }
      const keep = draft.state === 'conflict' || draft.state === 'locked';
      patch(stepId, { value, state: keep ? draft.state : value === draft.saved ? 'saved' : 'dirty' });
      if (persist && !keep) {
        window.clearTimeout(timers.current[stepId]);
        timers.current[stepId] = window.setTimeout(() => void saveNow(stepId), AUTOSAVE_DELAY_MS);
      }
    },
    [patch, persist, saveNow]
  );

  /** Saves every pending step now. Resolves true when nothing is left unsaved. */
  const flushAll = useCallback(async (): Promise<boolean> => {
    await Promise.all(Object.keys(draftsRef.current).map((id) => saveNow(id)));
    return !persist || Object.values(draftsRef.current).every((d) => d.state === 'saved');
  }, [persist, saveNow]);

  /** After a conflict: keep this tab's text (save it over the newer version) or take the saved version. */
  const resolveConflict = useCallback(
    async (stepId: string, keep: 'mine' | 'saved', assignmentId: string) => {
      const latest = await fetchMySubmission(assignmentId);
      const response = latest?.responses?.find((r) => r.step.id === stepId);
      if (!response) {
        throw new Error('EDU_NOT_FOUND: the saved answer for this step is missing; reload the page');
      }
      const serverContent = response.content ?? '';
      const serverRevision = response.revision ?? 0;
      if (keep === 'saved') {
        patch(stepId, { value: serverContent, saved: serverContent, revision: serverRevision, state: 'saved', error: undefined });
        return;
      }
      patch(stepId, { saved: serverContent, revision: serverRevision, state: 'dirty', error: undefined });
      await saveNow(stepId);
    },
    [patch, saveNow]
  );

  /**
   * Marks a step done or not done. Resolves false when the server refuses because the work can no longer change
   * (handed in from another tab, or the deadline passed); the step is then marked 'locked', like a refused save.
   */
  const setCompleted = useCallback(
    async (stepId: string, completed: boolean): Promise<boolean> => {
      if (persist) {
        await saveNow(stepId);
        if (draftsRef.current[stepId]?.state === 'locked') {
          return false;
        }
        try {
          await setMyStepCompleted(stepId, completed);
        } catch (err) {
          if (eduErrorCode(err) === 'EDU_DEADLINE_PASSED') {
            patch(stepId, { state: 'locked', error: eduErrorMessage(err) });
            return false;
          }
          throw err;
        }
      }
      patch(stepId, { completed });
      return true;
    },
    [patch, persist, saveNow]
  );

  // Warn before leaving with unsaved work, and save what is pending when the workspace unmounts.
  useEffect(() => {
    if (!persist) {
      return undefined;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const pending = Object.values(draftsRef.current).some((d) => d.state === 'dirty' || d.state === 'saving');
      if (pending) {
        void flushAll();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const pendingTimers = timers.current;
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      Object.values(pendingTimers).forEach((t) => window.clearTimeout(t));
      void flushAll();
    };
  }, [flushAll, persist]);

  return { drafts, summary: summarize(drafts, persist), setValue, saveNow, flushAll, resolveConflict, setCompleted };
}
