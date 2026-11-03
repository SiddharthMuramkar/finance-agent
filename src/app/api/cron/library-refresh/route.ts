import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/db/client";
import { isCronRequest, refreshLibrary, BLOG_SOURCE, SHEETS_SOURCE } from "@/library/refresh";
import { voyageEmbed } from "@/library/voyage";
import type { PictureClient } from "@/library/pictures-run";
import sourceList from "../../../../../scripts/library/sources.json";

export const runtime = "nodejs";
// Vercel Cron calls this with GET every Monday at 21:30 UTC (vercel.json). The route works for 200 s
// of the 300 s a function may run (Fluid compute is on for the project).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** The Library source record for an id, as scripts/library/sources.json describes it, copied today. */
function source(id: string) {
  const entry = (sourceList as Record<string, unknown>[]).find((s) => s.id === id);
  if (!entry) throw new Error(`No source "${id}" in scripts/library/sources.json`);
  const rest = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "fetch" && key !== "publishedOn"));
  return { ...rest, fetchedOn: new Date().toISOString().slice(0, 10) } as Parameters<typeof refreshLibrary>[0]["sources"]["blog"];
}

/**
 * The weekly refresh of Damodaran's posts. It sits outside the passcode gate (src/proxy.ts) and
 * answers only to `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const voyageKey = process.env.VOYAGE_API_KEY;
  const result = await refreshLibrary({
    db: getDb(),
    sources: { blog: source(BLOG_SOURCE), sheets: source(SHEETS_SOURCE) },
    pictures: process.env.ANTHROPIC_API_KEY ? (new Anthropic() as unknown as PictureClient) : undefined,
    embed: voyageKey ? async (texts) => (await voyageEmbed({ apiKey: voyageKey }, texts, "document")).embeddings : undefined,
  });
  return Response.json(result, { status: result.status === "failed" ? 500 : result.status === "locked" ? 409 : 200, headers: { "Cache-Control": "no-store" } });
}
