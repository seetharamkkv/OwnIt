/*
 * Loads the current user once and shares it. Owner: Shreya. Hooks live in ./useMe.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api';
import { queryKeys } from '../queryKeys';
import { MeContext, MeContextValue } from './meContext';

export function MeProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({ queryKey: queryKeys.me(), queryFn: fetchMe, staleTime: 60_000 });
  const value = useMemo<MeContextValue>(
    () => ({ me: query.data ?? null, loading: query.isLoading, error: query.error }),
    [query.data, query.isLoading, query.error]
  );
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}
