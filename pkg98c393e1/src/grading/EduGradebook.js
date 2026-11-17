/*
 * EduGradebook — gradebook. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md section 7.3.
 *
 * Scores of record come only from trusted test runs (instructor regrades, later server runs) through computeScore.
 * Everything that shows or exports a score uses the effective score: scoreOverride when set, otherwise score.
 */

var log = Logger.for('EduGradebook');

var STAFF_ROLES = ['INSTRUCTOR', 'TA'];
var MAX_REASON = 1000;
var ATTEMPT_DONE = ['SUBMITTED', 'GRADED'];

function courseGrid(courseId) {
  EduEnrollment.requireCourseRole(courseId, STAFF_ROLES);
  return buildGrid(courseId);
}

function computeScore(submissionId) {
  var sub = loadSubmission(submissionId);
  EduEnrollment.requireCourseRole(sub.assignment.course.id, STAFF_ROLES);
  return scoreOf(sub);
}

function overrideScore(submissionId, score, reason) {
  var sub = loadSubmission(submissionId);
  var courseId = sub.assignment.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_GRADES);
  var why = requireReason(reason);
  if (score == null || isNaN(score)) {
    throw new Error('EDU_VALIDATION: a score is required');
  }
  var max = maxScoreOf(sub.assignment.id);
  if (score < 0 || score > max) {
    throw new Error('EDU_VALIDATION: the score must be between 0 and ' + max);
  }
  var value = round2(score);
  EduSubmission.make({ id: sub.id, scoreOverride: value }).merge();
  EduAuditLog.record(
    'grade.override',
    'EduSubmission',
    sub.id,
    courseId,
    JSON.stringify({ score: nullable(sub.score), scoreOverride: nullable(sub.scoreOverride) }),
    JSON.stringify({ score: nullable(sub.score), scoreOverride: value }),
    why
  );
  log.info('Override on {}: {} -> {}', sub.id, sub.scoreOverride, value);
  return EduSubmission.make({ id: sub.id }).get(SUBMISSION_OUT);
}

function clearOverride(submissionId, reason) {
  var sub = loadSubmission(submissionId);
  var courseId = sub.assignment.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_GRADES);
  var why = requireReason(reason);
  if (sub.scoreOverride != null) {
    EduSubmission.make({ id: sub.id, scoreOverride: null }).merge('scoreOverride');
    EduAuditLog.record(
      'grade.overrideClear',
      'EduSubmission',
      sub.id,
      courseId,
      JSON.stringify({ score: nullable(sub.score), scoreOverride: sub.scoreOverride }),
      JSON.stringify({ score: nullable(sub.score), scoreOverride: null }),
      why
    );
    log.info('Cleared override on {}', sub.id);
  }
  return EduSubmission.make({ id: sub.id }).get(SUBMISSION_OUT);
}

function releaseGrades(assignmentId) {
  var a = EduAssignment.make({ id: assignmentId }).get('id, course.id, status, gradesReleasedAt');
  if (!a || !a.course) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId);
  }
  EduEnrollment.requireCoursePermission(a.course.id, EduCourse.Permission.RELEASE_GRADES);
  if (a.status == EduAssignment.Status.DRAFT) {
    throw new Error("EDU_VALIDATION: a draft assignment's grades can't be released");
  }
  var now = DateTime.now();
  EduAssignment.make({ id: a.id, gradesReleasedAt: now }).merge();
  EduAuditLog.record(
    'grade.release',
    'EduAssignment',
    a.id,
    a.course.id,
    JSON.stringify({ gradesReleasedAt: a.gradesReleasedAt ? String(a.gradesReleasedAt) : null }),
    JSON.stringify({ gradesReleasedAt: String(now) }),
    null
  );
  log.info('Released grades for {}', a.id);
  return EduAssignment.make({ id: a.id }).get('id, title, status, dueAt, gradesReleasedAt, course.id');
}

function exportCsv(courseId) {
  EduEnrollment.requireCourseRole(courseId, STAFF_ROLES);
  var grid = buildGrid(courseId);
  var lines = [];

  var header = ['Student', 'ID', 'SIS User ID', 'Section'];
  var possible = ['    Points Possible', '', '', ''];
  grid.items.each(function (item) {
    header.push(textCell((item.title || item.itemId) + ' (' + item.itemId + ')'));
    possible.push(numberCell(item.maxScore));
  });
  lines.push(header.map(csvField).join(','));
  lines.push(possible.map(csvField).join(','));

  var section = grid.courseCode || '';
  grid.rows.each(function (row) {
    var fields = [textCell(row.displayName || ''), textCell(row.studentId), textCell(row.studentNumber || ''), textCell(section)];
    row.cells.each(function (cell) {
      fields.push(numberCell(cell.score));
    });
    lines.push(fields.map(csvField).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

/* ---- grid ------------------------------------------------------------------------------------------------------ */

var SUBMISSION_OUT = 'id, status, score, scoreOverride, late, flagCount, assignment.id, student.id';

function buildGrid(courseId) {
  var course = EduCourse.make({ id: courseId }).get('code, title');
  if (!course) {
    throw new Error('EDU_NOT_FOUND: course ' + courseId);
  }

  // Columns: assignments that are not drafts, with max score = the sum of their step points.
  var assignments = [];
  EduAssignment.fetchObjStream({
    filter: Filter.eq('course.id', courseId).and().ne('status', EduAssignment.Status.DRAFT),
    include: 'id, title, dueAt, gradesReleasedAt, fileKind',
  }).each(function (a) {
    assignments.push(a);
  });
  var stepPoints = {};
  EduAssignmentStep.fetchObjStream({ filter: Filter.eq('assignment.course.id', courseId), include: 'assignment.id, points' }).each(
    function (s) {
      stepPoints[s.assignment.id] = (stepPoints[s.assignment.id] || 0) + (s.points || 0);
    }
  );
  assignments.sort(byDateThenTitle('dueAt'));

  // Quizzes: cheap columns from EduQuizAttempt.score; quiz grading itself lives in EduQuizAttempt.
  var quizzes = [];
  EduQuiz.fetchObjStream({
    filter: Filter.eq('course.id', courseId).and().ne('status', EduQuiz.Status.DRAFT),
    include: 'id, title, closesAt',
  }).each(function (q) {
    quizzes.push(q);
  });
  quizzes.sort(byDateThenTitle('closesAt'));
  var quizPoints = {};
  var attempts = {};
  if (quizzes.length) {
    EduQuizQuestion.fetchObjStream({ filter: Filter.eq('quiz.course.id', courseId), include: 'quiz.id, points' }).each(function (q) {
      quizPoints[q.quiz.id] = (quizPoints[q.quiz.id] || 0) + (q.points || 0);
    });
    EduQuizAttempt.fetchObjStream({
      filter: Filter.eq('quiz.course.id', courseId),
      include: 'id, quiz.id, student.id, score, status',
    }).each(function (at) {
      var key = at.student.id + '|' + at.quiz.id;
      attempts[key] = betterAttempt(attempts[key], at);
    });
  }

  var items = EduGradebook.Item.arrayBuilder();
  var order = [];
  assignments.forEach(function (a) {
    items.add(
      EduGradebook.Item.make({
        itemId: a.id,
        itemKind: EduGradebook.ItemKind.ASSIGNMENT,
        title: a.title,
        maxScore: round2(stepPoints[a.id] || 0),
        dueAt: a.dueAt,
        fileKind: a.fileKind,
        gradesReleasedAt: a.gradesReleasedAt,
      })
    );
    order.push({ id: a.id, quiz: false });
  });
  quizzes.forEach(function (q) {
    items.add(
      EduGradebook.Item.make({
        itemId: q.id,
        itemKind: EduGradebook.ItemKind.QUIZ,
        title: q.title,
        maxScore: round2(quizPoints[q.id] || 0),
        dueAt: q.closesAt,
      })
    );
    order.push({ id: q.id, quiz: true });
  });

  var subs = {};
  EduSubmission.fetchObjStream({
    filter: Filter.eq('assignment.course.id', courseId),
    include: 'id, assignment.id, student.id, status, score, scoreOverride, late, flagCount',
  }).each(function (s) {
    subs[s.student.id + '|' + s.assignment.id] = s;
  });

  var students = [];
  EduEnrollment.fetchObjStream({
    filter: Filter.eq('course.id', courseId)
      .and()
      .eq('courseRole', EduEnrollment.CourseRole.STUDENT)
      .and()
      .eq('status', EduEnrollment.Status.ACTIVE),
    include: 'person.id, person.displayName, person.studentNumber',
  }).each(function (e) {
    if (e.person) {
      students.push(e.person);
    }
  });
  students.sort(function (a, b) {
    var c = String(a.displayName || '').localeCompare(String(b.displayName || ''));
    return c != 0 ? c : String(a.id).localeCompare(String(b.id));
  });

  var rows = EduGradebook.Row.arrayBuilder();
  students.forEach(function (p) {
    var cells = EduGradebook.Cell.arrayBuilder();
    order.forEach(function (col) {
      var key = p.id + '|' + col.id;
      cells.add(col.quiz ? quizCell(col.id, attempts[key]) : assignmentCell(col.id, subs[key]));
    });
    rows.add(
      EduGradebook.Row.make({
        studentId: p.id,
        displayName: p.displayName,
        studentNumber: p.studentNumber,
        cells: cells.build(),
      })
    );
  });

  return EduGradebook.Grid.make({ courseCode: course.code, courseTitle: course.title, items: items.build(), rows: rows.build() });
}

function assignmentCell(itemId, s) {
  if (!s) {
    return EduGradebook.Cell.make({ itemId: itemId, status: EduSubmission.Status.NOT_STARTED });
  }
  return EduGradebook.Cell.make({
    itemId: itemId,
    workId: s.id,
    score: effectiveScore(s),
    autoScore: s.score,
    overridden: s.scoreOverride != null,
    late: !!s.late,
    flagCount: s.flagCount || 0,
    status: s.status || EduSubmission.Status.NOT_STARTED,
  });
}

function quizCell(itemId, at) {
  if (!at) {
    return EduGradebook.Cell.make({ itemId: itemId, status: EduSubmission.Status.NOT_STARTED });
  }
  return EduGradebook.Cell.make({
    itemId: itemId,
    workId: at.id,
    score: at.score,
    autoScore: at.score,
    overridden: false,
    late: false,
    flagCount: 0,
    status: at.status,
  });
}

/** Best submitted attempt (highest score); an in-progress attempt only when nothing was submitted. */
function betterAttempt(current, next) {
  if (!current) {
    return next;
  }
  var curDone = ATTEMPT_DONE.indexOf(current.status) >= 0;
  var nextDone = ATTEMPT_DONE.indexOf(next.status) >= 0;
  if (curDone != nextDone) {
    return nextDone ? next : current;
  }
  return (next.score || 0) > (current.score || 0) ? next : current;
}

/** scoreOverride when set, otherwise the computed score. */
function effectiveScore(s) {
  return s.scoreOverride != null ? s.scoreOverride : s.score;
}

/* ---- score computation ----------------------------------------------------------------------------------------- */

function loadSubmission(submissionId) {
  var sub = EduSubmission.make({ id: submissionId }).get(
    'id, status, score, scoreOverride, late, assignment.id, assignment.course.id, assignment.latePenaltyPct'
  );
  if (!sub || !sub.assignment || !sub.assignment.course) {
    throw new Error('EDU_NOT_FOUND: submission ' + submissionId);
  }
  return sub;
}

function maxScoreOf(assignmentId) {
  var max = 0;
  EduAssignmentStep.fetchObjStream({ filter: Filter.eq('assignment.id', assignmentId), include: 'points' }).each(function (s) {
    max += s.points || 0;
  });
  return round2(max);
}

/**
 * Score from the newest trusted run of every step. Step score = step points × (points of fully passing tests ÷
 * test points on the step), or by test count when the step's tests have no points. Late penalty applied last.
 */
function scoreOf(sub) {
  var assignmentId = sub.assignment.id;

  var steps = [];
  EduAssignmentStep.fetchObjStream({ filter: Filter.eq('assignment.id', assignmentId), include: 'id, points' }).each(function (s) {
    steps.push(s);
  });

  var testsByStep = {};
  EduStepTest.fetchObjStream({ filter: Filter.eq('step.assignment.id', assignmentId), include: 'id, step.id, points' }).each(
    function (t) {
      (testsByStep[t.step.id] = testsByStep[t.step.id] || []).push(t);
    }
  );

  var newest = {};
  EduTestRun.fetchObjStream({
    filter: Filter.eq('submission.id', sub.id).and().eq('trusted', true),
    include: 'id, step.id, results, meta.created',
  }).each(function (run) {
    var prev = newest[run.step.id];
    if (!prev || run.meta.created.isAfter(prev.meta.created)) {
      newest[run.step.id] = run;
    }
  });

  var total = 0;
  steps.forEach(function (step) {
    var run = newest[step.id];
    var tests = testsByStep[step.id] || [];
    if (!run || !tests.length || !step.points) {
      return;
    }
    var rows = {};
    if (run.results) {
      run.results.each(function (r) {
        var seen = rows[r.testId];
        rows[r.testId] = seen === undefined ? !!r.passed : seen && !!r.passed;
      });
    }
    var testPoints = 0;
    var passedPoints = 0;
    var passedCount = 0;
    tests.forEach(function (t) {
      var ok = rows[t.id] === true;
      testPoints += t.points || 0;
      if (ok) {
        passedPoints += t.points || 0;
        passedCount++;
      }
    });
    var share = testPoints > 0 ? passedPoints / testPoints : passedCount / tests.length;
    total += step.points * share;
  });

  var pct = sub.assignment.latePenaltyPct;
  if (sub.late && pct) {
    total = total * (1 - Math.min(Math.max(pct, 0), 100) / 100);
  }
  return round2(total);
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

function requireReason(reason) {
  var why = reason == null ? '' : String(reason).trim();
  if (!why) {
    throw new Error('EDU_VALIDATION: a reason is required');
  }
  return why.length > MAX_REASON ? why.substring(0, MAX_REASON) : why;
}

function round2(x) {
  return Math.round((x + 1e-9) * 100) / 100;
}

function nullable(x) {
  return x == null ? null : x;
}

function byDateThenTitle(field) {
  return function (a, b) {
    var da = a[field];
    var db = b[field];
    if (da && db && (da.isBefore(db) || db.isBefore(da))) {
      return da.isBefore(db) ? -1 : 1;
    }
    if (da && !db) return -1;
    if (!da && db) return 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  };
}

/** Text that a spreadsheet would read as a formula gets a leading apostrophe. */
function textCell(s) {
  var str = s == null ? '' : String(s);
  return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
}

function numberCell(x) {
  return x == null ? '' : String(round2(x));
}

function csvField(s) {
  var str = s == null ? '' : String(s);
  return /[",\r\n]|^\s|\s$/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
