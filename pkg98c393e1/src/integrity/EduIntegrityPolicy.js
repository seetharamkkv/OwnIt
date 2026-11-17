/*
 * EduIntegrityPolicy — merged integrity rules. Owner: Seetharam (integrity).
 * Contract: ref_docs/02_INTEGRITY_CONTRACTS.md section 1.
 *
 * Merge order: platform default (EduPlatformConfig.defaultPolicy) -> course -> assignment or quiz.
 * A lower level wins only when its value is set (!= null, so an explicit false counts) and the field is not locked.
 * Locked fields (EduPlatformConfig.lockedPolicyFields) always keep the platform value.
 * Then the DEFAULT_* constants fill pasteMode and largeInsertChars, and a student's accommodation is applied.
 */

var log = Logger.for('EduIntegrityPolicy');

var FIELDS = [
  'pasteMode',
  'blockInternalPaste',
  'allowContextMenu',
  'allowCopyOfQuestion',
  'requireFullscreen',
  'tabSwitchWarnAt',
  'tabSwitchLockAt',
  'largeInsertChars',
  'hideWatermark',
  'watermarkAiNotice',
  'canaryEnabled',
  'blockScreenshots',
];

function forContext(contextKind, contextId) {
  var item = loadItem(contextKind, contextId);
  var enrollment = EduEnrollment.requireCourseRole(item.courseId, ['STUDENT', 'TA', 'INSTRUCTOR']);
  var merged = mergeLevels([platformPolicy(), coursePolicy(item.courseId), item.policy], lockedFields());
  var effective = withDefaults(merged);
  if (enrollment && enrollment.courseRole == EduEnrollment.CourseRole.STUDENT) {
    effective = applyAccommodation(effective, enrollment.id);
  }
  return EduIntegrityPolicy.make(effective);
}

// TODO(Seetharam, phase 2): own / inherited / effective for the policy editor (02 section 1.3).
function editorView(level, levelId) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityPolicy.editorView (Seetharam)');
}

// TODO(Seetharam, phase 2): reject locked fields, merge the override, EduAuditLog.record('policy.update', ...).
function saveOverride(level, levelId, policy, reason) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduIntegrityPolicy.saveOverride (Seetharam)');
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

/** The assignment or quiz: its course id and own policy. Throws EDU_NOT_FOUND for an unknown id. */
function loadItem(contextKind, contextId) {
  var rec;
  if (contextKind == EduIntegrityEvent.ContextKind.ASSIGNMENT) {
    rec = EduAssignment.make({ id: contextId }).get('course.id, integrityPolicy');
  } else if (contextKind == EduIntegrityEvent.ContextKind.QUIZ) {
    rec = EduQuiz.make({ id: contextId }).get('course.id, integrityPolicy');
  } else {
    throw new Error('EDU_VALIDATION: unknown context kind ' + contextKind);
  }
  if (!rec || !rec.course) {
    throw new Error('EDU_NOT_FOUND: ' + contextKind + ' ' + contextId);
  }
  return { courseId: rec.course.id, policy: rec.integrityPolicy };
}

function platformPolicy() {
  return EduPlatformConfig.inst().defaultPolicy;
}

function coursePolicy(courseId) {
  var course = EduCourse.make({ id: courseId }).get('integrityPolicy');
  return course ? course.integrityPolicy : null;
}

/** Locked field names as a plain JS array. */
function lockedFields() {
  var out = [];
  var locked = EduPlatformConfig.inst().lockedPolicyFields;
  if (locked) {
    locked.each(function (f) {
      out.push(String(f));
    });
  }
  return out;
}

/**
 * Merges policies top-down. levels[0] is the platform level; for locked fields only levels[0] counts.
 * Returns a plain object holding only the fields that some level set.
 */
function mergeLevels(levels, locked) {
  var result = {};
  FIELDS.forEach(function (f) {
    var isLocked = locked.indexOf(f) >= 0;
    for (var i = 0; i < levels.length; i++) {
      var p = levels[i];
      if (!p || (i > 0 && isLocked)) {
        continue;
      }
      var v = p[f];
      if (v != null) {
        result[f] = v;
      }
    }
  });
  return result;
}

/** Fills pasteMode and largeInsertChars when no level set them. */
function withDefaults(merged) {
  if (merged.pasteMode == null) {
    merged.pasteMode = EduIntegrityPolicy.DEFAULT_PASTE_MODE;
  }
  if (merged.largeInsertChars == null) {
    merged.largeInsertChars = EduIntegrityPolicy.DEFAULT_LARGE_INSERT_CHARS;
  }
  return merged;
}

/** Applies a student's exemptions (EduEnrollment.accommodation) on top of the effective policy. */
function applyAccommodation(effective, enrollmentId) {
  var e = EduEnrollment.make({ id: enrollmentId }).get('accommodation');
  var a = e && e.accommodation;
  if (!a) {
    return effective;
  }
  if (a.fullscreenExempt) {
    effective.requireFullscreen = false;
  }
  if (a.watermarkExempt) {
    effective.hideWatermark = true;
  }
  if (a.tabSwitchExempt) {
    delete effective.tabSwitchWarnAt;
    delete effective.tabSwitchLockAt;
  }
  log.info('Applied accommodation of enrollment {}', enrollmentId);
  return effective;
}
