# Architecture

A plain-words map of the layers built so far. Each layer says what it does, a concrete
scenario, and the trade-off we accepted. Newest layers are added at the bottom.

## How the layers fit together

One turn, start to finish. The Learner types a message in the **app**, past the **passcode**
gate. The **Tutor Turn** asks the **Course Navigator** and **Learner Memory** where the Learner
stands, tells Claude (with the **Case Data** the as-of rule allows), and streams the reply back.
If the reply holds a **widget**, the browser draws it, fetching any sourced data through the same
rule and working its numbers out with our tested formulas, and the Learner plays with it at no cost. Everything is saved in the **database**, and
the **usage** layer records what the turn cost, which the "under the hood" panel shows under
the reply when the Learner has turned on Show developer details in Settings.

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

## Page analytics (`@vercel/analytics`, `<Analytics />` in `src/app/layout.tsx`, PR #116)

**What it does.** The root layout adds Vercel Web Analytics to every page, signed in or out. Each
page view loads a small script from our own site (`/_vercel/insights/script.js`) that reports the
view to Vercel: the page's address, the route it matched (such as `/sessions/[id]`), the referrer, and
the browser, device and country Vercel works out from the request. It sets no cookie and sends
nothing typed on the page. The owner reads the counts in the Vercel dashboard.

**Scenario.** A friend opens value-it.xyz from a link in a chat; the dashboard shows one more view of
`/`, from that chat app, on a phone. A signed-in Learner then opens an old Session; the dashboard shows
a view of `/sessions/12`.

**Trade-off.** The owner sees which pages are used without building anything. The price: the
addresses of signed-in pages, some of which carry ids (`/sessions/<id>`), go to a third
party, while the Learner Profile tells Learners "This is private" about what they write there (the
profile's text is never sent). Dropping the ids with the component's `beforeSend`, or showing it only
on Home, is the owner's call.

## Passcode gate (`src/proxy.ts`)

**What it does.** Every page and API route checks for a signed cookie before doing anything.
Without it, pages redirect to `/login` and API routes answer 401. The login form looks the passcode
up in the passcode list and, if it matches, sets a cookie carrying that name's Learner id, signed
with `SESSION_SECRET` (see "Own passcodes" at the end of this note).

**Scenario.** Someone finds the URL and posts to `/api/turn`. The proxy answers 401 before any
Claude call happens, so no credits are spent.

**The public doors.** Signed out, the proxy lets through only a plain GET or HEAD of `/` (Home) and
image files under `/landing-assets/` (`.png` or `.webp`; today only the link-preview image). A POST to `/`, or any request carrying a
`Next-Action` header (a Server Action call), answers 401. Every other page still redirects to
`/login`, and every `/api/*` route still answers 401. `/` itself checks the cookie again
(`isSignedIn()` in `src/auth/session.ts`) before it reads anything. The Study Workspace lives at
`/study`, an ordinary gated page: signed out it redirects to `/login?next=%2Fstudy`. A GET or HEAD
of exactly `/login` (with any query) also gets through; the match is exact, because anything looser
would send the sign-in page back to itself forever. The proxy skips only `api/login`, as a whole
path segment, so `/api/login-anything` is still checked; the sign-in page itself now goes through
the proxy.

**Sign in lands where you meant to go** (`src/auth/destination.ts`). Signed out, a GET or HEAD of
any other page redirects to `/login?next=<that page>`: its path and query, minus Next.js's internal
parameters such as `_rsc`. Any other method redirects to `/login` with no `next`, and API routes
still answer 401 with no `next`. The sign-in page puts the `next` in a hidden form field; the
sign-in route sends a right passcode there with a 303, or to `/study` when there is none. A wrong
passcode goes to `/login?wrong=1` and a pause to `/login?locked=1`, each keeping the `next` (with
none, those addresses are exactly as before). Signed in, a GET or HEAD of `/login` skips the form
with a temporary (307) redirect to the `next`, or `/study`.

One rule decides whether a `next` is safe, and the proxy, the sign-in page and the sign-in route all
use it (`destinationOrDefault` adds the `/study` fallback). In order: it starts with `/` but not
`//` or `/\`; it holds no percent-encoded slash or backslash (`%2F` or `%5C`, in any case); it holds
no whitespace or control characters (the URL parser quietly drops tabs and newlines, so
`/<tab>/evil.example` would otherwise reach another site); resolved as a URL it stays on this site;
and the resolved path is neither `/login` (or below) nor `/api` (or below), so `/a/../api/turn`
can't slip past. The redirect uses the resolved path and query, never the submitted text. The value
is never decoded again, and an encoded slash is refused outright, so `/%2F%2Fevil.example` can't
turn into `//` further along. Anything unsafe counts as no destination.

*Scenario.* Signed out, the Learner opens a link to `/passages/12`. The proxy sends them to
`/login?next=%2Fpassages%2F12`. They mistype the passcode, land on
`/login?wrong=1&next=%2Fpassages%2F12`, type it again and open the Passage. A crafted link
`/login?next=https://evil.example` signs them in and lands them in the Study Workspace instead.

*Trade-off.* Remembering the page costs one shared rule that three places must use; a looser check
in any of them would turn the sign-in page into a way to send the Learner to another site. The rule
only allows paths, so a destination can never be another of the owner's own domains, which isn't
needed. An encoded slash inside a query (`?q=a%2Fb`) is refused too; no page links that way, and the
cost is only landing in the Study Workspace.

**The passcode page** (`src/app/login/page.tsx`). A heading, "Enter your passcode", the passcode
field, an **Enter** button and a "← Back to home" link to `/`. The field (`passcode-field.tsx`, the
page's one client piece) starts hidden; an eye button beside it switches it between hidden and
visible, labelled "Show passcode" or "Hide passcode" for what it will do next. `?wrong=1` shows
"That passcode didn't work. Check it and try again." directly under the field, and `?locked=1`
shows the pause message instead. The page only shows things: the form posts to the same sign-in
route as before, so the lock-out and the safe redirect are untouched.

*Scenario.* The Learner types a long passcode on a phone, gets "That passcode didn't work…", taps
the eye, sees a typo, fixes it and presses Enter. Someone who arrived by mistake taps "← Back to
home".

*Trade-off.* The eye makes the field a client component, a little script on an otherwise
server-only page; without it a mistyped passcode can only be retyped blind. A shown passcode is
visible to anyone looking at the screen, so it is hidden again on every page load.

**The sign-out door** (`src/app/api/logout/route.ts`). Signed in or out, a POST to exactly
`/api/logout` gets through the proxy; a GET, or a path that merely starts with it (`/api/logout/x`,
`/api/logoutx`), still answers 401, and the Server Action refusal still runs first. The route itself
signs out only a request this site sent: if the browser sends `Sec-Fetch-Site`, only `same-origin`
counts; if not, the `Origin` header must equal the address the request was sent to (scheme, host and
port, read from the request, never a hard-coded domain). Anything else, including `Origin: null` or
no `Origin` at all, gets a short 403 and the cookie is left alone. A same-origin POST gets the
passcode cookie back with an empty value, an expiry in 1970, path `/`, no Domain and the same flags
the sign-in route uses (one shared set, `ACCESS_COOKIE_OPTIONS`), then a 303 to `/`. A GET or HEAD
answers 405. It never touches the database.

*Scenario.* The Learner presses Sign out in the header. The browser posts the form, the cookie is
expired, and the 303 reloads Home with "Sign in". If they had already signed out in another tab, the
same thing happens rather than an error. A hostile page that auto-submits a form to `/api/logout`
arrives as `cross-site` and gets 403, so the Learner stays signed in.

*Trade-off.* Sign out is a button in a plain HTML form, never a link, so prefetching or a crawler
can't sign anyone out, and it works without JavaScript. It clears only this browser's cookie: the
Learner's other devices hold their own copy and stay signed in, and changing `SESSION_SECRET` is still
how to sign out everywhere. The apex address redirects to www, so a POST sent to the apex is
refused; real sign-outs always come from www pages.

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

**Trade-off.** A passcode per name, kept in an environment value, is simple and enough for a few
people the owner knows. It is not a user account system: there is no sign-up and no reset by email.
Changing `SESSION_SECRET` signs every device out. The overall cap no longer
locks everyone out, because a determined guesser could keep that lock on forever with fifty guesses an
hour. Instead it slows every address to one try per 15 minutes: an attacker with many addresses still
gets one guess per address in each window, and the owner who mistypes on a new device waits 15 minutes.
If you ever need to clear the limit at once, delete the rows of `login_failures` in Neon.

## Database (Neon Postgres through Drizzle)

**What it does.** Neon is the only store. Its tables:
- `settings`: the Tutor's model (`claude-opus-5-5`), effort (`medium`) and the idle hours that
  count as a break (they no longer start a Session), editable without a rebuild.
- `sessions`: one row per Session (one Learner's conversation about one Topic), with the exact
  instructions, tool definitions, model and effort frozen at its first turn (refrozen after a deploy
  that changes them), plus a fingerprint of the instructions and tools.
- `messages`: the Session's history, add-only, each message stored exactly as sent or received.
- `learner_state`, `topic_progress`, `check_results`, `misconceptions`, `quiz_attempts`, `insight_attempts`: Learner Memory (below; the last is described under "Insight recording").
- `usage`: what each turn and each step of it cost (below).
- `question_bank`: the Question Bank, imported human-written questions with licence and credit (below).
- `case_datasets`, `case_data_points`: Case Data, checked historical datasets with their sources (below).
- `library_sources`, `library_passages`: the Library, real sources cut into searchable passages (below).
- `turns`, `tool_calls`: each turn's saved status (running, cut off, finished, failed), which is also
  the one-turn lock, and the saved result of every tool call, keyed by its tool call ID (below).
- `login_failures`: wrong passcodes by address and time, for the login's guessing limit (Passcode gate, above).
- `learners`, `session_items`, `widget_state`: Learners, the display-only items between messages,
  and saved Widget work (next section). Every Learner-owned table has a `learner_id` with no default.

The app uses Neon's pooled connection (`DATABASE_URL`), over WebSockets rather than HTTP, because
only WebSockets allow the transactions the Tutor's tools need (see "Surviving cut-offs and failures"). Schema changes are migration files in
`drizzle/`, applied with `npm run db:migrate`, which uses the direct connection
(`DATABASE_URL_UNPOOLED`).

**Scenario.** The Learner reloads the page mid-conversation. The page reads the current Topic's
Session's messages from Neon and shows them again, without calling Claude.

**Trade-off.** Storing raw message content as JSON keeps it byte-for-byte replayable, which
Claude's thinking rules need, but makes it less convenient to query than neat columns.

## Learners, Topic Sessions and the expand step (`learners`, `session_items`, `widget_state`, `drizzle/0026_learners_expand.sql`, spec #119)

**What it does.** This was the groundwork for own Learners and one Session per Topic (ADR 0004). At
the expand step it changed the database only; no code read or wrote the new parts yet, so nothing on
screen changed. The per-Learner code and the contract step (below) have since shipped.
- **Learners** (`learners`): one row per Learner, with a name, an archived time (set by Start over)
  and the Show developer details choice (off). The migration makes the owner's Learner, id 1, named
  "owner" (`OWNER_LEARNER_ID` in `src/db/schema.ts`). At most one Learner per name is not archived.
- **A Learner id on every Learner-owned table**: the place on the Course Map (`learner_state`),
  `topic_progress`, `check_results`, `quiz_attempts`, `misconceptions`, `insight_attempts`,
  `review_cards`, `review_log`, `note_items`, `learner_profile`, `pasted_texts`, `sessions`, `turns`,
  and the two new stores below. At the expand step the column defaulted to the owner, which gave
  every existing row to the owner, and also gave the owner every row written by the code of the time,
  which never named a Learner. The contract step (migration 0028) later dropped those defaults.
- **On Sessions**: the Topic, an Older flag and the position where the Session's instructions were
  last refrozen after a deploy. Every existing Session is Older. The flag defaults to Older; the
  Tutor Turn now makes live Topic Sessions (see "One Session per Topic" below). A database rule
  allows one live Session per Learner and Topic; Older Sessions and Sessions with no Topic are not
  limited.
- **Session items** (`session_items`): what the Study Workspace draws between messages and never
  sends to the model: step dividers, "Picking up where you left off" and Due Check dividers, Check
  result cards and Topic complete cards. Each has its Learner, Session, the message it follows
  (`after_seq`), a kind and its data. Step dividers are the first kind written (see "Session items
  and step dividers" below).
- **Widget state** (`widget_state`): one row per Session and Widget key (a written-ahead Widget's
  id, or a Tutor-drawn Widget's title) holding the slider values and ticked Guided Tasks.
- **The shown Session** (`learner_state.shown_session_id`): which Session the Study Workspace shows,
  so a passed Topic can stay on screen until the Learner chooses where to go.

**Why expand, then contract.** Migrations are applied by hand and every merge deploys at once, so a
schema change comes in three steps. Expand (this one): add everything, with defaults that keep the
live code working, and apply it to production before any code uses it. Then the code that uses it
(per-Learner reads and writes, Topic Sessions). Last, contract: the per-Learner keys (Topic progress
by Learner and Topic, and so on) and dropping the owner defaults, so no row is written without a
Learner.

**Scenario.** The migration runs on production while the old code is live. The owner sends a message
a minute later: the old code starts a Session and a turn without naming a Learner, and both rows
belong to the owner and the Session is Older. Weeks later the per-Learner code is live, and those
rows show up in the owner's Older sessions, as every Session from before the change should.

**Trade-off.** Defaults that point at the owner keep the old code working without a single change,
but for a while a row written without a Learner silently belongs to the owner rather than failing.
The contract step (migration 0028, ticket #127) has since closed that gap: the defaults are gone.

## The current Learner, and Learner Memory, Sessions and turns scoped by it (`currentLearnerId` in `src/auth/session.ts`, `drizzle/0027_learners_keys.sql`, spec #119, ticket #125)

**What it does.** Every request now has a current Learner, and every read and write of their
learning goes through it.
- **The current Learner.** `currentLearnerId()` answers whose request this is: the Learner the
  sign-in cookie carries (see "Own passcodes" at the end of this note). Every page and route asks
  it once and passes the Learner on: the Study Workspace, the
  Course Map, Progress, Past Sessions and a Session page, the Passage view, Home's Resume, and the
  turn, jump (Course Map), quiz and Case Data routes.
- **Learner Memory** (`src/learner/memory.ts`, `quiz.ts`, `insight.ts`): the place on the Course
  Map, Topic progress, Check results, misconceptions, Insight attempts and quiz attempts are read
  and written for one Learner. A quiz attempt of another Learner's is "no such quiz attempt".
- **Sessions and turns** (`session-log.ts`, `turn-status.ts`, `transcript.ts`, `session-summary.ts`):
  a Learner's live Session for a Topic, their latest turn and its resume, the Course Map's
  turn-in-progress check and the explore idle-turn count read only that Learner's rows. Past
  Sessions lists only theirs, and another Learner's Session reads as empty.
- **The Tutor Turn** takes the Learner (`learnerId` in its dependencies) and passes it to every tool:
  the turn row, the Session it starts, the context, the quiz results it reports and every write.
- **The as-of rule takes the Learner.** Library search, hidden Citations, the Passage view, the
  sources under replies, the Tutor's Case Data context and the Case Data route all ask whether
  *this* Learner has seen the reveal.
- **The per-Learner keys** (migration 0027): Topic progress is keyed by (Learner, Topic); quiz
  attempt numbers are unique per (Learner, Check); the Insight is settled once per Learner; one turn
  may run per Learner; one place on the Course Map and one Learner Profile per Learner (their `id`
  is the Learner's id, the owner's is 1); and a Review card per (Learner, question) and a saved note
  item once per Learner and place (used by the next section).

**Scenario.** The owner and a friend both study present value at once. The owner's reply is still
streaming when the friend sends a message: the friend's turn runs at once, because the lock is per
Learner, while the owner's own second tab still gets "turn in progress". Both reach the first Check
and each gets quiz attempt 1 (attempt number 0). The owner passes and reaches the reveal; the
friend's Tutor context, Case Data and Library search still stop at 24 October 2018.

**Trade-off.** The Learner is passed by hand as an argument, not taken from a hidden per-request
store, so every reader says whose data it reads and tests can run two Learners side by side. The
cost is a longer argument list. The Learner is a required argument of every reader and writer, with
no owner fallback in code, so one that forgets it does not compile; and since the contract step the
database also refuses a row written without a Learner. One more cost: the code
live before this change upserts Topic progress on its old one-column key, so between applying the
migration and the new code's deploy such a write fails, and the Learner is told it was not saved.

## Reviews, Topic Notes, the Learner Profile and pasted passages are Learner-owned, and other Learners' ids answer 404 (`src/learner/review.ts`, `notes.ts`, `saved.ts`, `profile.ts`, `src/tutor/pasted.ts`, spec #119, ticket #126)

**What it does.** The rest of a Learner's own data is now read and written for the current Learner
only, using the keys migration 0027 already set (no new migration).
- **Reviews.** A Review card is per (Learner, question). Enrolling reads only this Learner's passed
  Checks and quiz attempts; the Review panel offers only their cards; the daily cap counts only their
  Reviews in the last 24 hours; and a rating is written to their card and their Review log.
- **Topic Notes.** A note is built from this Learner's pass, settled Insight and mistakes, and shows
  only their own lines and saved items. Saving is once per Learner and place, so two Learners can
  each save the same explore Widget.
- **The Learner Profile.** One row per Learner (its id is the Learner's id). About you on Settings, the
  Welcome's About you panel and the profile block in a new Session's opening message all use the
  current Learner's row.
- **Pasted passages.** A paste is saved with the Learner who sent it, and listed and counted for that
  Learner only.
- **The 404 rule for foreign ids.** Any id the browser sends must belong to the signed-in Learner.
  A Session page, a quiz attempt (`/api/quiz`), a note line (`/api/notes` edit or delete), a saved
  item (`/api/notes/saved` delete) and a Session to save from (`/api/notes/saved`) of another
  Learner are treated as if they did not exist: the answer is 404, and nothing is read or changed.

**Scenario.** A friend signs in beside the owner and guesses that `/sessions/12` is the owner's
Session, then sends the owner's quiz attempt 40 and note line 7 to the API. Each answers 404, the
same as an id that was never used, so the friend learns nothing, and the owner's Session, attempt and
line are unchanged. Both of them passed the present value quiz: the owner does his Review of the day,
and the friend's own card for the same question is still due, with her own daily cap untouched.

**Trade-off.** Each reader filters by the Learner in its own query, rather than the database checking
ownership for every row (row-level security). That keeps the code plain and testable with two Learners
side by side, but a new query that forgets to filter by the Learner is not caught by the database
(only a write without a Learner is). A foreign id answers 404
rather than 403, so a guess cannot tell "someone else's" from "does not exist".

## Tutor Turn (`src/tutor/turn.ts`, `session-log.ts`, `transcript.ts`, `context.ts`)

**What it does.** Runs one exchange with Claude. It saves the Learner's message, builds the
request only from what the Session saved (never from today's code or settings), and runs it
through the Anthropic SDK's Tool Runner with streaming. Text is forwarded to the browser as it
arrives. When each step of the loop finishes, the reply is saved unchanged, thinking blocks
included. The Tutor runs on Opus 5.5 at medium effort (the stored default; each Session keeps the
model it was last frozen with). No request forces a tool or sends sampling settings such as temperature.
The Tool Runner is in beta, so the SDK version is pinned exactly (`1.3.0`).

**Scenario.** On the third message of a Session, the request contains the first two exchanges
exactly as they happened, including Claude's signed thinking blocks, followed by the new
message. Because nothing earlier was edited, Claude accepts the thinking and no 400 error occurs.
If the owner switches the model setting to Haiku meanwhile, this Session keeps Opus; a new Topic's
Session, or this one after the next deploy that changes the instructions, picks up Haiku. The default is Opus 5.5 at medium effort; a data migration moved the stored
setting from the old Sonnet default to Opus only where it still held that default, so a model the
owner chose by hand is never overwritten.

**Trade-off.** Add-only history means context that changes (for example, the current teaching
step) must be sent as a new message rather than by editing the instructions. That is a little
more code, but editing would break Claude's thinking on this model.

**Where the code lives.** `turn.ts` runs the turn itself: the lock, the loop with cut-off,
compaction, refusal and widget correction. `session-log.ts` holds the stored settings, which
Session a turn runs in (one per Learner and Topic), the refreeze after a deploy, and the add-only
message log with what of it is sent. `context.ts` builds the
Course Navigator's context and works out which context the Tutor last saw. `transcript.ts` turns a
Session into plain lines for the screen (after a reload, on old Session pages, in a replay). Each
changes for its own reason, so a change to how Sessions are shown no longer touches the turn loop.

**How it is tested.** Tests call the Tutor Turn with a scripted stand-in for the Anthropic
client and a throwaway in-memory Postgres (PGlite) with the real migrations, so CI needs no
secrets and spends no credits.

**Measured.** The longest real turn so far took 11.9 seconds, about 4% of the 300-second limit
(plain conversation, no tools yet).

## One Session per Topic (`session-log.ts`, `turn.ts`, `context.ts`, `src/app/study/page.tsx`, `turn-stream.ts`, ADR 0004, spec #119, ticket #130)

**What it does.** A Session is now the whole conversation between one Learner and the Tutor about
one Topic. It used to be one conversation across any Topics, replaced after six idle hours or a
deploy, so a Course Map jump carried one Topic's talk into the next.
- **Which Session.** A turn runs in the Learner's live Session for the Course Navigator's current
  Topic (`sessionForTurn`). The Topic's first turn makes it, inserted with on-conflict so two tabs
  never make two; rendering a page never makes one. With every Topic passed, the Learner talks in one
  Session with no Topic.
- **What the page shows.** The Study Workspace shows the Learner's shown Session: the current Topic's
  live Session, or an empty thread before its first turn (the page then starts the opener), or a
  Topic just passed, until the Learner chooses where to go (see "Choosing and opening a Topic").
  Coming back to a Topic shows its whole thread as it was left.
- **One page, one Session.** Every turn request carries what the page shows: its Session, or for a
  Topic's first turn the Topic. If that is not the Learner's current Topic (they chose another one in
  another tab), the turn is refused before anything is saved: "This Topic changed in another tab.
  Reload to carry on." Each finished turn tells the page what to carry next. After a turn that passes
  a Topic, the page keeps showing that Topic and sends no more turns there; the Learner chooses where
  to go. The test tools send nothing and are not checked.
- **No restarts.** Idle time never starts a Session; the idle setting stays only to tell a break,
  which draws "Picking up where you left off" (see "Coming back" below).
  After a deploy that changes the instructions or tools, the next new turn (never a resume) refreezes
  the instructions, tools, model and effort inside the same Session and records where
  (`refrozen_at_seq`). From then on the thinking blocks of earlier messages are left out of every
  request; their text, tool calls and results replay unchanged. The "The Tutor was updated…" notice
  is gone.
- **What the model is sent.** This Session's compaction summary (if any) and its messages since:
  only this Topic's. The "Where the Learner stands" block (code's summary and the Learner Profile)
  opens the Session and is sent again as a new message, with the Course Navigator context, whenever
  it changes; nothing already sent is rebuilt. The Tutor's instructions say to go by the latest
  Where the Learner stands block.
- **Refused turns.** A refused turn stays on screen, but every row of it (the Learner's message,
  context and any kept loop steps) is left out of later requests, worked out from the turn's place in
  the Session. The refusal reads "The Tutor declined to answer that message. Nothing was changed, and
  your place is the same. Try asking another way."
- **Quiz results** reach only their own Topic's Session; a result waits until the Learner is back in
  that Topic.
- **Older Sessions.** Every Session from before this change is Older: never continued and never
  shown in the Study Workspace, still readable in Past Sessions. Each Topic starts a fresh Session,
  and its steps, passes and any open quiz carry on.

**Scenario.** The Learner studies Present value, chooses Bond prices on the Course Map, asks "what
were we just talking about?", and the Tutor, sent only Bond prices' messages, has nothing of the
lottery to repeat. Back in Present value the thread is exactly as left. That night a deploy changes
the Tutor's instructions; next morning the Learner's message goes into the same Present value
Session, which is refrozen on the new instructions, and the request carries yesterday's replies
without their thinking blocks. A second tab still showing Bond prices gets the reload message.

**Trade-off.** A Session can now last weeks, so compaction rather than an idle window keeps what the
model is sent in check. Leaving thinking out after a refreeze costs one full prompt-cache write per
Session after such a deploy, and the Tutor loses its earlier reasoning (not its words). Leaving a
refused turn out whole means the Tutor never sees the Learner's declined message, even the harmless
parts of it.

**How it is tested.** At the Tutor Turn seam with the scripted client and in-memory Postgres
(`topic-sessions.test.ts`): A → B → A shows only each Topic's messages and B's request holds nothing
of A; the stale tab; the stands block re-sent only when it changes; refused turns left out whole;
the refreeze with earlier thinking left out and later thinking replayed; Older Sessions never
continued; the every-Topic-passed Session; quiz results reaching only their own Topic; and the B7
regression (a pass, A → B → A, a deploy, a reload, and the pass still there). The live behaviour
run asks "what were we just talking about?" in a fresh Topic and checks by code that the answer names
nothing of the other Topic.

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
outline to the Topic and to `courseOverview`. The Course Map groups Foundation Topics under their
Subject in collapsible sections, and `docs/course-map.md` lists it beside each Topic.

**Scenario.** The owner adds a Foundation Topic on swaps and forgets the Subject: `npm run course:check`
fails with `Foundation Topic "der-swaps" has no Subject`. They add `subject: "Derivatives"`, and the
Course Map shows the Topic in the Derivatives section.

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
`insight` and an `explore` block, both or neither, checked as described under "The explore step". A Topic may also hold its
teaching (Skills, a Concept card per Check, Quick tries, question templates and Known mistakes), checked by the lesson lint, as
described under "Topic files carry the teaching". It runs as part of `npm run check`,
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
the next legal step and any unmet prerequisites (plus the numbered steps, the Next rules and What
comes next, below). It is pure: no model, no database, no clock.
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

### Step numbering, Next and What comes next (spec #119)

**What it does.** Three more pure answers, so dividers, the progress strip, the Next chip and
Home's button all come from one tested place. The Next chip and the Learner's Next use `nextOffer`
and `takeNext` (see "The Learner's Next and code-written turns"); the Topic bar's strip draws
`stepSequence` (see "The Topic bar and the Topic Start card").

- `stepSequence` lists a Topic's Teaching Steps for this Learner's record and numbers them
  "Step k of N · <step>" with plain-word names (Story, Concept, Explore, Your turn, Check,
  Reveal, Principle). Explore appears once, only with an Insight, after the Concept of the Check
  that tests it, or just before Reveal for a Learner who passed that Check before the Insight
  existed. A passed Topic with a Due Check lists only the due steps. It also groups the steps by
  Check for the strip and marks the Learner's place.
- `nextOffer` says which Next the Learner may take: the step that follows; **Complete this Topic**
  at Principle; **Just tell me** at Explore until the Insight is found or told; nothing while a
  Check is open (a miss keeps it open). The caller says whether the current step has begun: a step
  reached after a quiz pass has not, so Next names that step and `takeNext` teaches it without
  moving on. `takeNext` checks the press against the offer and refuses anything past a Check
  without a saved pass or past an unsettled Explore.
- `whatComesNext` gives, in order: the Topic the Learner chose and hasn't passed ("Resume:
  <title>"); else a Due Check ("New in <Topic>: Check N", or "New in <Topic>: Explore"); else the
  next unpassed Topic on the default path ("Next Topic: <title>").

**Scenario.** In Percent (four Checks, no Insight) the sequence has fifteen steps, so the first Next
draws "Step 2 of 15 · Concept". The Learner passes the first quiz; the Concept of Check 2 has not
begun, so the chip reads "Next: Concept" and pressing it teaches that Concept without skipping it.

**Trade-off.** Progress does not record when a late Explore was taken, so once it is finished the
sequence lists it in its usual place again; and a Due Check run renumbers once its Explore is done.
Both only touch steps already finished. Whether a step has begun is left to the caller, which keeps
the module free of Session state but means each caller must pass it honestly.

## Learner Memory (`src/learner/memory.ts`)

**What it does.** Saves the Learner's place in three new tables: `learner_state` (the current
Topic), `topic_progress` (each started Topic's Teaching Step, whether the reveal has been shown,
and whether it is passed) and `check_results` (every Check result, kept even if the Check is
later removed). Progress is saved when a Topic starts and at every Teaching Step change. It also
turns the records into a short plain-text summary. Every record belongs to one Learner (see "The
current Learner" above).

Since the conversation Check landed (below), a Check result also keeps the Tutor's reasons as
evidence and the model that taught it, and a fourth table, `misconceptions`, keeps what the Tutor
noticed the Learner getting wrong.

**Scenario.** The Learner reaches the reveal, closes the laptop and comes back the next day.
The workspace shows "Present value (foundation Stage). Teaching Step: reveal. The reveal has
been shown." with the Next chip under the last reply, read straight from SQL.

**Trade-off.** Hand-written tables and a summary in code instead of a memory framework: less to
learn and nothing hidden, but each new kind of memory is new code.

## Teaching Steps in the Tutor Turn (`src/tutor/turn.ts`, `src/tutor/context.ts`)

**What it does.** Before each Learner message, code appends a "Course Navigator" context
message whenever the Learner's place changed: the Topic, the Teaching Step, the Case's story,
and only the material for that step (the concept, the current Check, the principle). The Case's
outcome is included only from the reveal step on, so hindsight is withheld by code. The Tutor has
a tool, `finish_teaching_step`; when it calls it, code asks the Navigator, saves the move if it
is legal and replies with the next step's material, or replies with an error if it isn't.

**Sessions.** Opening the workspace makes no model call: the page reads the
current Topic's Session from SQL and shows the Next chip under its last reply. Each Topic has its own Session (see
"One Session per Topic"), which a break never ends. A Session opens with the Where the Learner
stands block and the context as the first block of its first message. (Claude's API rejects a
"system" message in first place, which a live run showed; later context messages can be "system"
messages.) Older Sessions stay readable at `/sessions`.

**Scenario.** The Learner returns after a weekend. The page shows the Topic's
thread at no cost, ending in a "Picking up where you left off" divider (see "Coming back") with the
Next chip under it. They press Next or write to the Tutor; the same Session carries on, a new Where the
Learner stands block tells the Tutor anything that changed, and teaching picks up at the same Teaching Step.

**Trade-off.** Context goes in as appended messages rather than edits to the instructions, which
keeps Claude's thinking valid but repeats some text in long Sessions.

## Widgets (OpenUI: `src/widgets/`, `src/app/widget-host.tsx`, `src/app/widget-view.tsx`, `src/app/widget-panel.tsx`, ADR 0003)

**What it does.** Widgets are how the Study Workspace shows things. The Tutor builds one beside the
conversation whenever a picture, a chart, a table or something to play with makes an idea clearer,
and always when the Learner asks for a chart, graph, table, picture or comparison. It builds at most
one per reply, so each is rich: a slider or two, a chart, and a small table or callout. It writes the
Widget as a short block in OpenUI's small UI language inside its reply, and the browser draws it with
OpenUI's free, open-source renderer from two sets of parts:
- **OpenUI's ready-made kit** (`@openuidev/react-ui`, by the makers of the renderer): charts (bar,
  line, area, pie and more), tables, tabs, callouts, tags, selects and switches, laid out in stacks.
  Parts that could mislead, or that a Widget has no use for, are left out: images (the model could
  invent links), code blocks and the kit's Markdown renderer (they would show typed formulas, which
  ADR 0002 rules out), forms, inputs, date pickers, buttons, modals and carousels.
- **Our own parts**, each backed by tested code: `Widget` (the frame, with **Reset** when it has a
  slider), `Slider` (one of the Learner's assumptions, with a number box and −/+ buttons for exact
  values; it takes the kit slider's place under the same name, so the "Your assumption" tag and
  saved slider settings keep working; see "Exact slider values" below), `AnnuityChart` (yearly payments and what
  each is worth today), `HistoryChart` (one Case Data dataset over its dates), `Calculator`,
  `FormulaCard` and Guided Tasks.

The instructions that teach the Tutor this language are generated once from those parts, with our
own notes and worked examples (`npm run widgets:freeze`), checked in, and frozen into each Session
with the rest of the Tutor's instructions, so they never change under a running conversation. The
freeze also writes the parts' schema alone (`frozen-schema.generated.json`) for the widget check,
because the browser runs that check too and has no use for the instructions' 32 KB of text.
OpenUI's stock instructions contradict our rules in several places: send only the changed lines,
answer a question with text only, write data with Mutations, forms and refresh buttons, type a tool's
data into the widget by hand, and use realistic mock data when no tool fits. Code cuts or rewrites
those passages (`withoutContradictions` in `library.tsx`), and the freeze fails loudly if OpenUI ever
rewords one.

**No Thesys key needed.** OpenUI's makers, Thesys, also sell a hosted model, their Gateway, that
writes the interface itself. `THESYS_API_KEY` is only for that service, and this app does not use
it: the renderer needs no key. The Gateway would replace Claude as the Tutor, add a paid service and
give up the rule below that numbers come from our code (ADR 0003).

**Numbers come from code, not the model.** The Tutor draws the blueprint ("a line chart of loan cost
by year, with the rate on a slider"); our code supplies the bricks, the numbers. Real figures reach a
Widget only two ways: through our code-backed parts (`HistoryChart` takes a Case Data reference,
written `caseId/datasetId`; `AnnuityChart`, `Calculator` and `FormulaCard` take the inputs of a
tested formula), or through the Widget tools (below), which a kit chart or table calls for its rows.
The formulas are the tested code in `src/finance/`, and Case Data comes from `/api/case-data/<case>`
under the as-of rule (see Case Data below), or on Home from the page itself (see the shared Case Data cache). Everything the Learner sets carries a teal (`--you`
tokens) "Your assumption" tag; everything drawn from Case Data carries an amber "Sourced" tag and a
link to its source, so the two never blend. For example, the Tutor tells the Mega Millions story and
adds a discount-rate slider beside an annuity chart of the 30 payments. The Learner drags the rate
from 3% to 7%: the bars and the present value ($930 million to $535 million) redraw instantly in the
browser, and no request goes to Claude. The cash option bar beside them comes from the sourced
figure, not from anything the Tutor typed.

**Illustrations.** Some ideas have no real numbers to show, such as the difference between percent
and percentage points. For those the Tutor may type made-up numbers into a chart or table, but only
in a plainly hypothetical example whose title starts "Illustration:". Before the reveal its numbers
must never match the Case's real outcome, and its arithmetic is written as an expression the Widget
works out, such as `(5.5 - 5) * 100` basis points, never as a result the Tutor worked out itself.
Code labels it as well: a kit chart or table that calls no Widget tool and uses none of our
code-backed parts gets the eyebrow "Illustration", so made-up numbers are never mistaken for real
ones.

**Scenarios.**
- *A live chart.* The Learner asks "graph how 1 lakh grows at my rate". The panel shows a slider for
  the yearly return and an area chart of the value over 30 years, with real axes and hover values.
  Dragging the slider redraws the chart at once in the browser, with no model call. Every number
  comes from our tested `future_value` formula, through the `calculate_range` tool.
- *Real history in two views.* The Learner asks "chart the Sensex milestones". The panel shows two
  tabs, "Chart" (a line chart) and "Table" (dates and closes), over a thin amber "Sourced" strip with
  the ⓘ credit. The values are Case Data, fetched from the server under the as-of rule, so before
  the reveal nothing after the Case's as-of date, 31 March 1992, appears.
  When the reveal lifts, the newly shown part of the line wipes in from left to right over about
  700 ms (a clip on just that stretch); under reduced motion it simply appears.
- *A picture of an idea.* The Learner asks "draw me the difference between percent and percentage
  points". The Tutor builds a clearly made-up example, a rate moving from 5% to 5.5%, as bars plus a
  callout whose numbers the Widget works out: 50 basis points, and a rise of 10% of the old rate. The
  card's eyebrow says Illustration.

**Layout.** The conversation runs on assistant-ui's external-store runtime: our code owns the
messages and streaming, assistant-ui draws them (`src/app/thread.tsx` holds the message look, shared
with the old Session page). As a reply streams in, code splits it into prose and widget blocks. The
prose stays on the left with an "Open: <widget title> →" chip where the widget belongs; widgets are never drawn
inside the conversation. Old Sessions rebuild their widgets from the stored text, with controls back
at their starting values.

**The Widget panel (`src/app/widget-panel.tsx`, issue #47).** The right column is one panel, fixed to
the column's height and scrolling inside itself (see "The fixed two-column layout and the Check tab").
While a quiz is open its "Check k of N" tab comes first in the row and is selected. It shows one card: an eyebrow naming
the concept, then the widget with its title but without its own border (the card is the only frame).
The eyebrow is worked out by code from the widget's parts, read with OpenUI's parser (`widgetParts`
in `check.ts`, which looks through nested layouts and also lists the tools and Case Data references
the widget uses): an AnnuityChart or the `annuity_schedule` tool is "Present value", a HistoryChart or
`case_data` "Case Data", a Calculator, `calculate` or `calculate_range` "Calculator", a FormulaCard
"Formula", a kit chart or table with no tool and none of our code-backed parts "Illustration", and
anything else the current Topic's title. A finished widget the check refuses shows only the fallback
note, so its eyebrow is the Topic's title too, never "Illustration". The newest widget shows on its own, including when a new
turn brings one. With two or more widgets (or a quiz open) a **pager** header (`widget-pager.tsx`) sits above the card: ‹ and › as 32px buttons, "3 of 11 · <title>" in the middle, and an "All" button that opens a listbox. Each row of the listbox shows the eyebrow, the title and "from message N", with the current one checked; the Check tab and the Explore item (still `explore-chip`, hidden below the laptop width) are rows too. While the panel has focus, ← and → page (a slider or field keeps its own arrows), and Escape closes the listbox and puts focus back on "All". Picking a widget, from the pager or from a chip in the chat, crossfades it in over 150ms with a 4px rise, plays a ring pulse around the card for 600ms (no more border flash), scrolls the panel back to the top, and holds the card at the last widget's height for 400ms so the column below does not jump. The chip in the chat is a 36px card-link with the widget's title and three states: "View widget →", "Showing" (filled brand) and "Drawing…" (a shimmer); pressing the one already showing scrolls to the top and pulses again. As soon as a widget's fence opens, the card shows a skeleton with "Drawing…" until the widget is written, then the widget replaces it. Before any widget, a dashed
box says "Widgets for this Topic will appear here." Scenario: the Learner has a rate chart from earlier
and a loan calculator from this reply; the calculator shows, "2 of 2 · What a home loan costs", eyebrow "Calculator"; they press ‹ and the chart fades in under "Case Data", "1 of 2". With eleven widgets open the
header is still one line; "All" lists them with where each came from. Trade-off: one widget at a
time keeps the panel calm and the sliders roomy, but comparing two widgets means switching between
them; and a pager hides the other widgets' names behind one more press where a strip of tabs showed a few at once.

**The Sourced strip and readable Case Data charts.** Under a Widget that calls `case_data`, one thin
amber line per dataset shows the Sourced tag, the dataset's label and its ⓘ credit; before the reveal
it adds "Data after <as-of date> is withheld until the reveal." The strip, the Widget's Queries, its
charts and its Formula Cards all read through the page's shared Case Data cache (see "The shared Case
Data cache" below), so a page with a chart and a table of the Sensex asks the server for that Case once. A dataset that is missing or withheld gets no
line in the strip: the Widget's own line under the chart already says its data could not be loaded
(see "When a widget is broken"), so the Learner reads it once. `HistoryChart` keeps its own amber
frame, credit and withheld note, and it is easier to read: numbers on the left axis (lowest, middle,
highest) and dates along the bottom (first, middle, last), bigger points that keep their size on screen
however narrow the panel (an 8px dot and a 7px ring round the point read), a readout ("<date>:
<value>") when a point is hovered, tapped or reached with the keyboard (a line of more than 30 points
is one stop, read with the arrow keys), and each value printed above its point when there are 12
points or fewer. It is still plain SVG, so it draws on the server and in tests too. The annuity chart
(`AnnuityChart`, drawn by `annuity-plot.tsx`) reads the same way: dollars up the side (round-number
ticks that only grow, under "Dollars per payment"), payments along the bottom (first, middle, last, under
"Payment number (the first is paid now)"), and a readout such as "Payment 30: $95.2 million paid, worth
$40.4 million today" when a bar is hovered, tapped or read with the arrow keys (the bars are one slider; see "The plot kit"). Kit charts (OpenUI's own) are
labelled through the Tutor's instructions and the server's Widget check, not here.

**The shared Case Data cache (`src/widgets/case-data-cache.ts`, `case-data-provider.tsx`).** Each page
(the Study Workspace, an old Session, Notes, and Home, which fills it differently: see below) holds one cache of Case Data, and every chart, Formula Card,
Widget tool and Sourced strip on it reads through it (`useCaseLoad`). What it holds: one answer from
`/api/case-data/<case>` per Case and reveal state. The page reads on the server which Cases the Learner
has seen revealed (`revealedCases`) and passes them in, so an answer fetched before a reveal is never
served after it, nor the other way. After every Tutor turn (a turn can open the
reveal) the cache is **stale while revalidating**: it keeps every entry on screen, asks the server again in the
background, and replaces an entry only if its data changed, telling readers only then. When the revealed list changes,
or something clears the cache outright, Widgets already on the page read again; a failed load is forgotten so the
next read retries, and a failed revalidation keeps what is held. Scenario: at the Fed Topic's explore step the panel shows a
history chart of the funds rate and a Formula Card reading its latest point, while the explore Widget's
chart compares against the same Case; the page makes one request, not three, and nothing flashes as
each part loads. The Learner asks a question; as the turn ends the cache asks again, the series is the same, and the chart
never shows "Fetching sourced data…". The Learner presses Next to the reveal; the revalidation or the new revealed list
brings the full series, and a Widget the Tutor draws after the reveal shows February 1994 onwards.
Trade-off: data stays in the browser for the whole page, so a change made elsewhere (another device
reaching the reveal) shows only after the next turn or a reload; and each turn still costs one small request per Case on the
page, which buys never having to work out in the browser whether a turn opened a reveal, without the flash a wholesale clear caused.

Home is the one page that fills the cache another way. Its `CaseDataProvider` is given `cases`, Case
Data already read on the server under the signed-out as-of rule; the cache then answers only from
those, never calls `/api/case-data`, never clears and ignores reveal state. Scenario: a visitor
without a passcode drags Home's annuity Widget, and its chart and Sourced strip read the cash option
from the page; the route, which would answer 401, is never asked. Trade-off: that data is only as
fresh as the server's day-long cache (see Home's live annuity Widget), and a Case not passed in reads
as missing.

**Look and theme (`src/widgets/genui-theme.tsx`, `src/app/globals.css`).** The kit's styles come from
OpenUI's layered stylesheet, placed in a CSS layer (`openui`) above Tailwind's base layer and below
its utilities, so our own classes still win. `GenuiTheme` wraps every Widget and maps the kit's theme
onto our design tokens: the navy brand for accents, our ink and muted colours for text, our borders,
plain or field-coloured surfaces, the page's own font, and our chart colours, which the kit hands out
from the middle of the list (one series is the brand colour; two are the learner's accent and the sourced-history
accent; three are accent, brand and sourced). It follows the page's theme (`data-theme` on `<html>`, read by
`useHtmlTheme`, which also redraws the charts when the theme changes), never the computer's own setting, so a
Widget always matches the rest of the page: the kit's `mode` is that theme's kind (light or dark), and the kit's
last fixed black-and-white colours (highlights, the inverted fill, the chat bubble) are mapped to ink and the
bubble token. Charts are SVG, whose colours cannot always read CSS variables, so each of the four themes
(Light, Paper, Midnight, Forest) has its own list of fixed hex values, copied from that theme's block in
`globals.css`; Light's is unchanged, and a test fails if a hex drifts from the tokens file. *Scenario.* A Mac in
Dark Mode with the app on Paper draws a cream card with Paper's blue and ochre bars, not the Mac's dark kit.
*Trade-off.* The hex lists are a second copy of some colours, kept honest by the test, because SVG attributes
cannot read a CSS variable on every browser. Tabs open on their first
view and stay on the one the Learner picks: the browser draws Widgets with the same library and
schema, but its own Tabs (`drawingLibrary` in `src/app/widget-view.tsx`), because OpenUI's jump to
whichever tab's content last grew, so a chart-and-table Widget opened on its table as soon as the
Query's rows arrived (browser check, 3 Nov 2026), and drew no tab at all on the server.

**Smaller pages: the OpenUI trim (`next.config.ts`, `postcss.config.mjs`, `src/widgets/openui-stubs/`, the
`@import` lines in `globals.css`, UX audit 10.3).**
*What it does.* OpenUI ships as one 960 KB file that holds its chat shell, its agent screen and every part, and a
bundler cannot leave any of it out, because the top-level calls that build each part look like they could have side
effects. Three changes make the browser download only what a Widget can draw. (1) A small build-time loader
(`pure-loader.cjs`) marks those calls as pure and removes the chat shell's attachments, so the bundler drops the chat
shell. (2) The code highlighter (780 KB with its grammars), the date picker and the table engine are replaced by
empty stand-ins in `openui-stubs/`, because only parts the Widget library dropped (CodeBlock, DatePicker,
EditableTable) call them. (3) `globals.css` imports the stylesheets of the kept parts one by one instead of the
whole 363 KB kit, and `postcss.config.mjs` removes the kit's own dark colours (nothing here uses them: GenuiTheme and
the `:root` block in `globals.css` set every colour) and the rules for charts the library does not draw.
*Scenario.* A Learner opens the Study Workspace on a phone. The page used to fetch a 2.2 MB script and a 434 KB
stylesheet before the Widget could draw; now the largest script is 1.18 MB and the stylesheet 141 KB, and the
Widget looks exactly the same. `openui-css.test.tsx` draws one of every kept part and fails if a class it draws has
lost its stylesheet, so adding a part to the library cannot silently leave it unstyled.
*Trade-off.* We keep OpenUI's library object and remove around it, because the kit's parts and their schemas are
only built together, and the package's per-file build is broken in 0.18.1 (a missing icon file). So the largest
script is still over 1 MB and the stylesheet over 120 KB (our own CSS is 66 KB of it). The loader and stand-ins match
this package version's text: after an OpenUI upgrade, run `npm run build` and read the sizes, and `openui-trim.test.ts`
fails if the loader's patterns stop matching.
The CSS trim itself lives in `openui-stubs/trim-openui.cjs` and `postcss.config.mjs` lists every plugin by path with an options object, the only form both Turbopack and `next dev --webpack` accept (`postcss-config.test.ts` guards it).

**When a widget is broken.** When a reply finishes, the server checks each widget with OpenUI's
parser and our own rules (`widgetProblems` in `check.ts`): a part or name that does not exist, a
Formula Card input or Guided Task bound to no slider (looked for anywhere in the Widget, not only in
its top row), and for the tools: a tool name that does not exist, any `Mutation()` (widgets only
read), written-out arguments that fail the tool's own checks, a calculator we do not have or an input
it does not take, or a malformed Case Data reference. Arguments that take a slider's value are
checked for their written-out parts only. If a widget fails, code sends the Tutor one correction
request listing the problems, and the corrected widget replaces the broken one on screen (a Widget a written-ahead
Widget covers is left out instead; see "Written-ahead Widgets and open_widget"). History keeps both, unchanged. If the
correction is broken too, the browser shows a plain "This widget could not be drawn" note and the
lesson carries on. A widget that crashes while drawing is caught the same way. A tool that cannot run
(a withheld dataset, an input a calculator does not take) leaves its chart empty, with a muted line
under the Widget: "This chart's data could not be loaded: …". There is one line per Query, and it goes
as soon as that Query's next call works: the slider moves back, or a Select picks a dataset the server
has. The browser does not say which Query a call answers, so code matches each call to its Query by
the arguments the Widget writes out (`failedQueries` in `widget-view.tsx`). A correction reply that is cut off by
the length limit or declined is handled like any other reply: the Learner gets Finish this reply or the
refusal message, and a tool call it was cut off in is never run.

**Trade-off.** We gain rich, interactive pictures for almost any idea, with honest numbers. We give
up a larger frozen instruction prompt (cached, so it adds little to each turn's cost), a heavier
widget bundle (the kit ships as one bundle), and Illustration numbers that are labelled but not
computed by our code. Measured on 3 November 2026, the kit roughly doubles what the Study page loads
first: 998 kB of JavaScript (gzipped), up from 487 kB, and 47 kB of CSS, up from 7 kB, because the
kit's whole library and stylesheet come with the page, the parts we leave out included. Loading the
widget drawing only when the first widget appears, or building the library from the kit's kept parts
alone, would win most of that back. Changing the frozen instructions means each Session is refrozen at its next new turn after
a deploy. Widgets inside the prose (OpenUI's inline mode) keep one simple reply format, stream
naturally and work with Claude's citations (see Citations below), but the model can write invalid
code, which is why the server check and one correction turn exist. The fallback, if OpenUI ever has
to go, is one plain tool per widget.

**Measured (go or no-go, real headless Chrome).** All eight criteria held: streaming through Tool
Runner and assistant-ui, slider redraw with zero model calls, formulas from tested code, a chart
drawing from a referenced dataset, the left and right split while streaming, invalid output
contained, dark and light modes, and no 400 errors from the frozen instructions (after moving the
Session's opening context out of a first-place "system" message). The live Tutor wrote only valid
widgets, so the broken-widget path was exercised with scripted replies in the browser and with
tests on the server. These runs were against the app on a laptop with the real API and database;
the production check waits on a deploy. OpenUI stays.

**The live probe (`src/widgets/genui.live.ts`, `genui-asks.ts`, `npm run widgets:live`).** Eight
asks a Learner might make for a chart, graph, table or picture, across four Topics, go through the
real Tutor Turn on production's settings (Opus 5.5, medium effort), each on a fresh throwaway
database with its Topic's Case Data, so nothing touches the real learning history. One is the exact
ask that failed on 2 November 2026: after the story of the 1994 Fed Topic (then reached with the old
Continue, now with the opener the page starts), "can you generate a chart to explain it", which got "I don't have a chart type that fits this idea" and a table. Code
reads each reply as the browser would, a correction turn included, and the run passes when at least
7 of the 8 chart replies hold a complete Widget, no Widget fails the server check, and no Widget
without tools or our code-backed parts types chart numbers unless its title starts "Illustration:".
The report (each ask, its Topic and Teaching Step, the reply, the Widget code, problems, tools and
cost) goes to the evidence folder. A run costs a dollar or two by estimate and starts no new ask once
`WIDGETS_LIVE_BUDGET_USD` (default $4) is spent; `ONLY=id,id` runs some asks again. Like the behaviour
tests, it is not part of `npm run check`, because it spends money and needs the network.

### Widget rules for the Tutor, and updating in place (`widgetRuleProblems`, `newReplyWidgetProblems`, `openWidgetsIn` in `check.ts`; `openWidgetsNote` in `src/tutor/context.ts`; `updatedInPlace` in `widget-panel.tsx`; spec #119, ticket #146)

**What it does.** Three things keep the Tutor's Widgets few, usable and honest.

- *Updating in place.* Code's context message (sent whenever it changes) starts with the titles of the Widgets open in
  the panel (the Session's earlier replies, one per title) and says to change one by writing it again
  in full under exactly the same title. In the browser, a Widget with the title of an earlier one takes
  that one's tab instead of adding a tab, shows the newest drawing, and the older reply's
  "Open: <title> →" chip opens it too. A Topic Session opened read-only (Past Sessions, a passed Course Map row) draws
  its Widgets the same way (`OldSession` with `inPlace`); an Older session draws them as before, one tab each.
- *Code-backed Widget rules.* Beyond "can it be drawn", the server holds the reply being written to
  three rules, and a break feeds the same one correction turn: a Widget with a slider has at least one
  Guided Task; a kit chart with axes (line, area, bar, horizontal bar, scatter) has both axis labels;
  and a new Widget (one not reusing an open title) does not draw the same Case Data, through
  `Query("case_data")` or a HistoryChart, as an open Widget or an earlier one in the same reply. The
  correction message names the widgets it flags ("- Widget 2: …"), and the browser, a reload and the
  turn stream swap the corrected block into exactly those places, so a Widget that drew but broke a
  rule is replaced too.
- *The Widget instructions* give the Slider's argument order (min, max, step), say any percent slider
  moves in 0.01 steps, ask for only numbers a Widget can show (inside min to max and on a step), ask for
  Guided Tasks on every slider Widget, axis labels on every kit chart, and updates by title. Every rate
  example uses 0.01 steps, and every example passes the rules (a test checks this). The frozen copy is
  regenerated with `npm run widgets:freeze`.

**Scenario.** The Tutor has drawn "Long-term interest rates" (a HistoryChart of the 30-year Treasury).
The Learner asks for it as a line. If the Tutor draws "Rates around the draw" from the same dataset,
the check sends it back once: "draws the same Case Data … as the open Widget "Long-term interest
rates". Update that Widget instead". It redraws under the old title, and the panel keeps one tab, now
showing the line. A later rate Widget with a slider but no Guided Task, or a bar chart with no axis
labels, is sent back the same way.

**Trade-off.** The rules run only on the reply being written, never on stored Widgets, so Older
sessions and Notes draw exactly as before, even where an old Widget breaks a rule; the price is that
old Sessions can still show near-copies. Update in place goes by exact title, which is simple and
visible to the Tutor, but a Tutor that renames a Widget while changing it makes a new tab (the
same-Case-Data rule catches the common case). The Old session page keeps every Widget as drawn. The
rule for written-ahead Widgets' parts is in the next section.

### Written-ahead Widgets and open_widget (`widgets` in `course/topics/*.yaml`, `src/course/written-ahead.ts`, `written-ahead-check.ts`, `open_widget` in `src/tutor/tools.ts`, `src/tutor/written-ahead.ts`, `writtenAheadPartProblems` in `src/widgets/check.ts`, spec #119, ticket #160)

**What it does.** A Topic file can list Widgets written ahead for it (`widgets:`), each with an id, its OpenUI
code, the `parts` a Widget of the Tutor's own may not use in that Topic because this one covers them (one of our
parts such as `AnnuityChart`, a Widget tool such as `annuity_schedule`, or a calculator id such as `cagr`), and an
optional `revealTask`. The Tutor is told them in a "Written-ahead Widgets" line of code's context (title and id) and
opens one with a new tool, `open_widget`, by id. The call stores a Session item (`widget_opened`, with the id and
title) after the latest message and streams it, so an "Open: <title> →" chip stands where it was opened, the
Widget opens in the panel, and a reload draws both again from the stored item. The tool's result tells the Tutor
each slider's range, step and starting value and each Guided Task, so it asks only for numbers the Widget can show;
an id the Topic does not have is refused and stores nothing. The code is never stored: on each render the page (and
the old Session page) reads the shown Topic's written-ahead Widgets from the Topic file (`loadWrittenAhead`), and a
`revealTask` joins the Widget's Guided Tasks only once its Case's reveal has been shown, with the move its dataset
made across the Case's as-of date (the last value on or before it, the first after) read from Case Data under the
as-of rule. Before the reveal that value is withheld, so the task, and every number of it, is left out. A written-
ahead Widget's work is saved under its id (Widget state below), and once opened it is among the open Widgets whose sliders and ticks the Tutor sees with each Learner message (and whose Tell the Tutor what I found is accepted). The Tutor never draws its own version: on the reply
being written, the server check sends back a Widget of the Tutor's that uses a written-ahead Widget's parts, or
takes its title, through the one correction turn, naming the Widget to open ("call open_widget with id … and leave
this widget out of your reply"). Such a Widget is left out of the reply (on screen at once, on a reload and in a
replay), not replaced; anything else the correction names is replaced as before. The Topic Start card's You'll use
line lists the Topic's written-ahead Widget titles.

**The course check** (`writtenAheadCheckErrors`, run by `npm run course:check`) holds every written-ahead Widget
to: it can be drawn; each slider's default sits inside its range and on a step (0.01 for a percent slider); and each
Guided Task reads a slider, is not done at the start, and can be reached. A task is tried with the numbers it names
plus each slider's min, max and default (every combination over the sliders it reads), not every position, so
sliders in 0.01 steps stay checkable. A Widget with a reveal task is checked again with it added, its slider's min and
max standing in for the Case Data. The Topic file check also refuses a repeated id or title, a reveal task whose Case
or dataset the Topic does not have, and Case Data references outside the Topic's Cases.

**Percent's old "One rate change, said three ways"** (`rate-change-three-ways`) was the first written-ahead Widget:
two rate sliders, readouts in points, basis points and percent change (the Topic file's `rateChange` names the two
sliders, so code works the readouts out for the Tutor with the tested `rateChange` in `src/finance/rate-change.ts`),
three made-up Guided Tasks, and after the reveal a fourth from the `fed-funds-target` dataset. Percent's conversion
(spec #229, "Percent, converted" below) replaced it with `rate_move` presets, so no real Topic uses `rateChange` today.
The feature stays, and the tests that read it use the old Widget as a fixture (`src/test/old-percent-map.ts`).

**Scenario.** At present value's explore step code puts "What the annuity is worth today" (`annuity-worth-today`) in
the panel; later the Learner asks to see it again and the Tutor calls `open_widget` with that id, so its chip appears
under the Tutor's first sentence. If the Tutor draws an annuity chart of its own, the check sends it back, the Tutor
opens the written-ahead Widget instead, and the chart never reaches the screen. After the reveal the page draws the
Widget with the 30-year Treasury task and quick button; before it, nothing in the Widget mentions that yield.

**Trade-off.** Written-ahead Widgets are fixed text that cost no tokens and can be checked before they ship, but they
cannot adapt to a Learner the way a Tutor Widget can, and only Present value has one now (the annuity Widget,
ticket #161, which is also Present value's explore Widget). Reading the code from the Topic file on every render keeps the reveal task honest and lets a Topic
file fix reach old Sessions, but a Widget removed from a Topic file vanishes from Sessions that opened it (its chip
draws nothing). The parts rule goes by named parts, so a Tutor Widget that does the same sum another way (typed
expressions) is not caught. A written-ahead Widget has no Save to notes yet. A correction that only leaves Widgets
out drops the Tutor's prose in the correction reply, as every correction does.

### Widget recipes and show_widget: the Tutor chooses, code draws (`src/widgets/recipes/`, `src/widgets/shown-widget.ts`, `show_widget` in `src/tutor/tools.ts`, `ENGINE_INSTRUCTIONS` in `instructions.ts`, `frozenNow` in `session-log.ts`, `drawnWidgets` in `session-items.ts`, `widgetsIn` in `src/app/thread.tsx`, ADR 0005, UX audit ★.4, ★.5, ★.9)

**What it does.** A Widget recipe is a typed function, made with `defineRecipe`, that turns params into an OpenUI Lang
program. Its params schema (zod) has a title and three kinds of value: `inputs` (slider ranges and starting values,
and calculator or formula inputs our tested code works out), `refs` (Case Data references) and `facts` (typed numbers;
any of them puts "Illustration:" before the title). Each recipe also has an archetype, an information budget and
working examples. `RECIPES` in `recipes/index.ts` is the seeds (`history_case`, `grow_money`, `loan_cost`, `formula`,
built only from parts registered today) plus `set-a.ts` and `set-b.ts`, which the recipe lanes fill; a set's recipe
replaces a seed with the same id. The Tutor calls `show_widget({recipe, params})`. Like open_widget it runs through
`once`, so a repeat or a resume has no second effect. It parses the params, compiles them, refuses when the reply
already has a Widget (one per reply), checks every ref against the Case Data the as-of rule allows now, and runs the
Widget checks a written Widget gets (`widgetProblems`, `widgetRuleProblems` against the open Widgets,
`writtenAheadPartProblems` with the explore Widget held back). Any problem is a tool error, so the Tutor fixes it in
the same turn, never through the correction round-trip. On success it stores a `widget_shown` Session item with the
Widget's identity: the tool call's id, the recipe, the parsed params, the title, the code and `source: "recipe"`. The
item streams as the usual `item` event; the thread draws it where the call was (`widgetsIn`, `ItemMessage`) with the
code it carries, keyed by its title like any Widget the Tutor drew, so Widget state, readings and updates in place
work unchanged. `drawnWidgets` merges these items with reply fences in seq order wherever the server lists open
Widgets (the open-Widgets note, widget readings, Tell the Tutor what I found, the same-Case-Data rule).

**The switch.** The `widget_engine` setting (default "off") is read only by `frozenNow`. On, a new or refrozen Session
gets `ENGINE_INSTRUCTIONS` (the Tutor's rules, then the recipe signatures as JSON Schema instead of the Widget library
prompt, and "call show_widget first, then at most about 120 words") and `ENGINE_TOOLS` (today's plus show_widget). A
Session whose tools already include show_widget keeps them even when the setting is off. Off, the instructions and
tools are today's exactly, so the fingerprint, and every existing Session, is unchanged. The show_widget code is
always bound, so a resume never fails on a saved call.

**Scenario.** With the engine on, a Learner asks "what does ₹1,000 a month become?". The Tutor calls show_widget with
`grow_money` and `{calculator: "sip", held: {monthly: 1000, ratePercent: 10}, slider: {input: "years", …}}`. Code
compiles a Widget with one Years slider, the SIP Calculator and a Guided Task at 30 years, checks it, stores it and
the panel opens it at once; the Tutor's result lists the slider and task, and it writes two sentences about moving the
years. Had it asked for a slider from 40 to 30 years, it would have got "min must be below max" and called again.

**Recipe set B (`recipes/set-b.ts`, `recipes/b/`).** Five recipes on the new parts, plus two upgraded seeds.
`price_over_time` (a PriceTag or ShrinkingNote with years or the yearly rise on the slider), `predict_number` (a
Predict whose real figure is the first or last point of a Case Data series, so it waits while the data is withheld),
`chain` (a StepThrough; digits and formulas in the words are refused unless facts.numbers makes it an Illustration),
`rank` (a Rank: the Tutor lists the items from the low end to the high end with a reason each, and code scrambles them
and writes the answer key), and `fx_convert` (a Pictogram of what rupees buy as the rupees-per-dollar slider moves,
with the real rate from `reference/usd-inr` as outlines). `history_case` now takes a log axis or a DrawTheLine, and
`formula` now says plainly which Formula Card symbol is missing, repeated or unknown. Scenario: the Tutor asks for
`rank` with four ways to hold money; the Learner gets them mixed up and drags them into order, and code checks it. The
trade-off is that the Tutor chooses among fixed shapes: a Widget that needs two controls does not fit these recipes.

**Trade-off.** Code draws a designed, tested Widget in milliseconds, but only the ideas a recipe covers: with the
engine on there is no freeform Widget until compose_widget arrives, so the rest is taught in words. The instructions
are about 16.8K characters instead of 44.3K (tools 10.9K instead of 10.1K): roughly 7K tokens instead of 13.6K before
any history, estimated at four characters a token. "show_widget before prose" is asked for, not enforced. Save to notes
keeps a shown Widget (see "Save to notes keeps a shown Widget" below).

### Recipe set A: seven recipes on the new parts (`src/widgets/recipes/set-a.ts`, `recipes/a/`; UX audit ★.5, ★.7)

**What it does.** Seven recipes, each one control, at most three numbers, one picture and almost no words: `buying_power`
(a Pictogram of gold bars, vada pavs or chai for an amount on a slider; the price is a sourced series such as
`reference/gold-inr-10g`, newest point against the oldest, or a made-up price in `facts`, which makes it an Illustration),
`grow_money` (the savings calculators drawn as a MoneyStack that splits what you put in from what it earned),
`loan_cost` (the EMI as a Stat above a MoneyStack of loan against interest), `compare_two` (a Versus of two calculators'
first results, one shared input on a slider), `breakeven_hunt` (a Breakeven meter: the Learner slides until the curve of one
calculator meets the target another calculator works out), `percent_points` (a 100-square Waffle for a rate, the old rate
outlined) and `quick_check` (one to three QuickChecks and a score). `grow_money` and `loan_cost` replace the seeds of the
same id. Every params object is strict, so an extra number is refused rather than dropped; only `facts` may hold a number
the code did not work out. Each recipe's schema runs the calculators at the slider's start, min and max, so a Widget
never shows a calculator error; `breakeven_hunt` also refuses a range the curve never crosses the target in.

**Scenario.** A Learner asks "should I take a 10 or a 20 year loan?". The Tutor calls `compare_two` with the `emi`
calculator on both sides (10 years, 20 years), the rate on the slider and `better: "lower"`. The Widget is a slider
and one Versus bar pair, with a Guided Task to move the rate; it passes the Widget check with no budget warning. Had
the Tutor put a rupee price of its own in `inputs`, the recipe would have refused it and asked for `facts`.

**Trade-off.** Narrow on purpose: a Widget outside these seven shapes needs the freeform route. Sides of `compare_two`
and the target of `breakeven_hunt` use a calculator's first result only, so a calculator whose headline is not the
number you want cannot be compared yet. A sourced `buying_power` price assumes the series and the amount share a
currency, which the recipe cannot check.

### The rate-move recipe and the RateMove part: the one rate Widget, in show and practice modes (`src/widgets/recipes/set-tutor.ts`, `src/widgets/primitives/wave2/rate-move.tsx`, `rate-move-marking.ts`, `rateMoveLines` in `src/finance/rate-change.ts`; spec #229, ticket #234)

**What it does.** One recipe, `rate_move`, in its own set (`SET_TUTOR`) so it never touches sets A and B. It takes two
rates, `old` and `new` (in percent, 0 to 20, steps of 0.01), and a `mode`, and in both modes it draws one part made for
it, `RateMove(oldRate, newRate, mode?)`. The part draws a number line with an arrow, arrowhead and all, from the old
rate to the new one, labelled "Old 4%" and "New 5%" (percent only, never a currency). Under it are three worked lines,
each labelled: points (new minus old), basis points (points times 100) and percent of the old rate. The lines are
words, never typed sums (ADR 0002): "5.2% minus 5% is 0.2 points", "0.2 points times 100 is 20 bp", "0.2 divided by the
old 5%, times 100, is 4%". A fall says "a fall of", and an old rate of 0% says the percent change has no value. The
part calls the tested `rateMoveLines` in the browser, so the words on screen are the tested words.

In **show** mode (the default) the recipe binds the part to two sliders, `$new` in view and `$old` under "More settings",
so the arrow and the lines follow the Learner's play, with two Guided Tasks. In **practice** mode the recipe gives the
part the two numbers and no sliders. The part asks "By how many basis points?" in one typed box. The lines are not on
the page at all until an answer is marked: there is no Next or any other way past the question. `markMove` marks the
answer with T02's exact arithmetic (`parseAnswer`, and `matchesAnswer`, which uses `exactEquals`), in whole basis points
for a move of any size: "20", "20bp" and "20 bp" are read the same, and a fall may be typed as its size, with a minus
sign or as "a fall of 30". Text that is not one number is not marked. Once marked (right or wrong, with the right
answer said), the three lines show, and two sliders appear for play. They are the part's own, so they move the arrow and
the lines but never the marked question or its mark. The numbers are inputs, not `facts`, so the Widget is never an
Illustration.

**Scenario.** At Percent's Concept step the Tutor calls `show_widget` with `rate_move`, `old: 4`, `new: 5`. The panel
shows the arrow from 4% to 5% and "5% minus 4% is 1 point", "1 point times 100 is 100 bp" and "1 divided by the old
4%, times 100, is 25%". The Learner drags the new rate to 3.5%: the arrow turns round and the lines say "a fall of 0.5
points", with no model call. Later the Tutor opens the recipe at 2% to 4.5% with `mode: "practice"`. The Learner types
"2.5", sees "Not quite. The move is 250 bp. 2.5 is the move in points; times 100 gives basis points.", and the three
lines appear under it.

**Trade-off.** A part of its own costs a line in the Widget instructions (about 240 characters, allowed for in the
instructions' size test) and a frozen-library update, but it closes what the first build, made from StepThrough and a
LineChart, left open: a real arrow, a reveal that waits for an answer, and exact marks for big moves. Practice gives
one try: a wrong answer shows the lines rather than inviting guesses. The play sliders are part state, not Widget state,
so they are not saved with the Session and a Guided Task cannot read them. Code reading a shown `rate_move` (the
readouts sent to the Tutor) is T14's; the state names stay exported as `RATE_MOVE_STATE`.

### Widget state (`src/learner/widget-state.ts`, `/api/widget-state`, `src/app/widget-states.tsx`, `WidgetWithSave` in `widget-panel.tsx`, `SavedTicksContext` in `src/widgets/saved-ticks.tsx`, table `widget_state`, spec #119, ticket #147)

**What it does.** A Learner's work on a Widget is saved with the Session: the numbers on its sliders and the
Guided Tasks it has ticked. Each is stored as one row of `widget_state` per (Session, Widget key). The Widget
key is the written-ahead Widget's id (the explore Widget is a written-ahead Widget, saved under its id), or the title of a
Widget the Tutor drew, so a Widget the Tutor updates in place under the same title keeps the Learner's work. The
Study Workspace page reads the shown Session's rows with the Session and hands them to the page; a Widget then
starts from its saved values (OpenUI's `initialState`, which wins over the starting numbers in its code) and its
saved ticks. The page keeps one store of these for every Widget, above any one tab, so a Widget mounted again
after a tab switch draws as it was left, and so does one whose code changes under it (the reveal task joining the
explore Widget redraws it from the store, rate and ticks kept). As the Learner moves a slider or a task ticks, the store posts that
Widget's whole state to `/api/widget-state` 0.4 s after the last change, and at once when the page is left
(`keepalive`, so a reload does not lose it). The route checks that the Session is the signed-in Learner's;
another Learner's Session answers 404. Before the first turn has made the Session, changes wait in the page and
are saved once the page learns its Session. Ticks moved out of the Guided Tasks part: it still ticks in order and
never unticks, but it starts from the saved ticks and reports new ones. Save to notes sends the same Widget key,
and the server keeps the values saved under that key in that Session (the browser's numbers only when nothing is
saved yet). Notes, Older sessions and Home draw Widgets with no store, so there nothing is saved, as before.

**Scenario.** In present value, the Tutor opens "What the annuity is worth today" (saved under its id,
`annuity-worth-today`). The Learner sets the rate to 0%, which ticks the first Guided Task, then opens another
Widget's tab and comes back: the slider is still at 0% and the task still ticked. They reload the page: the same. A Widget the Tutor drew, saved to notes, keeps the values saved under its
title in the same way.

**Trade-off.** Keying by title is simple and is what the Tutor already uses to update in place, but a Widget
redrawn under the same title starts from the Learner's old numbers, not the Tutor's new starting ones, and an
untitled Widget is not saved at all. Saving a whole Widget's state on each change (after a short pause) is one
small row write per pause rather than per pixel; the price is that a change made in the last 0.4 s before the
browser is killed outright (not a reload or a closed tab) can be lost. Ticks are saved by their task text, so a
redrawn Widget whose task is worded differently starts that task afresh. The server only checks the shape (finite
numbers on `$variable` names, short task texts, at most 20 of each), not the Widget's code, because the code of a
Tutor Widget is in a reply the route would have to find; what is saved is only ever read back into that Widget.
A static page render cannot show saved values (OpenUI fills in state after the first browser render), so the
workspace test draws in happy-dom, a browser-like page.

### Widgets that update in place, the 12 second guard and the timing events (`turn-stream.ts`, `widget-states.tsx`, `widget-panel.tsx`, `analytics.ts`)

**What it does.** Three browser behaviours for Widgets. First, when the turn stream carries a `widget_state` event (the Tutor changed a Widget's sliders), the browser saves those values under the Widget's key like a slider drag would (replacing any save still waiting), leaves ticked Guided Tasks alone, and bumps a per-key revision; the Widget is keyed by that revision, so its sliders remount at the new values. Second, a chip or card that has said "Drawing…" for 12 seconds turns into a quiet "The Widget did not arrive." with a Retry button instead of a spinner that never ends; Retry asks the page to draw it again if the page offers that, and always waits another 12 seconds. Third, `analytics.ts` wraps Vercel's `track` and sends five events: `turn_first_text` (ms to the first words), `widget_first_pixel` and `widget_interactive` (lane, recipe, ms from when the Widget began drawing), `widget_timeout` and `widget_fallback`. The lane is the Widget's source ("recipe", "compose", "fallback") or "fence" for one written in the reply.

**Scenario.** The Learner has the rate slider at 3%. They say "show me 8%". The Tutor updates the Widget, the server sends `widget_state {rate: 8}`, and the slider jumps to 8 while the task they already ticked stays ticked. Another time a Widget's fence opens and the reply stalls: after 12 seconds the chip says it did not arrive and offers Retry.

**Trade-off.** Remounting the Widget on a push is simple and always shows the right values, but a half-typed number in that Widget is lost. The timing events never throw and are off under tests, but Vercel only records custom events on the Pro plan or above, and Pro keeps two properties per event (Plus and Enterprise keep eight), so on Pro the third property of the Widget events is dropped.

### What the Tutor sees of the Widgets, and Tell the Tutor what I found (`src/widgets/widget-reading.ts`, `src/tutor/widget-context.ts`, `turn.ts`, `/api/turn`, `turn-stream.ts`, `WidgetWithSave` in `widget-panel.tsx`, spec #119, ticket #148)

**What it does.** Every turn request from the Study Workspace carries the page's Widget state (the store above:
slider values and ticked Guided Tasks by Widget key), as it is at that moment, so a slider moved a second ago
counts even before its 0.4 s save. For a Learner's message, a chip, Next, Continue or a widget report (not the
opener, which is the page's), the Tutor Turn reads every Widget open in the panel: the ones the Session's replies
drew, plus the Topic's explore Widget while the Learner has it. Each is read at the sent values, else the saved
ones, else the numbers its code starts at, and code writes a "Widgets by code:" block: the Widget's title, its
sliders ("Interest rate (discount rate): 3.38%"), its Guided Tasks with [x] for each ticked, and the readouts of
our own parts, worked out with the same tested calculators the Widget draws with. An AnnuityChart gives the sum
of payments, what they are worth today at the rate set, and the Case Data figure it compares with (only what the
as-of rule allows the Learner now); a Calculator gives its results; a Formula Card gives its worked-out values.
The block is a second text block of the Learner's own message, so it is stored with that message and every later
request replays it unchanged: what the Tutor saw then stays fixed in the Session's history. The thread never draws
it (`textOf` leaves it out), and no block is added while no Widget is open.

Once every Guided Task under a Widget is ticked, **Tell the Tutor what I found →** appears under it in the
Study Workspace (never in Notes, Older sessions or Home, and not on a passed Topic's page). Pressing it sends a
widget report naming the Widget key. Code finds that Widget open in the Learner's current Topic Session, checks
every one of its tasks is ticked (else the turn is refused, and nothing is saved or sent), and writes the note:
"Widget report by code: ... Code wrote what the Widget shows: "I set the interest rate (discount rate) to 3.38%.
Sum of payments: $1.537 billion; Worth today at 3.38%: $877.4 million; Cash option: $877.8 million (sourced,
2018-10-23)."". Like the opener's and Next's notes it is the turn's saved input (turn kind `widget_report`, so
Retry sends it again), never drawn as a Learner bubble, and refused as an Insight attempt because code wrote it.

**Scenario.** At Present value's explore step the Learner drags the explore Widget to 3.38% and asks "What rate
do I have set?". The request carries the store's numbers; the block says "Interest rate (discount rate): 3.38%"
and the readouts, so the Tutor answers 3.38% without working anything out. When the last task ticks, the button
appears; they press it, and the Tutor replies to what they found and asks them to say what it means in their own
words, which is what the Insight tool can record.

**Trade-off.** Code, not the model, does every sum, at the cost of a block in each message while a Widget is
open (a few hundred tokens, cached with the rest of the history). Readouts cover only our own parts, their
arguments worked out by OpenUI's own evaluator (as the browser does); slider values are printed with the Slider's own
`formatUnit`, and the annuity's 1-to-60 payment count is one shared `annuityPaymentCount`; a kit chart's typed numbers and anything a Query works out in the browser are left
to the slider values. Written-ahead Widgets get readouts the same way, from the parts they are built of, and one that
says a rate change (`rateChange` in its Topic file) gets those from `rateChange` too. Trusting
the page's numbers means a tampered request could tell the Tutor a wrong rate, but only about the Learner's own
Widget, and the readouts are still worked out by code from those numbers. The report's words are code's, so the
Learner still has to say the Insight themselves.

**How it is tested.** At the Tutor Turn seam (`src/tutor/widget-context.test.ts`, scripted client, in-memory
Postgres): with a rate saved, "What rate do I have set?"'s request contains it; the sent numbers win over saved
ones; the block goes with a chip and a Next but not the opener; it replays unchanged in a later request and is
not drawn; the explore Widget's worth today and the sourced cash option, a Calculator and a Formula Card; the
widget report's note, turn kind and missing bubble, its refusal as an Insight attempt, and its refusal before
every task is ticked. In the Study Workspace render (`workspace.test.tsx`): the button hidden with a task
unticked, shown when all are ticked, absent on a passed Topic. In happy-dom (`widget-state.test.tsx`): a chip's
request carries the values just set, and the button appears as the last task ticks and sends the report.

### Widget tools (`src/widgets/tools.ts`, `src/widgets/tool-specs.ts`)

**What they are.** Four small functions of ours that run in the browser when a Widget asks for
numbers with `Query("tool", {...}, {rows: []})`. This is OpenUI's own pattern for tools on the page;
the `{rows: []}` is what the chart draws until the answer arrives.
- `case_data` fetches one Case Data dataset by its reference, `caseId/datasetId`, from
  `/api/case-data/<case>` under the as-of rule, with its label, unit, source and as-of date. Several
  Queries on one Case in a widget make one request, and the Sourced strip shares it. On Home it reads
  the Case Data sent with the page instead and makes no request (see the shared Case Data cache).
- `calculate` runs one of our tested calculators and gives one row per result line.
- `calculate_range` runs a calculator across a range of one of its inputs, at most 200 points, and
  gives one row per point with a text label for the chart's axis ("8.5%" for a rate, "10 y" for a
  number of years): the points of a chart.
- `annuity_schedule` gives a growing annuity's yearly payments and what each is worth today, by the
  same tested formula as `AnnuityChart`.

A Slider bound to a `$variable` that a Query's arguments use makes OpenUI run that tool again when it
moves, and the chart redraws with no model call. Every row field is a plain name, so a chart takes a
column as `d.rows.value`, and its category labels are text (`d.rows.label` or `d.rows.date`). A
number written as text, as a Select's value always is, counts as that number. A tool never throws: on
bad arguments it gives no rows and a plain-words error that names the fix (for example, that `vary`
must be one of the calculator's inputs, or "emi has no input named rate. Its inputs are: principal,
ratePercent, years."), which the Widget shows as the muted line described above. An input the
calculator does not take is an error rather than ignored, because a slider bound to it would move
nothing. Inputs are numbers only, the same rule as our own parts (no list of figures can be typed
in), so `npv`, `irr` and `dcf`, which take a list of cash flows, cannot run in a widget; the
instructions say so, and a test keeps that sentence in step with the calculators. Widgets only read;
nothing they call can change anything.

**Scenario.** The Learner asks for a 50 lakh home loan's EMI by loan length. The Widget holds a rate
slider, a `calculate_range` Query of `emi` over 5 to 30 years and a `calculate` Query for the loan as
it stands, drawn as a line chart and a small table. Moving the rate from 8.5% to 10.5% runs both
Queries again in the browser, and both redraw from the tested EMI formula.

**Trade-off.** The tools are a second way to reach the calculators, beside the Tutor's own
`calculate` tool, but both read the same registry, so they cannot disagree. Because one name is
shared, the instructions tell the Tutor that the Widget tools run only inside a widget and are not
tools it calls itself. A tool is only as good as its arguments: a wrong input name gives a quiet error
line instead of a chart, which is why the server check reads the written-out arguments first. The
tools' names and argument rules sit in one file with no React (`tool-specs.ts`), because the server
check reads them too.

### The plot kit (`src/widgets/plot/`, `history-plot.tsx`, `annuity-plot.tsx`, UX audit lane "plot")

**What it does.** One small, hand-drawn set of chart parts so every chart in a Widget has the same look, keys and
units. `scales.ts` has round-number ticks (1, 2, 2.5 or 5 times a power of ten) and linear, log, time and band maps.
`format.ts` has `formatAxis` and `formatValue`: a rupee axis reads ₹8 L or ₹1.2 Cr (the existing lakh and crore words,
shortened) and never K or M, dollars read $50 m or $1.5 bn, and a value read out always carries its unit (₹4,000).
`domain.ts` has `useStickyDomain`: a value axis that only grows while the Widget is in use, and starts over when the
Widget's Reset changes the `PlotResetContext` value. `charts.tsx` has `BarChartPlot`, `LineChartPlot` and
`AreaChartPlot`, taking OpenUI's own positional props plus optional `unit`, `yMin` and `yMax`; they are exported but
not yet registered over OpenUI's charts (the Widget library does that). Areas overlap and never stack unless the
variant is "stacked"; the first series is the filled area. Bars stop at about 48 px wide and sit in the middle of
their slot. The keyboard has one stop in a chart (a roving tabindex), and the arrow keys, Home and End move from
point to point.

**Scenario.** A Learner drags the umbrella slider from 100 % down to 50 %. Before, the axis re-fitted itself on every
step, so the bars looked the same height and the lesson ("the swing shrinks") was invisible. Now the axis stays at
its widest, so the bars visibly shrink to half. On the Sensex chart, 1979 to 1990 is now eleven years wide and the
month in 1992 is a sliver, and a "Log scale" switch redraws the same line so that steady growth runs straight.

**Trade-off.** An axis that only grows can leave empty room above the bars after a big slider swing, until Reset.
We take that: a steady axis teaches more than a tidy one. Log is offered only when every value is above zero, and
the Annuity chart's keyboard is now one slider (one tab stop) instead of thirty, at the cost of a payment's reading
being spoken only when the slider moves onto it.

### Widgets that fit the panel (`SliderView`, `StackView`, `WidgetFrame`, chart overrides in `src/widgets/library.tsx`, `formatInrDisplay` in `src/finance/indian-format.ts`, UX audit lane "widget-fixes")

**What it does.** The Widget library now repairs what the model writes, so a Widget fits the panel and shows the truth.
The Slider is a container-query component: below 22rem it drops the number box and the value in its header becomes a
tap-to-type field; the range takes every pixel the 32 px ± buttons leave. Holding a ± button repeats the step (after
400 ms, every 80 ms). The Stack is overridden: a row whose every child is a Slider is drawn as a column, and any other
row wraps with each child at least `min(100%, 15rem)` wide. The kit's AreaChart, LineChart and BarChart are replaced by
the plot kit's charts with the same positional arguments plus optional `unit`, `yMin` and `yMax` (AreaChart also takes
`variant` "stacked"), so axes stay put while a slider moves and areas never stack. HistoryChart takes an optional
`scale` ("linear" or "log"). Steps drops a number the model wrote into a title ("1. Bad times arrive"). The Calculator's
title has a neutral "Worked out" eyebrow instead of the teal Your assumption tag, and its rupee figures show no paise
from ₹1,000 and lead with lakh or crore from one lakh, the whole figure in a tooltip. The Widget frame puts one or two
top-level Sliders in a sticky control bar, and its Reset is an icon button that slides the sliders back in about 240 ms,
then restarts the plots' axes.

**Scenario.** A Learner opens a SIP Widget in a 360 px panel. The two Sliders the model wrote as `Stack([a, b], "row")`
stack one under the other and stay at the top while the chart and numbers scroll. Dragging the rate never rescales the
chart's rupee axis, and the value area and the line for the money put in overlap instead of piling up. Reset slides both
Sliders home; a Guided Task such as "Set the rate to 12%" does not tick on the 12% the slide passes through.

**Trade-off.** Repairing in the renderer, not the validator, costs no correction round-trip, but the model's layout
differs from what is drawn. Sticky controls only hold two Sliders, so a Widget with more keeps them in place. Guided
Tasks stay unmarked while Reset runs, so a task cannot tick without learning, but a Learner who resets mid-task sees it
pause for a quarter of a second. A task that more than half of a slider's range ticks gets a validator warning
(`widgetWarnings`, and `writtenAheadCheckWarnings` for the course) and never an error; a true Breakeven part, which
knows the flip point, is not built yet.

## Themes and switching (`src/app/theme.ts`, `src/app/theme-store.ts`, `src/app/theme-menu.tsx`)

**What it does.** There are four themes: Light and Paper by day, Midnight and Forest at night. By default the site follows
the computer: Light in light mode, Midnight in dark mode, and it switches live if the computer switches. The header's Theme
menu picks Match my Mac or pins any one theme, in one click and without a reload. The choice is saved in the `theme` cookie
for a year, as `system:light:midnight` or `single:forest`. The old saved values still work: `dark` opens Midnight and `light`
opens Light. A second cookie, `theme-pair`, keeps the day and night pair while one theme is pinned, so Match my Mac can come
back to it.

**How the parts fit.** `theme.ts` is the one place that knows the themes, how a saved value becomes a theme (`parsePref`,
`resolveTheme`) and what a theme puts on `<html>` (`applyTheme`: `data-theme`, the `dark` class, `color-scheme` and
`data-openui-theme`). `theme-store.ts` is the browser's side: every control reads and changes the choice through
`useThemeState` and `setThemePref`, so they stay in step, and `ThemeFollower` in the root layout keeps following the computer
on pages with no header. `theme-menu.tsx` is the menu. `readTheme()` is the server's reading of the cookie, which only draws
the menu's button until the browser takes over.

**A concrete scenario.** A Learner on a Mac in dark mode opens `/study` with no cookie. A small script at the top of `<head>`
reads the cookie, asks the browser about dark mode and sets the attributes before anything paints, so the page is Midnight
from the first frame. They pick Forest, then Match my Mac, and then finish a Tutor turn, which runs `router.refresh()`. The
page stays Midnight, because the layout gives `<html>` no theme attributes for React to change.

**Trade-off.** The server never draws the theme, so the head script holds a second copy of the logic, written by hand because
it runs before any bundle loads. A test runs it against the real functions for every kind of saved value, so the copies cannot
drift. The price of the other way, the server drawing `data-theme` for a pinned theme, is a bug: going from pinned to following
would make React strip the attributes on the next refresh. With JavaScript off the page is Light. The button's name is just
"Theme" until hydration while following the computer, since the server cannot know its mode; the sun or moon follows the `dark`
class, so it is right from first paint. The choice is per browser, not per Learner account.

### Settings > Appearance (`AppearanceSettings` in `src/app/settings/settings-controls.tsx`)

**What it does.** The Settings page has an Appearance section with a radio group "Theme" (Match my Mac, or Always use one
theme). With Match my Mac it shows a Day theme group (Light, Paper) and a Night theme group (Midnight, Forest); with one
theme it shows one group of all four. Each option is a small tile drawn from `THEME_SWATCH` (page colour, a line of text
colour, a brand dot) beside its name. The radios are real `<input type="radio">` elements, so the arrow keys, Tab and
Space work and a screen reader hears each label.

**A concrete scenario.** A Learner picks Day = Paper and Night = Forest. On a Mac in light mode the page turns Paper at once;
when the Mac goes dark it turns Forest, and the header menu reads "Paper by day, Forest at night". If they then pick Forest
in the header menu, the Settings radios show "Always use one theme" and Forest without a reload.

**Trade-off.** It writes to the same store and cookie as the header menu rather than keeping its own state, so the two cannot
disagree, but the choice stays per browser, not per account. The tiles use inline colours from the swatch map because a theme
can only be scoped to `:root`, not to a single tile.

## Design tokens (`src/app/globals.css`, `src/app/ui.tsx`, `src/app/theme-cookie.ts`)

**What they are.** A short list of named colours (`--bg`, `--ink`, `--muted`, `--border`, `--brand`,
the teal `--you` set for the Learner's assumptions, the amber `--src` set for sourced facts, and a
few more) defined once in `globals.css`, with a light value and a dark value. Every screen paints
with these names instead of raw colours. `ui.tsx` holds the shared look pieces built on them: tags,
eyebrow, pills, chips, buttons, card, callout, key/value row, the app header, the reading-page shell
and the phone-note frame. The reading-page shell (Course Map, Progress, Past Sessions, Notes, Settings, Passage) puts
the header in the same wide box as the workspace, so the title and links never shift between pages,
and narrows only the content below it. The trade-off: the header is wider than the text under it on
those pages. The header (spec #77) has "Finance Agent" at the far left as the page heading, linking to
Home at `/`, then Study Workspace (`/study`) · Course Map · Progress · Past Sessions · Notes ·
Settings, a thin divider, the Theme menu, Sign out. What is clickable looks clickable: "Finance Agent" has a small
mark, the title "Home" and a hover wash; each page link is a pill (`NavLink`, which marks the current page with
`aria-current` and fills its pill, the Study Workspace included, and shows a small dot inside while its page is
loading); the Theme menu is an icon button named for the current theme ("Theme: Midnight"); Sign
out (`SignOutButton`) is a plain form posting to `/api/logout`, styled as a small outlined button (Home's signed-in
top bar uses the same component). No other link points at `/`. The Study Workspace and Course Map links are
prefetched in full, so they open at once; the others use the default. A 2px bar across the top of the window
(`route-bar.tsx`, mounted in `layout.tsx`) creeps along from a link press until the address changes, then finishes
and fades. Below 1024px the pills, the text (13px) and the gaps shrink and the divider hides, so the row stays on one
line from 768px (estimated at about 700px of the 736px there is; the pills' padding is the first thing to trim if a
page link is added). The trade-off: more of the header is drawn, so it is wider than the old plain text links and
the narrow-width margin is thin. Disclosures (Under the hood, Sources, folded rows) end in a chevron that turns a
quarter turn when open (`Chevron` in `ui.tsx`), so a summary reads as something to open. Smaller details in the same pass: the Course Map's prerequisite confirm is a labelled
group that moves focus to its main button (Escape or "Not now" gives focus back), the cited sentence on a
Passage has an amber underline as well as a fill, and old Session pages keep two columns on an iPad.

**Scenario.** The Learner switches to dark mode. The toggle puts a `dark` class on the page, the
token values swap (navy buttons become light navy with dark text, the teal and amber tags darken),
and every piece follows at once without a single per-component dark rule.

**Trade-off.** Colours must go through the tokens, so a one-off shade needs a new token rather than
a quick palette class. In return the look stays consistent and a colour change is one line.

## Colour themes and the contrast check (`src/app/globals.css`, `scripts/check-theme-contrast.mjs`)

**What it does.** There are four colour sets, each a full block of the 26 tokens above: Light (`:root`), Midnight
(`:root.dark`, the dark theme, which replaced the old mirrored-Tailwind dark), Paper (`:root[data-theme="paper"]`, a warm
low-glare light) and Forest (`:root.dark[data-theme="forest"]`, a soft green-grey dark). Midnight, Paper and Forest sit
inside `@media screen`, so printing always falls back to Light's tokens (the print block also forces `color-scheme: light`).
No block inherits colours from another. The palettes are adapted from Catppuccin Mocha, Rose Pine Dawn and Everforest (all
MIT; credited in the CSS comments only). Nothing in the UI picks Paper or Forest yet; setting `data-theme` by hand shows them.
`scripts/check-theme-contrast.mjs` reads the CSS and fails the `check` script if any theme drops below its contrast rules
(body text, links, accents, tags, focus ring), if a token is missing, or if Light's colours change.

**Scenario.** Someone edits `--muted` in Midnight to something a little too dark. `npm run check` prints which rule failed
and for which theme, and exits non-zero, so the change cannot merge.

**Trade-off.** Four full blocks repeat every token, so adding a token means editing four places; the checker flags a
missing one. In return no theme can silently pick up another's colour, and the contrast numbers are enforced, not hoped for.

## One announcer, and Save to notes as a state machine (`src/app/announcer.tsx`, `src/app/save-to-notes.tsx`, `src/app/layout.tsx`, UX audit 4.1d, 4.2f, 8.5)

**What it does.** The app has one live region for screen readers (`AnnouncerProvider`, `data-testid="app-announcer"`),
mounted once in the root layout, outside every scroller. Anything that wants to say something calls `useAnnounce()`.
Saying the same words twice in a row is heard twice: the region is emptied, then filled on the next beat. Save to notes
no longer carries a hidden `role="status"` of its own under every reply (16 live regions in a long Session, each a
chance to make the page taller); it calls `announce("Saved to notes")` once per save. The control moves through
idle, "Saving…" (a spinner), "Saved ✓" for 1.6 seconds, then back to a "Save to notes" button with a quiet "Saved"
badge, Undo and Open notes. A failed save shows a visible `role="alert"` message ("Could not save. Try again.") and a
Retry button.

**Scenario.** The Learner presses Save to notes under a reply. The button shows a spinner and "Saving…"; when the
server answers, "Saved ✓" shows for a moment, a screen reader hears "Saved to notes" once, and the button comes back
with a "Saved" badge beside it. Pressing it again saves nothing twice, since the server keeps one saved item per reply.

**Trade-off.** The control is a little taller than the old caption (a 32px ghost button). Other status messages (the
turn status in the left column, the Widget loaders) still have their own regions and are not on the announcer yet.
Undo is the foundation ghost Button, and Send's title says "Type a message to send" while the box is empty.

### Save to notes keeps a shown Widget (`withShownWidgets` in `src/learner/saved.ts`)

**What it does.** A Widget the Tutor showed with show_widget is a `widget_shown` Session item, not part of the reply
text. When a reply is saved or read back for Notes, the shown Widgets of that turn (items stored after the turn's first
message and before the next turn's) are added after the text as ordinary Widget fences, numbered after the reply's own
fences. Nothing new is stored: the note is still a pointer, and no migration is needed.

**Scenario.** The Tutor answers "Here it is." and shows a Loan cost Widget. The Learner presses Save to notes under the
reply. On Notes the reply text appears and the Loan cost Widget is drawn under it, with its sliders, as a fenced Widget is.

**Trade-off.** The shown Widget is rebuilt from the Session on every read, so it follows the Session items; a Session
item that is later removed also leaves the note. Widgets are drawn at the end of the reply, not where they stood in it.

### Widget Retry, the drawing guard and per-Widget Save for shown Widgets (`src/app/widget-host.tsx`, `src/app/widget-panel.tsx`, `src/app/thread.tsx`, `src/app/save-to-notes.tsx`, `src/tutor/tools.ts`)

**What it does.** The Widget host gives chips and the panel a Retry: pressing it on a Widget that did not arrive resumes
the last turn, which draws the reply again. The 12-second "drawing" wait now counts from the last token that arrived, so a
slow but moving Widget is not given up on. A Widget show_widget drew gets the same per-Widget Save to notes as one written
in the reply: `widgetsIn` finds its turn's reply and numbers it after the reply's own fences, as the server does. The
Widget-drawing tool calls of a turn run one after another, so two calls in one message cannot both pass the
"one Widget a reply" check. Save to notes keeps keyboard focus when it changes to Saved, and a failed Undo returns to the
settled control with a short error.

**Scenario.** A Widget stalls at "Drawing…". Twelve seconds after its last token the chip says "The Widget did not arrive"
with Retry; Retry resumes the turn. A Learner who pressed Save with the keyboard hears "Saved to notes" and is still on
the control.

**Trade-off.** Retry resumes the whole last turn, not only the Widget, so the Tutor may word the reply differently.

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
reading an old Session, because it is read back from SQL. It shows only when the Learner has turned
on **Show developer details** in Settings (off for every Learner at first; see "Settings" below):
usage is still recorded for every turn, and the switch only decides whether the line is drawn.

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
  "No verdict was recorded for Check ...", even after a break.
- **Misconceptions.** When the Tutor notices a real misunderstanding, it calls
  `record_misconception`, and code saves it in `misconceptions` with the Topic, the Check in play
  and the model.
- **Once only.** Both tools are keyed by the tool call's ID, so if the same call arrives twice
  (a retry, a resumed turn), the second has no effect.

**The summary.** Code builds a short plain-text summary from SQL, with no model call, and sends
it in the Where the Learner stands block: in a Session's first message, and again whenever it
changes (the workspace shows the same text on opening). It
says the Topic and Teaching Step, the unmastered prerequisites (the Topic's prerequisites, and
theirs, that are not passed, with "not started" or "in progress"), the last eight misconceptions
noted in those Topics, and the last "not yet" verdict at the current Check with its reasons.

**Scenario.** At the jackpot Check the Learner says "$1.537 billion is bigger than $877.8 million,
so take the annuity." The Tutor saves "not yet" with the reason "compared undiscounted totals" and
notes the misconception "compares payments at different dates without discounting". The Learner
stays at the Check. They come back two days later: the Session carries on, and the latest Where
the Learner stands block tells the Tutor about that misconception and the last verdict, so it picks
up the real gap. A live run of
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
- **Where it shows.** On the right, as the Widget panel's "Check k of N" tab ("Check 1 of 2": the
  Check's place among its Topic's Checks, which `openQuiz` returns), selected by itself; see "The
  fixed two-column layout and the Check tab". The Tutor's context says the same: the questions are
  on the right, in the Check tab, and it must not help with them until the Learner submits.
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
- **The Tutor hears afterwards.** Marking calls no model. After a miss the page starts a quiz
  follow-up turn at once (see "Check result cards and the quiz follow-up"); after a pass the Tutor
  hears on its next call, usually the Learner's Next. Either way code puts a note in the history: "Quiz result by code,
  Check ..., attempt 1: 1 of 3 correct (needs 2). Not passed ...", naming each missed question,
  what the Learner chose and the right answer. It goes in the same system message as the
  Course Navigator's context, directly after the Learner's message (the one place the API accepts
  a system message), or in the opening message of the Topic's Session. A note is sent once, and only
  to the Session of the quiz's own Topic.

**Scenario.** The Learner finishes the concept and "your turn" and the quiz opens in the Check tab on the right. They
get "$1,210 in two years at 10%" wrong, picking $1,100, and get two right. That is two of three,
so it passes at once, and the screen explains the miss ("dividing by 1.10 only once discounts for
one year"). They press the Next chip, "Next: Concept →", and the Tutor opens with a short, informed
word about the one-year versus two-year slip, then teaches Check 2's Concept, a step reached by code
and not yet begun. Had they got only one right, they would have stayed
at the Check, the Tutor would have gone over the miss in a follow-up turn code started, and a different set of three questions
would open when they pressed Try Check 1 again.

**Trade-off.** Multiple choice is fast, cheap and can't be argued with, but it tests recall and
recognition, not reasoning; that is what the conversation Check is for. Writing the questions in
the Course Map keeps them reviewable and testable, at the price of Claude (or the owner) writing
and sourcing each one. The Tutor learns about a result late (on the next message, not the moment
of submission), which keeps the quiz free of model calls. Imported open question banks, spaced
review and a Question Bank in the database come in later tickets.

### Typed questions, fresh numbers and Known-mistake fixes (spec #229, ticket #241; `src/course/quiz.ts`, `src/bank/lookup.ts`, `src/learner/quiz.ts`, `src/tutor/check-results.ts`, `src/app/quiz-panel.tsx`)

**What it does.** A quiz Check may list question templates beside its questions. A template slot in an attempt is
stored in `question_ids` as `<templateId>#<seed>`; pure code rebuilds the numbers and the answer from the seed
(`drawTemplate`), so nothing new is stored and there is no migration. `selectQuestions` still walks round the
questions and then the templates and returns the bare template id for a slot; `openQuiz` turns each into an instance
id (`instantiateSlots`) when it makes the attempt. The seed is made from the Learner, the Check, the attempt number and
the slot, and a draw that repeats the numbers of the Learner's last attempt (or of an earlier slot) is stepped on until
they differ. `questionLookup` resolves instance ids, so opening, marking, the Tutor's note and the Check tab after a
miss all see the same numbers; a bare template id is never resolved, so the next attempt's numbers are not blocked
before they are drawn. An instance's lookup entry carries the drawn prompt, no choices and its answer in words ("60 bp"),
which is what the Tutor's blocked numbers read. A template that is gone counts as a removed question; templates make
`quizUnavailable` false.

**Scenario.** A Learner sees "A rate moves from 2% to 2.6%. How many basis points?" with a number box labelled "Answer
in basis points". They type 0.6. Code marks "60 bp", "60" and "60.0" right and 0.6 as the Known mistake "stopped at
points", so the Check tab shows "Your answer: 0.6 – right answer: 60 bp" and the template's one-line fix. A wrong
multiple-choice option with a `mistake` shows its fix the same way. After a miss, the Tutor's note names the missed
question's Skill as its rule in words, never its id, and the fix. Try again draws new numbers.

**Skill state.** In the transaction that saves a first submission, every question with a Skill is logged with
`recordAnswer` (source `quiz`, item key `quiz:<attemptId>:<questionId>`; a typed one also keeps its template and
numbers). Right, a Known mistake that has a tag, and everything else (wrong) map to the three verdicts. A repeat
submission records nothing. No real Topic has a Skill-tagged question until it is converted, so nothing is recorded in
production before then.

**Trade-off.** Seeds make a typed attempt cheap to store and exact to replay, but an instance cannot be edited once
shown; and typed questions are left out of Reviews (see "Spaced review"), because a card needs a fixed question.


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

### Reference data (the reserved Case `reference`, `src/case-data/reference.ts`)

**What it does.** Some real numbers belong to no one Case: the gold price, the rupee-dollar rate,
India's inflation, the RBI repo rate, Sensex and Nifty closes, typical FD, PPF and savings rates, and
US Treasury yields. They are stored as ordinary Case Data under one reserved Case id, `reference`, and
read the same way (`reference/usd-inr` in `Query("case_data", …)` or `HistoryChart`; the route is
`/api/case-data/reference`). No Topic may use that id as a Case (the Course Map check rejects it), and a
written-ahead Widget may read `reference/<id>` only for ids in `REFERENCE_DATASET_IDS`. The data files
stay outside git and are imported from the laptop like any Case Data. The step context lists them in a
short block (id, label, unit, latest date) so the Tutor knows they exist.

**Scenario.** A Learner asks what a gold bar was worth in rupees. The Tutor draws a chart from
`reference/gold-inr-10g` instead of saying it has no real prices, and the Sourced strip credits the
World Bank and the Federal Reserve. If the Learner is in the 1992 Topic before its reveal, the same
request returns nothing dated after that Case's as-of date, so a later Sensex close cannot give the
outcome away.

**Trade-off.** Reference data is always readable, so it needs its own as-of rule: while any Topic the
Learner has started has a Case whose reveal is not yet shown, code clips every reference series to the
earliest such as-of date (`referenceClip`; a series with nothing earlier is left out). The payload carries
that clip date, and the page's Case Data cache drops its held reference entry whenever the clip changes
(`setReferenceClip`, driven by the provider's `referenceClip` prop), so the reference series is refetched
at once instead of staying stale until a turn ends. An import writes new points first, in chunks of 2,000,
and only then deletes dates missing from the new file, so a failure part-way leaves the old points in
place; it refuses a reference dataset id that is not in `REFERENCE_DATASET_IDS`, and the import script
prints its database host and needs `--yes`. The dev scripts `widget-eval` and `layout-check` share
`scripts/script-guards.mjs` (local base URL only, tools Learner only, `EVAL_DB_OK=branch` and never the
`PROD_DB_HOST` host). Some series are derived or approximate (gold in rupees is the international price
at the monthly exchange rate, without duty; typical rates are the middle of an RBI range), and each
dataset's check note says so.

## Surviving cut-offs and failures (`src/tutor/turn.ts`, `turn-status.ts`, `tools.ts`, `failures.ts`, `src/app/turn-stream.ts`)

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
- **One turn at a time, per Learner.** Only one of a Learner's `turns` rows may be running; the
  database enforces it. Their second send, from a phone or another tab, gets a plain "turn in
  progress" answer (HTTP 409), and nothing is saved. Another Learner's turn runs alongside.
- **Stop reasons and failures.** A reply that hits `max_tokens` is kept as sent and the Learner gets
  Finish this reply (see "Finish this reply, and old Continue as a divider"); a tool call cut off inside it is never run, and is answered "not run". A
  `refusal` is discarded, because Claude's docs say to treat a declined reply as incomplete and
  discard it, so it cannot stay in history. Only the declined loop step is discarded: steps before
  it in the same turn, and what their tool calls recorded, are already saved and stay, on screen as
  well as in SQL. The Learner sees a plain message that says which: "Nothing was changed" when no
  earlier step recorded anything, or that what was already written and recorded is kept. The
  Session carries on: every row of the refused turn stays on screen but is left out of later
  requests (see "One Session per Topic"), so history is never edited. An API
  error says why in plain words (credits run out or spend limit, rate limit, Claude busy, no
  connection), keeps everything saved, and offers Retry, which resumes the same turn rather than
  sending the Learner's message again (this fixes the repeated Learner messages seen in #6). What
  the Learner sent is saved on the turn row (`turns.input`) when the turn starts, so a turn that
  fails before their message reaches the Session (a database error while picking the Session, say)
  is run again from that saved message on Retry; the message is not lost.
- **A failed progress write.** If saving a verdict or step fails, the transaction rolls back, so
  the Course Navigator doesn't advance. Claude's tool result says plainly that nothing was recorded,
  and the Learner sees an error.
- **A deploy that changes the Tutor.** The next new turn refreezes the instructions and tools inside
  the same Session; earlier messages' thinking blocks are left out from then on, and no notice is
  shown (see "One Session per Topic").
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
a database write that fails (a test trigger refuses the write), a changed fingerprint (refrozen in the same Session), a misconception
with an unknown Topic ID, and compaction. Live runs against Claude are in the evidence folder.

## Stop, pings and progress (`src/app/api/turn/route.ts`, `turn.ts`, `turn-status.ts`, `tools.ts`, `turn-body.ts`, UX audit 4.2e, 5.11, 10.1)

**What it does.** Makes every turn stoppable and never silent. The browser half (Send becoming Stop, the labelled
writing indicator, the "Stopped" note) is built on these events separately.
- **Stop.** A request with `{ stop: true }` runs no turn. The route sets `stop_reason = 'stop_requested'` on the
  Learner's running `turns` row and answers `{ stopping: true }`, or `{ stopping: false }` when nothing was running;
  never a 409. The running turn reads its own row every 500 ms (the Stop may reach another function instance, so a
  flag in memory would not work; the column already existed, so no migration). When it sees the flag it aborts the
  Anthropic stream through the Tool Runner's signal. A tool already running finishes its transaction, and no new API
  call starts. Then the turn saves: every stored tool call gets its result, the held reply is dropped (since #239 no
  text is shown or saved as the Tutor's reply, see the reply gate), no check or retry runs, the turn is saved as finished with stop reason `stopped`, and a STOPPED Session item ("Stopped")
  is stored after the reply. It sends `stopped`, then the normal `done`, so the browser never resumes the turn. A
  Next the Learner already took stays taken. A resume clears an old flag.
- **Pings.** While the stream is open the route sends `{ type: "ping" }` every 5 seconds from its own timer: the
  turn itself cannot, because it is blocked while a tool runs or the model thinks.
- **Progress.** The turn tells the route what it is doing through `notify`, which goes straight to the stream:
  "Looking up Case Data…", "Thinking…" at each model call, each tool's plain name while it runs ("Searching the
  Library…", "Working out the numbers…", from `TOOL_LABELS` in `tools.ts`), and, since #239,
  "Checking the reply…" while code checks the held reply and runs its one retry. Progress only comes once the turn is past every refusal, so the route opens the stream on the first one
  rather than waiting for the first text.
- **`widget_state`** is declared as an event type only; nothing sends it yet.
- **Prompt caching.** The request keeps its automatic cache breakpoint (the growing conversation) and adds a second
  one on the frozen instructions, so the tools and instructions, the same for every Session of a deploy, are read
  from the cache by a new Session too. Measured on 4 Nov 2026 from the `usage` table: inside a Session every turn
  read the whole earlier conversation from the cache (for example 41,614 read and 1,859 written), but each new
  Session's first turn read nothing and wrote about 23,000 tokens, even 30 seconds after another Session started,
  and so did the first turn after more than 5 minutes idle.
- **Formula markers.** A `{{formula:…}}` marker in a Tutor reply that cannot be drawn is logged as a warning on the
  server, since the screen shows nothing for it.

**Scenario.** The Learner asks for a chart, the Tutor starts a long reply and a Widget, and the Learner presses Stop.
Within about half a second the stream ends; the sentences before the Widget are kept, the half-written Widget is not,
and a reload shows them with "Stopped" under them. Their next message carries on normally.

**Trade-off.** Polling costs one small query every 500 ms per running turn, and a Stop takes up to half a second plus
the query to land. A tool that is already writing is never cut off, so a Stop during a slow tool waits for it. Words
the browser showed from a step that never finished are what is saved, which may end mid-sentence. The second cache
breakpoint costs a cache write of the static prefix when it is not already cached, which the first turn paid anyway.

**How it is tested.** `src/tutor/turn-stop.test.ts` with the scripted client (which honours the signal): a Stop
mid-stream ends within the poll window, keeps the text without the open fence, stores the STOPPED item, sends
`stopped` then `done`, saves finished with stop reason `stopped`, and runs no correction; a Stop while a tool runs
answers every stored tool call and the next turn runs; a Stop with nothing running answers false; progress labels
through `notify`. `src/app/api/turn/route.test.ts`: `{ stopping: false }`, the stream opening on progress, a ping
under fake timers, and a Stop through the route.

### Teach simply: the Tutor's rules (`src/tutor/instructions.ts`, `src/behaviour/grading.ts`, spec #229, ticket #238; UX audit 5.12, 9.3, 9.10)

**What it does.** The Tutor's rules, shared by both instruction sets, now write for a beginner: the simplest correct
idea first, any untaught term explained where it first appears, and MBA level as where the course ends up rather
than where a reply starts. Every earlier rule stays (the past only, no advice, hindsight, Case Data, Citations,
pacing, Formula Cards, Illustrations, the Library, the open question asked once). The new ones:

- **Caps by step.** 80 words at concept, your turn and Check; 120 for a worked example, Go deeper, and the story,
  explore, reveal and principle steps. The rules name the table, but the "Word limit for this reply" line code sends
  each turn (see "Turn facts") rules. `REPLY_WORD_LIMIT` stays 120, the longest cap, for the behaviour report.
- **One idea and one ask.** At most one sentence of feedback, one idea and one thing to do, alone on the last line.
  No task lists, no "Want the next part?" and no Steps or Accordion advice: the Go deeper chip asks for more.
- **Teaching.** Simple first, a worked example, then fading; after a miss, one slip, one fix and one new try with new
  numbers; the method code names; one running example and one analogy per idea; "why" only after two right in a row.
- **What was asked, first.** "Show me in a widget" gets one Widget and one sentence (or one sentence saying none fits,
  then the shortest version in words); Go deeper gets one more layer in 120 words, same example, no new analogy;
  "simpler" gets the rule in four lines or fewer.
- **Frustration** gets an acknowledgement of eight words or fewer, then a smaller step. **The Learner's own rule** is
  confirmed in one sentence and their words are used from then on.
- **Open quiz.** The Tutor teaches, shows Widgets and starts again freely, with numbers off the blocked list, and
  keeps back only the open answers. At a conversation Check it teaches with other numbers and never states the
  reasoning the pass criteria ask for about the prompt's own move.
- **Short sums** on the numbers under discussion are said in words: a difference in points, points to basis points
  and back, a plain fraction. Every other sum still goes through calculate or the rate Widget.
- **Plain style and app words** follow R13 and the spec's allowed and banned lists, and Guided Tasks are optional play.
- **The Learner Profile** is used only when the Learner asks how an idea applies to them.
- **Six examples** (Appendix A) close the rules. They live as data (`TUTOR_EXAMPLES`), and a test runs every reply
  check on each, so an example can never break the rules it teaches.

The engine text drops the line against repeating the last archetype (the running example's Widget is meant to
repeat), takes its word cap from code's line, and allows an Illustration only where no input or Case Data covers
the number. The behaviour report still lists every reply over 120 words (`longReplies`).

**Scenario.** The Learner, at Percent's Check 1, types "just tell me the answer to question 1". The Tutor does not
refuse: it keeps that answer back, shows that 0.2 of a point times 100 is 20 bp, and asks for 0.7 of a point, all in
under 80 words with the ask on the last line.

**Trade-off.** The rules and examples add about 6,500 characters to every Session's cached instructions, and a
rule is still a request to the model: the reply checks (ticket #239) are what hold a reply to it. The widget-language
size test now counts the rules at their old length, since this growth is the teaching rules, not the Widget text.

### Turn facts: what code knows before the Tutor writes (`src/tutor/turn-facts.ts`, `src/tutor/context.ts`, spec #229, ticket #238)

**What it does.** Once per Tutor Turn, `turnFacts` works out the turn's facts: the step, the Reply kind the Learner's
words ask for (Go deeper, or a request for something simpler), the word limit (`capFor`), the Topic's example
currency (₹ until Topic files name one) and its Cases' currencies (from `$` amounts in the story and Case Data
units), and the ids the Learner must never read. At a quiz Check whose quiz can be shown, `openQuizItems` reads the
open attempt's questions plus the next attempt's (after a miss, only the next one's), through the Course Map and the
Question Bank, with each answer as the right choice's text; it reads rows only and never makes an attempt. The
blocked numbers are every number in those items. The Course Navigator context then carries "Word limit for this
reply: N words", the currency line, "Reply kind" when known, the method, frustration and Concept card lines once
later tickets fill them, and at an open quiz the new rule, the blocked numbers and the Concept (or card) to teach
from. The opener names the blocked numbers too, and the Check tab's note above the message box now offers help:
"Quiz open. Stuck? Ask the Tutor: it can explain with other numbers." `replyCheckContext` turns the same facts into
the reply checks' context, so the Tutor is told exactly the limits its reply is held to.

**Scenario.** The Learner opens the present value quiz and asks how discounting works. The context says the limit is
80 words and lists 1100, 10, 1000, 990, 1010, 1210 and the next attempt's numbers as blocked, so the Tutor explains
with $500 over three years instead, and never confirms which choice is right.

**Trade-off.** The word limit and Reply kind change from turn to turn, so a Go deeper press resends the whole context,
and the turn after it sends it again. The next attempt's numbers are blocked as well, which leaves the Tutor fewer
numbers but stops it rehearsing the questions a Try again would show. `tools.ts` still calls the context without facts
after a step move (ticket #243 passes them); without facts the lines are left out, but the open-quiz rule has changed
either way.

### Reply checks: the rules every Tutor reply must meet, as code (`src/tutor/reply-checks.ts`, spec #229, ticket #230)

**What it does.** A pure module, with no model and no database, that reads a finished Tutor reply and lists every rule
it breaks. The reply is its text, its last line (the ask, when that line asks a question or says what to do), the
Widgets it showed and any rule it saved to the Topic Note. The turn's context is the Teaching Step, the Reply kind,
the Topic's example currency and its Cases' currencies, the open quiz's questions with their answers, and the ids the
Learner must never read. The seven checks are:

- V1: the message and the ask together are within the cap. The cap is 80 words at Concept, Your turn and Check, and
  120 for a worked example, a Go deeper reply and every other step (`capFor`). Words are counted the way the Learner
  reads them: Widget and sources fences, Citation markers and bare Markdown symbols do not count (`countWords`).
- V2: at most one question in the message, an ask of 25 words or fewer, and no other line opening with a task verb
  (Set, Open, Try, Do, Tell, Press, Say) when there is an ask. With no ask, more than one such line fails too.
- V3: no "Great question", "Certainly", "Absolutely" or "Code recorded", no emoji or decorative arrows, no headings
  and at most one bold span.
- V4: at most one Widget, and each one passes the Widget validator the caller hands in.
- V5: no open quiz answer together with its question's numbers, in the text or the saved rule, and no Widget preset
  that uses a blocked number. The blocked numbers are every number in the open attempt's questions, choices and
  answers, normalised so that 4.5, 4.50 and 4.50% match (`blockedNumbersFrom`).
  An answer number that sits within four words of a confirm cue ("is right", "correct", "yes", "that's it", "the
  answer is", "you got it") also fails, even without the question's numbers: "Yes, 60 is right." gives the answer away.
- V6: no app words: the ids passed in, snake_case tool and step names, "Course Navigator", "Session item",
  "Reply kind", "Skill state", and "Code" as the subject of a sentence. Topic, Check, Check tab, Widget, Next,
  Go deeper, Show me in a widget, Quick try and Concept card stay allowed.
- V7: a dollar amount (or a "$" in a Widget's labels) only when the Topic's examples or a Case are in dollars, and a
  rupee amount only when they or a Case are in rupees.

`fixReply` makes the fixes that cost no retry first (emoji and arrows out, headings flattened, only the first bold
span kept), so V3 then fails only on a banned phrase. `correctionText` writes what the one retry is told, one line
per failed check with its limit ("Your reply was 142 words. The limit is 80. Keep one idea and one ask."), plus the
numbers to keep away from after a leak. `trimToCap` is the fallback where no Concept card exists: the reply cut at its
last full sentence within the cap, ask kept. The Tutor Turn runs it on every reply through the reply gate (below, #239).

**Scenario.** Check 1 of Percent is open with "How many basis points are there in 0.6 of a percentage point?". The
Tutor writes "0.6 of a point is 60 bp". V5 fails, and the retry is told to teach the idea on numbers other than 0.6,
6, 60 and 600. The retry says "0.2 of a point is 20 bp" instead and passes.

**Trade-off.** The checks read words, not meaning. A reply can pass V5 by saying "sixty" in words, and a supposition
that opens "Say the rate goes…" counts as a task line. Both are left to the live-model tests, which grade the
meaning; code catches the common, cheap-to-spot slips on every reply at no cost.

### The reply gate: replies checked before the Learner sees them (`src/tutor/reply-gate.ts`, `reply-records.ts`, `reply-fallback.ts`, `turn.ts`, `session-log.ts`, `transcript.ts`, `usage.ts`, `under-the-hood.tsx`, `drizzle/0030_reply_checks.sql`, spec #229, ticket #239, ADR 0008)

**What it does.** The Tutor Turn no longer streams the reply word by word. `loop()` collects every loop step's text
(with its Citation markers), the Session items the reply's tools stored and its Widget states in one held list;
progress labels ("Checking the reply…" among them), pings and a failed save still go out at once. When the model has
finished, code checks the whole reply:
- `fixReply` first (emoji, arrows, headings, extra bold): fixes never cost a retry. A fixed reply is stored again as
  the turn's final assistant text, each block keeping its citations.
- `checkReply` with this turn's facts (`turnFacts`, worked out again when a tool moved the Learner's step during the
  draft). The draft's Widgets are only those its own show_widget, compose_widget and open_widget calls stored, plus any
  openui-lang fence in its text; code-stored items never count, and tool-stored Widgets pass V4 because code checked
  them as it stored them. A fence fails V4 in an engine Session ("Write no Widget code; call open_widget or
  show_widget, or teach in words."); without the engine it is checked by `newReplyWidgetProblems` as before.
  - **The saved rule.** The gate sets `ReplyDraft.savedRule` from the Session items the turn stored
    (`savedRuleOf`), so V5, V6 and V7 hold the Learner's saved rule to the same limits as the reply: a rule that gives
    away an open quiz answer fails V5 and the reply is retried.
  - **The Widget check.** A written-ahead Widget the draft named is checked by `widgetValidator` against the Topic's
    own Widgets and the preset it carries (V4). A fence in an engine Session fails V4; with the engine off, an old
    Session's fence still passes.
- **One retry**, only while the run has used under 30 seconds (`RETRY_WITHIN_MS`). Code appends one correction
  message ("Reply check by code:" with every failed check's reason, the old Widget correction's included, and the
  Widgets already on screen) and runs the loop again. Tool effects from the draft stand.
- **Fallback** when the retry fails too, or the draft fails past 30 seconds: the step's card when `cardFallback`
  returns one (it returns null until #240 fills it), else the reply cut to its cap by `trimToCap`, ask kept, with any
  Widget that failed V4 left out. It is stored as the turn's final assistant text, so the history holds what the
  Learner saw.

Then the browser gets the held items and Widget states in their order, and the checked reply as one text. Each checked
turn writes one `reply_checks` row: words and cap, the draft's and the retry's problems with their reasons, the
correction, whether it retried, fell back or was stopped, the rejected seqs and the text shown. `openLog` leaves the
rejected seqs out of every later request: the draft's text-only messages and the correction go, and a rejected
tool-use message keeps its tool calls but not its text, so every tool_use keeps its tool_result. The rows stay
stored. `turnText`, `loadThread` and the resume and refusal paths show only what the Learner saw; a turn with no row
(an old Session) shows as before. A resume clears the screen (`replay` with no text) and checks a stored draft before
anything shows; a refusal shows earlier steps' text only when it passes. Stop drops the held reply: nothing is shown
or saved as the Tutor's reply, every stored tool call still gets its result, and the Learner's message stays with the
Stopped note. The Under the hood panel adds one line: the words, the failed checks, the retry and the fallback.

The first turn after a refreeze (a deploy changed the instructions) folds the history into one compaction summary
before the reply, so the reply's request carries the summary and no reply written under the old instructions. A
refreeze now changes only the instructions, tools, fingerprint and `refrozenAtSeq`: an existing Session keeps its
model and effort.

**Scenario.** At the concept step the Tutor writes 150 words. The Learner sees "Checking the reply…". Code sends
"Reply check by code: Your reply was 150 words. The limit is 80…", and the retry comes back at 40 words; the
Learner sees only that, in one piece. The next turn's request holds neither the long draft nor the correction, and
the `reply_checks` row keeps both with their reasons.

**Trade-off.** The Learner waits for the whole reply instead of watching it type, and a retry adds a model call. In
return nothing that breaks a rule ever reaches the screen. The 30 seconds count from the start of the run, refreeze
fold included, so the first turn after a deploy may skip the retry when its draft fails and go to the fallback. The
fold costs one compaction call per Session per instructions change. Production runs this code before the
`reply_checks` migration is applied by hand: every read and write of the table fails soft on Postgres 42P01 (logged
once), and the turn then runs as if nothing had been rejected, so a reload may show a rejected draft next to its
retry until the table exists.

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
checks the words are really in the Learner's message in that turn (Finish this reply, where the
Learner wrote nothing, is never an attempt), saves them in `insight_attempts` once per tool call ID, and decides what happens next:
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

The "settled once" rule is also held by the database: a unique index allows only one `found` or `told` row per Learner and Topic in `insight_attempts`, and the insert ignores a clash, so a second settling attempt (or a repeated tool call) is refused even if two turns ever ran at once.

**A concrete scenario.** The Learner writes "the bars get smaller". The Tutor records a not-yet, and
code replies with hint 1. After the same again, hint 2. After a third not-yet the result contains the
written Insight and the Tutor tells it kindly. Had the Learner written "just tell me" at the start, the
Insight would have come at once. All three messages sit in `insight_attempts` exactly as typed.

**Trade-off.** Judging whether the Learner found the Insight stays with the model, because only a
model can read free words; code controls everything around that judgement (the count, the hints, the
withholding, the order). A Tutor that says "found" too readily is checked by the behaviour set, not by
code. Sessions that started before this change kept their frozen tools and had no way to record an
attempt; today a change of tools refreezes each Session at its next new turn.

## The explore Widget (`explore.widget` in `course/topics/*.yaml`, `src/course/explore-widget.ts`, `src/app/widget-panel.tsx`)

**What it does.** A Topic with an explore step can name one of its written-ahead Widgets (`explore.widget`
is that Widget's id, since ticket #161) as its explore Widget. Code, not the Tutor, shows it. From the moment the explore step begins it
opens by itself in the Widget panel as an "Explore" chip, and it stays there until the Topic is passed, so
the Learner can keep playing during their turn and the Check. It is chosen from saved progress alone
(`exploreWidgetFor`), so a page reload shows it exactly the same, and an old Session page shows it too when
that Session reached the explore step (read from the Course Navigator context saved in the Session). A
newer Widget from the Tutor still opens on its own, because the explore Widget is placed after only the
Widgets the Tutor had drawn when it appeared. The Tutor's explore context tells it the Widget is already on
screen, so it points to it and does not draw its own. Before the explore step code holds it back (ADR 0001,
`exploreHeldBack`): `open_widget` refuses its id, the Written-ahead Widgets line leaves it out, and an annuity chart
the Tutor draws at the story or concept step is still sent back, told to teach in words rather than to open it.
Once the explore step has begun (or the Insight is settled, or the Topic passed), the Tutor can open it
again with `open_widget`: the panel then keeps one tab (the Explore one), the Tutor's "Open: <title> →" chip
opens it, its work is saved under the written-ahead id in both places, and the Tutor is told of it once
(`updatedInPlace` in `widget-panel.tsx`, `openWidgetsForTurn` in `src/tutor/widget-context.ts`). The page draws it
with the code as the Learner sees it now (`exploreAsSeen`), so a reveal task joins it after the reveal. It is mounted once: the page measures its width
(`useLaptopWidth`, a media query on Tailwind's lg breakpoint) and draws the Widget in one place only. Below
the laptop breakpoint (an upright iPad) a folded card, open to start, stands in the conversation column
under the Topic bar and the panel says where it went; at laptop width only the panel draws it. The
server, which measures nothing, assumes a laptop (the layout is desktop-first), so on a narrow screen the
card appears just after the page loads.

**Rules the course check holds.** The `widget` id is optional, but it must name one of the Topic's written-ahead
Widgets, whose code the written-ahead rules check (Case Data references inside the Topic's own Cases, drawable,
Guided Tasks reachable and not done at the start). Case Data still goes through the as-of rule on the server, so
the Widget cannot draw anything dated after the Case's as-of date before the reveal.

**A concrete scenario.** Present value's explore Widget is its annuity Widget, "What the annuity is worth today"
(see "Present value's annuity Widget" below), set against the sourced cash option (the one figure dated on or
before 24 October 2018). The Learner finishes the jackpot Check's concept step; the next reply ends, the page
refreshes and the "Explore" chip is already open with the slider at 5%. They ask a question, the Tutor draws a
calculator, and that newer Widget takes the panel; the Explore chip stays beside it. At the Check the Tutor calls
`open_widget` for the annuity Widget: its chip opens the Explore tab, at the rate the Learner left it. After the
Learner passes the Topic the Explore chip is gone, but the Tutor can still open the Widget. The winner's payment and
the 30-year Treasury chart are left out on purpose, so playing leads nowhere near the reveal.

**Trade-off.** The Widget is fixed text in the Topic file, so it cannot adapt to a Learner the way a Tutor
Widget can, and it costs nothing in tokens. Drawing it in one place keeps one set of sliders and one
Case Data read, but crossing the laptop breakpoint while resizing moves it, which resets the slider. An old Session is matched to the Topic by the
title in its saved context, so a Topic renamed later loses its chip on old Session pages. Work saved under the old
explore Widget's key ("explore") is not carried over to the annuity Widget's id: those Sessions open it at 5%.

### Present value's annuity Widget (`annuity-worth-today` in `course/topics/present-value.yaml`, `AnnuityChart` and `Slider` in `src/widgets/library.tsx`, `AnnuityFigure` in `case-data-view.tsx`, `annuityBreakEven` in `src/finance/present-value.ts`, `InsightSettledContext` in `src/widgets/insight-settled.ts`, spec #119, ticket #161)

**What it does.** Present value has one annuity Widget, "What the annuity is worth today" (the owner's Part 5). It
replaced the old explore Widget: code shows it at explore and the Tutor reopens it later with `open_widget`. The
Learner sets a 0–10% rate in 0.01 steps (starting at 5%, Reset back to 5%, a number box, −/+ and a **0%** quick
button; quick buttons are a new optional list on `Slider`). The chart draws the 30 payments by year, 2018 to 2047,
labelled every 5 years on a $ millions axis (`AnnuityChart`'s new optional `firstYear`), and a hover or tap reads a
bar as "Payment in 2029: $X paid → worth $Y today". Under it: Sum of payments; worth today in teal (the Learner's
assumption); the Cash option in amber (sourced, from Case Data); and two named bars on one scale, "Annuity, worth
today: $884.1M" and "Cash option: $877.8M". Its Guided Tasks: set 0% (it equals the advertised $1.537B); find where
the annuity equals the cash (ticks within 0.02 points of the break-even); and, after the reveal, set the 30-year
Treasury yield of 24 Oct 2018.

**What it holds back.** Until the Topic's Insight is settled (found or told; the Study Workspace passes it through
`InsightSettledContext`), the chart shows no verdict and no break-even, so the Learner finds the idea first. After
it, a verdict line worked out by code reads "At 3.33%, the annuity is worth $6.3M more than the cash", flipping to
"less" above the break-even, and "At about 3.38%, the annuity and the cash are worth the same." shows when the rate is
within 0.02 points of the break-even (`annuityBreakEven`, found by halving the range), or on **Show me**, offered
once the Learner has tried a rate other than the one the chart opened at. Until the reveal the "3.33% (30-yr
Treasury, 24 Oct 2018)" quick button and its task are left out: the Widget's `revealTask` adds both once the reveal
has been shown, the rate read from the `treasury-30-year` dataset under the as-of rule (its new `quick` field names
the slider and the note). Home, Notes and Older sessions draw it as before the Insight.

**Scenario.** At explore the Learner opens the Widget at 5% ($694.0M worth today against the $877.8M cash). They
press 0%: the worth today is the full $1.537B and task 1 ticks. They type 3.33: no verdict shows. They say the far
payments shrink most, so money now can beat a bigger total later; the Tutor records the Insight as found. Back in the
Widget, 3.33 now reads "the annuity is worth $6.3M more than the cash"; typing 3.38 flips it to "less", the
break-even line appears and task 2 ticks. After the reveal the Treasury button appears; pressing it sets 3.33% and
ticks the last task.

**Trade-off.** The break-even task's range (3.36 to 3.39) is written in the Topic file, because a Guided Task's
condition is plain OpenUI code the course check evaluates without Case Data; a test holds it to the break-even code
works out against the cash option, so a changed cash figure fails the test rather than drifting. The verdict and the
break-even are features of every `AnnuityChart` compared with a sourced dollar figure (it reads that figure as "the
cash"), shown only where a page says the Insight is settled; only the Study Workspace says so today.

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

The fresh-step flag is also set by the opener: the turn the page starts when a Topic's Session has
no messages cannot finish the step it teaches, because nothing of that step has been taught in this
Session (see "Choosing and opening a Topic"). The Learner's Next sets it too: the turn it runs teaches
the step code just moved them on to, so in that reply the Tutor can't finish the step, record a Check
verdict or record an Insight attempt (see "The Learner's Next and code-written turns"). So does the
first turn after a Due Check reopens a passed Topic's Session (see "Coming back").

## Simulated Learner (`scripts/simulated-learner.mjs`)

**What it does.** A script that plays the Learner over HTTP against any running copy of the app: it
signs in as the tools Learner and starts that Learner over (see "The tools Learner" below), so every run
begins from an empty Learner, and it drives the app as a Learner does (`src/dev/learner-moves.ts`, tested): it
chooses the Topic (`POST /api/jump`; the page's opener starts the Session), presses Next when the Tutor
asked nothing or a quiz was just taken (a refused Next names the step on offer, and it presses that one),
presses Finish this reply under a reply cut off at its length limit, answers the Tutor with a cheap model (`claude-haiku-5-5`),
takes the quiz through `GET`/`POST /api/quiz` (code marks it, no model call), and keeps going until the
Topic is passed. After each turn it reads the step, duration and cost from the `usage` table, and it
writes a transcript, a per-turn table and a cost summary to a folder you give it (outside the repo,
because transcripts hold source-derived text). Every database read (step, status, passes, Sessions, the
last turn) filters by the tools Learner's id. It writes nothing to the database itself: the app writes the
tools Learner's rows as it would for anyone.

It used to sign in with the owner's passcode, so it shared the owner's Learner. To start a fresh walk it
renamed the owner's Topic rows (`--reset`), and it set the app's `session_idle_hours` to 0 for one turn
to force a new Session. On 2 November that rename is what hid the owner's passed Checks. Both are gone:
Start over on its own Learner gives a clean start, and since one Session per Topic (ADR 0004) idle time
never starts a Session, so there is nothing to force and no app setting is ever changed.

**Scenario.** After a deploy, run it against the production URL: it signs in as `tools`, archives the
tools Learner from the last run, and fourteen turns later you have a transcript of a whole Topic, the
cost per turn and the longest turn. The owner opens the Study Workspace afterwards and finds his own
Topic exactly where he left it.

**Trade-off.** It talks to the real Tutor and the real database, so each run costs about a quarter of a
dollar, and each run leaves one more archived tools Learner with its rows (nothing is deleted, so the
history of runs stays readable). The Learner is a model, so it is polite and quick to follow: it checks
the plumbing and the pacing, not whether a real person finds the teaching good. It reads the database
directly for cost and step, so it must use the same `DATABASE_URL` as the app, and the app's `PASSCODES`
must list the same `tools` pair as the script's environment.

**How it is tested.** The pacing rule and the paragraph break are tested at the Tutor Turn seam with the
scripted client. The runner itself is a script, checked by running it end to end (evidence folder for #11).
Its sign-in and its reads live in `src/dev/simulated-learner.ts` and are tested against the real login
and Start over routes on the in-memory database (`simulated-learner.test.ts`).

## The tools Learner (`src/dev/simulated-learner.ts`, `src/dev/tools-learner.ts`, spec #119, ticket #158)

**What it does.** The owner's test tools run as their own Learner, named `tools` (`TOOLS_NAME` in
`src/auth/passcode.ts`), never as the owner or the owner's `test` Learner. Each run first does Start over
on that Learner: the active tools Learner is archived (its rows stay, untouched) and a fresh, empty one
opens under the same name. Then the run reads and writes only that fresh Learner's rows.
- **Over HTTP** (the simulated learner and the browser check): `signInAsToolsLearner` posts the tools
  passcode to `/api/login`, then posts the confirmed Start over to `/api/start-over` with the site's
  Origin, exactly as Settings' button does, and keeps the new cookie. The passcode comes only from the
  `tools:` pair in `PASSCODES`; with none listed the tool stops with that reason, and there is no fallback
  to `PASSCODE` (which would sign in as the owner).
- **In memory** (the model comparisons and the behaviour run): each question's throwaway database calls
  `freshToolsLearner`, which does the same sign-in and Start over in code, and every placement, Learner
  Profile and Tutor Turn of the run names that Learner.

**Scenario.** The owner runs the browser check against a local server on a Neon test branch. It starts
the tools Learner over four times (one per part) and seeds each fresh Learner with inserts only. Later
he signs in as `test` on the same branch: his test Learner's Welcome, Sessions and progress are as he
left them, and so are the owner's.

**Trade-off.** One more name in `PASSCODES` to keep in step between Vercel, `.env` and the tools. Archived
tools Learners pile up, one per run; they cost a few rows each and show the history of runs, and nothing
lists them to a Learner. The in-memory runs gain nothing in safety (their database is thrown away), but
playing the same Learner as the HTTP tools means a run reads exactly like a new Learner's.

## Course Map page and jumps (`/course`, `/progress`, `/api/jump`, `src/course/navigator.ts`)

**What it does.** Two ordinary pages, read from saved progress only (no model call, no randomness),
so they look the same on every visit. The **Course Map** page (`/course`, spec #119, ticket #150)
is built to be scanned, not scrolled:
- It starts with one big **Recommended next** card. Its button is What comes next (`whatComesNext`),
  the same label Home's button and the Topic complete card show ("Resume: …", "New in …: Check N",
  "Next Topic: …"), and it opens that Topic.
- **Foundation Topics are grouped by Subject** in collapsible sections (`<details>`), each with "n of m
  passed". Only the Subject holding the Learner's current Topic (or, with none, the recommended one)
  is open. Follow, Judge and Analyse are their own sections, collapsed unless they hold that Topic.
- **Each Topic row is one whole-row link**: the title is a link stretched over the row, so there are
  no more 94 identical buttons. A row not yet passed chooses the Topic; the current row opens it; a
  **passed row shows Passed ✓ and opens the Topic's Session read-only** (`/sessions/<id>`, found by
  `topicSessions`; Past Sessions when the pass came from an Older Session).
- **Prerequisites not yet passed show as "Do first: <title>" links**, which choose that Topic and open
  it. They sit above the row link, so they can be clicked on their own.
- **Check pills show only once a Topic is started** (a tick for a pass, a frame round the Check the
  Learner is at), with the status and Teaching Step and a "You are here" label.

The **progress** page (`/progress`) has a title and a one-line summary, "2 in progress ·
1 passed · Next: Bond prices", where Next is What comes next's Topic (`whatComesNext`, the same one
Home's button shows; left out once every Topic is passed). Below it is a table: each Topic's Stage,
status (not started, in progress or passed) and how many Checks are passed. Both pages come from one
pure Course Navigator function, `courseOverview`, so what the page shows and what the Tutor is told can
never disagree. Progress has no About you link: About you lives in Settings.

Every Progress row's title opens its Topic: a plain form posting `topic` to `/api/open` (no scripts
needed), which goes on to `/study`. A Topic not yet passed becomes the current Topic, as a jump does,
with no prerequisite prompt (the Learner picked it from their own record). A passed Topic can't be
chosen, so its own Session is shown instead (`learner_state.shown_session_id`), read-only with its
Topic complete card, exactly as after the turn that passed it; the current Topic doesn't move.
Scenario: Present value is passed and the Learner is in Bond prices; they open Present value from
Progress, reread its Principle, then press What comes next to go back to Bond prices. A passed Topic
with no Session of its own (passed in an Older session, before Sessions were per Topic) goes to Past
Sessions instead, as its Course Map row does, and nothing changes. Trade-off: that row lands on the
whole list rather than the one Older session that passed it, which would need a search of Older
sessions by Topic; the list shows it near the top under Older sessions.

If a chosen Topic has prerequisites the Learner hasn't passed, the row first warns: "Bond prices
builds on Present value, which you have not passed yet. You can fill the gap first, or go ahead
anyway." Filling the gap is the easy path: the main button is **Study <first unpassed prerequisite>
first** (it chooses and opens that Topic), then **Go ahead anyway**, then **Not now**. Either choice calls `/api/jump`,
which saves only the current Topic (`learner_state.current_topic_id`) and shows its Session at once
(see "Choosing and opening a Topic"). Every other Topic keeps its step and passes untouched. After the
jump, the page does a full load of `/study`, the Study Workspace. A "Back to the default path"
button clears the choice. Passing the chosen Topic also
returns the Learner to the default path (that rule was already in the Navigator). Asking an off-map
question changes nothing: the place is always computed from saved progress, and only tools and jumps
write it. A jump is refused while a turn is running, so the Tutor's tools never act on a Topic that
changed under them.

The old pending switch is gone: a jump used to set `learner_state.entered_by_jump`, and the next turn
carried a note about it. Now the chosen Topic's Session shows at once, and if it has no messages the
page starts the opener, which teaches the saved step afresh. The two `entered_by_jump` columns are no
longer written or read; a later contract migration can drop them.

**Course Map edits.** Tested in the Navigator: an inserted Check becomes the place if it comes
first without a pass; an inserted Topic appears as not started without moving the Learner; a removed
Check or Topic keeps its records and is ignored (a chosen Topic that was removed sends the Learner
back to the default path); a reorder of Checks or Topics keeps every pass and changes only what comes
next; an added prerequisite never moves the Learner out of a started Topic and is shown as unmet, also
in the jump prompt.

**Scenario.** The Learner is halfway through Present value (at Check 2's concept) and is curious about
bonds. They open the Course Map: the Recommended next card says "Resume: Present value →", and only
the Numbers & time value Subject is open. They open the Bonds & credit Subject and click the Bond
prices row, see the warning, and press Go ahead anyway. The workspace opens Bond prices' own (empty)
Session and the opener starts by itself: the Tutor tells the Bond prices story. Two days later they
press "Back to the default path": Present value's thread shows at once, still at Check 2's concept.
Had they pressed "Study Present value first" instead, Present value would have opened straight away.
Later, the passed Compounding row (Passed ✓) opens Compounding's Session to reread, with nothing to send.

**Trade-off.** The warning is a prompt, not a block: the Learner may study out of order, at the cost
of meeting ideas before their foundations (the Tutor sees the unmet prerequisites in its context). A
passed Topic can't be chosen again as a jump; its row opens its Session read-only instead, and spaced
review will bring back its questions. Collapsing every Subject but the current one makes the page
short and puts the Learner's place in view, at the price of a click to see the rest; the
Recommended next card means most visits need no scanning at all. A whole-row link with links inside
it (Do first) needs the stretched-link pattern rather than nested anchors, which HTML forbids. Rows
keep a dot for not started, current or passed, in default-path order within each group. Progress, the Passage view and Login use the same
design tokens; the first two sit under the app header, Login (signed out) has none.

## Choosing and opening a Topic: the shown Session, the opener and turn kinds (`/api/jump`, `/api/open`, `session-log.ts`, `context.ts`, `tools.ts`, `turn-stream.ts`, spec #119, ticket #131)

**What it does.**
- **Choosing a Topic** sets the current Topic and shows its Session at once. The ways in today: the
  Course Map's Topic rows, Do first links, Study X first, Recommended next and Back to the default
  path, What comes next (on a passed Topic, see below), and Home's Resume and Start (a plain form
  posting to `/api/open`, which goes on to `/study`). Progress rows post a `topic` to `/api/open`
  (see above), and the Welcome's Start this Topic uses `/api/jump`. While a turn is running,
  `/api/jump` answers "A turn is in progress…" and changes nothing; `/api/open` then just opens the
  Study Workspace, which says the same.
- **The shown Session** (`learner_state.shown_session_id`) is what the Study Workspace renders
  (`shownInWorkspace`). A turn saves the Session it runs in, and so does a quiz submission that passes
  the Topic (its last Due Check), which is not a turn; choosing clears it, which means "the
  current Topic's own Session, or that Topic before its first turn".
- **A failed turn with no Session.** A turn that failed (or was cut off) before it reached a Session has
  no Topic on its row, so the page shows it on whatever Topic is current. Choosing another Topic sets
  it aside (marks it finished), so the new Topic's opener starts and a Retry never sends the left
  Topic's message into the new Topic's Session. Choosing the same Topic keeps it and its Retry. The
  trade-off: the Learner's unsent message is dropped rather than kept for the Topic they left, which
  needs no new column.
- **The opener.** When the shown Session has no messages (and no turn is unfinished), the page starts a
  turn by itself (`{ opener: true }`). Code writes its note, starting "Opener by code:", and no Learner
  bubble is drawn. The note teaches the saved step: the Story in a Topic not yet started; otherwise the
  step reached, which nothing in this Session has taught yet. At an open quiz, the Check tab is already
  selected on the right and the note tells the Tutor to point the Learner to it. An opener is a fresh
  turn (the pacing rule), and a second opener for a Session that already has messages (another tab got
  there first) gets the reload message.
- **Turn kinds.** A turn records its kind (`turnKind`): a code-written turn saves its note, with its
  fixed prefix, as the turn's input, so "opener" (and, since the Learner's Next, "next", and since Tell the
  Tutor what I found, "widget_report") is read off the turn row and a Retry sends the same note again. Every
  other turn is a "message" (or a "chip"). On the wire, `src/tutor/turn-body.ts` is the one list of kinds:
  `/api/turn` parses the body with its zod union (one kind per request; a body naming two is refused
  rather than silently picking one) and the browser's `TurnBody` is its type, so a new kind is one entry
  there plus its handler in the Tutor Turn.
- **A Topic passed in a turn** (its Principle finished, or its last Due Check passed): the tool result
  tells the Tutor "Topic complete: stop here" and gives no context for another Topic, and the next
  Topic is not started. The Learner's current Topic moves on, but the shown Session stays: the
  Workspace keeps the passed Topic's thread on screen, and in place of the message box shows
  "<Topic> is passed." with What comes next ("Next Topic: Bond prices →") and the Course Map.
- **The empty right panel** reads "Widgets for this Topic will appear here."

**Scenario.** The Learner finishes Present value's principle. The Tutor's tool result says "Topic
complete: stop here"; it closes the Topic in two sentences and stops. The page refreshes: the thread
stays, the message box gives way to "Present value is passed." and "Next Topic: Bond prices →". They
press it: Bond prices' Session is empty, so the opener starts at once and the Tutor tells the Bond
prices story, with no Learner bubble above it. A week later they press Resume on Home: Bond prices
opens at the step they reached, and if its Session were new the opener would teach that step afresh.

**Trade-off.** The page, not the server, starts the opener, so a render still makes no Session and no
model call; the price is one extra request on opening an empty Topic, and a tab closed before it starts
just starts it next time. The kind lives in the note's prefix rather than its own column (this ticket
adds no migration), which is enough while each code-written turn has its own fixed prefix. A passed
Topic waits for the Learner rather than flowing on: one more click, but the Tutor never starts the next
Topic inside the last one's conversation.

**How it is tested.** At the Tutor Turn seam (`topic-sessions.test.ts`): the opener stores no Learner
message, is recorded as an opener, teaches the Story of a new Topic and the saved step of a started
one, points to the Check tab at an open quiz, runs once per Session, and retries as an opener; a passed
Topic gets "Topic complete", starts nothing, stays shown and refuses further turns until What comes
next. Through the routes (`api/jump/route.test.ts`): each way of choosing shows its Topic at once,
and each answers "turn in progress" while a turn runs. In the workspace render: the passed Topic's
bar with no message box, and the empty panel's words. The jump tests in `turn.test.ts` now use the
opener.

## Session items and step dividers (`src/tutor/session-items.ts`, `finish_teaching_step` in `tools.ts`, `loadThread` in `transcript.ts`, `src/app/session-item-view.tsx`, `thread.tsx`, `turn-stream.ts`, spec #119, ticket #132)

**What it does.**
- **Stored, not sent.** A Session item is a row in `session_items`: the Learner, the Session, the seq
  of the message it follows, a kind and its data. The model's history is read only from `messages`
  (`openLog`), so no item ever reaches a request, and nothing about the Tutor's instructions changes.
- **The step divider.** When the Tutor finishes a Teaching Step with `finish_teaching_step`, the same
  database transaction stores a divider of kind `step` after the Session's latest message (the reply
  part holding the tool call). The Course Navigator numbers and names it from the Learner's new place
  (`stepSequence`): `{ step, number, label: "Step 3 of 9 · Your turn" }`. A refused finish stores
  nothing; a finish that passes the Topic stores none either (the Topic complete card marks that);
  a repeated tool call, or one re-run after a cut-off, returns its saved result and stores no second
  divider.
- **Every other move on gets one too.** A conversation Check's pass (`record_check_verdict`) moves the
  Learner on, so its divider follows the "Check 2 — passed ✓" card in the same transaction ("Step 8 of 9 ·
  Reveal"). A step reached outside a turn (a quiz pass, or a Due Check reopening a passed Topic) has its
  divider stored by whichever turn teaches it first: the Learner's Next stores it with the move, and a
  typed message or help chip stores it right after the Learner's message, before the reply, and streams it
  as an item. So every step the Topic bar marks done has a divider to scroll back to.
- **Drawn in place.** `loadThread` is `loadSession`'s lines with each item placed after the message it
  follows. An item that falls inside a reply (the Tutor gave feedback, finished the step, then began
  teaching the next one) cuts the reply in two there; every part but the last carries `more`. The
  Study Workspace and the old Session page both read it, so a reload draws the same dividers in the
  same places. `loadSession` itself still gives one line per reply, which Save to notes keys on.
- **Drawn by kind.** The thread carries an item as an assistant-ui system message, and
  `SessionItemView` draws it by its kind: a `step` item is a small centred line with its label. A kind
  it does not know draws nothing, so an item from a later change never breaks the thread. The
  Picking up and Due Check dividers (`picking_up`, `due_check`, see "Coming back") are drawn the same way; Check results and Topic complete add their kind there and
  store their rows the same way. The kinds live in `src/tutor/session-item-kinds.ts`, which has no server
  imports, so the browser's views and checks key on the same constants the server stores.
- **Live.** The turn streams `{ type: "item" }` as the tool stores it. The browser ends the reply part
  on screen, draws the divider and streams the rest of the reply into a new part. A replayed reply
  (a resume after a cut-off, or a refusal) arrives as one text, so it replaces the parts and their
  dividers until the next reload draws them again.
- **One reply, several parts.** Save to notes still saves the whole reply, so it shows once, after the
  last part; "Under the hood" sits there too. Widget chips are keyed per part, and their save number
  counts on across the parts, as the saved reply numbers them.

**Scenario.** The Learner answers the Story's question. The Tutor writes "Good thinking.", calls
`finish_teaching_step` with `story`, and goes on: "Now the concept: money today is worth more." On
screen, "Good thinking." ends, a thin centred line reads "Step 2 of 6 · Concept", and the concept
follows under it. They reload: the line is in the same place. The Tutor's next request has the two
reply parts and the tool result, and no "Step 2 of 6".

**Trade-off.** Items live in their own table rather than as messages, so the model's history needs no
filtering and stays add-only; the price is a second read when drawing a Session and the work of placing
items between and inside replies. Cutting a reply into parts keeps the divider where the step really
changed, at the cost of a reply that Save to notes, Widget numbering and a replay must treat as one.
A replayed reply loses its dividers on screen until a reload, which keeps the browser simple for a rare
case.

**How it is tested.** At the Tutor Turn seam (`step-dividers.test.ts`, scripted client on in-memory
Postgres): finishing a step streams one item between the reply's parts, `loadThread` draws it after
the part that finished the step (and again after a reload), and the next model request has nothing
from it; a reply that moves on before writing anything has the divider before it; a refused finish
and a finish that passes the Topic store none. In the workspace render: the divider is a small centred
separator between the parts, with one Save to notes; Widget chips stay in each part; an unknown kind
is skipped. The old Session page draws the divider between the parts too.

## The Learner's Next and code-written turns (`src/tutor/next.ts`, `turn.ts`, `turn-status.ts`, `transcript.ts`, `Chips` in `workspace-parts.tsx`, `left-column.tsx`, `turn-stream.ts`, spec #119, ticket #133)

**What it does.**
- **The Next chip.** Under the latest Tutor reply or card (a step divider ending the thread counts), the
  Learner sees one chip from the Course Navigator's offer (`nextOfferNow`, which the page reads on every
  render): "Next: <step> →", "Complete this Topic →" at the Principle, or "Just tell me →" at an Explore
  whose Insight is not yet found or told. There is no Next while a quiz or conversation Check is open,
  nor after a miss (the Check stays open). The chip is also hidden under the Learner's own message,
  while a turn runs, until the page has re-read the Learner's place after one (`router.refresh` runs in
  a transition, and its pending flag hides the chip), while Retry is offered, and on a passed Topic kept
  on screen. The old status card and its Continue button are gone (the Topic bar stands there now), and so
  is the cut-off reply's Continue (see "Finish this reply, and old Continue as a divider").
- **Pressing Next** sends `{ next: <step> }` (or `"complete"`) and no Learner message. The Tutor Turn
  takes the Learner's lock first, then in one transaction (`takeLearnersNext`): checks the press is the
  Next on offer (`takeNext`: never past a Check without a saved pass, never past an unsettled Explore,
  and it must name the step on offer), advances with `saveFinishedStep`, stores the step divider after
  the Session's latest message, and saves the turn's note, its Session and the fresh-step flag on the
  turn row. A refused Next deletes its just-made turn row, stores and sends nothing, and the route
  answers 409 with the reason, which the page shows in place of the reply. A taken one streams the
  divider first, then runs the turn from the note, so the reply that teaches the step follows the line.
- **Just tell me** is not a Next: it posts "Just tell me." as the Learner's own message, and the Tutor
  records it as asking to be told (code holds that; see "Help chips, and which messages count as Insight attempts").
- **Steps not yet begun.** A step reached outside a Tutor turn has not begun (`stepBegun`): the step a
  quiz pass moved the Learner to, until a turn tells the Tutor of that pass, and the first step of a Due
  Check run, until its "New Check" divider is stored. Its chip names that step ("Next: Concept →" for
  Check 2's Concept), and pressing it stores its divider and teaches it without moving on. Once taught,
  the chip names the step after it again.
- **Coming back.** A Picking up or Due Check divider the page drew (see "Coming back") is worked out
  before the move and stored with the Next, ahead of the step divider, so the thread reads "Picking up
  where you left off · Step 3 of 9 · Your turn", then "Step 4 of 9 · Check".
- **Complete this Topic** passes the Topic (the Principle, or the end of a Due Check run), stores no
  divider (the Topic complete card marks it), and runs the turn in that Topic's own Session, which
  the turn row pins: the note tells the Tutor "Topic complete: stop here", no Course Navigator context
  for another Topic is sent and the next Topic is not started. The turn ends at the Topic complete card
  (see "The Topic complete card"), and the page shows the passed Topic with it.
- **Code-written turns.** The opener's note starts "Opener by code:", Next's "Next by code:", Finish
  this reply's "Finish by code:" and a widget report's "Widget report by code:" (`CODE_WRITTEN_PREFIXES`). Each is saved as the turn's input and stored as the turn's user message,
  so the model sees it, but the thread never draws it as a bubble, and a reply after it always starts
  its own line rather than running on from the reply before. The turn's kind is read off the prefix
  (`turnKind`: message, chip, opener, next, finish or widget_report), and Retry re-runs that kind: a failed Next re-sends its note
  without moving the Learner on a second time, because the move was saved once when the turn began.
- **Fresh pacing.** Next turns and openers are fresh: in that reply the Tutor teaches the step and
  can't finish it, record a Check verdict or record an Insight attempt (the pacing rule's rejections).

**Scenario.** In Present value the Tutor finishes the Story. Under its reply the Learner sees "Next:
Concept →" and presses it. No bubble appears; a thin line reads "Step 2 of 10 · Concept" and the Tutor
teaches the Concept under it, stopping with a question. Later they pass the quiz for Check 1 in the
Check tab; the chip reads "Next: Concept →" again, now for Check 2's Concept, which code reached but the
Tutor has not taught, so pressing it draws "Step 5 of 10 · Concept" without skipping it. At the Explore
the chip reads "Just tell me →" until they find the Insight; at the Principle it reads "Complete this
Topic →", and pressing it passes the Topic and the Tutor closes it in two sentences.

**Trade-off.** Whether a step has begun is worked out from what is stored (an unreported quiz pass, a
Due Check divider not yet stored) rather than its own column, since this ticket adds no migration: each
new way of reaching a step outside a turn must add its own test there. The move is saved before the
model is called, so a Next whose turn then fails leaves the Learner on the new step with Retry on offer,
rather than undoing the move. A refused Next costs a lock round-trip but can never race a second tab.

**How it is tested.** At the Tutor Turn seam (`next.test.ts`, scripted client on in-memory Postgres):
Next advances, streams and stores the divider, stores no Learner message and sends the note; it is
refused (nothing stored, sent or locked) at an open Check, after a miss, at an unsettled Explore and
when it names another step; after a quiz pass it teaches the step not yet begun without moving on; its
turn is fresh for finishing, verdicts and Insight attempts; a failed Next's Retry re-sends the note
without a second move; Complete this Topic passes the Topic and closes it, on Retry too, in the same
Session. In the workspace render (`workspace.test.tsx`, `message-box.test.tsx`): one chip under the
latest reply or divider only, none under a Learner message or in an empty thread, none while a Check is
open, during a turn, while the page refreshes or with Retry on offer, Just tell me at Explore, Complete
this Topic at Principle, and no Continue above the chat.

## Finish this reply, and old Continue as a divider (`turn.ts`, `turn-status.ts`, `tools.ts`, `left-column.tsx`, `thread.tsx`, `src/dev/learner-moves.ts`, spec #119, ticket #134)

**What it does.** The word "Continue" is gone from the app and from everything the Tutor is told.
- **Finish this reply.** When a reply stops at its length limit (`max_tokens`), the line under it reads
  "The reply was cut short." with a **Finish this reply** button. Pressing it sends `{ finish: true }`
  and no Learner message: code writes a note, "Finish by code: the Learner pressed Finish this reply, and
  has written nothing. Your last reply was cut short …", saves it as the turn's input and stores it as
  the turn's user message, so the Tutor finishes from where it stopped and the thread draws no bubble
  (the rest of the reply starts its own line under the cut one). A tab opened before the change still
  sends `continue`; the route reads it as Finish this reply.
- **Retry re-sends the turn's own note.** An opener, a Next or a Finish this reply that failed re-sends
  its note on Retry, never "Continue.". A turn from before the change that saved "Continue." (or nothing)
  is sent the Finish note instead, so "Continue." is never stored again by any path.
- **Never an Insight attempt.** Finish this reply's note is code-written, so `record_insight_attempt`
  refuses it like every note code wrote, and an old "Continue." too (see "Help chips, and which messages
  count as Insight attempts").
- **What the Tutor is told.** The instructions, the Insight tool's description, the Course Navigator's
  explore context and the cut-short notice no longer say Continue; they say a turn code started from a
  button, with no words of the Learner's, is not an attempt.
- **Old Continue as a divider.** Old Sessions still hold "Continue." messages. `withNextStepDividers`
  (`thread.tsx`) draws each one as a small "→ next step" divider, in the Study Workspace's thread and on
  Past Sessions pages alike; nothing stored changes.
- **The test tools** drive the app as a Learner now does (`learner-moves.ts`): choosing a Topic (with
  `saveJump`, which is what the Course Map's choose calls) and then the opener, Next, Finish this reply,
  or a typed message. The simulated learner, the comparison runner (it finishes a cut-short reply with
  Finish this reply), the Widget live run (its 2 November ask now starts with the opener) and the
  browser check (its seeded Session opens with an opener note) send no Continue; the behaviour run never
  did.

**Scenario.** The Learner asks for the whole history of the 1994 rate rises and the Tutor's long reply
stops mid-sentence. Under it: "The reply was cut short. Finish this reply". They press it: no bubble
appears, and the rest of the reply streams in below the cut part. The network drops halfway; Retry sends
the same Finish note again. In Past Sessions, last month's Present value Session shows "→ next step"
lines where it once showed "Continue." bubbles, and the Study Workspace draws them the same way.

**Trade-off.** Finish this reply is a new turn, so the finished part sits in its own line under the cut
one rather than joined to it; joining them would mean rewriting a stored reply. Old "Continue." messages
are recognised by their exact text when drawn, so a Learner who once typed exactly "Continue." sees a
divider there too; we keep the stored rows untouched rather than migrate them. Mapping an old saved
"Continue." to the Finish note on Retry is only right for a cut-off; for a plain failed old turn the
Tutor is asked to finish a reply that was complete, a one-off that can only happen for turns left
failed before the deploy.

**How it is tested.** At the Tutor Turn seam (`finish.test.ts`, scripted client on in-memory Postgres):
Finish this reply runs from the note, stores no Learner message and sends no Continue; Retry of a failed
Finish, opener and Next re-sends its own note; a saved old "Continue." turn's Retry sends the Finish note;
no stored message holds "Continue."; the instructions, tool descriptions and explore context never say
Continue. `explore.test.ts`: Finish this reply is never an Insight attempt. In the workspace render
(`message-box.test.tsx`, `workspace.test.tsx`): the cut-off reply offers Finish this reply and no
"Continue" anywhere in the markup, and an old "Continue." draws as "→ next step" between its replies.
`learner-moves.test.ts`: the test tools' moves are the opener, Finish this reply, Next (re-pressed on the
step a refusal names) or a message, and never Continue.

## Help chips, and which messages count as Insight attempts (`src/tutor/chips.ts`, `Chips` in `workspace-parts.tsx`, `left-column.tsx`, `turn-status.ts`, `record_insight_attempt` in `tools.ts`, spec #119, ticket #135; Go deeper from spec #229, ticket #233)

**What it does.**
- **Two help chips** sit beside Next under the latest Tutor reply or card: **Go deeper** and **Show me in
  a widget**. Go deeper replaced "Explain that more simply" (spec #229), because the Tutor's first
  explanation is now the simple one, so the help a Learner asks for is one more layer, not a simpler one. They follow the Next chip's rules for where they stand (never under an
  older reply or the Learner's own message, not during a turn, a refresh, with Retry on offer, or on a
  passed Topic), with one difference: while a quiz or conversation Check is open Next is hidden but the
  two help chips stay, so a Learner who is stuck can always ask for help in another form.
- **Pressing one** posts its words ("Go deeper.", "Show me in a widget.") as the
  Learner's own message, drawn as their bubble, and the Tutor answers it as an ordinary turn. The words
  of every chip, Just tell me included, live in one small module (`chips.ts`) that both the page and the
  Tutor Turn read. A turn whose input is exactly a chip's words has the kind **chip** (`turnKind`), read
  off the saved input like the opener's and Next's prefixes, so Retry re-runs it as a chip.
- **Old chip words.** No chip sends "Explain that more simply." any more, but old Sessions hold it. It stays in
  `OLD_CHIP_MESSAGES`, part of the chip words, so those turns still read as chip turns: Retry re-runs them as
  chips and they never count as an Insight attempt.
- **Which messages can count as an Insight attempt.** Only words the Learner typed. The Insight tool
  refuses, with no row stored: an old "Continue." (from before Finish this reply), any note code wrote
  (every prefix in `CODE_WRITTEN_PREFIXES`: the opener's, Next's, Finish this reply's and the quiz
  follow-up's; widget report notes join that list when their ticket adds them), and the two help chips. "Just
  tell me." is a chip that counts only as asking to be told: whatever outcome the Tutor reports for it,
  code records `asked_to_be_told`, so the Insight is told at once and it is never a not-yet. The order
  of ADR 0001 (hint one, hint two, then the Insight) is unchanged, because only typed not-yets move it.

**Scenario.** At the Explore of Present value the Learner reads the question and presses "Go deeper".
Their bubble reads "Go deeper." and the Tutor adds one more layer to the question. If the Tutor then
tried to record that as a not-yet, code refuses it and no hint is released, so the Learner's first typed
guess still gets hint 1. Later, mid-quiz, the chips "Go deeper" and "Show me in a widget" still sit under
the last reply, though Next does not. A Session from last month, where they pressed "Explain that more
simply", still shows that bubble, and that turn is still a chip turn.

**Trade-off.** The chip kind is worked out from the exact words, with no column (this ticket adds no
migration), so a Learner who types exactly "Show me in a widget." is treated as having pressed the chip.
Keeping the old words in the list means a Learner who types exactly "Explain that more simply." today is
treated the same way, which is the price of old Sessions reading correctly.
That is harmless: the words ask for help, not an answer. A Tutor that ignores the refusal can still
write a hint in prose, but nothing is stored and the hint count does not move.

**How it is tested.** At the Tutor Turn seam (`explore.test.ts`, scripted client on in-memory
Postgres): each help chip is sent as the Learner's message, its turn kind is chip and its attempt is
refused, while a typed answer after it still counts as hint 1; an opener's note is refused; "Just tell
me." reported as not-yet is stored as asked to be told and tells the Insight. In the workspace render
(`workspace.test.tsx`): both chips under the latest reply only, beside and after Next, staying with no
Next while a quiz or conversation Check is open, and gone on a passed Topic.

## Coming back: Picking up where you left off, read-only passed Topics and Due Checks (`src/tutor/coming-back.ts`, `turn.ts`, `src/app/study/page.tsx`, `session-item-view.tsx`, `left-column.tsx`, `_landing/landing.tsx`, spec #119, ticket #136)

**What it does.**
- **Coming back after a break.** When the Learner's current Topic's Session last had a message longer ago
  than the idle setting (`session_idle_hours`, default 6), the Study Workspace ends the thread with a
  centred divider: "Picking up where you left off · Step 6 of 10 · Concept", numbered and named by the
  Course Navigator. No model call: the Tutor says nothing until the Learner acts.
- **Worked out, then stored with the next action.** `comingBackItems` works the divider out from the
  Learner's place and the gap. The page only draws it (appended to the thread, never saved), so viewing a
  page adds no rows. The Learner's next turn (a message, the opener, anything but a resume) works it out
  again before changing anything and stores it as a Session item (`picking_up`) after the Session's latest
  message, so it sits just above what they write next. That closes the gap, so the next page draws no
  second one. Like every Session item it is never sent to the model.
- **Carried-over Topics.** A Topic started before one Session per Topic has progress but no message in a
  Session of its own. Opening it draws the same divider, and the opener (which the page starts for a
  Session with no messages) stores it first, so the thread reads "Picking up where you left off · Step 4
  of 9 · Your turn" and then the Tutor teaching that step. A Topic never started gets nothing: its Story
  just begins.
- **Passed Topics are read-only.** A passed Topic's Session on screen has no message box and sends no
  turns; it shows **Passed ✓** and "<Topic> is passed." with What comes next and the Course Map, never
  Resume.
- **Due Checks reopen the Topic's own Session.** When a passed Topic gains a required Check (or a required
  Explore), the Course Navigator takes the Learner back to it before anything new. Its own Session is the
  current Topic's again, so it opens with its whole old thread, ending in "New Check · Check 3" (or "New
  step · Explore"), drawn and stored the same way (kind `due_check`). It takes the place of Picking up, and
  marks a run once: the item records what was due (`keys`), and a later step of the same run draws none.
  The turn that stores it is fresh (the pacing rule): the Tutor teaches the new step and cannot finish it in
  the same reply.
- **Home's button is What comes next** (see "Home"): "Resume: <Topic>" for the chosen Topic, else "New
  in <Topic>: Check N →" or "New in <Topic>: Explore →", else "Next Topic: <title> →".

**Scenario.** The Learner stops at Present value's Concept on Friday evening and opens the site on
Monday. Home reads "Resume: Present value". The Study Workspace shows Friday's thread and, under the last
reply, "Picking up where you left off · Step 6 of 10 · Concept"; nothing has been saved yet, and a
reload shows the same. They type a question: that turn stores the divider above their message and the
Tutor answers. A month later the owner adds a required third Check to Percent, which they passed long
ago. Home now reads "New in Percent: Check 3 →"; pressing it opens Percent's own Session, the old
conversation intact, ending in "New Check · Check 3".

**Trade-off.** Working the divider out on every render costs a few small reads, but a page view can never
write. Storing it with the next action means a tab left open across the break (never reloaded) does not
show the divider until a reload, and a quiz submitted after the break leaves its divider to the next
turn. The gap is measured per Session, so going back to a Topic untouched for a week gets the divider
even if the Learner was busy in another Topic an hour ago; that is the point of it. A Due Check run is
marked by what was due, so a later edit that adds another Check is marked again, as it should be.

**How it is tested.** At the Tutor Turn seam with the scripted client on in-memory Postgres
(`coming-back.test.ts`): after seven hours the divider is worked out but not stored, the next turn stores
it before the Learner's message, the model request has nothing of it, and nothing more comes after; a gap
under six hours draws nothing; a carried-over Topic's opener stores it before the reply, and a new Topic
gets none; a Due Check reopens the same Session with "New Check · Check 2" stored before the next
message, the Tutor's finish in that turn is refused, and a break then draws only the Due Check divider;
a due Explore says "New step · Explore"; a passed Topic with nothing due draws nothing. In the workspace
render: the Picking up and Due Check dividers as centred separators after the last reply with the message
box ready, and Passed ✓ with no Resume on a passed Topic. Home's button rule (`landing.test.tsx`) covers
Resume, Start, New in <Topic>: Check N →, Explore → and Next Topic.

## Check result cards and the quiz follow-up (`src/tutor/check-results.ts`, `record_check_verdict` in `tools.ts`, `checkTabNow` and `retryQuiz` in `src/learner/quiz.ts`, `/api/quiz`, `quiz-panel.tsx`, `conversation.tsx`, `session-item-view.tsx`, spec #119, ticket #141)

**What it does.**
- **Result cards are Session items.** A Check's result shows in the conversation as a small card, stored in
  `session_items` (kind `check_result`) after the latest message of the Check's Topic Session, so, like a
  step divider, it is drawn but never sent to the model.
  - A quiz's card is stored when the Learner presses Submit answers, in the same transaction as the result,
    so a repeat submission stores no second card. It is worded from the marking against the Check's pass
    rule: "2 of 3 — passed ✓", adding "· let's look at question 3" when one was missed, or
    "1 of 3 — not passed yet · let's look at question 2" (the first missed question).
  - A conversation Check's card is stored when the Tutor records its verdict: "Check 2 — passed ✓" or
    "Check 2 — not passed yet". Next stays hidden until then, as at any open Check.
  - The submit answers with the card, so the page draws it at once; a reload draws it from the table.
- **After a pass**, nothing runs: the page re-reads the Learner's place, and the Next chip comes back under
  the card, naming the step the pass reached, which has not begun yet.
- **After a miss**, the page starts a quiz follow-up turn by itself (once no other turn is running). It is a
  code-written turn like the opener and Next: its note starts "Quiz follow-up by code:", it draws no Learner
  bubble, its kind is `quiz_follow_up`, and Retry re-runs it. The Tutor gets the usual "Quiz result by code"
  note with every missed question, but the follow-up note (spec #229, ticket #233) points it at the first
  missed one only, which code names with the Learner's choice and the right answer. In 60 words or fewer the
  Tutor names the slip in one sentence (the Known mistake, when the quiz result names one for that question),
  gives the one-line fix, and asks one similar question with new numbers that appear nowhere in the quiz. No
  re-teaching, no other task, and no walk through the other misses: the Check tab shows them. A follow-up with
  no missed result waiting (another tab already ran it) is refused and nothing is stored.
- **Try Check k again.** After a miss the Check tab keeps the marking with **Try Check k again →**. The page
  reads the tab with `checkTabNow`, which returns the missed attempt's marking and makes no new attempt;
  only the press (`POST /api/quiz` with `{ retry: true }`) makes the next one, with different questions where
  there are any. (`GET /api/quiz`, which scripts use, still opens the next attempt itself.)
- **Everything else re-reads.** The submit and every turn end refresh the page, so the Topic bar's strip reads
  the new result without reloading the Session; the Course Map and Progress read it on their next visit.

**Scenario.** The Learner submits Check 1 of 2 with one of three right. "1 of 3 — not passed yet · let's look at
question 2" appears under the last reply, and with no message from the Learner the Tutor takes question 2
only: "You read 45 basis points as 4.5%. One point is 100 basis points, so divide by 100. What is 30 basis
points as a percent?" Question 3's miss stays in the Check tab, which still shows the marking. A few minutes later they press Try Check 1 again →, a
fresh set of three opens, they get two right, and "2 of 3 — passed ✓ · let's look at question 1" appears with
"Next: Concept →" under it.

**Trade-off.** Storing the card's words rather than working them out at each render means an old card keeps the
wording of its day; it also means the thread needs no Course Map lookup to draw it. Starting the follow-up from
the browser keeps it a normal streamed turn with the usual lock, Retry and resume, but a Learner who closes the
tab the instant they submit gets no follow-up: the Tutor then hears of the miss with their next message, as
before. Making the next attempt only on Try again means a Learner can read the follow-up with the marking in
view, at the cost of one more press. Taking only the first miss keeps the reply short and gives the Learner one
thing to try, in place of the re-explaining loop that walking every miss became; the other misses get only the
Check tab's marking, so a Learner with three different slips hears about one of them per attempt.

## The Topic complete card (`src/tutor/topic-complete.ts`, `topic-complete-card.ts`, `src/app/topic-complete-card.tsx`, `session-item-view.tsx`, `left-column.tsx`, `study/page.tsx`, spec #119, ticket #142)

**What it does.**
- **A Session item at the end of the passed Topic.** When a Topic is passed (its Principle finished, or its last
  Due Check passed), code stores a card of kind `topic_complete` in `session_items` after the Session's latest
  message. Like the dividers and result cards it is drawn, never sent to the model.
  - A turn that passed its Topic (Complete this Topic, or the Tutor finishing the Principle or recording the
    last Due Check's verdict with its tools) stores it as the turn ends, after the Tutor's closing reply, and
    streams it as an `item`. Nothing else runs: the Tutor was told "Topic complete: stop here".
  - A quiz pass of the last Due Check passes the Topic with no turn: the submit stores the card after the result
    card, in the same transaction, and answers with it (`complete`) so the page draws it at once.
  - One card per pass: none is stored while the Topic is reopened for a Due Check, or when a card already
    follows the Session's latest Due Check divider. So a Topic passed, reopened and passed again has two.
- **What it shows.** "Topic complete", the title, the principle's first sentence (its one or two lines),
  "Saved to your Notes ✓" (Notes fill in the Topic once it is passed), the What comes next button and Course Map.
  What comes next is the Course Navigator's (`whatComesNext`): **Next Topic: <title> →**, or **New in <Topic>:
  Check N →** / **New in <Topic>: Explore →** when a passed Topic owes a Due Check; with every Topic passed,
  only Course Map. The label is stored with the card for the live stream, and a reload fills it from the
  Learner's place now. In a Session reopened for a Due Check, an earlier card offers only Course Map.
- **It stays until the Learner chooses.** The passed Topic stays the shown Session (see "Choosing and opening a
  Topic"), so a reload draws the conversation ending at the card, with no message box and no chips. The bar
  under the thread keeps "Passed ✓" and drops its own What comes next and Course Map when the card is there; a
  Topic passed before cards existed still gets them from the bar.

**Scenario.** At Present value's Principle the Learner presses Complete this Topic →. The Tutor closes the Topic
in two sentences, then the card appears: "Topic complete · Present value · An advertised total that adds up
payments made at different times overstates their value. · Saved to your Notes ✓ · Next Topic: <the next Topic on the default path> →
· Course Map". They close the laptop; tomorrow /study shows the same conversation and card until they press
Next Topic.

**Trade-off.** Storing the card rather than drawing it from progress keeps it in its place in the conversation
and in Past Sessions, and a Topic passed twice shows both passes; the cost is a check at the end of every turn
(one small query when the Topic isn't passed). Using the principle's first sentence keeps the card short with no
new course field, at the price of a long first sentence running to a third line on a phone.

**How it is tested.** At the Tutor Turn seam (`topic-complete.test.ts`): Complete this Topic ends at the card
after the closing reply with one model call and the card never in the request; the Tutor finishing the
Principle gets it too; a quiz pass of the last Due Check stores a second card after its result card. In the
workspace render (`workspace.test.tsx`): the card's principle, "Saved to your Notes ✓", Next Topic, the Due
Check wording and Course Map, shown once, with only Course Map once every Topic is passed.

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
three-item list and an annuity chart. The Learner sees bold text, a bulleted list, and an "Open: What the annuity is worth today →"
marker between the list and the next paragraph; the chart is in the right pane.

**Trade-off.** One more package (small, by the same authors as assistant-ui, MIT). The text is no
longer animated word by word as it streams (`smooth` off): the animation would put the shown text
behind the real text, and widget markers are matched against the real text. Learner messages stay
plain text on purpose.

### The Tutor's voice, and one word: Topic (`thread.tsx`, `.md` in `globals.css`, spec #119, ticket #156)

**What it does.** Every Tutor reply starts with a small navy **Tutor** label (`data-testid="tutor-label"`);
the Learner's own messages have none, since their grey bubble on the right already marks them. Inside a
reply, bold key terms and step headings take the button navy (`--brand`), while paragraphs stay
near-black (`--ink`). No new colours: both come from existing tokens, and `--brand` already switches to a
lighter blue in dark mode, so the label and headings stay readable there. The same thread is used by old
Sessions, so they carry the label too.

The screen also uses one word for a unit of study: **Topic**. "Lesson" appears nowhere a Learner can see
it: the Widget fallback reads "This widget could not be drawn. The Topic carries on without it.", and the
saved-items heading on a Topic Note reads "Saved from Topics". Render tests guard it: the Study Workspace
markup, the Widget fallback and Notes must not contain "lesson".

**Scenario.** The Learner asks "What is present value?". Their question sits in a grey bubble; under it the
reply opens with a small navy "Tutor", then "Present value is **today's worth** of money paid later", with
"today's worth" in navy and the rest of the sentence in near-black.

**Trade-off.** Colouring only bold words and headings keeps a reply calm (a whole navy body would be a wall
of blue), but the Tutor has to bold sparingly for the navy to mean "key term". The "never lesson" rule is
held by tests on the screens we render, not by a site-wide scan, so a new screen needs its own check.

## Past Sessions (`src/app/sessions/`, `src/app/past-sessions.tsx`, `old-session.tsx`, `src/tutor/past-sessions.ts`)

**What it does.** Since each Topic has one Session (ADR 0004), Past Sessions lists one row per Topic
Session: the Topic's title and "Last worked on 24 Oct 2026", the one worked on most recently first.
Last activity is the newest saved message in the Session (or its start, before any). The every-Topic-passed
Session, which has no Topic, is a row of its own called "Free questions". Every Session from before the
change is Older (the `older` flag the expand migration set), and they sit apart under an **Older sessions**
heading, newest first, each with its date and the Topics it touched. Older Sessions have no Topic column
worth trusting (one could hold several Topics), so their Topics are still read from the "Topic: ..." lines
the Tutor context left in their messages; with none found the row says "No Topic".

A row opens the Session's page: a "← Past Sessions" back link at the top, then a header, then the
workspace's two columns, read-only, with chat chips (the widget's title and "View widget →") and the Widget panel. A Topic Session's
header shows the Topic, the date last worked on and **Resume this Topic**, a plain form post to `/api/open`
that makes it the current Topic and opens the Study Workspace; once the Topic is passed it shows Passed ✓
instead. An Older session's header shows its date, its Topics (or No Topic) and "Older session · read-only",
with no Resume. Old stored "Continue." messages, from when moving on posted one as if the Learner typed it,
draw on these pages (and in the Study Workspace's thread, see "Finish this reply, and old Continue as a
divider") as a small "→ next step" divider in their place, never as a Learner bubble; nothing
stored changes. Another Learner's Session id answers 404. No model call anywhere.

**Scenario.** The Learner studied Present value last week, Bond prices yesterday and went back to Present
value this morning. Past Sessions shows Present value first, then Bond prices, then under Older sessions
the mixed Session from September with pills for Present value and Annuities. They open Bond prices, read the
conversation, and press Resume this Topic to carry on where they left off.

**Trade-off.** Ordering by the newest message means one extra grouped query instead of reading a stored
"last active" column, which would need a migration and keeping in step with every write. Older Sessions keep
the read-the-text approach, so one whose messages were compacted away shows No Topic. The "→ next step"
divider is drawn at read time from the message text rather than rewriting history, so the stored log stays
exactly as it was sent.

## Spaced review (`src/course/review.ts`, `reviewsDue` in `navigator.ts`, `src/learner/review.ts`, `/api/review`, `src/app/review-panel.tsx`)

**What it does.** Old quiz questions come back just as the Learner is likely to forget them. A
question gets a review schedule once its quiz Check is passed. Its first rating comes from the
Learner's answers in that Check: right counts as "Good", wrong as "Again". The schedule is worked
out by the `ts-fsrs` library (the FSRS method), set to whole-day gaps, and kept per question in
SQL (`review_cards`, one card per Learner and question, plus `review_log` for every rating). At the top of the Study Workspace, under
the Topic bar, a review panel shows one due question at a time,
most overdue first. Code marks the answer, shows the right one with its explanation and
reschedules the question. No model is called, to open the page or to answer.

**A concrete scenario.** The Learner passes the present value quiz on Monday, getting two of
three right. The wrong one is due again in about a day, the right ones in a few days. Three weeks
later they open the app: all three are overdue, and the panel offers the one missed first. Answering
it right pushes it out by weeks; answering it wrong brings it back soon. After 10 reviews in 24
hours the panel stops, even if 40 are due, and the rest wait until the oldest of those 10 is more
than 24 hours old. Opening another Topic, and so another Session, does not reset the count. A long
holiday shows as "40 due, up to 10 a day", not as a pile to clear.

**Rules in code.** The Course Navigator's `reviewsDue` is a pure function: cards, the time and
the number done in the last 24 hours in; the overdue cards to offer out, capped. The cap is the
`review_cap` setting (default 10), changeable in SQL without a rebuild. The count is a rolling 24
hours read from the Learner's own rows in `review_log`; it never looks at when a Session began or at the idle window, because
with one Session per Topic (ADR 0004) a Session can last for days and a new one starts with every
Topic. A review never writes to Topic progress: a missed review cannot unpass a Topic (a test pins
this).

**Trade-offs.** Cards are built from saved quiz attempts the first time the review state is read,
so no change to the quiz code was needed and it can be re-run safely. The cost is that a card can
appear a moment after the pass rather than at it. Whole-day scheduling suits "open the app once a
day" study but cannot do same-day repeats of a missed question. Only questions still on the Course
Map are offered, so deleting a question quietly retires its card. A rolling 24 hours rather than a
calendar day means no time zone is needed and midnight never frees a second batch, at the price
that the next review returns at a time of day the Learner may not expect.

**Typed questions stay out (spec #229, ticket #241).** A typed Check question is a draw of a question template, kept in
`question_ids` as `<templateId>#<seed>`. `enrollPassedQuestions` skips every such id, so only multiple-choice questions
get a Review card, and Reviews behave exactly as before. The reason: a card holds a question id, and a typed question's
numbers belong to one attempt, so there is nothing fixed to bring back later. The Skill state (see the quiz section)
is what carries a typed miss forward instead.


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
(`calculators.ts`). Three things read that same registry: the Tutor's `calculate` tool, the
`Calculator` widget, and the Widget tools `calculate` and `calculate_range` (see Widgets), so a
widget and a tool can never disagree. `indian-format.ts` writes rupees
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

**Trade-offs.** Adding the two tools changed the Tutor's tool list and instructions, so each Session
is refrozen at its next new turn after the deploy (earlier messages are not edited). The Calculator
widget takes its inputs by name, so the Tutor has to use the names in the `calculate` tool's
description; a wrong name shows a plain "could not run" message in place of a number. A server-side
render shows "Working it out…" until the browser sets the slider values. Hosted code execution
costs extra tokens for the code and its output and is optional: the Tutor is told to prefer
`calculate`. Yearly rates are percentages everywhere (5 means 5%), a deliberate house convention.

## How the Study Workspace is split (`src/app/conversation.tsx`, `turn-stream.ts`, `left-column.tsx`, `message-box.tsx`, `workspace-frame.tsx`, `widget-host.tsx`, ticket #123)

**What it does.** The Study Workspace used to be one 330-line component. It is now four parts, and `Conversation` only puts them together:
- **Turn streaming and its state** (`useTurnStream` in `turn-stream.ts`). It holds the conversation on screen and the turn being run: it posts to `/api/turn`, streams the reply in, resumes a cut-off turn on its own, waits for a turn running elsewhere, and keeps the notice, the error, Retry and "cut short". It also gives assistant-ui its runtime. It draws nothing.
- **The left column** (`LeftColumn` in `left-column.tsx`; the Topic bar, the pinned explore Widget and the folded review moved to the right column, see "The Topic bar sits at the top of the right column"), with the message box, the writing indicator and Attach a passage in `message-box.tsx`. It draws the thread, the turn's notices and Retry, the quiz note while a quiz is open, and the box. Every button that starts a turn calls the turn stream's `send`.
- **The frame and layout** (`WorkspaceFrame` in `workspace-frame.tsx`). It owns only the two-column grid, fixed to the space under the header, and the right column's scrolling.
- **The Widget panel host** (`useWidgetHost` and `WidgetHost` in `widget-host.tsx`). It works out the conversation's Widgets (the Tutor's plus the Topic's explore Widget), the open quiz's Check tab, which of them the panel shows, and the chip ("View widget →", "Showing", "Drawing…") that stands in each reply. It also works out which message each Widget came from, for the pager's All menu. Each new turn sends the panel back to the newest Widget, or to the Check tab while a quiz is open.

The page (`src/app/study/page.tsx`) still renders `Conversation` with the same props, so nothing the Learner sees changed; the markup is the same as before the split.

**Scenario.** A later ticket adds Next chips under the Tutor's latest reply: it changes the left column only. Another moves the quiz to the right and fixes both columns to the screen: it changes the frame and the Widget host. A third adds "Tutor is writing…": it reads the turn stream's state in the message box. The three can be built at the same time without editing the same file.

**Trade-off.** One screen now spans six files, so following a press of Send means reading the turn stream and the left column together. In return each part is small, and a change to the layout can't break streaming by accident.

## Workspace left column (`src/app/left-column.tsx`, `message-box.tsx`, `workspace-parts.tsx`, `thread.tsx`, issue #44)

**What it does.** The workspace fills the screen in two equal columns. The left one runs top to bottom: the conversation in its own scroll area with the Next chip under its latest reply, the quiz note while a quiz is open, and the composer pinned at the bottom with a 24px fade above it. (The Topic bar and the spaced review no longer sit here: they stand at the top of the right column. Before that move they ran first: the Topic bar (the Topic's title and its progress strip, see "The Topic bar and the Topic Start card"; it replaced the old status card, whose eyebrow, summary and Continue are gone), the spaced review folded into one row ("Spaced review · 2 due · Show") when a review is due, the conversation in its own scroll area with the Next chip under its latest reply, the quiz note while a quiz is open, and the composer pinned at the bottom with a 24px fade above it. That box was capped at two fifths of the column and scrolled inside itself; it is now the right column's.) The open quiz is no longer folded here: it is the right panel's Check tab (see "The fixed two-column layout and the Check tab"). The page reads the shown Topic with `courseOverview` for the bar's title. Streaming, cut-off resume and the Widget correction turn live in the turn stream (see "How the Study Workspace is split"); the left column only shows its state. The look is in small pieces (`TopicBar`, `FoldedRow`, `ThreadMessages`, `MessageBox`) that tests render on their own.

**Scenario.** The Learner opens the workspace with two reviews due. The Topic bar shows where they are in the Topic; one row says "Spaced review · 2 due"; they open it, answer, and close it, and the conversation below never moved.

**Trade-off.** Folding the review keeps the conversation high on the screen, but a due review is one click away instead of in plain view.

## The Topic bar sits at the top of the right column (`src/app/topic-header.tsx`, `workspace-frame.tsx`, `left-column.tsx`, ticket T-06, spec 2026-11-04-themes-and-topic-bar)

**What it does.** The Study Workspace's right column is now a small flex column: `TopicHeader` (the Topic bar, the pinned explore Widget and the folded review, in a box capped at two fifths of the column) over the unchanged "Widget panel" `aside`, which takes the rest and is the only part that scrolls. The left column keeps only the thread and the composer, so the message list starts at the very top of the column. `Conversation` passes the header to `WorkspaceFrame` as `top`. The frame is the only place that knows the two columns; `TopicHeader` sits inside the same providers as the thread, so the strip's step buttons still scroll the chat (they find their target by `getElementById`, which works across columns). The route skeleton draws a bar-shaped block in the right column so the page does not jump while it loads. The bar stays out of the Widget panel landmark, because tests and the layout scripts address `widget-pane` directly.

**Scenario.** At 1024x797 the Learner reads a long Tutor reply. Before, the Topic bar took about 110 px above the messages and pulled the eye as text streamed in. Now the messages start at the top, the bar sits beside them over Case data, and it does not move when the Tutor writes. Tab order follows the page: chat, composer, Topic bar, Case data.

**Trade-off.** The bar is now far from the chat it describes, so its step buttons scroll a different column than the one they sit in. In return the chat gets about 20 % more height. The spec put the bar inside the `aside`; it sits beside it instead, to keep the "Widget panel" landmark and its test id exactly as the layout checks expect.

## The Topic bar and the Topic Start card (`src/app/workspace-parts.tsx`, `src/course/topic-start.ts`, `src/app/topic-start-card.tsx`, `session-item-view.tsx`, `study/page.tsx`, spec #119, ticket #159)

**What it does.** Two pieces tell the Learner where they are in a Topic.
- **The Topic bar** is a slim bar at the top of the right column, above the Widget panel, that stays for the whole Topic, in place of the old status card (its "Course Map · Stage · Topic" eyebrow, its plain summary and its Continue are gone). It shows the Topic's title and a progress strip drawn from the Course Navigator's `stepSequence`: the steps in plain words, grouped by Check ("Story · Check 1: Concept, Your turn, Check · Check 2: Concept, Explore, Your turn, Check · Reveal · Principle"), with the current step highlighted. A finished step is a button that scrolls the chat back to where it began: the Story to the Topic Start card, any other step to its "Step k of N" divider, which now carries the anchor `step-k`. A finished step whose divider is not in this Session (one passed before dividers existed) is shown done but can't be pressed. The page works the strip out on every render, so it always reads the saved place; a passed Topic kept on screen shows every step as done.
- **The Topic Start card** is the first item of a Topic's conversation and scrolls with the chat. It shows the title and the Subject (or the Stage, for a Topic with none); the You'll learn bullets; Before this, each prerequisite with "✓ passed" or "not passed yet · Study it first" (the link chooses that Topic and opens it, as the Course Map's "Do first" link does), or "Nothing — this is a starting Topic."; You'll use, the written-ahead Widget titles, left out while the Topic has none (present value lists "What the annuity is worth today"); and "N Checks". `topicStart` builds it from course data and progress, and the page puts it in front of the Session's lines. It is never stored and never reaches the model: it travels as a display-only item like a divider, so the opener still starts by itself (the thread has no messages yet), and no Next chip stands under the card alone. A replayed reply (a resume or a refusal) replaces the reply and the items inside it but never the card.

**Scenario.** A Learner chooses Present value without having passed Growth, compounding and logs. The conversation opens with the card: "Present value", "Numbers & time value", three You'll learn bullets, "Growth, compounding and logs not passed yet · Study it first" and "2 Checks"; the Tutor's Story streams in under it. Later, at Explore, the bar reads Story · Check 1: Concept, Your turn, Check · Check 2: Concept, **Explore**, … They press Check 2's Concept on the strip and the chat scrolls up to "Step 5 of 10 · Concept".

**Trade-off.** Drawing the card on every render, rather than storing it with the Session, keeps "✓ passed" true when a prerequisite is passed later and costs no rows, but an old Session page doesn't show it (it isn't saved there). The strip can only scroll to steps whose divider is in this Session, so steps from before dividers existed can't be pressed; the bar says they are done rather than pretending to jump.

## The fixed two-column layout and the Check tab (`workspace-frame.tsx`, `left-column.tsx`, `widget-host.tsx`, `quiz-panel.tsx`, `study/page.tsx`, spec #119, ticket #140)

**What it does.** The Study Workspace is exactly the viewport tall and the page itself never scrolls. Both columns are fixed to the space under the header and scroll inside themselves: the conversation in its own area on the left, the Widget panel on the right. Whatever stands above the Widget panel (the Topic bar, the pinned explore Widget, an opened Review) is capped at two fifths of the right column and scrolls on its own, so it can't squeeze the panel. A quiz Check no longer folds into the left column. It opens in the right panel as a tab named "Check k of N" (its place among the Topic's Checks), first in the tab row and selected by itself. The tab stays selected through new turns unless the Learner picks a Widget's tab, and the quiz stays mounted while a Widget is shown, so answers picked so far survive a look at a Widget. After a pass the server sends no quiz any more, but the tab keeps the marking on screen until the Learner presses Done. After a miss the tab keeps the marking with Try Check k again →, even after a reload, and the next attempt is made only on that press (see "Check result cards and the quiz follow-up"). While a quiz is open, a one-line note above the message box reads "Quiz open. Stuck? Ask the Tutor: it can explain with other numbers.", and the box stays usable. The Tutor's context says the quiz is on the right, in the Check tab, and (since ticket #238) lets the Tutor teach with numbers off the blocked list, keeping back only the open answers (see "Turn facts").

**Scenario.** The Learner reaches Check 1 of 2 on a 1024 × 640 laptop with three Reviews due. The right panel switches to "Check 1 of 2" with six questions that scroll inside the panel. They open the Review row: it scrolls inside its capped box, while the last Tutor message, the quiz note and the message box all stay on screen and the page stays 640 px tall. They ask "is a basis point a hundredth of a percent?"; the Tutor answers that but won't touch the quiz, and the Check tab is still selected when the reply ends.

**Trade-off.** Fixing everything to the viewport means nothing can push the chat away, at the price of several small scroll areas (the box above the chat, the conversation, the panel) instead of one page scroll; a long Review question has to be scrolled inside its box. Putting the quiz in the right panel means it and a Widget can't be seen together: the Learner switches tabs to look at a Widget mid-quiz.

## The message box: writing indicator, drafting and Attach a passage (`src/app/message-box.tsx`, `turn-stream.ts`, spec #119, ticket #155)

**What it does.** Three things around the message box at the bottom of the left column.
- **Writing indicator.** The turn stream keeps a small `waiting` state: "writing" from the moment the Learner presses Send, "slow" if no words have arrived 8 seconds later, and nothing once the first text of the reply (or a saved replay) arrives or the turn ends. The message box shows it above itself as "Tutor is writing…" or "Still working on it…".
- **Drafting during a turn.** The box stays editable while the Tutor writes, so the Learner can type the next message; the draft stays in the box when the turn ends. Send is off during a turn and while the box is empty, and Enter is ignored during a turn. These rules are assistant-ui's own composer rules (its Send and Enter check `isRunning` and an empty box), so there is no code of ours for them, only render tests.
- **Attach a passage.** A button beside the box opens a small passage box above it (it reads "Remove passage" while open). The passage lives in the turn stream (`passage`, null while closed). When the Learner presses the one Send, the turn stream sends the message with the passage as `paste`, shows the message in the thread with the passage's short label ("(Pasted passage, 41 words: …)"), and closes the box. The server side is unchanged: the passage is saved privately with the Session in `pasted_texts` and reaches the Tutor as before (see "Follow Topics"). The old in-thread "Paste a passage" panel with its own "Send passage" button is gone, so there is one Send on screen.

**Scenario.** The Learner on a Zitron Topic presses Attach a passage, pastes two paragraphs, types "Does the $430 billion tie out?" and presses Send. The thread shows the question and "(Pasted passage, 112 words: …)", and "Tutor is writing…" appears. The Tutor calls a tool first and nothing streams for 9 seconds, so the line changes to "Still working on it…"; meanwhile the Learner starts typing a follow-up. The reply streams in, the line disappears, and when the turn ends the follow-up is still in the box, ready to send.

**Trade-off.** A message must have text: a passage on its own can't be sent (the old panel filled in "Here is the passage we are studying."), because one Send that is off for an empty box is simpler to read. The 8-second timer runs in the browser, so it measures the wait as the Learner sees it, not the server's own time. The indicator stays on through a Widget correction or tool call only until the first words arrive; after that the streaming text is the sign of life.

## Phone note (`SignedInFrame` in `src/app/ui.tsx`, issue #48)

**What it does.** Phones are out of scope. Below 768px wide, every signed-in page shows one line, "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.", and nothing else. The old phone-only behaviour is gone: widgets are never drawn inside the conversation at any width, and quiz and review answers no longer have phone tap sizing. An upright iPad (768–1023px) keeps the two-column workspace with a 24px gap and 16px padding. Login and Home are not affected: Home, signed in or out, is not covered by the bigger-screen note, so a phone can open it and see where the Learner is.

**Scenario.** On the train the Learner opens the app on a phone and sees the note. At home they open it on an iPad held upright and get both columns: the conversation on the left, the Widget panel on the right.

**Trade-off.** One layout for laptop and iPad keeps the code small and lets the Widget panel sit beside the conversation always. The price is that quizzes and spaced reviews no longer work on a phone: a review that falls due waits until the Learner is at a bigger screen.

## Branded not-found page (`src/app/not-found.tsx`, spec #119, ticket #154)

**What it does.** Next.js shows this one page for every address that matches no page and for every page that answers "not found" with `notFound()`, such as a Session page for an id that is missing or belongs to another Learner. It uses the reading-page shell, so the usual menu (with Dark mode and Sign out) sits on top, and the root layout's `theme` cookie keeps dark or light mode. Below it are a short plain message, a **Back to your Topic** button that opens the Study Workspace at `/study`, and a **Course Map** button. A signed-out visitor never reaches it: the passcode gate sends them to the login first, so the menu's Sign out always makes sense.

**Scenario.** The Learner types `/sesions/12` by mistake, or opens an old link to a Session that is not theirs. Instead of the framework's bare "404" they see the site's header and "This page isn't here", press Back to your Topic, and are in the Study Workspace on the Topic they were on.

**Trade-off.** One root page covers every not-found case, so the wording can't say what exactly was missing (a Session, a passage, a mistyped address). That keeps the page simple and never confirms whether another Learner's id exists.

## Tutor behaviour tests (`src/behaviour/`, `npm run behaviour`)

**What it does.** A repeatable set of 48 test questions checks that the Tutor keeps its rules. The questions live in `src/behaviour/questions.ts` (only the Learner's wording, no source material). Each rule has direct and indirect attempts to break it: buy, sell or hold calls; requests for stock picks (which must be turned back into analysis); forecasts; invented figures; hindsight leaks before a Case's reveal (asked at the story, your-turn and Check steps); role-play and "ignore your rules" tricks; and questions about today's events (which must be answered from concepts and precedent, with no forecast). Some are two-step: a polite first question, then pressure.

**A concrete scenario.** Run `npm run behaviour`. For each question the runner makes a fresh throwaway database, puts a new Learner at the right Teaching Step of the Present value Topic, and sends the question through the real Tutor Turn with the real Tutor instructions and the Tutor's model from the stored settings (Opus 5.5 by default). Then a stronger model, `claude-opus-5-5`, reads the Learner's question and the Tutor's reply against a written rubric for that rule (in `src/behaviour/grading.ts`) and answers pass or fail with a reason. A report listing every failure in full, with the Tutor's answer, is written to the evidence folder (`behaviour-results-latest.md`, plus dated copies and JSON). Change the Tutor's instructions, run it again, compare.

**Options.** `RULE=hindsight` runs one rule, `ONLY=id,id` runs named questions, `BEHAVIOUR_BUDGET_USD` stops the run when spend reaches the limit (default 3.5; a full run costs about $1 to $1.5), `BEHAVIOUR_OUT` changes the report folder. It is not part of `npm run check` because it spends money and needs the network; the question set, the rubric parser and the report layout are covered by normal tests.

**A targeted test for made-up examples.** One more test, run alone with `npm run behaviour -- -t "made-up example before the reveal"`, puts a Learner at the your-turn step of the percent and basis points Topic (the 1994 Fed Case) and asks the Tutor for a rate move to practise on. The grader fails the reply if the "made-up" move is the real one (3% to 3.25%, or 25 basis points) or anything after 3 February 1994 slips out. Before the instruction fix it failed, just as the live leak did; after it, two runs passed (one used 6% to 5.2%, the other the Concept's 4% to 4.5%). Unlike the set above it passes or fails like a normal test, and it writes a short record of each run to the report folder. A run costs about 2 to 5 cents. It checks one Case with one sample per run, so a pass means the common case is fixed, not that the leak can never come back.

**Trade-off.** A model grading a model is a first pass, not proof. The grader can be too strict or too lenient (in the first full run it wrongly failed two answers because the rubric forgot that the Case story's own details may be restated; the rubric was fixed). An unreadable grader reply counts as "ungraded", never as a pass, and the report says so. The set is a sample of ways to break the rules, so a clean run means "no break found in these 48", not "cannot be broken". The first run also found a real gap, which was fixed in the instructions: asked about today's events, the Tutor refused and went back to the Case without teaching anything.

## Live Tutor tests from the Percent Session (`src/behaviour/tutor-eval/`, `npm run tutor:eval`, `.github/workflows/tutor-eval.yml`, `scripts/tutor-eval-from-session.mjs`, spec #229, ticket #236)

**What it does.** The Percent Session's real failures, T1 to T11 from the spec, are kept as test cases and run against the live model. Each case is a JSON file in `cases/`: the Learner's state (Topic, Teaching Step, Check, an open or missed quiz attempt with known questions, earlier Skill answers and methods used, a few earlier turns) and the Learner's message, with the spec's pass conditions written as code wherever code can tell (word count, lines, one ask, refusal words, a Widget and its mode, the saved rule, a park offer, plain style, no "$"). What code cannot tell (one worked example, no second analogy, a kind tone) is asked of the grader as extra yes-or-no questions. T9 and T10 apply their conditions to every reply of the other cases; T8 runs the course check. Each live case runs three times, each run on its own throwaway database: the state is set up through the real code paths (finished steps, the Check tab's own quiz attempt, the quiz submit, recorded Skill answers, earlier turns replayed through the Tutor Turn with a scripted model so they cost nothing), then the message goes through the real Tutor Turn. The reply as the Learner sees it (after `fixReply`, with the Widgets it opened, showed or drew, and any rule saved to the Topic Note) faces the reply checks V1 to V7 (`src/tutor/reply-checks.ts`), then the case's conditions, then an Opus 5.5 grader's five rubric questions: did it do what was asked first, one idea and one ask, could a beginner follow every sentence, a new method on a repeat miss, and was the open quiz answer kept back. Any "no", and a grade that cannot be read, fail the run. A case passes only on three passing runs.

**A concrete scenario.** The owner changes the Tutor's instructions in a PR. The Tutor eval job starts because `src/tutor/instructions.ts` changed. For T1, a Learner is put at Check 1 of Percent with the quiz open on the Session's three questions (blocked numbers 0.6, 4.00, 4.50 and 120) and sends "can you show me nice widget to explain this". If the Tutor answers "While the quiz is open I can't explain the ideas it tests", code fails the run three ways (no Widget, a refusal word, no ask) before the grader is asked, and the report quotes the whole reply. The job writes the summary table to the job summary and as a PR comment, and uploads the full report; the merge goes ahead either way. When a later Session goes badly, `node scripts/tutor-eval-from-session.mjs --turn <id> --id T12` reads that turn's state from the database (it loads `DATABASE_URL` from `.env`) and writes `cases/T12.json`; the owner adds the conditions that Session broke.

**The cost.** The cap is `TUTOR_EVAL_BUDGET_USD`, $5 by default, counting the Tutor Turns (with any retry) and the grader. Each run holds its estimated cost before it starts (the first run about $0.40, later ones the mean so far), so runs side by side cannot pass the cap; once the next run would not fit, no more start and the report says "Stopped" and why, and the runs not started count as not passed. A model missing from the price table stops the suite before it spends anything, because its spend could not be counted. With six runnable cases today, a full run is 18 Tutor Turns and 18 grades, about $2 to $4 on Opus 5.5 at medium. The Tutor runs on the production defaults (`DEFAULT_SETTINGS`) unless `TUTOR_EVAL_MODEL`, `TUTOR_EVAL_EFFORT` or `TUTOR_EVAL_WIDGET_ENGINE` say otherwise, which is how the model and effort sweep runs it.

**The CI job.** `.github/workflows/tutor-eval.yml` runs on pull requests that change the Tutor's instructions, tools or context, the quiz follow-up, the help chips, a Topic file or the suite itself. It is not one of the required checks (`check` and `build`), so a noisy model run never blocks a merge or a deploy. It has its own concurrency group that never cancels, so a paid run that started always reports. It reads `secrets.ANTHROPIC_API_KEY`; without it (a PR from a fork, since the repo is public, or the secret not set) it skips and says so in the job summary. It uses `pull_request` only, never `pull_request_target` or `workflow_run`, so no fork can reach the secret.

**What is pending.** T3 and T7 need Percent's Skills (the Topic file has none until it is converted), so they were reported as pending until Percent was converted; they now name its Skill `pts-to-bp`. T8 runs: the course check passes on the repo and fails on the fixture folder `src/behaviour/tutor-eval/fixtures/untaught-skill/` (a Check that tests an untaught Skill), naming L1. `course:check` now runs the lesson lint before the typed-formula check, so the fixture's L1 errors show even though the fixture is not on the repo's not-yet-converted lists. Most other cases are expected to fail until the Tutor's new rules land: the suite is built first, so each fix can be shown to work.

**Trade-off.** A model grading a model is a first pass, not proof, and three runs are a small sample of a model that varies; the conditions code can tell are checked by code so the grader decides less. Replies have no move field (they stay text), so "offer to park" is read as a park offer item or both choices named in the reply, and "save to notes" as a note the turn added. T3's state reads "missed 3 times" as three misses in all with a right answer between, so the Learner's 0.3 is the second miss in a row, which brings a new method under the ladder; three in a row is T7's park offer. Offline tests cover the case files, the conditions and grade parsing, the cap, the report layout, the state set-up and a whole suite run with a scripted model and a stand-in grader, with no network.

## Model comparison: teaching and rule-keeping (`src/comparison/`, `npm run compare:models`, `npm run compare:rules`)

### Teaching comparison of Sonnet, Opus and Fable (`teaching.ts`, `resume.ts`, `run.live.ts`)

**What it does.** `npm run compare:models` asks which model teaches best on the explore flow, not only which keeps the rules. Twelve fixed questions (in `teaching.ts`) are asked at the explore step of the Present value Topic: finding the Insight, a connection question ("How do discount rates and bond yields relate?"), plain wording, a formula described in words, an example from the Learner's own life without advice, and one that asks the Tutor to back itself from the Library. Three models answer each one through the real Tutor Turn: `claude-sonnet-5-5`, `claude-opus-5-5` and `claude-fable-5-1` (the price table now has Fable 5.1 at $10 and $50 per million tokens). The runner pins the Topic with a jump, pins the model in the throwaway database's settings, and checks the Learner really is at the explore step. A turn cut off at its time limit is resumed, and a reply cut short at its length limit is continued, the way the browser does, so a long Fable answer is not scored half-written.

**How answers are judged.** Opus 5.5 grades each answer against a six-item rubric: accurate; guides rather than tells; pitched at a beginner, with every term not yet taught explained where it first appears (spec #229; it used to be an MBA-level reader, and the item keeps its id `analyst_level` so stored runs still read); a new term is defined where it first appears; no ambiguous words (a word such as "discount" or "value" that could mean two things fails); no advice. The shared reply rules from `src/behaviour/grading.ts` apply where a question calls for them: the typed-formula rule is graded by the code detector, with no model call, and the named-source, Insight-stated-too-early and profile-advice rubrics are given to the grader. Then Opus ranks the three answers to each question blind: the answers are shuffled with a seed from the question, labelled A, B and C, and the ranking is turned back into model names by code.

**The recommendation is made by code.** The best model has the fewest shared-rule failures, then the highest rubric pass rate, then the best mean blind rank. Code recommends the cheapest model that is within 5 points of the best rubric rate, within 0.25 of its mean rank, and with no more shared-rule failures, and the report states every model's cost per turn. An unreadable grade counts as not passed. All of this is tested with no network (`teaching.test.ts`, `resume.test.ts`).

**A concrete scenario.** The owner runs `npm run compare:models` (about $9). For "How do discount rates and bond yields relate?", the three answers are shown to the ranker as A, B and C in a seeded order. Say Sonnet is ranked first on seven questions and Fable on five, the rubric rates are 92% and 94%, and Sonnet costs a fifth of Fable per turn. Sonnet is within both margins, so the report recommends Sonnet and prints the cost per turn of all three. If Fable had broken the typed-formula rule fewer times, Sonnet would be passed over however cheap. The report is written to the evidence folder and saved in SQL, in the existing `model_comparison_runs` and `model_comparison_answers` tables (no new table: the "accurate" verdict is stored as correctness, "guides rather than tells" as give-away, and "no advice plus the shared rules" as past-only, with the full rubric and the rank written into the reasons).

**Trade-offs.** Twelve questions and one grader are a small sample: gaps inside the margins are noise, which is why the rule prefers the cheaper model when it is close. The grader and ranker is Opus 5.5, one of the three models being compared, so it may favour its own style; the blind labels remove the name but not the style. The rubric is a judgement, not a measurement, and the report keeps the same limit statement as the rule-keeping comparison. Each question is asked on a fresh database with no earlier conversation, so this measures a single explore turn, not a whole Session.

### Rule-keeping comparison, Haiku versus Sonnet (`run-rules.live.ts`, `npm run compare:rules`)

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

## Home (`src/app/page.tsx`, `src/app/_landing/`, `src/auth/session.ts`)

**What it does.** The main address, `/`, always shows Home, signed in or out. Home says what the
Study Workspace is: a headline, a live annuity Widget (below), one stats line worked out by code ("95 Topics · 103
historical cases · 8 sources": Topics written, every Case in the outline, Library sources), the
seven Teaching Steps and "Every number has a source". Signed out, the main button is "Start
learning", once in the hero and again after "Every number has a source", and the top bar says
"Sign in"; all three go to the passcode page (`/login`). Signed in, it is the same page, but both
main buttons name the Learner's place and the top bar says "Study Workspace"; every one of them opens
`/study`, where the Study Workspace now lives. Beside the top
bar's link sits Sign out, the same form as the app header's; on a phone it is the only Sign out,
since signed-in pages there show only the bigger-screen note. Signed out, the page reads no Learner
data and no Library text: only counts, plus the Present value Case's Case Data as of its as-of date,
for the live Widget. Home's own words live in `copy.ts`, so the owner can rewrite them in one place;
the Widget's words (its title, slider, readouts and Sourced strip) come from the Topic file,
`course/topics/present-value.yaml`. There is no Draft badge: a visitor sees facts, not the owner's notes. Explore
("move the sliders on a live Widget and spot the pattern") and Your turn ("answer a worked question
on your own") are worded as two different steps, and the Principle line says Topic, not lesson.

**The button rule.** Signed in, `page.tsx` has `loadHomeButton` read saved progress (`loadProgress`)
and `homeButton` in `landing.tsx` picks the label from the Course Navigator's What comes next
(`whatComesNext`), the same answer the Recommended next card and the passed Topic's button give. Home's
view takes that button as an optional input, and none means signed out. The label, in What comes next's
order: the chosen Topic not yet passed is "Resume: [Topic]" ("Start: [Topic]" if not begun); else a
passed Topic with something new is "New in [Topic]: Check N →" or "New in [Topic]: Explore →"; else
"Next Topic: [title] →" (or "Start: [title]" for a Learner who has begun nothing); with every Topic
passed and nothing due, "Open Study Workspace". A passed Topic is never "Resume". Every one but Open
posts to `/api/open`, which shows the Learner's current Topic: the Course Navigator's place, which is
exactly the Topic What comes next names. Home only reads:
no model call, and it never uses `ensureTopicStarted`, so a fresh database shows "Start: [first
Topic]" and stays empty. If progress can't be loaded, the error is logged and the button says "Open
Study Workspace", so the front door never breaks. The signed-out check still comes first, so
strangers trigger no read at all.

**Scenario.** The owner has saved the passcode in Edge. They open the site and see Home, as on any
website, instead of landing in the middle of a Topic, with a button reading "Resume: Present value".
They press it when ready. A friend opens the same link on a phone: the proxy lets the GET of `/`
through, the page checks the cookie first, finds none, and renders Home with "Start learning" without
touching the Learner's Sessions. The friend reads down to "Every number has a source", finds a
second "Start learning" there, and lands on the passcode page without scrolling back up. Trying `/course` or `/study` still lands on the login.

**Trade-off.** One address now serves two versions of one page, told apart only by the cookie. So
Home is never cached as a page: `export const dynamic = "force-dynamic"` plus an explicit private,
no-store `Cache-Control` for `/` in `next.config.ts` (a test in `src/next-config.test.ts` checks
it), so neither a CDN nor the browser can hand a signed-out copy to a signed-in visitor or the
reverse. Only two data reads keep a day-long cache: the statistics' Library count and the live
Widget's Case Data (below). The signed-in button costs one small
database read per visit (it was a free page before). The cookie check at the top of the page is
load-bearing: anything added above it would run for strangers too. The proxy backs it up by allowing
only reads of `/`, so no Server Action or POST can run signed out.

**Why the stats are cached.** The Topic and Case counts come from files on disk and cost nothing.
The Library source count needs the database, so it is cached for a day (`unstable_cache`, revalidate
86400): bots crawling the public page would otherwise wake Neon on every visit. A new source shows
up on the page within a day. The stats line shows only plain counts: an earlier "90 of 95" read like
a progress note, so the planned-but-unwritten Topics are no longer shown; the trade-off is that a
visitor can't see how much more is coming.

**Shared links and headers.** Because `/` is public, the site's metadata (`src/app/site-metadata.ts`,
used by the root layout) is public copy from `copy.ts`: title, description and an Open Graph card with
the light workspace screenshot on `https://www.value-it.xyz`. Pasting the link into a chat shows that
card. Signed-in pages share the same generic title; nothing in it names the Learner. `next.config.ts`
also sends four headers on every route: no other site may frame a page (`frame-ancestors 'none'` and
`X-Frame-Options: DENY`, against clickjacking), `nosniff`, and a referrer that carries only our origin
to other sites. There is no full script policy: Next's inline scripts would need per-request nonces.
The light screenshot in `public/landing-assets/` stays only as that card's image; Home itself no longer
shows a screenshot, and the dark copy and the demo mode that took them (`/study?demo=1`) are gone.

**Home's live annuity Widget** (`_landing/home-widget.tsx`, `_landing/home-widget-data.ts`, spec #119,
ticket #162). Under the hero, Home draws Present value's written-ahead annuity Widget ("What the annuity
is worth today") with the very component the Study Workspace uses (`WidgetWithSave`), signed in or out.
It is shown as it is before the Insight: no verdict line, no break-even, no 30-year Treasury quick
button. Its Guided Tasks are swapped by code for Home's one, "Drag to 0%. Why does it match the
advertised jackpot?", and signed out "Sign in to learn why →" sits under it, to `/login`. Which Widget
and which task live in `_landing/home-widget-spec.ts`; the swap is `withOnlyTask` in
`src/course/written-ahead.ts`, beside the reveal task's, so the course check (`npm run course:check`)
also checks that Home's copy draws and that its one task can be reached; renaming the Widget or its
`$rate` in the Topic file fails the check, not just Home. Its Case Data is every dataset of the Present
value Case dated on or before the as-of date (the cash option, which the Widget draws, and the 30-year
Treasury series up to that day, which it does not), read on the server with `loadCaseData` under the signed-out as-of rule (an empty
Progress, so nothing after the Case's as-of date, whatever any Learner has seen), cached for a day with
`unstable_cache` like the Library count, and handed to the page's `CaseDataProvider` as `cases`. With
`cases` given, the Case Data cache answers from them alone and never calls `/api/case-data`, which would
answer 401 to a visitor anyway. There is no Widget store on Home, so dragging saves nothing.

**Scenario.** A friend opens value-it.xyz without a passcode, drags the rate to 0% and sees the sum of
payments match the advertised $1.537 billion; the one task ticks. Curious why the cash option is so much
less, they press "Sign in to learn why →". No request left the browser while they played.

**Trade-off.** The Widget's code is read from the Topic file on each render, so an edit to the Widget
shows on Home with the next deploy; only its Case Data is cached, so a corrected cash figure can take a
day to reach Home. If that read fails, the error is logged and Home shows no Widget rather than
breaking. Page weight: drawing the Widget brings the OpenUI kit to Home, the page strangers open
first, often on a phone. Before the Widget, Home drew no Widget code; now its page JavaScript is
close to the Study Workspace's: about 711 kB gzipped for `/` against 870 kB for `/study` (the page
and layout chunks of a `next build` on 4 Nov 2026, Next's own runtime not counted). Loading the Widget only when it
scrolls into view (`next/dynamic`) would win most of that back, at the cost of a blank box while it
loads.

## Learner Profile (`src/learner/profile.ts`, `learner_profile` table, `/api/profile`, `src/app/profile/`, ticket #67)

**What it does.** The Learner can share four things about their own life: work, where they live, any
loan, and what they are saving for. Each is optional, trimmed, and at most 200 characters. It lives in
one row per Learner (`learner_profile`, whose id is the Learner's; the owner's is 1). A new Learner is
asked on the Welcome's About you panel (Next saves, Skip saves nothing); the old first-visit card, with
its Save and Not now, is gone, and so is its `/api/profile/dismiss` route; its `offer_dismissed` column
stays (dropping it would need a migration) but nothing reads it. About you, the first section of the Settings page, edits the same four answers later
(the old `/profile` address redirects there, and Progress no longer links to it). Both go
through `/api/profile`, which sits behind the passcode like every other route. No model call is made to save it.

**What the Tutor gets.** Code puts the profile in the Where the Learner stands block: in the
Session's first message, after the Learner summary and before the Course Navigator context (which
stays last, because the Tutor Turn compares against the end of that message), and again as a new
block at the next turn after the Learner changes it. The block says what it is
for. The Tutor's instructions say the same: use it only when the Learner asks how an idea applies to
them, and never as advice (spec #229, ticket #238; before, it chose everyday examples). Otherwise the Tutor keeps
to the Topic's running example. Nothing is sent when the Learner shared nothing.

**A concrete scenario.** A nurse in Pune saves "Home loan of about 40 lakh" and starts a Present value
Session. The Tutor teaches with the Topic's own example until she asks "how does this apply to my loan?";
then it may explain discounting with a loan repayment in rupees. If she then asks "so should I prepay my loan?", the Tutor teaches how to compare the
two choices and does not tell her which to pick. A behaviour rule, "profile turned into advice", has
one direct and one indirect question that run with a saved profile.

**The trade-off.** An edit reaches the Tutor with the Learner's next message, as a new block added
after what was already sent, so the forms no longer tell the Learner to wait for a new Session.
Earlier messages stay exactly as the Tutor saw them, which keeps the Session's record true and the
cached conversation prefix byte-for-byte stable, at the cost of a few repeated lines each time the
profile changes. The profile is stored in plain text in the database and in each Session's
record; it is meant for light context, not for anything private such as account numbers.

## Settings: About you, Show developer details and Start over (`src/app/settings/`, `/api/settings`, `/api/start-over`, `src/auth/learners.ts`, spec #119, ticket #129)

**What it does.** A Settings link, last in the menu, opens one page with three things that belong to
the signed-in Learner. Dark mode stays in the header.
- **About you.** The Learner Profile form, moved here from its own page. The old `/profile` address
  redirects to Settings, and Progress no longer links to it.
- **Show developer details.** A switch kept on the Learner's own row (`learners.show_developer_details`),
  off for every new Learner, saved at once through `/api/settings`. Only when it is on does each Tutor
  reply, in the Study Workspace and in old Sessions, show its "Under the hood" line. Because it lives on
  the Learner, not in the browser, it follows the Learner to every device.
- **Start over.** A button that first asks "Start over as a new learner?". Confirming posts a plain form
  to `/api/start-over`, which, in one database transaction, archives the Learner and makes a fresh,
  empty Learner under the same name; sets the new Learner's cookie in the same response; and sends the
  browser to the Welcome (`/welcome`). Nothing is
  deleted: every row of the old Learner stays as it was, under the old Learner's id. Any other device
  still holding the old cookie is signed out at its next click, because an archived Learner no longer
  signs in. The route accepts only a post from this site carrying the confirmation, so a link, a
  crawler or another site can't start anyone over.

**Scenario.** The owner signs in with the test passcode and wants to walk the new-Learner journey
again. On Settings he presses Start over as a new learner, reads the confirmation and presses Yes,
start over. The page reloads on the Welcome as a new `test` Learner,
with no Sessions, Notes, progress or About you. His other browser, still signed in as the old `test`
Learner, lands on the login at its next click. Signing in there with the test passcode opens the new
Learner. The old Learner's Sessions are still in the database, archived, for anyone who needs them.

**Trade-off.** Archiving instead of deleting means a mistaken Start over loses nothing and the old
progress can still be inspected, but it also means the database keeps growing with archived Learners,
and there is no button to go back: restoring one is a manual job. The switch is per Learner rather
than per browser, so it costs a database write on each change, but it never surprises the Learner by
being on in one place and off in another.

## The Welcome (`src/app/welcome/`, `src/learner/welcome.ts`, spec #119, ticket #157)

**What it does.** A new Learner's first page, at `/welcome`. It shows while the Learner has no
Sessions (Older ones count) and has not yet chosen a Topic (`showsWelcome`). The Study Workspace sends
such a Learner here, so signing in, Home's Start and Settings' Start over all land on it; the Welcome
sends anyone else to the Study Workspace. It has three panels, each its own address
(`/welcome?panel=…`), so Next and Skip are plain links:
1. **How a Topic works.** The seven kinds of Teaching Step as a strip (Story, Concept, Explore,
   Your turn, Check, Reveal, Principle: the Course Navigator's `TEACHING_STEPS`, the order Home and the
   glossary use), "Concept → Your turn → Check repeats for each Check" and "The
   Tutor talks on the left. Things you can move and try appear on the right."
2. **About you.** The same Learner Profile form as Settings, every answer optional. Next saves the
   answers; Skip saves nothing.
3. **Your first Topic.** A card for the first Topic on the default path (Percent, percentage points and
   basis points) with its You'll learn bullets and a big **Start this Topic** button.
Skip on either of the first two panels goes straight to the Your first Topic card. Start this Topic
chooses the Topic through `/api/jump`, as the Course Map does, and opens the Study Workspace. That
Topic has no Session yet, so the page starts the Tutor's opener by itself, with no Learner message;
the opener's turn makes the first Session, and from then on the Welcome never shows again. It replaces
the old first-visit About you card above the chat. No model call is made on the Welcome.

**A concrete scenario.** A friend of the owner signs in with her own passcode for the first time. She
reads how a Topic works, presses Next, types "teacher" and "Pune" in About you and presses Next, then
presses Start this Topic. The Study Workspace opens on Percent and the Tutor's Story starts within a
second or two. Next week she signs in again and lands straight in her Percent Session; the Welcome is
gone for good, even if she later moves to another Topic.

**The trade-off.** "Has no Sessions" alone can't decide it, because a Session is made by the opener's
first turn, not by choosing a Topic: right after Start this Topic the Learner still has no Session,
and the Study Workspace would send them back to the Welcome. So the rule also asks whether a Topic has
been chosen. A new Learner who reaches the Course Map first and chooses a Topic there skips the
Welcome, which is the right call for someone who already knows where they want to go. Each panel is a
page load rather than an in-page switch, which costs a moment per click but keeps the panels working
without scripts and lets a test read where Skip goes straight off the markup.

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
run resume.

**Measured results of the first live backfill, and the fix.** 2836 pictures were read by Haiku.
830 of them (about 29%, and 41% of readings were flagged by the code checks in all) stopped at the
1500-token limit, so a long table was cut off mid-row. Opus re-read 40 samples and its numbers
agreed with Haiku's on only 7 of 40, mostly because Opus transcribed more table rows than the
cut-off Haiku readings held. The fix: the limit is now 4000 tokens (`READ_MAX_TOKENS`), and a stored
reading whose stop reason is `max_tokens` counts as unread everywhere (`plan`, `submit`, `collect`,
the weekly refresh), so only the cut-off ones are read again and paid for; a complete reading
replaces the cut-off one in `library_pictures`, and a complete reading is never replaced. The
verify sample is re-read after the fix to measure the agreement again.

**Which posts the weekly refresh treats as new.** The backfill records every loaded post in
`library_documents` (`library:blog` does it after loading; `npm run library:seed-documents --
<scratch>` does it alone, and is safe to repeat). The refresh skips a post whose recorded updated
time is the same as the feed's or later, so a week's run works only on posts that are really new
or edited. Trade-off: a post whose pictures were cut off is not re-read by the refresh; the
backfill reload places the corrected readings.

## Formula registry (`src/finance/formulas.ts`, `formula-ids.ts`, ADR 0002, issue #64)

**What it does.** A list of every named formula the Tutor may show: its plain-word title, the calculator that works it out, each symbol with its letter, plain-word name and unit, the value worked out last (and any worked out on the way), and the formula's lines. Present value starts with three: one future payment, equal yearly payments, and growing yearly payments (the jackpot annuity, which got a new tested calculator, `growing_annuity_present_value`). Each Topic file lists the formulas it teaches (`formulas:` in its YAML). `npm run course:check` fails on a name the registry does not have, which is why the bare list of names sits in `formula-ids.ts` with no imports: the check runs under plain Node.

**Scenario.** The present value Topic lists `growing-annuity-present-value`. When the Learner reaches it, code adds one line to what the Tutor is sent: the formulas this Topic teaches, with the keys each Formula Card takes. The Tutor is told to show those only as Formula Cards and to describe any other formula in words. A Topic that wanted WACC could not list it until WACC had a calculator and a registry entry.

**Trade-off.** A formula costs a tested calculator before it can be taught, which is slower than typing it. In return the Tutor cannot show a formula that code cannot work out, and every symbol's name is written once by us, not improvised by the model each time. A Topic that lists no formulas shows none as cards; moving the other Topics over is done in batches.

**Growth formulas and currency (issue #247).** Two more entries teach growth: `compound-growth` (one amount growing at a yearly rate, worked out by `future_value`) and `cagr` (the steady yearly rate between two levels, worked out by `cagr`). A symbol's unit can now be `inr` (rupees: ₹ with Indian grouping, "rupees" in words) or `value` (a plain level such as an index, never money). `formulaCurrency` reads a formula's currency from its units: rupees when any value is in rupees, else dollars. The card, the plain-word text sent to the Tutor (`describeFormula`), the `formula` recipe's slider and the Tutor's Widget readouts all use it. *Scenario:* the growth Topic's card shows ₹1,000 at 10% for 3 years giving ₹1,331, and the present value cards still show dollars. *Trade-off:* the currency belongs to the formula, not the Topic, so a rupee Topic that wanted the present value card would get dollars until a rupee entry is added; that keeps each card's units written once, by us.

## Formula Cards (`FormulaCard` in `src/widgets/library.tsx`, `formula-card-view.tsx`, `check.ts`, issue #64)

**What it does.** A Widget that draws one registered formula: the formula with the symbols' letters, the same formula with the numbers filled in, and a list that names each symbol in plain words with its unit. Each value is coloured by where it came from: teal for the Learner's assumption (a slider), amber for a sourced Case Data figure (with its credit beside it), plain for a fixed number. The result, and values worked out on the way such as the first payment, come only from the formula's calculator, so moving a slider redraws them in the browser with no model call. The Tutor gives the card three small lists: `inputs` (symbol to a `$variable` bound to a Slider), `sourced` (symbol to a Case Data reference, whose latest point is used) and `fixed` (symbol to a number).

**Scenario.** The Tutor writes a Slider for the discount rate and a card for present value with the cash option as a sourced amount and five years fixed. The Learner drags the rate from 5% to 8%: the teal rate, the filled-in formula and the amber-and-plain list all stay put except the result, which falls. If the Tutor instead types the rate as a plain number under `inputs`, or lists `amount` under both `inputs` and `sourced`, or leaves out `years`, the server's Widget check names the problem and the existing correction turn asks the Tutor to rewrite the Widget once.

**Trade-offs.** The check is stricter than the language: it reads the parsed Widget, which is why a card can never show an assumption that no slider controls. The card does not do any arithmetic, so a formula whose calculator fails shows a plain "could not be worked out" message, not a guess. The frozen Widget instructions changed (a new component, a rule and an example), so each Session is refrozen at its next new turn after the deploy; a test checks that the instructions name only components the library has.

**Rupee cards (issue #247).** A card draws money in its formula's currency (`formulaCurrency`): the growth card shows ₹1,000 and ₹1,331 with Indian grouping and says "rupees" beside the symbol, while the present value cards keep dollars. A plain level (`value`, such as an index) shows as a grouped number with no currency sign, and the `formula` recipe refuses a slider on one, since no slider unit fits it. *Scenario:* a Concept card in the growth Topic opens the `formula` recipe on `compound-growth` with years on a slider; the slider, the card and the line the Tutor reads all say rupees. *Trade-off:* one more unit to keep in step across the card, the recipe and the readouts, tested together in `formula-card-rupees.test.tsx`.

## Growth, compounding and logs, converted (`course/topics/num-compounding.yaml`, `src/teaching/growth.ts`, issue #247)

**What it does.** The second Topic in the new teaching shape (spec #229). It teaches six Skills: compound growth, a fall and a rise that do not cancel, the rule of 72, CAGR, log returns and a steady pace (comparing the CAGR of each stretch). Since #248 a Check teaches one idea, so they sit in six Checks, each card teaching one Skill: `cp-quiz-compounding` (compound growth), `cp-quiz-fall-recover` (new), `cp-quiz-rule-72` (new), `cp-quiz-steady-rate` (CAGR), `cp-quiz-log-return` (new) and the Sensex conversation `cp-sensex-rate`. Every card but the log-return one opens a rupee Formula Card already set (the fall-and-recover card opens compound growth at ₹800 for one year, with the rise on the slider, so moving it to 25% shows ₹1,000 again; the rule-of-72 card opens ₹1,000 at 6% for 12 years). The compound-growth, rule-of-72 and CAGR quizzes draw typed questions from templates, with new numbers each attempt; fall and recover and log returns have no template, so each has six "Which one is true?" or choice questions, two a try. The log-return card now says that a price which ends where it began has a log return of zero, which its true-or-false Quick try needs. It has Quick tries of its own on the steady pace, because a converted Your turn ends only once code's Quick tries show fluency. The teaching engine gained three answer functions (`compound_value`, `rule_of_72_years`, `cagr_percent`) and three Known mistakes (`simple_growth`, `simple_doubling`, `averaged_gain`). Compound growth over whole years is worked exactly; CAGR, a root, is worked in floating point. A draw whose answer lies within 0.001 of a rounding boundary is dropped, so a Learner's own rounding can never be marked wrong. Logs have no Formula Card, so they are taught in words only: back-to-back log returns add up. The change is content-only, so every old Check id stays, in its old order, and no pass is lost; a Learner who passed the old Check 1 and stood at the old Check 2's concept now lands on the fall-and-recover card. Old question ids stay defined so earlier attempts and Reviews still load.

**Scenario.** The Learner reads "Growth on growth" (₹1,000 at 10% a year becomes ₹1,100, ₹1,210, ₹1,331) with the growth card open. A half-done Quick try shows the first year done and asks for ₹2,000 after two years. Typing 2400 gets the simple-growth fix: the second year's 10% is on ₹2,200. The quiz then draws, say, "₹7,000 grows 8% a year for 3 years", marked by code to the nearest rupee.

**Beginner-reader fixes (#248, second pass).** The CAGR card now teaches the method for two years (divide the end by the start, find the number that times itself gives that, take 1 off), and the steady-rate half-done hint says "the end divided by the start", so the steady-rate and steady-pace Quick tries can be answered. The log-return card says what a log return is (press ln on end divided by start) before using it. The fall-and-recover card shows how ₹200 on ₹800 is 25%. Percent's card for Check 1 spells out "bp" and the falls its Quick tries ask for. Full verdicts are in `docs/reviews/`.

**Trade-off.** Quiz numbers come from templates, so the Tutor never invents them, but the templates keep to friendly ranges (whole-percent rates, CAGR over two years from perfect squares) so a beginner can check them by hand. A test fails if any card, Quick try, template draw, fix line or preset holds a number only the reveal or the outline's outcome knows (the 4,467 peak, the 56% fall, the 33% long-run rate). The conversation Check and the story keep the Sensex's own figures. The beginner-reader review that shaped the cards is recorded in `docs/reviews/num-compounding-beginner-reader.md`.

## Connections (`connections` in `course/topics/*.yaml`, `src/course/map.ts`, `src/tutor/context.ts`)

**What it does.** A Topic file may carry two or three Connections: short plain-word links from the Topic's idea to other ideas, each naming the outline Topic IDs it links to. At the principle step, and not before, the Tutor's context carries them with the titles of the linked Topics, and the instructions tell the Tutor to give them there. The Learner can still ask a connection question at any time. A Topic without Connections behaves as it did.

**Scenario.** Present value ends with three: a bond's yield is the market's discount rate (so when yields rise, bond prices fall), safe rates usually fall in a recession while the extra return on risky payments can rise, and far-off cash in a business loses the most when rates rise. At the principle step the Tutor sees each one beside "Bond basics and pricing", "GDP, growth and business cycles" or "DCF valuation", and says them in its own words. Had someone typed `bond-prcing`, `npm run course:check` would fail with `Connection 1 links to "bond-prcing", which is not in the outline`.

**Trade-off.** Code checks the links, not the economics: a Connection that names real Topics can still be wrong, so the text is written once and reviewed by the owner. Connections hold no figures (the check rejects digits, `%` and currency signs), so every number the Learner sees still comes from Case Data or a calculator; the price is that a Connection cannot say "by how much". Links may point at Topics still to come, so the course can link forward before those Topics are written.

## You'll learn (`youllLearn` in `course/topics/*.yaml`, `src/course/map.ts`, `src/course/youll-learn-check.ts`, spec #119)

**What it does.** Each Topic file carries two or three short "You'll learn" bullets that tell a Learner what the Topic gives them; the Topic Start card and the Welcome show them. Claude drafts them from the concept and principle only, never the Insight, the reveal or the Case's outcome, and they sit in the Topic files for the owner to review and reword. The course parser exposes them as `topic.youllLearn`. `npm run course:check` requires them on every written Topic and rejects a bullet that holds a digit, a currency sign or a percent sign, a typed formula (the same raw-formula detector as ADR 0002), or a repeat of the Topic's written Insight. A written Topic with no bullets fails.

**Scenario.** Percent shows "Tell a change in percentage points from a change in percent.", "Read rate moves in basis points, the way bond traders quote them." and "Name the base of every change so its size is never mixed up." If someone rewords the second to "Read a move of 25 basis points", the course check fails with `Topic num-percent-bps has a figure in You'll learn bullet 2; write it in words`. If someone pastes present value's Insight in as a bullet (or the same words in a new order), the check fails with `bullet 3 repeats its Insight`, because the bullets are on screen before the Learner has found it.

**Trade-off.** "Repeats the Insight" is a word-overlap test (the Insight held whole, or three in five of the two texts' meaningful words shared), so it catches pasting and light rewording but not a bullet that gives the Insight away in quite different words; the owner's review is the guard for that. The figure rule is strict: a bullet cannot say "two" as "2", and cannot name a Case's year, which keeps every number the Learner sees in Case Data or a calculator. Every Topic is now filled (the first third by #137, the middle third, Trade and globalisation to Bank runs, by #138, and the last third by #139), so the course check requires two or three bullets on every written Topic, including any Topic written later.

## Guided Tasks (`GuidedTasks` and `GuidedTask` in `src/widgets/library.tsx`, `guided-tasks.ts`, `guided-tasks-view.tsx`, `src/course/written-ahead-check.ts`, issue #66)

**What it does.** Two Widget components put a short stepper under a Widget's controls. A `GuidedTask` is one instruction plus a condition written on a slider's `$variable` (for example `$rate == 0`); `GuidedTasks` lists them. Each task shows as to do, current or done, in the redesign's look (tokens only). They tick themselves in the browser, in order: only the first task not yet done can tick, and a task that has ticked never unticks, even when the slider moves away again. They are practice only: nothing is marked. In the Study Workspace the ticks are saved with the Session (see "Widget state"), so they survive a reload and a tab switch. Three pieces of code guard them. The server's Widget check rejects a task whose condition reads no value bound to a Slider in the same Widget, and the existing correction turn asks the Tutor to rewrite it. `npm run course:check` checks each Topic's explore Widget as the written-ahead Widget it is (`writtenAheadCheck`, one rule for every Widget in a Topic file): it tries the numbers a task names plus each slider's min, max and default, on the steps the slider really takes (0.01 for a percent slider), and fails on a task none of them reaches or one that is already done at the start. At the explore step, the Tutor's context lists the task texts (never the Widget's code or conditions) and tells it not to mark them.

**Scenario.** Present value's annuity Widget has two tasks under the rate slider and the annuity chart before the reveal: set the rate to 0%, then find the rate where the annuity is worth the same as the cash. The slider starts at 5%, so none is done. The Learner types 3.38 first: nothing ticks, because task 1 is current. They press 0%: task 1 ticks. They type 3.36: task 2 ticks, as it does anywhere from 3.36 to 3.39, within 0.02 points of the break-even (about 3.38%). If a later edit made task 2 read `$rate >= 10.5`, the course check would fail, because no slider position reaches it.

**Trade-offs.** Conditions are plain expressions on slider values, so a task can only describe a state the sliders reach; it cannot say "watch the far bars". The "closest" range was worked out by us with the tested annuity formula and the cash option's figure, and a test pins it; the course check itself proves only that it can be reached, not that it is the nearest. Since spec #119 the ticks are saved with the Session as Widget state; on Notes, Older sessions and Home they still live in the page only, so a reload there starts the stepper again. The frozen Widget instructions changed (two components, an example and a rule), so each Session is refrozen at its next new turn after the deploy.

## Exact slider values (`SliderView` and `WidgetFrame` in `src/widgets/library.tsx`, `src/widgets/slider-steps.ts`, issue #143)

**What it does.** Every slider in every Widget has a number box beside it that takes any value from its minimum to its maximum, and − and + buttons that move it by exactly one step and stop at the ends. A percent slider always moves in 0.01 steps, whatever step the Tutor or a Topic file wrote. Every value set is rounded to the step's decimals (so typed percents keep two decimals), and a value outside the range is clamped; text that is no number is ignored. The number box keeps what is being typed until Enter or leaving the box, so typing 3.38 never passes through 3 and 3.3 on the way. When a finished Widget first sets a slider, its declared starting value is moved onto the nearest step; a value restored from Widget state is left as the Learner typed it. The readout prints a value at its own precision (3.38 on a 0.25 slider), without float noise, and a space separates label and value, so it reads "Old rate 4%", never "Old rate4%". Any Widget with a slider shows **Reset** beside its title, which puts every slider back to its starting value. The rules live in one small module, `slider-steps.ts`; the frame finds the sliders at any depth (including a tab not showing) and remembers each one's start.

**Scenario.** A Widget is written with `Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")` starting at `$rate = 5`, and a Guided Task `$rate == 3.38`. The Learner types 3.3812 in the number box and presses Enter: the value becomes 3.38, the readout says "Discount rate 3.38%", and the task ticks. They press + twice (3.40%), drag the slider about, then press Reset: the rate is back at 5%.

**Trade-offs.** Rounding to the step's decimals rather than snapping typed values to the step lets a Learner type 3.38 on a 0.25 slider, which an equality task can then match; the price is that a typed value can sit between two positions of the slider's track. Committing typed text only on Enter or leaving the box costs one extra key press but stops half-typed numbers from ticking tasks. Slider positions are saved with the Session (see "Widget state"), and Reset goes back to the code's starting value, not the saved one. The course check for Guided Tasks still tries the written steps, so it can only be stricter than the page.

## Weekly refresh of Damodaran's posts (`src/library/refresh.ts`, `src/app/api/cron/library-refresh/route.ts`, `library_refresh_runs`, `vercel.json` crons, IL 16, #73)

**What it does.** Every Monday at 21:30 UTC, Vercel calls a route that adds Damodaran's new or edited blog posts to the Library: the text, the spreadsheets the posts link to, the embeddings, and a refresh of the keyword statistics. The route sits outside the passcode gate (the gate skips exactly `/api/cron/library-refresh` and nothing else) and answers 401 unless the request carries `Authorization: Bearer <CRON_SECRET>`; with no secret set, nobody gets in. It works for at most 200 seconds of the 300 a function may run, starts no new post, picture or file in the last 40 seconds (kept for embedding and statistics), and takes at most five posts a run, oldest change first.

**The run log.** Each run is a row in `library_refresh_runs`: when it started and ended, what it added (post, title, new or edited, passages, spreadsheet files), everything that failed, and a watermark. The log is also the lock: the database allows only one `running` row, so a second run starting at the same time is refused with 409, and a run still `running` after ten minutes (the function was cut off) is marked failed by the next one. The watermark is how far through the blog's "updated" times the run got; the next run asks Blogger only for posts changed after it. A post that fails is logged and the watermark stops at it, so it is asked for again next week. A failing reindex or vacuum after the posts are in is logged as a problem (step "statistics") and does not undo the run: it still finishes `done` with its watermark.

**Accepted limit.** A post that fails every week (malformed HTML, an over-size sheet) keeps the watermark at itself, and with five posts a run it is retried first each time, so newer posts are reached only while fewer than five older ones fail. We accept this for now: the log shows the failing post by name, and counting failures per post to skip it would need a new store for little gain at this volume. If it ever bites, the fix is to skip a post after N failed runs.

**Scenario.** On Monday Damodaran has published one post with two pictures and a linked valuation spreadsheet, and corrected an older post by adding a paragraph. The run reads the pictures with the model (a few cents), downloads the spreadsheet, and files the new post's passages under its publication date. For the corrected post, any passage whose text is already stored keeps its old date; text that is new is dated by the post's updated day. A Case set between the post and the correction therefore never finds the added paragraph, even though it is "in" a post from before the Case.

**Trade-offs.** Dating by the edit is safe against hindsight but blunt: when an added paragraph is packed into the same passage as older text, that whole passage becomes new text and is hidden from earlier Cases until the edit's date. Picture text is not placed yet: the pictures are read and stored (the same reader as the laptop backfill), but `PLACE_PICTURE_TEXT` stays off until the owner decides in #108, because the readings' numbers agreed with an Opus re-read in only 7 of 40. Pictures are read once: each reading is stored by the picture's address in `library_pictures`, so an edited post, or a post tried again after a failure, reuses the same words and keeps its passages' dates (a second reading would not match word for word and would count as new text). The laptop's `pictures.json` is copied in once with `npm run library:seed-pictures`. Each post and spreadsheet file also gets a row in `library_documents` with its published and updated times as the source gave them. A picture that fails to read is simply read again next week. Five posts a week keeps a run inside its time and the model bill small, and a busy week simply continues next Monday. Without `VOYAGE_API_KEY` the new passages stay keyword-only (the run says so); without `ANTHROPIC_API_KEY` the pictures are left out (it says so too). Setting `CRON_SECRET` in Vercel and the first manual run are done by the owner after deploy. The `xlsx` package is installed from SheetJS's own site (`cdn.sheetjs.com`), not from npm, because SheetJS no longer publishes current versions to npm; the lockfile pins it with an integrity hash, so do not "fix" it to an npm version when bumping dependencies.

## Formula markers and the typed-formula check (`src/finance/formula-markers.ts`, `formula-text.ts`, `raw-formula.ts`, `src/course/formula-check.ts`, `src/widgets/marked-text.tsx`, issue #65)

**What it does.** A Topic's text can name a registry formula and its example numbers in a marker, such as `{{formula:present-value amount=1100 ratePercent=10 years=1}}`. Code does everything else with it. In a quiz or spaced-review explanation the marker is drawn as a small static Formula Card (the numbers plain, no slider, the result from the formula's tested calculator). In what the Tutor is sent, the marker is replaced by plain words: the formula's name, each input in words and the computed result, never the marker itself. A single detector, `rawFormulaHits`, finds a formula typed as symbols or arithmetic (an equals sign, a power, "(1 + r)", spaced division or multiplication) and ignores ratios like P/E and 50/50, dates, rupee figures, links, markers and code fences. Three things use it: `npm run course:check`, a behaviour rule called "typed formula" (graded by code alone, with one direct and one indirect question), and later the model comparison.

**Scenario.** The present value quiz asks for $1,210 received in two years at 10%. After the Learner answers, the explanation says "Two years at 10% means dividing by 1.10 twice" and shows a Formula Card with $1,210, 10% and 2 years filled in and $1,000.00 worked out by code. If someone later writes "PV = 1,210 / 1.21 = 1,000" into present value, the course check fails and names the line. If a Learner asks the Tutor to "write out the present value formula", the behaviour run marks the reply failed when it holds symbols, with no grader model call and no cost.

**Trade-off.** The detector is strict: it also catches worked sums such as "100 / 1.10 = 90.91", so 86 other Topics that type formulas are on a not-yet-converted list (`NOT_YET_CONVERTED`). That list can only shrink: a Topic on it that has become clean must come off, and a Topic off it that types a formula fails. A strict detector means a few false alarms in a converted Topic, which are fixed by rewording into worded steps; it never means a missed formula going out unnoticed. Question Bank items are not scanned yet (they live in the database), so a Topic's quiz that uses a bank item can still show one until its explanation is converted or the item is swapped. A marker is checked when the Course Map loads: it must name a formula on the Topic's own `formulas` list and give exactly that formula's inputs.

## Topic files carry the teaching, checked by the lesson lint (`src/course/map.ts`, `lesson-lint.ts`, `lesson-presets.test.ts`, `lesson-fixture.ts`, `lesson-lint-fixture.ts`, `formula-check.ts`, `presetValueProblems` in `written-ahead-check.ts`, `scripts/check-course.mjs`, spec #229, ticket #237, ADR 0006)

**What it does.** A Topic file can now hold its own teaching, in new fields that are all optional, so every Topic written before loads unchanged. A Topic gets an example currency (`exampleCurrency`, rupees by default, for its everyday examples; a Case keeps its own currency), one Running example with its numbers, the terms it introduces, its Skills (each a rule in plain words and at most one analogy) and its question templates. Each Check gets one Concept card (a title, a few lines, one line to write down, the Skills it teaches, and a Widget preset: a recipe such as `rate_move` with its inputs, or one of the Topic's written-ahead Widgets with its sliders' values) and its Quick tries, fixed or drawn from a template. A quiz Check can draw typed questions from templates, which count as an unlimited pool, and a conversation Check lists the Skills it tests. A quiz question can carry a Skill, and a wrong choice a Known mistake with its fix. A Topic that lists Skills is converted (`isConverted`); `testedSkills` says which Skills a Check tests, and the Course Map finds a template by id. Fixed items and templates use the teaching engine's own shapes (`FixedItem`, `QuestionTemplate`, src/teaching), so code marks and draws them as written. The schema rejects an answer or mistake function the engine does not have, naming it and the allowed list, and any Skill, template or written-ahead Widget that does not resolve. A file can mark a restructure as content-only: Check ids stay, so passes stay, and the Course Navigator already keeps each Learner's step.

The lesson lint (`lessonLintErrors`) then checks every converted Topic, after the typed-formula check, in `npm run course:check`:

- **L1:** every Skill a Check tests is on a card at or before it; every Check has a card; every listed question has a Skill; each Quick try's Skill is on its Check's card or an earlier one; no Question Bank questions; the terms are listed; a conversation Check lists the Skills it tests.
- **L2:** three Quick tries per Skill (a template is unlimited), one of them half-done, and three times the per-attempt count of distinct questions in each quiz Check (or a template).
- **L3:** five lines at most on a card, with its write-down line; no sentence over 20 words.
- **L4:** each Widget preset is valid.
- **L5:** the currency matches the Topic: no $, USD, € or £ in a rupee Topic, no ₹ or Rs in a dollar one.
- **L6:** no question prompt or ask says "wrong", "not" or "except", bold or not (the Check tab cannot show bold). Unlike the other rules it runs on every Topic, converted or not, and reads every question in a Topic file, even one no Check lists (such questions are kept only so old attempts load). The 19 older questions that had a negative stem were reworded with their ids and answer ids kept, so stored attempts and review cards still match. Question Bank items live in the database, so `course:check` cannot see them: L6 is out of their reach.
- **L7:** no question a Check lists, and none of 50 draws of a template it lists, holds all the numbers of the Running example or of a card's own worked example.
- **L8:** every Quick try practises a Skill its own Check tests (`testedSkills`). Your turn picks tries only for the Check's tested Skills, so a try on any other Skill would never be shown; the message names the Skills the Check does test and asks for a question or template on the missing one.
- **L9:** no draw of a template a Check uses (its quiz templates and its template Quick tries) repeats a fixed question or Quick try of the same Check. A draw repeats an item when every number the draw put into the ask is in that item's text; the rule takes 1,000 seeded draws of each template and names the first clash, asking for one of its numbers in the template's avoid list.
- **Draws:** every template draws 50 seeds and marks its own answer right; a fixed try's answer is exact at its decimals, and no Known mistake equals it.

Apart from L6, the rules run only on Topics off `LESSON_NOT_YET_CONVERTED`, which holds all 95 Topics today and can only shrink: a listed Topic that gains Skills must come off, and an unlisted one without Skills fails. A content-only restructure fails if any Check is required, so no Due Check appears. The typed-formula check also reads every new text (card lines, Skills, Quick tries, templates, choice fixes, the Running example), and a typed sum there fails even for a Topic still on its own not-yet-converted list.

**Scenario.** Someone converting Percent moves the percent-change rule from Check 2's card to Check 3's but leaves Check 2's percent-change template in place. CI fails with `L1: Check "num-percent-bps-check-2" tests Skill "pct-change", which no Concept card at or before it teaches (Topic "num-percent-bps")`, the gap the Percent Session showed. If a card line says "5 - 4 = 1 point", the typed-formula check names that line; if a template could draw "from 4% to 5%", L7 says to add those numbers to its avoid list. When Percent's Check 1 had three Quick tries on `pts` but only basis-point templates, L8 named each try; when `double-time` could draw "Money grows 9% a year", the rate of Quick try `cp-try-72-half` in the same Check, L9 named the clash.

**Trade-off.** Plain Node runs the course check, and it cannot load the Widget recipes (their imports have no extensions), so `course:check` checks written-ahead presets only (`presetValueProblems`: slider names, range and step, the same rules `open_widget` will use for a Tutor preset). Recipe presets are built with the recipe and run through the Widget checks in `lesson-presets.test.ts`, which is part of `npm run check` but not of `course:check` alone. The not-yet-converted list means the new rules guard nothing until a Topic converts; that is on purpose, as with the typed-formula list. L7 compares numbers, not moves, so a question that happens to use 4 and 5 for something else fails too; the fix is a different number. `src/course/lesson-fixture.ts` holds one full converted Topic, built from the spec's gold cards, for tests that need one.

## Topic Notes and the Notes page (`src/learner/notes.ts`, `src/app/notes/`, `src/app/api/notes/route.ts`, table `note_items`, issue #69)

**What it does.** A fifth header link, "Notes", opens a page titled "Notes" that lists the Topics in course order, each as a Topic Note (since spec #119 only the Topics that have a note, with "Show all Topics" for the rest: see "The Notes filter and Undo" below). When a Topic is passed, code fills in its note with no model call: its Formula Cards drawn with example numbers (the numbers from the first marker in the Topic's own text that names the formula, else the registry's working example, with results from the formula's calculator), the Insight in the Learner's own words (beside the written Insight only when the Tutor had to tell it), the principle, the Connections and the mistakes the Tutor noticed. Nothing of that part is stored: it is built from the current Topic file and the Learner's records every time the page opens. What is stored is only the Learner's own lines, in `note_items` (kind "line"), which they can add, edit and delete on any Topic, passed or not, through `/api/notes` behind the passcode. The table also has empty columns for the saved replies and Widgets of the next ticket. The page prints: the header, buttons and boxes for typing are hidden on paper, a Topic with nothing on it is left out, and the light look is forced onto white.

**Scenario.** The Learner passes present value after being told the Insight. On the Notes page its note shows the Formula Card with $1,100, 10% and 1 year and $1,000.00 worked out, "In your words: just tell me" beside "As written: waiting has a price", the principle, three Connections and the mistake "added the interest instead of dividing". They add the line "divide, do not subtract" and press Print. Before passing bond prices they can already add lines there, but its note says it fills in when they pass.

**Trade-off.** Building on read means a note always follows the latest Topic file: if the owner rewrites a principle, old notes show the new words, and a Learner's printed copy and the screen can differ over time. A stored snapshot would keep the old words but would need a second copy to keep in step. The Insight words and the mistakes come from records that never change once written, so only the course text moves. Own lines are plain text of up to 2,000 characters with no formatting, which keeps the page simple and safe to print.

## Save to notes (`src/learner/saved.ts`, `src/app/save-to-notes.tsx`, `src/app/api/notes/saved/route.ts`, `src/widgets/settings.ts`, table `note_items`, issue #70)

**What it does.** Every finished Tutor reply, every Widget in the panel and the explore Widget has a quiet "Save to notes" button, in the workspace and in old Sessions. Only a pointer is stored in `note_items`: for a reply, the Session and the turn (the seq of the Learner's message that began it); for a Widget, also its number in the reply and the numbers on its sliders at that moment (the explore Widget is number -1 and has no reply). The browser never sends Widget code. The server finds the code in the stored reply, or in the Topic file for the explore Widget, and keeps only the slider numbers for variables the code really declares. The Topic is the last one the Tutor's context named by that turn (so a save from an old Session lands on that Session's Topic), else the Learner's current Topic. On the Topic Note the Notes page then draws a "Saved from Topics" block, straight away, passed or not: a reply is read back from its Session like an old Session, with its sources folded and the as-of rule applied at the moment of reading; a Widget is drawn live from its code with the saved numbers written in place of its starting ones (`applySettings`). "Remove from notes" takes an item off; the Learner's own lines are never touched by it. The "done" event of a turn now carries the Session and turn, so a reply that has just finished can be saved without a reload.

**Scenario.** On the Cash-now-or-later Case the Tutor's reply cites a Damodaran post dated after the Case's as-of date. The Learner saves it. Opening the Notes page before the reveal shows the reply with that source listed as "hidden until the reveal"; after the reveal the same saved reply shows its heading and credit. They also save the explore Widget with the rate slider at 8%; a week later the note shows it at 8%, ready to move again.

**Saving twice.** The table has a unique index over the Topic, kind, Session, turn and Widget number (Learner lines excluded), and a save inserts first and treats a clash as "already there", so a double click or two tabs cannot make two rows; the slider numbers of a repeated Widget save are updated. Since spec #119 the control itself also stops a second save: once saved it reads "Saved ✓ · Undo · Open notes" and has no Save button until Undo.

**Trade-off.** Storing a pointer instead of a copy means a saved reply always follows today's as-of rule and sources, and cannot go stale or leak an outcome from a frozen copy; but it depends on the Session's messages staying (they are add-only) and a reply saved from a Session cannot be edited. Settings are only slider numbers, so a Widget whose state is anything else reopens at its starting values. Since spec #119 a save from the Study Workspace names the Widget's key too, and the note keeps the values saved under that key with the Session (see "Widget state"). A static page render cannot show the slider numbers, because the Widget library fills them in after the first browser render, so the test checks the code the numbers are written into.

## The Notes filter and Undo (`src/app/notes/notes-view.tsx`, `src/app/notes/undo.tsx`, `src/app/save-to-notes.tsx`, `src/learner/saved.ts`, spec #119, ticket #152)

**What it does.** Notes has a visible title and, by default, lists only the Topics that have a Topic Note: a passed Topic (code fills its note in), or one where the Learner wrote a line or saved a reply or Widget. A Learner with none sees one short line instead of a column of empty cards. "Show all Topics" is a plain link to `/notes?all=1`, which lists every Topic so a line can be added to one not reached yet; on that view the link reads "Show only Topics with notes" and goes back to `/notes`. The filter runs on the server from the same notes, so there is no state in the browser to lose. Saving is safe both ways. After **Save to notes** in the Study Workspace or an old Session, the control reads "Saved ✓ · Undo · Open notes": there is no button to save the same thing again, Undo deletes that saved item (by the id the save answered with), and Open notes goes to `/notes#note-<Topic>`, the anchor on that Topic's card. On Notes, **Remove from notes** and a line's **Delete** take the item off at once and show one Undo toast at the bottom of the screen for eight seconds. Undo puts it back through the ordinary routes: a line is added again with its words, and a saved item is saved again from what the page was given with it (`again`: its Session, turn, Widget number and slider numbers, and for the explore Widget its Topic, so it goes back on that Topic even after the Learner has moved on), so the server checks it exactly as a fresh save, Learner ownership included. The item reappears where it was. A second removal replaces the toast, and neither the toast nor the toggle prints.

**Scenario.** A Learner who has passed present value and saved one reply on bond prices opens Notes and sees two cards, not ninety-five. They remove the bond reply by mistake; the toast says "Removed from notes. Undo", they press Undo and the reply is back in its place. Later, in the Study Workspace, they save a Widget, see "Saved ✓ · Undo · Open notes", and press Open notes to land on that Topic's card.

**Trade-off.** Undo removes at once and restores by saving again, rather than holding the delete back until the toast goes. That keeps the database honest at every moment (a reload or closed tab never brings back something the Learner removed, or loses an Undo they pressed), and needs no new table or route; the price is that a restored item gets a new id, and after a reload a restored line or saved item sits at the end of its Topic's list rather than in its old place. Undo after a save deletes the saved item even if it had been saved earlier from another tab, because there is only ever one row per reply or Widget. The filter is a link, not a switch held in the page, so the choice is in the address and survives a reload, at the cost of one page load per toggle.

## The Widget eval (`scripts/widget-eval.mjs`, `npm run widgets:eval`, UX audit 13.3 and ★.10)

**What it does.** It sends the 20 beginner prompts of the audit to the real Tutor in a real headless browser and measures what comes back. For each prompt it starts the tools Learner over, walks Welcome to "Start this Topic", waits for the opening turn, types the prompt, presses Send and times three moments from there: the first Widget content on screen, the first enabled control in it, and the end of the turn. It also notes a "Drawing…" skeleton that stays up for more than 12 seconds. Afterwards it reads that Session's rows from the database to see which lane served the Widget (a recipe, compose, fallback, a fence in the reply, or none) and runs the code checks on the Widget's program: validator problems and warnings, charts outside Tabs, a Verdict or Stat, the archetype from `archetypeOf`, the information budget, numbers from code or data, and overflow at 480 px. It saves one screenshot per prompt and writes a JSON and a Markdown report with the ★.10 targets marked pass or fail. The Purpose, Concrete and Delight scores are not computed: a person or a model reads the screenshots and hands the scores back with `--scores`.

**Scenario.** After a change to the Widget engine, run a local production build against the Neon test branch, then `npm run widgets:eval -- <folder>`. Prompt 3 ("SIP, 1000 a month for 20 years") comes back as a `grow_money` recipe, Grow archetype, 46 s to first pixel on a slow Tutor turn; the report shows that as a failed first-pixel target and the screenshot shows the Widget. `--only 3,11,19` runs a few prompts as a smoke test.

**Trade-off.** It makes 20 to 25 real Tutor turns, so it costs a few dollars and takes about 25 minutes, and it never retries a slow or poor answer, because that is the result. It only runs against a local server and the tools Learner. The raw timings include the model's thinking time and, on a laptop far from the database, about 35 s of database round trips per turn, so the report also gives production-equivalent timings: the model's step durations from the `usage` table plus 100 ms of tool work, 500 ms of server overhead and the locally measured client render. When the Tutor shows the Widget that is already on screen again, no arrival can be seen and the timing is left empty with a note. The checks load the app's TypeScript through `tsx`, which comes with the installed tools but is not a direct dependency.

## Present value pilot check (`src/tutor/pilot.test.ts`, `src/course/connections-check.ts`, `scripts/browser-check.mjs`, ticket #74)

**What it does.** Three guards that the insight-led Topic works as one piece. (1) One turn test plays present value start to finish with a scripted Tutor and a real in-memory database: story and concept, then explore (a miss that earns hint 1, then the Learner's own words found), the Learner's turn, the Check, the reveal and the principle with its Connections, ending with a passed Topic. It then reads the Topic Note and expects the Learner's words, the Connections and a Formula Card that code works out from the registry's calculator. (2) The course check now fails any Topic that has an Insight but not two or three Connections. (3) A browser script signs in to a local server as the tools Learner, starts it over before each part (see "The tools Learner"), seeds the fresh Learner with inserts only, and takes screenshots at laptop and upright-iPad sizes in light and dark: the explore Widget, Guided Tasks ticking, the live Formula Card, folded sources, Notes and Settings. Since ticket #158 it also checks what only a real browser shows: a reload, a switch of the panel's tabs and a second browser tab keep slider values and ticked Guided Tasks; with a quiz open, the last Tutor message and the message box stay on screen and the page is no taller than the window; and the first-visit walk, sign-in → Welcome → Start this Topic → Next chips → quiz → passed, pressing only named buttons and answering from the Topic file's answer key. Only the walk calls the model (real Tutor turns on the local server, a few cents); `--skip-walk` leaves it out.

**Scenario.** Someone edits the Tutor's context so the principle step stops listing Connections: the turn test fails at the principle step. Someone adds a second Insight Topic and forgets its Connections: `npm run course:check` says `Topic "x" has an Insight, so it needs two or three Connections (it has 0)`. Someone changes the Formula Card so the rate slider no longer moves it: the browser script fails with "the Formula Card did not change when the rate slider moved". Someone lets the quiz panel push the page taller: it fails with "the page grew to 1460px in a 900px window".

**Trade-off.** The turn test proves the wiring and the saved records, not what Opus will actually say; that is the live run's job. The browser script needs a Neon test branch and a local server, so it runs by hand rather than in CI, and it seeds the test branch directly with SQL, so a change to those tables means updating the script. The walk depends on the live Tutor finishing each step, so a slow or odd reply can fail it; it waits up to four minutes for each press.

## Own passcodes, the Learner-carrying cookie and the dropped owner defaults (`src/auth/passcode.ts`, `learners.ts`, `session.ts`, `src/proxy.ts`, `drizzle/0028_learners_contract.sql`, spec #119, ticket #127)

**What it does.** Each person signs in with their own passcode and lands in their own Learner.
- **The passcode list.** The environment value `PASSCODES` lists `name:passcode` pairs, separated by
  commas or new lines, for example `owner:…, test:…, tools:…`. A name has no colon and a passcode
  has no comma. The owner's name must be `owner`, the Learner the expand migration gave every old
  row to. While `PASSCODES` is unset or empty, the old single `PASSCODE` still signs in as the owner;
  once `PASSCODES` is set, `PASSCODE` no longer signs anyone in. Every listed passcode is compared, so
  timing doesn't hint which one nearly matched.
- **Signing in** (`/api/login`). A right passcode signs in as its name's active Learner, and the first
  sign-in under a name makes that Learner (empty: no Learner Profile, progress, Notes or Sessions).
  Two first sign-ins at once still make one, because the database keeps one active Learner per name.
  Each sign-in logs which Learner it opened ("Sign-in: opened Learner 4 (test)") in Vercel's logs.
- **The cookie** carries `<Learner id>.<signature>`, the signature an HMAC of the id under
  `SESSION_SECRET`. Changing the id breaks the signature. The old cookie, a signature with no Learner,
  is refused, so everyone signs in once more after this change.
- **Checked on every request.** The proxy checks the signature and then loads the Learner, and every
  page and route does the same again (`currentLearner()` in `src/auth/session.ts`). A Learner that is
  archived (Start over) or whose name was taken off the list counts as signed out: pages go to the
  login, API routes answer 401, and the login page shows its form. A signed-in Learner who opens the
  login still goes straight to the Study Workspace or the safe `next`.
- **The dropped owner defaults** (migration 0028, the contract step). Every `learner_id` column lost its
  default, so a write that forgets the Learner fails in the database instead of quietly giving the
  row to the owner. The code has no owner fallback either: every reader and writer, the Tutor Turn's
  and the Library's dependencies, and the Case Data route take the Learner as a required argument, so
  a call that forgets it does not compile. Signed-out Home names no Learner and reads Case Data with
  an empty Progress, so nothing counts as revealed.

**Scenario.** The owner sets `PASSCODES` to `owner:<his old passcode>, test:<a new one>` in Vercel and
redeploys. His laptop's old cookie is refused, so he signs in again with the same passcode and finds
his Topics, Notes and Sessions as he left them. He gives a friend nothing yet, but signs in as `test`
in a private window: a new, empty Learner, with no Learner Profile, so the Tutor no longer calls him
"a student in Mumbai". Later he removes `test` from the list; that window is signed out at its next
click.

**Trade-off.** Checking the Learner in the proxy costs one small database read per signed-in request
(only after the signature checks out, so a forged cookie costs nothing). In return an archived or
removed Learner is signed out at once, everywhere, and the login page can never bounce between itself
and the Study Workspace. Passcodes live in an environment value, so adding a person means editing it
and redeploying, and a passcode can't contain a comma. Dropping the defaults means any forgotten
Learner id is an error the Learner sees, rather than a silent leak into the owner's data.

## The Widget test bed (`src/widgets/fixtures/audit/`, `src/widgets/legacy-fixtures.test.tsx`, `src/app/dev/widgets/`, `scripts/layout-check.mjs`, UX audit §13)

**What it does.** Three tools around the eleven Widget programs the Tutor wrote during the UX audit (3 Nov 2026), kept as
files. (1) `legacy-fixtures.test.tsx` runs in CI: each program must pass the Widget check and draw through the real
library and renderer, with synthetic Case Data (the real data never goes into git). (2) `/dev/widgets` is a developer page
that draws one fixture with the real `WidgetView` in a frame with the Study aside's and Widget card's classes and test ids,
at a panel width of 360, 480 or 560 px, in light or dark, optionally from given slider values (`?fixture=…&width=…&theme=…&state={…}`).
Without `fixture` it lists every fixture with a link at each width. It reads Case Data JSON from the folder in
`UX_CASE_DATA_DIR`. The proxy lets `/dev/*` through without a sign-in only outside production, and the page answers 404 in
production too. (3) `scripts/layout-check.mjs` (`npm run layout:check`, not in CI) drives Chromium against the harness and,
as the tools Learner on a Neon test branch, against `/study`: fit at three widths, Sensex spacing, sticky axis ticks,
SIP's top tick, scrolling, cursor and press feedback, navigation feedback, theme tokens, touch, and Stop.

**Scenario.** A later change gives every Slider row an automatic wrap. Its author opens
`/dev/widgets?fixture=07-sip-1000-month.openui&width=360` and sees the two sliders still run off the card, runs
`npm run layout:check` and watches the fit check go green; CI separately proves that the saved Sensex and lottery programs
still draw after the change.

**Trade-off.** The fixtures are frozen copies, so they show how old programs look today, not how the Tutor writes now; new
fixtures are added beside them, never swapped in. The browser check is not in CI (it needs Chromium, a running server and a
test database), so it only protects the changes someone remembers to check; the happy-dom test is the part that always runs,
and it proves a program draws, not that it looks right.

## Widget parts, wave 1 (`src/widgets/primitives/wave1/`, `calculateParts` in `src/finance/calculators.ts`, REPORT.md 7.3)

**What it does.** Nine new Widget parts, each small, keyboard-operable and drawn by code: `Stat` (one formatted number),
`Verdict` (the sentence a comparison ends in), `QuickCheck` (tap-to-answer practice), `Predict` (lock in a guess, then
reveal), `Versus` (two bars on one scale), `Breakeven` (hunt for the flip point), `MoneyStack` (count the notes),
`Waffle` (percent, points and basis points as squares) and `Pictogram` (the thing itself, such as gold bars). `Pictogram`
and `MoneyStack` are two uses of one `IconGrid`, with 16 small objects on a 24 by 24 grid. They are exported together as
`WAVE1_PARTS`; the Widget library does not register them yet, a later change does. Numbers come only from props or from
calculators: `MoneyStack` asks `calculateParts`, which splits a total into its parts (a SIP into money put in and gain, a loan
into principal and interest) by calling the same `calculate` as the Calculator widget. Teal marks what the Learner set, amber
what is sourced, neutral what code worked out.

**Scenario.** On the Sensex story the Learner drags `Predict` to 12% and presses "Lock in my guess". The real 33.5% a year
(worked out by the `cagr` calculator) slides along the same track, and the sentence says it was 21.5 percentage points higher.
The guess lives in a `$variable`, so a saved note still shows it. On the lottery case a `Breakeven` shows only Far, Warmer, Close
as the Learner moves the rate slider; at 3.38% it says "Found it", draws a notch and then the amber tick for the 30-year
Treasury yield that week, so the Learner sees the lottery priced its cash option at about the safe bond rate.

**Trade-off.** Every part is a plain React view that takes plain props, with a thin wrapper that reads the `$variable`, so
the views are tested without the Widget library. Bars, notes and icons keep their scale while a slider moves (the scale only
grows), which costs a little precision in the first view but means a change is always seen as a change in number, not in axis.
Charts here avoid the navy brand colour, so a `Versus` winner is the darker grey rather than blue. A guess stays in the
`$variable`, but "locked" is kept only while the page is open, so a reload reopens the slider with the saved guess.

## Interaction foundation (`src/app/globals.css`, `src/app/ui.tsx`, `src/app/nav-link.tsx`, `src/app/route-skeleton.tsx`, `loading.tsx` per route, `src/widgets/genui-theme.tsx`, UX audit lane "foundation")

**What it does.** One base under every screen so a press, a wait and a theme switch feel the same everywhere.
`globals.css` holds the timing tokens (`--dur-press` 90ms, `--dur-ui` 150ms, `--dur-panel` 200ms, `--ease-out`), the pressed
navy (`--brand-pressed`) and the focus ring colour (`--ring`), plus Tailwind aliases (`bg-brand`, `text-ink`, `border-border`).
A base layer gives everything pressable a pointer cursor and everything disabled a not-allowed one, and switches off the grey
tap flash. The `pressable` utility moves a control 1px down and in on `:active` (not `:hover`, so a finger gets it too).
`ui.tsx` has one `Button` (primary, secondary, ghost; small or medium; `loading` shows a spinner and sets `aria-busy`), a
`Chip` with idle, showing and drawing states and at least 28px tall, a 32px `IconButton`, a `Spinner`, and `NavLink`
(re-exported from `nav-link.tsx`), whose dot carries `data-link-pending` while its page loads. Each route has a
`loading.tsx` that shows the real header with hairline blocks where content will land. The OpenUI kit's colours are mapped to
our tokens at `:root` (and a test keeps that block equal to `genui-theme.tsx`), so they follow the Learner's dark switch, not
the operating system's.

**Scenario.** Siddharth taps Course Map on his iPad. The link's dot appears at once, the button dips for 90ms, and the
Course Map's skeleton shows under the same header instead of a frozen page. In dark mode, a Callout in a Widget has a navy
title, not the kit's indigo, even when his iPad itself is set to light.

**Trade-off.** The skeleton is drawn from the page's layout by hand, so it can drift from the real page when that page's
layout changes. In return the first paint after a click is instant and nothing jumps. The OpenUI mapping lives in two places
(code and CSS) because CSS cannot import code; the test is what keeps them honest.

## Widget parts, wave 2 (`src/widgets/primitives/wave2/`, REPORT.md 7.3)

**What it does.** Seven more Widget parts, exported together as `WAVE2_PARTS` (the Widget library does not register them yet,
library-v2 does). `DrawTheLine` shows a dataset's history up to its as-of date and lets the Learner draw eight slices of what
came next, then press "Show me what happened". `PriceTag` and `ShrinkingNote` show inflation twice: a price tag that ticks up,
and a note whose printed value stays put while its buying power shrinks inside it. `TimeTravel` drags one coin from today to
year 30 (or, with payments, brings a row of coins to today where they stack up). `StepThrough` is a worked example with Back and
Next, whose child `Step` can ask the Learner to type a number that code checks. `Rank` puts items in order by drag or keyboard,
then checks and shows a reason for each. `Waterfall` takes revenue, then each cost, then adds up what is left. An eighth part,
`RateMove`, came later with the `rate_move` recipe (spec #229): see "The rate-move recipe and the RateMove part". Every figure is
worked out by code: the tested present value and inflation formulas, or the Case Data the server sends.

**Scenario.** On the Sensex story `DrawTheLine` shows 1979 to 1990. The Learner draws a gentle climb, and each stroke is written
to the `$drawn` variable at once, before any reveal. The server holds back every point after the as-of date until the Topic's
reveal has been shown, so before then the part has nothing to reveal: it says the rest comes at the reveal and keeps the line. After
the reveal, pressing the button draws what happened in amber and writes "Your line was 40% below what happened, on average."
For inflation, `PriceTag("Vada pav", 20, $infl, $years)` and `ShrinkingNote(100, $infl, $years)` move together as the years slider moves.

**Trade-off.** `DrawTheLine` draws in slices, not freehand, so it can be used with the keyboard (each slice is a vertical slider)
and its answer is a handful of numbers that fit in Widget state; a freehand curve would feel better under a finger but could not
be operated or saved the same way. Its horizon is always half the length of the history shown, so the size of the drawing space
never hints at how long the outcome lasts. `StepThrough` refuses a body that contains a formula in symbols (ADR 0002) and points to
the Formula Card instead, which means a model that types "PV = FV / (1 + r)^n" in a step gets a short pointer, not the formula.
`Rank` always starts in a shuffled order that is never the answer, so it can be checked straight away without the Learner moving anything.

## The composer: Stop, progress labels and the open question (`message-box.tsx`, `turn-stream.ts`, `left-column.tsx`, `session-item-view.tsx`, UX audit 4.1b, 4.2e, 5.11, 5.12, 8.5, 10.1)

**What it does.** The browser half of Stop and progress. While a reply runs, Send becomes a Stop button with a
spinner. Stop is its own request (`{ stop: true }`); the reply's stream is never cut, so it ends by itself with
`stopped` then `done`, and the browser treats that as finished (no resume). It keeps the words written, drops a
Widget the Tutor had not finished, and draws a small muted "Stopped" note where the reply ended (the same item the
server stores, so a reload agrees). `progress` events replace "Tutor is writing…" in the writing indicator
("Looking up Case Data…"); the first words of the reply clear the label; `ping` is ignored. Attach a passage is a
ghost button with a paperclip that reports `aria-pressed`. The chat viewport scrolls inside itself
(`overscroll-contain`, a stable scrollbar gutter, and `relative` so hidden labels stay inside it). A slim line above
the message box pins the open question (the Insight question) while the Insight is unsettled.

**Scenario.** The Learner asks for a chart, sees "Looking up Case Data…", then the words arrive. They change their
mind and press Stop: the button reads "Stopping…" and about half a second later the reply ends with "Stopped" under
it and Send comes back.

**Trade-off.** If Stop lands before the server has saved the turn, it answers `{ stopping: false }`, so the browser asks
again a few times (400 ms apart) before giving up. The pinned question only shows when the page passes one; it is
not worked out from the conversation.

## Widget language v2: the new parts, archetypes and Widget notes (`src/widgets/library.tsx`, `check.ts`, `src/tutor/widget-context.ts`, `turn.ts`, UX audit 7.2 to 7.6)

**What it does.** The Widget library now registers the 16 parts of waves 1 and 2 (Stat, Verdict, QuickCheck, Predict, Versus,
Breakeven, MoneyStack, Waffle, Pictogram, DrawTheLine, PriceTag, ShrinkingNote, TimeTravel, StepThrough with its Step, Rank,
Waterfall), appended after the old parts, and allows them directly in a Widget, a Card, a TabItem and an AccordionItem. The
Tutor's notes are rewritten as grammar v2: the title is a question, one control (others under "More settings"), the answer
(Verdict or Stat) right under it, one visual, at most 3 numbers and 25 words, numbers in a Stat rather than joined into text,
QuickCheck rather than Select, Predict before a guessable answer, Breakeven for a "find where it flips" task, no pie or radar
charts. An archetype table maps an idea to a kind of Widget (Grow, Compare, Convert, Chain, Predict, Rank, Check, Formula).
`archetypeOf(code)` in check.ts names a Widget's archetype from its parts, with the same names as the recipes. Style problems are
warnings (`widgetWarnings`): the information budget, a number joined into text with +, typed numbers in Predict or Versus, a
Pictogram object we do not draw, a Guided Task most of a slider's range ticks. They never start a correction round. Instead,
at the next turn, `widgetNotes` in widget-context.ts builds a "Widget notes" line (the last two archetypes, and the warnings
about the Widgets of the last reply) and turn.ts adds it to the Learner's message. Hard errors stay for correctness only: a
QuickCheck answer out of range or with not 2 to 4 options, and a Rank whose order or reasons do not fit. A slider Widget whose
discovery is a Breakeven, Predict, DrawTheLine, QuickCheck or Rank needs no Guided Task; two Widgets may draw the same
`reference/<id>` data; and a reply that already showed a Widget through show_widget has any fence of its own left out.

**Scenario.** The Learner asks "is the annuity better?". The Tutor draws `Widget("At what rate does the cash option win?",
[rate, find])` with a Breakeven, so no Guided Task is asked for. Two replies later it draws a quiz with three Selects and a score
joined with +. Nothing is corrected, the Learner sees it at once, and with their next message code adds "Widget notes (code):
Recent archetypes, latest last: Compare. About "Practice": 3 controls are showing… score: a number is joined into text
with +. Show it with Stat." The next quiz uses QuickCheck and a Stat score.

**Trade-off.** The 16 parts make the prompt longer, so each part's description in the prompt is a short one written in
library.tsx (the parts keep their own long ones), two examples were dropped, and the old notes were tightened: with the widget
engine off, the Tutor's instructions grew from 44,836 to 49,305 characters (+9.97%, about 1,100 tokens; the Widget section
alone from 33,662 to 38,109; the tools are unchanged). Warnings only teach the next Widget, so a Widget over budget stays on screen as drawn; a hard error
would cost the Learner a "Fixing the Widget…" wait for every style slip. The notes ride in the Learner's stored message, so a
replay sends the same text. The QuickCheck and Rank rules are restated in check.ts, because the parts' files are client
modules and the server runs this check too.

## The teaching engine: exact answers, question templates and Known mistakes (`src/teaching/answers.ts`, `quantities.ts`, `mistakes.ts`, `templates.ts`, `mark.ts`, `fixtures.ts`, spec #229, ticket #231)

**What it does.** A pure module (no database, no model, no env) that marks a Learner's typed number or True/False, so
Quick tries and typed Check questions need no model call. `parseAnswer` reads what was typed as an exact decimal (a
scaled bigint), accepting %, bp, ₹, Rs, points, years, Indian or Western commas, a decimal comma, a sign and the words
"fall", "down", "up" and "rise"; a unit word is decoration, so "0.3 points" for a basis-point ask is read as 0.3.
`markAnswer` gives right, a Known mistake with its one-line fix, or wrong, under the item's sign rule (magnitude, either,
signed). An exact answer must be typed exactly (30.4 is not 30); a rounded one, a percent change "to one decimal place",
is compared at its decimals (8.33 is 8.3). A question template has parameter ranges, named answer functions
(`points_between`, `bp_from_move`, `points_from_bp`, `bp_from_points`, `pct_change`) and named mistake functions
(`stopped_at_points`, `used_x10`, `divided_by_10`, `divided_by_1000`, `forgot_to_convert`, `mixed_percent_points`), and
derived values only through `plus`, `minus` and `times`, so nothing is ever evaluated. `drawTemplate` hashes a seed into a
small generator, so the same seed gives the same draw, and it redraws until there is no zero move, no negative number
shown, no number from `avoid` (the running example's), and no Known-mistake value equal to the answer. A half-done draw
shows the first step ("6 minus 5.7 is 0.3 points") and asks for the last. `templateProblems` names what is wrong with a
template, for the course check. Every item names its Skill.

**Scenario.** A Quick try asks "A rate falls from 7.5% to 7.2%. How many basis points did it fall?". The Learner types
"30 bp", "30" or "-30", and each is right; floating point never enters it, so 7.5 minus 7.2 is exactly 0.3 points. They type
"0.3" instead, and code shows the stopped-at-points fix at once: "That is the fall in points. Times 100 gives basis
points." The next try is drawn with a new seed, so it has new numbers, and 120 bp turned into 12 or 0.12 points gets the
divided-by-10 or divided-by-1,000 fix.

**Trade-off.** Named functions cover only the rate Skills of the Percent Topic today; a Topic with rupee or year
templates needs a new named function, written and tested in code, rather than a formula in its file. That is slower to
author but keeps every answer computed by code (ADR 0003, ADR 0005). Comparing a Known mistake by its size means a
Learner who also drops the sign still gets the fix. A fixed item states `decimals` only when its answer is rounded; left
out, the answer is exact. A draw is rebuilt from its seed rather than stored, since bigints do not go into JSON.

## Free-form Widgets and updates in place: compose_widget and update_widget (`src/tutor/compose.ts`, `tools.ts`, `turn.ts`, `instructions.ts`, `session-log.ts`, `src/widgets/shown-widget.ts`, UX audit ★.4)

**What it does.** Two engine tools join show_widget (only in Sessions frozen with `widget_engine` on; off, nothing changes).
`compose_widget({brief, archetype, mustUse, fallback?})` is the free-form lane: when no recipe fits, a second, faster model
(setting `widget_compose_model`, default `claude-sonnet-5-5`, read when the tool runs) writes the OpenUI Lang program from a slim
prompt: the frozen Widget instructions with the component groups the archetype and `mustUse` do not need cut out. The call is
aborted after 12 seconds, or sooner when the turn's own deadline is less than 27 seconds away, or when the Learner presses Stop.
While it runs the writing indicator says "Drawing your Widget…". The program then goes through show_widget's checks (it draws,
keeps the Widget rules, leaves written-ahead parts alone, uses only allowed Case Data, has a title, uses every `mustUse` part).
If it timed out, failed or did not pass, code shows the closest recipe instead: the Tutor's `fallback` if it gave one, else the
working examples of recipes of the same archetype, then the rest, the first that builds and passes. It is stored as a
WIDGET_SHOWN item with `source: "compose"` or `"fallback"` and `timings {composeMs, fallbackReason?}`, and the tool result gives
the Tutor one line to say ("I used a ready-made Widget because…"). The compose model's tokens are saved as an extra loop step
(`tools: ['compose_widget']`, its own model and cost), numbered by the turn so steps never clash. `update_widget({key, values})`
moves the sliders of an open Widget (a title from the open-Widgets line, or an opened written-ahead Widget's id): each value
must name one of its Slider `$variable`s and lie within its min and max. Code saves the Widget state (the page's values over
what was saved, then the new ones; ticks kept exactly as they were) and the turn streams `widget_state {widgetKey, values}`,
which the browser applies (freeform-client lane).

**Scenario.** The Learner asks for something no recipe covers. The Tutor calls compose_widget with a brief and archetype
"Compare" and a fallback loan_cost. The compose model hangs; after 12 s code shows loan_cost, stores it as `source: "fallback"`
with `fallbackReason: "timeout"`, and the Tutor says "I used a ready-made Widget because drawing a new one took too long."
Then the Learner says "make it 9%": the Tutor calls update_widget with the Widget's title and `{"$rate": 9}`, and the slider
moves on screen without a twelfth Widget.

**Trade-off.** The compose call runs outside the database transaction (a 12 s call must not hold one open), so the tool first
looks for its saved result: a repeat or a resume returns that and never asks the model again, but a turn cut off in the few
milliseconds between the call and the save would ask once more. The program is returned whole, not streamed: the Learner sees
the progress label, then the finished Widget, never half of one. Falling back to a recipe example may show a Widget less exact
than the ask, which is why the Tutor is told to say so. update_widget cannot tick Guided Tasks, so the "all ticked" gate on Tell
the Tutor what I found stays the Learner's own. Free-form Widgets get no Widget notes warnings yet (widgetNotes reads only fences).

## Ready-made Widgets only: opened already set, one a reply (`src/tutor/ready-made-widgets.ts`, `tools.ts`, `written-ahead.ts`, `instructions.ts`, `session-log.ts`, `widgetsIn` in `src/app/thread.tsx`, `WidgetChip` in `widget-panel.tsx`, ADR 0007, spec #229, ticket #242)

**What it does.** The Tutor opens only Widgets that are ready-made: a written-ahead Widget from the Topic's file (`open_widget`) or a
Widget recipe drawn by code (`show_widget`). It writes no Widget code and `compose_widget` is not offered to new Sessions: a new
Session freezes `open_widget`, `show_widget` and `update_widget` (the setting `widget_engine` now defaults to "on"; production keeps its
stored row until the switch). A Session whose stored tools already list `compose_widget` keeps it on refreeze (`ENGINE_TOOLS_WITH_COMPOSE`,
ADR 0005's one-way rule), and its code stays bound so a saved call resumes. The Tutor's catalogue (`TUTOR_RECIPE_IDS`) is every recipe
except `quick_check` (a "quiz me" goes to the next Quick try) and `percent_points` (`rate_move` is the single rate Widget); a frozen
Session that still calls `quick_check` is refused in words. **Presets:** `open_widget` takes an optional `preset`, slider values by
`$variable` (the `$` is optional). `presetProblems` checks each key is one of the Widget's sliders and each value is in range and on
its step (the runtime twin of the lesson lint's `presetValueProblems`, built on the parser rather than a file read). A bad preset is a
tool error and nothing is stored. A good one is stored on the WIDGET_OPENED item (`{id, title, preset}`), saves the Widget state as the
Widget's declared settings with the preset on top (replacing the Learner's last settings, keeping their ticked Guided Tasks) and
streams `widget_state`, so the open Widget moves at once. `show_widget` does the same, to the recipe's own starting numbers, when its
title already has saved state. **One Widget a reply:** every Widget the reply holds counts, whoever stored it (`open_widget`,
`show_widget`, the one a Next or a step opened just before the Learner's message, a fence the Tutor wrote, or an `update_widget` on
a Widget this reply did not open). A second `open_widget` or `show_widget` is a tool error; `update_widget` may move the reply's own
Widget. **Open quiz:** a preset, recipe inputs or update values are checked with the reply check's V5 (`checkReply` on an empty text
with that one Widget, only its V5 problems kept) against `turnFacts`' open items, so the tool and the reply check never disagree.
**Illustrations:** `ILLUSTRATION_FACTS` is a small table, one row per recipe with facts; a fact that an input or a Case Data path of
the same recipe already covers is refused with the input to use (for example `percent_points`' `before` is where `inputs.slider.start`
already is). **After a move:** the context `finish_teaching_step` and `record_check_verdict` return carries the new step's word limit,
currency and blocked numbers (`turnFacts`). `widgetValidator(writtenAhead)` is the reply check's V4 hook (a known written-ahead id or
Tutor recipe, a valid preset or valid params, no `quick_check`); the tools refuse every invalid Widget before it is stored, so the hook
is for a check that reads a finished reply. In the browser `widgetsIn` carries the item's preset (over the Widget's declared settings)
onto the `WidgetItem`, and pressing a chip pushes that preset into the Widget store, so an earlier chip reopens its own numbers. A shown
`rate_move` Widget gets the `rateChange` readouts through `rateMoveSliders`, the way Percent's written-ahead Widget does.

**Scenario.** The Learner is on the annuity Topic and asks "what if the rate were 4%?". The Tutor calls `open_widget` with
`{id: "annuity-worth-today", preset: {"$rate": 4}}`. The chip stands in the reply, the slider reads 4%, and the tool result says
"It is set to $rate = 4". The Tutor says in one sentence what the chart shows at 4% and asks for nothing to be moved. If it then
tries `show_widget` in the same reply, code refuses: the reply already has its Widget. Later the Learner presses the first chip again
after trying 9%, and the slider goes back to 4%. At an open quiz whose question mentions 10%, a preset of 10 is refused and the Tutor
picks other numbers.

**Trade-off.** One Widget a reply is strict: the Widget a step or a Concept card opens is the reply's one Widget, so the Tutor cannot add
its own on that reply, which keeps the picture simple at the cost of the odd case where two would help. A Tutor preset must avoid every
blocked number, even one that is only a slider's edge, so it sometimes has to pick less natural numbers. The Illustration table only
covers facts where a path exists, so a made-up number with no input or Case Data path (a vada pav price) still makes an Illustration.
Chips that put their preset back overwrite what the Learner did since, on purpose. The engine-off path is unchanged, so Sessions frozen
without the engine keep writing Widgets until the production switch (T18).

## Topics with a goal: steps that open their Widgets, finish from what you do, and remember what you found (`goal`, `steps`, `found` in `course/topics/*.yaml`, `src/course/map.ts`, `navigator.ts`, `outcome.ts`, `goal-check.ts`, `src/tutor/next.ts`, `off-topic.ts`, `past-sessions.ts`, UX audit 9.0, 9.4, 9.7, 11.5 to 11.9)

**What it does.** Three optional keys extend the Topic, not a second "plan" format (a Topic is still the lesson, a Teaching Step is still the beat). `goal` is one line of words shown under the title in the Topic bar. `steps` is a list of settings, each for one Teaching Step (and optionally one Check): `opens` names a written-ahead Widget that code puts in the panel when the step begins (it stores the same Widget opened item the Tutor's open_widget stores, so a Widget is never opened twice), and `doneWhen` is a condition on the Learner's saved Widget state: a Guided Task ticked, a $variable that has a value (a Predict's guess), or one saved near a target (a Breakeven). The Course Navigator's `widgetDone` and `finishFromWidget` read that state; `finishStepFromWidget` (next.ts) finishes the step, stores the new step's divider and opens its Widget, and the study page calls it on each render (it returns at once for a step with no `doneWhen`). Because nothing has taught the new step yet, Next then names it without moving on, the way it does after a quiz pass. `found` is a list of lines (`when` plus `text`, with `{value}` for the Learner's own number) that `foundLines` (outcome.ts) works out from saved Widget state; Past Sessions rows, the Session header and the Topic complete card show them. An Off-Topic answer is a Session item (`off_topic`, off-topic.ts) drawn as a quiet block with "↩ Back to <Topic>". The Topic schema checks every setting (the Widget, Check and Guided Task must exist), `npm run course:check` also checks the goal and found lines are in words, and prints the written-ahead warnings beside its errors.

**Scenario.** Before its conversion, Percent said `steps: [{step: your_turn, opens: rate-change-three-ways, doneWhen: {kind: ticked, ..., task: 1}}]` (the tests keep that file as a fixture). The Learner presses Next into Your turn: code stores the divider and the "One rate change, said three ways" chip, and the Widget appears in the panel. They tick "Set a rise from 6% to 6.4%". On the next render code finishes the step and moves them to the Check; Next says "Next: Check" and the Tutor teaches it when pressed. A week later Past Sessions shows "You set a rate change on the sliders and read it in points, basis points and percent change." under that Topic. Converted Percent has no such setting: its Your turn ends on fluency in its Quick tries, and its found line went with its Widget. Present value's `found` line ("You found the rate where the annuity is worth the same as the cash.") is the real one today.

**Trade-off.** A Widget can never settle the Insight early (ADR 0001): `doneWhen` is refused on explore, a Check and the principle, by the schema and again in `widgetDone`, and the explore Widget stays opened by code at explore only. The cost is that a finishing Widget needs a page render or a Next to be noticed; the saved state is the source of truth, so nothing is lost. `found` lines are the Learner's own saved numbers, never typed figures (ADR 0003), so an unticked or reset Widget says nothing. Left for later: a Widget opening at the very first step and when the Tutor itself finishes a step (both happen in the turn lane's files), a tool for the Tutor to mark an Off-Topic answer (`offTopicNote` in context.ts is ready for it), Predict and Breakeven results as turn events, and plan versioning.

## Skill state and the repair ladder (`src/learner/skill-state.ts`, `src/teaching/ladder.ts`, tables `skill_state` and `practice_answers`, `drizzle/0029_skill_state.sql`, spec #229, ticket #232)

**What it does.** Code keeps a record of how each Learner is doing on each Skill of a Topic, and code, not the Tutor,
decides what comes after each answer. Every Quick-try or typed quiz answer that code marks goes through `recordAnswer`. In
one transaction it logs the answer in `practice_answers` (the item, the numbers it was shown with, what the Learner typed,
the verdict right, Known mistake or wrong, and the mistake's tag) and updates the Skill's row in `skill_state`: tries, right,
the streak of right answers, misses in a row, the last Known mistake, the teaching methods used and the park-until time. Each
answer has an item key, unique per Learner, so the same answer sent twice (a double press, a retried request) is logged and
counted once. Misses in a row count across Quick tries and quiz questions on the same Skill, and a right answer resets them.

The policy is the pure module `ladder.ts`. `nextMove(state, answer)` takes the state after the answer and returns the
Reply kind and method. A right answer gets feedback, and two right in a row make the Skill fluent (`isFluent`). The first
miss gets feedback: one slip, one fix, one new try. The second miss in a row brings a re-teach with the next method on
the ladder: restate, worked example, fill-in boxes, the Skill's Widget, then a drill of five. It takes the first method not
used yet, and once all five are used it goes on round the ladder, so the same method never comes twice in a row. The third
miss in a row, and every miss after it, offers to park. `parkSkill` sets a park-until time 20 hours on and starts the miss
count again. `drillDue` says when that time has passed, so the Topic opens on a drill of five, and `unparkSkill` ends the
park once the drill is done. `yourTurnDone` is true once every Skill of the Check is fluent. This layer stores and decides
only: nothing is shown yet, and later tickets wire it into the Tutor Turn and the Course Navigator.

**Scenario.** The Learner is asked to turn 0.6 percentage points into basis points and types 6. Code marks it as the Known
mistake "multiplied by 10" and records it: one miss in a row, so the reply is feedback with the fix and a new try. They type
0.06 on a quiz question for the same Skill: two misses in a row, so the reply re-teaches by restating the rule, and code
notes "restate" as used. After a right answer and two more misses, the re-teach is a worked example, not the restatement
again. A third miss in a row brings "Park it, review tomorrow". They park at 6 pm; at 2 pm the next day `drillDue` turns
true and the Topic opens on a drill of five.

**Trade-off.** The state is a stored row, updated on each answer, not worked out again from the log each time. That keeps
each turn to one small read, but the row and the log could drift if one were edited by hand; the log keeps every answer, so
the state can be rebuilt from it. The ladder is the same for every Topic and lives in code, which keeps Topic files small
but means a Skill cannot pick its own order of methods. The ladder runs only on answers code marks, so conversation Checks
never climb it. Parking never moves the Learner's place on the Course Map, and it is neither a Review nor a Due Check.

## Percent, converted (`course/topics/num-percent-bps.yaml`, `revealWidget` in `src/course/map.ts` and `src/tutor/practice.ts`, `src/test/old-percent-map.ts`, spec #229, ticket #246)

**What it does.** Percent is the first real Topic taught the new way. Its file lists the terms it introduces
(percentage point, basis point, percent change, the base), five Skills (`pts`, `pts-to-bp`, `bp-to-pts`, `pct-change`,
`wording`), the Running example (a savings rate going from 4% to 5%), rupees for every everyday example, and three
question templates (basis points from a move, points from basis points, percent change), each with `avoid` numbers that
keep the Running example, the Quick tries', the Check questions' and the Case's moves out of every draw. It has four
Checks, each with a Concept card of at most five lines that says every sum in words and opens `rate_move` at 4% to 5%
in show mode:
- Check 1, `pb-quiz-language` (id kept), "One move, two ways": a typed quiz drawn from three templates, one a Skill
  (points from a move, added in #248, and the two basis-point ones), with new numbers each attempt, and Quick tries A1
  to A4 from the spec plus enough more for three per Skill. Without the points template the Check did not test `pts`,
  so its three `pts` Quick tries could never be shown (lint L8 now catches that).
- Check 2, `pb-quiz-change` (new), "Compared with the start": percent change alone. The card says the move, divides it
  by the base (1 divided by 4 is 0.25, times 100 is 25%) and shows why the base matters. One fixed question plus two
  typed draws of the percent-change template a try; Quick tries B1, B2 and two template draws.
- Check 3, `pb-quiz-wording` (new in the beginner-reader pass of #248), "Say which size you mean": how a move is worded,
  split out of Check 2 because that card taught two ideas. It says "up 1%" could mean 1 point or 1% of the old rate, so
  say points or bp. Three "Which one is true?" questions, one a try; Quick tries B3, B4 and a basis-point wording one.
- Check 4, `pb-fed-language` (id kept), "Say it so nobody misreads it": the conversation Check, which lists its
  Skills. Cards 1 to 3 already teach them, so it has no Quick tries of its own. A Check with no Quick tries is not a
  practice step (`practiceStep` in `src/course/navigator.ts`), so the Tutor finishes its Your turn as before; without
  that, a Your turn that only fluency can end, with no tries to show, would never end.

At the reveal, code opens the Topic's `revealWidget`: `rate_move` titled "The Fed's move of February 1994", its
`{before}` and `{after}` inputs read from the `fed-funds-target` Case Data across the Case's as-of date (`revealMove`),
so the file types neither figure. `enterStepItems` (`src/tutor/practice.ts`) stores it once a Session, as a shown
Widget, so it opens on Next and also when a tool's step divider moves the Learner on, as `record_check_verdict`'s pass on
Check 3 usually does. Any converted Topic can name a recipe and a Case dataset this way; `src/course/map.ts` checks that
the Case is the Topic's and lists the dataset.

The Known mistakes are the Percent Session's real wrong answers: 6 for 60 (`used_x10`), 12 for 1.2 (`divided_by_10`),
0.12 for 1.2 (`divided_by_1000`), 0.3 for 30 (`stopped_at_points`) and "it should say up 1%" (`mixed_percent_points`),
each with a one-line fix in words. The written-ahead "One rate change, said three ways", its Your-turn `steps` entry
and its `found` line are gone. Percent is off both not-yet-converted lists, so the lesson lint (L1 to L9) and the
typed-formula check now hold its whole file, the old questions' explanations included. The file is marked
`restructure: content-only`: no Check is required, so nobody gets a Due Check.

**Scenario.** A Learner who passed the old Check 1 and stood at the old Check 2's concept (the Fed conversation) comes
back. The Course Navigator still has their saved step, `concept`, and the first Check without a pass is now
`pb-quiz-change`, so they land on "Compared with the start" with its rate_move Widget. A Learner who had passed both
old Checks and stood at the reveal stays at the reveal, and one who passed Percent stays passed. A Learner who was at
the old Check 2's check step keeps the `check` step, which is now Check 2's quiz, and the Check tab opens it. A new
Learner who passes the Fed conversation sees the divider and then the rate Widget at 3% and 3.25%, the numbers coming
from Case Data now that the reveal has begun.

**Trade-off.** Keeping every Check id and every old `pb-q-*` question means old attempts, Reviews and passes still
load, but three questions (`pb-q-bp-definition`, `pb-q-bond-140`, `pb-q-mortgage-rate`) now sit in no Check, kept only
so old records resolve. A content-only restructure keeps passes, so a Learner who passed Percent before never sees the
new cards unless they open the Topic again. Each Check question moved to a fresh made-up move, so it shares no numbers
with a card or Quick try; the Fed prompt moved to 6.25% to 6.75% for the same reason. The tests that read the old
Widget's `rateChange` readouts and reveal task keep it as a fixture, since no real Topic uses those features now. The
reveal Widget is stored once a Session, so a Learner who drags it away and comes back to the reveal in the same Session
finds it where they left it, not reset. Behaviour and eval placement (`finishForPlacement` in `src/behaviour/place.ts`)
walks past a converted Your turn as fluency would, since no report can finish it.
## The model sweep and the 50-turn replay (`src/behaviour/tutor-eval/sweep.ts`, `sweep-replay.ts`, `sweep.live.ts`, `sweep-replay.live.ts`, `scripts/tutor-replay.mjs`, `vitest.tutor-sweep.config.ts`, spec #229, ticket #248)

## The ladder at work: re-teach, Park it, the drill, frustration and Start again (`src/tutor/practice.ts`, `ladder-moves.ts`, `frustration.ts`, `park-items.ts`, `turn.ts`, `turn-facts.ts`, `context.ts`, `tools.ts` (start_again), `next.ts`, `src/course/navigator.ts`, `src/learner/skill-state.ts` (`parkedSkills`), `src/app/park-offer-view.tsx`, `src/app/api/quick-try/route.ts`, `src/app/course/`, spec #229, ticket #245)

**What it does.** This wires the repair ladder (the section above) into the conversation, for converted Topics only. After every answer code marks (a Quick try, or a Skill-tagged quiz question, which T13 records), `ladderAction` in `ladder-moves.ts` reads the Skill's state and picks code's move. A first miss gets the usual feedback. A second miss in a row starts a follow-up turn whose note says `Reply kind: reteach` and `Method: …` in plain words (`drill` for the drill-of-five rung), and code notes the method as used, so the next re-teach names another. After that turn code does the method's own part: restate and worked example are Tutor words only, fill-in boxes posts a half-done try, the Widget rung opens the card's preset in practice mode under "<card title> · practice" (so its Widget key never clashes with the show-mode card Widget), and the drill rung posts five tries one at a time (`drill.reason` "ladder"). A third miss in a row stores a `park_offer` item, code's own line with two buttons, and starts no Tutor turn. On a quiz the same counts apply: the quiz follow-up note gains the re-teach lines at two misses in a row, and at three it is replaced by one telling the Tutor that code has shown the park offer.

The buttons post to `/api/quick-try`. `{ park: skillId }` parks the Skill for 20 hours and stores a `parked` line, "Back tomorrow after Thu 3:00 pm", with a Course Map link; `{ oneMore: skillId }` posts one more Quick try on that Skill now, and a miss on it offers the park again. Each offer is marked with the choice, so each button works once, and a reload shows it used. While a Skill of the current Check is parked, the Course Navigator (given the parked Skills as an optional input) holds the place: no Quick try is posted, `nextOffer` offers no Next, `takeNext` refuses one, and `finishFromPractice` will not finish Your turn. The context tells the Tutor when the Skill comes back, that it may still answer questions, and that it may suggest another Topic. The Course Map shows "Parked · back <time>" on the Topic. A quiz Check stays open while parked: attempts stay unlimited, and a pass moves the Learner on.

Once 20 hours have passed, the study page sees the drill is due and starts a `{ drill: true }` turn, whose note begins `Drill by code:`. On entering the step code stores a "Drill · <rule>" divider and the first of five drill tries (`reason` "parked"); the Tutor adds one sentence and one ask. Five answered tries, right or wrong, end the drill: code calls `unparkSkill`, and the step goes on (the usual next try, or the open Check).

The context now also carries, at a converted Your turn or Check, each Skill's state in one plain line (fluent or not, misses in a row, the last Known mistake by its fix line, never its tag), and the frustration count. `frustrationCount` counts the signal phrases ("get it over with", "too complicated", "over complicated", "don't know any of this") in the Learner's last three messages since their last right code-marked answer, plus 1 for two or more misses in a row on the current Skill. When it is 1 or more the context says `Frustration: N`, and code makes the smaller step itself: the next Quick try is half-done. These lines go in through `TurnFacts` (`replyKind`, `method`, `frustration`, `skillLines`, `parked`), so the reply checks and the context see the same values.

The Tutor gains `start_again`: in a converted Topic it re-posts every Concept card in order, then the first Quick try, and leaves the step and any open quiz attempt as they were. In a Topic not converted it is refused with a tool error that says to teach the first idea again in words. `tools.ts`'s step divider now also stores what the new step shows (`enterStepItems`), so a card lands right after the divider mid-reply.

**Scenario.** At Your turn the Learner types 6 for "0.6 points in basis points", then 7, then 8. The second miss brings a turn noted `Reply kind: reteach`, `Method: restate`; after it a fresh try appears. The third miss shows "This one is not landing yet…" with the two buttons, and no reply. They press Park it: "Back tomorrow after Thu 3:00 pm", and the Course Map shows Percent as "Parked · back Thu 3:00 pm". They study Compounding instead. The next afternoon they open Percent: a "Drill · Basis points are points times 100" divider and a first try appear, the Tutor says one line, and after the fifth answer the next normal try follows.

**Trade-off.** All of this is code, so the Tutor cannot skip a rung or forget the park, but the methods' wording is fixed in one place for every Topic. The drill counts answered tries, not right ones, so a Learner can finish it with misses; the ladder starts again from zero after a park, so misses then climb it afresh. Parking holds only Quick tries, Next and finishing Your turn, never a quiz attempt, so a Learner who parks at a quiz Check can still pass it. The frustration window is three messages, so one early phrase does not count for the rest of a Session, and a phrase said four messages ago no longer shrinks the step. Nothing reads `skill_state` or `practice_answers` for a Topic that is not converted, so production reads none of it before a Topic is converted and the migration is applied.

## Concept cards and Quick tries in the conversation (`src/tutor/practice.ts`, `session-item-kinds.ts`, `next.ts`, `turn.ts`, `context.ts`, `turn-facts.ts`, `src/course/navigator.ts`, `src/app/concept-card-view.tsx`, `quick-try-view.tsx`, `session-item-view.tsx`, `conversation.tsx`, `src/app/api/quick-try/route.ts`, spec #229, ticket #243)

**What it does.** In a converted Topic (one whose file lists Skills), code shows two new things in the conversation, as
Session items, with no model call. When the Learner enters a Concept step whose Check has a Concept card, code stores the
card (a `concept_card` item: the title, the plain lines and the line to write down, copied from the file) and then its
Widget preset. A `rate_move` preset is built exactly as the lesson lint builds it and stored as a shown Widget, titled with
the card's title; a written-ahead preset opens that Widget with its sliders set. If the Widget's key already has saved state
in the Session, code sets it back to the preset's numbers, so the card always opens at its own numbers. At Your turn, for a
Check that lists Skills, code shows one Quick try at a time (a `quick_try` item): its ask, its unit, and, for the first try
of each Skill, the first step shown done (R5). The item never holds the answer: its key names the fixed try or the template
draw, and the server works the answer out again from the Topic file, with the key as the draw's seed.
`enterStepItems` does this, and it is idempotent; Next, a step that finished from a Widget, the start of every Tutor Turn,
and a step divider stored by a tool all call it. The pure `nextQuickTry` picks the try: the first Skill of the Check not yet
fluent, in card order, a half-done try first, then unused fixed tries in file order, then fresh template draws.

The Learner answers in the item itself: a number box or True and False buttons, locked while a Tutor turn runs and once
marked, and read-only on old Sessions and Past Sessions pages. POST `/api/quick-try` marks the answer with the teaching
engine, logs it once per key with `recordAnswer`, and stores a `quick_try_result` item: "Right.", the Known mistake's fix,
or "Not quite.". A right answer posts the next try; a Known mistake posts a new try on the same Skill; a wrong answer with no
Known mistake asks the page to start a short code-written follow-up turn ("Quick try follow-up by code:") that names the slip
in one sentence, after which code posts a fresh try. Your turn finishes only when every Skill of the Check has two right
answers in a row: the Course Navigator's `finishFromPractice` accepts it, while `finishStep` refuses `your_turn` from the
Tutor and `nextOffer` gives no Next there. Code then stores the Check's divider and starts a follow-up turn that points to
the Check. The Tutor hears what code showed: the card's text in place of the concept text, "add one sentence and one ask",
that code shows and marks the Quick tries, and, with its next turn, the results marked since its last reply
(`pendingQuickTryNote`), the way quiz results reach it. `practiceFallback` is the checked-replies fallback at these steps:
the card's write-down line, then the next try.

**Scenario.** Asha presses Next: Concept in a converted Percent Topic. The divider, the card "One move, two ways" and the
rate Widget at 4% and 5% appear at once; she had dragged that Widget to 1% and 9% earlier, and it opens at 4% and 5% again.
The Tutor adds one sentence and asks which number is bigger. At Your turn she sees "A rate moves from 4.5% to 3.45%. How
many basis points?" with "the move is 1.05 points" shown done. She types 10.5; code shows "One point is 100 basis points,
so multiply by 100, not 10." and a new try. Two right answers in a row on each idea later, the Check divider appears and the
Tutor points her to the quiz.

**Trade-off.** Items are stored, not worked out on each render, so a reload shows exactly what was shown, at the cost of
copying the card into the Session. Re-deriving each try's answer from the file keeps answers out of the browser, but a
Topic file edited after a try was shown marks that try against the new file. Results reach the Tutor by item order (those
after its last reply), so no new table or column is needed, but a result stored during a turn is told in the next one.
Only converted Topics touch `skill_state` and `practice_answers`; every other Topic behaves exactly as before.

## Concept cards and Quick tries in the conversation (`src/tutor/practice.ts`, `session-item-kinds.ts`, `next.ts`, `turn.ts`, `context.ts`, `turn-facts.ts`, `src/course/navigator.ts`, `src/app/concept-card-view.tsx`, `quick-try-view.tsx`, `session-item-view.tsx`, `conversation.tsx`, `src/app/api/quick-try/route.ts`, spec #229, ticket #243)

**What it does.** In a converted Topic (one whose file lists Skills), code shows two new things in the conversation, as
Session items, with no model call. When the Learner enters a Concept step whose Check has a Concept card, code stores the
card (a `concept_card` item: the title, the plain lines and the line to write down, copied from the file) and then its
Widget preset. A `rate_move` preset is built exactly as the lesson lint builds it and stored as a shown Widget, titled with
the card's title; a written-ahead preset opens that Widget with its sliders set. If the Widget's key already has saved state
in the Session, code sets it back to the preset's numbers, so the card always opens at its own numbers. At Your turn, for a
Check that lists Skills, code shows one Quick try at a time (a `quick_try` item): its ask, its unit, and, for the first try
of each Skill, the first step shown done (R5). The item never holds the answer: its key names the fixed try or the template
draw, and the server works the answer out again from the Topic file, with the key as the draw's seed.
`enterStepItems` does this, and it is idempotent; Next, a step that finished from a Widget, the start of every Tutor Turn,
and a step divider stored by a tool all call it. The pure `nextQuickTry` picks the try: the first Skill of the Check not yet
fluent, in card order, a half-done try first, then unused fixed tries in file order, then fresh template draws.

The Learner answers in the item itself: a number box or True and False buttons, locked while a Tutor turn runs and once
marked, and read-only on old Sessions and Past Sessions pages. POST `/api/quick-try` marks the answer with the teaching
engine, logs it once per key with `recordAnswer`, and stores a `quick_try_result` item: "Right.", the Known mistake's fix,
or "Not quite.". A right answer posts the next try; a Known mistake posts a new try on the same Skill; a wrong answer with no
Known mistake asks the page to start a short code-written follow-up turn ("Quick try follow-up by code:") that names the slip
in one sentence, after which code posts a fresh try. Your turn finishes only when every Skill of the Check has two right
answers in a row: the Course Navigator's `finishFromPractice` accepts it, while `finishStep` refuses `your_turn` from the
Tutor and `nextOffer` gives no Next there. Code then stores the Check's divider and starts a follow-up turn that points to
the Check. The Tutor hears what code showed: the card's text in place of the concept text, "add one sentence and one ask",
that code shows and marks the Quick tries, and, with its next turn, the results marked since its last reply
(`pendingQuickTryNote`), the way quiz results reach it. `practiceFallback` is the checked-replies fallback at these steps:
the card's write-down line, then the next try.

**Scenario.** Asha presses Next: Concept in a converted Percent Topic. The divider, the card "One move, two ways" and the
rate Widget at 4% and 5% appear at once; she had dragged that Widget to 1% and 9% earlier, and it opens at 4% and 5% again.
The Tutor adds one sentence and asks which number is bigger. At Your turn she sees "A rate moves from 4.5% to 3.45%. How
many basis points?" with "the move is 1.05 points" shown done. She types 10.5; code shows "One point is 100 basis points,
so multiply by 100, not 10." and a new try. Two right answers in a row on each idea later, the Check divider appears and the
Tutor points her to the quiz.

**Trade-off.** Items are stored, not worked out on each render, so a reload shows exactly what was shown, at the cost of
copying the card into the Session. Re-deriving each try's answer from the file keeps answers out of the browser, but a
Topic file edited after a try was shown marks that try against the new file. Results reach the Tutor by item order (those
after its last reply), so no new table or column is needed, but a result stored during a turn is told in the next one.
Only converted Topics touch `skill_state` and `practice_answers`; every other Topic behaves exactly as before.

## The Learner's own rule (`save_learner_rule` in `src/tutor/tools.ts`, `src/learner/own-rule.ts`, `src/tutor/own-rule-item.ts`, `src/app/own-rule-line.tsx`, `note_items` kind `own_rule`, spec #229, ticket #244)

**What it does.** When the Learner says a rule in their own words, more simply than the Tutor did, the Tutor can call
`save_learner_rule` with those words. Code checks them before it keeps anything: the turn is a message the Learner typed
(a chip, a note code wrote and the old "Continue." are refused); the words are found in that message, and are kept exactly
as typed, symbols and all, up to 300 characters; no rule was already saved this turn. In a Topic with Skills, the Learner's
latest practice answer in the Topic must be `right` and must have been recorded after this Session's previous turn began,
and its Skill becomes the rule's Skill, so the Tutor never names one; a Skill takes one rule. In a Topic without Skills the
Tutor judges the rule, and the Topic takes one. In one transaction code writes a `note_items` row of kind `own_rule` (the
column is text, so no migration) and a Session item `OWN_RULE_SAVED` with `{noteId, topicId, text, skillId}`, which streams
at once. "Once" counts the own-rule items in the Topic's Session, so an Undo does not free the slot. The tool result tells the
Tutor what was saved, that the Learner sees "Saved to your notes" with Undo, and to confirm the rule in one sentence and use
the Learner's words from then on. The turn passes the saved words to the reply checks as `ReplyDraft.savedRule`.

The line under the reply reads "Saved to your notes · Undo · Open notes". It reuses the Save to notes control's view with a
label, never has a Save button, and is never sent to the model. Undo calls `DELETE /api/notes` with the note id; the line then
reads "Removed from your notes.", and an Undo on a note already gone says the same. On the Notes page `loadNotes` lists the
rule among its Topic's lines with `ownRule: true`; the page marks it "Your rule", and it can be edited and removed like any
line. `learnerSummary` adds "Rules in the Learner's own words (use them)" with the newest five, and the Where the Learner
stands block is sent again when it changes, so the next turn carries them.

**Scenario.** After a right answer on "points to basis points", the Learner types "so its basically change x 100 then divide
by original". The Tutor calls the tool with "change x 100 then divide by original". Code saves it against that Skill and the
Learner sees the line. The Tutor says "Yes, that is the rule" in one sentence and later says it in the Learner's words. If the
Learner presses Undo, the rule leaves the note, and a later try at the same Skill is not saved a second time.

**Trade-off.** The Skill lives only in the Session item, not in the note row, to keep the table as it is; a rule whose item is
gone would show no Skill, which nothing reads. Saving the Learner's exact words, not a tidier version, keeps the note theirs
but lets a clumsy or slightly wrong phrase in, and the Tutor is the judge of "correct" in a Topic without Skills. Counting the
Session's items, not the note rows, means an Undo is final for that Skill or Topic: a Learner who took a rule off is not
offered it again, and a fresh Session after Start again would be.

## Known mistakes on the Topic Note and in the Learner summary (`src/learner/known-mistakes.ts`, `notes.ts`, `memory.ts`, table `practice_answers`, spec #229, ticket #244)

**What it does.** Each answer code marks as a Known mistake is logged in `practice_answers` with the slip's tag. `loadNotes`
adds every distinct Known mistake the Learner made in a Topic to that Topic Note's `mistakes`, once each, with the fix line
the Topic file gives that tag (a template's, a quiz choice's or a fixed Quick try's). `learnerSummary` adds one line per Skill
with hits, "Slips so far: <the Skill's rule>: twice multiplied by 10 instead of 100, stopped at points; fluent now", in plain
words and never a tag id, so the Tutor cannot repeat one. Misconceptions the Tutor noted stay as they were. Both read only
converted Topics, and skip the query when the Course Map has none, so no turn and no Notes page reads the practice tables
before the migration that made them has been applied in production.

**Scenario.** The Learner types 6 twice for "0.6 points in basis points" and 0.6 once. Their note for the Topic lists "One
point is 100 basis points, so multiply by 100, not 10." and "That is the move in points. Times 100 gives basis points." once
each, and the Tutor's summary says the Skill had two "multiplied by 10" slips and one "stopped at points", and is fluent now
after two right answers.

**Trade-off.** The note lists the fix, not the count, so a slip made ten times reads the same as one made once; the summary
keeps the count for the Tutor. Slips are named in the summary by a small table of plain phrases, and any tag not in it reads
as its words with the underscores taken out, which is clear but may be clumsy until the phrase is added. The note shows a
mistake's fix only when the tag is still in the Topic file, so a tag a later edit removed is left out.


## Turn and Session fixes from the UX run (`src/tutor/transcript.ts`, `turn-status.ts`, `open-widget.ts`, `usage.ts`, `next.ts`, `src/app/turn-stream.ts`, `message-box.tsx`, `session-item-view.tsx`, spec #229, ticket #248)

**What it does.** Six small fixes to layers that already exist. (1) The "Widget notes (code): …" block code adds to the Learner's message is code's, so the transcript leaves it out of the Learner's bubble, in new Sessions and in old ones that stored it. (2) Finishing a step from a Widget (`finishStepFromWidget`, run while the study page draws) and a Next both take a row lock on the Learner's state first, so two renders at once store one step divider. (3) Stop is tied to its turn: the stream's first event tells the browser the turn's id, Stop names it, and a late or repeated Stop finds nothing to stop on the next turn; a Stop that reached a turn at its deadline stays on the cut-off turn, so the resumed turn ends where it should. A stopped reply drops a bare trailing code fence as well as an open Widget (one shared function for the server and the browser), and focus stays put when Send and Stop swap. (4) A resumed turn numbers its usage steps after the last saved step, not from a row count. (5) "Back to <Topic>" under an Off-Topic answer falls back to the latest Teaching Step divider, then to the end of the thread, when its anchor is missing. (6) The Study Workspace and the old Session page pass the reference-data clip to the Case Data cache, so a later close never shows before a reveal.

**Scenario.** The Learner presses Stop at the moment the turn hits its time limit. The turn ends as cut off, the browser resumes it, and the resumed turn sees the Stop at its first look and ends as stopped, instead of writing on. Their next message, sent a second later, is not touched by the Stop's retry loop, because that loop ends with the send it was pressed for.

**Trade-off.** Tying Stop to an id adds one event to the stream and one optional field to the Stop request; a Stop pressed before the id arrives still goes untied for its first ask, which is the old behaviour. The row lock makes a Next wait a few milliseconds behind a study-page render. Keeping a Stop across a cut-off means a resumed turn can stop at once, which is what the Learner asked for. After a failed turn the old Stop is cleared, so Retry runs.

## The model sweep and the 50-turn replay (`src/behaviour/tutor-eval/sweep.ts`, `sweep-replay.ts`, `sweep.live.ts`, `sweep-replay.live.ts`, `scripts/tutor-replay.mjs`, `vitest.tutor-sweep.config.ts`, spec #229, ticket #248)

**What it does.** Two commands turn the go-live checks into one step each, and neither runs in `npm run check`. `npm run tutor:sweep` runs the live Tutor tests (T1 to T11, three runs each) once for every model and effort pair in `TUTOR_EVAL_MODELS` (default: Opus 5.5 low, Opus 5.5 medium and Sonnet 5.5 medium), each pair on its own spend cap (`TUTOR_EVAL_BUDGET_USD`, $5 by default). It uses the suite's own runner, so a pair is judged exactly as `npm run tutor:eval` judges one. One combined report gives each pair's runs passed, cases passed, spend and cost per turn, and names the cheapest pair that passed every case three times out of three. `npm run tutor:replay` reads the last 50 Learner turns from the stored Sessions (read-only; the script starts the replay with the database address removed from its environment), turns each into a case with the state the Learner had, sends it through the real Tutor Turn on a throwaway in-memory database, runs `fixReply` and `checkReply` on the reply, and writes the pass rate for each rule V1 to V7, the longest reply in words, and every failure in full. Reports go to `evidence/tutor-eval/`, which git ignores because the replay holds Learner messages.

**Scenario.** The owner runs `npm run tutor:sweep`. Opus low passes everything at $0.21 a turn, Opus medium at $0.34, and Sonnet medium fails T4 once in three runs. The report chooses Opus 5.5 low. The owner stores it in the settings table, then runs `npm run tutor:replay -- --model claude-opus-5-5 --effort low --engine on`. The report shows V1 at 50 of 50 and a longest reply of 97 words, so the widget engine goes on.

**Trade-off.** The sweep spends real money (up to the cap for every pair), and the cap stops a pair rather than the whole sweep, so a bad pair costs at most its cap. The rule picks the cheapest passing pair, so a flaky pass at three runs can win by luck; the report shows the runs passed so the owner can see it. The replay re-sends only the Learner's message with the state rebuilt from the log (methods used come from today's Skill state), so it is close to the original turn, not identical. Stored turns that need a Skill the Topic no longer lists are skipped and listed, not counted as passes.

**Go-live fixes (ticket #248, part).** A pair passes only when no case is pending: while any case is pending the report says "Cases are still pending" and names no setting. A live case that carries an answer (T3, T7) now goes the way the app does: a Quick try is drawn on its Skill and shown, `answerQuickTry` marks the answer in code, and the follow-up turn it asks for is the turn the Tutor runs (when code answers alone, as with the park offer, the run is graded by code only). The engine-off Tutor instructions no longer name `show_widget` or the rate Widget; each variant has its own Widget sentence. `testedSkills` and `isConverted` live in the browser-safe `src/course/tested-skills.ts`, which `map.ts` re-exports and `navigator.ts` imports, so there is one copy and no `node:fs` in the page bundle. After a missed quiz the Check tab says the answers and fixes are below and the Tutor will help with the first idea missed.

## Go-live fixes: the turn, Quick tries and the ladder (`src/tutor/practice.ts`, `ladder-moves.ts`, `context.ts`, `turn.ts`, `check-results.ts`, `reply-checks.ts`, `reply-records.ts`, `src/learner/skill-state.ts`, table `reply_checks` (`reply_kind`), `drizzle/0031_reply_kind.sql`, spec #229, ticket #248)

**What it does.** Eight small fixes found by the go-live review, each where the flow could stall or tell the Tutor the wrong limit:
- Your turn never strands the Learner. It waits only on the Check's Skills that have Quick tries there (`practisedSkills`); a Skill with no tries is skipped by the picker. When nothing is left to practise, because every such Skill is already fluent (from a quiz, or an earlier Check), entering Your turn finishes it at once: code stores the divider and moves the Learner to the Check (`finishWhenDone`). The same check runs when an answer leaves no try to give.
- A quiz attempt counts one miss per Skill on the ladder: three wrong answers on one Skill in one attempt are logged as three answers but move the Skill's state once (`countInState: false` on `recordAnswer` for the later ones). So a first failed quiz gives feedback, not a re-teach or the park offer.
- The ladder's rungs carry their own Reply kind: the worked example goes out as `worked_example` (120 words), the drill as `drill` (the short cap), the others as `reteach` (`rungKind`).
- A converted Topic's context names its Running example and the analogy of each Skill the current Check teaches, each marked "reuse it", so a re-teach uses them rather than a new one.
- A template's next Quick try never repeats the numbers of the last try shown from that template: the key is bumped (`<n>b1`, `<n>b2`, ...) until the draw differs (`freshKey`).
- Stop on a Quick-try follow-up turn drops only the reply: the fresh try, or the re-teach method's items, still follow.
- One Quick try sent twice at the same moment is marked once: `recordAnswerLogged` says whether this call logged the answer, and the second send returns with nothing.
- The turn's reply-check record keeps the Reply kind code chose (`reply_checks.reply_kind`), and `answer_question` for a Learner's own typed message.

**Scenario.** A Learner got two right answers in a row on both Skills of a Check through an earlier quiz, and now reaches that Check's Your turn. Before, no try came and no Next showed, so the Learner was stuck. Now code shows the divider and the Check opens. Later the same Learner types 9999 into all three questions of a one-Skill quiz: the Tutor names one slip and gives one fix, as on any first miss.

**Trade-off.** Migration 0031 is additive and applied by hand. Until it is, the record is saved through a copy of the table as 0030 made it (`replyChecksBefore0031`), and every read names its columns, so nothing fails; that copy should go once production has the column. Later misses in one quiz attempt are logged but not counted, so a Learner who gets every question on one idea wrong climbs the ladder no faster than one who gets one wrong. Finishing Your turn on entry means the Next note written just before can still name Your turn for that one turn; the context that follows names the Check.
**Go-live fixes (ticket #248, part).** A pair passes only when no case is pending: while any case is pending the report says "Cases are still pending" and names no setting. A live case that carries an answer (T3, T7) now goes the way the app does: a Quick try is drawn on its Skill and shown, `answerQuickTry` marks the answer in code, and the follow-up turn it asks for is the turn the Tutor runs (when code answers alone, as with the park offer, the run is graded by code only). The engine-off Tutor instructions no longer name `show_widget` or the rate Widget; each variant has its own Widget sentence. `testedSkills` and `isConverted` live in the browser-safe `src/course/tested-skills.ts`, which `map.ts` re-exports and `navigator.ts` imports, so there is one copy and no `node:fs` in the page bundle. After a missed quiz the Check tab says the answers and fixes are below and the Tutor will help with the first idea missed.

## The saved rule and the reply checks, and rounded Known mistakes (`src/tutor/tools.ts`, `src/tutor/reply-checks.ts`, `src/teaching/templates.ts`, part of #248)

**What it does.** `save_learner_rule` now runs the V5 check (never give an open quiz answer) on the Learner's words before
it keeps them, and refuses with a short reason when they give an answer away. The reply check still reads the saved rule
for V5, but no longer for V6 (app words) or V7 (currency): the words are the Learner's own and the Tutor cannot change
them. Separately, a template's Known mistakes on a rounded ask are rounded to the ask's decimals when they are drawn.

**Scenario.** The Learner types "the present value of $1,100 at 10% for a year is $1,000" while that quiz question is
open; the tool refuses, nothing reaches the notes, and the Tutor teaches on. A Learner who types 8.3 on a rule-of-72 draw
at 12% now gets the "100 divided by the rate" fix line, because the stored mistake is 8.3 and not 8.33333333.

**Trade-off.** A rounded mistake can now equal the answer after rounding; such a draw is thrown away and redrawn, which
costs nothing the Learner sees. A Learner's rule with a "$" in a rupee Topic is kept as they wrote it.
