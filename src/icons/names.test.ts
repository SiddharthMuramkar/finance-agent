import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_SET, ICON_SET_NAMES, iconFor, isIconName } from "./names";

/**
 * Appendix A1-T of spec 2026-11-11 (ticket A1a), held here as a literal: each Icon name and its lucide-react 1.71.0
 * drawing. The 161 names keep today's emoji registry order; the six Widget-kind names follow.
 */
const TABLE: readonly (readonly [string, string])[] = [
  ["person", "user-round"],
  ["man", "user-round"],
  ["woman", "user-round"],
  ["older-person", "user-round"],
  ["old-man", "user-round"],
  ["old-woman", "user-round"],
  ["office-worker", "user-round"],
  ["man-office-worker", "user-round"],
  ["woman-office-worker", "user-round"],
  ["technologist", "laptop"],
  ["judge", "gavel"],
  ["police-officer", "shield-user"],
  ["detective", "user-search"],
  ["guard", "shield"],
  ["farmer", "tractor"],
  ["cook", "chef-hat"],
  ["factory-worker", "hard-hat"],
  ["construction-worker", "hard-hat"],
  ["scientist", "microscope"],
  ["teacher", "school"],
  ["student", "graduation-cap"],
  ["person-raising-hand", "hand"],
  ["person-shrugging", "circle-question-mark"],
  ["person-facepalming", "face-expressionless"],
  ["grinning-face", "face-grinning"],
  ["slightly-smiling-face", "face-slightly-smiling"],
  ["smiling-face-with-sunglasses", "face-grinning"],
  ["thinking-face", "brain"],
  ["face-with-monocle", "search"],
  ["nerd-face", "glasses"],
  ["star-struck", "star"],
  ["money-mouth-face", "circle-dollar-sign"],
  ["partying-face", "party-popper"],
  ["exploding-head", "zap"],
  ["face-screaming-in-fear", "siren"],
  ["anxious-face-with-sweat", "face-slightly-frowning"],
  ["worried-face", "face-slightly-frowning"],
  ["astonished-face", "circle-exclamation-point"],
  ["hushed-face", "face-neutral"],
  ["face-with-rolling-eyes", "face-expressionless"],
  ["shushing-face", "message-circle-off"],
  ["zipper-mouth-face", "message-circle-off"],
  ["neutral-face", "face-neutral"],
  ["yawning-face", "face-expressionless"],
  ["ox", "trending-up"],
  ["bear", "trending-down"],
  ["turtle", "turtle"],
  ["snail", "snail"],
  ["rabbit-face", "rabbit"],
  ["shark", "fish"],
  ["owl", "bird"],
  ["unicorn", "sparkles"],
  ["money-bag", "wallet"],
  ["coin", "coins"],
  ["dollar-banknote", "banknote"],
  ["euro-banknote", "euro"],
  ["pound-banknote", "pound-sterling"],
  ["yen-banknote", "japanese-yen"],
  ["money-with-wings", "banknote-arrow-up"],
  ["credit-card", "credit-card"],
  ["receipt", "receipt"],
  ["bank", "landmark"],
  ["chart-increasing", "trending-up"],
  ["chart-decreasing", "trending-down"],
  ["chart-increasing-with-yen", "chart-line"],
  ["bar-chart", "chart-column"],
  ["ledger", "notebook-text"],
  ["notebook", "notebook"],
  ["scroll", "scroll-text"],
  ["gem-stone", "gem"],
  ["balance-scale", "scale"],
  ["briefcase", "briefcase"],
  ["identification-card", "id-card"],
  ["label", "tag"],
  ["classical-building", "landmark"],
  ["office-building", "building"],
  ["house", "house"],
  ["houses", "houses"],
  ["derelict-house", "house"],
  ["factory", "factory"],
  ["department-store", "store"],
  ["convenience-store", "store"],
  ["building-construction", "construction"],
  ["stadium", "users"],
  ["cityscape", "building-complex"],
  ["globe-showing-americas", "earth"],
  ["globe-showing-asia-australia", "earth"],
  ["globe-showing-europe-africa", "earth"],
  ["world-map", "map"],
  ["newspaper", "newspaper"],
  ["rolled-up-newspaper", "newspaper"],
  ["megaphone", "megaphone"],
  ["loudspeaker", "volume-2"],
  ["telephone-receiver", "phone"],
  ["mobile-phone", "smartphone"],
  ["laptop", "laptop"],
  ["envelope", "mail"],
  ["memo", "notepad-text"],
  ["clipboard", "clipboard-list"],
  ["calendar", "calendar"],
  ["spiral-calendar", "calendar-days"],
  ["tear-off-calendar", "calendar-1"],
  ["hourglass-done", "hourglass"],
  ["hourglass-not-done", "hourglass"],
  ["alarm-clock", "alarm-clock"],
  ["stopwatch", "timer"],
  ["key", "key-round"],
  ["old-key", "key"],
  ["locked", "lock"],
  ["unlocked", "lock-open"],
  ["package", "package"],
  ["delivery-truck", "truck"],
  ["shopping-cart", "shopping-cart"],
  ["shopping-bags", "shopping-bag"],
  ["ticket", "ticket"],
  ["light-bulb", "lightbulb"],
  ["magnifying-glass-tilted-left", "search"],
  ["eyes", "eye"],
  ["direct-hit", "target"],
  ["game-die", "dices"],
  ["slot-machine", "dices"],
  ["trophy", "trophy"],
  ["party-popper", "party-popper"],
  ["wrapped-gift", "gift"],
  ["rocket", "rocket"],
  ["airplane", "plane"],
  ["ship", "ship"],
  ["fuel-pump", "fuel"],
  ["oil-drum", "fuel"],
  ["hammer-and-wrench", "wrench"],
  ["gear", "cog"],
  ["battery", "battery-full"],
  ["low-battery", "battery-low"],
  ["link", "link"],
  ["chains", "link-2"],
  ["puzzle-piece", "puzzle"],
  ["bomb", "bomb"],
  ["fire", "flame"],
  ["hot-beverage", "coffee"],
  ["droplet", "droplet"],
  ["snowflake", "snowflake"],
  ["umbrella-with-rain-drops", "umbrella"],
  ["cloud-with-lightning", "cloud-lightning"],
  ["tornado", "tornado"],
  ["sun", "sun"],
  ["rainbow", "rainbow"],
  ["seedling", "sprout"],
  ["deciduous-tree", "tree-deciduous"],
  ["hatching-chick", "egg"],
  ["warning", "triangle-exclamation-point"],
  ["no-entry", "ban"],
  ["stop-sign", "octagon-x"],
  ["check-mark-button", "circle-check"],
  ["cross-mark", "circle-x"],
  ["red-question-mark", "circle-question-mark"],
  ["red-exclamation-mark", "circle-exclamation-point"],
  ["high-voltage", "zap"],
  ["sparkles", "sparkles"],
  ["speech-balloon", "message-circle"],
  ["thought-balloon", "message-circle-more"],
  ["crown", "crown"],
  ["exchange", "arrow-right-left"],
  ["ranking", "list-ordered"],
  ["formula", "sigma"],
  ["story", "book-open"],
  ["lingo", "book-a"],
  ["widget", "shapes"],
];

const NEW_NAMES: Record<string, readonly string[]> = {
  exchange: ["exchange", "convert"],
  ranking: ["ranking", "rank"],
  formula: ["formula", "equation"],
  story: ["story"],
  lingo: ["lingo", "jargon", "term"],
  widget: ["widget"],
};

const entry = (name: string) => (ICON_SET as Record<string, { drawing: string; alt: string; keywords: readonly string[] }>)[name];

describe("the Icon set (A1a)", () => {
  it("is 167 unique kebab-case names: the 161 old emoji names in registry order, then the six Widget kinds", () => {
    expect(TABLE).toHaveLength(167);
    expect(ICON_SET_NAMES).toEqual(TABLE.map(([name]) => name));
    expect(new Set(ICON_SET_NAMES).size).toBe(167);
    for (const n of ICON_SET_NAMES) expect(n).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(ICON_SET_NAMES.slice(161)).toEqual(["exchange", "ranking", "formula", "story", "lingo", "widget"]);
    for (const [name] of TABLE) expect(isIconName(name), name).toBe(true);
    expect(isIconName("pizza-slice")).toBe(false);
    expect(isIconName("toString")).toBe(false);
  });

  it("draws each name with the drawing Appendix A1-T gives it", () => {
    for (const [name, drawing] of TABLE) expect(entry(name)?.drawing, name).toBe(drawing);
    expect(new Set(TABLE.map(([, drawing]) => drawing)).size).toBe(134);
  });

  it("has an alt of 1 to 40 characters and at most 4 words, and at least one keyword, for every name", () => {
    for (const name of ICON_SET_NAMES) {
      const e = entry(name);
      expect(e.alt.length, name).toBeGreaterThanOrEqual(1);
      expect(e.alt.length, name).toBeLessThanOrEqual(40);
      expect(e.alt.split(/\s+/).length, `${name}: "${e.alt}"`).toBeLessThanOrEqual(4);
      expect(e.keywords.length, name).toBeGreaterThan(0);
    }
  });

  it("keeps today's alts, and gives the six new names their own name as alt and the spec's keywords", () => {
    expect(entry("direct-hit")?.alt).toBe("bullseye");
    expect(entry("chart-increasing-with-yen")?.alt).toBe("rising yen chart");
    expect(entry("money-bag")?.alt).toBe("money bag");
    for (const [name, keywords] of Object.entries(NEW_NAMES)) {
      expect(entry(name)?.alt, name).toBe(name);
      expect(entry(name)?.keywords, name).toEqual(keywords);
    }
  });

  it("finds the best match by keyword", () => {
    expect(iconFor("money")).toBe("money-bag");
    expect(iconFor("a speech")).toBe("speech-balloon");
    expect(iconFor("bank")).toBe("bank");
    expect(iconFor("qqqzzz xyzzy")).toBeNull();
  });

  it("has no import, so scripts/check-course.mjs can load it under plain Node", () => {
    const text = readFileSync(join(process.cwd(), "src", "icons", "names.ts"), "utf8");
    expect(text).not.toMatch(/^\s*import\b/m);
    expect(text).not.toMatch(/\bimport\s*\(/);
    expect(text).not.toMatch(/^\s*export\b[^;]*\bfrom\s*["']/m);
    expect(text).not.toMatch(/\brequire\s*\(/);
  });
});
