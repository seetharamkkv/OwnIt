/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SideNav from './components/SideNav/SideNav';
import TopNav from './components/TopNav/TopNav';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';

import { MeProvider } from '@/common/auth/MeProvider';
import { RequireRole } from '@/common/auth/RequireRole';
import { useMe } from '@/common/auth/useMe';
import { DevPersonaSwitcher } from '@/common/DevPersonaSwitcher';
import { PageMessage } from '@/common/PageMessage';
import { routes } from '@/common/routes';
import { APP_NAME, OwnItLogo } from '@/common/OwnItLogo';
import { StudentShell } from '@/common/stepwise/StudentShell';

import AdminPage from '@/features/admin/AdminPage';
import AssignmentBuilderPage from '@/features/authoring/AssignmentBuilderPage';
import SubmissionViewerPage from '@/features/authoring/SubmissionViewerPage';
import CourseHomePage from '@/features/courses/CourseHomePage';
import CoursesPage from '@/features/courses/CoursesPage';
import StudentCoursesPage from '@/features/courses/StudentCoursesPage';
import GradebookPage from '@/features/grading/GradebookPage';
import StudentGradesPage from '@/features/grading/StudentGradesPage';
import HomePage from '@/features/home/HomePage';
import StudentHomePage from '@/features/home/StudentHomePage';
import IntegrityDashboardPage from '@/features/integrity/IntegrityDashboardPage';
import QuizAttemptsPage from '@/features/quiz/QuizAttemptsPage';
import QuizBuilderPage from '@/features/quiz/QuizBuilderPage';
import QuizTakePage from '@/features/quiz/QuizTakePage';
import StepWorkspacePage from '@/features/workspace/StepWorkspacePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const STAFF = ['INSTRUCTOR', 'TA'] as const;

/**
 * Application shell. Students (and admins acting as a student persona) get the Stepwise top-nav shell from the
 * Student UI mockups; staff and admins keep the TopNav + SideNav shell. Routes only swap <main>.
 * Route owners: PROJECT_PLAN.md section 12.6. Shreya owns this file; send small PRs to add routes.
 */
export default function App() {
  return (
    <ErrorReporterProvider>
      <QueryClientProvider client={queryClient}>
        <MeProvider>
          <Shell />
        </MeProvider>
      </QueryClientProvider>
    </ErrorReporterProvider>
  );
}

function Shell() {
  const { me } = useMe();
  if (me?.platformRole === 'STUDENT') {
    return (
      <div className="h-screen overflow-auto">
        <StudentShell>
          <Routes>
            <Route path={routes.home} element={<StudentHomePage />} />
            <Route path={routes.courses} element={<StudentCoursesPage />} />
            <Route path={routes.course()} element={<CourseHomePage />} />
            <Route path={routes.grades} element={<StudentGradesPage />} />
            <Route path={routes.workspace()} element={<StepWorkspacePage mode="student" />} />
            <Route path={routes.quizTake()} element={<QuizTakePage />} />
            <Route path="*" element={<PageMessage title="Page not found" />} />
          </Routes>
        </StudentShell>
      </div>
    );
  }
  return (
    <div className="h-screen flex flex-col max-w-full overflow-hidden">
      <TopNav title={APP_NAME} logo={<OwnItLogo size={20} mono />} actions={<DevPersonaSwitcher />} />
      <div className="flex flex-1 min-h-0">
        <SideNav />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-auto bg-[var(--c3-style-basic-bg-page)]">
            <Routes>
              {/* Shreya */}
              <Route path={routes.home} element={<HomePage />} />
              <Route path={routes.courses} element={<CoursesPage />} />
              <Route path={routes.course()} element={<CourseHomePage />} />
              <Route path="/admin" element={<RequireRole platform={['ADMIN']}><AdminPage /></RequireRole>} />
              <Route path="/admin/:section" element={<RequireRole platform={['ADMIN']}><AdminPage /></RequireRole>} />

              {/* Rohith */}
              <Route path={routes.assignmentNew()} element={<RequireRole course={[...STAFF]}><AssignmentBuilderPage /></RequireRole>} />
              <Route path={routes.assignmentEdit()} element={<RequireRole course={[...STAFF]}><AssignmentBuilderPage /></RequireRole>} />
              <Route path={routes.submissionViewer()} element={<RequireRole course={[...STAFF]}><SubmissionViewerPage /></RequireRole>} />

              {/* Keya */}
              <Route path={routes.workspace()} element={<StepWorkspacePage mode="student" />} />
              <Route path={routes.workspacePreview()} element={<StepWorkspacePage mode="preview" />} />

              {/* Seetharam */}
              <Route path={routes.integrity()} element={<RequireRole course={[...STAFF]}><IntegrityDashboardPage /></RequireRole>} />

              {/* Shreenidhi */}
              <Route path={routes.gradebook()} element={<RequireRole course={[...STAFF]}><GradebookPage /></RequireRole>} />
              <Route path={routes.quizNew()} element={<RequireRole course={[...STAFF]}><QuizBuilderPage /></RequireRole>} />
              <Route path={routes.quizEdit()} element={<RequireRole course={[...STAFF]}><QuizBuilderPage /></RequireRole>} />
              <Route path={routes.quizAttempts()} element={<RequireRole course={[...STAFF]}><QuizAttemptsPage /></RequireRole>} />
              <Route path={routes.quizTake()} element={<QuizTakePage />} />

              <Route path="*" element={<PageMessage title="Page not found" />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}
