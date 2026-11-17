/*
 * Quiz backend calls. Owner: Shreenidhi. PROJECT_PLAN.md 7.4. Components call these, never c3Call directly.
 *
 * Students: fetchMyQuizzes / fetchMyQuiz / startMyAttempt / saveMyAnswer / submitMyAttempt / fetchMyResult.
 * Staff (quiz builder, grading): everything below "Staff". The server checks course roles and permissions.
 */
import { c3Call } from '@/c3Action';
import type {
  EduQuiz,
  EduQuizAnswer,
  EduQuizAttempt,
  EduQuizQuestion,
  EduStepTest,
  MyQuizRow,
  QuizCourseRow,
  QuizPaper,
  QuizResult,
  QuizStatus,
} from '@/common/eduTypes';

/* ---- Students -------------------------------------------------------------------------------------------------- */

export const fetchMyQuizzes = async (courseId: string): Promise<MyQuizRow[]> =>
  (await c3Call('EduQuiz', 'myQuizzes', null, [courseId])) ?? [];

/** One quiz for the start screen (attempts used, time limit with extra time, whether the caller can start). */
export const fetchMyQuiz = (quizId: string): Promise<MyQuizRow> => c3Call('EduQuiz', 'myQuiz', null, [quizId]);

/** Starts or resumes the caller's attempt. Returns the paper with saved answers and the server time. */
export const startMyAttempt = (quizId: string): Promise<QuizPaper> => c3Call('EduQuizAttempt', 'startMine', null, [quizId]);

export interface QuizAnswerInput {
  selectedOptionIds?: string[];
  answerText?: string;
  code?: string;
}

export const saveMyAnswer = (attemptId: string, questionId: string, answer: QuizAnswerInput): Promise<EduQuizAnswer> =>
  c3Call('EduQuizAttempt', 'saveAnswerMine', null, [
    attemptId,
    questionId,
    answer.selectedOptionIds ?? null,
    answer.answerText ?? null,
    answer.code ?? null,
  ]);

/** Submits and auto-grades. `score` is only set when results are visible. */
export const submitMyAttempt = (attemptId: string): Promise<EduQuizAttempt> => c3Call('EduQuizAttempt', 'submitMine', null, [attemptId]);

export const fetchMyResult = (attemptId: string): Promise<QuizResult> => c3Call('EduQuizAttempt', 'resultMine', null, [attemptId]);

/* ---- Staff: quizzes -------------------------------------------------------------------------------------------- */

export const fetchCourseQuizzes = async (courseId: string): Promise<QuizCourseRow[]> =>
  (await c3Call('EduQuiz', 'courseQuizzes', null, [courseId])) ?? [];

export const fetchQuizForEdit = (quizId: string): Promise<EduQuiz> => c3Call('EduQuiz', 'forEdit', null, [quizId]);

/**
 * Creates (no id, `course.id` required) or updates the quiz settings. Send every setting: unset values clear the
 * field. Never writes status (setQuizStatus) or integrityPolicy (EduIntegrityPolicy.saveOverride).
 */
export const saveQuizForCourse = (quiz: Partial<EduQuiz>): Promise<EduQuiz> => c3Call('EduQuiz', 'saveForCourse', null, [quiz]);

export const setQuizStatus = (quizId: string, status: QuizStatus): Promise<EduQuiz> => c3Call('EduQuiz', 'setStatus', null, [quizId, status]);

export const removeDraftQuiz = (quizId: string): Promise<boolean> => c3Call('EduQuiz', 'removeDraft', null, [quizId]);

/* ---- Staff: questions and code tests --------------------------------------------------------------------------- */

export const fetchQuizQuestions = async (quizId: string): Promise<EduQuizQuestion[]> =>
  (await c3Call('EduQuizQuestion', 'forQuiz', null, [quizId])) ?? [];

/** Creates (no id, `quiz.id` required) or updates a question; fields that don't apply to the kind are cleared. */
export const saveQuizQuestion = (question: Partial<EduQuizQuestion>): Promise<EduQuizQuestion> =>
  c3Call('EduQuizQuestion', 'saveForQuiz', null, [question]);

export const removeQuizQuestion = (questionId: string): Promise<boolean> => c3Call('EduQuizQuestion', 'removeForQuiz', null, [questionId]);

/** Problems that block publishing; empty when the quiz can be published. */
export const checkQuiz = async (quizId: string): Promise<string[]> => (await c3Call('EduQuizQuestion', 'checkQuiz', null, [quizId])) ?? [];

export const fetchQuestionTests = async (questionId: string): Promise<EduStepTest[]> =>
  (await c3Call('EduStepTest', 'questionTests', null, [questionId])) ?? [];

export const saveQuestionTest = (test: Partial<EduStepTest>): Promise<EduStepTest> => c3Call('EduStepTest', 'saveForQuestion', null, [test]);

export const removeQuestionTest = (testId: string): Promise<boolean> => c3Call('EduStepTest', 'removeForQuestion', null, [testId]);

/* ---- Staff: attempts and grading ------------------------------------------------------------------------------- */

export const fetchQuizAttempts = async (quizId: string): Promise<EduQuizAttempt[]> =>
  (await c3Call('EduQuizAttempt', 'forQuiz', null, [quizId])) ?? [];

export const reviewAttempt = (attemptId: string): Promise<QuizResult> => c3Call('EduQuizAttempt', 'reviewAttempt', null, [attemptId]);

export const regradeAttempt = (attemptId: string): Promise<EduQuizAttempt> => c3Call('EduQuizAttempt', 'regradeAttempt', null, [attemptId]);

export const gradeAnswerManually = (answerId: string, points: number, feedback?: string): Promise<EduQuizAnswer> =>
  c3Call('EduQuizAnswer', 'gradeManually', null, [answerId, points, feedback ?? null]);
