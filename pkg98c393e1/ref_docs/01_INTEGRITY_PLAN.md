# Integrity: end-to-end implementation plan (Seetharam)

Phases follow the team sprints in `resource/PROJECT_PLAN.md` §8. Each task lists the file, what to build, and how to check it.
Gap numbers (G1…) are in `04_GAPS_AND_PR_REQUESTS.md`. The exact shapes are in `02_INTEGRITY_CONTRACTS.md`.

Legend: **BE** backend (`pkg98c393e1/src/integrity/`) · **FE** frontend (`pkg98c393e1/ui/react/src/features/integrity/`) · **PR** someone else's file.

---

## Phase 0: contracts and unblocking (2 days, sprint 0)

| # | Task | File(s) | Check |
|---|---|---|---|
| 0.1 | Create branch `seetharam-integrity` from `main` | git | n/a |
| 0.2 | Add the new types: `EduIntegrityPolicy.Level`, `EduIntegrityPolicy.EditorView`, `EduIntegrityEvent.SessionState`, `EduIntegrityEvent.ContextRow` | BE `.c3typ` (one type per file, file name keeps the dot) | `issuesForPkg` shows 0 issues |
| 0.3 | Add the method declarations `editorView`, `saveOverride`, `sessionStateMine`, `assertNotLocked`, `timeline`, `studentContexts`. Change the return type of `logBatch` to `SessionState` | `EduIntegrityPolicy.c3typ`, `EduIntegrityEvent.c3typ` | 0 issues |
| 0.4 | Stubs that throw `EDU_NOT_IMPLEMENTED (Seetharam)` for the new methods | `.js` | 0 issues |
| 0.5 | Update your block of `eduTypes.ts` ⚠: `SessionState`, `ContextRow`, `PolicyLevel`, `PolicyEditorView` | `common/eduTypes.ts` | `npm run build` |
| 0.6 | Update `api.ts` with the final function list (02 §4); `fetchTimeline` calls `timeline` | FE `api.ts` | build |
| 0.7 | Send the PRs in the 04 §D checklist; agree G1, G3, G5 and G15 with the team | n/a | each owner has acknowledged |
| 0.8 | **G3 test** with Shreya: a real non-admin user in `Edu.Role.Student` calls `logBatch` (after 1.2 is built) | roles | the result is written into `03` §6 |

**Done when:** the package validates, the build passes, the team has seen the changed contracts, and the PRs are open.

---

## Phase 1: lockdown, events and watermark (sprint 1, weeks 1–2)

### Backend
**1.1 `EduIntegrityPolicy.forContext` and a shared merge helper** (`EduIntegrityPolicy.js`)
```js
var FIELDS = ['pasteMode','blockInternalPaste','allowContextMenu','allowCopyOfQuestion','requireFullscreen',
              'tabSwitchWarnAt','tabSwitchLockAt','largeInsertChars','hideWatermark','watermarkAiNotice','canaryEnabled'];

function forContext(contextKind, contextId) {
  var item = loadItem(contextKind, contextId);           // EduAssignment or EduQuiz: get('course.id, integrityPolicy')
  EduEnrollment.requireCourseRole(item.course.id, ['STUDENT','TA','INSTRUCTOR']);
  var course = EduCourse.make({ id: item.course.id }).get('integrityPolicy');
  return mergeLevels([platformPolicy(), course.integrityPolicy, item.integrityPolicy], lockedFields());
}
// mergeLevels: a field from a lower level wins only if it's != null and not locked; then apply DEFAULT_* constants.
```
Check: with `runJsOnLiveApp`, set a course override `{pasteMode:'LOG_ONLY'}`, then check that `forContext('ASSIGNMENT','seed_assignment_cs101_hw1').pasteMode == 'LOG_ONLY'`.
Lock `pasteMode` in config and check that it falls back to `BLOCK_AND_LOG`. Reset both afterwards.

**1.2 `EduIntegrityEvent.logBatch`** (`EduIntegrityEvent.js`)
1. `ctx = loadContext(kind, id)`: `EduSubmission.get('student.id, status, assignment.id, assignment.course.id')`, or the attempt
   equivalent. Throw `EDU_NOT_FOUND` / `EDU_FORBIDDEN` when it's missing or `ctx.studentId != EduSession.currentUserId()`.
2. If the status isn't open, return `state(ctx, 0)`.
3. Take the first 100 events. Drop kinds in `SERVER_ONLY = [CANARY_MATCH, LOCK_TRIGGERED, LOCK_RELEASED]`. Set severity from `SEVERITY[kind]`.
   Cut `note` and `contentHash` to length. Build `EduIntegrityEvent.make({contextKind, contextId, courseId: ctx.courseId, person: {id}, …})`.
4. `EduIntegrityEvent.createBatch(objs)`.
5. Recount flags: `EduIntegrityEvent.fetchCount({filter: Filter.eq('contextId', id).and().intersects('severity', 'WARN', 'HIGH')})` (`intersects` takes varargs; see `.vs-cache/platform/src/expr/Filter.c3typ`).
   For ASSIGNMENT, `EduSubmission.make({id, flagCount: n}).merge()`.
6. Apply the tab lock: `policy = forContext(kind, ctx.itemId)`. `count` = TAB_HIDDEN events after the last LOCK_RELEASED.
   If `policy.tabSwitchLockAt` is set, `count >= lockAt`, and the session isn't locked yet, create `LOCK_TRIGGERED` (WARN, `details.count`).
7. Return a `SessionState`.

Also build `sessionStateMine` (steps 1, 6 and 7, with no writes) and `assertNotLocked`.
Check: as persona `seed_user_student01`, send 4 `TAB_HIDDEN` events with `tabSwitchLockAt=3` on the course, and expect `locked: true`.
As `seed_user_student02`, expect `EDU_FORBIDDEN`. The smoke snippets are in `03` §5.

**1.3 `EduCanary.issueToken`.** Idempotent, `qz_` + 4 hex characters from `Math.random`. Check: two calls return the same token.

### Frontend
**1.4 `clipboardRegistry.ts`:** keep the hashes in `sessionStorage` per context (G13). Add `clearRegistry()` for tests.

**1.5 `useEventQueue.ts`** (new)
- An in-memory queue (a ref), `push(kind, details?, stepId?)` adds `clientAt` (ISO).
- Flush every 5 s, and immediately for `TAB_HIDDEN`. On a failed flush, keep the events (the queue holds at most 500, dropping the oldest INFO events first).
- `pagehide` → `flushOnUnload` with `fetch keepalive` (G10). Batches stay under 100 events and 60 KB.
- The server's `SessionState` response goes into the provider's state, so `locked` can flip to true.
- `offline` / `playground-*` context: no network calls (G11).
- `clientSessionId = crypto.randomUUID()`, kept in `sessionStorage` per context.

**1.6 `LockdownProvider.tsx`: complete it**
- Hooks: `onPaste` (in-app match → `PASTE_INTERNAL`, unless `blockInternalPaste`; otherwise follow `pasteMode`:
  `BLOCK` = block silently except for a notice · `BLOCK_AND_LOG` = block, notice and `PASTE_BLOCKED` · `LOG_ONLY` = allow and `PASTE_EXTERNAL_LOGGED` · `ALLOW` = allow),
  `onDrop` (the same, with `DROP_BLOCKED`), `onCopy` (remember the hash), `onLargeInsert(chars)` (≥ `largeInsertChars` → `LARGE_INSERT`).
- Root catch-all listeners (capture phase) for targets not inside `[data-integrity-managed]` (G7): paste, drop, copy, cut, contextmenu.
- Context menu: `preventDefault` unless `allowContextMenu`; throttled `CONTEXT_MENU_BLOCKED`.
- Lifecycle: on mount, `fetchSessionState` → `ready` and `locked`; `SESSION_START`; `SESSION_END` on `pagehide`/unmount.
- Provide two contexts: `LockdownContext` (hooks, unchanged) and a new `LockdownStateContext` (+ `useLockdownState.ts`).
- Memoise the hooks object so editors don't re-render on every state change.

**1.7 `useTabTracking.ts`** (new)
- `visibilitychange`: hidden → `TAB_HIDDEN {count}` and an immediate flush · visible → `TAB_VISIBLE {durationMs}`.
- `blur`/`focus` while visible, for 2 s or more → `WINDOW_BLUR {durationMs}` (throttled). Ignore a blur caused by focus moving into an iframe inside the page (`document.activeElement` is an `IFRAME`).
- When `count >= warnAt`, show a warning notice ("You've left this page N times. Your instructor can see this.").

**1.8 `IntegrityNotice.tsx`** (new): a stack of `Alert`s in a screen corner, `aria-live="polite"`, auto-dismissed after 4 s, at most 3 at once.

**1.9 `Watermark.tsx`: build it properly**
- Rendered with `createPortal` into `document.body`: a fixed, full-screen **inline SVG** with a `<pattern>` (about 360×200 tiles, rotated −30°),
  so the text is both visible and present in the page for AI tools that read the page. Lines:
  `name · studentNumber · courseCode · HH:mm · sessionId(-6)`, then `aiNotice`, then the canary line when a token is set.
- `pointer-events:none`, `aria-hidden`, `user-select:none`, opacity about 0.08 (light) or 0.12 (dark, from `useTheme`), z-index `var(--z-watermark, 9999)`.
- Refreshes the time every 60 s. `@media print` keeps it.
- A `MutationObserver` on `document.body` (child list) and on the node (`style`/`class` attributes): if the node is removed or hidden, it re-mounts (by bumping the React key) and pushes
  `DEVTOOLS_SUSPECTED {note:'watermark-removed'}` once.

**1.10 Remove the hard-coded scaffold policy:** PR → Keya (G11). Until then, the playground still works offline.

**Phase 1 done when:** in the workspace playground with a real submission, an outside paste is blocked with a notice and a `PASTE_BLOCKED` row appears.
An in-app copy and paste works. A tab switch creates `TAB_HIDDEN`/`TAB_VISIBLE` rows. The watermark shows the persona's name and number.
`npm run build` passes, there are no Pkg issues, and the G3 result is recorded.

---

## Phase 2: dashboards, timeline, canary detection, policy editor (sprint 2, week 3)

### Backend
**2.1 `courseReport(courseId, since)`:** `requireCourseRole(courseId, ['INSTRUCTOR','TA'])`. Fetch the enrolled STUDENT people (active),
then **stream** the events (`fetchObjStream`, filter `courseId == X && meta.created >= since`, `include: person.id, eventKind, details`)
and add them up per person in JavaScript. For large courses, switch to `evaluate` with `group by person.id, eventKind` later.
Fill in `StudentRiskRow` and the `riskScore` (02 §2.3). Sort descending.

**2.2 `timeline(kind, contextId, limit, offset)`:** look up the course from the context, check the role, `fetch` newest first (default limit 200).

**2.3 `studentContexts(courseId, personId)`:** the student's submissions (`assignment.course.id == courseId`) and attempts, each with flag and HIGH counts, `locked` and `lastEventAt`.

**2.4 `EduCanary.detect(submissionId)`:** see 02 §3. Strip HTML with `/<[^>]+>/g`. Write one `CANARY_MATCH` at most.

**2.5 `editorView` / `saveOverride`:** reuse `mergeLevels`. Load `own` from the level's record. Get `before` with `JSON.stringify(own)`.
`saveOverride` writes `EduCourse` / `EduAssignment` / `EduQuiz` `.make({id, integrityPolicy}).merge()` and writes the audit log entry.

### Frontend
**2.6 `IntegrityTimeline.tsx`:** react-query `integrityTimeline`. A filter bar for severity (`Tabs`: All / Warn+ / High).
A vertical list grouped by minute: time, a severity `Badge` (INFO neutral, WARN warning, HIGH danger), a plain-language label
("Blocked a paste of 412 characters", "Away from the tab for 2 min 05 s"), and the step title when `stepId` is set.
Paging with "Load more". Empty state: "No integrity events for this session".
Optional: a small echarts scatter (time × kind) above the list.

**2.7 `IntegrityDashboard.tsx` + page**
- `PageHeader`: course code and title · range selector: last 7 days / 30 days / all.
- Metric cards: flagged students, HIGH events, blocked pastes, canary hits, locked sessions.
- A `DataGrid` of `StudentRiskRow`: name, number, review priority (bar + number), blocked pastes, large inserts, time away (`mm:ss`), full-screen exits, canary.
  Click a column to sort; CSV export through `data-grid-csv.ts`.
- Click a row → a `SidePanel` with `studentContexts`. Each context is expandable to an `<IntegrityTimeline>`, with an **Unlock** button on locked ones
  (a modal asking for a reason → `releaseLock`, then invalidate `integrityReport`, `integrityTimeline` and `integrityStudentContexts`). For TAs the button is disabled, with a tooltip.
- Errors are shown with `eduErrorMessage`. No fallback data.

**2.8 `IntegrityPolicyEditor.tsx`**
- Loads `editorView`. One row per field: label and help text, **inherited value** (shown faintly), an "Override" `Switch`, then the control
  (combobox for `pasteMode`, switches for booleans, number inputs for counts, a textarea for the AI notice).
- A locked field shows a padlock `Badge` and is disabled. "Effective" preview column. A reason input and a Save button → `saveOverride`.
- `level="PLATFORM"`: no inherited column, plus a lock toggle per field, and calls `onSavePlatform(policy, lockedFields)`.

**2.9 `ProtectedQuestion.tsx`:** G8. When copying is allowed and the canary is on, the copy handler sets
`clipboardData.setData('text/plain', selection + '\n\n' + canarySentence)` and calls `rememberCopy` on the *original* text.

**Phase 2 done when:** as `seed_user_instructor1`, `/course/seed_course_cs101/integrity` lists all 10 CS101 students with real counts.
Opening Sam Student shows his HW1 timeline. A submission whose answer contains its token gets one HIGH `CANARY_MATCH` on submit.
The course policy editor saves with an audit row. A locked field can't be changed.

---

## Phase 3: full screen, lock and unlock, quizzes (sprint 3, week 4)

**3.1 `useFullscreen.ts` + `FullscreenGate.tsx`**
- If `requireFullscreen` is set and `document.fullscreenEnabled`: a start screen over the work ("This assignment runs in full screen. Press Start.").
  The button calls `document.documentElement.requestFullscreen()` (it needs a click).
- On `fullscreenchange` → `FULLSCREEN_ENTER`, or `FULLSCREEN_EXIT {count}` and the gate reappears with the work blurred (`filter: blur(8px)` + `inert`).
- If `fullscreenEnabled` is false (an iframe or an old browser): a warning `Alert`, no blocking, and `SESSION_START` with the note `fullscreen=unsupported` (G14).
- Esc always leaves full screen (browsers require that). That's expected, and it's logged.

**3.2 `LockOverlay.tsx`:** when `state.locked`, the work is blurred and `inert`, with a centred card: "Your work is locked because you left the page N times. Your instructor has been notified."
It polls `fetchSessionState` every 20 s, and unlocks the moment `locked` turns false.
Uses z-index `var(--z-lock-overlay, 40)`. Editors also become read-only through `useLockdownState().locked` (PR → Keya).

**3.3 Server-side enforcement:** Keya's and Shreenidhi's PRs call `assertNotLocked`. Check that a save made while locked returns `EDU_LOCKED`, and that the UI shows the friendly message.

**3.4 Quizzes:** `QuizTakePage` (Shreenidhi) mounts `<LockdownProvider context={{contextKind:'QUIZ', contextId: attempt.id, courseId}}>`.
`logBatch` and `sessionStateMine` handle QUIZ through `EduQuizAttempt`. When G5 lands: `issueTokenForAttempt` / `detectForAttempt`, and `flagCount` for attempts.

**3.5 Timeline in the submission viewer:** check Rohith's embed with `contextKind`. Add "Jump to step" links if Rohith exposes a step anchor.

**Phase 3 done when:** with `requireFullscreen` and `tabSwitchLockAt=3` on HW1, a student is made to enter full screen; leaving it blurs the work and is logged.
The 3rd tab switch locks the session, the lock survives a reload, and saves are refused. The instructor unlocks it with a reason, an audit row is written, and the student can continue within 20 s.
The same lockdown works on a quiz.

---

## Phase 4: admin, privacy, hardening, demo (sprint 4, week 5)

| # | Task | Notes |
|---|---|---|
| 4.1 | `platformReport(since)` + `<PlatformIntegrityOverview>` | A table of `CourseRiskRow`; clicking a row goes to `routes.integrity(courseId)`. Shreya mounts it at `/admin/integrity` |
| 4.2 | Developer-tools heuristic | `outerWidth - innerWidth > 160` or the same for height, checked every 2 s, logged once (`DEVTOOLS_SUSPECTED {note:'size-gap'}`). INFO only, and labelled as a weak signal in the UI |
| 4.3 | Privacy | A student-facing notice on the start screen and in the workspace footer: "This session records pastes, tab switches and full-screen exits. The text you paste is never stored." Confirm Shreya's retention purge and `deleteStudentData` cover `EduIntegrityEvent` (G15) |
| 4.4 | Accessibility | Watermark `aria-hidden`; notices `aria-live`; the gate and overlay are focus-trapped and keyboard reachable; an instructor can set `hideWatermark` for a student who needs accommodation (through an assignment-level override) |
| 4.5 | Performance | Hooks memoised; provider state split so a tab-count change doesn't re-render editors; `courseReport` under 1 s for 200 students × 5,000 events (time it with `runJsOnLiveApp`) |
| 4.6 | Tests | `05_TEST_PLAN.md` (Jasmine for merge, severity, ownership, lock and canary; Jest for registry, provider decisions and queue) |
| 4.7 | Clean-up | Remove `playground-` offline special-casing once Keya's real workspace lands; delete the `ScaffoldPage` use from your page; update `resource/TEAM_FILES.md` (your rows) and `resource/WORKSPACE_SUMMARY.md` |
| 4.8 | Demo | Run the integrity part of the end-to-end script in `05` §4 |

---

## Dependency map (what you wait for, and who waits for you)

```
Shreya ── EduSession.currentUserId, requireCourseRole, EduAuditLog.record (✅ ready)
       ── role permissions, z-index tokens, admin mounts ........ (PR, phases 0/4)
Keya   ── startMine/submitMine/saveMine + real StepWorkspace ..... needed for real contexts (phase 1 end)
       ◄─ needs from you: LockdownProvider, useLockdown(State), ProtectedQuestion, issueToken, detect, assertNotLocked
Shreenidhi ── EduQuizAttempt.startMine ........................... needed for quiz lockdown (phase 3)
       ◄─ needs from you: the same components, plus assertNotLocked
Rohith ◄─ needs from you: IntegrityTimeline, IntegrityPolicyEditor(ASSIGNMENT)
```
**Not blocked:** until Keya's `startMine` works, use the seeded submission `seed_submission_cs101_hw1_student01` (student `seed_user_student01`).
Act as that persona and pass `contextId = 'seed_submission_cs101_hw1_student01'` into the playground provider on your branch.
