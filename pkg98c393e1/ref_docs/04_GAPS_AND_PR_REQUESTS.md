# Gaps in the starter code, and the PRs you need from other owners

I reviewed every file in `pkg98c393e1/` on 2026‑11‑17. The package validates with 0 issues, but the integrity design has the gaps below.
They are numbered so the plan (`01`) and the contracts (`02`) can refer to them.

Labels: **[Mine]** you fix it in your own files · **[PR → name]** you need a small change in someone else's file · **[Decide]** the team needs to agree.

---

## A. Blockers (sort these out in Phase 0)

### G1. Lock state is not stored anywhere, so "freeze until an instructor unlocks" can be bypassed **[Mine] + [PR → Keya, Shreenidhi]**
- `tabSwitchLockAt` is meant to freeze work, but no field or method holds the lock. `releaseLock` only returns an event.
  If the lock lives only in the browser, a reload clears it.
- **Fix (mine):** the server owns the lock state. It is derived from events: a session is locked when its newest
  `LOCK_TRIGGERED` is later than its newest `LOCK_RELEASED`. `logBatch` counts `TAB_HIDDEN` events since the last release and writes
  `LOCK_TRIGGERED` itself once the count reaches `tabSwitchLockAt`. It returns an `EduIntegrityEvent.SessionState` (see `02` §2),
  so the browser learns about the lock straight away. A new `sessionStateMine` method lets the page restore the lock state on load.
- **PR → Keya:** `EduStepResponse.saveMine` and `EduSubmission.submitMine` call `EduIntegrityEvent.assertNotLocked('ASSIGNMENT', submissionId)`
  first, which throws `EDU_LOCKED`. Keya's editors also become read-only when `useLockdownState().locked` is true.
- **PR → Shreenidhi:** `EduQuizAttempt.saveAnswerMine` and `submitMine` make the same call with `'QUIZ', attemptId`.
  **[Decide]** Does the server-side quiz auto-submit still run while an attempt is locked? Proposal: yes. The clock keeps running.

### G2. Timeline reads raw `EduIntegrityEvent` with no course check **[Mine] + [PR → Shreya]**
- `api.ts → fetchTimeline` calls `EduIntegrityEvent.fetch`. `Edu.Role.Instructor` grants `allow:EduIntegrityEvent:read:` with no
  data permission, so a TA in CS101 can read DS201 students' events.
- **Fix (mine):** add `EduIntegrityEvent.timeline(contextKind, contextId, limit, offset)`, which runs
  `EduEnrollment.requireCourseRole(courseId, ['INSTRUCTOR','TA'])`, and point `fetchTimeline` at it.
- **PR → Shreya:** add `allow:EduIntegrityEvent::timeline` and `::studentContexts` to `Edu.Role.Instructor.json`. Then remove the raw
  `allow:EduIntegrityEvent:read:`, if the nested-call question (G3) allows it.

### G3. The permission model is untested, because personas don't change C3 permissions **[Decide] with Shreya**
- `EduSession.currentUserId()` switches the *Edu* identity, but the real caller is still an environment admin. So in development,
  `metadata/Role/*.json` is **never exercised**.
- `logBatch`, running as a student, creates `EduIntegrityEvent` rows and merges `EduSubmission.flagCount`.
  The Student role grants only `::logBatch`. If C3 checks permissions on nested calls (the documentation assistant says it does;
  this is unconfirmed), student logging fails in production.
- **Action:** in Phase 0, Shreya and you put one real non-admin test user in `Edu.Role.Student` and call `logBatch` from the UI as that user.
  Depending on the result, either add `allow:EduIntegrityEvent:write:` (plus a data permission that limits rows to the caller) to the Student role,
  or confirm that nested calls aren't checked. Write the outcome into `03_WORKING_INSTRUCTIONS.md` §6.

### G4. Instructors can't save a course policy, and assignment policy changes bypass the audit log **[Mine] + [PR → Shreya, Rohith, Shreenidhi]**
- `Edu.Role.Instructor` has no `EduCourse:write`, so the "instructor sets course rules" requirement can't be met.
- Instructors *can* write `EduAssignment` and `EduQuiz` directly, so a raw merge of `integrityPolicy` skips locked-field checks and `EduAuditLog`.
  The locks are still enforced when the policy is read (`forContext`), but nothing records who changed it.
- **Fix (mine):** add `EduIntegrityPolicy.editorView(level, id)` and `EduIntegrityPolicy.saveOverride(level, id, policy, reason)`, which checks the
  course role, rejects locked fields with `EDU_VALIDATION`, and writes `policy.update` to the audit log. Build a reusable `<IntegrityPolicyEditor>` component.
- **PR → Shreya:** role permissions `::editorView` (Instructor) and `::saveOverride` (Instructor), plus the `<IntegrityPolicyEditor level="COURSE">` on the course page.
  The admin page uses `<IntegrityPolicyEditor level="PLATFORM" onSavePlatform=…>`, and Shreya keeps writing `EduPlatformConfig` herself.
- **PR → Rohith / Shreenidhi:** the builder settings embed `<IntegrityPolicyEditor level="ASSIGNMENT|QUIZ" id=…>`, and they don't write `integrityPolicy` in their own save calls.

## B. Contract gaps (fix in Phase 1)

### G5. Quiz attempts have nowhere to store a canary token or flag count **[PR → Shreenidhi]**
- `EduQuizAttempt` has no `canaryToken` or `flagCount` field.
- **Proposal:** in Phase 1–2, the canary covers **assignments only**. In Phase 3, Shreenidhi adds `canaryToken: string` and `flagCount: int` to `EduQuizAttempt`,
  and `EduCanary` gains `issueTokenForAttempt` / `detectForAttempt`. Until then, `logBatch` skips updating `flagCount` for quizzes.

### G6. The editors don't report large inserts **[PR → Keya]**
- `PlainTextEditor` never calls `integrity.onLargeInsert`. That is the only signal that catches autotypers, browser extensions and AI tools that type into the page.
- **Contract:** for every change that **didn't** come from a paste or drop the editor already reported, call `onLargeInsert(insertedChars)`.
  The provider applies the threshold, so editors call it for every insert of 20 or more characters.
  - CodeMirror: in an `EditorView.updateListener`, for transactions whose `userEvent` is not `input.paste` / `input.drop`, sum the inserted lengths.
  - TipTap: `onUpdate` with `transaction.getMeta('uiEvent') !== 'paste'`.
  - Textarea: `onChange` where `nativeEvent.inputType` is not `insertFromPaste` / `insertFromDrop`.
- Editors also put `data-integrity-managed="true"` on their root, so the provider's catch-all listener (G7) doesn't log the same event twice.

### G7. Text inputs outside the editors aren't covered **[Mine]**
- Quiz short answers and any `<input>` or `<textarea>` that doesn't use the hooks can be pasted into freely.
- **Fix:** `LockdownProvider` adds capture-phase `paste`, `drop`, `copy`, `cut` and `contextmenu` listeners on its root element. They act only when the
  event target isn't inside `[data-integrity-managed]`.

### G8. There's no component for the question area **[Mine] + [PR → Keya, Shreenidhi]**
- `allowCopyOfQuestion` needs to know which part of the page is "the question". Nothing marks it.
- **Fix:** export `<ProtectedQuestion>{markdown}</ProtectedQuestion>`. It applies `user-select: none` and blocks copy with `COPY_BLOCKED`,
  unless the policy allows copying. When copying is allowed and the canary is on, it adds the canary sentence to the copied text (the "copy trap").
  Keya wraps the step instructions in it, and Shreenidhi wraps each quiz prompt.

### G9. No z-index tokens and no toast component **[PR → Shreya]**
- `PROJECT_PLAN.md` 12.7 defines `--z-lock-overlay: 40`, `--z-modal: 60`, `--z-toast: 70` and `--z-watermark: 9999`, but `globals.css` doesn't have them.
- **PR → Shreya:** add the 5 variables to `globals.css`. Until then, use `z-[var(--z-watermark,9999)]` with a fallback.
- The template has no toast component. You build `IntegrityNotice` (a small `Alert` stack fixed to a screen corner, `aria-live="polite"`) inside `features/integrity/`.

### G10. `sendBeacon` can't send C3 calls **[Mine]**
- `c3Call` posts an envelope with the headers `Content-Type: application/json` and `x-request-envelope: true`. `navigator.sendBeacon` can't set headers.
- **Fix:** flush on `pagehide` or a hidden tab with `fetch(url, { method: 'POST', keepalive: true, credentials: 'include', headers: {same two}, body })`.
  Build the URL with `getAppBaseUrl()` + `/api/8/EduIntegrityEvent/logBatch`. Keep each body under 60 KB, because keepalive requests are capped at 64 KB.

### G11. The workspace playground uses a hard-coded policy and context **[PR → Keya]**
- `StepWorkspace.tsx` passes a literal policy and `contextId: playground-<id>`. For real logging it must use
  `fetchEffectivePolicy('ASSIGNMENT', assignmentId)` and `contextId = submission.id`, `courseId = assignment.course.id`, plus `canaryToken = submission.canaryToken`.
- Until Keya's `startMine` works, `LockdownProvider` treats a context id starting with `playground-` as **offline**: it decides
  allow or block, but sends nothing to the server.

## C. Smaller issues

| # | Issue | Fix |
|---|---|---|
| G12 | Any enrolled student can call `forContext` for any assignment id (they only see policy values, so low risk) | `forContext` calls `requireCourseRole(courseId, ['STUDENT','TA','INSTRUCTOR'])` **[Mine]** |
| G13 | The in-app copy registry is lost on reload, so a student copies inside the app, reloads, and then their paste is blocked | Keep the **hashes only** in `sessionStorage` under `edu.clip.<contextId>` (still no text stored) **[Mine]** |
| G14 | Full screen may not work inside the C3 Code preview (it's an iframe) | Detect `document.fullscreenEnabled`. When it's false, show a warning instead of the start screen and log `SESSION_START` with the note `fullscreen=unsupported`. Always test full screen on the deployed URL **[Mine]** |
| G15 | Integrity events and personal data: Shreya's `purgeExpiredIntegrityEvents` and `deleteStudentData` remove *your* rows | Agree that they remove by `meta.created < cutoff` / `person.id == X`. You give Shreya the field names; no new method needed **[Decide]** |
| G16 | `EduIntegrityEvent.Details.note` is free text, which the browser could abuse to send pasted content | The server truncates `note` to 120 characters and `contentHash` to 64; the browser never puts content into it **[Mine]** |
| G17 | `releaseLock` says "instructor only", but `Edu.Role.Instructor` covers TAs as well | Check in the method: `requireCourseRole(courseId, ['INSTRUCTOR'])`; TAs see the button disabled **[Mine]** |
| G18 | `PROJECT_PLAN.md` §2 and §6.3 use lower-case event names (`pasteBlocked`); the code uses `PASTE_BLOCKED` | The code wins; refer to the upper-case enum everywhere **[Mine]** |
| G19 | A student can see their own canary token in the watermark | That's by design (it's a deterrent plus a trap for AI tools). The real catch is G8's copy trap and AI tools that read screenshots or the page |

## D. PR checklist to send in Phase 0

| To | Change | Files |
|---|---|---|
| Shreya | Role permissions for `timeline`, `studentContexts`, `sessionStateMine`, `assertNotLocked`, `editorView`, `saveOverride`; G3 test with a real user; z-index tokens | `metadata/Role/*.json`, `ui/react/src/globals.css` |
| Shreya | Mount `<IntegrityPolicyEditor>` (course and platform levels) and `<PlatformIntegrityOverview>` in the admin and course pages | `AdminPage.tsx`, `CourseHomePage.tsx` |
| Keya | `assertNotLocked` in `saveMine` / `submitMine`; `issueToken` in `startMine`; `detect` in `submitMine`; `onLargeInsert` and `data-integrity-managed` in the editors; `useLockdownState().locked` sets read-only; `<ProtectedQuestion>` around instructions; real policy and context in `StepWorkspace` | `src/submission/*.js`, `features/editors/*`, `features/workspace/*` |
| Shreenidhi | `assertNotLocked` in quiz saves; wrap the quiz page in `<LockdownProvider contextKind="QUIZ">`; `<ProtectedQuestion>` around prompts; later `canaryToken` and `flagCount` on `EduQuizAttempt`; `<IntegrityPolicyEditor level="QUIZ">` | `src/grading/EduQuizAttempt.*`, `features/quiz/*` |
| Rohith | Embed `<IntegrityPolicyEditor level="ASSIGNMENT">` in builder settings; `<IntegrityTimeline>` needs `contextKind` | `features/authoring/*` |
