/*
 * The Signal site's let-off, shared by the affordance audit (affordance.spec.ts) and the preview matrix (matrix.spec.ts),
 * so both judge the site's pages by one rule (G38: the matrix judged them without it and failed on every site cell).
 */

/**
 * The Signal site's pages (decision #7: Home, How it works, Examples, the case pages and About) are judged like every other
 * page, but for the few Signal spec §5 components whose look the spec draws against the app's rules, while the owner
 * decides which rule wins (#32):
 * - text links (`.v-tlink`) and whole-row question links (`.v-qrow`, "Play →") have no underline until hover (§5.2),
 *   where ADR 0018 underlines a link in a reading area at rest;
 * - an FAQ row (`.v-faq summary`, §5.17) shows a "+" drawn in CSS, not a chevron icon;
 * - the Tutor demo's question chips (`.v-qchip`) are pills, and a case page's Previous and Next cards (`.v-linkcard`, a
 *   whole card that is a link) keep a card's 14 px corners, where ADR 0018 caps a control's corners at 12 px.
 * Only these, only inside `#main`, are let off, and only the look rules (signifier, flatness, F4's link and blue-word
 * rules). Everything else on those pages, the site chrome included, is judged. When the owner decides, either the site
 * follows ADR 0018 and its selector leaves this list, or the ADR makes room for the Signal spec here.
 */
export const SIGNAL_SITE = new Set(["home", "home-signed-out", "about", "how-it-works", "examples", "case-amazon", "privacy", "terms"]);
export const SIGNAL_SPEC_LOOKS = ["#main .v-tlink", "#main .v-qrow", "#main .v-faq summary", "#main .v-qchip", "#main .v-linkcard"].join(", ");
