import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sources from "../../scripts/library/sources.json";
import { isBlockedSource } from "./ingest";

// The Investor.gov reader in scripts/library/sources.py (#38), on tiny made-up pages in the site's layout (Drupal: the
// page's own text in the first body field inside <article>, then site-wide blocks after it), so no real page is
// needed; the real run is the "fetch" line of investor-gov-explainers in scripts/library/sources.json.
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

type Page = { title: string; sections: { heading: string; paragraphs: string[] }[] };

/** An Investor.gov page: navigation, the <article> with its title and body, then the site's own blocks (featured cards, sign-up). */
const page = (title: string, article: string) => `<html><head><title>${title} | Investor.gov</title></head><body>
  <nav><h2>Main navigation</h2><ul><li><a href="/introduction-investing">Introduction to Investing</a></li></ul></nav>
  <div class="region region-breadcrumb"><ol class="breadcrumb"><li><a href="/">Home</a></li></ol></div>
  <main><div class="main-content region region-content"><div id="block-investor-content">
  ${article}
  </div>
  <div class="block block-views block-views-blockfeatured-content-block-1"><h2>Featured Content</h2><div class="card-body"><p>Take this month's quiz!</p></div></div>
  </div></main>
  <div class="site-footer"><div class="block-title-footer"><div class="field field--name-body field--type-text-with-summary"><h2>Never stop learning about investing!</h2><p>Stay up to date.</p></div></div></div>
  </body></html>`;

const bonds = page(
  "Bonds - FAQs",
  `<article class="node node--type-article node--view-mode-full"><div class="node__content main">
    <div class="block block-entity-fieldnodetitle"><h1 class="field field--name-title field--type-string">Bonds - FAQs</h1></div>
    <div class="block block-field-blocknodearticlebody"><div class="field field--name-body field--type-text-with-summary field__item"><h2>What are bonds?</h2><p>A bond is a debt security, like an IOU.</p>
      <div class="flex-video"><p><iframe src="https://www.youtube.com/embed/x" title="YouTube video player"></iframe></p></div>
      <p><a href="#Buy">Why are bonds bought and sold?</a><br><a href="#Info">Additional information</a></p>
      <h2><a class="ck-anchor" id="Buy"></a>Why are bonds bought and sold?</h2><p>Investors buy bonds because:</p>
      <ul><li data-list-item-id="e1">They provide a predictable income stream.</li><li data-list-item-id="e2"><a href="/glossary/maturity">Maturity</a></li></ul>
      <p>See <a href="/glossary/coupon">coupon</a> for how interest is paid.</p>
      <div><div class="inner"><p>Bonds can help offset exposure to more volatile stock holdings.</p></div></div>
      <h2><a class="ck-anchor" id="Info"></a>Additional information</h2><p><a href="https://www.finra.org/bonds">FINRA Bonds Webpage</a><br><a href="http://www.sec.gov/answers/bondfunds.htm">Bond Funds</a></p>
      <p>The rest of a links block.</p>
    </div></div>
    <div class="block block-extra-field-blocknodearticlelinks"></div>
  </div></article>`,
);

const glossary = page(
  "Compound Interest",
  `<div class="region region-header"><h1 class="page-title"><h1 class="field field--name-title field--type-string">Compound Interest</h1></h1></div>
  <article class="node node--type-glossary-term node--view-mode-full"><div class="node__content main">
    <div class="field field--name-body field--type-text-with-summary field__item"><p>Interest paid on principal and on accumulated interest.</p><p><iframe src="https://www.youtube.com/embed/y"></iframe></p></div>
  </div></article>`,
);

const bulletin = page(
  "Investor Bulletin: Fixed Income Investments — When Interest Rates Go Up, Prices of Fixed-Rate Bonds Fall",
  `<article class="node node--type-news node--view-mode-full"><div class="node__content main">
    <div class="block block-field-blocknodenewsfield-date"><div class="article-date field_date">June 26, 2013</div></div>
    <div class="block block-field-blocknodenewsbody"><div class="article-body"><p><em>The SEC’s Office of Investor Education and Assistance is issuing this Investor Bulletin to make investors aware that market interest rates and bond prices move in opposite directions.</em></p>
      <h2>The Effect of Market Interest Rates on Bond Prices and Yield</h2><p>When market interest rates rise, prices of fixed-rate bonds fall. This is known as <strong>interest rate risk</strong>.</p>
      <div align="center"><p><img src="/sites/investorgov/files/seesaw_0.jpg" alt="seesaw picture"></p></div>
      <h2>Additional Information</h2><ul><li><a href="http://sec.gov/investor/alerts/ib_corporatebonds.pdf">SEC Investor Bulletin: What Are Corporate Bonds?</a></li></ul>
      <div id="content-inner"><hr><p><em>This Investor Bulletin represents the views of the staff of the Office of Investor Education and Assistance. It is not a rule, regulation, or statement of the Securities and Exchange Commission.</em></p></div>
    </div></div>
  </div></article>`,
);

describe("Investor.gov page", () => {
  it("keeps only the article's own text: no navigation, jump links, link-only lines, video, 'Additional information' links or site blocks", () => {
    expect(python<Page>(`print(json.dumps(m.investor_gov_page(${JSON.stringify(bonds)})))`)).toEqual({
      title: "Bonds - FAQs",
      sections: [
        { heading: "What are bonds?", paragraphs: ["A bond is a debt security, like an IOU."] },
        {
          heading: "Why are bonds bought and sold?",
          paragraphs: [
            "Investors buy bonds because:",
            "• They provide a predictable income stream.",
            "See coupon for how interest is paid.",
            "Bonds can help offset exposure to more volatile stock holdings.",
          ],
        },
      ],
    });
  });

  it("reads a glossary entry: a one-line body under the term", () => {
    expect(python<Page>(`print(json.dumps(m.investor_gov_page(${JSON.stringify(glossary)})))`)).toEqual({
      title: "Compound Interest",
      sections: [{ heading: "", paragraphs: ["Interest paid on principal and on accumulated interest."] }],
    });
  });

  it("reads an Investor Bulletin's body without its date line or the staff-views disclaimer", () => {
    expect(python<Page>(`print(json.dumps(m.investor_gov_page(${JSON.stringify(bulletin)})))`)).toEqual({
      title: "Investor Bulletin: Fixed Income Investments — When Interest Rates Go Up, Prices of Fixed-Rate Bonds Fall",
      sections: [
        {
          heading: "",
          paragraphs: [
            "The SEC’s Office of Investor Education and Assistance is issuing this Investor Bulletin to make investors aware that market interest rates and bond prices move in opposite directions.",
          ],
        },
        { heading: "The Effect of Market Interest Rates on Bond Prices and Yield", paragraphs: ["When market interest rates rise, prices of fixed-rate bonds fall. This is known as interest rate risk."] },
      ],
    });
  });

  it("finds nothing on a page without an article (a listing or an error page)", () => {
    expect(python<Page>(`print(json.dumps(m.investor_gov_page("<html><head><title>Page not found | Investor.gov</title></head><body><main><p>Sorry.</p></main></body></html>")))`)).toEqual({
      title: "Page not found",
      sections: [],
    });
  });
});

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("the investor-gov-explainers run", () => {
  it("makes one timeless document per page from the cached downloads, linked to the page, and skips a page with no text", () => {
    scratch = mkdtempSync(join(tmpdir(), "investorgov-extractor-"));
    mkdirSync(join(scratch, "investor-gov"));
    const pages = ["introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds", "introduction-investing/investing-basics/glossary/compound-interest", "gone"];
    writeFileSync(join(scratch, "investor-gov", `${pages[0].replaceAll("/", "-")}.html`), bonds);
    writeFileSync(join(scratch, "investor-gov", `${pages[1].replaceAll("/", "-")}.html`), glossary);
    writeFileSync(join(scratch, "investor-gov", "gone.html"), "<html><body><main><p>Sorry.</p></main></body></html>");
    const out = join(scratch, "out.json");

    python<null>(`m.investor_gov(${JSON.stringify(scratch)}, ${JSON.stringify(out)}, pages=${JSON.stringify(pages)})\nprint("null")`);
    const docs = JSON.parse(readFileSync(out, "utf8")) as { ref: string; title: string; url: string; publishedOn: null; sections: unknown[] }[];

    expect(docs.map(({ sections, ...d }) => ({ ...d, sections: sections.length }))).toEqual([
      {
        ref: "introduction-investing-investing-basics-investment-products-bonds-or-fixed-income-products-bonds",
        title: "Investor.gov: Bonds - FAQs",
        url: "https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds",
        publishedOn: null,
        sections: 2,
      },
      {
        ref: "introduction-investing-investing-basics-glossary-compound-interest",
        title: "Investor.gov: Compound Interest",
        url: "https://www.investor.gov/introduction-investing/investing-basics/glossary/compound-interest",
        publishedOn: null,
        sections: 1,
      },
    ]);
  });

  it("the page list is 40 to 60 distinct Investor.gov paths, without the pages about 2020s products (crypto assets, tokenized securities, Trump Accounts)", () => {
    const list = python<string[]>(`print(json.dumps(m.INVESTOR_GOV_PAGES))`);

    expect(list.length).toBeGreaterThanOrEqual(40);
    expect(list.length).toBeLessThanOrEqual(60);
    expect(new Set(list).size).toBe(list.length);
    for (const p of list) expect(p).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/);
    expect(list.filter((p) => /crypto|tokenized|trump-accounts/.test(p))).toEqual([]);
  });
});

describe("the investor-gov-explainers source record", () => {
  it("is timeless, a US government work credited to the SEC's Investor.gov, and allowed in the Library", () => {
    const s = sources.find((x) => x.id === "investor-gov-explainers");
    expect(s).toMatchObject({ kind: "timeless", url: "https://www.investor.gov/", licenceUrl: "https://www.investor.gov/disclaimer" });
    expect(s?.licence).toMatch(/US government work/);
    expect(s?.credit).toMatch(/^U\.S\. Securities and Exchange Commission, Investor\.gov/);
    expect(s?.fetch).toContain("sources.py investor-gov");
    expect(isBlockedSource(s!)).toBe(false);
  });
});
