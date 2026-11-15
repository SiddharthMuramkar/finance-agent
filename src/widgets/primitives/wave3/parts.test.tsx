// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allById, byId, click, draw, key, stubReducedMotion, type Page } from "../wave1/test-kit";
import { ChoiceCardsView } from "./choice-cards";
import { HeadlineView } from "./headline";
import { LingoCardView } from "./lingo-card";
import { MoneyJarView } from "./money-jar";
import { MythOrFactView } from "./myth-or-fact";
import { StorySceneView } from "./story-scene";
import { TimelineStripView } from "./timeline-strip";
import { TwoPathsView } from "./two-paths";
import { WhoPaysWhomView } from "./who-pays-whom";

// Story parts (wave 3), ticket E2a: each part's behaviour, reduced motion and keyboard.

let page: Page | null = null;
const show = (element: ReactElement) => (page = draw(element));
const text = () => page!.host.textContent ?? "";

const scene = (
  <StorySceneView
    cast={[
      { id: "bank", emoji: "bank", name: "The bank", role: "lender" },
      { id: "kid", emoji: "student", name: "Asha" },
    ]}
    beats={[
      { who: "narrator", says: "It is February." },
      { who: "bank", says: "We raise the rate." },
      { who: "kid", says: "My loan costs more." },
    ]}
    caption="A rate rise"
    date="1994-02-03"
  />
);
const lingo = <LingoCardView term="Yield" pro="the yield" means="The income a bond pays each year." example="Rent on a flat." emoji="house" inStory="In the story, the yield rose." />;
const timeline = (
  <TimelineStripView
    beats={[
      { date: "1994-02-03", label: "Rates rise", emoji: "chart-increasing" },
      { date: "1994-05-09", label: "Bonds crash", emoji: "chart-decreasing" },
      { date: "1992-01-01", label: "Calm before", emoji: "sun" },
    ]}
    hideAfter="1994-02-03"
  />
);
const paths = (
  <TwoPathsView
    question="Who kept the house?"
    left={{ emoji: "man", name: "Ravi", choice: "Sold early", outcome: ["house", "house"], outcomeLine: "Ravi kept both houses" }}
    right={{ emoji: "woman", name: "Mira", choice: "Held on", outcome: ["house"], outcomeLine: "Mira lost one house" }}
  />
);
const jar = <MoneyJarView label="Savings" start={3} end={6} unit="coin" words="about twice as full" each="each coin is ₹1 lakh" />;

const payers = (
  <WhoPaysWhomView
    actors={[
      { id: "bank", emoji: "bank", name: "The bank" },
      { id: "saver", emoji: "woman", name: "The saver" },
    ]}
    flows={[
      { from: "bank", to: "saver", what: "interest", emoji: "money-bag" },
      { from: "saver", to: "bank", what: "a deposit", emoji: "coin" },
    ]}
  />
);
const cards = [
  { claim: "Bond prices fall when rates rise.", isFact: true, why: "Old bonds pay less than new ones.", emoji: "chart-decreasing" },
  { claim: "A bank never fails.", isFact: false, why: "Some banks have failed." },
];
const MythOrFactTest = ({ picks = [] as (string | null)[], onPick = () => {} }) => <MythOrFactView cards={cards} picks={picks} onPick={onPick} />;
const myth = <MythOrFactTest />;
const headline = <HeadlineView paper="The morning paper" date="1994-02-04" headline="Central bank tightens pressure on reserve positions" deck="An imagined front page. No number was announced; traders read one in." source="https://www.federalreserve.gov/fomc/19940204default.htm" />;
const choiceCards = (picked: string | null, onPick: (id: string) => void = () => {}) => (
  <ChoiceCardsView
    question="Why did the bonds lose value?"
    choices={[
      { id: "a", text: "Rates rose", emoji: "chart-increasing" },
      { id: "b", text: "Rates fell", fix: "When rates fall, old bonds gain value." },
    ]}
    answer="a"
    picked={picked}
    onPick={onPick}
  />
);
const choice = choiceCards(null);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  stubReducedMotion(false);
});
afterEach(() => {
  page?.cleanup();
  page = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StoryScene", () => {
  it("shows beat 1, then Next beat gives beat 2, the arrow key beat 3, and the last shows Replay", () => {
    show(scene);
    expect(byId(page!, "story-bubble")!.textContent).toContain("It is February.");
    expect(text()).toContain("3 Feb 1994");
    click(byId(page!, "story-next"));
    expect(byId(page!, "story-bubble")!.textContent).toContain("We raise the rate.");
    key(byId(page!, "story-scene"), "ArrowRight");
    expect(byId(page!, "story-bubble")!.textContent).toContain("My loan costs more.");
    expect(byId(page!, "story-next")).toBeNull();
    expect(byId(page!, "story-replay")!.textContent).toBe("Replay");
    key(byId(page!, "story-scene"), "ArrowLeft");
    expect(byId(page!, "story-bubble")!.textContent).toContain("We raise the rate.");
    key(byId(page!, "story-scene"), "ArrowRight");
    click(byId(page!, "story-replay"));
    expect(byId(page!, "story-bubble")!.textContent).toContain("It is February.");
  });

  it("draws the cast as decorative Icons, each named by the words under it (A1b, GLOSSARY Story scene)", () => {
    show(scene);
    const members = [...page!.host.querySelectorAll<HTMLElement>('ul[aria-label="Cast"] li')];
    expect(members).toHaveLength(2);
    expect(members.map((li) => li.querySelectorAll('svg[data-icon][aria-hidden="true"]').length)).toEqual([1, 1]);
    expect(members.map((li) => li.querySelector("svg[aria-label]"))).toEqual([null, null]);
    expect(members[0].textContent).toContain("The bank");
    expect(members[1].textContent).toContain("Asha");
  });

  it("announces each beat politely", () => {
    show(scene);
    expect(byId(page!, "story-bubble")!.closest("[aria-live]")!.getAttribute("aria-live")).toBe("polite");
  });

  // #528: in the Widget panel (the size container named pane) the stage grows with the panel's height, centred, and
  // the cast grows from its 32/40 px floor to 40 px, then 48 px in a tall panel (A1b, ADR 0015).
  it("grows its stage and cast with the Widget panel's height", () => {
    show(scene);
    const stage = byId(page!, "story-stage")!.className;
    expect(stage).toContain("flex-col");
    expect(stage).toContain("justify-center");
    expect(stage).toContain("[@container_pane_(min-height:480px)]:min-h-[55cqh]");
    const cast = page!.host.querySelector('ul[aria-label="Cast"] li > span')!.className;
    for (const size of ["[&_svg]:size-8", "@min-[720px]:[&_svg]:size-10", "[@container_pane_(min-height:480px)]:[&_svg]:size-10", "[@container_pane_(min-height:640px)]:[&_svg]:size-12"]) {
      expect(cast).toContain(size);
    }
    click(byId(page!, "story-next"));
    const speaker = page!.host.querySelector('[data-speaking="true"]')!.className;
    expect(speaker).toContain("border-[var(--sun)]");
    expect(page!.host.querySelector('[class*="story-bounce"]')).toBeNull();
  });

  // Spec 2026-11-12 B8: in a wide scene two to five beats show together with no Back or Next; a narrow scene steps.
  // happy-dom applies no container queries, so these read the classes that switch the two forms.
  const sceneOf = (count: number) => (
    <StorySceneView
      cast={[
        { id: "bank", emoji: "bank", name: "The bank" },
        { id: "kid", emoji: "student", name: "Asha" },
      ]}
      beats={Array.from({ length: count }, (_, i) => ({ who: i % 2 ? "kid" : "bank", says: `Line ${i + 1}.` }))}
    />
  );

  for (const count of [2, 3, 5]) {
    it(`with ${count} beats, lists every beat in the wide form and keeps the stepped form for a narrow scene (B8)`, () => {
      show(sceneOf(count));
      expect(byId(page!, "story-scene")!.getAttribute("data-together")).toBe("true");
      expect(byId(page!, "story-scene")!.className).toContain("@container");
      const list = byId(page!, "story-beats")!;
      expect(list.tagName).toBe("OL");
      // Shown from 520 px of the scene's width, display: none (so out of the accessibility tree) below it.
      expect(list.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "@min-[520px]:flex"]));
      const items = allById(page!, "story-beat");
      expect(items.map((li) => li.textContent)).toEqual(Array.from({ length: count }, (_, i) => `${i % 2 ? "Asha" : "The bank"}Line ${i + 1}.`));
      // The bubble, Back, Next and the counter are display: none from 520 px, and unchanged below it.
      expect(byId(page!, "story-stepped")!.className.split(" ")).toContain("@min-[520px]:hidden");
      expect(byId(page!, "story-stepped")!.getAttribute("aria-live")).toBe("polite");
      const controls = byId(page!, "story-controls")!;
      expect(controls.className.split(" ")).toContain("@min-[520px]:hidden");
      expect(controls.contains(byId(page!, "story-back"))).toBe(true);
      expect(controls.contains(byId(page!, "story-next"))).toBe(true);
      expect(controls.textContent).toContain(`1 of ${count}`);
      // No speaker is ringed while every beat shows.
      expect(page!.host.querySelector('[data-speaking="true"]')!.className).toContain("@min-[520px]:border-[var(--rule)]");
    });
  }

  it("with 6 beats, keeps stepping at every width and steps through all six (B8: two to five lines)", () => {
    show(sceneOf(6));
    expect(byId(page!, "story-scene")!.getAttribute("data-together")).toBeNull();
    expect(byId(page!, "story-beats")).toBeNull();
    expect(byId(page!, "story-stepped")!.className).not.toContain("@min-[520px]");
    expect(byId(page!, "story-controls")!.className).not.toContain("@min-[520px]");
    expect(page!.host.querySelector('[data-speaking="true"]')!.className).not.toContain("@min-[520px]");
    expect(byId(page!, "story-controls")!.textContent).toContain("1 of 6");
    for (let i = 0; i < 5; i++) click(byId(page!, "story-next"));
    expect(byId(page!, "story-bubble")!.textContent).toContain("Line 6.");
    expect(byId(page!, "story-replay")).not.toBeNull();
  });

  it("with 1 beat, keeps the stepped form (B8 covers two to five)", () => {
    show(sceneOf(1));
    expect(byId(page!, "story-beats")).toBeNull();
    expect(byId(page!, "story-controls")!.className).not.toContain("@min-[520px]");
  });

  it("does not play the list's fade under reduced motion", () => {
    stubReducedMotion(true);
    show(sceneOf(3));
    expect(byId(page!, "story-beats")!.className).not.toContain("story-step");
  });
});

describe("LingoCard", () => {
  it("flips with In the story, toggling aria-pressed and showing the inStory text", () => {
    show(lingo);
    const flip = byId(page!, "lingo-flip")!;
    expect(flip.getAttribute("aria-pressed")).toBe("false");
    expect(byId(page!, "lingo-back")!.getAttribute("aria-hidden")).toBe("true");
    expect(text()).toContain("Say it like a pro: the yield");
    click(flip);
    expect(flip.getAttribute("aria-pressed")).toBe("true");
    expect(byId(page!, "lingo-back")!.getAttribute("aria-hidden")).toBe("false");
    expect(byId(page!, "lingo-back")!.textContent).toContain("In the story, the yield rose.");
    expect(byId(page!, "lingo-front")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("TimelineStrip", () => {
  it("puts the oldest on the left and draws a beat after hideAfter locked, without its label", () => {
    show(timeline);
    const markers = [...page!.host.querySelectorAll<HTMLElement>('[data-testid="timeline-marker"]')];
    expect(markers).toHaveLength(3);
    expect(markers.map((m) => m.dataset.locked)).toEqual(["false", "false", "true"]);
    expect(text()).not.toContain("Bonds crash");
    expect(text()).not.toContain("1994-05-09");
    click(markers[2]);
    expect(byId(page!, "timeline-label")!.textContent).toContain("After the story's date");
    expect(text()).not.toContain("Bonds crash");
    click(markers[0]);
    expect(byId(page!, "timeline-label")!.textContent).toContain("Calm before");
  });

  it("the timeline marks its story in sunflower only as its line", () => {
    show(timeline);
    expect(byId(page!, "timeline-line-story")!.className).toContain("bg-[var(--sun)]");
    expect(page!.host.innerHTML).not.toMatch(/var\(--(mint|coral|violet)\)/);
    expect(page!.host.querySelector("[data-key-figure]")).toBeNull();
  });
});

describe("TwoPaths", () => {
  it("hides each outcome until its button is pressed", () => {
    show(paths);
    expect(text()).not.toContain("Ravi kept both houses");
    const buttons = [...page!.host.querySelectorAll<HTMLButtonElement>('[data-testid="path-reveal"]')];
    expect(buttons).toHaveLength(2);
    click(buttons[0]);
    expect(text()).toContain("Ravi kept both houses");
    expect(page!.host.querySelectorAll('[data-testid="path-outcome"] svg[data-icon]')).toHaveLength(2);
    expect(text()).not.toContain("Mira lost one house");
  });

  it("tells the sides apart by place and name, not by accent: both are a story, in sunflower (Appendix A)", () => {
    show(paths);
    for (const b of page!.host.querySelectorAll<HTMLButtonElement>('[data-testid="path-reveal"]')) click(b);
    const html = page!.host.innerHTML;
    expect(html).not.toMatch(/var\(--(mint|coral|violet)[^)]*\)/);
    const sides = [...page!.host.querySelectorAll<HTMLElement>('[data-testid="path"]')];
    expect(sides[0].className).toBe(sides[1].className);
  });
});

describe("MoneyJar", () => {
  it("renders the end number of objects and no numerals outside each", () => {
    show(jar);
    expect(page!.host.querySelectorAll('[data-testid="jar"] svg[data-icon]')).toHaveLength(6);
    const each = byId(page!, "jar-each")!;
    const without = (page!.host.textContent ?? "").replace(each.textContent ?? "", "");
    expect(without.match(/\d/g)).toBeNull();
    expect(each.textContent).toContain("₹1 lakh");
  });

  it("keeps the emptied objects only while they leave", () => {
    show(<MoneyJarView label="Savings" start={6} end={3} unit="coin" words="half as full" />);
    expect(page!.host.querySelectorAll('[data-testid="jar"] svg[data-icon]')).toHaveLength(6);
    expect(page!.host.querySelectorAll('[data-leaving="true"]')).toHaveLength(3);
  });

  it("keeps only the end objects under reduced motion", () => {
    stubReducedMotion(true);
    show(<MoneyJarView label="Savings" start={6} end={3} unit="coin" words="half as full" />);
    expect(page!.host.querySelectorAll('[data-testid="jar"] svg[data-icon]')).toHaveLength(3);
  });
});

describe("WhoPaysWhom", () => {
  it("lists one li per flow, as the screen-reader text", () => {
    show(payers);
    const items = [...page!.host.querySelectorAll("ol li")];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("The bank pays the saver: interest");
  });

  it("each row carries a visible Replay cue", () => {
    show(payers);
    const cues = [...page!.host.querySelectorAll('[data-testid="flow-replay"]')];
    expect(cues).toHaveLength(2);
    expect(cues[0].textContent).toContain("Replay");
  });

  it("a tap on a flow replays it", () => {
    show(payers);
    const flow = page!.host.querySelector<HTMLElement>('[data-testid="flow"]')!;
    const before = flow.getAttribute("data-run");
    click(flow);
    expect(flow.getAttribute("data-run")).not.toBe(before);
  });

  it("says what is wrong when a flow names an actor that is not there", () => {
    show(<WhoPaysWhomView actors={[{ id: "a", emoji: "bank", name: "Bank" }, { id: "b", emoji: "man", name: "Man" }]} flows={[{ from: "a", to: "zzz", what: "x", emoji: "coin" }]} />);
    expect(byId(page!, "who-pays-whom-problem")).not.toBeNull();
  });
});

describe("MythOrFact", () => {
  it("a tap on Myth for a fact card shows Fact and the why", () => {
    const onPick = vi.fn();
    show(<MythOrFactTest onPick={onPick} />);
    click(page!.host.querySelectorAll<HTMLElement>('[data-testid="myth-button"]')[0]);
    expect(onPick).toHaveBeenCalledWith(0, "myth");
    page!.cleanup();
    show(<MythOrFactTest picks={["myth", null]} />);
    const first = page!.host.querySelectorAll<HTMLElement>('[data-testid="myth-card"]')[0];
    expect(first.dataset.verdict).toBe("wrong");
    expect(first.textContent).toContain("Fact");
    expect(first.textContent).toContain("Old bonds pay less than new ones.");
  });

  it("a right pick is marked right, and the second card stays open", () => {
    show(<MythOrFactTest picks={["myth", "myth"]} />);
    const all = [...page!.host.querySelectorAll<HTMLElement>('[data-testid="myth-card"]')];
    expect(all.map((c) => c.dataset.verdict)).toEqual(["wrong", "right"]);
  });
});

describe("Headline", () => {
  it("renders the date in full and links the source", () => {
    show(headline);
    expect(text()).toContain("4 February 1994");
    expect(text()).toContain("The morning paper");
    const link = page!.host.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toBe("Source");
    expect(link.getAttribute("href")).toBe("https://www.federalreserve.gov/fomc/19940204default.htm");
  });

  it("does not link a source that is not an http address", () => {
    show(<HeadlineView paper="Paper" date="1994-02-03" headline="Rates rise" source="javascript:alert(1)" />);
    expect(page!.host.querySelector("a")).toBeNull();
  });
});

describe("ChoiceCards", () => {
  it("a wrong pick shows the fix in a status region", () => {
    show(choiceCards("b"));
    expect(page!.host.querySelector('[role="status"]')!.textContent).toContain("When rates fall, old bonds gain value.");
  });

  it("a right pick says Yes", () => {
    show(choiceCards("a"));
    expect(page!.host.querySelector('[role="status"]')!.textContent).toContain("Yes");
  });

  it("a wrong pick may be followed by another", () => {
    const onPick = vi.fn();
    show(choiceCards("b", onPick));
    click(page!.host.querySelectorAll<HTMLElement>('[data-testid="choice"]')[0]);
    expect(onPick).toHaveBeenCalledWith("a");
  });
});

describe("reduced motion", () => {
  const cases: [string, ReactElement, string][] = [
    ["story-scene", scene, "story-scene"],
    ["lingo-card", lingo, "lingo-card"],
    ["timeline-strip", timeline, "timeline-strip"],
    ["two-paths", paths, "two-paths"],
    ["money-jar", jar, "money-jar"],
    ["who-pays-whom", payers, "who-pays-whom"],
    ["myth-or-fact", myth, "myth-or-fact"],
    ["headline", headline, "headline"],
    ["choice-cards", choice, "choice-cards"],
  ];
  for (const [name, element, testId] of cases) {
    it(`${name} sets data-motion off and starts no animation`, () => {
      const animate = vi.fn();
      Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
      stubReducedMotion(true);
      show(element);
      const root = byId(page!, testId)!;
      expect(root.getAttribute("data-motion")).toBe("off");
      const first = page!.host.querySelector<HTMLElement>("button:not([disabled])");
      if (first) click(first);
      expect(animate).not.toHaveBeenCalled();
      expect(root.getAttribute("data-motion")).toBe("off");
      delete (Element.prototype as { animate?: unknown }).animate;
    });
  }

  it("says motion is on when the Learner has not asked for less", () => {
    show(scene);
    expect(byId(page!, "story-scene")!.getAttribute("data-motion")).toBe("on");
  });
});

describe("keyboard", () => {
  it("every control is a button that Tab reaches", () => {
    for (const element of [scene, lingo, paths, jar, payers, myth, choice]) {
      show(element);
      const controls = [...page!.host.querySelectorAll<HTMLElement>("button, [role=button], a, input")];
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls.filter((el) => !(el as HTMLButtonElement).disabled)) {
        expect(c.tagName).toBe("BUTTON");
        expect(c.tabIndex).toBeGreaterThanOrEqual(0);
      }
      page!.cleanup();
      page = null;
    }
  });

  it("Headline has one control, a link reachable by Tab", () => {
    show(headline);
    const controls = [...page!.host.querySelectorAll<HTMLElement>("button, [role=button], a, input")];
    expect(controls.map((c) => c.tagName)).toEqual(["A"]);
    expect(controls[0].tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("TimelineStrip is one tab stop that moves with the arrow keys", () => {
    show(timeline);
    const markers = [...page!.host.querySelectorAll<HTMLElement>('[data-testid="timeline-marker"]')];
    expect(markers.map((m) => m.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(markers.map((m) => m.tabIndex)).toEqual([0, -1, -1]);
    key(markers[0], "ArrowRight");
    expect(markers.map((m) => m.tabIndex)).toEqual([-1, 0, -1]);
    expect(byId(page!, "timeline-label")!.textContent).toContain("Rates rise");
    key(markers[1], "ArrowLeft");
    expect(markers.map((m) => m.tabIndex)).toEqual([0, -1, -1]);
    key(markers[0], "End");
    expect(markers.map((m) => m.tabIndex)).toEqual([-1, -1, 0]);
  });
});

describe("no key figure: the answer is the picture or the story (A9b, guard)", () => {
  for (const [name, view] of [["TimelineStrip", timeline], ["TwoPaths", paths], ["MoneyJar", jar]] as const) {
    it(`${name} carries no [data-key-figure], at rest or after its first press`, () => {
      show(view);
      expect(page!.host.querySelector("[data-key-figure]")).toBeNull();
      click(page!.host.querySelector("button"));
      expect(page!.host.querySelector("[data-key-figure]")).toBeNull();
    });
  }
});

describe("right and wrong are status, never a tinted card (A9c)", () => {
  it("a wrong Myth turns its verdict line to the danger status, with an Icon, and no card is tinted", () => {
    show(<MythOrFactTest picks={["myth", null]} />);
    const card = page!.host.querySelectorAll<HTMLElement>('[data-testid="myth-card"]')[0];
    expect(card.dataset.verdict).toBe("wrong");
    const verdict = card.querySelector<HTMLElement>('[role="status"] p')!;
    expect(verdict.className).toContain("text-[var(--danger)]");
    expect(verdict.querySelectorAll("svg")).toHaveLength(1);
    for (const c of page!.host.querySelectorAll('[data-testid="myth-card"]')) expect(c.getAttribute("class")).not.toContain("-tint");
    expect(page!.host.innerHTML).not.toMatch(/-tint\)/);
  });

  it("a right ChoiceCards pick says so in the success status, with an Icon, on a pressed card with no face of its own", () => {
    show(choiceCards("a"));
    const status = byId(page!, "choice-status")!;
    const line = status.querySelector<HTMLElement>('[class*="text-[var(--success)]"]');
    expect(line, "the success status line").not.toBeNull();
    expect(line!.querySelectorAll("svg")).toHaveLength(1);
    const picked = [...page!.host.querySelectorAll<HTMLElement>('[data-testid="choice"]')].find((c) => c.getAttribute("aria-pressed") === "true")!;
    expect(picked.textContent).toContain("Rates rose");
    expect(picked.style.getPropertyValue("--face")).toBe("");
    expect(picked.getAttribute("style") ?? "").not.toContain("--face");
    expect(page!.host.innerHTML).not.toMatch(/-tint\)/);
  });

  it("the Headline is in the one font at the kit's weights, and its headline is the key figure (guard)", () => {
    show(headline);
    expect(page!.host.innerHTML).not.toMatch(/font-(serif|black|bold)/);
    expect(page!.host.querySelector("h3")!.hasAttribute("data-key-figure")).toBe(true);
  });
});
