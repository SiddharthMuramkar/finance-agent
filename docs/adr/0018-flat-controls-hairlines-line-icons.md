# Controls are flat everywhere, sections are hairlines, and pictures are line Icons

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Written new from the flat-controls part of archived ADR old 0013 (without its two modes, its one accent and its colours), archived ADR old 0014 ("Flat, icon-only Widgets", without its accent families) and the F4 rule of archived ADR old 0022. Colours are ADR 0015.

## Context

The old app had 3D buttons with a lip that sank when pressed, pill chips, boxes inside boxes and 3D emoji in the Widgets. The owner found it childish and asked for "digital minimalism and professionalism" (11 November 2026). First the chrome went flat and the Widgets stayed raised, but next to the flat chrome the Widgets, the part the product sells, looked like toys. The Signal spec keeps this line: "Everything else is flat with hairlines" (§1.1, rule 4).

## Decision

- **Flat controls, in the app and inside Widgets.** A control shows that it can be pressed by a face, a 1px edge or a strong ghost label. It has no lip, no lift, no drop shadow and no pill ends, and it is never rounder than 12px (an icon button may be round). Hover and press are colour steps. Nothing moves when pressed.
- **Shadows only on floating layers.** A menu, a popover, a toast and a dialog have a shadow. Nothing else does.
- **Hairlines, not boxes.** Sections are set apart by a 1px rule and by space. A page has at most one framed box.
- **One filled primary per pane.** Other actions are outlined or text only.
- **What can be pressed stays obvious.** In a reading area a link is underlined and a button has a face. Nothing that cannot be pressed looks like a link or a button.
- **Line Icons, no emoji.** Every picture is a line Icon from one pinned set (`lucide-react`, stroke 1.75). No emoji appears in product code. Topic files and the Tutor keep the emoji names they use, and code maps each name to an Icon. Choices are words only (ADR 0008).
- **Motion only with meaning.** A card flips, a story steps, a number counts. No bounce, lift, press-down or tilt.

## Consequences

- The gates fail on the raised look: `src/app/primitives/css.test.ts` (no lip, `translateY(`, `999px` or utility drop shadow, with a `KNOWN` list that can only shrink), `src/widgets/look.test.ts`, the browser audit in `e2e/support/measure.ts` (`notFlat`, `auditAffordances`, `pressLook`), `e2e/targets.spec.ts`, `src/dev/is-tilted.test.ts` and `src/icons/no-emoji.test.ts`.
- Exact sizes, corner radii, the header height and the type scale are tuning. The tests and `globals.css` hold them, not this ADR.
- One runtime dependency, `lucide-react`. A Topic file or Tutor param that names an emoji with no Icon fails the course check.
- The Signal spec raises a live widget's shell with a shadow and 18px corners (§1.1 rule 4, §4.5) and has status pills (§5.4). The controls stay flat under the spec too. If the site work for #17 (#32) brings that shell or those pills into the app, the frame and pill rules here narrow with it.

## Alternatives considered

- **Keep the raised, lipped controls:** they look pressable without hovering, but the lip was the main "toy" signal.
- **Flat chrome, raised Widgets:** the Widgets keep their look, but the contrast is what made them look childish.
- **Flatten the controls, keep the 3D emoji:** less to change, but emoji were the strongest toy signal left.
- **Hand-draw each Icon as inline SVG:** no dependency, but over 160 emoji names map to Icons, and hand copies drift.
