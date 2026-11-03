import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { importLibrary, type LibraryFile } from "./ingest";
import { prepareDocuments } from "./prepare";
import { searchPassages } from "./search";
import { crossCheck, fetchSpreadsheet, normaliseSpreadsheetUrl, orderSheets, passageDate, readWorkbook, spreadsheetLinks, workbookDocument } from "./spreadsheets";

const sample = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const post = { ref: "post-777", title: "Valuing a lottery", publishedOn: "2018-10-20" };
const URL_XLSX = "https://pages.stern.nyu.edu/~adamodar/pc/blog/lottery.xlsx";

describe.each(["sample.xlsx", "sample.xls"])("reading %s", (file) => {
  const { sheets, hiddenSkipped } = readWorkbook(sample(file));

  it("skips hidden sheets and reads Excel's saved values, not recalculated ones", () => {
    expect(hiddenSkipped).toBe(1);
    expect(sheets.map((s) => s.name)).toEqual(["Lookup", "Input sheet", "Valuation output"]);
    expect(sheets.find((s) => s.name === "Input sheet")!.lines).toContain("Doubled revenues | 2000");
    expect(JSON.stringify(sheets)).not.toContain("do not index");
  });

  it("puts input, output and valuation sheets first", () => {
    expect(orderSheets(sheets).map((s) => s.name)).toEqual(["Input sheet", "Valuation output", "Lookup"]);
  });

  it("makes passages that each open with a sentence naming the post", () => {
    const doc = workbookDocument({ post, url: URL_XLSX, lastModified: null, sheets })!;
    const { passages } = prepareDocuments([doc]);
    expect(passages.length).toBeGreaterThanOrEqual(3);
    for (const p of passages) expect(p.text).toMatch(/^This is the sheet ".+" of the spreadsheet lottery\.xlsx, linked from Aswath Damodaran's post "Valuing a lottery", published 2018-10-20 on Musings on Markets\./);
    expect(passages[0].text).toContain("Input sheet");
    expect(passages[0].text).toContain("Revenues in last year | 1000");
  });
});

describe("workbook passages", () => {
  it("keeps at most 12 passages from one workbook", () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `Row ${i} | value ${i} | more words to fill the line up`);
    const doc = workbookDocument({ post, url: URL_XLSX, lastModified: null, sheets: [{ name: "Big", lines }] })!;
    expect(prepareDocuments([doc]).passages).toHaveLength(12);
  });

  it("gives nothing for a workbook with no readable rows", () => {
    expect(workbookDocument({ post, url: URL_XLSX, lastModified: null, sheets: [] })).toBeNull();
  });

  it("dates a passage by the later of the post date and the file's last-modified date", () => {
    expect(passageDate("2018-10-20", "Tue, 05 Mar 2019 10:00:00 GMT")).toBe("2019-03-05");
    expect(passageDate("2018-10-20", "Mon, 01 Jan 2018 10:00:00 GMT")).toBe("2018-10-20");
    expect(passageDate("2018-10-20", null)).toBe("2018-10-20");
    expect(passageDate("2018-10-20T08:00:00.000-07:00", "garbage")).toBe("2018-10-20");
  });

  it("holds the as-of rule: a file changed after its post stays hidden from a Case set between the two dates", async () => {
    const { sheets } = readWorkbook(sample("sample.xlsx"));
    const doc = workbookDocument({ post, url: URL_XLSX, lastModified: "Tue, 05 Mar 2019 10:00:00 GMT", sheets })!;
    const file: LibraryFile = {
      source: {
        id: "damodaran-spreadsheets",
        title: "Spreadsheets behind Damodaran's posts",
        kind: "dated",
        licence: "Open site: free use for study with credit, no commercial resale",
        licenceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html",
        credit: "Aswath Damodaran, NYU Stern (pages.stern.nyu.edu/~adamodar), used with acknowledgement",
        url: "https://pages.stern.nyu.edu/~adamodar/",
        fetchedOn: "2026-11-03",
      },
      passages: prepareDocuments([doc]).passages,
    };
    const db = await testDb();
    await importLibrary(db, file);

    const early = await searchPassages(db, { query: "valuation operating assets revenues", asOf: "2018-10-24" });
    const late = await searchPassages(db, { query: "valuation operating assets revenues", asOf: "2019-04-01" });

    expect(early).toHaveLength(0);
    expect(late.length).toBeGreaterThan(0);
    expect(late[0].publishedOn).toBe("2019-03-05");
    expect(late[0].quoteWords).toBeNull();
  });
});

describe("finding the spreadsheets a post links to", () => {
  it("keeps his worked-example files in one canonical form and leaves out datasets and implied-premium files", () => {
    const html = `<a href="http://www.stern.nyu.edu/%7Eadamodar/pc/blog/lottery.xlsx">a</a>
      <a href="http://www.stern.nyu.edu/~adamodar/pc/blog/lottery.xlsx">again</a>
      <a href="https://pages.stern.nyu.edu/~adamodar/pc/fcffsimpleginzu.xls?x=1">b</a>
      <a href="http://www.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx">dataset</a>
      <a href="https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPJan24.xlsx">implied</a>
      <a href="https://example.org/other.xlsx">elsewhere</a>
      <a href="http://www.stern.nyu.edu/~adamodar/pc/R&amp;DConv.xls">entity</a>
      <a href="https://pages.stern.nyu.edu/~adamodar/pc/blog/page.html">html</a>`;
    expect(spreadsheetLinks(html)).toEqual([
      "https://pages.stern.nyu.edu/~adamodar/pc/blog/lottery.xlsx",
      "https://pages.stern.nyu.edu/~adamodar/pc/fcffsimpleginzu.xls",
      "https://pages.stern.nyu.edu/~adamodar/pc/R&DConv.xls",
    ]);
  });

  it("repairs the doubled scheme in a mistyped link", () => {
    expect(normaliseSpreadsheetUrl("http://http//www.stern.nyu.edu/~adamodar/pc/blog/TwitterAug2014.xls")).toBe("https://pages.stern.nyu.edu/~adamodar/pc/blog/TwitterAug2014.xls");
  });
});

describe("downloading", () => {
  it("returns the bytes and the last-modified header, and null for a missing file", async () => {
    const ok = (async () => new Response(sample("sample.xlsx"), { headers: { "last-modified": "Tue, 05 Mar 2019 10:00:00 GMT" } })) as unknown as typeof fetch;
    const missing = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;

    const got = await fetchSpreadsheet(URL_XLSX, ok);

    expect(got?.lastModified).toBe("Tue, 05 Mar 2019 10:00:00 GMT");
    expect(readWorkbook(got!.bytes).sheets.length).toBe(3);
    expect(await fetchSpreadsheet(URL_XLSX, missing)).toBeNull();
  });
});

describe("the picture-versus-spreadsheet cross-check", () => {
  it("lists the figures both readings hold and those only the picture has", () => {
    const result = crossCheck("Revenues 1,000 | Value per share 17.25 | Beta 1.320", "Revenues in last year | 1000\nValue per share | 17.25");
    expect(result.shared).toEqual(["1000", "17.25"]);
    expect(result.pictureOnly).toEqual(["1.32"]);
  });
});
