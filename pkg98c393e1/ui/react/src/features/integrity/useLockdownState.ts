/*
 * Session state for work pages (locked, tab-switch count, full screen). Owner: Seetharam.
 * Outside a LockdownProvider the session is never locked.
 */
import { useContext } from 'react';

import { LockdownStateContext } from './lockdownContext';
import type { LockdownState } from './types';

export function useLockdownState(): LockdownState {
  return useContext(LockdownStateContext);
}
