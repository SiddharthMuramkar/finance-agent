import { justifiedMultiple, HIGH_GROWTH_YEARS } from "@/finance/justified-multiple";
import type { IconName } from "@/icons/names";
import {
  benchShape,
  ceilTo,
  floorTo,
  percentLever,
  percentText,
  type BenchHeadline,
  type BenchLever,
  type BenchNumber,
  type BenchReading,
  type BenchShape,
  type Source,
} from "./bench";

// Multiple decoder (spec 2026-11-12, B4; Spine Topic 12), as pure functions: growth, risk and margin set the multiple of
// revenue they justify (justifiedMultiple, the one valuation engine on one unit of revenue), shown beside what the company
// and its peers trade at, each multiple from the Topic file with its source. The lesson: a multiple hides a view on growth,
// risk and margins. The other figures the engine needs (tax, sales for each dollar invested, growth after year 10) come from
// the Topic file too, so no Case number is written here.

export const DECODER_LEVER_IDS = ["growth", "risk", "margin"] as const;
export type DecoderLeverId = (typeof DECODER_LEVER_IDS)[number];
export type DecoderSettings = Record<DecoderLeverId, number>;

/**
 * A company and the multiple of revenue it trades at, with where that figure came from, and what it looks like on the
 * scale: an Icon from the set and a short sourced fact ("604,000 desks"), both from the Topic file and both optional.
 */
export type TradedMultiple = { name: string; multiple: number; source: Source; icon?: IconName; note?: string };

export type MultipleDecoderData = {
  subject: TradedMultiple;
  /** One to three peers. */
  peers: TradedMultiple[];
  assumptions: { taxPercent: number; salesToCapital: number; growthAfterPercent: number };
  opening: DecoderSettings;
};

/** A multiple as the Widget writes it: "26×", "1.4×"; nothing below zero, which justifies no price at all. */
export function multipleText(multiple: number): string {
  if (!(multiple > 0)) return "0×";
  return multiple >= 10 ? `${Math.round(multiple)}×` : `${multiple.toFixed(1)}×`;
}

/**
 * The levers: revenue growth in years 1 to 5 from 0% to 60% (or half as much again as the opening) by 1; the cost of capital
 * from 6% (at least a point above growth after year 10, so growth never reaches it) to 16% by 0.25; the margin from 0% to
 * 40% (or half as much again) by 0.5. Each opens at the Topic's figure, which is a stop.
 */
export function multipleDecoderLevers(data: MultipleDecoderData): BenchLever<DecoderLeverId>[] {
  const { growth, risk, margin } = data.opening;
  const riskMin = Math.min(risk, Math.max(floorTo(Math.min(risk, 6), 0.25), ceilTo(data.assumptions.growthAfterPercent + 1, 0.25)));
  return [
    percentLever({ id: "growth", label: `Revenue growth, years 1 to ${HIGH_GROWTH_YEARS}`, min: Math.min(0, Math.floor(growth)), max: Math.max(60, ceilTo(growth * 1.5, 10)), step: 1, opening: growth }),
    percentLever({ id: "risk", label: "Cost of capital", min: riskMin, max: Math.max(16, Math.ceil(risk) + 4), step: 0.25, opening: risk }),
    percentLever({ id: "margin", label: "Operating margin", min: Math.min(0, Math.floor(margin)), max: Math.max(40, ceilTo(margin * 1.5, 5)), step: 0.5, opening: margin }),
  ];
}

/** The multiple these settings justify; null when the engine cannot value them (its sentence comes with it). */
function justified(data: MultipleDecoderData, settings: DecoderSettings): { multiple: number } | { error: string } {
  const result = justifiedMultiple({
    growthPercent: settings.growth,
    costOfCapitalPercent: settings.risk,
    marginPercent: settings.margin,
    taxPercent: data.assumptions.taxPercent,
    salesToCapital: data.assumptions.salesToCapital,
    growthAfterPercent: data.assumptions.growthAfterPercent,
  });
  return result.ok ? { multiple: result.multiple } : { error: result.error };
}

/** The lowest and highest multiple the levers can reach, from the box's eight corners: every value in between is reached too. */
function reach(data: MultipleDecoderData): { low: number; high: number } {
  const [growth, risk, margin] = multipleDecoderLevers(data);
  // All eight corners: with a margin near nothing every cash flow is a loss, and a higher rate then raises the multiple,
  // so the lowest is not always where risk is highest.
  const corners = [growth.min, growth.max].flatMap((g) =>
    [risk.min, risk.max].flatMap((r) => [margin.min, margin.max].map((m) => justified(data, { growth: g, risk: r, margin: m }))),
  );
  const values = corners.flatMap((c) => ("multiple" in c ? [c.multiple] : []));
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** How near a justified multiple must come to a traded one for its Thing to try to tick: within a tenth of it. */
export const MATCH_SHARE = 0.1;

/** The companies whose multiple the levers can justify, each a Thing to try (B7: one the levers cannot reach is not shown). */
function targets(data: MultipleDecoderData): TradedMultiple[] {
  const { low, high } = reach(data);
  return [data.subject, data.peers[0]].filter((t) => t.multiple >= low && t.multiple <= high);
}

export function multipleDecoderTasks(data: MultipleDecoderData): string[] {
  return targets(data).map((t) => `Find settings that justify ${t.name}'s ${multipleText(t.multiple)}`);
}

export const DECODER_CAPTION = "What your settings justify, against what the market pays";
const tradesAt = (t: TradedMultiple) => `${t.name} trades at`;

/**
 * A mark on the multiple scale: the one the settings justify, or a company's. A company's may carry the Topic file's Icon
 * and its short fact; the Learner's own ("Yours") carries neither, because nothing is sourced about it.
 */
export type DecoderMark = { label: string; multiple: number; text: string; yours: boolean; icon?: IconName; note?: string };

export type MultipleDecoderModel = {
  multiple: number | null;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  marks: DecoderMark[];
  conditions: boolean[];
  error?: string;
};

/** Everything the Multiple decoder shows for these settings. */
export function multipleDecoderModel(data: MultipleDecoderData, settings: DecoderSettings): MultipleDecoderModel {
  const found = justified(data, settings);
  const companies: DecoderMark[] = [data.subject, ...data.peers].map((t) => ({ label: t.name, multiple: t.multiple, text: multipleText(t.multiple), yours: false, icon: t.icon, note: t.note }));
  const numbers = [data.subject, data.peers[0]].map((t) => ({ label: tradesAt(t), text: multipleText(t.multiple) }));
  if ("error" in found) {
    return { multiple: null, headline: { before: "These settings cannot be valued: ", key: "", after: found.error }, numbers, marks: companies, conditions: targets(data).map(() => false), error: found.error };
  }
  const { multiple } = found;
  return {
    multiple,
    headline: multiple > 0 ? { before: "Your settings justify ", key: multipleText(multiple), after: " sales" } : { before: "", key: "0×", after: ": growth that costs more than it earns" },
    numbers,
    marks: [{ label: "Yours", multiple, text: multipleText(multiple), yours: true }, ...companies],
    conditions: targets(data).map((t) => Math.abs(multiple - t.multiple) <= MATCH_SHARE * t.multiple),
  };
}

export function multipleDecoderShape(data: MultipleDecoderData): BenchShape {
  const levers = multipleDecoderLevers(data);
  const model = multipleDecoderModel(data, data.opening);
  // The notes are words inside the one visual, beside their marks, not Numbers at rest (B2): the budget counts them here
  // so a Topic file cannot slip a paragraph onto the scale, and the scale's labels and ticks are the picture itself.
  const prose = [
    `${model.headline.before}${model.headline.key}${model.headline.after}`,
    ...model.numbers.map((n) => n.label),
    DECODER_CAPTION,
    ...model.marks.flatMap((m) => (m.note ? [m.note] : [])),
  ];
  return benchShape(levers, 1 + model.numbers.length, prose, multipleDecoderTasks(data).length);
}

export function multipleDecoderReading(data: MultipleDecoderData, settings: DecoderSettings): BenchReading {
  const levers = multipleDecoderLevers(data);
  const model = multipleDecoderModel(data, settings);
  const { taxPercent, salesToCapital, growthAfterPercent } = data.assumptions;
  return {
    sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })),
    readouts: [
      model.multiple === null ? `Cannot be valued: ${model.error}` : `Justified multiple of revenue: ${multipleText(model.multiple)}`,
      ...[data.subject, ...data.peers].map((t) => `${tradesAt(t)} ${multipleText(t.multiple)} revenue (sourced: ${t.source.title})`),
      `Holding tax at ${percentText(taxPercent)}, ${salesToCapital} of sales for each unit invested and growth after year 10 at ${percentText(growthAfterPercent)}`,
    ],
  };
}
