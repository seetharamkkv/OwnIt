/*
 * EduAuditLog — privileged change log. Owner: Shreya (core and admin).
 */

function record(action, targetTypeName, targetId, courseId, beforeJson, afterJson, reason) {
  var actorId = EduSession.currentUserId();
  var actor = EduUserProfile.make({ id: actorId }).get('platformRole');
  return EduAuditLog.make({
    actorId: actorId,
    actorRole: actor ? actor.platformRole : null,
    action: action,
    targetTypeName: targetTypeName,
    targetId: targetId,
    courseId: courseId,
    beforeJson: beforeJson,
    afterJson: afterJson,
    reason: reason,
  }).create();
}
