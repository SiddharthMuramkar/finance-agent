# Clerk replaces Better Auth: Waitlist sign-up, admin by Clerk role, passcodes only locally

Status: accepted, 2026-11-15. Ticket: [#33](https://github.com/SiddharthMuramkar/finance-agent/issues/33) (Clerk replaces Better Auth + platform security). Supersedes ADR 0014, which came from [#6](https://github.com/SiddharthMuramkar/finance-agent/issues/6), [#14](https://github.com/SiddharthMuramkar/finance-agent/issues/14) and [#15](https://github.com/SiddharthMuramkar/finance-agent/issues/15): Better Auth sign-in, approval on `/admin`, the access states worked out in the app, the "What brings you here?" reasons table, the Resend emails, and the `/pending` and `/login` pages. Two of its rules stay (see Consequences). Confirms and extends #15: passcodes are the local and test door only. Built on `main` in three steps: PR #35 (the expand step: `learners.clerk_user_id`, and BotID on `POST /api/turn`), PR #48 (Clerk runs sign-in, live in production since 2026-11-15; the Better Auth code is removed) and PR #51 (the contract step, 2026-11-16: migration 0040 drops the Better Auth tables and `learners.auth_user_id`). The pre-Clerk Learners were wiped on 2026-11-16, before #51. Google sign-in is not on in production yet.

## Context

ADR 0014 built sign-in in the app with Better Auth: a Google OAuth client, email links sent through Resend, invites and denials in our own tables, access states worked out from them, and Approve and Deny buttons on `/admin`. Each of these is code the owner must keep safe, and each email shares Resend's 100-a-day free limit. Sign-in POSTs to our own routes also needed BotID and a firewall rule. The owner wants an agent to run the platform setup (Vercel, the sign-in provider, GitHub), and a hosted provider gives the join, wait and approve flow ready-made.

## Decision

- Clerk replaces Better Auth and the passcode door for real people. It is a direct clerk.com account on the Free plan for now.
- Sign-in is an email link and Google, both hosted by Clerk. Production goes live with the email link only, and Google follows later (owner, 2026-11-15).
- Sign-up uses Clerk's Waitlist mode: `/join` shows Clerk's Waitlist, a person waits, the owner approves them in Clerk, and Clerk sends the "You're in" email. Resend is not needed.
- ADR 0014's `/pending` page is dropped, and `/login` goes: it redirects to `/sign-in`. Clerk's `/sign-in` and `/sign-up` pages and the Waitlist on `/join` take their place.
- The access states are no longer worked out in the app: Clerk holds them. The "What brings you here?" choices are dropped for now.
- The owner is the person whose Clerk `publicMetadata.role` is `"admin"`, read from the session claim. `/admin` checks that claim.
- Fresh start, with no user migration. After Clerk is live: take a Neon snapshot, delete the old Learners (those with no Clerk id) and their history, and drop the Better Auth tables.
- The change follows expand-then-contract (ADR 0016): first add `learners.clerk_user_id`, then switch the code to Clerk and remove the Better Auth code with its tables kept, and last drop the Better Auth tables and `learners.auth_user_id`.
- Passcodes stay only as the local and test door. Production refuses them, and the passcode secrets leave Vercel Production once Clerk is live. So CI stays offline and needs no Clerk keys.
- Bot protection for sign-in is Clerk's (sign-up bot protection and lockout). BotID moves to `POST /api/turn`.

## Consequences

- Less sign-in code to own and guard: Clerk hosts the sign-in, the emails and the waiting list.
- Approval moves from `/admin` to the Clerk dashboard. `/admin` stays for the owner, with Spend, Tutor speed and the Spend caps.
- Everyone who signed in before the cut-over starts again from nothing, and their old history is gone. The snapshot is the only way back.
- Production needs Clerk DNS records on the domain and Clerk keys in Vercel. Google sign-in there also needs its own Google OAuth client for Clerk, so it comes after go-live. Until then, everyone signs in with an email link.
- Sign-in depends on Clerk's service and its Free plan limits. Moving away later means a user migration.
- The simulated Learner and the browser tests keep signing in with a passcode, against a local server only.
- Two of ADR 0014's rules stay: the owner approves each person, and production has no passcode. Its rule that Google and email links are both live before the first invite does not: the email link comes first, Google later.

## Alternatives considered

- **Keep Better Auth (ADR 0014 as built):** no new vendor and full control, but we own the emails, the approval flow, the access states and their bot protection.
- **Move the existing users into Clerk:** no one starts again, but a migration is more work and more risk, and the Better Auth tables would stay longer.
- **Remove passcodes everywhere:** the smallest attack surface, but CI and the browser tests would need Clerk keys and a network.
- **Decide admin by a list of owner emails in the app:** no Clerk setting, but a second record of who the owner is to keep in step with Clerk.
