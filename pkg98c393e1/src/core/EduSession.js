/*
 * EduSession — who is calling. Owner: Shreya (core and admin).
 * Every Edu server method gets the caller from EduSession.currentUserId(), never User.myUser() directly,
 * so dev personas work everywhere (PROJECT_PLAN.md section 12.2).
 */

var log = Logger.for('EduSession');

function currentUserId() {
  var realId = User.myUser().id;
  var profile = EduUserProfile.make({ id: realId }).get('platformRole, devPersonaId');
  if (profile && profile.devPersonaId && profile.platformRole == EduUserProfile.PlatformRole.ADMIN && flagOn('devPersonas')) {
    return profile.devPersonaId;
  }
  return realId;
}

function me() {
  var real = User.myUser();
  var realProfile = ensureProfile(real);
  var userId = currentUserId();
  var profile = userId == real.id
    ? realProfile
    : EduUserProfile.make({ id: userId }).get('displayName, email, studentNumber, platformRole');
  if (!profile) {
    throw new Error('EDU_NOT_FOUND: profile ' + userId);
  }

  var memberships = [];
  EduEnrollment.fetchObjStream({
    filter: Filter.eq('person.id', userId).and().eq('status', EduEnrollment.Status.ACTIVE),
    include: 'courseRole, course.id, course.code, course.title, course.term, course.archived',
  }).each(function (e) {
    if (!e.course.archived) {
      memberships.push(e);
    }
  });

  // Instructor names per course, for the course cards.
  var instructorsByCourse = {};
  if (memberships.length) {
    var courseIds = memberships.map(function (e) { return e.course.id; });
    EduEnrollment.fetchObjStream({
      filter: Filter.intersects('course.id', courseIds)
        .and().eq('courseRole', EduEnrollment.CourseRole.INSTRUCTOR)
        .and().eq('status', EduEnrollment.Status.ACTIVE),
      include: 'course.id, person.displayName',
    }).each(function (e) {
      var list = instructorsByCourse[e.course.id] || (instructorsByCourse[e.course.id] = []);
      if (e.person && e.person.displayName) {
        list.push(e.person.displayName);
      }
    });
  }

  var courses = EduSession.CourseMembership.arrayBuilder();
  memberships.forEach(function (e) {
    var names = ArrayType.ofStr().makeBuilder();
    (instructorsByCourse[e.course.id] || []).forEach(function (n) { names.add(n); });
    courses.add(EduSession.CourseMembership.make({
      courseId: e.course.id,
      courseCode: e.course.code,
      courseTitle: e.course.title,
      courseRole: e.courseRole,
      courseTerm: e.course.term,
      instructorNames: names.build(),
    }));
  });

  var enabled = ArrayType.ofStr().makeBuilder();
  var flags = EduPlatformConfig.inst().featureFlags;
  if (flags) {
    flags.each(function (on, name) {
      if (on) enabled.add(name);
    });
  }

  return EduSession.Me.make({
    userId: userId,
    realUserId: real.id,
    displayName: profile.displayName,
    email: profile.email,
    studentNumber: profile.studentNumber,
    platformRole: profile.platformRole,
    personaActive: userId != real.id,
    courses: courses.build(),
    enabledFlags: enabled.build(),
  });
}

function setDevPersona(personaId) {
  if (!flagOn('devPersonas')) {
    throw new Error('EDU_FEATURE_DISABLED: devPersonas');
  }
  var real = User.myUser();
  var realProfile = ensureProfile(real);
  if (realProfile.platformRole != EduUserProfile.PlatformRole.ADMIN) {
    throw new Error('EDU_FORBIDDEN: only admins can switch personas');
  }
  if (personaId && !EduUserProfile.make({ id: personaId }).get('id')) {
    throw new Error('EDU_NOT_FOUND: persona ' + personaId);
  }
  EduUserProfile.make({ id: real.id, devPersonaId: personaId || null }).merge('devPersonaId');
  log.info('User {} now acting as {}', real.id, personaId || 'themselves');
  return me();
}

/**
 * Returns the real user's profile, creating it on first visit: ADMIN for environment admins or members of
 * Edu.Role.Admin, STUDENT otherwise.
 */
function ensureProfile(user) {
  var include = 'displayName, email, studentNumber, platformRole, devPersonaId';
  var profile = EduUserProfile.make({ id: user.id }).get(include);
  if (profile) {
    return profile;
  }
  var isAdmin = user.isEnvAdmin() || user.isClusterAdmin() || user.hasGroup('Edu.Role.Admin');
  EduUserProfile.make({
    id: user.id,
    displayName: user.name || user.email || user.id,
    email: user.email,
    platformRole: isAdmin ? EduUserProfile.PlatformRole.ADMIN : EduUserProfile.PlatformRole.STUDENT,
  }).create();
  log.info('Created profile for {}', user.id);
  return EduUserProfile.make({ id: user.id }).get(include);
}

function flagOn(name) {
  var flags = EduPlatformConfig.inst().featureFlags;
  return !!(flags && flags.get(name));
}
