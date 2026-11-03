import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { blogDocuments, htmlBlocks, sectionsFromBlocks } from "./blog";

// The Python reader (scripts/library/sources.py) still reads the other sources' HTML. The blog is
// read in TypeScript; these tests hold the two together on the same sample HTML.
function pythonSections(html: string) {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("sources", "scripts/library/sources.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(json.dumps(m.sections_from_blocks(m.html_blocks(json.loads(${JSON.stringify(JSON.stringify(html))})))))
`;
  return JSON.parse(execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" })) as { heading: string; paragraphs: string[] }[];
}

const typescriptSections = (html: string) => sectionsFromBlocks(htmlBlocks(html));

const samples: Record<string, string> = {
  "headings, line breaks, tables and lists": `<div>Intro line<br>second line</div><h3>Chapter 1. Rates</h3><p>Rates <b>rose</b>.</p>
    <table><tr><td>Year</td><td>Yield</td></tr><tr><td>1994</td><td>7.8%</td></tr></table><ul><li>one</li><li>two</li></ul>`,
  "entities and non-breaking spaces": `<p>Tom &amp; Jerry paid&nbsp;5 &lt; 6 &#8364;10 &mdash; roughly.</p><p>  spaced \n\n out  </p>`,
  "scripts, styles and embedded videos leave nothing": `<p>Before</p><script>var x = "tracking";</script><style>p { color: red }</style>
    <iframe src="https://www.youtube.com/embed/abc"></iframe><div><object><embed src="x.swf">player fallback text</object></div>
    <video controls>Your browser does not support video</video><p>After</p>`,
  "self-closing tags and an image between paragraphs": `<p>One</p><img src="a.png"/><svg/><p>Two</p><br/>Three<hr/>Four`,
  "a heading in the middle of text and a bare first heading": `<h2>Start</h2>text under start<h4>Next <i>one</i></h4><p>x</p>`,
  "empty cells and a row with text outside a cell": `<table><tr><td></td><td>a</td><td> </td></tr><tr><td>only</td></tr></table>tail`,
};

describe("the blog reader", () => {
  it.each(Object.entries(samples))("gives the same sections as the Python reader: %s", (_name, html) => {
    expect(typescriptSections(html)).toEqual(pythonSections(html));
  });

  it("turns a post into sections at its headings, with table rows as cells and list items as bullets", () => {
    const html = `<div>Intro line<br>second line</div><h3>Chapter 1. Rates</h3><p>Rates <b>rose</b>.</p>
      <table><tr><td>Year</td><td>Yield</td></tr><tr><td>1994</td><td>7.8%</td></tr></table><ul><li>one</li></ul><script>x()</script>`;

    expect(typescriptSections(html)).toEqual([
      { heading: "", paragraphs: ["Intro line", "second line"] },
      { heading: "Chapter 1. Rates", paragraphs: ["Rates rose.", "Year | Yield", "1994 | 7.8%", "• one"] },
    ]);
  });

  it("leaves nothing of embedded videos, players or scripts in the text", () => {
    const text = typescriptSections(samples["scripts, styles and embedded videos leave nothing"]).flatMap((s) => s.paragraphs);

    expect(text).toEqual(["Before", "After"]);
  });
});

describe("blog documents from Blogger's feed", () => {
  const entry = (n: number, extra: object = {}) => ({
    id: { $t: `tag:blogger.com,1999:blog-111.post-${n}` },
    title: { $t: `Post ${n}` },
    published: { $t: "2018-10-20T09:30:00.000-07:00" },
    updated: { $t: "2019-02-01T10:00:00.000-08:00" },
    link: [
      { rel: "replies", href: "https://example.org/replies" },
      { rel: "alternate", href: `https://example.org/${n}.html` },
    ],
    content: { $t: "<p>Hello &amp; welcome.</p>" },
    ...extra,
  });
  const page = (entries: object[]) => ({ feed: { entry: entries, openSearch$totalResults: { $t: String(entries.length) } } });

  it("records each post with its link, its date, and its published and updated times", () => {
    expect(blogDocuments(page([entry(7)]))).toEqual([
      {
        ref: "post-7",
        title: "Post 7",
        url: "https://example.org/7.html",
        publishedOn: "2018-10-20",
        publishedAt: "2018-10-20T09:30:00.000-07:00",
        updatedAt: "2019-02-01T10:00:00.000-08:00",
        sections: [{ heading: "", paragraphs: ["Hello & welcome."] }],
      },
    ]);
  });

  it("leaves out a post with no text or no link, and names an untitled post", () => {
    const docs = blogDocuments(
      page([entry(1, { content: { $t: "<script>x()</script><iframe src='v'></iframe>" } }), entry(2, { link: [] }), entry(3, { title: { $t: "" } })]),
    );

    expect(docs.map((d) => [d.ref, d.title])).toEqual([["post-3", "Untitled post"]]);
  });
});
