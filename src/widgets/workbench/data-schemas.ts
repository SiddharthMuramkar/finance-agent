import { z } from "zod";
import { isIconName } from "@/icons/names";

// The figures a Workbench Widget takes from the Topic file beside its Valuation Case (spec 2026-11-12, B4; ADR 0010), each
// with its source: the Widget part, the recipe and the Widget check parse them with these same schemas, so a figure that
// passes one passes all three. Lever settings are not here: they are Widget state.

export const sourceSchema = z.object({ title: z.string().trim().min(3).max(200), url: z.url() }).strict();

/** Leases the Topic counts as debt in the Value bridge (WeWork's lease obligations, Spine Topic 9). */
export const leasesSchema = z
  .object({ amount: z.number().min(0), label: z.string().trim().min(3).max(60).describe('What they are, such as "WeWork-style leases"'), source: sourceSchema })
  .strict();

/** A Case's figures for the Cost of capital stack, in percent (relative risk a plain number). */
export const costOfCapitalFiguresSchema = z
  .object({
    riskFree: z.number().min(0).max(30),
    equityPremium: z.number().min(0).max(20),
    relativeRisk: z.number().min(0).max(5),
    debtShare: z.number().min(0).max(100),
    costOfDebt: z.number().min(0).max(40),
    taxRate: z.number().min(0).max(100),
  })
  .strict();

const currencySchema = z.enum(["USD", "INR"]);
const unitSchema = z.enum(["millions", "crores", "billions"]);

/** A company's year for the Cash waterfall when it has no Valuation Case: this year's revenue, its tax, and where the levers open. */
export const companyYearSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    currency: currencySchema,
    unit: unitSchema,
    /** This year's revenue, in the unit. */
    revenue: z.number().positive(),
    taxPercent: z.number().min(0).max(100),
    lossesCarried: z.number().min(0).optional(),
    opening: z.object({ growth: z.number().gt(-100), margin: z.number().gt(-1000).lt(100), salesToCapital: z.number().positive() }).strict(),
    source: sourceSchema,
  })
  .strict();

/** An Icon from the set, by name (src/icons/names.ts), as a Topic file writes it. */
export const iconNameSchema = z.string().trim().refine(isIconName, { message: "is not an Icon name (src/icons/names.ts)" });

/**
 * A company and the multiple of revenue it trades at, with its source (Multiple decoder). The Icon and the short sourced
 * fact are the row's picture and its one plain figure ("604,000 desks"), so two near-equal desk piles priced far apart read
 * as two piles and not as two dots; both are optional, and the Learner's own mark on the scale has neither.
 */
export const tradedMultipleSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    multiple: z.number().positive(),
    source: sourceSchema,
    icon: iconNameSchema.optional(),
    note: z.string().trim().min(2).max(20).optional(),
  })
  .strict();

/** What the Multiple decoder holds still while growth, risk and margin move. */
export const decoderAssumptionsSchema = z
  .object({ taxPercent: z.number().min(0).max(100), salesToCapital: z.number().positive(), growthAfterPercent: z.number().min(-5).max(10) })
  .strict();

/** Where the Multiple decoder's levers open, in percent. */
export const decoderOpeningSchema = z.object({ growth: z.number().min(-50).max(200), risk: z.number().positive().max(40), margin: z.number().min(-100).max(90) }).strict();

/** The Multiple decoder's figures, checked together: growth after year 10 must stay below the opening cost of capital. */
export const decoderFiguresSchema = z
  .object({ subject: tradedMultipleSchema, peers: z.array(tradedMultipleSchema).min(1).max(3), assumptions: decoderAssumptionsSchema, opening: decoderOpeningSchema })
  .refine((d) => d.assumptions.growthAfterPercent < d.opening.risk, { message: "growth after year 10 must be below the opening cost of capital", path: ["assumptions", "growthAfterPercent"] });

const leverSettingsSchema = z
  .object({ revenue: z.number().optional(), margin: z.number().optional(), salesToCapital: z.number().optional(), risk: z.number().optional(), failure: z.number().optional() })
  .strict();

/** A story the Topic file names, as Value levers settings in the readouts' units (revenue in $bn for Amazon, percents). */
export const topicStorySchema = z.object({ label: z.string().trim().min(3).max(40), levers: leverSettingsSchema }).strict();

/** A market lever 1 is a share of (Spine Topic 4): its size today in the Case's unit, how fast it grows a year, and its source. */
export const marketSchema = z
  .object({ label: z.string().trim().min(3).max(40), size: z.number().positive(), growthPercent: z.number().min(-20).max(50).optional(), source: sourceSchema })
  .strict();

/** A rival's or an industry's operating margin, marked on lever 2 (Spine Topic 5). */
export const marginMarkSchema = z.object({ label: z.string().trim().min(3).max(40), percent: z.number().min(-50).max(90), source: sourceSchema }).strict();

/** A band of a lever the Learner is unsure of, low and high, in the lever's units (Spine Topic 14). */
const bandSchema = z.tuple([z.number(), z.number()]).refine(([low, high]) => low < high, "the low end must be below the high end");

/**
 * What Value levers adds for a Spine Topic (Appendix D): each mode swaps one readout (or, for failure, which lever is under
 * More settings, and for all open, opens it), never adding controls beyond four at rest and one more.
 */
export const valueLeversModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("market"), markets: z.array(marketSchema).min(1).max(2) }).strict(),
  z.object({ kind: z.literal("margin_marks"), marks: z.array(marginMarkSchema).min(1).max(3) }).strict(),
  z.object({ kind: z.literal("roic") }).strict(),
  z.object({ kind: z.literal("failure") }).strict(),
  z.object({ kind: z.literal("two_stories"), stories: z.tuple([topicStorySchema, topicStorySchema]) }).strict(),
  z.object({ kind: z.literal("match_price") }).strict(),
  z
    .object({
      kind: z.literal("range"),
      bands: z.object({ revenue: bandSchema.optional(), margin: bandSchema.optional(), salesToCapital: bandSchema.optional(), risk: bandSchema.optional(), failure: bandSchema.optional() }).strict().optional(),
    })
    .strict(),
  // all_open (Spine Topic 15): every lever open, "Save my story", and optionally a short list of Cases the Learner can switch
  // between with a chip, each its Case id and the company's name for the chip and the saved note's title.
  z
    .object({
      kind: z.literal("all_open"),
      cases: z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1).max(40) }).strict()).min(2).max(3).optional(),
    })
    .strict(),
]);

export type ValueLeversMode = z.infer<typeof valueLeversModeSchema>;
export type ValueLeversModeKind = ValueLeversMode["kind"];
export const VALUE_LEVERS_MODE_KINDS = valueLeversModeSchema.options.map((o) => o.shape.kind.value) as ValueLeversModeKind[];
export type Market = z.infer<typeof marketSchema>;
export type MarginMark = z.infer<typeof marginMarkSchema>;
export type TopicStory = z.infer<typeof topicStorySchema>;
