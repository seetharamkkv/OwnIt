/*
 * Backend error codes. Owner: Shreya. Server methods throw messages that contain `EDU_<CODE>: detail`
 * (PROJECT_PLAN.md 12.3). There is no fallback data: show these to the user.
 */
export type EduErrorCode =
  | 'EDU_FORBIDDEN'
  | 'EDU_NOT_FOUND'
  | 'EDU_VALIDATION'
  | 'EDU_DEADLINE_PASSED'
  | 'EDU_REVISION_CONFLICT'
  | 'EDU_LOCKED'
  | 'EDU_FEATURE_DISABLED'
  | 'EDU_NOT_IMPLEMENTED';

const FRIENDLY: Record<EduErrorCode, string> = {
  EDU_FORBIDDEN: "You don't have access to this.",
  EDU_NOT_FOUND: "This item doesn't exist or was removed.",
  EDU_VALIDATION: 'Some of the input is not valid.',
  EDU_DEADLINE_PASSED: 'The deadline has passed, so this can no longer be changed.',
  EDU_REVISION_CONFLICT: 'This was changed in another tab. Reload to get the latest version.',
  EDU_LOCKED: 'Your work is locked. Ask your instructor to unlock it.',
  EDU_FEATURE_DISABLED: 'This feature is turned off by your administrator.',
  EDU_NOT_IMPLEMENTED: 'This part of the app is not built yet.',
};

/** Extracts the EDU_* code from an error thrown by c3Call, or null when there is none. */
export function eduErrorCode(error: unknown): EduErrorCode | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(/EDU_[A-Z_]+/);
  return match && match[0] in FRIENDLY ? (match[0] as EduErrorCode) : null;
}

/** A message for the user: the friendly text for known codes, the server message otherwise. */
export function eduErrorMessage(error: unknown): string {
  const code = eduErrorCode(error);
  if (code) {
    return FRIENDLY[code];
  }
  return error instanceof Error ? error.message : String(error);
}
