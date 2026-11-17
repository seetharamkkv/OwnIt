/*
 * EduEnrollment — course membership and the shared permission guards. Owner: Shreya (core and admin).
 *
 * Two guards:
 *   requireCourseRole(courseId, roles)             – coarse: "is the caller an INSTRUCTOR or TA here?"
 *   requireCoursePermission(courseId, permission)  – fine: "may the caller EDIT_GRADES here?" (TAs are configurable)
 * Admins pass both and get null back. Everyone else gets their enrollment back or EDU_FORBIDDEN.
 */

var log = Logger.for('EduEnrollment');

function requireCourseRole(courseId, roles) {
  var userId = EduSession.currentUserId();
  if (isAdmin(userId)) {
    return null;
  }
  var enrollment = activeEnrollment(courseId, userId);
  if (!enrollment || !roles.contains(enrollment.courseRole)) {
    log.warn('Denied {} in course {} (needs {})', userId, courseId, roles);
    throw new Error('EDU_FORBIDDEN: course role required');
  }
  return enrollment;
}

function requireCoursePermission(courseId, permission) {
  var userId = EduSession.currentUserId();
  if (isAdmin(userId)) {
    return null;
  }
  var enrollment = activeEnrollment(courseId, userId);
  if (!enrollment || !permissionsFor(enrollment).contains(permission)) {
    log.warn('Denied {} in course {} (needs {})', userId, courseId, permission);
    throw new Error('EDU_FORBIDDEN: ' + permission + ' required in this course');
  }
  return enrollment;
}

function myPermissions(courseId) {
  var userId = EduSession.currentUserId();
  if (isAdmin(userId)) {
    return allPermissions();
  }
  var enrollment = activeEnrollment(courseId, userId);
  if (!enrollment) {
    return ArrayType.ofStr().makeBuilder().build();
  }
  return permissionsFor(enrollment);
}

function setAccommodation(accommodation, reason) {
  var current = this.get('course.id, person.id, courseRole, accommodation');
  if (!current) {
    throw new Error('EDU_NOT_FOUND: enrollment ' + this.id);
  }
  if (current.courseRole != EduEnrollment.CourseRole.STUDENT) {
    throw new Error('EDU_VALIDATION: accommodations apply to students only');
  }
  EduEnrollment.requireCoursePermission(current.course.id, EduCourse.Permission.GRANT_EXTENSIONS);
  current.withAccommodation(accommodation).merge('accommodation');
  EduAuditLog.record(
    'accommodation.update',
    'EduEnrollment',
    current.id,
    current.course.id,
    current.accommodation ? current.accommodation.toJson() : null,
    accommodation ? accommodation.toJson() : null,
    reason
  );
  return EduEnrollment.make({ id: current.id }).get('course.id, person.id, courseRole, status, accommodation');
}

// TODO(Shreya): implement — PROJECT_PLAN.md section 3. Guard with requireCoursePermission(courseId, 'MANAGE_ENROLLMENT').
function bulkEnroll(courseId, rows) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduEnrollment.bulkEnroll (Shreya)');
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

/** True for a platform admin with an active profile; throws for deactivated or missing profiles. */
function isAdmin(userId) {
  var profile = EduUserProfile.make({ id: userId }).get('platformRole, deactivated');
  if (!profile || profile.deactivated) {
    throw new Error('EDU_FORBIDDEN: no active profile');
  }
  return profile.platformRole == EduUserProfile.PlatformRole.ADMIN;
}

function activeEnrollment(courseId, userId) {
  return EduEnrollment.fetch({
    filter: Filter.eq('course.id', courseId).and().eq('person.id', userId).and().eq('status', EduEnrollment.Status.ACTIVE),
    include: 'courseRole, course.id, course.taPermissions, person.id',
    limit: 1,
  }).objs.first();
}

/** Every permission, for instructors and admins. */
function allPermissions() {
  var all = ArrayType.ofStr().makeBuilder();
  // Enum values are plain strings in JS ('EDIT_CONTENT', ...).
  EduCourse.Permission.values().each(function (p) {
    all.add(p);
  });
  return all.build();
}

/** The permission set for one enrollment: all for instructors, the course's (or platform default) set for TAs, none for students. */
function permissionsFor(enrollment) {
  if (enrollment.courseRole == EduEnrollment.CourseRole.INSTRUCTOR) {
    return allPermissions();
  }
  if (enrollment.courseRole == EduEnrollment.CourseRole.TA) {
    var set = enrollment.course && enrollment.course.taPermissions;
    if (!set || set.length == 0) {
      set = EduPlatformConfig.inst().defaultTaPermissions;
    }
    return set || ArrayType.ofStr().makeBuilder().build();
  }
  return ArrayType.ofStr().makeBuilder().build();
}
