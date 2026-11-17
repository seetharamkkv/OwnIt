/*
 * EduQuizAttempt — taking quizzes. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md section 7.4.
 *
 * Correct answers and hidden tests never leave the server for students: the paper (startMine) carries prompts,
 * options in the attempt's order, starter code and VISIBLE code tests only, and results (resultMine) add the answer
 * key only when EduQuiz.showResults allows it. Grading happens here, on submit or at the deadline (autoSubmitExpired).
 */

var log = Logger.for('EduQuizAttempt');

/** Seconds after deadlineAt during which a save still lands (network latency at the buzzer). */
var GRACE_SECONDS = 5;
var MAX_ANSWER_TEXT = 2000;
var MAX_CODE_CHARS = 50000;
var STAFF_ROLES = ['INSTRUCTOR', 'TA'];
var CHOICE_KINDS = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];

var QUIZ_INCLUDE = [
  'id, title, status, opensAt, closesAt, timeLimitMin, attemptsAllowed, shuffleQuestions, shuffleOptions',
  'questionsPerAttempt, showResults, course.id, course.code',
].join(', ');

var ATTEMPT_INCLUDE = [
  'id, attemptNo, status, startedAt, deadlineAt, submittedAt, score, questionIds, optionOrder, student.id',
  'student.displayName, quiz.id, quiz.title, quiz.status, quiz.showResults, quiz.closesAt, quiz.timeLimitMin',
  'quiz.course.id, quiz.course.code',
].join(', ');

var QUESTION_PAPER_INCLUDE = 'id, questionKind, promptMd, options, codeStarter, points, questionOrder';
var QUESTION_KEY_INCLUDE = QUESTION_PAPER_INCLUDE + ', correctOptionIds, acceptedAnswers';
var ANSWER_INCLUDE = 'id, question.id, selectedOptionIds, answerText, code, autoScore, manualScore, feedback';

/* ---- student methods ------------------------------------------------------------------------------------------- */

function startMine(quizId) {
  requireQuizzesOn();
  var quiz = EduQuiz.make({ id: quizId }).get(QUIZ_INCLUDE);
  if (!quiz || !quiz.course || quiz.status == EduQuiz.Status.DRAFT) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  var enrollment = requireStudent(quiz.course.id);
  var userId = EduSession.currentUserId();
  var now = DateTime.now();

  var attempts = myAttempts(quizId, userId);
  var open = attempts.filter(function (a) {
    return a.status == EduQuizAttempt.Status.IN_PROGRESS;
  })[0];
  if (open) {
    if (open.deadlineAt && now.isAfter(open.deadlineAt)) {
      finalize(open.id);
      throw new Error('EDU_DEADLINE_PASSED: attempt ' + open.attemptNo + ' ended at ' + open.deadlineAt + ' and was submitted');
    }
    return buildPaper(open.id, extraTimeOf(enrollment));
  }

  if (quiz.status != EduQuiz.Status.PUBLISHED) {
    throw new Error('EDU_DEADLINE_PASSED: the quiz is closed');
  }
  if (quiz.opensAt && quiz.opensAt.isAfter(now)) {
    throw new Error('EDU_VALIDATION: the quiz opens at ' + quiz.opensAt);
  }
  if (quiz.closesAt && !quiz.closesAt.isAfter(now)) {
    throw new Error('EDU_DEADLINE_PASSED: the quiz closed at ' + quiz.closesAt);
  }
  var allowed = quiz.attemptsAllowed != null ? quiz.attemptsAllowed : 1;
  if (attempts.length >= allowed) {
    throw new Error('EDU_VALIDATION: no attempts left (' + attempts.length + ' of ' + allowed + ' used)');
  }

  var pool = [];
  EduQuizQuestion.fetchObjStream({ filter: Filter.eq('quiz.id', quizId), include: 'id, questionKind, options, poolTag, questionOrder' }).each(
    function (q) {
      pool.push(q);
    }
  );
  if (!pool.length) {
    throw new Error('EDU_VALIDATION: the quiz has no questions yet');
  }
  var drawn = drawQuestions(pool, quiz.questionsPerAttempt, !!quiz.shuffleQuestions);

  var questionIds = [];
  var optionOrder = {};
  drawn.forEach(function (q) {
    questionIds.push(q.id);
    var ids = [];
    if (q.options) {
      q.options.each(function (o) {
        ids.push(o.optionId);
      });
    }
    if (quiz.shuffleOptions && q.questionKind != EduQuizQuestion.QuestionKind.TRUE_FALSE) {
      shuffle(ids);
    }
    if (ids.length) {
      optionOrder[q.id] = ids;
    }
  });

  var extraPct = extraTimeOf(enrollment);
  var deadline = computeDeadline(now, quiz.timeLimitMin, extraPct, quiz.closesAt);
  var attemptNo = nextAttemptNo(attempts);
  var attemptId = quizId + '_' + userId + '_' + attemptNo;
  try {
    EduQuizAttempt.make({
      id: attemptId,
      quiz: { id: quizId },
      student: { id: userId },
      attemptNo: attemptNo,
      questionIds: questionIds,
      optionOrder: optionOrder,
      startedAt: now,
      deadlineAt: deadline,
      status: EduQuizAttempt.Status.IN_PROGRESS,
    }).create();
    log.info('Started quiz attempt {} ({} questions, deadline {})', attemptId, questionIds.length, deadline);
  } catch (e) {
    // A second tab may have started the same attempt at the same moment; the deterministic id makes one of them win.
    var again = EduQuizAttempt.make({ id: attemptId }).get('id, status');
    if (!again || again.status != EduQuizAttempt.Status.IN_PROGRESS) {
      throw e;
    }
  }
  return buildPaper(attemptId, extraPct);
}

function saveAnswerMine(attemptId, questionId, selectedOptionIds, answerText, code) {
  requireQuizzesOn();
  var attempt = loadOwnAttempt(attemptId);
  if (attempt.status != EduQuizAttempt.Status.IN_PROGRESS) {
    throw new Error('EDU_DEADLINE_PASSED: the attempt was already submitted');
  }
  if (attempt.quiz.status != EduQuiz.Status.PUBLISHED) {
    throw new Error('EDU_DEADLINE_PASSED: the quiz is closed');
  }
  if (attempt.deadlineAt && DateTime.now().isAfter(attempt.deadlineAt.plusSeconds(GRACE_SECONDS))) {
    throw new Error('EDU_DEADLINE_PASSED: the time for this attempt ended at ' + attempt.deadlineAt);
  }
  if (!attempt.questionIds || !attempt.questionIds.contains(questionId)) {
    throw new Error('EDU_VALIDATION: question ' + questionId + ' is not part of this attempt');
  }
  EduIntegrityEvent.assertNotLocked(EduIntegrityEvent.ContextKind.QUIZ, attemptId);

  var q = EduQuizQuestion.make({ id: questionId }).get('questionKind, options');
  if (!q) {
    throw new Error('EDU_NOT_FOUND: question ' + questionId);
  }

  var fields = { selectedOptionIds: null, answerText: null, code: null };
  if (CHOICE_KINDS.indexOf(q.questionKind) >= 0) {
    fields.selectedOptionIds = cleanSelection(q, selectedOptionIds);
  } else if (q.questionKind == EduQuizQuestion.QuestionKind.SHORT_ANSWER) {
    fields.answerText = truncate(answerText, MAX_ANSWER_TEXT);
  } else {
    fields.code = truncate(code, MAX_CODE_CHARS);
  }

  var answerId = attemptId + '_' + questionId;
  EduQuizAnswer.make({
    id: answerId,
    attempt: { id: attemptId },
    question: { id: questionId },
    selectedOptionIds: fields.selectedOptionIds,
    answerText: fields.answerText,
    code: fields.code,
  }).upsert();
  return EduQuizAnswer.make({ id: answerId }).get('id, question.id, selectedOptionIds, answerText, code, meta.updated');
}

function submitMine(attemptId) {
  requireQuizzesOn();
  var attempt = loadOwnAttempt(attemptId);
  if (attempt.status == EduQuizAttempt.Status.IN_PROGRESS) {
    EduIntegrityEvent.assertNotLocked(EduIntegrityEvent.ContextKind.QUIZ, attemptId);
    finalize(attemptId);
    log.info('Submitted quiz attempt {}', attemptId);
  }
  var fresh = EduQuizAttempt.make({ id: attemptId }).get(ATTEMPT_INCLUDE);
  return attemptOut(fresh, resultsVisible(fresh.quiz, DateTime.now()));
}

function resultMine(attemptId) {
  requireQuizzesOn();
  var attempt = loadOwnAttempt(attemptId);
  if (attempt.status == EduQuizAttempt.Status.IN_PROGRESS) {
    throw new Error('EDU_VALIDATION: submit the attempt before viewing results');
  }
  return buildResult(attempt, resultsVisible(attempt.quiz, DateTime.now()), false);
}

/* ---- system ---------------------------------------------------------------------------------------------------- */

function autoSubmitExpired() {
  var cutoff = DateTime.now().plusSeconds(-GRACE_SECONDS);
  var ids = {};
  EduQuizAttempt.fetchObjStream({
    filter: Filter.eq('status', EduQuizAttempt.Status.IN_PROGRESS).and().lt('deadlineAt', cutoff),
    include: 'id',
  }).each(function (a) {
    ids[a.id] = true;
  });
  // A quiz closed early by staff ends every attempt still in progress.
  EduQuizAttempt.fetchObjStream({
    filter: Filter.eq('status', EduQuizAttempt.Status.IN_PROGRESS).and().eq('quiz.status', EduQuiz.Status.CLOSED),
    include: 'id',
  }).each(function (a) {
    ids[a.id] = true;
  });

  var count = 0;
  Object.keys(ids).forEach(function (id) {
    try {
      if (finalize(id)) {
        count++;
      }
    } catch (e) {
      // One broken attempt must not stop the others; it is retried on the next run.
      log.error('Auto-submit failed for {}: {}', id, e.message);
    }
  });
  if (count) {
    log.info('Auto-submitted {} expired quiz attempts', count);
  }
  return count;
}

/* ---- staff methods --------------------------------------------------------------------------------------------- */

function forQuiz(quizId) {
  var quiz = EduQuiz.make({ id: quizId }).get('course.id');
  if (!quiz || !quiz.course) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  EduEnrollment.requireCourseRole(quiz.course.id, STAFF_ROLES);
  var rows = [];
  EduQuizAttempt.fetchObjStream({
    filter: Filter.eq('quiz.id', quizId),
    include: 'id, attemptNo, status, score, startedAt, deadlineAt, submittedAt, quiz.id, student.id, student.displayName, student.studentNumber',
  }).each(function (a) {
    rows.push(a);
  });
  rows.sort(function (a, b) {
    var ma = a.startedAt ? a.startedAt.millis : 0;
    var mb = b.startedAt ? b.startedAt.millis : 0;
    if (ma != mb) {
      return mb - ma;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  var out = EduQuizAttempt.arrayBuilder();
  rows.forEach(function (a) {
    out.add(a);
  });
  return out.build();
}

function reviewAttempt(attemptId) {
  var attempt = loadAttempt(attemptId);
  EduEnrollment.requireCourseRole(attempt.quiz.course.id, STAFF_ROLES);
  return buildResult(attempt, true, true);
}

function regradeAttempt(attemptId) {
  var attempt = loadAttempt(attemptId);
  var courseId = attempt.quiz.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_GRADES);
  if (attempt.status == EduQuizAttempt.Status.IN_PROGRESS) {
    throw new Error('EDU_VALIDATION: the attempt is still in progress');
  }
  var graded = grade(attempt);
  EduQuizAttempt.make({ id: attempt.id, score: graded.score, status: graded.status }).merge();
  if (graded.score !== attempt.score || graded.status != attempt.status) {
    EduAuditLog.record(
      'quiz.regrade',
      'EduQuizAttempt',
      attempt.id,
      courseId,
      JSON.stringify({ score: attempt.score == null ? null : attempt.score, status: attempt.status }),
      JSON.stringify({ score: graded.score, status: graded.status }),
      null
    );
  }
  log.info('Regraded quiz attempt {}: {} -> {}', attempt.id, attempt.score, graded.score);
  return attemptOut(EduQuizAttempt.make({ id: attempt.id }).get(ATTEMPT_INCLUDE), true);
}

/* ---- paper ----------------------------------------------------------------------------------------------------- */

function buildPaper(attemptId, extraPct) {
  var attempt = EduQuizAttempt.make({ id: attemptId }).get(ATTEMPT_INCLUDE);
  var ids = nativeIds(attempt.questionIds);

  var byId = {};
  if (ids.length) {
    EduQuizQuestion.fetchObjStream({ filter: Filter.intersects('id', ids), include: QUESTION_PAPER_INCLUDE }).each(function (q) {
      byId[q.id] = q;
    });
  }

  var testsByQuestion = {};
  if (ids.length) {
    EduStepTest.fetchObjStream({
      filter: Filter.intersects('question.id', ids).and().eq('visibility', EduStepTest.Visibility.VISIBLE),
      include: 'id, question.id, testName, code, timeoutMs, testOrder',
    }).each(function (t) {
      (testsByQuestion[t.question.id] = testsByQuestion[t.question.id] || []).push(t);
    });
  }

  var questions = EduQuizAttempt.PaperQuestion.arrayBuilder();
  ids.forEach(function (qid) {
    var q = byId[qid];
    if (!q) {
      return; // removed from the pool after the attempt started
    }
    var tests = EduStepTest.arrayBuilder();
    (testsByQuestion[qid] || [])
      .sort(function (a, b) {
        return (a.testOrder || 0) - (b.testOrder || 0);
      })
      .forEach(function (t) {
        tests.add(EduStepTest.make({ id: t.id, testName: t.testName, code: t.code, timeoutMs: t.timeoutMs }));
      });
    questions.add(
      EduQuizAttempt.PaperQuestion.make({
        questionId: q.id,
        questionKind: q.questionKind,
        promptMd: q.promptMd,
        options: orderedOptions(q, attempt.optionOrder),
        codeStarter: q.questionKind == EduQuizQuestion.QuestionKind.CODE ? q.codeStarter : null,
        points: q.points,
        visibleTests: tests.build(),
      })
    );
  });

  var answers = EduQuizAnswer.arrayBuilder();
  EduQuizAnswer.fetchObjStream({ filter: Filter.eq('attempt.id', attemptId), include: 'id, question.id, selectedOptionIds, answerText, code' }).each(
    function (a) {
      answers.add(a);
    }
  );

  return EduQuizAttempt.Paper.make({
    attempt: EduQuizAttempt.make({
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      questionIds: attempt.questionIds,
      quiz: { id: attempt.quiz.id },
    }),
    quizId: attempt.quiz.id,
    quizTitle: attempt.quiz.title,
    courseId: attempt.quiz.course.id,
    courseCode: attempt.quiz.course.code,
    timeLimitMin: attempt.quiz.timeLimitMin,
    extraTimePct: extraPct || 0,
    serverNow: DateTime.now(),
    questions: questions.build(),
    answers: answers.build(),
  });
}

/** The question's options in the attempt's order; options added later go last, removed ones are dropped. */
function orderedOptions(q, optionOrder) {
  var out = EduQuizOption.arrayBuilder();
  if (!q.options || q.options.isEmpty()) {
    return out.build();
  }
  var byId = {};
  var natural = [];
  q.options.each(function (o) {
    byId[o.optionId] = o;
    natural.push(o.optionId);
  });
  var order = optionOrder ? optionOrder.get(q.id) : null;
  var seen = {};
  if (order) {
    order.each(function (id) {
      if (byId[id] && !seen[id]) {
        out.add(byId[id]);
        seen[id] = true;
      }
    });
  }
  natural.forEach(function (id) {
    if (!seen[id]) {
      out.add(byId[id]);
    }
  });
  return out.build();
}

/* ---- grading --------------------------------------------------------------------------------------------------- */

/** Submits and grades an IN_PROGRESS attempt. Returns false when it was already submitted. */
function finalize(attemptId) {
  var attempt = EduQuizAttempt.make({ id: attemptId }).get(ATTEMPT_INCLUDE);
  if (!attempt || attempt.status != EduQuizAttempt.Status.IN_PROGRESS) {
    return false;
  }
  var graded = grade(attempt);
  EduQuizAttempt.make({
    id: attempt.id,
    status: graded.status,
    submittedAt: DateTime.now(),
    score: graded.score,
  }).merge();
  return true;
}

/**
 * Scores every answer of the attempt with the current answer key and writes changed automatic scores. Returns the
 * attempt's { score, status }: GRADED unless an answered CODE question still has no manual score.
 */
function grade(attempt) {
  var ids = nativeIds(attempt.questionIds);
  var questions = {};
  if (ids.length) {
    EduQuizQuestion.fetchObjStream({ filter: Filter.intersects('id', ids), include: QUESTION_KEY_INCLUDE }).each(function (q) {
      questions[q.id] = q;
    });
  }
  var answers = {};
  EduQuizAnswer.fetchObjStream({ filter: Filter.eq('attempt.id', attempt.id), include: ANSWER_INCLUDE }).each(function (a) {
    answers[a.question.id] = a;
  });

  var updates = EduQuizAnswer.arrayBuilder();
  var anyUpdate = false;
  var total = 0;
  var pending = false;
  ids.forEach(function (qid) {
    var q = questions[qid];
    var a = answers[qid];
    if (!q || !a) {
      return;
    }
    var auto = autoScoreOf(q, a);
    if (auto === undefined) {
      pending = pending || a.manualScore == null;
    } else if (a.autoScore !== auto) {
      updates.add(EduQuizAnswer.make({ id: a.id, autoScore: auto }));
      anyUpdate = true;
    }
    var earned = a.manualScore != null ? a.manualScore : auto != null ? auto : a.autoScore;
    total += earned || 0;
  });
  if (anyUpdate) {
    EduQuizAnswer.mergeBatch(updates.build());
  }
  return {
    score: round2(total),
    status: pending ? EduQuizAttempt.Status.SUBMITTED : EduQuizAttempt.Status.GRADED,
  };
}

/**
 * Automatic score of one answer: full points or 0 for choice and short-answer kinds; 0 for an empty CODE answer;
 * undefined for an answered CODE question, which needs a manual grade.
 */
function autoScoreOf(q, a) {
  var points = q.points || 0;
  if (q.questionKind == EduQuizQuestion.QuestionKind.CODE) {
    if (!hasCode(q, a)) {
      return 0;
    }
    return undefined;
  }
  return isCorrect(q, a) ? points : 0;
}

/** Correctness for auto-graded kinds; null for CODE. */
function isCorrect(q, a) {
  if (q.questionKind == EduQuizQuestion.QuestionKind.CODE) {
    return null;
  }
  if (!a) {
    return false;
  }
  if (q.questionKind == EduQuizQuestion.QuestionKind.SHORT_ANSWER) {
    var given = normalise(a.answerText);
    if (!given || !q.acceptedAnswers) {
      return false;
    }
    var ok = false;
    q.acceptedAnswers.each(function (acc) {
      if (normalise(acc) === given) {
        ok = true;
      }
    });
    return ok;
  }
  var chosen = nativeIds(a.selectedOptionIds);
  var correct = nativeIds(q.correctOptionIds);
  if (!chosen.length || chosen.length != correct.length) {
    return false;
  }
  return chosen.every(function (id) {
    return correct.indexOf(id) >= 0;
  });
}

function hasCode(q, a) {
  var code = a && a.code ? String(a.code).trim() : '';
  var starter = q.codeStarter ? String(q.codeStarter).trim() : '';
  return !!code && code !== starter;
}

/* ---- results --------------------------------------------------------------------------------------------------- */

function buildResult(attempt, visible, staff) {
  var ids = nativeIds(attempt.questionIds);
  var questions = {};
  if (ids.length) {
    EduQuizQuestion.fetchObjStream({ filter: Filter.intersects('id', ids), include: QUESTION_KEY_INCLUDE }).each(function (q) {
      questions[q.id] = q;
    });
  }
  var answers = {};
  EduQuizAnswer.fetchObjStream({ filter: Filter.eq('attempt.id', attempt.id), include: ANSWER_INCLUDE }).each(function (a) {
    answers[a.question.id] = a;
  });

  var showKey = visible || staff;
  var maxScore = 0;
  var rows = EduQuizAttempt.ResultQuestion.arrayBuilder();
  ids.forEach(function (qid) {
    var q = questions[qid];
    if (!q) {
      return;
    }
    var a = answers[qid];
    maxScore += q.points || 0;
    var isCode = q.questionKind == EduQuizQuestion.QuestionKind.CODE;
    var earned = a ? (a.manualScore != null ? a.manualScore : a.autoScore != null ? a.autoScore : 0) : 0;
    rows.add(
      EduQuizAttempt.ResultQuestion.make({
        questionId: q.id,
        questionKind: q.questionKind,
        promptMd: q.promptMd,
        options: orderedOptions(q, attempt.optionOrder),
        points: q.points,
        answerId: staff && a ? a.id : null,
        selectedOptionIds: a ? a.selectedOptionIds : null,
        answerText: a ? a.answerText : null,
        code: a ? a.code : null,
        correct: showKey && !isCode ? isCorrect(q, a) : null,
        pointsEarned: showKey ? round2(earned) : null,
        autoScore: staff && a ? a.autoScore : null,
        manualScore: staff && a ? a.manualScore : null,
        needsManualGrading: isCode && hasCode(q, a) && a.manualScore == null,
        correctOptionIds: showKey && !isCode ? q.correctOptionIds : null,
        acceptedAnswers: showKey && q.questionKind == EduQuizQuestion.QuestionKind.SHORT_ANSWER ? q.acceptedAnswers : null,
        feedback: showKey && a ? a.feedback : null,
      })
    );
  });

  return EduQuizAttempt.Result.make({
    attempt: attemptOut(attempt, showKey),
    quizTitle: attempt.quiz.title,
    studentName: staff && attempt.student ? attempt.student.displayName : null,
    resultsVisible: showKey,
    score: showKey ? attempt.score : null,
    maxScore: round2(maxScore),
    pendingManualGrading: attempt.status == EduQuizAttempt.Status.SUBMITTED,
    questions: rows.build(),
  });
}

/** The attempt fields a client may see; the score only when results are visible. */
function attemptOut(attempt, withScore) {
  return EduQuizAttempt.make({
    id: attempt.id,
    attemptNo: attempt.attemptNo,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt,
    score: withScore ? attempt.score : null,
    quiz: { id: attempt.quiz.id },
    student: attempt.student ? { id: attempt.student.id } : null,
  });
}

/** AFTER_SUBMIT: always; AFTER_CLOSE: once the quiz is CLOSED or past closesAt; NEVER: never. */
function resultsVisible(quiz, now) {
  var mode = quiz.showResults || EduQuiz.ResultsVisibility.AFTER_SUBMIT;
  if (mode == EduQuiz.ResultsVisibility.AFTER_SUBMIT) {
    return true;
  }
  if (mode == EduQuiz.ResultsVisibility.AFTER_CLOSE) {
    return quiz.status == EduQuiz.Status.CLOSED || !!(quiz.closesAt && now.isAfter(quiz.closesAt));
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

/** Only enrolled students take quizzes; admins (null enrollment) must act as a student persona. */
function requireStudent(courseId) {
  var enrollment = EduEnrollment.requireCourseRole(courseId, ['STUDENT']);
  if (!enrollment) {
    throw new Error('EDU_FORBIDDEN: only enrolled students take quizzes; act as a student persona');
  }
  return enrollment;
}

function extraTimeOf(enrollment) {
  if (!enrollment) {
    return 0;
  }
  var e = EduEnrollment.make({ id: enrollment.id }).get('accommodation');
  var pct = e && e.accommodation ? e.accommodation.extraTimePct : null;
  return pct != null && pct > 0 ? Math.min(pct, 400) : 0;
}

/** startedAt + timeLimit × (1 + extra%), capped at closesAt; closesAt alone (or null) without a limit. */
function computeDeadline(start, timeLimitMin, extraPct, closesAt) {
  var deadline = null;
  if (timeLimitMin != null && timeLimitMin > 0) {
    deadline = start.plusSeconds(Math.round(timeLimitMin * 60 * (1 + (extraPct || 0) / 100)));
  }
  if (closesAt && (!deadline || closesAt.isBefore(deadline))) {
    deadline = closesAt;
  }
  return deadline;
}

function myAttempts(quizId, userId) {
  var rows = [];
  EduQuizAttempt.fetchObjStream({
    filter: Filter.eq('quiz.id', quizId).and().eq('student.id', userId),
    include: 'id, attemptNo, status, deadlineAt',
  }).each(function (a) {
    rows.push(a);
  });
  return rows;
}

function nextAttemptNo(attempts) {
  var max = 0;
  attempts.forEach(function (a) {
    max = Math.max(max, a.attemptNo || 0);
  });
  return max + 1;
}

function loadAttempt(attemptId) {
  var attempt = EduQuizAttempt.make({ id: attemptId }).get(ATTEMPT_INCLUDE);
  if (!attempt || !attempt.quiz || !attempt.student) {
    throw new Error('EDU_NOT_FOUND: quiz attempt ' + attemptId);
  }
  return attempt;
}

function loadOwnAttempt(attemptId) {
  var attempt = loadAttempt(attemptId);
  if (attempt.student.id != EduSession.currentUserId()) {
    throw new Error('EDU_FORBIDDEN: not your quiz attempt');
  }
  return attempt;
}

/** Option ids for a choice answer: known ids of the question only, deduplicated, at most one for single-answer kinds. */
function cleanSelection(q, selected) {
  var known = {};
  if (q.options) {
    q.options.each(function (o) {
      known[o.optionId] = true;
    });
  }
  var out = [];
  if (selected) {
    selected.each(function (id) {
      if (!known[id]) {
        throw new Error('EDU_VALIDATION: unknown option ' + id);
      }
      if (out.indexOf(id) < 0) {
        out.push(id);
      }
    });
  }
  if (q.questionKind != EduQuizQuestion.QuestionKind.MULTI_CHOICE && out.length > 1) {
    throw new Error('EDU_VALIDATION: pick one option');
  }
  return out;
}

/**
 * Draws `n` questions (all when unset). With poolTag groups, picks round-robin from the shuffled groups so every tag
 * is represented evenly; otherwise picks at random. The result is shuffled when `shuffleQuestions`, otherwise in
 * questionOrder.
 */
function drawQuestions(pool, n, shuffleQuestions) {
  var drawn;
  if (n == null || n <= 0 || n >= pool.length) {
    drawn = pool.slice();
  } else {
    var groups = {};
    pool.forEach(function (q) {
      var tag = q.poolTag ? String(q.poolTag) : '';
      (groups[tag] = groups[tag] || []).push(q);
    });
    var tags = Object.keys(groups);
    if (tags.length <= 1) {
      drawn = shuffle(pool.slice()).slice(0, n);
    } else {
      var lists = shuffle(tags).map(function (t) {
        return shuffle(groups[t]);
      });
      drawn = [];
      var i = 0;
      while (drawn.length < n) {
        var list = lists[i % lists.length];
        if (list.length) {
          drawn.push(list.shift());
        }
        i++;
      }
    }
  }
  if (shuffleQuestions) {
    return shuffle(drawn);
  }
  return drawn.sort(function (a, b) {
    var oa = a.questionOrder != null ? a.questionOrder : 0;
    var ob = b.questionOrder != null ? b.questionOrder : 0;
    return oa != ob ? oa - ob : String(a.id).localeCompare(String(b.id));
  });
}

/** Fisher–Yates, in place; returns the array. */
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function nativeIds(list) {
  var out = [];
  if (list) {
    list.each(function (id) {
      out.push(String(id));
    });
  }
  return out;
}

/** Lowercase, trimmed, inner whitespace collapsed. */
function normalise(s) {
  return s == null ? '' : String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function truncate(s, max) {
  if (s == null) {
    return null;
  }
  var str = String(s);
  return str.length > max ? str.substring(0, max) : str;
}

function round2(x) {
  return Math.round((x + 1e-9) * 100) / 100;
}
