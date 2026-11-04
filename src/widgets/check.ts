import { createParser, evaluate, type ASTNode, type LibraryJSONSchema, type ParseResult } from "@openuidev/lang-core";
import { CALCULATOR_IDS, CALCULATORS } from "@/finance/calculators";
import { FORMULAS, formulaById } from "@/finance/formulas";
import type { CoveredParts } from "@/course/written-ahead";
// The frozen schema alone: the browser draws widgets with this check, and needs none of the instructions' text.
import frozenSchema from "./frozen-schema.generated.json";
import { broadTaskWarnings, guidedTaskProblems, parsedTasks, walkNodes, type ParsedNode } from "./guided-tasks";
import { quickCheckProblem, rankProblem } from "./part-rules";
import { sliderStep } from "./slider-steps";
import { splitReply } from "./split";
import { CASE_DATA_REFERENCE, isWidgetToolName, WIDGET_TOOL_ARGS, WIDGET_TOOL_NAMES, type WidgetToolName } from "./tool-specs";
import { ICON_NAMES, isKnownObject } from "./primitives/wave1/icons";
import type { Archetype } from "./recipes/define";
import { REFERENCE_CASE } from "@/case-data/reference";

/** How a reference dataset's reference starts: "reference/usd-inr". */
const REFERENCE_PREFIX = `${REFERENCE_CASE}/`;

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
    problems.push(...partProblems(result.root?.props.children));
    problems.push(...toolProblems(result));
    return problems;
  } catch (e) {
    return [`The code could not be parsed: ${e instanceof Error ? e.message : String(e)}`];
  }
}

/**
 * Correctness errors in the v2 parts' written arguments (UX audit §7.6), which the parser cannot see: a QuickCheck
 * whose answer index is out of range or that has not 2 to 4 options, and a Rank whose order or reasons do not fit
 * its items. Arguments the browser works out are left alone.
 */
function partProblems(children: unknown): string[] {
  return [...walkNodes(children)].flatMap((n) => {
    const where = n.statementId ?? n.typeName;
    const { props } = n;
    if (n.typeName === "QuickCheck" && Array.isArray(props.options) && typeof props.answer === "number") {
      const problem = quickCheckProblem(props.options, props.answer);
      return problem ? [`${where}: ${problem}`] : [];
    }
    if (n.typeName === "Rank" && Array.isArray(props.items) && Array.isArray(props.correctOrder) && Array.isArray(props.reasons)) {
      const order = props.correctOrder.every((v) => typeof v === "number") ? (props.correctOrder as number[]) : null;
      const problem = order && rankProblem(props.items, order, props.reasons);
      return problem ? [`${where}: ${problem}.`] : [];
    }
    return [];
  });
}

/** The information budget of a Widget at rest (UX audit ★.7): what a free-form Widget is warned past. */
export const WIDGET_BUDGET = { controls: 1, numbers: 3, visuals: 1, words: 25, callouts: 1, tasks: 3 } as const;

/** Parts the Learner sets a value with. */
const CONTROLS = new Set(["Slider", "Select", "SwitchGroup", "Chips"]);

/** Parts that are a Widget's one visual: our pictures and the kit's charts and tables. */
export const VISUALS = new Set([
  ...["AnnuityChart", "HistoryChart", "Calculator", "FormulaCard"],
  ...["Versus", "Breakeven", "MoneyStack", "Waffle", "Pictogram", "RateMove", "DrawTheLine", "PriceTag", "ShrinkingNote", "TimeTravel", "StepThrough", "Rank", "Waterfall"],
  ...["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart", "Table"],
]);

/** Parts that each show one number. */
const NUMBER_PARTS: Record<string, number> = { Stat: 1, Versus: 2, Predict: 1, PriceTag: 1, ShrinkingNote: 1 };

/** Parts whose text counts toward the 25 words, by the props that hold it. */
const TEXT_PROPS: Record<string, string[]> = { TextContent: ["text"], Callout: ["title", "description"], TextCallout: ["title", "description"] };

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The words a text prop shows: its own, or for an expression the most either branch of a choice can show. */
function textWords(value: unknown): number {
  if (typeof value === "string") return wordCount(value);
  if (!isRecord(value)) return 0;
  if (value.k === "Str" && typeof value.v === "string") return wordCount(value.v);
  if (value.k === "Ternary") return Math.max(textWords(value.then), textWords(value.else));
  if (value.k === "BinOp") return textWords(value.left) + textWords(value.right);
  return 0;
}

/** The parts inside each `container` part of a Widget, at any depth. */
function insideOf(nodes: readonly ParsedNode[], container: string): Set<ParsedNode> {
  return new Set(nodes.filter((n) => n.typeName === container).flatMap((n) => [...walkNodes(Object.values(n.props))]));
}

/** True when a parsed expression joins text and a non-text value with + ("Total: " + $x). */
function joinsNumberIntoText(value: unknown): boolean {
  if (!isRecord(value)) return Array.isArray(value) && value.some(joinsNumberIntoText);
  // A part inside this one is checked on its own.
  if (typeof value.typeName === "string" && isRecord(value.props)) return false;
  if (value.k === "BinOp" && value.op === "+") {
    const isText = (side: unknown) => isRecord(side) && side.k === "Str";
    if (isText(value.left) !== isText(value.right)) return true;
  }
  return Object.values(value).some(joinsNumberIntoText);
}

/** Parts whose written text may hold a number the Learner reads. */
const NUMBER_TEXT_PARTS = new Set(["TextContent", "InlineHeader", "Calculator", "TextCallout", "Callout", "Stat", "Verdict"]);

/** Numbers in a text as digits with no commas or trailing zeros: "₹35.82" and "35.820" both give "35.82". Small counts and years are skipped. */
function normalisedNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((m) => String(Number(m.replace(/,/g, "")))).filter((m) => m.replace(/\D/g, "").length >= 3 && !/^(19|20)\d\d$/.test(m));
}

/** Warnings for a number shown in more than one part (a Stat's value, or a figure in a TextContent). */
function repeatedNumbers(nodes: readonly ParsedNode[]): string[] {
  const seen = new Map<string, Set<number>>();
  nodes.forEach((n, index) => {
    if (!NUMBER_TEXT_PARTS.has(n.typeName)) return;
    const found = Object.values(n.props).flatMap((v) => (typeof v === "string" ? normalisedNumbers(v) : n.typeName === "Stat" && typeof v === "number" ? normalisedNumbers(String(v)) : []));
    for (const number of found) seen.set(number, (seen.get(number) ?? new Set<number>()).add(index));
  });
  return [...seen].filter(([, places]) => places.size > 1).map(([number]) => `${number} is shown twice: show each number once, in a Stat, and say what it means in prose.`);
}

/**
 * Warnings about a widget that still draws and teaches, so they never trigger a correction round (UX audit §7.6):
 * code sends them with the next turn as "Widget notes". A Guided Task that most of a slider's range ticks; the
 * information budget (★.7: one control outside "More settings", three numbers, one visual outside Tabs, 25 words,
 * one TextCallout, three tasks); a number joined into text with +; typed numbers where a Query could give them; and a
 * Pictogram object we do not draw. Empty when there is nothing to say.
 */
export function widgetWarnings(code: string): string[] {
  let result: ParseResult;
  try {
    result = parser.parse(code);
  } catch {
    return [];
  }
  const children = result.root?.props.children;
  const holds = (condition: unknown, values: Record<string, unknown>) =>
    evaluate(condition as never, { getState: (name) => values[name], resolveRef: () => undefined }) === true;
  const warnings = broadTaskWarnings(children, result.stateDeclarations as Record<string, unknown>, holds);
  const nodes = [...walkNodes(children)];
  const inMore = insideOf(nodes, "Accordion");
  const inTabs = insideOf(nodes, "Tabs");
  const controls = nodes.filter((n) => CONTROLS.has(n.typeName) && !inMore.has(n)).length;
  if (controls > WIDGET_BUDGET.controls) warnings.push(`${controls} controls are showing: keep one primary control and put the others in Accordion "More settings".`);
  const visuals = nodes.filter((n) => VISUALS.has(n.typeName) && !inTabs.has(n)).length + nodes.filter((n) => n.typeName === "Tabs").length;
  if (visuals > WIDGET_BUDGET.visuals) warnings.push(`${visuals} visuals: use exactly one (Tabs only for the same numbers as a chart and a table).`);
  const numbers = nodes.reduce((sum, n) => sum + (NUMBER_PARTS[n.typeName] ?? 0), 0);
  if (numbers > WIDGET_BUDGET.numbers) warnings.push(`${numbers} numbers are showing: keep to ${WIDGET_BUDGET.numbers} at rest.`);
  const words = nodes.reduce((sum, n) => sum + (TEXT_PROPS[n.typeName] ?? []).reduce((w, prop) => w + textWords(n.props[prop]), 0), 0);
  if (words > WIDGET_BUDGET.words) warnings.push(`${words} words of text: keep a Widget to ${WIDGET_BUDGET.words}, and say the rest in prose.`);
  const callouts = nodes.filter((n) => n.typeName === "TextCallout").length;
  if (callouts > WIDGET_BUDGET.callouts) warnings.push(`${callouts} TextCallouts: use one at most.`);
  const tasks = parsedTasks(children).length;
  if (tasks > WIDGET_BUDGET.tasks) warnings.push(`${tasks} Guided Tasks: use ${WIDGET_BUDGET.tasks} at most, the last a discovery.`);
  warnings.push(...repeatedNumbers(nodes));
  for (const n of nodes) {
    const where = n.statementId ?? n.typeName;
    if (Object.values(n.props).some(joinsNumberIntoText)) warnings.push(`${where}: a number is joined into text with +. Show it with Stat.`);
    if (n.typeName === "Predict" && typeof n.props.actual === "number") warnings.push(`${where}: Predict's actual is typed. Give it from a Query or Case Data.`);
    if (n.typeName === "Versus" && typeof n.props.leftValue === "number" && typeof n.props.rightValue === "number") {
      warnings.push(`${where}: both Versus values are typed. Give them from a Query, a calculator or Case Data where one can.`);
    }
    if (n.typeName === "Pictogram" && typeof n.props.object === "string" && !isKnownObject(n.props.object)) {
      warnings.push(`${where}: Pictogram has no "${n.props.object}", so it draws coins. Use one of: ${ICON_NAMES.join(", ")}.`);
    }
  }
  return warnings;
}

/** The kit's charts, which a slider moves. */
const CHARTS = ["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart"];

/** The parts that are a Widget's discovery of their own, so its sliders need no Guided Task (grammar v2). */
const DISCOVERY_PARTS = new Set(["Breakeven", "Predict", "DrawTheLine", "QuickCheck", "Rank"]);

/**
 * The archetype of a Widget (UX audit §7.4), from the parts it uses: the same names as the Widget recipes'
 * archetypes, so code can tell the Tutor the recent ones and it varies them. Null for a Widget of no clear shape.
 */
export function archetypeOf(code: string): Archetype | null {
  const { components, tools, datasets } = widgetParts(code);
  const has = (...names: string[]) => names.some((name) => components.includes(name));
  if (has("QuickCheck")) return "Check";
  // A quiz of dropdowns: Selects with no slider to move and nothing drawn.
  if (has("Select") && !has("Slider", ...CHARTS)) return "Check";
  if (has("Predict", "DrawTheLine")) return "Predict";
  if (has("Rank")) return "Rank";
  if (has("StepThrough", "Steps")) return "Chain";
  // Two datasets drawn side by side are a comparison, not a history. A reference dataset is only a backdrop.
  const compared = datasets.filter((d) => !d.startsWith(REFERENCE_PREFIX));
  if (has("Versus", "Breakeven", "Verdict") || compared.length > 1) return "Compare";
  if (has("Waffle", "Pictogram", "RateMove")) return "Convert";
  if (has("FormulaCard")) return "Formula";
  if (has("HistoryChart") || datasets.length > 0) return "History";
  if (has("Slider") && has(...CHARTS)) return "Grow";
  if (has("MoneyStack", "PriceTag", "ShrinkingNote", "TimeTravel", "AnnuityChart", "Calculator", "Stat", "Waterfall") || tools.length > 0) return "Grow";
  return null;
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

/** Parts that name a Case Data reference in their own dataset argument. */
const DATASET_PARTS = new Set(["HistoryChart", "DrawTheLine", "Predict"]);

/** The Case Data references a parsed Widget draws, through Query("case_data") or a HistoryChart. */
function caseDataDrawn(result: ParseResult): string[] {
  const queried = writtenQueries(result).flatMap(({ tool, args }) => (tool === "case_data" && isRecord(args) && typeof args.dataset === "string" ? [args.dataset] : []));
  const charted = [...walkNodes(result.root?.props.children)].flatMap((n) => (DATASET_PARTS.has(n.typeName) && typeof n.props.dataset === "string" ? [n.props.dataset] : []));
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
  const discovery = nodes.some((n) => DISCOVERY_PARTS.has(n.typeName));
  if (nodes.some((n) => n.typeName === "Slider") && !discovery && !parsedTasks(root.props.children).length) {
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
    // Reference data (reference/<id>, such as USD/INR) is a shared backdrop, which several Widgets may draw.
    const shared = caseDataDrawn(otherResult).filter((ref) => drawn.includes(ref) && !ref.startsWith(REFERENCE_PREFIX));
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

/** A flagged Widget of the reply: its position, its problems, and whether the written-ahead rule leaves it out. */
export type BrokenWidget = { index: number; problems: string[]; leaveOut?: true };

/**
 * Everything wrong with each finished Widget of the reply being written, by widget position: what stops it
 * drawing, then the Widget rules (widgetRuleProblems) and the written-ahead rule for the Topic's written-ahead
 * Widgets (`covered`), which marks it `leaveOut`. Each Widget is compared with the Widgets open before the reply
 * (`open`, their code) and with those earlier in the same reply. Widgets with no problem are left out. When code already
 * showed a Widget from a recipe in this reply (`shownInReply`, show_widget), every fence is to be left out: one Widget a reply.
 */
export function newReplyWidgetProblems(text: string, open: readonly string[] = [], covered: readonly CoveredParts[] = [], shownInReply = false): BrokenWidget[] {
  const seen = [...open];
  return splitReply(text)
    .filter((s) => s.type === "widget")
    .flatMap((s, index) => {
      // One Widget per reply: when code already showed one from a recipe (show_widget) in this reply, a fence is left out.
      const ahead = shownInReply ? [`this reply already shows a Widget through show_widget, and a reply shows one Widget: ${LEAVE_OUT}.`] : writtenAheadPartProblems(s.code, covered);
      const problems = shownInReply ? ahead : [...widgetProblems(s.code), ...widgetRuleProblems(s.code, seen), ...ahead];
      seen.push(s.code);
      return problems.length ? [{ index, problems, ...(ahead.length > 0 && { leaveOut: true as const }) }] : [];
    });
}

/**
 * The correction message code sends for the reply's flagged Widgets. When some are to be left out (the written-ahead
 * rule), the Tutor writes no block for those; the others it writes again in full, in order.
 */
export function widgetCheckMessage(broken: readonly BrokenWidget[]): string {
  const problems = broken.flatMap((b) => b.problems.map((p) => `- Widget ${b.index + 1}: ${p}`));
  const close = !broken.some((b) => b.leaveOut)
    ? "Reply with only the corrected openui-lang block, written in full. Write no prose."
    : broken.every((b) => b.leaveOut)
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
    const queried = calls.flatMap(({ tool, args }) => {
      const dataset = tool === "case_data" && isRecord(args) ? args.dataset : undefined;
      return typeof dataset === "string" && CASE_DATA_REFERENCE.test(dataset) ? [dataset] : [];
    });
    const written = [...walkNodes(root?.props.children)].flatMap((n) =>
      (n.typeName === "DrawTheLine" || n.typeName === "Predict") && typeof n.props.dataset === "string" && CASE_DATA_REFERENCE.test(n.props.dataset) ? [n.props.dataset] : [],
    );
    const datasets = [...queried, ...written];
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
