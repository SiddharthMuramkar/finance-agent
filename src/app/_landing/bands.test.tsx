// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadCourseMap } from "@/course/map";
import { TopicBar } from "../workspace-parts";
import { AboutView } from "./about";
import { homeAnnuity } from "./home-widget-data";
import { LandingView } from "./landing";
import { loadShowcases } from "./showcase-widgets";

// Spec 2026-11-12 F1, until #17 lands (ADR 0015 replaces the royal Band): a Band is a full-width royal surface, and two Bands never touch: between any two there is
// a reading area with something in it. Checked on the markup of every page that has more than one (Home and About, signed
// in and out); the browser test in e2e/affordance.spec.ts checks the drawn boxes on every page of the preview matrix.

vi.mock("@/auth/session", () => ({ currentLearnerId: async () => 1, isSignedIn: async () => false }));

const BANDS = ".band, .home-band";

/** The Bands of a page in document order, and for each pair in a row whether anything readable stands between them. */
function bandsApart(html: string): { bands: number; touching: string[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const bands = [...doc.querySelectorAll<HTMLElement>(BANDS)].filter((el) => !el.parentElement?.closest(BANDS));
  const touching: string[] = [];
  const name = (el: Element) => el.getAttribute("data-band") ?? el.getAttribute("data-testid") ?? el.className.split(" ")[0];
  for (let i = 1; i < bands.length; i++) {
    const [a, b] = [bands[i - 1], bands[i]];
    // Walk every node after `a` ends and before `b` starts (the reading area between them, if any): words, or a
    // picture or Widget, make it readable.
    const walker = doc.createTreeWalker(doc.body, 0xffffffff);
    walker.currentNode = a;
    let readable = false;
    for (let node = walker.nextNode(); node && node !== b; node = walker.nextNode()) {
      if (a.contains(node)) continue;
      if (node.nodeType === 3 && (node.textContent ?? "").trim()) readable = true;
      if (node.nodeType === 1 && (node as Element).matches("img, svg, video, canvas, [data-widget-content]")) readable = true;
      if (readable) break;
    }
    if (!readable) touching.push(`${name(a)} touches ${name(b)}`);
  }
  return { bands: bands.length, touching };
}

const stats = { topics: 95, subjects: 9, cases: 103 };
const widget = { annuity: homeAnnuity(loadCourseMap())!, cases: [] };
const showcases = loadShowcases();
const aboutWidgets = showcases.filter((s) => s.area === "everyday" || s.area === "economy");

describe("two Bands never touch [F1]", () => {
  it("finds two Bands in a row with nothing between them (the check can fail)", () => {
    expect(bandsApart('<section class="band">a</section><section class="home-band">b</section>').touching).toEqual(["band touches home-band"]);
    expect(bandsApart('<section class="band">a</section><div><hr/></div><section class="band">b</section>').touching).toHaveLength(1);
    expect(bandsApart('<section class="band">a</section><p>words</p><section class="band">b</section>').touching).toEqual([]);
  });

  for (const [page, html] of [
    ["Home, signed out", renderToStaticMarkup(<LandingView stats={stats} widget={widget} showcases={showcases} />)],
    ["Home, signed in", renderToStaticMarkup(<LandingView stats={stats} widget={widget} showcases={showcases} button={{ kind: "open" }} />)],
    ["About, signed out", renderToStaticMarkup(<AboutView stats={stats} widgets={aboutWidgets} />)],
    ["About, signed in", renderToStaticMarkup(<AboutView stats={stats} widgets={aboutWidgets} signedIn />)],
  ] as const) {
    it(`${page}: no two Bands touch`, () => {
      const { bands, touching } = bandsApart(html);
      expect(bands).toBeGreaterThan(0);
      expect(touching).toEqual([]);
    });
  }

  it("Home shows three Bands, the hero, How every Topic works and the closing, signed in and out (E1, F1)", () => {
    for (const button of [undefined, { kind: "open" as const }]) {
      const html = renderToStaticMarkup(<LandingView stats={stats} widget={widget} showcases={showcases} button={button} />);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const bands = [...doc.querySelectorAll(BANDS)].filter((el) => !el.parentElement?.closest(BANDS));
      expect(bands.map((b) => b.getAttribute("data-band") ?? b.className.split(" ")[0])).toEqual(["home-hero", "home-how-it-works", "home-band"]);
      expect(bands[0].querySelector("h1")?.textContent).toBe("Learn what things are worth.");
    }
  });

  it("About opens on a Band and closes on one (E11)", () => {
    const html = renderToStaticMarkup(<AboutView stats={stats} widgets={aboutWidgets} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const bands = [...doc.querySelectorAll(BANDS)];
    expect(bands.map((b) => b.getAttribute("data-band") ?? b.className.split(" ")[0])).toEqual(["about-opening", "home-band"]);
    expect(bands[0].querySelector("h1")?.textContent).toBe("About Value It");
  });

  it("the Topic bar is one Band, with nothing else of the Study Workspace on it", () => {
    const html = renderToStaticMarkup(<TopicBar title="Percent" goal="Name its base." strip={null} marked={new Set()} topicId="percent" />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll(BANDS)).toHaveLength(1);
    expect(doc.querySelector(BANDS)?.getAttribute("data-testid")).toBe("topic-bar");
  });
});
