/*
 * Tab and window switch tracking. Owner: Seetharam. Plan task 1.7.
 *
 * - visibilitychange → hidden: TAB_HIDDEN {count} and an immediate flush (the server may lock the session).
 * - visibilitychange → visible: TAB_VISIBLE {durationMs away}.
 * - blur/focus while the tab stays visible (another app on top) for 2 s or more: WINDOW_BLUR {durationMs},
 *   at most once per 30 s. A blur caused by focus moving into an iframe inside the page is ignored.
 */
import { useEffect, useRef } from 'react';

import type { EventQueue } from './useEventQueue';

const BLUR_MIN_MS = 2_000;
const BLUR_THROTTLE_MS = 30_000;

interface UseTabTrackingOptions {
  enabled: boolean;
  push: EventQueue['push'];
  /** Called with this page's switch count each time the tab is hidden. */
  onHidden: (localCount: number) => void;
  /** Called when the student comes back to the tab. */
  onVisible: (awayMs: number) => void;
}

export function useTabTracking({ enabled, push, onHidden, onVisible }: UseTabTrackingOptions): void {
  const handlers = useRef({ push, onHidden, onVisible });
  useEffect(() => {
    handlers.current = { push, onHidden, onVisible };
  }, [push, onHidden, onVisible]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let count = 0;
    let hiddenAt: number | null = null;
    let blurAt: number | null = null;
    let lastBlurLogged = 0;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        count += 1;
        hiddenAt = Date.now();
        blurAt = null;
        handlers.current.push('TAB_HIDDEN', { count }, { flush: true });
        handlers.current.onHidden(count);
      } else if (hiddenAt !== null) {
        const awayMs = Date.now() - hiddenAt;
        hiddenAt = null;
        handlers.current.push('TAB_VISIBLE', { durationMs: awayMs });
        handlers.current.onVisible(awayMs);
      }
    };

    const onBlur = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      // Focus moved into an iframe inside the page, not to another app.
      window.setTimeout(() => {
        if (document.activeElement?.tagName !== 'IFRAME') {
          blurAt = Date.now();
        }
      }, 0);
    };

    const onFocus = () => {
      if (blurAt === null) {
        return;
      }
      const now = Date.now();
      const away = now - blurAt;
      blurAt = null;
      if (away >= BLUR_MIN_MS && now - lastBlurLogged >= BLUR_THROTTLE_MS) {
        lastBlurLogged = now;
        handlers.current.push('WINDOW_BLUR', { durationMs: away });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
}
