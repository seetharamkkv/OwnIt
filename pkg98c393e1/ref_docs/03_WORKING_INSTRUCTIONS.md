# Working instructions for the integrity workstream

## 1. Branch and ownership rules
- Branch: `seetharam-integrity`. Merge into `main` at least every 2 days (`PROJECT_PLAN.md` §0.3). Rebase after Shreya's core merges.
- **Edit freely:** `pkg98c393e1/src/integrity/**` and `pkg98c393e1/ui/react/src/features/integrity/**` (except `types.ts` ⚠).
- **Team review (⚠):** `features/integrity/types.ts`, your block in `common/eduTypes.ts`, and the return type of `logBatch`.
- **Never edit directly:** other people's folders, `App.tsx`, `config/navigation.ts`, `globals.css`, `metadata/Role/*`,
  `package.json`/`package-lock.json` (only Shreya installs packages). Send a PR from the list in `04` §D instead.
- Before your first commit, set up the repository's git hooks. Don't bypass them (`--no-verify`).
- Don't create `README.md` files inside the package, and don't edit `.env` files.

## 2. C3 coding rules for your files
- One type per `.c3typ` file. Inner types keep the dot in the file name (`EduIntegrityEvent.SessionState.c3typ`).
- Document every field and method in the `.c3typ` (with `{@link Type#field}`), not in the `.js`.
- All your server methods are `js-server`. No Python is needed in this workstream.
- Get the caller **only** through `EduSession.currentUserId()`, never `User.myUser()`. It supports dev personas.
- Staff methods start with `EduEnrollment.requireCourseRole(courseId, [...])`. Admin-only methods check
  `EduUserProfile.make({id: EduSession.currentUserId()}).get('platformRole').platformRole == 'ADMIN'`.
- Never trust `courseId`, the person or the severity from the browser. Take them from the server record.
- Errors: `throw new Error('EDU_<CODE>: detail')` (`common/errors.ts` turns the code into a friendly message).
- Logging: `var log = Logger.for('EduIntegrityEvent'); log.info('… {}', x)`. Never `console.log`, and **never log clipboard content**.
- Reads: `include` only the fields you need; `fetchObjStream` for report scans; `fetchCount` for counts; `createBatch` for event writes.
- Enum values on the wire are upper case (`PASTE_BLOCKED`), which matches `eduTypes.ts`.
- Writes to other people's records (`EduSubmission.flagCount`, `canaryToken`): `make({id, field}).merge()`, and only those fields.

## 3. Frontend rules
- TypeScript strict; no `any` (the existing `c3Action.ts` is the only exception).
- Components call `features/integrity/api.ts`, never `c3Call` directly. Wrap reads in react-query with keys from `common/queryKeys.ts`.
- **There is no fallback data.** Show errors with `eduErrorMessage(err)` in an `Alert` or `PageMessage`.
- UI pieces come from `@/components/ui/*` (`alert`, `badge`, `data-grid`, `side-panel`, `modal`, `metric-card`, `tabs`, `switch`,
  `combobox`, `input-number`, `tooltip`, `page-header`). Colours come from `var(--c3-style-…)` tokens, and text styles from `text-c3-*` classes, as in the existing files.
- Browser listeners: add them in `useEffect`, and always remove them in the cleanup function. Use the capture phase on the provider root.
- Run `npm run build` (lint + type check + Vite build) in `pkg98c393e1/ui/react` before every push.
- **Never** start, stop or kill `npm run dev`. C3 Code runs the dev server. The app preview is `http://localhost:9000`.
- Before changing React code, load the `c3-frontend` skill in C3 Code.
- For backend files, load `c3-backend-code`, `c3-type-dsl` and `c3-annotations`. For roles, load `c3-access-control`. For formal tests, load `c3-testing`.

## 4. Everyday commands
| What | How |
|---|---|
| Validate the package | C3AI-AppMcpServer `isValidationComplete` until true, then `issuesForPkg({pkgName:'pkg98c393e1'})` → expect `{}` |
| Build the UI | `cd pkg98c393e1/ui/react && npm run build` |
| Jest | `cd pkg98c393e1/ui/react && npx jest src/features/integrity` |
| Reload demo data | `runJsOnLiveApp`: `App.State.inst().get().withFields({ pkgFingerprint: -1, seeded: false }).update(); C3.pkg().upsertAllSeed()` |
| Act as a persona in the UI | the **Act as…** menu in the top bar (`devPersonas` is on in this workspace) |
| UI dev server status | `uiServiceStatus` (restart only with `uiServiceEnsure`, if it has stopped) |
| The live app still runs your old `.js` | Call `clearCaches` (C3AI-AppMcpServer), then call the method again |
| Browser checks | The Playwright browser isn't signed in (API calls return 401), so it's good for layout only. Check paste, tab and lock behaviour in your own signed-in browser, with the network tab open |

Demo ids: course `seed_course_cs101` (code `CS101-F26`) · assignment `seed_assignment_cs101_hw1` · submission
`seed_submission_cs101_hw1_student01` · student `seed_user_student01` · other student `seed_user_student02` ·
instructor `seed_user_instructor1` · TA `seed_user_ta1`.

## 5. Smoke-test snippets (`runJsOnLiveApp`)
Run one after each method first works. These snippets switch the persona and **always switch back**.

```js
// Effective policy
EduIntegrityPolicy.forContext('ASSIGNMENT', 'seed_assignment_cs101_hw1').toJson()
```
```js
// logBatch as the owning student, then as someone else (expect EDU_FORBIDDEN)
var out = {};
try {
  EduSession.setDevPersona('seed_user_student01');
  out.ok = EduIntegrityEvent.logBatch('ASSIGNMENT', 'seed_submission_cs101_hw1_student01', 'smoke-1', [
    EduIntegrityEvent.ClientEvent.make({ eventKind: 'PASTE_BLOCKED', details: { chars: 120, contentHash: 'abc123' } }),
    EduIntegrityEvent.ClientEvent.make({ eventKind: 'CANARY_MATCH' })            // must be dropped (server-only)
  ]).toJson();
  EduSession.setDevPersona('seed_user_student02');
  try { EduIntegrityEvent.logBatch('ASSIGNMENT', 'seed_submission_cs101_hw1_student01', 'smoke-1', []); }
  catch (e) { out.forbidden = String(e.message || e).indexOf('EDU_FORBIDDEN') >= 0; }
} finally { EduSession.setDevPersona(null); }
out.rows = EduIntegrityEvent.fetchCount({ filter: Filter.eq('clientSessionId', 'smoke-1') });   // expect 1
JSON.stringify(out)
```
```js
// Course report as the instructor
try { EduSession.setDevPersona('seed_user_instructor1');
      JSON.stringify(EduIntegrityEvent.courseReport('seed_course_cs101', null).map(function (r) { return r.toJson(); }).slice(0, 3)); }
finally { EduSession.setDevPersona(null); }
```
```js
// Clean up smoke rows (admin)
EduIntegrityEvent.removeAll({ filter: Filter.eq('clientSessionId', 'smoke-1') }, true)
```
Note: personas test the **Edu** checks (ownership, course role), **not** C3 role permissions. See §6.

## 6. Permission test (G3), to fill in during Phase 0
| Question | Result | Date | Decision |
|---|---|---|---|
| Can a real `Edu.Role.Student` user run `logBatch` when the role grants only `allow:EduIntegrityEvent::logBatch`? | _tbd_ | | |
| Can that user call `EduIntegrityEvent.fetch` directly over the REST API? (It must be **no**) | _tbd_ | | |
| Does `startMine` → `EduCanary.issueToken` → `EduSubmission.merge` work for that user? | _tbd_ | | |

## 7. Definition of done (each task)
- [ ] `.c3typ` validates; no Pkg.Issue errors in `pkg98c393e1`
- [ ] Each new method was smoke-tested once on the live app (§5) and returns the documented shape
- [ ] `npm run build` passes
- [ ] The UI reads real data through `api.ts` → `c3Call`; no hard-coded arrays or fallback data
- [ ] No pasted, copied or typed text is stored, logged or sent anywhere
- [ ] Jasmine or Jest tests for the logic in `05_TEST_PLAN.md` that the task touches
- [ ] Your rows in `resource/TEAM_FILES.md` show the new status

### How to report progress (the same rules as the rest of the team)
- **Built** = the build passes. **Backend-verified** = a `runJsOnLiveApp` call returned the right shape. **UI-verified** = you saw the page
  in the browser as the right persona, and the `/api/8/EduIntegrityEvent/*` requests returned 200.
- Call a UI feature (blocking, notices, overlay, watermark) done only once it's **UI-verified**.
