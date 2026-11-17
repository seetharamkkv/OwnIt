/*
 * Screenshot and print deterrence for a work session. Owner: Seetharam. Policy field: blockScreenshots.
 *
 * A browser cannot stop an operating-system screenshot (Win+Shift+S, Cmd+Shift+4, a phone camera). What it can do:
 *  - Print Screen: the key reaches the page as a `keyup`. We clear the clipboard (the OS has just filled it with the
 *    capture), hide the work for a moment, show a notice and log SCREENSHOT_ATTEMPT.
 *  - Shortcut screenshots that the OS does deliver (Ctrl/Cmd+Shift+S in some browsers and extensions) are treated
 *    the same way.
 *  - Printing and "save page" (Ctrl/Cmd+P, Ctrl/Cmd+S, the browser's print command via `beforeprint`): cancelled,
 *    the printed page is blank (see the `print:` classes on LockdownProvider's content), logged as PRINT_BLOCKED.
 *  - Focus loss: while the window does not have focus the work is hidden. Snipping tools take focus before they
 *    capture, so what they get is the blurred page.
 *
 * Exposed to LockdownProvider as a `hidden` flag (apply a blur class) plus the counts for the "This session" card.
 */
import { useEffect, useRef, useState } from 'react';

import type { EventQueue } from './useEventQueue';
import type { Notify } from './useNotices';

/** How long the work stays hidden after a Print Screen press. */
export const SCREENSHOT_HIDE_MS = 1_500;

export interface ScreenshotGuardOptions {
  enabled: boolean;
  push: EventQueue['push'];
  notify: Notify;
}

export interface ScreenshotGuardState {
  /** True while the content should be hidden (window not focused, or just after a screenshot key). */
  hidden: boolean;
  screenshotAttempts: number;
  printAttempts: number;
}

/** True for the key combinations treated as a screenshot or print attempt. */
export function classifyKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): 'screenshot' | 'print' | null {
  if (e.key === 'PrintScreen') {
    return 'screenshot';
  }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    return null;
  }
  const k = e.key.toLowerCase();
  if (k === 'p') {
    return 'print';
  }
  if (k === 's') {
    // Ctrl/Cmd+Shift+S is a screenshot shortcut in several browsers and extensions; plain Ctrl/Cmd+S saves the page.
    return e.shiftKey ? 'screenshot' : 'print';
  }
  return null;
}

/** Best-effort: overwrite whatever the OS just put on the clipboard. Fails silently when the API is unavailable. */
export function clearClipboard(): Promise<void> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clip || typeof clip.writeText !== 'function') {
    return Promise.resolve();
  }
  return clip.writeText('').catch(() => undefined);
}

export function useScreenshotGuard({ enabled, push, notify }: ScreenshotGuardOptions): ScreenshotGuardState {
  const [focused, setFocused] = useState(() => (typeof document === 'undefined' ? true : document.hasFocus()));
  const [flash, setFlash] = useState(false);
  const [screenshotAttempts, setScreenshotAttempts] = useState(0);
  const [printAttempts, setPrintAttempts] = useState(0);

  const handlers = useRef({ push, notify });
  useEffect(() => {
    handlers.current = { push, notify };
  }, [push, notify]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let shots = 0;
    let prints = 0;
    let flashTimer: number | undefined;

    const onScreenshot = (how: string) => {
      shots += 1;
      setScreenshotAttempts(shots);
      void clearClipboard();
      setFlash(true);
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => setFlash(false), SCREENSHOT_HIDE_MS);
      handlers.current.push('SCREENSHOT_ATTEMPT', { count: shots, note: how }, { flush: true });
      handlers.current.notify('warning', 'Screenshots are not allowed', 'This attempt was logged and the clipboard was cleared. Your instructor can see it.');
    };
    const onPrint = (how: string) => {
      prints += 1;
      setPrintAttempts(prints);
      handlers.current.push('PRINT_BLOCKED', { count: prints, note: how });
      handlers.current.notify('warning', 'Printing is turned off', 'This work cannot be printed or saved as a page. The attempt was logged.');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const kind = classifyKey(e);
      if (kind === 'print' || (kind === 'screenshot' && e.key !== 'PrintScreen')) {
        e.preventDefault();
        e.stopPropagation();
        if (kind === 'print') {
          onPrint(e.key.toLowerCase() === 's' ? 'save-shortcut' : 'print-shortcut');
        } else {
          onScreenshot('shortcut');
        }
      }
    };
    // Print Screen is only reliably delivered on keyup.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        onScreenshot('print-screen');
      }
    };
    const onBeforePrint = () => onPrint('browser-print');
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.clearTimeout(flashTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  return { hidden: enabled && (flash || !focused), screenshotAttempts, printAttempts };
}
