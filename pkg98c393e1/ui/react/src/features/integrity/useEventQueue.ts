/*
 * Batches integrity events and sends them to EduIntegrityEvent.logBatch. Owner: Seetharam.
 * Plan: ref_docs/01_INTEGRITY_PLAN.md task 1.5.
 *
 * - Flushes every 5 s, and immediately when asked (TAB_HIDDEN).
 * - A failed flush keeps the events; the queue holds at most 500 and drops the oldest INFO events first.
 * - On pagehide the rest goes out with fetch keepalive (flushOnUnload).
 * - Offline sessions (previews, the playground) never touch the network.
 * Events carry lengths, hashes, counts and durations only. Never text.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ContextKind, IntegrityClientEvent, IntegrityDetails, IntegrityEventKind, IntegritySessionState } from '@/common/eduTypes';

import { flushOnUnload, logIntegrityBatch } from './api';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 100;
const MAX_QUEUE = 500;
const SESSION_PREFIX = 'edu.session.';

/** Kinds that can be dropped first when the queue is full. */
const LOW_PRIORITY: IntegrityEventKind[] = ['SESSION_START', 'PASTE_INTERNAL', 'CONTEXT_MENU_BLOCKED', 'TAB_VISIBLE', 'WINDOW_BLUR', 'FULLSCREEN_ENTER'];

export interface EventQueue {
  /** Adds an event; `flush: true` sends the queue right away. */
  push: (eventKind: IntegrityEventKind, details?: IntegrityDetails, options?: { stepId?: string; flush?: boolean }) => void;
  /** Sends what is queued now (no-op when offline or a send is already running). */
  flush: () => Promise<void>;
  /** Sends what is queued with fetch keepalive, for pagehide. */
  flushUnload: () => void;
  clientSessionId: string;
}

interface UseEventQueueOptions {
  contextKind: ContextKind;
  contextId: string;
  offline: boolean;
  /** Called with the server's session state after every successful send. */
  onState: (state: IntegritySessionState) => void;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One id per browser tab and work session, kept across reloads in sessionStorage. */
function sessionIdFor(contextId: string): string {
  try {
    const key = SESSION_PREFIX + contextId;
    const existing = window.sessionStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const id = randomId();
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

function capQueue(queue: IntegrityClientEvent[]): IntegrityClientEvent[] {
  const out = queue.slice();
  while (out.length > MAX_QUEUE) {
    const i = out.findIndex((e) => LOW_PRIORITY.includes(e.eventKind));
    out.splice(i >= 0 ? i : 0, 1);
  }
  return out;
}

export function useEventQueue({ contextKind, contextId, offline, onState }: UseEventQueueOptions): EventQueue {
  const queueRef = useRef<IntegrityClientEvent[]>([]);
  const sendingRef = useRef(false);
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  const clientSessionId = useMemo(() => sessionIdFor(contextId), [contextId]);

  const flush = useCallback(async () => {
    if (offline || sendingRef.current || !queueRef.current.length) {
      return;
    }
    sendingRef.current = true;
    const batch = queueRef.current.slice(0, MAX_BATCH);
    try {
      const state = await logIntegrityBatch(contextKind, contextId, clientSessionId, batch);
      queueRef.current = queueRef.current.slice(batch.length);
      if (state) {
        onStateRef.current(state);
      }
    } catch {
      // Keep the events for the next try; the 5 s timer retries. A broken session shows up in the provider's notice.
    } finally {
      sendingRef.current = false;
    }
  }, [offline, contextKind, contextId, clientSessionId]);

  const push = useCallback<EventQueue['push']>(
    (eventKind, details, options) => {
      if (offline) {
        return;
      }
      queueRef.current = capQueue([
        ...queueRef.current,
        { eventKind, details, stepId: options?.stepId, clientAt: new Date().toISOString() },
      ]);
      if (options?.flush) {
        void flush();
      }
    },
    [offline, flush]
  );

  const flushUnload = useCallback(() => {
    if (offline || !queueRef.current.length) {
      return;
    }
    flushOnUnload(contextKind, contextId, clientSessionId, queueRef.current.slice(0, MAX_BATCH));
    queueRef.current = queueRef.current.slice(MAX_BATCH);
  }, [offline, contextKind, contextId, clientSessionId]);

  useEffect(() => {
    if (offline) {
      return undefined;
    }
    const timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [offline, flush]);

  return useMemo(() => ({ push, flush, flushUnload, clientSessionId }), [push, flush, flushUnload, clientSessionId]);
}
