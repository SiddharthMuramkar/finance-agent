import { describe, expect, it } from "vitest";
import { loadCourseMap, readOutlineText } from "./map";
import { parseOutline } from "./outline";

/**
 * #94 (spec #68): the annual-report Topic covers all five markets. Besides the US and India (#93), Japan, Korea and Europe
 * each get a part: a Case on one real report that names it, with the regulator's, exchange's or company's own copy of that
 * report among the outline Case's sources, so a Learner can find the six numbers in a company from any of the five.
 */

const TOPIC = "spine-annual-report";

// Market -> the report each part must name in its story, and the hosts that publish it first-hand (exchange, regulator,
// company). Checked by hand against the filings on 16 Nov 2026.
const MARKETS = [
  { market: "Japan", report: /kessan tanshin|yuho|annual securities report/i, hosts: ["www.nintendo.co.jp", "www2.jpx.co.jp", "disclosure2.edinet-fsa.go.jp"] },
  { market: "Korea", report: /business report/i, hosts: ["dart.fss.or.kr", "images.samsung.com"] },
  { market: "Europe", report: /universal registration document|IFRS|ESEF/i, hosts: ["lvmh-com.cdn.prismic.io", "www.amf-france.org"] },
] as const;

describe("annual-report Topic: Japan, Korea and Europe (#94)", () => {
  const topic = loadCourseMap().topic(TOPIC)!;
  const outline = parseOutline(readOutlineText()).outline!.topics.find((t) => t.id === TOPIC)!;

  for (const { market, report, hosts } of MARKETS) {
    it(`${market}: a Case names its source report, and its outline Case cites a first-hand copy`, () => {
      const c = topic.cases.find((x) => x.story.includes(market));
      expect(c, `no Case story mentions ${market}`).toBeDefined();
      expect(c!.story).toMatch(report);
      const listed = outline.cases.find((x) => x.title === c!.title);
      expect(listed, `outline has no Case titled "${c!.title}"`).toBeDefined();
      expect(listed!.verified).toBe(true);
      expect(listed!.sources.some((s) => hosts.includes(new URL(s).host as never))).toBe(true);
    });
  }

  it("the concept names the five markets' reports", () => {
    for (const word of ["10-K", "India", "Japan", "Korea", "Europe"]) expect(topic.concept).toContain(word);
  });
});
