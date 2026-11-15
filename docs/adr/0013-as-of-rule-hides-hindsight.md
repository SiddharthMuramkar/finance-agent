# Before the reveal, nothing after a Case's as-of date reaches the Learner

Status: accepted, 2026-11-15. Tickets: [#24](https://github.com/SiddharthMuramkar/finance-agent/issues/24) (What does Library search score today?) and [#25](https://github.com/SiddharthMuramkar/finance-agent/issues/25) (How strict should the as-of rule be for timeless sources?, option A now, option B after the beta).

## Context

A Case asks the Learner to make a call as if they stood on its as-of date (for example Amazon in February 2000). If the Library or Case Data shows what happened later, the call is spoiled. The Library holds two kinds of source: dated ones (news, filings, blog posts) and timeless ones (textbooks and lecture courses that the app stamps with one date per source). The baseline in #24 found two holes:

- **Heading years:** the year check read the passage heading. Every Yale 252 (Shiller) heading says "(2011)", so 929 of 942 passages were hidden for 58 of 126 Case entries.
- **No-year leak:** a passage that tells the ending without naming a year passes the year check.

## Decision

- Until a Case's reveal, Library search and Case Data apply the as-of rule.
- A passage passes if it was published on or before the as-of date.
- A passage from a timeless source also passes if every year that its text mentions is before the as-of year. Only the text counts, never its heading.
- Each Signal Case has a short list of outcome words (what happened after its as-of date). Hindsight probes check that no passage the rule lets through contains them, in the Library score and in a PGlite test.
- Tagging each passage at ingest ("mentions later events", stored and reviewed) waits until after the beta.

## Consequences

- Old Cases (up to 2001) still see only about 10% of the Library, because most sources were published later.
- The fix re-stamps each passage's latest year on the next Library load (the owner runs it, after a snapshot).
- The probes catch a leak only for words someone wrote down. A passage that tells the ending in other words can still pass until the post-beta tagging lands.
- Every new Signal Case needs its own outcome words.

## Alternatives considered

- **Tag each passage at ingest now:** the strongest check, but each passage needs review. Too much work before the beta, so it comes later.
- **An allow or deny list of sources for each Case, in the Topic file:** exact, but hand work for every Case and every new source.
- **Drop the timeless branch, date only:** the simplest rule, but it hides the textbooks from almost every Case.
