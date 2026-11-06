import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Historian finding #516: the bond-selloff-1994 reveal quotes the FOMC statement of 4 February 1994, so the Topic
 * file's own "Case sources (checked)" header must name that statement, not only course/outline.yaml.
 */
const FOMC_URL = "https://www.federalreserve.gov/fomc/19940204default.htm";

describe("bond-pricing Case sources header", () => {
  const text = readFileSync(join(process.cwd(), "course/topics/bond-pricing.yaml"), "utf8");
  const header = text.split("\n").find((l) => l.startsWith("# Case sources (checked):")) ?? "";

  it("#516: the reveal quotes the FOMC statement and the header names its URL", () => {
    expect(text).toContain("decided to increase slightly the degree of pressure on reserve positions");
    expect(header).toContain(`Federal Reserve, FOMC statement of 4 February 1994: ${FOMC_URL}`);
  });
});
