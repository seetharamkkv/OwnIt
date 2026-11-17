/*
 * Course integrity dashboard (/course/:courseId/integrity). Owner: Seetharam. PROJECT_PLAN.md 6.5.
 */
import React from 'react';

import { ScaffoldPage } from '@/common/ScaffoldPage';

export default function IntegrityDashboardPage() {
  return (
    <ScaffoldPage
      title="Integrity dashboard"
      owner="Seetharam — Integrity"
      planSection="section 6.5"
      todo={[
        'Table from fetchCourseReport(courseId): blocked pastes, tab-away time, full-screen exits, canary hits, risk score',
        'Sort by risk; open a student to see IntegrityTimeline',
        'Unlock a frozen session (releaseLock)',
      ]}
    />
  );
}
