# Architecture

A plain-words map of the layers built so far. Each layer says what it does, a concrete
scenario, and the trade-off we accepted. Newest layers are added at the bottom.

## How the layers fit together

One turn, start to finish. The Learner types a message in the **app**, past the **passcode**
gate. The **Tutor Turn** asks the **Course Navigator** and **Learner Memory** where the Learner
stands, tells Claude, and streams the reply back. If the reply holds a **widget**, the browser
draws it and the Learner plays with it at no cost. Everything is saved in the **database**, and
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

**Trade-off.** One shared passcode is simple and enough for one private Learner. It is not a
user account system. Changing `SESSION_SECRET` signs every device out.

## Database (Neon Postgres through Drizzle)

**What it does.** Neon is the only store. Seven tables so far:
- `settings`: the Tutor's model (`claude-sonnet-5-5`), effort (`medium`) and the idle hours before
  a new Session starts, editable without a rebuild.
- `sessions`: one row per Session, with the exact instructions, tool definitions, model and
  effort frozen when it started, plus a fingerprint of the instructions and tools.
- `messages`: the Session's history, add-only, each message stored exactly as sent or received.
- `learner_state`, `topic_progress`, `check_results`: Learner Memory (below).
- `usage`: what each turn and each step of it cost (below).

The app uses Neon's pooled connection (`DATABASE_URL`). Schema changes are migration files in
`drizzle/`, applied with `npm run db:migrate`, which uses the direct connection
(`DATABASE_URL_UNPOOLED`).

**Scenario.** The Learner reloads the page mid-conversation. The page reads the current Session's
messages from Neon and shows them again, without calling Claude.

**Trade-off.** Storing raw message content as JSON keeps it byte-for-byte replayable, which
Claude's thinking rules need, but makes it less convenient to query than neat columns.

## Tutor Turn (`src/tutor/turn.ts`)

**What it does.** Runs one exchange with Claude. It saves the Learner's message, builds the
request only from what the Session saved (never from today's code or settings), and runs it
through the Anthropic SDK's Tool Runner with streaming. Text is forwarded to the browser as it
arrives. When each step of the loop finishes, the reply is saved unchanged, thinking blocks
included. The Tool Runner is in beta, so the SDK version is pinned exactly (`1.3.0`).

**Scenario.** On the third message of a Session, the request contains the first two exchanges
exactly as they happened, including Claude's signed thinking blocks, followed by the new
message. Because nothing earlier was edited, Claude accepts the thinking and no 400 error occurs.
If the owner switches the model setting to Haiku meanwhile, this Session keeps Sonnet; the next
Session picks up Haiku.

**Trade-off.** Add-only history means context that changes (for example, the current teaching
step) must be sent as a new message rather than by editing the instructions. That is a little
more code, but editing would break Claude's thinking on this model.

**How it is tested.** Tests call the Tutor Turn with a scripted stand-in for the Anthropic
client and a throwaway in-memory Postgres (PGlite) with the real migrations, so CI needs no
secrets and spends no credits.

**Measured.** The longest real turn so far took 11.9 seconds, about 4% of the 300-second limit
(plain conversation, no tools yet).

## Course Map (`course/topics/*.yaml`, `src/course/map.ts`)

**What it does.** The course is a folder of plain text files, one per Topic. Each file holds the
Topic's Stage, its prerequisites, its place on the default path, its Case (a story told as of a
past date, plus the reveal of what happened), the concept, the principle and an ordered list of
Checks. Topics, Cases and Checks have permanent IDs. The first Topic is present value, taught
through the 2018 $1.537 billion Mega Millions jackpot and its $877.8 million cash option.

A validator checks the files: every prerequisite must exist, prerequisites must not loop, IDs
must be unique, and every Topic needs at least one Check. It runs as part of `npm run check`,
so CI fails on a bad edit.

**Scenario.** Someone adds a Topic that requires `bond-pricing`, which doesn't exist yet. CI
fails with: `Topic "duration" requires "bond-pricing", which is not on the Course Map`.

**Trade-off.** Plain files are quick to edit and review, and changes go live on deploy. The price
is that a course edit needs a deploy, not a click in an admin page.

## Course Navigator (`src/course/navigator.ts`)

**What it does.** The module that decides what comes next. It takes the Course Map and the
Learner's saved progress and returns the current Topic, the Teaching Step, the Check in play,
the next legal step and any unmet prerequisites. It is pure: no model, no database, no clock.
Teaching Steps run as a state machine: story, then concept, your turn and Check for each Check,
then reveal, then principle. Only a saved Check result moves past a Check step, the reveal opens
only after the last Check is passed, and a Topic is passed only when its principle finishes.

The Learner's place is worked out from recorded passes: the first Check, in the Topic's current
order, without a pass. That keeps Course Map edits safe: an inserted Check becomes the place, a
removed Check's records are ignored, and a Check added to an already passed Topic is due only if
marked `required`. A newly added prerequisite never moves the Learner out of a started Topic; it
is only reported as unmet.

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

Until the Check tickets land, only tests record Check results (`recordCheckResultForTest`), so in
the live app the Learner currently stops at the first Check step.

**Scenario.** The Learner reaches the reveal, closes the laptop and comes back the next day.
The workspace shows "Present value (foundation Stage). Teaching Step: reveal. The reveal has
been shown." with a Continue button, read straight from SQL.

**Trade-off.** Hand-written tables and a summary in code instead of a memory framework: less to
learn and nothing hidden, but each new kind of memory (misconceptions arrive next) is new code.

## Teaching Steps in the Tutor Turn (`src/tutor/turn.ts`, `src/tutor/context.ts`)

**What it does.** Before each Learner message, code appends a "Course Navigator" context
message whenever the Learner's place changed: the Topic, the Teaching Step, the Case's story,
and only the material for that step (the concept, the coming Check, the principle). The Case's
outcome is included only from the reveal step on, so hindsight is withheld by code. The Tutor has
one tool, `finish_teaching_step`; when it calls it, code asks the Navigator, saves the move if it
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
the inputs to a tested formula (the present value code in `src/finance/`, built on formula.js and
checked against textbook worked examples) and, optionally, a reference to a sourced Case figure,
such as the $877.8 million cash option. That figure comes from `/api/case-data/<case>`, which
applies the hindsight rule on the server: before a Topic's reveal, nothing dated after the Case's
as-of date is returned. Slider values are labelled "your assumption"; sourced figures carry their
source and date.

**Layout.** The conversation runs on assistant-ui's external-store runtime: our code owns the
messages and streaming, assistant-ui draws them. As a reply streams in, code splits it into prose
and widget blocks. The prose stays on the left with a small "Widget 1" marker where the widget
belongs; the right pane shows the latest widget (or the one whose marker was clicked). On a phone
the widget sits in the conversation instead. Old Sessions rebuild their widgets from the stored
text, with controls back at their starting values.

**When a widget is broken.** When a reply finishes, the server checks each widget with OpenUI's
parser. If one cannot be drawn, code sends the Tutor one correction request listing the problems,
and the corrected widget replaces the broken one on screen. History keeps both, unchanged. If the
correction is broken too, the browser shows a plain "This widget could not be drawn" note and the
lesson carries on. A widget that crashes while drawing is caught the same way.

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
tokens in and out on Sonnet). The turn tests check that scripted replies produce the right rows,
sums and costs, and that a reloaded Session shows the same panel.

## Checks before merging (CI)

`npm run check` runs the type checker, the linter, the Course Map validator and the tests.
GitHub Actions runs `npm ci && npm run check` on every push with no secrets.
