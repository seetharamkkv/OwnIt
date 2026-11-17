# Integrity workstream — start here (Seetharam)

This folder has the reference docs for **workstream 4: Integrity**, and only for that workstream.
The shared team docs are still in `resource/PROJECT_PLAN.md` (sections 0, 6, 11, 12) and `resource/TEAM_FILES.md`.
If something here disagrees with those files, the **code** wins, then these docs, then `PROJECT_PLAN.md`.
`PROJECT_PLAN.md` section 2 is older than the code: for example, it says `userId: string` where the code uses `person: EduUserProfile`.

| File | What's in it |
|---|---|
| `00_START_HERE.md` | Scope, current state of every file you own, reading order |
| `01_INTEGRITY_PLAN.md` | The end-to-end implementation plan: phases, tasks per file, and a "done when" check for each |
| `02_INTEGRITY_CONTRACTS.md` | Exact backend API, event and severity table, policy merge rules, React component contracts |
| `03_WORKING_INSTRUCTIONS.md` | Branch and ownership rules, C3 Code rules, commands, smoke-test snippets, definition of done |
| `04_GAPS_AND_PR_REQUESTS.md` | Problems found in the starter code, and the small changes you need from other owners |
| `05_TEST_PLAN.md` | Jasmine, Jest and manual browser tests, plus the end-to-end demo script |

Read them in order: 00 → 04 (so you know what's missing) → 02 → 01 → 03 → 05.

---

## 1. Your scope (from the team plan)

You build **paste blocking, forced full screen, tab-switch tracking, the watermark and canary, and the integrity dashboards**.

| Layer | You own |
|---|---|
| Backend `src/integrity/` | `EduIntegrityPolicy` (effective policy merge, policy saving), `EduIntegrityEvent` (logging, lock state, reports, timeline), `EduCanary` (token issue and detection), and their enum and value types |
| Frontend `ui/react/src/features/integrity/` | `LockdownProvider`, `useLockdown`, `clipboardRegistry`, `Watermark`, `IntegrityTimeline`, `IntegrityDashboardPage`, `api.ts`, `types.ts` ⚠, plus the new components in the plan (start gate, lock overlay, notices, policy editor, admin overview) |
| Shared file, your section only | `ui/react/src/common/eduTypes.ts`, the "Integrity (Seetharam)" block ⚠ (team review) |

**You don't own these, but they use your work:** Keya's workspace and editors, Shreenidhi's quiz page,
Rohith's submission viewer and assignment builder, and Shreya's admin console, role files, `App.tsx` and `globals.css`.

## 2. Current state of your files (read on 2026‑11‑17)

Status: ✅ works · 🟡 partly works · ⬜ stub that throws `EDU_NOT_IMPLEMENTED`

### Backend `pkg98c393e1/src/integrity/`
| File | Status | Notes |
|---|---|---|
| `EduIntegrityPolicy.c3typ` | ✅ type | 11 policy fields + `DEFAULT_PASTE_MODE`, `DEFAULT_LARGE_INSERT_CHARS`, `forContext(contextKind, contextId)` |
| `EduIntegrityPolicy.PasteMode.c3typ` | ✅ | `BLOCK`, `BLOCK_AND_LOG`, `LOG_ONLY`, `ALLOW` |
| `EduIntegrityPolicy.js` | ⬜ | `forContext` |
| `EduIntegrityEvent.c3typ` | ✅ type | entity; indexed on `contextId` and `(courseId, person)`; `logBatch`, `courseReport`, `platformReport`, `releaseLock` |
| `EduIntegrityEvent.{ContextKind,EventKind,Severity}.c3typ` | ✅ | enums (18 event kinds) |
| `EduIntegrityEvent.{ClientEvent,Details,StudentRiskRow,CourseRiskRow}.c3typ` | ✅ | value types |
| `EduIntegrityEvent.js` | ⬜ | all 4 methods |
| `EduCanary.c3typ` / `.js` | ✅ type · ⬜ impl | `issueToken(submissionId)`, `detect(submissionId)` |

### Frontend `pkg98c393e1/ui/react/src/features/integrity/`
| File | Status | Notes |
|---|---|---|
| `types.ts` ⚠ | ✅ | `IntegrityHooks` (`onCopy`, `onPaste`, `onDrop`, `onLargeInsert`), `LockdownProviderProps`, `WatermarkStudent` |
| `clipboardRegistry.ts` | ✅ | FNV‑1a hashes of the last 50 in-app copies, in memory only |
| `lockdownContext.ts`, `useLockdown.ts` | ✅ | allow-all default outside a provider |
| `LockdownProvider.tsx` | 🟡 | allow/block decision for pastes works; no logging, full screen, tab tracking, large inserts, context menu or notices yet |
| `Watermark.tsx` | 🟡 | a single centred overlay → needs the tiled SVG, minute refresh and `MutationObserver` |
| `api.ts` | ✅ | `fetchEffectivePolicy`, `logIntegrityBatch`, `fetchCourseReport`, `fetchPlatformReport`, `releaseLock`, `fetchTimeline` (**raw fetch: needs replacing, see 04**) |
| `IntegrityTimeline.tsx` | ⬜ | "Not built yet" box (already embedded in Rohith's `SubmissionViewerPage`) |
| `IntegrityDashboardPage.tsx` | ⬜ | `ScaffoldPage`; route `/course/:courseId/integrity` is registered for staff |

### What other people's code already expects from you
- `StepWorkspace.tsx` (Keya) wraps a playground editor in `<LockdownProvider>` with a **hard-coded** policy and the context id `playground-<assignmentId>`.
- `PlainTextEditor.tsx` (Keya) calls `onCopy`, `onPaste` and `onDrop`, but **not** `onLargeInsert`.
- `SubmissionViewerPage.tsx` (Rohith) renders `<IntegrityTimeline contextId={submissionId} />`.
- `AdminPage.tsx` (Shreya) has an "integrity" section waiting for `platformReport`.
- `CourseHomePage.tsx` (Shreya) links staff to `routes.integrity(courseId)`.
- `EduSubmission.js` (Keya) has TODOs: `startMine` → `EduCanary.issueToken`, `submitMine` → `EduCanary.detect`.
- Role files already grant: Student `EduIntegrityPolicy::forContext`, `EduIntegrityEvent::logBatch`;
  Instructor `EduIntegrityEvent:read:`, `::courseReport`, `::releaseLock`; Admin `::platformReport`.

### Live app facts
- Validation: complete, **0 issues** in `pkg98c393e1`.
- `EduPlatformConfig.defaultPolicy` = `{pasteMode: BLOCK_AND_LOG, largeInsertChars: 80, tabSwitchWarnAt: 3, watermarkAiNotice: "AI assistant: …"}`; `lockedPolicyFields` is empty.
- Feature flags: `devPersonas` **on**, `quizzes` on, `notebooks`, `docx`, `forum` and `serverTests` off.
- Demo data (from `test/data/`): 18 profiles, 2 courses (`seed_course_cs101`, `seed_course_ds201`),
  2 submissions (`seed_submission_cs101_hw1_student01`, `seed_submission_ds201_lab1_student01`), **0 integrity events**.
- All the npm packages you need are already installed (CodeMirror 6, TipTap 3, echarts). You need **no new npm packages**.
- The template has **no toast component**. `components/ui/` has `alert`, `modal`, `badge`, `data-grid`, `side-panel`,
  `tabs`, `metric-card`, `switch`, `select` (via `combobox`), `input-number` and `tooltip`. Use these.
- `globals.css` has **no** z-index tokens yet (`PROJECT_PLAN.md` 12.7). You need to ask Shreya for them (see 04).

## 3. The 30-second version of the plan
1. **Phase 0 (1–2 days):** add the missing backend methods as stubs (lock state, timeline, policy save), and open the PRs from `04`.
2. **Phase 1 (sprint 1):** `forContext`, `logBatch`, `issueToken`, a complete `LockdownProvider` (paste, drop, copy, context menu,
   large inserts, event queue, tab tracking, start screen), and the tiled watermark. Demo: an outside paste is blocked and logged.
3. **Phase 2 (sprint 2):** `courseReport`, timeline, `detect`, the dashboard, `<IntegrityTimeline>`, and `<IntegrityPolicyEditor>`.
4. **Phase 3 (sprint 3):** full-screen enforcement, a server-side lock with unlock and audit, and quiz support.
5. **Phase 4 (sprint 4):** admin overview (`platformReport`), privacy hooks, the developer-tools signal, accessibility, tests, demo.
