/*
 * Current-user context object. Owner: Shreya. Use the hooks in ./useMe and the provider in ./MeProvider.
 */
import { createContext } from 'react';

import type { EduMe } from '../eduTypes';

export interface MeContextValue {
  me: EduMe | null;
  loading: boolean;
  error: unknown;
}

export const MeContext = createContext<MeContextValue>({ me: null, loading: true, error: null });
