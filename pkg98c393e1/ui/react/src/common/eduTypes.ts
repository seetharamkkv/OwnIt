/*
 * Shared TypeScript mirrors of the Edu* C3 types. Field names match the .c3typ files exactly.
 * Owner: Shreya. Each owner updates their own types here in the same PR as the .c3typ change.
 * Enum values on the wire are the UPPER_SNAKE constant names, e.g. 'BLOCK_AND_LOG'.
 */

/** Reference to another record as the API returns it without includes. */
export interface Ref {
  id: string;
}

// ---- Core (Shreya) ----------------------------------------------------------------------------------------------
export type PlatformRole = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
export type CourseRole = 'INSTRUCTOR' | 'TA' | 'STUDENT';
export type EnrollmentStatus = 'ACTIVE' | 'DROPPED';
/** Privileged course actions; instructors hold all of them, TAs hold the course's `taPermissions` set. */
export type CoursePermission =
  | 'EDIT_CONTENT'
  | 'PUBLISH_CONTENT'
  | 'EDIT_GRADES'
  | 'RELEASE_GRADES'
  | 'GRANT_EXTENSIONS'
  | 'VIEW_INTEGRITY'
  | 'RELEASE_LOCKS'
  | 'MANAGE_ENROLLMENT';
export type FeatureFlag = 'quizzes' | 'notebooks' | 'docx' | 'forum' | 'serverTests' | 'devPersonas';

export interface EduUserProfile {
  id: string;
  displayName: string;
  email?: string;
  studentNumber?: string;
  platformRole: PlatformRole;
  deactivated?: boolean;
  devPersonaId?: string;
}

export interface EduCourse {
  id: string;
  code: string;
  title: string;
  term?: string;
  descriptionMd?: string;
  archived?: boolean;
  integrityPolicy?: EduIntegrityPolicy;
  taPermissions?: CoursePermission[];
  studentsSeeOwnFlags?: boolean;
}

export interface EduEnrollmentAccommodation {
  extraTimePct?: number;
  fullscreenExempt?: boolean;
  watermarkExempt?: boolean;
  tabSwitchExempt?: boolean;
  note?: string;
}

export interface EduEnrollment {
  id: string;
  course: Ref & Partial<EduCourse>;
  person: Ref & Partial<EduUserProfile>;
  courseRole: CourseRole;
  status?: EnrollmentStatus;
  accommodation?: EduEnrollmentAccommodation;
}

export interface CourseMembership {
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  courseRole: CourseRole;
  courseTerm?: string;
  instructorNames?: string[];
}

/** Returned by EduSession.me(). */
export interface EduMe {
  userId: string;
  realUserId: string;
  displayName?: string;
  email?: string;
  studentNumber?: string;
  platformRole: PlatformRole;
  personaActive?: boolean;
  courses?: CourseMembership[];
  enabledFlags?: FeatureFlag[];
}

export interface BulkEnrollRow {
  email: string;
  displayName?: string;
  studentNumber?: string;
  courseRole: CourseRole;
}

export interface BulkEnrollResult {
  email?: string;
  ok?: boolean;
  message?: string;
}

export interface EduAuditLog {
  id: string;
  actorId: string;
  actorRole?: PlatformRole;
  action: string;
  targetTypeName?: string;
  targetId?: string;
  courseId?: string;
  beforeJson?: string;
  afterJson?: string;
  reason?: string;
  meta?: { created?: string };
}

export interface PlatformStats {
  userCount?: number;
  courseCount?: number;
  activeAssignmentCount?: number;
  activeQuizCount?: number;
  integrityFlagsLast7Days?: number;
  testRunsLast7Days?: number;
}

// ---- Assignment engine (Rohith) ---------------------------------------------------------------------------------
export type FileKind = 'PY' | 'IPYNB' | 'DOCX';
export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface EduAttachment {
  fileName: string;
  url: string;
  sizeBytes?: number;
}

/** File contents returned by EduAssignment.Files.readTestData (for the browser test runner). */
export interface EduAttachmentContent {
  fileName: string;
  contentBase64: string;
  sizeBytes?: number;
}

export interface EduAssignment {
  id: string;
  course: Ref & Partial<EduCourse>;
  title: string;
  descriptionMd?: string;
  fileKind: FileKind;
  templateFileUrl?: string;
  templateContent?: string;
  status?: AssignmentStatus;
  releaseAt?: string;
  dueAt?: string;
  lateUntil?: string;
  latePenaltyPct?: number;
  gradesReleasedAt?: string;
  integrityPolicy?: EduIntegrityPolicy;
  testDataFiles?: EduAttachment[];
}

export interface EduAssignmentStep {
  id: string;
  assignment: Ref;
  stepOrder: number;
  markerId: string;
  title: string;
  instructionsMd?: string;
  starterContent?: string;
  contextBefore?: string;
  contextAfter?: string;
  cellIndex?: number;
  points?: number;
  independentOfPrevious?: boolean;
}

export interface ParsedStep {
  markerId: string;
  title?: string;
  stepOrder?: number;
  instructionsMd?: string;
  starterContent?: string;
  contextBefore?: string;
  contextAfter?: string;
  cellIndex?: number;
  points?: number;
}

export interface TemplateParseResult {
  steps?: ParsedStep[];
  warnings?: string[];
}

// ---- Student workspace (Keya) ---------------------------------------------------------------------------------
export type SubmissionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'RETURNED';
export type ContentFormat = 'TEXT' | 'HTML';

export interface EduStepResponse {
  id: string;
  submission: Ref;
  step: Ref & Partial<EduAssignmentStep>;
  content?: string;
  contentFormat?: ContentFormat;
  revision?: number;
  completed?: boolean;
  lastVisibleResult?: EduTestSummary;
  /** `meta.updated` is the last save time. */
  meta?: { updated?: string };
}

export interface EduSubmission {
  id: string;
  assignment: Ref & Partial<EduAssignment>;
  student: Ref & Partial<EduUserProfile>;
  status?: SubmissionStatus;
  startedAt?: string;
  submittedAt?: string;
  extensionUntil?: string;
  assembledFileUrl?: string;
  canaryToken?: string;
  score?: number;
  scoreOverride?: number;
  late?: boolean;
  flagCount?: number;
  responses?: EduStepResponse[];
}

export interface MyAssignmentRow {
  assignmentId: string;
  title?: string;
  fileKind?: FileKind;
  courseId?: string;
  courseCode?: string;
  courseTitle?: string;
  releaseAt?: string;
  dueAt?: string;
  lateUntil?: string;
  latePenaltyPct?: number;
  status?: SubmissionStatus;
  submittedAt?: string;
  completedSteps?: number;
  totalSteps?: number;
  totalPoints?: number;
  nextStepOrder?: number;
  nextStepTitle?: string;
  failingVisibleTests?: number;
  late?: boolean;
  gradesReleasedAt?: string;
  /** Only present after grades are released. */
  score?: number;
}

/** EduSubmission.GradedRow */
export interface GradedRow {
  itemKind: 'ASSIGNMENT' | 'QUIZ';
  itemId: string;
  title?: string;
  courseCode?: string;
  score?: number;
  maxScore?: number;
  gradedAt?: string;
}

/** EduSubmission.Dashboard, returned by EduSubmission.myDashboard(). */
export interface StudentDashboard {
  assignments?: MyAssignmentRow[];
  quizzes?: MyQuizRow[];
  dueSoonCount?: number;
  inProgressCount?: number;
  lateWindowCount?: number;
  recentlyGraded?: GradedRow[];
}

// ---- Integrity (Seetharam) -----------------------------------------------------------------------------------------
export type PasteMode = 'BLOCK' | 'BLOCK_AND_LOG' | 'LOG_ONLY' | 'ALLOW';
export type ContextKind = 'ASSIGNMENT' | 'QUIZ';
export type IntegritySeverity = 'INFO' | 'WARN' | 'HIGH';
export type IntegrityEventKind =
  | 'PASTE_BLOCKED'
  | 'PASTE_INTERNAL'
  | 'PASTE_EXTERNAL_LOGGED'
  | 'DROP_BLOCKED'
  | 'COPY_BLOCKED'
  | 'CONTEXT_MENU_BLOCKED'
  | 'LARGE_INSERT'
  | 'FULLSCREEN_EXIT'
  | 'FULLSCREEN_ENTER'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'WINDOW_BLUR'
  | 'DEVTOOLS_SUSPECTED'
  | 'CANARY_MATCH'
  | 'SESSION_START'
  | 'SESSION_END'
  | 'LOCK_TRIGGERED'
  | 'LOCK_RELEASED'
  | 'SCREENSHOT_ATTEMPT'
  | 'PRINT_BLOCKED';

export interface EduIntegrityPolicy {
  pasteMode?: PasteMode;
  blockInternalPaste?: boolean;
  allowContextMenu?: boolean;
  allowCopyOfQuestion?: boolean;
  requireFullscreen?: boolean;
  tabSwitchWarnAt?: number;
  tabSwitchLockAt?: number;
  largeInsertChars?: number;
  hideWatermark?: boolean;
  watermarkAiNotice?: string;
  canaryEnabled?: boolean;
  blockScreenshots?: boolean;
}

export interface IntegrityDetails {
  chars?: number;
  durationMs?: number;
  contentHash?: string;
  count?: number;
  note?: string;
}

/** What the browser sends to EduIntegrityEvent.logBatch. Never include pasted text. */
export interface IntegrityClientEvent {
  eventKind: IntegrityEventKind;
  stepId?: string;
  clientAt?: string;
  details?: IntegrityDetails;
}

export interface EduIntegrityEvent extends IntegrityClientEvent {
  id: string;
  contextKind: ContextKind;
  contextId: string;
  courseId: string;
  person: Ref & Partial<EduUserProfile>;
  severity?: IntegritySeverity;
  clientSessionId?: string;
  meta?: { created?: string };
}

export interface StudentRiskRow {
  userId: string;
  displayName?: string;
  pasteBlockedCount?: number;
  tabHiddenMs?: number;
  fullscreenExitCount?: number;
  largeInsertCount?: number;
  canaryMatchCount?: number;
  riskScore?: number;
}

export interface CourseRiskRow {
  courseId: string;
  courseCode?: string;
  flaggedStudentCount?: number;
  highSeverityCount?: number;
  totalEventCount?: number;
}

/** EduIntegrityEvent.SessionState: returned by logBatch and sessionStateMine. */
export interface IntegritySessionState {
  contextKind: ContextKind;
  contextId: string;
  stored?: number;
  tabSwitchCount?: number;
  warnAt?: number;
  lockAt?: number;
  locked?: boolean;
  lockedAt?: string;
  /** The submission or attempt is no longer open, so nothing more is stored. */
  closed?: boolean;
}

/** EduIntegrityEvent.ContextRow: one submission or attempt of a student, from studentContexts. */
export interface IntegrityContextRow {
  contextKind: ContextKind;
  contextId: string;
  itemId?: string;
  itemTitle?: string;
  status?: string;
  flagCount?: number;
  highCount?: number;
  locked?: boolean;
  lastEventAt?: string;
}

export type PolicyLevel = 'PLATFORM' | 'COURSE' | 'ASSIGNMENT' | 'QUIZ';

/** EduIntegrityPolicy.EditorView: what the policy editor shows for one level. */
export interface PolicyEditorView {
  level: PolicyLevel;
  levelId?: string;
  courseId?: string;
  own?: EduIntegrityPolicy;
  inherited?: EduIntegrityPolicy;
  effective?: EduIntegrityPolicy;
  lockedFields?: (keyof EduIntegrityPolicy)[];
  canEdit?: boolean;
}

// ---- Tests, grading, quizzes (Shreenidhi) ---------------------------------------------------------------------------
export type TestVisibility = 'VISIBLE' | 'HIDDEN';
export type TestRunMode = 'BROWSER' | 'SERVER' | 'INSTRUCTOR_REGRADE';
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type ResultsVisibility = 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_CLOSE';
export type QuestionKind = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'CODE';
export type QuizAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';
export type GradebookItemKind = 'ASSIGNMENT' | 'QUIZ';

export interface EduStepTest {
  id: string;
  /** regradeBundle / stepTests also return `step.stepOrder`. */
  step?: Ref & { stepOrder?: number };
  question?: Ref;
  testName: string;
  code: string;
  visibility?: TestVisibility;
  points?: number;
  timeoutMs?: number;
  testOrder?: number;
}

export interface EduTestResult {
  testId: string;
  testName?: string;
  passed?: boolean;
  message?: string;
  stdout?: string;
  durationMs?: number;
}

export interface EduTestSummary {
  passedCount?: number;
  totalCount?: number;
  ranAt?: string;
}

export interface EduTestRun {
  id: string;
  submission: Ref;
  step: Ref;
  mode: TestRunMode;
  results?: EduTestResult[];
  passedCount?: number;
  totalCount?: number;
  trusted?: boolean;
}

export interface EduQuizOption {
  optionId: string;
  label: string;
}

export interface EduQuiz {
  id: string;
  course: Ref & Partial<EduCourse>;
  title: string;
  instructionsMd?: string;
  opensAt?: string;
  closesAt?: string;
  timeLimitMin?: number;
  attemptsAllowed?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  questionsPerAttempt?: number;
  showResults?: ResultsVisibility;
  integrityPolicy?: EduIntegrityPolicy;
  status?: QuizStatus;
}

/** Instructor-only shape. Never send correctOptionIds / acceptedAnswers to students. */
export interface EduQuizQuestion {
  id: string;
  quiz: Ref;
  questionOrder?: number;
  questionKind: QuestionKind;
  promptMd: string;
  options?: EduQuizOption[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  codeStarter?: string;
  points?: number;
  poolTag?: string;
}

export interface EduQuizAttempt {
  id: string;
  quiz: Ref;
  student?: Ref & { displayName?: string; studentNumber?: string };
  attemptNo?: number;
  questionIds?: string[];
  startedAt?: string;
  deadlineAt?: string;
  submittedAt?: string;
  /** Only when results are visible to the caller (EduQuiz.showResults), or for staff. */
  score?: number;
  status?: QuizAttemptStatus;
}

/** A VISIBLE code test of a CODE question, as sent in the paper (feedback only). */
export interface PaperTest {
  id: string;
  testName: string;
  code: string;
  timeoutMs?: number;
}

export interface PaperQuestion {
  questionId: string;
  questionKind: QuestionKind;
  promptMd?: string;
  options?: EduQuizOption[];
  codeStarter?: string;
  points?: number;
  visibleTests?: PaperTest[];
}

/** EduQuizAttempt.Paper: what startMine returns. Never contains correct answers or hidden tests. */
export interface QuizPaper {
  attempt: EduQuizAttempt;
  quizId?: string;
  quizTitle?: string;
  courseId?: string;
  courseCode?: string;
  timeLimitMin?: number;
  extraTimePct?: number;
  /** Server clock when the paper was built; offset = serverNow - Date.now() at receipt. */
  serverNow: string;
  questions?: PaperQuestion[];
  answers?: EduQuizAnswer[];
}

export interface EduQuizAnswer {
  id: string;
  attempt?: Ref;
  question: Ref;
  selectedOptionIds?: string[];
  answerText?: string;
  code?: string;
  autoScore?: number;
  manualScore?: number;
  feedback?: string;
  meta?: { updated?: string };
}

/** EduQuiz.MyQuizRow: a quiz in the student's list / on the start screen (no questions). */
export interface MyQuizRow {
  quizId: string;
  courseId?: string;
  courseCode?: string;
  title?: string;
  instructionsMd?: string;
  status?: QuizStatus;
  opensAt?: string;
  closesAt?: string;
  timeLimitMin?: number;
  extraTimePct?: number;
  effectiveTimeLimitMin?: number;
  attemptsAllowed?: number;
  attemptsUsed?: number;
  openAttemptId?: string;
  openAttemptDeadlineAt?: string;
  lastAttemptId?: string;
  questionCount?: number;
  /** Unset when questions are drawn from a pool (each attempt has its own maximum). */
  maxScore?: number;
  showResults?: ResultsVisibility;
  resultsVisible?: boolean;
  bestScore?: number;
  canStart?: boolean;
  unavailableReason?: string;
}

/** EduQuiz.CourseRow: a quiz in the staff list (EduQuiz.courseQuizzes). */
export interface QuizCourseRow {
  quiz: EduQuiz;
  questionCount?: number;
  maxScore?: number;
  attemptCount?: number;
  needsGradingCount?: number;
}

/** EduQuizAttempt.ResultQuestion. Score and key fields are only set when results are visible (or for staff). */
export interface QuizResultQuestion {
  questionId: string;
  questionKind: QuestionKind;
  promptMd?: string;
  options?: EduQuizOption[];
  points?: number;
  /** Staff view only; pass to gradeAnswerManually. */
  answerId?: string;
  selectedOptionIds?: string[];
  answerText?: string;
  code?: string;
  /** Auto-graded kinds only; ignore for CODE. */
  correct?: boolean;
  pointsEarned?: number;
  autoScore?: number;
  manualScore?: number;
  needsManualGrading?: boolean;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  feedback?: string;
}

/** EduQuizAttempt.Result: resultMine (student) or reviewAttempt (staff). */
export interface QuizResult {
  attempt: EduQuizAttempt;
  quizTitle?: string;
  studentName?: string;
  resultsVisible?: boolean;
  score?: number;
  maxScore?: number;
  pendingManualGrading?: boolean;
  questions?: QuizResultQuestion[];
}

export interface GradebookItem {
  itemId: string;
  itemKind: GradebookItemKind;
  title?: string;
  maxScore?: number;
  dueAt?: string;
  /** Assignments only; PY and IPYNB have runnable tests. */
  fileKind?: FileKind;
  /** Assignments only; set by EduGradebook.releaseGrades. */
  gradesReleasedAt?: string;
}

export interface GradebookCell {
  itemId: string;
  /** Submission id (assignments) or quiz attempt id (quizzes). */
  workId?: string;
  /** Effective score: the override when set, otherwise the computed score. */
  score?: number;
  /** Score computed from trusted test runs, before any override. */
  autoScore?: number;
  overridden?: boolean;
  late?: boolean;
  flagCount?: number;
  /** Submission or attempt status; 'NOT_STARTED' when there is no workId. */
  status?: string;
}

export interface GradebookRow {
  studentId: string;
  displayName?: string;
  studentNumber?: string;
  cells?: GradebookCell[];
}

export interface GradebookGrid {
  courseCode?: string;
  courseTitle?: string;
  items?: GradebookItem[];
  rows?: GradebookRow[];
}

/** C3 fetch result. */
export interface FetchResult<T> {
  objs?: T[];
  count?: number;
  hasMore?: boolean;
}
