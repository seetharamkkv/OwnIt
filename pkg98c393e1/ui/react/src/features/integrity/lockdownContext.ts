/*
 * Lockdown context objects and their outside-a-provider defaults. Owner: Seetharam.
 * Two contexts so that a state change (tab count, lock) doesn't re-render editors that only use the hooks.
 */
import { createContext } from 'react';

import type { IntegrityHooks, LockdownState } from './types';

export const ALLOW_ALL: IntegrityHooks = {
  onCopy: () => undefined,
  onPaste: () => true,
  onDrop: () => true,
  onLargeInsert: () => undefined,
};

export const LockdownContext = createContext<IntegrityHooks>(ALLOW_ALL);

export const UNLOCKED_STATE: LockdownState = {
  ready: true,
  locked: false,
  offline: true,
  fullscreenRequired: false,
  inFullscreen: false,
  fullscreenSupported: false,
  tabSwitchCount: 0,
  screenshotsBlocked: false,
  screenshotAttempts: 0,
  printAttempts: 0,
};

export const LockdownStateContext = createContext<LockdownState>(UNLOCKED_STATE);
