import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, settings } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { readSettings } from "./session-log";
import { runTutorTurn, type TurnEvent } from "./turn";

// One Widget a reply: two show_widget calls in the same assistant message draw one Widget, not two.

const SIP = {
  title: "₹1,000 a month in a SIP",
  inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
  refs: {},
  facts: {},
};
const show = (id: string) => ({ type: "tool_use", id, name: "show_widget", input: { recipe: "grow_money", params: SIP } });
type Request = { messages: { role: string; content?: unknown }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

describe("one Widget a reply", () => {
  it("draws the first of two show_widget calls in one message and refuses the second", async () => {
    const db = await testDb();
    await readSettings(db);
    await db.update(settings).set({ value: "on" }).where(eq(settings.key, "widget_engine"));
    const { client, requests } = scriptedClient([{ content: [show("toolu_a"), show("toolu_b")] }, { content: [{ type: "text", text: "One is enough." }] }]);
    const events: TurnEvent[] = [];
    for await (const e of runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP")) events.push(e);
    const results = toolResults(requests[1]);
    expect(results.filter((r) => r.is_error)).toHaveLength(1);
    expect(results.filter((r) => String(r.content).match(/already has a Widget/))).toHaveLength(1);
    expect(events.filter((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toHaveLength(1);
  });
});
