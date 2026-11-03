/**
 * Live probe of the Tutor's generative widgets (real API, about $1 to $2 by estimate). One command:
 * `npm run widgets:live`.
 *
 * Each ask in genui-asks.ts gets a fresh in-memory PGlite database with production's Tutor settings
 * (claude-opus-5-5 at medium effort), the Case Data of its Topic from the laptop's import files, and
 * the real Tutor instructions, tools and Tutor Turn, so nothing touches the owner's real database.
 * The Learner is placed in the ask's Topic before the reveal and the ask's messages are sent one
 * after another. Each reply is read the way the browser shows it (a correction turn's widget replaces
 * the broken one): its widgets, the server's widget check, the widget tools each one calls, and the
 * chart and table figures typed into its code. A Markdown report and its JSON go to the report folder.
 *
 * It passes when at least 7 of the 8 asks get a complete widget in their last reply (every ask, when
 * ONLY picks some), no widget fails the check, and no widget without widget tools or our code-backed
 * components types chart figures unless its title starts "Illustration:".
 *
 * Options (environment): ONLY=id,id (run some asks), WIDGETS_LIVE_BUDGET_USD (default 4, the Tutor's
 * spend; no new ask starts once it is reached), WIDGETS_LIVE_OUT (report folder),
 * WIDGETS_LIVE_CONCURRENCY (asks at once, default 4), CASE_DATA_DIR (the Case Data import files).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createParser, type LibraryJSONSchema } from "@openuidev/lang-core";
import { expect, it } from "vitest";
import { placeLearner } from "@/behaviour/place";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveJump } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { fingerprint } from "@/tutor/session-log";
import { runTutorTurn, type TutorClient } from "@/tutor/turn";
import type { TurnUsage } from "@/tutor/usage";
import { replaceBrokenWidgets, replyWidgetProblems, widgetProblems } from "./check";
import frozen from "./frozen.generated.json";
import { GENUI_ASKS, type GenuiAsk } from "./genui-asks";
import { splitReply } from "./split";

/** Production's stored Tutor settings, written into each throwaway database so a change to the defaults cannot change what this measures. */
const PRODUCTION = { model: "claude-opus-5-5", effort: "medium" };
const PROJECT = join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent");
const OUT = process.env.WIDGETS_LIVE_OUT || join(PROJECT, "evidence/genui-widgets");
const CASE_DATA_DIR = process.env.CASE_DATA_DIR || join(PROJECT, "case-data");
const BUDGET = Number(process.env.WIDGETS_LIVE_BUDGET_USD || "4");
const CONCURRENCY = Number(process.env.WIDGETS_LIVE_CONCURRENCY || "4");

/** The laptop import file that holds each asked-about Case's checked datasets (from a search of the folder for each caseId, 3 Nov 2026). */
const CASE_DATA_FILES: Record<string, string> = {
  "mega-millions-2018": "mega-millions-2018.json",
  "sensex-1992": "foundation-b31.json",
  "fed-hike-1994": "foundation-b31.json",
  "bond-selloff-1994": "foundation-b34.json",
};

/** Our components whose numbers come from tested code or Case Data. */
const CODE_BACKED = new Set(["AnnuityChart", "HistoryChart", "Calculator", "FormulaCard"]);

/** The props of the kit's charts and tables that hold plotted or listed values (not labels, or settings such as a chart's height). */
const DATA_PROPS: Record<string, readonly string[]> = {
  Series: ["values"],
  Slice: ["value"],
  Point: ["x", "y", "z"],
  PieChart: ["values"],
  RadialChart: ["values"],
  SingleStackedBarChart: ["values"],
  Col: ["data"],
};

const map = loadCourseMap();
const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");
let spent = 0;

type Element = { type: "element"; typeName: string; props: Record<string, unknown> };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isElement = (v: unknown): v is Element => isRecord(v) && v.type === "element" && typeof v.typeName === "string" && isRecord(v.props);

/** Every component in a parsed widget, deep and in order (expressions are not searched). */
function elementsIn(value: unknown, out: Element[] = []): Element[] {
  if (Array.isArray(value)) for (const v of value) elementsIn(v, out);
  else if (isElement(value)) {
    out.push(value);
    for (const v of Object.values(value.props)) elementsIn(v, out);
  } else if (isRecord(value) && typeof value.k !== "string") for (const v of Object.values(value)) elementsIn(v, out);
  return out;
}

/**
 * The figures typed into a value: numbers, and text with a digit in it (a table cell such as
 * "4,285"), written out or inside an expression such as `$rate * 1.05`. In an expression only its
 * literals count, never the names it uses (`$rate2`, `q1`) or an index such as `rows[0]`. A nested
 * component is read on its own.
 */
function figuresIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "number") out.push(String(value));
  else if (typeof value === "string") {
    if (/\d/.test(value)) out.push(value);
  } else if (Array.isArray(value)) for (const v of value) figuresIn(v, out);
  else if (isElement(value)) return out;
  else if (isRecord(value) && typeof value.k === "string") {
    if (value.k === "Num" || value.k === "Str") figuresIn(value.v, out);
    else if (value.k === "Index") figuresIn(value.obj, out);
    else if (value.k === "Obj" && Array.isArray(value.entries)) for (const entry of value.entries) figuresIn(Array.isArray(entry) ? entry[1] : entry, out);
    else for (const v of Object.values(value)) if (typeof v === "object") figuresIn(v, out);
  } else if (isRecord(value)) for (const v of Object.values(value)) figuresIn(v, out);
  return out;
}

/** One widget of a reply, as the probe reads it. */
type WidgetRecord = {
  code: string;
  complete: boolean;
  title: string | null;
  /** Every component in it, deep, the Widget frame included. */
  components: string[];
  /** The widget tools its Queries call, by name as written. */
  tools: string[];
  mutations: number;
  /** Chart and table figures typed into its code rather than fetched or computed by our code. */
  typed: string[];
  /** The server's widget check, plus a block that was never closed. */
  problems: string[];
};

/** Reads one widget block: the server's check, its title and components, the tools its Queries call and its typed figures. */
function readWidget(code: string, complete: boolean): WidgetRecord {
  const problems = widgetProblems(code);
  if (!complete) problems.push("The widget block was never closed.");
  const empty: WidgetRecord = { code, complete, title: null, components: [], tools: [], mutations: 0, typed: [], problems };
  try {
    const result = parser.parse(code);
    const elements = elementsIn(result.root);
    return {
      ...empty,
      title: typeof result.root?.props.title === "string" ? result.root.props.title : null,
      components: elements.map((e) => e.typeName),
      tools: result.queryStatements.map((q) => (q.toolAST?.k === "Str" ? q.toolAST.v : "(not written as text)")),
      mutations: result.mutationStatements.length,
      typed: elements.flatMap((e) => (DATA_PROPS[e.typeName] ?? []).flatMap((prop) => figuresIn(e.props[prop]))),
    };
  } catch {
    return empty;
  }
}

/** A widget with no widget tool and none of our code-backed components shows typed figures only as a labelled Illustration. */
const unlabelledFigures = (w: WidgetRecord) =>
  w.typed.length > 0 && w.tools.length === 0 && !w.components.some((c) => CODE_BACKED.has(c)) && !(w.title ?? "").startsWith("Illustration:");

type TurnRecord = {
  learner: string;
  status: "finished" | "cut short" | "cut off" | "refused" | "failed" | "busy";
  /** The message that came with a status other than finished. */
  note: string;
  /** The reply as the Learner sees it: a correction turn's widget swapped in for the broken one. */
  reply: string;
  /** The first draft's widget problems that started a correction turn; empty when there was none. */
  corrected: string[];
  widgets: WidgetRecord[];
  usage: TurnUsage | null;
  costUsd: number;
};

/** One Learner message through the real Tutor Turn, read the way the browser reads it (conversation.tsx). */
async function takeTurn(db: Db, client: TutorClient, input: GenuiAsk["turns"][number]): Promise<TurnRecord> {
  const learner = typeof input === "string" ? input : "(chose the Topic; the page started the opener)";
  let draft = "";
  let correction: string | null = null;
  let status: TurnRecord["status"] = "finished";
  let note = "";
  let usage: TurnUsage | null = null;
  for await (const e of runTutorTurn({ db, client, map }, input)) {
    if (e.type === "text") {
      if (correction === null) draft += e.text;
      else correction += e.text;
    } else if (e.type === "correction") correction = "";
    else if (e.type === "done") usage = e.usage;
    else if (e.type === "cut_off") status = "cut off";
    else if (e.type === "cut_short") {
      status = "cut short";
      note = e.message;
    } else if (e.type === "refusal") {
      status = "refused";
      note = e.message;
      draft = e.text;
      correction = null;
    } else if (e.type === "error") {
      status = "failed";
      note = e.message;
    } else if (e.type === "busy") {
      status = "busy";
      note = e.message;
    }
  }
  const reply = correction === null ? draft : replaceBrokenWidgets(draft, correction);
  const corrected = correction === null ? [] : replyWidgetProblems(draft).flatMap((b) => b.problems.map((p) => `Widget ${b.index + 1}: ${p}`));
  const widgets = splitReply(reply).flatMap((s) => (s.type === "widget" ? [readWidget(s.code, s.complete)] : []));
  return { learner, status, note, reply, corrected, widgets, usage, costUsd: usage?.costUsd ?? 0 };
}

type AskRecord = {
  ask: GenuiAsk;
  /** The Topic and Teaching Step the Learner was placed at. */
  place: string;
  /** What Case Data each of the Topic's Cases got. */
  caseData: string[];
  turns: TurnRecord[];
  costUsd: number;
  seconds: number;
  /** Why the ask did not run to the end (the budget, or a run error); empty when it did. */
  stopped: string;
};

const importFiles = new Map<string, CaseDatasetInput[]>();

/** One Case's datasets from the laptop's import file, with a note for the report. */
function caseDatasets(caseId: string): { datasets: CaseDatasetInput[]; note: string } {
  const file = CASE_DATA_FILES[caseId];
  const path = file ? join(CASE_DATA_DIR, file) : "";
  if (!path || !existsSync(path)) return { datasets: [], note: `no import file found, so the Tutor sees no Case Data for ${caseId}` };
  if (!importFiles.has(path)) importFiles.set(path, JSON.parse(readFileSync(path, "utf8")) as CaseDatasetInput[]);
  const datasets = importFiles.get(path)!.filter((d) => d.caseId === caseId);
  return { datasets, note: `${datasets.length} dataset(s) from ${file}` };
}

/** Writes production's model and effort into the throwaway database's settings, where a new Session reads them. */
async function writeProductionSettings(db: Db) {
  for (const [key, value] of Object.entries(PRODUCTION)) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}

/** One ask on its own throwaway database: production's settings, its Topic's Case Data, the Learner's place, then each message. */
async function runAsk(ask: GenuiAsk, client: TutorClient): Promise<AskRecord> {
  const started = performance.now();
  const record: AskRecord = { ask, place: "", caseData: [], turns: [], costUsd: 0, seconds: 0, stopped: "" };
  if (spent >= BUDGET) return { ...record, stopped: `Not run: the $${BUDGET} budget was reached first.` };
  try {
    const topic = map.topic(ask.topic);
    if (!topic) throw new Error(`Topic "${ask.topic}" is not a written Topic on the Course Map.`);
    const db = await testDb();
    await writeProductionSettings(db);
    for (const c of topic.cases) {
      const { datasets, note } = caseDatasets(c.id);
      if (datasets.length) await importCaseData(db, datasets);
      record.caseData.push(`${c.id}: ${note}`);
    }
    // Chosen on the Course Map, as a Learner does (and as the behaviour run does); its Session shows at once.
    await saveJump(db, map, ask.topic);
    const place = await placeLearner(db, map, ask.at);
    if (place.topic.id !== ask.topic) throw new Error(`The Learner was placed in ${place.topic.id}, not ${ask.topic}.`);
    record.place = `Topic "${place.topic.title}" (${place.topic.id}), Teaching Step "${place.step}"${place.check ? ` of Check ${place.check.id}` : ""}, before the reveal`;
    for (const learner of ask.turns) {
      const turn = await takeTurn(db, client, learner);
      record.turns.push(turn);
      record.costUsd += turn.costUsd;
      spent += turn.costUsd;
      if (turn.status !== "finished" && turn.status !== "cut short") {
        if (record.turns.length < ask.turns.length) record.stopped = `Stopped after turn ${record.turns.length}: it ended ${turn.status}.`;
        break;
      }
    }
  } catch (err) {
    record.stopped = `Run failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { ...record, seconds: (performance.now() - started) / 1000 };
}

/** Whether the ask's last reply, the chart ask, holds a complete widget. */
const answered = (r: AskRecord) => r.turns.length === r.ask.turns.length && (r.turns.at(-1)?.widgets.some((w) => w.complete) ?? false);

type Verdict = { required: number; answered: string[]; broken: string[]; unlabelled: string[]; corrections: string[] };

/** The three things the probe asserts, each listed so the report can name every widget that fails. */
function judge(records: AskRecord[], required: number): Verdict {
  const each = (pick: (w: WidgetRecord) => string | null) =>
    records.flatMap((r) =>
      r.turns.flatMap((t, ti) =>
        t.widgets.flatMap((w, wi) => {
          const found = pick(w);
          return found ? [`${r.ask.id}, turn ${ti + 1}, widget ${wi + 1}: ${found}`] : [];
        }),
      ),
    );
  return {
    required,
    answered: records.filter(answered).map((r) => r.ask.id),
    broken: each((w) => (w.problems.length ? w.problems.join(" ") : null)),
    unlabelled: each((w) => (unlabelledFigures(w) ? `"${w.title ?? "(no title)"}" types ${w.typed.slice(0, 8).join(", ")}` : null)),
    corrections: records.filter((r) => r.turns.some((t) => t.corrected.length)).map((r) => r.ask.id),
  };
}

const list = (items: string[]) => (items.length ? items.join(", ") : "none");
const money = (usd: number) => `$${usd.toFixed(4)}`;
const quote = (text: string) => text.split("\n").map((line) => `> ${line}`.trimEnd());

/** The reply's prose with each widget marked where it sits, as the conversation column shows it. */
function prose(reply: string): string {
  let n = 0;
  return splitReply(reply)
    .map((s) => (s.type === "prose" ? s.text : `[Widget ${++n}]`))
    .join("")
    .trim();
}

/** One turn in the report: the Learner's message, any correction, the prose and each widget with its code. */
function renderTurn(t: TurnRecord, i: number): string[] {
  const u = t.usage;
  const heading = [
    t.status,
    u ? `${u.steps.length} loop step(s)` : "no usage (the turn did not finish)",
    u ? `Tutor tools: ${list(u.tools)}` : "",
    u ? `${(u.durationMs / 1000).toFixed(1)} s` : "",
    money(t.costUsd),
  ].filter(Boolean);
  const lines = [`### Turn ${i + 1}: ${heading.join(", ")}`, "", `**Learner:** ${t.learner}`, ""];
  if (t.note) lines.push(`**Note:** ${t.note}`, "");
  if (t.corrected.length) lines.push("**Correction turn.** The first draft failed the widget check:", "", ...t.corrected.map((p) => `- ${p}`), "");
  lines.push("**Tutor** (prose, with each widget marked):", "", ...quote(prose(t.reply) || "(no prose)"), "");
  t.widgets.forEach((w, wi) => {
    lines.push(
      `**Widget ${wi + 1}: "${w.title ?? "(no title)"}"** (${w.complete ? "complete" : "never closed"}). Tools: ${list(w.tools)}${w.mutations ? `; Mutations: ${w.mutations}` : ""}. Components: ${list(w.components)}. Typed figures: ${list(w.typed)}. Problems: ${w.problems.length ? w.problems.join(" ") : "none"}.`,
      "",
      "```openui-lang",
      w.code,
      "```",
      "",
    );
  });
  if (!t.widgets.length) lines.push("No widget in this reply.", "");
  return lines;
}

/** The Markdown report: the run's settings and spend, the verdict, a table of the asks, then each ask in full. */
function renderReport(records: AskRecord[], verdict: Verdict, startedAt: Date, seconds: number): string {
  const ran = records.filter((r) => r.turns.length).length;
  const tokens = Math.round(frozen.instructions.length / 4);
  const mark = (ok: boolean) => (ok ? "PASS" : "FAIL");
  const lines = [
    `# Generative widgets live probe, ${startedAt.toISOString()}`,
    "",
    `Tutor: ${PRODUCTION.model} at ${PRODUCTION.effort} effort (production's settings), each ask on a fresh throwaway in-memory database.`,
    `Instruction fingerprint: ${fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS)}. Frozen widget instructions: ${frozen.instructions.length.toLocaleString("en-US")} characters (about ${tokens.toLocaleString("en-US")} tokens).`,
    `Asks run: ${ran} of ${records.length}. Tutor spend: $${spent.toFixed(3)} (budget $${BUDGET}). Wall clock: ${seconds.toFixed(0)} s.`,
    "",
    "## Verdict",
    "",
    `- ${mark(verdict.answered.length >= verdict.required)}: ${verdict.answered.length} of ${records.length} asks have a complete widget in their last reply (needs ${verdict.required}).`,
    `- ${mark(!verdict.broken.length)}: widgets that fail the server's widget check: ${verdict.broken.length}.`,
    ...verdict.broken.map((b) => `  - ${b}`),
    `- ${mark(!verdict.unlabelled.length)}: widgets without tools or our code-backed components that type chart figures outside an Illustration: ${verdict.unlabelled.length}.`,
    ...verdict.unlabelled.map((u) => `  - ${u}`),
    `- Correction turns: ${verdict.corrections.length} (${list(verdict.corrections)}).`,
    "",
    "| Ask | Where | Widget in last reply | Widget tools | Problems | Typed figures | Cost |",
    "|---|---|---|---|---|---|---|",
    ...records.map((r) => {
      const widgets = r.turns.flatMap((t) => t.widgets);
      const where = `${r.ask.topic}, ${r.ask.at}`;
      const problems = widgets.reduce((n, w) => n + w.problems.length, 0);
      const typed = widgets.reduce((n, w) => n + w.typed.length, 0);
      const tools = [...new Set(widgets.flatMap((w) => w.tools))];
      return `| ${r.ask.id} | ${where} | ${answered(r) ? "yes" : r.stopped ? "not run to the end" : "no"} | ${list(tools)} | ${problems || "none"} | ${typed || "none"} | ${money(r.costUsd)} |`;
    }),
    "",
  ];
  for (const r of records) {
    lines.push(`## ${r.ask.id}`, "", `${r.place || `Topic ${r.ask.topic}`}. ${r.seconds.toFixed(1)} s, ${money(r.costUsd)}.`);
    lines.push(`Case Data: ${list(r.caseData)}.`, `A good widget: ${r.ask.goodWidget}`, "");
    if (r.stopped) lines.push(`**${r.stopped}**`, "");
    r.turns.forEach((t, i) => lines.push(...renderTurn(t, i)));
  }
  return lines.join("\n");
}

it("the Tutor answers chart asks with widgets that pass the check", { timeout: 3_600_000 }, async () => {
  const only = process.env.ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const asks = GENUI_ASKS.filter((a) => !only?.length || only.includes(a.id));
  if (!asks.length) throw new Error(`ONLY matched no ask. The ask ids are: ${GENUI_ASKS.map((a) => a.id).join(", ")}.`);
  const client = anthropicTutorClient();
  const startedAt = new Date();
  const started = performance.now();
  const records: AskRecord[] = new Array(asks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, asks.length)) }, async () => {
      while (next < asks.length) {
        const i = next++;
        records[i] = await runAsk(asks[i], client);
        console.log(`${answered(records[i]) ? "WIDGET" : "NO WIDGET"} ${asks[i].id} ($${spent.toFixed(3)} so far)`);
      }
    }),
  );
  // The full set may miss one ask (7 of 8); a chosen few must all get a widget.
  const verdict = judge(records, asks.length === GENUI_ASKS.length ? asks.length - 1 : asks.length);
  const report = renderReport(records, verdict, startedAt, (performance.now() - started) / 1000);
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  // Kept as files, because Vitest hides a passing test's console output under some reporters.
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `live-${stamp}.md`), report);
  writeFileSync(join(OUT, "live-latest.md"), report);
  writeFileSync(join(OUT, `live-${stamp}.json`), JSON.stringify({ verdict, records }, null, 2));
  console.log(`Tutor spend $${spent.toFixed(3)}; report in ${join(OUT, `live-${stamp}.md`)}`);
  expect.soft(verdict.answered.length, `asks with a complete widget in their last reply (report: ${OUT})`).toBeGreaterThanOrEqual(verdict.required);
  expect.soft(verdict.broken, "widgets that fail the server's widget check").toEqual([]);
  expect.soft(verdict.unlabelled, "widgets without tools or our code-backed components that type chart figures outside an Illustration").toEqual([]);
});
