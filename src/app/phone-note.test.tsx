import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";
import { PHONE_NOTE, SignedInFrame } from "./ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Phone note (#48): below 768px a signed-in page shows one line instead of the workspace. The width
// switch itself is CSS; these check what a person sees in the markup.
const widget = ["```openui-lang", 'root = Widget("Pick a rate", [rate])', "$rate = 3", 'rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")', "```"].join("\n");

describe("phone note", () => {
  it("tells a phone visitor the workspace needs a bigger screen", () => {
    const html = renderToStaticMarkup(
      <SignedInFrame>
        <p>Workspace</p>
      </SignedInFrame>,
    );
    expect(html).toContain("The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.");
    expect(PHONE_NOTE).toContain("bigger screen");
  });

  it("shows a chip in the chat and never the Widget body, at any width", () => {
    const html = renderToStaticMarkup(
      <Conversation initial={[{ role: "assistant", text: `Try it.\n\n${widget}` }]} quiz={null} pending={null} review={{ question: null, dueCount: 0, done: 0, cap: 5 }} />,
    );
    const chat = html.slice(0, html.indexOf('data-testid="widget-pane"'));
    expect(chat).toContain("Open: Pick a rate →");
    expect(chat).not.toContain("Discount rate");
  });
});
