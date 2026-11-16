import { describe, expect, it } from "vitest";
import sources from "../../scripts/library/sources.json";
import { EFFR_NOTICE, NYFED_REFERENCE_RATE_NOTICE, passageNotices, SOFR_NOTICE } from "./credits";
import { librarySourceInput } from "./ingest";

const source = (id: string) => {
  const s = sources.find((x) => x.id === id);
  if (!s) throw new Error(`no source ${id}`);
  return s;
};

// The forms each owner asks for (#26; research/library-licences.md on branch research-library-licences).
describe("credit lines in the form each source's owner asks for", () => {
  it("OpenStax 1e: CC BY 4.0 §3(a) credit (authors, licence and its link, the source at its commit, the change made), pointing at GitHub, not openstax.org (#27, #38)", () => {
    const { credit, licence, licenceUrl, url } = source("openstax-principles-finance-1e");
    expect(credit).toBe(
      "Julie Dahlquist and Rainford Knight, Principles of Finance (OpenStax, 2022), CC BY 4.0; text from the OpenStax GitHub repository at commit 3b7fc65c52, cut into passages",
    );
    expect([licence, licenceUrl]).toEqual(["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]);
    // The snapshot is the last commit before OpenStax's licence change; its web pages now say CC BY-NC-SA.
    expect(url).toBe("https://github.com/openstax/osbooks-principles-finance/tree/3b7fc65c527ef51dbee24689691f19947fb72fb2");
    expect(`${credit} ${url}`).not.toContain("openstax.org");
  });

  it("OpenStax 2e is no longer listed: production dropped it on 2026-11-16 (#38), so no later load brings it back", () => {
    expect(sources.map((s) => s.id)).not.toContain("openstax-principles-finance-2e");
    // No other record loads the 2e book under a new id either (its title, credit, link or fetch line).
    expect(sources.filter((s) => /Principles of Finance 2e|principles-finance-2e/.test(JSON.stringify(s))).map((s) => s.id)).toEqual([]);
  });

  it("the Yale lecture Sources are no longer listed: Open Yale Courses' terms bar a fee-charging tutor service, so no load brings them back until written permission is on file (#118)", () => {
    expect(sources.map((s) => s.id).filter((id) => id.startsWith("yale-"))).toEqual([]);
    // No other record loads the lectures under a new id either (their link, credit or fetch line).
    expect(sources.filter((s) => /oyc\.yale\.edu|Open Yale Courses|econ-25[12]/i.test(JSON.stringify(s))).map((s) => s.id)).toEqual([]);
  });

  it("New York Fed: “© [year] Federal Reserve Bank of New York. Content from the New York Fed subject to the Terms of Use at newyorkfed.org.”", () => {
    expect(source("nyfed-explainers").credit).toMatch(/^© \d{4} Federal Reserve Bank of New York\. Content from the New York Fed subject to the Terms of Use at newyorkfed\.org\.$/);
  });

  it("the Damodaran blog's licence link no longer points at his NYU site guide, which covers pages.stern.nyu.edu and not the blog", () => {
    const blog = source("damodaran-blog");
    expect(blog.licenceUrl).not.toContain("pages.stern.nyu.edu");
    expect(blog.licenceUrl).toContain("section107");
    expect(blog.licence).toMatch(/^All rights reserved/);
  });

  it("every source still loads: its record passes the load schema", () => {
    for (const s of sources) {
      // Extra keys (fetch, publishedOn) are dropped by the schema, as the load script drops them.
      expect({ id: s.id, ok: librarySourceInput.safeParse(s).success }).toEqual({ id: s.id, ok: true });
    }
  });
});

describe("the New York Fed reference-rate notice", () => {
  it("fills in the Terms of Use form for SOFR and EFFR, naming Value It as the publisher", () => {
    expect(SOFR_NOTICE).toBe(
      "The Secured Overnight Financing Rate (SOFR) is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the SOFR by Value It, does not sanction or endorse any particular republication, and has no liability for your use.",
    );
    expect(EFFR_NOTICE).toContain("publication of the EFFR by Value It");
    expect(NYFED_REFERENCE_RATE_NOTICE).toMatch(/^The Secured Overnight Financing Rate \(SOFR\) and Effective Federal Funds Rate \(EFFR\) information is subject to the Terms of Use posted at newyorkfed\.org\./);
  });

  it("goes on passages from the NY Fed's SOFR and EFFR pages only", () => {
    expect(passageNotices({ sourceId: "nyfed-explainers", ref: "markets-reference-rates-sofr#3" })).toEqual([SOFR_NOTICE]);
    expect(passageNotices({ sourceId: "nyfed-explainers", ref: "markets-reference-rates-effr#1" })).toEqual([EFFR_NOTICE]);
    expect(passageNotices({ sourceId: "nyfed-explainers", ref: "markets-primarydealers#1" })).toEqual([]);
    expect(passageNotices({ sourceId: "openstax-principles-finance-1e", ref: "markets-reference-rates-sofr#1" })).toEqual([]);
  });
});
