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
});
