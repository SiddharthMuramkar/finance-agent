import { createParser, type LibraryJSONSchema } from "@openuidev/lang-core";
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
    return problems;
  } catch (e) {
    return [`The code could not be parsed: ${e instanceof Error ? e.message : String(e)}`];
  }
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
