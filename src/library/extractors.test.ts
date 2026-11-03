import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The other sources' extractors are Python (scripts/library/sources.py); the blog is read in TypeScript (blog.ts, tested in blog.test.ts). These tests run its pure functions on tiny made-up
// inputs, so no real source text is needed; the real runs are the commands in scripts/library/sources.json.
function python<T>(code: string): T {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("sources", "scripts/library/sources.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
${code}
`;
  return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8" })) as T;
}

describe("HTML extractors", () => {
  it("turns a post into sections at its headings, with table rows as cells and list items as bullets", () => {
    const html = `<div>Intro line<br>second line</div><h3>Chapter 1. Rates</h3><p>Rates <b>rose</b>.</p>
      <table><tr><td>Year</td><td>Yield</td></tr><tr><td>1994</td><td>7.8%</td></tr></table><ul><li>one</li></ul><script>x()</script>`;

    const sections = python<{ heading: string; paragraphs: string[] }[]>(`print(json.dumps(m.sections_from_blocks(m.html_blocks(${JSON.stringify(html)}))))`);

    expect(sections).toEqual([
      { heading: "", paragraphs: ["Intro line", "second line"] },
      { heading: "Chapter 1. Rates", paragraphs: ["Rates rose.", "Year | Yield", "1994 | 7.8%", "• one"] },
    ]);
  });
});

describe("EDGAR page-layout extractor", () => {
  const font = (left: number, width: number, text: string, bold = false) =>
    `<font style="font-size:9pt;font-weight:${bold ? "bold" : "normal"};left:${left}pt;position:absolute;width:${width}pt">${text}</font>`;
  const line = (top: number, ...fonts: string[]) => `<div style="font-size:12pt;position:absolute;top:${top}pt;width:612pt">${fonts.join("")}</div>`;
  const page = (...lines: string[]) => `<div style="background-color:#FFFFFF;border:1px solid #CCCC;height:792pt">${lines.join("")}</div>`;

  it("rebuilds words split across font pieces, joins wrapped lines, splits paragraphs on the gap, and heads sections with the page number", () => {
    const body =
      "<body>" +
      page(line(50, font(72, 90, "Liquidity", true)), line(70, font(72, 100, "as of "), font(172, 80, "December&#160;31, 2025")), line(82, font(72, 60, "the Company"))) +
      page(line(50, font(72, 90, "Risk Factors", true)), line(70, font(72, 100, "Funding", false), font(190, 30, "gap")), line(100, font(72, 60, "Next paragraph."))) +
      "</body>";

    const doc = python<{ sections: { heading: string; paragraphs: string[] }[]; publishedOn: string }>(
      `print(json.dumps(m.layout_pages_to_document(${JSON.stringify(body)}, "s-1", "S-1", "https://example.org/s1", "2026-10-26")))`,
    );

    expect(doc.publishedOn).toBe("2026-10-26");
    expect(doc.sections).toEqual([
      { heading: "Liquidity (page 1)", paragraphs: ["as of December 31, 2025 the Company"] },
      { heading: "Risk Factors (page 2)", paragraphs: ["Funding | gap", "Next paragraph."] },
    ]);
  });
});
