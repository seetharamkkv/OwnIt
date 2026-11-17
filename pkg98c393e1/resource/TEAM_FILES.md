# Team file ownership — base code tree

Each file has one owner. Change someone else's file only through a small PR they review.
Shared contract files (marked ⚠) need a short team review: Shreya merges them.

Status legend: ✅ working · 🟡 scaffold that already works partly · ⬜ stub (throws `EDU_NOT_IMPLEMENTED` or shows a "Not built yet" page)

Paths are relative to `pkg98c393e1/`.

---

## Shreya: Core, roles and admin console

**Backend (`src/core/`)**
| File | Status | Notes |
|---|---|---|
| `EduUserProfile.c3typ` / `.js`, `EduUserProfile.PlatformRole.c3typ` | ✅ type · ⬜ `setPlatformRole` | People and platform roles |
| `EduCourse.c3typ`, `EduCourse.Permission.c3typ` ⚠ | ✅ | CRUD; `taPermissions`, `studentsSeeOwnFlags` |
| `EduEnrollment.c3typ` / `.js`, `.CourseRole`, `.Status`, `.Accommodation`, `.BulkRow`, `.BulkResult` | ✅ `requireCourseRole`, `requireCoursePermission`, `myPermissions`, `setAccommodation` · ⬜ `bulkEnroll` | the two guards everyone calls (PROJECT_PLAN.md 1.4) |
| `EduSession.c3typ` / `.js`, `.Me`, `.CourseMembership` | ✅ | `currentUserId()`, `me()`, `setDevPersona()` |
| `EduAuditLog.c3typ` / `.js` | ✅ | `record(...)` |
| `EduAdmin.c3typ` / `.js`, `.PlatformStats` | ⬜ | stats, retention purge, export, delete student data |
| `EduPlatformConfig.c3typ` ⚠ | ✅ | defaults in `config/EduPlatformConfig/EduPlatformConfig.json` |
| `metadata/Role/Edu.Role.{Admin,Instructor,Student}.json` ⚠ | 🟡 | add data permissions so instructors only read their own courses |
| `test/data/EduUserProfile`, `EduCourse`, `EduEnrollment` | ✅ | 13 demo personas, 2 courses, 18 enrollments |

**Frontend (`ui/react/`)**
| File | Status | Notes |
|---|---|---|
| `package.json`, `package-lock.json` ⚠ | ✅ | **only Shreya edits these**; all section 11.2 packages are already installed |
| `src/App.tsx` ⚠, `src/config/navigation.ts`, `src/types/navigation.ts`, `src/components/SideNav/SideNav.tsx` | ✅ | routes for every page are already registered |
| `src/common/eduTypes.ts` ⚠ | ✅ | TypeScript mirrors of every `.c3typ`; owners update their own sections |
| `src/common/queryKeys.ts` ⚠, `errors.ts` ⚠, `routes.ts` ⚠, `api.ts` | ✅ | |
| `src/common/auth/MeProvider.tsx`, `meContext.ts`, `useMe.ts`, `RequireRole.tsx`, `useCoursePermission.ts` | ✅ | `useMe()`, `useFeatureFlag()`, `useCourseRole()`, `useCoursePermission(courseId, 'EDIT_GRADES')` |
| `src/common/DevPersonaSwitcher.tsx` | ✅ | "Act as…" menu in the top bar |
| `src/common/PageMessage.tsx`, `ScaffoldPage.tsx` | ✅ | delete `ScaffoldPage` once no page uses it |
| `src/features/home/HomePage.tsx` | ✅ | staff/admin home |
| `src/features/home/StudentHomePage.tsx` | ✅ | Stepwise board 1; data from `EduSubmission.myDashboard` (Keya's method) |
| `src/common/stepwise/StudentShell.tsx`, `ui.tsx`, `src/styles/stepwise.css` ⚠ | ✅ | OwnIt student shell + shared theme pieces; spec in `resource/mockups/STUDENT_UI_MOCKUPS.md` |
| `src/features/courses/CourseHomePage.tsx`, `CoursesPage.tsx` | 🟡 | People tab, admin course list (staff) |
| `src/features/courses/StudentCoursesPage.tsx` | ✅ | Stepwise board 2 course cards (students) |
| `src/features/admin/AdminPage.tsx` | ⬜ | 8 sections, with a to-do list on each |

## Rohith: Assignment engine and authoring

| File | Status | Notes |
|---|---|---|
| `src/assignment/EduAssignment.c3typ` / `.js`, `.FileKind`, `.Status` | ✅ | `beforeCreate`/`beforeUpdate` hooks: only instructors (or admins) can publish or close; TAs edit drafts |
| `src/assignment/EduAssignment.Files.c3typ` / `.py`, `EduAttachment.c3typ`, `EduAttachment.Content.c3typ` | ✅ | test data upload / read / remove (max 5 MB per file, 20 files) |
| `src/assignment/EduAssignmentStep.c3typ` | ✅ | `contextBefore` = template text between the previous step and this one |
| `src/assignment/EduTemplateParser.c3typ` / `.py`, `.Result`, `.ParsedStep` | ✅ PY · IPYNB · DOCX | `parse`, `importTemplate`; DOCX runs in `py-edu_312` (`doParseDocx`) |
| `src/assignment/EduAssembler.c3typ` / `.py` | ✅ PY · IPYNB · DOCX | `assemble`, `assembleUpTo`, `downloadLink`, `previewTemplate`; DOCX via `doBuildDocx` (`py-edu_312`) |
| `metadata/ImplLanguage.Runtime/py-edu_312.json`, `metadata/Py.Runtime/py.3.12-edu_312-*.json` | ✅ | python-docx 1.1.0 on top of `py-data_312`; installed in this workspace |
| `test/data/EduAssignment`, `EduAssignmentStep`, `EduSubmission`, `EduStepResponse` | ✅ | HW1 (.py), Lab 1 (.ipynb), Lab 1 report (.docx), Sam Student's partial answers |
| `test/py-data_312/*` (parser, assembler, files, publishing rule), `test/py-edu_312/test_EduDocx.py` | ✅ | 140 test cases across engines, all passing |
| `ui/react/src/features/authoring/api.ts`, `format.ts`, `RichText.tsx`, `MarkdownField.tsx` | ✅ | `SafeHtml` (DOMPurify allow-list), Markdown preview |
| `ui/react/src/features/authoring/AssignmentBuilderPage.tsx`, `StepEditorCard.tsx`, `TestDataFiles.tsx`, `AssignmentSubmissions.tsx` | ✅ | all three file kinds, re-import warning, TA publish lock, test data |
| `ui/react/src/features/authoring/CourseAssignmentList.tsx`, `SubmissionViewerPage.tsx` | ✅ | |

## Keya: Student workspace and editors

| File | Status | Notes |
|---|---|---|
| `src/submission/EduSubmission.c3typ` / `.js`, `.Status`, `.MyAssignmentRow`, `.Dashboard`, `.GradedRow`, `.EditContext` | ✅ | `startMine`, `mySubmission`, `submitMine`, `myAssignments`, `myDashboard`, `requireEditable`, `grantExtension`. Smoke-tested as personas 2026-11-17 (start → save → conflict → done → reload → submit → download; lock → `EDU_LOCKED`). `requireEditable` and `submitMine` call `EduIntegrityEvent.assertNotLocked` (G1). `grantExtension` needs GRANT_EXTENSIONS, audits `extension.grant` / `extension.clear`, and pre-creates a NOT_STARTED submission when needed |
| `src/submission/EduStepResponse.c3typ` / `.js`, `.ContentFormat` | ✅ | `saveMine` (revision + record-version check, 200k cap, HTML strip), `setCompletedMine` |
| `ui/react/src/features/workspace/api.ts` | ✅ | includes `grantExtension`, `fetchMyDashboard` |
| `ui/react/src/features/workspace/StepWorkspace.tsx`, `StepWorkspacePage.tsx`, `StepList.tsx`, `SubmitDialog.tsx`, `deadline.ts`, `model.ts`, `useStepDrafts.ts` | ✅ (built, not UI-verified) | student + preview modes, autosave, conflicts, submit + download; read-only while `useLockdownState().locked`, saves flushed on unlock |
| `ui/react/src/features/workspace/useNotebookRun.ts` | ✅ (built) | "Run cells up to this step" → `runCells` → `cellOutputs` |
| `ui/react/src/features/workspace/MyAssignmentList.tsx`, `StudentDashboard.tsx` | ✅ (built) | course Assignments tab; home page tiles, up next, recently graded |
| `ui/react/src/features/workspace/ExtensionModal.tsx` | ✅ (built) | used by Rohith's `AssignmentSubmissions` ("Extension" button, GRANT_EXTENSIONS only) |
| `ui/react/src/features/editors/types.ts` ⚠ | ✅ | `StepEditorProps` (+ notebook cells and outputs) |
| `ui/react/src/features/editors/StepEditor.tsx`, `PyEditor.tsx`, `NotebookEditor.tsx`, `DocEditor.tsx`, `codemirror.ts`, `MarkdownView.tsx` | ✅ (built) | CodeMirror 6 / TipTap 3; all report large inserts (G6) and carry `data-integrity-managed` |
| Still open | ⬜ | swap the instructions panel to Seetharam's `<ProtectedQuestion>` when it lands (G8, copy trap); a roster UI to extend students who never opened the assignment (backend supports it); Jasmine tests |

## Seetharam: Integrity

| File | Status | Notes |
|---|---|---|
| `src/integrity/EduIntegrityPolicy.c3typ` / `.js`, `.PasteMode`, `.Level`, `.EditorView` | ✅ `forContext` (merge, locks, defaults, student accommodations) · ⬜ `editorView`, `saveOverride` | merges platform → course → item |
| `src/integrity/EduIntegrityEvent.c3typ` / `.js`, `.ContextKind`, `.EventKind`, `.Severity`, `.Details`, `.ClientEvent`, `.SessionState`, `.ContextRow`, `.StudentRiskRow`, `.CourseRiskRow` | ✅ `logBatch` (returns `SessionState`), `sessionStateMine`, `assertNotLocked`, `timeline` · ⬜ `studentContexts`, `courseReport`, `platformReport`, `releaseLock` | tab lock is derived from events |
| `src/integrity/EduCanary.c3typ` / `.js` | ✅ `issueToken` · ⬜ `detect` | |
| `ui/react/src/features/integrity/types.ts` ⚠ | ✅ | `IntegrityHooks`, `LockdownProviderProps` (+ `offline`), `LockdownState`, `IntegrityNoticeItem` |
| `ui/react/src/features/integrity/clipboardRegistry.ts` | ✅ | in-app copy hashes, kept per session in `sessionStorage` |
| `ui/react/src/features/integrity/LockdownProvider.tsx`, `lockdownContext.ts`, `useLockdown.ts`, `useLockdownState.ts` | ✅ (built, not yet UI-verified) | all paste modes, drop, copy, question-copy block, right-click block, large inserts, catch-all inputs, session start/end, lock overlay + 20 s poll. Full-screen start screen still to do (phase 3) |
| `ui/react/src/features/integrity/useEventQueue.ts`, `useTabTracking.ts`, `useNotices.ts`, `IntegrityNotice.tsx`, `LockOverlay.tsx` | ✅ (built) | 5 s batches, keepalive flush on pagehide, TAB_HIDDEN / TAB_VISIBLE / WINDOW_BLUR, corner notices |
| `ui/react/src/features/integrity/Watermark.tsx` | ✅ (built) | tiled rotated SVG, minute refresh, self-restoring host + `DEVTOOLS_SUSPECTED` |
| `ui/react/src/features/integrity/IntegrityTimeline.tsx`, `IntegrityDashboardPage.tsx` | ⬜ | timeline takes `contextKind` now |
| `ui/react/src/features/integrity/api.ts` | ✅ | final function list (02 §4); `fetchTimeline(kind, id)` uses `timeline` |

## Shreenidhi: Tests, grading and quizzes

| File | Status | Notes |
|---|---|---|
| `src/grading/EduStepTest.c3typ` / `.js`, `.Visibility` | ✅ `visibleTests`, `regradeBundle`, `stepTests`, `saveForStep`, `removeForStep` | students only ever get VISIBLE tests; saves need EDIT_CONTENT |
| `src/grading/EduTestRun.c3typ` / `.js`, `.Mode`, `EduTestResult.c3typ`, `EduTestSummary.c3typ` | ✅ `recordMine`, `recordRegrade` | `recordMine` keeps only visible-test results, recounts passes, sets `EduStepResponse.lastVisibleResult`. `recordRegrade` (EDIT_GRADES) keeps results for any test of the step, saves a trusted INSTRUCTOR_REGRADE run, recomputes `EduSubmission.score` via `EduGradebook.computeScore` (SUBMITTED → GRADED), audits `grade.regrade` when the score changes |
| `test/data/EduStepTest` | ✅ | 8 demo tests: HW1 (visible + hidden per step), DS201 Lab 1 (visible). Checked with server Python against Sam's answers and a reference solution |
| `src/grading/EduQuiz*.c3typ` / `.js` (Quiz, Question, Option, Attempt, Paper, PaperQuestion, Answer, MyQuizRow, CourseRow, Result, ResultQuestion) | ✅ backend (smoke-tested 2026-11-17) | student: `myQuizzes`, `myQuiz`, `startMine`, `saveAnswerMine`, `submitMine`, `resultMine`; staff: `courseQuizzes`, `forEdit`, `saveForCourse`, `setStatus`, `removeDraft`, `EduQuizQuestion.forQuiz/saveForQuiz/removeForQuiz/checkQuiz`, `EduQuizAttempt.forQuiz/reviewAttempt/regradeAttempt`, `EduQuizAnswer.gradeManually`; `autoSubmitExpired` runs every minute (`seed/CronJob/EduQuizAutoSubmit.json`). Demo quiz `seed_quiz_cs101_q1` in `test/data` |
| `src/grading/EduGradebook*.c3typ` / `.js` | ✅ `courseGrid`, `computeScore`, `overrideScore`, `clearOverride`, `releaseGrades`, `exportCsv` | Effective score = `scoreOverride ?? score`. Overrides need EDIT_GRADES + reason (audited `grade.override` / `grade.overrideClear`); release needs RELEASE_GRADES (`grade.release`). Grid/CSV/computeScore: INSTRUCTOR or TA. Quiz columns come from the best submitted `EduQuizAttempt.score` (none exist yet). New fields: `Grid.courseCode/courseTitle`, `Item.fileKind/gradesReleasedAt`, `Cell.autoScore/overridden` |
| `ui/react/src/features/testing/config.ts`, `runner.ts`, `pyodide.worker.ts`, `protocol.ts`, `harness.ts` | ✅ (built; harness checked in Node Pyodide; not yet run in a browser) | `runTests`, `runCells`, `warmUp`, `testFilesFrom`; Pyodide 0.27.8 from jsDelivr; per-test timeout restarts the worker |
| `ui/react/src/features/testing/TestPanel.tsx`, `TestEditor.tsx`, `api.ts` | ✅ (built) | TestPanel now needs `assignmentId` (one-line change made in Keya's `StepWorkspace.tsx`) |
| `ui/react/src/features/grading/GradebookPage.tsx`, `OverrideScoreModal.tsx`, `regrade.ts`, `format.ts`, `api.ts` | ✅ (built, not UI-verified) | Grid of students × items, late/flag/override badges, cell → submission viewer, override modal, release confirm, CSV download, "Regrade all in my browser" (assembleUpTo + regradeBundle + runTests + recordRegrade, progress, cancel, per-step errors) |
| `ui/react/src/features/quiz/QuizBuilderPage.tsx`, `QuizTakePage.tsx`, `api.ts` | ⬜ pages (still scaffolds) / ✅ api | next: quiz-taking page, then the builder |

---

## Getting started (everyone)
1. Pull `main` and create your branch: `shreya-core`, `rohith-engine`, `keya-workspace`, `seetharam-integrity`, `shreenidhi-grading`.
2. Search your area for `TODO(<your name>)` and `EDU_NOT_IMPLEMENTED ... (<your name>)`.
3. To see other roles: the **Act as…** menu in the top bar switches to a demo persona. It needs the `devPersonas` flag
   on and a real admin. The flag is already on in this workspace. In a new workspace, run in the app console:
   `var f={}; EduPlatformConfig.inst().featureFlags.each(function(v,k){f[k]=v}); f.devPersonas=true; EduPlatformConfig.inst().setConfigValue('featureFlags', f, ConfigOverride.APP);`
4. Before you push, make sure `npm run build` passes in `ui/react` and the package has no Pkg.Issue errors.
