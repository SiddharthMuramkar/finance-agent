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

**Trade-off.** One shared passcode is simple and enough for one private Learner. It is not a
user account system. Changing `SESSION_SECRET` signs every device out.

## Database (Neon Postgres through Drizzle)

**What it does.** Neon is the only store. Thirteen tables so far:
- `settings`: the Tutor's model (`claude-sonnet-5-5`), effort (`medium`) and the idle hours before
  a new Session starts, editable without a rebuild.
- `sessions`: one row per Session, with the exact instructions, tool definitions, model and
  effort frozen when it started, plus a fingerprint of the instructions and tools.
- `messages`: the Session's history, add-only, each message stored exactly as sent or received.
- `learner_state`, `topic_progress`, `check_results`, `misconceptions`, `quiz_attempts`: Learner Memory (below).
- `usage`: what each turn and each step of it cost (below).
- `case_datasets`, `case_data_points`: Case Data, checked historical datasets with their sources (below).
- `turns`, `tool_calls`: each turn's saved status (running, cut off, finished, failed), which is also
  the one-turn lock, and the saved result of every tool call, keyed by its tool call ID (below).

The app uses Neon's pooled connection (`DATABASE_URL`), over WebSockets rather than HTTP, because
only WebSockets allow the transactions the Tutor's tools need (see "Surviving cut-offs and failures"). Schema changes are migration files in
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
Checks, and any Claude-written quiz questions. Topics, Cases, Checks and questions have permanent IDs. The first Topic is present value, taught
through the 2018 $1.537 billion Mega Millions jackpot and its $877.8 million cash option.

A validator checks the files: every prerequisite must exist, prerequisites must not loop, IDs
must be unique, every Topic needs at least one Check, and a quiz Check may use only questions its
Topic holds, with an answer that is one of the choices and a pass rule it can actually meet. It runs as part of `npm run check`,
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
a teal "Your assumption" tag; everything drawn from Case Data sits in its own amber box with a
"Sourced" tag and a link to its source, so the two never blend.

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
  same attempt twice changes nothing. Only the current Check's results are accepted.
- **Retries differ.** Each attempt is a row in `quiz_attempts`. Attempts walk round the Check's
  pool, so the second attempt starts on questions the first did not show whenever the pool is
  bigger than one attempt. If there are no other questions, the same ones return.
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
hindsight test questions cover the rest.

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
  discard it, so it cannot stay in history. The Learner sees a plain message, their place doesn't
  change, and the next message starts a new Session from SQL rather than editing history. An API
  error says why in plain words (credits run out or spend limit, rate limit, Claude busy, no
  connection), keeps everything saved, and offers Retry, which resumes the same turn rather than
  sending the Learner's message again (this fixes the repeated Learner messages seen in #6).
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

## Pacing rule (`src/tutor/tools.ts`, `src/tutor/instructions.ts`)

**What it does.** Live runs showed the Tutor finishing several Teaching Steps in one turn without
teaching them: it called `finish_teaching_step` for the concept, then the your-turn step, then the
Check, all in one reply. Now code refuses. When a tool call moves the Learner onto a new step (a
`finish_teaching_step`, or a passing Check verdict), the `tool_calls` table records that this turn
began a step (`turn_id`, `began_step`). A later `finish_teaching_step` in the same turn is rejected
as a tool error: "it began during this turn. Teach it in your reply now, then stop and wait for the
Learner to answer". The same applies to the very first step: a Topic that this turn started (its
`turns.started_topic` flag) cannot have its story finished in that turn. So every step is taught in a
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

## Simulated Learner (`scripts/simulated-learner.mjs`)

**What it does.** A script that plays the Learner over HTTP against any running copy of the app: it
logs in with the passcode, presses Continue, answers the Tutor with a cheap model (`claude-haiku-5-5`),
takes the quiz through `GET`/`POST /api/quiz` (code marks it, no model call), and keeps going until the
Topic is passed. After each turn it reads the step, duration and cost from the `usage` table, and it
writes a transcript, a per-turn table and a cost summary to a folder you give it (outside the repo,
because transcripts hold source-derived text). `--reset` archives the Topic's saved progress first (rows
are renamed, nothing is deleted) so a run starts at the story. By default it forces one new Session in the
middle of the Topic, by setting `session_idle_hours` to 0 for a single turn, to prove that closing the app
and returning resumes at the right place.

**Scenario.** After a deploy, run it against the production URL: fourteen turns later you have a
transcript of a whole Topic, the cost per turn, the longest turn, and proof that a new Session carried on
at the same step.

**Trade-off.** It talks to the real Tutor and the real database, so each run costs about a quarter of a
dollar and changes the saved progress (hence `--reset`). The Learner is a model, so it is polite and
quick to follow: it checks the plumbing and the pacing, not whether a real person finds the teaching
good. It reads the database directly for cost and step, so it must use the same `DATABASE_URL` as the app.

**How it is tested.** The pacing rule and the paragraph break are tested at the Tutor Turn seam with the
scripted client. The runner itself is a script, checked by running it end to end (evidence folder for #11).
