# One Session per Topic, kept across breaks and Tutor updates

Status: accepted, 2026-11-03.

A Session is now the whole conversation between one Learner and the Tutor about one Topic. Choosing another Topic opens that Topic's own Session, and coming back to a Topic, even days later or after a deploy changed the Tutor's instructions, continues it. The model is sent only this Topic's messages (older ones compacted into a summary) plus the Learner summary. Until now a Session was one conversation across any Topics, replaced after 6 idle hours or whenever the instructions changed, and a Course Map jump only changed the current Topic, so the next turn carried the old Topic's conversation into the new one: on 3 November 2026 five Sessions held two or three Topics, and the Tutor told the Learner "The Sensex story stays where we left it" in the middle of another Topic (fix file B1 and B2).

## Considered Options

- Keep time-based Sessions and also start a new one on every Topic change: it stops the mixing, but a Learner returning to a Topic finds a fresh chat and loses the thread they were in.
- A fresh chat on every return, opened by a "Picking up where you left off" recap: less to send the model, but the owner wants each Topic's thread exactly as it was left.

## Consequences

- A deploy that changes the Tutor's instructions no longer starts a new Session for the Learner, and the "The Tutor was updated" notice goes away.
- A Session lasts as long as its Topic is studied, so compaction, not an idle window, limits what the model is sent.
- Sessions from before the change, including the five that mix Topics, stay read-only under "Older sessions"; each Topic starts a fresh Session and its progress carries on.
- A passed Topic's Session is read-only, and reopens only for a Due Check.
- The one exception is the existing every-Topic-passed mode: a Learner with no place on the Course Map talks to the Tutor in one Session with no Topic.
- A deploy that changes the instructions refreezes them inside the Session, and earlier thinking blocks are left out of later requests, because the API rejects thinking blocks made under different instructions or tools.
- Reviews were capped per Session, which assumed Sessions restart after idle gaps; they are now capped per day.
- Amended 5 November 2026: a Learner can start a Topic over. The live Session becomes an Older session marked `restarted_at`, the Topic's progress rows are snapshotted to `topic_restarts` and cleared, and the next turn opens a fresh Session.
