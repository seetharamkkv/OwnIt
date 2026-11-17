/*
 * Admin console. Owner: Shreya. Sections: PROJECT_PLAN.md section 3 ("Admin console").
 * `/admin/integrity` embeds Seetharam's components.
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ADMIN_SECTIONS, AdminSectionKey, routes } from '@/common/routes';
import { ScaffoldPage } from '@/common/ScaffoldPage';

const SECTION_TODO: Record<AdminSectionKey, string[]> = {
  overview: ['Metric cards from EduAdmin.platformStats()', 'Integrity flags in the last 7 days', 'Test runs per day chart'],
  users: ['EduUserProfile table with search and paging', 'Change platform role (EduUserProfile#setPlatformRole)', 'Deactivate', 'CSV import'],
  courses: ['Create / archive courses (EduCourse CRUD)', 'Assign instructors (EduEnrollment.bulkEnroll)', 'Enrollment counts'],
  policy: ['Edit EduPlatformConfig.defaultPolicy', 'Padlock per field → EduPlatformConfig.lockedPolicyFields', 'Preview effective policy'],
  integrity: ['EduIntegrityEvent.platformReport() table (Seetharam API)', 'Drill into a course dashboard'],
  audit: ['EduAuditLog.fetch with filters: actor, action, course, date', 'Before/after diff'],
  privacy: ['Retention days (EduPlatformConfig.integrityRetentionDays)', 'EduAdmin.exportCourseData', 'EduAdmin.deleteStudentData with confirm'],
  system: ['Feature flags (EduPlatformConfig.featureFlags)', 'Storage use', 'Test runner status'],
};

export default function AdminPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const active: AdminSectionKey = ADMIN_SECTIONS.some((s) => s.key === section) ? (section as AdminSectionKey) : 'overview';
  const label = ADMIN_SECTIONS.find((s) => s.key === active)?.label ?? 'Overview';

  return (
    <div className="flex flex-col">
      <div className="px-6 pt-6">
        <Tabs variant="bordered" value={active} onValueChange={(v) => navigate(routes.admin(v))}>
          <TabsList>
            {ADMIN_SECTIONS.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ScaffoldPage title={`Admin · ${label}`} owner="Shreya — Core & admin" planSection="section 3" todo={SECTION_TODO[active]} />
    </div>
  );
}
