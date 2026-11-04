// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { WIDGET_OPENED, writtenAheadFor } from "@/course/written-ahead";
import { Conversation, type Line } from "./conversation";

// Seam 2: a written-ahead Widget the Tutor opened (spec #119, "Widgets › Written-ahead Widgets"), drawn in the Study
// Workspace from the Session item its open_widget call stored, with the code the page worked out from the Topic file
// and the Learner's Case Data. Percent's "One rate change, said three ways" holds no 1994 rate before the reveal.
// Drawn in a browser-like page (happy-dom), as only the browser fills a Widget's starting values into its readouts.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const percent = loadCourseMap().topic("num-percent-bps")!;
const dataset = (points: { date: string; value: number }[]) => ({
  id: "fed-funds-target",
  label: "Federal funds target rate",
  unit: "percent",
  source: "Federal Reserve",
  sourceUrl: "https://www.federalreserve.gov/",
  checkedOn: "2026-10-01",
  points,
});
const beforeReveal: CaseData = { caseId: "fed-hike-1994", asOf: "1994-02-03", revealed: false, datasets: [dataset([{ date: "1994-02-03", value: 3 }])] };
const afterReveal: CaseData = {
  caseId: "fed-hike-1994",
  asOf: "1994-02-03",
  revealed: true,
  datasets: [dataset([{ date: "1994-01-03", value: 3 }, { date: "1994-02-03", value: 3 }, { date: "1994-02-04", value: 3.25 }, { date: "1994-03-22", value: 3.5 }])],
};
const opened: Line[] = [
  { role: "assistant", text: "Here is the Widget for this Topic." },
  { role: "item", kind: WIDGET_OPENED, data: { id: "rate-change-three-ways" } },
  { role: "assistant", text: "Move the old rate first." },
];

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function workspace(cases: CaseData[], initial: Line[] = opened) {
  await act(async () => {
    root.render(
      <Conversation initial={initial} quiz={null} pending={null} review={noReview} place={{ stage: "foundation", title: percent.title }} writtenAhead={writtenAheadFor(percent, cases)} />,
    );
  });
  const pane = host.querySelector('[data-testid="widget-pane"]');
  return { conversation: host.textContent!.slice(0, host.textContent!.indexOf(pane?.textContent ?? "\u0000")), pane: pane?.textContent ?? "", html: pane?.innerHTML ?? "" };
}

describe("a written-ahead Widget opened by the Tutor", () => {
  it("stands as an <title> chip where it was opened, and draws in the panel", async () => {
    const { conversation, pane } = await workspace([beforeReveal]);
    expect(conversation).toMatch(/Here is the Widget for this Topic\.One rate change, said three ways (Showing|View widget →)TutorMove the old rate first\./);
    expect(host.querySelector('[data-testid="widget-card"]')).not.toBeNull();
    expect(pane).toContain("One rate change, said three ways");
  });

  it("is Percent's: old and new rate in 0.01 steps with number boxes, read in points, basis points and percent change", async () => {
    const { pane } = await workspace([beforeReveal]);
    for (const label of ["Old rate", "New rate"]) {
      expect(host.querySelector(`input[type="range"][aria-label="${label}"]`)?.getAttribute("step")).toBe("0.01");
      expect(host.querySelector(`input[type="number"][aria-label="${label}, exact value"]`)).not.toBeNull();
    }
    expect(pane).toContain("In percentage points: 0.2 points");
    expect(pane).toContain("In basis points: 20 bp");
    expect(pane).toContain("As a percent change of the old rate: 4%");
  });

  it("shows no 1994 rate and no 1994 task before the reveal", async () => {
    const { pane } = await workspace([beforeReveal]);
    expect(pane).toContain("Set a rise from 6% to 6.4%");
    expect(pane).not.toMatch(/1994|3\.25|Fed/);
  });

  it("adds the February 1994 task after the reveal, its rates read from Case Data", async () => {
    const { pane } = await workspace([afterReveal]);
    expect(pane).toContain("Set the Fed's move of February 1994: from 3% to 3.25%");
  });

  it("is left out when the Topic file no longer has it, and draws nothing in its place", async () => {
    const { conversation, pane } = await workspace([beforeReveal], [{ role: "item", kind: WIDGET_OPENED, data: { id: "gone" } }]);
    expect(conversation).not.toContain("Open:");
    expect(pane).toContain("Widgets for this Topic will appear here.");
  });

  it("replaces a Tutor-drawn growth-rate calculator the server sent back with the written-ahead Widget, as the turn streams", async () => {
    const cagr = [
      "```openui-lang",
      'root = Widget("One rate move, two ways to describe it", [rate, calc, steps])',
      "$rate = 4",
      'rate = Slider("rate", "New rate", 0, 10, 0.01, $rate, "percent")',
      'calc = Calculator("cagr", {start: 4, end: $rate, years: 1})',
      "steps = GuidedTasks([up])",
      'up = GuidedTask("Set the new rate to 6%", $rate == 6)',
      "```",
    ].join("\n");
    const events = [
      { type: "text", text: `Here is a box.\n${cagr}` },
      { type: "correction", widgets: [0], leaveOut: [0] },
      { type: "item", item: { kind: WIDGET_OPENED, data: { id: "rate-change-three-ways", title: "One rate change, said three ways" } } },
      { type: "done", stopReason: "end_turn", ref: { sessionId: 1, turnSeq: 0 } },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/turn" ? new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { status: 200 }) : new Response("{}", { status: 200 }),
      ),
    );
    await act(async () => {
      root.render(
        <Conversation initial={[]} quiz={null} pending={null} review={noReview} shown={{ topicId: "num-percent-bps" }} writtenAhead={writtenAheadFor(percent, [beforeReveal])} />,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const shown = host.textContent!;
    expect(shown).toContain("Here is a box.");
    expect(shown).toContain("One rate change, said three ways");
    expect(shown).not.toContain("One rate move, two ways to describe it");
  });
});
