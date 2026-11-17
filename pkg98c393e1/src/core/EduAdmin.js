/*
 * EduAdmin — admin console operations. Owner: Shreya (core and admin). PROJECT_PLAN.md section 3.
 */

// TODO(Shreya)
function platformStats() {
  throw new Error('EDU_NOT_IMPLEMENTED: EduAdmin.platformStats (Shreya)');
}

// TODO(Shreya): nightly CronJob; use EduPlatformConfig.inst().integrityRetentionDays.
function purgeExpiredIntegrityEvents() {
  throw new Error('EDU_NOT_IMPLEMENTED: EduAdmin.purgeExpiredIntegrityEvents (Shreya)');
}

// TODO(Shreya): write edu/exports/<courseId>/<timestamp>.zip and return its URL.
function exportCourseData(courseId) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduAdmin.exportCourseData (Shreya)');
}

// TODO(Shreya): remove submissions, attempts, integrity events; EduAuditLog.record('user.dataDelete', ...).
function deleteStudentData(userId, reason) {
  throw new Error('EDU_NOT_IMPLEMENTED: EduAdmin.deleteStudentData (Shreya)');
}
