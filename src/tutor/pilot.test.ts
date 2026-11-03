import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { insightAttempts } from "@/db/schema";
import { navigate } from "@/course/navigator";
import { loadProgress } from "@/learner/memory";
import { loadNotes } from "@/learner/notes";
import { calculate } from "@/finance/calculators";
import { formulaById } from "@/finance/formulas";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { runTutorTurn, type TurnEvent } from "./turn";

/**
 * The present value pilot end to end (spec #57): concept, explore (a miss, a hint, found), the Learner's
 * turn, the Check, the reveal and the principle with its Connections, ending with a passed Topic whose
 * Topic Note holds the Learner's words, the Connections and a computed Formula Card. A scripted Anthropic
 * client plays the Tutor; the database is PGlite with the real migrations. No network, no secrets.
 */

const map = presentValueOnly({ withoutQuiz: true, withConnections: true });
const pv = map.topic("present-value")!;
const insight = pv.insight!;
const checkId = pv.checks[0].id;
const WORDS = "A high rate shrinks later payments, so cash now can beat more later.";

async function collect(events: AsyncIterable<TurnEvent>) {
  for await (const _ of events) void _;
}

const tool = (id: string, name: string, input: Record<string, unknown>) => ({ content: [{ type: "tool_use", id, name, input }] });
const finish = (id: string, step: string) => tool(id, "finish_teaching_step", { step });
const attempt = (id: string, outcome: string, words: string) => tool(id, "record_insight_attempt", { outcome, learner_words: words });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

type Request = ReturnType<typeof scriptedClient>["requests"][number];
const toolResults = (request: Request) =>
  request.messages.flatMap((m) =>
    Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
  );
const sent = (request: Request) => JSON.stringify(request.messages);

describe("present value pilot, end to end", () => {
  it("walks concept, explore, your turn, the Check, reveal and principle to a passed Topic with a filled Topic Note", async () => {
    const db = await testDb();
    const turn = async (message: string | { opener: true }, replies: ScriptedReply[]) => {
      const { client, requests } = scriptedClient(replies);
      await collect(runTutorTurn({ db, client, map }, message));
      return requests;
    };
    const stepNow = async () => navigate(map, await loadProgress(db))?.step;

    // Story and concept.
    expect(await stepNow()).toBe("story");
    await turn({ opener: true }, [say("Picture October 2018.")]);
    await turn("Interesting, go on", [finish("f-story", "story"), say("Now the idea.")]);
    expect(await stepNow()).toBe("concept");
    await turn("Got it, carry on", [finish("f-concept", "concept"), say("Over to the Widget.")]);
    expect(await stepNow()).toBe("explore");

    // Explore: a miss (gets the first hint), a second try (hint 2 withheld), then found in the Learner's words.
    const miss = await turn("The bars get smaller", [attempt("a1", "not_yet", "The bars get smaller"), say("Look at the far bars.")]);
    expect(String(toolResults(miss.at(-1)!).at(-1)!.content)).toContain(`Hint 1 for the Learner: ${insight.hints[0].trim()}`);
    expect(await stepNow()).toBe("explore");
    const found = await turn(WORDS, [attempt("a2", "found", WORDS), finish("f-explore", "explore"), say("That is what you just said.")]);
    expect(String(toolResults(found[1]).at(-1)!.content)).toContain("the Learner found the Insight");
    expect(await stepNow()).toBe("your_turn");

    // The Learner's turn, then the Check: the verdict needs an answer from a later message.
    await turn("My working is done.", [finish("f-turn", "your_turn"), say("Here is your Check.")]);
    expect(await stepNow()).toBe("check");
    const early = await turn("Later payments are worth less today, so the two figures can describe one prize.", [
      tool("v1", "record_check_verdict", { check_id: checkId, verdict: "pass", reasons: "Discounted each later payment at a rate." }),
      say("Well reasoned."),
    ]);
    expect(String(toolResults(early.at(-1)!).at(-1)!.content)).toContain("Teaching Step: reveal");
    expect(await stepNow()).toBe("reveal");

    // Reveal, then the principle with its Connections.
    await turn("What happened next?", [finish("f-reveal", "reveal"), say("Here is what happened.")]);
    expect(await stepNow()).toBe("principle");
    const [principle] = await turn("Go on", [say("The principle, and where it leads.")]);
    expect(sent(principle)).toContain("Teaching Step: principle");
    expect(sent(principle)).toContain("Connections:");
    for (const c of pv.connections) expect(sent(principle)).toContain(c.text.trim());
    expect(sent(principle)).toContain(`The Learner's own words about the Insight (found by themselves): \\"${WORDS}\\"`);

    // Finishing the principle passes the Topic.
    await turn("That makes sense", [finish("f-principle", "principle"), say("Present value is done.")]);
    expect((await loadProgress(db)).topics["present-value"]?.status).toBe("passed");

    // The Learner's words were saved as found.
    const rows = await db.select().from(insightAttempts).orderBy(asc(insightAttempts.id));
    expect(rows.map((r) => [r.reported, r.released, r.words])).toEqual([
      ["not_yet", "hint_1", "The bars get smaller"],
      ["found", "found", WORDS],
    ]);

    // The Topic Note: the Learner's words, the Connections, and a Formula Card computed by code.
    const note = (await loadNotes(db, map)).find((n) => n.topicId === "present-value")!;
    expect(note.passed).toBe(true);
    const filled = note.filled!;
    expect(filled.insight).toEqual({ ownWords: WORDS });
    expect(filled.connections.map((c) => c.text)).toEqual(pv.connections.map((c) => c.text));
    expect(filled.connections.length).toBeGreaterThanOrEqual(2);
    expect(filled.connections.length).toBeLessThanOrEqual(3);
    expect(filled.formulas.map((f) => f.formulaId)).toEqual(pv.formulas);
    for (const f of filled.formulas) {
      const formula = formulaById(f.formulaId)!;
      expect(Object.keys(f.values).length).toBeGreaterThan(0);
      // The card is computed from its example numbers by code, never typed or worked out by the model.
      const run = calculate(formula.calculator, f.values, "usd");
      expect(run.ok).toBe(true);
      if (run.ok) expect(run.results.some((r) => r.label === formula.result.resultLabel)).toBe(true);
    }
  });
});
