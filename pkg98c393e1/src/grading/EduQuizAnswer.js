/*
 * EduQuizAnswer — answers in a quiz attempt. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md 7.4.
 * Students write answers only through EduQuizAttempt.saveAnswerMine; staff grade them here.
 */

var log = Logger.for('EduQuizAnswer');

var MAX_FEEDBACK = 4000;

function gradeManually(answerId, points, feedback) {
  var a = EduQuizAnswer.make({ id: answerId }).get(
    'id, manualScore, feedback, question.id, question.points, attempt.id, attempt.status, attempt.score, attempt.quiz.course.id'
  );
  if (!a || !a.attempt || !a.question) {
    throw new Error('EDU_NOT_FOUND: answer ' + answerId);
  }
  var courseId = a.attempt.quiz.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_GRADES);
  if (a.attempt.status == EduQuizAttempt.Status.IN_PROGRESS) {
    throw new Error('EDU_VALIDATION: the attempt is still in progress');
  }
  var max = a.question.points || 0;
  if (points == null || isNaN(points) || points < 0 || points > max) {
    throw new Error('EDU_VALIDATION: points must be between 0 and ' + max);
  }
  var value = round2(points);
  var note = feedback == null ? null : String(feedback);
  if (note && note.length > MAX_FEEDBACK) {
    note = note.substring(0, MAX_FEEDBACK);
  }
  EduQuizAnswer.make({ id: a.id, manualScore: value, feedback: note }).merge('manualScore, feedback');

  var totals = attemptTotals(a.attempt.id);
  var status = totals.pending ? EduQuizAttempt.Status.SUBMITTED : EduQuizAttempt.Status.GRADED;
  EduQuizAttempt.make({ id: a.attempt.id, score: totals.score, status: status }).merge();

  EduAuditLog.record(
    'quiz.manualGrade',
    'EduQuizAnswer',
    a.id,
    courseId,
    JSON.stringify({ manualScore: a.manualScore == null ? null : a.manualScore, attemptScore: a.attempt.score == null ? null : a.attempt.score }),
    JSON.stringify({ manualScore: value, attemptScore: totals.score, attemptStatus: status }),
    null
  );
  log.info('Manual grade on {}: {} (attempt {} -> {})', a.id, value, a.attempt.id, totals.score);
  return EduQuizAnswer.make({ id: a.id }).get('id, question.id, attempt.id, selectedOptionIds, answerText, code, autoScore, manualScore, feedback');
}

/**
 * { score, pending } of an attempt: score = Σ (manualScore, else autoScore, else 0) over the attempt's questions;
 * pending while an answered CODE question has no manual score (the same rule as EduQuizAttempt grading).
 */
function attemptTotals(attemptId) {
  var attempt = EduQuizAttempt.make({ id: attemptId }).get('questionIds');
  var inAttempt = {};
  if (attempt && attempt.questionIds) {
    attempt.questionIds.each(function (id) {
      inAttempt[id] = true;
    });
  }
  var total = 0;
  var pending = false;
  EduQuizAnswer.fetchObjStream({
    filter: Filter.eq('attempt.id', attemptId),
    include: 'question.id, question.questionKind, question.codeStarter, code, autoScore, manualScore',
  }).each(function (x) {
    if (!inAttempt[x.question.id]) {
      return;
    }
    if (x.manualScore != null) {
      total += x.manualScore;
    } else if (x.autoScore != null) {
      total += x.autoScore;
    } else if (x.question.questionKind == EduQuizQuestion.QuestionKind.CODE && hasCode(x)) {
      pending = true;
    }
  });
  return { score: round2(total), pending: pending };
}

function hasCode(x) {
  var code = x.code ? String(x.code).trim() : '';
  var starter = x.question.codeStarter ? String(x.question.codeStarter).trim() : '';
  return !!code && code !== starter;
}

function round2(x) {
  return Math.round((x + 1e-9) * 100) / 100;
}
