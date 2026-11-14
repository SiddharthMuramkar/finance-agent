import { DEFAULT_EFFORT, TUTOR_MODEL, type Effort } from "@/tutor/model";
import { PRICES } from "@/tutor/pricing";

/**
 * The comparisons used to put different models side by side. The app has one model now, so they put its reasoning
 * efforts side by side. A variant is named `gpt-6.1-sol@high`: the model, an `@`, the effort (medium when left out).
 * The name is what the report and the saved rows show as the "model".
 */
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export type Variant = { model: string; effort: Effort };

/** The label a variant is reported under. */
export const variantLabel = (v: Variant): string => `${v.model}@${v.effort}`;

/** The variant a label names; throws for an unknown effort, or a model with no price (its spend could not be capped). */
export function parseVariant(label: string): Variant {
  const [model, effort = DEFAULT_EFFORT, ...rest] = label.trim().split("@");
  if (!model || rest.length || !(EFFORTS as readonly string[]).includes(effort)) throw new Error(`"${label}" is not a variant such as ${TUTOR_MODEL}@high (an effort of ${EFFORTS.join(", ")}).`);
  if (!PRICES[model]) throw new Error(`The model "${model}" has no price in src/tutor/pricing.ts, so its spend cannot be capped.`);
  return { model, effort: effort as Effort };
}

/** The variants from COMPARE_MODELS ("a,b,c"), or `fallback` when it is empty. */
export function parseVariants(raw: string | undefined, fallback: readonly string[]): string[] {
  const labels = (raw && raw.trim() ? raw.split(",") : [...fallback]).map((s) => s.trim()).filter(Boolean);
  for (const l of labels) parseVariant(l);
  return labels;
}
