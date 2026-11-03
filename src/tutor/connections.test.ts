import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { presentValueOnly } from "@/test/present-value-map";
import { loadCourseMap } from "@/course/map";
import { ensureTopicStarted, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { OPENING_PREFIX } from "./context";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { runTutorTurn, type TurnEvent } from "./turn";

async function collect(events: AsyncIterable<TurnEvent>) {
  await Array.fromAsync(events);
}

type Request = { messages: { role: string; content?: unknown }[] };
/** Context code sent the Tutor: appended system messages and the opening block of a Session's first message. */
const contexts = (request: Request) =>
  request.messages.flatMap((m) => {
    if (m.role === "system") return [String(m.content)];
    if (m.role === "user" && Array.isArray(m.content))
      return m.content.filter((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX)).map((b) => b.text as string);
    return [];
  });

describe("Connections at the principle step", () => {
  const map = presentValueOnly({ withoutQuiz: true, withConnections: true });
  const pv = map.topic("present-value")!;

  it("carries present value's three Connections, with the titles of the Topics they link to", () => {
    expect(pv.connections).toHaveLength(3);
    const titles = pv.connections.flatMap((c) => c.titles);
    const real = loadCourseMap();
    for (const c of pv.connections) expect(c.titles).toEqual(c.topics.map((id) => real.topic(id)?.title ?? id));
    expect(titles).toContain("Bond basics and pricing");
    expect(titles).toContain("DCF valuation");
  });

  it("sends the Connections at the principle step, and not at any step before", async () => {
    const db = await testDb();
    const steps: string[] = [];
    // Walk the Learner through every Teaching Step, reading the context the Tutor gets at each one.
    await ensureTopicStarted(db, map);
    const seen: Record<string, string> = {};
    for (const step of ["story", "concept", "your_turn", "check", "reveal", "principle"] as const) {
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Ok." }] }]);
      await collect(runTutorTurn({ db, client, map }, `at ${step}`));
      seen[step] = contexts(requests[0] as Request).join("\n");
      steps.push(step);
      if (step === "check") await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true });
      else if (step !== "principle") await saveFinishedStep(db, map, step);
    }
    expect(steps).toHaveLength(6);
    for (const step of ["story", "concept", "your_turn", "check", "reveal"]) {
      expect(seen[step]).toContain(`Teaching Step: ${step}`);
      expect(seen[step]).not.toContain("Connections:");
      for (const c of pv.connections) expect(seen[step]).not.toContain(c.text.trim());
    }
    expect(seen.principle).toContain("Teaching Step: principle");
    expect(seen.principle).toContain("Connections:");
    for (const c of pv.connections) {
      expect(seen.principle).toContain(c.text.trim());
      for (const title of c.titles) expect(seen.principle).toContain(title);
    }
  });

  it("tells the Tutor to give them at the principle step", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("Connections: when the Course Navigator message for the principle step lists Connections, give them there");
  });

  it("leaves a Topic without Connections as it was", async () => {
    const db = await testDb();
    const bare = presentValueOnly({ withoutQuiz: true });
    expect(bare.topic("present-value")!.connections).toEqual([]);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, bare, step);
    await saveCheckResult(db, bare, { checkId: bare.topic("present-value")!.checks[0].id, passed: true });
    await saveFinishedStep(db, bare, "reveal");
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Ok." }] }]);
    await collect(runTutorTurn({ db, client, map: bare }, "go"));
    const text = contexts(requests[0] as Request).join("\n");
    expect(text).toContain("Teaching Step: principle");
    expect(text).not.toContain("Connections:");
  });
});
