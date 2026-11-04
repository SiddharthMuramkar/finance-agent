import { describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { createCaseDataCache } from "./case-data-cache";

const withheld: CaseData = { caseId: "fed-hike-1994", asOf: "1994-02-03", revealed: false, datasets: [] };
const full: CaseData = { ...withheld, revealed: true };

describe("the page's shared Case Data cache", () => {
  it("makes one request for several users of the same Case", async () => {
    const load = vi.fn(async () => withheld);
    const cache = createCaseDataCache(load);
    const reads = await Promise.all([cache.load("fed-hike-1994"), cache.load("fed-hike-1994"), cache.load("fed-hike-1994")]);
    await cache.load("fed-hike-1994");
    expect(reads).toEqual([withheld, withheld, withheld]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fetches afresh after a Tutor turn clears it, so a Widget drawn after the reveal gets the full data", async () => {
    const load = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(withheld).mockResolvedValue(full);
    const cache = createCaseDataCache(load);
    expect(await cache.load("fed-hike-1994")).toEqual(withheld);
    cache.clear();
    expect(await cache.load("fed-hike-1994")).toEqual(full);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keys each Case by its reveal state, so data loaded before the reveal is never served after it, nor the other way", async () => {
    const load = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(withheld).mockResolvedValue(full);
    const cache = createCaseDataCache(load);
    expect(await cache.load("fed-hike-1994")).toEqual(withheld);
    cache.setRevealed(["fed-hike-1994"]);
    expect(await cache.load("fed-hike-1994")).toEqual(full);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed load, so a later read tries again", async () => {
    const load = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(null).mockResolvedValue(withheld);
    const cache = createCaseDataCache(load);
    expect(await cache.load("fed-hike-1994")).toBeNull();
    expect(await cache.load("fed-hike-1994")).toEqual(withheld);
  });

  it("tells its readers when it is cleared, so a Widget already on the page reads again", () => {
    const cache = createCaseDataCache(async () => withheld);
    const heard = vi.fn();
    const stop = cache.subscribe(heard);
    cache.clear();
    cache.setRevealed(["fed-hike-1994"]);
    stop();
    cache.clear();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  describe("revalidating after a turn (stale while revalidating)", () => {
    it("keeps the held entry and its version when the server sends the same data", async () => {
      const load = vi.fn(async () => structuredClone(withheld));
      const cache = createCaseDataCache(load);
      const first = cache.load("fed-hike-1994");
      await first;
      const before = cache.version();
      const heard = vi.fn();
      cache.subscribe(heard);
      await cache.revalidate();
      expect(load).toHaveBeenCalledTimes(2);
      expect(cache.load("fed-hike-1994")).toBe(first);
      expect(cache.version()).toBe(before);
      expect(heard).not.toHaveBeenCalled();
    });

    it("serves the old data until the new arrives, then replaces the entry and tells its readers", async () => {
      let release!: (d: CaseData) => void;
      const load = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(withheld).mockReturnValueOnce(new Promise((r) => (release = r)));
      const cache = createCaseDataCache(load);
      await cache.load("fed-hike-1994");
      const heard = vi.fn();
      cache.subscribe(heard);
      const running = cache.revalidate();
      expect(await cache.load("fed-hike-1994")).toEqual(withheld);
      release(full);
      await running;
      expect(await cache.load("fed-hike-1994")).toEqual(full);
      expect(heard).toHaveBeenCalledTimes(1);
    });

    it("keeps what it holds when the revalidation fails", async () => {
      const load = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(withheld).mockRejectedValue(new Error("offline"));
      const cache = createCaseDataCache(load);
      await cache.load("fed-hike-1994");
      await cache.revalidate();
      expect(await cache.load("fed-hike-1994")).toEqual(withheld);
    });
  });
});
