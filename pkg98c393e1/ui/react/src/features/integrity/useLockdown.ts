/*
 * Integrity callbacks for an editor. Owner: Seetharam. Outside a LockdownProvider everything is allowed.
 */
import { useContext } from 'react';

import { LockdownContext } from './lockdownContext';
import type { IntegrityHooks } from './types';

export function useLockdown(): IntegrityHooks {
  return useContext(LockdownContext);
}
