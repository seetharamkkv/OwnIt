/*
 * EduStepResponse — a student's answer to one step. Owner: Keya (student workspace).
 * Guards live in EduSubmission.requireEditable. PROJECT_PLAN.md section 5.4.
 */

var log = Logger.for('EduStepResponse');

var MAX_CONTENT_CHARS = 200000;
var RESULT_INCLUDE = 'id, content, contentFormat, revision, completed, lastVisibleResult, meta.updated, step.id';

function saveMine(stepId, content, revision) {
  var ctx = EduSubmission.requireEditable(stepId);
  if (content.length > MAX_CONTENT_CHARS) {
    throw new Error('EDU_VALIDATION: the answer is longer than ' + MAX_CONTENT_CHARS + ' characters');
  }
  var isHtml = ctx.fileKind == EduAssignment.FileKind.DOCX;
  var clean = isHtml ? stripUnsafeHtml(content) : content;

  var current = responseFor(ctx.submissionId, stepId, 'id, revision, version');
  if (!current) {
    current = EduStepResponse.make({
      submission: { id: ctx.submissionId },
      step: { id: stepId },
      contentFormat: isHtml ? EduStepResponse.ContentFormat.HTML : EduStepResponse.ContentFormat.TEXT,
      revision: 0,
      completed: false,
    }).create();
    current = EduStepResponse.make({ id: current.id }).get('id, revision, version');
  }

  var have = current.revision || 0;
  if (revision != have) {
    throw new Error('EDU_REVISION_CONFLICT: saved revision is ' + have + ', this tab has ' + revision);
  }

  try {
    // `version` makes the merge fail when another save landed between the read above and this write.
    EduStepResponse.make({ id: current.id, version: current.version, content: clean, revision: have + 1 }).merge();
  } catch (e) {
    if (String(e.message).indexOf('ersion') >= 0) {
      throw new Error('EDU_REVISION_CONFLICT: another tab saved this step at the same moment');
    }
    throw e;
  }

  if (ctx.submissionStatus == EduSubmission.Status.NOT_STARTED) {
    EduSubmission.make({ id: ctx.submissionId, status: EduSubmission.Status.IN_PROGRESS }).merge();
  }
  // Canary check on every save, so an AI-written answer is flagged the moment it lands, not only at submit.
  try {
    EduCanary.detect(ctx.submissionId);
  } catch (e) {
    log.warn('Canary check skipped for {}: {}', ctx.submissionId, e.message);
  }
  return EduStepResponse.make({ id: current.id }).get(RESULT_INCLUDE);
}

function setCompletedMine(stepId, completed) {
  var ctx = EduSubmission.requireEditable(stepId);
  var current = responseFor(ctx.submissionId, stepId, 'id');
  if (!current) {
    throw new Error('EDU_NOT_FOUND: no answer for step ' + stepId + '; reopen the assignment');
  }
  EduStepResponse.make({ id: current.id, completed: !!completed }).merge();
  if (ctx.submissionStatus == EduSubmission.Status.NOT_STARTED) {
    EduSubmission.make({ id: ctx.submissionId, status: EduSubmission.Status.IN_PROGRESS }).merge();
  }
  log.info('Step {} of {} marked {}', stepId, ctx.submissionId, completed ? 'done' : 'not done');
  return EduStepResponse.make({ id: current.id }).get(RESULT_INCLUDE);
}

function responseFor(submissionId, stepId, include) {
  return EduStepResponse.fetch({
    filter: Filter.eq('submission.id', submissionId).and().eq('step.id', stepId),
    include: include,
    limit: 1,
  }).objs.first();
}

/**
 * Server-side safety net for DOCX answers. The Word-style editor already sanitizes with DOMPurify; this removes what
 * must never be stored even if a client skips that: script/style/iframe/object elements, on* handlers, and
 * javascript: URLs.
 */
function stripUnsafeHtml(html) {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}
