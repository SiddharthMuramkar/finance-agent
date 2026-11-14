import { parsedSliders, walkNodes } from "../widgets/guided-tasks.ts";
import { declaredSettings } from "../widgets/settings.ts";

// Home's Explorable (the owner's design E, 11 Nov 2026) draws Present value's annuity by code, outside OpenUI. It reads
// the annuity from the Topic file's written-ahead Widget, so Home and the Topic never disagree: the AnnuityChart's
// written numbers, the Slider bound to its rate, and the Case Data figure it is set against.
// Pure, with no "@/" imports and no parser of its own: the caller parses the code (the app with src/widgets/check.ts,
// the course check under plain Node with its own parser), so this runs in both.

/** Present value's annuity, its rate slider, and the sourced figure it is set against, as Home draws them. */
export type HomeAnnuity = {
  total: number;
  payments: number;
  growthPercent: number;
  /** The calendar year of the first payment, which is paid now. */
  firstYear: number;
  /** The Case Data reference of the figure the annuity is set against: "caseId/datasetId". */
  compareTo: string;
  rate: { label: string; min: number; max: number; step: number; start: number };
};

export type HomeAnnuityRead = { ok: true; annuity: HomeAnnuity } | { ok: false; problems: string[] };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The annuity in a Widget, from its code and its parsed root children (null when the code could not be parsed), or
 * what stops Home drawing it (each problem says what is missing).
 */
export function readHomeAnnuity(code: string, children: unknown): HomeAnnuityRead {
  if (children == null) return { ok: false, problems: ["cannot be parsed"] };
  const nodes = [...walkNodes(children)];
  const chart = nodes.find((n) => n.typeName === "AnnuityChart");
  if (!chart) return { ok: false, problems: ["has no AnnuityChart"] };

  const { total, payments, growthPercent, ratePercent, compareTo, firstYear } = chart.props;
  const problems: string[] = [];
  if (!num(total) || !num(payments) || !num(growthPercent)) problems.push("its AnnuityChart's total, payments and growth are not written numbers");
  if (typeof compareTo !== "string") problems.push("its AnnuityChart has no compareTo figure");
  if (!num(firstYear)) problems.push("its AnnuityChart has no firstYear");
  const variable = isRecord(ratePercent) && ratePercent.k === "StateRef" && typeof ratePercent.n === "string" ? ratePercent.n : null;
  if (!variable) problems.push("its AnnuityChart's rate is not a $variable");
  if (problems.length) return { ok: false, problems };

  const slider = parsedSliders(children).find((s) => s.variable === variable);
  const node = nodes.find((n) => n.typeName === "Slider" && isRecord(n.props.value) && n.props.value.n === variable);
  if (!slider || !node) return { ok: false, problems: [`has no Slider for the AnnuityChart's rate (${variable})`] };
  const start = declaredSettings(code)[variable!];
  if (!num(start)) return { ok: false, problems: [`has no starting number for ${variable}`] };
  const label = typeof node.props.label === "string" ? node.props.label : variable!;

  return {
    ok: true,
    annuity: {
      total: total as number,
      payments: payments as number,
      growthPercent: growthPercent as number,
      firstYear: firstYear as number,
      compareTo: compareTo as string,
      rate: { label, min: slider.min, max: slider.max, step: slider.step, start },
    },
  };
}
