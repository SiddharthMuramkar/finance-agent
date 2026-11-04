# Ready-made Widgets only, opened already set

Status: accepted, 2026-11-04 (spec #229, "Teach simply"). Amends ADR 0003 and ADR 0005.

In the Study Workspace every Widget is either written ahead in a Topic's file or drawn by code from a Widget recipe (ADR 0005), and it opens already set to the numbers under discussion: a Concept card's preset, or the numbers the Tutor asks for. There is at most one Widget per reply, and code refuses a second with a tool error. The Tutor never draws a Widget of its own during the chat: compose_widget stays in the code but is not bound into the Tutor's tools, and a free-form Widget written into a reply fails the reply check (ADR 0008). When no recipe fits, the Tutor says so in one sentence and teaches in words. A Tutor preset replaces the Learner's last settings on that Widget, and the item records the preset, so an earlier chip reopens its own numbers. Guided Tasks stay optional play that the Tutor never sets as work. The explore step is unchanged (ADR 0001): it is the one place a Guided Task may decide progress, and elsewhere a ticked task may end a step early but never holds one back.

The rate-move recipe is the single rate Widget: a rate moving from an old value to a new one, with three readouts worked out by tested code and said in words (points, basis points, and percent of the old rate), in a show mode and a practice mode that hides the readouts until the Learner types an answer. It replaces Percent's written-ahead "One rate change, said three ways". The quick_check recipe leaves the Tutor's catalogue for Topic teaching, the rule against repeating the last Widget's archetype is dropped (the Running example's Widget is meant to repeat), and an Illustration is allowed only where no input or Case Data path covers the same number.

We chose this because of the Percent Session of 4 November 2026 (spec #229): at least four Illustrations were drawn in one Session, one showed a dollar sign in a rupee Topic, and the Learner was told to set sliders, guess and compare. A Widget drawn in the chat is laid out from scratch each time, arrives after its prose, and fails in the same few ways (ADR 0005); a ready-made one always works, shows the right currency and looks the same each time.

This amends ADR 0003: the Tutor no longer builds a Widget "whenever a picture helps, and always when the Learner asks for a chart"; it opens a ready-made one or says that none fits. ADR 0003's rule that real numbers come only from code or Case Data stays. It amends ADR 0005: teaching in words where no recipe fits is permanent, not a gap until compose_widget arrives, and the widget engine is switched on for new Sessions at go-live.

## Considered Options

- Free-form plus recipes (the UX run's plan): recipes for common ideas and compose_widget for the rest. It covers the most ideas, but the free-form path is what drew the Session's Illustrations and the dollar sign, and turning the engine on would hand it to every new Session.
- Free-form only (ADR 0003): any idea can be drawn, but each Widget is new, slow to arrive and uneven in currency and labels, and it hands the Learner pictures to work out.

## Consequences

- Fewer Widgets for now: only 2 of 95 Topic files have written-ahead Widgets and few recipes exist, so most Topics teach in words until Widgets and presets are written Topic by Topic, following the Concept cards.
- A Session already frozen with compose_widget keeps that tool's code bound, so a saved call still resumes (ADR 0005's one-way rule).
- open_widget and recipes take a preset, checked against the Widget's slider ranges, and the course check validates every Widget and preset a Topic file names.
- While a quiz is open the Learner may still use a Widget as a calculator, but the Tutor may not open one at an open question's numbers.
- Everyday Widgets use the Topic's example currency (₹ by default); a Case's figures keep the Case's own currency.
- Probes and judges that reward free-form drawing are rewritten: a correct "taught in words" reply counts as a pass.
