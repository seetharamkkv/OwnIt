/*
 * OwnIt student shell ("Stepwise" dark theme): top bar with Home / Courses / Grades, the term pill, and the user menu.
 * Mockup boards 1–3 (resource/mockups/STUDENT_UI_MOCKUPS.md). Owner: Shreya (shell).
 * Used for students (and admins acting as a student persona); staff keep the SideNav shell in App.tsx.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';

import { useMe } from '@/common/auth/useMe';
import { DevPersonaSwitcher } from '@/common/DevPersonaSwitcher';
import { APP_NAME, OwnItLogo } from '@/common/OwnItLogo';
import { routes } from '@/common/routes';

import { initials } from './ui';

const NAV = [
  { label: 'Home', to: routes.home, match: (p: string) => p === '/' },
  { label: 'Courses', to: routes.courses, match: (p: string) => p.startsWith('/courses') || p.startsWith('/course/') },
  { label: 'Grades', to: routes.grades, match: (p: string) => p.startsWith('/grades') },
];

export function StudentShell({ children, term }: { children: React.ReactNode; term?: string }) {
  const { me } = useMe();
  const { pathname } = useLocation();

  return (
    <div className="stepwise flex min-h-full flex-col font-[Inter,system-ui,sans-serif] text-[14px]">
      <header className="border-b border-[var(--sw-border)]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-5 px-6 py-2.5">
          <Link to={routes.home} className="flex items-center gap-2.5 !text-[var(--sw-fg)] no-underline">
            <OwnItLogo size={28} />
            <span className="text-[16px] font-semibold">{APP_NAME}</span>
          </Link>
          {term ? (
            <span className="rounded-full border border-[var(--sw-border-strong)] px-2.5 py-[3px] text-[12px] text-[var(--sw-fg-muted)]">{term}</span>
          ) : null}
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={`sw-nav rounded-lg px-3.5 py-3 font-medium no-underline ${
                    active ? '!text-[var(--sw-fg)] bg-[var(--sw-row-hover)]' : '!text-[var(--sw-fg-muted)]'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <DevPersonaSwitcher />
            <button
              type="button"
              aria-label="Notifications"
              className="flex size-11 items-center justify-center rounded-lg text-[var(--sw-fg-muted)] hover:bg-[var(--sw-row-hover)]"
            >
              <Bell className="size-[18px]" />
            </button>
            <div className="flex h-11 items-center gap-2 px-2.5 text-[var(--sw-fg-2)]">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#2a2540] text-[12px] font-semibold text-[var(--sw-accent-soft)]">
                {initials(me?.displayName)}
              </span>
              <span>{me?.displayName ?? '…'}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
