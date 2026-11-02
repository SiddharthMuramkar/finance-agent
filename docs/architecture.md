# Architecture

A plain-words map of the layers built so far. Each layer says what it does, a concrete
scenario, and the trade-off we accepted. Newest layers are added at the bottom.

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

**What it does.** Neon is the only store. Three tables so far:
- `settings`: the Tutor's model (`claude-sonnet-5-5`) and effort (`medium`), editable without a rebuild.
- `sessions`: one row per Session, with the exact instructions, tool definitions, model and
  effort frozen when it started, plus a fingerprint of the instructions and tools.
- `messages`: the Session's history, add-only, each message stored exactly as sent or received.

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

## Checks before merging (CI)

`npm run check` runs the type checker, the linter and the tests. GitHub Actions runs
`npm ci && npm run check` on every push with no secrets.
