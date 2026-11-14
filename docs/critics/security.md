# Security critic (spec §8.7)

## Inputs
- The diff of C1a, C1b, C3 or B3a.
- A list of routes.

## Rubric
1. Can an uninvited email get a Learner (race, case, plus-address, unverified email, second account link)?
2. Open redirects through `callbackURL`, `next` or `errorCallbackURL`?
3. Session cookie flags (`httpOnly`, `secure`, `sameSite`) and lifetime; sign-out removes the row?
4. CSRF and same-origin checks on `POST` routes; `trustedOrigins` as small as possible?
5. Is `testUtils` or the `dev-e2e` route reachable in a production build?
6. Can Learner A read or restart Learner B's Topic?
7. Secrets in the repo, logs or client bundle?

## Output
JSON only, no prose.

```json
{"findings":[{"id":"S1","where":"src/auth/example.ts:42","attack":"an uninvited email signs in with a plus-address","severity":"med","fix":"compare the email without the plus part"}]}
```

`severity` is one of `low | med | high | critical`.

## Pass bar
0 confirmed `high`, `critical` or `med`. Every finding at `med` or above goes to 3 votes.

## Tier
sonnet, medium. The vote on a `critical` runs on opus.
