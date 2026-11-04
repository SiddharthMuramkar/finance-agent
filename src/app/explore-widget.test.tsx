import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation, type Line } from "./conversation";
import { OldSession } from "./old-session";
import { exploreItem, NarrowScreen, withExplore, type WidgetItem } from "./widget-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const EXPLORE = {
  id: "cash-or-payments",
  code: `root = Widget("Cash now or 30 yearly payments: what the rate decides", [rate, chart])
$rate = 5
rate = Slider("rate", "Interest rate (discount rate)", 0, 10, 0.25, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")`,
};
const TUTOR = `root = Widget("What a home loan costs", [calc])
calc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})`;
const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

function workspace(over: Partial<Parameters<typeof Conversation>[0]> = {}, narrow = false) {
  const page = (
    <Conversation initial={[]} quiz={null} pending={null} review={noReview} place={{ stage: "foundation", title: "Present value" }} {...over} />
  );
  return renderToStaticMarkup(narrow ? <NarrowScreen>{page}</NarrowScreen> : page);
}

/** How many times the explore Widget is drawn on the page: one slider per copy. */
const copies = (html: string) => html.split('aria-label="Interest rate (discount rate)"').length - 1;

const paneStart = (html: string) => html.indexOf('data-testid="widget-pane"');

describe("the explore Widget in the workspace", () => {
  it("opens by itself in the panel as an Explore chip, with the Widget drawn", () => {
    const html = workspace({ explore: EXPLORE });
    const pane = html.slice(paneStart(html));
    expect(pane).toContain('data-testid="explore-chip"');
    expect(pane).toContain(">Explore<");
    expect(pane).toMatch(/aria-selected="true"[^>]*data-testid="explore-chip"/);
    expect(pane).toContain("Interest rate (discount rate)");
  });

  it("shows nothing of it when the Learner has none", () => {
    const html = workspace();
    expect(html).not.toContain("explore-card");
    expect(html).not.toContain("explore-chip");
  });

  it("is mounted once at a laptop width: in the panel, with no hidden copy in the conversation column", () => {
    const html = workspace({ explore: EXPLORE });
    expect(copies(html)).toBe(1);
    expect(html).not.toContain("explore-card");
    expect(copies(html.slice(paneStart(html)))).toBe(1);
  });

  it("at an upright-iPad width (below the laptop breakpoint) is a card in the conversation column, and the panel steps aside", () => {
    const html = workspace({ explore: EXPLORE }, true);
    expect(copies(html)).toBe(1);
    const column = html.slice(0, paneStart(html));
    expect(column).toContain('data-testid="explore-card"');
    expect(column).toContain("Explore · Cash now or 30 yearly payments");
    expect(column).toContain("Interest rate (discount rate)");
    const pane = html.slice(paneStart(html));
    // The panel draws no copy of its own and says where it went; its chip is hidden below lg.
    expect(pane).not.toContain("Interest rate (discount rate)");
    expect(pane).toMatch(/class="[^"]*max-lg:hidden[^"]*"[^>]*data-testid="explore-chip"|data-testid="explore-chip"[^>]*max-lg:hidden/);
    expect(pane).toContain("The Explore Widget is in the conversation");
  });

  it("is the same after a reload: it comes from saved progress, not from the conversation", () => {
    const initial: Line[] = [{ role: "assistant", text: "Welcome back." }];
    expect(workspace({ explore: EXPLORE, initial })).toBe(workspace({ explore: EXPLORE, initial }));
    expect(workspace({ explore: EXPLORE, initial })).toContain('data-testid="explore-chip"');
  });

  it("keeps the Tutor's own Widgets chipped by title in the conversation", () => {
    const initial: Line[] = [{ role: "assistant", text: `Here.\n\n${fence(TUTOR)}\n\nTry it.` }];
    const html = workspace({ explore: EXPLORE, initial });
    expect(html.slice(0, paneStart(html))).toContain("What a home loan costs");
  });
});

describe("which Widget the panel shows first", () => {
  const tutor = (n: number): WidgetItem => ({ key: `m:${n}`, number: n + 1, code: TUTOR, complete: true });

  it("puts the explore Widget after those the Tutor drew before it began, so it is the newest", () => {
    const list = withExplore([tutor(0), tutor(1)], EXPLORE, 2);
    expect(list.at(-1)).toEqual(exploreItem(EXPLORE.code, undefined, EXPLORE.id));
  });

  it("lets a newer Widget from the Tutor take over", () => {
    const list = withExplore([tutor(0), tutor(1), tutor(2)], EXPLORE, 2);
    expect(list.map((w) => w.key)).toEqual(["m:0", "m:1", "explore", "m:2"]);
    expect(list.at(-1)!.key).toBe("m:2");
  });

  it("leaves the Tutor's Widgets alone when there is no explore Widget", () => {
    expect(withExplore([tutor(0)], null, 1)).toEqual([tutor(0)]);
  });
});

describe("the explore Widget in an old Session", () => {
  const lines: Line[] = [{ role: "assistant", text: "Let us explore." }];

  it("shows the same chip as the workspace, and the Widget once, in the panel or (below the laptop width) as a card", () => {
    const html = renderToStaticMarkup(<OldSession lines={lines} explore={EXPLORE} />);
    expect(html).toContain('data-testid="explore-chip"');
    expect(copies(html)).toBe(1);
    const narrow = renderToStaticMarkup(
      <NarrowScreen>
        <OldSession lines={lines} explore={EXPLORE} />
      </NarrowScreen>,
    );
    expect(narrow).toContain('data-testid="explore-card"');
    expect(copies(narrow)).toBe(1);
  });

  it("shows neither for a Session that never reached explore", () => {
    const html = renderToStaticMarkup(<OldSession lines={lines} />);
    expect(html).not.toContain("explore-chip");
    expect(html).not.toContain("explore-card");
  });
});
