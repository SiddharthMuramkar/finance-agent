import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The chat at every width (#48; spec #68, #84 removed the phone note: every signed-in page opens on a phone): a Widget
// shows as a chip in the conversation, never its body.
const widget = ["```openui-lang", 'root = Widget("Pick a rate", [rate])', "$rate = 3", 'rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")', "```"].join("\n");

describe("the chat on a phone", () => {
  it("shows a chip in the chat and never the Widget body, at any width", () => {
    const html = renderToStaticMarkup(
      <Conversation initial={[{ role: "assistant", text: `Try it.\n\n${widget}` }]} quiz={null} pending={null} review={{ question: null, dueCount: 0, done: 0, cap: 5 }} />,
    );
    const chat = html.slice(0, html.indexOf('data-testid="widget-pane"'));
    expect(chat).toContain("Pick a rate");
    expect(chat).not.toContain("Discount rate");
  });
});
