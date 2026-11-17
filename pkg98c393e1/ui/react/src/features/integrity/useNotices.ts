/*
 * Notice state for LockdownProvider: the list to render and a stable notify function. Owner: Seetharam.
 * Auto-dismissed after 4 s, at most 3 at once, the same title at most once per 2 s.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { IntegrityNoticeItem } from './types';

const DISMISS_MS = 4_000;
const MAX_VISIBLE = 3;
/** The same title within this window is shown once (a held Ctrl+V fires many pastes). */
const DEDUPE_MS = 2_000;

export type Notify = (tone: IntegrityNoticeItem['tone'], title: string, message?: string) => void;

/** Notice state for the provider: the list to render and a stable notify function. */
export function useNotices(): { notices: IntegrityNoticeItem[]; notify: Notify; dismiss: (id: number) => void } {
  const [notices, setNotices] = useState<IntegrityNoticeItem[]>([]);
  const nextId = useRef(1);
  const lastShown = useRef<Record<string, number>>({});
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  const notify = useCallback<Notify>(
    (tone, title, message) => {
      const now = Date.now();
      if (now - (lastShown.current[title] ?? 0) < DEDUPE_MS) {
        return;
      }
      lastShown.current[title] = now;
      const id = nextId.current;
      nextId.current += 1;
      setNotices((list) => [...list, { id, tone, title, message }].slice(-MAX_VISIBLE));
      timers.current.push(window.setTimeout(() => dismiss(id), DISMISS_MS));
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  return { notices, notify, dismiss };
}
