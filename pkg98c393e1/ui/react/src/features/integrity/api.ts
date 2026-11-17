/*
 * Integrity backend calls. Owner: Seetharam. Contract: ref_docs/02_INTEGRITY_CONTRACTS.md section 4.
 * Components call these, never c3Call directly.
 */
import { c3Call, getAppBaseUrl } from '@/c3Action';
import type {
  ContextKind,
  CourseRiskRow,
  EduIntegrityEvent,
  EduIntegrityPolicy,
  IntegrityClientEvent,
  IntegrityContextRow,
  IntegritySessionState,
  PolicyEditorView,
  PolicyLevel,
  StudentRiskRow,
} from '@/common/eduTypes';

/** Effective policy for an assignment or quiz. `itemId` is the assignment or quiz id, not the submission id. */
export const fetchEffectivePolicy = (contextKind: ContextKind, itemId: string): Promise<EduIntegrityPolicy> =>
  c3Call('EduIntegrityPolicy', 'forContext', null, [contextKind, itemId]);

export const fetchPolicyEditorView = (level: PolicyLevel, levelId?: string): Promise<PolicyEditorView> =>
  c3Call('EduIntegrityPolicy', 'editorView', null, [level, levelId ?? null]);

export const savePolicyOverride = (level: PolicyLevel, levelId: string, policy: EduIntegrityPolicy, reason: string): Promise<PolicyEditorView> =>
  c3Call('EduIntegrityPolicy', 'saveOverride', null, [level, levelId, policy, reason]);

/** Sends one batch (at most 100 events). Returns the session's lock state. */
export const logIntegrityBatch = (
  contextKind: ContextKind,
  contextId: string,
  clientSessionId: string,
  events: IntegrityClientEvent[]
): Promise<IntegritySessionState> => c3Call('EduIntegrityEvent', 'logBatch', null, [contextKind, contextId, clientSessionId, events]);

/** Lock state of the caller's own session, without writing anything. */
export const fetchSessionState = (contextKind: ContextKind, contextId: string): Promise<IntegritySessionState> =>
  c3Call('EduIntegrityEvent', 'sessionStateMine', null, [contextKind, contextId]);

/** One page of a session's events, newest first (instructor screens; course-checked on the server). */
export const fetchTimeline = async (contextKind: ContextKind, contextId: string, limit = 200, offset = 0): Promise<EduIntegrityEvent[]> =>
  (await c3Call('EduIntegrityEvent', 'timeline', null, [contextKind, contextId, limit, offset])) ?? [];

export const fetchStudentContexts = async (courseId: string, personId: string): Promise<IntegrityContextRow[]> =>
  (await c3Call('EduIntegrityEvent', 'studentContexts', null, [courseId, personId])) ?? [];

export const fetchCourseReport = async (courseId: string, since?: string): Promise<StudentRiskRow[]> =>
  (await c3Call('EduIntegrityEvent', 'courseReport', null, [courseId, since ?? null])) ?? [];

export const fetchPlatformReport = async (since?: string): Promise<CourseRiskRow[]> =>
  (await c3Call('EduIntegrityEvent', 'platformReport', null, [since ?? null])) ?? [];

export const releaseLock = (contextKind: ContextKind, contextId: string, reason: string): Promise<EduIntegrityEvent> =>
  c3Call('EduIntegrityEvent', 'releaseLock', null, [contextKind, contextId, reason]);

/** keepalive requests are capped at 64 KB by browsers; stay under it. */
const UNLOAD_MAX_BYTES = 60_000;

/**
 * Flushes events while the page is going away (pagehide, hidden tab). navigator.sendBeacon can't set the
 * `x-request-envelope` header c3Call needs, so this uses fetch with keepalive (G10). Fire and forget.
 */
export function flushOnUnload(contextKind: ContextKind, contextId: string, clientSessionId: string, events: IntegrityClientEvent[]): void {
  if (!events.length) {
    return;
  }
  let batch = events.slice(0, 100);
  let body = JSON.stringify({ thisArg: 'EduIntegrityEvent', args: [contextKind, contextId, clientSessionId, batch] });
  while (body.length > UNLOAD_MAX_BYTES && batch.length > 1) {
    batch = batch.slice(0, Math.ceil(batch.length / 2));
    body = JSON.stringify({ thisArg: 'EduIntegrityEvent', args: [contextKind, contextId, clientSessionId, batch] });
  }
  void fetch(`${getAppBaseUrl()}/api/8/EduIntegrityEvent/logBatch`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-request-envelope': 'true' },
    body,
  }).catch(() => undefined);
}
