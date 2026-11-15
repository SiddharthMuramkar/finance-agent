# The Tutor runs on one OpenAI model behind the app's own transcript format

Status: accepted, 2026-11-15. Ticket: [#4 Restore design docs from the archive?](https://github.com/SiddharthMuramkar/finance-agent/issues/4). Rewritten from archived ADRs 0015 and 0016.

## Context

The Tutor and the paid test harnesses moved from Anthropic's models to OpenAI's. The owner chose one model, so there is nothing to pick between, price twice or test twice. The app edits its own history (the reply checks reject drafts, a deploy refreezes instructions), and the API refuses a request whose replayed reasoning no longer matches what is sent. On 11 November 2026 a Session locked this way, and every Retry showed the Learner the provider's error text.

## Decision

- **One constant model.** Every model call uses `TUTOR_MODEL = "gpt-6.1-sol"` (`src/tutor/model.ts`) on the Responses API. It is a constant, not a setting. The reasoning effort stays a setting.
- **Our own transcript, one adapter.** Stored messages keep the app's own format. `src/tutor/openai-items.ts` translates to and from OpenAI items at the edge, so the turn, the database, the screen and the tests never see an OpenAI type.
- **Stateless requests that replay stored reasoning.** Requests set `store: false` and `reasoning.context: "current_turn"`. Each untouched step is sent back with its stored raw output. Any row that code rejected or edited, and every later row in that turn, is sent without it.
- **A refused Session heals itself once.** If the API refuses replayed items, code resends once without any raw output, moves the Session's refreeze marker past what is stored, and records an incident.
- **A Learner never reads provider text.** A failure shows a fixed line and a short reference. Provider messages show only under developer details.
- **Changing `TUTOR_MODEL` retires every live Session.** On the Learner's next turn, a Session frozen on another model becomes an Older session and a fresh one opens at the same step, progress kept.

## Consequences

- One key, `OPENAI_API_KEY`, in `.env` and in Vercel.
- The scripted test client plays the API's replay check, so a change that edits earlier history without dropping raw output fails in CI, not in front of a Learner.
- A heal costs one more request, and the history before the marker is sent without raw output from then on.
- Compaction is opaque: we cannot read or correct its summary.
- A model change costs every Learner a fresh conversation, so it is a deliberate step, not a tweak.

## Alternatives considered

- **Keep the old provider and add OpenAI behind a setting:** two providers to price, test and keep in step, against the owner's choice.
- **Store the transcript as OpenAI items:** every old conversation, the screen and most scripted tests would change, and the database would hold a vendor's shapes.
- **Let OpenAI keep the conversation (`previous_response_id`):** less to send, but we could not edit the history the reply checks edit, and tests could not replay it.
- **Never send raw output back:** no refusals, but the model would lose its reasoning between tool calls in one turn and pay to reason again.
- **Heal by starting the Topic over:** it works, but the Learner loses the conversation.
