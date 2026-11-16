import { z } from "zod";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { cashWaterfallLevers } from "../workbench/cash-waterfall-model";
import {
  benchLingoSchema,
  benchStorySchema,
  bridgeReportSchema,
  companyYearSchema,
  costOfCapitalFiguresSchema,
  decoderAssumptionsSchema,
  decoderFiguresSchema,
  decoderOpeningSchema,
  leasesSchema,
  sourceSchema,
  stackStorySchema,
  tradedMultipleSchema,
  valueLeversModeSchema,
  type ValueLeversMode,
} from "../workbench/data-schemas";
import { multipleDecoderLevers } from "../workbench/multiple-decoder-model";
import {
  cashWaterfallData,
  multipleDecoderData,
  terminalSeesawData,
  valueBridgeData,
  waccStackData,
} from "../workbench/registry";
import { terminalSeesawLevers } from "../workbench/terminal-seesaw-model";
import { valueBridgeLevers } from "../workbench/value-bridge-model";
import {
  CASE_VARIABLE,
  LEVER_IDS,
  LEVER_VARIABLES,
  leverSpecs,
  MARKET_VARIABLE,
  MOVE_VARIABLES,
  openingSettings,
  storyAtPrice,
  type LeverSettings,
} from "../workbench/value-levers-model";
import {
  STACK_LEVER_IDS,
  waccStackLevers,
} from "../workbench/wacc-stack-model";
import type { BenchLever } from "../workbench/bench";
import {
  defineRecipe,
  issuesText,
  lit,
  num,
  obj,
  program,
  str,
  WORKBENCH,
  type Recipe,
} from "./define";

/**
 * The Workbench recipes (spec 2026-11-12, B2 to B4; ADR 0010): Widgets with several controls feeding one headline number,
 * each a view over the one valuation engine, bound to a Case's valuation block by its Case id or given the Topic file's
 * sourced figures. Only a recipe can be a Workbench, so the Tutor opens one with show_widget and never draws one. Value
 * levers is the first (B3), with a mode for each Spine Topic that reuses it (Appendix D); Value bridge, Terminal seesaw,
 * Cost of capital stack, Cash waterfall and Multiple decoder follow (B4). Every figure a Widget shows is worked out by the
 * engine from these inputs; each recipe's compile writes the levers as $variables at their openings, so the Learner's
 * settings are Widget state.
 */

/**
 * How every Workbench recipe's description names its Case: by its id in the Topic's Cases, with one example. The full
 * list grew past what a recipe's signature can carry once every published Case had a block (33 ids put Value levers'
 * signature over its 2,400 characters and the engine's instructions over the Widget library prompt's), so a wrong id is
 * refused with the ids there are instead. The figure inputs' shapes are left out of the signatures too (`topicInputs`,
 * ADR 0010), which gives the engine's instructions room for the example in all six recipes; before that, the Cost of
 * capital stack and Cash waterfall had to say only "by id".
 *
 * Where the Tutor finds the id: no recipe lists the Cases any more (before, Value levers listed them all, the only place
 * Spine Topic 15's coffee-day-yourself-2015 and zomato-yourself-2021 showed), so the per-turn context names each of the
 * Topic's valued Cases by id on its Case line (src/tutor/context.ts, valuationIdLine). The Tutor opens a Workbench on the
 * Case the Learner picks from there, without guessing.
 */
const CASE_ID = "by its id in the Topic's Cases, such as amazon-dcf-2000";

/** A Case id in the valuation registry, refused with the ids there are. */
const caseId = z
  .string()
  .describe(`A Valuation Case, ${CASE_ID}`)
  .refine((id) => valuationCase(id) !== null, {
    message: `not a Valuation Case; one of: ${valuationCaseIds().join(", ")}`,
  });

/** `$id = opening` for each lever, and the `$id` list to pass to the part. */
function leverStatements(levers: readonly BenchLever[]): {
  declarations: string[];
  args: string[];
} {
  return {
    declarations: levers.map((l) => `$${l.id} = ${num(l.opening)}`),
    args: levers.map((l) => `$${l.id}`),
  };
}

// ——— Value levers (B3, Appendix D) ———

/** Lever settings in their own units: revenue as lever 1 shows it (billions for a Case in millions of dollars), percents, sales per unit invested. */
const leverValues = z
  .object({
    revenue: z.number().optional(),
    margin: z.number().optional(),
    salesToCapital: z.number().optional(),
    risk: z.number().optional(),
    failure: z.number().optional(),
  })
  .strict();

/** Where a Case sits among all open mode's Case chips (Spine Topic 15), so the Widget opens on its chip; -1 when the mode lists no such Case. */
function casePlace(id: string, mode: ValueLeversMode | undefined): number {
  return mode?.kind === "all_open" && mode.cases
    ? mode.cases.findIndex((c) => c.id === id)
    : -1;
}

/** The mode as the Tutor reads it: a short shape, checked in full by valueLeversModeSchema (data-schemas.ts). */
const MODE_SHAPE =
  "A Spine Topic's mode (market, margin_marks, roic, failure, two_stories, match_price, range or all_open), copied from the Topic file as written; it swaps one readout";

const valueLeversInputs = z
  .object({
    case: z.string().describe(`The Valuation Case it draws, ${CASE_ID}`),
    start: leverValues
      .optional()
      .describe(
        "Where the levers open (revenue in $bn, percents); the Case's story when left out",
      ),
    caseStory: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .optional()
      .describe("The Case's story chip, such as \"Damodaran's story\""),
    priceStory: leverValues
      .optional()
      .describe(
        "The chip worth the price, shown once the Insight is settled; code checks it",
      ),
    mode: z.unknown().optional().describe(MODE_SHAPE),
  })
  .strict()
  .superRefine((inputs, ctx) => {
    const block = valuationCase(inputs.case);
    if (!block) {
      ctx.addIssue({
        code: "custom",
        path: ["case"],
        message: `not a Valuation Case; one of: ${valuationCaseIds().join(", ")}`,
      });
      return;
    }
    const mode =
      inputs.mode === undefined
        ? undefined
        : valueLeversModeSchema.safeParse(inputs.mode);
    if (mode && !mode.success) {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: issuesText(mode.error),
      });
      return;
    }
    // Each Case the Learner can switch between (all open mode) must be a real Valuation Case, and the Case it opens on one
    // of them: the chip starts on that Case, so a call naming one the list lacks would draw another company.
    if (mode?.success && mode.data.kind === "all_open" && mode.data.cases) {
      for (const [i, c] of mode.data.cases.entries()) {
        if (!valuationCase(c.id))
          ctx.addIssue({
            code: "custom",
            path: ["mode", "cases", i, "id"],
            message: `not a Valuation Case; one of: ${valuationCaseIds().join(", ")}`,
          });
      }
      if (casePlace(inputs.case, mode.data) < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["case"],
          message: `not one of the mode's Cases; one of: ${mode.data.cases.map((c) => c.id).join(", ")}`,
        });
      }
    }
    const specs = leverSpecs(block, mode?.data);
    for (const spec of specs) {
      const value = inputs.start?.[spec.id];
      if (value !== undefined && (value < spec.min || value > spec.max))
        ctx.addIssue({
          code: "custom",
          path: ["start", spec.id],
          message: `must lie between ${spec.min} and ${spec.max}`,
        });
    }
    if (
      inputs.priceStory &&
      !storyAtPrice(block, specs, inputs.priceStory, mode?.data)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["priceStory"],
        message: `does not land near the price of ${block.price.value}`,
      });
    }
  });

const HIGHGROW = {
  title: "Damodaran, Can Amazon.com be valued? (valuation done February 2000)",
  url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf",
};
const RETAIL_1999 = {
  title: "US Census Bureau, Monthly Retail Trade: estimates for 1999",
  url: "https://www2.census.gov/retail/releases/historical/mrts/sal99.html",
};

export const valueLevers = defineRecipe({
  id: "value_levers",
  topicInputs: ["mode"],
  archetype: WORKBENCH,
  summary:
    "Value levers, a Workbench on a Case's valuation: four Levers (revenue in year 10, margin once mature, sales for each unit invested, cost of capital while it grows) and the chance it fails, feeding what the Learner's Valuation story is worth a share beside the Case's price. Use it to feel which lever moves the value most, or to find the story a price assumes.",
  params: {
    inputs: valueLeversInputs,
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "What is Amazon worth a share?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        priceStory: { revenue: 60, margin: 12.5 },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Amazon with a grocer's margins",
      inputs: { case: "amazon-dcf-2000", start: { margin: 4 } },
      refs: {},
      facts: {},
    },
    {
      title: "How much of US retail could Amazon win?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: {
          kind: "market",
          markets: [
            {
              label: "US retail, excluding cars",
              size: 2_245_899,
              source: RETAIL_1999,
            },
          ],
        },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Can Amazon keep more than a bookshop?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: {
          kind: "margin_marks",
          marks: [
            { label: "Barnes & Noble", percent: 7.94, source: HIGHGROW },
            { label: "Specialty retail", percent: 10, source: HIGHGROW },
          ],
        },
      },
      refs: {},
      facts: {},
    },
    {
      title: "When does Amazon's growth add value?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: { kind: "roic" },
      },
      refs: {},
      facts: {},
    },
    {
      title: "What if Amazon does not survive?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: { kind: "failure" },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Two stories about Amazon",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: {
          kind: "two_stories",
          stories: [
            { label: "A bigger Amazon", levers: { revenue: 60 } },
            {
              label: "Everything goes right",
              levers: { revenue: 100, margin: 20, salesToCapital: 5, risk: 10 },
            },
          ],
        },
      },
      refs: {},
      facts: {},
    },
    {
      title: "What does Amazon's $84 price assume?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: { kind: "match_price" },
      },
      refs: {},
      facts: {},
    },
    {
      title: "How wrong could Amazon's value be?",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: { kind: "range" },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Value one yourself",
      inputs: {
        case: "amazon-dcf-2000",
        caseStory: "Damodaran's story",
        mode: {
          kind: "all_open",
          cases: [
            { id: "amazon-dcf-2000", label: "Amazon, Feb 2000" },
            {
              id: "coffee-day-rupee-valuation-2015",
              label: "Coffee Day, Oct 2015",
            },
            { id: "zomato-ipo-2021", label: "Zomato, Jul 2021" },
          ],
        },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const block = valuationCase(inputs.case)!;
    const mode =
      inputs.mode === undefined
        ? undefined
        : valueLeversModeSchema.parse(inputs.mode);
    const start: LeverSettings = {
      ...openingSettings(leverSpecs(block, mode)),
      ...inputs.start,
    };
    const moves = Object.values(MOVE_VARIABLES);
    const market = mode?.kind === "market";
    // All open mode may let the Learner switch Case with a chip; that pick is its own $variable, after the market slot, and
    // starts on the chip of the Case the call names (the inputs' check makes it one of them).
    const picker = mode?.kind === "all_open" && !!mode.cases;
    const args = [
      str(inputs.case),
      ...LEVER_IDS.map((id) => `$${LEVER_VARIABLES[id]}`),
      ...moves.map((v) => `$${v}`),
      str(inputs.caseStory ?? "The Case's story"),
      ...(inputs.priceStory || mode
        ? [
            inputs.priceStory
              ? obj(inputs.priceStory as Record<string, number>)
              : "null",
          ]
        : []),
      ...(mode ? [lit(mode)] : []),
      ...(market || picker ? [market ? `$${MARKET_VARIABLE}` : "0"] : []),
      ...(picker ? [`$${CASE_VARIABLE}`] : []),
    ];
    return program(
      title,
      ["levers"],
      [
        ...LEVER_IDS.map((id) => `$${LEVER_VARIABLES[id]} = ${num(start[id])}`),
        ...moves.map((v) => `$${v} = 0`),
        ...(market ? [`$${MARKET_VARIABLE} = 0`] : []),
        ...(picker
          ? [`$${CASE_VARIABLE} = ${casePlace(inputs.case, mode)}`]
          : []),
        `levers = ValueLevers(${args.join(", ")})`,
      ],
    );
  },
});

// ——— Value bridge (B4, Spine Topic 9) ———

const valueBridgeInputs = z
  .object({
    case: caseId,
    leases: leasesSchema
      .optional()
      .describe(
        "Lease obligations the Case's debt does not count, which the Topic counts as debt, with their source",
      ),
    report: bridgeReportSchema.optional().describe("A report's lines shown beside the bridge, its debt and cash ready to put in, with their source"),
    scene: benchStorySchema.optional().describe("A story moment above the bridge: copy it from the Topic file"),
  })
  .strict();

export const valueBridge = defineRecipe({
  id: "value_bridge",
  topicInputs: ["leases", "report", "scene"],
  archetype: WORKBENCH,
  summary:
    "Value bridge, a Workbench on a Case's valuation: business value steps down through cash, debt and leases, and options to what one share is worth. Use it to show who is paid before shareholders.",
  params: {
    inputs: valueBridgeInputs,
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "From Amazon's business to one share",
      inputs: { case: "amazon-dcf-2000" },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const found = valueBridgeData({
      caseId: inputs.case,
      leases: inputs.leases,
      report: inputs.report,
    });
    if (!("data" in found)) throw new Error(found.problem);
    const { declarations, args } = leverStatements(
      valueBridgeLevers(found.data),
    );
    return program(
      title,
      ["bridge"],
      [
        ...declarations,
        `bridge = ValueBridge(${[str(inputs.case), ...args, inputs.leases ? lit(inputs.leases) : "null", ...(inputs.report || inputs.scene ? [inputs.report ? lit(inputs.report) : "null"] : []), ...(inputs.scene ? [lit(inputs.scene)] : [])].join(", ")})`,
      ],
    );
  },
});

// ——— Terminal seesaw (B4, Spine Topic 8) ———

export const terminalSeesaw = defineRecipe({
  id: "terminal_seesaw",
  archetype: WORKBENCH,
  summary:
    "Terminal seesaw, a Workbench on a Case's valuation: growth and the cost of capital after year 10 set the terminal value; a seesaw weighs years 1 to 10 against everything after, in today's money. Use it for the years you cannot forecast.",
  params: {
    inputs: z.object({ case: caseId }).strict(),
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "How much of Amazon's value sits after year 10?",
      inputs: { case: "amazon-dcf-2000" },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const found = terminalSeesawData({ caseId: inputs.case });
    if (!("data" in found)) throw new Error(found.problem);
    const { declarations, args } = leverStatements(
      terminalSeesawLevers(found.data),
    );
    return program(
      title,
      ["seesaw"],
      [
        ...declarations,
        `seesaw = TerminalSeesaw(${[str(inputs.case), ...args].join(", ")})`,
      ],
    );
  },
});

// ——— Cost of capital stack (B4, Spine Topic 7) ———

const waccStackInputs = z
  .object({
    figures: costOfCapitalFiguresSchema.describe(
      "The Case's figures in percent (relative risk a plain number): where the levers open; the cost of debt and tax rate stay",
    ),
    source: sourceSchema.describe("Where the figures come from"),
    case: caseId
      .optional()
      .describe(
        `The Valuation Case whose value a share the rate sets, ${CASE_ID}`,
      ),
    story: stackStorySchema
      .optional()
      .describe("How the Topic's story leads it: copy it from the Topic file"),
  })
  .strict();

const AMAZON_RATE = {
  riskFree: 6.5,
  equityPremium: 4,
  relativeRisk: 1.6,
  debtShare: 1.2,
  costOfDebt: 8,
  taxRate: 0,
};

export const waccStack = defineRecipe({
  id: "wacc_stack",
  topicInputs: ["figures", "source", "story"],
  archetype: WORKBENCH,
  summary:
    "Cost of capital stack, a Workbench: the risk-free rate, the premium for shares, relative risk and the share of debt build the cost of capital in layers; bound to a Case, it shows the value a share at that rate. Use it to show what a discount rate is made of.",
  params: {
    inputs: waccStackInputs,
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "What return should Amazon's shareholders require?",
      inputs: {
        figures: AMAZON_RATE,
        source: HIGHGROW,
        case: "amazon-dcf-2000",
      },
      refs: {},
      facts: {},
    },
    {
      title: "Amazon's cost of capital, layer by layer",
      inputs: { figures: AMAZON_RATE, source: HIGHGROW },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const found = waccStackData({
      figures: inputs.figures,
      source: inputs.source,
      caseId: inputs.case,
      story: inputs.story,
    });
    if (!("data" in found)) throw new Error(found.problem);
    // The part takes the levers in STACK_LEVER_IDS order, whatever order the story shows them in.
    const { declarations } = leverStatements(waccStackLevers(found.data));
    const args = STACK_LEVER_IDS.map((id) => `$${id}`);
    const figures = inputs.story
      ? { ...inputs.figures, story: inputs.story }
      : inputs.figures;
    return program(
      title,
      ["stack"],
      [
        ...declarations,
        `stack = WaccStack(${[lit(figures), lit(inputs.source), ...args, inputs.case ? str(inputs.case) : "null"].join(", ")})`,
      ],
    );
  },
});

// ——— Cash waterfall (B4, Spine Topic 3) ———

const cashWaterfallInputs = z
  .object({
    case: caseId
      .optional()
      .describe(
        `A Valuation Case whose base year and year 1 it shows, ${CASE_ID}`,
      ),
    company: companyYearSchema
      .optional()
      .describe("Or a company's year from the Topic file, with its source"),
  })
  .strict()
  .refine(
    (inputs) => (inputs.case === undefined) !== (inputs.company === undefined),
    { message: "give either a case or a company, not both" },
  );

const WEBVAN_10K = {
  title: "Webvan Group, Form 10-K for 2000 (SEC EDGAR)",
  url: "https://www.sec.gov/Archives/edgar/data/1092657/000101287001001485/0001012870-01-001485.txt",
};

export const cashWaterfall = defineRecipe({
  id: "cash_waterfall",
  topicInputs: ["company"],
  archetype: WORKBENCH,
  summary:
    "Cash waterfall, a Workbench on one year of a business: revenue growth, margin and sales for each unit invested take revenue down to free cash flow. Use it to show that growth uses cash before it shows as profit.",
  params: {
    inputs: cashWaterfallInputs,
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "Amazon's next year, from revenue to cash",
      inputs: { case: "amazon-dcf-2000" },
      refs: {},
      facts: {},
    },
    {
      title: "Webvan's 2000, from revenue to cash",
      inputs: {
        company: {
          name: "Webvan",
          currency: "USD",
          unit: "millions",
          revenue: 13.305,
          taxPercent: 35,
          opening: { growth: 1241.3, margin: -179.2, salesToCapital: 0.7 },
          source: WEBVAN_10K,
        },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const base = inputs.case
      ? { caseId: inputs.case }
      : { company: inputs.company };
    const found = cashWaterfallData(base);
    if (!("data" in found)) throw new Error(found.problem);
    const { declarations, args } = leverStatements(
      cashWaterfallLevers(found.data),
    );
    return program(
      title,
      ["waterfall"],
      [
        ...declarations,
        `waterfall = CashWaterfall(${[lit(base), ...args].join(", ")})`,
      ],
    );
  },
});

// ——— Multiple decoder (B4, Spine Topic 12) ———

/**
 * A traded multiple, named once for the signature: a recipe's params are printed as JSON Schema with every schema written
 * out where it is used, so the subject and the peers each carried a full copy of the name, the multiple, the source and now
 * the Icon and the fact. Named, it is written once under `$defs` and pointed at twice, which takes about 380 characters off
 * this signature (the engine's instructions must stay under the Widget library prompt's: show-widget.test.ts). In the
 * Tutor's signature the subject and peers are collapsed to "copy them from the Topic file" (`topicInputs`, ADR 0010), and
 * recipeSignature then drops the unused definition too.
 */
const traded = tradedMultipleSchema.meta({ id: "tradedMultiple" });

const multipleDecoderInputs = z
  .object({
    subject: traded,
    peers: z.array(traded).min(1).max(3),
    assumptions: decoderAssumptionsSchema.describe(
      "Held still: tax, sales per unit invested, growth after year 10",
    ),
    opening: decoderOpeningSchema.describe(
      "Where growth (years 1 to 5), risk (cost of capital) and margin open, in percent",
    ),
    // A Spine Topic binds its explore Workbench to its Case (spine-12's s12-wework-iwg); the multiples are the Topic's
    // own figures, so the Case is checked but not drawn.
    case: caseId
      .optional()
      .describe(
        `The Topic's Case the multiples come from, checked but not drawn, ${CASE_ID}`,
      ),
    lingo: benchLingoSchema.optional().describe("A Lingo card above the decoder: copy it from the Topic file"),
  })
  .strict()
  .superRefine((inputs, ctx) => {
    const parsed = decoderFiguresSchema.safeParse(inputs);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  });

const WEWORK_S1 = {
  title:
    "WeWork (The We Company) Form S-1, 14 Aug 2019, and its $47bn January 2019 round",
  url: "https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm",
};
const IWG_2018 = {
  title:
    "IWG plc annual results 2018 and interim results 2019 (EV/Sales computed, IAS 17)",
  url: "https://investors.iwgplc.com/~/media/Files/I/IWG-IR/reports-and-presentations/2019/iwg-hy-announcement-2019-final.pdf",
};

export const multipleDecoder = defineRecipe({
  id: "multiple_decoder",
  topicInputs: ["subject", "peers", "assumptions", "opening", "lingo"],
  archetype: WORKBENCH,
  summary:
    "Multiple decoder, a Workbench: growth, risk and margin set the multiple of revenue they justify, beside the sourced multiples the company and its peers trade at, each row with its Icon and short fact. Use it to read a multiple back as a view on growth, risk and margins.",
  params: {
    inputs: multipleDecoderInputs,
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: WORKBENCH_BUDGET,
  examples: [
    {
      title: "What does WeWork's $47 billion assume?",
      inputs: {
        subject: {
          name: "WeWork",
          multiple: 25.8,
          source: WEWORK_S1,
          icon: "office-building",
          note: "604,000 desks",
        },
        peers: [
          {
            name: "IWG",
            multiple: 1.56,
            source: IWG_2018,
            icon: "cityscape",
            note: "602,535 desks",
          },
        ],
        assumptions: {
          taxPercent: 25,
          salesToCapital: 1.68,
          growthAfterPercent: 1.6,
        },
        opening: { growth: 60, risk: 7.97, margin: 12.5 },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs }) => {
    const found = multipleDecoderData(inputs);
    if (!("data" in found)) throw new Error(found.problem);
    const { declarations, args } = leverStatements(
      multipleDecoderLevers(found.data),
    );
    return program(
      title,
      ["decoder"],
      [
        ...declarations,
        `decoder = MultipleDecoder(${[lit(inputs.subject), lit(inputs.peers), lit(inputs.assumptions), lit(inputs.opening), ...args, ...(inputs.lingo ? [lit(inputs.lingo)] : [])].join(", ")})`,
      ],
    );
  },
});

/** The Workbench recipes, Value levers first, then the five of B4 in the spec's order. */
export const SET_WORKBENCH: Recipe[] = [
  valueLevers,
  valueBridge,
  terminalSeesaw,
  waccStack,
  cashWaterfall,
  multipleDecoder,
];

/**
 * The inputs of each Workbench recipe that carry a Case's figures rather than lever positions (ADR 0010: "its Case figures
 * come from the Topic file, not from numbers the Tutor types"). A Valuation Case id is not one: its figures are the
 * Topic file's `valuation:` block already.
 */
export const WORKBENCH_FIGURE_INPUTS: Readonly<
  Record<string, readonly string[]>
> = Object.fromEntries(
  SET_WORKBENCH.flatMap((r) =>
    r.topicInputs?.length ? [[r.id, r.topicInputs]] : [],
  ),
);

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
    );
  return v;
}

/**
 * Whether a Workbench the Tutor opens with these inputs shows figures no Topic file gives (ADR 0010), so it must be marked
 * an Illustration: some figure input is present and no Topic file's inputs for this recipe carry the same figures.
 * `topicInputs` are the inputs every Topic file gives this recipe. False for a recipe with no figure inputs.
 */
export function figuresFromTutor(
  recipeId: string,
  inputs: unknown,
  topicInputs: readonly unknown[],
): boolean {
  const keys = WORKBENCH_FIGURE_INPUTS[recipeId];
  const given =
    inputs && typeof inputs === "object"
      ? (inputs as Record<string, unknown>)
      : {};
  const present = (keys ?? []).filter(
    (k) => given[k] !== undefined && given[k] !== null,
  );
  if (!present.length) return false;
  return !topicInputs.some((t) => {
    const from =
      t && typeof t === "object" ? (t as Record<string, unknown>) : {};
    return present.every((k) => same(given[k], from[k]));
  });
}

/**
 * Every `inputs` a Topic file gives a recipe, found anywhere in the parsed Topics (an explore Workbench, a Concept card's
 * or a Primer's preset): each object with `recipe` equal to `recipeId` and an `inputs` object.
 */
export function recipeInputsIn(
  value: unknown,
  recipeId: string,
  seen = new Set<unknown>(),
): unknown[] {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value))
    return value.flatMap((v) => recipeInputsIn(v, recipeId, seen));
  const record = value as Record<string, unknown>;
  const own =
    record.recipe === recipeId &&
    record.inputs &&
    typeof record.inputs === "object"
      ? [record.inputs]
      : [];
  return [
    ...own,
    ...Object.values(record).flatMap((v) => recipeInputsIn(v, recipeId, seen)),
  ];
}
