# Integrity test plan

Tier 1 (always): smoke snippets in `03` §5, `npm run build`, and a browser check of each page you change.
Tier 2 (this file): formal tests. The team plan requires unit tests for backend methods and for lockdown logic (`PROJECT_PLAN.md` §0.4).

## 1. Backend: Jasmine (`pkg98c393e1/test/js-rhino/integrity/`)
Load the `c3-testing` skill first (it covers `TestApi`, impersonation and how to clean up test data). Create test records with ids starting `test_integrity_`, and remove them in `afterAll`.

| File | Cases |
|---|---|
| `EduIntegrityPolicy.spec.js` | platform only → defaults applied · course override wins over platform · item override wins over course · explicit `false` overrides `true` · a locked field keeps the platform value even when the course is stricter · unknown assignment → `EDU_NOT_FOUND` · student not enrolled → `EDU_FORBIDDEN` · `saveOverride` with a locked field → `EDU_VALIDATION` · `saveOverride` writes one `EduAuditLog` with `action == 'policy.update'` · TA `saveOverride` → `EDU_FORBIDDEN`, `editorView.canEdit == false` |
| `EduIntegrityEvent.logBatch.spec.js` | owner stores N events · non-owner → `EDU_FORBIDDEN` · server-only kinds are dropped · severity comes from the table, not the browser · 150 events → 100 stored · `note` cut to 120 characters · `courseId` comes from the server even when the browser sends another · `flagCount` equals the WARN + HIGH count after 2 batches · a SUBMITTED submission stores 0 and doesn't throw |
| `EduIntegrityEvent.lock.spec.js` | `lockAt = 3`: 2 TAB_HIDDEN → not locked; 3rd → `locked` and one `LOCK_TRIGGERED` · a 4th doesn't add a second trigger · `assertNotLocked` throws `EDU_LOCKED` · `releaseLock` by an INSTRUCTOR → unlocked plus an audit row · `releaseLock` by a TA → `EDU_FORBIDDEN` · empty reason → `EDU_VALIDATION` · after a release the count restarts at 0 |
| `EduIntegrityEvent.reports.spec.js` | `courseReport` has one row per enrolled student, including those with 0 events · counts and `tabHiddenMs` are correct for a fixed set of events · sorted by `riskScore` · `since` filters · a student caller → `EDU_FORBIDDEN` · `timeline` from another course → `EDU_FORBIDDEN` · `platformReport` as a non-admin → `EDU_FORBIDDEN` |
| `EduCanary.spec.js` | `issueToken` is idempotent and matches `/^qz_[0-9a-f]{4}$/` · `detect` finds the exact token, `QZ_7F3A`, `qz7f3a` and `qz-7f3a`, and the token inside HTML · no match → false and no event · two `detect` calls → one `CANARY_MATCH` · `canaryEnabled=false` → no scan |

## 2. Frontend: Jest (`ui/react/src/features/integrity/__tests__/`)
| File | Cases |
|---|---|
| `clipboardRegistry.test.ts` | the hash ignores CRLF vs LF · it remembers at most 50 entries · empty text is ignored · `sessionStorage` round trip per context |
| `pasteDecision.test.ts` (pull the decision into a pure `decidePaste(policy, isInternal)` function) | the 4 paste modes × internal/external × `blockInternalPaste` → `{allow, eventKind?, notice?}` |
| `useEventQueue.test.ts` | flushes every 5 s (fake timers) · TAB_HIDDEN flushes immediately · a failed flush keeps events · the 500 cap drops INFO first · `offline` makes no calls · `SessionState.locked` reaches the provider state |
| `LockdownProvider.test.tsx` | an outside paste into a plain `<textarea>` is blocked (catch-all) · a paste inside `[data-integrity-managed]` isn't handled twice · the context menu is blocked unless `allowContextMenu` · a notice appears and has `aria-live` |
| `Watermark.test.tsx` | shows the name, number and course · shows the canary line only with a token · `hideWatermark` hides it · removing the node puts it back and pushes `DEVTOOLS_SUSPECTED` once |
| `useTabTracking.test.ts` | hidden/visible → TAB_HIDDEN `count` and TAB_VISIBLE `durationMs` · the warning appears at `warnAt` |

Mock `api.ts` with `jest.mock('@/features/integrity/api')`. Don't make network calls in Jest.

## 3. Manual browser checks (C3AI-PlaywrightMCP or by hand at `http://localhost:9000`)
Act as `seed_user_student01` on HW1. Check that the `/api/8/EduIntegrityEvent/logBatch` requests return 200 and that rows appear.

| # | Step | Expected |
|---|---|---|
| M1 | Copy text from another website and paste it into the editor | Blocked; a notice; one `PASTE_BLOCKED` with `chars`, and **no text** in the row |
| M2 | Copy a line inside the editor, then paste it | Allowed; `PASTE_INTERNAL` |
| M3 | Reload, then paste the line from M2 again | Still allowed (G13) |
| M4 | Drag text in from another window | Blocked; `DROP_BLOCKED` |
| M5 | Right-click in the workspace | No menu; `CONTEXT_MENU_BLOCKED` (throttled) |
| M6 | Try to select and copy the instructions | Not selectable; `COPY_BLOCKED` |
| M7 | Switch tabs 3 times (`tabSwitchWarnAt=3`) | A warning after the 3rd; TAB_HIDDEN/VISIBLE pairs with durations |
| M8 | With `tabSwitchLockAt=3`: switch tabs 3 times, then reload | Locked overlay after the 3rd, still locked after the reload; typing is refused; a save returns `EDU_LOCKED` |
| M9 | As `seed_user_instructor1`: dashboard → Sam → Unlock with a reason | The student unlocks within 20 s; `LOCK_RELEASED` and an audit row |
| M10 | `requireFullscreen` on (deployed URL) | Start screen; Esc → blurred work and `FULLSCREEN_EXIT`; in the C3 Code preview → a warning only |
| M11 | Delete the watermark node in developer tools | It comes back; one `DEVTOOLS_SUSPECTED watermark-removed` |
| M12 | Answer a step with the canary name and submit (canary on) | One HIGH `CANARY_MATCH`; it appears on the dashboard |
| M13 | As `seed_user_ta1`: open the dashboard | Can view it; the Unlock button is disabled; the policy editor is read-only |
| M14 | As `seed_user_student02`: open `/course/seed_course_cs101/integrity` | Blocked by the route guard; a direct API call → `EDU_FORBIDDEN` |
| M15 | Download the assembled file | It contains no watermark, AI notice or canary sentence |

## 4. End-to-end demo (your part of `PROJECT_PLAN.md` §12.10)
1. **Admin:** lock `pasteMode` on the platform policy (the padlock is visible in the course editor).
2. **Instructor:** set the HW1 overrides `requireFullscreen`, `tabSwitchLockAt=3` and `canaryEnabled`; an audit row appears.
3. **Student:** start HW1 → start screen → work; outside paste blocked; in-app paste works; 3 tab switches → locked.
4. **Instructor:** the dashboard shows Sam at the top → timeline → Unlock with a reason.
5. **Student:** continue; answer with the canary name; submit.
6. **Instructor:** the submission viewer shows the timeline with a HIGH canary event. **Admin:** `/admin/integrity` shows CS101 with 1 HIGH event; the audit log shows `policy.update` and `integrity.unlock`.
