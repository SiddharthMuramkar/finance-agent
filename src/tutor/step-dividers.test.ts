import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { presentValueOnly } from "@/test/present-value-map";
import { loadThread, type ThreadEntry } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";

/**
 * Seam 1, Tutor Turn: when the Tutor finishes a Teaching Step with finish_teaching_step, a "Step k of N · <step>"
 * divider is stored as a Session item, after the message it follows. Session items are never sent to the model.
 */

const map = presentValueOnly({ withoutQuiz: true, withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const finish = (step: string, id = `toolu_${step}`) => ({ type: "tool_use", id, name: "finish_teaching_step", input: { step } });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** What the Learner sees, without the usage and save data that have their own tests. */
const seen = (entries: ThreadEntry[]) => entries.map((e) => (e.role === "item" ? e : { role: e.role, text: e.text, ...(e.more && { more: true }) }));

const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;

describe("step dividers when the Tutor moves on", () => {
  it("finishing a step stores one divider after the reply part that finished it, and the next model request has nothing from it", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      say("Once, a lottery winner had a choice."),
      { content: [{ type: "text", text: "Good thinking." }, finish("story")] },
      say("Now the concept: money today is worth more."),
      say("Because it can earn interest."),
    ]);
    await collect(runTutorTurn({ db, client, map }, "Hi"));
    const events = await collect(runTutorTurn({ db, client, map }, "I'd take the lump sum."));

    const divider = { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } };
    // The browser hears it as it is stored, between the reply's two parts.
    expect(events.map((e) => e.type)).toEqual(["text", "item", "text", "done"]);
    expect(events[1]).toEqual({ type: "item", item: { kind: divider.kind, data: divider.data } });

    const thread = await loadThread(db, sessionOf(events), map);
    expect(seen(thread)).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "user", text: "I'd take the lump sum." },
      { role: "assistant", text: "Good thinking.", more: true },
      divider,
      { role: "assistant", text: "Now the concept: money today is worth more." },
    ]);

    await collect(runTutorTurn({ db, client, map }, "Why?"));
    const sent = JSON.stringify(requests.at(-1)!.messages);
    expect(sent).toContain("Now the concept: money today is worth more.");
    expect(sent).not.toContain("Step 2 of");
    // A reload draws the same divider in the same place.
    expect(seen(await loadThread(db, sessionOf(events), map)).slice(0, 6)).toEqual(seen(thread));
  });
});
