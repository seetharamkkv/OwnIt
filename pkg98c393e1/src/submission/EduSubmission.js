/*
 * EduSubmission — a student's work on an assignment. Owner: Keya (student workspace).
 * Always get the student from EduSession.currentUserId(). PROJECT_PLAN.md section 5.4.
 */

var log = Logger.for('EduSubmission');

/** Statuses after which the student can no longer change the submission. */
var LOCKED_STATUSES = ['SUBMITTED', 'GRADED', 'RETURNED'];

var ASSIGNMENT_INCLUDE = 'id, title, fileKind, status, releaseAt, dueAt, lateUntil, course.id';

var SUBMISSION_INCLUDE = [
  'id, status, startedAt, submittedAt, extensionUntil, assembledFileUrl, canaryToken, late, flagCount, score, scoreOverride',
  'student.id, student.displayName, student.studentNumber',
  'assignment.id, assignment.title, assignment.descriptionMd, assignment.fileKind, assignment.status',
  'assignment.releaseAt, assignment.dueAt, assignment.lateUntil, assignment.latePenaltyPct, assignment.testDataFiles',
  'assignment.course.id, assignment.course.code, assignment.course.title',
].join(', ');

var RESPONSE_INCLUDE = [
  'id, content, contentFormat, revision, completed, lastVisibleResult, meta.updated',
  'step.id, step.stepOrder, step.markerId, step.title, step.instructionsMd, step.starterContent',
  'step.contextBefore, step.contextAfter, step.cellIndex, step.points, step.independentOfPrevious',
].join(', ');

function startMine(assignmentId) {
  var userId = EduSession.currentUserId();
  var assignment = loadOpenAssignment(assignmentId);
  requireStudent(assignment.course.id);

  var existing = findSubmission(assignmentId, userId, 'id, canaryToken, startedAt');
  var submissionId;
  if (existing) {
    submissionId = existing.id;
    if (!existing.startedAt) {
      // Created ahead of time by grantExtension; this is the student's first visit.
      EduSubmission.make({ id: submissionId, startedAt: DateTime.now() }).merge();
    }
  } else {
    try {
      submissionId = EduSubmission.make({
        assignment: { id: assignmentId },
        student: { id: userId },
        status: EduSubmission.Status.NOT_STARTED,
        startedAt: DateTime.now(),
      }).create().id;
      log.info('Started submission {} for {} on {}', submissionId, userId, assignmentId);
    } catch (e) {
      // A second tab may have created it at the same moment; the unique (assignment, student) index wins.
      existing = findSubmission(assignmentId, userId, 'id, canaryToken');
      if (!existing) {
        throw e;
      }
      submissionId = existing.id;
    }
  }

  ensureResponses(submissionId, assignmentId, assignment.fileKind);

  if (!existing || !existing.canaryToken) {
    try {
      EduCanary.issueToken(submissionId);
    } catch (e) {
      // Canary tokens are Seetharam's; a missing or failing implementation must not block the student.
      log.warn('No canary token for {}: {}', submissionId, e.message);
    }
  }

  return mySubmission(assignmentId);
}

function mySubmission(assignmentId) {
  var userId = EduSession.currentUserId();
  var sub = findSubmission(assignmentId, userId, SUBMISSION_INCLUDE);
  if (!sub) {
    return null;
  }

  var responses = EduStepResponse.fetch({
    filter: Filter.eq('submission.id', sub.id),
    include: RESPONSE_INCLUDE,
    order: 'ascending(step.stepOrder)',
    limit: 500,
  }).objs;
  sub = sub.withResponses(responses);

  // The notebook editor draws every cell of the template, so students need the notebook JSON. It holds starter
  // code only; tests live in EduStepTest.
  if (sub.assignment.fileKind == EduAssignment.FileKind.IPYNB) {
    var full = EduAssignment.make({ id: assignmentId }).get('templateContent');
    sub = sub.withAssignment(sub.assignment.withTemplateContent(full.templateContent));
  }
  return sub;
}

function submitMine(assignmentId) {
  var userId = EduSession.currentUserId();
  var assignment = loadOpenAssignment(assignmentId);
  requireStudent(assignment.course.id);

  var sub = findSubmission(assignmentId, userId, 'id, status, extensionUntil');
  if (!sub) {
    throw new Error('EDU_NOT_FOUND: open the assignment before submitting it');
  }
  if (LOCKED_STATUSES.indexOf(sub.status) >= 0) {
    return mySubmission(assignmentId);
  }

  var now = DateTime.now();
  var deadline = finalDeadline(assignment, sub);
  if (deadline && now.isAfter(deadline)) {
    throw new Error('EDU_DEADLINE_PASSED: the last moment to submit was ' + deadline);
  }
  EduIntegrityEvent.assertNotLocked(EduIntegrityEvent.ContextKind.ASSIGNMENT, sub.id);
  var due = sub.extensionUntil || assignment.dueAt;
  var late = !!(due && now.isAfter(due));

  EduSubmission.make({
    id: sub.id,
    status: EduSubmission.Status.SUBMITTED,
    submittedAt: now,
    late: late,
  }).merge();
  log.info('Submitted {} (late: {})', sub.id, late);

  try {
    EduAssembler.assemble(sub.id);
  } catch (e) {
    // The submission is locked either way; EduAssembler.downloadLink assembles again on first download.
    log.error('Assembly failed for {}: {}', sub.id, e.message);
  }
  try {
    EduCanary.detect(sub.id);
  } catch (e) {
    log.warn('Canary detection skipped for {}: {}', sub.id, e.message);
  }

  return mySubmission(assignmentId);
}

function myAssignments(courseId) {
  var userId = EduSession.currentUserId();
  EduEnrollment.requireCourseRole(courseId, ['STUDENT', 'TA', 'INSTRUCTOR']);
  return assignmentRows(courseId, userId);
}

function myDashboard() {
  var userId = EduSession.currentUserId();
  var now = DateTime.now();
  var weekAhead = now.plusDays(7);

  var assignments = EduSubmission.MyAssignmentRow.arrayBuilder();
  var quizzes = EduQuiz.MyQuizRow.arrayBuilder();
  var graded = [];
  var dueSoon = 0, inProgress = 0, lateWindow = 0;

  EduEnrollment.fetchObjStream({
    filter: Filter.eq('person.id', userId)
      .and().eq('courseRole', EduEnrollment.CourseRole.STUDENT)
      .and().eq('status', EduEnrollment.Status.ACTIVE)
      .and().eq('course.archived', false),
    include: 'course.id, course.code',
  }).each(function (e) {
    assignmentRows(e.course.id, userId).each(function (row) {
      assignments.add(row);
      var open = row.status == EduSubmission.Status.NOT_STARTED || row.status == EduSubmission.Status.IN_PROGRESS;
      if (open && row.status == EduSubmission.Status.IN_PROGRESS) {
        inProgress++;
      }
      if (open && row.dueAt) {
        if (row.dueAt.isAfter(now)) {
          if (!row.dueAt.isAfter(weekAhead)) dueSoon++;
        } else if (row.lateUntil && row.lateUntil.isAfter(now)) {
          lateWindow++;
        }
      }
      if (row.gradesReleasedAt && row.score != null) {
        graded.push(EduSubmission.GradedRow.make({
          itemKind: 'ASSIGNMENT', itemId: row.assignmentId, title: row.title, courseCode: row.courseCode,
          score: row.score, maxScore: row.totalPoints, gradedAt: row.gradesReleasedAt,
        }));
      }
    });

    var rows;
    try {
      rows = EduQuiz.myQuizzes(e.course.id);
    } catch (err) {
      if (String(err.message).indexOf('EDU_FEATURE_DISABLED') < 0) {
        throw err;
      }
      rows = null;
    }
    if (rows) {
      rows.each(function (q) {
        quizzes.add(q);
        var handedIn = q.attemptsUsed > 0 && !q.openAttemptId;
        if (!handedIn && q.closesAt && q.closesAt.isAfter(now) && !q.closesAt.isAfter(weekAhead)) {
          dueSoon++;
        }
        if (q.resultsVisible && q.bestScore != null) {
          graded.push(EduSubmission.GradedRow.make({
            itemKind: 'QUIZ', itemId: q.quizId, title: q.title, courseCode: q.courseCode,
            score: q.bestScore, maxScore: q.maxScore, gradedAt: q.closesAt,
          }));
        }
      });
    }
  });

  graded.sort(function (a, b) {
    var ta = a.gradedAt ? a.gradedAt.getMillis() : 0, tb = b.gradedAt ? b.gradedAt.getMillis() : 0;
    return tb - ta;
  });
  var recent = EduSubmission.GradedRow.arrayBuilder();
  graded.slice(0, 5).forEach(function (g) { recent.add(g); });

  return EduSubmission.Dashboard.make({
    assignments: assignments.build(),
    quizzes: quizzes.build(),
    dueSoonCount: dueSoon,
    inProgressCount: inProgress,
    lateWindowCount: lateWindow,
    recentlyGraded: recent.build(),
  });
}

/** Rows for one course. The caller has already checked that `userId` may see the course. */
function assignmentRows(courseId, userId) {
  var now = DateTime.now();
  var course = EduCourse.make({ id: courseId }).get('code, title');

  var assignments = EduAssignment.fetch({
    filter: Filter.eq('course.id', courseId).and().ne('status', EduAssignment.Status.DRAFT),
    include: 'id, title, fileKind, releaseAt, dueAt, lateUntil, latePenaltyPct, gradesReleasedAt',
    order: 'ascending(dueAt)',
    limit: 200,
  }).objs.filter(function (a) {
    return !a.releaseAt || !a.releaseAt.isAfter(now);
  });

  // Steps per assignment, in order, for totals, points and the "next step" pointer.
  var stepsByAssignment = {};
  EduAssignmentStep.fetchObjStream({
    filter: Filter.eq('assignment.course.id', courseId),
    include: 'id, stepOrder, title, points, assignment.id',
    order: 'ascending(stepOrder)',
  }).each(function (s) {
    (stepsByAssignment[s.assignment.id] = stepsByAssignment[s.assignment.id] || []).push(s);
  });

  var subsByAssignment = {};
  EduSubmission.fetchObjStream({
    filter: Filter.eq('student.id', userId).and().eq('assignment.course.id', courseId),
    include: 'id, status, late, extensionUntil, submittedAt, score, scoreOverride, assignment.id',
  }).each(function (s) {
    subsByAssignment[s.assignment.id] = s;
  });

  // Per submission: completed step ids and failing visible tests.
  var progressBySubmission = {};
  EduStepResponse.fetchObjStream({
    filter: Filter.eq('submission.student.id', userId).and().eq('submission.assignment.course.id', courseId),
    include: 'completed, lastVisibleResult, submission.id, step.id',
  }).each(function (r) {
    var p = (progressBySubmission[r.submission.id] = progressBySubmission[r.submission.id] || { done: {}, failing: 0 });
    if (r.completed) p.done[r.step.id] = true;
    var lv = r.lastVisibleResult;
    if (lv && lv.totalCount != null && lv.passedCount != null && lv.totalCount > lv.passedCount) {
      p.failing += lv.totalCount - lv.passedCount;
    }
  });

  var rows = EduSubmission.MyAssignmentRow.arrayBuilder();
  assignments.each(function (a) {
    var sub = subsByAssignment[a.id];
    var steps = stepsByAssignment[a.id] || [];
    var progress = sub ? progressBySubmission[sub.id] : null;
    var totalPoints = 0, completed = 0, next = null;
    steps.forEach(function (s) {
      totalPoints += s.points || 0;
      if (progress && progress.done[s.id]) {
        completed++;
      } else if (!next) {
        next = s;
      }
    });
    var released = !!a.gradesReleasedAt;
    rows.add(EduSubmission.MyAssignmentRow.make({
      assignmentId: a.id,
      title: a.title,
      fileKind: a.fileKind,
      courseId: courseId,
      courseCode: course ? course.code : null,
      courseTitle: course ? course.title : null,
      releaseAt: a.releaseAt,
      dueAt: (sub && sub.extensionUntil) || a.dueAt,
      lateUntil: a.lateUntil,
      latePenaltyPct: a.latePenaltyPct,
      status: sub ? sub.status : EduSubmission.Status.NOT_STARTED,
      submittedAt: sub ? sub.submittedAt : null,
      completedSteps: completed,
      totalSteps: steps.length,
      totalPoints: totalPoints,
      nextStepOrder: next ? next.stepOrder : null,
      nextStepTitle: next ? next.title : null,
      failingVisibleTests: progress ? progress.failing : 0,
      late: !!(sub && sub.late),
      gradesReleasedAt: a.gradesReleasedAt,
      score: released && sub ? (sub.scoreOverride != null ? sub.scoreOverride : sub.score) : null,
    }));
  });
  return rows.build();
}

/** Latest moment the student may still save or submit: extension, late window, or due date. Null means none. */
function finalDeadline(assignment, submission) {
  var latest = null;
  [submission && submission.extensionUntil, assignment.lateUntil, assignment.dueAt].forEach(function (d) {
    if (d && (!latest || d.isAfter(latest))) {
      latest = d;
    }
  });
  return latest;
}

function requireEditable(stepId) {
  var userId = EduSession.currentUserId();
  var step = EduAssignmentStep.make({ id: stepId }).get('id, assignment.id');
  if (!step) {
    throw new Error('EDU_NOT_FOUND: step ' + stepId);
  }
  var assignment = loadOpenAssignment(step.assignment.id);
  requireStudent(assignment.course.id);
  if (assignment.status == EduAssignment.Status.CLOSED) {
    throw new Error('EDU_DEADLINE_PASSED: the assignment is closed');
  }
  var sub = findSubmission(assignment.id, userId, 'id, status, extensionUntil');
  if (!sub) {
    throw new Error('EDU_NOT_FOUND: open the assignment before saving');
  }
  if (LOCKED_STATUSES.indexOf(sub.status) >= 0) {
    throw new Error('EDU_DEADLINE_PASSED: the submission was already handed in');
  }
  var deadline = finalDeadline(assignment, sub);
  if (deadline && DateTime.now().isAfter(deadline)) {
    throw new Error('EDU_DEADLINE_PASSED: the last moment to save was ' + deadline);
  }
  // A session frozen by the integrity layer (too many tab switches) can't be changed until an instructor unlocks it.
  EduIntegrityEvent.assertNotLocked(EduIntegrityEvent.ContextKind.ASSIGNMENT, sub.id);
  return EduSubmission.EditContext.make({
    submissionId: sub.id,
    submissionStatus: sub.status,
    fileKind: assignment.fileKind,
  });
}

function grantExtension(assignmentId, studentId, reason, until) {
  var assignment = EduAssignment.make({ id: assignmentId }).get('id, dueAt, course.id');
  if (!assignment) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId);
  }
  var courseId = assignment.course.id;
  EduEnrollment.requireCoursePermission(courseId, EduCourse.Permission.GRANT_EXTENSIONS);
  if (!reason || !String(reason).trim()) {
    throw new Error('EDU_VALIDATION: a reason is required for the audit log');
  }

  var enrolled = EduEnrollment.fetch({
    filter: Filter.eq('course.id', courseId)
      .and().eq('person.id', studentId)
      .and().eq('courseRole', EduEnrollment.CourseRole.STUDENT)
      .and().eq('status', EduEnrollment.Status.ACTIVE),
    include: 'id',
    limit: 1,
  }).objs.first();
  if (!enrolled) {
    throw new Error('EDU_VALIDATION: ' + studentId + ' is not an active student in this course');
  }
  if (until && assignment.dueAt && !until.isAfter(assignment.dueAt)) {
    throw new Error('EDU_VALIDATION: the extension must end after the due date (' + assignment.dueAt + ')');
  }

  var sub = findSubmission(assignmentId, studentId, 'id, status, extensionUntil');
  if (sub && LOCKED_STATUSES.indexOf(sub.status) >= 0) {
    throw new Error('EDU_VALIDATION: the work was already handed in, so it can no longer be extended');
  }
  if (!sub && !until) {
    throw new Error('EDU_NOT_FOUND: there is no extension to remove');
  }

  var before = sub && sub.extensionUntil ? String(sub.extensionUntil) : null;
  var id;
  if (sub) {
    id = sub.id;
    // Name the field so a null `until` clears it (a plain merge skips null fields).
    EduSubmission.make({ id: id, extensionUntil: until || null }).merge('extensionUntil');
  } else {
    id = EduSubmission.make({
      assignment: { id: assignmentId },
      student: { id: studentId },
      status: EduSubmission.Status.NOT_STARTED,
      extensionUntil: until,
    }).create().id;
  }

  EduAuditLog.record(
    until ? 'extension.grant' : 'extension.clear',
    'EduSubmission',
    id,
    courseId,
    JSON.stringify({ extensionUntil: before }),
    JSON.stringify({ extensionUntil: until ? String(until) : null }),
    String(reason).trim()
  );
  log.info('Extension for {} on {} set to {}', studentId, assignmentId, until || 'none');
  return EduSubmission.make({ id: id }).get('id, status, extensionUntil, late, student.id, student.displayName, assignment.id');
}

/** Loads an assignment a student may open: published or closed, and already released. */
function loadOpenAssignment(assignmentId) {
  var assignment = EduAssignment.make({ id: assignmentId }).get(ASSIGNMENT_INCLUDE);
  if (!assignment) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId);
  }
  var visible = assignment.status == EduAssignment.Status.PUBLISHED || assignment.status == EduAssignment.Status.CLOSED;
  if (!visible || (assignment.releaseAt && assignment.releaseAt.isAfter(DateTime.now()))) {
    throw new Error('EDU_NOT_FOUND: assignment ' + assignmentId + ' is not available yet');
  }
  return assignment;
}

/**
 * Only enrolled students have submissions. Platform admins pass requireCourseRole with a null enrollment, so they are
 * sent to preview mode (or a student persona) instead of getting a submission of their own.
 */
function requireStudent(courseId) {
  var enrollment = EduEnrollment.requireCourseRole(courseId, ['STUDENT']);
  if (!enrollment) {
    throw new Error('EDU_FORBIDDEN: only enrolled students work on assignments; use preview, or act as a student persona');
  }
  return enrollment;
}

function findSubmission(assignmentId, userId, include) {
  return EduSubmission.fetch({
    filter: Filter.eq('assignment.id', assignmentId).and().eq('student.id', userId),
    include: include,
    limit: 1,
  }).objs.first();
}

/** Creates a response with the starter content for every step that has none yet (steps can be added later). */
function ensureResponses(submissionId, assignmentId, fileKind) {
  var have = {};
  EduStepResponse.fetchObjStream({ filter: Filter.eq('submission.id', submissionId), include: 'step.id' }).each(function (r) {
    have[r.step.id] = true;
  });

  var format = fileKind == EduAssignment.FileKind.DOCX ? EduStepResponse.ContentFormat.HTML : EduStepResponse.ContentFormat.TEXT;
  var missing = EduStepResponse.arrayBuilder();
  EduAssignmentStep.fetchObjStream({ filter: Filter.eq('assignment.id', assignmentId), include: 'id, starterContent' }).each(function (s) {
    if (!have[s.id]) {
      missing.add(EduStepResponse.make({
        submission: { id: submissionId },
        step: { id: s.id },
        content: s.starterContent || '',
        contentFormat: format,
        revision: 0,
        completed: false,
      }));
    }
  });

  var rows = missing.build();
  if (!rows.isEmpty()) {
    try {
      EduStepResponse.createBatch(rows);
    } catch (e) {
      // Another tab created them at the same moment; the unique (submission, step) index keeps one of each.
      log.warn('Some responses for {} already existed: {}', submissionId, e.message);
    }
  }
}
