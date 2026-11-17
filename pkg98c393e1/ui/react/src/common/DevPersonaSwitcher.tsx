/*
 * Dev persona switcher in the top bar. Owner: Shreya. Shown only while the `devPersonas` flag is on.
 * The server checks that the real caller is an Edu admin (EduSession.setDevPersona).
 */
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { fetchPersonas, setDevPersona } from './api';
import { useFeatureFlag, useMe } from './auth/useMe';
import { queryKeys } from './queryKeys';
import { routes } from './routes';

export function DevPersonaSwitcher() {
  const { me } = useMe();
  const enabled = useFeatureFlag('devPersonas');
  const canSwitch = enabled && (me?.personaActive || me?.platformRole === 'ADMIN');
  const personas = useQuery({ queryKey: queryKeys.personas(), queryFn: fetchPersonas, enabled: Boolean(canSwitch) });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { reportError } = useErrorBoundary();

  if (!canSwitch || !me) {
    return null;
  }

  const switchTo = async (personaId: string | null) => {
    try {
      await setDevPersona(personaId);
      await queryClient.invalidateQueries({ queryKey: ['edu'] });
      navigate(routes.home);
    } catch (err) {
      reportError(err);
    }
  };

  const label = me.personaActive ? `Acting as ${me.displayName ?? me.userId}` : 'Act as…';

  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger>
        <Button variant="outline" appearance="secondary" size="sm" leadingIcon={<UserRound />} trailingIcon={<ChevronDown />}>
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuLabel>Dev personas</DropdownMenuLabel>
      {me.personaActive ? <DropdownMenuItem label="Back to my own account" onSelect={() => switchTo(null)} /> : null}
      {me.personaActive ? <DropdownMenuSeparator /> : null}
      {(personas.data ?? []).map((p) => (
        <DropdownMenuItem key={p.id} label={p.displayName} subLabel={p.platformRole} onSelect={() => switchTo(p.id)} />
      ))}
    </DropdownMenu>
  );
}
