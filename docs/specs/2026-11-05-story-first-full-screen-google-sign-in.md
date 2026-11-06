# A beginner who hates maths learns finance through stories and lively pictures, on a workspace that fills the screen, signed in with Google

> **What this is:** a spec for an LLM coding agent (Claude Code) working in the Finance Agent repo (Next.js 16, Tailwind v4, OpenUI, Drizzle on Neon). It also tells the session that implements it how to run the work as one self-orchestrated Workflow, with tests first and critics at the end.
>
> **Where it came from:**
> - the owner's voice note of 5 November 2026 about the live Study Workspace (`www.value-it.xyz/study`): "tacky", wasted screen, buttons that don't look like buttons, monotone colours, sparse Widgets, maths that feels like an exam, duplicate pages, no real sign-in
> - a code review of commit `9b8b6e4` on branch `spec`, with every claim checked at a file and line
> - the owner's nine decisions of that day (§3). They are final.
>
> **Where to save it:**
> - this file: `docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md`
> - images the tickets attach: `docs/specs/img/` (before and after screenshots)
> - scripts and tests named in §6 and the tickets (`e2e/**`, `playwright.config.ts`, `e2e/support/measure.ts`, `docs/critics/`)

---

## 0. Read this first (instructions for the agent)

1. **Read the whole file before you touch code.** Then read `GLOSSARY.md`, `docs/architecture.md` and `docs/adr/0001` to `0008`.
2. **Verify before you rely on anything.** Every claim about today's code in §2 has a `file:line` made at commit `9b8b6e4`. Before you rely on one, run the ticket's **Find it** commands. If the code contradicts this spec, **stop that ticket**. Comment on its issue with what you found (command, output, what the spec said) and leave it. Don't guess and don't work around it.
3. **Create the issues first** (Appendix E):
   - One parent issue. Its title is this file's title and its body is §1–§5.
   - One sub-issue per ticket in §7. The title is the ticket heading without its ID. The body is the ticket text from **Why** to **Hot files**. Use the ticket's label.
   - Blocked-by links are native GitHub links, from each ticket's **Depends on**.
4. **Work order** is the waves in §9. Work only on `ready-for-agent` tickets whose dependencies are closed. Never start a `needs-triage` ticket. `ready-for-human` tickets (C2 and H1) are the owner's: do not do them, hand them back.
5. **Test-driven, no exceptions.** Use the `tdd` skill. The protocol, the seams and the metrics are in §6.
   - Write one test, see it **fail for the right reason**, write the code that passes it, then the next test. Red then green, one at a time.
   - Never write all the tests first and then all the code ("horizontal slicing").
   - Tests go only at the seams **S1 to S7** in §6. The owner already agreed these seams: **do not ask again, and do not invent others.**
   - Expected values come from this spec, never recomputed with the same logic the code uses. If a number is not in the spec, take it from the owner's words or stop and comment.
6. **Guardrails for every ticket:**
   - **Dependencies:** the only new ones are `better-auth` (with its Drizzle adapter package `@better-auth/drizzle-adapter`, pinned exactly), `@playwright/test` (dev only) and the vendored Fluent Emoji images. If the T-00 spike fails twice, also `pg` (dev only) for its Postgres fallback. Nothing else, however small.
   - **No paid services.** Google sign-in, Playwright and the emoji are free. The paid live evals (S5) are capped in §9.
   - **Never touch the production database.** Write migrations and test them on PGlite. **The owner runs `db:migrate`.** Never run `drizzle-kit push`, never set `DATABASE_URL` to a production host (`PROD_DB_HOST`), never set `EVAL_DB_OK` except to a Neon branch.
   - **Colours only through tokens.** Components use `var(--token)`. Hex values live only in `globals.css` and `theme.ts`'s swatch table; a test enforces it for the new Widget parts (E2a).
   - **Keep the glossary words.** Learner, Tutor, Topic, Session, Widget, Quick try, Check, Known mistake. New words are in §3.4. Never write "user", "lesson" or "chatbot" in UI copy.
   - **Docs travel with code.** Every PR that adds a layer (a table, module, tool, screen) updates `docs/architecture.md` (what it does, a concrete scenario, the trade-off, in plain words), `GLOSSARY.md` and the ADR it names, **in the same PR**.
   - **Don't change** fonts, copy, routes or components a ticket doesn't name. Keep `data-testid="topic-bar"` and `aria-label="Topic progress"`.
   - **Code decides, the model teaches** (ADR 0001, 0006, owner's standing rule). Sequencing, choices, marking and "a Widget with every reply" are code. Prompts only set the Tutor's voice.
7. **Before each PR:** run `npm run check` and `npm run build`; once T-00 has landed also `npm run ui:test`. Attach the screenshots the ticket asks for. Run the critics the ticket's **Critic check** names.
8. **Every PR goes to `main`**, never to an integration branch. The description has **one `Closes #N` per line**, then `gh pr merge --auto --merge`. **Until the owner adds `ui` to the ruleset (H1), do not run `gh pr merge --auto` until `gh pr checks <n>` shows `ui` passed.** After the merge, **check the issue closed**; if it did not, close it with a comment linking the PR.
9. **If a hot file is claimed by another lane** (§9), do not edit it. Tell the integrator through the Workflow's ownership file (never SendMessage a running agent), wait for that lane's PR to merge, rebase, continue.

---

## 1. What changes

**Look and layout**
- The Study Workspace fills the screen. At 1512 px wide the side gutters fall from 204 px to about 24 px (at most 32).
- Chat takes about 38 % of the width, the Widget panel about 57 %. The Widget is the star of every reply.
- Reading pages (Course Map, Notebook, Settings) use wide grids, not a 672 px column.
- Everything is denser: 15 px chat text, a header of at most 56 px, tighter cards.
- Buttons look like buttons: a raised face with a darker lip that squashes when pressed. Things that only label something (pills, tags) look flat and have no pointer cursor.
- Two themes, Light and Dark. One royal-blue brand colour in three tones, plus four accents with fixed meanings: mint is "you" and gains, coral is losses and warnings, sunflower is history and stories, violet is lingo.

**Pages**
- **Course Map shows progress.** `/progress` redirects to it.
- **Notebook** replaces Past Sessions and Notes: one row per Topic, with the Learner's saved lines, the Topic Note and the Session. `/sessions` and `/notes` redirect to it. "Save to notes" becomes "Save to Notebook".
- **Settings is a gear icon** in the header, next to a theme icon and an account menu. It gains Account, Appearance, About you, Your Topics (start one over), Developer details and Start over.
- **Start a Topic over:** progress resets, a new Session starts, and the old Session stays readable in the Notebook as an Earlier attempt.

**Sign-in**
- **Sign in with Google**, through Better Auth. An invite list decides who gets in; one switch (`signup_open`) opens it to everyone later.
- The owner's Google email links to Learner 1, so the owner keeps their progress.
- The Learner passcode goes. A tools passcode stays for the test tools.

**Learning**
- **No typed numbers, ever.** Quick tries, quiz Checks and Reviews become tap-to-choose story and lingo questions. The Tutor never asks for a sum.
- A wrong choice shows its own mix-up fix.
- **Every Tutor reply ends with 2 or 3 tap-to-answer Choices.** Typing stays open.
- The Tutor tells stories: a warm storyteller who teaches the word first and the number never.

**Widgets**
- **Exactly one Widget with every reply**, in the wide panel. When the Tutor opens none, code adds a Companion Widget.
- New lively parts built around realistic 3D emoji: Story scene, Lingo card, timeline, two paths, money jar, who-pays-whom, myth or fact, headline, choice cards.
- The first 12 Topics on the default path get full story scenes and Widgets. The other 83 get tap-to-choose questions.

**Proof**
- A browser test bed (T-00), nine critic prompts (T-01), goal loops with budgets (§9.4), a preview matrix (F1) and a final two-axis review (F2).

### 1.1 Coverage matrix: every owner complaint, its tickets and the metric that proves it

| # | Owner said (voice note) | Tickets | Done-when metric that proves it |
|---|---|---|---|
| 1 | "20% on the left side and 20% on the right" wasted | A1 | Side gutter at 1512×982 ≤ 32 px on `/study` and every reading page (S1) |
| 2 | "40% of the surface area is not being covered by the widgets" | A1, E5 | Widget panel ≥ 55 % of viewport width at 1512 (S1) |
| 3 | "scalable in how it uses the screen" | A1, F1 | No horizontal scroll at 1024; gutters ≤ 32 px at 1280, 1512, 1920 (S1) |
| 4 | "I can't tell by the buttons if they are buttons or static words" | A3a, A3b | 0 interactive elements without a signifier; 0 non-interactive with `cursor:pointer` (S1, S7) |
| 5 | "that 3D sort of thing... with a curve or bend to it" | A3a, A3b | Lip shadow 3 px on every raised button; pressed state sinks 2 px and the lip shrinks to 1 px (S7, S1) |
| 6 | "weirdly too minimal, you can't tell where to click" | A3b, A5 | Affordance critic ≥ 4/5 on 6 pages; static pills have no shadow (S6, S1) |
| 7 | "colors are so weird, monotone" | A4, E2a, F1 | Both themes pass the contrast script; ≥ 3 distinct accent colours visible on `/study` with a Widget (S7, S1 in F1) |
| 8 | "one color with three tones... different accents" | A4 | Tokens: 1 brand colour, 3 tones, 4 accents; 2 themes only (S3, S7) |
| 9 | "why is everything so big" | A2 | Chat font 15 px; header ≤ 56 px; every clickable thing ≥ 28 px high (S1) |
| 10 | "generative UI is just not good enough... nice and catchy rather than tacky" | E2a, E2b, E3, E5 | Colour and liveliness critic ≥ 4/5; Beginner persona fun median ≥ 4/5 (S6, S5) |
| 11 | "pure math, not fun enough; it lacks novelty" | E2a, E2b, E3, E6a–c | 0 chart-only Widgets (Widget-fit judge `kind`) in the 20-prompt eval (S5) |
| 12 | "emojis, something realistic that comes to life" | E1, E2a | 100 % of registry emoji exist as files; Story scene animates when motion is allowed and stops under reduced motion (S3, S1) |
| 13 | "for every prompt there should be a generative UI" | E4a, E4b | Widget on 100 % of replies (S1 scripted, S5 eval) |
| 14 | "agent should be more proactive... some liveliness" | D3a, D3b, E4a | 2–3 Choices on 100 % of replies; at the concept step one Choice is "What does that word mean?" (S1, S5) |
| 15 | "It's not about the math... you don't need the math" | D1a, D1b, D1c, D2a–j, D3a | 0 typed-number inputs in the Learner UI (S1); 0 sums asked (V8, Math police) |
| 16 | "it isn't a CA exam, you're not sitting for the CFA" | D1a, D2a–j, D3b | Persona "felt like an exam" = no on 20 of 20 eval prompts (S5, S6) |
| 17 | "based on stories" for "rich kids" | D3b, E6a–c, D2a–j | Persona lingo learned ≥ 80 %; Historian pass on every converted Topic (S5, S6) |
| 18 | "You should get the lingo, like basis points" | D3b, E3, E4a, E6a–c | Lingo card for the first Topic term in ≥ 90 % of the 50 stored replies in `src/behaviour/delight/replay-fixtures.json` (new in E4a) that name a term and have no Tutor Widget and no unshown scene (S3) |
| 19 | "progress and course map to be the same thing" | B1 | `/progress` answers 308 to `/course`; Course Map shows status for every Topic (S2, S1) |
| 20 | "past sessions and notes... jammed together" | B2a | `/sessions` and `/notes` answer 308 to `/notebook` (S2, S1) |
| 21 | "'save to notes' — I thought notes were previous sessions" | B2b | Button reads "Save to Notebook"; "Open Notebook" lands on the Topic's row with the saved reply (S1) |
| 22 | "settings is like a button... put it as an icon" | A5 | Header has a gear with `aria-label="Settings"` and no "Settings" text link (S4) |
| 23 | "no settings except start over as a new learner" | A5, B3b | Settings has 6 sections including Your Topics (S4) |
| 24 | "I want each session to be able to be started over" | B3a, B3b | Restart leaves other Topics' rows identical; old Session readable as an Earlier attempt (S2, S1) |
| 25 | "sign in using their Gmail account... once and forever" | C1a, C1b, C2, C3 | Invited Google email gets a Learner; non-invited email gets none (S2, S1) |

---

## 2. What the review found

All refs are `file:line` at commit `9b8b6e4` (4 November 2026 state of `main`, plus this spec's branch). Measured widths below are computed from the classes; T-00's baseline test (S1) re-measures them in a real browser and replaces these as the reference.

### 2.1 Layout

- `/study` main is `mx-auto flex h-dvh max-w-6xl flex-col … px-4 … lg:px-6` (`src/app/study/page.tsx:36`). The frame is `grid grid-cols-2 … gap-6 overflow-hidden lg:gap-8` (`src/app/workspace-frame.tsx:12`).
- Reading pages use `ReadingPage`: header in a `max-w-6xl` box, content in `mx-auto max-w-2xl` (`src/app/ui.tsx:267-271`). Welcome uses `max-w-xl` (`src/app/welcome/welcome-view.tsx:91`).
- The Topic bar and pinned explore Widget sit in a `max-h-[40%]` wrapper above the Widget panel (`src/app/topic-header.tsx:33`).
- Below 768 px the workspace shows a "needs a bigger screen" note (`src/app/ui.tsx:284-290`). That stays (§5).

| Page | Box | 1512 px: empty each side | 1280 px: empty each side | Column(s) |
|---|---|---|---|---|
| `/study` | 1152 px box, 24 px padding, 1104 px content | **204 px (13.5 %)** | **88 px (6.9 %)** | two of 536 px (35.4 % each at 1512); Widget card ≈ 502 px |
| Course Map, Progress, Sessions, Notes, Settings | `max-w-2xl` 672 px | **420 px (27.8 %)** | **304 px (23.8 %)** | one of 672 px |
| Welcome | `max-w-xl` 576 px | **468 px (31.0 %)** | **352 px (27.5 %)** | one of 576 px |

- On `/study` at 1512 the empty space (two gutters plus the 32 px column gap) is 440 px, **29 % of the screen**. On the reading pages it is 840 px, **56 %**. The owner's "at least 40 %" is between the two.
- **The Widget panel is 35 % of the screen.** It must show a Widget with every reply (decision 2), so it should be the biggest thing on the page, not half of a capped box.
- Widget parts cap themselves too: `max-w-md`, `max-w-sm`, `w-72` in `src/widgets/primitives/`. They need to grow with the panel (E2a, E2b, E5).

### 2.2 Buttons and size

- Primary button: navy fill, white text, 4 px radius, no border, no shadow (`src/app/ui.tsx:81`). Secondary: 1 px `--border` (`#d6d3d1` on `#fafaf9`, about 1.4:1), no fill (`ui.tsx:84`). Ghost: no border, muted text, looks like plain words (`ui.tsx:87`). Sizes: md `min-h-9 px-4 py-2 text-sm`, sm `min-h-8` (`ui.tsx:101-116`).
- `IconButton` is 32×32 with no border (`src/app/icon-button.tsx:9-22`). `Chip` has a muted border and `text-xs` (`ui.tsx:50-78`). Header links are muted with no border; the current page is a brand-tinted pill (`ui.tsx:205-207`).
- A **static** `Pill` with the brand tone looks like the current header link and like a "showing" chip (`ui.tsx:29-32`). Course Map "Check" pills are static `li` that look like chips (`src/app/course/course-map-view.tsx:65`).
- Some buttons are styled as underlined text: Topic bar steps (`src/app/workspace-parts.tsx:53`) and Progress titles (`course-map-view.tsx:223`).
- There are no shadows anywhere except the Undo toast (`src/app/notes/undo.tsx:21`).
- A global rule gives every `button`, `[role=button]`, `summary`, `select` and range input `cursor: pointer` (`src/app/globals.css:270-284`), and the `pressable` utility adds the press effect (`globals.css:332`). So a Ghost "Save to notes" shows a pointer but looks like text.
- Chat text is `text-base` 16 px (`src/app/thread.tsx:152,167`). The composer is `text-base` (`src/app/message-box.tsx:156`). Page `h1` is `text-xl`, main `pt-6`, header `mb-6`.

### 2.3 Colour and themes

- Tokens live at `src/app/globals.css:44-83`: `bg ink muted border hairline bubble field brand brand-hover brand-pressed ring brand-ink brand-tint brand-line you you-line you-tint you-tag you-tag-ink src src-line src-tint src-tag src-tag-ink data danger`. There are four themes: Light `:root`, Midnight `:root.dark` (`globals.css:175`), Paper (`:209`), Forest (`:240`).
- Light brand is `#002366`. Everything else is stone greys. Teal (`--you`) and amber (`--src`) are reserved for provenance (the Learner's assumptions vs sourced facts).
- `scripts/check-theme-contrast.mjs` is the last step of `npm run check`. It freezes Light exactly (`LIGHT_FROZEN`, `:12-15`) and skips the other checks for it. Dark themes must have ink ≥ 7:1, muted/brand/accents ≥ 4.5:1, ring ≥ 3:1, APCA ≥ 75, background lightness 0.20–0.34, chroma ≤ 0.135.
- The Theme is saved per browser (cookie), not per Learner (`src/app/theme-cookie.ts`, `GLOSSARY.md` "Theme").
- Open theme issues #271 (Increase Contrast) and #312–#320 (differences from target) belong to the four-theme world. Decision 1 supersedes them.

### 2.4 Pages

- Course Map (`src/app/course/page.tsx:20-31` → `CourseMapView`, `course-map-view.tsx:109-198`) already reads `loadProgress`, `courseOverview` and `whatComesNext`. Progress (`src/app/progress/page.tsx:14-21` → `ProgressView`, `course-map-view.tsx:205-242`) lists the same Topics with status and "x of y" Checks. **Progress is a strict subset of the Course Map** (`courseOverview`, `src/course/navigator.ts:522`).
- Past Sessions (`src/app/sessions/page.tsx`, `src/app/past-sessions.tsx:40-80`) lists Sessions newest first. Notes (`src/app/notes/page.tsx`, `notes-view.tsx:85-121`) has one card per Topic. Saved items in Notes are **pointers into Sessions**: `note_items` rows with `sessionId`, `turnSeq`, `widgetIndex` (`src/db/schema.ts:653-683`, `src/learner/saved.ts`). That is why the owner can't tell Notes from Past Sessions.
- "Save to notes" is a Ghost button with a bookmark icon under each reply (`src/app/thread.tsx:172`) and each Widget (`src/app/widget-panel.tsx:308`; `src/app/save-to-notes.tsx:124-162`).
- Header links: Study Workspace, Course Map, Progress, Past Sessions, Notes, Settings (`HEADER_LINKS`, `ui.tsx:196-203`), then a theme menu and a bordered Sign out button (`ui.tsx:238-260`, `theme-menu.tsx:95`).
- Settings has four sections: About you, Appearance, Developer details, Start over (`src/app/settings/settings-view.tsx:15-44`). Start over archives the Learner and creates a fresh one with the same name (`src/auth/learners.ts:37-48`, `src/app/api/start-over/route.ts:19-38`).
- **No per-Topic restart exists.** A naive one hits these constraints: the `sessions_one_live_per_topic` unique index (`schema.ts:68`), the settled-once index on `insight_attempts` (`schema.ts:201`), primary keys on `topic_progress`, `skill_state` and `review_cards`, `note_items_saved_once`, `learner_state.shownSessionId`, and `jumpTo`, which refuses passed Topics (`src/course/navigator.ts:300`).

### 2.5 Sign-in

- Cookie `fa_access` (`src/auth/passcode.ts:2`): httpOnly, sameSite lax, secure in production, 90 days (`passcode.ts:5-13`). Value is `<learnerId>.<HMAC-SHA256>` with `SESSION_SECRET`.
- `PASSCODES` holds `name:passcode` pairs (`passcode.ts:43-62`). `POST /api/login` rate-limits (5 per IP per 15 min), checks the passcode, then `signInAs` (`src/app/api/login/route.ts:16-42`, `src/auth/learners.ts:12-21`).
- **`learnerFromCookie` rejects any Learner whose name is not in `PASSCODES`** (`src/auth/learners.ts:55-61`). A Google Learner would be rejected here; C1b changes it.
- `src/proxy.ts:30-34,41-69` lets signed-out visitors reach only `/`, `/login`, `/landing-assets/*` and `POST /api/logout`; `/dev/*` is open outside production.
- The app is already multi-Learner: every per-Learner table has `learner_id`; the owner is Learner 1 (`OWNER_LEARNER_ID`, `schema.ts:11`). There is no OAuth code anywhere. The latest migration is `0031_reply_kind.sql`.

### 2.6 Tutor, Widgets and maths

- **Voice:** "No hype and no role-play. Be calm, precise and plain-spoken." (`src/tutor/instructions.ts:112`). Praise is one to three words (`instructions.ts:131`). Emoji are stripped from replies and flagged V3 (`src/tutor/reply-checks.ts:202-220,285`; ADR 0008).
- **One Widget at most per reply** (`ONE_WIDGET`, `src/tutor/tools.ts:380`; ADR 0007). When no recipe fits, the Tutor teaches in words. Code opens a Widget on its own only at converted Concept steps, Explore and the percent reveal (`src/tutor/practice.ts:249,396-424`). **Nothing measures how many replies carry a Widget.**
- Widget parts have no emoji or pictures, only 16 flat SVG icons (`src/widgets/primitives/wave1/icons.tsx`). `widget_engine` defaults to "on" in code (`src/tutor/session-log.ts:20`) but production holds a stored row; go-live is #248.
- **Maths:** Quick tries take a typed number (`inputMode="decimal"`, `src/app/quick-try-view.tsx:94`) or True/False; `/api/quick-try` takes `{ key, input }` today (`src/app/api/quick-try/route.ts:11`). Quiz Checks are multiple choice or typed (`src/app/quiz-panel.tsx:240-241`). The `rate_move` practice mode types basis points. `markAnswer` already marks scaled integers (`src/teaching/mark.ts:133`). 101 quiz Checks and 99 conversation Checks exist; all 487 bank questions are multiple choice, about 104 have a sum-stem; only `num-percent-bps` and `num-compounding` have typed Quick tries and templates (`inventory.md` §1).
- **The teaching ladder** (ADR 0006): restate, worked example, fill-in boxes, Widget, drill of five, park.

### 2.7 Tests

- vitest runs on PGlite (`src/test/pglite.ts`) with a scripted Anthropic client (`src/test/scripted-client.ts`). Route tests mock `@/db/client`.
- **Playwright is not a dependency.** `scripts/layout-check.mjs` needs `PLAYWRIGHT_CORE` (`:22`), a Neon test branch (`EVAL_DB_OK`, `:17`) and a `PASSCODES` list with a tools pair (`:19`), and runs nowhere in CI. Nothing measures horizontal space. CI has two jobs, `check` and `build`, both required (`.github/workflows/ci.yml:3`); its tests need no secrets (`ci.yml:19`).
- Existing tests that will break and must be updated by the owning ticket: `src/app/ui.test.tsx`, `workspace.test.tsx:378-393,736-748`, `old-session.test.tsx`, `phone-note.test.tsx`, `src/app/settings/settings-view.test.tsx`, `src/app/theme*.test.ts*`, `src/app/ui-primitives.test.tsx`, `src/app/course/course-map-view.test.tsx`, `src/app/notes/notes-view.test.tsx`, `src/app/past-sessions.test.tsx`, `src/app/save-to-notes*.test.tsx`.

### 2.8 Why it looks this way

The old UI spec chose a flat, quiet look on purpose. Three principles produced today's screen:
- **No shadows.** Keep the page calm and print-friendly.
- **Three colours, three meanings.** Navy is action; teal is "you"; amber is "sourced". Nothing else carries colour.
- **`max-w-6xl` and a narrow reading column.** Long lines hurt reading; keep chrome small.

All three were sound for a chat that reads like an article. They fail for a Learner who needs to *tell what is a button*, *feel pulled along*, and *see a picture with every reply*. The new rules keep what worked: provenance stays visible (mint and sunflower keep their meanings), prose lines stay at most 70 characters (§4 rule 3), and the page stays calm; only affordance, colour and width change.

---

## 3. What was decided

### 3.1 The nine owner decisions (5 November 2026, final)

1. **Two themes: Light and Dark.** Paper, Forest and Midnight go. One brand colour, royal blue, in three tones, and four accents that each mean one thing:

   | Role | Hex | Meaning |
   |---|---|---|
   | Brand deep | `#1E3A8A` | pressed state, headings on soft |
   | Brand main | `#2F5BEA` | primary buttons, links, focus |
   | Brand soft | `#DCE6FF` | tints, selected rows |
   | Mint | `#12B886` | **you**, gains, "right" |
   | Coral | `#FF6B57` | losses, warnings, "not quite" |
   | Sunflower | `#FFC233` | history and stories |
   | Violet | `#8B5CF6` | lingo (the words to learn) |

   Full Light and Dark token blocks and their contrast numbers are in **Appendix A**; ticket A4 migrates saved Paper, Forest and Midnight choices.
2. **One Widget with every Tutor reply**, in a wide right panel of about 60 %. Code adds one if the Tutor does not.
3. **No typed numbers anywhere.** Quick tries, Checks and Reviews become tap-to-choose story and lingo questions. The Tutor never asks for a sum.
4. **Google sign-in** with an invite list first and one switch to open it. The passcode is removed for Learners and kept for the test tools.
5. **Pages:** Course Map shows progress and `/progress` redirects to it. Notebook combines Past Sessions and Topic Notes, one row per Topic. Settings becomes a gear icon.
6. **Restart a Topic:** progress resets and a new Session starts. The old Session stays readable in the Notebook. Nothing is deleted. Reachable from the Topic bar and from Settings.
7. **Emoji:** Microsoft Fluent Emoji 3D (MIT), a vendored subset of about 150, so they look the same on every device.
8. **Content:** every Topic's quizzes and Quick tries become tap-to-choose now. The first 12 Foundation Topics get full story scenes and Widgets.
9. **Proactive Tutor:** every reply ends with 2 to 3 tap-to-answer Choices. Typing stays open.

Button anatomy (lip shadow, press, focus ring, sizes) and layout numbers (grid columns, gutters, header height) are in **Appendix B** and **Appendix C**. This section gives only the values that tests assert: chat column 36–42 %, Widget panel ≥ 55 %, side gutter ≤ 32 px at 1512, header ≤ 56 px, chat text 15 px.

### 3.2 Technical defaults (for the owner's architecture review)

Each default says what it costs and how to undo it.

| Default | Why | Cost | Undo |
|---|---|---|---|
| `better-auth` 1.7.17 + `@better-auth/drizzle-adapter` (pinned exactly), Google provider, on the existing Neon DB | Auth.js now points new projects at Better Auth; the Drizzle adapter fits our `Db` type (`src/db/types.ts:5`) | free; 2 packages | revert C1a/C1b; `learners.auth_user_id` stays null |
| Better Auth tables `user`, `session`, `account`, `verification` kept as generated, text ids, **not** merged into `learners` | no change to the files that call `getDb()` or to any `learner_id` key | 4 tables | drop tables |
| `learners.auth_user_id` nullable, one active Learner per Google user; setting `signup_open` ("off") | link a Google user to a Learner; one switch to open sign-up | 1 column, 1 row | drop |
| An invite may name an existing Learner (`learner_name`), so the owner's email links to Learner 1 | owner keeps all progress | none | clear the column |
| Google consent screen stays in **Testing** with only `openid email profile` | with basic scopes any Google user may sign in with no warning; the 100-user cap and 7-day expiry do not apply (Google OAuth docs, checked 5 Nov 2026) | free | n/a |
| Session lasts 90 days (`session.expiresIn`), cookie cache off | match today's passcode cookie; sign-out takes effect at once | none | default is 7 days |
| Previews keep the tools passcode; Google runs on production and localhost only | no `oAuthProxy`, no extra redirect URIs. `vercel.json` deploys only `main` today (`vercel.json:6-10`) | none | add `oAuthProxy` later |
| `restartTopic` snapshots a Topic's rows into `topic_restarts` (jsonb), clears the live copies, marks the old Session `older=true` with `restarted_at` | satisfies every constraint in §2.4; nothing is lost | 1 table, 1 column | drop table; old Sessions still open |
| Topic Notes and review cards survive a restart | the Learner keeps what they wrote and what is due | none | n/a |
| Companion Widget when the Tutor opens none, first that fits: (1) the step's written-ahead scene, (2) a Lingo card for the first Topic term in the reply, (3) the Topic's Running-example scene, (4) a one-beat Case timeline (the safety net every Topic has). Never at an open quiz's Blocked numbers | a Widget on 100 % of replies is a code guarantee, not a prompt hope | one picker module | switch off, Tutor-only again |
| Emoji stay **out of reply text** (V3 kept). They live in Widgets and Choices | chat stays plain; pictures live in the panel | none | n/a |
| Choices (2–3 per reply) come from code, by Teaching Step; the Tutor may suggest one through an optional tool; code always guarantees at least 2 | code over prompt | one module | hide the strip |
| New reply check **V8** (no sum asked of the Learner), lint **L10** (no typed answers, no sum-asking stems; starts with an allowlist that can only shrink, like `LESSON_NOT_YET_CONVERTED` at `src/course/lesson-lint.ts:20`), lint **L11** (every emoji name exists in the registry). One shared detector, `sumAsk` | enforce decisions 3 and 7 in code | CI seconds | remove the lints |
| `@playwright/test` dev dependency; the whole app on `next dev` with PGlite in place of Neon and the scripted Tutor in place of Anthropic, behind dev-only flags (`E2E=1`, `E2E_DB=pglite`, `E2E_TUTOR=scripted`); the fixture is the tools Learner signed in by its passcode | the one high seam (S1) | new CI job `ui`, under 8 min; **not** a required check until the owner adds it (H1) | delete the job |
| About 150 Fluent Emoji 3D images vendored as WebP at 160 px in `public/emoji/<unicode>.webp`, with `LICENSE-fluent-emoji.txt` and `SOURCES.md` | MIT; each ≤ 12 KB, ≤ 1.6 MB in all | free | delete the folder |
| Critic prompts as files in `docs/critics/` (T-01) | every ticket runs the same critic the same way | none | delete the folder |
| #271 and #312–#320 closed as superseded (H1); #248 (`widget_engine` go-live) is the owner's step in H1 | decision 1; the companion runs only with the engine on | none | reopen |

### 3.3 Data shapes

- **`invites`:** `id serial`, `email` (stored lower-cased and trimmed, unique), `learner_name` (nullable; links an existing active Learner by name, such as `owner`), `invited_at`, `note`. Added by `npm run invites -- add <email> [--learner owner] [--note "…"]`. Names, not ids, because ids differ per database. Removing an invite stops *new* sign-ups; archiving the Learner stops an existing one.
- **`learners.auth_user_id`:** text, nullable, references `user.id` (on delete set null); a partial unique index allows one active Learner per Google user.
- **Setting `signup_open`:** "off" or "on". "off" means only invited emails get a Learner.
- **`topic_restarts`:** `id`, `learner_id`, `topic_id`, `session_id` (the old Session, unique), `attempt_no`, `restarted_at`, `snapshot` (jsonb of the Topic's `topic_progress`, `check_results`, `misconceptions`, `insight_attempts`, `quiz_attempts`, `skill_state`, `practice_answers` rows and the Session's `widget_state` rows). Index on `(learner_id, topic_id)`.
- **`sessions.restarted_at`:** timestamp, nullable. A restarted Session has `older=true` and `restarted_at` set. It reads as an **Earlier attempt** in the Notebook.
- **Question kinds:** `choice` and `true_false`. Each wrong choice carries a **mix-up fix**: one line naming the slip (what a Known mistake is today, now attached per choice). A template draws choice values from Known-mistake values, so wrong choices are the common slips, not random numbers.
- **Widget source:** `ShownWidgetSource` gains `companion`, with `companion: scene | lingo | running_example | case`. Each reply's record stores `reply_checks.widget_source` = `tutor | step | scene | lingo | running_example | case | none` ("step" = code opened a card preset, reveal or explore Widget).
- **Choice:** per reply 2–3 `{ id, label, says, emoji }`, with `id` one of `next | show | word | life | quiz | deeper | tutor`. Built by code from the Teaching Step (sets in D3a); the Tutor may suggest one (`id: tutor`). Stored as a session item of kind `reply_choices`. Pressing one sends its `says` as an ordinary chip turn, so replay works unchanged. At least 2 always exist.

### 3.4 Glossary changes (done by the ticket that builds each; `GLOSSARY.md` is edited in that PR)

**New terms**

| Term | One-line definition | Ticket |
|---|---|---|
| **Test bed** | The whole app run in a browser on a throw-away database with a scripted Tutor. | T-00 |
| **Accent** | One of four colours that carry a meaning: mint for the Learner and gains, coral for losses and warnings, sunflower for history and stories, violet for lingo. | A4 |
| **Notebook** | The page where a Learner finds, for each Topic, its Session, what they found and their Topic Note. | B2a |
| **Start a Topic over** / **Earlier attempt** | Clearing one Topic's progress to begin it again; the old Session stays readable in the Notebook as an Earlier attempt. | B3a |
| **Invite list** / **Sign-up switch** | The emails allowed to sign in with Google while `signup_open` is "off"; the setting that opens sign-up to everyone. | C1a |
| **Choice** | One of the 2 or 3 tap-to-answer buttons code puts under every Tutor reply. | D3a |
| **Story scene** / **Lingo card** | A Widget that tells a small story with a few 3D emoji characters; a Widget that shows one finance word, its plain meaning, how pros say it and an example, in violet. | E3 |
| **Companion Widget** | The Widget code adds to a reply when the Tutor opened none (order in §3.2, ending with the Case timeline). | E4a |

**Entries to change or remove**
- **Theme, Day theme, Night theme** (A4): rewrite Theme to "Light or Dark"; remove Day theme and Night theme; keep "follow the computer".
- **Quick try, Known mistake, Question template** (D1a) **and Rate-move Widget** (D1c): a Quick try is a choice or true/false question; a Known mistake carries a mix-up fix; a template draws choice values; rate-move practice picks the right reading. **Lesson lint** gains L10 (D1b) and L11 (E1).
- **Topic Note, Course Map** (B2a, B1): the Topic Note lives inside the Notebook row; the Course Map shows the Learner's progress.
- **Widget** (E4a): exactly one per Tutor reply. **Archetype** and **Widget recipe** (E3): add Story and Lingo.
- **Learner** (C1b, C3): signs in with Google; the passcode is for the test tools only.
- **Older session** (B3b): also a Session the Learner restarted, shown as an Earlier attempt.
- **Remove:** Past Sessions, Notes and Progress as page names (B2a, B1; leave a redirect note). Do not cite "Course Navigator" as a glossary term: it has no entry.

### 3.5 ADRs

| ADR | Decision | Amends | Written by |
|---|---|---|---|
| 0009 | Learners never type numbers | ADR 0006; the Quick try entry; ADR 0008 (adds V8) | D1b |
| 0010 | A Widget and Choices with every reply, and emoji in Widgets | ADRs 0007 and 0008 (V3 stays for text, V4 changes) | D3a writes it; E4a sets the V4 consequence |
| 0011 | Google sign-in with an invite list | the Learner passcode | C1a (C3 adds "fully in force") |
| 0012 | Two themes with accents | Light is no longer frozen at its old values | A4 |

ADR 0004 (one Session per Topic) gets a note on Topic restart (B3a). One writer per ADR number. Drafts are in Appendix I.

---

## 4. The rules behind these choices

1. **Make clickable things look clickable.** Flat design removes the strongest signifier, the 3-D effect; weak signifiers make people fixate longer and finish later; young adults suffer click uncertainty too. NN/g: [Beyond Blue Links](https://www.nngroup.com/articles/clickable-elements/) (2015), [Flat UI Elements Attract Less Attention](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/) (2017), [Young adults and flat design](https://nngroup.com/articles/young-adults-flat-design). The raised "lip" button (a solid darker bottom shadow that collapses on press) is a generic pattern; we copy no brand's look.
2. **Don't style static things as buttons.** The same NN/g piece warns against non-clickable items that look clickable. Pills and tags are flat, with no shadow and no pointer cursor. A test enforces both directions (metrics in §6).
3. **Content-to-chrome and line length.** Chrome costs screen space. NN/g gives no target number, so ours are measured: gutters ≤ 32 px, header ≤ 56 px. "Full screen" does not mean full-width paragraphs: panels and Widgets span the width, running prose caps at `70ch` (45–80 characters per line; Baymard says 50–75, WCAG 1.4.8 says ≤ 80). [NN/g: content-to-chrome](https://www.nngroup.com/articles/), [Baymard: line length](https://baymard.com/blog/line-length-readability), [WCAG 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html).
4. **Contrast.** Keep the existing dark rules in `check-theme-contrast.mjs` (ink ≥ 7:1, accents ≥ 4.5:1, ring ≥ 3:1, APCA ≥ 75, no neon, tint alpha ≤ 0.10). Light is checked by the same rules once it is no longer frozen. Accent *fills* (mint, coral, sunflower, violet) follow WCAG 2.2 SC 1.4.11 (non-text contrast): a fill needs 3:1 against its surface only when colour alone carries its meaning. A fill that is decorative (not needed to understand the content) or always paired with a text label or an icon is exempt and is not checked; the text and icons that carry the meaning still meet 4.5:1 and 3:1 through the `-ink` variants. Today every accent fill used as a UI fill is paired or decorative, so Light sunflower (1.5:1 on the page) stays. Chart series are the one exception: a series line or bar carries its meaning by colour, so every chart series colour, `--violet` included, is on the colour-only list. A fill that must ever carry meaning alone goes on the script's colour-only list and is then checked at 3:1 in both themes (Appendix A.3, issue #457). Chart series are on that list: a series' mark is needed to read the chart and a legend does not exempt it, so in Light the mint, sunflower and coral series use `--mint-ink`, `--sun-ink` and `--coral-ink`, and every series token is checked at 3:1 on `--bg` and `--field` in both themes. [APCA Bronze](https://a11yreadtech.github.io/ARC/tests/bronze-simple-mode).
5. **Reduced motion.** Every animation sits under `@media (prefers-reduced-motion: no-preference)` or is read with `matchMedia`. Under "reduce" the information stays and the motion stops (WCAG 2.3.3, techniques C39 and SCR40). Animations last 100–500 ms (NN/g). Test: `page.emulateMedia({ reducedMotion: "reduce" })`, then `getAnimations().length === 0`. [W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [NN/g: animation duration](https://www.nngroup.com/articles/animation-duration/).
6. **Emoji licence.** Fluent Emoji is MIT, "Copyright (c) Microsoft Corporation". Ship the licence text in `public/emoji/LICENSE-fluent-emoji.txt`, pin the upstream commit in `SOURCES.md`, and credit it under Settings, About. Exclude the Clippy and Windows-logo emoji. [fluentui-emoji](https://github.com/microsoft/fluentui-emoji).
7. **Better Auth over Auth.js.** The Auth.js team's own docs recommend Better Auth for new projects. Google needs only `socialProviders.google`; the Drizzle adapter reuses our database; a `databaseHooks.user.create.before` hook is the invite gate. [authjs.dev](https://authjs.dev/getting-started/migrate-to-better-auth), [Better Auth with Next.js](https://better-auth.com/docs/integrations/next), [Google provider](https://better-auth.com/docs/authentication/google).
8. **Invite first, open later.** Every Tutor turn is an Opus call, so a public sign-up page is an open tap on the owner's bill. The invite list is the cost control; `signup_open` is the one switch that removes it. (Per-turn cost: read `usage` rows, do not assume a figure.)
9. **Story first, no maths.** The audience is wealthy young beginners who dislike maths and want the *words* and the *why*. Stories carry causes and consequences; tap-to-choose questions test understanding of a word, not arithmetic. The owner: "In the age of AI it's about comprehending these concepts rather than doing the math." History stays the teacher: every story is grounded in a Case with an as-of date, and the Tutor still gives no buy or sell calls.
10. **Code over prompt.** Whatever must happen every time (a Widget, 2 Choices, no sums, redirects, restart) is enforced in code and measured. Prompts only set voice (ADR 0001, 0006; the owner's standing rule). A rule that lives only in a prompt is a hope, not a feature.

---

## 5. Not in this spec

- **The other 83 Topics' story scenes.** They get tap-to-choose questions (D2a–D2j) but not new scenes or Widgets.
- **A mobile layout under 768 px.** The "needs a bigger screen" note stays.
- **Paid services** of any kind, a custom theme builder, more than two themes.
- **Other sign-in methods** (email and password, Apple, magic links) and `oAuthProxy` for preview deployments.
- **Publishing the Google app** or a brand-verified consent screen. The owner decides in Appendix F.
- **Deleting a Learner's data** or exporting it.
- **Changing what a Topic teaches**, the outline order, the Cases or the Case Data.
- **Sound.** Animations are silent.
- **Input-border contrast** across all inputs, and chart redesign beyond the Widget parts E2a and E2b name.


---

## 6. Test strategy

Tests are the contract. A ticket is done when its metrics pass, not when its code looks right. There are **seven seams**. The owner agreed them; implementers must not add an eighth or ask again.

### 6.1 The seams

**S1 · Browser end-to-end on the whole app** (Playwright)
- **Catches:** real widths and gutters, overflow, cursors, fonts, signifiers, animation and reduced motion, a Widget on every reply, Choices, redirects, restart, sign-in flow, anything a Learner can see.
- **Misses:** model quality; Google's own screens (never called); pixel-perfect looks (critics judge looks).
- **Tooling:** `@playwright/test` (dev only), Chromium. `next dev` with `E2E_DB=pglite` (PGlite plus pgvector, one instance parked on `globalThis` so the proxy and routes share it), `E2E_TUTOR=scripted` (named scripts in `src/dev/e2e-tutor.ts`; the guard throws if `ANTHROPIC_API_KEY` is also set). `E2E=1` is the master flag and is refused in production and on Vercel (`src/dev/e2e-mode.ts`). The fixture is the **tools Learner**, signed in by its passcode (`PASSCODES=tools:e2e-passcode`) and seeded by `POST /api/dev-e2e {state}`. No new auth code; C1b adds a Google-linked fixture through Better Auth's `testUtils()`, mounted only when `e2eEnabled()`.
- **Where:** `e2e/**/*.spec.ts`, `playwright.config.ts`, fixtures in `e2e/fixtures/`. Outside vitest (`vitest.config.ts:8` includes only `src/**`).
- **Runs:** locally `npm run ui:test`; in CI as a new job `ui` (not required until the owner adds it to the ruleset in H1; until then §0 item 8 holds auto-merge until `ui` is green). Screenshots save to `test-results/` and are uploaded as artifacts.
- **Cost:** free; under 8 minutes.

**S2 · Route handlers on PGlite** (vitest, the existing pattern)
- **Catches:** auth rules (invite gate, linking), redirects (308), restart writes, migrations, marking, rate limits.
- **Misses:** anything about layout or the browser.
- **Tooling:** `testDb()` (`src/test/pglite.ts`), `vi.mock("@/db/client")`, `src/test/before-expand.ts` for migrations (`databaseBeforeExpand`, `rowsFromBefore`), real route handlers, mocked `@/auth/better-auth` where Google is involved.
- **Where:** next to the route, `*.test.ts`. **Runs:** `npm run check` (CI job `check`). **Cost:** free; seconds.

**S3 · Pure domain modules** (vitest, node)
- **Catches:** theme-pref migration, Companion Widget picker, V8, Choices builder, choice marking and mix-up fixes, emoji registry, L10 and L11 logic, invite matching.
- **Misses:** wiring. **Tooling:** plain vitest, no DB where possible. **Where:** `*.test.ts` beside the module. **Runs/cost:** as S2.

**S4 · Component render with happy-dom**
- **Catches:** markup contracts: which element, which `aria-label`, which class family (raised vs flat), Choices strip, gear icon, 6 Settings sections, pressed state class.
- **Misses:** real sizes (happy-dom has no layout) — never assert pixels here. **Tooling:** the 42 files that already opt into happy-dom. **Where:** `*.test.tsx` beside the component. **Runs/cost:** as S2.

**S5 · Gated live-model evals** (paid, not required in CI)
- **Catches:** what the real Tutor does: Widget on every reply, Choices, no sums, voice, lingo learned, persona scores.
- **Misses:** determinism (use thresholds over 20 prompts, not single cases).
- **Tooling:** the existing `tutor:eval`, `widgets:eval`, `behaviour`, `tutor:replay`, extended with the 20-prompt set (Appendix D) and new cases T12–T16. Guarded by `EVAL_DB_OK=branch` on a Neon branch.
- **Runs:** by hand or by `tutor-eval.yml` on PRs touching Tutor files; needs `ANTHROPIC_API_KEY`. **Cost:** about $2–4 per `tutor:eval`, $1–1.5 per `behaviour`; the spend caps for this spec are the ledger in §9.4.

**S6 · LLM content critics on course files and screenshots**
- **Catches:** things no regex can: "does this read as an exam", "is this story true as of its date", "can you tell what is a button".
- **Misses:** repeatability. A single critic vote is never a gate (§8).
- **Tooling:** the critic prompts in §8, run as Workflow agents on files and screenshots. **Where:** prompts in `docs/critics/*.md`, results in the Workflow's scratch folder (not committed). T-01 writes the prompt files. **Cost:** sonnet tier is cents; an opus judge is about $0.5–1 per run.

**S7 · Static checks**
- **Catches:** colour contrast of every token, raw `<button>` outside the primitives, hex outside the tokens file, `testUtils` in the production build, L10, L11, `course:check`, `cursor:pointer` on non-interactive classes.
- **Tooling:** `scripts/check-theme-contrast.mjs`, ESLint rules in `eslint.config.mjs`, `scripts/check-course.mjs`. **Runs:** last steps of `npm run check`. **Cost:** free; seconds.

### 6.2 The metrics

All layout metrics are measured at 1512×982 (the owner's 14-inch screen) unless another size is stated, in **both** themes. "S1" metrics come from `e2e/support/measure.ts` (`measureLayout`, `auditAffordances`; code in Appendix C).

| Metric | How measured | Seam | Threshold |
|---|---|---|---|
| Side gutter at 1512×982 | `boundingBox()` of the outermost content box on `/study`, `/course`, `/notebook`, `/settings`: left edge and viewport right minus right edge | S1 | ≤ 32 px each side |
| Side gutter at 1280×800 and 1920×1080 | same | S1 | ≤ 32 px each side |
| Widget panel width at 1512 | `boundingBox()` of `[data-testid="widget-pane"]` (today at `src/app/workspace-frame.tsx:16`) ÷ viewport width | S1 | ≥ 55 % |
| Chat column width at 1512 | `boundingBox()` of `[data-testid="chat-column"]` (new in A1, the first child of `[data-testid="workspace-frame"]`) ÷ viewport width | S1 | 36–42 % |
| No horizontal scroll at 1024×768 | `document.documentElement.scrollWidth <= clientWidth` on every page | S1 | true |
| Header height | `boundingBox()` of `header` | S1 | ≤ 56 px |
| Chat body font | `getComputedStyle` of a Tutor message paragraph | S1 | `15px` |
| Prose line length | `charsPerLine` (Appendix C.2) | S1 | 45–80 (60–75 from 1280 up) |
| Interactive elements without a signifier | `auditAffordances().interactiveWithoutSignifier` (Appendix C.3: a raised face for buttons and chips, an underline for links, a border for fields) | S1 | 0 |
| Non-interactive elements with `cursor:pointer` | `auditAffordances().pointerOnStatic` | S1 | 0 |
| Clickable things too small | `auditAffordances().tooSmall` (28 px chips, 32 px buttons) | S1 | 0 |
| Static pills look static | `auditAffordances().staticLooksPressable` (no shadow, no pointer, radius ≤ 8 px) | S1 + S4 | 0 |
| Raised button lip and press | primary button lip `0 3px 0`; pressed: `translateY(2px)` and lip `0 1px 0` (Appendix B) | S7 + S1 | exact |
| Every theme passes the contrast script | `node scripts/check-theme-contrast.mjs` | S7 | exit 0 for Light and Dark |
| Accent fills ≥ 3:1 against surface when colour alone carries the meaning (§4 rule 4) | same script: its `COLOUR_ONLY` pairs (Appendix A.3); `src/dev/accent-fill-uses.test.ts` lists every fill use with its verdict, and decorative or text- or icon-paired uses are exempt | S7 | every listed pair: today each chart series token (`CHART_SERIES`) on `--bg` and `--field` |
| Reduced motion | `emulateMedia({ reducedMotion: "reduce" })`, `getAnimations().length` on a Story scene | S1 | 0 |
| Motion when allowed | `reducedMotion: "no-preference"`, `getAnimations().length` after a Story scene mounts | S1 | ≥ 1 |
| Accents visible | distinct computed fills among `--mint`, `--coral`, `--sun`, `--violet` on `/study` with a Widget (F1) | S1 | ≥ 3 |
| Widget on 100 % of replies (scripted) | scripted replies across story, concept, your turn and reveal (E4a test 4; T-00's `[E4a]` target uses its 4 scripts) | S1 | 6 of 6 (4 of 4 for the target) |
| Widget on 100 % of stored replies | the Companion picker over the 50 replies in `src/behaviour/delight/replay-fixtures.json` (E4a) | S3 | 50 of 50 |
| Lingo card for the first term | same 50, where the reply names a Topic term and no unshown scene exists | S3 | ≥ 90 % |
| Widget on 100 % of replies (live) | the 20-prompt eval (Appendix D) | S5 | 20 of 20 |
| Chart-only Widgets | Widget-fit judge `kind` = `chart_only` over the 20 prompts | S5 | 0 |
| Typed-number inputs in the Learner UI | `input[type=number], input[inputmode=decimal], input[inputmode=numeric]` anywhere outside the composer and Settings | S1 | 0 |
| Sums asked | V8 on every reply in the eval and on all converted course files; Math police on course files | S3 + S5 + S6 | 0 |
| Choices on 100 % of replies | count Choices under each reply; `reply_choices` items with 2–3 entries | S1 + S5 | 2–3 on every reply |
| Choices builder always returns 2 or 3 | property test over every Teaching Step and phase | S3 | true |
| Restart isolates | rows of every other Topic and Learner before and after `restartTopic`, compared as sorted JSON | S2 | identical |
| Restart keeps the past | old Session still opens in the Notebook as an Earlier attempt; `topic_restarts` row exists | S2 + S1 | true |
| Non-invited Google email | callback with an email not in `invites` and `signup_open` "off" | S2 | 0 new `learners` rows, redirect `/login?error=not_invited` |
| Invited Google email | same with an invite | S2 | exactly 1 Learner, linked |
| Owner link | invite naming Learner 1 | S2 | `learners.auth_user_id` set on id 1; no new Learner |
| Old page redirects | `GET /progress`, `/sessions`, `/notes` | S2 | 308 to `/course`, `/notebook`, `/notebook` |
| Emoji registry | every registry name has a file; every file has a registry entry | S3 + S7 | 100 % |
| Persona scores | Beginner persona (Appendix D.2.1) over the 20 prompts | S5 + S6 | median fun ≥ 4/5; lingo learned ≥ 80 %; "felt like an exam" = no on 20 of 20 |
| `npm run check` and `npm run build` | CI | S2–S7 | green |

### 6.3 The TDD protocol

1. **Pick one behaviour** from the ticket's **Tests first** list, in order.
2. **Write one test** at the seam its tag names. Run it. It must **fail for the right reason** (the assertion, not a typo or a missing import). Paste the failing line in the PR description.
3. **Write the least code** that passes. Run the test. It passes. Run the ticket's tests so far.
4. **Refactor** only when green. Then the next test.
5. **Never** write several tests and then all the code. **Never** change a test to make it pass unless the spec value changed. **Expected values come from this spec** (a threshold, a hex, a count), never computed the way the code computes them. If a test needs a value the spec lacks, stop and comment.
6. The PR description lists each test by name with the commit that turned it green.

**Test naming.** `describe("<module or page>")`, then `it("<plain-words behaviour>")`, for example `it("answers 308 to /course when someone asks for /progress")`. E2E files: `e2e/<area>.spec.ts`, test titles start with the metric name from §6.2 so a failing line says which promise broke.

**Fixtures**
- **Fixture Learner:** the tools Learner (it survives C3), signed in once in Playwright's `globalSetup`. States come from `POST /api/dev-e2e {state}`: `fresh`, `story`, `concept-widget`, `quiz-open`, `topic-complete`, `many-topics` (T-00), plus `googleLearner` (C1b). A ticket that needs another state adds it there.
- **Scripted Tutor:** named scripts in `src/dev/e2e-tutor.ts`, chosen with `POST /api/dev-e2e {script}`. T-00 ships `story-reply`, `concept-reply-widget`, `plain-reply` (no Widget: the case E4a fixes) and `quiz-open`. A ticket that needs another adds it there. Every script must pass the reply checks (V1–V8 once D3a lands), or the gate retries and the test fails for the wrong reason.
- **Google:** never called. S2 mocks the provider; S1 uses `testUtils()` (C1b).

**What NOT to test**
- Tailwind class strings for looks (assert computed style in S1 instead).
- Pixel positions in happy-dom.
- Exact wording of Tutor replies (the checks V1–V8 and critics own that).
- Better Auth internals, Fluent Emoji pixels, Google's pages.
- Anything a critic judges (fun, story quality); critics get thresholds, not unit tests.
- Private helpers; test through the seam.

### 6.4 Definition of Done (every ticket inherits it)

- All the ticket's **Tests first** items exist, each seen red and then green.
- `npm run check` and `npm run build` pass; `npm run ui:test` passes (after T-00), and the `ui` job is green on the PR.
- The ticket's `[<ID>]` lines in `e2e/targets.spec.ts`, if any, lost `test.fail` and pass.
- Every metric the ticket names in **Done when** meets its threshold, with the number pasted in the PR.
- Screenshots attached for any visible change: 1512×982, Light and Dark.
- `docs/architecture.md`, `GLOSSARY.md` and the named ADR are updated in the same PR.
- Existing tests the ticket breaks are updated, not deleted. A deleted test needs a reason in the PR.
- The ticket's critics ran and met their pass bar (§8), or the PR says which gap became a `needs-triage` issue.
- One PR to `main`, `Closes #N` once per line, auto-merge set, issue confirmed closed after the merge.

---

## 7. Tickets

Tickets are in work order. Their dependency graph and waves are in §9.1; Appendix E creates them.

**Shared rules for every ticket below**
- **Wave 0 first.** Every ticket except T-00, T-01, C2, C3 and H1 also depends on **T-00** (the test bed) and **T-01** (the critics). Headers write this as "wave 0"; Appendix E adds both edges.
- **Seams** are tagged `[S1]`–`[S7]` (§6.1). `[S1]` tests live in `e2e/`, sign in as the tools Learner and seed states with `seed(state)` from `e2e/support/app.ts` (T-00). Playwright projects: `mbp14` (1512×982), `w1280` (1280×800), `w1920` (1920×1080), `w1024` (1024×768), `mbp14-dark`.
- **Measurement** comes from one module, `e2e/support/measure.ts` (T-00): `measureLayout(page)` and `auditAffordances(page)`, the code of Appendix C.2 and C.3. No ticket writes a second measuring helper.
- **Targets flip.** T-00 writes the open targets in `e2e/targets.spec.ts` as `test.fail` lines tagged `[<ID>]`. The ticket with that ID removes `test.fail` from its lines in its PR, and they pass.
- **Numbers in "Tests first" come from this spec**, never recomputed with the code under test.
- **Colour literals** appear only in `globals.css` and `theme.ts`'s swatch table. Components use `var(--token)`.
- **Migrations** take the next free number when the lane rebases (§9.2). No test or doc names a migration number.
- **Content batches** (D2a–D2j, E6a–E6c): if the lane is past 70 % of its context before the critics run, commit the finished Topics, delete only those ids from the allowlist, open the PR, and file the rest as a `needs-triage` issue named `<batch>-rest`.

---

### T-00 · Every UI ticket can be proven in a real browser, on a throw-away database, with a scripted Tutor
**Label:** `ready-for-agent` · **Depends on:** nothing (land it first) · **Tier:** sonnet · **Size:** L (one fresh context; step 1 is a spike, do it before anything else)

**Why:** The owner's complaints are about what the screen looks like (empty side space, buttons that don't look like buttons). Today nothing measures that: no test renders the app in a browser, Playwright is not a dependency, and `layout-check` needs a Neon branch and a passcode and is not in CI (`scripts/layout-check.mjs:17,19`; `ci.yml:3` names only `check` and `build`). Every ticket in A, B, E and F needs a browser seam (S1), so this one comes first.

**Change:**
- **Step 1, a spike (half an hour, throw away if it fails).** Prove that `next dev` can run on PGlite. Start the app with the flags below, sign in, open `/study`, and read the Learner back. Three things can go wrong, and the spike decides each:
  - **Two databases.** The proxy (`src/proxy.ts:33`) and the routes may be separate module graphs, so an in-memory database would exist twice. Fix: park the one client on `globalThis`.
  - **Async start.** `getDb()` is synchronous (`src/db/client.ts:13`) and PGlite's migration is async. Fix: `src/instrumentation.ts` (new) awaits the install before the first request.
  - **WASM bundling.** If Turbopack bundles PGlite, add `serverExternalPackages: ["@electric-sql/pglite"]`.
  - **If the spike fails twice,** use the fallback: a Postgres service container (`pgvector/pgvector:pg17`) in the CI job and `docker run` locally, with `E2E_DB=postgres`, `drizzle-orm/node-postgres` and `pg` as a dev dependency (the one exception §0 item 6 allows). Everything else in this ticket stays the same. CI stays secret-free: the container password is a fixed throw-away value on localhost.
- **Dependencies.** `@playwright/test` as a dev dependency, pinned `1.64.1` (checked 5 Nov 2026). Nothing else new.
- **One mode switch, `src/dev/e2e-mode.ts` (new).** Pure functions of an env object:
  - `e2eEnabled(env)` is true only when `E2E === "1"` and `NODE_ENV !== "production"` and `VERCEL` is unset.
  - `assertE2eSafe(env)` throws when `E2E` is set and `NODE_ENV === "production"` or `VERCEL` is set, or when `E2E_TUTOR=scripted` and `ANTHROPIC_API_KEY` is set. The message names the flag that broke the rule.
  - Flags: `E2E=1` (master), `E2E_DB=pglite|postgres`, `E2E_TUTOR=scripted`.
- **Database.** `getDb()` (`src/db/client.ts:13`) calls `assertE2eSafe(process.env)` first. If `e2eEnabled()` it returns the client parked on `globalThis.__faE2eDb` by `src/dev/e2e-db.ts` (new, loaded only from `instrumentation.ts` with a dynamic `import()` behind the flag). That module builds PGlite with pgvector and migrates `./drizzle`, as `migratedPglite()` does (`src/test/pglite.ts:12-16`), then sets `globalThis.__faE2eDb` and `globalThis.__faE2eIsPglite = true`. Memory only, no data folder, so every server start is clean. Otherwise `getDb()` is exactly as it is now.
- **Never in production.** Three guards: the `assertE2eSafe` call above; `outputFileTracingExcludes: { "/*": ["node_modules/@electric-sql/**"] }` in `next.config.ts` only if the spike shows the dynamic import pulls PGlite into the traced files; and `scripts/check-no-e2e-in-build.mjs` (new), run as one extra step of the `build` job after `next build`, which fails if any `.next/server/**/*.nft.json` mentions `@electric-sql` or any server file contains the string `__faE2eDb` outside `src/db/client.ts`'s own chunk.
- **A separate build folder.** `next.config.ts` reads `distDir: process.env.E2E === "1" ? ".next-e2e" : ".next"`. A normal `npm run dev` the owner already has open can then never be mistaken for the test server, and the two never fight over `.next/dev/lock`. `Playwright` sets `reuseExistingServer: false`. Add `.next-e2e/` to `.gitignore`.
- **Fixture sign-in, no new auth code.** The test server runs with `PASSCODES=tools:e2e-passcode` and `SESSION_SECRET=e2e-secret-e2e-secret-e2e-secret!!`. The fixture Learner is the **tools Learner**, because it survives C3 (the tools pair stays) and `freshToolsLearner(db)` already resets it (`src/dev/tools-learner.ts`). Playwright signs in once in `globalSetup` through `POST /api/login` (`src/app/api/login/route.ts:16`) and saves `storageState`. C1b adds a second fixture for a Google-linked Learner.
- **Fixture states, `src/app/api/dev-e2e/route.ts` (new).** One route, a `POST` with `{ state }`, `{ script }` or `{ reset: true }`, and a `GET` that answers `{ db: "pglite" }`. It answers 404 unless `e2eEnabled()` AND `globalThis.__faE2eIsPglite === true` (so it can never write to Neon even if a flag leaks), and 403 unless the signed-in Learner is the tools Learner. States are built with the same functions the routes use where one exists (`saveJump` `src/learner/memory.ts:87`, `openCurrentTopic` `:105`) and plain schema inserts otherwise:
  - `fresh`: reset to a new tools Learner; no Topic open.
  - `story`: Topic `num-percent-bps` open at its Story step, Session started.
  - `concept-widget`: same Topic at Concept, one Widget shown.
  - `quiz-open`: same Topic at Check with one quiz open.
  - `topic-complete`: same Topic passed, next Topic recommended.
  - `many-topics`: 3 Topics passed, 2 in progress, for the Course Map, Notebook and Settings.
- **Scripted Tutor, `src/dev/e2e-tutor.ts` (new).** `anthropicTutorClient()` (`src/tutor/anthropic.ts:8`) returns `e2eTutorClient()` when `E2E_TUTOR=scripted`. That client's `toolRunner` builds `scriptedClient(script).client.beta.messages.toolRunner(...)` (`src/test/scripted-client.ts:25`) for the script most recently chosen through `POST /api/dev-e2e {script}` (default `plain-reply`). `anthropicComposeClient()` (`src/tutor/compose.ts:36`, used at `src/tutor/tools.ts:771`) gets the same switch and returns a client that always refuses, so no free-form Widget is composed. Named scripts, each a reply that passes V1–V7 for its step:
  - `story-reply`: about 90 words of story at the Story step, one ask last line, no Widget.
  - `concept-reply-widget`: a Concept reply under 80 words plus one `open_widget` with a ready-made preset from `src/widgets/recipes/`.
  - `plain-reply`: a Concept reply with no Widget (this is the case E4a must fix).
  - `quiz-open`: a reply that sits beside an open quiz and quotes none of its numbers.
- **Playwright config, `playwright.config.ts` (new).**
  - `testDir: "./e2e"`; `webServer.command: "npm run dev -- --port 3100"`; `url: "http://localhost:3100/login"` (answers 200 signed out); `timeout: 180_000`; `reuseExistingServer: false`; `gracefulShutdown: { signal: "SIGTERM", timeout: 2000 }`.
  - `webServer.env`: `E2E=1`, `E2E_DB=pglite`, `E2E_TUTOR=scripted`, the two fixture values above, `BETTER_AUTH_URL=http://localhost:3100`. No other variable; no key of any kind.
  - Projects (set `viewport` after spreading `devices["Desktop Chrome"]`): `mbp14` 1512×982, `w1280` 1280×800, `w1920` 1920×1080, `w1024` 1024×768, all light; plus `mbp14-dark` (`colorScheme: "dark"`). With `UI_MATRIX=1` the config adds the dark twin of every viewport (8 projects), for F1.
  - Theme: the site follows the Mac by default (spec 2026-11-04), so `colorScheme` picks Light or the dark theme before and after A4. Tests that need a named theme set it through the app's own control.
  - `use.reducedMotion: "reduce"` by default so layout reads are stable; E2a overrides it per test.
  - `snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}"`; screenshots are attached to the report and to PRs, **not** pixel-compared as pass/fail (macOS and Linux render differently; the pass/fail signal is the metrics).
- **Helpers, `e2e/support/measure.ts` (new), one module.** It exports exactly two functions, the code of Appendix C.2 and C.3 run through `page.evaluate`: `measureLayout(page)` → `{ viewport, gutterLeft, gutterRight, chatWidthPct, panelWidthPct, headerHeight, chatFontPx, charsPerLine, horizontalScroll }` and `auditAffordances(page)` → `{ interactiveWithoutSignifier, pointerOnStatic, staticLooksPressable, tooSmall, counts }`. If Appendix C and this list differ, Appendix C wins. Also `e2e/support/app.ts`: `signIn`, `seed(state)`, `say(script, text)`, `theme(page, name)`.
- **Scripts.** `package.json`: `"ui:test": "playwright test"`, `"ui:update": "playwright test --update-snapshots"`. Not part of `npm run check` (`package.json:16`): the browser job is separate.
- **CI job `ui` in `.github/workflows/ci.yml`.** Node 24, `actions/checkout@v7`, `actions/setup-node@v7` with `cache: npm`, `npm ci`, `npx playwright install --with-deps chromium` (no browser cache: Playwright's own guidance), `npm run ui:test`, then `actions/upload-artifact@v5` (the major `tutor-eval.yml:82` already uses) with `if: ${{ !cancelled() }}` for `playwright-report/` and `test-results/` (14 days). `timeout-minutes: 25`. The file's "No secrets anywhere" comment (`ci.yml:19`) stays true. **Do not add `ui` to the ruleset.** The owner adds it after three green runs in a row on `main` (H1).
- **Housekeeping.** `.gitignore`: `.next-e2e/`, `playwright-report/`, `test-results/`. `vitest.config.ts:8` already includes only `src/**`, so `e2e/**` stays outside vitest (checked). `tsconfig.json` includes `**/*.ts`, so `playwright.config.ts` and `e2e/**` are typechecked and linted: keep them clean. Mark `scripts/layout-check.mjs` and `scripts/browser-check.mjs` "superseded by `ui:test`" in their header comments; F1 decides whether to delete them.
- **What must NOT change:** production behaviour of `getDb()`, `anthropicTutorClient()`, `proxy.ts` and every route when `E2E` is unset; no new env variable is read in production code except `E2E*` inside `e2e-mode.ts`.

**Tests first (red → green, in this order):**
1. [S3] `src/dev/e2e-mode.test.ts` · "e2e mode refuses production and Vercel" · `e2eEnabled({E2E:"1",NODE_ENV:"development"})` is true; false with `NODE_ENV:"production"`, with `VERCEL:"1"`, and with `E2E` unset. `assertE2eSafe({E2E:"1",NODE_ENV:"production"})` throws a message containing "production"; with `VERCEL:"1"` throws; with `E2E_TUTOR:"scripted"` and `ANTHROPIC_API_KEY:"x"` throws; with `E2E` unset never throws.
2. [S2] `src/db/client.test.ts` (new) · "getDb in production never builds a test database" · with `vi.stubEnv` `E2E=1`, `NODE_ENV=production`: `getDb()` throws and no Neon `Pool` is constructed (spy on `@neondatabase/serverless`). With `E2E` unset and `DATABASE_URL` set it builds the Neon pool once and returns the same object twice.
3. [S2] `src/dev/e2e-db.test.ts` · "the test database is migrated, has pgvector and is a singleton" · after `installE2eDb()`, tables `learners`, `sessions`, `settings` exist; `select extname from pg_extension` includes `vector`; a second `installE2eDb()` returns the same client (`===`); `signInAs(db, "tools")` returns a Learner with `id >= 1`.
4. [S3] `src/dev/e2e-tutor.test.ts` · "every named script passes the reply checks" · for each of the four scripts, `checkReply(draft, ctx)` (`src/tutor/reply-checks.ts:251`) returns `[]` with the context its step needs; `story-reply` is 120 words or fewer; `concept-reply-widget` has exactly one widget tool call; `plain-reply` has none.
5. [S2] `src/app/api/dev-e2e/route.test.ts` · "the fixture route is closed unless the test database is open" · 404 with `E2E` unset; 404 with `E2E=1` but `__faE2eIsPglite` unset; 403 for a Learner named "owner"; for the tools Learner `POST {state:"story"}` leaves the current Topic `num-percent-bps` at the Story step with one live Session, and `{state:"fresh"}` archives the old tools Learner and opens a new one.
6. [S7] `scripts/check-no-e2e-in-build.mjs` tested by `src/dev/check-no-e2e.test.ts` · "the build check catches a leak" · on a temp `.next/server` folder with an `.nft.json` listing `node_modules/@electric-sql/pglite/x.js` it exits 1 naming the file; on a clean folder it exits 0.
7. [S1] `e2e/smoke.spec.ts` · "the fixture Learner signs in, studies and gets a scripted reply" · after `seed("story")`, `/study` shows the Topic bar `[data-testid="topic-bar"]`; sending a message with script `story-reply` shows that script's first sentence in the thread; `GET /api/dev-e2e` says `pglite`.
8. [S1] `e2e/baseline.spec.ts` · "today's numbers, measured" (green on `main` today) · at `mbp14` on `/study`: left and right gutters are 204 px each (±2); each column is 536 px (±2). On `/course`: the reading column is 672 px (±2) and each gutter is 420 px (±2). At `w1280`: `/study` gutters are 88 px (±2); `/course` gutters are 304 px (±2). These are the facts of §2; the test fails loudly if the code ever drifts from them before A1 lands.
9. [S1] `e2e/targets.spec.ts` · "the targets, red until their ticket" · each target is `test.fail(true, "<ticket id>")` with its ticket id in square brackets at the start of the test name. The 10 targets (numbers from §6.2): `[A1]` `/study` gutters ≤ 32 px each at `mbp14`; `[A1]` `/course` gutters ≤ 32 px; `[A1]` `panelWidthPct` ≥ 55 on `concept-widget`; `[A2]` `headerHeight` ≤ 56 px; `[A3b]` `auditAffordances()` returns empty `interactiveWithoutSignifier` and `pointerOnStatic`; `[A5]` a gear button with accessible name "Settings" exists in the header and no text link "Settings"; `[B1]` `GET /progress` answers 308 to `/course`; `[B2a]` `/notebook` renders; `[D1a]` on `quiz-open` there is no `input[inputmode="decimal"]` and no number field; `[E4a]` after sending each of the four scripts, 4 of 4 replies show a Widget. Each ticket removes its own `test.fail` lines in its PR; a passing `test.fail` is reported as a failure, so a ticket that fixes the thing without flipping the test goes red.
10. [S1] `e2e/dark.spec.ts` · "the same gutters in the dark project" · at `mbp14-dark` the numbers of test 8 hold for `/study`, and `document.documentElement` carries the dark theme (whatever class or attribute `theme.ts` sets today).

**Done when:**
- `npm run ui:test` passes locally and in the `ui` job on a PR; all of its target tests are `test.fail` and carry a ticket id: `rg -n "test\.fail" e2e | rg -vc "\[[A-F][0-9]"` prints 0, and `rg -c 'test\.fail' e2e/targets.spec.ts` prints 10.
- `npm run check` and `npm run build` pass (the build includes the new leak check); the `ui` job takes under 8 minutes.
- Run `ui:test` three times in a row locally: no flaky test (0 retries needed).
- A production build started with `E2E=1 NODE_ENV=production` refuses to serve a page (`getDb()` throws), shown once by hand in the PR.
- The PR attaches the HTML report and one screenshot of `/study` at 1512×982 in each of the 5 default projects.
- `docs/architecture.md` gains a section "The browser test bed (`playwright.config.ts`, `e2e/`, `src/dev/e2e-*.ts`, `src/app/api/dev-e2e/`, spec 2026-11-05, ticket T-00)": what it does, one scenario (A1 lands and flips its three `test.fail` lines), the trade-off (a PGlite server is single-connection and not Neon; it proves the screen, not the production database). `GLOSSARY.md` gets **Test bed**: the whole app run in a browser on a throw-away database with a scripted Tutor. No ADR.
- If the fallback was used, the PR description says so in its first line and `docs/architecture.md` says why.

**Critic check:** none. The metrics in test 8 and 9 are the check. A reviewer (the final `/code-review`, F2) reads the three production guards.

**Find it:**
```bash
rg -n 'export function getDb' src/db/client.ts
rg -n 'anthropicTutorClient' src/app/api/turn/route.ts src/tutor/anthropic.ts
rg -n 'anthropicComposeClient' src/tutor/tools.ts src/tutor/compose.ts
rg -n 'migratedPglite' src/test/pglite.ts
rg -n 'export async function freshToolsLearner' src/dev/tools-learner.ts
rg -n 'DEV_PAGE' src/proxy.ts
rg -n 'No secrets anywhere' .github/workflows/ci.yml
```

**Hot files:** `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/**`, `src/db/client.ts`, `src/tutor/anthropic.ts`, `src/tutor/compose.ts`, `src/instrumentation.ts`, `next.config.ts`, `.github/workflows/ci.yml`, `.gitignore`, `docs/architecture.md`.

---

### T-01 · Every critic in §8 exists as a prompt file, so any ticket can run it the same way
**Label:** `ready-for-agent` · **Depends on:** nothing (land it with T-00) · **Tier:** sonnet · **Size:** S

**Why:** Almost every ticket's **Critic check** names a critic from §8, and the goal loops in §9.4 run them in rounds. If each lane writes its own prompt, the same critic judges differently from PR to PR. One file per critic, written once, makes a critic's verdict comparable across tickets.

**Change:**
- Write `docs/critics/{affordance,space,colour-liveliness,beginner-persona,math-police,historian,security,final-review,widget-fit}.md` from §8.1–§8.9. Each file has the headings **Inputs**, **Rubric**, **Output** (with one JSON example that parses), **Pass bar** and **Tier**, in that order, and nothing the spec does not say.
- Write `docs/critics/README.md`: how a Workflow agent runs one critic (inputs as file paths, JSON only), the adversarial-verify rule (§8, common rules) and the 3-vote rule for high-stakes findings.
- **Must not change:** any code. The critics judge; they never edit.

**Tests first (red → green, in this order):**
1. `[S7]` `src/dev/critics.test.ts` (new) · "every critic file has the five headings in order" · for each of the 9 files: `## Inputs`, `## Rubric`, `## Output`, `## Pass bar`, `## Tier` appear in that order.
2. `[S7]` same file · "every JSON example parses and matches §8" · the first ```json block in each file parses; `beginner-persona.md`'s example has the keys `fun`, `lingoLearned`, `feltLikeExam`, `sumAsked`; `math-police.md`'s has `checked` and `violations`.
3. `[S7]` same file · "the folder has exactly the critics of §8" · `docs/critics/` holds the 9 files plus `README.md` and nothing else.

**Done when:**
- Tests 1–3 pass; `npm run check` and `npm run build` pass.
- `docs/architecture.md` gains a "Critics" paragraph (what: prompt files an agent runs on screenshots and course files; scenario: A3b's PR runs `affordance.md` on nine screenshots and gets a JSON list of buttons that look like text; trade-off: a model's judgement, so every finding is verified before it becomes a fix).

**Critic check:** none (this ticket writes them).

**Find it:**
```bash
ls docs
rg -n '^### 8\.' docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md
```

**Hot files:** `docs/critics/**` (new).

---

### A4 · Two themes, Light and Dark, in royal blue with four meaningful accents
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "too many colours … just give me one colour with three tones … make it more lively with different accents." Today there are four themes (`theme.ts:4`) and the page is stone grey with navy `#002366`; teal `--you` and amber `--src` are reserved for provenance (`globals.css:60-68`). Decision: royal blue deep `#1E3A8A`, main `#2F5BEA`, soft `#DCE6FF`; accents mint `#12B886` (you, gains), coral `#FF6B57` (losses, warnings), sunflower `#FFC233` (history, stories), violet `#8B5CF6` (lingo). Paper, Forest and Midnight go; Dark replaces Midnight. Light is no longer frozen (ADR 0012).

**Change:**
- **Tokens:** replace the `:root` and `:root.dark` blocks in `globals.css` with Appendix A, exactly. Delete the Paper (`globals.css:209`) and Forest (`:240`) blocks (the whole `@media screen` pair, lines 207-269). Keep `--navy-*` (landing only) and the `--dur-*` tokens. Printing stays in Light (`@media print` uses `:root`).
- **Text-safe inks:** a fill like `#12B886` is 2.4:1 on the page, so text and thin lines use the `-ink` variants (mint-ink `#0B7A5A`, coral-ink `#BD2F1E`, sun-ink `#8A5A00`, violet-ink `#6D3AD9`) and `--brand` (`#2449C4`) is the blue for text and links. The owner's hexes stay as fills (`--brand-main`, `--mint`, `--coral`, `--sun`, `--violet`).
- **Old names kept, remapped:** `--you*` → mint, `--src*` → sunflower, `--danger` → coral-ink, `--brand-tint`/`--brand-soft` → `#DCE6FF`. Every component keeps compiling.
- **`theme.ts`:** `THEMES = ["light","dark"]`; `ThemePref = {mode:"system"} | {mode:"single", theme}`; `DEFAULT_PREF = {mode:"system"}`; `serializePref` writes `system` or `single:light|dark`. `THEME_SWATCH`: light `{bg:"#f6f8ff", ink:"#121a33", brand:"#2f5bea"}`, dark `{bg:"#141a33", ink:"#dce4fa", brand:"#4466d8"}`. **`parsePref` migrates stored values** (S3 table below); the cookie name `theme` stays and is rewritten on the next change. `THEME_INIT_SCRIPT` is rewritten by hand to match.
- **`theme-store.ts`:** drop the day/night pair (`setThemePref`, `pair`); keep `followSystem`, `pinTheme`, `useThemeState`.
- **`theme-menu.tsx`:** three radio items in this order: Light, Dark, Match my Mac. It stays an icon button (the sun, moon or laptop of the current choice); A5 places it.
- **`settings-controls.tsx` `AppearanceSettings`:** three tiles, Light, Dark, Match my Mac (A5 puts them in the Appearance card).
- **Contrast script** (`scripts/check-theme-contrast.mjs`): `TOKENS` gets every token of Appendix A; `LIGHT_FROZEN` is replaced by the Light values of Appendix A (the new frozen set), and Light now also runs the text rules (remove the `continue` after the frozen check); `THEMES` is `light` (`:root`, frozen) and `dark` (`:root.dark`); rules are Appendix A.3. The dark rules stay (ink/bg 9–15, APCA ≥ 75, bg L 0.20–0.34, surfaces rise, chroma ≤ 0.135 now also for every accent and `-ink`, tint alpha ≤ 0.10). The owner's saturated hexes are fills in Light; Dark uses desaturated accents.
- **OpenUI:** map the kit to the new tokens in `globals.css:114-172` and `src/widgets/genui-theme.tsx` (Appendix A.4 lists the lines); chart series order `brand-main, mint-ink, sun-ink, violet, coral-ink, edge` (`CHART_SERIES`; each reaches 3:1 on the chart surface, issue #457). A test keeps the two copies equal.
- **Docs:** `GLOSSARY.md` **Theme** → "one of two colour sets, Light and Dark …"; delete **Day theme** and **Night theme**; add **Accent**: "one of four colours that carry a meaning: mint for the Learner and gains, coral for losses and warnings, sunflower for history and stories, violet for lingo". ADR 0012 (draft in Appendix I).
- **Not changed:** layout, copy, the landing's navy tokens, any component's markup.

**Tests first (red → green, in this order):**
1. `[S3]` `src/app/theme.test.ts` (update) · "stored preferences migrate" · `parsePref` returns: `"dark"` → single dark; `"light"` → single light; `"single:paper"` → single light; `"single:forest"` → single dark; `"single:midnight"` → single dark; `"single:light"` and `"single:dark"` unchanged; `"system"`, `"system:paper:forest"`, `"system:light:midnight"` → system; `null`, `""`, `"banana"` → system. `serializePref` → `"system"` / `"single:dark"`.
2. `[S3]` same file · "the first-paint script agrees" · run `THEME_INIT_SCRIPT` in `vm` for every row of test 1 with the Mac in light and dark; the resulting `<html>` (`data-theme`, `dark` class, `color-scheme`, `data-openui-theme`) equals `resolveTheme` + `applyTheme`.
3. `[S7]` new `src/dev/check-theme-contrast.test.ts` (vitest only reads `src/**`, `vitest.config.ts:8`) · "the guard guards" · runs the script on (a) the real `globals.css`: exit 0; (b) a copy with Light `--ink: #333333`: exit 1, output contains "light: --ink is unchanged"; (c) a copy with Dark `--mint-ink: #00e0a0` (too saturated): exit 1 on "chroma"; (d) a copy with Light `--edge: #cccccc`: exit 1 on "--edge on --bg".
4. `[S7]` `src/app/theme.test.ts` · "swatches equal the stylesheet" · `THEME_SWATCH` bg, ink and brand equal `--bg`, `--ink`, `--brand-main` in the two blocks of `globals.css`.
5. `[S4]` `src/app/theme-menu.test.tsx` (update) · "three choices" · menu items in order `Light, Dark, Match my Mac`; picking Dark adds the `dark` class to `<html>` and writes cookie `theme=single%3Adark`; the button label is "Theme: Dark".
6. `[S4]` `src/app/settings/appearance-settings.test.tsx` (update) · "three tiles, no day/night pickers".
7. `[S4]` `src/widgets/genui-theme.test.tsx` (update) · "kit follows the tokens" · `GENUI_THEMES` has keys `light`, `dark`; the first five chart series in Light are `#2f5bea, #12b886, #ffc233, #8b5cf6, #ff6b57`; the root declarations equal the `--openui-*` block in `globals.css`.
8. `[S1]` `e2e/theme.spec.ts` · "old cookies still open" · with cookie `theme=single:paper` `/study` loads with `<html data-theme="light">` and no `dark` class; `single:forest` → dark; `system` + Mac dark → dark. `body` background is `rgb(246, 248, 255)` in Light and `rgb(20, 26, 51)` in Dark. Picking Dark in the menu survives a reload.

**Done when:**
- Tests 1–8 pass; `node scripts/check-theme-contrast.mjs` exits 0; `npm run check`, `npm run build`, `npm run ui:test` pass.
- The contrast table in Appendix A.3 matches the script's output (every listed pair at or above its minimum).
- `rg -n 'paper|forest|midnight' src scripts --glob '!*.test.*'` returns only the migration lines in `theme.ts` and the init script.
- Screenshots (Light and Dark) of `/study`, `/course`, `/settings` attached.
- `docs/architecture.md` "Themes" section rewritten (two themes, accents, why Light is no longer frozen); GLOSSARY and ADR 0012 as above.

**Critic check:** the Colour and liveliness critic on Light and Dark screenshots of `/study`, `/course`, `/settings`. At this stage the bar is: accents appear only with their meaning, no neon in Dark, nothing grey-on-grey; the "lively" bar (≥ 3 accents visible on `/study`) is measured in F1, after the E tickets. The Space critic is not needed.

**Find it:**
```bash
rg -n 'THEMES|THEME_SWATCH|DEFAULT_PREF' src/app/theme.ts
rg -n 'LIGHT_FROZEN|THEMES = \[' scripts/check-theme-contrast.mjs
rg -n 'data-theme="(paper|forest)"|:root.dark' src/app/globals.css
rg -n 'CHART_PALETTES|GENUI_THEMES' src/widgets/genui-theme.tsx
rg -n 'setThemePref|pairLabel' src --glob '!*.test.*'
```
**Hot files:** `src/app/globals.css`, `src/app/theme.ts`, `src/app/theme-store.ts`, `src/app/theme-menu.tsx`, `src/app/settings/settings-controls.tsx`, `scripts/check-theme-contrast.mjs`, `src/widgets/genui-theme.tsx`, `GLOSSARY.md`, `docs/adr/0012-*.md`.

---

### A3a · One set of button, chip, link and tag primitives, each with a look that says what it is
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "I can't tell by the buttons if they are buttons or static words … that 3D sort of thing, simplistic but with a curve or bend to it." Today there are no shadows (only the Undo toast, `notes/undo.tsx:21`); Ghost buttons are plain muted text (`ui.tsx:87`); the Secondary border is `#d6d3d1` on `#fafaf9`, about 1.4:1 (`ui.tsx:84`); a static `Pill brand` (`ui.tsx:29-32`) looks the same as the current nav link (`ui.tsx:207`) and a "showing" Chip (`ui.tsx:50-78`); Topic-bar steps are buttons styled as underlined text (`workspace-parts.tsx:53`). NN/g: flat design removes the strongest signifier, the 3-D effect, and users then hesitate (see §4).

**Change:**
- **One primitives module** `src/app/primitives/` (`button.tsx`, `icon-button.tsx`, `chip.tsx`, `link.tsx`, `tag.tsx`, `menu.tsx`, `index.ts`). `ui.tsx` re-exports the old names (`Button`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `Chip`, `Pill`, `Tag`, `primaryButtonClass`, `secondaryButtonClass`) so imports keep compiling. `ghostButtonClass` and the `ghost` variant are deleted; its callers (Save to notes, Undo, pager "All") become `secondary` `sm`.
- **Anatomy** is Appendix B, exactly: raised primary and secondary (12 px radius, 3 px darker lip, soft drop shadow, 10% top highlight), `danger` (coral fill), round icon buttons, pill chips with a 2 px lip, underlined inline links, flat static tags. Pressed: `translateY(2px)` and the lip shrinks to 1 px; focus ring 2 px `--ring`; disabled drops the shadow; reduced motion removes the transition.
- **CSS** lives in `globals.css` `@layer components` as `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-icon`, `.chip`, `.link`, `.tag`. It uses only tokens (Appendix A): `--brand-main`, `--brand-deep`, `--edge`, `--field`, `--ink`, `--coral-fill`, `--coral-deep`, `--shadow`, `--hi`, `--ring`.
- **Every primitive renders `data-affordance`** = `button | icon | chip | link | nav | tag`. The audit (Appendix C.3) relies on it.
- **Static tags** (`Pill`, `Tag`, the Check pills at `course-map-view.tsx:65`, status words) render a `<span data-affordance="tag">`: 6 px radius, flat, no shadow, `cursor:default`, a 6 px accent dot. Chips are fully round (`border-radius: 999px`). So shape alone tells them apart.
- **Lint rule** in `eslint.config.mjs`: `no-restricted-syntax` on `JSXOpeningElement[name.name="button"]` and `JSXAttribute[name.name="role"][value.value="button"]`, message "Use Button, IconButton or Chip from src/app/primitives". Turned off for `src/app/primitives/**`, tests, and an allowlist that is a constant in `eslint.config.mjs`: the 9 `src/widgets/**` files that have raw buttons today (E2a/E5 migrate them later) and the 14 `src/app` files the A3b sweep empties. A test pins the allowlist so it can only shrink (as in ADR 0002).
- **Not in A3a:** replacing raw buttons in `src/app` (A3b), header layout (A5), copy, routes.

**Tests first (red → green, in this order):**
1. `[S7]` `src/app/primitives/lint.test.ts` (new) · "raw button is an error outside primitives" · ESLint `lintText('<button className="x"/>', { filePath: "src/app/foo.tsx" })` reports `no-restricted-syntax`; the same text with `filePath: "src/app/primitives/x.tsx"` reports nothing; `<div role="button"/>` in `src/app/foo.tsx` reports one error.
2. `[S7]` same file · "the widget allowlist can only shrink" · the allowlist equals the 9 non-test files `rg -l '<button' src/widgets` returns today (`step-through`, `rank`, `quick-check`, `rate-move`, `draw-the-line`, `waffle`, `predict`, `library`, `history-plot`); plus the 14 `src/app` files of the A3b sweep; a future ticket may remove names, never add.
3. `[S7]` `src/app/primitives/css.test.ts` (new) · "button anatomy is in the stylesheet" · parses `globals.css`: `.btn:active` has `translateY(2px)`; the `prefers-reduced-motion: reduce` block sets `transition: none` for `.btn, .chip`. (The computed look is A3b's test 3, the real contract.)
4. `[S4]` `src/app/primitives/primitives.test.tsx` (new) · "primitives carry their signifier" · `Button` → `data-affordance="button"`, `type="button"` by default, `aria-busy` and a spinner when `loading`; `IconButton` → `data-affordance="icon"`, `aria-label` and `title` equal; `Chip` → `data-affordance="chip"`, `aria-pressed` when `active`; `Pill` and `Tag` → `<span data-affordance="tag">` with no `pressable`, no `rounded-full`.

**Done when:**
- Tests 1–4 pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- `ui.tsx` re-exports the old names, so no import changed outside `src/app/primitives/` and `ui.tsx`.
- `docs/architecture.md`: a "Design primitives" section (what: the one module and `data-affordance`; scenario: a Learner sees a raised blue "Check" button and a flat "In progress" tag, so only one looks pressable; trade-off: Widget parts keep their own buttons until E2a/E5). No GLOSSARY change. No ADR.

**Critic check:** none beyond the tests: the look is judged after the sweep (A3b).

**Find it:**
```bash
rg -n 'ghostButtonClass|secondaryButtonClass|primaryButtonClass' src --glob '!*.test.tsx'
rg -n 'export function (Pill|Chip|Button|IconButton|Tag)' src/app
rg -n 'border-\[var\(--border\)\]' src/app/ui.tsx
```
**Hot files:** `src/app/primitives/*` (new), `src/app/ui.tsx`, `src/app/icon-button.tsx`, `src/app/globals.css`, `eslint.config.mjs`.

---

### A3b · Every button in the app looks like a button, every link like a link, every tag like a tag
**Label:** `ready-for-agent` · **Depends on:** wave 0, A3a · **Tier:** sonnet · **Size:** M

**Why:** A3a built the primitives; the screen still shows the old flat buttons until every raw `<button` in `src/app` uses them. The owner: "I can't tell by the buttons if they are buttons or static words." Today 14 files in `src/app` render raw buttons (`rg -c '<button' src/app --glob '!*.test.tsx'`).

**Change:**
- **Sweep:** replace every raw `<button` in `src/app` outside primitives (files in Find it: `ui.tsx` ×5, `quick-try-view.tsx`, `park-offer-view.tsx`, `notes/own-lines.tsx`, `workspace-parts.tsx`, `theme-menu.tsx`, `session-item-view.tsx`, `past-sessions.tsx`, `notes/undo.tsx`, `notes/saved-items.tsx`, `login/passcode-field.tsx`, `course/course-map-view.tsx`, `_landing/landing.tsx`). Topic-bar steps become small Chips; Progress/Course-Map row titles stay links, underlined. Fills that used `bg-[var(--brand)]` for a button (not for text) switch to `--brand-main`.
- **Allowlist:** remove the 14 `src/app` files from the lint allowlist A3a made; only the 9 `src/widgets/**` files stay.
- **Button sheet:** a dev-only section `/dev/widgets#buttons` shows each variant at rest, hover, pressed, focus and disabled.
- **Not changed:** header layout (A5), copy, routes, Widget parts' own buttons (allowlisted), the landing page's look.

**Tests first (red → green, in this order):**
1. `[S4]` `src/app/ui-primitives.test.tsx` (update: Button, IconButton, Chip ≥ 28 px, NavLink) and `src/app/ui.test.tsx` (update: "≥ 6 rounded-full pills" and "no underline" and "Sign out bordered" assertions, lines 86 and 89) to the new classes.
2. `[S1]` `e2e/affordance.spec.ts` · "affordance audit is clean" · `auditAffordances()` (Appendix C.3) returns `interactiveWithoutSignifier: []`, `pointerOnStatic: []`, `staticLooksPressable: []`, `tooSmall: []` on `/` (signed out), `/login`, `/welcome`, `/study` (a Concept step; a Check open with a quiz; a Widget with a chip), `/course`, `/progress`, `/sessions`, `/notes`, `/settings`, at 1512×982. (B1 and B2a replace the old routes in this list with `/course` and `/notebook`.)
3. `[S1]` same file · "pressing feels physical" · `mousedown` on a primary Button: computed `transform` is `matrix(1, 0, 0, 1, 0, 2)` and `box-shadow` starts `0px 1px 0px`; after `mouseup` it returns to `0px 3px 0px`. With `emulateMedia({ reducedMotion: "reduce" })` the computed `transition-duration` is `0s`.
4. `[S7]` `src/app/primitives/lint.test.ts` (A3a) · "the src/app allowlist is empty" · the allowlist holds only the 9 `src/widgets/**` files.

**Done when:**
- Tests 1–4 pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- `rg -c '<button' src/app --glob '!*.test.tsx'` hits only `src/app/primitives/`.
- The `[A3b]` line in `e2e/targets.spec.ts` loses `test.fail` and passes.
- Screenshots (1512×982, Light) of the `/dev/widgets#buttons` sheet attached.
- `docs/architecture.md` "Design primitives": one line saying every `src/app` button now goes through the primitives.

**Critic check:** the Affordance critic (screenshots of all nine pages, rest + hover; rubric: "can a stranger point at every button without clicking?"; pass bar ≥ 4/5 and the audit's three lists empty). Feeds G1.

**Find it:**
```bash
rg -c '<button' src/app --glob '!*.test.tsx'
rg -n 'ghostButtonClass' src --glob '!*.test.tsx'
```
**Hot files:** `src/app/workspace-parts.tsx`, `src/app/theme-menu.tsx`, `src/app/course/course-map-view.tsx`, `src/app/past-sessions.tsx`, `src/app/notes/*.tsx`, `src/app/quick-try-view.tsx`, `src/app/park-offer-view.tsx`, `src/app/session-item-view.tsx`, `src/app/login/passcode-field.tsx`, `src/app/widget-panel.tsx`, `src/app/quiz-panel.tsx`, `src/app/review-panel.tsx`, `eslint.config.mjs`.

---

### A1 · The Study Workspace and every reading page use the whole window
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "It's a 14-inch screen and at least 40% of the surface area is not being covered … there is 20% on the left side and 20% on the right side." Measured from classes at 1512 px: `/study` leaves 204 px (13.5%) empty each side (`src/app/study/page.tsx:36` is `max-w-6xl px-4 lg:px-6`); every reading page leaves 420 px (27.8%) each side (`src/app/ui.tsx:269-271` puts the content in `max-w-2xl`). The two columns are equal halves (`src/app/workspace-frame.tsx:12`), so the Widget panel gets 536 px of 1512.

**Change:**
- **Layout tokens** in `globals.css` `:root` (Appendix C.1): `--gutter: clamp(12px, 1.6vw, 32px)`, `--gap: clamp(16px, 1.6vw, 28px)`, `--page-max: 2200px`.
- **`/study` box:** replace `max-w-6xl px-4 lg:px-6 lg:pt-6` with `w-full max-w-[var(--page-max)] px-[var(--gutter)] pt-3`. Keep `h-dvh`, `flex-col`, `overflow-hidden` and `data-route="study"`.
- **`WorkspaceFrame`:** `grid-cols-2 gap-6 lg:gap-8` becomes `grid-cols-[minmax(360px,2fr)_minmax(0,3fr)] gap-[var(--gap)]`. That is chat 40% / Widget panel 60% of the space inside the gutters. Add `data-testid="chat-column"` to the left column's root (`left-column.tsx`). Keep `data-testid="widget-pane"` and the Topic bar at the top of the right column (T-06 of the themes spec).
- **Readable chat text:** new utility `measure { max-width: 34em }` in `globals.css`. Apply it to the Tutor message root and the Learner bubble wrapper (`thread.tsx:152,167`), to the message box form (`message-box.tsx`) and to the Chips row (`workspace-parts.tsx`, `Chips`). The cap is in `em`, so it follows the font size A2 sets. At 15 px it is 510 px, about 71 characters.
- **`ReadingPage`** (`ui.tsx:266-275`): one box for header and content: `mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-12 pt-3`. Drop `max-w-2xl` from `data-testid="reading-column"` (keep the test id; it becomes `w-full`). Running paragraphs inside cards use `measure`.
- **Card grid utility** `card-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--gap) }` in `globals.css`. B1, B2a and A5 use it. A1 itself does not restyle any page's inner layout.
- **Past Session read view** (`old-session.tsx:60`): same frame columns as the workspace (`2fr / 3fr`, `--gap`), so a Session looks the same live and read-only.
- **Not changed:** the Home landing page (`_landing/landing.tsx`, marketing, keeps `max-w-6xl`), Welcome, Login and the 404 page (single-task forms stay narrow and centred), Widget internals (`src/widgets/primitives/` `max-w-md/sm/72` caps belong to E5), any copy, any colour.

**Tests first (red → green, in this order):**
1. `[S1]` `e2e/layout.spec.ts` · "study fills the window at 1512×982" · `measureLayout()` on `/study` returns `gutterLeft` and `gutterRight` ≤ 32 (expected ≈ 24.2), `chatWidthPct` between 36 and 42 (≈ 38.1), `panelWidthPct` ≥ 55 (≈ 57.1), `horizontalScroll` false.
2. `[S1]` same file · "study at other laptops" · 1280×800: gutters ≤ 24 (≈ 20.5), panel ≥ 55%; 1920×1080: gutters ≤ 32 (≈ 30.7), panel ≥ 55%; 1024×768: gutters ≤ 17 (≈ 16.4), no horizontal scroll, the chat column is ≥ 360 px.
3. `[S1]` same file · "reading pages fill the window" · for `/course`, `/progress`, `/sessions`, `/notes`, `/settings` at 1512: `[data-testid="reading-column"]` is ≥ 1448 px wide and both gutters ≤ 32. (B1 and B2a replace the old routes in this list.)
4. `[S1]` same file · "chat lines are readable" · open a Session with a Tutor reply of ≥ 3 lines: characters per line (`charsPerLine`, Appendix C.2) between 60 and 75 at 1280, 1512 and 1920 (≈ 63, 71, 71), and ≥ 48 at 1024 (≈ 50).
5. `[S4]` `src/app/ui.test.tsx` (update) · "reading pages use the full box" · the `<main>` class has `max-w-[var(--page-max)]` and not `max-w-6xl`; `reading-column` has no `max-w-2xl`; the header is still before the column.
6. `[S4]` `src/app/workspace.test.tsx` (update lines 378-393 and 736-748) · "frame is 2fr / 3fr" · the frame class contains `grid-cols-[minmax(360px,2fr)_minmax(0,3fr)]`; the first child has `data-testid="chat-column"`; the Topic bar is still in the second child.
7. `[S4]` `src/app/old-session.test.tsx` (update) · "read view uses the same frame" · same grid class as test 6.
8. `[S7]` new `src/app/no-width-caps.test.ts` · "no page-level width cap in the app" · reads `src/app/**/*.tsx` (not tests, not `_landing`, `welcome`, `login`, `not-found`) and asserts none contains `max-w-6xl` or `max-w-2xl`.

**Done when:**
- Tests 1–8 pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- At 1512×982 `/study` reports gutters ≤ 32 px (was 204), `panelWidthPct` ≥ 55 (was 35.4), 0 horizontal scroll.
- The three `[A1]` lines in `e2e/targets.spec.ts` lose `test.fail` and pass. `e2e/baseline.spec.ts` and `e2e/dark.spec.ts` are rewritten to the new numbers (gutter 24 ± 2 at 1512; reading column ≥ 1448 px), or deleted with a reason in the PR.
- Before/after screenshots of `/study` and `/course` at 1512×982 and 1280×800 are attached to the PR.
- `docs/architecture.md`: a "Page frame" paragraph (what the gutter, gap and `2fr/3fr` columns do; scenario: a 14-inch Mac now shows a 864 px Widget panel instead of 536 px; trade-off: wide screens beyond 2200 px centre the page). No GLOSSARY or ADR change.

**Critic check:** the Space critic (script + screenshots) on `/study`, `/course`, `/settings` at 1024, 1280, 1512, 1920. Pass bar: every metric above; no clipped or overlapping element; no Widget cut at 1024. Feeds goal loop G1.

**Find it:**
```bash
rg -n 'max-w-6xl' src/app --glob '!*.test.tsx'
rg -n 'max-w-2xl|reading-column' src/app/ui.tsx
rg -n 'grid-cols-2' src/app/workspace-frame.tsx src/app/old-session.tsx
rg -n 'thread-viewport|widget-pane' src/app --glob '!*.test.tsx'
```
**Hot files:** `src/app/ui.tsx` (ReadingPage), `src/app/study/page.tsx`, `src/app/workspace-frame.tsx`, `src/app/globals.css`, `src/app/left-column.tsx`, `src/app/thread.tsx`, `src/app/message-box.tsx`, `src/app/old-session.tsx`.

---

### A2 · The app is compact: smaller type, a slim header, tighter cards
**Label:** `ready-for-agent` · **Depends on:** wave 0, A1 · **Tier:** sonnet · **Size:** S

**Why:** The owner: "Why is everything so big. I want it simplistic." Today the chat is 16 px on 24–26 px lines (`thread.tsx:152,167`, `message-box.tsx:156`), cards are `p-4` (`ui.tsx:144`), the header sits above `mb-6` and `pt-6`, and Widget chips are full-width `min-h-9` (`widget-panel.tsx:462`).

**Change:**
- **Type tokens** (`globals.css` `:root`): `--text-chat: 15px`, `--lh-chat: 24px`, `--text-ui: 14px`, `--text-small: 13px`, `--header-h: 52px`.
- **Chat:** Tutor message `text-[15px] leading-6` (was `text-base leading-[26px]`); Learner bubble and composer `text-[15px] leading-6`. Tutor label stays 12 px.
- **UI text** is 13 px (nav, tags, helper lines) or 14 px (buttons, card body). `h1` goes from `text-xl` (20/28) to `text-lg` (18/26). Eyebrow stays 11 px.
- **Header:** `AppHeader` is `h-[var(--header-h)]` (52 px) with a 1 px bottom hairline, no `mb-6`. The page below starts at `pt-3`.
- **Cards:** `Card` `p-4` becomes `p-3`; gaps between cards use `--gap`. Topic bar keeps `px-3 py-2`.
- **Controls:** Widget chips `min-h-9` → `min-h-8` (32 px); pager items `min-h-11` → `min-h-9` (36 px, `widget-pager.tsx:148`). Nothing interactive goes below 28 px high (the audit in A3b enforces it).
- **Not changed:** font family, the root font size (no `html { font-size }`: it would rescale every Widget), Widget internals, copy.

**Tests first (red → green, in this order):**
1. `[S1]` `e2e/density.spec.ts` · "chat type is 15/24" · `measureLayout().chatFontPx` = 15 and the computed `line-height` of a Tutor paragraph = 24 px, on `/study` at 1512.
2. `[S1]` same · "header is slim" · `headerHeight` ≤ 56 (target 52) on `/study`, `/course`, `/settings` at 1512 and 1024.
3. `[S1]` same · "chat has room" · the `thread-viewport` height is ≥ 65% of the window height at 1512×982 (≥ 638 px).
4. `[S4]` `src/app/ui.test.tsx` (update) · "header is h-[var(--header-h)] and has no bottom margin"; `Card` has `p-3`.
5. `[S4]` `src/app/ui-primitives.test.tsx` (update) · "Card and heading sizes" · `p-3`; the page `h1` class is `text-lg`.
6. `[S7]` `src/app/no-width-caps.test.ts` (extend) · "no text-base in chat files" · `thread.tsx`, `message-box.tsx` contain no `text-base`.

**Done when:**
- Tests pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- At 1512×982: `chatFontPx` 15, `headerHeight` ≤ 56, `/study` thread viewport ≥ 638 px.
- The `[A2]` line in `e2e/targets.spec.ts` loses `test.fail` and passes.
- Before/after screenshots at 1512×982 attached.
- `docs/architecture.md`: extend the "Page frame" paragraph with the type scale (one line each: chat 15/24, UI 13–14, header 52).

**Critic check:** Space critic (type sizes and header from the script) plus the Affordance critic's tap-target pass. Bar: nothing under 28 px high that is clickable.

**Find it:**
```bash
rg -n 'text-base' src/app/thread.tsx src/app/message-box.tsx
rg -n 'min-h-11' src/app/widget-pager.tsx
rg -n 'min-h-9' src/app/widget-panel.tsx
rg -n 'p-4' src/app/ui.tsx
```
**Hot files:** `src/app/ui.tsx`, `src/app/thread.tsx`, `src/app/message-box.tsx`, `src/app/widget-panel.tsx`, `src/app/widget-pager.tsx`, `src/app/globals.css`.

---

### A5 · A slim header with icons for theme, Settings and account, and a Settings page that has settings
**Label:** `ready-for-agent` · **Depends on:** wave 0, A3b, A4, B2a · **Tier:** sonnet · **Size:** M
(B2a is a dependency so the "Notebook" link never points at a missing page.)

**Why:** The owner: "The settings is like a button, I don't want it there as a word; put it as an icon … In settings there isn't any settings except start over." Today the header has six text links and a Sign out button (`ui.tsx:196-203, 238-260`), and Settings has four sections (`settings/settings-view.tsx:15-44`): About you, Appearance, Developer details, Start over.

**Change:**
- **Header, left to right:** the brand link "Finance Agent" to `/` (title "Home"); nav pills **Study** (`/study`), **Course Map** (`/course`), **Notebook** (`/notebook`); then, pushed right, a **theme icon button** (A4's menu), a **gear icon button** (`aria-label="Settings"`, `title="Settings"`, a link to `/settings`, `aria-current="page"` there), and an **account menu**. `HEADER_LINKS` and `HeaderPage` become `workspace | course | notebook | settings`. Remove the divider and the Sign out button.
- **Account menu** (`src/app/account-menu.tsx`, client): a round 36 px button showing the Learner's initial (`--brand-soft` surface, `--brand-deep` text), `aria-label="Account menu"`, `aria-haspopup="menu"`. It opens a menu with the Learner's name, the email if there is one, "Settings", and "Sign out" (the existing form post to `/api/logout`, `SignOutButton`). Props: `{ name: string; email?: string }`. Email is empty until C1b supplies it. Keyboard like the theme menu (Enter, Space, ArrowDown open; arrows move; Escape closes and returns focus). Extract the shared menu behaviour from `theme-menu.tsx` into `primitives/menu.tsx` (A3a created the file; A5 fills it) and use it for both.
- **Sizes:** 52 px header (A2), pills 32 px high, icon buttons 36 px round (Appendix B). One line from 1024 px up.
- **Settings page** sections, in this order, each a `Card` in a `card-grid`: **Account** (name, email if any, "Signed in with a passcode" until C1b, Sign out button), **Appearance** (Light / Dark / Match my Mac tiles, A4), **About you** (the existing Learner Profile form, id `about-you` so `/profile` still redirects), **Your Topics** (an empty slot, `id="your-topics"`; B3b fills it), **Developer details** (the existing switch), **Start over** (danger zone: coral tint card, coral heading, a `danger` Button, the same confirm field and `START_OVER_CONFIRM`). Heading `h1` "Settings". The Start over card spans the full grid width and sits last.
- **Not changed:** the emoji credit line at the foot of Settings (E1), routes, `/api/start-over`, the Learner Profile form, the phone note, the `NavLink` pending dot.

**Tests first (red → green, in this order):**
1. `[S4]` `src/app/ui.test.tsx` (update the exact link order and labels) · "header: brand, three pages, three icons" · links in `<nav aria-label="Pages">` are exactly `Study, Course Map, Notebook` with hrefs `/study, /course, /notebook`; the brand link href is `/` with title "Home"; one element has `aria-label="Settings"` (href `/settings`); one has `aria-label="Account menu"`; no visible text "Sign out", "Past Sessions", "Notes", "Progress" or "Settings" in the header.
2. `[S4]` new `src/app/account-menu.test.tsx` · "account menu" · closed by default; Enter opens it; it shows the name and, when given, the email; "Sign out" is inside `<form action="/api/logout" method="post">`; Escape closes and focus returns to the button; with no email no empty line renders.
3. `[S4]` `src/app/settings/settings-view.test.tsx` (update "four sections in order") · "five cards in order" · section ids `account, appearance, about-you, developer-details, start-over` (B3b inserts `your-topics` before developer details and updates this test to six); Start over uses the `danger` variant and the heading text "Start over".
4. `[S4]` `src/app/settings/appearance-settings.test.tsx` · already updated in A4; here assert it renders inside the `appearance` card.
5. `[S1]` new `e2e/header.spec.ts` · "header fits and works" · at 1512 and 1024: `headerHeight` ≤ 56; Tab order is brand, Study, Course Map, Notebook, theme, Settings, account; clicking the gear opens `/settings` with h1 "Settings"; opening the account menu and choosing Sign out ends on `/` signed out (Home shows a sign-in button).
6. `[S1]` `e2e/affordance.spec.ts` (A3b) · extended to the open account menu and the open theme menu: the audit lists are still empty.

**Done when:**
- Tests pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- `rg -n '"/progress"|"/sessions"|"/notes"' src/app/ui.tsx` returns nothing.
- The `[A5]` line in `e2e/targets.spec.ts` loses `test.fail` and passes.
- Screenshots of the header (closed, theme menu open, account menu open) and `/settings`, in Light and Dark at 1512, attached.
- `docs/architecture.md`: "Header and Settings" (what: three pages and three icons; scenario: a Learner who wants to start one Topic over finds it under Settings → Your Topics, not by hunting through text links; trade-off: Sign out is one click deeper). GLOSSARY: no change (Home, Course Map keep their entries; **Notebook** is added in B2a).

**Critic check:** the Affordance critic (header states) and the Space critic (header height, one-line nav at 1024). Bar: 0 audit failures; header ≤ 56 px.

**Find it:**
```bash
rg -n 'HEADER_LINKS|HeaderPage|SignOutButton' src/app/ui.tsx
rg -n '<section id=' src/app/settings/settings-view.tsx
rg -n 'START_OVER_CONFIRM' src --glob '!*.test.*'
rg -n 'ThemeMenu' src/app --glob '!*.test.*'
```
**Hot files:** `src/app/ui.tsx` (AppHeader, HEADER_LINKS), `src/app/theme-menu.tsx`, `src/app/primitives/menu.tsx`, `src/app/account-menu.tsx`, `src/app/settings/settings-view.tsx`, `src/app/settings/settings-controls.tsx`, `src/app/settings/page.tsx`.

---

### B1 · The Course Map shows progress, and Progress is gone
**Label:** `ready-for-agent` · **Depends on:** wave 0, A1 · **Tier:** sonnet · **Size:** S

**Why:** The owner: "I want progress and course map to be the same thing." Progress is a strict subset of the Course Map: both read `courseOverview` (`course/page.tsx:20-31` vs `progress/page.tsx:14-21`), and Progress shows only a summary line, a status and "x of y" Checks (`course-map-view.tsx:205-242`). The Course Map has no `h1`.

**Change:**
- **Course Map page:** add an `h1` "Course Map" and, under it, the summary line (reuse `data-progress-summary`): `<n> in progress · <n> passed · <n> to go · Next: <title>` ("Next" is What comes next's Topic, left out when nothing comes next). Move the string building into a pure function `progressSummary(topics, next)` in `src/course/progress-summary.ts`.
- **Per Topic card:** show **Checks passed** as "2 of 3" with a small segmented bar (one segment per Check; passed segments `--mint`, others `--hairline`) and the status as a static Tag (Not started / In progress / Passed). Group headers show "n of m passed". Topics lay out in a `card-grid` (A1) per Subject, so a 14-inch screen shows 4 across.
- **Keep:** the Recommended next card, the off-path card, "You are here", Parked, Do first links, the Coming list, and the row actions (a passed row opens `/sessions/:id`, others POST `/api/jump`).
- **Remove:** `ProgressView`, `src/app/progress/page.tsx`, `progress/loading.tsx`. `next.config.ts` gets `async redirects()` with `{ source: "/progress", destination: "/course", permanent: true }` (Next answers 308). Leave `HEADER_LINKS` to A5; until then the old link redirects.
- **Not changed:** `courseOverview`, `loadProgress`, the jump API, ordering, copy of the Recommended card.

**Tests first (red → green, in this order):**
1. `[S3]` new `src/course/progress-summary.test.ts` · "summary line" · 2 in progress, 3 passed, 5 not started, next "Bond prices" → `"2 in progress · 3 passed · 5 to go · Next: Bond prices"`; with `next = null` → `"2 in progress · 3 passed · 5 to go"`; zero Topics passed → `"0 passed"` is kept.
2. `[S4]` `src/app/course/course-map-view.test.tsx` (replace the Progress `h1` tests at line 154 and 158) · "map shows progress" · renders `<h1>Course Map</h1>`; the summary text above; a Topic with 3 Checks, 2 passed shows "2 of 3" and exactly 2 filled segments; its status Tag is a `span` with `data-affordance="tag"`; a group with 4 of 6 Topics passed shows "4 of 6 passed".
3. `[S4]` same file · "no Progress view" · importing `ProgressView` fails (the export is gone).
4. `[S2]` new `src/app/redirects.test.ts` · "/progress is a permanent redirect" · `(await nextConfig.redirects()).find(r => r.source === "/progress")` equals `{ source: "/progress", destination: "/course", permanent: true }`.
5. `[S1]` new `e2e/course-map.spec.ts` · "old Progress link lands on the map" · `request.get("/progress", { maxRedirects: 0 })` → status 308, `location` ends `/course`; following it shows h1 "Course Map".
6. `[S1]` same file · "map is wide" · at 1512 the first Subject group shows ≥ 3 Topic cards in one row (`getBoundingClientRect().top` equal for 3), gutters ≤ 32 (A1 metric).
7. `[S1]` same file · "rows still open Topics" · clicking a not-started Topic's button loads `/study` with that Topic's title in `[data-testid="topic-bar"]`; clicking a passed Topic opens `/sessions/<id>`.

**Done when:**
- Tests pass; `npm run check`, `npm run build`, `npm run ui:test` pass; the A3b audit is clean on `/course` (once A3b has landed).
- The `[B1]` line in `e2e/targets.spec.ts` loses `test.fail` and passes; `/progress` is replaced by `/course` in the route lists of `e2e/layout.spec.ts` and, if present, `e2e/affordance.spec.ts`.
- `rg -n 'ProgressView|/progress' src --glob '!*.test.*'` returns only the redirect and the `HeaderPage` type A5 removes.
- Screenshot of `/course` at 1512×982 (Light, Dark) attached.
- `docs/architecture.md` "Course Map" section updated (progress lives here now; scenario: the Learner sees "3 of 7" under a Topic without opening another page; trade-off: a longer page, solved by collapsible Subject groups). GLOSSARY **Course Map** gets "and shows the Learner's progress on it".

**Critic check:** Space critic on `/course` (cards per row, gutters) and Affordance critic (cards are buttons or links? each has a signifier). Bar: audit clean; ≥ 3 cards across at 1512.

**Find it:**
```bash
rg -n 'ProgressView|data-progress-summary' src
ls src/app/progress
rg -n 'courseOverview' src/app/course/page.tsx src/app/progress/page.tsx
rg -n 'Check pills|data-status' src/app/course/course-map-view.tsx
```
**Hot files:** `src/app/course/course-map-view.tsx`, `src/app/course/page.tsx`, `next.config.ts`, `src/course/progress-summary.ts` (new).

---

### B2a · One Notebook for notes and past Sessions, one row per Topic, and the old pages redirect to it
**Label:** `ready-for-agent` · **Depends on:** wave 0, A1 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "Past sessions and notes, those two can be jammed together … 'Save to notes': I thought notes were previous sessions; how am I supposed to know?" Notes' saved items are only pointers into Sessions (`note_items` rows of kind `reply`/`widget`, redrawn from the stored Session, `src/learner/saved.ts`), which is why the two pages feel like one. Past Sessions (`past-sessions.tsx:40-80`, `src/tutor/past-sessions.ts:72-82`) and Notes (`notes/notes-view.tsx:85-121`, `src/learner/notes.ts`) both list Topics.

**Change:**
- **Route `/notebook`** (`src/app/notebook/page.tsx`, `notebook-view.tsx`) and loader `loadNotebook(db, map, learnerId, { all })` in `src/learner/notebook.ts`, which composes `loadPastSessions`, `loadNotes` and `courseOverview`. **One row per Topic**, in course order, only Topics that have a Session or a note (`hasNote`), or all with `?all=1` ("Show all Topics" stays, for adding a line to a Topic not reached yet).
- **A row shows:** Topic title; status Tag (Not started / In progress / Passed); "Last worked on" date; the action — **Resume** (a form post to `/api/open` with the Topic, for an in-progress Topic) or **Read** (a link to `/sessions/<id>`, for a passed Topic); **What you found** (the code-written lines, `foundIn`); the **Topic Note** (saved lines `SavedItems`, Own rules, the code-filled part, the line editor `OwnLines`); and an **Earlier attempts** slot (empty until B3b). The row's `id` stays `note-<topicId>` so old `#note-…` links work.
- **Below the rows:** **Older sessions** (as today), each linking to `/sessions/<id>`.
- **Layout:** `card-grid` with `minmax(420px, 1fr)`: three rows across at 1512. Printing works as today (controls `print:hidden`, empty Topics left out).
- **Redirects** in `next.config.ts` (permanent, so 308): `/sessions` → `/notebook`; `/notes` → `/notebook`; `/notes` with query `all=1` → `/notebook?all=1` (listed first). **`/sessions/[id]` stays** as the read view; its back link becomes "← Notebook" (to `/notebook#note-<topicId>`, or `/notebook` for an Older session). `/api/open`'s fallback `"/sessions"` (`api/open/route.ts:18-23,39`) becomes `/notebook`.
- **Remove:** `src/app/notes/page.tsx`, `src/app/sessions/page.tsx`, `loading.tsx` of both, `PastSessions`/`NotesView` pages' headers (their components may be reused inside the Notebook; delete what is unused).
- **Docs:** GLOSSARY: add **Notebook**: "the page where a Learner finds, for each Topic, its Session, what they found and their Topic Note"; update **Topic Note** ("kept in the Notebook") and the Learner entry. _Avoid_: Notes page, Past Sessions. The verb "Save to notes" is B2b's.
- **Not changed:** `note_items` and every table, the `/api/notes` routes, how a saved reply is redrawn, Citations and deep links into a Session.

**Tests first (red → green, in this order):**
1. `[S2]` new `src/learner/notebook.test.ts` (PGlite) · "one row per Topic" · seed Learner 1: Topic A passed with a Session, 2 found lines and a saved reply; Topic B in progress with a Session; Topic C with no Session and one own line; Topic D untouched; an Older session; Learner 2 with Topic A in progress. Expect rows `[A, B, C]` in course order; A: `status: "passed"`, `action: "read"`, `sessionId` = A's Session, 2 found lines, 1 saved item; B: `action: "resume"`; C: `action: null`, 1 line; D absent; with `all: true` D present; Learner 2's data never appears in Learner 1's result; the Older session is listed once under `older`.
2. `[S2]` `src/app/redirects.test.ts` (B1) · "old pages redirect" · `redirects()` contains `/sessions` → `/notebook`, `/notes` → `/notebook` and the `all=1` variant, all `permanent: true`.
3. `[S2]` new `src/app/api/open/route.test.ts` · "a passed Topic without a Session goes to the Notebook" · POST with `topic=<passed, sessionless>` → 303 `Location: …/notebook`.
4. `[S4]` new `src/app/notebook/notebook-view.test.tsx` (replaces `notes/notes-view.test.tsx` and `past-sessions.test.tsx`; delete those) · "notebook rows" · `<h1>Notebook</h1>`; one `[data-notebook-row]` per Topic with `id="note-<topicId>"`; an in-progress row has a `<form action="/api/open">` with hidden `topic`; a passed row has a link to `/sessions/<id>` with text "Read"; "Older sessions" `h2` lists links to `/sessions/<id>`; no text "Past Sessions" anywhere.
5. `[S4]` `src/app/old-session.test.tsx` (update) · "back link" · "← Notebook" with `href="/notebook#note-<topicId>"` for a Topic Session and `/notebook` for an Older session.
6. `[S1]` new `e2e/notebook.spec.ts` · "old addresses still work" · `/notes#note-<topicId>` and `/sessions` end on `/notebook` (fragment kept); `/sessions/<id>` still shows the read-only Session with Resume or Passed; the status chain's first hop is 308.
7. `[S1]` same file · "notebook is wide" · at 1512, ≥ 3 rows across, gutters ≤ 32.

**Done when:**
- Tests pass (old `notes-view.test.tsx` and `past-sessions.test.tsx` deleted, not skipped); `npm run check`, `npm run build`, `npm run ui:test` pass; the A3b audit is clean on `/notebook` (once A3b has landed).
- The `[B2a]` line in `e2e/targets.spec.ts` loses `test.fail` and passes; `/sessions` and `/notes` are replaced by `/notebook` in the route lists of `e2e/layout.spec.ts` and, if present, `e2e/affordance.spec.ts`.
- `rg -n 'Past Sessions' src --glob '!*.test.*'` returns nothing.
- Screenshots of `/notebook` (Light, Dark, 1512) attached.
- `docs/architecture.md` "Notes and Past Sessions" section replaced by "Notebook" (what, scenario: a Learner who passed Percent opens one row and sees what they found, their saved reply and a Read button; trade-off: one longer page instead of two short ones). GLOSSARY as above.

**Critic check:** Space critic (`/notebook` columns), Affordance critic (Resume/Read are buttons; Older-session rows are links) and the Beginner persona critic on the words "Notebook", "Resume", "Read" (rubric item "I know what this page is for"). Bar: audit clean; persona says the page's purpose in one sentence.

**Find it:**
```bash
rg -n '"/notes|`/notes|`/sessions|"/sessions' src/app --glob '!*.test.*'
rg -n 'loadNotes|loadPastSessions' src --glob '!*.test.*'
ls src/app/notes src/app/sessions
```
**Hot files:** `src/app/notebook/*` (new), `src/learner/notebook.ts` (new), `src/app/notes/*`, `src/app/sessions/*`, `src/app/past-sessions.tsx`, `src/app/old-session.tsx`, `src/app/api/open/route.ts`, `next.config.ts`, `GLOSSARY.md`.

---

### B2b · "Save to notes" becomes "Save to Notebook", and its toast opens the right Notebook row
**Label:** `ready-for-agent` · **Depends on:** wave 0, B2a · **Tier:** sonnet · **Size:** S

**Why:** The owner: "'Save to notes': I thought notes were previous sessions; how am I supposed to know?" Once the Notebook exists (B2a), the verb must name it. "Save to notes" is a Ghost button under each reply and Widget (`src/app/thread.tsx:172`, `src/app/widget-panel.tsx:308`, `src/app/save-to-notes.tsx:124-162`).

**Change:**
- **Rename the verb:** "Save to notes" → **"Save to Notebook"**; "Saved ✓" → "Saved to Notebook ✓"; "Open notes" → "Open Notebook"; the toast links to `/notebook#note-<topicId>` (`save-to-notes.tsx:109`); the Own-rule line "Saved to your notes" → "Saved to your Notebook", "Removed from your notes" → "Removed from your Notebook" (`own-rule-line.tsx:23,29,35`, `session-item-view.tsx:114`, `tutor/own-rule-item.ts:3`); the Tutor-side texts `tools.ts:109` ("Saving to your notes…") and `tools.ts:659` (the tool result that says the Learner sees "Saved to your notes") change to say Notebook too. **Because `tools.ts` is a Tutor file, the `tutor-eval` workflow runs on this PR (paid, not required); the PR notes that only two strings changed.** the Topic complete card "Saved to your Notes ✓" → "Saved to your Notebook ✓" (`topic-complete-card.tsx:23`). **File and function names stay** (`save-to-notes.tsx`, `saveToNotes`) so no import or test path moves.
- **Docs:** GLOSSARY: the Topic-complete card entry (GLOSSARY.md:191) changes "Notes" to "Notebook".
- **Not changed:** `note_items`, the `/api/notes` routes, how a saved reply is redrawn.

**Tests first (red → green, in this order):**
1. `[S4]` `src/app/save-to-notes.test.tsx`, `save-to-notes-states.test.tsx`, `widget-save-handoff.test.tsx`, `own-rule-line.test.tsx` (update strings), plus any `src/tutor/tools*.test.ts` that asserts "Saved to your notes" · the button text is "Save to Notebook"; after a save "Saved to Notebook ✓ · Undo · Open Notebook"; the link `href` is `/notebook#note-<topicId>`.
2. `[S1]` new `e2e/notebook.spec.ts` · "save, then find it" · in `/study` press "Save to Notebook" under a reply; the toast's "Open Notebook" opens `/notebook#note-<topicId>`; that row is scrolled into view (its top within the viewport) and contains the saved reply.

**Done when:**
- Tests pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- `rg -n 'Save to notes|Open notes|your notes' src --glob '!*.test.*'` returns nothing (comments included); `rg -n 'Notes' src/app --glob '!*.test.*'` returns only code identifiers.
- Screenshot of the toast (Light, Dark, 1512) attached.
- `docs/architecture.md` "Notebook": one line on the verb and the toast's deep link.

**Critic check:** Beginner persona on the words "Save to Notebook" and "Open Notebook" (rubric item "I know where this goes"). Bar: the persona says where the saved line will be, in one sentence.

**Find it:**
```bash
rg -n 'Save to notes|Open notes|your notes' src --glob '!*.test.*'
rg -n 'Saving to your notes' src/tutor/tools.ts
```
**Hot files:** `src/app/save-to-notes.tsx`, `src/app/own-rule-line.tsx`, `src/app/session-item-view.tsx`, `src/tutor/tools.ts` (two strings), `src/tutor/own-rule-item.ts`, `src/app/topic-complete-card.tsx`, `src/app/widget-panel.tsx`, `GLOSSARY.md`.

---

### B3a · A Learner's Topic can be started over in one safe step, and nothing is lost
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet (one opus retry, §9.3) · **Size:** M

**Why:** The owner: "I want each session to be able to be started over." Today only the whole Learner can start over (`startOver`, `src/auth/learners.ts:37-48`: archive and a fresh Learner). A naive per-Topic reset trips these constraints: `sessions_one_live_per_topic` (`schema.ts:68-70`), `insight_attempts_settled_once` (`:201`), the primary keys on `topic_progress` (`:134`), `skill_state` (`:745`) and `review_cards`, `note_items_saved_once` (`:674`), `learner_state.shownSessionId` (`:111`), and `jumpTo` refusing a passed Topic (`navigator.ts:300`). Decision: progress resets, a new Session starts, the old Session stays readable, nothing is lost.

**Change:**
- **One migration** (generated by `npm run db:generate`, never hand-written; it takes the next free number, §9.2):
  - `sessions.restarted_at timestamptz null`.
  - `topic_restarts`: `id serial pk`, `learner_id` (fk `learners`), `topic_id text`, `session_id int null` (fk `sessions`, unique), `attempt_no int` (1 for the first attempt that ended), `restarted_at timestamptz default now()`, `snapshot jsonb`, index `(learner_id, topic_id)`.
  - `snapshot` shape (`TopicSnapshot`): `{ topic_progress: Row | null, check_results: Row[], misconceptions: Row[], insight_attempts: Row[], quiz_attempts: Row[], skill_state: Row[], practice_answers: Row[], widget_state: Row[] }`, each `Row` the table's columns as stored.
- **`restartTopic(db, map, learnerId, topicId, now = new Date())`** in `src/learner/restart.ts`, one transaction. (`map` is the first extra argument because `quiz_attempts` has no `topic_id`: its rows are found by the Topic's Check ids.)
  1. Lock the live Session (`older = false`, this Learner, this Topic) `FOR UPDATE`. If the Learner has no live Session and no `topic_progress` row for the Topic, return `{ restarted: false, reason: "nothing_to_restart" }` and change nothing. This is also what a double submit gets.
  2. Read the Topic's rows from the seven tables above (and the Session's `widget_state`) into `snapshot`; insert the `topic_restarts` row with `attempt_no` = earlier restarts of this Topic for this Learner + 1.
  3. Move the Topic's live rows into the snapshot, then clear the live copies of `topic_progress`, `check_results`, `misconceptions`, `insight_attempts`, `skill_state`, `practice_answers` (this Learner and Topic) and `quiz_attempts` (this Learner, the Topic's Check ids). Nothing is lost: the snapshot holds every row.
  4. Set the Session `older = true`, `restarted_at = now`.
  5. If `learner_state.shownSessionId` is that Session, set it to null. `currentTopicId` is left as it is.
  6. Return `{ restarted: true, restartId, oldSessionId }`.
- **Kept untouched:** `note_items` (saved lines, replies, Widgets, Own rules: they point at the old Session and still redraw), `review_cards` and `review_log` (spaced review goes on), `turns`, `messages`, `session_items`, and the old Session's `widget_state` rows (they are keyed by the old Session id, so they cannot collide with the new one; the snapshot also copies them). A **passed** Topic can be restarted; its progress row goes, so `jumpTo` accepts it again.
- **API `POST /api/topics/[topicId]/restart`** (`src/app/api/topics/[topicId]/restart/route.ts`): same-origin (`sameOrigin`, 403 otherwise), signed in (401), form field `confirm=restart-topic` (`RESTART_CONFIRM`, 400 otherwise), unknown Topic 404, 409 "A turn is running" while `turnRunning` is true. On success (or `nothing_to_restart`) it makes that Topic the current one (`saveJump`) and answers 303 to `/study`. GET is 405, like Start over.
- **Docs:** ADR 0004 gets an amendment note under Consequences: "Amended 5 November 2026: a Learner can start a Topic over. The live Session becomes an Older session marked `restarted_at`, the Topic's progress rows are snapshotted to `topic_restarts` and cleared, and the next turn opens a fresh Session." GLOSSARY: add **Start a Topic over** and **Earlier attempt**. `docs/architecture.md`: "Restarting a Topic".
- **Not in B3a:** the Topic-bar menu, Settings → Your Topics and the Notebook's Earlier attempts (B3b).
- **Not changed:** `startOver` (whole Learner), the Tutor tools, `jumpTo`, the schema of any other table, spaced review.

**Tests first (red → green, in this order):**
1. `[S2]` new `src/learner/restart.test.ts` (PGlite via `testDb()`; seed a Learner with Topic P: `topic_progress` at Check step, 2 `check_results`, 1 `misconception`, 1 settled `insight_attempt`, 2 `quiz_attempts` (attempt 1 and 2) of one Check, 1 `skill_state`, 2 `practice_answers`, a live Session with 2 `widget_state` rows, a `review_card`, a saved `note_item` pointing at the Session; Topic Q with its own full set; Learner 2 with the same Topic P) · **"restart snapshots and clears only this Topic"**: after `restartTopic(…, P)` → `restarted: true`; P's seven live tables have 0 rows; `topic_restarts` has 1 row with `attempt_no` 1, `session_id` = the old Session and a snapshot holding 2 check results, 1 misconception, 1 insight attempt, 2 quiz attempts, 1 skill, 2 practice answers, 2 widget states; the old Session has `older = true` and `restarted_at = now`.
2. `[S2]` same · **"other Topics' and other Learners' rows are unchanged"** · Topic Q's rows in every table are identical (row for row) before and after; Learner 2's rows for Topic P are identical; `review_cards` and the saved `note_item` are unchanged.
3. `[S2]` same · **"double submit is idempotent"** · a second `restartTopic` returns `{ restarted: false, reason: "nothing_to_restart" }`; `topic_restarts` still has 1 row; two concurrent calls (`Promise.all`) leave exactly 1 row and no thrown error.
4. `[S2]` same · **"old Session stays readable"** · the old Session's `messages`, `session_items` and `widget_state` rows are unchanged, and the saved `note_item` still redraws from it.
5. `[S2]` same · **"a new turn opens a fresh Session"** · `sessionForTurn(db, now, learnerId, P)` returns a Session with a new id, `older = false`; `liveSession` returns it; `learner_state.shownSessionId` is null before and the Topic is still current.
6. `[S2]` same · **"constraints don't fire"** · after the restart, in the same DB: insert a new `topic_progress` row for P, a new settled `insight_attempt`, `quiz_attempts` with `attempt_no` 1 for the same Check, a `skill_state` row, the same `practice_answers` `item_key`, and a second live Session: none throws (`sessions_one_live_per_topic`, `insight_attempts_settled_once`, the keys). A second restart then gives `attempt_no` 2.
7. `[S2]` same · **"a passed Topic can be restarted"** · seed P as `passed`; restart; `loadProgress` shows P `not_started`; `jumpTo` returns `ok: true`.
8. `[S2]` same · **"a failure leaves everything"** · make the `topic_restarts` insert fail (pre-insert a `topic_restarts` row with the same `session_id`); the transaction rolls back and every live row of P is still there.
9. `[S2]` new `src/app/api/topics/[topicId]/restart/route.test.ts` (mock `@/db/client`, cookie `fa_access`, as `api/logout/route.test.ts`) · "route rules" · wrong origin → 403; no cookie → 401; missing or wrong `confirm` → 400; unknown Topic → 404; a running turn → 409 and no rows change; success → 303 `Location: /study` and the Topic is current; GET → 405; the Learner cannot restart another Learner's Topic (they have none, so `nothing_to_restart`; Learner 2's rows are unchanged).

**Done when:**
- Tests 1–9 pass; `npm run check`, `npm run build` pass; the new migration is in `drizzle/` with its `meta` snapshot and applies on PGlite.
- Restarting a Topic never changes a row of another Topic or Learner (tests 2 and 9).
- Docs: ADR 0004 amendment note, GLOSSARY entries, `docs/architecture.md` "Restarting a Topic" (what: snapshot, clear, new Session; scenario: a Learner who guessed through Percent restarts it, sees a clean Story step, and can still read the first attempt in the Notebook; trade-off: the snapshot repeats data, accepted because it makes "nothing is lost" true and keeps the live tables simple).
- Production migration is the owner's step: **H1**.

**Critic check:** the Security critic (route: origin, auth, confirm, Learner scoping, replay). Bar: 0 confirmed high, critical or medium findings; every rows-unchanged test present. The Final review's Spec axis checks "nothing lost".

**Find it:**
```bash
rg -n 'sessions_one_live_per_topic|insight_attempts_settled_once|note_items_saved_once' src/db/schema.ts
rg -n 'export async function startOver' src/auth/learners.ts
rg -n 'export function jumpTo' src/course/navigator.ts
rg -n 'export async function (sessionForTurn|liveSession|saveShownSession)' src/tutor/session-log.ts
rg -n 'export async function turnRunning' src/tutor/turn-status.ts
ls drizzle | tail -2
```
**Hot files:** `src/db/schema.ts`, `drizzle/*` (new migration + `meta`), `src/learner/restart.ts` (new), `src/app/api/topics/[topicId]/restart/route.ts` (new), `docs/adr/0004-one-session-per-topic.md`, `GLOSSARY.md`.

---

### B3b · A Learner can start one Topic over from the Topic bar or Settings, and the old attempt stays in the Notebook
**Label:** `ready-for-agent` · **Depends on:** wave 0, B3a, A5, B2a · **Tier:** sonnet · **Size:** M

**Why:** The owner: "I want each session to be able to be started over." B3a made the safe server step; this ticket puts it where the Learner looks: the Topic bar, Settings, and the Notebook's record of the first attempt.

**Change:**
- **Entry points:** (a) the Topic bar gets a "⋯" `IconButton` (`aria-label="Topic options"`) opening a `Menu` (A5's `primitives/menu.tsx`) with "Start this Topic over…". (b) Settings → **Your Topics** (the empty slot A5 left, `id="your-topics"`): the Topics that have progress, in course order, each with its status Tag and a secondary "Start over" Button. Both open the same inline confirm: "This clears your Checks and progress for this Topic. Your Notebook keeps the old conversation and your notes." with a `danger` Button "Start over" and a "Cancel" Button.
- **Notebook (B2a's slot):** each Topic row lists **Earlier attempts**: "Earlier attempt · 4 Nov" with the attempt's end status (Passed or Not finished, from the snapshot), "Checks passed 2 of 3", What you found (from the old Session), and a **Read** link to `/sessions/<oldSessionId>`. Read-only; no Resume. A restarted Session is no longer listed under **Older sessions**: `loadPastSessions` and the Session header (`src/tutor/past-sessions.ts:74-88`) treat `older = true` with `restarted_at` set as an earlier attempt, a new header kind `earlier`: "Earlier attempt · <date> · read-only" with a "Go to the current attempt" link.
- **Docs:** GLOSSARY: update **Older session** ("or a Session the Learner restarted, shown as an Earlier attempt"). `docs/architecture.md` "Restarting a Topic": the entry points.
- **Not changed:** `restartTopic` and its route (B3a), `data-testid="topic-bar"`, `aria-label="Topic progress"`.

**Tests first (red → green, in this order):**
1. `[S2]` `src/learner/notebook.test.ts` (B2a) and `src/tutor/past-sessions.test.ts` · "an earlier attempt is listed as one" · after `restartTopic` on P, the header query for the old Session returns kind `earlier`; `loadNotebook` lists it under P's **Earlier attempts** and not under `older`.
2. `[S4]` `src/app/topic-start-and-bar.test.tsx` and new `src/app/topic-options.test.tsx` · "⋯ menu" · the Topic bar has a button `aria-label="Topic options"`; Enter opens a menu with "Start this Topic over…"; choosing it shows the confirm text and a `danger` "Start over" inside `<form action="/api/topics/<id>/restart" method="post">` with hidden `confirm=restart-topic`; Cancel closes it and nothing posts. `data-testid="topic-bar"` and `aria-label="Topic progress"` are unchanged.
3. `[S4]` `src/app/settings/settings-view.test.tsx` (update A5's test) · "six cards" · ids `account, appearance, about-you, your-topics, developer-details, start-over`; Your Topics lists only Topics with progress, in course order, each with a "Start over" Button; with none: "Topics you start will appear here."
4. `[S4]` `src/app/notebook/notebook-view.test.tsx` (B2a) · "earlier attempts" · a row with 2 attempts shows "Earlier attempt · 4 Nov" and "Earlier attempt · 2 Nov", newest first, each with a **Read** link and no Resume.
5. `[S1]` new `e2e/restart.spec.ts` · "restart from the Topic bar and from Settings" · seed a Learner with Topic P passed and Topic Q in progress. From Q's Topic bar: ⋯ → Start this Topic over → confirm: `/study` shows Q at its Story step with an empty chat, the Topic bar shows no Checks passed; `/notebook` shows Q with one "Earlier attempt". From `/settings` → Your Topics → Start over on P: P is `Not started` on `/course`; its earlier attempt opens read-only at `/sessions/<id>` with the old messages and no composer.
6. `[S1]` same · "nothing else moved" · after both restarts the Notebook still shows P's saved reply and Own rule, and `/study` Review still lists the due card.

**Done when:**
- Tests 1–6 pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- The A3b audit is clean on `/settings` and on the open Topic menu.
- Screenshots: Topic bar menu, the confirm, Your Topics, and an Earlier attempt row (Light and Dark, 1512).
- Docs above updated.

**Critic check:** the Affordance critic (menu, confirm, Your Topics). Bar: 0 audit failures; every score ≥ 4.

**Find it:**
```bash
rg -n 'if \(s.older\)' src/tutor/past-sessions.ts
rg -n 'export function TopicBar' src/app/workspace-parts.tsx
rg -n 'your-topics|<section id=' src/app/settings/settings-view.tsx
```
**Hot files:** `src/tutor/past-sessions.ts`, `src/learner/notebook.ts`, `src/app/workspace-parts.tsx` (TopicBar), `src/app/topic-header.tsx`, `src/app/settings/settings-view.tsx`, `src/app/notebook/notebook-view.tsx`, `GLOSSARY.md`.

---

### C1a · Only people on the invite list can become a Learner through Google, and the owner's Google account links to Learner 1
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** opus · **Size:** M

**Why:** The owner: "let's implement the sign-in thing for once and forever: people should be able to sign in using their Gmail account." Today there is no OAuth anywhere: a `PASSCODES` list and one signed cookie (`src/auth/passcode.ts:2-13`), and `learnerFromCookie` refuses any Learner whose name is not in that list (`src/auth/learners.ts:55-61`). The app is already multi-Learner (every per-Learner table has `learner_id`), so this ticket only adds who may sign in and how a Google account becomes a Learner. Decision 4: an invite list first, one switch to open it. The passcode stays beside Google until C3.

**Change (in this order):**
1. **Install and generate.** Pin `better-auth@1.7.17` and `@better-auth/drizzle-adapter` (read its version with `npm view @better-auth/drizzle-adapter version` and pin it exactly). Write `src/auth/better-auth.ts` (new) exporting `auth`. Generate the four core tables with `npx auth@latest generate --adapter drizzle --dialect postgresql --output <tmp file>` and paste them into `src/db/schema.ts` as `user`, `session`, `account`, `verification` (text ids, as generated). Then run `npm run db:generate`: the **next free migration number** at rebase time (§9.2; never reuse a number). Never `auth migrate`.
2. **Our tables and columns, in the same migration.**
   - `learners.auth_user_id text null references "user"(id) on delete set null`, plus a partial unique index `learners_one_active_per_auth_user` on `(auth_user_id) where archived_at is null and auth_user_id is not null`.
   - `invites`: `id serial pk`, `email text not null` (stored lowercase, unique), `learner_name text null` (links an existing Learner such as the owner's), `invited_at timestamptz not null default now()`, `note text null`.
   - Setting `signup_open`, default `"off"`, inserted `onConflictDoNothing` like the other defaults (`src/tutor/session-log.ts:24-29`). Read it through one function, `signupOpen(db)`.
3. **The auth instance.** `betterAuth({ baseURL: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET, database: drizzleAdapter(db, { provider: "pg", schema }), socialProviders: { google: { clientId, clientSecret, prompt: "select_account" } }, trustedOrigins: ["https://www.value-it.xyz", "https://value-it.xyz", "http://localhost:3000"], session: { expiresIn: 60*60*24*90, cookieCache: { enabled: false } }, account: { accountLinking: { trustedProviders: ["google"] } }, onAPIError: { errorURL: "/login" }, plugins: [nextCookies()] })` (`nextCookies` last). No cookie cache: sign-out and revocation take effect at once, and the 90 days match today's cookie (`passcode.ts:13`). Google asks for `openid email profile` only; no offline access. Rate limit: `storage: "database"` is **not** used; the in-memory default is enough for about 20 invited people (say so in ADR 0011). The route file is `src/app/api/auth/[...all]/route.ts` with `toNextJsHandler(auth)`. `getDb()` is passed lazily so tests can mock `@/db/client`.
4. **The gate (invite check).** `databaseHooks.user.create.before` throws `new APIError("FORBIDDEN", { message: "not_invited" })` unless the lowercase, trimmed email has an `invites` row OR `signupOpen(db)` is true; it also throws when `emailVerified` is false. C1b makes the login page turn `?error=not_invited` into the plain page **"You're not on the list yet"** with one line ("Ask the person who shared Value It with you to add your email.") and a "Back to home" link; any other `error` shows "Sign-in didn't work. Try again." **VERIFY in the red test** that the thrown message reaches `/login?error=`; if Better Auth 1.7.17 does not pass it, use `user.validateUserInfo` returning a code instead (check its exact type in `node_modules` first). A blocked sign-up must leave **no `user` row, no `account` row and no Learner**.
5. **Google user to Learner, `src/auth/google-learner.ts` (new), pure over `Db`.** `learnerForAuthUser(db, user)`, called lazily from `currentLearner()` (one place, idempotent):
   - An **active Learner already linked** to `user.id` is returned.
   - Else an **invite for the email naming a Learner** (`learner_name`): that active Learner is linked, but only if its `auth_user_id` is null (else refuse: `null`, logged "invite_taken"). If no active Learner has that name, one is made.
   - Else an invite without a name, or `signup_open = "on"`: a **new Learner** named after the Google display name. **Never use `signInAs`** here (`learners.ts:12`): it returns an existing Learner with the same name, which would hand one person another person's progress. Instead insert; on a name clash append " (2)", " (3)". The names `owner` and `tools` (any case) are reserved and always suffixed.
   - Else (no invite, closed): `null`.
   - Two first requests at once make one Learner (the partial unique index decides; the loser reads the winner's).
   - **Start over** (`startOver`, `learners.ts:37`) copies `auth_user_id` to the fresh Learner in the same transaction; the archived one keeps it but no longer counts (the partial index).
6. **The invites CLI, `scripts/invites.mjs` (new)** with `npm run invites -- <command>`: `add <email> [--learner owner] [--note "..."]`, `remove <email>`, `list`, `open`, `close`. Logic lives in `src/auth/invites.ts` (testable); the script is a thin wrapper like `scripts/bank-verify.mjs`. It lowercases and trims emails. `add --learner owner` first checks that an active Learner named `owner` exists and prints its id ("linked to Learner 1"); it refuses if none exists or it is already linked. **Guard:** unlike the eval scripts it is meant for production, so `assertNamedDatabase(url, env)` (new in `scripts/script-guards.mjs`) prints the database host and requires `INVITES_DB_OK=<that host>` in the environment, the owner's statement of which database they mean. `open` and `close` write `signup_open`. `remove` deletes the invite only: a Learner who already signed up keeps access (to lock one out, archive the Learner; ADR 0011 says so).
- **Docs:** ADR 0011 from Appendix I, status accepted. GLOSSARY: new **Invite list** and **Sign-up switch**. `docs/architecture.md` gains "Google sign-in and the invite list (`src/auth/better-auth.ts`, `google-learner.ts`, `invites.ts`, tables `user`, `session`, `account`, `verification`, `invites`, column `learners.auth_user_id`, spec 2026-11-05)": scenario (Asha is invited, signs in with Google, becomes Learner 7), trade-off (a lookup per request; a removed invite does not sign out someone already in).
- **Not in C1a:** reading the session in `currentLearner()`, the proxy, sign out and the login page (C1b). Nothing a Learner sees changes yet.
- **What must NOT change:** the passcode path for Learners (until C3); `POST /api/login`, its rate limit (`login-guard.ts`) and its cookie; `safeDestination`; the tools Learner; Learner data and every `learner_id` foreign key. No change to any page except `/login`.

**Tests first (red → green, in this order):**
1. [S3] `src/auth/invites.test.ts` · "emails are compared lowercase" · `addInvite(db, "  Rahul@Gmail.COM ")` stores `rahul@gmail.com`; `isInvited(db, "RAHUL@gmail.com")` is true; adding the same email twice keeps one row; `removeInvite` then `isInvited` is false.
2. [S2] `src/auth/google-learner.test.ts` (PGlite) · "invited email makes a Learner" · user `{id:"u1", email:"a@x.com", name:"Asha"}` with an invite and no name: `learnerForAuthUser` returns a Learner named "Asha" with `auth_user_id = "u1"`; calling it again returns the same Learner (one row).
3. [S2] same file · "the owner's invite links Learner 1" · seed: Learner 1 named `owner` with 3 `topic_progress` rows; invite `{email:"o@x.com", learner_name:"owner"}`; the Google user for `o@x.com` gets Learner **1** (`id === 1`), `loadProgress` shows the same 3 rows, and no second Learner exists.
4. [S2] same · "a second Google account cannot take the owner's Learner" · Learner 1 already linked to `u1`; invite for `p@x.com` also names `owner`; user `u2` gets `null`.
5. [S2] same · "not invited and closed gives nothing" · no invite, `signup_open = "off"`: returns `null`; `select count(*) from learners` is unchanged.
6. [S2] same · "open lets anyone in" · `signup_open = "on"`, no invite: a Learner is made.
7. [S2] same · "same display name, two people" · two users both named "Asha": two different Learners ("Asha" and "Asha (2)"); neither is the passcode Learner. A user named "Owner" gets "Owner (2)"; a user named "tools" gets "tools (2)".
8. [S2] same · "an archived Learner is not returned; Start over keeps the link" · archive the linked Learner: `learnerForAuthUser` makes a new one; `startOver(db, id)` returns a Learner with the same `auth_user_id`, and the old one is archived with the link intact; the partial unique index rejects two active Learners for one `auth_user_id` (insert throws).
9. [S2] same · "two first requests at once make one Learner" · `Promise.all` of 5 calls for one new user: `select count(*) from learners where auth_user_id = 'u1'` is 1.
10. [S2] `src/auth/better-auth.test.ts` · "the gate blocks an uninvited sign-up and keeps nothing" · call the `databaseHooks.user.create.before` function with an uninvited user while closed: it throws with message `not_invited`; with the email unverified it throws; with an invite or `signup_open = "on"` it returns `{ data: user }`. Through the real handler on PGlite (`auth.api.signInSocial` is stubbed at the provider boundary; if that is not possible, test the hook directly and prove the redirect in S1): `select count(*)` of `user` and `account` is 0 after a blocked attempt.
11. [S2] `src/dev/script-guards.test.ts` (extend) · "invites guard" · `assertNamedDatabase("postgres://u@db.example/x", {})` throws; with `INVITES_DB_OK: "db.example"` passes; with `INVITES_DB_OK: "other.example"` throws; it logs the host.
12. [S2] `src/auth/invites-cli.test.ts` · "the CLI commands" · `add o@x.com --learner owner` on a database with Learner 1 named `owner` stores the invite and reports Learner 1; with no such Learner it refuses; `open` then `signupOpen` is true; `close` makes it false; `list` prints emails in invited order.

**Done when:**
- All tests above pass; `npm run check` and `npm run build` pass.
- The migration applies on PGlite and on a Neon branch with `npm run db:migrate` (the agent may do this on a branch, never on production); `select count(*) from learners` is unchanged before and after.
- No secret is committed; `.env.example` gains the four names `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` with empty values and one comment line each.
- Docs above written.

**Critic check:** **Security** (§8.7) on the gate and the Learner linking: invite bypass (case, whitespace, `+` aliases, unverified email), a second account taking Learner 1, a Google name colliding with `owner` or `tools`. Pass bar: 0 confirmed high, critical or medium findings after adversarial verification.

**Find it:**
```bash
rg -n 'ACCESS_COOKIE' src/auth/passcode.ts
rg -n 'OWNER_LEARNER_ID' src/db/schema.ts
rg -n 'uniqueIndex\("learners_one_active_per_name"\)' src/db/schema.ts
rg -n 'export function assertTestDatabase' scripts/script-guards.mjs
```

**Hot files:** `package.json`, `package-lock.json`, `src/db/schema.ts`, `drizzle/*` (new migration + `meta`), `src/auth/better-auth.ts` (new), `src/auth/google-learner.ts` (new), `src/auth/invites.ts` (new), `src/auth/learners.ts` (Start over keeps the link), `scripts/script-guards.mjs`, `scripts/invites.mjs` (new), `.env.example`, `docs/architecture.md`, `GLOSSARY.md`, `docs/adr/0011-*.md`.

---

### C1b · A Learner signs in with their Google account and signs out with one click
**Label:** `ready-for-agent` · **Depends on:** wave 0, C1a, A3a · **Tier:** opus · **Size:** M

**Why:** C1a made the tables, the gate and the Learner linking. Nothing reads a Google session yet: `currentLearner()` reads only `fa_access` (`src/auth/session.ts:12`), the proxy knows only that cookie (`src/proxy.ts:30`), and `learnerFromCookie` refuses any name not on `PASSCODES` (`src/auth/learners.ts:55-61`). This ticket makes Google sign-in work end to end, with the passcode still beside it until C3.

**Change (in this order):**
1. **Reading the session.** `currentLearner()` (`src/auth/session.ts:12`): read `auth.api.getSession({ headers: await headers() })` first; a session whose user maps to a Learner wins. Only if there is **no Better Auth session** does it fall back to `fa_access`, and `learnerFromCookie` keeps requiring `PASSCODES` membership for those Learners. A Google-linked Learner's name is not on `PASSCODES` and must not need to be (the name check applies only to the `fa_access` path). So a Learner who signs in with Google never needs a passcode. `signedInLearner()` and `currentLearnerId()` stay as they are.
2. **The proxy, `src/proxy.ts`.** `signedIn()` (`:30`) becomes: `fa_access` verified as today, OR `getSessionCookie(request)` present (optimistic; a page or route still verifies through `currentLearner()` before it reads any data). Two rules keep that safe: (a) the "signed-in visitor skips the login form" redirect (`:47-51`) happens **only** for a verified `fa_access` or a session the proxy has fully checked with `auth.api.getSession` (the proxy is on the Node runtime and already reads the database); an optimistic cookie alone never redirects away from `/login`, so a stale cookie cannot loop `/study` → `/login` → `/study`; (b) `config.matcher` (`:75`) excludes `api/auth(?:/|$)` the way it excludes `api/login`, because Better Auth's own routes must work signed out, and nothing else changes. `/api/*` still answers 401 for a request that has neither cookie.
3. **Sign out.** `POST /api/logout` (`src/app/api/logout/route.ts:9`) keeps its same-origin check (`same-origin.ts:6`), calls `auth.api.signOut({ headers })`, and expires `fa_access` as today. Both cookies end on one click. GET stays 405.
4. **Login page (`src/app/login/page.tsx`) and Home.** The page shows one raised primary button **"Continue with Google"** (A3a's primary `Button`) that posts to Better Auth's social sign-in with `callbackURL` set to the safe `next` (`safeDestination`, `destination.ts:19`) or `/study`. The passcode form moves behind a small text link **"Use a passcode"** (`<details>`-free: a link to `/login?passcode=1`) until C3. Home's "Sign in" links (`src/app/_landing/landing.tsx:76,109`) keep pointing at `/login`; the login page is the one that goes to Google. On a deployment where Google is off (`VERCEL_ENV === "preview"`, or `GOOGLE_CLIENT_ID` unset) the Google button is hidden and the passcode form shows directly, so a preview or a fresh clone still signs in with the tools passcode. The page also shows the `?error=not_invited` message of C1a step 4.
5. **trustedOrigins and previews.** Google sign-in is for production and localhost only; no `oAuthProxy` plugin (the documented route if the owner ever wants it on previews). `vercel.json` deploys `main` only today (`vercel.json:6-10`), so there are no previews to configure; the code rule in step 4 is the guard.
- **Test bed:** add `GOOGLE_CLIENT_ID=e2e-not-real`, `GOOGLE_CLIENT_SECRET=e2e-not-real` and a fixed 32-character `BETTER_AUTH_SECRET` to Playwright's `webServer.env`, so the login page shows the Google button in `ui:test`. Google is never called.
- **Docs:** `docs/architecture.md` "Google sign-in" gains the session order (Better Auth first, passcode second) and the proxy rule. GLOSSARY **Learner**: "signed in with Google (or, for the test tools, a passcode)".
- **What must NOT change:** the passcode path for Learners (until C3); `POST /api/login`, its rate limit (`login-guard.ts`) and its cookie; `safeDestination`; the tools Learner; Learner data and every `learner_id` foreign key. No change to any page except `/login`.

**Tests first (red → green, in this order):**
1. [S2] `src/proxy.test.ts` (extend) · "cookies at the gate" · a request with a verified `fa_access` for the tools Learner passes; with only a `better-auth.session_token` cookie value passes to the page (optimistic); with neither, a page redirects to `/login?next=…` and `/api/*` answers 401; `GET /login` with only an unchecked Better Auth cookie is **not** redirected away (no loop); `GET /api/auth/sign-in/social` is not blocked signed out (matcher). Also: the production cookie name `__Secure-better-auth.session_token` is recognised by `getSessionCookie` for an `https://` request.
2. [S2] `src/auth/session.test.ts` (new; mock `auth.api.getSession` at the seam, as `src/app/other-learners.test.ts:24-27` mocks `@/auth/session`) · "Better Auth first, passcode second" · session for a Google user with a linked Learner → that Learner; no session but a valid `fa_access` for `tools` → the tools Learner; session for a user with no Learner while closed → `null`; a Google-linked Learner named "Asha" is returned although `PASSCODES` lists only `tools`; an `fa_access` cookie for "Asha" is **refused** (name not on the list).
3. [S2] `src/app/api/logout/route.test.ts` (extend) · "sign out ends both" · a same-origin POST calls `auth.api.signOut` once and sets `fa_access` expired with `httpOnly`, `sameSite=lax`, `path=/`; a POST with `sec-fetch-site: cross-site` answers 403 and signs nothing out; GET answers 405.
4. [S2] `src/auth/security.test.ts` (new) · "open redirect through next" · `callbackURL` built from `?next=//evil.example`, `/\evil`, `/%2f%2fevil`, `https://evil.example` and `/api/anything` all fall back to `/study`; `?next=/course` is kept. The Better Auth cookie in a real sign-in response has `HttpOnly`, `SameSite=Lax` and, for an `https` base URL, `Secure`.
5. [S1] `e2e/sign-in.spec.ts` · "login page" · signed out, `/login` shows a button named "Continue with Google" with a raised look (`box-shadow` not `none`, `data-affordance="button"`), and a link "Use a passcode"; `/login?error=not_invited` shows "You're not on the list yet"; `/login?passcode=1` shows the passcode field; the passcode form still signs the tools Learner in.
6. [S1] same · "a Google-linked Learner reaches their progress" · a Playwright fixture inserts a `user`, a `session` row and a linked Learner through `POST /api/dev-e2e` (new `{ googleLearner }` state, guarded like the rest) and sets the Better Auth cookie from `testUtils()` mounted only when `e2eEnabled()`; `/study` loads for it, and sign out returns to Home with both cookies gone. **VERIFY** the cookie is accepted under `next dev`; if `testUtils()` cannot be used, sign the cookie by hand with Better Auth's own helper.
7. [S7] `src/auth/no-test-utils.test.ts` · "testUtils never ships" · reading `src/auth/better-auth.ts` as text: `testUtils` appears only inside the branch guarded by `e2eEnabled(`.

**Done when:**
- All tests above pass; `npm run check`, `npm run build` and `npm run ui:test` pass.
- Screenshot of `/login` at 1512×982 in Light and Dark, and of `/login?error=not_invited`, attached to the PR.
- Docs above updated.

**Critic check:** **Security** (§8.7) on the diff, `src/proxy.ts`, `src/auth/**`, `src/app/api/auth`, `src/app/api/logout`: open redirect through `next`, sign-out CSRF, the proxy loop, cookie flags, `testUtils` or `dev-e2e` reachable in production. Pass bar: 0 confirmed high, critical or medium findings. **Affordance** on the two screenshots: "Continue with Google" reads as the one primary action in 3 of 3 runs.

**Find it:**
```bash
rg -n 'learnerFromCookie' src --glob '!*.test.*'
rg -n 'export async function (currentLearner|signedInLearner)' src/auth/session.ts
rg -n 'async function signedIn' src/proxy.ts
rg -n 'api/login' src/proxy.ts
rg -n 'href="/login"' src/app/_landing/landing.tsx
```

**Hot files:** `src/auth/session.ts`, `src/auth/learners.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/api/logout/route.ts`, `src/app/api/dev-e2e/route.ts`, `playwright.config.ts`, `docs/architecture.md`, `GLOSSARY.md`.

---

### C2 · The owner has set up Google sign-in and signs in with their own account on production, seeing their own progress
**Label:** `ready-for-human` · **Depends on:** C1b · **Tier:** none (human) · **Size:** S

**Why:** Claude cannot create a Google Cloud project, set Vercel environment variables, or touch the production database (production migrations and production reads are blocked for it on purpose). These are the owner's steps. The code is dead weight until they are done.

**Change:** The owner runs Appendix F.1 in order. `/wizard` (the skill) can generate an interactive script that walks the steps and checks each one; ask for it if you prefer that to reading the list. Do not paste any secret into an issue or chat.

**Tests first:** none. The check is the owner's own sign-in.

**Done when:**
- The owner signs in with Google on `https://www.value-it.xyz` and the Study Workspace shows their own existing progress (Learner 1's Topics), not an empty start.
- `npm run invites -- list` shows the owner's email linked to `owner`.
- The owner closes this issue with one comment saying which step, if any, needed a change to the list in Appendix F.1. (#248 and the other go-live steps are H1.)

**Critic check:** none.

**Find it:** `rg -n 'GOOGLE_CLIENT_ID|BETTER_AUTH_SECRET' .env.example` (hits once C1a has merged; 0 today)

**Hot files:** none.

---

### C3 · Learners sign in with Google only; the passcode is kept for the test tools alone
**Label:** `ready-for-agent` · **Depends on:** C2 · **Tier:** sonnet · **Size:** M

**Why:** Decision 4: "the passcode is removed for Learners and kept only for the test tools." After the owner has signed in with Google on production (C2), the passcode form is a second, weaker door. This ticket closes it.

**Change:**
- `PASSCODES` keeps only the tools pair. `passcodeList()` (`src/auth/passcode.ts:47`) returns only the entry named `TOOLS_NAME`; the old single-`PASSCODE` fallback to "owner" (`:50-52`) goes. `learnerFromCookie` therefore accepts `fa_access` for the tools Learner only.
- `POST /api/login` (`src/app/api/login/route.ts:16`) accepts only the tools passcode, answers the same `?wrong=1` for any other, and keeps its rate limit (`login-guard.ts`). It stays because the test tools (`src/dev/simulated-learner.ts:19`) and the e2e fixture sign in through it.
- The login page loses the "Use a passcode" link. Where Google is on, it shows "Continue with Google" and the not-on-the-list message only. **Where Google is off** (`VERCEL_ENV === "preview"`, or `GOOGLE_CLIENT_ID` unset, C1b step 4) it still renders the tools passcode form, so a preview or a fresh clone can sign in as the tools Learner. `POST /api/login` stays for the test tools.
- Copy: Home and the landing copy that says "passcode" now say Google (`rg -n -i passcode src/app/_landing src/app/login`); `GLOSSARY.md` **Learner** loses "passcode".
- Existing tests that expect a Learner passcode (search `rg -l 'PASSCODES' src --glob '*.test.*'`) are updated to the tools pair or to a Google-linked Learner.
- **Must NOT change:** the tools Learner, `freshToolsLearner`, the e2e fixture sign-in, Better Auth, the invites.

**Tests first (red → green, in this order):**
1. [S3] `src/auth/passcode.test.ts` (extend) · "only the tools pair is a passcode" · `passcodeList({PASSCODES:"owner:a,tools:b,asha:c"})` has the single key `tools`; `passcodeList({PASSCODE:"x"})` is empty.
2. [S2] `src/app/api/login/route.test.ts` (new) · "a Learner passcode no longer signs in" · posting the old owner passcode redirects to `/login?wrong=1` and sets no cookie; the tools passcode signs the tools Learner in; the sixth wrong try in 15 minutes is `locked`.
3. [S2] `src/auth/learners.test.ts` (new) · "an old owner cookie is refused" · `learnerFromCookie` for a validly signed cookie of Learner 1 returns `null` with `PASSCODES=tools:…`.
4. [S4] `src/app/login/page.test.tsx` (update) · "the form is gone where Google is on" · with `GOOGLE_CLIENT_ID` set and `VERCEL_ENV=production`: no `input[name="passcode"]`, no link "Use a passcode", and a button named "Continue with Google"; with `VERCEL_ENV=preview`: an `input[name="passcode"]` renders and no Google button.
5. [S1] `e2e/sign-in.spec.ts` (extend) · "no passcode door on the page" · with Google on (the test bed's fake client id, C1b), `/login` and `/login?passcode=1` both show no passcode field; the tools fixture still signs in by `POST`.
6. [S7] `src/auth/no-learner-passcode.test.ts` · "no code names a Learner passcode" · `rg` over `src` (tests and `src/dev` excluded) finds no `OWNER_NAME` use in `passcode.ts`'s list logic.

**Done when:**
- Tests above pass; `npm run check`, `npm run build`, `npm run ui:test` pass.
- On production (owner or a read-only check after merge): `/login` shows no passcode field; the owner is still signed in with Google.
- `docs/architecture.md` "Google sign-in" section gets a paragraph "The passcode now" (what stays: the tools pair, why). `GLOSSARY.md` updated. ADR 0011 gets its "Status: accepted, fully in force 2026-…" line.
- Screenshot of `/login` Light and Dark at 1512×982 attached.

**Critic check:** **Security** (pass bar: 0 confirmed high, critical or medium findings; focus: the tools door can sign in only the tools Learner, and rate limit still holds). **Beginner persona** reads the login screenshot and the Home copy (pass bar: median score 4/5 on "I know what to press").

**Find it:**
```bash
rg -n 'passcodeList|nameForPasscode' src --glob '!*.test.*'
rg -n 'PasscodeField' src/app --glob '!*.test.*'
rg -n -i 'passcode' src/app/_landing src/app/login --glob '!*.test.*'
rg -n 'OWNER_NAME' src --glob '!*.test.*'
```

**Hot files:** `src/auth/passcode.ts`, `src/app/api/login/route.ts`, `src/auth/login-guard.ts`, `src/proxy.ts`, `src/auth/learners.ts`, `src/app/login/page.tsx`, `src/app/login/passcode-field.tsx`, `src/app/_landing/copy.ts`, `GLOSSARY.md`, `docs/architecture.md`, `docs/adr/0011-*.md`.

---

### The no-sum rule (ADR 0009), shared by the D and E tickets

> **Shared rule for D and E (ADR 0009).** The Learner never types a number. Numbers may appear as **facts in a story** ("the Fed moved on 4 Feb 1994") or as **answer labels the Learner recognises** ("RBI cut 0.25 points: traders call it… 25 bps"). Picking the right label may need at most **one lingo step the Topic names** (points ↔ basis points). Anything more is a sum, and a sum is never asked.
>
> **One shared detector.** `src/teaching/no-sums.ts` (new, pure, no `@/` imports, so `scripts/check-course.mjs` can load it under plain Node) exports `sumAsk(text): string | null`. It returns the phrase that makes `text` ask for a sum, or null. Lint L10 (D1b), reply check V8 (D3a) and the story-recipe checks (E3) all call it. Nobody writes a second regex.

---

### D1a · Every question is a tap: Quick tries, quizzes, Reviews and drills are chosen, never typed
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "It's not about the math anymore … you should get the lingo, but you don't need the math … Don't ask math questions; it isn't a CA exam." Today two app screens make the Learner type a number:
- the Quick try box: `inputMode="decimal"` at `src/app/quick-try-view.tsx:94`;
- the typed quiz question: `src/app/quiz-panel.tsx:239-249`, test id `quiz-number`.

Three Widget parts also take typed numbers: Rate-move practice, StepThrough's "Your number" and the Slider's exact-value boxes. They are **D1c**, split out so each lane fits one context.

**Change:**
- **The shared detector** `sumAsk` in `src/teaching/no-sums.ts` (the no-sum rule above), with these patterns (case-insensitive; a match returns the phrase):
    1. **Calculate verbs:** `calculate | compute | work(ed|ing)? (it|this|that)? out | figure out | add up | multiply | divide | subtract`. `compute` does not count before `cost(s)|capacity|power|spend|agreement(s)|commitment(s)|deal(s)|budget`; the AI-compute nouns appear in `course/topics/ana-anthropic-s1.yaml:36,52,65`.
    2. **`how much` / `how many`**, but only in a sentence that also has a digit, a currency sign (₹ $ € £) or a unit word (basis points, bp, bps, points, percent, rupees, dollars, lakh, crore).
    3. **`what('s| is| was| would| will) … worth`**, within 60 characters.
    4. **Arithmetic between numbers:** `<number> (× | x | * | ÷ | / | + | − | times | plus | minus | divided by | multiplied by) <number>`. A bare `x` needs spaces on both sides.
    5. **Conversion asks:** `(what is | convert | turn) <number> … (in | into) (basis points | bps | points | percent | rupees | dollars)`.
    6. **Rounding asks:** `to <n> decimal places`.
    7. **Change asks:** `(percent change | growth rate | return | ratio | margin) … from … <number> … to … <number>`.
- **One choice engine** (new `src/teaching/choices.ts`, pure). `choicesFor(item, seed)` turns any number item into 2–4 answer choices. The same seed always gives the same order.
  - It takes the right answer plus each Known-mistake value: the fixed `mistakes[].answer` (`src/teaching/mark.ts:37`), or the template's mistake functions (`src/teaching/mistakes.ts:10-20`).
  - Each label is in the item's unit ("50 bp", "0.5 points", "₹2,420"), with an optional template `label:` pattern ("Up {value}").
  - Values equal to the answer or to each other are dropped.
  - It returns `null` when fewer than 2 distinct choices remain. Code then never shows that item, and L10 (D1b) fails it.
- **Marking.** A new `markChoice(item, choiceId)` in `src/teaching/mark.ts` returns `right`, `known_mistake {tag, fix}` or `wrong`, as `markAnswer` does today (`mark.ts:133`).
  - `markAnswer` stays for the lint's Draws rule only. No Learner path calls it with typed text.
- **Quick try** (`quick-try-view.tsx`).
  - `kind` becomes `"choice" | "truth"`. A new Topic-file `kind: choice` carries `choices: [{id, text, mistake?: {tag, fix}}]` and `answer: <id>`.
  - Remaining `kind: number` items are shown through `choicesFor`, so nothing breaks before D2a–D2j and E6a–E6c rewrite them.
  - The box and Check button go. The choices are buttons (`data-testid="quick-try-choice"`), and True/False stays.
  - A wrong tap shows its mix-up fix at once, in the coral accent (A4).
  - `/api/quick-try` (`src/app/api/quick-try/route.ts:11`) takes `{ key, input }` today; it becomes `{ key, choice }`, and `{ key, input }` answers 400.
  - `practice_answers.input` stores the picked label. Its doc already says "exactly as typed or picked" (`src/db/schema.ts:768`), so no migration is needed.
- **Quiz.** In `src/course/quiz.ts`, a drawn template slot is served with `choices` from `choicesFor(drawn, instanceId)`.
  - `PublicQuestion.kind: "number"`, `unit` and `decimals` go (`quiz.ts:32-40`), and so does `UNIT_WORDS` in `quiz-panel.tsx:22-30`.
  - `markAttempt` marks drawn slots with `markChoice` (`quiz.ts:183-201`). The mix-up fix already shows for choice questions (`quiz-panel.tsx:176-178`).
- **Review.** `review-panel.tsx` shows the picked wrong choice's mix-up fix in the result. Today it shows none: `rg -n 'mistake' src/app/review-panel.tsx` returns 0 hits.
- **Ladder** (`src/teaching/ladder.ts:9-12`). The Method ids stay, so stored `skill_state.methodsUsed` rows still parse. Their meaning changes:
  - `boxes` becomes **"a half-done choice"**: the first step is shown, and the last step is a tap.
  - `drill5` becomes **"a choice drill of five"**.
  - Update `METHOD_WORDS` (`src/tutor/ladder-moves.ts:18-24`) and `METHOD_NAMES` (`src/tutor/practice.ts:924`).
- **Docs, in the same PR:** GLOSSARY: Quick try, Known mistake, Question template (wording in ADR 0009's Consequences, Appendix I). `docs/architecture.md` sections "Topic files carry the teaching…" and "Quiz Check marked by code".
- **Not in D1a:** the Widget parts (D1c); lint L10, its allowlist and ADR 0009 (D1b).
- **Must not change:**
  - Check ids, question ids and `practice_answers` rows;
  - the pass rules;
  - the Draws rule's exactness (`markAnswer` stays exact);
  - Reviews' "practice only, never progress" rule.

**Tests first (red → green, in this order):**
1. `[S3]` `src/teaching/no-sums.test.ts` (new) · **sumAsk flags sums and passes story and lingo asks.** These 12 must match:
   - "How many basis points did the rate move?"
   - "Can you work out how much ₹2,000 grows to?"
   - "Calculate the new EMI."
   - "What is 0.25% in basis points?"
   - "So what's 3% of ₹10,000 worth?"
   - "If you add 50 bp to 6.5%, what rate do you get?"
   - "What would ₹1 lakh be worth after 10 years?"
   - "1.2 points times 100 is how many bp?"
   - "Compute the debt to equity ratio."
   - "Figure out the yearly growth."
   - "What's 6% minus 4%?"
   - "Give it to two decimal places."

   These 12 must return null:
   - "What does a basis point mean to you?"
   - "Which would you pick and why: 7% or 7.5%?"
   - "Why did the Fed move in February 1994?"
   - "What is the point of quoting moves in bps?"
   - "How many people lined up outside the bank?"
   - "WeWork said revenue was $1.8 billion. Sound like a lot?"
   - "Say it in your own words: what is a percentage point?"
   - "RBI cut by 0.25%. What do traders call that move?"
   - "Which headline gets the 1994 move right?"
   - "What happened to Satyam's cash, do you think?"
   - "Its compute costs fell. Why might that matter?"
   - "ETFs work out a NAV each day. What is a NAV?"
2. `[S3]` `src/teaching/choices.test.ts` (new) · **a fixed number item becomes its answer plus its Known-mistake values.** Item `pb-try-a1` (0.5 points; mistake 50, `forgot_to_convert`) gives exactly the labels {"0.5 points", "50 points"}, and the wrong one carries its fix.
3. `[S3]` same file · **a template draw makes 3 choices from its mistake functions.** A hand-built `pb-t-bp-from-move` draw with a = 3 and b = 3.5 gives {"50 bp" right, "0.5 bp" `stopped_at_points`, "5 bp" `used_x10`}. The same seed gives the same order twice.
4. `[S3]` same file · **duplicates drop, and fewer than 2 distinct choices give null.** A mistake equal to the answer is dropped. Two mistakes with the same value keep one. An item with no mistakes returns null.
5. `[S3]` `src/teaching/mark.test.ts` (changes) · **markChoice.** The right id gives `right`. A wrong id with a mistake gives `known_mistake` and that tag. A wrong id with none gives `wrong`. An unknown id gives `wrong`.
6. `[S2]` `src/tutor/practice-flow.test.ts` (changes) · **POST `/api/quick-try` with `{key, choice}` marks and stores the label; `{key, input: "50"}` answers 400.**
7. `[S2]` `src/learner/quiz-typed.test.ts`, renamed `quiz-template-choices.test.ts` · **a template slot is served with 2–4 choices and no `kind: "number"`, and picking the `stopped_at_points` choice returns its fix.**
8. `[S4]` `src/app/practice-items.test.tsx` and `src/app/quiz-panel.test.tsx` (change) · **no `input` with `inputMode="decimal"` renders, and no `quiz-number` or `quick-try-input` test id exists.** A tap on a wrong Quick try choice shows the fix text.
9. `[S4]` `src/app/review-panel.test.tsx` (changes) · **a wrong Review pick shows the choice's mix-up fix.**
10. `[S1]` `e2e/no-typing.spec.ts` (new, on T-00's bed) · **the fixture Learner at Percent's Your turn taps a wrong choice and sees the fix.** Across /study (Quick try, Check tab open, Review open), `input[inputmode=decimal], input[type=number]` counts 0. (D1c adds the `/dev/widgets` sweep to this file.)

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- `rg -n 'inputMode' src/app --glob '!*.test.*'` returns 0 hits (2 today).
- The `[D1a]` line in `e2e/targets.spec.ts` loses `test.fail` and passes.
- Screenshots: a Quick try with choices, and a wrong pick with its fix, in Light and Dark.
- The GLOSSARY entries and the `docs/architecture.md` sections above are updated.

**Critic check:**
- **Math police** on the Percent and Compounding Quick try and quiz screens: 0 typed inputs.
- **Affordance:** each choice reads as a button.

**Find it:**
```bash
rg -n 'inputMode' src --glob '!*.test.*'
rg -n 'kind: number|kind: truth' course/topics
rg -n 'export function markAnswer' src/teaching/mark.ts
rg -n 'kind: "number"' src/course/quiz.ts
rg -n 'boxes|drill5' src/teaching/ladder.ts
```

**Hot files:** `src/teaching/no-sums.ts` (new), `src/teaching/choices.ts` (new), `src/teaching/mark.ts`, `src/app/quick-try-view.tsx`, `src/app/quiz-panel.tsx`, `src/app/review-panel.tsx`, `src/course/quiz.ts`, `src/tutor/practice.ts`, `src/tutor/ladder-moves.ts`, `src/app/api/quick-try/route.ts`, `GLOSSARY.md`.

---

### D1c · Widgets never ask for a typed number: rate-move practice picks the right reading, StepThrough reveals, the Slider loses its typing boxes
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1a · **Tier:** sonnet · **Size:** S

**Why:** D1a made every question a tap, but three Widget parts still ask the Learner to type a number:
- Rate-move practice: "By how many basis points?" with an input at `src/widgets/primitives/wave2/rate-move.tsx:156-165`;
- StepThrough's "Your number" (`src/widgets/primitives/wave2/step-through.tsx:127-133`);
- the Slider's exact-value boxes (`src/widgets/library.tsx:172-176` and `:220-224`, added by #143).

The owner: "Don't ask math questions." Decision 3 is "no typed numbers anywhere".

**Change:**
- **Rate-move practice becomes "choose the right reading"** (`rate-move.tsx`, `rate-move-marking.ts:32`, recipe text `src/widgets/recipes/set-tutor.ts:33-39`). Build the choices with D1a's `choicesFor`.
  - The arrow and number line stay.
  - The question is "Which reading is right?", with three buttons: the right reading, the ×10 slip, and the "%" mix-up.
  - The worked lines follow the tap, as today.
- **StepThrough's ask** becomes a **Show the number** button (a tap to reveal, nothing typed).
- **The Slider's two exact-value boxes go.** The −/+ steppers, the arrow keys and the quick chips still reach every step.
- **Docs, in the same PR:** GLOSSARY: Rate-move Widget (wording in ADR 0009's Consequences, Appendix I). `docs/architecture.md` sections on the rate-move Widget and "Exact slider values".
- **Must not change:** the rate-move show mode, its three worked lines, or the recipe's id and params (`show` and `practice` stay valid modes).

**Tests first (red → green, in this order):**
1. `[S4]` `src/widgets/primitives/wave2/rate-move.test.tsx` and `rate-move-marking.test.ts` (change) · **practice 4% → 5% offers {"Up 1 point, or 100 bps" right, "Up 10 bps" `used_x10`, "Up 1%" `mixed_percent_points`}; 7.5% → 7.2% offers {"Down 0.3 points, or 30 bps", "Down 3 bps", "Down 0.3%"}.**
2. `[S4]` `src/widgets/slider.test.tsx`, `slider-focus.test.tsx` and `wave2/step-through.test.tsx` (change) · **no exact-value box, and StepThrough shows "Show the number", never "Your number".**
3. `[S1]` `e2e/no-typing.spec.ts` (extend D1a's file) · **across `/dev/widgets?fixture=` every part, `input[inputmode=decimal], input[type=number]` counts 0.**

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- `rg -n 'inputMode' src --glob '!*.test.*'` returns 0 hits (5 today: 2 in `src/app`, cleared by D1a, and 3 in `src/widgets`).
- `npm run widgets:freeze` is re-run if the frozen Widget snapshot changes, and the diff is only the removed boxes and the new buttons.
- Screenshots: rate-move practice before and after a tap, in Light and Dark.

**Critic check:**
- **Math police** on `/dev/widgets`: 0 typed inputs.
- **Affordance:** each reading reads as a button.

**Find it:**
```bash
rg -n 'inputMode' src/widgets --glob '!*.test.*'
rg -n 'z.enum\(\["show", "practice"\]\)' src/widgets/recipes/set-tutor.ts
rg -n 'Your number' src/widgets/primitives/wave2/step-through.tsx
rg -n 'exact value|type a value' src/widgets/library.tsx
```

**Hot files:** `src/widgets/library.tsx`, `src/widgets/primitives/wave2/rate-move.tsx`, `rate-move-marking.ts`, `step-through.tsx`, `src/widgets/recipes/set-tutor.ts`, `GLOSSARY.md`.

---

### D1b · A lint fails any Topic file that asks for a typed number or a sum, with a list of not-yet-rewritten Topics that can only shrink
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1a · **Tier:** sonnet · **Size:** S

**Why:** D1a made every question a tap in the app, but 68 Topic files still have stems that ask for a sum ("How many basis points…?", inventory §1a). Decision 3 is "no typed numbers anywhere": a lint makes it hold for every future edit, and its allowlist drives the D2 and E6 batches (goal loop G3).

**Change:**
- **Lint L10** (`src/course/lesson-lint.ts`, run from `scripts/check-course.mjs:29` beside the existing call). It runs on **all** Topics, as L6 does (`lesson-lint.ts:156`). It fails on:
  - any Quick try with `kind: number`;
  - any template whose 20 seeded draws do not each give ≥ 2 distinct choices;
  - any stem where `sumAsk` matches. Stems are question `prompt`, Quick try `ask`, template `ask` and conversation Check `prompt`.
- **The L10 allowlist.** A new file, `src/course/l10-allowlist.ts`, exports `L10_NOT_YET_STORY: readonly string[]`, one id per line and sorted, so batch PRs merge cleanly.
  - It "only shrinks", with the same three `List:` errors as `lesson-lint.ts:148-154`: an id that is not a Topic, an allowlisted Topic that is now clean ("remove it"), and an unlisted Topic with hits.
  - D1b fills it from its own lint run. Expect about 68 ids: the 68 Topics with a sum-stem hit in inventory §1a.
  - Error text: `L10: Quick try "pb-try-a1" is typed (kind: number): make it kind: choice (ADR 0009) (Topic "num-percent-bps")`.
- **Docs:** ADR 0009 (Appendix I), status accepted. GLOSSARY **Lesson lint** adds L10. `docs/architecture.md` "Lesson lint": one paragraph on L10 and its allowlist.
- **Must not change:** any Topic file (the batches rewrite them), L1–L9.

**Tests first (red → green, in this order):**
1. `[S7]` `src/course/lesson-lint.test.ts` (changes) · **L10.** A fixture with `kind: number` fails with the text above. A calculate stem fails. An allowlisted Topic is skipped. An allowlisted clean Topic fails with "remove it". An id that is not a Topic fails.
2. `[S7]` `npm run course:check` · "the real course passes with the allowlist" · exits 0; `L10_NOT_YET_STORY` is sorted and every id in it is a Topic with at least one L10 hit.

**Done when:**
- `npm run check` and `npm run build` pass.
- `L10_NOT_YET_STORY` exists, is sorted, holds about 68 ids, and `course:check` is green with it.
- ADR 0009, the GLOSSARY entry and the architecture paragraph are written.

**Critic check:** **Math police** (§8.5) on 5 Topics the allowlist leaves out: 0 sums the lint missed. A miss becomes a new `sumAsk` pattern in this PR.

**Find it:**
```bash
rg -n 'LESSON_NOT_YET_CONVERTED' src/course/lesson-lint.ts
rg -n 'lessonLintErrors' scripts/check-course.mjs
```

**Hot files:** `src/course/lesson-lint.ts`, `scripts/check-course.mjs`, `src/course/l10-allowlist.ts` (new), `docs/adr/0009-*.md`, `GLOSSARY.md`.

---

### D3a · Every Tutor reply ends with 2–3 tap-to-answer Choices, and no reply may ask for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1a, E1 · **Tier:** opus · **Size:** M

**Why:** The owner: "The agent should be more proactive. Every time it says something there should be some liveliness." Under the latest reply the only chips are Next plus "Go deeper." and "Show me in a widget." (`src/tutor/chips.ts:14`, drawn in `src/app/workspace-parts.tsx:115-129`). Nothing stops a reply asking for a sum: the Tutor's own worked example asks "Box 2: 0.4 times 100 is how many basis points?" (`src/tutor/instructions.ts:67`).

**Change:**
- **V8, no sum asked** (`src/tutor/reply-checks.ts`).
  - Add `"V8"` to the union at `:63`.
  - In `checkReply` (`:251`), run `sumAsk` on every prose line that ends in "?" and on the ask line. Statement lines are not checked, so "1 point times 100 is 100 bp." stays allowed.
  - The message is: `Your reply asks the Learner to work out a sum ("<phrase>"). Ask what it means, what someone in the story did, or which choice is right; never for a number.`
  - It costs one retry, like V2. If the retry still fails, the fallback (`src/tutor/reply-gate.ts`) drops the flagged lines, and the Choices carry the next move.
- **Choices.**
  - **Picker.** New `src/tutor/choices.ts`, pure: `choicesFor(step, suggestion, lastPressed)` returns 2–3 `{ label, says, emoji }`.
  - **Code's set** (label · says · emoji):
    - What happened next? · "What happened next?" · `scroll`
    - Show me · "Show me." · `eyes`
    - What does that word mean? · "What does that word mean?" · `thinking-face`
    - How does this touch my life? · "How does this touch my life?" · `money-with-wings`
    - Quiz me · "Quiz me." · `direct-hit`
    - Go deeper · `GO_DEEPER` ("Go deeper.") · `magnifying-glass-tilted-left`
  - **Per step:**
    - story: next, word, life
    - concept: show, word, deeper
    - explore: show, word, deeper
    - your_turn: quiz, show, word
    - check: word, show, deeper (never Quiz me while a quiz is open)
    - reveal: next, life, deeper
    - principle: life, quiz, deeper
  - **Order:** the Tutor's valid suggestion first, then the step's set in order, skipping the one pressed last turn, capped at 3. Every set has 3 entries, so there are always ≥ 2.
  - **A valid suggestion** is ≤ 6 words, has no emoji, has `sumAsk` null, and is not a copy of a set label. Its emoji is the registry's best keyword match, else `speech-balloon`.
- **The `suggest_choice` tool** (`src/tutor/tools.ts`, `instructions.ts` TUTOR_TOOLS) is optional, because forcing a tool call is refused on Opus 5.5 (ADR 0008).
  - It takes `{ label }` and answers "Noted.". A bad label is silently dropped, and the drop is recorded in the turn's usage.
  - It is frozen into new Sessions only (ADR 0005's one-way rule).
- **Storage.** After the checked reply (or the fallback), save a session item of the new kind `reply_choices` with `{ choices: [{label, says, emoji}] }`, through `saveItemAfterLatest`. No migration is needed.
- **Pressing a Choice** posts `{ choice: <index> }` in the turn body. The server resolves `says` from the stored item, so the turn is a chip turn (`turn-status.ts:92`) and is never an Insight attempt.
- **UI.** `Chips` (`workspace-parts.tsx:99-130`) keeps the Next chip. HELP_CHIPS are replaced by the Choices: each is a raised secondary Button (A3a) with `<Emoji name size={20} />` (decorative, `alt=""`) before the label.
  - "Show me in a widget." moves to `OLD_CHIP_MESSAGES` (`chips.ts:20`), so old Sessions still read it as a chip.
  - Typing stays open.
- **One instruction line** in `tutorRules` (`instructions.ts:106-163`): "Code puts two or three Choices under every reply. You may suggest one with suggest_choice: a follow-up the Learner might tap, in 6 words or fewer. Never write Choices or a menu in your reply." The voice rewrite is D3b's.
- **Docs:** ADR 0010 (Appendix I), status accepted; E4a later adds the V4 consequence. GLOSSARY: new **Choice** entry. `docs/architecture.md` "Help chips…" becomes "Choices under every reply".
- **Must not change:**
  - the word caps (80/120, `reply-checks.ts:68-81`);
  - V1–V7;
  - emoji stripped from reply text (`:202-220`);
  - the as-of rule;
  - the "never buy/sell" rule;
  - the Next chip.

**Tests first (red → green, in this order):**
1. `[S3]` `src/tutor/reply-checks.test.ts` (changes) · **V8 runs `sumAsk` on asks only.** D1a's 12 positive stems used as the ask each give exactly one V8. The 12 negatives give none. The statement "1 point times 100 is 100 bp." (not a question) gives none. A reply with V8 and V2 lists both.
2. `[S3]` `src/tutor/reply-gate.test.ts` (changes) · **after a failed V8 retry the fallback has no ask line.**
3. `[S3]` `src/tutor/choices.test.ts` (new) · **the picker.**
   - story, no suggestion → [next, word, life];
   - concept + "Who were the traders?" → [that, show, word];
   - suggestion "Work out the EMI" → dropped;
   - a 9-word suggestion → dropped;
   - lastPressed = show at concept → [word, deeper];
   - check never contains "Quiz me".
4. `[S2]` `src/tutor/choices-turn.test.ts` (new, PGlite + scripted client) · **storing and pressing Choices.**
   - A scripted reply that calls `suggest_choice("Who were the traders?")` stores `reply_choices` with 3 entries, that label first.
   - A reply without the call stores the 3 step choices.
   - `{choice: 0}` runs a chip turn whose Learner message is the stored `says`.
   - At explore, `{choice: 0}` makes no `insight_attempts` row.
5. `[S4]` `src/app/chips-pending.test.tsx` (changes) · **2–3 Choice buttons, each with a decorative `<img alt="">`, and no "Show me in a widget" button.**
6. `[S1]` `e2e/choices.spec.ts` (new) · **after each of 5 scripted replies 2–3 Choices show; at the concept step one of them is "What does that word mean?" (`id: word`); tapping it posts it; the message box still sends typed text.**

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- Screenshots: Choices under a story reply and under a Check reply, Light and Dark.
- ADR 0010, the Choice entry and the architecture section are written.

**Critic check:** **Affordance** on the two screenshots (each Choice reads as a button; bar ≥ 4/5). **Math police** on the V8 fixtures of test 1 (0 sums slip through).

**Find it:**
```bash
rg -n 'Box 2' src/tutor/instructions.ts
rg -n 'rule: "V1" \| "V2"' src/tutor/reply-checks.ts
rg -n 'HELP_CHIPS' src/tutor/chips.ts src/app/workspace-parts.tsx
rg -n 'OLD_CHIP_MESSAGES' src/tutor/chips.ts
```

**Hot files:** `src/tutor/reply-checks.ts`, `src/tutor/reply-gate.ts`, `src/tutor/choices.ts` (new), `src/tutor/tools.ts`, `src/tutor/chips.ts`, `src/tutor/instructions.ts` (one line), `src/app/workspace-parts.tsx`, `src/app/left-column.tsx`, `docs/adr/0010-*.md`, `GLOSSARY.md`.

---

### D3b · The Tutor tells stories in a warm voice, teaches the word first, and never asks for a number
**Label:** `ready-for-agent` · **Depends on:** wave 0, D3a · **Tier:** opus · **Size:** M

**Why:** The owner: "It should be based on stories. The agent should be more proactive. Every time it says something there should be some liveliness." Today the Tutor's rules make it flat:
- "No hype and no role-play. Be calm, precise and plain-spoken." (`src/tutor/instructions.ts:112`)
- "No apology paragraph and no cheering." (`:126`)
- "Praise in one to three words, or not at all" (`:131`)
- "Never ask what a bond trader, a newspaper or anyone else would say: ask about the numbers in front of the Learner." (`:113`)


**Change:**
- **Voice.** In `tutorRules` (`instructions.ts:106-163`), replace these lines.
  - **`:112`** becomes: "Tell it as a story. Open an idea with a short scene from the Case: a person, a place, a date and what was at stake ("February 1994. Bond traders in New York are about to get a surprise."). Be warm, curious and a little playful, never silly. No hype words, and no made-up people, events or figures: the cast and facts come from the Case, its Case Data and the scenes code gives you."
  - **`:113`, last sentence** becomes: "Ask what the words mean, what people in the story did or would do, and which choice is right; never ask the Learner to work out a number."
  - **`:120`** ("then a full question") becomes: "…then a choice question about the story or the word."
  - **`:122`** becomes: "The methods, in order, are restate the rule, a worked example, a half-done choice, the Widget and a choice drill." Delete the two sentences about boxes.
  - **`:125`.** "Ask me a question" gets one choice question in words. "Show me in a widget" becomes "Show me".
  - **`:126`** becomes: "No apology paragraph; one warm line is fine, a pep talk is not."
  - **`:131`** becomes: "Praise the specific thing the Learner got right, in one short sentence ("Yes: 25 bps is exactly how a trader says it."); never "Great question", "Certainly" or "Absolutely"." Keep "No headings, emoji or decorative arrows" (V3 stays).
  - **New line, lingo:** "Explain each finance word the first time with its everyday meaning, then once how pros say it ("traders call that 25 bps")."
  - **`:151-152` (short sums).** Keep them, and add: "say a sum as a fact; never ask for one."
  - **Rewrite** `TUTOR_EXAMPLES` entries that ask for a sum (the boxes example at `:65-67`).
  - **In `ENGINE_WIDGETS` (`:372-383`):**
    - the quiz-me line becomes: "point to the next Quick try, or show choice_cards with one story or lingo question";
    - the rate_move practice line becomes: "it asks the Learner to pick the right reading".
- **Live evals** (`src/behaviour/tutor-eval/cases/`). Add T12–T16, plus new condition kinds `noSum` (uses `sumAsk`) and `choicesStored` (the turn stored a `reply_choices` item with 2–3 entries) in `case.ts`.
  - Add a case kind `dialogue`: `messages: string[]`, run in order, with conditions applied to every reply and `runs: 1`.
  - Rewrite T3 for choices: its message becomes the picked label "0.3 bp", and its grader line "fill-in boxes" becomes "a half-done choice".

  | Case | Topic, step | Message | Pass |
  |---|---|---|---|
  | T12 story-first opener | num-probability, story (opener, no message) | — | `maxWords 120`, `noSum`; grader: opens with a scene (a role or name, a place, a date, the stakes); gives no outcome after 1998-08-01 |
  | T13 no sum in 20 turns | num-percent-bps, your_turn then check | the 20 persona lines of Appendix D.1 for Percent and Compounding, in order | `noSum` on all 20 replies (`dialogue`, 1 run) |
  | T14 Choices present | num-compounding, concept | "ok and?" | `choicesStored`; grader: the reply text holds no menu of options |
  | T15 warm voice | num-percent-bps, your_turn | "honestly I'm so bad at maths lol" | `noSum`, `maxWords 80`; grader: warm and playful, no hype words, praise (if any) is specific, no pep talk |
  | T16 lingo on first use | num-percent-bps, story | "what even is a basis point lol" | `noSum`; grader: plain meaning in the same sentence as the term, one "how pros say it" line, no conversion asked |
- **Docs:** `docs/architecture.md` "Live Tutor tests" (T12–T16). GLOSSARY: **Reply kind** (fill-in boxes becomes a half-done choice); **Parked Skill** ("drill of five" becomes "choice drill of five").
- **Must not change:** the word caps (80/120, `reply-checks.ts:68-81`), V1–V8, the as-of rule, the "never buy/sell" rule, the Choices (D3a).

**Tests first (red → green, in this order):**
1. `[S3]` `src/tutor/instructions.test.ts` (new) · **the frozen text has none of "No hype", "no cheering", "Praise in one to three words", "fill-in boxes" or "Box 2", and has "Tell it as a story".**
2. `[S5]` `npm run tutor:eval` with `TUTOR_EVAL_BUDGET_USD=8` · **T12–T16 as in the table; T1–T11 keep their current pass bars.** At most 2 runs (the ledger in §9.4).

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- `tutor:eval`: T12, T14, T15 and T16 pass in ≥ 2 of 3 runs each; T13 has 0 sums in 20 replies; each run spends ≤ $8, and there are at most 2 runs.
- `rg -n 'No hype|no cheering|Praise in one' src/tutor/instructions.ts` returns 0 hits (3 today).
- The docs above are updated.

**Critic check:**
- **Beginner persona** on T12–T16 transcripts: median fun ≥ 4/5, and "felt like an exam" = no.
- **Math police** on the T13 transcript: 0.

**Find it:**
```bash
rg -n 'No hype|no cheering|Praise in one' src/tutor/instructions.ts
rg -n 'Never ask what a bond trader' src/tutor/instructions.ts
rg -n 'Box 2' src/tutor/instructions.ts
rg -n 'fill-in boxes' src/behaviour/tutor-eval/cases/T3.json
ls src/behaviour/tutor-eval/cases
```

**Hot files:** `src/tutor/instructions.ts`, `src/behaviour/tutor-eval/cases/*`, `src/behaviour/tutor-eval/case.ts`, `GLOSSARY.md`.

---

### E1 · Emoji look the same on every device: a vendored Fluent Emoji 3D kit
**Label:** `ready-for-agent` · **Depends on:** wave 0 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "I want emojis, something realistic that comes to life." Widget parts today have no images, only 16 flat SVG icons (`ICON_NAMES` in `src/widgets/primitives/wave1/index.ts`, drawn by `icon-grid.tsx`). System emoji differ between macOS, Windows and Android, and reply text strips them (`reply-checks.ts:202-220`). The owner chose Microsoft Fluent Emoji 3D (MIT), vendored so every device sees the same picture.

**Change:**
- **A vendor script, `scripts/vendor-emoji.mjs`** (a dev tool; not run in the build). It:
  - reads `src/emoji/subset.json` (`[{ name, folder }]`);
  - fetches `assets/<folder>/3D/<file>_3d.png` from github.com/microsoft/fluentui-emoji at **one pinned commit SHA**;
  - converts each with `cwebp -q 80 -alpha_q 100 -resize 160 160` (ffmpeg as the fallback; no npm image dependency);
  - writes `public/emoji/<unicode>.webp`.
  - People use the `Default` tone folder only.
  - The script fails on a missing folder.
- **Licence:**
  - `public/emoji/LICENSE-fluent-emoji.txt` holds the full MIT text with "Copyright (c) Microsoft Corporation."
  - `public/emoji/SOURCES.md` lists each file's name, unicode, upstream path and the commit SHA.
  - The credit line "Emoji artwork: Fluent Emoji by Microsoft, MIT License, https://github.com/microsoft/fluentui-emoji" goes at the foot of the Settings page (`settings-view.tsx`, under Start over); A5 keeps it there.
- **The registry, `src/emoji/registry.ts`** (pure, no `@/` imports, so `check-course.mjs` can load it).
  - It exports `EMOJI` as `const`: kebab-case `name → { unicode, file, alt, keywords[] }`.
  - It also exports `EMOJI_NAMES`, the type `EmojiName`, and `emojiFor(keyword)`, the best match by keyword.
  - `alt` is 1–4 plain words ("money bag").
- **The component, `src/emoji/emoji.tsx`:** `<Emoji name size label? />`.
  - `size` is 16 | 20 | 24 | 32 | 48 | 64 | 80.
  - It renders `<img src="/emoji/<unicode>.webp" width height loading="lazy" decoding="async" draggable={false}>`.
  - **Decorative** (no `label`): `alt=""` and `aria-hidden`. **Meaningful** (`label` given, or `label` true for the registry alt): `alt=<label>`.
  - An unknown name is a type error. At runtime it renders nothing and logs one `console.warn`.
- **Lint L11** (`lesson-lint.ts`, run from `check-course.mjs`). Every emoji name in a Topic file (`scenes:`, `terms[].emoji`, `runningExample.scene`) and in recipe examples and Widget fixtures exists in the registry. Error: `L11: emoji "pizza-slice" is not in src/emoji/registry.ts (Topic "fs-income")`.
- **The subset (target 150; between 140 and 180 passes)**, kebab names of Fluent folders:
  - **People, Default tone (24):** person, man, woman, older-person, old-man, old-woman, office-worker, man-office-worker, woman-office-worker, technologist, judge, police-officer, detective, guard, farmer, cook, factory-worker, construction-worker, scientist, teacher, student, person-raising-hand, person-shrugging, person-facepalming.
  - **Faces (20):** grinning-face, slightly-smiling-face, smiling-face-with-sunglasses, thinking-face, face-with-monocle, nerd-face, star-struck, money-mouth-face, partying-face, exploding-head, face-screaming-in-fear, anxious-face-with-sweat, worried-face, astonished-face, hushed-face, face-with-rolling-eyes, shushing-face, zipper-mouth-face, neutral-face, yawning-face.
  - **Animals (8):** ox, bear, turtle, snail, rabbit-face, shark, owl, unicorn.
  - **Money and markets (22):** money-bag, coin, dollar-banknote, euro-banknote, pound-banknote, yen-banknote, money-with-wings, credit-card, receipt, bank, chart-increasing, chart-decreasing, chart-increasing-with-yen, bar-chart, ledger, notebook, scroll, gem-stone, balance-scale, briefcase, identification-card, label.
  - **Places (15):** classical-building, office-building, house, houses, derelict-house, factory, department-store, convenience-store, building-construction, stadium, cityscape, globe-showing-americas, globe-showing-asia-australia, globe-showing-europe-africa, world-map.
  - **Story things (50):** newspaper, rolled-up-newspaper, megaphone, loudspeaker, telephone-receiver, mobile-phone, laptop, envelope, memo, clipboard, calendar, spiral-calendar, tear-off-calendar, hourglass-done, hourglass-not-done, alarm-clock, stopwatch, key, old-key, locked, unlocked, package, delivery-truck, shopping-cart, shopping-bags, ticket, light-bulb, magnifying-glass-tilted-left, eyes, direct-hit, game-die, slot-machine, trophy, party-popper, wrapped-gift, rocket, airplane, ship, fuel-pump, oil-drum, hammer-and-wrench, gear, battery, low-battery, link, chains, puzzle-piece, bomb, fire, hot-beverage.
  - **Weather and growth (10):** droplet, snowflake, umbrella-with-rain-drops, cloud-with-lightning, tornado, sun, rainbow, seedling, deciduous-tree, hatching-chick.
  - **Symbols (12):** warning, no-entry, stop-sign, check-mark-button, cross-mark, red-question-mark, red-exclamation-mark, high-voltage, sparkles, speech-balloon, thought-balloon, crown.
  - **Left out on purpose:** flags (may be missing upstream), skin-tone variants, `crystal-ball` (reads as forecasting, which the Tutor never does), and the Clippy and Windows-logo images (docs.md §5).
- **Docs:**
  - `docs/architecture.md`: a new section, "Emoji kit (`public/emoji/`, `src/emoji/`)", covering what it does, a scenario (a LingoCard shows 💰 as the same 3D money bag on Windows and Mac) and the trade-off (about 0.6 MB of static files against a runtime font or a CDN).
  - GLOSSARY "Lesson lint" adds L11.

**Tests first (red → green):**
1. `[S3]` `src/emoji/registry.test.ts` (new) · **the registry matches the files and the size budget.**
   - Names are unique kebab-case, and there are 140–180 of them.
   - Every `file` exists in `public/emoji/` and starts with the WebP `RIFF…WEBP` header.
   - The width and height read from the VP8/VP8L/VP8X header are 160 × 160.
   - Each file is ≤ 12,288 bytes, and the total is ≤ 1,600,000 bytes.
   - `alt` is 1–40 characters.
   - The LICENSE file contains "Copyright (c) Microsoft Corporation", and SOURCES.md lists every file.
2. `[S4]` `src/emoji/emoji.test.tsx` (new) · **decorative and meaningful renders.**
   - `<Emoji name="money-bag" size={48}/>` renders `img[alt=""][aria-hidden=true][width="48"]`.
   - With `label="a bag of money"` it renders `alt="a bag of money"` and no aria-hidden.
   - An unknown name (cast) renders nothing and warns once.
3. `[S7]` `src/course/lesson-lint.test.ts` (changes) · **L11.** A fixture Topic with `emoji: pizza-slice` fails with the text above, and `money-bag` passes.

**Done when:**
- `npm run check` and `npm run build` pass.
- `du -sh public/emoji` is ≤ 1.7 MB.
- `/dev/widgets` (or a new `/dev/emoji` page, dev only) shows the whole subset in Light and Dark. A screenshot is attached.
- The credit line is visible in Settings.
- The architecture section and the glossary are updated.

**Critic check:** **Colour and liveliness**: a 20-emoji contact sheet on both themes, with no emoji unreadable on Dark (no dark-on-dark outline loss). Affordance: not applicable.

**Find it:**
```bash
rg -n 'ICON_NAMES' src/widgets/primitives/wave1/index.ts
rg -n 'EMOJI' src/tutor/reply-checks.ts
rg -n 'lessonLintErrors' scripts/check-course.mjs
ls public
```

**Hot files:**
- `src/course/lesson-lint.ts` and `scripts/check-course.mjs` (also D1b);
- `src/app/settings/settings-view.tsx` (also A4, A5, B3b);
- `docs/architecture.md`.

---

### E2a · Widgets come alive: five story parts with emoji and motion (StoryScene, LingoCard, TimelineStrip, TwoPaths, MoneyJar)
**Label:** `ready-for-agent` · **Depends on:** wave 0, E1, A4 · **Tier:** sonnet · **Size:** M

**Why:** The owner: "The widgets have to be comprehensible, lively, not just bars and charts … Whenever it generates the generative UI it's just pure math, not fun enough; it lacks novelty." Today's parts are sliders, charts, calculators and number tiles (`src/widgets/library.tsx:1004-1073`, `WAVE1_PARTS` and `WAVE2_PARTS`).

**Change:**
- **A new folder, `src/widgets/primitives/wave3/`**, exporting `WAVE3_PARTS`. It is registered in `library.tsx` beside `WAVE1_PARTS` and `WAVE2_PARTS` (`:34-35`, `:802`) in a new group, "Story", in `WIDGET_COMPONENT_GROUPS`.
  - Each part's prop order is fixed forever, as for wave 2 (`wave2/index.ts:1`).
  - Run `npm run widgets:freeze`. This updates `frozen.generated.json`, which `src/widgets/widgets.test.ts:25-35` checks, and is expected. New Sessions get the new parts; frozen Sessions keep theirs (ADR 0005).
- **Rules for every part:**
  - **Colours:** theme tokens and A4's four accents only (mint = you and gains, coral = losses and warnings, sunflower = history and stories, violet = lingo). No hex in wave3 files.
  - **Images:** emoji come only through `<Emoji>` (E1).
  - **Motion:** CSS or WAAPI on `transform` and `opacity` only. Feedback takes 100–150 ms, entrances 200–300 ms, nothing over 400 ms.
  - **Reduced motion:** under `prefers-reduced-motion: reduce` (`usePrefersReducedMotion`, `wave1/motion.ts:9`) there is no movement, and the part sets `data-motion="off"`.
  - **Keyboard:** every control is the app's `Button` (A3a), reachable by Tab, with a visible focus ring. Strips use roving focus with ←/→.
  - **No maths:** no part asks the Learner for a number, and no part shows a computed result as the point.
  - **Size:** each part fits the panel at 360, 480, 560, 720 and 860 px with no overflow (E5 adds the last two widths).
- **The parts in this ticket:**

  | Part | Props (in order) | What the Learner sees and does |
  |---|---|---|
  | **StoryScene** | `cast[]` (1–4: `{id, emoji, name ≤ 3 words, role?}`), `beats[]` (2–5: `{who: castId \| "narrator", says ≤ 16 words, emoji?}`), `caption?` ≤ 14 words, `date?` (ISO) | A stage with the cast at 64 px (80 px at ≥ 720 px) and a sunflower date stamp ("3 Feb 1994"). The speaker's bubble shows one beat. **Next beat ›**, a tap on the stage or → moves on, and ← goes back; the last beat shows **Replay**. The bubble slides up 8 px and fades in over 200 ms, and the speaker bounces to scale 1.08 over 240 ms. The bubble is `aria-live="polite"`. |
  | **LingoCard** | `term`, `pro` (≤ 14 words, "say it like a pro"), `means` (≤ 20 words), `example` (≤ 20 words), `emoji`, `inStory?` (≤ 20 words) | The term in violet, then "Say it like a pro: …", the plain meaning, and an everyday example with its emoji. **In the story** flips the card (rotateY over 300 ms) to `inStory`; `aria-pressed` follows. |
  | **TimelineStrip** | `beats[]` (2–7: `{date, label ≤ 8 words, emoji}`), `hideAfter?` (ISO) | Emoji markers on a line, oldest on the left. A tap or Enter on a marker opens its label. Beats dated after `hideAfter` draw as a locked "?" marker labelled "After the story's date". |
  | **TwoPaths** | `question` ≤ 20 words, `left`, `right` (each `{emoji, name, choice ≤ 10 words, outcome: emoji[1–6], outcomeLine ≤ 14 words}`) | Two characters, two choices. **See what happened** under each reveals its outcome as a row of objects (🏠🏠 against 🏠), never numbers. `outcomeLine` has no digits. |
  | **MoneyJar** | `label`, `start` (0–20), `end` (0–20), `unit` (emoji: coin, dollar-banknote and so on), `each?` (≤ 6 words, e.g. "each coin is ₹1 lakh"), `words` (≤ 12 words) | A jar that fills or drains one object at a time (40 ms each, ≤ 400 ms in all), with the size in words ("about twice as full"). It shows no numerals, except inside `each`. |

- **Fixtures:** one `.openui` per part in `src/widgets/fixtures/parts/` (17 exist today), so `/dev/widgets` draws each one.
- **Docs:** `docs/architecture.md`, section "Widgets": add a "Story parts (wave 3)" subsection, with what each part teaches, one scenario, and the trade-off (more parts for the Tutor to choose from, versus a longer frozen catalogue).
- **Not in E2a:** WhoPaysWhom, MythOrFact, Headline and ChoiceCards (E2b).

**Tests first (red → green, in this order):**
1. `[S4]` `src/widgets/primitives/wave3/parts.test.tsx` (new, happy-dom) · **each part's behaviour:**
   - **StoryScene** (3 beats): beat 1 shows; Next beat gives beat 2; → gives beat 3; the last shows Replay.
   - **LingoCard:** the flip toggles `aria-pressed`, and the `inStory` text shows.
   - **TimelineStrip:** with `hideAfter` 1994-02-03, a 1994-05-09 beat renders as locked with no label text.
   - **TwoPaths:** the outcome is hidden until its button is pressed.
   - **MoneyJar** (start 3, end 6, unit coin): renders 6 coin images, and `textContent` without `each` matches `/\d/` 0 times.
2. `[S4]` same file · **reduced motion.** With `matchMedia` mocked to reduce, each of the five parts has `data-motion="off"` and starts no `element.animate` call (spy).
3. `[S4]` same file · **keyboard.** Each part's controls are buttons reachable by Tab. StoryScene and TimelineStrip move with ←/→.
4. `[S7]` `src/widgets/primitives/wave3/tokens.test.ts` (new) · **no `#hex`, `rgb(` or `hsl(` literals in wave3 sources.**
5. `[S3]` `src/widgets/widgets.test.ts` (changes) · **the frozen library includes the five parts (regenerated with FREEZE=1).**
6. `[S1]` `e2e/story-parts.spec.ts` (new) · **for each E2a fixture at 560 and 860 px:**
   - no horizontal overflow;
   - every control is ≥ 28 px and has `cursor: pointer`;
   - with `reducedMotion: "reduce"`, `document.getAnimations().length === 0` after a click.
7. `[S1]` same file · **motion plays when allowed** · with `reducedMotion: "no-preference"` (T-00 defaults to reduce, so override it), after StoryScene mounts `document.getAnimations().length` ≥ 1.

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- Screenshots of the five parts in Light and Dark at 860 px are attached.
- The architecture subsection is written.

**Critic check:**
- **Colour and liveliness** on the five screenshots: ≥ 4/5 lively on each, with accents used for their meaning.
- **Affordance:** every pressable element reads as a button, and the static parts (date stamp, masthead) do not.
- **Widget fit** (Appendix D.2.3) on the fixtures: each one is understandable on its own.

**Find it:**
```bash
rg -n 'WAVE2_PARTS' src/widgets
rg -n 'export function usePrefersReducedMotion' src/widgets/primitives/wave1/motion.ts
rg -n 'widgets:freeze' package.json
ls src/widgets/fixtures/parts
```

**Hot files:** `src/widgets/primitives/wave3/*` (new), `src/widgets/library.tsx`, `src/widgets/frozen.generated.json`, `src/widgets/fixtures/parts/*`, `src/app/globals.css` (keyframes).

---

### E2b · Four more story parts: who pays whom, myth or fact, a period headline, and tap-to-choose cards
**Label:** `ready-for-agent` · **Depends on:** wave 0, E2a · **Tier:** sonnet · **Size:** M

**Why:** E2a built the stage, the motion rules and the first five parts. These four carry the ideas a story alone cannot: money flowing between people, a myth to bust, the day's front page, and a quick tap-to-choose check that counts toward nothing.

**Change:**
- Add to `src/widgets/primitives/wave3/` and `WAVE3_PARTS`, after E2a's five (prop order is fixed forever). Run `npm run widgets:freeze`. The rules for every part are E2a's, unchanged.
- **The parts in this ticket:**

  | Part | Props (in order) | What the Learner sees and does |
  |---|---|---|
  | **WhoPaysWhom** | `actors[]` (2–4: `{id, emoji, name}`), `flows[]` (1–4: `{from, to, what ≤ 6 words, emoji}`) | The actors in a row or circle. Each flow draws an arrow (stroke-dashoffset, 300 ms) with its emoji riding along it; a tap on a flow replays it. Under the drawing, a visible ordered list ("The bank pays the saver: interest") is the screen-reader text. |
  | **MythOrFact** | `cards[]` (2–4: `{claim ≤ 16 words, isFact, why ≤ 20 words, emoji?}`) | Each card has **Myth** and **Fact** buttons. A tap flips it to the verdict (mint if right, coral if wrong) and the `why`. Picks are kept in Widget state. Practice only. |
  | **Headline** | `paper` ≤ 4 words, `date` (ISO), `headline` ≤ 12 words, `deck?` ≤ 20 words, `source` (URL) | A period front page: a serif masthead, a date line, the headline and deck, a sunflower rule, and "Source" linking to `source`. Nothing to press but the link. |
  | **ChoiceCards** | `question` ≤ 25 words, `choices[]` (2–4: `{id, text ≤ 10 words, emoji?, fix? ≤ 20 words}`), `answer` | Tap to choose. Right gives mint and "Yes", with a 150 ms pop. Wrong shows the `fix` in coral (`role="status"`), and the Learner may pick again. It is marked in the browser, counts toward nothing, and is kept in Widget state. |

- One `.openui` fixture per part in `src/widgets/fixtures/parts/`.
- **Docs:** extend the "Story parts (wave 3)" subsection of `docs/architecture.md`.

**Tests first (red → green, in this order):**
1. `[S4]` `src/widgets/primitives/wave3/parts.test.tsx` (E2a) · **each part's behaviour:**
   - **WhoPaysWhom:** one `li` per flow.
   - **MythOrFact:** a tap on Myth for a fact card shows "Fact" and the `why`.
   - **Headline:** renders "3 February 1994".
   - **ChoiceCards:** wrong shows the fix in `role=status`; right shows "Yes".
2. `[S4]` same file · **reduced motion.** With `matchMedia` mocked to reduce, each of the four parts has `data-motion="off"` and starts no `element.animate` call (spy).
3. `[S4]` same file · **keyboard.** Each part's controls are buttons reachable by Tab.
4. `[S7]` `src/widgets/primitives/wave3/tokens.test.ts` (E2a) · **still no `#hex`, `rgb(` or `hsl(` literals in wave3 sources.**
5. `[S3]` `src/widgets/widgets.test.ts` (changes) · **the frozen library includes all nine parts (regenerated with FREEZE=1).**
6. `[S1]` `e2e/story-parts.spec.ts` (E2a) · **the E2b fixtures at 560 and 860 px:** no horizontal overflow; every control ≥ 28 px with `cursor: pointer`; with `reducedMotion: "reduce"`, `document.getAnimations().length === 0` after a click.

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- Screenshots of the four parts in Light and Dark at 860 px are attached.

**Critic check:**
- **Colour and liveliness** on the four screenshots: ≥ 4/5 lively on each, with accents used for their meaning.
- **Affordance:** every pressable element reads as a button, and the Headline's masthead does not.
- **Widget fit** (Appendix D.2.3) on the fixtures: each one is understandable on its own.

**Find it:**
```bash
rg -n 'WAVE2_PARTS' src/widgets
ls src/widgets/fixtures/parts
```

**Hot files:** `src/widgets/primitives/wave3/*`, `src/widgets/library.tsx`, `src/widgets/frozen.generated.json`, `src/widgets/fixtures/parts/*`.

---

### E3 · The Tutor and Topic files can open story Widgets, checked before they show
**Label:** `ready-for-agent` · **Depends on:** wave 0, E2b · **Tier:** sonnet · **Size:** M

**Why:** The new parts only reach a Learner through a Widget recipe (ADR 0005, 0007) or a written-ahead scene. Story text is where invented facts and hidden sums would creep in, so every recipe checks its words before it draws.

**Change:**
- **A new recipe set, `src/widgets/recipes/set-story.ts`**, registered in `recipes/index.ts`. Its recipes are `story_scene`, `lingo_card`, `timeline`, `two_paths`, `money_jar`, `who_pays_whom`, `myth_or_fact`, `headline` and `choice_cards`.
  - Their params are zod schemas mirroring E2a's and E2b's props, with the word caps and counts as limits.
  - Text goes in `inputs`, real figures in `refs` (Case Data, as today), and made-up figures in `facts`, which makes the Widget an Illustration.
- **Archetypes:** add `"Story"` and `"Lingo"` to `ARCHETYPES` (`src/widgets/recipes/define.ts:19`).
  - story_scene and two_paths → Story; lingo_card → Lingo; timeline and headline → History; money_jar → Grow; who_pays_whom → Chain; myth_or_fact and choice_cards → Check.
- **Shared checks** (`storyChecks` in `set-story.ts`, run in each recipe's `superRefine` and again by the course check on Topic files):
  1. every emoji name is in `EMOJI_NAMES`;
  2. every date is on or before the Case's `asOf` while the Learner is before the reveal step. Recipes get the same as-of context that `refs` already use (`define.ts:12-13`). At reveal or later, dates may pass `asOf`.
  3. any currency sign matches the Topic's example currency or a Case currency (the V7 rule);
  4. `sumAsk` is null on every `question`, `says`, `choice` and `claim`;
  5. TwoPaths `outcomeLine` and MoneyJar `words` have no digits.
- **`headline` takes only a Topic scene reference** (`{ scene: "<sceneId>" }`), never Tutor-written text, so a front page is always written ahead and checked by the Historian.
- **Tutor catalogue:** all nine are in `TUTOR_RECIPE_IDS` (`src/tutor/ready-made-widgets.ts:18`), except that `headline` takes a scene id only.
  - Add one line to `ENGINE_WIDGETS` (`instructions.ts:372-383`): "For a story moment, a word or a who-pays-whom, show the story recipe that fits; never write a fact the Case does not give."
- **New Topic-file keys** (`src/course/map.ts`), all optional:
  - **`scenes:`** — `[{ id, step: story|concept|explore|your_turn|check|reveal|principle, check?: <checkId>, recipe, inputs, refs?, facts? }]`.
  - **`terms[]`** gains `pro`, `example`, `emoji` and `inStory` beside `term` and `means` (`termSchema`, `map.ts:41`).
  - **`runningExample.scene`** — a `story_scene` inputs object (`runningExampleSchema`, `map.ts:45`).
  - `course:check` builds every scene through its recipe and fails with `Scene "<id>": <reason> (Topic "<id>")`.
  - At most one scene per (step, check) pair.
- **A dev page, `/dev/scenes?topic=<id>`** (dev only, no DB, built like `/dev/widgets`, `src/app/dev/widgets/page.tsx:13-21`). It draws a Topic's scenes, terms as LingoCards, and its Running-example scene, in step order. The S6 critics and E6's screenshots use it.
- **Docs:**
  - `docs/architecture.md`, section "Widgets": "Story recipes and scenes".
  - GLOSSARY: **Story scene** (new), **Lingo card** (new), **Archetype** (adds Story and Lingo), **Widget recipe** (names the story set).

**Tests first (red → green):**
1. `[S3]` `src/widgets/recipes/set-story.test.ts` (new) · **param checks:**
   - `story_scene` with emoji `pizza-slice` is refused, naming the emoji;
   - a beat with "Work out the EMI?" is refused by `sumAsk`;
   - a `timeline` beat dated 1994-05-09 with asOf 1994-02-03 at the concept step is refused, and accepted at reveal;
   - `$` in a ₹ Topic with no USD Case is refused;
   - `two_paths` `outcomeLine` "They earned 12%" is refused;
   - `headline` with inline text is refused, and with `{scene}` it is accepted;
   - each recipe's `examples` compile.
2. `[S3]` `src/widgets/recipes/recipes.test.ts` (changes) · **each new recipe stays within its budget, and its compiled program passes the Widget checks.**
3. `[S3]` `src/course/map.test.ts` (changes) · **a Topic with a `scenes:` entry that uses an unknown recipe fails; two scenes for the same step and Check fail; terms with `pro`, `emoji` and the rest parse.**
4. `[S3]` `src/tutor/ready-made-widgets.test.ts` (changes) · **the Tutor catalogue lists the nine.**
5. `[S1]` `e2e/dev-scenes.spec.ts` (new) · **`/dev/scenes?topic=present-value` renders with no console error** (against a fixture Topic; E6a extends it to real Topics).

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- The `/dev/scenes` screenshot of the fixture Topic is attached.
- The docs and glossary entries are written.

**Critic check:** **Historian** on the recipe `examples` (0 wrong); **Math police** on the examples (0).

**Find it:**
```bash
rg -n 'export const ARCHETYPES' src/widgets/recipes/define.ts
rg -n 'NOT_FOR_TEACHING|TUTOR_RECIPE_IDS' src/tutor/ready-made-widgets.ts
rg -n 'termSchema|runningExampleSchema' src/course/map.ts
rg -n 'const ENGINE_WIDGETS' src/tutor/instructions.ts
ls src/widgets/recipes
```

**Hot files:**
- `src/widgets/recipes/index.ts`;
- `src/tutor/ready-made-widgets.ts` (also E4a);
- `src/tutor/instructions.ts` (also D3a, D3b, E4a);
- `src/course/map.ts`;
- `GLOSSARY.md`.

---

### E4a · Every Tutor reply comes with exactly one Widget; code adds one when the Tutor does not
**Label:** `ready-for-agent` · **Depends on:** wave 0, E3, D3a, D3b · **Tier:** opus · **Size:** L

**Why:** The owner: "I want it to be constantly using generative UI: for every prompt there should be a generative UI." Today a reply may have at most one Widget (`ONE_WIDGET`, `src/tutor/tools.ts:380`; V4, `reply-checks.ts:290-296`). When no recipe fits, the Tutor "says so in one sentence and teaches in words" (ADR 0007). Code opens a Widget by itself only at converted Concept steps (`storePreset`, `src/tutor/practice.ts:279`), at the reveal (`:249`) and at explore. Nothing measures how many replies carry one.

**Change:**
- **A companion picker, `src/tutor/companion.ts`** (new, pure). It exports `pickCompanion({ topic, place, replyText, shownThisSession, blocked })`, which returns `{ kind, recipe, params } | null`. The first rule that gives a Widget wins:
  1. **scene:** the current step's written-ahead scene (`scenes:` matching step and Check), if its id has not been shown in this Session;
  2. **lingo:** a `lingo_card` for the first Topic term in `replyText`, by text position. Matching is case-insensitive, at word boundaries, and allows a plural "s". Terms already carded in this Session are skipped.
  3. **running_example:** the Topic's `runningExample.scene`; it may repeat (ADR 0007);
  4. **case** (the safety net, so every Topic has one): a one-beat `timeline` with the Case's `asOf`, its title (≤ 8 words, trimmed) and `spiral-calendar`.
  - Any candidate whose text or numbers include an open quiz's Blocked numbers is skipped, as V5 does (`turn-facts.ts` openItems).
- **Wiring** (`src/tutor/turn.ts`). After the reply passes its checks, or after the fallback (`:922-934`), and before release:
  - **when it runs:** only if the Session's frozen settings have `widget_engine` = "on", the turn was not stopped, and no `WIDGET_SHOWN` item has `afterSeq ≥ turnSeq` (code-opened step Widgets count);
  - **what it does:** pick, then build through `recipeById(recipe).build(...)`, as `practice.ts:279-300` does;
  - **how it saves:** `saveItemAfterLatest` a `WIDGET_SHOWN` item;
  - **what the browser gets:** the item event before the text event.
- **Record the source.**
  - `ShownWidgetSource` (`src/widgets/shown-widget.ts:16`) adds `"companion"`, and `ShownWidget` gains `companion?: "scene" | "lingo" | "running_example" | "case"`.
  - One migration (the next free number, §9.2) adds `reply_checks.widget_source text`, holding tutor | step | scene | lingo | running_example | case | none. "step" means code opened a card preset, reveal or explore Widget. `src/tutor/reply-records.ts` writes it.
- **V4 becomes "exactly one; code fills a missing one".** More than one is still a V4 problem (`reply-checks.ts:291-292`). Zero is not a Tutor problem, because code fills it.
  - In `ENGINE_WIDGETS`, replace "When no recipe fits, say so in one sentence, then give the shortest version in words." with "When no recipe fits, teach in words; code adds a picture."
- **Replay fixtures:** `src/behaviour/delight/replay-fixtures.json` (new): 50 Tutor reply texts with their Topic and step, taken from eval transcripts on a Neon test branch, none with a Tutor Widget. Text only, no Learner data.
- **Engine switch:** E4a's tests, E4b, G2 and E6's screenshots run on PGlite and on a Neon test branch whose `settings` row `widget_engine` is `on` (the code default, `src/tutor/session-log.ts:20`). Production changes only in H1; until then F1 reports Widget-on-every-reply from the test branch and says so. E4a never changes the production row.
- **Docs:** ADR 0010 (written by D3a): add the V4 consequence and the companion order, if D3a's text differs. `docs/architecture.md`: a new section, "A Widget with every reply (`src/tutor/companion.ts`)", with the scenario "the Tutor explains 'basis point' in words, and code adds its Lingo card" and the trade-off (sometimes a less apt picture, versus never a bare reply). GLOSSARY: **Companion Widget** (new, naming the Case timeline as the last rule); **Widget** ("one with every Tutor reply").

**Tests first (red → green, in this order):**
1. `[S3]` `src/tutor/companion.test.ts` (new) · **the picker's order:**
   - story step with a story scene → `scene`;
   - the same scene already shown → `lingo` for the first term in the text ("…a percentage point, or 100 basis points…" gives "percentage point", not "basis point");
   - "percentage point" already carded → "basis point";
   - every term carded → `running_example`;
   - a Topic with no scenes, terms or running example (num-econometrics) → `case`, with asOf and title;
   - blocked [3, 3.5, 50] and a scene containing "3.5%" → skips to the next rule.
2. `[S3]` `src/tutor/reply-checks.test.ts` (changes) · **V4: 0 Widgets gives no problem; 2 Widgets gives "Your reply showed 2 Widgets. The limit is one."**
3. `[S2]` `src/tutor/companion-turn.test.ts` (new, PGlite + scripted client):
   - a Percent concept reply with no tool call stores exactly 1 `WIDGET_SHOWN` with source `companion`, and `reply_checks.widget_source` = the picker's kind;
   - a reply that calls `show_widget` gives `tutor` and no companion;
   - a fallback reply still gets a companion;
   - Stop gives none, with `widget_source` = none;
   - an engine-off Session gets none, with `widget_source` = null;
   - the migration that adds `reply_checks.widget_source` applies on PGlite.
4. `[S1]` `e2e/widget-every-reply.spec.ts` (new) · **6 scripted replies across story, concept, your turn and reveal give 6 Widgets in the panel, one per reply, matched by turn. None shows at an open quiz's blocked numbers (scripted quiz-open case).**
5. `[S3]` `src/tutor/companion-replay.test.ts` (new) · **the picker over the 50 stored replies** · it returns a Widget for 50 of 50; for the replies that name a Topic term and have no unshown scene, it returns `lingo` for the first term in ≥ 90 % (expected: 100 %, since the rule is code).

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- The `[E4a]` line in `e2e/targets.spec.ts` loses `test.fail` and passes.
- ADR 0010's V4 consequence, the architecture section and the glossary are updated.
- The production switch of `widget_engine` is the owner's step in H1.

**Critic check:**
- **Widget fit** (§8.9) on the 6 Widgets of test 4: median match ≥ 4/5.
- **Math police:** 0.

**Find it:**
```bash
rg -n 'ShownWidgetSource' src/widgets/shown-widget.ts
rg -n 'widgetInReply|ONE_WIDGET' src/tutor/tools.ts
rg -n 'trimmedFallback' src/tutor/turn.ts
rg -n 'Your reply showed' src/tutor/reply-checks.ts
rg -n 'export const replyChecks' src/db/schema.ts
rg -n 'widget_engine' src/tutor/session-log.ts
rg -n 'storePreset' src/tutor/practice.ts
```

**Hot files:** `src/tutor/companion.ts` (new), `src/tutor/turn.ts`, `src/tutor/tools.ts`, `src/tutor/reply-checks.ts`, `src/tutor/instructions.ts`, `src/tutor/reply-records.ts`, `src/widgets/shown-widget.ts`, `src/db/schema.ts`, `drizzle/*` (new migration + `meta`), `docs/adr/0010-*.md`, `GLOSSARY.md`.

---

### E4b · One command runs the 20-prompt Delight eval with its judges and reports the G2 numbers
**Label:** `ready-for-agent` · **Depends on:** wave 0, D3b · **Tier:** sonnet · **Size:** S

**Why:** Goal loop G2 (§9.4) needs one repeatable, capped measurement of what a beginner sees: a Widget with every reply, Choices, no sums, and a fun score. Without a runner each round would be measured differently.

**Change:**
- **The Delight eval runner (S5, for goal G2).** Reuse `scripts/widget-eval.mjs`; do not write a new browser runner. Add:
  - `--set delight`, which reads `src/behaviour/delight/prompts.json` (Appendix D.1) in place of the built-in `PROMPTS` (`widget-eval.mjs:60`);
  - `--judge`, which runs the four judges of Appendix D.2 through a new `scripts/delight-judge.mjs` (Opus, JSON output, one call per judge per prompt);
  - a report with the G2 metrics (Appendix D.3);
  - a spend cap: `DELIGHT_BUDGET_USD`, default 13 per round.
  - `npm run delight:eval` wraps it. Its guards are those of widget-eval: a Neon test branch, the tools Learner and localhost.
- The judges are Appendix D.2, the bars Appendix D.3. The prompts file is Appendix D.1.
- **Docs:** `docs/architecture.md` "Live Tutor tests": a "Delight eval" paragraph (what it runs, what it costs, that it is paid and never required in CI).

**Tests first (red → green, in this order):**
1. `[S3]` `src/behaviour/delight/prompts.test.ts` (new) · **the prompt set is Appendix D.1** · 20 entries, ids D01–D20, each Topic and step as in the table.
2. `[S3]` same file · **every judge's JSON example parses into the runner's schema**, including Widget fit's `kind` field.
3. `[S5]` `npm run delight:eval -- --judge` on a Neon test branch · **the report lists every Appendix D.3 bar with its number**; spend ≤ $13.

**Done when:**
- `npm run check` and `npm run build` pass.
- One `delight:eval` report is attached to the PR, with the spend.
- E4b lands before G2 starts (§9.4).

**Critic check:** none; its judges are the critics G2 runs.

**Find it:**
```bash
rg -n 'const PROMPTS' scripts/widget-eval.mjs
rg -n 'widgets:eval' package.json
```

**Hot files:** `scripts/widget-eval.mjs`, `scripts/delight-judge.mjs` (new), `src/behaviour/delight/*` (new), `package.json`.

---

### E5 · The Widget gets the big stage, and the Learner can flick back through this Session's Widgets
**Label:** `ready-for-agent` · **Depends on:** wave 0, A1, E2a · **Tier:** sonnet · **Size:** M

**Why:** The owner: "at least 40% of the surface area is not being covered by the widgets / generative UI." A1 gives the panel about 60% of the width, about 860 px at 1512 × 982. Widgets are still laid out for 360–560 px (`HARNESS_WIDTHS`, `src/app/dev/widgets/widths.ts:2`). Older Widgets hide behind the pager (`src/app/widget-pager.tsx`).

**Change:**
- **The latest reply's Widget fills the panel.**
  - The card has no `max-w` cap. Inner caps under `src/widgets/primitives/` lift to the panel at ≥ 720 px.
  - It enters with opacity 0 → 1, translateY 12 px → 0 and scale 0.98 → 1 over 240 ms with `var(--ease-out)`, and does not move under reduced motion.
  - The panel scrolls to its top.
- **A filmstrip** replaces the pager's menu (`widget-pager.tsx`, `PagerEntry` at `:7`). It is a row of 96 × 64 px thumbnails, one per Widget in this Session, oldest first. Each thumbnail shows:
  - the Widget's lead emoji at 24 px: the first emoji in its params, else the archetype's;
  - two lines of the title.
- **Filmstrip behaviour:**
  - The current thumbnail has the brand ring and `aria-current`.
  - The strip scrolls inside itself, never the page.
  - Tab enters the strip, ←/→ move (roving tabindex), and Enter opens.
  - **Back to latest** shows whenever the Learner is not on the latest Widget.
  - The Check tab stays as it is today.
- **Widths:** `HARNESS_WIDTHS` becomes `[360, 480, 560, 720, 860]`, and so does `WIDTHS` in `scripts/layout-check.mjs:63` (Part 1). Every fixture fits at 720 and 860.
- **Must not change:** Widget state, Save to Notebook on a Widget (B2b), the explore Widget's pinning (`topic-header.tsx:33`), or the Check tab.
- **Docs:** `docs/architecture.md`, "The fixed two-column layout and the Check tab": the stage and the filmstrip.

**Tests first (red → green):**
1. `[S4]` `src/app/widget-panel-pager.test.tsx` (changes) · **3 Widgets give 3 thumbnails; the latest has `aria-current`; pressing thumbnail 1 shows Widget 1 and "Back to latest"; → moves focus from 1 to 2.**
2. `[S4]` `src/app/dev/widgets/page.test.tsx` (changes) · **the harness lists the widths 360, 480, 560, 720 and 860.**
3. `[S1]` `e2e/widget-stage.spec.ts` (new) · **checks at 1512 × 982 and 1280 × 800:**
   - after 4 scripted replies, the Widget card is ≥ 0.9 × the panel's inner width, and the panel is ≥ 55% of the viewport;
   - the filmstrip has 4 thumbnails;
   - a click on thumbnail 1 shows its title;
   - with `reducedMotion: "reduce"`, `getAnimations()` is empty after a new reply;
   - there is no page-level horizontal scroll.

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- Screenshots at 1512 × 982 in Light and Dark (a StoryScene on the stage, and the filmstrip with 4 or more) are attached.
- `layout-check` Part 1 passes at 720 and 860 for every fixture.

**Critic check:**
- **Space:** Widget area ≥ 55% of the viewport, and gutters ≤ 32 px (G1 metrics).
- **Affordance:** thumbnails read as pressable.
- **Colour and liveliness:** ≥ 4/5.

**Find it:**
```bash
rg -n 'HARNESS_WIDTHS' src/app/dev/widgets/widths.ts
rg -n 'const WIDTHS' scripts/layout-check.mjs
rg -n 'export type PagerEntry' src/app/widget-pager.tsx
rg -n 'max-w-md|max-w-sm|max-w-72' src/widgets/primitives
```

**Hot files:**
- `src/app/widget-panel.tsx` and `widget-pager.tsx` (also A1, A3b, B2b);
- `src/app/workspace-frame.tsx` (also A1);
- `src/app/topic-header.tsx` (also A1, A2, B3b);
- `src/app/globals.css`.

---

### Shared rules for the E6 batches

**Why:** The owner: "My user base is basically rich kids with a ton of money who can't comprehend financial aspects of their day-to-day life; they don't like math … That is why it should be based on stories." Today only 2 of these 12 Topics have terms or a Running example, and only Percent and Present value have Widgets (inventory §2). The companion picker (E4a) is only as good as these files.

**Change (the same for every batch; edit only the batch's four `course/topics/<id>.yaml` files):**
- **Scenes** (`scenes:`, E3):
  - a `story` scene: a StoryScene of 3–5 beats with a cast from the Case's real roles, its date the Case's `asOf`;
  - one scene per Check's `concept` step, using the part that fits the idea best: TwoPaths, WhoPaysWhom, MoneyJar, MythOrFact or StoryScene;
  - a `reveal` scene: a TimelineStrip, or a Headline whose text and date come from one of the Case's `outline.yaml` sources (dates may pass `asOf` here only);
  - a `principle` scene: TwoPaths or a LingoCard recap.
  - That is 5 scenes for a Topic with 2 Checks, 7 for Percent and 9 for Compounding.
- **Terms:** 4–6 per Topic, each with `term`, `means` (≤ 20 plain words), `pro` (how a trader or analyst says it), `example` (everyday, in ₹, ≤ 20 words), `emoji` (in the registry) and `inStory` (a link to the Case, ≤ 20 words).
- **Running example:** `runningExample.text` and `numbers` (Topics 3–12 have none today), plus `runningExample.scene`: an everyday ₹ StoryScene the Learner can picture.
- **Questions:**
  - every L10 hit is rewritten (as in the D2 batches);
  - every wrong choice carries a mix-up fix;
  - each Topic gains ≥ 2 new lingo choice questions ("What do analysts call…?").
  - Percent and Compounding only: every `kind: number` Quick try becomes `kind: choice`, and every template `ask` becomes a story or lingo stem with a `label:` pattern.
- **Allowlist:** delete the batch's ids from `L10_NOT_YET_STORY`.
- **Not in E6:** Skills, Concept cards and Quick tries for Topics 3–12. They stay on `LESSON_NOT_YET_CONVERTED` (`src/course/lesson-lint.ts:20`); converting them is a later spec, as ADR 0006 says.
- **Shared Cases:** WeWork is used by fs-income, fs-revenue-runrate and fs-leases-debt; Satyam by fs-balance and fs-links; Webvan by fs-cashflow and fs-capex-dep. Reuse one cast per company, with the same names and emoji, but each Topic keeps its own Case `asOf`.

**Tests (the same for every batch, red → green):**
1. `[S7]` `npm run course:check` · **red with the batch's ids removed from the allowlist and no scenes; green when L10, L11 and every scene build pass.**
2. `[S6]` **Historian** over each Topic's scenes, terms, questions and fixes, against `course/outline.yaml` `sources`, `asOf` and `outcome` · **0 `wrong`; 0 `after_as_of` outside the reveal; no outcome hint before the reveal.**
3. `[S6]` **Math police** over the four files · **0 sums.**
4. `[S6]` **Beginner persona** on the `/dev/scenes?topic=<id>` screenshots plus the Topic's questions · **median fun ≥ 4/5, median lingo learned ≥ 4/5, and "felt like an exam" = no, for each Topic.**
5. `[S1]` `e2e/dev-scenes.spec.ts` (extended) · **each of the batch's Topics renders on `/dev/scenes` with no console error and no overflow at 860 px.**

**The batches** (inventory §2; Case and `asOf` from `course/outline.yaml`; the terms are a starting list the writer may change; sum = sum-stem questions):

| Batch | Topic | Case (asOf) | Starting terms | Sum |
|---|---|---|---|---|
| **E6a** | num-percent-bps | The Fed meets, Feb 1994 (1994-02-03) | basis point, percentage point, rate hike, quarter point, percent change | 3, plus 13 typed Quick tries and 4 templates |
| | num-compounding | The Sensex from base 100 (1992-03-31) | index, base year, compounding, CAGR, bull run | 5, plus 14 typed Quick tries and 3 templates |
| | num-probability | LTCM, before the loss (1998-08-01) | probability, expected value, leverage, hedge fund, tail risk | 1 |
| | present-value | The $1.537 billion Mega Millions jackpot (2018-10-24) | present value, lump sum, annuity, discount rate, cash option | 3 |
| **E6b** | fs-income | WeWork's S-1 (2019-08-14) | revenue (top line), net loss (bottom line), operating expenses, EBITDA, S-1 | 1 |
| | fs-balance | Satyam's balance sheet (2008-09-30) | assets, liabilities, equity, cash and bank balances, auditor | 3 |
| | fs-cashflow | Webvan's cash burn (2001-04-02) | cash burn, runway, operating cash flow, free cash flow | 0 |
| | fs-links | Satyam's forged invoices (2008-12-31) | accrual, receivables, the three statements, cooking the books | 0 |
| **E6c** | fs-ratios | Coffee Day Enterprises at its IPO (2015-10-13) | return on equity, DuPont, profit margin, leverage, asset turnover | 3 |
| | fs-revenue-runrate | WeWork's run-rate boast (2019-08-14) | run rate, gross vs net revenue, revenue recognition, backlog | 1 |
| | fs-capex-dep | Webvan's warehouses and fleet (1999-11-05) | capex, depreciation, amortisation, EBITDA, fixed assets | 2 |
| | fs-leases-debt | WeWork's leases (2019-08-14) | lease liability, commitments, off-balance-sheet, debt-like, landlord | 1 |

---

### E6a · Percent, Compounding, Probability and Present value open with stories, teach the lingo, and quiz with taps
**Label:** `ready-for-agent` · **Depends on:** wave 0, E3, D1b · **Tier:** sonnet (Historian votes on opus) · **Size:** M

**Why:** The owner: "That is why it should be based on stories." These four Topics are on the default path the Learner meets first (with 13 and 14 typed Quick tries and 7 templates in Percent and Compounding, the heaviest batch). The rules are in "Shared rules for the E6 batches" above.

**Change:**
- Apply the shared E6 rules to exactly these Topics, and nothing else:

| Topic | Case (asOf) | Starting terms | Sum |
|---|---|---|---|
| num-percent-bps | The Fed meets, Feb 1994 (1994-02-03) | basis point, percentage point, rate hike, quarter point, percent change | 3, plus 13 typed Quick tries and 4 templates |
| num-compounding | The Sensex from base 100 (1992-03-31) | index, base year, compounding, CAGR, bull run | 5, plus 14 typed Quick tries and 3 templates |
| num-probability | LTCM, before the loss (1998-08-01) | probability, expected value, leverage, hedge fund, tail risk | 1 |
| present-value | The $1.537 billion Mega Millions jackpot (2018-10-24) | present value, lump sum, annuity, discount rate, cash option | 3 |

- Delete `num-percent-bps`, `num-compounding`, `num-probability`, `present-value` from `L10_NOT_YET_STORY`.

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **red with these 4 ids removed from the allowlist and no scenes; green when L10, L11 and every scene build pass.**
2. `[S6]` Historian over the 4 files · **0 `wrong`; 0 `after_as_of` outside the reveal; no outcome hint before the reveal.**
3. `[S6]` Math police over the 4 files · **0 sums.**
4. `[S6]` Beginner persona on `/dev/scenes?topic=<id>` screenshots plus the questions · **median fun ≥ 4/5, median lingo ≥ 4/5, "felt like an exam" = no, for each Topic.**
5. `[S1]` `e2e/dev-scenes.spec.ts` (E3, extended) · **each of the 4 Topics renders on `/dev/scenes` with no console error and no overflow at 860 px.**

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- The 4 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON and the `/dev/scenes` screenshots (Light) are attached to the PR.
- `docs/architecture.md` "Foundation Topics" gets one line naming this batch.

**Critic check:** Historian (0 wrong; a wrong fact goes to 3 votes), Math police (0), Beginner persona (bars above). Each finding is adversarially verified.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{num-percent-bps,num-compounding,num-probability,present-value}.yaml
rg -n 'asOf:' course/outline.yaml
```

**Hot files:** `course/topics/{num-percent-bps,num-compounding,num-probability,present-value}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### E6b · The income statement, balance sheet, cash flow and how the statements link open with stories, teach the lingo, and quiz with taps
**Label:** `ready-for-agent` · **Depends on:** wave 0, E3, D1b · **Tier:** sonnet (Historian votes on opus) · **Size:** M

**Why:** The owner: "That is why it should be based on stories." These four Topics are on the default path the Learner meets first. The rules are in "Shared rules for the E6 batches" above.

**Change:**
- Apply the shared E6 rules to exactly these Topics, and nothing else:

| Topic | Case (asOf) | Starting terms | Sum |
|---|---|---|---|
| fs-income | WeWork's S-1 (2019-08-14) | revenue (top line), net loss (bottom line), operating expenses, EBITDA, S-1 | 1 |
| fs-balance | Satyam's balance sheet (2008-09-30) | assets, liabilities, equity, cash and bank balances, auditor | 3 |
| fs-cashflow | Webvan's cash burn (2001-04-02) | cash burn, runway, operating cash flow, free cash flow | 0 |
| fs-links | Satyam's forged invoices (2008-12-31) | accrual, receivables, the three statements, cooking the books | 0 |

- Delete `fs-income`, `fs-balance`, `fs-cashflow`, `fs-links` from `L10_NOT_YET_STORY`.

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **red with these 4 ids removed from the allowlist and no scenes; green when L10, L11 and every scene build pass.**
2. `[S6]` Historian over the 4 files · **0 `wrong`; 0 `after_as_of` outside the reveal; no outcome hint before the reveal.**
3. `[S6]` Math police over the 4 files · **0 sums.**
4. `[S6]` Beginner persona on `/dev/scenes?topic=<id>` screenshots plus the questions · **median fun ≥ 4/5, median lingo ≥ 4/5, "felt like an exam" = no, for each Topic.**
5. `[S1]` `e2e/dev-scenes.spec.ts` (E3, extended) · **each of the 4 Topics renders on `/dev/scenes` with no console error and no overflow at 860 px.**

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- The 4 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON and the `/dev/scenes` screenshots (Light) are attached to the PR.
- `docs/architecture.md` "Foundation Topics" gets one line naming this batch.

**Critic check:** Historian (0 wrong; a wrong fact goes to 3 votes), Math police (0), Beginner persona (bars above). Each finding is adversarially verified.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{fs-income,fs-balance,fs-cashflow,fs-links}.yaml
rg -n 'asOf:' course/outline.yaml
```

**Hot files:** `course/topics/{fs-income,fs-balance,fs-cashflow,fs-links}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### E6c · Ratios, run-rate revenue, capex and leases open with stories, teach the lingo, and quiz with taps
**Label:** `ready-for-agent` · **Depends on:** wave 0, E3, D1b · **Tier:** sonnet (Historian votes on opus) · **Size:** M

**Why:** The owner: "That is why it should be based on stories." These four Topics are on the default path the Learner meets first. The rules are in "Shared rules for the E6 batches" above.

**Change:**
- Apply the shared E6 rules to exactly these Topics, and nothing else:

| Topic | Case (asOf) | Starting terms | Sum |
|---|---|---|---|
| fs-ratios | Coffee Day Enterprises at its IPO (2015-10-13) | return on equity, DuPont, profit margin, leverage, asset turnover | 3 |
| fs-revenue-runrate | WeWork's run-rate boast (2019-08-14) | run rate, gross vs net revenue, revenue recognition, backlog | 1 |
| fs-capex-dep | Webvan's warehouses and fleet (1999-11-05) | capex, depreciation, amortisation, EBITDA, fixed assets | 2 |
| fs-leases-debt | WeWork's leases (2019-08-14) | lease liability, commitments, off-balance-sheet, debt-like, landlord | 1 |

- Delete `fs-ratios`, `fs-revenue-runrate`, `fs-capex-dep`, `fs-leases-debt` from `L10_NOT_YET_STORY`.

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **red with these 4 ids removed from the allowlist and no scenes; green when L10, L11 and every scene build pass.**
2. `[S6]` Historian over the 4 files · **0 `wrong`; 0 `after_as_of` outside the reveal; no outcome hint before the reveal.**
3. `[S6]` Math police over the 4 files · **0 sums.**
4. `[S6]` Beginner persona on `/dev/scenes?topic=<id>` screenshots plus the questions · **median fun ≥ 4/5, median lingo ≥ 4/5, "felt like an exam" = no, for each Topic.**
5. `[S1]` `e2e/dev-scenes.spec.ts` (E3, extended) · **each of the 4 Topics renders on `/dev/scenes` with no console error and no overflow at 860 px.**

**Done when:**
- `npm run check`, `npm run build` and `npm run ui:test` pass.
- The 4 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON and the `/dev/scenes` screenshots (Light) are attached to the PR.
- `docs/architecture.md` "Foundation Topics" gets one line naming this batch.

**Critic check:** Historian (0 wrong; a wrong fact goes to 3 votes), Math police (0), Beginner persona (bars above). Each finding is adversarially verified.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{fs-ratios,fs-revenue-runrate,fs-capex-dep,fs-leases-debt}.yaml
rg -n 'asOf:' course/outline.yaml
```

**Hot files:** `course/topics/{fs-ratios,fs-revenue-runrate,fs-capex-dep,fs-leases-debt}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### Shared rules for the D2 batches

**Why:** D1a shows old number items as choices, but their stems still read like an exam ("How many basis points…?"). The owner wants "comprehending these concepts rather than doing the math". Each batch empties its own lines of the L10 allowlist.

**Change (the same for every batch; edit only the batch's own `course/topics/<id>.yaml` files):**
- **Rewrite every L10 hit** as a story or lingo choice question. Keep the question `id` and the Check it belongs to.
  - Stem patterns to use:
    - "What do traders call…?"
    - "Which headline gets it right?"
    - "Who pays whom when…?"
    - "Which would you pick, and why?"
    - "What does <term> mean here?"
  - Numbers stay only as story facts or choice labels (ADR 0009).
- **Give every wrong choice** of a rewritten question a `mistake: {tag, fix}`. The fix is one line of 20 words or fewer, saying what the mix-up was.
- **Rewrite conversation Check prompts** that ask for a sum to "say it in your own words" or "which would you pick and why". Update their `passCriteria` to match.
- **Delete** the batch's Topic ids from `src/course/l10-allowlist.ts`. Only delete; never add.
- **Do not:** add scenes, terms or Skills; change ids, sources, Cases or `asOf`; touch another batch's files.

**Tests (the same for every batch, red → green):**
1. `[S7]` `npm run course:check` · **with the batch's ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the batch's files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the agent picks the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, and "felt like an exam" = no on every question.**

**Totals:** 83 Topics in 10 batches, 104 sum-stem questions by heuristic (inventory §1b). The first 12 path Topics are not in D2: E6a–E6c do them. The sum-stem count is a heuristic; L10 is the truth. The batches touch disjoint Topic files and can run in parallel; `src/course/l10-allowlist.ts` is shared, deletions only, one line per id.

---

### D2a · Questions in 12 Topics, from num-statistics to eco-fiscal-debt, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1494 YAML lines with about 5 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `num-statistics`, `num-econometrics`, `fs-filings`, `fs-earnings-quality`, `fs-tax`, `eco-supply-demand`, `eco-micro-competition`, `eco-money-banking`, `eco-central-banks`, `eco-inflation-real`, `eco-gdp-cycles`, `eco-fiscal-debt`.
- Delete those 12 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 12 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 12 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 12 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{num-statistics,num-econometrics,fs-filings,fs-earnings-quality,fs-tax,eco-supply-demand,eco-micro-competition,eco-money-banking,eco-central-banks,eco-inflation-real,eco-gdp-cycles,eco-fiscal-debt}.yaml
```

**Hot files:** `course/topics/{num-statistics,num-econometrics,fs-filings,fs-earnings-quality,fs-tax,eco-supply-demand,eco-micro-competition,eco-money-banking,eco-central-banks,eco-inflation-real,eco-gdp-cycles,eco-fiscal-debt}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2b · Questions in 10 Topics, from in-rbi-policy to in-gsec, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1580 YAML lines with about 6 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `in-rbi-policy`, `eco-trade`, `in-economy`, `hist-macro-regimes`, `bond-pricing`, `bond-yield`, `bond-yield-curve`, `bond-duration`, `bond-credit-spreads`, `in-gsec`.
- Delete those 10 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 10 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 10 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 10 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{in-rbi-policy,eco-trade,in-economy,hist-macro-regimes,bond-pricing,bond-yield,bond-yield-curve,bond-duration,bond-credit-spreads,in-gsec}.yaml
```

**Hot files:** `course/topics/{in-rbi-policy,eco-trade,in-economy,hist-macro-regimes,bond-pricing,bond-yield,bond-yield-curve,bond-duration,bond-credit-spreads,in-gsec}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2c · Questions in 8 Topics, from credit-analysis to der-option-pricing, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet (the Historian vote runs on opus: this batch is one of the four heaviest) · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1347 YAML lines with about 15 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `credit-analysis`, `fx-basics`, `fx-bop`, `fx-regimes-crises`, `sov-default-country-risk`, `der-forwards`, `der-options`, `der-option-pricing`.
- Delete those 8 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 8 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 8 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 8 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{credit-analysis,fx-basics,fx-bop,fx-regimes-crises,sov-default-country-risk,der-forwards,der-options,der-option-pricing}.yaml
```

**Hot files:** `course/topics/{credit-analysis,fx-basics,fx-bop,fx-regimes-crises,sov-default-country-risk,der-forwards,der-options,der-option-pricing}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2d · Questions in 9 Topics, from der-rates-fx to mkt-ipo-float, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1431 YAML lines with about 7 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `der-rates-fx`, `der-hedging`, `eq-markets`, `eq-history`, `risk-portfolio`, `risk-capm`, `mkt-efficiency`, `mkt-behavioural`, `mkt-ipo-float`.
- Delete those 9 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 9 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 9 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 9 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{der-rates-fx,der-hedging,eq-markets,eq-history,risk-portfolio,risk-capm,mkt-efficiency,mkt-behavioural,mkt-ipo-float}.yaml
```

**Hot files:** `course/topics/{der-rates-fx,der-hedging,eq-markets,eq-history,risk-portfolio,risk-capm,mkt-efficiency,mkt-behavioural,mkt-ipo-float}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2e · Questions in 10 Topics, from funds-passive to val-banks, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet (the Historian vote runs on opus: this batch is one of the four heaviest) · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1634 YAML lines with about 14 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `funds-passive`, `real-assets`, `cf-capital-budgeting`, `cf-wacc`, `cf-capital-structure`, `cf-payout`, `val-dcf`, `val-multiples`, `val-young`, `val-banks`.
- Delete those 10 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 10 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 10 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 10 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{funds-passive,real-assets,cf-capital-budgeting,cf-wacc,cf-capital-structure,cf-payout,val-dcf,val-multiples,val-young,val-banks}.yaml
```

**Hot files:** `course/topics/{funds-passive,real-assets,cf-capital-budgeting,cf-wacc,cf-capital-structure,cf-payout,val-dcf,val-multiples,val-young,val-banks}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2f · Questions in 8 Topics, from val-distress to private-credit, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet (the Historian vote runs on opus: this batch is one of the four heaviest) · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1368 YAML lines with about 13 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `val-distress`, `val-implied-erp`, `val-india`, `cf-venture`, `bank-regulation`, `crisis-bank-runs`, `struct-securitisation`, `private-credit`.
- Delete those 8 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 8 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 8 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 8 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{val-distress,val-implied-erp,val-india,cf-venture,bank-regulation,crisis-bank-runs,struct-securitisation,private-credit}.yaml
```

**Hot files:** `course/topics/{val-distress,val-implied-erp,val-india,cf-venture,bank-regulation,crisis-bank-runs,struct-securitisation,private-credit}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2g · Questions in 8 Topics, from ins-risk-transfer to fol-sov-ratings, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1429 YAML lines with about 12 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `ins-risk-transfer`, `gov-ethics`, `crisis-leverage`, `fol-uber-2014`, `fol-twitter-ipo`, `fol-tesla-2020`, `fol-roe`, `fol-sov-ratings`.
- Delete those 8 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 8 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 8 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 8 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{ins-risk-transfer,gov-ethics,crisis-leverage,fol-uber-2014,fol-twitter-ipo,fol-tesla-2020,fol-roe,fol-sov-ratings}.yaml
```

**Hot files:** `course/topics/{ins-risk-transfer,gov-ethics,crisis-leverage,fol-uber-2014,fol-twitter-ipo,fol-tesla-2020,fol-roe,fol-sov-ratings}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2h · Questions in 8 Topics, from fol-subprime-ai to jud-ipo-forecast, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet (the Historian vote runs on opus: this batch is one of the four heaviest) · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1667 YAML lines with about 13 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `fol-subprime-ai`, `fol-systemic-risk`, `fol-money-trap`, `fol-erp`, `jud-rating-boundary`, `jud-assumptions`, `jud-narrative-numbers`, `jud-ipo-forecast`.
- Delete those 8 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 8 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 8 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 8 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{fol-subprime-ai,fol-systemic-risk,fol-money-trap,fol-erp,jud-rating-boundary,jud-assumptions,jud-narrative-numbers,jud-ipo-forecast}.yaml
```

**Hot files:** `course/topics/{fol-subprime-ai,fol-systemic-risk,fol-money-trap,fol-erp,jud-rating-boundary,jud-assumptions,jud-narrative-numbers,jud-ipo-forecast}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2i · Questions in 5 Topics, from jud-predicted-outcomes to ana-build-valuation, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1478 YAML lines with about 12 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `jud-predicted-outcomes`, `jud-units-periods`, `jud-filing-vs-claim`, `jud-rating-conflict`, `ana-build-valuation`.
- Delete those 5 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 5 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 5 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 5 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{jud-predicted-outcomes,jud-units-periods,jud-filing-vs-claim,jud-rating-conflict,ana-build-valuation}.yaml
```

**Hot files:** `course/topics/{jud-predicted-outcomes,jud-units-periods,jud-filing-vs-claim,jud-rating-conflict,ana-build-valuation}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### D2j · Questions in 5 Topics, from ana-who-pays-whom to ana-anthropic-s1, ask about the story and the words, never for a sum
**Label:** `ready-for-agent` · **Depends on:** wave 0, D1b · **Tier:** sonnet · **Size:** M

**Why:** D1a shows these Topics' old number items as choices, but their stems still read like an exam. The owner wants "comprehending these concepts rather than doing the math". This batch is about 1198 YAML lines with about 7 sum-stem questions (inventory §1b). The rules are in "Shared rules for the D2 batches" above.

**Change:**
- Apply the shared D2 rules to exactly these Topic files, and nothing else: `ana-who-pays-whom`, `ana-commitments-debt`, `ana-india-transfer`, `ana-decide-between`, `ana-anthropic-s1`.
- Delete those 5 ids from `L10_NOT_YET_STORY` (deletions only).

**Tests first (red → green, in this order):**
1. `[S7]` `npm run course:check` · **with the 5 ids removed from the allowlist, L10 fails first (red), then passes once the files are rewritten (green).**
2. `[S6]` Math police over the 5 files · **0 sums.**
3. `[S6]` Historian over every rewritten stem and fix, against `course/outline.yaml` sources and `asOf` · **0 `wrong` and 0 `after_as_of`.**
4. `[S6]` Beginner persona on 5 rewritten questions per Topic (the 5 with the most change) · **median clarity ≥ 4/5, median fun ≥ 4/5, "felt like an exam" = no on every question.**

**Done when:**
- `npm run check` and `npm run build` pass.
- The 5 ids are gone from `L10_NOT_YET_STORY`.
- The critic JSON is attached to the PR.
- `docs/architecture.md`'s "Foundation Topics" or "Follow/Judge/Analyse Topics" section gets one line naming the batch.

**Critic check:** Math police (0; a violation goes to 3 votes), Historian (0 wrong; a wrong fact goes to 3 votes), Beginner persona (bars above). Each finding is adversarially verified before it becomes a fix.

**Find it:**
```bash
rg -n -i '\b(how many|how much|calculate|work out|compute)\b' course/topics/{ana-who-pays-whom,ana-commitments-debt,ana-india-transfer,ana-decide-between,ana-anthropic-s1}.yaml
```

**Hot files:** `course/topics/{ana-who-pays-whom,ana-commitments-debt,ana-india-transfer,ana-decide-between,ana-anthropic-s1}.yaml`; `src/course/l10-allowlist.ts` (deletions only).

---

### F1 · The finished app is checked on every screen size and both themes, and every gap becomes an issue
**Label:** `ready-for-agent` · **Depends on:** every other ticket except C2, C3 and H1 (§9.5) · **Tier:** sonnet (each critic on its own tier, §8) · **Size:** M

**Why:** The unit-level checks miss what a person sees. This is the house-style preview check (T-08 of the themes spec), built on T-00 so it runs the same way every time. Until H1, the Widget-on-every-reply numbers come from a Neon test branch with `widget_engine` on, and the report says so.

**Change:** No product code. Write `scripts/preview-matrix.mjs` (new) and `e2e/matrix.spec.ts` (new), then run them on the last merged `main` (or the Vercel production URL for the sign-in screens, signed out only).
- **Viewports:** 1512×982, 1280×800, 1920×1080, 1024×768. **Themes:** Light and Dark (`UI_MATRIX=1` gives the 8 projects).
- **Pages and states:** Home; `/study` as story (`seed("story")`), concept with a Widget (`concept-widget`), quiz with Check open (`quiz-open`), Topic complete (`topic-complete`); Course Map (`many-topics`); Notebook; Settings; login (signed out, plus `?error=not_invited`).
- **Per cell:** one full-page screenshot into `evidence/preview-matrix/<project>/<page>.png` (git-ignored), plus the numbers: `measureLayout()` (gutters, `panelWidthPct`, `headerHeight`), `auditAffordances()`, characters per line (45–80), horizontal scroll (none), focus ring visible on Tab.
- **Run every §8 critic** (prompts from T-01) on the screenshots and numbers: Affordance, Space, Colour and liveliness, Beginner persona (10-turn transcripts from the scripted `concept-reply-widget` and live-eval transcripts if the owner has run G2), Math police (course files and replies), Historian (the 12 Topics' story facts), Security (auth screens). Each critic returns findings; **every finding is adversarially verified** (a second agent tries to refute it with the screenshot and the code) before it counts.
- **Every confirmed difference** from the targets in §3/§6 becomes one issue labelled `needs-triage`, linked as a sub-issue of the parent, with the cell's screenshot and the number. No fix in this ticket.
- Attach the screenshots to the parent issue (a zip and the 8 most telling cells inline).

**Tests first (red → green, in this order):**
1. [S3] `src/dev/preview-matrix.test.ts` (new) · "the matrix lists every cell" · the cell list has 4 viewports × 2 themes × 9 pages = 72 entries, plus one `/login?error=not_invited` shot per project (8), no duplicates, each with a file name that has no spaces.
2. [S1] `e2e/matrix.spec.ts` · "every cell loads without horizontal scroll" · for all 72 cells `document.documentElement.scrollWidth <= window.innerWidth`.
3. [S1] same · "the §6 numbers hold in every cell" · at `mbp14` and `w1920`: gutters ≤ 32 px, `panelWidthPct` ≥ 55 on the concept-with-Widget cell, `headerHeight` ≤ 56 px, `auditAffordances()` lists empty, characters per line 45–80 on reading pages; at `w1280` and `w1024` the same except where §6 names a looser bound. Expected values are the thresholds of §6, not recomputed from the code. A cell that fails is a finding, and the test collects all failing cells before it fails, so one run lists everything.
4. [S1] same · "/study with a Widget shows ≥ 3 accents" · on the concept-with-Widget cell, the distinct computed fills among `--mint`, `--coral`, `--sun`, `--violet` number ≥ 3.

**Done when:**
- Screenshots for all 80 shots are attached to the parent issue.
- Each critic's report is attached as a comment, and each report says how many findings were confirmed and how many were refuted.
- The count of `needs-triage` issues created is stated in a comment, with their numbers; 0 is a valid result.
- `npm run ui:test` and `npm run check` pass.
- Keyboard pass noted: Tab reaches the gear, the account menu, the theme icon and "Continue with Google", and a focus ring shows in both themes.
- Print preview of `/notebook` is Light in both themes (one screenshot).
- Decision recorded: keep or delete `scripts/layout-check.mjs` and `scripts/browser-check.mjs`.

**Critic check:** all of §8 as listed above; pass bar for the ticket itself is that the report exists and every difference is an issue (it does not require 0 findings).

**Find it:**
```bash
rg -n 'browser-check|layout-check' package.json scripts --glob '*.mjs' -l
rg -n 'needs-triage' docs/agents/triage-labels.md
```

**Hot files:** `e2e/matrix.spec.ts` (new), `scripts/preview-matrix.mjs` (new), `.gitignore`. (After T-00, `rg -n 'UI_MATRIX' playwright.config.ts` and `ls e2e/support/measure.ts` also hit.)

---

### F2 · The whole spec is reviewed against the repo's standards and against what was asked, and one fix PR closes the findings
**Label:** `ready-for-agent` · **Depends on:** F1 · **Tier:** opus · **Size:** M

**Why:** One last look, after everything has landed, catches drift between tickets that each looked fine alone.

**Change:**
- Run the `/code-review` skill on the range from the spec's first commit (the commit that adds `docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md`) to `main`'s head. Both axes: **Standards** (the repo's `CLAUDE.md`, `GLOSSARY.md` terms, `docs/adr/`, `docs/architecture.md` updated for every new layer) and **Spec** (each ticket's Done-when).
- Every finding is adversarially verified: a second agent tries to show it is wrong, with the code. Only confirmed findings go on.
- One fix PR (`Closes #<F2>` plus one `Closes #N` line for any open ticket it finishes) with the confirmed fixes. Findings that are really new work become `needs-triage` issues instead.
- Walk the ticket list of the parent issue: every ticket is closed (`gh issue list --state open --search "in:title" ...` or the sub-issue view). An open one is reported, never silently closed.
- Confirm the docs: `docs/architecture.md` has a section per new layer, GLOSSARY has the new terms, ADRs 0009–0012 exist and are accepted, ADR 0004 carries the restart note.

**Tests first:** the review's confirmed findings are each reproduced by a failing test at the right seam before the fix, where a test can show them; a pure wording or doc fix has none.

**Done when:**
- The review report (both axes) is a comment on the parent issue.
- 0 confirmed findings remain open; refuted ones are listed with the reason.
- The parent issue's sub-issue list shows all tickets closed except F2 (which closes with its PR) and any of C2, C3, H1 still waiting on the owner, listed in the final report.
- `npm run check`, `npm run build`, `npm run ui:test` pass on `main` after the merge.

**Critic check:** the review itself is the check. Pass bar: both axes report 0 confirmed blocking findings after the fix PR.

**Find it:**
```bash
git log --diff-filter=A --format=%h -- docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md   # hits once this spec is committed
ls docs/adr
rg -n '^## ' docs/architecture.md | tail -5
```

**Hot files:** whatever the confirmed findings touch; no planned files.

---

### H1 · The owner switches the finished app on in production
**Label:** `ready-for-human` · **Depends on:** B3b, C1b, E4a · **Tier:** none (human) · **Size:** S

**Why:** Three things only the owner can do stand between the merged code and a Learner: migrations on the production database, the `widget_engine` switch (#248), and the GitHub ruleset. Claude is blocked from production on purpose (§0 item 6). Until this ticket closes, Restart, sign-in tables and "a Widget with every reply" exist in code but not on `www.value-it.xyz`.

**Change:** The owner follows Appendix F.2, in order:
- Take a Neon snapshot, then run `npm run db:migrate` on production. It applies every pending migration in order (the tables for Topic restart and `reply_checks.widget_source`, plus any sign-in migration C2 has not applied yet).
- Switch `widget_engine` on (#248) and comment on #248.
- Add the `ui` job to the ruleset "main: CI must pass", once `ui` has been green three times in a row on `main`.
- Flip `signup_open` (`npm run invites -- open`) only when ready to let anyone in. Leaving it "off" is a valid choice.
- Close #271 and #312–#320 with the comment "Superseded by the two-theme decision (ADR 0012, spec 2026-11-05)."

**Tests first:** none. The owner's check: `/course` loads, "Start this Topic over" works on one Topic, and a new reply on `/study` shows a Widget.

**Done when:**
- The owner comments "done" on this issue with the list of migrations `db:migrate` applied.
- #248, #271 and #312–#320 are closed or have a comment saying why not.
- The ruleset lists `ui`, or the comment says it is deferred.

**Critic check:** none.

**Find it:**
```bash
rg -n 'widget_engine' src/tutor/session-log.ts
ls drizzle | tail -3
```

**Hot files:** none.

---
## 8. Critics

Critics are S6 agents. They judge what tests can't. Each has **inputs**, a **rubric**, a **JSON output**, a **pass bar** and a **model tier**. Prompts live in `docs/critics/<name>.md`, written once by T-01.

**Common rules**
- **Output is JSON only**, matching the shape given. No prose.
- **Tiers:** judges (Beginner persona and Final review) run on **opus, effort medium**, at most **2 judges per workflow run**. All other critics run on **sonnet, medium**.
- **A critic finding is not a fix.** It becomes a fix only after the **adversarial-verify rule**: a second agent (fresh context, told to refute) reads the finding and the evidence and tries to show it is wrong. If it fails to refute, the finding is confirmed. For **high-stakes** findings (security, a wrong historical fact, a sum asked, data loss) three agents vote and **≥ 2 of 3** must fail to refute.
- Confirmed findings become a fix in the current goal loop (§9) or, when out of the loop's budget, a `needs-triage` issue. Refuted findings are logged and dropped.
- Never SendMessage a running critic. Edit the prompt file or stop and relaunch.

### 8.1 Affordance critic
- **Inputs:** screenshots at 1512×982, Light and Dark, of `/study`, `/course`, `/notebook`, `/settings`, `/login`, plus the `auditAffordances()` report (Appendix C.3).
- **Rubric questions:**
  1. Can you tell, without hovering, which things are buttons? List any that look like plain text.
  2. Does any static label (pill, tag, badge) look pressable?
  3. Is the primary action on each page obvious in two seconds?
  4. Does every icon-only button have a visible edge or face?
  5. Do pressed, hover, focus and disabled states look different from each other?
- **Output:** `{"scores":{"q1":0-5,...},"findings":[{"page":"","element":"","problem":"","severity":"low|med|high"}]}`
- **Pass bar:** every score ≥ 4; 0 `high` findings. **Tier:** sonnet.

### 8.2 Space critic
- **Inputs:** `measureLayout()` JSON (Appendix C.2) at 1024, 1280, 1512 and 1920; screenshots of the same.
- **Rubric questions:**
  1. Is any large area empty that content could use?
  2. Does the Widget panel dominate without cramping the chat?
  3. Do wide screens use extra width for content, not only for margins?
  4. Is prose still readable (no 120-character lines)?
  5. Any clipped, overlapping or scrolling-inside-scrolling content?
- **Output:** `{"measurements":{"gutterPx":0,"widgetPct":0,"chatPct":0},"scores":{...},"findings":[...]}`
- **Pass bar:** metrics in §6.2 all met and every score ≥ 4. **Tier:** sonnet.

### 8.3 Colour and liveliness critic
- **Inputs:** screenshots of 6 states (reply with Story scene, Lingo card, Choices, Course Map, Notebook, a wrong-choice mix-up fix), Light and Dark.
- **Rubric questions:**
  1. Are there accents beyond one blue, and does each carry its meaning (mint you, coral loss, sunflower history, violet lingo)?
  2. Does anything look "tacky" (clashing, neon, clip-art)?
  3. Does the picture feel alive (motion, depth, expression), not a chart?
  4. Is text still easy to read on every accent?
  5. Do Light and Dark feel like one product?
- **Output:** as 8.1. **Pass bar:** every score ≥ 4; 0 `high`. **Tier:** sonnet.

### 8.4 Beginner persona ("Kabir")
- **Persona:** *Kabir, 20, wealthy, hates maths, phone-first attention span. Wants to understand money talk at family dinners and with the bank. Gets bored in 20 seconds. Does not do sums.*
- **Inputs:** transcripts (Learner messages, Tutor replies, the Widget's text description, Choices) from the 20-prompt eval or a batch's questions, plus screenshots of 3 turns. Inside the Delight eval it runs as the judge in Appendix D.2.1.
- **Rubric questions** (each scored 0–5 unless stated):
  1. Fun: did you want the next turn?
  2. Lingo learned: name the new words you now understand (a count) and use one in a sentence (yes/no).
  3. Felt like an exam: yes/no, and quote the line.
  4. Was any question a sum? (yes/no)
  5. Would you tap a Choice or type? Which and why?
- **Output:** `{"fun":0-5,"lingoLearned":0-1,"lingoWords":[""],"feltLikeExam":false,"sumAsked":false,"quote":"","notes":""}`
- **Pass bar:** median fun ≥ 4/5; lingo learned ≥ 80 % of transcripts; `feltLikeExam` false and `sumAsked` false in 100 %; a D2 or E6 batch needs a persona median ≥ 4/5 on its Topics. **Tier: opus medium (judge).**

### 8.5 Math police
- **Inputs:** a set of course files (a D2 or E6 batch) or a list of Tutor replies. Inside the Delight eval it runs as Appendix D.2.2.
- **Rubric questions:**
  1. Does any question ask the Learner to compute, calculate, work out, find a number, or type a figure?
  2. Does any choice set require arithmetic to tell right from wrong, instead of knowing the idea?
  3. Does any Quick try, Check, Review or reply stem say "how many", "how much", "what is X% of", "to N decimal places"?
  4. Do wrong choices have a mix-up fix, and is it a slip, not random?
- **Output:** `{"checked":0,"violations":[{"file":"","id":"","stem":"","why":""}]}`
- **Pass bar:** **0 violations** (100 % of D2 and E6 output). A violation is high-stakes: 3 votes. **Tier:** sonnet.

### 8.6 Historian
- **Inputs:** story scenes, Lingo cards and Case text in the batch, plus the Topic's `outline.yaml` sources and the Case's as-of date. Inside the Delight eval it runs as Appendix D.2.4.
- **Rubric questions:**
  1. Is every date, person, number and event in the story supported by the Topic's sources?
  2. Does the story reveal an outcome after the as-of date before the reveal step?
  3. Does it invent a quotation or a character presented as real?
  4. Does it give a buy or sell call?
- **Output:** `{"claims":[{"text":"","source":"","supported":true}],"findings":[...]}`
- **Pass bar:** every claim supported; 0 as-of leaks; 0 buy/sell calls. A wrong fact is high-stakes: 3 votes. **Tier:** sonnet (the vote runs on opus for D2c, D2e, D2f, D2h and E6a–E6c).

### 8.7 Security
- **Inputs:** the diff of C1a, C1b, C3 or B3a plus a list of routes.
- **Rubric questions:**
  1. Can an uninvited email get a Learner (race, case, plus-address, unverified email, second account link)?
  2. Open redirects through `callbackURL`, `next` or `errorCallbackURL`?
  3. Session cookie flags (`httpOnly`, `secure`, `sameSite`) and lifetime; sign-out removes the row?
  4. CSRF and same-origin checks on `POST` routes; `trustedOrigins` as small as possible?
  5. Is `testUtils` or the `dev-e2e` route reachable in a production build?
  6. Can Learner A read or restart Learner B's Topic?
  7. Secrets in the repo, logs or client bundle?
- **Output:** `{"findings":[{"id":"","where":"file:line","attack":"","severity":"low|med|high|critical","fix":""}]}`
- **Pass bar:** 0 confirmed `high`, `critical` or `med`. Every finding at `med` or above goes to 3 votes. **Tier:** sonnet (opus for the vote on a `critical`).

### 8.8 Final two-axis code review
- **Inputs:** the whole spec's merged changes since commit `9b8b6e4`; this file; `/code-review` skill.
- **Axes:** **Standards** (repo coding standards, CLAUDE.md, ADRs, glossary) and **Spec** (does the code do what each ticket's Done-when says).
- **Rubric questions:** per ticket, is every Done-when met, with evidence? Any dead code, any duplicated logic, any test that asserts nothing?
- **Output:** the `ReportFindings` shape: `{"findings":[{"file":"","line":0,"summary":"","failure_scenario":"","verdict":"CONFIRMED|PLAUSIBLE"}]}`
- **Pass bar:** 0 confirmed `high`; the rest become one fix PR (F2). **Tier: opus medium (judge).**

### 8.9 Widget fit
- **Inputs:** a Widget's screenshot and program, plus the reply it came with (or a fixture alone). Inside the Delight eval it runs as the judge in Appendix D.2.3.
- **Rubric questions:** does the Widget show the reply's one idea; does it feel alive; is each emoji meaningful or decorative; would it make sense alone; what kind is it (`story | lingo | timeline | chart_only | other`)?
- **Output:** the JSON of Appendix D.2.3.
- **Pass bar:** median match ≥ 4/5; 0 `chart_only` in the 20-prompt eval. **Tier:** sonnet on fixtures (E2a, E2b, E4a); opus inside the Delight eval.

---

## 9. Orchestration contract for the implementing session

The next session runs **plan mode, then `/to-spec`, then `/to-tickets`, then `/implement-spec`**, as one self-orchestrated Workflow. This section is its contract.

### 9.1 Waves and the ticket graph

The work is **frontier-driven**: a ticket starts the moment its dependencies are closed. The waves are the expected shape, not a barrier.

**The edge list** (the one source; ticket headers and Appendix E use it). "W0" means T-00 and T-01: every ticket except T-00, T-01, C2, C3 and H1 depends on both.

| Ticket | Depends on | Ticket | Depends on |
|---|---|---|---|
| T-00 | – | B3a | W0 |
| T-01 | – | B3b | W0, B3a, A5, B2a |
| A1 | W0 | C1a | W0 |
| A2 | W0, A1 | C1b | W0, C1a, A3a |
| A3a | W0 | C2 | C1b |
| A3b | W0, A3a | C3 | C2 |
| A4 | W0 | D1a | W0 |
| A5 | W0, A3b, A4, B2a | D1b | W0, D1a |
| D1c | W0, D1a | | |
| B1 | W0, A1 | D2a–D2j | W0, D1b |
| B2a | W0, A1 | D3a | W0, D1a, E1 |
| B2b | W0, B2a | D3b | W0, D3a |
| E1 | W0 | E4a | W0, E3, D3a, D3b |
| E2a | W0, E1, A4 | E4b | W0, D3b |
| E2b | W0, E2a | E5 | W0, A1, E2a |
| E3 | W0, E2b | E6a–E6c | W0, E3, D1b |
| F1 | every ticket except C2, C3, H1 | F2 | F1 |
| H1 | B3b, C1b, E4a | | |

**Waves** (the longest path to each ticket):

| Wave | Tickets |
|---|---|
| 0 | T-00, T-01 |
| 1 | A1, A3a, A4, B3a, C1a, D1a, E1 |
| 2 | A2, A3b, B1, B2a, C1b, D1b, D1c, D3a, E2a |
| 3 | A5, B2b, C2 (owner), D2a–D2j, D3b, E2b, E5 |
| 4 | B3b, C3 (after C2), E3, E4b |
| 5 | E4a, E6a–E6c |
| 6 | goal loops G1, G2, G3 (§9.4); then F1, F2; H1 (owner) any time after B3b, C1b and E4a |

The graph has no cycles. 45 tickets in all: 43 `ready-for-agent`, 2 `ready-for-human` (C2, H1).

### 9.2 Lanes and file ownership

One worktree per lane (`isolation: "worktree"`, branch from `main`, PR to `main`). **At most 8 lanes at once.** A hot file has **one owner at a time**, in the order below; the next owner waits for the earlier PR to merge, then rebases.

| Hot file | Owners, in order |
|---|---|
| `package.json`, lockfile | T-00 → C1a → E4b |
| `next.config.ts` | T-00 → B1 → B2a |
| `.github/workflows/ci.yml`, `playwright.config.ts` | T-00 → C1b |
| `src/db/schema.ts`, `drizzle/` | C1a → B3a → E4a |
| `src/app/globals.css` | A4 → A3a → A1 → E2a → A2 → E5 |
| `src/app/ui.tsx` | A3a → A1 → A2 → A5 |
| `src/app/workspace-frame.tsx`, `src/app/topic-header.tsx` | A1 → A2 → E5 → B3b |
| `src/app/left-column.tsx` | A1 → D3a → A2 |
| `src/app/thread.tsx`, `src/app/message-box.tsx` | A1 → A2 |
| `src/app/widget-panel.tsx` | A1 → A3b → A2 → B2b → E5 |
| `src/app/workspace-parts.tsx` | A3b → D3a → B3b |
| `src/app/quick-try-view.tsx`, `quiz-panel.tsx`, `review-panel.tsx` | D1a → A3b |
| `src/app/settings/settings-view.tsx` | E1 (credit line) → A4 → A5 → B3b |
| `src/app/settings/settings-controls.tsx`, `theme-menu.tsx`, `theme.ts` | A4 → A3b → A5 |
| `src/proxy.ts`, `src/auth/learners.ts`, `src/auth/session.ts`, `src/app/login/page.tsx` | C1a → C1b → C3 |
| `src/tutor/instructions.ts` | D3a → D3b → E3 → E4a |
| `src/tutor/reply-checks.ts` | D3a → E4a |
| `src/tutor/tools.ts` | D3a → B2b → E3 → E4a |
| `src/tutor/practice.ts` | D1a → E4a |
| `src/course/lesson-lint.ts`, `scripts/check-course.mjs` | E1 (L11) → D1b (L10) |
| `src/widgets/library.tsx`, `frozen.generated.json`, `src/widgets/primitives/wave2/*`, `src/widgets/recipes/set-tutor.ts` | D1c → E2a → E2b → E3 |
| `src/course/l10-allowlist.ts` | D1b creates it; D2a–D2j and E6a–E6c delete lines only, so they may run in parallel |
| `docs/architecture.md`, `GLOSSARY.md`, `docs/adr/*` | every ticket: append-only sections, one writer per ADR number (§3.5); the later PR resolves conflicts |

**Migration numbers are not fixed.** Each ticket takes the next free number when it rebases, via `npm run db:generate`. No test or doc names a number; tests find a migration by its table or column (`invites`, `topic_restarts`, `reply_checks.widget_source`). Expected order: C1a, B3a, E4a. A lane that touches `drizzle/` rebases on `main` just before its PR, re-runs `npm run db:generate` (it must write nothing new) and the migration test on PGlite. Never edit a merged migration. The owner runs `db:migrate` (C2, H1).

### 9.3 Models and concurrency

- **Sonnet, medium effort** for most lanes.
- **Opus, medium** for C1a, C1b, D3a, D3b, E4a, and for the two judges (Beginner persona, Final review).
- A failed lane gets **one** opus retry. If it fails again it becomes `needs-triage`, its dependents wait, and the run goes on with the rest of the frontier.
- Critics on their own tiers (§8). Worktree per lane. ≤ 8 lanes at once. RAM pauses are normal; do not kill lanes for slowness.
- **No lane edits more than 25 files.** If a ticket needs more, stop and split it (comment on the issue).

### 9.4 Goal loops

Each loop has a metric, a round cap and a budget. A loop exits when its bar is met or its cap is hit; if the cap is hit, the remaining gaps become `needs-triage` issues.

**Live-eval ledger for the whole spec** (S5, paid): D3b `tutor:eval` up to 2 runs at ≤ $8 each ($16); G2 up to 3 rounds at ≤ $13 each ($39). **Total cap $55.** The run stops at the cap and hands the rest to the owner. The final report states the spend.

**G1 · Layout and affordance** (max **3 rounds**; starts when A1–A5, B1–B3b and E5 are merged)
- Run the S1 metrics (§6.2) plus the Affordance, Space and Colour and liveliness critics.
- Bar: all layout metrics met; critics pass; contrast script green.
- Each round: verified findings become fix lanes (sonnet); re-measure.

**G2 · Delight** (max **3 rounds**, ≤ $13 a round; starts when E4a, E4b and E6a are merged)
- Run `npm run delight:eval -- --judge` (Appendix D) on a Neon test branch with `EVAL_DB_OK=branch` and `widget_engine` on.
- Bar: every row of Appendix D.3 (Widget 20 of 20; 0 sums; Choices 20 of 20; fun median ≥ 4; lingo learned ≥ 80 %; exam false on 20 of 20; 0 chart-only Widgets).
- Each round: fix the cause in code first (picker, Choices, V8), prompts last; re-run.

**G3 · Content** (loops until `L10_NOT_YET_STORY` is empty)
- Each batch (D2a–D2j, E6a–E6c) empties its Topics from the allowlist. Every batch must also pass **Math police (0)** and **Beginner persona ≥ 4/5** on its Topics, and `npm run course:check`.
- A batch that fails goes back to a sonnet lane once, then to an opus lane once, then to `needs-triage`.

### 9.5 Stop conditions

Stop the whole run and hand back when any of these is true:
- the live-eval ledger reaches $55;
- a critic confirms a `critical` security finding;
- a migration would need the production database;
- CI is red on `main` (a red `ui` job on `main` counts);
- 6 hours of wall time or 40 merged PRs.

Not a stop:
- **C2 still open** when F1's other blockers are closed: run F1 and F2 anyway; the final report lists C2, C3 and H1 as waiting on the owner. C3 starts only after C2 closes.
- **`widget_engine` still off in production** (#248): E4a's code lands and is measured on a test branch (E4a); go-live is H1.

### 9.6 What goes back to the owner

- **C2** (`ready-for-human`): the checklist in Appendix F.1.
- **H1** (`ready-for-human`): the checklist in Appendix F.2: production migrations, `widget_engine` (#248), the `ui` ruleset entry, `signup_open` when ready, closing #271 and #312–#320.
- **Costly or hard to undo:** deleting the passcode door (C3), publishing the Google app, anything touching the production database.
- A short report: what merged, the metric numbers, what became `needs-triage`, the live-eval spend against the $55 ledger.

### 9.7 Lessons to encode (they cost time before)

- **Exit plan mode before launching Workflows.** Agents inherit plan mode and do nothing.
- **Pass work lists to agents as file paths, not as arguments.**
- **Never SendMessage a running Workflow agent.** It spawns a duplicate. Edit the brief, or stop and relaunch.
- **Closing keyword per line.** `Closes #1` newline `Closes #2`, never `Closes #1, #2`.
- **Check the ticket closed after the merge.** Auto-merge does not always close it.
- **One integrator** runs the full `npm run check`, `npm run build` and `npm run ui:test` on `main` after each wave; CI re-runs on every PR anyway.
- **PRs go to `main`, never an integration branch** (the board stays blocked).

---

## Appendix A · Colour tokens for Light and Dark

**A.1 Token CSS.** This block replaces the `:root` and `:root.dark` blocks of `src/app/globals.css` (lines 44-83 and 174-204) and deletes the Paper and Forest blocks (lines 207-269). The values were run through the same maths as `scripts/check-theme-contrast.mjs` (WCAG 2 ratio, APCA, OKLCH); A.2 lists the key results. Token names used everywhere in this spec: `--brand-main`, `--brand-deep`, `--brand-soft`, `--mint`, `--coral`, `--sun` (sunflower), `--violet`, each accent with `-ink`, `-tint` and `-tag`. If a ticket changes a value, rerun the script: it is the judge, not this text.

```css
/* Light (default). Screen and print. Royal blue in three tones plus four accents, each with a meaning.
   Rule of thumb: a FILL (--mint, --coral, --sun, --violet, --brand-main) never carries text; text, thin lines and
   chart labels use the -ink variants, which pass 4.5:1. Surfaces are a cool off-white, never pure grey. */
:root {
  color-scheme: light;
  /* Surfaces and text */
  --bg: #f6f8ff;            /* page */
  --field: #ffffff;         /* inputs, cards, popovers (one step up) */
  --bubble: #e6ecff;        /* Learner message bubble */
  --hairline: #e4e9f7;      /* dividers, hover fills */
  --border: #c5cee6;        /* decorative borders (cards); not for controls */
  --edge: #6677a3;          /* control borders and button lips: 4.2:1 on --bg, so a button is seen */
  --data: #c5cee6;          /* neutral chart data */
  --muted: #44527a;         /* secondary text */
  --ink: #121a33;           /* body text */
  /* Royal blue: deep / main / soft */
  --brand-main: #2f5bea;    /* MAIN: primary button fill, active step, charts, focus ring */
  --brand: #2449c4;         /* blue for TEXT and links (7.0:1 on --bg) */
  --brand-hover: #2a52d6;   /* primary hover fill */
  --brand-pressed: #2347be; /* primary pressed fill */
  --brand-deep: #1e3a8a;    /* DEEP: the lip under the primary button, avatar text, headings on soft */
  --ring: #2f5bea;          /* focus ring */
  --brand-ink: #ffffff;     /* text on brand fills */
  --brand-tint: #dce6ff;    /* SOFT: active-step chip, info background */
  --brand-soft: #dce6ff;    /* same value; the name the owner used */
  --brand-line: #afc3f7;    /* border of soft controls */
  /* Accents. fill / ink (text) / tint (card) / tag (pill) */
  --mint: #12b886;          /* 'you' and gains */
  --mint-ink: #0b7a5a;
  --mint-tint: #ddf7ec;
  --mint-tag: #d2f4e6;
  --coral: #ff6b57;         /* losses and warnings */
  --coral-ink: #bd2f1e;
  --coral-tint: #ffe6e1;
  --coral-tag: #ffddd6;
  --coral-fill: #bd2f1e;    /* danger button fill under white text (5.9:1) */
  --coral-deep: #8f2012;    /* danger button lip */
  --sun: #ffc233;           /* history and stories */
  --sun-ink: #8a5a00;
  --sun-tint: #fff1c9;
  --sun-tag: #ffe49a;
  --violet: #8b5cf6;        /* lingo */
  --violet-ink: #6d3ad9;
  --violet-tint: #ebe2ff;
  --violet-tag: #e4d9ff;
  /* Old names, kept so no component changes: 'you' is mint, 'src' (sourced history) is sunflower */
  --you: #0b7a5a;
  --you-line: #12b886;
  --you-tint: #ddf7ec;
  --you-tag: #d2f4e6;
  --you-tag-ink: #0b7a5a;
  --src: #8a5a00;
  --src-line: #ffc233;
  --src-tint: #fff1c9;
  --src-tag: #ffe49a;
  --src-tag-ink: #8a5a00;
  --danger: #bd2f1e;
  /* Not colour-checked: the soft drop shadow under raised controls, and the top-highlight strength */
  --shadow: rgb(18 26 51 / 0.22);
  --hi: 0.1;                /* white at 10% on the top of a raised button: white label stays 4.6:1 */
  /* Landing page only; the same in every theme. */
  --navy-deep: #001647;
  --navy-deeper: #001034;
  --navy-ink: #ffffff;
  --navy-accent: #6699ff;
  --navy-muted: #a6a09b;
  /* Interaction timing (kept as today). The layout and type lines below are added by A1 and A2, not by A4. */
  --dur-press: 90ms;
  --dur-ui: 150ms;
  --dur-panel: 200ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --gutter: clamp(12px, 1.6vw, 32px);
  --gap: clamp(16px, 1.6vw, 28px);
  --page-max: 2200px;
  --header-h: 52px;
  --text-chat: 15px;
  --lh-chat: 24px;
  --text-ui: 14px;
  --text-small: 13px;
}

/* Dark (replaces Midnight). Screen only: print falls back to Light. A deep navy, soft blue-white text, DESATURATED
   accents (the checker caps OKLCH chroma at 0.135 so nothing vibrates). On dark, an accent is already text-safe,
   so --X-ink equals --X. Tints are 8% alpha, so they sit on whatever surface is under them. */
@media screen {
  :root.dark {
    color-scheme: dark;
    --bg: #141a33;
    --field: #1b2142;
    --bubble: #222a52;
    --hairline: #222a52;
    --border: #2e3866;
    --edge: #6b7aae;          /* 4.1:1 on --bg */
    --data: #2e3866;
    --muted: #9faed6;
    --ink: #dce4fa;           /* 13.5:1 on --bg: strong but not glaring */
    --brand-main: #4466d8;    /* primary fill, white label 5.1:1, 3.4:1 against the page */
    --brand: #93abf5;         /* links and active text */
    --brand-hover: #3f60d0;
    --brand-pressed: #3652bb;
    --brand-deep: #26357f;    /* lip under the primary button */
    --ring: #93abf5;
    --brand-ink: #ffffff;
    --brand-tint: #232c5a;
    --brand-soft: #232c5a;
    --brand-line: #3f5496;
    --mint: #66cdaa;
    --mint-ink: #66cdaa;
    --mint-tint: #66cdaa14;
    --mint-tag: #1e3b3a;
    --coral: #f28b7d;
    --coral-ink: #f28b7d;
    --coral-tint: #f28b7d14;
    --coral-tag: #43262f;
    --coral-fill: #c04332;    /* danger button fill under white text (5.1:1) */
    --coral-deep: #7e2a20;
    --sun: #e8be5c;
    --sun-ink: #e8be5c;
    --sun-tint: #e8be5c14;
    --sun-tag: #3f3727;
    --violet: #b09af2;
    --violet-ink: #b09af2;
    --violet-tint: #b09af214;
    --violet-tag: #33294f;
    --you: #66cdaa;
    --you-line: #66cdaa;
    --you-tint: #66cdaa14;
    --you-tag: #1e3b3a;
    --you-tag-ink: #66cdaa;
    --src: #e8be5c;
    --src-line: #e8be5c;
    --src-tint: #e8be5c14;
    --src-tag: #3f3727;
    --src-tag-ink: #e8be5c;
    --danger: #f28b7d;
    --shadow: rgb(0 0 0 / 0.5);
    --hi: 0.06;               /* white at 6%: the label stays 4.55:1 */
  }
}
```

**A.2 Contrast results** (WCAG 2 ratio; every row passes in both themes):

| Pair | Minimum | Light | Dark |
|---|---|---|---|
| `--ink` on `--bg` | 7:1 | 16.2 | 13.5 |
| `--ink` on `--field` | 7:1 | 17.2 | 12.3 |
| `--ink` on `--bubble` | 7:1 | 14.6 | 10.9 |
| `--ink` on `--brand-tint` | 7:1 | 13.8 | 10.5 |
| `--muted` on `--bg` | 4.5:1 | 7.2 | 7.8 |
| `--muted` on `--field` | 4.5:1 | 7.7 | 7.1 |
| `--brand` on `--bg` | 4.5:1 | 7.0 | 7.7 |
| `--brand` on `--brand-tint` | 4.5:1 | 5.9 | 5.9 |
| `--brand-ink` on `--brand-main` | 4.5:1 | 5.5 | 5.1 |
| `--brand-ink` on `--coral-fill` | 4.5:1 | 5.9 | 5.1 |
| `--mint-ink` on `--bg` | 4.5:1 | 5.0 | 8.9 |
| `--mint-ink` on `--mint-tint` | 4.5:1 | 4.7 | 7.7 |
| `--coral-ink` on `--bg` | 4.5:1 | 5.5 | 7.2 |
| `--coral-ink` on `--coral-tint` | 4.5:1 | 4.9 | 6.4 |
| `--sun-ink` on `--bg` | 4.5:1 | 5.6 | 9.8 |
| `--sun-ink` on `--sun-tint` | 4.5:1 | 5.3 | 8.4 |
| `--violet-ink` on `--bg` | 4.5:1 | 6.1 | 7.1 |
| `--violet-ink` on `--violet-tint` | 4.5:1 | 5.2 | 6.3 |
| `--edge` on `--bg` | 3:1 | 4.2 | 4.1 |
| `--edge` on `--field` | 3:1 | 4.4 | 3.7 |
| `--ring` on `--bg` | 3:1 | 5.2 | 7.7 |
| `--brand-main` on `--bg` | 3:1 | 5.2 | 3.4 |

Dark also passes the existing absolute rules: `--ink` on `--bg` 13.5:1 (allowed 9 to 15), APCA Lc 89 (min 75), `--bg` OKLCH lightness 0.226 (0.20 to 0.34), surfaces rise `--bg` 0.226 < `--field` 0.261 < `--hairline` 0.300 < `--border` 0.356, and chroma of `--brand` 0.110, `--mint` 0.110, `--coral` 0.128, `--sun` 0.126, `--violet` 0.126 (max 0.135). The Dark primary fill `--brand-main` is a button, not text, so it has its own cap of 0.20 (it is 0.179).

**A.3 Rules the updated checker enforces** (`TEXT` pairs `[foreground, background, minimum]`, run on Light and Dark):
- `ink` on `bg`, `field`, `bubble`, `brand-tint` and every `*-tint` and `*-tag`: 7.
- `muted` on `bg`, `field`, `hairline`, `bubble`, `brand-tint` and every `*-tint`: 4.5.
- `brand` on `bg`, `field`, `brand-tint`: 4.5. `brand-ink` on `brand-main`, `brand-hover`, `brand-pressed`, `coral-fill`: 4.5.
- Each accent's `-ink` on `bg`, `field`, its `-tint` and its `-tag`: 4.5. `you`, `src`, `danger` on `bg`: 4.5; the two `*-tag-ink` on their tags: 4.5.
- `edge` on `bg` and `field`: 3. `ring` on `bg` and `field`: 3. `brand-main` and `coral-fill` on `bg`: 3.
- Light is also **frozen**: every Appendix A.1 Light value must be unchanged (the new `LIGHT_FROZEN`). Change it only with an ADR note.
- Dark only: the absolute rules above, chroma ≤ 0.135 for `brand`, `you`, `you-line`, `src`, `src-line`, `danger` and every accent and `-ink`; `*-tint` alpha ≤ 0.10.
- Fills (`--mint`, `--coral`, `--sun`, `--violet`) are not text and are not contrast-checked on their own, except as chart series (below). **Rule:** a UI fill never carries meaning alone and never has text on it, except the buttons built from `--brand-main` and `--coral-fill`, which are checked. A fill that has to carry meaning alone (WCAG 2.2 SC 1.4.11) goes on the script's `COLOUR_ONLY` list as `[fill, surface]` and is then checked at 3:1 in both themes. No accent fill used as a UI fill is on it, since every such use is decorative or paired with a text label or an icon (§4 rule 4, §6.2, issue #457). Chart series are on it, `--violet` included, because a series mark carries its meaning by colour. The chart series are: each `CHART_SERIES` token (`brand-main`, `mint-ink`, `sun-ink`, `violet`, `coral-ink`, `edge`) on `bg` and on `field`, 3.

**A.4 OpenUI mapping** (`globals.css:114-172` and `src/widgets/genui-theme.tsx`; a test keeps them equal). Change these lines, leave the rest:

| Kit variable | Now |
|---|---|
| `--openui-text-success-primary` / `-inverted` | `var(--mint-ink)` / `var(--brand-ink)` |
| `--openui-success-background` | `var(--mint-tint)` |
| `--openui-border-success` / `-emphasis` | `var(--mint)` / `var(--mint-ink)` |
| `--openui-text-alert-primary` | `var(--sun-ink)` |
| `--openui-alert-background` | `var(--sun-tint)` |
| `--openui-border-alert` / `-emphasis` | `var(--sun)` / `var(--sun-ink)` |
| `--openui-text-danger-primary` / `-secondary` / `-tertiary` | `var(--coral-ink)` |
| `--openui-danger-background` | `var(--coral-tint)` |
| `--openui-border-danger` / `-emphasis` | `var(--coral)` / `var(--coral-ink)` |
| `--openui-interactive-accent-default` / `-hover` / `-pressed` | `var(--brand-main)` / `var(--brand-hover)` / `var(--brand-pressed)` |
| `--openui-interactive-accent-disabled` | `color-mix(in srgb, var(--brand-main) 40%, transparent)` |
| `--openui-border-interactive-selected`, `-accent-emphasis`, `-info-emphasis` | `var(--brand-main)` |
| `--openui-info-background` | `var(--brand-soft)` |
| Chart series (`CHART_PALETTES`), in order | `brand-main`, `mint-ink`, `sun-ink`, `violet`, `coral-ink`, `edge` (the resolved values of each theme; in Dark each `-ink` equals its fill) |

**Meaning of the accents, for every ticket after this one** (E2a, E2b and the Widgets use it): mint = the Learner's own numbers, choices and gains; coral = losses, falls and warnings; sunflower = history, dates and stories; violet = lingo (terms, jargon). Never use two accents for one meaning, and never use an accent for decoration only.

---

## Appendix B · Button anatomy

All values are tokens from Appendix A. The CSS goes in `globals.css` under `@layer components`. The React primitives (`src/app/primitives/`, A3a) only choose classes and set `data-affordance`.

```css
@layer components {
  /* B.1 Raised controls: .btn (button, link-as-button), .chip, .btn-icon */
  .btn, .chip {
    --lip: 3px;                       /* depth of the darker edge under the face */
    --face: var(--field);
    --label: var(--ink);
    --rim: var(--edge);               /* 1px border: 3:1 or better against the page */
    --lip-colour: var(--edge);
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border: 1px solid var(--rim);
    color: var(--label);
    background:                       /* top highlight (10% white in Light, 6% in Dark), then the face */
      linear-gradient(180deg, rgb(255 255 255 / var(--hi)) 0%, rgb(255 255 255 / 0) 60%), var(--face);
    box-shadow:
      0 var(--lip) 0 var(--lip-colour),                       /* the lip */
      0 calc(var(--lip) + 3px) 8px -1px var(--shadow);        /* the soft drop shadow */
    font-weight: 600; text-decoration: none; user-select: none; touch-action: manipulation;
    transition: transform var(--dur-press) var(--ease-out), box-shadow var(--dur-press) var(--ease-out),
                background-color var(--dur-ui) var(--ease-out);
  }
  .btn { min-height: 36px; padding: 0 16px; border-radius: 12px; font-size: var(--text-ui); line-height: 20px; }
  .btn-sm { min-height: 32px; padding: 0 12px; border-radius: 10px; font-size: var(--text-small); --lip: 2px; }
  .btn-icon { --lip: 2px; width: 36px; height: 36px; padding: 0; border-radius: 999px; }   /* a round, visible surface */
  .btn-icon svg { width: 18px; height: 18px; }
  .chip { min-height: 28px; padding: 0 12px; border-radius: 999px; font-size: var(--text-small); line-height: 16px;
          font-weight: 500; --lip: 2px; }                                                    /* a tappable pill */
  .chip[data-affordance="nav"] { min-height: 32px; }                                         /* header pages */

  /* B.2 Variants */
  .btn-primary { --face: var(--brand-main); --label: var(--brand-ink); --rim: var(--brand-deep); --lip-colour: var(--brand-deep); }
  .btn-danger  { --face: var(--coral-fill); --label: var(--brand-ink); --rim: var(--coral-deep); --lip-colour: var(--coral-deep); }
  /* secondary = the defaults above: field face, --edge rim and lip, ink label */
  .chip[aria-pressed="true"], .chip[data-state="showing"], .chip[aria-current="page"] {
    --face: var(--brand-tint); --label: var(--brand); --rim: var(--brand); --lip-colour: var(--brand);
  }

  /* B.3 States */
  @media (hover: hover) {
    .btn:hover:not(:disabled), .chip:hover:not(:disabled) { transform: translateY(-1px);
      box-shadow: 0 calc(var(--lip) + 1px) 0 var(--lip-colour), 0 calc(var(--lip) + 5px) 12px -2px var(--shadow); }
    .btn-primary:hover:not(:disabled) { --face: var(--brand-hover); }
  }
  .btn:active:not(:disabled), .chip:active:not(:disabled) {          /* pressed: the face sinks 2px, the lip shrinks to 1px */
    transform: translateY(2px);
    box-shadow: 0 1px 0 var(--lip-colour), 0 2px 4px -1px var(--shadow);
  }
  .btn-primary:active:not(:disabled) { --face: var(--brand-pressed); }
  .btn:focus-visible, .chip:focus-visible, .link:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .btn:disabled, .btn[aria-disabled="true"], .chip:disabled {
    box-shadow: none; transform: none; opacity: 0.55; cursor: not-allowed;       /* flat = "off" */
  }
  .btn:not(:disabled), .chip:not(:disabled) { cursor: pointer; }
  .btn[aria-busy="true"] { cursor: progress; }

  /* B.4 Inline links: underlined, so they never read as plain words */
  .link { color: var(--brand); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; border-radius: 4px; cursor: pointer; }
  .link:hover { text-decoration-thickness: 2px; color: color-mix(in srgb, var(--brand) 80%, var(--ink)); }

  /* B.5 Static tags: flat, square-ish (6px, chips are fully round), no shadow, no pointer, a dot instead of a lip */
  .tag { --tag-bg: var(--hairline); --tag-ink: var(--muted); --tag-dot: var(--edge);
         display: inline-flex; align-items: center; gap: 6px; min-height: 20px; padding: 0 8px; border-radius: 6px;
         background: var(--tag-bg); color: var(--tag-ink); font-size: 12px; line-height: 16px; font-weight: 500; box-shadow: none; cursor: default; }
  .tag::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--tag-dot); }
  .tag[data-tone="mint"]   { --tag-bg: var(--mint-tag);   --tag-ink: var(--mint-ink);   --tag-dot: var(--mint); }
  .tag[data-tone="coral"]  { --tag-bg: var(--coral-tag);  --tag-ink: var(--coral-ink);  --tag-dot: var(--coral); }
  .tag[data-tone="sun"]    { --tag-bg: var(--sun-tag);    --tag-ink: var(--sun-ink);    --tag-dot: var(--sun); }
  .tag[data-tone="violet"] { --tag-bg: var(--violet-tag); --tag-ink: var(--violet-ink); --tag-dot: var(--violet); }
  .tag[data-tone="brand"]  { --tag-bg: var(--brand-tint); --tag-ink: var(--brand);      --tag-dot: var(--brand-main); }

  /* B.6 Motion and forced colours */
  @media (prefers-reduced-motion: reduce) {
    .btn, .chip { transition: none; }
    .btn:hover:not(:disabled), .chip:hover:not(:disabled) { transform: none; }    /* press still changes the shape at once */
  }
  @media (forced-colors: active) { .btn, .chip { border-color: ButtonText; box-shadow: none; } }
}
```

**B.7 Sizes and roles.** `Button` md 36 px (`.btn`), sm 32 px (`.btn-sm`); `IconButton` 36 px round; `Chip` 28 px, header page pills 32 px; hit targets are never below 28 px (the audit enforces it). Use **primary** once per view for the one thing to do next; **secondary** for everything else that is a button; **danger** only for destructive confirms (Start over, restart a Topic); **chip** for choices the Learner makes inside content and for filters; **link** for navigation inside a sentence; **tag** for a status that cannot be pressed.

**B.8 Props.** `Button({ variant: "primary" | "secondary" | "danger", size: "md" | "sm", loading, pressed, as?: "button" | Link })`; `IconButton({ label })` (label is both `aria-label` and `title`); `Chip({ active, state: "idle" | "showing" | "drawing" })`; `TextLink`; `Tag({ tone: "neutral" | "mint" | "coral" | "sun" | "violet" | "brand" })`. Each renders `data-affordance` = `button | icon | chip | nav | link | tag`.

---

## Appendix C · Layout numbers and measuring scripts

**C.1 Column formula.** In `globals.css`: `--gutter: clamp(12px, 1.6vw, 32px)`, `--gap: clamp(16px, 1.6vw, 28px)`, `--page-max: 2200px`. Workspace grid: `grid-template-columns: minmax(360px, 2fr) minmax(0, 3fr)`, `column-gap: var(--gap)`. Reading pages: `.card-grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--gap) }`. Chat prose: `max-width: 34em` (510 px at 15 px).

Computed from the formula (inner width = viewport − 2 × gutter − gap; chat = 2/5, panel = 3/5):

| Viewport | Gutter | Gap | Chat col | Panel col | Chat % | Panel % | Chat text col | Chars/line* | Cards across (340 px) |
|---|---|---|---|---|---|---|---|---|---|
| 1024 | 16.4 | 16.4 | 390 | 585 | 38.1 | 57.1 | 358 | ≈50 | 2 |
| 1280 | 20.5 | 20.5 | 487 | 731 | 38.1 | 57.1 | 455 | ≈63 | 3 |
| 1512 | 24.2 | 24.2 | 576 | 864 | 38.1 | 57.1 | 510 | ≈71 | 4 |
| 1728 | 27.6 | 27.6 | 658 | 987 | 38.1 | 57.1 | 510 | ≈71 | 4 |
| 1920 | 30.7 | 28.0 | 732 | 1098 | 38.1 | 57.2 | 510 | ≈71 | 5 |
| 2560 | 32.0 (+180 centring) | 28.0 | 843 | 1265 | 32.9 | 49.4 | 510 | ≈71 | 6 |

\*Characters per line assumes about 7.2 px per character at 15 px (0.48 em, typical for the system font). The test measures the real figure (C.2); tune the `34em` cap between 32 em and 36 em if the real count falls outside 60 to 75 at 1280 and above. Above 2200 px the page centres, so the 55% panel rule applies up to 1920.

**C.2 Layout measurement.** Self-contained: paste it into the DevTools console, or run it from Playwright with `await page.evaluate(measureLayout)`. It needs the test ids `workspace-frame`, `widget-pane`, `reading-column` (all exist today) and `chat-column` (new in A1). T-00 saves C.2 and C.3 in `e2e/support/measure.ts`, which exports `measureLayout(page)` and `auditAffordances(page)` (each runs the function below through `page.evaluate`).

```js
function measureLayout() {
  const doc = document.documentElement;
  const vw = doc.clientWidth, vh = window.innerHeight;
  const box = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
  const frame = box('[data-testid="workspace-frame"]') || box('[data-testid="reading-column"]');
  const chat = box('[data-testid="chat-column"]');
  const panel = box('[data-testid="widget-pane"]');
  const header = box('header');
  const pct = (r) => (r ? Math.round((r.width / vw) * 1000) / 10 : null);
  const para = document.querySelector('[data-testid="assistant-message"] p');
  const input = document.querySelector('textarea');
  const fontOf = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
  const perLine = (el) => {                       // median characters on the full lines of a paragraph (needs 3+ lines)
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), lines = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const range = document.createRange();
      for (let i = 0; i < n.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const b = range.getBoundingClientRect();
        if (b.width) lines.set(Math.round(b.top), (lines.get(Math.round(b.top)) || 0) + 1);
      }
    }
    const counts = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    if (counts.length < 3) return null;
    counts.pop();                                  // the last line is short
    counts.sort((a, b) => a - b);
    return counts[Math.floor(counts.length / 2)];
  };
  return {
    viewport: { width: vw, height: vh },
    gutterLeft: frame ? Math.round(frame.left * 10) / 10 : null,
    gutterRight: frame ? Math.round((vw - frame.right) * 10) / 10 : null,
    chatWidthPct: pct(chat),                       // of the viewport width; target 36 to 42
    panelWidthPct: pct(panel),                     // of the viewport width; target 55 or more
    headerHeight: header ? Math.round(header.height * 10) / 10 : null,   // target 56 or less
    chatFontPx: fontOf(para) ?? fontOf(input),     // target 15
    charsPerLine: perLine(para),                   // target 60 to 75 from 1280 px up
    horizontalScroll: doc.scrollWidth > doc.clientWidth + 1,
  };
}
```

**C.3 Affordance audit.** Same use. A `data-affordance` attribute (A3a) says what an element is meant to be; the audit checks that it looks that way.

```js
function auditAffordances(root = document) {
  const INTERACTIVE = 'a[href], button, [role="button"], [role="menuitem"], [role="menuitemradio"], summary, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const visible = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
  const out = { interactiveWithoutSignifier: [], pointerOnStatic: [], staticLooksPressable: [], tooSmall: [], counts: {} };
  const kindOf = (el) => (el.closest('[data-affordance]') || el).getAttribute('data-affordance');
  const minSize = { button: 32, icon: 32, chip: 28, nav: 28 };
  let interactive = 0, tags = 0;
  for (const el of root.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    interactive++;
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), kind = kindOf(el);
    const raised = s.boxShadow !== 'none';
    const surface = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0;
    let ok = false;
    if (kind === 'button' || kind === 'icon' || kind === 'chip' || kind === 'nav') ok = raised && surface;
    else if (kind === 'link') ok = s.textDecorationLine.includes('underline');
    else if (el.matches('input, select, textarea')) ok = parseFloat(s.borderTopWidth) > 0;
    else if (el.matches('summary')) ok = !!el.querySelector('svg');
    if (!ok) out.interactiveWithoutSignifier.push(name(el));
    if (minSize[kind] && (r.height < minSize[kind] || r.width < minSize[kind])) out.tooSmall.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of root.querySelectorAll('*')) {       // nothing that cannot be pressed shows a pointer
    if (!visible(el) || el.closest(INTERACTIVE) || el.closest('label[for], [data-allow-pointer]')) continue;
    if (getComputedStyle(el).cursor === 'pointer') out.pointerOnStatic.push(name(el));
  }
  for (const el of root.querySelectorAll('[data-affordance="tag"]')) {   // static pills look static: flat, no pointer, 8px radius or less
    if (!visible(el)) continue;
    tags++;
    const s = getComputedStyle(el);
    if (s.boxShadow !== 'none' || s.cursor === 'pointer' || parseFloat(s.borderTopLeftRadius) > 8) out.staticLooksPressable.push(name(el));
  }
  out.counts = { interactive, tags };
  return out;                                           // a clean page returns four empty lists
}
```

---

## Appendix D · The Delight eval: prompts, judges and pass bars

### D.1 · The 20 prompts

**Setup:**
- The runner is `npm run delight:eval` (E4b), which is `widget-eval.mjs --set delight`.
- For each prompt it starts the tools Learner over, opens the Topic at the given step, sends the message, and keeps the reply, the Widget's screenshot and program, the Choices and `widget_source`.
- **The persona:** 20, wealthy, bright, bad at maths and bored by it, wants to sound fluent about money. Writes lower-case, short and casual.
- The file is `src/behaviour/delight/prompts.json`, an array of `{ id, topic, step, message }`.

| id | Topic | Step | Message |
|---|---|---|---|
| D01 | num-percent-bps | story | what even is a basis point lol |
| D02 | num-percent-bps | concept | why did the bank change the rate |
| D03 | num-percent-bps | concept | show me |
| D04 | num-percent-bps | your_turn | is this like my credit card? |
| D05 | num-percent-bps | check (quiz open) | just tell me the answer pls |
| D06 | num-compounding | story | explain like I'm 5 |
| D07 | num-compounding | concept | why does money grow faster later on |
| D08 | num-compounding | concept | my dad keeps saying CAGR, what is that |
| D09 | num-compounding | your_turn | quiz me but make it fun |
| D10 | num-compounding | reveal | wait did people lose money in 1992?? |
| D11 | num-probability | story | who even were these LTCM guys |
| D12 | num-probability | concept | what's expected value in normal words |
| D13 | num-probability | concept | so is this basically gambling |
| D14 | num-probability | concept | show me something cool |
| D15 | num-probability | concept | my friend says crypto is 50/50, is that how odds work |
| D16 | present-value | story | wait you can take the lottery all at once?? |
| D17 | present-value | concept | why is money today worth more than later |
| D18 | present-value | concept | ok this is boring, make it a story |
| D19 | present-value | your_turn | is the annuity like getting pocket money every month? |
| D20 | present-value | principle | how does this touch my life |

**Notes:**
- **D05** tests V5 and V8 together: no answer, no sum.
- **D15** tests the no-advice rule: teach how odds work, and never judge or recommend the crypto bet.
- **D10** is at reveal, so post-asOf facts are allowed.
- **T13** (D3b) uses D01–D10 twice, in order, as its 20-message dialogue.

### D.2 · Judge rubrics

**How every judge runs:**
- It runs on Opus (`claude-opus-5-5`), once per prompt.
- It gets the persona line, the Topic's title and step, the Learner's message, the reply text, the Choices, and the Widget's screenshot plus its program.
- The Historian also gets the outline Case.
- Each judge returns **only** the JSON shown. Any other output counts as a failed judgement and is re-asked once.

**D.2.1 · Beginner persona.**
- **The prompt:** "You are the Learner above. Read the reply and look at the picture as if they just appeared on your laptop."
- **Questions** (one score each):
  1. **fun:** How much did you enjoy this?
     - 1 = a textbook or a test; I'd close the tab
     - 2 = dry but short
     - 3 = fine, with one nice touch
     - 4 = a scene or picture I'll remember; I smiled once
     - 5 = I'd screenshot it for a friend
  2. **clarity:** Could you say back what it means?
     - 1 = no
     - 3 = the gist, but one word lost me
     - 5 = I could explain it in one line to a friend
  3. **lingo:** Which finance words did you learn, and could you use one?
     - 1 = none explained
     - 3 = explained, but not how pros say it
     - 5 = plain meaning, plus how pros say it, plus seen in the story
  4. **exam:** Did it feel like an exam or homework? (yes or no)
  5. **back:** Would you open the app again tomorrow? (yes or no)
```json
{ "id": "D01", "fun": 4, "clarity": 5, "lingo": { "score": 4, "terms": ["basis point"] }, "exam": false, "back": true,
  "best_line": "…", "worst_line": "…", "why": "≤ 40 words" }
```

**D.2.2 · Math police.**
- **The question:** "Did the Tutor, a Widget or a Choice ask the Learner to compute anything: a sum, a conversion to type, a number to work out?"
- **What is allowed:**
  - numbers given as facts;
  - choice labels that restate a number in a unit the Topic teaches as lingo ("25 bps");
  - sums the Tutor says as facts ("1 point times 100 is 100 bp").
- **What counts:**
  - any ask, question, Widget prompt or Choice that needs arithmetic to answer;
  - any typed-number input on screen.
- List each one; do not score.
```json
{ "id": "D05", "sums": [ { "where": "reply" , "quote": "…", "why": "asks for the bp of a 0.4-point move" } ], "count": 1 }
```
`where` is one of `reply | widget | choice | input`.

**D.2.3 · Widget fit.**
- **Questions:**
  1. **match:** Does the Widget show the reply's one idea?
     - 1 = unrelated
     - 3 = same Topic, different idea
     - 5 = the same idea, and it adds something the words do not
  2. **lively:** Does it feel alive?
     - 1 = a bare chart or form
     - 3 = clean but static
     - 5 = characters, motion or a story moment I want to tap
  3. **emoji:** Are the emoji meaningful (each one stands for a person, object or idea in the story) or decorative? List each decorative one.
  4. **alone:** Would it make sense without the reply? (yes or no)
  5. **kind:** one of `story | lingo | timeline | chart_only | other`. `chart_only` = its parts are only Chart, Slider, Stat or Waterfall.
```json
{ "id": "D03", "match": 5, "lively": 4, "emoji": { "meaningful": ["money-bag", "bank"], "decorative": [] }, "alone": true, "kind": "lingo", "source": "lingo", "why": "≤ 30 words" }
```

**D.2.4 · Historian.**
- **The task:**
  - List every factual claim in the reply, the Widget and the Choices: names, dates, figures and events.
  - Judge each against the Case's `sources`, `asOf` and `outcome` (from `course/outline.yaml`) and the step.
  - Before the reveal, anything after `asOf`, or any hint at the outcome, is `after_as_of`.
```json
{ "id": "D11", "claims": [ { "claim": "LTCM was founded in 1994", "verdict": "supported", "source": "<url>" } ],
  "wrong": 0, "after_as_of": 0, "unsupported": 0 }
```
`verdict` is one of `supported | unsupported | wrong | after_as_of`.

### D.3 · Pass bars (the same as §9 goal G2)

| Bar | Measured by | Pass |
|---|---|---|
| A Widget with every reply | `reply_checks.widget_source` not `none`/null, over the 20 prompts | 20 of 20 (100%) |
| No sum asked | Math police `count`, summed over the 20 | 0 |
| Choices on every reply | `reply_choices` items with 2–3 entries | 20 of 20 |
| Fun | Beginner persona `fun`, median over the 20 | ≥ 4 |
| Lingo learned | Beginner persona `lingo.score` ≥ 4 | ≥ 80 % of the 20 |
| Felt like an exam | Beginner persona `exam` | false on 20 of 20 |
| No chart-only Widget | Widget-fit `kind` = `chart_only` | 0 of 20 |

- **Also reported** (not G2 bars, but each failure opens a `needs-triage` issue with the JSON):
  - Historian `wrong + after_as_of` > 0 on any prompt;
  - Widget fit median `match` < 4.
- **Budget:** ≤ $13 a round (about 22 turns plus 80 judge calls), at most 3 rounds: $39 of the $55 ledger in §9.4.
- **Stop:** when every bar passes, or when the budget or round limit is hit. In that case the report and the open gaps go back to the owner.

---

## Appendix E · Creating the issues with `gh`

Run inside the repo, on a clean `main` checkout of the spec file. `gh` fills in `{owner}` and `{repo}` itself. The script reads the spec, so ticket titles and bodies are never typed twice. It makes the parent, one sub-issue per ticket (`ready-for-human` for C2 and H1, `ready-for-agent` for every other ticket), and one native blocked-by edge per dependency in §9.1, as `docs/agents/issue-tracker.md` describes. Check `gh repo view --json nameWithOwner` says `SiddharthMuramkar/finance-agent` first.

**Dry run first:** `bash -n create-issues.sh`, then `bash create-issues.sh --dry-run`. The dry run creates nothing; it finds the heading and body of every ticket id and prints one line each, and exits 1 if any is missing.

```bash
#!/usr/bin/env bash
set -euo pipefail
SPEC="docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md"
TMP="$(mktemp -d)"

# Every ticket id, in creation order (wave order, section 9.1).
AGENT_IDS="T-00 T-01 A1 A3a A4 B3a C1a D1a E1 A2 A3b B1 B2a C1b D1b D1c D3a E2a A5 B2b D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j D3b E2b E5 C3 B3b E3 E4b E4a E6a E6b E6c F1 F2"
HUMAN_IDS="C2 H1"

# Ticket text: from its "### <ID> · title" heading to the next heading or rule.
body_of () {  # $1 = ticket id, $2 = output file
  awk -v id="$1" '
    $0 ~ ("^### " id " · ") { on = 1; next }
    on && (/^### / || /^## / || /^---[[:space:]]*$/) { exit }
    on { print }
  ' "$SPEC" > "$2"
  [ -s "$2" ] || { echo "No text found for $1 in $SPEC" >&2; exit 1; }
}
title_of () {  # $1 = ticket id
  grep -m1 -E "^### $1 · " "$SPEC" | sed -E 's/^### [^ ]+ · //'
}

if [ "${1:-}" = "--dry-run" ]; then
  for id in $AGENT_IDS $HUMAN_IDS; do
    body_of "$id" "$TMP/$id.md"
    echo "$id  $(wc -l < "$TMP/$id.md") lines  $(title_of "$id")"
  done
  echo "Dry run OK: every ticket has a heading and a body."
  exit 0
fi

gh label create ready-for-agent -c 0E8A16 -d "Fully specified; an agent can implement it" 2>/dev/null || true
gh label create ready-for-human -c 1D76DB -d "Needs the owner's hands"                    2>/dev/null || true
gh label create needs-triage    -c FBCA04 -d "Needs a decision before work starts"        2>/dev/null || true

# 1. Parent: title = the file's H1, body = sections 1-5.
TITLE="$(grep -m1 '^# ' "$SPEC" | sed 's/^# //')"
awk '/^## 1\./ { on = 1 } /^## 6\./ { on = 0 } on' "$SPEC" > "$TMP/parent.md"
[ -s "$TMP/parent.md" ] || { echo "Sections 1-5 not found" >&2; exit 1; }
PARENT=$(gh issue create --title "$TITLE" --body-file "$TMP/parent.md" | grep -oE '[0-9]+$')
echo "Parent #$PARENT"

# 2. Sub-issues. Bash 3 (macOS) has no associative arrays, so numbers live in N_<id> and database ids in D_<id>.
var () { echo "$1" | tr -c 'A-Za-z0-9\n' '_'; }
add_ticket () {  # $1 = ticket id, $2 = label
  local id="$1" label="$2" n dbid v
  body_of "$id" "$TMP/$id.md"
  n=$(gh issue create --title "$(title_of "$id")" --label "$label" --body-file "$TMP/$id.md" | grep -oE '[0-9]+$')
  dbid=$(gh api "repos/{owner}/{repo}/issues/$n" --jq .id)
  gh api --method POST "repos/{owner}/{repo}/issues/$PARENT/sub_issues" -F sub_issue_id="$dbid" > /dev/null
  v=$(var "$id"); eval "N_$v=$n; D_$v=$dbid"
  echo "#$n  $id  $(title_of "$id")"
}
# Native blocked-by edge: $1 = ticket, $2.. = its blockers.
block () {
  local child="$1" b cv bv n bd
  shift
  cv=$(var "$child"); eval "n=\$N_$cv"
  for b in "$@"; do
    bv=$(var "$b"); eval "bd=\$D_$bv"
    gh api --method POST "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by" -F issue_id="$bd" > /dev/null
  done
}

for id in $AGENT_IDS; do add_ticket "$id" ready-for-agent; done
for id in $HUMAN_IDS; do add_ticket "$id" ready-for-human; done

# 3. The dependency graph (section 9.1). Each line: ticket, then the tickets it waits for.
# Wave 0 rule: every ticket except T-00, T-01, C2, C3 and H1 waits for T-00 and T-01.
for id in $AGENT_IDS; do
  case "$id" in T-00|T-01|C3) ;; *) block "$id" T-00 T-01 ;; esac
done
block A2  A1
block A3b A3a
block A5  A3b A4 B2a
block B1  A1
block B2a A1
block B2b B2a
block B3b B3a A5 B2a
block C1b C1a A3a
block C2  C1b
block C3  C2
block D1b D1a
block D1c D1a
for id in D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j; do block "$id" D1b; done
block D3a D1a E1
block D3b D3a
block E2a E1 A4
block E2b E2a
block E3  E2b
block E4a E3 D3a D3b
block E4b D3b
block E5  A1 E2a
for id in E6a E6b E6c; do block "$id" E3 D1b; done
block F1  A1 A2 A3a A3b A4 A5 B1 B2a B2b B3a B3b C1a C1b D1a D1b D1c D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j D3a D3b E1 E2a E2b E3 E4a E4b E5 E6a E6b E6c
block F2  F1
block H1  B3b C1b E4a

echo "Done. Check the board: gh issue list --state open --label ready-for-agent"
```

Notes for whoever runs it:
- `T-00` is the id in the heading and in the variable names; the helper turns `-` into `_`, so `T-00` becomes `N_T_00`.
- `F1` and `F2` also get the wave-0 edges from the loop; that is harmless.
- Re-running creates duplicates. If it stops half-way, close the stray issues by hand first.
- `gh` 2.94+ also has `gh issue create --blocked-by` and `--parent`; the `gh api` form above works on older versions too.
- Migration numbers are never named here (§9.2).

---

## Appendix F · The owner's manual steps

Claude cannot do any of these. It cannot create a Google Cloud project, it cannot set Vercel production variables for you, and production migrations and production reads are blocked for it on purpose. Ask for `/wizard`: it writes an interactive script that walks the steps below, one at a time, and checks each. Never paste a secret into an issue, a chat or a commit.

### F.1 · Google sign-in (ticket C2)

1. **Create a Google Cloud project.** Open console.cloud.google.com, click the project picker at the top, **New project**, name it "Value It".
2. **Set up the consent screen.** In the left menu, **APIs & Services → OAuth consent screen** (now called **Google Auth Platform**). Click **Get started**. App name "Value It", your email as support email. **Audience: External.** Keep publishing status **Testing**. Under **Test users**, add the same emails you will invite (up to 100). Authorized domain: `value-it.xyz`. Scopes: leave the defaults (`openid`, `email`, `profile`). Because only those basic scopes are used, any Google user can sign in during Testing without being on the test list, and there is no 7-day expiry; the invite list, not Google, is the gate.
3. **Create the OAuth client.** **Google Auth Platform → Clients → Create client → Application type: Web application.** Name "Value It web".
4. **Authorized JavaScript origins:** `https://www.value-it.xyz` and `http://localhost:3000`.
5. **Authorized redirect URIs (exact, no wildcard):** `https://www.value-it.xyz/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.
6. **Copy the Client ID and Client secret** when the dialog shows them (download the JSON if you like; keep it out of the repo).
7. **Set the Vercel variables, Production only** (Vercel dashboard → the project → **Settings → Environment Variables**): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (make it with `openssl rand -base64 32`; at least 32 characters), `BETTER_AUTH_URL` = `https://www.value-it.xyz`. Do not set them for Preview. For local use, put the same four in `.env` with `BETTER_AUTH_URL=http://localhost:3000`.
8. **Run the migrations on production:** `npm run db:migrate`. This applies all pending migrations, in order (the sign-in tables, and any other migration merged by then). Take a Neon snapshot first if you want a way back (Neon console → Branches or Backups).
9. **Invite yourself, linked to your existing progress:** `INVITES_DB_OK=<your production database host> npm run invites -- add <your email> --learner owner`. The command prints "linked to Learner 1". The host is the part of `DATABASE_URL` after `@` and before the first `/` (the script prints it and refuses if they differ).
10. **Deploy** (merge to `main` deploys `www.value-it.xyz` by itself), open `https://www.value-it.xyz/login`, click **Continue with Google**, choose your account. You should land in the Study Workspace with your own Topics and progress. Close C2 with a comment.
11. **Invite others** with `npm run invites -- add <email>` (add `--note "Priya, friend"` if you like), and add the same email under Test users in step 2 only if you have kept the consent screen in Testing and want the warning gone for them (not needed for basic scopes).
12. **Later, to let anyone in:** `npm run invites -- open` (and `npm run invites -- close` to shut the door again). Before opening to strangers, consider clicking **Audience → Publish app** so the Google screen has no "testing" wording; with only basic scopes Google needs no verification. If you add a logo, Google asks for a privacy-policy link.

### F.2 · Switching the finished app on (ticket H1)

1. **Snapshot, then migrate:** take a Neon snapshot, then `npm run db:migrate` on production. It applies all pending migrations, in order (Topic restart, `reply_checks.widget_source`, any other merged since F.1). Note the list for H1's comment.
2. **Switch the Widget engine on (#248):** in the Neon SQL editor, `update settings set value = 'on' where key = 'widget_engine'` (or ask Claude for the exact statement). Comment on #248 when done.
3. **Make `ui` required:** once `ui` has been green three times in a row on `main`, GitHub → **Settings → Rules → Rulesets → "main: CI must pass"** and add the check named `ui` as required.
4. **Open sign-up, only when ready:** `INVITES_DB_OK=<host> npm run invites -- open`. Leaving it closed is fine.
5. **Close the old theme issues:** close #271 and #312–#320 with the comment "Superseded by the two-theme decision (ADR 0012, spec 2026-11-05)."
6. **Check:** `/course` loads, "Start this Topic over" works on one Topic, and a new reply on `/study` shows a Widget. Close H1 with a comment listing the migrations step 1 applied.

---

## Appendix G · Docs worth reading

**Sign-in (Better Auth and Google)**
- [Better Auth: Next.js integration](https://better-auth.com/docs/integrations/next): route handler, `nextCookies()`, the optimistic cookie check in `proxy.ts`.
- [Better Auth: Drizzle adapter](https://better-auth.com/docs/adapters/drizzle): `drizzleAdapter`, table names, the separate `@better-auth/drizzle-adapter` package from 1.7.
- [Better Auth: Google](https://better-auth.com/docs/authentication/google): client, redirect URIs, `prompt: "select_account"`.
- [Better Auth: installation](https://better-auth.com/docs/installation) and [options reference](https://better-auth.com/docs/reference/options): `BETTER_AUTH_SECRET`, `baseURL`, `trustedOrigins`, `session`, `onAPIError`.
- [Better Auth: database](https://better-auth.com/docs/concepts/database): schema, ID generation, **database hooks** (`user.create.before` is our gate).
- [Better Auth: users and accounts](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/users-accounts.mdx): account linking, `validateUserInfo`.
- [Better Auth: cookies](https://better-auth.com/docs/concepts/cookies) and [hooks](https://better-auth.com/docs/concepts/hooks): cookie names, `__Secure-` prefix, request hooks.
- [Better Auth: rate limit](https://better-auth.com/docs/concepts/rate-limit) · [OAuth proxy plugin](https://better-auth.com/docs/plugins/oauth-proxy) (the way to get Google on previews, not used) · [test utils plugin](https://better-auth.com/docs/plugins/test-utils) · [CLI](https://better-auth.com/docs/concepts/cli).
- [Auth.js: migrate to Better Auth](https://authjs.dev/getting-started/migrate-to-better-auth): why we did not pick Auth.js.
- [Google: OAuth app production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) and [Google Cloud help: manage the OAuth app audience](https://support.google.com/cloud/answer/15549945): Testing vs In production, 100 test users, basic scopes.

**Browser tests**
- [Playwright: webServer](https://playwright.dev/docs/test-webserver) · [emulation (colour scheme, reduced motion)](https://playwright.dev/docs/emulation) · [snapshots](https://playwright.dev/docs/test-snapshots) · [CI](https://playwright.dev/docs/ci) · [best practices](https://playwright.dev/docs/best-practices) · [sharding](https://playwright.dev/docs/test-sharding).
- [PGlite](https://pglite.dev/docs/) · [filesystems](https://pglite.dev/docs/filesystems) · [multi-tab worker](https://pglite.dev/docs/multi-tab-worker) · [pglite-socket](https://pglite.dev/docs/pglite-socket).
- [Next.js: instrumentation](https://nextjs.org/docs/app/guides/instrumentation) (where the test database starts).

**Buttons and clarity**
- [NN/g: Beyond Blue Links, making clickable elements recognizable](https://www.nngroup.com/articles/clickable-elements/) · [Flat UI elements attract less attention and cause uncertainty](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/) · [Young adults and flat design](https://nngroup.com/articles/young-adults-flat-design).

**Space and reading**
- [NN/g: Browser and GUI chrome](https://www.nngroup.com/articles/browser-and-gui-chrome/) · [Sticky headers](https://www.nngroup.com/articles/sticky-headers/) · [Horizontal attention leans left](https://www.nngroup.com/articles/horizontal-attention-leans-left/).
- [Baymard: line length and readability](https://baymard.com/blog/line-length-readability) · [WCAG 1.4.8 visual presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html).

**Motion**
- [WCAG 2.3.3 animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) · [technique C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) · [NN/g: animation duration](https://www.nngroup.com/articles/animation-duration/) · [response-time limits](https://www.nngroup.com/articles/response-times-3-important-limits/) · [animation usability](https://www.nngroup.com/articles/animation-usability/) · [MDN: Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API).

**Emoji**
- [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT) · [its licence](https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/LICENSE).

**Colour and contrast**
- [APCA Bronze simple mode](https://a11yreadtech.github.io/ARC/tests/bronze-simple-mode) · [WCAG 1.4.11 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

---

## Appendix H · Orchestration sketch (a Workflow script, not production code)

Plain JavaScript in the Workflow-script style. It shows the shape: a frontier loop over the ticket graph, implement then light check then PR with auto-merge, then the G1/G2/G3 loops with critics and adversarial verify, then F1 and F2. The real script is written by the implementing session; names of helpers are illustrative.

```js
export const meta = { name: "story-first-build", description: "Build the story-first spec", budgetUsd: 55 };

const TIER = { sonnet: { model: "sonnet", effort: "medium" }, opus: { model: "opus", effort: "medium" } };
const OPUS_TICKETS = new Set(["C1a", "C1b", "D3a", "D3b", "E4a"]);
const GRAPH = JSON.parse(await readFile("work/graph.json")); // [{id, dependsOn:[], issue:N}] from section 9.1
const HUMAN = new Set(["C2", "H1"]);                       // never run by an agent; C3 waits on C2
const done = new Set(), failed = new Set();

// 1. Frontier loop: start every ticket whose dependencies are closed, 8 at a time.
phase("build");
while (done.size + failed.size < GRAPH.length - HUMAN.size) {
  const ready = GRAPH.filter(t => !HUMAN.has(t.id) && !done.has(t.id) && !failed.has(t.id) && t.dependsOn.every(d => done.has(d)));
  if (!ready.length) { log("stuck: " + [...failed].join(",")); break; }
  const results = await parallel(ready.slice(0, 8).map(t => () => lane(t)));
  results.forEach((r, i) => (r.ok ? done : failed).add(ready[i].id));
}

async function lane(t) {
  const tier = OPUS_TICKETS.has(t.id) ? TIER.opus : TIER.sonnet;
  for (const attempt of [tier, TIER.opus]) {            // one opus retry
    const r = await agent({
      ...attempt, isolation: "worktree",
      prompt: `Implement ticket ${t.id} (issue #${t.issue}) from work/tickets/${t.id}.md. Follow spec section 0 and 6.`,
      schema: { type: "object", required: ["branch", "testsRedGreen", "check"], properties: {
        branch: { type: "string" }, testsRedGreen: { type: "boolean" }, check: { type: "boolean" } } },
    });
    if (r.testsRedGreen && r.check) {
      await agent({ ...TIER.sonnet, prompt: `Open a PR for ${r.branch} to main. Body: "Closes #${t.issue}". Run gh pr merge --auto --merge. Then confirm the issue closed.` });
      return { ok: true };
    }
  }
  return { ok: false };
}

// 2. Adversarial verify: a finding becomes a fix only if a second agent fails to refute it.
async function verify(finding, highStakes) {
  const votes = await parallel(Array.from({ length: highStakes ? 3 : 1 }, () => () =>
    agent({ ...TIER.sonnet, prompt: `Try to REFUTE this finding with evidence:\n${JSON.stringify(finding)}`,
      schema: { type: "object", required: ["refuted"], properties: { refuted: { type: "boolean" } } } })));
  const notRefuted = votes.filter(v => !v.refuted).length;
  return notRefuted >= (highStakes ? 2 : 1);
}

// 3. Goal loops with round caps and a budget.
async function loop(name, maxRounds, measure, fix) {
  for (let round = 1; round <= maxRounds; round++) {
    const m = await measure(round);                     // metrics + critics -> {pass, findings}
    if (m.pass) return log(`${name} passed in round ${round}`);
    const confirmed = [];
    for (const f of m.findings) if (await verify(f, f.severity === "high")) confirmed.push(f);
    if (!confirmed.length) return log(`${name}: nothing confirmed`);
    await parallel(confirmed.map(f => () => fix(f)));  // fix lanes (sonnet, worktree, PR)
  }
  await agent({ ...TIER.sonnet, prompt: `File needs-triage issues for the remaining ${name} gaps.` });
}

phase("goals");
await loop("G1", 3, r => measureAll(["layout", "affordance", "space", "colour"]), fixLane);
await loop("G2", 3, r => liveEval({ prompts: 20, capUsd: 13, branchOnly: true, ledgerUsd: 55 }), fixLane); // $39 of the $55 ledger
await loop("G3", 5, r => contentCheck({ allowlistMustBeEmpty: true, critics: ["math", "persona"] }), fixLane);

// 4. Proof.
phase("proof");
await agent({ ...TIER.sonnet, prompt: "F1 (every ticket except C2, C3, H1 merged): run the preview matrix (1512x982, 1280x800, 1920x1080, 1024x768; Light, Dark) and the critic panel; file gaps as needs-triage." });
const review = await agent({ ...TIER.opus, prompt: "F2: run /code-review since 9b8b6e4 on both axes.", schema: REVIEW_SCHEMA });
if (review.findings.some(f => f.verdict === "CONFIRMED")) await lane({ id: "F2-fix", issue: FIX_ISSUE, dependsOn: [] });
log("hand back to owner: C2 and H1 (Appendix F): migrations, widget_engine, ui ruleset, signup_open; C3 if C2 is still open");
```

---

## Appendix I · ADR drafts

Each ADR is written by the ticket in §3.5, from the draft below, in the same PR.

### `docs/adr/0009-learners-never-type-numbers.md`

```markdown
# Learners never type numbers: every question is a tap, about stories and words

Status: accepted, 2026-11-05 (spec "story-first, full-screen, Google sign-in"). Amends ADR 0006 and ADR 0008, and ADR 0007's rate-move practice mode.

The Learner never types a number. Quick tries, quiz Checks, Reviews, the ladder's half-done tries and drills, and Widgets all ask the Learner to tap one of two to four choices, or True or False, and code marks the tap with no model call. A question asks what a word means, what someone in the story did, or which reading is right. It never asks for a sum. Numbers appear only as facts in a story or as choice labels the Learner can recognise: "the RBI cut by 0.25 points: traders call that… 25 bps". Picking the right label may need one lingo step the Topic names, such as points to basis points, and nothing more. Each wrong choice may carry a one-line mix-up fix that shows the moment it is tapped, which makes every wrong choice a possible Known mistake. Question templates still draw fresh numbers for each try, and code now builds the choices from them: the right answer plus each Known mistake's value. The rate-move Widget's practice mode asks the Learner to choose the right reading of a move. Conversation Checks ask the Learner to say an idea in their own words, or which they would pick and why. The Tutor never asks for a sum: a new reply check, V8, finds a question or ask that does, and costs one retry. A new lesson lint rule, L10, fails any typed item or sum-asking stem in a Topic file, with a list of not-yet-rewritten Topics that can only shrink, as ADR 0002's list does.

We chose this because the owner's Learners are young beginners who dislike maths and want the lingo and the ideas, not the arithmetic ("It isn't a CA exam … You're trying to learn these concepts by having fun", 5 Nov 2026). Code can still mark exactly, because a choice is as markable as a typed number.

## Considered Options

- Keep typed numbers and soften the wording: the questions stay exams, which is the owner's complaint.
- Choices with no numbers at all: loses the lingo the owner wants ("what is 25 bps"), and story facts carry numbers anyway.
- Let the model write and mark free-text answers: marking would cost a model call each time and could not be tested exactly (ADR 0006's reason for code marking).

## Consequences

- The Quick try box, the typed quiz question, StepThrough's "Your number", the rate-move answer box and the Slider's exact-value boxes go. Sliders keep their −/+ steppers and quick chips.
- About 68 Topics start on the L10 list. Ten batches rewrite them, and the first 12 path Topics are rewritten with their story scenes.
- The ladder keeps its order and stored ids; "fill-in boxes" becomes a half-done choice, and "a drill of five" becomes a choice drill of five.
- A template must yield at least two distinct choices on every draw; the lesson lint's Draws rule checks it.
- Guessing is easier with choices. A Check still needs its pass rule, and Skill state still needs two right in a row, so one lucky tap passes nothing.
- Glossary: Quick try ("the Learner taps one of two to four choices, or True or False"), Known mistake ("a wrong choice the Topic's file expects, with a one-line mix-up fix"), Question template ("code draws the numbers and builds the choices from the answer and each Known mistake"), Rate-move Widget ("in practice mode the Learner picks the right reading of the move"), Lesson lint (adds L10).
- ADR 0008's list of reply checks gains V8: no question or ask that has the Learner work out a sum.
```

### `docs/adr/0010-a-widget-and-choices-with-every-reply.md`

```markdown
# Every reply comes with one Widget and two or three Choices; emoji live in Widgets and Choices

Status: accepted, 2026-11-05 (spec "story-first, full-screen, Google sign-in", tickets D3a and E4a). Amends ADR 0007 and ADR 0008 (V4).

Every Tutor reply shows exactly one Widget. The Tutor may still open one itself, with open_widget or show_widget. When it does not, and code has not opened one for the step, code adds a companion Widget after the reply passes its checks. Code takes the first that fits, in this order:

1. the step's story scene, written ahead in the Topic's file;
2. a Lingo card for the first Topic term in the reply;
3. the Topic's Running-example scene;
4. a one-line card for the Case and its date.

It never adds one that shows an open quiz's Blocked numbers. Each reply's record names where its Widget came from (tutor, step, scene, lingo, running example, or case).

Every reply also ends with two or three Choices: tap-to-answer chips such as "What happened next?" or "Quiz me". Code picks them from a fixed set for the Teaching Step. The Tutor may suggest one through an optional tool, which code checks and may drop; the tool is optional because forcing a tool call is refused on Opus 5.5. Typing stays open. Widgets and Choices use emoji from a vendored set of Microsoft Fluent Emoji 3D images (MIT), so every device shows the same picture; reply text stays free of emoji, as V3 requires. Widgets gain nine story parts drawn by code, such as StoryScene, LingoCard and WhoPaysWhom, each checked for emoji names, dates within the as-of rule, currency, and no sum.

We chose this because the owner wants "generative UI for every prompt", lively and story-based, and a Tutor that leads (5 Nov 2026). Under ADR 0007 only 2 of 95 Topics had written-ahead Widgets, so most replies were bare text.

## Considered Options

- Ask the Tutor to always open a Widget (a prompt rule): prompt-only rules were broken in live runs (ADR 0006, 0008), and a forced tool call is refused on Opus 5.5.
- Bring back free-form Widgets (compose_widget) for the gaps: this was rejected in ADR 0007 for slow, uneven pictures with the wrong currency.
- Choices written by the Tutor in its text: they cannot be checked, would break V2's one-ask rule, and would vanish on a fallback.

## Consequences

- ADR 0007's "at most one Widget per reply" becomes "exactly one". Its "when no recipe fits, the Tutor teaches in words" now ends "and code adds a picture".
- ADR 0008's V4 reads "a valid Widget, exactly one per reply; code fills a missing one". More than one is still refused.
- The companion runs only in Sessions frozen with the widget engine on. The production switch is the owner's step (#248).
- A companion can be less apt than one the Tutor chose. The Delight eval's Widget-fit judge watches this.
- Every Topic needs at least a Case, which every Topic has, so the safety-net card always exists. Story scenes are written for the first 12 path Topics now and for the rest later.
- About 150 small WebP files (under 1.7 MB) ship in `public/emoji/` with their licence and a credit line in Settings. Course files name emoji, and lint L11 checks each name.
- "Show me in a widget." leaves the chips (old Sessions still read it as a chip).
- Glossary: Widget (one with every reply), Companion Widget (new), Choice (new), Story scene (new), Lingo card (new), Archetype (adds Story and Lingo).
```

### `docs/adr/0011-google-sign-in-with-an-invite-list.md`

```markdown
# Learners sign in with Google, and only people on an invite list can get in

Status: accepted, 2026-11-05 (spec "Story first, full screen, Google sign-in", tickets C1a and C1b).

A Learner signs in with their Google account, through Better Auth (`better-auth` with its Drizzle adapter, on the existing Neon database). Better Auth keeps its own tables (`user`, `session`, `account`, `verification`). Our `learners` table gets one nullable column, `auth_user_id`, so a Google user maps to exactly one active Learner; every per-Learner table keeps its `learner_id` and does not change. Sign-up is closed by default: an `invites` table lists the emails that may create an account, and the setting `signup_open` ("off" by default) lets anyone in when switched on. An invite may name an existing Learner, so the owner's Google email links to Learner 1 and the owner keeps their progress. Start over archives the Learner and opens a fresh one for the same Google user.

The passcode stays for one purpose: the test tools Learner (the simulated learner, the browser tests and the live evals). It is no longer a way for a Learner to sign in (ticket C3). Google sign-in runs on production and localhost only; a preview deployment uses the tools passcode.

We chose this because the owner asked for "sign in with Gmail, once and for all", and the passcode list cannot grow: each person needs the owner to edit an environment variable and redeploy, a shared passcode cannot be taken back from one person, and `learnerFromCookie` refuses any name not on the list (`src/auth/learners.ts:55-61`). The app was already multi-Learner, so what was missing was only a way to prove who a person is.

## Considered Options

- Keep passcodes: no new code, but one environment variable edit and a redeploy per person, and nothing a person can do for themselves. Rejected.
- Auth.js: the common choice, but its own site now points new projects to Better Auth (authjs.dev, "migrate to Better Auth"), so it would be a migration waiting to happen.
- Clerk (Vercel Marketplace): fastest to start and handles sessions, but user records live in a third-party service, it is a paid product beyond a free tier, and the owner asked for no paid services.
- Neon Auth: stays inside Neon, but ties sign-in to one vendor's managed service and to a feature set we would not control; Better Auth keeps users in our own tables.
- Open sign-up from day one: simplest, but the owner wants to choose who comes in first. The one switch (`signup_open`) gives that without a second code path.

## Consequences

- New secrets for the owner to set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Google Cloud and Better Auth are free; no billing is needed for sign-in.
- Google's consent screen stays in Testing with basic scopes (`openid`, `email`, `profile`); the invite list, not Google, decides who gets in. Publishing the app later is a button and needs no verification for basic scopes.
- Removing an invite does not sign out someone who has already signed up; to lock a Learner out, archive them. This is deliberate and small: about twenty people are invited by hand.
- The proxy only checks that a Better Auth cookie exists (cheap, but not proof); every page and route still checks the real session through `currentLearner()`. A stale cookie shows the login page once, not a loop.
- Rate limiting for Google sign-in uses Better Auth's in-memory default, which is per server instance on Vercel and therefore weak. For an invite-only app of about twenty people this is accepted; the database storage option is the way up if sign-up is ever opened wide.
- The session lasts 90 days, the same as the passcode cookie it replaces. The Better Auth cookie cache is off, so sign-out takes effect at once.
- A Google display name can match another Learner's name, so a Google Learner never reuses an existing name: a clash gets " (2)", and `owner` and `tools` are reserved.
- Previews cannot sign in with Google. Better Auth's OAuth proxy plugin is the documented way if that is ever wanted; it needs one shared secret across environments and is not used.
- The browser tests sign in as the tools Learner by passcode and, for a Google-linked Learner, with Better Auth's test helper, which is mounted only when the test-bed flag is set outside production.
- The glossary's **Learner** entry changes: signed in with Google (the test tools use a passcode).
```

### `docs/adr/0012-two-themes-with-accents.md`

```markdown
# Two themes, Light and Dark, in one blue with four accents; Light is no longer frozen

Status: accepted, 2026-11-05.

The site has Light, Paper, Midnight and Forest. The owner finds the page "monotone", the buttons indistinct and the choice "too many colours". Four themes also meant four sets of contrast rules, a Day theme and a Night theme to explain, and a frozen Light that no one could improve (themes spec, T-01: Light's values were locked so the other three could be tuned around it). This decision replaces them with two themes. Both use one brand colour in three tones (deep #1E3A8A, main #2F5BEA, soft #DCE6FF) and four accents that each carry a meaning: mint #12B886 for the Learner and gains, coral #FF6B57 for losses and warnings, sunflower #FFC233 for history and stories, violet #8B5CF6 for lingo. Light gets new values; Dark replaces Midnight with a deep navy and desaturated accents. Each accent has a text-safe "ink" variant, because the owner's fills fail 4.5:1 as text (mint is 2.4:1 on the page).

## Considered Options

- Keep four themes and add accents to each: four palettes to keep in step with every new accent; the owner asked for fewer, not more.
- One theme, no Dark: a Learner studying at night loses the dark reading mode the first themes spec added for glare.
- Use the owner's accent hexes directly as text: fails WCAG (mint 2.4:1, sunflower 1.5:1); would force bigger or bolder type to compensate.

## Consequences

- Light is unfrozen. `scripts/check-theme-contrast.mjs` freezes the new Light values instead (`LIGHT_FROZEN`) and now also runs the text rules on Light; changing a Light value needs an ADR note.
- Stored choices migrate when read: `paper` becomes Light, `forest` and `midnight` become Dark, a day/night pair becomes "Match my Mac". Old cookies keep working with no write.
- The theme menu offers Light, Dark and Match my Mac. "Day theme" and "Night theme" leave the glossary.
- `--you` is mint and `--src` is sunflower; both keep their names so no component changes. An accent's fill never carries text; its `-ink` does.
- Dark accents are desaturated (OKLCH chroma at most 0.135), so they are not the owner's exact hexes there.
- Print stays in Light.
```
