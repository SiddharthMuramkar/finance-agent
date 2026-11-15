import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// scripts/library/openstax.py on a tiny made-up book in OpenStax's CNXML layout (collections/<book>.collection.xml
// and modules/<id>/index.cnxml), so no real book text is needed; the real run is the "fetch" line of
// openstax-principles-finance-1e in scripts/library/sources.json.
const collection = `<col:collection xmlns:col="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml">
  <col:content>
    <col:module document="m00000"/>
    <col:subcollection>
      <md:title>Time Value of Money</md:title>
      <col:content>
        <col:module document="m00001"/>
        <col:module document="m00002"/>
      </col:content>
    </col:subcollection>
  </col:content>
</col:collection>`;

const cnxml = (cls: string, title: string, content: string) =>
  `<document xmlns="http://cnx.rice.edu/cnxml"${cls ? ` class="${cls}"` : ""}><title>${title}</title><content>${content}</content></document>`;

const modules: Record<string, string> = {
  m00000: cnxml("", "Preface", "<para>About OpenStax.</para>"),
  m00001: cnxml("introduction", "Why It Matters", `<para>Money has a time value.</para><figure id="f1"><media alt="x"><image src="x.jpg"/></media></figure>`),
  m00002: cnxml(
    "",
    "Present Value",
    `<section class="learning-objectives"><title>Learning Outcomes</title><para>Skip me.</para></section>` +
      `<para>A dollar today is worth more.</para>` +
      `<section><title>Discounting</title><para>Divide by (1 + r).</para><exercise><problem><para>Quiz.</para></problem></exercise></section>`,
  ),
};

const dir = mkdtempSync(join(tmpdir(), "openstax-"));
mkdirSync(join(dir, "collections"));
writeFileSync(join(dir, "collections", "tiny.collection.xml"), collection);
for (const [id, xml] of Object.entries(modules)) {
  mkdirSync(join(dir, "modules", id), { recursive: true });
  writeFileSync(join(dir, "modules", id, "index.cnxml"), xml);
}
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Doc = { ref: string; title: string; url: string; publishedOn: string | null; sections: { heading: string; paragraphs: string[] }[] };

function extract(...sourceUrl: string[]): Doc[] {
  const out = join(dir, `out-${sourceUrl.length}.json`);
  execFileSync("python3", ["-I", "scripts/library/openstax.py", dir, "tiny", out, ...sourceUrl], { encoding: "utf8" });
  return JSON.parse(readFileSync(out, "utf8")) as Doc[];
}

describe("OpenStax CNXML extractor", () => {
  const commit = "https://github.com/openstax/osbooks-principles-finance/blob/3b7fc65c527ef51dbee24689691f19947fb72fb2";

  it("with a source url, links each module to its CNXML file at that commit and keeps the module id as the ref", () => {
    const docs = extract(commit);

    expect(docs.map((d) => [d.ref, d.title, d.url])).toEqual([
      ["m00001", "1 Time Value of Money: Why It Matters", `${commit}/modules/m00001/index.cnxml`],
      ["m00002", "1.1 Present Value", `${commit}/modules/m00002/index.cnxml`],
    ]);
  });

  it("keeps the book's own words under their section headings and leaves out the preface, learning outcomes, exercises and figures", () => {
    const [intro, section] = extract(commit);

    expect(intro.sections).toEqual([{ heading: "", paragraphs: ["Money has a time value."] }]);
    expect(section.sections).toEqual([
      { heading: "", paragraphs: ["A dollar today is worth more."] },
      { heading: "Discounting", paragraphs: ["Divide by (1 + r)."] },
    ]);
    expect(section.publishedOn).toBeNull();
  });

  it("without a source url, links each module to the book's page on openstax.org, as the 2e load did", () => {
    expect(extract().map((d) => d.url)).toEqual(["https://openstax.org/books/tiny/pages/1-why-it-matters", "https://openstax.org/books/tiny/pages/1-1-present-value"]);
  });
});
