import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation, type Line } from "./conversation";
import { OldSession } from "./old-session";
import { exploreItem, withExplore, type WidgetItem } from "./widget-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const EXPLORE = {
  code: `root = Widget("Cash now or 30 yearly payments: what the rate decides", [rate, chart])
$rate = 5
rate = Slider("rate", "Interest rate (discount rate)", 0, 10, 0.25, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")`,
};
const TUTOR = `root = Widget("What a home loan costs", [calc])
calc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})`;
const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

function workspace(over: Partial<Parameters<typeof Conversation>[0]> = {}) {
  return renderToStaticMarkup(
    <Conversation initial={[]} summary="You are learning present value." quiz={null} pending={null} review={noReview} place={{ stage: "foundation", title: "Present value" }} {...over} />,
  );
}

const paneStart = (html: string) => html.indexOf('data-testid="widget-pane"');

describe("the explore Widget in the workspace", () => {
  it("opens by itself in the panel as an Explore chip, with the Widget drawn", () => {
    const html = workspace({ explore: EXPLORE });
    const pane = html.slice(paneStart(html));
    expect(pane).toContain('data-testid="explore-chip"');
    expect(pane).toContain(">Explore<");
    expect(pane).toMatch(/aria-pressed="true"[^>]*data-testid="explore-chip"|data-testid="explore-chip"[^>]*aria-pressed="true"/);
    expect(pane).toContain("Interest rate (discount rate)");
  });

  it("shows nothing of it when the Learner has none", () => {
    const html = workspace();
    expect(html).not.toContain("explore-card");
    expect(html).not.toContain("explore-chip");
  });

  it("at an upright-iPad width (below the laptop breakpoint) is a card in the conversation column, and the panel steps aside", () => {
    const html = workspace({ explore: EXPLORE });
    const column = html.slice(0, paneStart(html));
    const card = column.match(/<div class="[^"]*" data-testid="explore-card">/)![0];
    // Shown below lg only, and above the conversation, in the column rather than the panel.
    expect(card).toMatch(/\blg:hidden\b/);
    expect(column).toContain("Explore · Cash now or 30 yearly payments");
    expect(column).toContain("Interest rate (discount rate)");
    const pane = html.slice(paneStart(html));
    // The panel's own copy and chip are hidden below lg, with a line saying where it went.
    expect(pane).toMatch(/data-testid="widget-card" class="[^"]*\bmax-lg:hidden\b/);
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
    expect(html.slice(0, paneStart(html))).toContain("Open: What a home loan costs →");
  });
});

describe("which Widget the panel shows first", () => {
  const tutor = (n: number): WidgetItem => ({ key: `m:${n}`, number: n + 1, code: TUTOR, complete: true });

  it("puts the explore Widget after those the Tutor drew before it began, so it is the newest", () => {
    const list = withExplore([tutor(0), tutor(1)], EXPLORE, 2);
    expect(list.at(-1)).toEqual(exploreItem(EXPLORE.code));
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

  it("shows the same chip and card as the workspace", () => {
    const html = renderToStaticMarkup(<OldSession lines={lines} explore={EXPLORE} />);
    expect(html).toContain('data-testid="explore-chip"');
    expect(html).toContain('data-testid="explore-card"');
    expect(html).toContain("Interest rate (discount rate)");
  });

  it("shows neither for a Session that never reached explore", () => {
    const html = renderToStaticMarkup(<OldSession lines={lines} />);
    expect(html).not.toContain("explore-chip");
    expect(html).not.toContain("explore-card");
  });
});
