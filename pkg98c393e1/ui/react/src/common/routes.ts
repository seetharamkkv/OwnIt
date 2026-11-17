/*
 * Route paths and builders. Owner: Shreya. Page owners are listed in PROJECT_PLAN.md 12.6.
 * Register new pages in App.tsx; build links with these helpers instead of string literals.
 */
export const routes = {
  home: '/',
  courses: '/courses',
  grades: '/grades',
  course: (courseId = ':courseId') => `/course/${courseId}`,
  assignmentNew: (courseId = ':courseId') => `/course/${courseId}/assignments/new`,
  assignmentEdit: (courseId = ':courseId', assignmentId = ':assignmentId') =>
    `/course/${courseId}/assignments/${assignmentId}/edit`,
  submissionViewer: (courseId = ':courseId', submissionId = ':submissionId') =>
    `/course/${courseId}/submissions/${submissionId}`,
  integrity: (courseId = ':courseId') => `/course/${courseId}/integrity`,
  gradebook: (courseId = ':courseId') => `/course/${courseId}/gradebook`,
  quizNew: (courseId = ':courseId') => `/course/${courseId}/quizzes/new`,
  quizEdit: (courseId = ':courseId', quizId = ':quizId') => `/course/${courseId}/quizzes/${quizId}/edit`,
  quizAttempts: (courseId = ':courseId', quizId = ':quizId') => `/course/${courseId}/quizzes/${quizId}/attempts`,
  workspace: (assignmentId = ':assignmentId') => `/assignment/${assignmentId}`,
  workspacePreview: (assignmentId = ':assignmentId') => `/assignment/${assignmentId}/preview`,
  quizTake: (quizId = ':quizId') => `/quiz/${quizId}`,
  admin: (section = '') => (section ? `/admin/${section}` : '/admin'),
};

/** Admin console sections, in menu order (PROJECT_PLAN.md section 3). */
export const ADMIN_SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'courses', label: 'Courses' },
  { key: 'policy', label: 'Integrity policy' },
  { key: 'integrity', label: 'Integrity overview' },
  { key: 'audit', label: 'Audit log' },
  { key: 'privacy', label: 'Data & privacy' },
  { key: 'system', label: 'System & flags' },
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]['key'];
