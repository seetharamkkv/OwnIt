/*
 * Integrity contracts. Owner: Seetharam. Editors (Keya) route paste/drop/copy through IntegrityHooks.
 * ⚠ Shared contract: ref_docs/02_INTEGRITY_CONTRACTS.md section 4.
 */
import type { ReactNode } from 'react';

import type { ContextKind, EduIntegrityPolicy } from '@/common/eduTypes';

/** Callbacks every editor must call (PROJECT_PLAN.md 5.2). */
export interface IntegrityHooks {
  /** Call with the copied text when the user copies inside the editor. */
  onCopy: (text: string) => void;
  /** Call with the pasted text; return value false means block the paste (preventDefault). */
  onPaste: (text: string) => boolean;
  /** Call with dropped text; false means block the drop. */
  onDrop: (text: string) => boolean;
  /** Call when one change inserts `chars` characters without a paste (for inserts of 20 or more characters). */
  onLargeInsert: (chars: number) => void;
}

export interface LockdownContextInfo {
  contextKind: ContextKind;
  /** Submission id or quiz attempt id. */
  contextId: string;
  courseId: string;
}

export interface WatermarkStudent {
  name: string;
  studentNumber?: string;
}

export interface LockdownProviderProps {
  /** From fetchEffectivePolicy(kind, assignmentId or quizId). */
  policy: EduIntegrityPolicy;
  context: LockdownContextInfo;
  student: WatermarkStudent;
  courseCode?: string;
  canaryToken?: string;
  /**
   * When true, the provider decides allow or block but sends nothing to the server. Context ids that start with
   * `playground-` or `preview-` are always offline (staff previews, the local playground).
   */
  offline?: boolean;
  children: ReactNode;
}

/** Session state for work pages, from useLockdownState(). */
export interface LockdownState {
  /** sessionStateMine has returned (always true when offline). */
  ready: boolean;
  /** The server says the session is locked; editors and inputs become read-only. */
  locked: boolean;
  /** No events are sent for this session. */
  offline: boolean;
  fullscreenRequired: boolean;
  inFullscreen: boolean;
  fullscreenSupported: boolean;
  /** Tab switches since the last unlock (server count once known, local count before). */
  tabSwitchCount: number;
  warnAt?: number;
  lockAt?: number;
  /** Policy `blockScreenshots` is on: the work is hidden while unfocused, Print Screen and printing are blocked. */
  screenshotsBlocked: boolean;
  /** Screenshot attempts (Print Screen / shortcut) seen in this page session. */
  screenshotAttempts: number;
  /** Print or save-page attempts blocked in this page session. */
  printAttempts: number;
}

/** A short message shown in the screen corner (IntegrityNotice). */
export interface IntegrityNoticeItem {
  id: number;
  tone: 'info' | 'warning' | 'destructive';
  title: string;
  message?: string;
}
