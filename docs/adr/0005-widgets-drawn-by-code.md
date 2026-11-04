# Widgets drawn by code from recipes: the Tutor chooses, code draws

Status: accepted, 2026-11-04. Amends ADR 0003. Behind the `widget_engine` setting, which is off until the owner turns it on.

With the widget engine on, the Tutor no longer writes a Widget's OpenUI Lang program. It calls a tool, `show_widget({recipe, params})`, naming a Widget recipe and its params. Code parses the params against the recipe's schema, compiles them into an OpenUI Lang program, runs the same Widget checks a written Widget gets (it draws, a slider has a Guided Task at a number it can reach, axes are labelled, no second Widget of the same Case Data, no written-ahead parts), and stores the Widget as a Session item that carries its id, recipe, params, title and code. It streams as an item at once and draws in the panel like any other Widget. A problem goes back to the Tutor as a tool error, so it retries inside the same turn rather than through the correction round-trip. We chose this because a Widget the Tutor writes arrives last (after its prose and 300 to 650 tokens of code), is laid out from scratch each time, and fails in the same few ways (UX audit ★.2): the model is good at choosing what to show, and code is good at drawing it.

ADR 0003's rule on numbers stays and gets sharper. A recipe's params come in three kinds: `inputs` (slider ranges and starting values, and calculator or formula inputs that our tested code works out), `refs` (Case Data references, checked against the Case Data the as-of rule allows the Learner now) and `facts` (numbers the Tutor types that the Widget shows as they are). Any fact makes the Widget an Illustration: code puts "Illustration:" before its title, whatever the Tutor asked.

## Considered Options

- Writing the compiled program into the reply text as a fence: no browser change at all, but a tool cannot add lasting text to the reply. The fence would vanish on resume, refusal and reload, and the server's Widget check, Save to notes and the open-Widgets note all read the stored reply.
- Rewriting the stored assistant message to hold the fence: it edits model history beside thinking blocks and sends the fence back to the model on every later turn.
- Keeping freeform Widgets only, with stricter prompt rules: the evidence (★.2, ★.3) is that more rules make the prompt longer and the Widgets slower without making them less samey.

## Consequences

- One way per Session: a Session frozen with show_widget keeps the engine's instructions and tools even if the setting is turned off, so no history holds a call to a tool its Session no longer lists. Every tool's code is always bound, so a resume never fails on a saved show_widget call.
- Off, the instructions and tools are today's exactly, so no existing Session is refrozen by this change.
- The engine's instructions list recipe signatures instead of the 33K-character Widget library prompt, so a Tutor with the engine on cannot write a freeform Widget until compose_widget arrives. What no recipe covers is taught in words.
- A shown Widget is not in the reply's text, so Save to notes on a reply does not include it yet.
- The instructions ask the Tutor to call show_widget before it writes prose; nothing in code enforces the order.
