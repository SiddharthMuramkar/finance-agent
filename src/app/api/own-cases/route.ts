import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { saveOwnCase } from "@/learner/own-cases";

export const runtime = "nodejs";

// Numbers arrive as the Learner typed them; the engine's own checks give the readable reason a figure cannot be valued,
// so here a field only has to be there and be a number (NaN for an empty box).
const num = z.number().or(z.null().transform(() => Number.NaN));
const body = z.object({
  inputs: z.object({
    company: z.string(),
    market: z.string(),
    reportDate: z.string(),
    industry: z.string(),
    sales: num,
    operatingProfit: num,
    taxPercent: num,
    debt: num,
    cash: num,
    shares: num,
    price: num,
    reportUrl: z.string().optional(),
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
