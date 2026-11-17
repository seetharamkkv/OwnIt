# OwnIt

OwnIt is a C3 AI education platform for locked-down, step-by-step coursework. It helps instructors turn Python, notebook, and document templates into guided assignments where students complete one step at a time, run tests, submit assembled files, and work under integrity controls such as paste blocking, tab-switch logging, watermarking, and canary detection.

## Core Functionality

### Role-Based Platform

OwnIt supports three platform roles:

- **Admins** manage platform users, courses, feature flags, global integrity policy, audit logs, retention, and exports.
- **Instructors and TAs** manage course content, assignments, tests, quizzes, submissions, grades, accommodations, and integrity review.
- **Students** complete assignments and quizzes, view course work, submit files, and see released scores.

Permissions are enforced on the backend. Course-level permissions allow instructors to grant specific TA capabilities such as editing content, viewing integrity reports, grading, releasing grades, granting extensions, managing enrollment, and releasing integrity locks.

### Courses and Enrollment

The course model supports:

- Course creation, archiving, terms, descriptions, and instructor assignment.
- Student, instructor, and TA enrollment.
- TA permission configuration per course.
- Bulk enrollment support.
- Per-student accommodations such as extra time and integrity-policy exemptions.
- Course dashboards for assignments, quizzes, grades, people, and integrity.

### Assignment Engine

Instructors can create structured assignments from templates in multiple formats:

- **Python (`.py`)** templates use step markers to define editable regions.
- **Jupyter notebooks (`.ipynb`)** use tagged cells or step markers.
- **Word documents (`.docx`)** use step placeholders and optional end markers.

The assignment engine parses templates into ordered steps, keeps surrounding context read-only, preserves tests when templates are re-imported, and assembles student answers back into the final deliverable. It also supports previewing templates, storing test data files, and generating download links for submitted work.

### Student Workspace

Students work in a guided workspace with:

- One editable step at a time.
- Read-only context before and after each step.
- Step instructions rendered from Markdown.
- Autosave with revision conflict protection.
- Step completion tracking.
- Due dates, late status, extensions, and read-only submitted state.
- Final submission that assembles the completed file on the server.

The workspace uses editors that match the assignment type:

- **Python editor** with CodeMirror.
- **Notebook editor** with notebook-style cells and output.
- **Document editor** with a Word-like rich-text experience.

### Integrity Controls

OwnIt includes an integrity layer designed to deter and log suspicious behavior while preserving student privacy.

Supported controls include:

- Blocking or logging external paste.
- Allowing internal copy and paste within the app.
- Blocking drag-and-drop inserts from outside the app.
- Blocking copy from protected instructions.
- Blocking context menus when policy requires it.
- Detecting large inserts.
- Logging tab switches, window blur, fullscreen exits, and session events.
- Optional lock state when tab-switch limits are exceeded.
- Screenshot and print deterrence.
- Watermark overlay with student, course, timestamp, session, AI notice, and optional canary token.
- Canary detection when a student's answer contains the personalized canary token.

Integrity events store metadata such as hashes, lengths, durations, and event kinds. They do **not** store pasted text.

### Testing and Feedback

Assignments can include visible and hidden step tests.

- Students can run visible tests in the browser for immediate feedback.
- Browser test results are saved as feedback only and are not trusted grades.
- Instructors can run trusted regrades, including hidden tests.
- Test results include pass/fail state, messages, stdout, and duration.
- Test data files can be attached to assignments and loaded by the runner.

### Gradebook

The gradebook provides:

- Course-level assignment and quiz score grids.
- Trusted score computation from test runs.
- Late penalty handling.
- Manual score overrides with audit logging.
- Grade release controls.
- CSV export for external grade systems.
- Student score visibility only after grades are released.

### Quizzes

OwnIt supports quiz authoring and student attempts with:

- Single-choice, multi-choice, true/false, short-answer, and code questions.
- Question pools and random draws.
- Shuffled questions and options.
- Time limits, deadlines, and attempt limits.
- Autosaved answers.
- Auto-submit through a scheduled job.
- Automatic grading for objective question types.
- Manual grading for code or free-response answers.
- Integrity policy support during quiz attempts.

### Admin Console

The admin area is designed for:

- Platform overview metrics.
- User and role management.
- Course management.
- Platform-wide integrity policy defaults and locked policy fields.
- Integrity overview across courses.
- Audit-log search.
- Data retention, course export, and student-data deletion.
- Feature flag management for notebooks, documents, quizzes, forums, server tests, and demo personas.

### Audit and Privacy

OwnIt records audit logs for privileged actions, including role changes, policy updates, enrollment changes, grade overrides, grade releases, extensions, accommodations, lock releases, and privacy-sensitive admin actions.

The platform separates feedback from official grades, hides scores until release, avoids sending hidden tests or answer keys to students, and treats integrity signals as review flags rather than automatic penalties.

## Technical Architecture

The project is a C3 AI package under `pkg98c393e1`.

Backend areas:

- `src/core/` - users, courses, enrollments, sessions, audit logs, platform config, admin services.
- `src/assignment/` - assignment templates, parsing, steps, attachments, assembly, downloads.
- `src/submission/` - student submissions and step responses.
- `src/integrity/` - integrity policy, event logging, reports, locks, canary tokens.
- `src/grading/` - tests, test runs, gradebook, quizzes, attempts, answers.

Frontend areas:

- `ui/react/src/common/` - shared types, auth, routes, API helpers, layout utilities.
- `ui/react/src/features/home/` - dashboards and landing pages.
- `ui/react/src/features/courses/` - course views.
- `ui/react/src/features/authoring/` - assignment builder and submission viewer.
- `ui/react/src/features/workspace/` - student assignment workspace.
- `ui/react/src/features/editors/` - Python, notebook, and document editors.
- `ui/react/src/features/integrity/` - lockdown provider, watermark, timelines, dashboards.
- `ui/react/src/features/testing/` - Pyodide runner, test panel, test editor.
- `ui/react/src/features/grading/` - gradebook and regrading.
- `ui/react/src/features/quiz/` - quiz builder and quiz taking.
- `ui/react/src/features/admin/` - admin console pages.

Main technologies include C3 AI Platform 8.10, server-side C3 JavaScript, Python 3.12 runtimes, React 18, TypeScript, Vite, Tailwind, React Query, CodeMirror, TipTap, Pyodide, and Jest.

## Current Status

The repository contains the base OwnIt code tree, data model, routes, API wrappers, demo data, and major feature implementations. Assignment parsing and assembly, student submissions, visible testing, trusted regrading, gradebook operations, quiz backend methods, integrity logging, watermarking, paste controls, canary detection, and the student shell are implemented or scaffolded.

Some admin and integrity reporting methods, quiz pages, and dashboard views may still be placeholders depending on the active branch and deployment state. Check `pkg98c393e1/resource/WORKSPACE_SUMMARY.md` for the latest implementation status.

## Development Notes

- Product name: **OwnIt**.
- Package name: `pkg98c393e1`.
- Demo users and course data live under `pkg98c393e1/test/data/`.
- Project planning and ownership details live under `pkg98c393e1/resource/`.
- Integrity-specific reference docs live under `pkg98c393e1/ref_docs/`.
- Student methods use `*Mine` naming and never accept a browser-provided user id.
- Enum values on the wire use upper-snake names such as `PUBLISHED`, `BLOCK_AND_LOG`, and `STUDENT`.
