import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, settings } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { readSettings } from "./session-log";
import { runTutorTurn, type TurnEvent } from "./turn";
import { FENCE_IN_ENGINE } from "./reply-gate";

// A rejected draft's rows are not the reply: the retry may show its one Widget.

const SIP = {
  title: "₹1,000 a month in a SIP",
  inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
  refs: {},
  facts: {},
};
const show = (id: string) => ({ type: "tool_use", id, name: "show_widget", input: { recipe: "grow_money", params: SIP } });
const text = (t: string) => ({ content: [{ type: "text", text: t }] });
type Request = { messages: { role: string; content?: unknown }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

async function run(script: Parameters<typeof scriptedClient>[0], dropReplyChecks = false) {
  const db = await testDb();
  await readSettings(db);
  await db.update(settings).set({ value: "on" }).where(eq(settings.key, "widget_engine"));
  if (dropReplyChecks) await db.execute("drop table reply_checks" as never);
  const { client, requests } = scriptedClient(script);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP")) events.push(e);
  return { events, requests };
}

describe("the retry after a rejected draft", () => {
  const fence = "```openui-lang\nroot = Widget(\"PV\", [])\n```";

  it("shows its Widget after a draft with a code fence was rejected", async () => {
    const { events, requests } = await run([text(`Here it is.\n${fence}\nWhat do you see?`), { content: [show("toolu_a")] }, text("Move the slider.")]);
    expect(String(requests[1].messages.at(-1)!.content)).toContain(FENCE_IN_ENGINE);
    expect(toolResults(requests[2]).filter((r) => r.is_error)).toHaveLength(0);
    expect(events.filter((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toHaveLength(1);
  });

  it("still refuses the second Widget call of a normal reply", async () => {
    const { requests, events } = await run([{ content: [show("toolu_a"), show("toolu_b")] }, text("One is enough.")]);
    expect(toolResults(requests[1]).filter((r) => String(r.content).match(/already has a Widget/))).toHaveLength(1);
    expect(events.filter((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toHaveLength(1);
  });

  it("is unchanged without a reply_checks table", async () => {
    const { requests, events } = await run([{ content: [show("toolu_a"), show("toolu_b")] }, text("One is enough.")], true);
    expect(toolResults(requests[1]).filter((r) => String(r.content).match(/already has a Widget/))).toHaveLength(1);
    expect(events.filter((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toHaveLength(1);
  });
});
