/*
 * Home page: who you are and your courses. Owner: Shreya.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Spinner } from '@/components/ui/spinner';

import { useMe } from '@/common/auth/useMe';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { routes } from '@/common/routes';
import { StudentDashboard } from '@/features/workspace/StudentDashboard';

export default function HomePage() {
  const { me, loading, error } = useMe();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (error || !me) {
    return <PageMessage title="Could not load your profile" message={eduErrorMessage(error)} />;
  }

  const courses = me.courses ?? [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
          Welcome, {me.displayName ?? me.userId}
        </h1>
        <Badge variant="soft" appearance="accent">
          {me.platformRole}
        </Badge>
        {me.personaActive ? (
          <Badge variant="outline" appearance="warning">
            Dev persona
          </Badge>
        ) : null}
      </div>

      {me.platformRole === 'ADMIN' ? (
        <Container title="Administration" subtitle="Users, courses, integrity policy, audit log">
          <Button variant="solid" appearance="accent" onClick={() => navigate(routes.admin())}>
            Open admin console
          </Button>
        </Container>
      ) : null}

      {courses.some((c) => c.courseRole === 'STUDENT') ? <StudentDashboard /> : null}

      <Container title="My courses" subtitle={courses.length ? `${courses.length} active` : 'No active enrollments'}>
        {courses.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            {"You're not enrolled in any course yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {courses.map((c) => (
              <li key={c.courseId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] pb-2">
                <div className="flex flex-col">
                  <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{c.courseCode}</span>
                  <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{c.courseTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" appearance="primary">
                    {c.courseRole}
                  </Badge>
                  <Button variant="outline" appearance="secondary" size="sm" onClick={() => navigate(routes.course(c.courseId))}>
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}
