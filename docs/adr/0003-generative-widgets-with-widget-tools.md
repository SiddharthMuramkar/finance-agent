# Generative widgets use OpenUI's kit beside our own parts, with real numbers only through widget tools

Status: accepted, 2026-11-03. Superseded in part by ADR 0004: a deploy that changes the Widget instructions no longer starts a new Session. Amended by ADR 0005 (recipes drawn by code), ADR 0006 (at a converted Concept step, code opens the Concept card's Widget already set) and ADR 0007 (ready-made Widgets only: the Tutor no longer draws its own).

The Tutor builds a Widget whenever a picture helps, and always when the Learner asks for a chart, graph, table or picture. It writes them with OpenUI's ready-made kit (charts, tables, tabs, callouts) beside our own code-backed parts (Slider, AnnuityChart, HistoryChart, Calculator, FormulaCard, Guided Tasks), all drawn by the free OpenUI renderer. Real figures reach a Widget only through those parts or through Widget tools: small pieces of our code the Widget calls in the browser for Case Data (under the as-of rule), one of our tested calculators, a calculator run across a range of one input, or an annuity schedule. Numbers the Tutor types are allowed only in an Illustration, a plainly made-up example whose title starts "Illustration:" and which code labels Illustration. We chose this because the earlier rules (widgets optional, charts take no data series, no chart without Case Data) left the Tutor unable to draw most ideas: on 2 November 2026, asked "can you generate a chart to explain it", it replied "I don't have a chart type that fits this idea" and gave a table.

## Considered Options

- The Thesys Gateway, Thesys's paid hosted model that writes the interface (what `THESYS_API_KEY` is for): it would replace Claude as the Tutor, drop the guarantee that numbers come from our tested code, and add a paid service, while the free renderer already draws everything.
- Keeping "no typed numbers anywhere": the strictest guarantee, but it left the Tutor unable to draw most ideas, as the 2 November evidence shows.

## Consequences

- The frozen widget instructions grow (the kit's parts, four tools, more examples), so each Session's instructions cost more to write to the prompt cache, and a deploy that changes them starts a new Session.
- The kit ships as one bundle, so the Study Workspace loads more JavaScript.
- The server's Widget check is stricter: a tool that does not exist, any Mutation, written-out tool arguments that fail validation, an unknown calculator or a malformed Case Data reference each feed the one correction turn.
- An Illustration's numbers are labelled but not computed by our code; only the arithmetic the Tutor writes as an expression is worked out by the Widget.
- The kit's Markdown renderer and code block stay out, so a Widget still cannot show a typed formula (ADR 0002).
