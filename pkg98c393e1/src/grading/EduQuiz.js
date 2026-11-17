/*
 * EduQuiz — quizzes. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md section 7.4.
 *
 * Student reads (myQuizzes, myQuiz) never include questions. Staff methods (courseQuizzes, forEdit, saveForCourse,
 * setStatus, removeDraft) back the quiz builder; questions are edited through EduQuizQuestion and code tests through
 * EduStepTest.saveForQuestion. The integrity policy is written only by EduIntegrityPolicy.saveOverride (Seetharam).
 */

var log = Logger.for('EduQuiz');

var STAFF_ROLES = ['INSTRUCTOR', 'TA'];
var VISIBLE_STATUSES = ['PUBLISHED', 'CLOSED'];
var DONE_STATUSES = ['SUBMITTED', 'GRADED'];
var MAX_TITLE = 300;
var MAX_INSTRUCTIONS = 20000;

var QUIZ_OUT = [
  'id, title, instructionsMd, opensAt, closesAt, timeLimitMin, attemptsAllowed, shuffleQuestions, shuffleOptions',
  'questionsPerAttempt, showResults, status, integrityPolicy, course.id, course.code, course.title, meta.updated',
].join(', ');

var ROW_QUIZ_INCLUDE = 'id, title, instructionsMd, status, opensAt, closesAt, timeLimitMin, attemptsAllowed, questionsPerAttempt, showResults, course.id';

var SETTINGS_FIELDS = [
  'title',
  'instructionsMd',
  'opensAt',
  'closesAt',
  'timeLimitMin',
  'attemptsAllowed',
  'shuffleQuestions',
  'shuffleOptions',
  'questionsPerAttempt',
  'showResults',
];

/* ---- student reads --------------------------------------------------------------------------------------------- */

function myQuizzes(courseId) {
  requireQuizzesOn();
  var enrollment = EduEnrollment.requireCourseRole(courseId, ['STUDENT', 'TA', 'INSTRUCTOR']);
  var course = EduCourse.make({ id: courseId }).get('id, code');
  if (!course) {
    throw new Error('EDU_NOT_FOUND: course ' + courseId);
  }
  var viewer = viewerOf(enrollment);

  var quizzes = [];
  EduQuiz.fetchObjStream({
    filter: Filter.eq('course.id', courseId).and().intersects('status', VISIBLE_STATUSES),
    include: ROW_QUIZ_INCLUDE,
  }).each(function (q) {
    quizzes.push(q);
  });
  var stats = questionStats(Filter.eq('quiz.course.id', courseId));
  var attempts = viewer.student
    ? attemptsByQuiz(Filter.eq('quiz.course.id', courseId).and().eq('student.id', EduSession.currentUserId()))
    : {};

  quizzes.sort(byCloseThenTitle);
  var now = DateTime.now();
  var rows = EduQuiz.MyQuizRow.arrayBuilder();
  quizzes.forEach(function (q) {
    rows.add(myRow(q, course, stats[q.id], attempts[q.id] || [], viewer, now));
  });
  return rows.build();
}

function myQuiz(quizId) {
  requireQuizzesOn();
  var q = EduQuiz.make({ id: quizId }).get(ROW_QUIZ_INCLUDE);
  if (!q || !q.course || VISIBLE_STATUSES.indexOf(q.status) < 0) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  var enrollment = EduEnrollment.requireCourseRole(q.course.id, ['STUDENT', 'TA', 'INSTRUCTOR']);
  var course = EduCourse.make({ id: q.course.id }).get('id, code');
  var viewer = viewerOf(enrollment);
  var stats = questionStats(Filter.eq('quiz.id', quizId));
  var attempts = viewer.student ? attemptsByQuiz(Filter.eq('quiz.id', quizId).and().eq('student.id', EduSession.currentUserId())) : {};
  return myRow(q, course, stats[q.id], attempts[q.id] || [], viewer, DateTime.now());
}

/* ---- staff ----------------------------------------------------------------------------------------------------- */

function courseQuizzes(courseId) {
  EduEnrollment.requireCourseRole(courseId, STAFF_ROLES);
  var quizzes = [];
  EduQuiz.fetchObjStream({ filter: Filter.eq('course.id', courseId), include: QUIZ_OUT }).each(function (q) {
    quizzes.push(q);
  });
  var stats = questionStats(Filter.eq('quiz.course.id', courseId));
  var counts = {};
  EduQuizAttempt.fetchObjStream({ filter: Filter.eq('quiz.course.id', courseId), include: 'quiz.id, status' }).each(function (a) {
    var c = (counts[a.quiz.id] = counts[a.quiz.id] || { all: 0, pending: 0 });
    c.all++;
    if (a.status == EduQuizAttempt.Status.SUBMITTED) {
      c.pending++;
    }
  });
  quizzes.sort(byCloseThenTitle);
  var rows = EduQuiz.CourseRow.arrayBuilder();
  quizzes.forEach(function (q) {
    var s = stats[q.id] || { count: 0, points: 0 };
    var c = counts[q.id] || { all: 0, pending: 0 };
    rows.add(
      EduQuiz.CourseRow.make({
        quiz: q,
        questionCount: s.count,
        maxScore: round2(s.points),
        attemptCount: c.all,
        needsGradingCount: c.pending,
      })
    );
  });
  return rows.build();
}

function forEdit(quizId) {
  var q = loadQuiz(quizId);
  EduEnrollment.requireCourseRole(q.course.id, STAFF_ROLES);
  return EduQuiz.make({ id: quizId }).get(QUIZ_OUT);
}

function saveForCourse(quiz) {
  var courseId;
  if (quiz.id) {
    var existing = EduQuiz.make({ id: quiz.id }).get('course.id');
    if (!existing || !existing.course) {
      throw new Error('EDU_NOT_FOUND: quiz ' + quiz.id);
    }
    if (quiz.course && quiz.course.id && quiz.course.id != existing.course.id) {
      throw new Error("EDU_VALIDATION: a quiz can't move to another course");
    }
    courseId = existing.course.id;
  } else {
    if (!quiz.course || !quiz.course.id) {
      throw new Error('EDU_VALIDATION: a quiz needs a course');
    }
    courseId = quiz.course.id;
    if (!EduCourse.make({ id: courseId }).get('id')) {
      throw new Error('EDU_NOT_FOUND: course ' + courseId);
    }
  }
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_CONTENT);

  var fields = cleanSettings(quiz);
  var saved;
  if (quiz.id) {
    fields.id = quiz.id;
    EduQuiz.make(fields).merge(SETTINGS_FIELDS.join(', '));
    saved = quiz.id;
  } else {
    fields.course = { id: courseId };
    fields.status = EduQuiz.Status.DRAFT;
    saved = EduQuiz.make(fields).create().id;
  }
  log.info('Saved quiz {} in course {}', saved, courseId);
  return EduQuiz.make({ id: saved }).get(QUIZ_OUT);
}

function setStatus(quizId, status) {
  var q = loadQuiz(quizId);
  var courseId = q.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.PUBLISH_CONTENT);
  var valid = false;
  EduQuiz.Status.values().each(function (s) {
    if (s == status) {
      valid = true;
    }
  });
  if (!valid) {
    throw new Error('EDU_VALIDATION: unknown status ' + status);
  }
  if (q.status == status) {
    return EduQuiz.make({ id: quizId }).get(QUIZ_OUT);
  }
  if (status == EduQuiz.Status.PUBLISHED) {
    var problems = EduQuizQuestion.checkQuiz(quizId);
    if (problems && !problems.isEmpty()) {
      throw new Error('EDU_VALIDATION: ' + problems.get(0));
    }
  }
  if (status == EduQuiz.Status.DRAFT && EduQuizAttempt.fetchCount({ filter: Filter.eq('quiz.id', quizId) }) > 0) {
    throw new Error('EDU_VALIDATION: students have already taken this quiz, so it cannot go back to draft');
  }

  EduQuiz.make({ id: quizId, status: status }).merge();
  EduAuditLog.record('quiz.status', 'EduQuiz', quizId, courseId, JSON.stringify({ status: q.status }), JSON.stringify({ status: status }), null);
  log.info('Quiz {} is now {}', quizId, status);
  if (status == EduQuiz.Status.CLOSED) {
    var n = EduQuizAttempt.autoSubmitExpired();
    log.info('Closing quiz {} submitted {} attempts', quizId, n);
  }
  return EduQuiz.make({ id: quizId }).get(QUIZ_OUT);
}

function removeDraft(quizId) {
  var q = EduQuiz.make({ id: quizId }).get('status, course.id');
  if (!q || !q.course) {
    return false;
  }
  EduEnrollment.requireCoursePermission(q.course.id, EduCourse.Permission.EDIT_CONTENT);
  if (q.status != EduQuiz.Status.DRAFT) {
    throw new Error('EDU_VALIDATION: only draft quizzes can be deleted');
  }
  if (EduQuizAttempt.fetchCount({ filter: Filter.eq('quiz.id', quizId) }) > 0) {
    throw new Error('EDU_VALIDATION: the quiz has attempts');
  }
  var tests = EduStepTest.arrayBuilder();
  EduStepTest.fetchObjStream({ filter: Filter.eq('question.quiz.id', quizId), include: 'id' }).each(function (t) {
    tests.add(t);
  });
  var questions = EduQuizQuestion.arrayBuilder();
  EduQuizQuestion.fetchObjStream({ filter: Filter.eq('quiz.id', quizId), include: 'id' }).each(function (x) {
    questions.add(x);
  });
  var t = tests.build();
  var qs = questions.build();
  if (!t.isEmpty()) {
    EduStepTest.removeBatch(t);
  }
  if (!qs.isEmpty()) {
    EduQuizQuestion.removeBatch(qs);
  }
  EduQuiz.make({ id: quizId }).remove();
  log.info('Removed draft quiz {} ({} questions)', quizId, qs.length);
  return true;
}

/* ---- rows ------------------------------------------------------------------------------------------------------ */

/** { student, admin, extraPct } for the caller in the course. */
function viewerOf(enrollment) {
  var student = !!enrollment && enrollment.courseRole == EduEnrollment.CourseRole.STUDENT;
  var extra = 0;
  if (student) {
    var e = EduEnrollment.make({ id: enrollment.id }).get('accommodation');
    var pct = e && e.accommodation ? e.accommodation.extraTimePct : null;
    extra = pct != null && pct > 0 ? Math.min(pct, 400) : 0;
  }
  return { student: student, admin: !enrollment, extraPct: extra };
}

function myRow(q, course, stat, attempts, viewer, now) {
  var s = stat || { count: 0, points: 0 };
  var allowed = q.attemptsAllowed != null ? q.attemptsAllowed : 1;
  var visible = resultsVisible(q, now);

  var open = null;
  var last = null;
  var best = null;
  attempts.forEach(function (a) {
    if (a.status == EduQuizAttempt.Status.IN_PROGRESS) {
      if (!a.deadlineAt || !now.isAfter(a.deadlineAt)) {
        open = a;
      }
    } else if (DONE_STATUSES.indexOf(a.status) >= 0) {
      if (!last || (a.attemptNo || 0) > (last.attemptNo || 0)) {
        last = a;
      }
      if (a.score != null && (best == null || a.score > best)) {
        best = a.score;
      }
    }
  });

  var reason = null;
  if (!viewer.student) {
    reason = viewer.admin ? 'Act as a student persona to take quizzes' : 'Staff preview only';
  } else if (open) {
    reason = null;
  } else if (q.status == EduQuiz.Status.CLOSED || (q.closesAt && !q.closesAt.isAfter(now))) {
    reason = 'Closed';
  } else if (q.opensAt && q.opensAt.isAfter(now)) {
    reason = 'Opens ' + q.opensAt;
  } else if (attempts.length >= allowed) {
    reason = 'No attempts left';
  } else if (!s.count) {
    reason = 'No questions yet';
  }

  var perAttempt = q.questionsPerAttempt != null && q.questionsPerAttempt > 0 && q.questionsPerAttempt < s.count;
  var limit = q.timeLimitMin != null && q.timeLimitMin > 0 ? q.timeLimitMin : null;
  return EduQuiz.MyQuizRow.make({
    quizId: q.id,
    courseId: course.id,
    courseCode: course.code,
    title: q.title,
    instructionsMd: q.instructionsMd,
    status: q.status,
    opensAt: q.opensAt,
    closesAt: q.closesAt,
    timeLimitMin: limit,
    extraTimePct: viewer.extraPct,
    effectiveTimeLimitMin: limit != null ? round2(limit * (1 + viewer.extraPct / 100)) : null,
    attemptsAllowed: allowed,
    attemptsUsed: attempts.length,
    openAttemptId: open ? open.id : null,
    openAttemptDeadlineAt: open ? open.deadlineAt : null,
    lastAttemptId: last ? last.id : null,
    questionCount: perAttempt ? q.questionsPerAttempt : s.count,
    maxScore: perAttempt ? null : round2(s.points),
    showResults: q.showResults,
    resultsVisible: visible,
    bestScore: visible ? best : null,
    canStart: viewer.student && reason == null,
    unavailableReason: reason,
  });
}

/** quizId → { count, points } over the matching questions. */
function questionStats(filter) {
  var stats = {};
  EduQuizQuestion.fetchObjStream({ filter: filter, include: 'quiz.id, points' }).each(function (q) {
    var s = (stats[q.quiz.id] = stats[q.quiz.id] || { count: 0, points: 0 });
    s.count++;
    s.points += q.points || 0;
  });
  return stats;
}

/** quizId → attempts (id, attemptNo, status, score, deadlineAt). */
function attemptsByQuiz(filter) {
  var out = {};
  EduQuizAttempt.fetchObjStream({ filter: filter, include: 'id, attemptNo, status, score, deadlineAt, quiz.id' }).each(function (a) {
    (out[a.quiz.id] = out[a.quiz.id] || []).push(a);
  });
  return out;
}

/** Same rule as EduQuizAttempt: AFTER_SUBMIT always, AFTER_CLOSE once closed, NEVER never. */
function resultsVisible(q, now) {
  var mode = q.showResults || EduQuiz.ResultsVisibility.AFTER_SUBMIT;
  if (mode == EduQuiz.ResultsVisibility.AFTER_SUBMIT) {
    return true;
  }
  if (mode == EduQuiz.ResultsVisibility.AFTER_CLOSE) {
    return q.status == EduQuiz.Status.CLOSED || !!(q.closesAt && now.isAfter(q.closesAt));
  }
  return false;
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

function requireQuizzesOn() {
  var flags = EduPlatformConfig.inst().featureFlags;
  if (!(flags && flags.get('quizzes'))) {
    throw new Error('EDU_FEATURE_DISABLED: quizzes');
  }
}

function loadQuiz(quizId) {
  var q = EduQuiz.make({ id: quizId }).get('id, status, course.id');
  if (!q || !q.course) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  return q;
}

/** Validated settings from the builder. Unset values clear the field on update. */
function cleanSettings(quiz) {
  var title = quiz.title ? String(quiz.title).trim() : '';
  if (!title) {
    throw new Error('EDU_VALIDATION: the quiz needs a title');
  }
  if (title.length > MAX_TITLE) {
    throw new Error('EDU_VALIDATION: the title is longer than ' + MAX_TITLE + ' characters');
  }
  var instructions = quiz.instructionsMd != null ? String(quiz.instructionsMd) : null;
  if (instructions && instructions.length > MAX_INSTRUCTIONS) {
    throw new Error('EDU_VALIDATION: the instructions are longer than ' + MAX_INSTRUCTIONS + ' characters');
  }
  if (quiz.timeLimitMin != null && (quiz.timeLimitMin < 1 || quiz.timeLimitMin > 600)) {
    throw new Error('EDU_VALIDATION: the time limit must be between 1 and 600 minutes');
  }
  var attempts = quiz.attemptsAllowed != null ? quiz.attemptsAllowed : 1;
  if (attempts < 1 || attempts > 20) {
    throw new Error('EDU_VALIDATION: attempts must be between 1 and 20');
  }
  if (quiz.questionsPerAttempt != null && quiz.questionsPerAttempt < 1) {
    throw new Error('EDU_VALIDATION: questions per attempt must be at least 1');
  }
  if (quiz.opensAt && quiz.closesAt && !quiz.closesAt.isAfter(quiz.opensAt)) {
    throw new Error('EDU_VALIDATION: the quiz must close after it opens');
  }
  return {
    title: title,
    instructionsMd: instructions,
    opensAt: quiz.opensAt || null,
    closesAt: quiz.closesAt || null,
    timeLimitMin: quiz.timeLimitMin != null ? quiz.timeLimitMin : null,
    attemptsAllowed: attempts,
    shuffleQuestions: !!quiz.shuffleQuestions,
    shuffleOptions: !!quiz.shuffleOptions,
    questionsPerAttempt: quiz.questionsPerAttempt != null ? quiz.questionsPerAttempt : null,
    showResults: quiz.showResults || EduQuiz.ResultsVisibility.AFTER_SUBMIT,
  };
}

function byCloseThenTitle(a, b) {
  var da = a.closesAt;
  var db = b.closesAt;
  if (da && db && da.millis != db.millis) {
    return da.millis - db.millis;
  }
  if (da && !db) return -1;
  if (!da && db) return 1;
  return String(a.title || '').localeCompare(String(b.title || ''));
}

function round2(x) {
  return Math.round((x + 1e-9) * 100) / 100;
}
