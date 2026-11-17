/*
 * EduAssignment — publishing rules on every write path. Owner: Rohith (assignment engine).
 * Publishing or closing needs the INSTRUCTOR course role (or a platform admin). TAs may create and edit drafts.
 * Not checked for system callers (seed loading at deploy, jobs) or environment admins (e.g. loading test data in a
 * fresh workspace), unless a dev persona is active.
 */

var log = Logger.for('EduAssignment');

function beforeCreate(objs) {
  return checkStatusChanges(objs, false);
}

function beforeUpdate(objs) {
  return checkStatusChanges(objs, true);
}

function checkStatusChanges(objs, isUpdate) {
  var errors = ObjError.arrayBuilder();
  var kept = EduAssignment.arrayBuilder();
  var me = User.myUser();
  var trusted = !me.isHuman() || me.isEnvAdmin() || me.isClusterAdmin();
  if (trusted && EduSession.currentUserId() == me.id) {
    return ObjList.make({ objs: objs, errors: errors.build() });
  }

  objs.each(function (o) {
    var restricted = o.status == EduAssignment.Status.PUBLISHED || o.status == EduAssignment.Status.CLOSED;
    var stored = isUpdate && restricted ? EduAssignment.make({ id: o.id }).get('status, course.id') : null;
    var changed = !stored || stored.status != o.status;
    var courseId = o.course ? o.course.id : stored ? stored.course.id : null;
    if (restricted && changed) {
      try {
        EduEnrollment.requireCourseRole(courseId, ['INSTRUCTOR']);
      } catch (e) {
        log.warn('Blocked status {} on assignment {}', o.status, o.id);
        errors.add(ObjError.make({ targetId: o.id, message: 'EDU_FORBIDDEN: only instructors can publish or close assignments' }));
        return;
      }
    }
    kept.add(o);
  });
  return ObjList.make({ objs: kept.build(), errors: errors.build() });
}
