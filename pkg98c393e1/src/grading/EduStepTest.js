/*
 * EduStepTest — step and code-question tests. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md section 7.
 *
 * Students only ever receive VISIBLE tests (visibleTests). Hidden tests leave the server only for staff
 * (regradeBundle, stepTests), so a student's browser never has them.
 */

var log = Logger.for('EduStepTest');

var TEST_INCLUDE = 'id, step.id, step.stepOrder, testName, code, visibility, points, timeoutMs, testOrder';
var MAX_CODE_CHARS = 50000;
var MAX_TIMEOUT_MS = 60000;

function visibleTests(assignmentId) {
  var assignment = loadAssignment(assignmentId);
  var enrollment = EduEnrollment.requireCourseRole(assignment.course.id, ['STUDENT', 'TA', 'INSTRUCTOR']);
  if (enrollment && enrollment.courseRole == EduEnrollment.CourseRole.STUDENT && assignment.status == EduAssignment.Status.DRAFT) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId + ' is not available yet');
  }
  return collect(Filter.eq('step.assignment.id', assignmentId).and().eq('visibility', EduStepTest.Visibility.VISIBLE));
}

function regradeBundle(assignmentId) {
  var assignment = loadAssignment(assignmentId);
  EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA']);
  return collect(Filter.eq('step.assignment.id', assignmentId));
}

function stepTests(stepId) {
  var step = loadStep(stepId);
  EduEnrollment.requireCourseRole(step.assignment.course.id, ['INSTRUCTOR', 'TA']);
  return collect(Filter.eq('step.id', stepId));
}

function saveForStep(test) {
  if (!test || !test.step || !test.step.id) {
    throw new Error('EDU_VALIDATION: a step test needs a step');
  }
  var stepId = test.step.id;
  if (test.id) {
    var existing = EduStepTest.make({ id: test.id }).get('step.id');
    if (!existing) {
      throw new Error('EDU_NOT_FOUND: test ' + test.id);
    }
    if (!existing.step || existing.step.id != stepId) {
      throw new Error("EDU_VALIDATION: a test can't move to another step");
    }
  }
  var step = loadStep(stepId);
  EduEnrollment.requireCoursePermission(step.assignment.course.id, EduCourse.Permission.EDIT_CONTENT);

  var clean = cleanFields(test);

  var obj = EduStepTest.make({
    id: test.id,
    step: { id: stepId },
    testName: clean.testName,
    code: clean.code,
    visibility: clean.visibility,
    points: test.points,
    timeoutMs: clean.timeoutMs,
    testOrder: test.testOrder != null ? test.testOrder : nextOrder(Filter.eq('step.id', stepId)),
  });
  var saved = test.id ? obj.merge() : obj.create();
  log.info('Saved test {} on step {}', saved.id, stepId);
  return EduStepTest.make({ id: saved.id }).get(TEST_INCLUDE);
}

function removeForStep(testId) {
  var test = EduStepTest.make({ id: testId }).get('step.id');
  if (!test || !test.step) {
    return false;
  }
  var step = loadStep(test.step.id);
  EduEnrollment.requireCoursePermission(step.assignment.course.id, EduCourse.Permission.EDIT_CONTENT);
  EduStepTest.make({ id: testId }).remove();
  log.info('Removed test {} from step {}', testId, test.step.id);
  return true;
}

/* ---- quiz question tests ---------------------------------------------------------------------------------------- */

var QUESTION_TEST_INCLUDE = 'id, question.id, testName, code, visibility, points, timeoutMs, testOrder';

function questionTests(questionId) {
  var q = loadQuestion(questionId);
  EduEnrollment.requireCourseRole(q.quiz.course.id, ['INSTRUCTOR', 'TA']);
  var rows = [];
  EduStepTest.fetchObjStream({ filter: Filter.eq('question.id', questionId), include: QUESTION_TEST_INCLUDE }).each(function (t) {
    rows.push(t);
  });
  rows.sort(function (a, b) {
    var oa = a.testOrder != null ? a.testOrder : 0;
    var ob = b.testOrder != null ? b.testOrder : 0;
    return oa != ob ? oa - ob : String(a.testName).localeCompare(String(b.testName));
  });
  var out = EduStepTest.arrayBuilder();
  rows.forEach(function (t) {
    out.add(t);
  });
  return out.build();
}

function saveForQuestion(test) {
  if (!test || !test.question || !test.question.id) {
    throw new Error('EDU_VALIDATION: a quiz test needs a question');
  }
  var questionId = test.question.id;
  if (test.id) {
    var existing = EduStepTest.make({ id: test.id }).get('question.id');
    if (!existing) {
      throw new Error('EDU_NOT_FOUND: test ' + test.id);
    }
    if (!existing.question || existing.question.id != questionId) {
      throw new Error("EDU_VALIDATION: a test can't move to another question");
    }
  }
  var q = loadQuestion(questionId);
  EduEnrollment.requireCoursePermission(q.quiz.course.id, EduCourse.Permission.EDIT_CONTENT);
  if (q.questionKind != EduQuizQuestion.QuestionKind.CODE) {
    throw new Error('EDU_VALIDATION: only CODE questions have tests');
  }
  var clean = cleanFields(test);
  var obj = EduStepTest.make({
    id: test.id,
    question: { id: questionId },
    testName: clean.testName,
    code: clean.code,
    visibility: clean.visibility,
    points: test.points,
    timeoutMs: clean.timeoutMs,
    testOrder: test.testOrder != null ? test.testOrder : nextOrder(Filter.eq('question.id', questionId)),
  });
  var saved = test.id ? obj.merge() : obj.create();
  log.info('Saved test {} on quiz question {}', saved.id, questionId);
  return EduStepTest.make({ id: saved.id }).get(QUESTION_TEST_INCLUDE);
}

function removeForQuestion(testId) {
  var test = EduStepTest.make({ id: testId }).get('question.id');
  if (!test || !test.question) {
    return false;
  }
  var q = loadQuestion(test.question.id);
  EduEnrollment.requireCoursePermission(q.quiz.course.id, EduCourse.Permission.EDIT_CONTENT);
  EduStepTest.make({ id: testId }).remove();
  log.info('Removed test {} from quiz question {}', testId, test.question.id);
  return true;
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

function loadQuestion(questionId) {
  var q = EduQuizQuestion.make({ id: questionId }).get('questionKind, quiz.id, quiz.course.id');
  if (!q || !q.quiz) {
    throw new Error('EDU_NOT_FOUND: quiz question ' + questionId);
  }
  return q;
}

/** Validated name, code, visibility and time limit of a test from an editor. */
function cleanFields(test) {
  var name = test.testName ? String(test.testName).trim() : '';
  var code = test.code ? String(test.code) : '';
  if (!name) {
    throw new Error('EDU_VALIDATION: the test needs a name');
  }
  if (!/def\s+test_\w*\s*\(/.test(code)) {
    throw new Error('EDU_VALIDATION: the test code needs at least one def test_...() function');
  }
  if (code.length > MAX_CODE_CHARS) {
    throw new Error('EDU_VALIDATION: the test code is longer than ' + MAX_CODE_CHARS + ' characters');
  }
  if (test.timeoutMs != null && (test.timeoutMs < 100 || test.timeoutMs > MAX_TIMEOUT_MS)) {
    throw new Error('EDU_VALIDATION: the time limit must be between 100 and ' + MAX_TIMEOUT_MS + ' ms');
  }
  if (test.points != null && test.points < 0) {
    throw new Error("EDU_VALIDATION: points can't be negative");
  }

  return {
    testName: name,
    code: code,
    visibility: test.visibility || EduStepTest.Visibility.VISIBLE,
    timeoutMs: test.timeoutMs || 5000,
  };
}

function loadAssignment(assignmentId) {
  var a = EduAssignment.make({ id: assignmentId }).get('course.id, status');
  if (!a || !a.course) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId);
  }
  return a;
}

function loadStep(stepId) {
  var s = EduAssignmentStep.make({ id: stepId }).get('assignment.id, assignment.course.id');
  if (!s || !s.assignment) {
    throw new Error('EDU_NOT_FOUND: step ' + stepId);
  }
  return s;
}

/** Tests matching `filter`, ordered by step, then testOrder, then name. */
function collect(filter) {
  var rows = [];
  EduStepTest.fetchObjStream({ filter: filter, include: TEST_INCLUDE }).each(function (t) {
    rows.push(t);
  });
  rows.sort(function (a, b) {
    var sa = a.step && a.step.stepOrder != null ? a.step.stepOrder : 0;
    var sb = b.step && b.step.stepOrder != null ? b.step.stepOrder : 0;
    if (sa != sb) return sa - sb;
    var oa = a.testOrder != null ? a.testOrder : 0;
    var ob = b.testOrder != null ? b.testOrder : 0;
    if (oa != ob) return oa - ob;
    return String(a.testName).localeCompare(String(b.testName));
  });
  var out = EduStepTest.arrayBuilder();
  rows.forEach(function (t) {
    out.add(t);
  });
  return out.build();
}

function nextOrder(filter) {
  var last = EduStepTest.fetch({
    filter: filter,
    include: 'testOrder',
    order: 'descending(testOrder)',
    limit: 1,
  }).objs.first();
  return last && last.testOrder != null ? last.testOrder + 1 : 1;
}
