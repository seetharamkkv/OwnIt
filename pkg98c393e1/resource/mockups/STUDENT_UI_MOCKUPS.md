# Student UI mockups — "Stepwise" (extracted 2026‑11‑17)

Source: `Anti-Cheating Homework Platform — Student UI.html` (10 boards, 1440 px wide). This file is the text
version of those boards plus the palette, so nobody needs the 5 MB HTML. Where the mockup goes beyond the data
model, the gap is listed in section 3.

## 1. Design language

Dark theme. The product is **OwnIt** (ring-with-check logomark, `common/OwnItLogo.tsx`); "Stepwise" was the mockup's working name and survives only as the theme name (`.stepwise`, `--sw-*`, `common/stepwise/`). Fonts: **Inter** (UI) and **JetBrains Mono** (code, file names,
kind chips). Radii 10–16 px for cards, 999 px pills. 44 px tall buttons. Implemented as CSS variables in
`ui/react/src/styles/stepwise.css` (`--sw-*`), scoped under the `.stepwise` class; shared pieces in
`ui/react/src/common/stepwise/ui.tsx` (`KindBadge`, `StepBar`, `PercentBar`, `Chips`, `SwCard`, `Eyebrow`, date helpers).

| Token | Hex | Use |
|---|---|---|
| bg / elevated / card / card‑2 / input | `#0B0B0D` `#0E0E11` `#141417` `#111114` `#0F0F12` | surfaces |
| border / border‑strong / row‑hover / track | `#222227` `#2E2E34` `#1A1A1F` `#2A2A30` | lines, hover, empty bars |
| fg / fg‑2 / muted / faint / dim | `#EDEDEF` `#D4D4D8` `#A1A1AA` `#8E8E99` `#5E5E68` | text |
| accent / soft / bg / card / border / strong | `#8B7CF6` `#C4B5FD` `#1E1A33` `#141320` `#2E2A44` `#5B4FB0` | primary actions, current step, "Up next" card |
| success / bg | `#34D399` `#0F2A20` | done, passing, grades |
| warn / bg | `#FBBF24` `#2A2110` | due today, failing test, late window count |
| danger / bg | `#F87171` `#2A1215` | failing test icon, late |
| kind `.py` / `.ipynb` / `.docx` / Quiz / `.tex` | `#60A5FA` `#FB923C` `#38BDF8` `#F472B6` `#4ADE80` (each with a dark bg) | file‑kind chips |

Student shell: top bar — logomark + "Stepwise", term pill ("Fall 2026"), nav **Home · Courses · Grades**, bell,
avatar + name. No side nav for students. Content max‑width 1200 px. Admin shell (A1/A2) is a left side nav
with a **course scope** dropdown and "Acting as Admin · switch persona".

## 2. Boards

### 1 · Home — upcoming & to‑dos (`/`) — **built**: `features/home/StudentHomePage.tsx`
- "Good afternoon, Alex" · "Tuesday, November 17 · 6 things due in the next 7 days" · "All courses →".
- **Up next** card (accent): due‑in pill, title, course · file name, "Next: Step 3 — Normalise column names · 1 test
  failing", **Continue step 3** button, "2 of 5 steps done · Due today, 11:59 PM", segmented step bar.
- **Upcoming deadlines** with chips All / Homework / Quizzes (counts), grouped **Today · Tomorrow · This week ·
  Later**. Row: month/day, kind chip, title, "course · meta" (Step 3 of 5 / Late window · −10% / 6 steps · 20 pts /
  20 min · 1 attempt), thin progress bar + "2 / 5 steps", due ("11:59 PM", "Late until Nov 18", "Wed 11:59 PM") +
  sub ("10h 54m left", "Was due Nov 16"), chevron.
- Right column: tiles **Due in 7 days / In progress / In late window** (warn tone when > 0); **To‑do** list with
  checkboxes and "Add a personal to‑do…" (not built, see §3); **Recently graded** ("HW2 · Exploratory Analysis ·
  DS 210 · Nov 12 · 18.5 / 20"); **How proctored homework works** notice.

### 2 · My courses (`/courses`)
- "5 courses this semester · 4 as a student, 1 as a TA", semester dropdown (Fall 2026 / Spring 2026 / Fall 2025).
- Course cards: short code tile, "code · term", title, instructor, role pill, three stats (open homework, done
  homework, grade), "Next: … · due …". Footer: "Past semesters stay read‑only…".

### 3 · Course — homework this semester (`/course/:id`)
- Breadcrumb "Courses / DS 210", title, "Fall 2026 · DS 210 · Prof. R. Iyer", semester dropdown.
- Tabs **Homework · Quizzes · Grades · People**. Chips All / Open / Submitted & graded / Upcoming; "Sorted by due date".
- Row: "HW‑3 · .py" + status pill (Open / Submitted / Graded / Late window / Upcoming), title, subtitle,
  "Release Nov 3", "Due Today 11:59 PM", extra ("Late until Nov 19 (−10%)" / "Worth 20 pts" / "Submitted Oct 5"),
  "2 / 5 steps" bar, score cell ("Step 3 · 1 test failing" / "18.5 / 20" / "Opens Nov 30"). Empty: "No homework in this view."

### 4a · .py step workspace (`/assignment/:id`)
- Header: back, "DS 210 · HW‑3 · .PY", title, "Saved · 4s ago", due pill, "Proctored · outside paste blocked",
  full‑screen button, **Submit homework**.
- Left: Progress card + segmented bar; step list (✓ / number dot, title, "Tests passing · 2 pts" / "In progress · 1
  failing" / "Not started"); **This session** card (outside pastes blocked 1, tab switches 2 of 5 allowed, "What is logged?").
- Centre: editor card with file tab `cleaning.py`, "Python 3.12 · only step 3 is editable"; collapsible read‑only
  context above/below ("Show lines 1–4"), signature line dimmed, **Your answer · Step 3 · revision 14** dashed accent
  box with the editable body; ← Step 2 / Step 4 → buttons.
- Right: instructions card (Step 3 of 5 · 4 pts, "Copy disabled", title, prose, mono example block); **Tests** card
  with "Run tests for this step", per‑test rows (✓/✕/○, name, ms, assertion message, −got / +want diff), footnote
  "These visible tests give you feedback only. Your grade comes from hidden tests that run after you submit."
- Toast "Paste blocked. Text from outside this homework can't be pasted. This was logged; the text itself wasn't saved."
- Submit modal: "Submit HW3?", "You won't be able to edit after submitting. We'll put your steps together into
  cleaning.py…", Steps passing visible tests 2 of 5 / Steps not started 2 / Time left 10h 54m, **Keep working** / **Submit anyway**.
- Watermark tiles rotate three texts: name · student number · course · time · session id; AI notice; canary line.

### 4b · .ipynb notebook — same frame; "Progress 2 of 6 cells done"; "Python 3.12 · ready"; notebook with In [n]
gutters, markdown parts rendered, earlier cells read‑only with outputs, the current cell in the accent box with
**Run cells 1–3**, "2 more cells below · locked until you open those steps"; right card notes "Running a cell runs
every cell above it first".

### 4c · .docx document — "Progress 1 of 4 sections done", "Total words 412 / 900–1200"; toolbar (paragraph
style, B/I/U); white page with template heading, read‑only section 1, **Your answer · Section 2 · 186 words**
editable, "Section 3 opens when you move to that step"; right: **Section checks** (✓ At least 3 constraints listed,
! Word count 200–300 186, ✓ Uses the heading), "Your instructor grades the writing…", formatting note.

### 4d · Quiz — header "Answer saved", "Full screen · proctored", **14:32 left** timer, **Submit quiz**; left:
question grid (Answered / Current / Flagged), "Attempt 1 of 1", auto‑submit notice; centre: "Question 3 of 6 ·
Multiple choice · 2 pts", flag toggle, prompt, options ("Select all that apply. Partial credit…"), short answer
("Spaces and capitals are ignored"), code question with `answer.py` editor, **Run tests**, ✓ test rows; Previous / Next.

### 4e · LaTeX (.tex) — **new file kind**: source pane with read‑only preamble, "Your answer · Problem 3", locked
later problems; symbol bar; **Preview** pane "Compiled · no errors"; **Checks** (✓ Compiles, ✓ Inside the solution
environment, ! Eigenvector for λ₂ missing).

### A1 · Admin — overview: tiles, "Integrity flags per day" bar chart (warn + high, hover breakdown), "Needs
attention" list, "Assignments closing this week" table (Due / Submitted / Avg visible tests / Flags), "Recent audit
log", **System** card (Pyodide healthy, `py-edu_312` installed, server tests off, storage 38 %).

### A2 · Admin — all students: "412 students across 9 courses", **Import CSV** drop zone with per‑row results
("row 18 · invalid email", "already in DS 210, will be skipped"), **Enroll 61 students**; search + course filter +
chips; bulk actions (Grant extension / Message / Move to course / Drop); table (Student, Student #, Courses,
Submitted, Avg score, Flags · 14 d, Risk, Last active, View work →), paging.

## 3. Gaps between the mockup and the data model (decide before building)

| Mockup feature | Status | Suggested model |
|---|---|---|
| Personal **to‑dos** on Home | not modelled | `EduStudentTodo { person!, text!, dueAt, done, linkedAssignment }`, `*Mine` methods |
| **`.tex`** file kind, compile + checks | not modelled | add `TEX` to `EduAssignment.FileKind`; parser marker `% <<STEP …>>`; compile in browser (e.g. a WASM TeX) or server |
| **Grades** nav for students | route exists (`/grades`), page is a placeholder | `EduGradebook.myGrades()` honouring `gradesReleasedAt` |
| **Semester** dropdown / past semesters | `EduCourse.term` is a label | add `EduTerm` or `termOrder`; archived courses read‑only |
| Course **instructor name** on cards | derivable from enrollments | include INSTRUCTOR enrollments in `EduSession.me` or a `courseCards()` method |
| "Recently graded" | **built** via `EduSubmission.myDashboard` | — |
| "Next: Step 3 … · 1 test failing" | **built** (`nextStepOrder`, `nextStepTitle`, `failingVisibleTests`) | — |
| Section **checks** for .docx (word count, headings, ≥ N bullets) | not modelled | `EduStepTest` with `checkKind: WORD_COUNT \| HEADING \| LIST_MIN` evaluated client‑side |
| "2 of 5 tab switches allowed" | policy has `tabSwitchLockAt` | surface `sessionStateMine` counts in the "This session" card |
| Notifications bell | nothing | later |
| Admin "course scope" and bulk student actions | partly (bulkEnroll) | message / move / drop methods + audit |
