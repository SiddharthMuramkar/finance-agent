import { createParser, type LibraryJSONSchema } from "@openuidev/lang-core";
import { FORMULAS, formulaById } from "@/finance/formulas";
import frozen from "./frozen.generated.json";
import { splitReply } from "./split";

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
    return problems;
  } catch (e) {
    return [`The code could not be parsed: ${e instanceof Error ? e.message : String(e)}`];
  }
}

type Node = { typeName?: unknown; statementId?: string; props?: Record<string, unknown> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stateRefName = (v: unknown): string | undefined => (isRecord(v) && v.k === "StateRef" && typeof v.n === "string" ? v.n : undefined);

/**
 * Problems in the widget's Formula Cards, which the parser cannot see: an unknown formula or symbol, a
 * card input bound to no Slider, a symbol given under more than one of inputs, sourced and fixed, and a
 * symbol of the formula not given at all. They feed the same correction turn as any other widget problem.
 */
function formulaCardProblems(children: unknown): string[] {
  const nodes = (Array.isArray(children) ? children : []).filter((c): c is Node => isRecord(c));
  const sliderVars = new Set(nodes.filter((n) => n.typeName === "Slider").map((n) => stateRefName(n.props?.value)));
  return nodes
    .filter((n) => n.typeName === "FormulaCard")
    .flatMap((card) => {
      const where = card.statementId ?? "FormulaCard";
      const formula = typeof card.props?.formula === "string" ? formulaById(card.props.formula) : undefined;
      if (!formula) return [`${where}: formula is not in the formula registry. Use one of: ${FORMULAS.map((f) => f.id).join(", ")}.`];
      const maps = (["inputs", "sourced", "fixed"] as const).map(
        (name) => [name, isRecord(card.props?.[name]) ? (card.props[name] as Record<string, unknown>) : {}] as const,
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
