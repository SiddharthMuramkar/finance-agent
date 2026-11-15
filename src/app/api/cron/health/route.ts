import { reportHealth } from "@/alerts/health";
import { isCronRequest } from "@/auth/cron";
import { getDb } from "@/db/client";

export const runtime = "nodejs";
// Vercel Schedules call this with GET every 15 minutes (vercel.json `schedules`; on Hobby each run starts up to 15 min
// late). A few reads and one request to Better Stack: 30 s is ample, even with the database waking from suspend.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * The health check (src/alerts/health.ts). It sits outside the passcode gate (src/proxy.ts) and answers only to
 * `Authorization: Bearer <CRON_SECRET>`, which Vercel sends to a schedule's path. 200 when the database answered (the
 * heartbeat, or its /fail, went to BETTERSTACK_HEARTBEAT_URL when that is set); 503 when it did not, with no heartbeat.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await reportHealth({ db: getDb(), now: new Date(), heartbeatUrl: process.env.BETTERSTACK_HEARTBEAT_URL || undefined, fetch });
  return Response.json(report, { status: report.db === "answered" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
