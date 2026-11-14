import { afterEach, describe, expect, it, vi } from "vitest";
import { emailLinkSends } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { DAILY, PER_ADDRESS, claimEmailSend, emailHash } from "./email-throttle";

const SECRET = "a-test-secret-of-at-least-32-characters!";
const at = (iso: string) => new Date(iso);

afterEach(() => vi.restoreAllMocks());

describe("claimEmailSend", () => {
  it("the fourth link to one address within an hour is refused; another address is not", async () => {
    const db = await testDb();
    for (let i = 0; i < PER_ADDRESS.sends; i++) expect(await claimEmailSend(db, "asha@x.com", SECRET, at(`2026-11-11T09:0${i}:00Z`))).toBe("ok");
    expect(await claimEmailSend(db, "Asha@X.com ", SECRET, at("2026-11-11T09:10:00Z"))).toBe("email_link_throttled");
    expect(await claimEmailSend(db, "noor@x.com", SECRET, at("2026-11-11T09:10:00Z"))).toBe("ok");
    // The refused claim was removed again, so it doesn't push the wait further out.
    expect(await db.select().from(emailLinkSends)).toHaveLength(PER_ADDRESS.sends + 1);
    // An hour after the first, that address may ask again.
    expect(await claimEmailSend(db, "asha@x.com", SECRET, at("2026-11-11T10:00:30Z"))).toBe("ok");
  });

  it("stores only an HMAC of the address, the same for any case and spacing, and different under another secret", async () => {
    const db = await testDb();
    await claimEmailSend(db, " Asha@X.com", SECRET);
    const [row] = await db.select().from(emailLinkSends);
    expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.emailHash).toBe(await emailHash("asha@x.com", SECRET));
    expect(row.emailHash).not.toBe(await emailHash("asha@x.com", "another-secret-of-at-least-32-characters"));
    expect(JSON.stringify(row)).not.toContain("asha");
  });

  it("past 90 a day every address is refused, with a warning that names no address; rows older than a day go", async () => {
    const db = await testDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await db.insert(emailLinkSends).values(Array.from({ length: DAILY.sends }, (_, i) => ({ emailHash: `h${i}`, sentAt: at("2026-11-11T01:00:00Z") })));
    await db.insert(emailLinkSends).values({ emailHash: "old", sentAt: at("2026-11-09T09:00:00Z") });

    expect(await claimEmailSend(db, "noor@x.com", SECRET, at("2026-11-11T09:00:00Z"))).toBe("email_link_daily_cap");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^email_link_daily_cap:/);
    expect(String(warn.mock.calls[0][0])).not.toContain("@");
    const rows = await db.select().from(emailLinkSends);
    expect(rows).toHaveLength(DAILY.sends);
    expect(rows.some((r) => r.emailHash === "old")).toBe(false);

    // A day after those 90, sending works again.
    expect(await claimEmailSend(db, "noor@x.com", SECRET, at("2026-11-12T01:00:01Z"))).toBe("ok");
  });
});
