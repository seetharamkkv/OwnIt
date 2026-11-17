/*
 * EduTestRun — recorded test runs. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md section 7.
 *
 * Browser runs (recordMine) are feedback only: trusted=false, and they never change a score. Only results for the
 * step's VISIBLE tests are kept, and pass counts are recomputed here, so a browser can't claim hidden tests.
 */

var log = Logger.for('EduTestRun');

var MAX_RESULTS = 200;
var MAX_MESSAGE = 2000;
var MAX_STDOUT = 4000;
var MAX_NAME = 200;

function recordMine(stepId, results) {
  var step = EduAssignmentStep.make({ id: stepId }).get('assignment.id');
  if (!step || !step.assignment) {
    throw new Error('EDU_NOT_FOUND: step ' + stepId);
  }
  var userId = EduSession.currentUserId();
  var sub = EduSubmission.fetch({
    filter: Filter.eq('assignment.id', step.assignment.id).and().eq('student.id', userId),
    include: 'id',
    limit: 1,
  }).objs.first();
  if (!sub) {
    throw new Error('EDU_NOT_FOUND: open the assignment before running tests');
  }

  var visible = {};
  EduStepTest.fetchObjStream({
    filter: Filter.eq('step.id', stepId).and().eq('visibility', EduStepTest.Visibility.VISIBLE),
    include: 'id',
  }).each(function (t) {
    visible[t.id] = true;
  });

  var clean = EduTestResult.arrayBuilder();
  var passed = 0;
  var total = 0;
  results.each(function (r) {
    if (!r || !visible[r.testId] || total >= MAX_RESULTS) {
      return;
    }
    clean.add(cleanResult(r));
    total++;
    if (r.passed) {
      passed++;
    }
  });
  if (total == 0) {
    throw new Error('EDU_VALIDATION: no results for the visible tests of this step');
  }

  var run = EduTestRun.make({
    submission: { id: sub.id },
    step: { id: stepId },
    mode: EduTestRun.Mode.BROWSER,
    results: clean.build(),
    passedCount: passed,
    totalCount: total,
    trusted: false,
  }).create();

  var response = EduStepResponse.fetch({
    filter: Filter.eq('submission.id', sub.id).and().eq('step.id', stepId),
    include: 'id',
    limit: 1,
  }).objs.first();
  if (response) {
    EduStepResponse.make({
      id: response.id,
      lastVisibleResult: EduTestSummary.make({ passedCount: passed, totalCount: total, ranAt: DateTime.now() }),
    }).merge();
  }
  log.info('Browser run on step {} for submission {}: {}/{}', stepId, sub.id, passed, total);
  return EduTestRun.make({ id: run.id }).get('id, submission.id, step.id, mode, results, passedCount, totalCount, trusted, meta.created');
}

/*
 * Regrades (recordRegrade) come from an instructor's browser running visible AND hidden tests. They are trusted and
 * set the score. Results are still filtered to the step's own tests and recounted here.
 */
function recordRegrade(submissionId, stepId, results) {
  var sub = EduSubmission.make({ id: submissionId }).get('id, status, score, assignment.id, assignment.course.id');
  if (!sub || !sub.assignment) {
    throw new Error('EDU_NOT_FOUND: submission ' + submissionId);
  }
  var courseId = sub.assignment.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.EDIT_GRADES);

  var step = EduAssignmentStep.make({ id: stepId }).get('assignment.id');
  if (!step || !step.assignment || step.assignment.id != sub.assignment.id) {
    throw new Error('EDU_VALIDATION: step ' + stepId + " is not part of this submission's assignment");
  }

  var known = {};
  EduStepTest.fetchObjStream({ filter: Filter.eq('step.id', stepId), include: 'id' }).each(function (t) {
    known[t.id] = true;
  });

  var clean = EduTestResult.arrayBuilder();
  var passed = 0;
  var total = 0;
  results.each(function (r) {
    if (!r || !known[r.testId] || total >= MAX_RESULTS) {
      return;
    }
    clean.add(cleanResult(r));
    total++;
    if (r.passed) {
      passed++;
    }
  });
  if (total == 0) {
    throw new Error('EDU_VALIDATION: no results for the tests of this step');
  }

  var run = EduTestRun.make({
    submission: { id: sub.id },
    step: { id: stepId },
    mode: EduTestRun.Mode.INSTRUCTOR_REGRADE,
    results: clean.build(),
    passedCount: passed,
    totalCount: total,
    trusted: true,
  }).create();

  var before = sub.score;
  var after = EduGradebook.computeScore(sub.id);
  var changes = { id: sub.id, score: after };
  if (sub.status == EduSubmission.Status.SUBMITTED) {
    changes.status = EduSubmission.Status.GRADED;
  }
  EduSubmission.make(changes).merge();
  if (before !== after) {
    EduAuditLog.record(
      'grade.regrade',
      'EduSubmission',
      sub.id,
      courseId,
      JSON.stringify({ score: before == null ? null : before }),
      JSON.stringify({ score: after, stepId: stepId, runId: run.id }),
      null
    );
  }
  log.info('Regrade run on step {} for submission {}: {}/{}, score {} -> {}', stepId, sub.id, passed, total, before, after);
  return EduTestRun.make({ id: run.id }).get('id, submission.id, step.id, mode, results, passedCount, totalCount, trusted, meta.created');
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

/** A result with bounded string sizes. */
function cleanResult(r) {
  return EduTestResult.make({
    testId: r.testId,
    testName: truncate(r.testName, MAX_NAME),
    passed: !!r.passed,
    message: truncate(r.message, MAX_MESSAGE),
    stdout: truncate(r.stdout, MAX_STDOUT),
    durationMs: r.durationMs != null && r.durationMs >= 0 ? Math.floor(r.durationMs) : null,
  });
}

function truncate(s, max) {
  if (s == null) {
    return null;
  }
  var str = String(s);
  return str.length > max ? str.substring(0, max) : str;
}
