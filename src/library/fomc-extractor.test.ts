import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import sources from "../../scripts/library/sources.json";

// The FOMC historical records reader in scripts/library/sources.py (#38), on tiny made-up pages in the layout of the
// Board's year pages (federalreserve.gov/monetarypolicy/fomchistorical<year>.htm), so no real text is needed; the real
// run is the "fetch" line of fomc-historical in scripts/library/sources.json.
function python<T>(code: string): T {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("sources", "scripts/library/sources.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
${code}
`;
  return JSON.parse(execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" })) as T;
}

const panel = (heading: string, body: string) => `<div class="panel panel-default"><div class="panel-heading"><h5>${heading}</h5></div><div class="panel-body">${body}</div></div>`;

describe("FOMC year page", () => {
  const page =
    `<h3>1994</h3>` +
    panel(
      "February 3-4 Meeting - 1994",
      `<p><a href="/monetarypolicy/files/fomc19940204beige19940119.pdf">Beige Book (PDF)</a></p>
       <p><a href="/fomc/19940204default.htm">Statement</a></p>
       <p><a href="/fomc/MINUTES/1994/19940204min.htm">Minutes</a> (Released March 25, 1994)</p>
       <p><a href="/fomc/MINUTES/1993/19931221min.htm#attend">Minutes</a> (attendance)</p>
       <p><a href="/monetarypolicy/files/FOMC19940204meeting.pdf">Transcript (PDF)</a></p>
       <p><a href="/monetarypolicy/files/FOMC19940204gbpt1.pdf">Greenbook Part 1 (PDF)</a></p>`,
    ) +
    panel("February 28 Conference Call - 1994", `<p><a href="/monetarypolicy/files/FOMC19940228confcall.pdf">Transcript (PDF)</a></p>`) +
    panel("January 31-February 1 Meeting - 1995", `<p><a href="/monetarypolicy/files/fomcropa19950201.pdf">Record of Policy Actions (PDF)</a></p>`) +
    panel("Related information", `<p><a href="/monetarypolicy/fomc.htm">FOMC</a></p>`);

  it("lists each meeting's statement, minutes (with their release date), policy record and Beige Book, and leaves the rest out", () => {
    const meetings = python<unknown[]>(`print(json.dumps(m.fomc_year_page(${JSON.stringify(page)}, 1994)))`);

    const fed = "https://www.federalreserve.gov";
    expect(meetings).toEqual([
      {
        label: "February 3-4, 1994",
        call: false,
        date: "1994-02-04",
        items: [
          { kind: "beige-book", url: `${fed}/monetarypolicy/files/fomc19940204beige19940119.pdf`, releasedOn: "1994-01-19" },
          { kind: "statement", url: `${fed}/fomc/19940204default.htm`, releasedOn: "1994-02-04" },
          { kind: "minutes", url: `${fed}/fomc/MINUTES/1994/19940204min.htm`, releasedOn: "1994-03-25" },
        ],
      },
      { label: "February 28, 1994", call: true, date: "1994-02-28", items: [] },
      { label: "January 31-February 1, 1995", call: false, date: "1995-02-01", items: [{ kind: "policy-record", url: `${fed}/monetarypolicy/files/fomcropa19950201.pdf`, releasedOn: null }] },
    ]);
  });

  it("counts days on the calendar, across a month and a year end", () => {
    expect(python<string[]>(`print(json.dumps([m.days_after("1994-01-28", 7), m.days_after("1979-12-27", 7), m.days_after("1980-02-27", 2)]))`)).toEqual([
      "1994-02-04",
      "1980-01-03",
      "1980-02-29",
    ]);
  });
});

describe("FOMC statement and minutes pages", () => {
  const shell = (body: string) =>
    `<html><head><title>FRB: Press Release -- FOMC statement -- February 4, 1994</title></head><body><table><tr><td>${body}</td></tr></table>
     <p>Return to top</p><p>Home | Monetary policy</p><p>Last update: May 4, 2007</p></body></html>`;

  it("keeps a statement's words, without the page title, the release line and the site footer", () => {
    const markup = shell(`<p><i>Release Date: February 4, 1994</i></p><p>For immediate release</p>
      <p>Chairman Alan Greenspan announced today that the Committee decided to increase slightly the degree of pressure on reserve positions.</p>
      <p>The action is expected to be associated with a small increase in short-term money market interest rates.</p>`);

    expect(python<unknown>(`print(json.dumps(m.fomc_html_sections(${JSON.stringify(markup)}, "statement")))`)).toEqual([
      {
        heading: "",
        paragraphs: [
          "Chairman Alan Greenspan announced today that the Committee decided to increase slightly the degree of pressure on reserve positions.",
          "The action is expected to be associated with a small increase in short-term money market interest rates.",
        ],
      },
    ]);
  });

  it("drops the minutes' list of those present and its numbered footnotes, and stops where the meeting adjourned", () => {
    const markup = shell(`<h3>Meeting of February 2-3, 1993</h3>
      <p>A meeting of the Federal Open Market Committee was held in the offices of the Board of Governors on February 2, 1993.</p>
      <p>PRESENT:</p><p>Mr. Greenspan, Chairman</p><p>Mr. Corrigan, Vice Chairman</p>
      <p>Messrs. Hoenig, Melzer, and Syron, Presidents of the Federal</p><p>Reserve Banks of Kansas City, St. Louis, and Boston,</p>
      <p>1. Attended Wednesday session only.</p>
      <p>3. Attended portion of meeting relating to the Committee's discussion of the economic outlook and its longer-run objectives.</p>
      <p>The Secretary reported that advices of the election of the Reserve Bank members had been received and that they had executed their oaths.</p>
      <p>It was agreed that the next meeting of the Committee would be held on Tuesday, March 23, 1993.</p>
      <p>The meeting adjourned.</p><p>Secretary</p>`);

    expect(python<unknown>(`print(json.dumps(m.fomc_html_sections(${JSON.stringify(markup)}, "minutes")))`)).toEqual([
      {
        heading: "",
        paragraphs: [
          "A meeting of the Federal Open Market Committee was held in the offices of the Board of Governors on February 2, 1993.",
          "The Secretary reported that advices of the election of the Reserve Bank members had been received and that they had executed their oaths.",
          "It was agreed that the next meeting of the Committee would be held on Tuesday, March 23, 1993.",
          "The meeting adjourned.",
        ],
      },
    ]);
  });
});

describe("FOMC Records of Policy Actions (typewritten PDFs)", () => {
  // Pages as `pdftotext -layout` prints them: indented first lines, a short last line, a page number.
  const full = "x".repeat(60);
  const page1 = [
    "     1. Domestic policy directive",
    "",
    `     The information reviewed at this meeting suggested that ${full}`,
    `real output of goods and services had grown at a moderate pace ${full}`,
    "in the fourth quarter.",
    `     The Committee adopted the following directive: ${full}`,
    `in the period ahead the Committee seeks to maintain ${full}`,
    "                                   -2-",
  ].join("\n");
  const page2 = [
    `the existing degree of pressure on reserve positions and ${full}`,
    "to reduce it somewhat later.",
    `         The Board of Governors approved a reduction in the ${full}`,
    "         discount rate on December",
    `         20. In foreign exchange markets, the trade-weighted ${full}`,
    `         value of the dollar rose slightly on balance over the ${full}`,
    "         period.",
    "     2. Authorization for domestic open market operations",
    `     The Committee voted to raise the limit on changes in ${full}`,
    "holdings between meetings.",
  ].join("\n");

  it("rebuilds paragraphs from the layout, joins them across the page break, and starts sections at numbered headings only", () => {
    const doc = python<{ sections: { heading: string; paragraphs: string[] }[]; publishedOn: string }>(
      `print(json.dumps(m.layout_document(${JSON.stringify([page1, page2])}, "policy-record-19790206", "Record", "https://example.org/r.pdf", "1979-03-23")))`,
    );

    expect(doc.publishedOn).toBe("1979-03-23");
    expect(doc.sections.map((s) => s.heading)).toEqual(["1. Domestic policy directive", "2. Authorization for domestic open market operations"]);
    const [first, second] = doc.sections.map((s) => s.paragraphs.map((p) => p.split("\n").map((l) => l.replace(/x{60}/, "…")).join(" ")));
    expect(first).toEqual([
      "The information reviewed at this meeting suggested that … real output of goods and services had grown at a moderate pace … in the fourth quarter.",
      "The Committee adopted the following directive: … in the period ahead the Committee seeks to maintain … the existing degree of pressure on reserve positions and … to reduce it somewhat later.",
      "The Board of Governors approved a reduction in the … discount rate on December 20. In foreign exchange markets, the trade-weighted … value of the dollar rose slightly on balance over the … period.",
    ]);
    expect(second).toEqual(["The Committee voted to raise the limit on changes in … holdings between meetings."]);
  });

  it("reads the release date from a press-release cover, and nothing from a page that is not one", () => {
    const cover = "For release at 4:00 p.m.\n\n     March 23, 1979\n\nThe Federal Open Market Committee today released the attached record of policy actions taken at its meeting on February 6, 1979.";
    expect(python<(string | null)[]>(`print(json.dumps([m.release_cover(${JSON.stringify(cover)}), m.release_cover(${JSON.stringify(page1)})]))`)).toEqual(["1979-03-23", null]);
  });
});

describe("the fomc-historical source record", () => {
  it("is dated, public domain, and credits the Board, which its site asks for", () => {
    const s = sources.find((x) => x.id === "fomc-historical");
    expect(s).toMatchObject({ kind: "dated", licenceUrl: "https://www.federalreserve.gov/disclaimer.htm", url: "https://www.federalreserve.gov/monetarypolicy/fomc_historical.htm" });
    expect(s?.licence).toMatch(/public domain/);
    expect(s?.credit).toMatch(/^Board of Governors of the Federal Reserve System, /);
    expect(s?.fetch).toContain("sources.py fomc-historical");
  });
});
