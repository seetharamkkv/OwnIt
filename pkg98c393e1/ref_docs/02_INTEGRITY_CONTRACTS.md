# Integrity contracts (backend API, events, policy, components)

These are the exact shapes you implement and other people code against. A ⚠ item changes a shared contract,
so post it in the team channel before merging. Items marked **NEW** don't exist in the code yet. You add them in Phase 0 (`01` §0).

---

## 1. Policy (`EduIntegrityPolicy`)

### 1.1 Fields: unset means "inherit". After the merge, an unset field means the strict default.
| Field | Type | Default when every level leaves it unset | Strict side |
|---|---|---|---|
| `pasteMode` | `BLOCK` \| `BLOCK_AND_LOG` \| `LOG_ONLY` \| `ALLOW` | `DEFAULT_PASTE_MODE` = `BLOCK_AND_LOG` | `BLOCK_AND_LOG` |
| `blockInternalPaste` | boolean | false (in-app copy and paste allowed) | true |
| `allowContextMenu` | boolean | false (right-click blocked) | false |
| `allowCopyOfQuestion` | boolean | false (instructions can't be copied) | false |
| `requireFullscreen` | boolean | false | true |
| `tabSwitchWarnAt` | int | unset = never warn | low number |
| `tabSwitchLockAt` | int | unset = never lock | low number |
| `largeInsertChars` | int | `DEFAULT_LARGE_INSERT_CHARS` = 80 | low number |
| `hideWatermark` | boolean | false (watermark shown) | false |
| `watermarkAiNotice` | string | none | n/a |
| `canaryEnabled` | boolean | false | true |

### 1.2 How the levels are merged (`forContext`)
```
platform = EduPlatformConfig.inst().defaultPolicy        (admin)
course   = EduCourse.integrityPolicy                      (instructor)
item     = EduAssignment.integrityPolicy | EduQuiz.integrityPolicy
locked   = EduPlatformConfig.inst().lockedPolicyFields    (admin)

for each field f in POLICY_FIELDS:
  v = platform[f]
  if f not in locked:
     if course[f] != null: v = course[f]
     if item[f]   != null: v = item[f]
  result[f] = v
then apply the defaults from 1.1 (pasteMode, largeInsertChars)
```
- **Locked means the platform value always wins**, whether the lower level is stricter or looser. That's simple and predictable.
- In JavaScript, an explicit `false` must count as set: use `!= null`, never truthiness.
- `forContext(contextKind, contextId)`: `contextId` is the **assignment id or quiz id**, not the submission or attempt id.
  The server looks up the course, calls `requireCourseRole(courseId, ['STUDENT','TA','INSTRUCTOR'])` (admins pass), and throws `EDU_NOT_FOUND` for an unknown id.

### 1.3 Editing policies — NEW
```c3typ
// src/integrity/EduIntegrityPolicy.Level.c3typ
enum type EduIntegrityPolicy.Level { PLATFORM, COURSE, ASSIGNMENT, QUIZ }

// src/integrity/EduIntegrityPolicy.EditorView.c3typ
type EduIntegrityPolicy.EditorView {
  level: !string enum EduIntegrityPolicy.Level
  levelId: string                 // course, assignment or quiz id; empty for PLATFORM
  own: EduIntegrityPolicy         // what this level sets (unset = inherit)
  inherited: EduIntegrityPolicy   // the merged value of the levels above
  effective: EduIntegrityPolicy   // inherited + own + locks + defaults
  lockedFields: [string]
  canEdit: boolean                // INSTRUCTOR in the course, or admin
}

// added to EduIntegrityPolicy.c3typ
editorView: function(level: !string enum EduIntegrityPolicy.Level, levelId: string): !EduIntegrityPolicy.EditorView js-server
saveOverride: function(level: !string enum EduIntegrityPolicy.Level, levelId: !string, policy: EduIntegrityPolicy, reason: string): !EduIntegrityPolicy.EditorView js-server
```
- `saveOverride` accepts only `COURSE`, `ASSIGNMENT` and `QUIZ`. Platform saves stay in Shreya's admin code (`EduPlatformConfig.setConfigValue`).
- It throws `EDU_VALIDATION: locked fields: pasteMode, …` if the policy sets a locked field to anything other than null.
- It writes `EduAuditLog.record('policy.update', '<EduCourse|EduAssignment|EduQuiz>', levelId, courseId, beforeJson, afterJson, reason)`.
- Caller: `requireCourseRole(courseId, ['INSTRUCTOR'])`. TAs get `canEdit=false`.

## 2. Events (`EduIntegrityEvent`)

### 2.1 Event table
"Client" kinds come from the browser in `logBatch`. "Server" kinds are only ever written by the server: `logBatch` **drops** them if a browser sends them.

| `eventKind` | Source | Severity | `details` used | When the browser sends it / throttle |
|---|---|---|---|---|
| `SESSION_START` | client | INFO | `note` (`fullscreen=supported\|unsupported`) | provider mounted with a real context |
| `SESSION_END` | client | INFO | `durationMs` (session length) | `pagehide` or unmount |
| `PASTE_BLOCKED` | client | WARN | `chars`, `contentHash` | outside paste blocked (`BLOCK_AND_LOG`); **`BLOCK` sends nothing** |
| `PASTE_EXTERNAL_LOGGED` | client | WARN | `chars`, `contentHash` | outside paste allowed in `LOG_ONLY` |
| `PASTE_INTERNAL` | client | INFO | `chars` | in-app paste (max 1 per 10 s per step) |
| `DROP_BLOCKED` | client | WARN | `chars`, `contentHash` | outside drop blocked |
| `COPY_BLOCKED` | client | WARN | `chars` | copy from `<ProtectedQuestion>` blocked |
| `CONTEXT_MENU_BLOCKED` | client | INFO | `count` | max 1 per 30 s |
| `LARGE_INSERT` | client | WARN | `chars` | an editor reports `chars >= largeInsertChars` |
| `FULLSCREEN_ENTER` | client | INFO | none | on `fullscreenchange` into full screen |
| `FULLSCREEN_EXIT` | client | WARN | `count` | on `fullscreenchange` out, only when `requireFullscreen` is set |
| `TAB_HIDDEN` | client | WARN | `count` (number of switches this session) | `visibilitychange` → hidden; **flush immediately** |
| `TAB_VISIBLE` | client | INFO | `durationMs` (time away) | `visibilitychange` → visible |
| `WINDOW_BLUR` | client | INFO | `durationMs` | blur ≥ 2 s while the tab is still visible (another app on top); max 1 per 30 s |
| `DEVTOOLS_SUSPECTED` | client | INFO | `note` (`size-gap` \| `watermark-removed`) | once per session per note |
| `CANARY_MATCH` | **server** | HIGH | `count` (matches), `note` (step ids) | `EduCanary.detect` |
| `LOCK_TRIGGERED` | **server** | WARN | `count` (tab switches) | `logBatch` when the switch count reaches `tabSwitchLockAt` |
| `LOCK_RELEASED` | **server** | INFO | `note` (actor id) | `releaseLock` |

Hard rules: **`details` never contains pasted, copied or typed text.** `contentHash` is the clipboard registry's FNV‑1a hex.
The server cuts `note` to 120 characters and `contentHash` to 64, and accepts **at most 100 events per call**.

### 2.2 Methods
```c3typ
// NEW value type: src/integrity/EduIntegrityEvent.SessionState.c3typ
type EduIntegrityEvent.SessionState {
  contextKind: !string enum EduIntegrityEvent.ContextKind
  contextId: !string
  stored: int             // events stored by this call (0 for sessionStateMine)
  tabSwitchCount: int     // TAB_HIDDEN events since the last LOCK_RELEASED
  warnAt: int             // effective tabSwitchWarnAt
  lockAt: int             // effective tabSwitchLockAt
  locked: boolean
  lockedAt: datetime
  closed: boolean         // the submission or attempt is no longer open, so nothing more is stored
}

// NEW value type: src/integrity/EduIntegrityEvent.ContextRow.c3typ
type EduIntegrityEvent.ContextRow {
  contextKind: !string enum EduIntegrityEvent.ContextKind
  contextId: !string      // submission or attempt id
  itemId: string          // assignment or quiz id
  itemTitle: string
  status: string          // submission or attempt status
  flagCount: int          // WARN + HIGH
  highCount: int
  locked: boolean
  lastEventAt: datetime
}
```

| Method | Who | Does |
|---|---|---|
| ⚠ `logBatch(contextKind, contextId, clientSessionId, events): !SessionState` (**return type changes from `int`**) | student (own context) | Checks ownership (`EduSubmission.student.id` / `EduQuizAttempt.student.id` == `EduSession.currentUserId()`), else `EDU_FORBIDDEN`. Takes `courseId` and the person from the **server**, never the browser. Drops server-only kinds, sets severity from 2.1, `createBatch`. Then recounts `flagCount` from the database (no increments, to avoid races). Then applies the tab lock. If the submission or attempt is no longer `IN_PROGRESS`/`NOT_STARTED`, stores nothing and returns the state (beacons after submit are normal). |
| NEW `sessionStateMine(contextKind, contextId): !SessionState` | student | Same ownership check; nothing is written. Called when the page loads. |
| NEW `assertNotLocked(contextKind, contextId): boolean` | server-to-server (Keya's and Shreenidhi's save methods) | Returns `false` when not locked, throws `EDU_LOCKED` when locked. |
| NEW `timeline(contextKind, contextId, limit, offset): [EduIntegrityEvent]` | INSTRUCTOR, TA | Course check, newest first, `include: id, eventKind, severity, stepId, clientAt, details, clientSessionId, meta.created`. |
| NEW `studentContexts(courseId, personId): [ContextRow]` | INSTRUCTOR, TA | One row per submission or attempt of that student in the course. |
| `courseReport(courseId, since): [StudentRiskRow]` | INSTRUCTOR, TA | One row per **enrolled student** (including those with 0 events), sorted by `riskScore` descending. |
| `platformReport(since): [CourseRiskRow]` | admin | One row per course that isn't archived. |
| `releaseLock(contextKind, contextId, reason): !EduIntegrityEvent` | INSTRUCTOR only (not TA) | `EDU_VALIDATION` if not locked or `reason` is empty. Writes `LOCK_RELEASED` (the person is the student) and `EduAuditLog.record('integrity.unlock', …)`. |

### 2.3 Risk score, version 1 (keep it in one `RISK_WEIGHTS` object in `EduIntegrityEvent.js`)
```
riskScore = 3·pasteBlocked(+dropBlocked) + 2·pasteExternalLogged + 4·largeInsert + 2·fullscreenExit
          + 1·tabHiddenCount + 1·floor(tabHiddenMs / 60 000) + 2·copyBlocked + 25·canaryMatch
```
The dashboard shows the score as a sorting aid, **never as a verdict**. The UI label is "Review priority", not "cheating score".

## 3. Canary (`EduCanary`)
| Method | Called by | Does |
|---|---|---|
| `issueToken(submissionId): !string` | Keya's `startMine` | Idempotent. If `canaryToken` is empty, generates `qz_` + 4 lower-case hex characters (a valid Python name, not a keyword), merges it into `EduSubmission.canaryToken` and returns it. |
| `detect(submissionId): boolean` | Keya's `submitMine` | Only runs when the effective policy has `canaryEnabled`. Searches every `EduStepResponse.content` (HTML tags stripped) with `/qz[_\-\s]?<hex>/i`. On a match, writes **one** `CANARY_MATCH` (HIGH) per submission: `count` = matches, `note` = step ids. It doesn't write a second one if one already exists. |
| Phase 3: `issueTokenForAttempt`, `detectForAttempt` | Shreenidhi | The same for quiz attempts (needs G5). |

## 4. Frontend contracts (`ui/react/src/features/integrity/`)

```ts
// types.ts ⚠ — unchanged
interface IntegrityHooks { onCopy(text): void; onPaste(text): boolean; onDrop(text): boolean; onLargeInsert(chars): void; }

// types.ts ⚠ — additions
interface LockdownProviderProps {
  policy: EduIntegrityPolicy;           // from fetchEffectivePolicy(kind, itemId)
  context: LockdownContextInfo;         // { contextKind, contextId: submission/attempt id, courseId }
  student: WatermarkStudent;
  courseCode?: string;
  canaryToken?: string;
  /** NEW. When true (or contextId starts with "playground-"), decide allow/block but send nothing. */
  offline?: boolean;
  children: ReactNode;
}
interface LockdownState {               // NEW, from useLockdownState()
  ready: boolean;                       // sessionStateMine has returned
  locked: boolean;                      // editors become read-only
  fullscreenRequired: boolean;
  inFullscreen: boolean;
  fullscreenSupported: boolean;
  tabSwitchCount: number;
  warnAt?: number;
  lockAt?: number;
}
```

| Export | Used by | Notes |
|---|---|---|
| `<LockdownProvider {...LockdownProviderProps}>` | Keya (workspace), Shreenidhi (quiz) | Mount **once** per work page. It mounts the watermark, start screen, lock overlay and notices itself. |
| `useLockdown(): IntegrityHooks` | Keya's editors | Unchanged |
| NEW `useLockdownState(): LockdownState` | Keya, Shreenidhi | `locked` → `readOnly` on editors and inputs |
| NEW `<ProtectedQuestion>{children}</ProtectedQuestion>` | Keya (step instructions), Shreenidhi (quiz prompts) | Copy rules and the copy trap (G8) |
| `<IntegrityTimeline contextKind? contextId />` ⚠ (`contextKind` added, defaults to `'ASSIGNMENT'`) | Rohith's submission viewer, your dashboard | |
| NEW `<IntegrityDashboard courseId />` | your page | The page is a thin wrapper that reads `:courseId` |
| NEW `<PlatformIntegrityOverview />` | Shreya's `/admin/integrity` | |
| NEW `<IntegrityPolicyEditor level levelId? onSavePlatform? />` | Shreya (PLATFORM, COURSE), Rohith (ASSIGNMENT), Shreenidhi (QUIZ) | `onSavePlatform(policy, lockedFields)` is required for PLATFORM |

Editor obligations (already in `features/editors/types.ts` plus G6): call `onCopy` on copy and cut, and `onPaste`/`onDrop` before inserting
(prevent the default when they return `false`). Call `onLargeInsert(chars)` for inserts of 20 or more characters that didn't come from a paste. Put `data-integrity-managed="true"` on the editor root.

### api.ts (final)
```ts
fetchEffectivePolicy(kind, itemId)            → EduIntegrityPolicy        // EduIntegrityPolicy.forContext
fetchPolicyEditorView(level, levelId?)        → PolicyEditorView          // NEW editorView
savePolicyOverride(level, levelId, p, reason) → PolicyEditorView          // NEW saveOverride
logIntegrityBatch(kind, ctxId, sessionId, ev) → SessionState              // ⚠ was Promise<number>
fetchSessionState(kind, ctxId)                → SessionState              // NEW sessionStateMine
fetchTimeline(kind, ctxId, limit, offset)     → EduIntegrityEvent[]       // ⚠ now uses timeline(), not raw fetch
fetchStudentContexts(courseId, personId)      → ContextRow[]              // NEW
fetchCourseReport(courseId, since?)           → StudentRiskRow[]
fetchPlatformReport(since?)                   → CourseRiskRow[]
releaseLock(kind, ctxId, reason)              → EduIntegrityEvent
flushOnUnload(kind, ctxId, sessionId, ev)     → void                      // NEW fetch keepalive (G10)
```
Query keys (`common/queryKeys.ts`, already there): `policy`, `integrityReport`, `integrityTimeline`. You also need
`integritySession(kind, ctxId)`, `integrityStudentContexts(courseId, personId)`, `integrityPlatform(since)` and `policyEditor(level, id)` (PR → Shreya, or add them yourself as a reviewed ⚠ change).

## 5. Error codes you throw
`EDU_FORBIDDEN` (not your context or course) · `EDU_NOT_FOUND` (unknown submission, attempt, assignment or quiz) · `EDU_VALIDATION`
(locked field, empty reason, unlocking a session that isn't locked) · `EDU_LOCKED` (`assertNotLocked`). Always throw `new Error('EDU_<CODE>: detail')`.
