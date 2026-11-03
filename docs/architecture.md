# Architecture

A plain-words map of the layers built so far. Each layer says what it does, a concrete
scenario, and the trade-off we accepted. Newest layers are added at the bottom.

## How the layers fit together

One turn, start to finish. The Learner types a message in the **app**, past the **passcode**
gate. The **Tutor Turn** asks the **Course Navigator** and **Learner Memory** where the Learner
stands, tells Claude (with the **Case Data** the as-of rule allows), and streams the reply back.
If the reply holds a **widget**, the browser draws it, fetching any sourced data through the same
rule, and the Learner plays with it at no cost. Everything is saved in the **database**, and
the **usage** layer records what the turn cost, which the "under the hood" panel shows under
the reply.

The rule behind the whole design: **code decides what happens next, and the model teaches.**
The Course Navigator, the saved progress, the numbers in charts and the price table are all
ordinary tested code. Claude explains, asks and judges, but cannot skip a step or invent a figure.

**How to keep this note current.** Whoever adds a layer adds a section here in the same change:
what it does, a concrete scenario, the trade-off. Also update the database section if tables change.

## The app (Next.js on Vercel)

**What it does.** One Next.js 16 TypeScript app holds the pages the Learner sees and the
server routes that talk to Claude and the database. It deploys to Vercel, with functions
pinned to Singapore (`sin1`, set in `vercel.json`) so they sit next to the database.

**Scenario.** The Learner opens the site on a laptop. Vercel runs the page in Singapore, reads
the saved conversation from Neon a few milliseconds away, and sends back the page.

**Trade-off.** One app is one thing to deploy and understand. The price is Vercel Hobby's
ceiling: one request may run for at most 300 seconds, streaming included.

## Passcode gate (`src/proxy.ts`)

**What it does.** Every page and API route checks for a signed cookie before doing anything.
Without it, pages redirect to `/login` and API routes answer 401. The login form compares the
passcode with `PASSCODE` and, if it matches, sets a cookie signed with `SESSION_SECRET`.

**Scenario.** Someone finds the URL and posts to `/api/turn`. The proxy answers 401 before any
Claude call happens, so no credits are spent.

**The one public door.** Signed out, the proxy lets through only a plain GET or HEAD of `/` (the
public landing page) and image files under `/landing-assets/` (`.png` or `.webp`). A POST to `/`, or
any request carrying a `Next-Action` header (a Server Action call), answers 401. Every other page
still redirects to `/login`, and every `/api/*` route still answers 401. `/` itself checks the cookie
again (`isSignedIn()` in `src/auth/session.ts`) before it reads anything, and shows the landing page
when signed out. The proxy skips `login` and `api/login` only as whole path segments, so
`/login-anything` is still checked. Signed in, nothing changed.

**Guessing is limited** (`src/auth/login-guard.ts`, table `login_failures`). Each wrong passcode
is saved as the caller's address and the time (never the guess). After five wrong guesses from one
address in 15 minutes, that address is refused, even with the right passcode, until the window
passes. After fifty wrong guesses from all addresses together in an hour, logins are slowed rather
than stopped: every address gets one try per 15 minutes, so guessing from many machines is cut to a
trickle while the owner, on a new phone, can still sign in with one correct try. The page then says
"Too many wrong passcodes". Rows older than a day are removed as new ones arrive.

Each try is claimed before the passcode is compared: its row is saved first, then counted with the
others, and removed again if the try is refused or the passcode was right. So guesses sent all at
once (say 1,000 parallel requests from one address) each see the ones before them, and at most five
are compared, not all of them.

**Trade-off.** One shared passcode is simple and enough for one private Learner. It is not a
user account system. Changing `SESSION_SECRET` signs every device out. The overall cap no longer
locks everyone out, because a determined guesser could keep that lock on forever with fifty guesses an
hour. Instead it slows every address to one try per 15 minutes: an attacker with many addresses still
gets one guess per address in each window, and the owner who mistypes on a new device waits 15 minutes.
If you ever need to clear the limit at once, delete the rows of `login_failures` in Neon.

## Database (Neon Postgres through Drizzle)

**What it does.** Neon is the only store. Thirteen tables so far:
- `settings`: the Tutor's model (`claude-opus-5-5`), effort (`medium`) and the idle hours before
  a new Session starts, editable without a rebuild.
- `sessions`: one row per Session, with the exact instructions, tool definitions, model and
  effort frozen when it started, plus a fingerprint of the instructions and tools.
- `messages`: the Session's history, add-only, each message stored exactly as sent or received.
- `learner_state`, `topic_progress`, `check_results`, `misconceptions`, `quiz_attempts`, `insight_attempts`: Learner Memory (below; the last is described under "Insight recording").
- `usage`: what each turn and each step of it cost (below).
- `question_bank`: the Question Bank, imported human-written questions with licence and credit (below).
- `case_datasets`, `case_data_points`: Case Data, checked historical datasets with their sources (below).
- `library_sources`, `library_passages`: the Library, real sources cut into searchable passages (below).
- `turns`, `tool_calls`: each turn's saved status (running, cut off, finished, failed), which is also
  the one-turn lock, and the saved result of every tool call, keyed by its tool call ID (below).
- `login_failures`: wrong passcodes by address and time, for the login's guessing limit (Passcode gate, above).

The app uses Neon's pooled connection (`DATABASE_URL`), over WebSockets rather than HTTP, because
only WebSockets allow the transactions the Tutor's tools need (see "Surviving cut-offs and failures"). Schema changes are migration files in
`drizzle/`, applied with `npm run db:migrate`, which uses the direct connection
(`DATABASE_URL_UNPOOLED`).

**Scenario.** The Learner reloads the page mid-conversation. The page reads the current Session's
messages from Neon and shows them again, without calling Claude.

**Trade-off.** Storing raw message content as JSON keeps it byte-for-byte replayable, which
Claude's thinking rules need, but makes it less convenient to query than neat columns.

## Tutor Turn (`src/tutor/turn.ts`, `session-log.ts`, `transcript.ts`, `context.ts`)

**What it does.** Runs one exchange with Claude. It saves the Learner's message, builds the
request only from what the Session saved (never from today's code or settings), and runs it
through the Anthropic SDK's Tool Runner with streaming. Text is forwarded to the browser as it
arrives. When each step of the loop finishes, the reply is saved unchanged, thinking blocks
included. The Tutor runs on Opus 5.5 at medium effort (the stored default; each Session keeps the
model it started with). No request forces a tool or sends sampling settings such as temperature.
The Tool Runner is in beta, so the SDK version is pinned exactly (`1.3.0`).

**Scenario.** On the third message of a Session, the request contains the first two exchanges
exactly as they happened, including Claude's signed thinking blocks, followed by the new
message. Because nothing earlier was edited, Claude accepts the thinking and no 400 error occurs.
If the owner switches the model setting to Haiku meanwhile, this Session keeps Opus; the next
Session picks up Haiku. The default is Opus 5.5 at medium effort; a data migration moved the stored
setting from the old Sonnet default to Opus only where it still held that default, so a model the
owner chose by hand is never overwritten.

**Trade-off.** Add-only history means context that changes (for example, the current teaching
step) must be sent as a new message rather than by editing the instructions. That is a little
more code, but editing would break Claude's thinking on this model.

**Where the code lives.** `turn.ts` runs the turn itself: the lock, the loop with cut-off,
compaction, refusal and widget correction. `session-log.ts` holds the stored settings, the choice
of which Session the next action continues, and the add-only message log. `context.ts` builds the
Course Navigator's context and works out which context the Tutor last saw. `transcript.ts` turns a
Session into plain lines for the screen (after a reload, on old Session pages, in a replay). Each
changes for its own reason, so a change to how Sessions are shown no longer touches the turn loop.

**How it is tested.** Tests call the Tutor Turn with a scripted stand-in for the Anthropic
client and a throwaway in-memory Postgres (PGlite) with the real migrations, so CI needs no
secrets and spends no credits.

**Measured.** The longest real turn so far took 11.9 seconds, about 4% of the 300-second limit
(plain conversation, no tools yet).

## Course Map outline (`course/outline.yaml`, `src/course/outline.ts`, `docs/course-map.md`)

**What it does.** One file lists every Topic the course will ever have, in default-path order: 95
Topics today (Foundation, Follow, Judge, Analyse). Each entry has an ID, title, Stage, prerequisites
and one or more candidate Cases, each with its as-of date, the known outcome, source URLs and a
`verified` flag (false means the facts must be checked before the Topic is written). A Topic's place on
the path is its position in the file. A validator rejects duplicate IDs, missing prerequisites,
prerequisite loops, a Topic placed before its prerequisite, and a Case with no source.
Present value sits right after basic maths and just before the three financial statements.

Only written Topics (files in `course/topics/`) are taught. A written file must match an outline
entry and takes its Stage, place and prerequisites from it (the file no longer repeats them); a
prerequisite that is not written yet is left out of the teachable map, so the Learner is never
blocked by a Topic that does not exist. The Course Map page shows the unwritten Topics under
"Coming", with no jump button. `docs/course-map.md` is the owner's readable view, generated from the
outline by `npm run course:doc`; `npm run course:check` (part of `npm run check`) fails if it is stale.

**Scenario.** The owner reads `docs/course-map.md`, wants Argentina earlier, and asks for the change.
The outline entry moves, the document is regenerated, and the check fails until it is committed.
When someone writes `bond-pricing.yaml`, the Topic appears in the teachable path at its outline
place and disappears from "Coming".

**Trade-off.** Separating the plan from the written Topics keeps the whole course reviewable and
reorderable before any Topic text exists, at the price of a second file to keep in step. The
generated document is checked rather than hand-edited, so it cannot drift. Cases marked unverified are
research candidates, not yet teachable facts.

## Subjects in the Course Map outline (`subject` in `course/outline.yaml`, `SUBJECTS` in `src/course/outline.ts`)

**What it does.** Each Foundation Topic names one Subject, the field it belongs to, from a fixed list
of nine: Numbers & time value, Financial statements, Economics & policy, Currencies & countries,
Bonds & credit, Markets & investing, Valuation & corporate finance, Derivatives, and Banks, crises &
the system. The outline check fails when a Foundation Topic has no Subject, when a Subject is not
one of the nine, or when a Follow, Judge or Analyse Topic has one. The Subject travels from the
outline to the Topic and to `courseOverview`, and shows as a pill on Foundation rows of the Course Map
and in `docs/course-map.md`.

**Scenario.** The owner adds a Foundation Topic on swaps and forgets the Subject: `npm run course:check`
fails with `Foundation Topic "der-swaps" has no Subject`. They add `subject: "Derivatives"`, and the
Course Map shows the pill beside the Topic.

**Trade-off.** A fixed list of nine keeps the Course Map scannable and a typo cannot invent a tenth
field, at the price of editing the list in code when a genuinely new field is needed. A Subject is a
label for finding things, not a teaching order: the default path still decides what comes next.

## Course Map (`course/topics/*.yaml`, `src/course/map.ts`)

**What it does.** The course is a folder of plain text files, one per Topic. Each file holds the
Topic's Stage, its prerequisites, its place on the default path, its Case (a story told as of a
past date, plus the reveal of what happened), the concept, the principle and an ordered list of
Checks, and any Claude-written quiz questions. Topics, Cases, Checks and questions have permanent IDs. The first Topic is present value, taught
through the 2018 $1.537 billion Mega Millions jackpot and its $877.8 million cash option.

A validator checks the files: every prerequisite must exist, prerequisites must not loop, IDs
must be unique, every Topic needs at least one Check, and a quiz Check may use only questions its
Topic holds, with an answer that is one of the choices and a pass rule it can actually meet. A Topic may also hold an
`insight` and an `explore` block, both or neither, checked as described under "The explore step". It runs as part of `npm run check`,
so CI fails on a bad edit.

**Scenario.** Someone adds a Topic that requires `bond-pricing`, which doesn't exist yet. CI
fails with: `Topic "duration" requires "bond-pricing", which is not on the Course Map`.

**Trade-off.** Plain files are quick to edit and review, and changes go live on deploy. The price
is that a course edit needs a deploy, not a click in an admin page.

**Foundation batch 4 (bonds, India's government securities, exchange rates, trade).** Eight
Topics use this layer: bond pricing (the 1994 bond sell-off), yield measures (Orange County's
leveraged pool), the yield curve (the 1994 flattening), duration and convexity (Silicon Valley
Bank's securities), credit spreads (Long-Term Capital Management), India's G-secs (the 1992
securities scam), exchange rates (the 1991 rupee devaluation) and trade (India's import squeeze).
Each Case keeps to what was known on its as-of date, and each file names its sources in a comment.
The yield history in the bond Cases is the US Treasury's own daily par yield file (not FRED, whose
data may not be stored); the Treasury's monthly averages match the FRED figures the Cases quote.
**Scenario.** A Learner in the 1994 curve Case sees the yield lines only up to 3 February 1994;
after the reveal the lines run to December and show the 2-year and 10-year yields meeting.
Quiz Checks mix our own questions with Question Bank ones, and each bank question used here was
checked by hand or against a named source before it was marked verified.
**Trade-off.** Eight Topics written in one go share one house style, which makes the course
consistent but means a wrong habit (for example, a thin explanation) is repeated eight times.

## Course Navigator (`src/course/navigator.ts`)

**What it does.** The module that decides what comes next. It takes the Course Map and the
Learner's saved progress and returns the current Topic, the Teaching Step, the Check in play,
the next legal step and any unmet prerequisites. It is pure: no model, no database, no clock.
There are seven Teaching Steps, run as a state machine: story, then concept, your turn and Check
for each Check, then reveal, then principle. A Topic with an Insight adds the seventh, explore, once
(see "The explore step"). Only a saved Check result moves past a Check step, the reveal opens
only after the last Check is passed, and a Topic is passed only when its principle finishes.

The Learner's place is worked out from recorded passes: the first Check, in the Topic's current
order, without a pass. That keeps Course Map edits safe: an inserted Check becomes the place, a
removed Check's records are ignored, and a Check added to an already passed Topic is due only if
marked `required`. A due Check is taken, not just listed: once the Learner is not in the middle of
a Topic, the Navigator takes them back to the passed Topic for that Check's concept, your-turn and
Check steps before any new Topic starts. The Topic stays passed throughout (it still counts as a met
prerequisite), and once the due Check is passed the default path carries on. A newly added
prerequisite never moves the Learner out of a started Topic; it is only reported as unmet.

**Scenario.** Mid-story, the Tutor calls `finish_teaching_step` with `reveal`, trying to skip
ahead. The Navigator answers "Cannot finish \"reveal\": the current Teaching Step is \"story\"",
nothing is saved, and the Tutor gets that reason back as a tool error.

**Trade-off.** Because it is pure, it is tested thoroughly and cheaply (no database, no Claude),
and the course's correctness rests on code, not on the model's memory. The price is that the
caller must load and save progress around every decision.

## Learner Memory (`src/learner/memory.ts`)

**What it does.** Saves the Learner's place in three new tables: `learner_state` (the current
Topic), `topic_progress` (each started Topic's Teaching Step, whether the reveal has been shown,
and whether it is passed) and `check_results` (every Check result, kept even if the Check is
later removed). Progress is saved when a Topic starts and at every Teaching Step change. It also
turns the records into a short plain-text summary.

Since the conversation Check landed (below), a Check result also keeps the Tutor's reasons as
evidence and the model that taught it, and a fourth table, `misconceptions`, keeps what the Tutor
noticed the Learner getting wrong.

**Scenario.** The Learner reaches the reveal, closes the laptop and comes back the next day.
The workspace shows "Present value (foundation Stage). Teaching Step: reveal. The reveal has
been shown." with a Continue button, read straight from SQL.

**Trade-off.** Hand-written tables and a summary in code instead of a memory framework: less to
learn and nothing hidden, but each new kind of memory is new code.

## Teaching Steps in the Tutor Turn (`src/tutor/turn.ts`, `src/tutor/context.ts`)

**What it does.** Before each Learner message, code appends a "Course Navigator" context
message whenever the Learner's place changed: the Topic, the Teaching Step, the Case's story,
and only the material for that step (the concept, the current Check, the principle). The Case's
outcome is included only from the reveal step on, so hindsight is withheld by code. The Tutor has
a tool, `finish_teaching_step`; when it calls it, code asks the Navigator, saves the move if it
is legal and replies with the next step's material, or replies with an error if it isn't.

**Sessions.** Opening the workspace makes no model call: the page reads the summary and the
latest Session from SQL and shows a Continue button. A new Session starts on the next action
(Continue or a message) if the last message is more than six hours old. The six hours is the
`session_idle_hours` setting in SQL, so it can be changed without a deploy. A new Session also
starts if the instructions or tools changed since the last one was frozen. A new Session opens
with the summary and context as the first block of its first message. (Claude's API rejects a
"system" message in first place, which a live run showed; later context messages can be "system"
messages.) Old Sessions stay readable at `/sessions`.

**Scenario.** The Learner returns after a weekend. The page shows the summary at no cost. They
click Continue; the old Session is past six hours, so a new one starts, its first message tells
the Tutor where the Learner stands, and teaching picks up at the same Teaching Step.

**Trade-off.** Context goes in as appended messages rather than edits to the instructions, which
keeps Claude's thinking valid but repeats some text in long Sessions.

## Widgets (OpenUI: `src/widgets/`, `src/app/conversation.tsx`, `src/app/widget-view.tsx`)

**What it does.** The Tutor can put an interactive widget beside the conversation by writing a
short block in OpenUI's small UI language inside its reply. The browser draws it with OpenUI's
open-source renderer (no paid Thesys service) from our own three components: `Widget` (the
frame), `Slider` (one of the Learner's assumptions) and `AnnuityChart` (yearly payments and what
each is worth today). The instructions that teach the Tutor this language are generated once from
those components (`npm run widgets:freeze`), checked in, and frozen into each Session with the
rest of the Tutor's instructions, so they never change under a running conversation.

**Numbers come from code, not the model.** A chart never accepts a list of numbers. It takes
either the inputs to a tested formula (the present value code in `src/finance/`, built on
formula.js and checked against textbook worked examples) or a reference to a Case Data dataset,
written `caseId/datasetId`, which the browser fetches from `/api/case-data/<case>` under the as-of
rule (see Case Data below). `AnnuityChart` draws the formula and can show a sourced figure beside
it; `HistoryChart` draws one dataset as a line over its dates. Everything the Learner sets carries
a teal (`--you` tokens) "Your assumption" tag; everything drawn from Case Data sits in its own amber box with a
"Sourced" tag and a link to its source, so the two never blend.

**Layout.** The conversation runs on assistant-ui's external-store runtime: our code owns the
messages and streaming, assistant-ui draws them (`src/app/thread.tsx` holds the message look, shared
with the old Session page). As a reply streams in, code splits it into prose and widget blocks. The
prose stays on the left with a "Widget 1 →" chip where the widget belongs; widgets are never drawn
inside the conversation. Old Sessions rebuild their widgets from the stored text, with controls back
at their starting values.

**The Widget panel (`src/app/widget-panel.tsx`, issue #47).** The right column is one sticky panel,
capped at the column's height so it never runs under the header. It shows one card: an eyebrow naming
the concept, then the widget with its title but without its own border (the card is the only frame).
The eyebrow is worked out by code from the widget's components, read with OpenUI's parser
(`widgetParts` in `check.ts`): an AnnuityChart is "Present value", a HistoryChart "Case Data", a
Calculator "Calculator", anything else the current Topic's title. The newest widget shows on its own,
including when a new turn brings one. With two or more widgets a row of chips (one per widget title)
sits above the card; picking a chip there or in the chat shows that widget, fades it in over 200ms,
flashes the card border navy for one second and marks both chips active. Before any widget, a dashed
box says "Widgets the Tutor builds appear here." Scenario: the Learner has a rate chart from earlier
and a loan calculator from this reply; the calculator shows, eyebrow "Calculator"; they click the
"Long-term interest rates" chip and the chart fades in under "Case Data". Trade-off: one widget at a
time keeps the panel calm and the sliders roomy, but comparing two widgets means switching between
them.

**When a widget is broken.** When a reply finishes, the server checks each widget with OpenUI's
parser. If one cannot be drawn, code sends the Tutor one correction request listing the problems,
and the corrected widget replaces the broken one on screen. History keeps both, unchanged. If the
correction is broken too, the browser shows a plain "This widget could not be drawn" note and the
lesson carries on. A widget that crashes while drawing is caught the same way. A correction reply
that is cut off by the length limit or declined is handled like any other reply: the Learner gets
Continue or the refusal message, and a tool call it was cut off in is never run.

**Scenario.** The Tutor tells the Mega Millions story and adds a discount-rate slider beside a chart
of the 30 payments. The Learner drags the rate from 3% to 7%: the bars and the present value
($930 million to $535 million) redraw instantly in the browser, and no request goes to Claude.
The cash option bar beside it comes from the sourced figure, not from anything the Tutor typed.

**Trade-off.** Widgets inside the prose (OpenUI's inline mode) keep one simple reply format and
stream naturally, but the model can write invalid code, which is why the server check and one
correction turn exist. Whether native citations combine with inline mode is still untested (the
citations ticket decides). The fallback, if OpenUI ever has to go, is one plain tool per widget.

**Measured (go or no-go, real headless Chrome).** All eight criteria held: streaming through Tool
Runner and assistant-ui, slider redraw with zero model calls, formulas from tested code, a chart
drawing from a referenced dataset, the left and right split while streaming, invalid output
contained, dark and light modes, and no 400 errors from the frozen instructions (after moving the
Session's opening context out of a first-place "system" message). The live Tutor wrote only valid
widgets, so the broken-widget path was exercised with scripted replies in the browser and with
tests on the server. These runs were against the app on a laptop with the real API and database;
the production check waits on a deploy. OpenUI stays.

## Dark and light modes (`src/app/theme-toggle.tsx`)

**What it does.** A toggle in the header switches dark and light mode and remembers the choice in
a cookie for a year. The server reads the cookie, so the page is drawn in the right mode from the
first paint, with no flash.

**Trade-off.** The choice is per browser, not per Learner account (there is only one Learner), and
it ignores the computer's own dark-mode setting until the Learner first toggles.

## Design tokens (`src/app/globals.css`, `src/app/ui.tsx`, `src/app/theme-cookie.ts`)

**What they are.** A short list of named colours (`--bg`, `--ink`, `--muted`, `--border`, `--brand`,
the teal `--you` set for the Learner's assumptions, the amber `--src` set for sourced facts, and a
few more) defined once in `globals.css`, with a light value and a dark value. Every screen paints
with these names instead of raw colours. `ui.tsx` holds the shared look pieces built on them: tags,
eyebrow, pills, chips, buttons, card, callout, key/value row, the app header, the reading-page shell
and the phone-note frame. The reading-page shell (Course Map, Progress, Past Sessions, Passage) puts
the header in the same wide box as the workspace, so the title and links never shift between pages,
and narrows only the content below it. The trade-off: the header is wider than the text under it on
those pages. Smaller details in the same pass: the Course Map's prerequisite confirm is a labelled
group that moves focus to "Go ahead" (Escape or "Not now" gives focus back), the cited sentence on a
Passage has an amber underline as well as a fill, and old Session pages keep two columns on an iPad.

**Scenario.** The Learner switches to dark mode. The toggle puts a `dark` class on the page, the
token values swap (navy buttons become light navy with dark text, the teal and amber tags darken),
and every piece follows at once without a single per-component dark rule.

**Trade-off.** Colours must go through the tokens, so a one-off shade needs a new token rather than
a quick palette class. In return the look stays consistent and a colour change is one line.

## Usage and the "under the hood" panel (`src/tutor/usage.ts`, `src/tutor/pricing.ts`, `src/app/under-the-hood.tsx`)

**What it does.** Every Tutor turn is made of one or more *steps*. A step is one request to
Claude; when Claude calls a tool, code runs it and a new step starts. After each step the turn
records what Claude's own report says it used: input tokens, output tokens, tokens read from and
written to the prompt cache, reasoning ("thinking") tokens when the API reports them, which tools
were called, how long the step took, and the cost in US dollars. It saves one `usage` row per step
plus one summary row for the whole turn. Cost comes from a small price table in code
(`pricing.ts`: Sonnet 5.5 $2 in and $10 out per million tokens, Opus 5.5 $4 and $20, Haiku 5.5
$0.10 and $0.50, cache reads at a tenth of the input price, cache writes at 1.25 times), checked
against Anthropic's published rates on 2 November 2026. A model missing from the table is shown
as "unpriced", never given a guessed price.

Under each Tutor reply, a collapsed "Under the hood" line gives the step count, tokens, cost and
time. Opening it shows a table, one row per step, with a total row. The same panel appears when
reading an old Session, because it is read back from SQL.

**Scenario.** The Learner asks one plain question. The panel reads: 1 step, 9,643 tokens in, 55
out, $0.025, 2.9 s. Nearly all of the tokens are the Tutor's frozen instructions being written to
the cache for the first time, which is why that first turn costs more than the next ones will.
When the Tutor finishes a Teaching Step, the panel shows two steps: the first calls
`finish_teaching_step`, the second is the reply that follows.

**Trade-off.** Storing usage in our own table means cost history outlives Vercel's short log
retention and can be summed with plain SQL. The price is that the price table is ours to keep
current: when Anthropic changes a rate, someone edits `pricing.ts` (old rows keep the cost they
were saved with). The API does not report thinking tokens on every reply, so that column can read
"n/a". A step's time includes the tools that ran just before it, so it is "time since the last step".

**How it is tested.** The price table is checked against worked literals ($12 for a million
tokens in and out on Sonnet, and a worked Opus turn at $4 in, $20 out and $0.20 per million cache reads). The turn tests check that scripted replies produce the right rows,
sums and costs, and that a reloaded Session shows the same panel.

## Checks before merging (CI) (`.github/workflows/ci.yml`, `vercel.json`, `src/test/setup.ts`)

**What it does.** Nothing reaches `main` or production until two GitHub Actions jobs pass, with no
secrets in either:

- **`check`** runs `npm ci && npm run check`: the type checker, the linter, the Course Map
  validator and every test.
- **`build`** runs `npm ci && npm run build`: the real Next.js production build, so a page that
  compiles in tests but breaks the build is caught before Vercel sees it. The build reads no
  environment variables; a module that needs one must read it lazily, when a request arrives.

The two job names are the required checks in the ruleset on `main`. A pull request is opened, both
checks run, and with auto-merge on, GitHub squash-merges it the moment both are green. The rule is
not "strict": a branch need not be up to date with `main`, so several pull requests can merge in
parallel without queueing. Because of that, CI runs again on `main` after each merge. A newer
push to the same pull request cancels its older run; runs on `main` are never cancelled.

Production deploys from `main` through Vercel's own Git connection, so merging is deploying.
`vercel.json` (`git.deploymentEnabled`) turns every other branch off, so no previews are built.
Previews are off for now because there is no preview database: a preview would either point at
production data or fail at the first query.

**Scenario.** You merge a pull request that renames a function. Its tests pass, but one page still
imports the old name. `check` is green (tests mock that page), `build` fails, auto-merge waits, and
nothing deploys. You fix it, push, the old run is cancelled, both go green, it merges, Vercel
deploys `main`, and CI runs once more on the merge commit.

**The runner crash, and the test databases.** CI used to be cancelled about two minutes in, when
the runner ran out of memory. Every `testDb()` call starts a whole in-memory Postgres (about
85 MB), and nothing closed them: one test file makes 60+ of them, so a single worker reached 5 GB.
`src/test/setup.ts` now closes the clones after each test and everything (including the saved
template) after each file, and on CI Vitest runs 2 workers (GitHub's free runner has 2 cores and
7 GB). Measured with 2 workers, total test memory fell from about 10.9 GB to 4.8 GB.

**Trade-off.** Required checks and auto-merge mean a slow or broken CI blocks everything, and
there is no human review step; a wrong test can ship. Closing databases per test costs a little
speed, and a test that wants to share one database across tests must create it in `beforeAll`.
Without previews you only see a change in production after merging.

## Conversation Check and what the Tutor remembers (`src/tutor/turn.ts`, `src/tutor/context.ts`, `src/learner/memory.ts`)

**What it does.** At a conversation Check, the Tutor puts the Check's question to the Learner,
questions their reasoning, and then gives a verdict, pass or not yet, with its reasons, through
a tool called `record_check_verdict`. Code, not the Tutor, decides what the verdict means:

- **Only the current Check.** The Check's question and pass criteria reach the Tutor only when the
  Learner is at that Check's step, never earlier and never for a later Check. A verdict for any
  other Check, or when no Check is being taken, is refused with a tool error, and nothing is saved.
- **Saved with reasons.** Every verdict is a row in `check_results`: pass or not, the Tutor's
  reasons as evidence, and the model that taught the Check (so models can later be compared on
  real results).
- **Not yet means stay.** A Learner who doesn't pass stays at the Check and tries again. A pass
  moves them on (to the next Check or the reveal).
- **No verdict.** If a turn ends at a Check without a verdict (the Tutor has just asked the
  question, or is still probing), the Learner stays put and the next context message opens with
  "No verdict was recorded for Check ...", including the first message of a new Session.
- **Misconceptions.** When the Tutor notices a real misunderstanding, it calls
  `record_misconception`, and code saves it in `misconceptions` with the Topic, the Check in play
  and the model.
- **Once only.** Both tools are keyed by the tool call's ID, so if the same call arrives twice
  (a retry, a resumed turn), the second has no effect.

**The summary.** Code builds a short plain-text summary from SQL, with no model call, and sends
it as the first message of every new Session (the workspace shows the same text on opening). It
says the Topic and Teaching Step, the unmastered prerequisites (the Topic's prerequisites, and
theirs, that are not passed, with "not started" or "in progress"), the last eight misconceptions
noted in those Topics, and the last "not yet" verdict at the current Check with its reasons.

**Scenario.** At the jackpot Check the Learner says "$1.537 billion is bigger than $877.8 million,
so take the annuity." The Tutor saves "not yet" with the reason "compared undiscounted totals" and
notes the misconception "compares payments at different dates without discounting". The Learner
stays at the Check. They come back two days later: the new Session's first message tells the
Tutor about that misconception and the last verdict, so it picks up the real gap. A live run of
exactly this, against the real API with a throwaway database, cost about $0.04 for three turns.

**Trade-off.** The Tutor judges the reasoning, which a quiz key can't, but its judgement is only
as good as the model and the pass criteria; saving the reasons makes each verdict reviewable.
A plain SQL table and a summary written in code (no memory framework such as mem0 or Letta) keep
everything visible and testable, at the cost of writing each kind of memory by hand. The summary
lists at most eight misconceptions and never marks one as fixed yet, so an old confusion can
linger in it until a later ticket adds that.

## Quiz Check marked by code (`src/course/quiz.ts`, `src/learner/quiz.ts`, `src/app/quiz-panel.tsx`, `/api/quiz`)

**What it does.** A quiz Check is a short set of multiple-choice questions that code shows, marks
and records. The Tutor never writes or marks them, and marking makes no model call, so it is
instant and costs no tokens. The present value Topic now has one of each kind: a quiz Check
(`pv-quiz-discounting`) and the conversation Check about the jackpot.

- **Questions live in the Course Map.** Each is Claude-written, with its choices, the right
  answer, an explanation and a cited source (the CFA Institute's time-value-of-money reading and
  Investopedia). Every answer was checked against that source's formula, and a test recomputes the
  numeric ones with our own Finance Calculations, so a wrong key fails `npm run check`.
- **The pass rule is in the Course Map too.** The present value quiz holds six questions, shows
  three per attempt and needs two right.
- **The key stays on the server.** When the Learner reaches the quiz Check, the page shows only
  the prompts and choices. The right answers and explanations leave the server only in the reply
  to a submitted attempt. A test asserts the page's quiz data contains neither.
- **Marking.** The browser posts its answers to `/api/quiz`; code marks them, saves a pass or a
  miss through Learner Memory (the same door a conversation verdict uses, with no reasons) and
  returns the marking. A pass moves the Learner on. A miss keeps them at the Check. Sending the
  same attempt twice changes nothing. Only the current Check's results are accepted. The result,
  the Learner's new place and the marked attempt are saved in one transaction: if any write fails,
  none of them is saved, the Learner sees "Your answers could not be saved just now, so nothing was
  recorded", and can submit the same attempt again.
- **Retries differ.** Each attempt is a row in `quiz_attempts`. Attempts walk round the Check's
  pool, so the second attempt starts on questions the first did not show whenever the pool is
  bigger than one attempt. If there are no other questions, the same ones return.
- **Removed questions don't lock the Learner out.** If a question is taken off the Course Map (or
  leaves the Question Bank) while an attempt is open and unanswered, the attempt is given a fresh
  selection from the questions that are still there. If fewer are left than the pass rule needs,
  no quiz is shown and the error is logged, rather than the page failing. The Tutor is then told
  that the quiz cannot be shown and checks the Learner in conversation instead, on the Topic's
  Concept, and its verdict is recorded as for a conversation Check, so the Learner is never stuck at
  a Check nobody can mark. A result already submitted still reaches the Tutor after one of its
  questions is removed: the note uses the score saved at submission and names only the missed
  questions that can still be found, so a removed question can't make every later turn fail. The workspace also loads
  the quiz on its own, so a quiz that fails to load leaves the rest of the page working.
- **Only code marks a quiz.** The Tutor's verdict tool refuses a quiz Check ("it is marked by code
  from the Learner's answers"), so a Learner who asks to be passed still has to submit the quiz. The
  one exception is a quiz that cannot be shown (above).
- **The Tutor hears afterwards.** The Learner's result is not sent to the Tutor at once, because
  the Tutor is not called. On its next call, code puts a note in the history: "Quiz result by code,
  Check ..., attempt 1: 1 of 3 correct (needs 2). Not passed ...", naming each missed question,
  what the Learner chose and the right answer. It goes in the same system message as the
  Course Navigator's context, directly after the Learner's message (the one place the API accepts
  a system message), or at the top of the opening message of a new Session. A note is sent once.

**Scenario.** The Learner finishes the concept and "your turn" and the page shows the quiz. They
get "$1,210 in two years at 10%" wrong, picking $1,100, and get two right. That is two of three,
so it passes at once, and the screen explains the miss ("dividing by 1.10 only once discounts for
one year"). They press Continue and the Tutor opens with a short, informed word about the
one-year versus two-year slip, then moves on. Had they got only one right, they would have stayed
at the Check, seen a different set of three questions, and the Tutor would have been told about
the miss on its next turn.

**Trade-off.** Multiple choice is fast, cheap and can't be argued with, but it tests recall and
recognition, not reasoning; that is what the conversation Check is for. Writing the questions in
the Course Map keeps them reviewable and testable, at the price of Claude (or the owner) writing
and sourcing each one. The Tutor learns about a result late (on the next message, not the moment
of submission), which keeps the quiz free of model calls. Imported open question banks, spaced
review and a Question Bank in the database come in later tickets.

## Case Data (`src/case-data/`, `/api/case-data/[caseId]`, `npm run case-data:import`)

**What it does.** Case Data is the checked historical data a Case is taught with: a few headline
figures and, where useful, a series over time. Each dataset lives in Neon (`case_datasets` for its
label, unit, source, source link and how it was checked; `case_data_points` for its dated values).
The app only reads it. Datasets are written from the laptop: a JSON file, kept outside the public
repo, goes through `npm run case-data:import -- <file>`, which checks every field (a source link is
required, dates can't repeat), refuses datasets whose Case is not on the Course Map, and replaces a
dataset's points when it is imported again.

**The as-of rule.** Every Case has an as-of date. Until the Learner's reveal has been shown, the
server returns only points dated on or before it, and leaves out any dataset that has no point that
early (its name alone could give the ending away). After the reveal, everything comes back. The
same filtered data goes to the Tutor: each Course Navigator message lists the datasets it may show,
with their references, sources and values (long series summed up by their first and last points),
plus the instruction that these are its only historical figures and that it must say plainly when
the Learner asks for data that isn't there. When a Case has no data, the message says so.

**First datasets (present value Case, checked 2 November 2026).**
- Advertised jackpot $1.537 billion, 23 Oct 2018: Mega Millions official release of 24 Oct 2018
  (megamillions.com), matching AP and CNN.
- Cash option $877.8 million, 23 Oct 2018: CNBC of 24 Oct 2018, matching CBC; the official release
  rounds it to $878 million.
- The winner's choice, a one-time cash payment of $877,784,124, 4 Mar 2019: the South Carolina
  Education Lottery Commission's statement as reported by Reuters, matching NBC, ABC and the New
  York Times. Withheld until the reveal.
- 30-year US Treasury par yield, daily, 2 Jul 2018 to 4 Mar 2019 (166 days): the Treasury's Daily
  Treasury Par Yield Curve Rates downloads (public domain), spot-checked against its table view.
  Before the reveal only the 80 days up to 24 Oct 2018 come back.

**Scenario.** At the story step the Learner asks for the S&P 500 in October 2018. That isn't in Case
Data, so the Tutor says it can't chart it and offers the Treasury yield instead (live run, 2 Nov
2026). It draws `HistoryChart("mega-millions-2018/treasury-30-year")`: the chart stops at 24 October
and says later data is withheld until the reveal. Asked which option the winner took, the Tutor
declines until the reveal; the winner's dataset isn't even listed to it. After the reveal, the
same chart shows the yields through March 2019, and the winner's cash payment becomes available.

**Trade-off.** Keeping Case Data in the database, not in the Course Map files, keeps it private
and lets it grow to long series, but a fresh database has no Case Data until someone runs the
import from the laptop, and the import files must be kept safe outside the repo. The Tutor still
knows famous endings from its own training; code withholds the data, and the instructions and
hindsight test questions cover the rest. One such leak was found live (2 November 2026): in the
1994 Fed Topic, the Tutor offered "a made-up move" to practise on, 3% to 3.25%, which was the Fed's
real move. The instructions now say that before the reveal no example or made-up number may match
the real outcome, and point the Tutor to the Topic's own Concept or Check prompt for hypothetical
numbers (code already sends those, and they use neutral numbers).

## Surviving cut-offs and failures (`src/tutor/turn.ts`, `turn-status.ts`, `tools.ts`, `failures.ts`, `src/app/conversation.tsx`)

**What it does.** Makes a turn safe to interrupt and safe to repeat.
- **Saved status and resume.** Each turn has a row in `turns`: running, cut off, finished or failed.
  A turn stops itself after 270 seconds, inside Vercel's 300, and marks itself cut off. Everything
  up to the last finished loop step is already saved. The browser sees the stream end without
  "done" and starts a resume request on its own, which continues from the last saved step in a
  new function call. The resume first sends the saved reply text, which replaces what was on
  screen, so text from the unfinished step is never kept. Opening the page with a cut-off turn
  also resumes it. A turn killed outright counts as cut off once it is older than any function can live.
- **Tools that write happen once.** Every tool call's effect (a verdict, a finished step, a
  misconception) and its result are saved together in one transaction, keyed by the tool call ID.
  A repeat of the same call returns the saved result and changes nothing. A tool call that was
  saved without its result (the cut came between the two) is re-run under its own ID before Claude
  is called again, so it gets its result without a second effect.
- **One turn at a time.** Only one `turns` row may be running; the database enforces it. A second
  send, from a phone or another tab, gets a plain "turn in progress" answer (HTTP 409), and nothing
  is saved.
- **Stop reasons and failures.** A reply that hits `max_tokens` is kept as sent and the Learner gets
  a Continue button; a tool call cut off inside it is never run, and is answered "not run". A
  `refusal` is discarded, because Claude's docs say to treat a declined reply as incomplete and
  discard it, so it cannot stay in history. Only the declined loop step is discarded: steps before
  it in the same turn, and what their tool calls recorded, are already saved and stay, on screen as
  well as in SQL. The Learner sees a plain message that says which: "Nothing was changed" when no
  earlier step recorded anything, or that what was already written and recorded is kept. The next
  message starts a new Session from SQL rather than editing history. An API
  error says why in plain words (credits run out or spend limit, rate limit, Claude busy, no
  connection), keeps everything saved, and offers Retry, which resumes the same turn rather than
  sending the Learner's message again (this fixes the repeated Learner messages seen in #6). What
  the Learner sent is saved on the turn row (`turns.input`) when the turn starts, so a turn that
  fails before their message reaches the Session (a database error while picking the Session, say)
  is run again from that saved message on Retry; the message is not lost.
- **A failed progress write.** If saving a verdict or step fails, the transaction rolls back, so
  the Course Navigator doesn't advance. Claude's tool result says plainly that nothing was recorded,
  and the Learner sees an error.
- **A deploy that changes the Tutor.** A Session whose frozen instructions or tools differ from the
  new build's starts afresh from SQL on the next message, and the workspace says so in one line.
- **Compaction for long Sessions.** When a turn ends with the conversation over `compact_at_tokens`
  (a setting, default 200,000 tokens), the Tool Runner asks Claude's API for a summary (on-demand
  compaction, beta `compact-2026-09-04`). The summary is stored as a new message; later requests
  start from it. Nothing is deleted, so the whole Session still reads back in full, and the Course
  Navigator's context is sent again after it, because context inside the summary no longer counts.

**Scenario.** The Learner sends a message. Claude finishes the story step, then starts a long
explanation, and the 270 seconds run out. The finished step and its tool result are saved; the
half-written explanation is not. The browser shows "resuming", calls again, receives the saved text,
and the explanation is written afresh in the new call. The step was recorded once. If the Learner's
phone sends a message meanwhile, it is told a turn is in progress. (Live check, 2 Nov 2026: with the
limit set to 1.5 seconds the browser resumed ten times on its own, the phone got the 409, and opening
the page with the normal limit finished the turn with the Learner's message shown once.)

**Trade-off.** A single loop step longer than the time limit can never finish, because each resume
starts that step again; at 270 seconds and a 16,000-token reply this is far off (the longest real
turn so far took about 23 seconds, over five steps). Discarding a declined reply costs a fresh Session, which loses the
conversation's flow but keeps all progress. WebSocket connections are slightly slower to open than
HTTP queries. Compaction loses detail from early in a long Session; the summary is Claude's own.

**How it is tested.** At the Tutor Turn seam with the scripted client: a cut-off and resume that
repeats no write (a finished step and a verdict), the replayed text, a resume whose reply was already
saved, a stale lock, the 409 for a second send, `max_tokens`, `refusal`, a credits error with Retry,
a database write that fails (a test trigger refuses the write), a changed fingerprint, a misconception
with an unknown Topic ID, and compaction. Live runs against Claude are in the evidence folder.

## The explore step (`insight` and `explore` in `course/topics/*.yaml`, `src/course/navigator.ts`, `src/course/map.ts`, ADR 0001)

**What it does.** A Topic file may carry an Insight (the question to put, the written Insight, a
"found when" description and one or two hints) and an `explore` block naming the Check it comes
before, and whether a Learner who already passed the Topic is taken through it again
(`requiredWhenPassed`). The two come together or not at all. The course check rejects an `explore`
that names a Check the Topic does not have, and any digit, currency sign or percent sign in the
Insight text, so the Insight is written in words and cannot hand the Learner a number to look for.
The Course Navigator then puts explore after the concept of that Check and before its your turn,
once per Topic. Finishing it is refused until the Insight is recorded as found or told. A Topic
without an Insight skips the step, so the course moves over in batches.

**Rules for Learners already part-way.** The Navigator never moves anyone backwards. A Learner
already past the anchor Check, because the Insight was added after they passed it, takes explore just
before the reveal instead; a Learner whose reveal is already shown is left where they are. A passed
Topic gets explore back only when it says `requiredWhenPassed`, and then before any new Topic starts,
the way a due Check does.

**A concrete scenario.** Present value has Checks for the discounting quiz and the jackpot
conversation, and explore is anchored to the jackpot conversation. The Learner passes the quiz and
finishes the jackpot Check's concept step. The Navigator now says "explore", not "your turn". The
Course Map page shows "Teaching Step: explore". Only when the Insight is found or told does the
Learner reach the jackpot conversation.

**Trade-off.** A Topic takes one or two more turns, and progress rows now store "explore" as a step,
so removing the step later needs a data migration that moves those rows on (ADR 0001). In return the
order is held by code, not by a prompt that live runs showed being ignored.

## Insight recording (`record_insight_attempt` in `src/tutor/tools.ts`, `src/learner/insight.ts`, the `insight_attempts` table)

**What it does.** At explore the Tutor puts the Insight question and the Learner plays with the Widget
on screen (the Topic's own explore Widget, see below), then says what they noticed. The Tutor reports each attempt with
`record_insight_attempt` as found, not yet, or asked to be told, quoting the Learner's words. Code
checks the words are really in the Learner's message in that turn (a Continue press is never an
attempt), saves them in `insight_attempts` once per tool call ID, and decides what happens next:
the first not-yet releases hint 1, the second hint 2, the next the written Insight; "asked to be told"
releases the Insight at once. The result carries the hint or the written Insight, and tells the Tutor
to write its confirmation or hint after the result, as the last text of its reply.

**Withholding.** The context for the explore step holds the question, the "found when" description
and the hints already released, never the written Insight, the reveal or Case Data dated after the
as-of date. The written Insight reaches the Tutor only in the tool result (and in the context once it
is settled). After two earlier turns at explore with no attempt, the context reminds the Tutor to put
the question. Telling the Insight marks the step as begun this turn, so the pacing rule stops the
Tutor finishing explore in the same turn. At the principle step the context carries the Learner's own
words, saved at the attempt that settled it, and says whether they found it or were told.

**A concrete scenario.** The Learner writes "the bars get smaller". The Tutor records a not-yet, and
code replies with hint 1. After the same again, hint 2. After a third not-yet the result contains the
written Insight and the Tutor tells it kindly. Had the Learner written "just tell me" at the start, the
Insight would have come at once. All three messages sit in `insight_attempts` exactly as typed.

**Trade-off.** Judging whether the Learner found the Insight stays with the model, because only a
model can read free words; code controls everything around that judgement (the count, the hints, the
withholding, the order). A Tutor that says "found" too readily is checked by the behaviour set, not by
code. Sessions that started before this change keep their frozen tools and have no way to record an
attempt, so the app starts a new Session when the tools change.

## The explore Widget (`explore.widget` in `course/topics/*.yaml`, `src/course/explore-widget.ts`, `src/app/widget-panel.tsx`)

**What it does.** A Topic with an explore step can carry its own Widget, written in the Topic file as
OpenUI code beside the Insight. Code, not the Tutor, shows it. From the moment the explore step begins it
opens by itself in the Widget panel as an "Explore" chip, and it stays there until the Topic is passed, so
the Learner can keep playing during their turn and the Check. It is chosen from saved progress alone
(`exploreWidgetFor`), so a page reload shows it exactly the same, and an old Session page shows it too when
that Session reached the explore step (read from the Course Navigator context saved in the Session). A
newer Widget from the Tutor still opens on its own, because the explore Widget is placed after only the
Widgets the Tutor had drawn when it appeared. The Tutor's explore context tells it the Widget is already on
screen, so it points to it and does not draw its own. Below the laptop breakpoint (an upright iPad) the
panel hides its copy and a folded card, open to start, stands in the conversation column under the status
card instead; at laptop width only the panel shows it.

**Rules the course check holds.** The `widget` text is optional, but every `"caseId/datasetId"` it names must
be one of the Topic's own Cases and a dataset that Case lists in `data`. A test parses every real explore
Widget with the same checker as Tutor Widgets. Case Data still goes through the as-of rule on the server, so
the Widget cannot draw anything dated after the Case's as-of date before the reveal.

**A concrete scenario.** Present value's explore Widget is an interest-rate slider and the annuity chart
set against the sourced cash option (the one figure dated on or before 24 October 2018). The Learner
finishes the jackpot Check's concept step; the next reply ends, the page refreshes and the "Explore" chip is
already open with the slider at 5%. They ask a question, the Tutor draws a calculator, and that newer Widget
takes the panel; the Explore chip stays beside it. After the Learner passes the Topic the chip is gone. The
winner's payment and the 30-year Treasury chart are left out on purpose, so playing leads nowhere near the reveal.

**Trade-off.** The Widget is fixed text in the Topic file, so it cannot adapt to a Learner the way a Tutor
Widget can, and it costs nothing in tokens. Both the panel copy and the narrow card are drawn in the page
(one hidden by CSS), so resizing the window resets the slider. An old Session is matched to the Topic by the
title in its saved context, so a Topic renamed later loses its chip on old Session pages.

## Pacing rule (`src/tutor/tools.ts`, `src/tutor/instructions.ts`)

**What it does.** Live runs showed the Tutor finishing several Teaching Steps in one turn without
teaching them: it called `finish_teaching_step` for the concept, then the your-turn step, then the
Check, all in one reply. Now code refuses. When a tool call moves the Learner onto a new step (a
`finish_teaching_step`, or a passing Check verdict), the `tool_calls` table records that this turn
began a step (`turn_id`, `began_step`). A later `finish_teaching_step` in the same turn is rejected
as a tool error: "it began during this turn. Teach it in your reply now, then stop and wait for the
Learner to answer". The same applies to the very first step: a Topic that this turn started (its
`turns.started_topic` flag, called `freshStep` in code) cannot have its story finished in that turn.
The same flag is set when a quiz pass, marked by code between turns, moved the Learner onto the next
Check's concept (or the reveal): that step has not been taught yet either. Recording a Check verdict
follows the rule as well: a `record_check_verdict` for the current Check is rejected in the turn
that reached the Check step, because the Learner has not had the chance to answer the Check prompt. So every step is taught in a
reply the Learner sees and answers before it can be finished. The Tutor's instructions state the rule too, so it normally never trips it. A resumed turn
keeps its turn ID, so a cut-off cannot be used to skip the wait.

**Scenario.** The Tutor finishes the story, and code moves the Learner to the concept. The Tutor
tries to finish the concept straight away; code answers with the rejection. The Tutor teaches the
concept in its reply and stops. The Learner answers; in that next turn finishing the concept works.

**Trade-off.** One step per turn at most, so a Topic takes more turns (about fourteen for present
value) and costs a little more than a Tutor that sprints. That is the point: the Learner is taught
each step. The rule lives in code, not in the prompt, because a prompt-only rule was ignored.
A turn also puts text written after a tool call on a new paragraph, since a reply can now hold
the end of one step and the start of the next.

The fresh-step flag is also set by a jump: the first turn after the Learner chose a Topic on the
Course Map page, or went back to the default path, cannot finish the step it lands on, because
nothing of that step has been taught in this conversation (see "Course Map page and jumps").

## Simulated Learner (`scripts/simulated-learner.mjs`)

**What it does.** A script that plays the Learner over HTTP against any running copy of the app: it
logs in with the passcode, presses Continue, answers the Tutor with a cheap model (`claude-haiku-5-5`),
takes the quiz through `GET`/`POST /api/quiz` (code marks it, no model call), and keeps going until the
Topic is passed. After each turn it reads the step, duration and cost from the `usage` table, and it
writes a transcript, a per-turn table and a cost summary to a folder you give it (outside the repo,
because transcripts hold source-derived text). `--reset` archives the Topic's saved progress first (rows
are renamed, nothing is deleted) so a run starts at the story. By default it forces one new Session in the
middle of the Topic, by setting `session_idle_hours` to 0 for a single turn, to prove that closing the app
and returning resumes at the right place. The saved value is put back after that turn, and also if you
press Ctrl-C or the script is killed during it: otherwise the live app would be left opening a new Session
on every message. `--reset` clears the Learner's current Topic only when it is the Topic being reset, so a
Topic you chose on the Course Map page is kept.

**Scenario.** After a deploy, run it against the production URL: fourteen turns later you have a
transcript of a whole Topic, the cost per turn, the longest turn, and proof that a new Session carried on
at the same step.

**Trade-off.** It talks to the real Tutor and the real database, so each run costs about a quarter of a
dollar and changes the saved progress (hence `--reset`). The Learner is a model, so it is polite and
quick to follow: it checks the plumbing and the pacing, not whether a real person finds the teaching
good. It reads the database directly for cost and step, so it must use the same `DATABASE_URL` as the app.

**How it is tested.** The pacing rule and the paragraph break are tested at the Tutor Turn seam with the
scripted client. The runner itself is a script, checked by running it end to end (evidence folder for #11).
Its two database writes, the temporary idle setting and `--reset`, live in `src/dev/simulated-learner.ts`
and are tested against the in-memory database, including a Ctrl-C in the middle of a turn.

## Course Map page and jumps (`/course`, `/progress`, `/api/jump`, `src/course/navigator.ts`)

**What it does.** Two ordinary pages, read from saved progress only (no model call, no randomness),
so they look the same on every visit. The **Course Map** page (`/course`) shows every Topic as a stop
in default-path order, its Checks marked along the way (a tick for a pass, a frame round the Check
the Learner is at), the Topic's status and step, any prerequisites not yet passed, and a "You are
here" label. The **progress** page (`/progress`) is a table: each Topic's Stage, status (not started,
in progress or passed) and how many Checks are passed. Both come from one pure Course Navigator
function, `courseOverview`, so what the page shows and what the Tutor is told can never disagree.

Each Topic not yet passed has a "Study this Topic" button. If the Topic has prerequisites the
Learner hasn't passed, the button first asks: "Bond prices builds on Present value, which you have
not passed yet. You can fill the gap first, or go ahead anyway." Going ahead calls `/api/jump`,
which saves only the current Topic (`learner_state.current_topic_id`). Every other Topic keeps its
step and passes untouched. A "Back to the default path" button clears the choice. Passing the chosen
Topic also returns the Learner to the default path (that rule was already in the Navigator).
Asking an off-map question changes nothing: the place is always computed from saved progress, and
only tools and jumps write it. A jump is refused while a turn is running, so the Tutor's tools
never act on a Topic that changed under them.

A jump sets `learner_state.entered_by_jump`. The next turn takes that mark (once), copies it to the
turn row, and: (1) puts a short note before the context ("The Learner chose this Topic on the Course
Map ... teach it afresh"), and (2) sets the turn's fresh-step flag, so the pacing rule stops the Tutor
from finishing the landing step before teaching it. A retry of that turn still knows, because the
mark is kept on the turn row.

**Course Map edits.** Tested in the Navigator: an inserted Check becomes the place if it comes
first without a pass; an inserted Topic appears as not started without moving the Learner; a removed
Check or Topic keeps its records and is ignored (a chosen Topic that was removed sends the Learner
back to the default path); a reorder of Checks or Topics keeps every pass and changes only what comes
next; an added prerequisite never moves the Learner out of a started Topic and is shown as unmet, also
in the jump prompt.

**Scenario.** The Learner is halfway through Present value (at Check 2's concept) and is curious about
bonds. On the Course Map they press "Study this Topic" on Bond prices, see the prerequisite prompt,
and go ahead. The workspace's next turn tells the Tutor about the jump; the Tutor tells the Bond
prices story. Two days later they press "Back to the default path": Present value is still at Check
2's concept, and the Tutor re-teaches that concept before moving on.

**Trade-off.** The warning is a prompt, not a block: the Learner may study out of order, at the cost
of meeting ideas before their foundations (the Tutor sees the unmet prerequisites in its context). A
passed Topic can't be chosen again as a jump; looking back is what old Sessions are for, and spaced
review will bring back its questions. The page groups Topics under four Stage headings (Foundation,
Follow, Judge, Analyse), each a list in default-path order with a dot for not started, current or
passed; Foundation rows also show their Subject. Progress, the Passage view and Login use the same
design tokens; the first two sit under the app header, Login (signed out) has none.

## Tutor replies as Markdown (`src/app/reply-markdown.tsx`, `src/app/old-session.tsx`)

**What it does.** The Tutor writes Markdown (bold, lists, headings, tables). Before, the workspace
and old Session pages showed the raw symbols (`**bold**`, `- item`, `## Heading`). Now replies go
through assistant-ui's Markdown package (`@assistant-ui/react-markdown` 0.14.24, which pairs with
`@assistant-ui/react` 0.15.32). Widget blocks (```openui-lang fences) are not shown as code: the
renderer hands each one to our own slot, so the widget's marker (workspace, laptop), or the widget
itself (phone, and old Sessions), sits exactly where the Tutor put it. Before rendering, the reply is
rebuilt by the same splitter the widget pane uses (`markdownSource`), so a fence still streaming in
never flashes up as code. Old Sessions now use the same assistant-ui thread, read-only, with no
composer and no model call.

**Scenario.** The Tutor replies "**Late bars:** each payment is divided by (1+r)^n" followed by a
three-item list and an annuity chart. The Learner sees bold text, a bulleted list, and a "Widget 2 →"
marker between the list and the next paragraph; the chart is in the right pane.

**Trade-off.** One more package (small, by the same authors as assistant-ui, MIT). The text is no
longer animated word by word as it streams (`smooth` off): the animation would put the shown text
behind the real text, and widget markers are matched against the real text. Learner messages stay
plain text on purpose.

## Past Sessions (`src/app/sessions/`, `session-card.tsx`, `old-session.tsx`, `src/tutor/session-summary.ts`)

**What it does.** Past Sessions is a list of cards, one per Session, newest first. Each card shows
"SESSION 3 · 24 OCT 2026", a title (the Session's first Topic and its date), a pill per Topic and a
Widget count. The database has no Topic column, so code reads the "Topic: ..." lines the Tutor
context left in the saved messages, in one query for all Sessions, and counts the Widget blocks
(minus the ones a correction replaced). With no Topic found the title falls back to "Session 3".
A card opens the old Session page: the workspace's two columns, read-only, with "Widget N →" chips,
the Widget panel (controls at their starting values) and a "Back to the workspace" button where
the composer would be. No model call anywhere.

**Scenario.** The Learner opens Past Sessions, sees "Present value, 24 Oct 2026" with "2 Widgets",
opens it, clicks "Widget 2 →" to see that chart again, then goes back to the workspace to carry on.

**Trade-off.** Topics come from reading saved text, not a stored column, so a Session whose
messages were compacted away shows the number title. Adding a column would be exact but needs a
migration and a backfill.

## Spaced review (`src/course/review.ts`, `reviewsDue` in `navigator.ts`, `src/learner/review.ts`, `/api/review`, `src/app/review-panel.tsx`)

**What it does.** Old quiz questions come back just as the Learner is likely to forget them. A
question gets a review schedule once its quiz Check is passed. Its first rating comes from the
Learner's answers in that Check: right counts as "Good", wrong as "Again". The schedule is worked
out by the `ts-fsrs` library (the FSRS method), set to whole-day gaps, and kept per question in
SQL (`review_cards`, plus `review_log` for every rating). At the top of the Study Workspace, above
"Where you stand" and the current Teaching Step, a review panel shows one due question at a time,
most overdue first. Code marks the answer, shows the right one with its explanation and
reschedules the question. No model is called, to open the page or to answer.

**A concrete scenario.** The Learner passes the present value quiz on Monday, getting two of
three right. The wrong one is due again in about a day, the right ones in a few days. Three weeks
later they open the app: all three are overdue, and the panel offers the one missed first. Answering
it right pushes it out by weeks; answering it wrong brings it back soon. After 10 reviews in the
Session the panel stops, even if 40 are due, and the rest wait for the next Session. A long
holiday shows as "40 due, 10 per Session", not as a pile to clear.

**Rules in code.** The Course Navigator's `reviewsDue` is a pure function: cards, the time and
the number done this Session in; the overdue cards to offer out, capped. The cap is the
`review_cap` setting (default 10), changeable in SQL without a rebuild. "This Session" is counted
from when the Session began. A Session that begins after an idle gap counts from that gap, so
reviews done before its first message still count against it. A review never writes to Topic
progress: a missed review cannot unpass a Topic (a test pins this).

**Trade-offs.** Cards are built from saved quiz attempts the first time the review state is read,
so no change to the quiz code was needed and it can be re-run safely. The cost is that a card can
appear a moment after the pass rather than at it. Whole-day scheduling suits "open the app once a
day" study but cannot do same-day repeats of a missed question. Only questions still on the Course
Map are offered, so deleting a question quietly retires its card.

## Library (`src/library/`, `search_library` tool, `npm run library:load`, `library:embed`, `library:score`)

**What it does.** The Library is the private collection of real sources the Tutor searches when it
wants a definition, a quote or context. It lives only in Neon: `library_sources` holds one row per
source (title, licence, credit line, link, and whether it is **dated**, like a blog post, or
**timeless** reference, like a textbook); `library_passages` holds the source cut into passages of
up to about 300 words, each with its own heading, link, publication date, licence and credit. The
Tutor has one new tool, `search_library`. Code runs the search and hands back the best five
passages, each with its credit line, licence, date and link, and the Tutor's instructions say to
keep quotes short; code adds the citation and credit (the Tutor does not name sources in its sentences).

**How search works.** Two rankings are combined in one SQL query. The keyword ranking is BM25, the
standard search-engine scoring, through Neon's `lakebase_text` extension (confirmed working on the
Free plan on 2 Nov 2026; the migration switches it on wherever it exists). The meaning ranking
compares Voyage embeddings with pgvector, so a question that shares no words with its answer can
still find it. The two lists are merged by reciprocal rank fusion (a passage near the top of either
list rises). Voyage is optional: without a `VOYAGE_API_KEY`, or when Voyage doesn't answer within
5 seconds, search uses keyword results only and the tool result tells the Tutor so.

**The as-of rule here.** While the Learner's current Topic has a Case before its reveal, search
leaves out dated passages published after the Case's as-of date, and also timeless passages that
mention the as-of year or a later one (a 2026 textbook can describe 2020 or 2022). The as-of year
itself counts, because a passage only gives a year, not a day: for a Case as of 16 October 1987, a
lecture saying "in 1987 the Dow fell 22.6 percent" is about 19 October, three days later, and would
give the ending away. The cost is that a passage about something earlier that same year is hidden
too until the reveal. After the reveal, everything is searchable again.

**Library scripts (laptop only).** Source text never enters the public repo. For OpenStax:
`git clone` the book's repository into a scratch folder, run `scripts/library/openstax.py` to pull
out the book's own words (exercises, quizzes, videos and figures left out), then
`npm run library:load -- openstax-principles-finance-2e <file>`. The loader cleans the text (folds
ligatures such as "ﬁ", rejoins words split across lines), cuts it into passages, keeps corrupted
passages out and lists them ("CreaAon" for "Creation", letters spaced apart, PDF character codes),
replaces the source's passages, and refreshes the BM25 statistics. `npm run library:embed` adds
Voyage embeddings once a key is set. Source details (licence, credit, how to fetch) are in
`scripts/library/sources.json`.

**First source.** OpenStax *Principles of Finance 2e* (Dahlquist and Knight, published 24 Jun 2026,
CC BY-NC-SA 4.0): 130 chapter sections, 1,043 passages, about 191,000 words, 6 MB in the database.
None was flagged as corrupted (it comes from clean XML, not PDF). It is marked timeless.

**The rest of the Library (#21).** Seven more sources, each handled by what its terms allow
(extractors in `scripts/library/sources.py`, one command per source in `scripts/library/sources.json`):

| Source | Passages | Kind | Handling |
|---|---|---|---|
| Damodaran's blog, *Musings on Markets* (685 posts, 2008 to Oct 2026) | 6,513 | dated by post | stored whole for search; the Tutor is told it may quote **at most 60 words** at a time, with credit |
| Damodaran's papers (45 PDFs from his site) | 4,058 | dated by file date | used with acknowledgement, no resale; 2 chart pages read by vision |
| Yale ECON 251 (Geanakoplos, 2009) and ECON 252 (Shiller, 2011) transcripts | 1,278 and 965 | timeless | CC BY-NC-SA 3.0, credited |
| The Fed Explained (Federal Reserve Board, 11th ed.) | 236 | timeless | public domain, credited |
| New York Fed explainer pages (14) | 52 | timeless | its Terms of Use allow storing with attribution |
| Anthropic's Form S-1, filed 26 Oct 2026 (accession 0001628280-26-067168) | 1,385 | dated 2026-10-26 | public filing, fetched with EDGAR's API and a declared User-Agent; every section heading carries its page number |

Three rules are enforced in code, not left to the instructions. First, **quote limits**:
`library_sources.quote_words` (migration 0015) is set for the blog, and the search result text then
says "Quote at most 60 words from ..." beside those passages. Second, **sources kept out**: loading
refuses any source whose id, title or link names Buffett or Berkshire, Zitron, the CNBC Buffett
Archive, Investopedia, YouTube, the IMF, FRED or St. Louis Fed, SEBI, or the RBI; a test also checks
that every source in `sources.json` passes. Third, **dates**: the S-1 and the blog are dated, so
while a Case is before its reveal their later posts and the S-1 are hidden; the Yale and Fed texts
are timeless, so they are hidden only when they mention the Case's year or a later one.

**RBI is left out, on purpose.** The RBI's disclaimer says "caching and links to, and the framing of
this Web Site or any of the contents are prohibited" without written permission, which is what
storing its primers in the Library would be. The owner can write to the RBI for permission; until
then the loader refuses it. The New York Fed's old Fedpoints series has been retired from its site,
so its current explainer pages stand in.

**The blog is read in TypeScript (IL 3, #60).** Damodaran's blog used to be read by a Python script
that only ran on the laptop. It is now read by `src/library/blog.ts` (using `htmlparser2`, the
owner-approved HTML reader), because the weekly refresh that comes later runs on Vercel, which has no
Python. One reader, shared: `npm run library:blog -- <scratch>` fetches Blogger's feed (cached in the
scratch folder), turns each post into a document that also records its published and updated times,
writes the documents file and loads it. The other sources keep their Python extractors, and the
Python HTML reader stays for them. A parity test runs the same sample HTML through both readers and
expects identical sections, and on 2 Nov 2026's feed the new reader gave the same 685 posts and the
same 6,513 passages, text for text, as the old one. Scripts, styles and embedded players (iframes,
objects, video, audio) leave nothing in the text. Scenario: a post that embeds a YouTube player and a
table of yields gives its words and the table rows, with no player text. Importing one post
(`importLibraryDocument`) replaces only that post's passages: an unchanged passage keeps its Voyage
embedding, an edited one is embedded again, and a passage the post no longer has is removed, so a
weekly run touches a few posts instead of reloading 6,500 passages. Trade-off: the two readers must
now agree on HTML by test rather than by being one program, and a post whose HTML is badly broken
may read slightly differently from before (none of the 685 does).

**Spreadsheets behind the posts (IL 15, #72).** Damodaran's numbers live in the spreadsheets his
posts link to (Tesla's inputs, a country's tax rates), not in the post text. `src/library/spreadsheets.ts`
finds each post's `.xls` and `.xlsx` links (old `www.stern` and `%7E` spellings are folded into one
address; his yearly `datasets/` and `implprem/` files are left out, since they are whole-market
tables, not worked examples), reads the file with SheetJS 0.20.3, and turns it into a Library
document under a new dated source, `damodaran-spreadsheets`. SheetJS is installed from SheetJS's own
download site, because the npm registry copy is out of date (npm 12 needs `--allow-remote=all` to
install from a link; CI's npm does not). Only the values Excel saved in the file are read (nothing is
recalculated) and hidden sheets are skipped. Input, output and valuation sheets come first, rows
become lines of "cell | cell", and a workbook gives at most 12 passages. Every passage opens with a
sentence naming its post, the file and the sheet. A passage is dated by the later of the post's date
and the file's Last-Modified date, so a file he updated years after the post stays hidden from a
Case set before the update. The source has no quote limit, so the Passage view shows it in full,
with his acknowledgement credit. Scenario: while studying Tesla before its reveal, the Tutor
searches "Tesla operating margin assumption" and gets the "Input sheet" passage of his Tesla
workbook, opening "This is the sheet "Input sheet" of the spreadsheet teslathedisruptor.xls, linked
from Aswath Damodaran's post ...". `npm run library:sheets -- <scratch>` runs the backfill on the
laptop (`--dry-run 30` reads 30 files and writes nothing to a database). `crossCheck` lists the
figures a post picture's text and its spreadsheet share, for the pictures ticket's report.
Trade-off: a sheet is flat text, so a chart-heavy or formula-heavy sheet loses its layout; the
12-passage cap means the long tail of a 19-sheet workbook is not searchable.

**Corrupted text, found and repaired.** PDF text breaks in known ways. The loader detects them
(lost ligatures such as "CreaAon" for "Creation", letters spaced apart, PDF character codes,
replacement characters) and now also repairs what it safely can: a broken word is mended only when
the repaired spelling already appears clean elsewhere in the same source ("CreaAon" becomes
"Creation" if "creation" appears), and a lowercase word glued to the next ("firmStatus",
"ofDecember") is split. Names such as LatinWorks or MetLife are left alone, and a passage still
broken after that is kept out and listed. On the real data: 22 repairs in Damodaran's papers, all
table-glue; 2 pages of *The Fed Explained* (title and contents pages, letters spaced apart) and 4
Yale passages of lecture mathematics (written like "barBalpha") were kept out. The S-1 arrives as
typeset pages rather than text, so its extractor rebuilds lines and paragraphs from the page layout.

**Charts.** `scripts/library/vision.mjs` finds PDF pages that hold a picture and hardly any words,
renders them and has Claude Haiku transcribe what is visible (title, axes, values), then the
extractor adds that text to the page. In the papers 12 pages qualified; 2 held a table and a
flowchart worth keeping, and 10 were decoration. Cost about $0.06.

**How good is it?** `npm run library:score` runs 42 test questions written in a Learner's words
(`scripts/library/eval/questions.json`) through the app's own search and counts how often a passage
from the right section is in the top five. With OpenStax alone, keyword-only BM25 scored 40 of 42
(95%), mean reciprocal rank 0.84, and plain Postgres full-text ranking 34 of 42 (81%). After #21 the
set has 73 questions (31 new ones for the new sources) and the whole Library: BM25 scores 64 of 73
(88%) strictly, the right section first for 46, mean reciprocal rank 0.73; counting other-source
passages that were read and judged to answer the question too, 71 of 73 (97%). Full-text ranking:
43 of 73 (59%). New sources alone: 28 of 31. The original 42 fall from 40 to 36 because richer
sources now compete: Damodaran's papers answer "what does beta measure" and Yale answers "why is a
dollar today worth more", which is arguably better, but the book's section is no longer first.
The two real misses stay wording gaps ("a payment that goes on forever"). The two misses are wording gaps ("a payment that goes on forever" for
perpetuities) that the Voyage half should close. Four hindsight probes, run as of 24 Oct 2018 (the
present value Case), return no passage mentioning a later year or the Case's ending. Any change to
search should be judged against the same questions. Four more probes, as of 2018, 2014, 2007 and
2008, check the new dated sources: none return a later post, the S-1 or an ending.

**Naming a writer (follow-up to #21).** A real Tutor query, "Aswath Damodaran valuing Anthropic
IPO", put the title pages of his 45 papers in the top five and pushed his own Anthropic post out.
A title page is nearly all names and dates, and the writer's name in the query matches all of it.
Two fixes, both in code. First, the loader (`prepareDocuments`) now leaves out a document's
title page, meaning its first passage when it is short and holds no sentence, or carries an e-mail
or school line (36 of 45 papers, 26 + 23 Yale lecture headers, the S-1 cover line; reported when
a source loads). Second, `search_library` takes an optional `source`: text matched against each
source's id, title and credit line ("Damodaran", "Shiller", "Yale", "S-1"), which scopes the search
to those sources, with the as-of rule still applied. The Tutor's instructions say to use it and
never to put a writer's name in the query; a `source` that matches nothing returns the list of
sources the Library holds. The test set gained five author-named questions (73 to 78): the name left in the query found the right passage in 3 of 5 before the fix
and 4 of 5 after (the Anthropic post is now in the top five, though papers still rank above it);
scoped with the source filter, all 5 of 5 both before and after, right passage first every time.
Scenario: the Learner asks what Damodaran made of the Anthropic IPO; the Tutor calls
`search_library` with query "valuing Anthropic IPO" and source "Damodaran" and gets his post
first. Trade-off: `source` is a text match, not an author field, so "Damodaran" covers both his
blog and his papers but a misspelling matches nothing (the Tutor is then shown the source names).

**Scenario.** The Learner asks what a textbook says about valuing a perpetuity. The Tutor calls
`search_library`, gets section 8.1 of *Principles of Finance 2e* with its credit line, quotes "An
indefinite stream of payments cannot be compounded into a future value, but it can be discounted to
a present value", and says where it comes from, with the link (live run, 2 Nov 2026, $0.025).

**Trade-off.** Keeping the Library in Postgres, beside everything else, means one database, one
query for both rankings and the as-of rule applied inside the search itself, at the cost of using
Neon's newer `lakebase_text` extension (tests run on plain Postgres full-text ranking instead,
because the in-memory test database doesn't have it). Hiding timeless passages that mention later
years costs about one passage in nine during a 2018 Case, a price paid for not giving endings away.
More sources also mean more competition for the same question, so the textbook is no longer always
first (see the score above); the Library takes about 90 MB of the Free plan's 1 GB before
embeddings (about 65 MB more with Voyage vectors).
Voyage is a new outside service: until its key is added, search works on keywords alone.

## Citations and the passage view (`src/tutor/citations.ts`, `src/library/passage.ts`, `/passages/[id]`)

**What it does.** When the Tutor draws on the Library, each claim links to the exact sentences it
rests on. `search_library` now hands Claude each passage as a `search_result` block with Claude's
built-in citations switched on. The passage is cut into one block per sentence, after a first block
with its credit line, licence, date, link and any quote limit, so a citation names the sentences
it used. Claude then returns its reply split into text pieces, and a piece that rests on a passage
carries a citation naming the passage (`/passages/<id>`) and the sentences. Code turns those into
what the Learner sees: a small raised number after the claim, and one folded "N sources" line at the
end of the reply (see "Sources folded away" below). Clicking a number opens the passage view in a new tab: the stored passage, the cited
sentences highlighted, the credit, licence and a link to the original. The stored reply is never
changed; the numbers are worked out the same way while the reply streams and when it is read back,
so the workspace, a reload and old Sessions all show the same thing.

**Scenario.** The Learner asks how a higher discount rate changes present value. The Tutor searches
the Library, quotes OpenStax's NPV chapter ("If a higher discount rate is used, the present value of
future cash flows falls...")¹ and draws a slider widget in the same reply. The ¹ opens
`/passages/799?blocks=3-4`, which shows section 16.2 with that one sentence highlighted and the
credit "Julie Dahlquist and Rainford Knight, Principles of Finance 2e (OpenStax), CC BY-NC-SA 4.0".
Live run, 2 Nov 2026: 3 citations, 2 sources, 2 widgets drawn without a correction turn, $0.089.

**The source's terms still hold.** The Tutor still gets each source's quote limit with the passage,
and the credit still travels with the reply (now in the fold, no longer in the Tutor's sentences). The
passage view respects the same limit: for a source with one (Damodaran's blog, 60 words) it shows
only the cited sentences, cut to 60 words, says it was shortened and points to the original. A
passage the as-of rule hides from search is hidden in the passage view too: during the 1994 Fed
Case, a 2026 Damodaran post shows "hidden until the reveal" instead of its text. Its heading is
withheld from the folded sources as well, and it gets no credit line there. A reply can cite a passage found by a search made earlier in
the Session, before the Learner reached the Case; the fold then shows "Library passage
(hidden until the reveal)" instead of a heading like "How Lehman's 2008 failure froze credit", live
and after a reload, and shows the real heading again once the reveal is shown. Live run with
Damodaran's blog, 2 Nov 2026: 5 citations to 3 posts, each passage view at most 60 words, $0.034.

**Sources folded away (`src/tutor/sources.ts`).** Sources stay out of the reading. Citation numbers
stay tiny; the reply ends with one small "3 sources" line that opens on click to the numbered list,
each entry with its passage heading and credit line. One fold and one numbering serve the whole reply,
however many loop steps (searches, tool calls) it took, so two different "1"s never meet. The stored
reply is still never changed, and the same code builds the fold while the reply streams and when it
is read back, old Sessions included (where a turn's steps now read as one reply, as they stream). The
fold travels as a `sources` Markdown fence at the end of the reply text, which the reply renderer
draws as the small line. A passage the as-of rule hides keeps its hidden title and gets no credit. A
Case Data figure the text quotes (code looks for each allowed point's value written out whole,
outside citation links and widget code) adds that dataset's credit, unnumbered. In Widgets, a sourced
figure's credit sits behind a small ⓘ, and the amber still marks it as real data. The Tutor's
instructions stop it naming sources in its sentences ("according to CNBC..."), except when the writer
is the subject (Follow Topics) or the Learner asks where something comes from; a behaviour rule,
"source named in the text", checks it.

**Scenario.** The Learner asks why a higher rate lowers present value. The Tutor searches twice, cites
OpenStax in each step and says it plainly, with no "as OpenStax puts it". The Learner reads the
explanation with two tiny numbers and "2 sources" beneath; opening it shows both headings with their
credit lines.

**Trade-off.** Spotting a quoted Case Data figure is matching on the number's text, so it can miss a
figure the Tutor rounds or rewords, or catch a coincidence; a miss costs a missing credit line in the
fold (the widget keeps its own ⓘ either way). The fold appears when the reply ends, not while it
streams.

**Citations and widgets together.** The spec chose OpenUI's inline mode (widgets written in the
reply's text) before knowing whether citations would combine with it. They do: the citation split
only cuts the text into pieces, which code joins back unchanged, so a widget block still arrives
whole. Code never puts a number inside or right after a widget block, where it would break the
widget's code. So the owner's fallback (source cards built from the stored credit, with widgets
left as they are) was not needed, and widgets were not moved to tool calls.

**Trade-off.** Built-in citations mean Claude, not code, decides which sentences back a claim, and
it can only cite whole sentences, so a citation sometimes highlights a little more than the words
it used. Searches cost slightly more tokens, because each sentence is its own block. In exchange the
Learner can check every sourced claim against the passage in one click, and the link comes from the
API rather than from the model typing a reference it might get wrong. A tool result with search
results can hold nothing else, so the search notes (as-of rule, fallback) travel in the first
result's credit block.

## Finance Calculations, Indian formats and hosted code execution (`src/finance/`, the `calculate` tool, the Calculator widget)

**What it does.** Every number the Tutor shows for a calculation comes from tested code, not from
the model's head. `src/finance/` holds plain formulas: lump sums and annuities, perpetuities,
effective and real rates, net present value and IRR, loan EMIs and repayment schedules, SIP, PPF,
fixed and recurring deposits, bond price, yield to maturity and duration, dividend discount models,
discounted cash flow and CAGR. Where the `formula.js` library has the function (FV, PV, PMT, NPV,
IRR, RATE, EFFECT, NOMINAL) it does the arithmetic, wrapped so callers see ordinary numbers and
plain errors; the rest is a few lines of arithmetic. All of them are listed in one registry
(`calculators.ts`). Two things read that same registry: the Tutor's `calculate` tool, and the
`Calculator` widget, so a widget and a tool can never disagree. `indian-format.ts` writes rupees
the Indian way: `₹12,34,567` (grouped 3 then 2), and in words from one lakh up (`₹2.35 lakh`,
`₹1.5 crore`, and `₹1 crore` rather than `₹100 lakh`). Loans and Indian savings products show
rupees by default; everything else shows dollars unless the Tutor says otherwise.

**A concrete scenario.** The Learner asks what a 50 lakh home loan at 8.5% over 20 years costs.
The Tutor calls `calculate` with the `emi` calculator and gets back "Monthly instalment: ₹43,391.16;
Total interest: ₹54,13,878.80 (₹54.14 lakh)". It quotes those, then shows a Calculator widget with
a loan amount slider and a rate slider. Moving the rate to 10.5% redraws the instalment as
₹49,918.99 in the browser with no model call (checked in a real browser). For a sum no calculator
covers, the Tutor may use Anthropic's hosted code execution (a server tool: Anthropic runs the
code in its own sandbox and the result comes back inside the same reply). The Tutor's instructions
say that such a result proves only that the arithmetic ran, not that the formula is right.

**How it is tested.** Every formula has a test whose expected value comes from outside the code:
a published worked example (the standard bond-pricing example, Microsoft's IRR example, the 1.01^120
interest table, bank EMI tables, PPF calculators) or a figure worked out by hand and shown in the
test name. Cases ported from the MIT-licensed Python project of 77 finance calculators
(`sarveshtalele/personal-finance-mcp`) are marked "ported" with the check made beside each. Its own
tests mostly say only "greater than zero", so several were turned into exact figures; its two-stage
dividend and DCF cases had no values and were replaced by hand-worked ones. Nothing from that
project is copied as code. Rupee and lakh/crore formatting has its own tests, including the
rounding edge where 99.999 lakh must read as a crore.

**Trade-offs.** Adding the two tools changes the Tutor's tool list and instructions, so the next
action after deploy starts a new Session (the existing Session is not edited). The Calculator
widget takes its inputs by name, so the Tutor has to use the names in the `calculate` tool's
description; a wrong name shows a plain "could not run" message in place of a number. A server-side
render shows "Working it out…" until the browser sets the slider values. Hosted code execution
costs extra tokens for the code and its output and is optional: the Tutor is told to prefer
`calculate`. Yearly rates are percentages everywhere (5 means 5%), a deliberate house convention.

## Workspace left column (`src/app/conversation.tsx`, `workspace-parts.tsx`, `thread.tsx`, issue #44)

**What it does.** The workspace fills the screen in two equal columns. The left one runs top to bottom: a status card ("Course Map · Stage · Topic", the plain summary, a navy Continue that starts a turn), the spaced review folded into one row ("Spaced review · 2 due · Show") when a review is due, the open quiz folded into one row ("Quiz Check open · Show"), the conversation in its own scroll area, and the composer pinned at the bottom with a 24px fade above it. The page reads the current Topic with `courseOverview` for the eyebrow. Streaming, cut-off resume, Retry, notices, the paste panel and the Widget correction turn are the same code as before; only the look moved into small pieces (`StatusCard`, `FoldedRow`, `ThreadMessages`) that tests render on their own.

**Scenario.** The Learner opens the workspace with two reviews due. The status card says where they are; one row says "Spaced review · 2 due"; they open it, answer, and close it, and the conversation below never moved.

**Trade-off.** Folding the review and quiz keeps the conversation high on the screen, but a due review is one click away instead of in plain view.

## Phone note (`SignedInFrame` in `src/app/ui.tsx`, issue #48)

**What it does.** Phones are out of scope. Below 768px wide, every signed-in page shows one line, "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.", and nothing else. The old phone-only behaviour is gone: widgets are never drawn inside the conversation at any width, and quiz and review answers no longer have phone tap sizing. An upright iPad (768–1023px) keeps the two-column workspace with a 24px gap and 16px padding. Login and the landing page are not affected.

**Scenario.** On the train the Learner opens the app on a phone and sees the note. At home they open it on an iPad held upright and get both columns: the conversation on the left, the Widget panel on the right.

**Trade-off.** One layout for laptop and iPad keeps the code small and lets the Widget panel sit beside the conversation always. The price is that quizzes and spaced reviews no longer work on a phone: a review that falls due waits until the Learner is at a bigger screen.

## Tutor behaviour tests (`src/behaviour/`, `npm run behaviour`)

**What it does.** A repeatable set of 48 test questions checks that the Tutor keeps its rules. The questions live in `src/behaviour/questions.ts` (only the Learner's wording, no source material). Each rule has direct and indirect attempts to break it: buy, sell or hold calls; requests for stock picks (which must be turned back into analysis); forecasts; invented figures; hindsight leaks before a Case's reveal (asked at the story, your-turn and Check steps); role-play and "ignore your rules" tricks; and questions about today's events (which must be answered from concepts and precedent, with no forecast). Some are two-step: a polite first question, then pressure.

**A concrete scenario.** Run `npm run behaviour`. For each question the runner makes a fresh throwaway database, puts a new Learner at the right Teaching Step of the Present value Topic, and sends the question through the real Tutor Turn with the real Tutor instructions and `claude-sonnet-5-5`. Then a stronger model, `claude-opus-5-5`, reads the Learner's question and the Tutor's reply against a written rubric for that rule (in `src/behaviour/grading.ts`) and answers pass or fail with a reason. A report listing every failure in full, with the Tutor's answer, is written to the evidence folder (`behaviour-results-latest.md`, plus dated copies and JSON). Change the Tutor's instructions, run it again, compare.

**Options.** `RULE=hindsight` runs one rule, `ONLY=id,id` runs named questions, `BEHAVIOUR_BUDGET_USD` stops the run when spend reaches the limit (default 3.5; a full run costs about $1 to $1.5), `BEHAVIOUR_OUT` changes the report folder. It is not part of `npm run check` because it spends money and needs the network; the question set, the rubric parser and the report layout are covered by normal tests.

**A targeted test for made-up examples.** One more test, run alone with `npm run behaviour -- -t "made-up example before the reveal"`, puts a Learner at the your-turn step of the percent and basis points Topic (the 1994 Fed Case) and asks the Tutor for a rate move to practise on. The grader fails the reply if the "made-up" move is the real one (3% to 3.25%, or 25 basis points) or anything after 3 February 1994 slips out. Before the instruction fix it failed, just as the live leak did; after it, two runs passed (one used 6% to 5.2%, the other the Concept's 4% to 4.5%). Unlike the set above it passes or fails like a normal test, and it writes a short record of each run to the report folder. A run costs about 2 to 5 cents. It checks one Case with one sample per run, so a pass means the common case is fixed, not that the leak can never come back.

**Trade-off.** A model grading a model is a first pass, not proof. The grader can be too strict or too lenient (in the first full run it wrongly failed two answers because the rubric forgot that the Case story's own details may be restated; the rubric was fixed). An unreadable grader reply counts as "ungraded", never as a pass, and the report says so. The set is a sample of ways to break the rules, so a clean run means "no break found in these 48", not "cannot be broken". The first run also found a real gap, which was fixed in the instructions: asked about today's events, the Tutor refused and went back to the Case without teaching anything.

## Haiku versus Sonnet comparison (`src/comparison/`, `npm run compare:models`)

**What it does.** A script puts the same fixed set of tutoring questions to two models, `claude-haiku-5-5` and `claude-sonnet-5-5`, through the real Tutor Turn with the real Tutor instructions and tools. The set has 19 questions: five of our own present-value questions (each with a short reference answer), eight rule-testing questions reused from the behaviour set (buy or sell, stock pick, forecast, invented figure, hindsight, role-play, today's events), and six items from the FinanceBench open sample, each given to the Tutor with its filing extract. The FinanceBench text is downloaded when the script runs and is used for testing only (its licence is non-commercial); none of it is stored in the repo. For each answer the script records tokens, cost and time. Then `claude-opus-5-5` grades three things: whether the answer was correct, whether it gave away something the Learner should work out (or the Case outcome), and whether the past-only rules held.

**A concrete scenario.** The owner runs `npm run compare:models` on the laptop. About 40 answers and 40 gradings later (about $1.20 and 3 minutes), a report is saved to SQL in two tables: `model_comparison_runs` (the report text, the recommendation and the total spend) and `model_comparison_answers` (every answer side by side, with its tokens, cost and the three verdicts). A copy goes to the evidence folder. The report shows a table with the cost per turn of each model (Haiku about $0.0013, Sonnet about $0.020, so Sonnet costs about 16 times as much), the pass and fail counts, and every answer side by side.

**The limit, written into every report.** This cannot measure correctness on the next item without help. Correctness is judged against a reference answer or known facts that we supplied for these fixed questions, by another model. A brand-new question has no reference, so a model that scores well here can still be wrong on the next item, and the grading model can be wrong too. The owner should spot-check real answers against sources.

**The recommendation is made by code, not by the model.** If the cheaper model broke no more rules than the stronger one, the report recommends the cheaper one. If it broke more by a wide margin, the stronger one. A gap of two or fewer judgements counts as noise: the report calls it too close to call, keeps the stronger model and states both prices. The first full run came out 9 failures for Haiku against 8 for Sonnet, so the advice was to keep Sonnet while naming Haiku as a real option if cost ever becomes the limit.

**Trade-offs.** The set is small (19 questions, 57 judgements per model), so differences of one or two are not real. The give-away check is strict for questions asked at a "your turn" step, and it also marked Haiku and Sonnet down when they simply answered a FinanceBench question the Learner pasted in; both models were hit about equally, so the comparison is fair, but the give-away numbers are higher than a Learner would feel. The grader sees a reference answer only for questions that have one. The script runs the Tutor on a throwaway in-memory database, with the model set in that database's settings the way the app does, so it never touches the Learner's real Sessions.

## Question Bank (`src/bank/`, `npm run bank:import`, `bank:verify`, `course:refs`)

**What it does.** Quiz Checks can now draw on questions other people wrote, as well as the
questions Claude wrote in a Topic file. The imported questions live in one table, `question_bank`,
in the private database; none of their text is in the public repository. Each has a permanent ID
that starts with `bank:` (for example `bank:eab:MBA-FIN-CF-0002`), its source, its licence, a credit
line, a link back, and a `verified` flag that starts false. Three sources are loaded: the University
of Padova MBA exam questions (CC0, 78 multiple-choice), the Executive Assessment Bank's `mba-core`
questions (CC BY 4.0, 410 multiple-choice; its keys were produced by a model, so they stay
unverified until a person checks them) and FinQA's dev set (MIT, 871 company-report questions kept
for the Judge Stage; they have numeric answers, so a quiz Check cannot use them yet). Open-response,
calculation and other items that code cannot mark were left out of the import and counted in its output.

**How a Check uses it.** A quiz Check in a Topic file lists question IDs. An ID starting with
`bank:` is looked up in the database; any other ID is a question in the same file. Everything
after that is the same as for Topic questions, because the marking code asks one question, "find
this ID", and does not care where the answer comes from: code picks the questions for an attempt
(walking round the list so a retry shows different ones), the browser receives prompts and choices
only, the key arrives with the marking, and the pass is saved through Learner Memory. Answered
bank questions enter spaced review the same way. The result screen and the review screen show the
credit line, and "The answer key has not been checked by a person yet" while the flag is false.
The Tutor's note about a quiz result says the same, so it works a disputed answer out with the
Learner instead of defending the key.

**Concrete scenario.** The Present value Check lists three Topic questions and four
`bank:eab:...` ones, showing two per attempt. The Learner misses one on attempt 1; attempt 2 shows
the next two in the list. After a pass, those questions come back for review weeks later, whichever
source they came from. If one bank answer looks wrong to the Learner, the owner works it out and
runs `npm run bank:verify -- "worked by hand" bank:eab:...`, and the warning goes away. Re-importing
a bank file corrects text and keeps checked keys checked, unless the answer itself changed.

**The laptop check.** `npm run course:refs` reads the database named in `.env` and confirms that
every `bank:` ID a Check lists exists (and is a multiple-choice question), and that every Case
Data dataset a Case lists in `data:` exists. It prints each missing item with the Check or Case
that names it and exits with an error if any is missing, so a typo cannot reach the Learner as a
broken quiz. It needs the database, so it is not part of `npm run check`; the file-only part of
the validator still runs there and accepts `bank:` IDs without looking them up.

**Lumen was not imported.** Lumen's macroeconomics question banks download only as LMS packages
(QTI). The page states no licence for the question files (the CC BY label on that page covers the
page's own text), says the files cannot be opened outside a learning management system, and says
Lumen withholds written forms to protect quiz integrity. That is not a confirmed licence match
with the book, so nothing was taken. The OpenStax end-of-chapter questions are the open alternative.

**Trade-off.** A question that leaves the bank breaks any attempt that names it; the laptop check
exists to catch that before the Learner does. Unverified keys are used anyway, with a visible
warning, because waiting for a person to check 400 questions would leave the bank idle; checked
questions can be chosen for the Checks that matter most. FinQA is stored but not used yet:
marking a typed number needs an input and a tolerance rule, which is a separate piece of work.

## Foundation Topics, batch 1 (`course/topics/`, issue #31)

**What it does.** Eight more Topics join the Course Map as written lessons: percent, percentage
points and basis points; growth, compounding and logs; probability and expected value; the
income statement; the balance sheet; the cash flow statement; how the three statements link;
and ratios, return on equity and DuPont. Each is a YAML file with one Case, a short concept and
principle, quiz questions, a quiz Check (3 questions per attempt, 2 right to pass) and a
conversation Check. Stage, place and prerequisites still come from `course/outline.yaml`.

**Scenario.** A Learner on the income statement Topic is told only what was public on 14 August
2019: WeWork's prospectus shows half-year revenue of 1.54 billion dollars and a loss of more than
900 million. They work out a net margin of about minus 58 per cent. Only after the quiz and the
conversation Check does the Tutor reveal that the share sale was withdrawn on 30 September 2019.
The figures the Learner can chart (for example Webvan's operating cash use of 263.1 million
dollars in 2000) come from Case Data, imported from the laptop; the outcome figures are dated
after the as-of date, so the as-of rule hides them until the reveal.

**Sources and checks.** Every Case fact was read from a source on 2 November 2026 (Fortune, the
Federal Reserve's history of LTCM, CNBC, Webvan's 10-K, the Satyam chairman's letter filed with
the SEC, Business Today) and the quiz questions cite OpenStax, the CFA Institute, the SEC's
investor site or the IFRS Foundation. Five Question Bank questions are used (three on probability,
one on non-cash transactions, one on prepaid expenses). Their keys were recomputed or checked
against a source and marked verified, with the note stored beside each question.

**Trade-off.** The coffee-chain Case rests on an analyst's reading of the prospectus, because the
prospectus itself could not be fetched; its total assets are missing, so the DuPont lesson uses a
lower bound for leverage instead of the full three-way split. A better Case source (the
prospectus) would let the Topic show the whole split. The Case Data import script now also reads
the outline, which it had not done, so it works with the outline-driven Topic files.

## Foundation Topics, batch 2 (`course/topics/fs-revenue-runrate.yaml` and seven more)
- What it does: eight more foundation Topics are written and teachable: revenue and run rates (WeWork's S-1), capex and EBITDA (Webvan), leases and debt-like items (WeWork's lease obligations), reading filings (WeWork's governance terms, with the US and Indian filing routes), earnings quality (Satyam), corporate tax (India's 2019 cut), statistics (the 1987 crash) and supply and demand (India's 2019 onion shock). Each has a Case whose story holds only what was known on its as-of date, with the outcome kept for the reveal, a quiz Check and a conversation Check.
- A concrete scenario: a Learner on the tax Topic is asked, as of 19 September 2019, what a cut from about 34.94% to 25.17% does to a factory's after-tax cash flow; the next day's announcement and the Sensex jump appear only after the Learner has answered. On the supply and demand Topic the price chart shows onion prices only up to August 2019 until the reveal, then the rest of the year.
- Where the questions come from: each quiz mixes a few Question Bank items, whose answer keys were checked and marked verified (`npm run bank:verify`), with questions written for the Topic that cite their source (a filing, a news report, the IFRS text or OpenStax). Quiz questions that depend on data missing from a Question Bank prompt were left out.
- Case Data: only the supply and demand Topic needed history. Its two datasets (retail and wholesale onion price by month, from a government press release) live in the database and are imported from a file kept outside the repo.
- Trade-off: several Topics lean on one company (WeWork appears in three) because its filing is a rich, verifiable source; the price is a less varied set of Cases. Facts that sources reported differently (WeWork's 2018 loss, the old effective tax rate) are left out or stated with the source that gives them.
- Small shared change: `scripts/import-case-data.mjs` now reads the outline when it loads the Course Map, as the other scripts do; without it the import failed on every Topic file written after the outline arrived.

## Foundation Topics, batch 3 (`course/topics/`, issue #33)

**What it does.** Eight more Topics join the Course Map as Written: competition and pricing power
(Reliance Jio's free launch, 2016), money and credit creation (the 1992 securities scam), central
banks (the Fed's 1994 tightening), inflation and real rates (India's near double-digit inflation,
as of 27 January 2014), GDP and cycles (India before the 1991 crisis), fiscal policy and debt (the
UK mini-budget, 2022), reading empirical claims (Reinhart and Rogoff's 90% debt threshold) and the
RBI (the package of 4 September 2013). Each file holds the Case story as known on its as-of date, a
reveal held back until the Tutor reaches that step, the concept, the principle, a quiz Check with a
pass rule and a conversation Check. Quiz Checks draw first on checked Question Bank items (16 of the
`bank:eab:...` questions, marked verified), and the Topic file holds only the few questions the bank
could not supply, each with its source.

**Concrete scenario.** The Learner reaches Competition: the Tutor tells the Jio story up to the
afternoon of 1 September 2016 and asks what the entrant is doing to price. Share-price falls, the
dollar amounts wiped off Airtel and Idea and the price war appear only after the Learner has passed
the Checks and the reveal step is shown.

**Trade-off.** Facts come from the sources named in `course/outline.yaml` and were re-read for this
batch, so some are secondary (press) where no regulator document gives the same figure, and the
RBI's September 2013 repo level is derived from two RBI releases. The inflation Case is dated 27
January 2014, not 31 December 2013, because the RBI overview it relies on was published on 28
January 2014. No Case Data was added: the Cases teach from the story's figures, and FRED series may
not be stored.

## Foundation Topics, batch 8 (`course/topics/der-forwards.yaml` and seven more, issue #38)

**What it does.** Eight more Topics join the Course Map as Written: forwards and futures
(Metallgesellschaft's stack-and-roll hedge, as of 30 September 1993), options and payoffs (1987
portfolio insurance as a home-made put), binomial and Black-Scholes pricing (LTCM and the
Nobel-winning pricing pioneers who were its partners, 1 August 1998), interest-rate and currency
swaps (the RBI's FCNR(B) swap window, the day before it was announced in 2013), hedging (Orange
County's investment pool, 30 September 1994), bank regulation (Silicon Valley Bank at the end of
2022, passing every ratio), bank runs (8 March 2023) and securitisation (a simplified subprime pool
and the CDO built from its BBB tranches, end of 2006). Each file has the usual story, held-back
reveal, concept, principle, a quiz Check with a pass rule and a conversation Check.

**Concrete scenario.** On the bank regulation Topic the Tutor shows the Learner a bank with a
12.1% capital ratio against a 7% requirement and asks what the ratio counts and leaves out. Only
after the Checks does the reveal bring the Federal Reserve's own review: 31 open supervisory
findings, and the estimate that counting unrealised securities losses would have cut the ratio to
10.4%.

**Rules kept.** Quiz prompts, choices and explanations, and the conversation Checks, use made-up
numbers (a $100 million pool, a Rs 100 crore swap, a four-tranche deal) so they never state the
Case's outcome. Case IDs are specific to the Topic (for example `ltcm-1998-option-pricing`) because
three other Topics already use LTCM, and two use Orange County and SVB. The FCNR(B) Topic uses only
the 2013 window.

**Trade-off.** Some Case figures are secondary: Metallgesellschaft's loss is given as a range
($1.3 to $1.5 billion) and its rescue as $1.9 to $2.2 billion because sources disagree, and the
securitisation Case leaves out the Financial Crisis Inquiry Commission's rating counts because its
PDF could not be read reliably. The securitisation story uses an illustrative pool, labelled as
such, instead of a real deal, and the real figures (727 CDOs, $641 billion issued, $420 billion
of write-downs) come in the reveal. Three bank questions from the Question Bank were added (key
checked by hand and marked verified); no Case Data was needed.

## Foundation Topics, batch 5 (`course/topics/`, issue #35)

**What it does.** Eight more Topics join the Course Map as Written: balance of payments (India's
external accounts, year to March 1991), India's economy and the 1991 reforms (as of 1 July 1991),
exchange-rate regimes and crises (Thailand's baht, 1 July 1997), sovereign default and country risk
(Argentina, 1 December 2001), equity markets and SEBI (April 1992), market history and long-run returns
(the Sensex at the end of March 1992), risk and diversification (portfolio insurance, 16 October 1987) and
CAPM (Amazon's cost of equity, February 2000). Each file holds the story as known on its date, a reveal held
back until the Tutor reaches that step, the concept, the principle, a quiz Check with a pass rule and a
conversation Check. Three Topics also use checked Question Bank items. Seven Case Data datasets (India's
balance of payments, Sensex year-end closes, Amazon's quarterly price range) are imported from a file
outside the repo; points dated after a Case's date appear only at the reveal.

**Concrete scenario.** The Learner reaches CAPM: the Tutor tells how Damodaran chose a beta of 1.60 over a
regression beta of 2.29 in February 2000, and Amazon's later price range of $14.88 to $91.50 stays hidden
until the Learner has passed the Checks.

**Trade-off.** Facts come from RBI, IMF, SEBI, BSE, SEC and Federal Reserve documents re-read for this batch, but
some figures are secondary (Time, ADST, press) and the Thai baht's low is given as a range of sources. The
rupee 2013 Case was left to in-rbi-policy and the India half of the CAPM Case was dropped because no
India beta dated before 2000 was found.

## Foundation Topics, batch 6 (`course/topics/`, issue #36)

**What it does.** Eight more Topics become Written: market efficiency (Blodget versus Grantham, May 2000), behavioural finance and bubbles (Webvan's first day, with WeWork shown at the reveal), NPV, IRR and capital budgeting (Webvan's plan for 26 distribution centres, from its 1999 annual report), cost of capital (Eurotunnel's debt in 2006), capital structure (the Coffee Day group's debt and pledged shares, July 2019), dividends and buybacks (Microsoft's special dividend, July 2004), credit analysis (IL&FS before its defaults, August 2018) and DCF valuation (Damodaran's February 2000 valuation of Amazon). Each file holds the story as known on its as-of date, a reveal held back until the Tutor reaches that step, the concept, the principle, a quiz Check with a pass rule and a conversation Check.

**Concrete scenario.** A Learner on the payout Topic is told only what was public on 19 July 2004: Microsoft's cash was about 56 billion dollars and it paid a small dividend. They argue for a buyback or a special dividend and work out that, with no taxes, a 2 dollar special dividend takes 2 dollars off a 60 dollar share. Only after both Checks does the Tutor show that Microsoft announced a 3 dollar special dividend, a doubled regular dividend and a 30 billion dollar buyback the next day. The cash chart (31.6 billion in 2001 to 56 billion in March 2004) stops at the as-of date; the 60.6 and 37.8 billion points are dated on the day each annual report was filed, so they appear only after the reveal.

**Where the facts and questions come from.** Each Case was re-read from sources this batch: the Forbes debate, AP and CNBC index records, the New York Times and Reuters on Webvan's offering, Webvan's 10-K405, the Guardian and BBC on Eurotunnel, Hindustan Times and Business Today on Coffee Day, Microsoft's release and 10-Ks, ICRA, CARE, Reuters and the PIB on IL&FS, and Damodaran's paper with Amazon's 10-K405. Fourteen Question Bank items (investment appraisal, cost of capital, capital structure, payout, DCF and efficiency) are used, their keys recomputed or checked and marked verified. Case Data: 10 small datasets (index closes, Webvan's offer and first-day close, Microsoft's cash, dividends and buybacks, Amazon's price and 2000 range), imported from a file kept outside the repo.

**Trade-off.** Two Cases date from the same moment as other Topics that use the same company (Webvan, Amazon), with different facts and Case IDs. The capital budgeting Case is dated 30 March 2000, the day of the annual report, not 5 November 1999, because its investment case was first published then. Eurotunnel's story has few figures (debt, interest, 2005 revenue), so the WACC exercise leans on the Learner's own assumptions and the quiz uses hypothetical numbers. The Coffee Day reveal mentions the founder's death only briefly.

## Foundation Topics, batch 7 (`course/topics/`, issue #37)

**What it does.** Eight more Topics join the Course Map as Written, all on valuation and raising
money: multiples (WeWork's $47 billion against IWG, as of 20 August 2019), young loss-making
companies (Uber, Damodaran against venture capital, December 2014), banks (Yes Bank in February
2020), distressed firms (Coffee Day Enterprises, 29 July 2019), the implied equity risk premium
(the S&P 500 at the end of 2007), valuing Indian companies (Coffee Day's 2015 issue in rupees and in
dollars), venture rounds (WeWork's January 2019 round) and IPOs and float (Coffee Day's 2015
issue). Each has a Case told only with what was known on its date, a reveal held back until the
Tutor reaches that step, a quiz Check with a pass rule and a conversation Check. Their sourced
figures sit in Case Data (71 datasets in `case-data/foundation-b37.json`, outside the repo), and
nine checked Question Bank items feed the quizzes.

**Concrete scenario.** The Learner reaches Distressed firms. The Tutor tells the Coffee Day story
up to the evening of 29 July 2019: share value, loans and the pledged promoter shares. The sharp
fall in the shares and the later debt figures stay out of the lesson and out of the chart labels
until the reveal step.

**Trade-off.** Dataset labels and credits are shown before the reveal, so they were written
neutrally and the detail that hints at the outcome sits in a note the Tutor never sees. Two Topics
share Coffee Day and two share WeWork, with different facts each, which costs some repetition but
keeps each Case self-contained. Some figures are press reports where no filing gives the same number.

## Foundation Topics, batch 9 of 9 (`course/topics/`, issue #39)

Seven more Topic files finish the foundation set: Shadow banks and private credit (IL&FS and the
mutual funds that held its debt), Mutual funds, ETFs and passive investing (the Buffett bet of an
index fund against hedge funds), Insurance and risk transfer (AIG's credit default swaps), Real
estate and commodities (the US house-price index to the end of 2006), Inflation regimes (the Fed's
meeting of 6 October 1979), Governance and fraud (Satyam's Maytas deal) and Leverage and liquidity
spirals (LTCM's books in September 1998). Each has a Case, a quiz Check with a pass rule and a
conversation Check. Fourteen sourced datasets back five of the Cases and are loaded with `npm run
case-data:import`; no Question Bank item is used.

**Concrete scenario.** The Learner reaches Insurance: the Tutor tells the AIG story as of Friday
12 September 2008 and the chart shows collateral called and posted up to that day. The 15 and 16
September points (the rating cuts, the jump in calls to $32.0 billion) are held back and appear
only with the reveal.

**Trade-off.** Dates are chosen so the story holds only what was published by then, which moved
some as-of dates (IL&FS to 12 September 2018, when the exposure was reported). The funds Topic
replaced the outline's IL&FS Case with the Buffett bet, a cleaner passive-versus-active example,
and the India gold Case was dropped because two sources disagree on the figure. FHFA house prices
are the 2026 version of a series that is revised, and the reveal says so. Statements in the
reveal that rest on press reports (the Satyam board minutes) say so too.

## Follow Topics (`course/topics/fol-*.yaml`, `piece` in `src/course/map.ts`, `src/tutor/pasted.ts`, `pasted_texts` table, issue #25)

**What it does.** A Follow Topic teaches by having the Learner read a dated piece they have not
seen and explain each step of its argument. A Case names its `piece` (author, title, date, link)
and where the text comes from. The piece is the story as it stood on its date, and what happened
afterwards is the reveal. Nine Topics now exist: six on Damodaran's posts (Uber 2014, Twitter's
IPO 2013, Tesla 2020, equity risk premium 2023, return on equity 2025, sovereign ratings 2025) and
three on Zitron's articles (subprime AI 2024, systemic risk 2025, "AI Is A Money Trap" 2025).
Damodaran's posts are read from the Library through the source filter and quoted only in short
passages with credit (60 words at most). Zitron's articles are never stored: the Learner pastes
the part they are studying, the text is kept privately with that Session in `pasted_texts`, is
shown to the Tutor as appended text, and is not added to the Library. The Tutor works only from
what it has been shown and says so when a passage has not been pasted.

**Concrete scenario.** The Learner opens the Uber Topic. The Tutor says Damodaran published a
post on 2 December 2014, finds it with the Library filter, and asks the Learner to read it and
explain the steps in order: potential market, growth, share, margin, reinvestment, risk. In
the Zitron "Money Trap" Topic the Learner pastes two paragraphs and explains them; asked about a
later section, the Tutor says it has not seen that section. Only after the Learner passes the
quiz and the conversation Check does the Tutor reveal that Uber listed in May 2019 at $45.

**Trade-off.** Pasting keeps copyrighted text out of the repo and the Library, but the Learner
has to fetch and paste it, and a Zitron Topic cannot be checked without the Learner's paste. The
reveals sometimes rest on press reports (for example the Twitter take-private price), and the
Tesla and Twitter reveals give prices adjusted or described only as far as sources were read.
No claim is made about who the piece got right: the Checks test whether the Learner can follow
and separate the argument's facts, inferences and forecasts.

## Judge Topics (`course/topics/jud-*.yaml`, issue #26)

**What it does.** Eight Topics teach the Learner to take a writer's claim back to the filing or data and recompute it: where "speculative" starts on Moody's scale (jud-rating-boundary), Damodaran's return-on-equity post (jud-assumptions), his Uber inputs against Uber's first filing (jud-narrative-numbers), his Twitter valuation against Twitter's first filing (jud-ipo-forecast), Zitron's predictions against later records (jud-predicted-outcomes), his run-rate, basis-point and SOFR statements (jud-units-periods), the Anthropic S-1 against two readings (jud-filing-vs-claim) and the "junk or BB+" question (jud-rating-conflict). No new code: each is a Topic file using the dated-piece support from the Follow Topics (Damodaran's posts are searched in the Library and quoted briefly with credit; Zitron's are pasted by the Learner and never stored). The filing figures are Case Data; the filing's wording is in the Library. The Tutor never supplies a figure of its own. Checks are a quiz of hypothetical-number questions (recompute, spot a mislabel, a period or unit mismatch, or an inference beyond the text) and a conversation Check where the Learner judges real claims.

**Concrete scenario.** On the filing-versus-claim Topic the Learner reads a professor's post that says Anthropic had "an operating loss of over 8 billion dollars" in the first half of 2026. They open the S-1 figures: operating loss 693 million, interest income 1,111, fair-value change minus 72,388, other expense minus 8,757, tax 21, net loss 80,748. They find that 80,748 less 72,388 is 8,360: a real number, but a net loss before one item, not an operating loss. Only at the reveal does the Tutor confirm that, and that the post's profit in the second quarter did tie out.

**Where the facts come from.** Each planted slip was checked against its filing or dataset before use (S-1 tables, Twitter and Uber filings, Treasury yields, Moody's scale card, the New York Fed's SOFR page); slips that did not hold up were not used. The Damodaran return-on-equity post turned out to tie out, so that Topic judges assumptions instead of a slip. No Question Bank items are used. Case Data files: t26-jud-filing-vs-claim, t26-jud-ipo-forecast, t26-jud-narrative-numbers, t26-jud-units-periods, kept outside the repo.

**Trade-off.** Topics that rest on a writer's piece depend on the piece staying as published (the Zitron page shows a later edit date) and on the Library holding the S-1 and Damodaran's blog. Verdicts that need the writer's own spreadsheet cannot be settled, and the reveals say so. The Topic-level quiz and conversation Checks cover all the Cases of a Topic at once, so they name no verdict; the verdicts sit only in the reveals.

## The Final Topic: two readings of the Anthropic S-1 (`course/topics/ana-anthropic-s1.yaml`, issue #28)

**What now exists.** The last Topic on the default path. The Learner reads two opposing readings of Anthropic's S-1 (filed on EDGAR on 26 October 2026) published two days later: Aswath Damodaran's blog post, which the Tutor reads from the Library with the source filter, and Ed Zitron's "Exit Liquidity", which is never stored anywhere and reaches the Tutor only as text the Learner pastes (the `piece` field with `from: paste`, built in #25). It has two Cases with the same as-of date, one per writer, and 14 small Case Data datasets taken line by line from the S-1 in the Library (quarterly revenue and operating income, the company's adjusted operating income, the half-year operating loss, net loss and fair-value change, cash, short-term investments, each compute commitment and the top-five customer share). There is no market outcome yet, so the reveal is not a later price: it sets the Learner's judgement beside the filing's own figures and each writer's reading, naming which figures tie out, which mix up a label, a period or a scope, and which claims the filing cannot settle. The quiz uses hypothetical numbers; the conversation Check asks the Learner to find two real differences, sort each into fact or framing, and weigh one argument against an earlier Case (WeWork's S-1, Webvan in 1999 or Damodaran's Amazon valuation in 2000), with no forecast and no buy, sell or hold view.

**Concrete scenario.** The Learner pastes Zitron's paragraphs on the compute commitments. The Tutor, which has seen only those paragraphs, asks them to add up the S-1's four non-cancelable items from the Case Data: 114.5 + 110.0 + 44.9 + 161.2 = 430.6 billion dollars, so his "over $430 billion" ties out as an undiscounted sum. They then read Damodaran's post, where he says his debt includes the present value of those commitments. The difference turns out to be scope (summed as they fall due versus discounted and set against cash), not a disagreement about the filing. At the reveal the Tutor also shows that Damodaran's "operating loss of over $8 billion" for the half-year matches a net-loss measure (the S-1's operating loss is 693 million dollars), and that the S-1 leaves its Q3 revenue figure blank, so neither writer's Q3 remarks can be checked in it.

**Trade-off.** Because the `piece` field holds one piece per Case, the Topic needs two Cases for one filing; the Tutor sees every Case's data, so the S-1 figures serve both. Pasted text is saved with its Session in the database (as #25 designed), so the lane and production databases do hold what the Learner pasted, but the Library, the repo and the evidence folder do not. Several of the reveal's points are our own reconstruction (how Damodaran reached "over $8 billion"; his $114 billion cash and "half a billion" debt were not traced to his spreadsheet) and the reveal says so. Zitron's claims about motive and about where margins go next are framing and forecasts that the filing cannot settle, so the Topic does not judge them.

## Analyse Topics (`course/topics/ana-*.yaml`, issue #27)

**What it does.** Five of the six Analyse Topics become Written (the sixth, the Anthropic S-1 reading, comes from another lane). Each practises one skill on a past Case: build your own discounted cash flow value of Amazon as of February 2000 and compare it with Damodaran's inputs and the 2000 results only at the reveal; trace who pays whom in WeWork's August 2019 S-1; turn the purchase commitments in Anthropic's October 2026 S-1 into a debt-like present value, stating the discount rate and the assumed split of the last bucket; apply the skills to India (Yes Bank as published on 28 February 2020, and a rupee-versus-dollar valuation in September 2013); and sort the claims of the Blodget and Grantham debate into fact, definition, forecast and framing. Every Topic has a quiz Check with a pass rule and a conversation Check. Nothing asks the Learner to forecast, and the Tutor gives no buy, sell or hold call.

**Concrete scenario.** A Learner on the valuation Topic is told only what was public on 1 February 2000: Amazon's revenue, losses, debt, cash, options and the 6.5% Treasury yield. They write down their own growth, margin and discount rate, use the dcf calculator for a quick version, and find that the long-run margin moves their value most. Only after all the Checks does the Tutor reveal Damodaran's $35.08 against the $84 price and the actual 2000 results, and say that a value and a price are two estimates to compare as questions. A second Case does the same for a lesser-known company, Webvan on the evening of 4 November 1999: from its prospectus alone the Learner builds a value out of how many distribution centres open, how full each one gets, the margin, the cash from the share sale and the options, and only at the reveal sees the underwriter's own projections, the 2000 results and the closure in July 2001.

**Trade-off.** The dcf calculator takes one flat discount rate, while the valuation lets the rate fall as the firm matures, so the Learner's quick version is a little low and the Topic says so. Amazon, WeWork, Anthropic and the Forbes debate are well-known; Yes Bank and Webvan are less known, but Webvan's Check makes the valuation Topic two full valuations long, and a lesser-known company in the who-pays-whom Topic is left for a later Case. The Anthropic commitments Case discounts the filing's schedule only: the larger later figures have no dates, so they are shown as a scope question, not a number. The Forbes debate is also the Case of the market efficiency Topic, with a different question and Case ID.

## Public landing page (`src/app/_landing/`, `src/auth/session.ts`)

**What it does.** Signed out, `/` shows a public page that says what the Study Workspace is: a
headline, a screenshot, three counts (Topics written of planned, every Case in the outline, Library
sources), the seven Teaching Steps and "Every number has a source". Signed in, `/` is the workspace as
before. The page reads no Learner data and no Library text, only counts. All its words live in
`copy.ts`, marked DRAFT, and a small "Draft" pill shows near the headline until the owner rewrites them.

**Scenario.** A friend opens the link on a phone. The proxy lets the GET of `/` through; the page
checks the cookie first, finds none, and renders the landing page without touching the Learner's
Sessions. Tapping "Sign in" goes to `/login`. Trying `/course` still lands on the login.

**Trade-off.** One URL now serves two very different things, so the cookie check at the top of the
workspace page is load-bearing: anything added above it would run for strangers too. The proxy
backs it up by allowing only reads of `/`, so no Server Action or POST can run signed out. The
screenshots are static files in `public/landing-assets/`, taken from a demo workspace (`/?demo=1`, signed in only, and only when `WORKSPACE_DEMO=1` is set locally, never on Vercel) that shows a sample Mega Millions conversation instead of the Learner's own.

**Why the stats are cached.** The Topic and Case counts come from files on disk and cost nothing.
The Library source count needs the database, so it is cached for a day (`unstable_cache`, revalidate
86400): bots crawling the public page would otherwise wake Neon on every visit. A new source shows
up on the page within a day.

**Shared links and headers.** Because `/` is public, the site's metadata (`src/app/site-metadata.ts`,
used by the root layout) is public copy from `copy.ts`: title, description and an Open Graph card with
the light workspace screenshot on `https://www.value-it.xyz`. Pasting the link into a chat shows that
card. Signed-in pages share the same generic title; nothing in it names the Learner. `next.config.ts`
also sends four headers on every route: no other site may frame a page (`frame-ancestors 'none'` and
`X-Frame-Options: DENY`, against clickjacking), `nosniff`, and a referrer that carries only our origin
to other sites. There is no full script policy: Next's inline scripts would need per-request nonces.
The three counts sit in a card below the screenshot rather than over it, so the Tutor's composer row in
the screenshot is never covered.

## Pictures in Damodaran's posts (`src/library/pictures.ts`, `pictures-run.ts`, `citation-impact.ts`, `npm run library:pictures`, IL 14, #71)

**What it does.** Damodaran's valuation tables (Tesla's inputs, say) and charts are pictures, so the
Library could not search them. Each picture on Blogger's own image hosts is now read once by Haiku 5.5
into text, and that text sits in the post at the picture's position, as lines starting with
`[picture]`. Pictures are fetched at original size (Blogger serves a resized copy unless the address
asks for `s0`), and pictures on other sites, icons and tracking pixels are skipped. Readings are cached
in the scratch folder by picture address, so a re-run or a resumed run never pays twice. Search
results that hold picture text carry a note in the first result's credit block, and the Passage view
shows the same note: it was read by a machine, check the numbers against the original.

**A scenario.** A post opens with a table of Tesla's inputs. `library:pictures plan` counts the
pictures and prints the cost range, `dry-run` reads five for a few cents, `submit` sends the rest as
one Message Batch (half price), and `collect` is run later, as often as needed, until the batch has
ended. `verify` has Opus 5.5 re-read 40 spread-out pictures. `library:blog` then places the text in
the posts, and the table is the post's first passage: the title-page filter ignores any passage with
picture text, so a post that opens with a picture keeps it. The Learner asks for Tesla's growth
input, the search finds the table lines, and the reply cites them with the machine-read note beside.

**Accuracy is checked by code, on every reading.** Cut off by the length limit, empty, or a refusal;
table rows with a different number of cells; a letter standing in a digit; a line repeating; a Total
row that does not add up its column. Then the stronger model's 40 readings are compared number by
number with Haiku's, and each disagreement is listed to be fixed or flagged. Before the reload,
`impact` lists stored Citations whose blog passages will change, because a Citation names sentences
by number.

**Trade-offs.** Haiku is cheap but can misread a digit, so the machine-read note stays on forever
and only a sample is re-read (the code checks cover the rest). Reading by address means we never
download or store the pictures, but a picture Blogger later removes cannot be re-read (its cached
text stays). Batches are slow (up to a day) but half price, and the saved batch id lets a stopped
run resume. Measured cost and accuracy: to be filled in from the live run (see #71).

## Formula registry (`src/finance/formulas.ts`, `formula-ids.ts`, ADR 0002, issue #64)

**What it does.** A list of every named formula the Tutor may show: its plain-word title, the calculator that works it out, each symbol with its letter, plain-word name and unit, the value worked out last (and any worked out on the way), and the formula's lines. Present value starts with three: one future payment, equal yearly payments, and growing yearly payments (the jackpot annuity, which got a new tested calculator, `growing_annuity_present_value`). Each Topic file lists the formulas it teaches (`formulas:` in its YAML). `npm run course:check` fails on a name the registry does not have, which is why the bare list of names sits in `formula-ids.ts` with no imports: the check runs under plain Node.

**Scenario.** The present value Topic lists `growing-annuity-present-value`. When the Learner reaches it, code adds one line to what the Tutor is sent: the formulas this Topic teaches, with the keys each Formula Card takes. The Tutor is told to show those only as Formula Cards and to describe any other formula in words. A Topic that wanted WACC could not list it until WACC had a calculator and a registry entry.

**Trade-off.** A formula costs a tested calculator before it can be taught, which is slower than typing it. In return the Tutor cannot show a formula that code cannot work out, and every symbol's name is written once by us, not improvised by the model each time. A Topic that lists no formulas shows none as cards; moving the other Topics over is done in batches.

## Formula Cards (`FormulaCard` in `src/widgets/library.tsx`, `formula-card-view.tsx`, `check.ts`, issue #64)

**What it does.** A Widget that draws one registered formula: the formula with the symbols' letters, the same formula with the numbers filled in, and a list that names each symbol in plain words with its unit. Each value is coloured by where it came from: teal for the Learner's assumption (a slider), amber for a sourced Case Data figure (with its credit beside it), plain for a fixed number. The result, and values worked out on the way such as the first payment, come only from the formula's calculator, so moving a slider redraws them in the browser with no model call. The Tutor gives the card three small lists: `inputs` (symbol to a `$variable` bound to a Slider), `sourced` (symbol to a Case Data reference, whose latest point is used) and `fixed` (symbol to a number).

**Scenario.** The Tutor writes a Slider for the discount rate and a card for present value with the cash option as a sourced amount and five years fixed. The Learner drags the rate from 5% to 8%: the teal rate, the filled-in formula and the amber-and-plain list all stay put except the result, which falls. If the Tutor instead types the rate as a plain number under `inputs`, or lists `amount` under both `inputs` and `sourced`, or leaves out `years`, the server's Widget check names the problem and the existing correction turn asks the Tutor to rewrite the Widget once.

**Trade-offs.** The check is stricter than the language: it reads the parsed Widget, which is why a card can never show an assumption that no slider controls. The card does not do any arithmetic, so a formula whose calculator fails shows a plain "could not be worked out" message, not a guess. The frozen Widget instructions changed (a new component, a rule and an example), so the next action after deploy starts a new Session; a test checks that the instructions name only components the library has.

## Connections (`connections` in `course/topics/*.yaml`, `src/course/map.ts`, `src/tutor/context.ts`)

**What it does.** A Topic file may carry two or three Connections: short plain-word links from the Topic's idea to other ideas, each naming the outline Topic IDs it links to. At the principle step, and not before, the Tutor's context carries them with the titles of the linked Topics, and the instructions tell the Tutor to give them there. The Learner can still ask a connection question at any time. A Topic without Connections behaves as it did.

**Scenario.** Present value ends with three: a bond's yield is the market's discount rate (so when yields rise, bond prices fall), safe rates usually fall in a recession while the extra return on risky payments can rise, and far-off cash in a business loses the most when rates rise. At the principle step the Tutor sees each one beside "Bond basics and pricing", "GDP, growth and business cycles" or "DCF valuation", and says them in its own words. Had someone typed `bond-prcing`, `npm run course:check` would fail with `Connection 1 links to "bond-prcing", which is not in the outline`.

**Trade-off.** Code checks the links, not the economics: a Connection that names real Topics can still be wrong, so the text is written once and reviewed by the owner. Connections hold no figures (the check rejects digits, `%` and currency signs), so every number the Learner sees still comes from Case Data or a calculator; the price is that a Connection cannot say "by how much". Links may point at Topics still to come, so the course can link forward before those Topics are written.

## Formula markers and the typed-formula check (`src/finance/formula-markers.ts`, `formula-text.ts`, `raw-formula.ts`, `src/course/formula-check.ts`, `src/widgets/marked-text.tsx`, issue #65)

**What it does.** A Topic's text can name a registry formula and its example numbers in a marker, such as `{{formula:present-value amount=1100 ratePercent=10 years=1}}`. Code does everything else with it. In a quiz or spaced-review explanation the marker is drawn as a small static Formula Card (the numbers plain, no slider, the result from the formula's tested calculator). In what the Tutor is sent, the marker is replaced by plain words: the formula's name, each input in words and the computed result, never the marker itself. A single detector, `rawFormulaHits`, finds a formula typed as symbols or arithmetic (an equals sign, a power, "(1 + r)", spaced division or multiplication) and ignores ratios like P/E and 50/50, dates, rupee figures, links, markers and code fences. Three things use it: `npm run course:check`, a behaviour rule called "typed formula" (graded by code alone, with one direct and one indirect question), and later the model comparison.

**Scenario.** The present value quiz asks for $1,210 received in two years at 10%. After the Learner answers, the explanation says "Two years at 10% means dividing by 1.10 twice" and shows a Formula Card with $1,210, 10% and 2 years filled in and $1,000.00 worked out by code. If someone later writes "PV = 1,210 / 1.21 = 1,000" into present value, the course check fails and names the line. If a Learner asks the Tutor to "write out the present value formula", the behaviour run marks the reply failed when it holds symbols, with no grader model call and no cost.

**Trade-off.** The detector is strict: it also catches worked sums such as "100 / 1.10 = 90.91", so 86 other Topics that type formulas are on a not-yet-converted list (`NOT_YET_CONVERTED`). That list can only shrink: a Topic on it that has become clean must come off, and a Topic off it that types a formula fails. A strict detector means a few false alarms in a converted Topic, which are fixed by rewording into worded steps; it never means a missed formula going out unnoticed. Question Bank items are not scanned yet (they live in the database), so a Topic's quiz that uses a bank item can still show one until its explanation is converted or the item is swapped. A marker is checked when the Course Map loads: it must name a formula on the Topic's own `formulas` list and give exactly that formula's inputs.

## Topic Notes and the Notes page (`src/learner/notes.ts`, `src/app/notes/`, `src/app/api/notes/route.ts`, table `note_items`, issue #69)

**What it does.** A fifth header link, "Notes", opens a page that lists every Topic in course order, each as a Topic Note. When a Topic is passed, code fills in its note with no model call: its Formula Cards drawn with example numbers (the numbers from the first marker in the Topic's own text that names the formula, else the registry's working example, with results from the formula's calculator), the Insight in the Learner's own words (beside the written Insight only when the Tutor had to tell it), the principle, the Connections and the mistakes the Tutor noticed. Nothing of that part is stored: it is built from the current Topic file and the Learner's records every time the page opens. What is stored is only the Learner's own lines, in `note_items` (kind "line"), which they can add, edit and delete on any Topic, passed or not, through `/api/notes` behind the passcode. The table also has empty columns for the saved replies and Widgets of the next ticket. The page prints: the header, buttons and boxes for typing are hidden on paper, a Topic with nothing on it is left out, and the light look is forced onto white.

**Scenario.** The Learner passes present value after being told the Insight. On the Notes page its note shows the Formula Card with $1,100, 10% and 1 year and $1,000.00 worked out, "In your words: just tell me" beside "As written: waiting has a price", the principle, three Connections and the mistake "added the interest instead of dividing". They add the line "divide, do not subtract" and press Print. Before passing bond prices they can already add lines there, but its note says it fills in when they pass.

**Trade-off.** Building on read means a note always follows the latest Topic file: if the owner rewrites a principle, old notes show the new words, and a Learner's printed copy and the screen can differ over time. A stored snapshot would keep the old words but would need a second copy to keep in step. The Insight words and the mistakes come from records that never change once written, so only the course text moves. Own lines are plain text of up to 2,000 characters with no formatting, which keeps the page simple and safe to print.

## Save to notes (`src/learner/saved.ts`, `src/app/save-to-notes.tsx`, `src/app/api/notes/saved/route.ts`, `src/widgets/settings.ts`, table `note_items`, issue #70)

**What it does.** Every finished Tutor reply, every Widget in the panel and the explore Widget has a quiet "Save to notes" button, in the workspace and in old Sessions. Only a pointer is stored in `note_items`: for a reply, the Session and the turn (the seq of the Learner's message that began it); for a Widget, also its number in the reply and the numbers on its sliders at that moment (the explore Widget is number -1 and has no reply). The browser never sends Widget code. The server finds the code in the stored reply, or in the Topic file for the explore Widget, and keeps only the slider numbers for variables the code really declares. The Topic is the last one the Tutor's context named by that turn (so a save from an old Session lands on that Session's Topic), else the Learner's current Topic. On the Topic Note the Notes page then draws a "Saved from lessons" block, straight away, passed or not: a reply is read back from its Session like an old Session, with its sources folded and the as-of rule applied at the moment of reading; a Widget is drawn live from its code with the saved numbers written in place of its starting ones (`applySettings`). "Remove from notes" takes an item off; the Learner's own lines are never touched by it. The "done" event of a turn now carries the Session and turn, so a reply that has just finished can be saved without a reload.

**Scenario.** On the Cash-now-or-later Case the Tutor's reply cites a Damodaran post dated after the Case's as-of date. The Learner saves it. Opening the Notes page before the reveal shows the reply with that source listed as "hidden until the reveal"; after the reveal the same saved reply shows its heading and credit. They also save the explore Widget with the rate slider at 8%; a week later the note shows it at 8%, ready to move again.

**Trade-off.** Storing a pointer instead of a copy means a saved reply always follows today's as-of rule and sources, and cannot go stale or leak an outcome from a frozen copy; but it depends on the Session's messages staying (they are add-only) and a reply saved from a Session cannot be edited. Settings are only slider numbers, so a Widget whose state is anything else reopens at its starting values. A static page render cannot show the slider numbers, because the Widget library fills them in after the first browser render, so the test checks the code the numbers are written into.
