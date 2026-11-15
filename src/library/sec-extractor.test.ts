import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sources from "../../scripts/library/sources.json";
import { isBlockedSource } from "./ingest";

// The SEC EDGAR readers in scripts/library/sources.py (#38): the 1990s plain-text filings of Amazon and Webvan and the
// We Company S-1, on tiny made-up filings in EDGAR's layouts, so no real filing text is needed. The whole-source runs
// read a scratch folder that already holds the downloads (fetch() reads its cache first), so they make no request.
function python<T>(code: string): T {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("sources", "scripts/library/sources.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
${code}
`;
  return JSON.parse(execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }).trim().split("\n").at(-1)!) as T;
}

type Doc = { ref: string; title: string; url: string; publishedOn: string; sections: { heading: string; paragraphs: string[] }[] };

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/** A scratch folder holding the given cached downloads. */
function scratchWith(files: Record<string, string>): string {
  scratch = mkdtempSync(join(tmpdir(), "sec-extractor-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(scratch, name), text);
  return scratch;
}

/** A submissions table as EDGAR lays one out: one array per column. */
const table = (rows: { accessionNumber: string; filingDate: string; form: string; primaryDocument?: string }[]) => ({
  accessionNumber: rows.map((r) => r.accessionNumber),
  filingDate: rows.map((r) => r.filingDate),
  form: rows.map((r) => r.form),
  primaryDocument: rows.map((r) => r.primaryDocument ?? ""),
});

describe("EDGAR submissions record", () => {
  const record = {
    name: "AMAZON COM INC",
    filings: {
      recent: table([{ accessionNumber: "0001018724-26-000001", filingDate: "2026-02-06", form: "10-K", primaryDocument: "amzn-20251231.htm" }]),
      files: [{ name: "CIK0001018724-submissions-001.json" }, { name: "CIK0001018724-submissions-002.json" }],
    },
  };
  const older = table([{ accessionNumber: "0000891020-98-000448", filingDate: "1998-03-30", form: "10-K405" }]);

  it("finds a 1990s filing in the older pages that filings.files names, reading only as many pages as it needs", () => {
    const found = python<{ row: Record<string, string>; read: string[] }>(`
read = []
pages = {"CIK0001018724-submissions-001.json": ${JSON.stringify(older)}}
def load(name):
    read.append(name)
    return pages[name]
row = m.filing_row(${JSON.stringify(record)}, "0000891020-98-000448", load)
print(json.dumps({"row": row, "read": read}))`);

    expect(found.row).toEqual({ accessionNumber: "0000891020-98-000448", filingDate: "1998-03-30", form: "10-K405", primaryDocument: "" });
    expect(found.read).toEqual(["CIK0001018724-submissions-001.json"]);
  });

  it("says so when no page holds the accession", () => {
    const error = python<string>(`
try:
    m.filing_row(${JSON.stringify(record)}, "0000000000-00-000000", lambda name: ${JSON.stringify(older)})
    print(json.dumps("found"))
except KeyError as e:
    print(json.dumps(str(e)))`);

    expect(error).toMatch(/0000000000-00-000000 is not in the submissions record of AMAZON COM INC/);
  });
});

// A 1998 10-K405 in EDGAR's full-submission .txt: SGML header, the form as the first <DOCUMENT>, then exhibits (often
// uuencoded). Pages end with a centred page number and a <PAGE> marker; a paragraph can run on across one.
const tenK = [
  "<SEC-DOCUMENT>0000891020-98-000448.txt : 19980331",
  "<SEC-HEADER>0000891020-98-000448.hdr.sgml : 19980331",
  "CONFORMED SUBMISSION TYPE:\t10-K405",
  "CONFORMED PERIOD OF REPORT:\t19971231",
  "FILED AS OF DATE:\t\t19980330",
  "</SEC-HEADER>",
  "<DOCUMENT>",
  "<TYPE>10-K405",
  "<SEQUENCE>1",
  "<TEXT>",
  "<PAGE>   1",
  "                               TABLE OF CONTENTS",
  "",
  "ITEM 1.  Business.................................................     2",
  "ITEM 7.  Management's Discussion and Analysis......................    15",
  "",
  "                                     PART I",
  "",
  "ITEM 1.  BUSINESS",
  "",
  "GENERAL",
  "",
  "     Amazon.com, Inc. is the leading online retailer of books. The Company",
  "opened its virtual doors on the World Wide Web in July 1995 and",
  "",
  "                                       2",
  "",
  "<PAGE>   3",
  "offers more than 2.5 million titles.",
  "",
  "     Net sales rose in 1997.",
  "",
  "<TABLE>",
  "<CAPTION>",
  "                                     1996        1997",
  "                                   --------    --------",
  "<S>                                <C>         <C>",
  "Net sales.......................   $ 15,746    $147,787",
  "</TABLE>",
  "",
  "ITEM 7.  MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND",
  "         RESULTS OF OPERATIONS",
  "",
  "     The Company has incurred net losses since inception.",
  "</TEXT>",
  "</DOCUMENT>",
  "<DOCUMENT>",
  "<TYPE>EX-27",
  "<SEQUENCE>2",
  "<TEXT>",
  "begin 644 financial-data-schedule.bin",
  "M1F%K92!B:6YA<GD@9&%T80==",
  "</TEXT>",
  "</DOCUMENT>",
  "</SEC-DOCUMENT>",
].join("\n");

const tenKSections = [
  {
    heading: "ITEM 1. BUSINESS — GENERAL",
    paragraphs: [
      "Amazon.com, Inc. is the leading online retailer of books. The Company opened its virtual doors on the World Wide Web in July 1995 and offers more than 2.5 million titles.",
      "Net sales rose in 1997.",
      "1996 | 1997",
      "Net sales | $ 15,746 | $147,787",
    ],
  },
  { heading: "ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS", paragraphs: ["The Company has incurred net losses since inception."] },
];

describe("EDGAR plain-text filings (the 1990s)", () => {
  it("reads only the first <DOCUMENT>, the form itself, with its type; the exhibits after it are left out", () => {
    const [text, kind] = python<[string, string]>(`print(json.dumps(m.first_sgml_document(${JSON.stringify(tenK)})))`);

    expect(kind).toBe("10-K405");
    expect(text).toContain("ITEM 1.  BUSINESS");
    expect(text).not.toContain("begin 644");
    expect(text).not.toContain("CONFORMED PERIOD");
  });

  it("heads sections with the ITEMs, joins a paragraph across a page break, turns table rows into cells, and drops the contents list, PART lines and page numbers", () => {
    const doc = python<Doc>(`print(json.dumps(m.plain_text_document(${JSON.stringify(tenK)}, "10-k405-0000891020-98-000448", "Amazon", "https://example.org/a.txt", "1998-03-30")))`);

    expect(doc.publishedOn).toBe("1998-03-30");
    expect(doc.sections).toEqual(tenKSections);
  });

  it("heads a prospectus, which has no ITEMs, with its centred titles, and drops the running head at the top of each page", () => {
    const prospectus = [
      "<DOCUMENT>",
      "<TYPE>424B1",
      "<TEXT>",
      "<PAGE>   1",
      "                                  WEBVAN GROUP, INC.",
      "",
      "                                  PROSPECTUS SUMMARY",
      "",
      "     Webvan is an online retailer of food and consumer goods.",
      "",
      "                                       1",
      "<PAGE>   2",
      "                                  WEBVAN GROUP, INC.",
      "",
      "                                     RISK FACTORS",
      "",
      "WE HAVE A LIMITED OPERATING HISTORY",
      "",
      "     We began delivering orders in June 1999.",
      "",
      "                                       2",
      "<PAGE>   3",
      "                                  WEBVAN GROUP, INC.",
      "",
      "     Our distribution centres cost about $35 million each.",
      "</TEXT>",
      "</DOCUMENT>",
    ].join("\n");

    const doc = python<Doc>(`print(json.dumps(m.plain_text_document(${JSON.stringify(prospectus)}, "424b1-x", "Webvan", "https://example.org/w.txt", "1999-11-05")))`);

    expect(doc.sections).toEqual([
      { heading: "PROSPECTUS SUMMARY", paragraphs: ["Webvan is an online retailer of food and consumer goods."] },
      { heading: "RISK FACTORS — WE HAVE A LIMITED OPERATING HISTORY", paragraphs: ["We began delivering orders in June 1999.", "Our distribution centres cost about $35 million each."] },
    ]);
  });

  it("makes one document per filing from the cached downloads, dated by the filing date, after checking the form the submissions API lists", () => {
    const dir = scratchWith({
      "submissions-0001018724.json": JSON.stringify({ name: "AMAZON COM INC", filings: { recent: table([]), files: [{ name: "CIK0001018724-submissions-001.json" }] } }),
      "CIK0001018724-submissions-001.json": JSON.stringify(table([{ accessionNumber: "0000891020-98-000448", filingDate: "1998-03-30", form: "10-K405" }])),
      "0000891020-98-000448.txt": tenK,
    });
    const out = join(dir, "out.json");

    python<null>(`m.sec_plain_filings("0001018724", "Amazon.com, Inc.", ["0000891020-98-000448"], ${JSON.stringify(dir)}, ${JSON.stringify(out)})\nprint("null")`);
    const docs = JSON.parse(readFileSync(out, "utf8")) as Doc[];

    expect(docs).toEqual([
      {
        ref: "10-k405-0000891020-98-000448",
        title: "Amazon.com, Inc. Form 10-K405 (period ended 1997-12-31, filed 1998-03-30)",
        url: "https://www.sec.gov/Archives/edgar/data/1018724/000089102098000448/0000891020-98-000448.txt",
        publishedOn: "1998-03-30",
        sections: tenKSections,
      },
    ]);
  });

  it("refuses a filing whose first document is not the form the submissions API lists", () => {
    const dir = scratchWith({
      "submissions-0001092657.json": JSON.stringify({ name: "WEBVAN GROUP INC", filings: { recent: table([{ accessionNumber: "0000891618-00-001877", filingDate: "2000-03-30", form: "10-K" }]) } }),
      "0000891618-00-001877.txt": tenK,
    });

    expect(() => python<null>(`m.sec_plain_filings("0001092657", "Webvan Group, Inc.", ["0000891618-00-001877"], ${JSON.stringify(dir)}, ${JSON.stringify(join(dir, "out.json"))})`)).toThrow(
      /AssertionError/,
    );
  });
});

describe("EDGAR flowing HTML filing (the We Company S-1)", () => {
  // Financial-printer HTML: one long document, section titles as paragraphs holding a contents target, and a
  // "Table of Contents" back-link and a page number on every page.
  const s1 = `<html><body>
    <p style="text-align:center"><a href="#toc">Table of Contents</a></p>
    <p style="text-align:center"><a name="toc"></a><b>TABLE OF CONTENTS</b></p>
    <table><tr><td><a href="#toc781982_1">Prospectus Summary</a></td><td>1</td></tr></table>
    <p style="text-align:center">i</p>
    <h5><a href="#toc">Table of Contents</a></h5>
    <p style="font-weight:bold"><a name="toc781982_1"></a>PROSPECTUS SUMMARY</p>
    <p>We are a community company committed to maximum global impact.</p>
    <table><tr><td>Revenue</td><td>$1,543</td></tr></table>
    <p style="text-align:center">1</p>
    <p style="text-align:center"><a href="#toc">Table of Contents</a></p>
    <div><a name="toc781982_2"></a></div>
    <p style="font-weight:bold"><a name="toc781982_3"></a>RISK FACTORS</p>
    <p>We have a history of losses.</p>
    <p style="text-align:center">F-2</p>
  </body></html>`;

  it("turns the contents targets into headings and drops the contents list, the back-links and the page numbers", () => {
    expect(python<unknown>(`print(json.dumps(m.flowing_html_sections(${JSON.stringify(s1)})))`)).toEqual([
      { heading: "PROSPECTUS SUMMARY", paragraphs: ["We are a community company committed to maximum global impact.", "Revenue | $1,543"] },
      { heading: "RISK FACTORS", paragraphs: ["We have a history of losses."] },
    ]);
  });

  it("dates the S-1 by its filing date and names the company as it filed, from the cached downloads", () => {
    const accession = "0001193125-19-220499";
    const dir = scratchWith({
      "submissions-0001533523.json": JSON.stringify({
        name: "WeWork Inc.",
        filings: { recent: table([{ accessionNumber: accession, filingDate: "2019-08-14", form: "S-1", primaryDocument: "d781982ds1.htm" }]) },
      }),
      [`${accession}-d781982ds1.htm`]: s1,
    });
    const out = join(dir, "out.json");

    python<null>(
      `m.sec_filing("0001533523", "${accession}", "d781982ds1.htm", "Form S-1 registration statement", ${JSON.stringify(dir)}, ${JSON.stringify(out)}, reader="flowing", company="The We Company")\nprint("null")`,
    );
    const [doc] = JSON.parse(readFileSync(out, "utf8")) as Doc[];

    expect(doc).toMatchObject({
      ref: `s-1-${accession}`,
      title: "The We Company: Form S-1 registration statement",
      url: "https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm",
      publishedOn: "2019-08-14",
    });
    expect(doc.sections.map((s) => s.heading)).toEqual(["PROSPECTUS SUMMARY", "RISK FACTORS"]);
  });
});

describe("the SEC source records", () => {
  const sec = (id: string) => sources.find((s) => s.id === id);

  it.each([
    ["sec-amazon-1997-2000", "sources.py sec-amazon-1997-2000"],
    ["sec-webvan-1999-2001", "sources.py sec-webvan-1999-2001"],
    ["sec-wework-s1-2019", "sources.py sec-wework-s1-2019"],
  ])("%s is dated by filing, a public SEC filing credited to EDGAR, and allowed in the Library", (id, command) => {
    const s = sec(id);
    expect(s).toMatchObject({ kind: "dated", licence: "Public SEC filing", licenceUrl: "https://www.sec.gov/os/accessing-edgar-data" });
    expect(s?.credit).toMatch(/\(SEC EDGAR\)$/);
    expect(s?.fetch).toContain(command);
    expect(isBlockedSource(s!)).toBe(false);
  });

  it("keeps the We Company's September amendments out: they come after every WeWork Case date", () => {
    expect(sec("sec-wework-s1-2019")?.fetch).toMatch(/S-1 as filed on 2019-08-14 only/);
  });
});
