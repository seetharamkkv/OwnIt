/*
 * React Query key table. Owner: Shreya. Pattern: ['edu', area, entity, id?, params?] (PROJECT_PLAN.md 12.3).
 * Add your area's keys here; a mutation invalidates the keys it changes.
 */
export const queryKeys = {
  me: () => ['edu', 'core', 'me'] as const,
  courses: () => ['edu', 'core', 'courses'] as const,
  course: (courseId: string) => ['edu', 'core', 'course', courseId] as const,
  myPermissions: (courseId: string) => ['edu', 'core', 'myPermissions', courseId] as const,
  personas: () => ['edu', 'core', 'personas'] as const,
  adminStats: () => ['edu', 'admin', 'stats'] as const,
  auditLog: (params: Record<string, unknown>) => ['edu', 'admin', 'auditLog', params] as const,

  assignment: (assignmentId: string) => ['edu', 'authoring', 'assignment', assignmentId] as const,
  assignmentSteps: (assignmentId: string) => ['edu', 'authoring', 'steps', assignmentId] as const,

  myAssignments: (courseId: string) => ['edu', 'workspace', 'myAssignments', courseId] as const,
  myDashboard: () => ['edu', 'workspace', 'myDashboard'] as const,
  mySubmission: (assignmentId: string) => ['edu', 'workspace', 'submission', assignmentId] as const,

  policy: (contextKind: string, contextId: string) => ['edu', 'integrity', 'policy', contextKind, contextId] as const,
  integrityReport: (courseId: string) => ['edu', 'integrity', 'courseReport', courseId] as const,
  integrityTimeline: (contextId: string) => ['edu', 'integrity', 'timeline', contextId] as const,
  integritySession: (contextKind: string, contextId: string) => ['edu', 'integrity', 'session', contextKind, contextId] as const,
  integrityStudentContexts: (courseId: string, personId: string) => ['edu', 'integrity', 'studentContexts', courseId, personId] as const,
  integrityPlatform: (since: string) => ['edu', 'integrity', 'platformReport', since] as const,
  policyEditor: (level: string, levelId: string) => ['edu', 'integrity', 'policyEditor', level, levelId] as const,

  visibleTests: (assignmentId: string) => ['edu', 'testing', 'visibleTests', assignmentId] as const,
  stepTests: (stepId: string) => ['edu', 'testing', 'stepTests', stepId] as const,
  gradebook: (courseId: string) => ['edu', 'grading', 'gradebook', courseId] as const,
  myQuizzes: (courseId: string) => ['edu', 'quiz', 'myQuizzes', courseId] as const,
  myQuiz: (quizId: string) => ['edu', 'quiz', 'myQuiz', quizId] as const,
  quizPaper: (quizId: string) => ['edu', 'quiz', 'paper', quizId] as const,
  quizResult: (attemptId: string) => ['edu', 'quiz', 'result', attemptId] as const,
  courseQuizzes: (courseId: string) => ['edu', 'quiz', 'courseQuizzes', courseId] as const,
  quizForEdit: (quizId: string) => ['edu', 'quiz', 'forEdit', quizId] as const,
  quizQuestions: (quizId: string) => ['edu', 'quiz', 'questions', quizId] as const,
  quizQuestionTests: (questionId: string) => ['edu', 'quiz', 'questionTests', questionId] as const,
  quizAttempts: (quizId: string) => ['edu', 'quiz', 'attempts', quizId] as const,
  quizReview: (attemptId: string) => ['edu', 'quiz', 'review', attemptId] as const,
};
