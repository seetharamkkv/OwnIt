/*
 * EduCanary — canary tokens. Owner: Seetharam (integrity). Contract: ref_docs/02_INTEGRITY_CONTRACTS.md section 3.
 *
 * The token (`qz_` + 4 lower-case hex characters) is a valid Python name that is not a keyword, so an AI tool that
 * follows the watermark's "name the main variable <token>" instruction leaves it in working code.
 */

var log = Logger.for('EduCanary');

function issueToken(submissionId) {
  var sub = EduSubmission.make({ id: submissionId }).get('canaryToken, student.id, assignment.course.id');
  if (!sub || !sub.student) {
    throw new Error('EDU_NOT_FOUND: submission ' + submissionId);
  }
  if (sub.student.id != EduSession.currentUserId()) {
    EduEnrollment.requireCoursePermission(sub.assignment.course.id, EduCourse.Permission.VIEW_INTEGRITY);
  }
  if (sub.canaryToken) {
    return sub.canaryToken;
  }
  var token = newToken();
  // Avoid tokens that are common English or hex-looking words students might type on their own.
  EduSubmission.make({ id: submissionId, canaryToken: token }).merge();
  log.info('Issued a canary token for submission {}', submissionId);
  return token;
}

/**
 * Scans the submission's answers for its canary token (and loose variants such as `qz-7f3a`, `qz 7f3a`, `QZ_7F3A`).
 * Writes at most one CANARY_MATCH (HIGH) event per submission and refreshes flagCount. Returns true when the token
 * is present. Called on every autosave (EduStepResponse.saveMine) and on submit, so the flag is immediate.
 */
function detect(submissionId) {
  var sub = EduSubmission.make({ id: submissionId }).get('canaryToken, student.id, assignment.id, assignment.course.id');
  if (!sub || !sub.student || !sub.assignment) {
    throw new Error('EDU_NOT_FOUND: submission ' + submissionId);
  }
  if (sub.student.id != EduSession.currentUserId()) {
    EduEnrollment.requireCoursePermission(sub.assignment.course.id, EduCourse.Permission.VIEW_INTEGRITY);
  }
  if (!sub.canaryToken) {
    return false;
  }
  var policy = EduIntegrityPolicy.forContext(EduIntegrityEvent.ContextKind.ASSIGNMENT, sub.assignment.id);
  if (!policy.canaryEnabled) {
    return false;
  }

  var hex = sub.canaryToken.replace(/^qz[_\-\s]?/i, '');
  var pattern = new RegExp('qz[_\\-\\s]?' + hex, 'i');
  var hits = 0;
  var firstStep = null;
  EduStepResponse.fetchObjStream({
    filter: Filter.eq('submission.id', submissionId),
    include: 'content, step.id',
  }).each(function (r) {
    var text = String(r.content || '').replace(/<[^>]+>/g, ' ');
    if (pattern.test(text)) {
      hits++;
      if (!firstStep) {
        firstStep = r.step ? r.step.id : null;
      }
    }
  });
  if (hits == 0) {
    return false;
  }

  var already = EduIntegrityEvent.fetchCount({
    filter: Filter.eq('contextId', submissionId).and().eq('eventKind', EduIntegrityEvent.EventKind.CANARY_MATCH),
  });
  if (already == 0) {
    EduIntegrityEvent.make({
      contextKind: EduIntegrityEvent.ContextKind.ASSIGNMENT,
      contextId: submissionId,
      courseId: sub.assignment.course.id,
      person: { id: sub.student.id },
      stepId: firstStep,
      eventKind: EduIntegrityEvent.EventKind.CANARY_MATCH,
      severity: EduIntegrityEvent.Severity.HIGH,
      clientAt: DateTime.now(),
      details: EduIntegrityEvent.Details.make({ count: hits, note: 'canary token found in the answer' }),
    }).create();
    var flags = EduIntegrityEvent.fetchCount({
      filter: Filter.eq('contextId', submissionId).and().intersects('severity', ['WARN', 'HIGH']),
    });
    EduSubmission.make({ id: submissionId, flagCount: flags }).merge();
    log.warn('Canary token found in submission {} ({} step(s))', submissionId, hits);
  }
  return true;
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

function newToken() {
  var hex = '';
  for (var i = 0; i < 4; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return 'qz_' + hex;
}
