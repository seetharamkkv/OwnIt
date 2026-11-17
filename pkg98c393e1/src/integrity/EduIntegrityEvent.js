/*
 * EduIntegrityEvent — integrity logging, lock state and reports. Owner: Seetharam (integrity).
 * Contract: ref_docs/02_INTEGRITY_CONTRACTS.md section 2.
 *
 * Privacy rule: events hold lengths, hashes, counts and durations. Never pasted, copied or typed text.
 * Lock state is derived from events: a session is locked while its newest LOCK_TRIGGERED / LOCK_RELEASED is a trigger.
 */

var log = Logger.for('EduIntegrityEvent');

var MAX_EVENTS_PER_CALL = 100;
var MAX_NOTE = 120;
var MAX_HASH = 64;
var MAX_STEP_ID = 200;
var DEFAULT_TIMELINE_LIMIT = 200;
var MAX_TIMELINE_LIMIT = 500;

/** Kinds only the server writes; logBatch drops them if a browser sends them. */
var SERVER_ONLY = ['CANARY_MATCH', 'LOCK_TRIGGERED', 'LOCK_RELEASED'];

/** Severity per kind (02 section 2.1). The browser never chooses the severity. */
var SEVERITY = {
  SESSION_START: 'INFO',
  SESSION_END: 'INFO',
  PASTE_BLOCKED: 'WARN',
  PASTE_EXTERNAL_LOGGED: 'WARN',
  PASTE_INTERNAL: 'INFO',
  DROP_BLOCKED: 'WARN',
  COPY_BLOCKED: 'WARN',
  CONTEXT_MENU_BLOCKED: 'INFO',
  LARGE_INSERT: 'WARN',
  FULLSCREEN_ENTER: 'INFO',
  FULLSCREEN_EXIT: 'WARN',
  TAB_HIDDEN: 'WARN',
  TAB_VISIBLE: 'INFO',
  WINDOW_BLUR: 'INFO',
  DEVTOOLS_SUSPECTED: 'INFO',
  CANARY_MATCH: 'HIGH',
  LOCK_TRIGGERED: 'WARN',
  LOCK_RELEASED: 'INFO',
  SCREENSHOT_ATTEMPT: 'WARN',
  PRINT_BLOCKED: 'WARN',
};

function logBatch(contextKind, contextId, clientSessionId, events) {
  var ctx = loadContext(contextKind, contextId);
  requireOwner(ctx);
  if (!ctx.open) {
    return sessionState(ctx, 0, true);
  }

  var objs = EduIntegrityEvent.arrayBuilder();
  var taken = 0;
  var stored = 0;
  if (events) {
    events.each(function (ev) {
      taken++;
      if (taken > MAX_EVENTS_PER_CALL || !ev || !ev.eventKind || SERVER_ONLY.indexOf(String(ev.eventKind)) >= 0) {
        return;
      }
      objs.add(EduIntegrityEvent.make({
        contextKind: ctx.kind,
        contextId: ctx.id,
        courseId: ctx.courseId,
        person: { id: ctx.studentId },
        stepId: ev.stepId ? truncate(ev.stepId, MAX_STEP_ID) : null,
        eventKind: ev.eventKind,
        severity: SEVERITY[ev.eventKind] || 'INFO',
        clientAt: ev.clientAt,
        details: cleanDetails(ev.details),
        clientSessionId: truncate(clientSessionId, MAX_STEP_ID),
      }));
      stored++;
    });
  }
  if (stored > 0) {
    EduIntegrityEvent.createBatch(objs.build());
  }
  if (taken > MAX_EVENTS_PER_CALL) {
    log.warn('logBatch for {} received {} events; kept the first {}', ctx.id, taken, MAX_EVENTS_PER_CALL);
  }

  applyTabLock(ctx, clientSessionId);
  updateFlagCount(ctx);
  return sessionState(ctx, stored, false);
}

function sessionStateMine(contextKind, contextId) {
  var ctx = loadContext(contextKind, contextId);
  requireOwner(ctx);
  return sessionState(ctx, 0, !ctx.open);
}

function assertNotLocked(contextKind, contextId) {
  if (lockState(contextId).locked) {
    throw new Error('EDU_LOCKED: ' + contextKind + ' ' + contextId + ' is locked');
  }
  return false;
}

function timeline(contextKind, contextId, limit, offset) {
  var ctx = loadContext(contextKind, contextId);
  EduEnrollment.requireCoursePermission(ctx.courseId, EduCourse.Permission.VIEW_INTEGRITY);
  var lim = limit > 0 ? Math.min(limit, MAX_TIMELINE_LIMIT) : DEFAULT_TIMELINE_LIMIT;
  var res = EduIntegrityEvent.fetch({
    filter: Filter.eq('contextId', ctx.id),
    include: 'id, contextKind, contextId, eventKind, severity, stepId, clientAt, details, clientSessionId, meta.created',
    order: 'descending(meta.created)',
    limit: lim,
    offset: offset > 0 ? offset : 0,
  });
  return res.objs || EduIntegrityEvent.arrayBuilder().build();
}

// TODO(Seetharam, phase 2): one ContextRow per submission and attempt of the student (02 section 2.2).
function studentContexts(courseId, personId) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityEvent.studentContexts (Seetharam)');
}

// TODO(Seetharam, phase 2): one row per enrolled student, riskScore from RISK_WEIGHTS (02 section 2.3).
function courseReport(courseId, since) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityEvent.courseReport (Seetharam)');
}

// TODO(Seetharam, phase 4): admin only; one row per course that isn't archived.
function platformReport(since) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityEvent.platformReport (Seetharam)');
}

// TODO(Seetharam, phase 3): INSTRUCTOR only; LOCK_RELEASED + EduAuditLog.record('integrity.unlock', ...).
function releaseLock(contextKind, contextId, reason) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityEvent.releaseLock (Seetharam)');
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

/**
 * The work session behind a context id, read from the server record (never from the browser):
 * { kind, id, studentId, itemId, courseId, status, open }. Throws EDU_NOT_FOUND.
 */
function loadContext(contextKind, contextId) {
  if (contextKind == EduIntegrityEvent.ContextKind.ASSIGNMENT) {
    var s = EduSubmission.make({ id: contextId }).get('student.id, status, assignment.id, assignment.course.id');
    if (!s || !s.assignment || !s.student) {
      throw new Error('EDU_NOT_FOUND: submission ' + contextId);
    }
    return {
      kind: contextKind,
      id: s.id,
      studentId: s.student.id,
      itemId: s.assignment.id,
      courseId: s.assignment.course.id,
      status: s.status,
      open: s.status == EduSubmission.Status.NOT_STARTED || s.status == EduSubmission.Status.IN_PROGRESS,
    };
  }
  if (contextKind == EduIntegrityEvent.ContextKind.QUIZ) {
    var a = EduQuizAttempt.make({ id: contextId }).get('student.id, status, quiz.id, quiz.course.id');
    if (!a || !a.quiz || !a.student) {
      throw new Error('EDU_NOT_FOUND: quiz attempt ' + contextId);
    }
    return {
      kind: contextKind,
      id: a.id,
      studentId: a.student.id,
      itemId: a.quiz.id,
      courseId: a.quiz.course.id,
      status: a.status,
      open: a.status == EduQuizAttempt.Status.IN_PROGRESS,
    };
  }
  throw new Error('EDU_VALIDATION: unknown context kind ' + contextKind);
}

function requireOwner(ctx) {
  if (ctx.studentId != EduSession.currentUserId()) {
    throw new Error('EDU_FORBIDDEN: not your ' + (ctx.kind == 'QUIZ' ? 'quiz attempt' : 'submission'));
  }
}

/** Keeps only numeric measurements and short, cut-down strings. Never content. */
function cleanDetails(d) {
  if (!d) {
    return null;
  }
  return EduIntegrityEvent.Details.make({
    chars: toInt(d.chars),
    durationMs: toInt(d.durationMs),
    count: toInt(d.count),
    contentHash: d.contentHash ? truncate(d.contentHash, MAX_HASH) : null,
    note: d.note ? truncate(d.note, MAX_NOTE) : null,
  });
}

function toInt(v) {
  if (v == null) {
    return null;
  }
  var n = Math.floor(Number(v));
  return isFinite(n) && n >= 0 ? n : null;
}

function truncate(s, max) {
  if (s == null) {
    return null;
  }
  var str = String(s);
  return str.length > max ? str.substring(0, max) : str;
}

/** The newest event of one of the given kinds in a session, or null. */
function newestOf(contextId, kinds) {
  var filter = Filter.eq('contextId', contextId).and().intersects('eventKind', kinds);
  return EduIntegrityEvent.fetch({
    filter: filter,
    include: 'id, eventKind, meta.created',
    order: 'descending(meta.created)',
    limit: 1,
  }).objs.first();
}

/** { locked, lockedAt, tabSwitchCount } derived from the session's events. */
function lockState(contextId) {
  var last = newestOf(contextId, ['LOCK_TRIGGERED', 'LOCK_RELEASED']);
  var locked = !!last && last.eventKind == 'LOCK_TRIGGERED';
  var released = locked ? newestOf(contextId, ['LOCK_RELEASED']) : last;

  var tabFilter = Filter.eq('contextId', contextId).and().eq('eventKind', 'TAB_HIDDEN');
  if (released) {
    tabFilter = tabFilter.and().gt('meta.created', released.meta.created);
  }
  return {
    locked: locked,
    lockedAt: locked ? last.meta.created : null,
    tabSwitchCount: EduIntegrityEvent.fetchCount({ filter: tabFilter }),
  };
}

/** Writes LOCK_TRIGGERED when the tab-switch count since the last release reaches the policy's tabSwitchLockAt. */
function applyTabLock(ctx, clientSessionId) {
  var policy = EduIntegrityPolicy.forContext(ctx.kind, ctx.itemId);
  var lockAt = policy.tabSwitchLockAt;
  if (lockAt == null || lockAt <= 0) {
    return;
  }
  var st = lockState(ctx.id);
  if (st.locked || st.tabSwitchCount < lockAt) {
    return;
  }
  EduIntegrityEvent.make({
    contextKind: ctx.kind,
    contextId: ctx.id,
    courseId: ctx.courseId,
    person: { id: ctx.studentId },
    eventKind: 'LOCK_TRIGGERED',
    severity: SEVERITY.LOCK_TRIGGERED,
    details: EduIntegrityEvent.Details.make({ count: st.tabSwitchCount }),
    clientSessionId: truncate(clientSessionId, MAX_STEP_ID),
  }).create();
  log.info('Locked {} {} after {} tab switches', ctx.kind, ctx.id, st.tabSwitchCount);
}

/** Recounts WARN and HIGH events (no increments, so concurrent batches can't race). Assignments only for now (G5). */
function updateFlagCount(ctx) {
  if (ctx.kind != EduIntegrityEvent.ContextKind.ASSIGNMENT) {
    return;
  }
  var n = EduIntegrityEvent.fetchCount({
    filter: Filter.eq('contextId', ctx.id).and().intersects('severity', ['WARN', 'HIGH']),
  });
  EduSubmission.make({ id: ctx.id, flagCount: n }).merge();
}

function sessionState(ctx, stored, closed) {
  var policy = EduIntegrityPolicy.forContext(ctx.kind, ctx.itemId);
  var st = lockState(ctx.id);
  return EduIntegrityEvent.SessionState.make({
    contextKind: ctx.kind,
    contextId: ctx.id,
    stored: stored,
    tabSwitchCount: st.tabSwitchCount,
    warnAt: policy.tabSwitchWarnAt,
    lockAt: policy.tabSwitchLockAt,
    locked: st.locked,
    lockedAt: st.lockedAt,
    closed: closed,
  });
}
