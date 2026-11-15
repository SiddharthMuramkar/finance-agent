# One Session per Topic, kept across breaks and deploys

Status: accepted, 2026-11-15. Ticket: [#4 Restore design docs from the archive?](https://github.com/SiddharthMuramkar/finance-agent/issues/4). Rewritten from archive ADR 0004.

## Context

A Session used to be one conversation across any Topics, replaced after 6 idle hours or whenever a deploy changed the Tutor's instructions. A Course Map jump only changed the current Topic, so the next turn carried the old Topic's conversation into the new one. On 3 November 2026 five Sessions held two or three Topics, and the Tutor said "The Sensex story stays where we left it" in the middle of another Topic.

## Decision

- A Session is the whole conversation between one Learner and the Tutor about one Topic. Choosing another Topic opens that Topic's own Session.
- Coming back to a Topic continues its Session, even days later.
- A deploy that changes the instructions does not start a new Session. The next new turn refreezes the instructions and tools inside the same Session (`refreezeIfChanged` in `src/tutor/session-log.ts`). The Session keeps the reasoning effort it was frozen with; a changed default reaches new Sessions only.
- Compaction, not idle time, limits what the model reads: it is sent only this Topic's messages (older ones compacted) plus the Learner summary.
- A passed Topic's Session is read-only, and reopens only for a Due Check.

## Considered Options

- **Keep time-based Sessions and start a new one on every Topic change:** it stops the mixing, but a Learner returning to a Topic finds a fresh chat and loses the thread.
- **A fresh chat on every return, opened by a recap:** less to send the model, but the owner wants each Topic's thread exactly as it was left.

## Consequences

- The "The Tutor was updated" notice is gone.
- A Session lasts as long as its Topic is studied, so long Sessions depend on compaction.
- A refreeze drops the raw model output of earlier steps (ADR 0007), so the first turn after such a deploy costs a cache write.
- Reviews are capped per day, not per Session.
- A Learner can start a Topic over: the live Session becomes an Older session, the Topic's progress is snapshotted and cleared, and the next turn opens a fresh Session.
- A Learner who has passed every Topic talks to the Tutor in one Session with no Topic.
