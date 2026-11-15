# Architecture decision records

One line per decision, in number order. Each record says what was decided and why. Cite a decision as "ADR NNNN".

- [0001](0001-topic-file-holds-the-teaching.md): The Topic file holds the teaching; code holds the sequence and marks every answer
- [0002](0002-every-question-is-a-tap.md): Learners never type numbers: every question is a tap, and Spine Checks test judgement
- [0003](0003-formulas-only-as-formula-cards.md): Named formulas appear only as Formula Cards from a tested registry
- [0004](0004-valuation-spine-is-the-default-path.md): A valuation Spine of fifteen Topics is the default path; the other Topics are Electives met through Primers
- [0005](0005-one-session-per-topic.md): One Session per Topic, kept across breaks and deploys
- [0006](0006-replies-checked-before-they-show.md): Step-led replies are checked before they show; own-question replies stream behind a stream guard
- [0007](0007-one-model-behind-our-own-transcript.md): The Tutor runs on one OpenAI model behind the app's own transcript format
- [0008](0008-a-widget-when-it-fits-and-choices.md): A reply changes the Widget only when a better one fits, and every reply ends with two or three Choices
- [0009](0009-tutor-chooses-code-draws.md): The Tutor chooses a Widget recipe; tested code draws it, and every number has a known origin
- [0010](0010-one-valuation-engine.md): Every valuation number comes from one tested valuation engine, including the Signal Levers widget
- [0011](0011-signal-widgets-are-fixed-components.md): Each Signal widget is one fixed React component with two doors
- [0012](0012-only-the-call-starts-a-turn.md): Only the Learner's call in a widget starts a Tutor turn
- [0013](0013-as-of-rule-hides-hindsight.md): Before the reveal, nothing after a Case's as-of date reaches the Learner
- [0014](0014-owner-approves-every-learner.md): Superseded by 0017. Was: anyone asks in with Google or an email link, and the owner approves each person on /admin. Still holds: the owner approves each person, Google and email links, no passcode in production
- [0015](0015-one-light-theme-colour-language.md): One Light theme across the whole app, in the Signal colour language
- [0016](0016-only-main-deploys.md): Only main deploys to production, behind checks, a snapshot and expand-then-contract migrations
- [0017](0017-clerk-replaces-better-auth.md): Clerk replaces Better Auth: Waitlist sign-up, admin by Clerk role, passcodes only locally

A number marked "archived" or "old" inside a record means the earlier ADR set, which is not in this repo. That set had two files numbered 0014: "Anyone can ask, and the owner approves" and "Flat, icon-only Widgets". A record that cites old 0014 names which one.
