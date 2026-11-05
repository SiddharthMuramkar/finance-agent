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

- New secrets for the owner to set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Google Cloud and Better Auth are free; no billing is needed for sign-in. Until both `BETTER_AUTH_SECRET` and `GOOGLE_CLIENT_ID` are set, Better Auth is never built, `/api/auth/*` answers 404 and every page works on the passcode path, so merging the code changes nothing on a deployment without the secrets.
- Google's consent screen stays in Testing with basic scopes (`openid`, `email`, `profile`); the invite list, not Google, decides who gets in. Publishing the app later is a button and needs no verification for basic scopes.
- The invite gate runs before Better Auth writes a `user` row: an email that is unverified, or neither invited nor let in by the open switch, is refused with `not_invited` and leaves no `user`, `account` or Learner. Emails are compared trimmed and lowercase, and nothing else is folded: `asha+x@gmail.com` is a different email from `asha@gmail.com`, so an alias is never let in by someone else's invite.
- Removing an invite does not sign out someone who has already signed up. To lock a Learner out, do it in this order: remove their invite, make sure the Sign-up switch is off, then archive the Learner. The gate runs only when a Google user has no active Learner, so archiving first, while the invite is still listed or sign-up is open, lets their next request make a fresh Learner. Their Better Auth session row is not deleted, but every request resolves the Learner again, so once both steps are done the next request is signed out. This is deliberate and small: about twenty people are invited by hand.
- `trustedOrigins` keeps `http://localhost:3000` in the production build, as the spec asks, so a sign-in callback that points at localhost is accepted; it can only send the person's own browser to their own machine, so the exposure is negligible.
- The proxy only checks that a Better Auth cookie exists (cheap, but not proof); every page and route still checks the real session through `currentLearner()`. A stale cookie shows the login page once, not a loop.
- Rate limiting for Google sign-in uses Better Auth's in-memory default, which is per server instance on Vercel and therefore weak. For an invite-only app of about twenty people this is accepted; the database storage option is the way up if sign-up is ever opened wide.
- The session lasts 90 days, the same as the passcode cookie it replaces. The Better Auth cookie cache is off, so sign-out takes effect at once.
- A Google display name can match another Learner's name, so a Google Learner never reuses an existing name: a clash gets " (2)", and `owner`, `tools` and every name on the passcode list are reserved (a passcode sign-in finds its Learner by name, so a Google Learner under such a name could be opened by that passcode).
- Previews cannot sign in with Google. Better Auth's OAuth proxy plugin is the documented way if that is ever wanted; it needs one shared secret across environments and is not used.
- The browser tests sign in as the tools Learner by passcode and, for a Google-linked Learner, with Better Auth's test helper, which is mounted only when the test-bed flag is set outside production.
- The glossary's **Learner** entry changes: signed in with Google (the test tools use a passcode).
