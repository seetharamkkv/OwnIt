/*
 * Lockdown wrapper for one work session (an assignment submission or a quiz attempt). Owner: Seetharam.
 * PROJECT_PLAN.md 6.1, plan tasks 1.6-1.9, contract ref_docs/02_INTEGRITY_CONTRACTS.md section 4.
 *
 * Mount it once per work page. It provides:
 *  - the editor hooks (useLockdown): paste, drop and copy decisions from the policy, large-insert reporting;
 *  - the session state (useLockdownState): locked, tab-switch count, full screen;
 *  - catch-all capture listeners on its root for inputs that aren't editors (G7), the right-click block and the
 *    question copy block;
 *  - tab and window switch tracking, the event queue to EduIntegrityEvent.logBatch, the watermark, the lock overlay
 *    and the corner notices.
 *
 * Offline sessions (context ids starting with `playground-` or `preview-`, or `offline`) decide allow or block but
 * send nothing. Events never carry pasted, copied or typed text: only lengths, hashes, counts and durations.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { IntegritySessionState } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { cn } from '@/lib/utils';

import { fetchSessionState } from './api';
import { hashClip, rememberCopy, setRegistryScope, wasCopiedInApp } from './clipboardRegistry';
import { IntegrityNotice } from './IntegrityNotice';
import { LockdownContext, LockdownStateContext } from './lockdownContext';
import { LockOverlay } from './LockOverlay';
import type { IntegrityHooks, LockdownProviderProps, LockdownState } from './types';
import { useEventQueue } from './useEventQueue';
import { useNotices } from './useNotices';
import { useScreenshotGuard } from './useScreenshotGuard';
import { useTabTracking } from './useTabTracking';
import { Watermark } from './Watermark';

const OFFLINE_PREFIXES = ['playground-', 'preview-'];
const INTERNAL_PASTE_THROTTLE_MS = 10_000;
const CONTEXT_MENU_THROTTLE_MS = 30_000;
const LOCK_POLL_MS = 20_000;
/** Editors report through the hooks themselves; the catch-all listeners skip them. */
const MANAGED_SELECTOR = '[data-integrity-managed], .cm-editor, .ProseMirror';
/** The question / instructions area (Keya's InstructionsPanel, later <ProtectedQuestion>). */
const QUESTION_SELECTOR = '[data-edu-question], [data-edu-protected-question]';

function closestFrom(node: Node | null | undefined, selector: string): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest(selector);
}

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && ['text', 'search', 'url', 'email', 'tel', 'password', 'number', ''].includes(target.type);
  }
  return target.isContentEditable;
}

/** The text selected for a copy: the input's selected range, or the page selection. */
function selectedText(target: EventTarget | null): string {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = target;
    if (selectionStart != null && selectionEnd != null && selectionEnd > selectionStart) {
      return value.slice(selectionStart, selectionEnd);
    }
  }
  return window.getSelection()?.toString() ?? '';
}

export function LockdownProvider({ policy, context, student, courseCode, canaryToken, offline: offlineProp, children }: LockdownProviderProps) {
  const { contextKind, contextId } = context;
  const offline = !!offlineProp || OFFLINE_PREFIXES.some((p) => contextId.startsWith(p));

  const [server, setServer] = useState<IntegritySessionState | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [localTabCount, setLocalTabCount] = useState(0);
  const [inFullscreen, setInFullscreen] = useState(() => !!document.fullscreenElement);
  const { notices, notify, dismiss } = useNotices();

  const queue = useEventQueue({ contextKind, contextId, offline, onState: setServer });
  const { push, flush, flushUnload, clientSessionId } = queue;

  const locked = !offline && !!server?.locked;
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // In-app copies are remembered per work session (hashes only).
  useEffect(() => {
    setRegistryScope(contextId);
  }, [contextId]);

  // Restore the server's lock state when the page loads.
  useEffect(() => {
    if (offline) {
      return undefined;
    }
    let cancelled = false;
    fetchSessionState(contextKind, contextId)
      .then((s) => {
        if (!cancelled) {
          setServer(s);
          setLoadedFor(contextId);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadedFor(contextId);
          notify('warning', 'Integrity session unavailable', eduErrorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [offline, contextKind, contextId, notify]);
  const ready = offline || loadedFor === contextId;

  // SESSION_START after mount (deferred, so StrictMode's mount-unmount-mount doesn't log a phantom session),
  // SESSION_END on pagehide or when the page is left inside the app.
  useEffect(() => {
    if (offline) {
      return undefined;
    }
    const startedAt = Date.now();
    let started = false;
    const timer = window.setTimeout(() => {
      started = true;
      push('SESSION_START', { note: `fullscreen=${document.fullscreenEnabled ? 'supported' : 'unsupported'}` }, { flush: true });
    }, 0);
    const end = (unload: boolean) => {
      if (!started) {
        return;
      }
      started = false;
      push('SESSION_END', { durationMs: Date.now() - startedAt });
      if (unload) {
        flushUnload();
      } else {
        void flush();
      }
    };
    const onPageHide = () => end(true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', onPageHide);
      end(false);
    };
  }, [offline, push, flush, flushUnload]);

  /* ---- editor hooks ------------------------------------------------------------------------------------------- */
  const pasteMode = policy.pasteMode ?? 'BLOCK_AND_LOG';
  const blockInternal = !!policy.blockInternalPaste;
  const largeInsertChars = policy.largeInsertChars ?? 80;
  const lastInternalPaste = useRef(0);

  const decide = useCallback(
    (text: string, how: 'paste' | 'drop'): boolean => {
      if (lockedRef.current) {
        return false;
      }
      const chars = text.length;
      const label = how === 'paste' ? 'Paste' : 'Drop';
      if (chars > 0 && wasCopiedInApp(text)) {
        if (blockInternal) {
          notify('warning', `${label} blocked`, 'Pasting is turned off for this work.');
          push(how === 'paste' ? 'PASTE_BLOCKED' : 'DROP_BLOCKED', { chars, contentHash: hashClip(text), note: 'internal' });
          return false;
        }
        const now = Date.now();
        if (how === 'paste' && now - lastInternalPaste.current >= INTERNAL_PASTE_THROTTLE_MS) {
          lastInternalPaste.current = now;
          push('PASTE_INTERNAL', { chars });
        }
        return true;
      }
      switch (pasteMode) {
        case 'ALLOW':
          return true;
        case 'LOG_ONLY':
          if (chars > 0) {
            push('PASTE_EXTERNAL_LOGGED', { chars, contentHash: hashClip(text), note: how === 'drop' ? 'drop' : undefined });
          }
          return true;
        case 'BLOCK':
          notify('warning', `${label} blocked`, 'Only text copied inside this work can be pasted here.');
          return false;
        default:
          notify('warning', `${label} blocked`, 'Only text copied inside this work can be pasted here. Your instructor can see blocked attempts.');
          if (chars > 0) {
            push(how === 'paste' ? 'PASTE_BLOCKED' : 'DROP_BLOCKED', { chars, contentHash: hashClip(text) });
          }
          return false;
      }
    },
    [blockInternal, pasteMode, notify, push]
  );

  const onCopy = useCallback((text: string) => rememberCopy(text), []);
  const onPaste = useCallback((text: string) => decide(text, 'paste'), [decide]);
  const onDrop = useCallback((text: string) => decide(text, 'drop'), [decide]);
  const onLargeInsert = useCallback(
    (chars: number) => {
      if (chars >= largeInsertChars) {
        push('LARGE_INSERT', { chars });
      }
    },
    [largeInsertChars, push]
  );
  const hooks = useMemo<IntegrityHooks>(() => ({ onCopy, onPaste, onDrop, onLargeInsert }), [onCopy, onPaste, onDrop, onLargeInsert]);

  /* ---- catch-all listeners on the root (G7), right-click and question copy -------------------------------------- */
  const allowContextMenu = !!policy.allowContextMenu;
  const allowCopyOfQuestion = !!policy.allowCopyOfQuestion;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    const managed = (t: EventTarget | null) => t instanceof Node && closestFrom(t, MANAGED_SELECTOR);
    let menuBlocked = 0;
    let menuLoggedAt = 0;

    const handlePaste = (e: ClipboardEvent) => {
      if (managed(e.target) || !isEditable(e.target)) {
        return;
      }
      if (!onPaste(e.clipboardData?.getData('text/plain') ?? '')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const handleDrop = (e: DragEvent) => {
      if (managed(e.target) || !isEditable(e.target)) {
        return;
      }
      if (!onDrop(e.dataTransfer?.getData('text/plain') ?? '')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const handleCopy = (e: ClipboardEvent) => {
      const text = selectedText(e.target);
      const fromQuestion =
        (e.target instanceof Node && closestFrom(e.target, QUESTION_SELECTOR)) || closestFrom(window.getSelection()?.anchorNode, QUESTION_SELECTOR);
      if (fromQuestion && !allowCopyOfQuestion) {
        e.preventDefault();
        push('COPY_BLOCKED', { chars: text.length });
        notify('info', 'Copying is turned off', "The question text can't be copied in this work.");
        return;
      }
      if (!managed(e.target)) {
        rememberCopy(text);
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (allowContextMenu) {
        return;
      }
      e.preventDefault();
      menuBlocked += 1;
      const now = Date.now();
      if (now - menuLoggedAt >= CONTEXT_MENU_THROTTLE_MS) {
        menuLoggedAt = now;
        push('CONTEXT_MENU_BLOCKED', { count: menuBlocked });
        menuBlocked = 0;
      }
    };

    root.addEventListener('paste', handlePaste, true);
    root.addEventListener('drop', handleDrop, true);
    root.addEventListener('copy', handleCopy, true);
    root.addEventListener('cut', handleCopy, true);
    root.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      root.removeEventListener('paste', handlePaste, true);
      root.removeEventListener('drop', handleDrop, true);
      root.removeEventListener('copy', handleCopy, true);
      root.removeEventListener('cut', handleCopy, true);
      root.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [onPaste, onDrop, allowContextMenu, allowCopyOfQuestion, push, notify]);

  /* ---- full screen (logging; the start screen comes in phase 3) ------------------------------------------------ */
  const requireFullscreen = !!policy.requireFullscreen;
  useEffect(() => {
    let exits = 0;
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setInFullscreen(fs);
      if (fs) {
        push('FULLSCREEN_ENTER');
      } else if (requireFullscreen) {
        exits += 1;
        push('FULLSCREEN_EXIT', { count: exits }, { flush: true });
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [requireFullscreen, push]);

  /* ---- tabs ------------------------------------------------------------------------------------------------------ */
  const tabSwitchCount = !offline && server ? (server.tabSwitchCount ?? 0) : localTabCount;
  const warnAt = server?.warnAt ?? policy.tabSwitchWarnAt;
  const lockAt = server?.lockAt ?? policy.tabSwitchLockAt;
  const warnInfo = useRef({ tabSwitchCount, warnAt, lockAt });
  useEffect(() => {
    warnInfo.current = { tabSwitchCount, warnAt, lockAt };
  }, [tabSwitchCount, warnAt, lockAt]);

  const onTabVisible = useCallback(() => {
    // The TAB_HIDDEN flush has usually returned by now, so the server count is current.
    const { tabSwitchCount: n, warnAt: w, lockAt: l } = warnInfo.current;
    if (w != null && w > 0 && n >= w) {
      const lockNote = l != null && l > n ? ` At ${l} your work will be locked until your instructor unlocks it.` : '';
      notify('warning', `You've left this page ${n} ${n === 1 ? 'time' : 'times'}`, `Your instructor can see this.${lockNote}`);
    }
  }, [notify]);
  useTabTracking({ enabled: !offline, push, onHidden: setLocalTabCount, onVisible: onTabVisible });

  /* ---- lock: freeze the work and poll until an instructor unlocks it -------------------------------------------- */
  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    if (locked) {
      content.setAttribute('inert', '');
    } else {
      content.removeAttribute('inert');
    }
  }, [locked]);

  useEffect(() => {
    if (!locked) {
      return undefined;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      fetchSessionState(contextKind, contextId)
        .then((s) => {
          if (!cancelled) {
            setServer(s);
          }
        })
        .catch(() => {
          // Keep polling; a temporary network error must not unlock or crash the page.
        });
    }, LOCK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [locked, contextKind, contextId]);

  /* ---- screenshots and printing (deterrent + log; see useScreenshotGuard) -------------------------------------- */
  const blockScreenshots = !!policy.blockScreenshots;
  const guard = useScreenshotGuard({ enabled: blockScreenshots, push, notify });
  const hiddenForCapture = guard.hidden && !locked;

  const onWatermarkTamper = useCallback(() => push('DEVTOOLS_SUSPECTED', { note: 'watermark-removed' }), [push]);

  const state = useMemo<LockdownState>(
    () => ({
      ready,
      locked,
      offline,
      fullscreenRequired: requireFullscreen,
      inFullscreen,
      fullscreenSupported: !!document.fullscreenEnabled,
      tabSwitchCount,
      warnAt,
      lockAt,
      screenshotsBlocked: blockScreenshots,
      screenshotAttempts: guard.screenshotAttempts,
      printAttempts: guard.printAttempts,
    }),
    [ready, locked, offline, requireFullscreen, inFullscreen, tabSwitchCount, warnAt, lockAt, blockScreenshots, guard.screenshotAttempts, guard.printAttempts]
  );

  return (
    <LockdownContext.Provider value={hooks}>
      <LockdownStateContext.Provider value={state}>
        <div ref={rootRef} data-lockdown-context={contextId} className="relative">
          <div
            ref={contentRef}
            aria-hidden={locked || undefined}
            data-capture-hidden={hiddenForCapture || undefined}
            className={cn(
              locked && 'pointer-events-none select-none blur-sm',
              hiddenForCapture && 'select-none blur-lg transition-[filter] duration-150',
              blockScreenshots && 'print:hidden'
            )}
          >
            {children}
          </div>
          {hiddenForCapture ? (
            <div
              role="status"
              data-testid="capture-shield"
              className="pointer-events-none absolute inset-0 z-[var(--z-lock-overlay,40)] flex items-center justify-center"
            >
              <span className="rounded-lg border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-page)] px-4 py-2 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)] shadow">
                Your work is hidden while this window is not in focus. Click here to continue.
              </span>
            </div>
          ) : null}
          {blockScreenshots ? (
            <p className="hidden print:block p-8 text-center">Printing this work is not allowed. The attempt has been logged.</p>
          ) : null}
        </div>
        {locked ? <LockOverlay tabSwitchCount={tabSwitchCount} /> : null}
        {policy.hideWatermark ? null : (
          <Watermark
            student={student}
            courseCode={courseCode}
            aiNotice={policy.watermarkAiNotice}
            canaryToken={policy.canaryEnabled ? canaryToken : undefined}
            sessionId={clientSessionId}
            onTamper={offline ? undefined : onWatermarkTamper}
          />
        )}
        <IntegrityNotice notices={notices} onDismiss={dismiss} />
      </LockdownStateContext.Provider>
    </LockdownContext.Provider>
  );
}
