import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { saveOwnCase } from "@/learner/own-cases";

export const runtime = "nodejs";

// Numbers arrive as the Learner typed them; the engine's own checks give the readable reason a figure cannot be valued,
// so here a field only has to be there and be a number (NaN for an empty box).
const num = z.number().or(z.null().transform(() => Number.NaN));
/** A company's name as a report's cover prints it, and a link to the report: long enough for any, never unbounded. */
const MAX_NAME = 200;
const MAX_URL = 2000;
const body = z.object({
  inputs: z.object({
    company: z.string().max(MAX_NAME),
    market: z.string().max(8),
    reportDate: z.string().max(10),
    industry: z.string().max(40),
    sales: num,
    operatingProfit: num,
    taxPercent: num,
    debt: num,
    cash: num,
    shares: num,
    price: num,
    // A link to the report: http(s) only, so a saved source is never a script or a file path.
    reportUrl: z.url({ protocol: /^https?$/ }).max(MAX_URL).optional(),
  }),
  estimate: z.object({
    growthPercent: z.number(),
    growthAfterPercent: z.number(),
    targetMarginPercent: z.number(),
    salesToCapital: z.number(),
    costOfCapitalPercent: z.number(),
    costOfCapitalAfterPercent: z.number(),
    returnOnCapitalAfterPercent: z.number(),
  }),
});

/** Values and saves one Own Case with its one-page note (spec #68, Assignments). Opens only after the Spine; no model call. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Fill in every figure from the report." }, { status: 400 });
  const { inputs, estimate } = parsed.data;
  const result = await saveOwnCase(getDb(), loadCourseMap(), await currentLearnerId(), inputs as Parameters<typeof saveOwnCase>[3], estimate, new Date());
  return result.ok ? Response.json(result) : Response.json({ error: result.error }, { status: result.status });
}
