import { createParser, type ASTNode, type LibraryJSONSchema, type ParseResult } from "@openuidev/lang-core";
import { CALCULATOR_IDS, CALCULATORS } from "@/finance/calculators";
import { FORMULAS, formulaById } from "@/finance/formulas";
import type { CoveredParts } from "@/course/written-ahead";
// The frozen schema alone: the browser draws widgets with this check, and needs none of the instructions' text.
import frozenSchema from "./frozen-schema.generated.json";
import { guidedTaskProblems, parsedTasks, walkNodes, type ParsedNode } from "./guided-tasks";
import { sliderStep } from "./slider-steps";
import { splitReply } from "./split";
import { CASE_DATA_REFERENCE, isWidgetToolName, WIDGET_TOOL_ARGS, WIDGET_TOOL_NAMES, type WidgetToolName } from "./tool-specs";

/** Opens the message code sends when a finished widget fails the check. */
export const WIDGET_CHECK_PREFIX = "Widget check by code:";

const parser = createParser(frozenSchema as unknown as LibraryJSONSchema, "Widget");

/** Problems that stop a finished widget from rendering properly; empty when it is fine. */
export function widgetProblems(code: string): string[] {
  try {
    const result = parser.parse(code);
    const problems = result.meta.errors
      .filter((e) => e.severity !== "warning")
      .map((e) => `${e.statementId ?? e.component}: ${e.message}`);
    if (!result.root) problems.push("No root = Widget(...) statement was found.");
    if (result.meta.unresolved.length) problems.push(`Undefined names: ${result.meta.unresolved.join(", ")}.`);
    problems.push(...formulaCardProblems(result.root?.props.children));
    problems.push(...guidedTaskProblems(result.root?.props.children));
    problems.push(...toolProblems(result));
    return problems;
  } catch (e) {
    return [`The code could not be parsed: ${e instanceof Error ? e.message : String(e)}`];
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stateRefName = (v: unknown): string | undefined => (isRecord(v) && v.k === "StateRef" && typeof v.n === "string" ? v.n : undefined);

/**
 * Problems in the widget's Formula Cards, which the parser cannot see: an unknown formula or symbol, a
 * card input bound to no Slider, a symbol given under more than one of inputs, sourced and fixed, and a
 * symbol of the formula not given at all. Cards and Sliders are found at any depth (a card in a Stack can
 * be bound to a Slider in another). They feed the same correction turn as any other widget problem.
 */
function formulaCardProblems(children: unknown): string[] {
  const nodes = [...walkNodes(children)];
  const sliderVars = new Set(nodes.filter((n) => n.typeName === "Slider").map((n) => stateRefName(n.props.value)));
  return nodes
    .filter((n) => n.typeName === "FormulaCard")
    .flatMap((card) => {
      const where = card.statementId ?? "FormulaCard";
      const formula = typeof card.props.formula === "string" ? formulaById(card.props.formula) : undefined;
      if (!formula) return [`${where}: formula is not in the formula registry. Use one of: ${FORMULAS.map((f) => f.id).join(", ")}.`];
      const maps = (["inputs", "sourced", "fixed"] as const).map(
        (name) => [name, isRecord(card.props[name]) ? (card.props[name] as Record<string, unknown>) : {}] as const,
      );
      const problems: string[] = [];
      const known = new Set(formula.symbols.map((s) => s.key));
      for (const [name, map] of maps) {
        for (const [key, value] of Object.entries(map)) {
          if (!known.has(key)) problems.push(`${where}: "${key}" under ${name} is not a symbol of ${formula.id}. Its symbols are: ${[...known].join(", ")}.`);
          if (name === "inputs") {
            const variable = stateRefName(value);
            if (!variable || !sliderVars.has(variable)) {
              problems.push(`${where}: input "${key}" is bound to no Slider. Bind it to a $variable that a Slider in this widget uses, or move it under fixed.`);
            }
          }
        }
      }
      for (const symbol of formula.symbols) {
        const given = maps.filter(([, map]) => symbol.key in map).map(([name]) => name);
        if (given.length > 1) problems.push(`${where}: "${symbol.key}" is given under both ${given.join(" and ")}. Give each symbol once.`);
        if (given.length === 0) problems.push(`${where}: symbol "${symbol.key}" (${symbol.name}) is missing. Give it under inputs, sourced or fixed.`);
      }
      return problems;
    });
}

/** Stands for an argument the browser works out (a $variable, an expression, a Query's result): the tool checks it there. */
const WORKED_OUT = Symbol("worked out in the browser");

/** A parsed argument as a plain value: literals as written, anything else WORKED_OUT; undefined when there is none. */
function literalValue(ast: ASTNode | null): unknown {
  if (!ast) return undefined;
  switch (ast.k) {
    case "Str":
    case "Num":
    case "Bool":
      return ast.v;
    case "Null":
      return null;
    case "Arr":
      return ast.els.map(literalValue);
    case "Obj":
      return Object.fromEntries(ast.entries.map(([key, value]) => [key, literalValue(value)]));
    default:
      return WORKED_OUT;
  }
}

/** True when a problem at `path` in the arguments lies at or inside an argument the browser works out. */
function workedOut(args: unknown, path: readonly PropertyKey[]): boolean {
  let at = args;
  for (const key of path) {
    if (at === WORKED_OUT || typeof at !== "object" || at === null) return at === WORKED_OUT;
    at = (at as Record<PropertyKey, unknown>)[key];
  }
  return at === WORKED_OUT;
}

/** How the Tutor wrote a Query's tool, for a message: the quoted name, or the expression standing in its place. */
function writtenTool(ast: ASTNode | null): string {
  if (!ast) return "";
  if (ast.k === "Str" || ast.k === "Num" || ast.k === "Bool") return String(ast.v);
  return "n" in ast ? ast.n : "an expression";
}

/** A calculator's input names, from its input schema. */
const inputNames = (calculator: (typeof CALCULATORS)[number]): string[] => Object.keys((calculator.inputs as unknown as { shape?: object }).shape ?? {});

/**
 * Problems in the widget's Queries and Mutations, which the parser cannot see: a tool that does not exist, any
 * Mutation (widgets only read), and literal arguments the tool would refuse. Arguments the browser works out
 * ($variables, expressions) are left to the tool, which checks them each time it runs.
 */
function toolProblems(result: ParseResult): string[] {
  const queries = result.queryStatements.flatMap((query) => {
    const tool = query.toolAST?.k === "Str" ? query.toolAST.v : undefined;
    if (!isWidgetToolName(tool)) {
      return [`${query.statementId}: Query tool "${writtenTool(query.toolAST)}" does not exist. Tools: ${WIDGET_TOOL_NAMES.join(", ")}.`];
    }
    return argumentProblems(query.statementId, tool, literalValue(query.argsAST));
  });
  const mutations = result.mutationStatements.map((m) => `${m.statementId}: widgets only read; remove Mutation().`);
  return [...queries, ...mutations];
}

/**
 * Problems in one Query's literal arguments: what the tool's argument schema refuses (a missing or mistyped field,
 * a step of 0), a Case Data reference not written "caseId/datasetId", an unknown calculator, an input the
 * calculator does not have, and a calculate_range `vary` that is not one of its inputs (it would draw a flat line).
 */
function argumentProblems(where: string, tool: WidgetToolName, args: unknown): string[] {
  const fields = isRecord(args) ? args : {};
  const badReference = tool === "case_data" && typeof fields.dataset === "string" && !CASE_DATA_REFERENCE.test(fields.dataset);
  const parsed = WIDGET_TOOL_ARGS[tool].safeParse(args);
  const problems = (parsed.success ? [] : parsed.error.issues)
    .filter((issue) => !workedOut(args, issue.path) && !(badReference && issue.path.join(".") === "dataset"))
    .map((issue) => `${where}: Query("${tool}") ${issue.path.length ? `argument "${issue.path.join(".")}"` : "arguments"}: ${issue.message}.`);
  if (badReference) {
    problems.push(`${where}: dataset "${fields.dataset}" is not a Case Data reference. Write "caseId/datasetId", taken from the Case Data list code sent you.`);
  }
  if ((tool === "calculate" || tool === "calculate_range") && typeof fields.calculator === "string") {
    const id = fields.calculator;
    const calculator = CALCULATORS.find((c) => c.id === id);
    if (!calculator) return [...problems, `${where}: calculator "${id}" does not exist. Calculators: ${CALCULATOR_IDS.join(", ")}.`];
    const names = inputNames(calculator);
    for (const key of isRecord(fields.inputs) ? Object.keys(fields.inputs) : []) {
      if (!names.includes(key)) problems.push(`${where}: "${key}" is not an input of ${id}. Its inputs: ${names.join(", ")}.`);
    }
    if (tool === "calculate_range" && typeof fields.vary === "string" && !names.includes(fields.vary)) {
      problems.push(`${where}: vary must be one of ${id}'s inputs: ${names.join(", ")}.`);
    }
  }
  return problems;
}

/** Problems in each finished widget of a reply, by widget position; widgets with none are left out. */
export function replyWidgetProblems(text: string): { index: number; problems: string[] }[] {
  return splitReply(text)
    .filter((s) => s.type === "widget")
    .flatMap((s, index) => {
      const problems = widgetProblems(s.code);
      return problems.length ? [{ index, problems }] : [];
    });
}

/** OpenUI's ready-made charts that have axes, each taking an x-axis and a y-axis label. */
const AXIS_CHARTS = new Set(["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "ScatterChart"]);

/** True when a parsed argument is given: written text, or anything the browser works out. */
const labelGiven = (value: unknown) => (typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null);

/** The Case Data references a parsed Widget draws, through Query("case_data") or a HistoryChart. */
function caseDataDrawn(result: ParseResult): string[] {
  const queried = writtenQueries(result).flatMap(({ tool, args }) => (tool === "case_data" && isRecord(args) && typeof args.dataset === "string" ? [args.dataset] : []));
  const charted = [...walkNodes(result.root?.props.children)].flatMap((n) => (n.typeName === "HistoryChart" && typeof n.props.dataset === "string" ? [n.props.dataset] : []));
  return [...new Set([...queried, ...charted])].filter((ref) => CASE_DATA_REFERENCE.test(ref));
}

/**
 * The Widget rules code holds a new Widget to, beyond drawing (spec #119, "Code-backed Widget checks"): a Widget
 * with a slider has a Guided Task; a kit chart with axes labels both of them; and a new Widget does not draw the
 * same Case Data as a Widget already open. `open` is the code of the Widgets open before this one; one with the
 * same title is the Widget this one updates in place, so it is not compared. Run only on the reply being
 * written: stored Widgets (Older sessions, Notes) are never held to these rules, and draw as before.
 */
export function widgetRuleProblems(code: string, open: readonly string[] = []): string[] {
  let result: ParseResult;
  try {
    result = parser.parse(code);
  } catch {
    return [];
  }
  const root = result.root;
  if (!root) return [];
  const nodes = [...walkNodes(root.props.children)];
  const problems: string[] = [];
  if (nodes.some((n) => n.typeName === "Slider") && !parsedTasks(root.props.children).length) {
    problems.push("this Widget has a slider but no Guided Task. Add GuidedTasks, last in the Widget, with at least one GuidedTask whose condition reads the slider's $variable and names a number the slider can reach.");
  }
  for (const chart of nodes.filter((n) => AXIS_CHARTS.has(n.typeName))) {
    if (!labelGiven(chart.props.xLabel) || !labelGiven(chart.props.yLabel)) {
      problems.push(`${chart.statementId ?? chart.typeName}: this ${chart.typeName} has no axis labels. Give it both an x-axis and a y-axis label, in plain words with the unit.`);
    }
  }
  const title = typeof root.props.title === "string" ? root.props.title.trim() : null;
  const drawn = caseDataDrawn(result);
  for (const other of open) {
    const parts = widgetParts(other);
    if (title && parts.title?.trim() === title) continue;
    let otherResult: ParseResult;
    try {
      otherResult = parser.parse(other);
    } catch {
      continue;
    }
    const shared = caseDataDrawn(otherResult).filter((ref) => drawn.includes(ref));
    if (shared.length) {
      problems.push(
        `this new Widget draws the same Case Data (${shared.join(", ")}) as the open Widget "${parts.title ?? "Untitled"}". Update that Widget instead: write it again in full under the same title, "${parts.title ?? "Untitled"}".`,
      );
    }
  }
  return problems;
}

/**
 * Everything a parsed Widget uses, for the written-ahead rule: the names of its components, the Widget tools its
 * Queries call, and the calculators it runs (a Calculator's, or a calculate or calculate_range Query's).
 */
function partsUsed(result: ParseResult): Set<string> {
  const nodes = [...walkNodes(result.root?.props.children)];
  const queries = writtenQueries(result);
  const calculators = [
    ...nodes.flatMap((n) => (n.typeName === "Calculator" && typeof n.props.calculator === "string" ? [n.props.calculator] : [])),
    ...queries.flatMap(({ args }) => (isRecord(args) && typeof args.calculator === "string" ? [args.calculator] : [])),
  ];
  return new Set([...nodes.map((n) => n.typeName), ...queries.map((q) => q.tool), ...calculators]);
}

/** A part as the correction message names it: "the Compound annual growth rate calculator (cagr)", or the part's own name. */
function partName(part: string): string {
  const calculator = CALCULATORS.find((c) => c.id === part);
  return calculator ? `the ${calculator.title} calculator (${part})` : part;
}

/**
 * Ends each correction line for a Widget the Tutor drew of its own that a written-ahead Widget covers: such a Widget is
 * left out of the reply (droppedWidgets), not replaced, and the Tutor opens the written-ahead one instead.
 */
export const LEAVE_OUT = "leave this widget out of your reply";

/**
 * The written-ahead rule (spec #119, "Code-backed Widget checks"): a Widget the Tutor draws may not use the parts a
 * written-ahead Widget of the Topic covers (Percent: a growth-rate calculator; Present value: the annuity chart or
 * schedule). The problem names the written-ahead Widget to open instead.
 */
export function writtenAheadPartProblems(code: string, covered: readonly CoveredParts[]): string[] {
  if (!covered.length) return [];
  let used: Set<string>;
  let title: string | undefined;
  try {
    const result = parser.parse(code);
    used = partsUsed(result);
    title = typeof result.root?.props.title === "string" ? result.root.props.title.trim() : undefined;
  } catch {
    return [];
  }
  return covered.flatMap((w) => {
    const shared = w.parts.filter((p) => used.has(p));
    // The explore Widget before the explore step: the Learner meets it there (ADR 0001), so it is not opened yet either.
    const open = w.held
      ? `Never draw your own version, and do not open it yet: the Learner meets it at the explore step. Teach this in words for now and ${LEAVE_OUT}.`
      : `Never draw your own version: call open_widget with id "${w.id}" and ${LEAVE_OUT}.`;
    if (shared.length) return [`this Widget uses ${shared.map(partName).join(" and ")}, which the written-ahead Widget "${w.title}" covers. ${open}`];
    // Its own title would take the written-ahead Widget's tab, as an update in place does.
    if (title === w.title) return [`this Widget has the title of the written-ahead Widget "${w.title}". ${open}`];
    return [];
  });
}

/**
 * Everything wrong with each finished Widget of the reply being written, by widget position: what stops it
 * drawing, then the Widget rules (widgetRuleProblems) and the written-ahead rule for the Topic's written-ahead
 * Widgets (`covered`). Each Widget is compared with the Widgets open before the reply (`open`, their code) and with
 * those earlier in the same reply. Widgets with no problem are left out.
 */
export function newReplyWidgetProblems(text: string, open: readonly string[] = [], covered: readonly CoveredParts[] = []): { index: number; problems: string[] }[] {
  const seen = [...open];
  return splitReply(text)
    .filter((s) => s.type === "widget")
    .flatMap((s, index) => {
      const problems = [...widgetProblems(s.code), ...widgetRuleProblems(s.code, seen), ...writtenAheadPartProblems(s.code, covered)];
      seen.push(s.code);
      return problems.length ? [{ index, problems }] : [];
    });
}

/**
 * The correction message code sends for the reply's flagged Widgets. When some are to be left out (the written-ahead
 * rule), the Tutor writes no block for those; the others it writes again in full, in order.
 */
export function widgetCheckMessage(broken: readonly { index: number; problems: string[] }[]): string {
  const problems = broken.flatMap((b) => b.problems.map((p) => `- Widget ${b.index + 1}: ${p}`));
  const leaveOut = problems.some((p) => p.includes(LEAVE_OUT));
  const close = !leaveOut
    ? "Reply with only the corrected openui-lang block, written in full. Write no prose."
    : broken.every((b) => b.problems.some((p) => p.includes(LEAVE_OUT)))
      ? "Call open_widget where a line says to. Write no openui-lang block and no prose."
      : "Call open_widget where a line says to, and write no block for a Widget to leave out. For each other Widget named, reply with only its corrected openui-lang block, written in full, in order. Write no prose.";
  return `${WIDGET_CHECK_PREFIX} the widget in your last reply cannot be drawn or breaks a Widget rule.\n${problems.join("\n")}\n${close}`;
}

const FENCE = /```openui-lang\n[\s\S]*?\n```/g;

/**
 * The widget positions (from 0) a correction message from code names: its "- Widget N: …" lines. Empty for a
 * message that names none.
 */
export function flaggedWidgets(checkMessage: string): number[] {
  return [...new Set([...checkMessage.matchAll(/^- Widget (\d+):/gm)].map((m) => Number(m[1]) - 1))];
}

/** The widget positions (from 0) a correction message says to leave out of the reply: written-ahead Widgets cover them. */
export function droppedWidgets(checkMessage: string): number[] {
  return [...new Set([...checkMessage.matchAll(/^- Widget (\d+):.*$/gm)].filter((m) => m[0].includes(LEAVE_OUT)).map((m) => Number(m[1]) - 1))];
}

/**
 * Takes the widgets a correction message leaves out (droppedWidgets) out of `text`, and gives the positions of the
 * other flagged widgets as they stand after: those a correction reply then replaces (replaceBrokenWidgets). `left` is
 * false when the message flagged only widgets to leave out, so no correction reply replaces anything.
 */
export function leaveOutWidgets(text: string, checkMessage: string): { text: string; flagged: number[]; left: boolean } {
  return withoutLeftOut(text, flaggedWidgets(checkMessage), droppedWidgets(checkMessage));
}

/** leaveOutWidgets, given the flagged widgets and those of them to leave out (as the turn stream's correction event names them). */
export function withoutLeftOut(text: string, flagged: readonly number[], leaveOut: readonly number[]): { text: string; flagged: number[]; left: boolean } {
  const dropped = new Set(leaveOut);
  if (!dropped.size) return { text, flagged: [...flagged], left: true };
  let index = 0;
  const kept = text.replace(FENCE, (block) => (dropped.has(index++) ? "" : block));
  const remaining = flagged.filter((i) => !dropped.has(i)).map((i) => i - [...dropped].filter((d) => d < i).length);
  return { text: kept, flagged: remaining, left: remaining.length > 0 };
}

/**
 * Swaps each flagged widget block in `text`, in order, for the next block in `correction`. The flagged
 * widgets are `flagged` (positions from 0, as the correction message named them), else those that cannot
 * be drawn.
 */
export function replaceBrokenWidgets(text: string, correction: string, flagged?: readonly number[]): string {
  const fixes = correction.match(FENCE) ?? [];
  const broken = new Set(flagged?.length ? flagged : replyWidgetProblems(text).map((b) => b.index));
  let index = 0;
  return text.replace(FENCE, (block) => (broken.has(index++) && fixes.length ? fixes.shift()! : block));
}

/**
 * A Query of one of our Widget tools as the widget writes it: its statement's name, its tool, and its arguments,
 * with each part the browser works out (a $variable, an expression) left open.
 */
export type WrittenQuery = { statementId: string; tool: WidgetToolName; args: unknown };

/** The parsed widget's Queries of our Widget tools, in order; a Query of a tool that does not exist is left out. */
function writtenQueries(result: ParseResult): WrittenQuery[] {
  return result.queryStatements.flatMap((q) => {
    const tool = q.toolAST?.k === "Str" ? q.toolAST.v : undefined;
    return isWidgetToolName(tool) ? [{ statementId: q.statementId, tool, args: literalValue(q.argsAST) }] : [];
  });
}

/** A widget's Queries of our Widget tools, as written; none when the code does not parse. */
export function widgetQueries(code: string): WrittenQuery[] {
  try {
    return writtenQueries(parser.parse(code));
  } catch {
    return [];
  }
}

/** True when `value` has every value written out in `written`, at the same places; the open parts take anything. */
function holds(value: unknown, written: unknown): boolean {
  if (written === WORKED_OUT || written === undefined) return true;
  if (Array.isArray(written)) return Array.isArray(value) && value.length === written.length && written.every((w, i) => holds(value[i], w));
  if (isRecord(written)) return isRecord(value) && Object.entries(written).every(([key, w]) => holds(value[key], w));
  return value === written;
}

/**
 * True when a tool call in the browser answers this Query: the same tool, with every argument the Query writes
 * out. The browser does not say which Query it runs, so the arguments tell: Query("case_data", {dataset: $pick})
 * is answered whatever dataset is picked, and two Queries of emi that write different loan lengths each get
 * their own calls.
 */
export function answers(query: WrittenQuery, tool: WidgetToolName, args: unknown): boolean {
  return query.tool === tool && holds(args, query.args);
}

/** What a widget is made of; see widgetParts. */
export type WidgetParts = { title: string | null; components: string[]; tools: WidgetToolName[]; datasets: string[] };

/**
 * What a widget is made of, read by the parser (not by matching text): its title; the names of the components
 * inside it, deep through Stacks, Cards and Tabs, in the order written (a GuidedTasks' own tasks are read by
 * widgetTaskTexts instead); the Widget tools its Queries call; and the Case Data references its
 * Query("case_data") calls read. E.g. { title: "What the annuity is worth today", components: ["Slider",
 * "AnnuityChart"], tools: [], datasets: [] }.
 */
export function widgetParts(code: string): WidgetParts {
  try {
    const result = parser.parse(code);
    const root = result.root;
    const title = typeof root?.props.title === "string" ? root.props.title : null;
    const components = [...walkNodes(root?.props.children)].map((n) => n.typeName).filter((name) => name !== "GuidedTask");
    const calls = writtenQueries(result);
    const datasets = calls.flatMap(({ tool, args }) => {
      const dataset = tool === "case_data" && isRecord(args) ? args.dataset : undefined;
      return typeof dataset === "string" && CASE_DATA_REFERENCE.test(dataset) ? [dataset] : [];
    });
    return { title, components, tools: [...new Set(calls.map((c) => c.tool))], datasets: [...new Set(datasets)] };
  } catch {
    return { title: null, components: [], tools: [], datasets: [] };
  }
}

/**
 * What the Tutor is told about a Widget code opened for it: each slider's $variable, label, range, the step it
 * moves by and its starting value, e.g. "$old (Old rate): 0 to 10 in steps of 0.01, starting at 5", then each Guided
 * Task. Read by the parser, so it says only what the Widget can show.
 */
export function widgetControls(code: string): { sliders: string[]; tasks: string[] } {
  try {
    const result = parser.parse(code);
    const start = result.stateDeclarations as Record<string, unknown>;
    const sliders = [...walkNodes(result.root?.props.children)].flatMap((n) => {
      const { label, min, max, step, unit } = n.props;
      const variable = stateRefName(n.props.value);
      if (n.typeName !== "Slider" || !variable || typeof min !== "number" || typeof max !== "number" || typeof step !== "number") return [];
      const moves = sliderStep({ min, max, step, unit: typeof unit === "string" ? unit : undefined });
      return [`${variable} (${typeof label === "string" ? label : variable}): ${min} to ${max} in steps of ${moves}, starting at ${start[variable]}`];
    });
    return { sliders, tasks: parsedTasks(result.root?.props.children).map((t) => t.text) };
  } catch {
    return { sliders: [], tasks: [] };
  }
}

/** The components of a Widget, read by the parser, deep through Stacks, Cards and Tabs; none when the code does not parse. */
export function widgetNodes(code: string): ParsedNode[] {
  try {
    return [...walkNodes(parser.parse(code).root?.props.children)];
  } catch {
    return [];
  }
}

/** The text of each Guided Task in a Widget, in order; none when it has no Guided Tasks. */
export function widgetTaskTexts(code: string): string[] {
  try {
    return parsedTasks(parser.parse(code).root?.props.children).map((t) => t.text);
  } catch {
    return [];
  }
}

/** A Widget open in the panel: its title and the code it draws now. */
export type OpenWidget = { title: string; code: string };

/**
 * The Widgets open in a Session, from its replies' text in order: every finished Widget that draws, one per
 * title, in the tab order the panel shows. A later Widget with the same title updates the earlier one in
 * place: it keeps the earlier one's place and takes its code.
 */
export function openWidgetsIn(replies: readonly string[]): OpenWidget[] {
  const byTitle = new Map<string, string>();
  for (const reply of replies) {
    for (const s of splitReply(reply)) {
      if (s.type !== "widget" || !s.complete || widgetProblems(s.code).length) continue;
      const title = widgetParts(s.code).title?.trim();
      if (title) byTitle.set(title, s.code);
    }
  }
  return [...byTitle].map(([title, code]) => ({ title, code }));
}
