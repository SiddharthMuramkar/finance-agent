import { z } from "zod";
import { CURRENCIES } from "@/finance/money";
import { isIconName } from "@/icons/names";
import { marketReading, marketReadingIds } from "@/markets/readings";

// The figures a Workbench Widget takes from the Topic file beside its Valuation Case (spec 2026-11-12, B4; ADR 0010), each
// with its source: the Widget part, the recipe and the Widget check parse them with these same schemas, so a figure that
// passes one passes all three. Lever settings are not here: they are Widget state.

export const sourceSchema = z
  .object({ title: z.string().trim().min(3).max(200), url: z.url() })
  .strict();

/** Leases the Topic counts as debt in the Value bridge (WeWork's lease obligations, Spine Topic 9). */
export const leasesSchema = z
  .object({
    amount: z.number().min(0),
    label: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .describe('What they are, such as "WeWork-style leases"'),
    source: sourceSchema,
  })
  .strict();

/**
 * An annual report's lines beside the Value bridge (#93: put Amazon's 2000 report into Damodaran's bridge): each line as the
 * report names it, its amount in the Case's unit, and the lever it can be put into (cash or debt), if any; one line a lever.
 */
export const bridgeReportSchema = z
  .object({
    title: z.string().trim().min(3).max(40).describe('The report, such as "Amazon\'s 10-K for 2000"'),
    lines: z
      .array(z.object({ line: z.string().trim().min(3).max(40), amount: z.number().min(0), lever: z.enum(["cash", "debt"]).optional() }).strict())
      .min(1)
      .max(3)
      .refine((lines) => ["cash", "debt"].every((lever) => lines.filter((l) => l.lever === lever).length <= 1), "one line a lever at most"),
    source: sourceSchema,
  })
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

/**
 * Market readings shown beside a Workbench's Levers (ticket #105), by id (src/markets/readings.ts): each with its month,
 * credit and link. An id the readings lack fails, so the course check's Workbench build catches it.
 */
export const marketReadingIdsSchema = z
  .array(z.string().refine((id) => marketReading(id) !== undefined, { message: `is not a Market reading; one of: ${marketReadingIds().join(", ")}` }))
  .min(1)
  .max(8);

/**
 * How the Topic's story leads the Cost of capital stack (Spine critics on #91): `equity` heads it with the cost of equity
 * and puts the story's betas on relative risk as labelled chips; `debt` puts the share of debt first, with a No debt chip.
 */
export const stackStorySchema = z
  .object({
    lead: z.enum(["equity", "debt"]),
    marks: z
      .array(
        z
          .object({
            relativeRisk: z.number().min(0).max(5),
            label: z.string().trim().min(2).max(16),
          })
          .strict(),
      )
      .max(3)
      .optional(),
  })
  .strict();
export type StackStory = z.infer<typeof stackStorySchema>;

const currencySchema = z.enum(CURRENCIES);
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
    opening: z
      .object({
        growth: z.number().gt(-100),
        margin: z.number().gt(-1000).lt(100),
        salesToCapital: z.number().positive(),
      })
      .strict(),
    /**
     * For a beginner (Spine critics round 1 on #89): the year the revenue is and the year the bench shows, as the Story
     * names them ("1999", "2000"), so the bench never says "this year" of a year long past. With them, growth reads as a
     * multiple ("13.4 times") and sales for each unit invested goes under More settings.
     */
    years: z.object({ from: z.string().trim().min(2).max(12), to: z.string().trim().min(2).max(12) }).strict().optional(),
    /** One line saying what the bench makes up, in words (its figures are the engine's, so no digits). */
    whatIf: z
      .string()
      .trim()
      .min(10)
      .max(140)
      .refine((t) => !/\d/.test(t), { message: "must use words, not digits: the bench's figures are the engine's" })
      .optional(),
    /** The company's Icon, which puts a small scene on the bench that reacts as growth moves. */
    icon: z.string().trim().refine(isIconName, { message: "is not an Icon name (src/icons/names.ts)" }).optional(),
    source: sourceSchema,
  })
  .strict();

/** An Icon from the set, by name (src/icons/names.ts), as a Topic file writes it. */
export const iconNameSchema = z
  .string()
  .trim()
  .refine(isIconName, { message: "is not an Icon name (src/icons/names.ts)" });

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
  .object({
    taxPercent: z.number().min(0).max(100),
    salesToCapital: z.number().positive(),
    growthAfterPercent: z.number().min(-5).max(10),
  })
  .strict();

/** Where the Multiple decoder's levers open, in percent. */
export const decoderOpeningSchema = z
  .object({
    growth: z.number().min(-50).max(200),
    risk: z.number().positive().max(40),
    margin: z.number().min(-100).max(90),
  })
  .strict();

/** The Multiple decoder's figures, checked together: growth after year 10 must stay below the opening cost of capital. */
export const decoderFiguresSchema = z
  .object({
    subject: tradedMultipleSchema,
    peers: z.array(tradedMultipleSchema).min(1).max(3),
    assumptions: decoderAssumptionsSchema,
    opening: decoderOpeningSchema,
  })
  .refine((d) => d.assumptions.growthAfterPercent < d.opening.risk, {
    message: "growth after year 10 must be below the opening cost of capital",
    path: ["assumptions", "growthAfterPercent"],
  });

const leverSettingsSchema = z
  .object({
    revenue: z.number().optional(),
    margin: z.number().optional(),
    salesToCapital: z.number().optional(),
    risk: z.number().optional(),
    failure: z.number().optional(),
  })
  .strict();

/** A story the Topic file names, as Value levers settings in the readouts' units (revenue in $bn for Amazon, percents). */
export const topicStorySchema = z
  .object({
    label: z.string().trim().min(3).max(40),
    levers: leverSettingsSchema,
    /** The story in words (Spine critics round 1 on #96): set beside the lever it moves, so the Widget maps story to lever. */
    says: z.string().trim().min(10).max(90).optional(),
  })
  .strict();

/** A market lever 1 is a share of (Spine Topic 4): its size today in the Case's unit, how fast it grows a year, and its source. */
export const marketSchema = z
  .object({
    label: z.string().trim().min(3).max(40),
    size: z.number().positive(),
    growthPercent: z.number().min(-20).max(50).optional(),
    /** What the market's size counts, said after it in the readout ("$3.6bn of $35.8bn of fees on all fares"); "market" when left out. */
    pool: z.string().trim().min(3).max(40).optional(),
    source: sourceSchema,
  })
  .strict();

/** An Icon name (src/icons/names.ts) for a face or object a mode draws. */
const iconName = z.string().refine(isIconName, "not an Icon name (src/icons/names.ts)");

/** A rival's or an industry's operating margin, marked on lever 2 (Spine Topic 5). */
export const marginMarkSchema = z
  .object({
    label: z.string().trim().min(3).max(40),
    percent: z.number().min(-50).max(90),
    /** The rival's face on the margin ladder, an Icon name; a building when left out. */
    emoji: iconName.optional(),
    source: sourceSchema,
  })
  .strict();

/** A band of a lever the Learner is unsure of, low and high, in the lever's units (Spine Topic 14). */
const bandSchema = z
  .tuple([z.number(), z.number()])
  .refine(
    ([low, high]) => low < high,
    "the low end must be below the high end",
  );

/**
 * A Lingo card beside a Workbench (Spine critics round 1 on #96): the one word the Topic teaches, as the LingoCard part
 * draws it, so the bench is not chart-only. Words only: the bench's figures are the engine's.
 */
export const benchLingoSchema = z
  .object({
    term: z.string().trim().min(2).max(30),
    means: z.string().trim().min(10).max(140),
    pro: z.string().trim().min(10).max(100),
    example: z.string().trim().min(10).max(140),
    emoji: iconNameSchema,
    inStory: z.string().trim().min(10).max(140).optional(),
  })
  .strict();

/**
 * A story moment beside a Workbench (Spine critics round 1 on #96), as the StoryScene part draws it: a small cast and two
 * to five beats, such as who is paid before the shareholders on the Value bridge.
 */
export const benchStorySchema = z
  .object({
    cast: z
      .array(z.object({ id: z.string().trim().min(1).max(20), emoji: iconNameSchema, name: z.string().trim().min(2).max(28), role: z.string().trim().max(40).optional() }).strict())
      .min(1)
      .max(4),
    beats: z
      .array(z.object({ who: z.string().trim().min(1).max(20), says: z.string().trim().min(5).max(110), emoji: iconNameSchema.optional() }).strict())
      .min(2)
      .max(5),
    caption: z.string().trim().max(90).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()
  .refine((s) => s.beats.every((b) => b.who === "narrator" || s.cast.some((c) => c.id === b.who)), "each beat's who is a cast id or narrator");

/**
 * A small cast on Value levers that reacts as the value moves against the price (Spine critics round 1 on #96: a bench of
 * only a headline, sliders and bars is chart-only). One to three characters, each an Icon and a short name, and the line
 * one of them says when the Learner's value sits below the price, near it, or above it.
 */
const sceneLine = z.string().trim().min(10).max(110);
export const benchSceneSchema = z
  .object({
    cast: z
      .array(z.object({ icon: iconNameSchema, name: z.string().trim().min(2).max(28) }).strict())
      .min(1)
      .max(3),
    below: sceneLine,
    near: sceneLine,
    above: sceneLine,
  })
  .strict();
export type BenchScene = z.infer<typeof benchSceneSchema>;

/**
 * What Value levers adds for a Spine Topic (Appendix D): each mode swaps one readout (or, for failure, which lever is under
 * More settings, and for all open, opens it), never adding controls beyond four at rest and one more.
 */
/** Cases the Learner can switch between with a chip: each its Case id and the company's name for the chip (and a saved note's title). */
const caseChipsSchema = z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1).max(40) }).strict()).min(2).max(3);

export const valueLeversModeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("market"),
      markets: z.array(marketSchema).min(1).max(2),
      scene: benchSceneSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("margin_marks"),
      marks: z.array(marginMarkSchema).min(1).max(3),
      /** The company's own face, which climbs the ladder as its margin moves; a rocket when left out. */
      emoji: iconName.optional(),
      scene: benchSceneSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("roic"),
      /** A line under the return, such as whose claim the opening settings are. */
      note: z.string().trim().min(3).max(120).optional(),
      /** What the new capital buys, drawn filling up with the sales each dollar brings; a factory when left out. */
      emoji: iconName.optional(),
      scene: benchSceneSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("failure"), scene: benchSceneSchema.optional() }).strict(),
  z
    .object({
      kind: z.literal("two_stories"),
      stories: z.tuple([topicStorySchema, topicStorySchema]),
      scene: benchSceneSchema.optional(),
    })
    .strict(),
  // match_price may carry Case chips: the ready-Case valuation Topic judges a published Story on one of three Cases.
  z.object({ kind: z.literal("match_price"), cases: caseChipsSchema.optional(), scene: benchSceneSchema.optional() }).strict(),
  z
    .object({
      kind: z.literal("range"),
      bands: z
        .object({
          revenue: bandSchema.optional(),
          margin: bandSchema.optional(),
          salesToCapital: bandSchema.optional(),
          risk: bandSchema.optional(),
          failure: bandSchema.optional(),
        })
        .strict()
        .optional(),
      scene: benchSceneSchema.optional(),
    })
    .strict(),
  // all_open: every lever open, "Save my story", and optionally Case chips. No Spine Topic uses it (spine-check.ts: on the
  // Spine the Learner judges a published Story); it is kept for an Own Case's Estimate, saved as a one-page note.
  z.object({ kind: z.literal("all_open"), cases: caseChipsSchema.optional(), scene: benchSceneSchema.optional() }).strict(),
]);

export type ValueLeversMode = z.infer<typeof valueLeversModeSchema>;

/** The Case chips a mode carries (all_open or match_price), or undefined when it has none. */
export function modeCases(mode: ValueLeversMode | undefined): { id: string; label: string }[] | undefined {
  return mode?.kind === "all_open" || mode?.kind === "match_price" ? mode.cases : undefined;
}
export type ValueLeversModeKind = ValueLeversMode["kind"];
export const VALUE_LEVERS_MODE_KINDS = valueLeversModeSchema.options.map(
  (o) => o.shape.kind.value,
) as ValueLeversModeKind[];
export type Market = z.infer<typeof marketSchema>;
export type MarginMark = z.infer<typeof marginMarkSchema>;
export type TopicStory = z.infer<typeof topicStorySchema>;
