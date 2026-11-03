import { createParser, type ASTNode, type LibraryJSONSchema, type ParseResult } from "@openuidev/lang-core";
import { CALCULATOR_IDS, CALCULATORS } from "@/finance/calculators";
import { FORMULAS, formulaById } from "@/finance/formulas";
import frozen from "./frozen.generated.json";
import { guidedTaskProblems, parsedTasks, walkNodes } from "./guided-tasks";
import { splitReply } from "./split";
import { CASE_DATA_REFERENCE, isWidgetToolName, WIDGET_TOOL_ARGS, WIDGET_TOOL_NAMES, type WidgetToolName } from "./tool-specs";

/** Opens the message code sends when a finished widget fails the check. */
export const WIDGET_CHECK_PREFIX = "Widget check by code:";

const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");

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

const FENCE = /```openui-lang\n[\s\S]*?\n```/g;

/** Swaps each broken widget block in `text`, in order, for the next block in `correction`. */
export function replaceBrokenWidgets(text: string, correction: string): string {
  const fixes = correction.match(FENCE) ?? [];
  const broken = new Set(replyWidgetProblems(text).map((b) => b.index));
  let index = 0;
  return text.replace(FENCE, (block) => (broken.has(index++) && fixes.length ? fixes.shift()! : block));
}

/**
 * What a widget is made of, read by the parser (not by matching text): its title and the names of the
 * components inside it, e.g. { title: "What the annuity is worth today", components: ["Slider", "AnnuityChart"] }.
 */
export function widgetParts(code: string): { title: string | null; components: string[] } {
  try {
    const root = parser.parse(code).root;
    const title = typeof root?.props.title === "string" ? root.props.title : null;
    const children: unknown[] = Array.isArray(root?.props.children) ? root.props.children : [];
    const components = children.flatMap((c) => {
      const name = c && typeof c === "object" ? (c as { typeName?: unknown }).typeName : undefined;
      return typeof name === "string" ? [name] : [];
    });
    return { title, components };
  } catch {
    return { title: null, components: [] };
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
