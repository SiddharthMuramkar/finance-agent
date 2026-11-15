# Anyone can ask in with Google or an email link; the owner approves each person on /admin

Status: accepted, 2026-11-14; sign-in parts superseded by ADR 0017 (Clerk) on 2026-11-15. Tickets: [#6](https://github.com/SiddharthMuramkar/finance-agent/issues/6) (Sign-in launch plan, option B: Google and email links together), [#14](https://github.com/SiddharthMuramkar/finance-agent/issues/14) (Join flow, option C: the spec's pages) and [#15](https://github.com/SiddharthMuramkar/finance-agent/issues/15) (Keep or remove the passcode door, option B: tests only). Written new from the archived ADRs 0011 and 0014 (anyone can ask).

## Context

The beta is small, and the owner wants to know each person who comes in. The Signal spec promises Google sign-in, an email link and "We'll email you when you're in". Many people use only iCloud or Outlook. The old app had a third way in, a passcode, which also worked in production. Each way in is one more door to guard.

## Decision

- Google sign-in and email-link sign-in are both live before the first invite.
- Anyone can ask to come in. An invite skips the wait.
- The owner approves or denies each person on `/admin`. Approve sends a "You're in" email.
- Access state (approved, waiting, denied) is always worked out from facts (invites, denials, the person's Learner), never stored as a label. A denial wins over everything.
- `/join`, `/pending` and `/login` ("Welcome back") are separate pages, so a link, a redirect or an email can point at exactly one state.
- On `/join` a person may pick 0 to 3 reasons. They are stored once per account in a small table of their own, and the owner sees them on `/admin`.
- Passcodes work only locally and in the test bed. Production refuses them and hides the "Use a passcode" link.

## Consequences

- Every invitee can join on day 1, whatever email they use.
- The owner has setup to do first: a Google OAuth client, a Resend account and DNS records for the domain. DNS can take hours.
- Resend's free plan allows 100 emails a day. Sign-in and approval emails share one daily limit.
- Production has one kind of door to guard. The stale production passcode values must be removed once Google and email links are live.
- The simulated Learner and the browser tests run only against a local server.

## Alternatives considered

- **Google now, email links later:** `/admin` works sooner, but people without Google wait.
- **Google only for the whole beta:** the least setup, but no approval email and the spec text must change.
- **One `/login` page with a waiting screen (one or two faces):** fewer routes, but no address for each state, and reasons carried in a cookie are lost across devices.
- **A stored status column or an access-requests table:** a second record of "approved" to keep in step, and a risk that a person approves themselves.
- **Remove passcodes everywhere:** the smallest attack surface, but the test bed and scripts need a new sign-in, days of work before the deadline.
- **Keep a hidden passcode in production:** almost no code, but one leaked word opens a production Learner.
