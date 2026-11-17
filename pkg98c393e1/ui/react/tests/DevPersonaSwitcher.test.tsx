/*
 * Regression check for the "Act as…" menu: with React 18 the trigger Button must forward its ref, otherwise Radix
 * cannot anchor the popover and the menu never becomes visible. Renders the real components with the API mocked.
 */
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ErrorReporterProvider from '@/components/ErrorBoundary/ErrorBoundary';
import { Button } from '@/components/ui/button';

import { DevPersonaSwitcher } from '@/common/DevPersonaSwitcher';
import { MeContext } from '@/common/auth/meContext';
import type { EduMe } from '@/common/eduTypes';

const c3CallMock = jest.fn(async (type: string, action: string) => {
  if (type === 'EduUserProfile' && action === 'fetch') {
    return { objs: [{ id: 'seed_user_student01', displayName: 'Sam Student', platformRole: 'STUDENT' }] };
  }
  return null;
});
jest.mock('@/c3Action', () => ({ c3Call: (...args: unknown[]) => c3CallMock(...(args as [string, string])) }));

const me: EduMe = {
  userId: 'admin',
  realUserId: 'admin',
  displayName: 'Admin',
  platformRole: 'ADMIN',
  personaActive: false,
  courses: [],
  enabledFlags: ['devPersonas'],
};

function renderSwitcher() {
  const qc = new QueryClient();
  return render(
    <ErrorReporterProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <MeContext.Provider value={{ me, loading: false, error: null }}>
            <DevPersonaSwitcher />
          </MeContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ErrorReporterProvider>
  );
}

describe('Button', () => {
  it('forwards its ref (React 18), which Radix triggers need to anchor their menus', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Act as…</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('DevPersonaSwitcher', () => {
  it('opens the persona menu when the trigger is clicked', async () => {
    renderSwitcher();
    const trigger = await screen.findByRole('button', { name: /act as/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByText('Dev personas')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Sam Student')).toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('switches the persona when an item is chosen', async () => {
    renderSwitcher();
    const trigger = await screen.findByRole('button', { name: /act as/i });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    fireEvent.click(trigger);
    const item = await screen.findByText('Sam Student');
    fireEvent.click(item);
    await waitFor(() =>
      expect(c3CallMock).toHaveBeenCalledWith('EduSession', 'setDevPersona', null, ['seed_user_student01'])
    );
  });
});
