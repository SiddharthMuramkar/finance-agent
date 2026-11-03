import { describe, expect, it } from "vitest";
import { blogDocuments, blogPictures, htmlBlocks, sectionsFromBlocks } from "./blog";
import {
  accuracyReport,
  checkReading,
  compareReadings,
  estimateCheckCost,
  estimateReadCost,
  isMachineRead,
  numbersIn,
  originalPictureUrl,
  pickSamples,
  pictureId,
  PICTURE_TAG,
  READ_MAX_TOKENS,
  unreadPictures,
  type PictureReadings,
} from "./pictures";
import { prepareDocuments } from "./prepare";

describe("which pictures are read, and at what size", () => {
  it.each([
    ["https://blogger.googleusercontent.com/img/a/AVvX=w400-h300", "https://blogger.googleusercontent.com/img/a/AVvX=s0"],
    ["https://blogger.googleusercontent.com/img/b/R29v/AVvX/s320/tesla.png", "https://blogger.googleusercontent.com/img/b/R29v/AVvX/s0/tesla.png"],
    ["http://1.bp.blogspot.com/-abc/XYZ/AAA/s1600-h/table.png", "https://1.bp.blogspot.com/-abc/XYZ/AAA/s0/table.png"],
    ["//2.bp.blogspot.com/-abc/w640-h480/chart.jpg", "https://2.bp.blogspot.com/-abc/s0/chart.jpg"],
    ["https://blogger.googleusercontent.com/img/a/AVvX=s0", "https://blogger.googleusercontent.com/img/a/AVvX=s0"],
  ])("asks Blogger for the original of %s", (src, original) => {
    expect(originalPictureUrl(src)).toBe(original);
  });

  it("gives the same address for every size of one picture, so it is cached once", () => {
    expect(originalPictureUrl("https://1.bp.blogspot.com/-a/b/s200/x.png")).toBe(originalPictureUrl("https://1.bp.blogspot.com/-a/b/s1600/x.png"));
  });

  it.each(["https://example.com/chart.png", "https://pbs.twimg.com/media/x.jpg", "https://evil.com/?u=blogger.googleusercontent.com", "https://blogger.googleusercontent.com.evil.com/a", "data:image/png;base64,AAAA", "not a url", ""])(
    "leaves out %s: not on Blogger's own image hosts",
    (src) => {
      expect(originalPictureUrl(src)).toBeNull();
    },
  );
});

describe("pictures placed in a post", () => {
  const url = "https://1.bp.blogspot.com/-a/b/s0/tesla.png";
  const readings: PictureReadings = { [url]: { text: "Tesla inputs\nRevenue growth | 25%\nMargin | 18%", model: "m", stopReason: "end_turn", problems: [] } };
  const html = `<p>Before the table.</p><a href="x"><img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png" width="320" height="200"></a><p>After the table.</p>`;

  it("puts a picture's lines at its position, each marked as machine-read", () => {
    expect(sectionsFromBlocks(htmlBlocks(html, { readings }))).toEqual([
      { heading: "", paragraphs: ["Before the table.", `${PICTURE_TAG}Tesla inputs`, `${PICTURE_TAG}Revenue growth | 25%`, `${PICTURE_TAG}Margin | 18%`, "After the table."] },
    ]);
  });

  it("leaves a post unchanged when its pictures are unread, and ignores icons and other hosts", () => {
    const plain = `<p>Before.</p><img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png"><img src="https://example.com/a.png"><img src="https://1.bp.blogspot.com/-a/b/s1/icon.png" width="16" height="16"><p>After.</p>`;
    expect(htmlBlocks(plain).map((b) => b.text)).toEqual(["Before.", "After."]);
    const seen: string[] = [];
    htmlBlocks(plain, { onPicture: (u) => seen.push(u) });
    expect(seen).toEqual([url]);
  });

  it("places a picture inside a table cell just before its row (a captioned picture)", () => {
    const captioned = `<p>Intro.</p><table><tr><td><img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png"></td></tr><tr><td>Source: Damodaran</td></tr></table>`;
    expect(htmlBlocks(captioned, { readings }).map((b) => b.text)).toEqual(["Intro.", `${PICTURE_TAG}Tesla inputs`, `${PICTURE_TAG}Revenue growth | 25%`, `${PICTURE_TAG}Margin | 18%`, "Source: Damodaran"]);
  });

  it("ignores a picture inside a script or a video", () => {
    expect(htmlBlocks(`<video><img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png"></video><p>x</p>`, { readings }).map((b) => b.text)).toEqual(["x"]);
  });

  const entry = (content: string) => ({
    feed: {
      entry: [
        {
          id: { $t: "tag:blogger.com,1999:blog-1.post-9" },
          title: { $t: "Tesla" },
          published: { $t: "2018-10-20T09:30:00.000-07:00" },
          link: [{ rel: "alternate", href: "https://example.org/9.html" }],
          content: { $t: content },
        },
      ],
      openSearch$totalResults: { $t: "1" },
    },
  });

  it("lists a feed page's pictures with their posts", () => {
    expect(blogPictures(entry(html))).toEqual([{ ref: "post-9", url }]);
  });

  it("keeps a post that opens with a picture: its text is not dropped as a title page", () => {
    const docs = blogDocuments(entry(`<img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png"><p>This post argues that growth must be paid for with reinvestment, and Tesla is the example in point here.</p>`), { readings });
    const { passages, frontMatter } = prepareDocuments(docs);

    expect(frontMatter).toEqual([]);
    expect(passages[0].text.startsWith(`${PICTURE_TAG}Tesla inputs`)).toBe(true);
    expect(passages.every((p) => isMachineRead(p.text) || !p.text.includes("Tesla inputs"))).toBe(true);
  });

  it("keeps a post that is only a picture", () => {
    const { passages } = prepareDocuments(blogDocuments(entry(`<img src="https://1.bp.blogspot.com/-a/b/s320/tesla.png">`), { readings }));

    expect(passages).toHaveLength(1);
    expect(isMachineRead(passages[0].text)).toBe(true);
  });

  it("still drops a real title page (no picture text)", () => {
    const { passages, frontMatter } = prepareDocuments(blogDocuments(entry(`<p>Aswath Damodaran</p>`), {}));
    expect(passages).toEqual([]);
    expect(frontMatter).toHaveLength(1);
  });
});

describe("the cost of reading", () => {
  it("is half price through the Batches API, and the worst case is above the typical", () => {
    const batch = estimateReadCost(2000);
    const single = estimateReadCost(2000, { batch: false });

    expect(batch.expected).toBeCloseTo(single.expected / 2, 6);
    expect(batch.worst).toBeGreaterThan(batch.expected);
    expect(batch.worst).toBeLessThan(3);
    expect(estimateReadCost(0)).toEqual({ expected: 0, worst: 0 });
  });

  it("prices the stronger model's 40 re-reads under a dollar", () => {
    expect(estimateCheckCost(40).expected).toBeGreaterThan(0.1);
    expect(estimateCheckCost(40).expected).toBeLessThan(1);
  });

  it("skips pictures already read, and counts a picture used twice once", () => {
    const readings: PictureReadings = { a: { text: null, model: "m", stopReason: null, problems: [] } };
    expect(unreadPictures(["a", "b", "b", "c"], readings)).toEqual(["b", "c"]);
  });

  it("treats a reading cut off by the length limit as unread, and a complete one as done", () => {
    const readings: PictureReadings = {
      a: { text: "Revenue | 5", model: "m", stopReason: "max_tokens", problems: ["cut off by the length limit"] },
      b: { text: "Revenue | 5", model: "m", stopReason: "end_turn", problems: [] },
    };
    expect(unreadPictures(["a", "b"], readings)).toEqual(["a"]);
  });

  it("allows 4000 tokens per reading and prices the worst case on it", () => {
    expect(READ_MAX_TOKENS).toBe(4000);
    expect(estimateReadCost(1).worst).toBeGreaterThan(estimateReadCost(1).expected);
  });

  it("gives a request id of letters and digits that stays the same for the same address", () => {
    expect(pictureId("https://x/y")).toMatch(/^p[0-9a-f]{40}$/);
    expect(pictureId("https://x/y")).toBe(pictureId("https://x/y"));
    expect(pictureId("https://x/y")).not.toBe(pictureId("https://x/z"));
  });
});

describe("code checks on a reading", () => {
  const table = "Tesla inputs\nItem | 2024 | 2025\nRevenue | 100 | 120\nCost | 60 | 70\nTotal | 160 | 190";

  it("passes a clean table", () => {
    expect(checkReading(table, "end_turn")).toEqual([]);
  });

  it("flags a cut-off, empty or refusing reading", () => {
    expect(checkReading(table, "max_tokens")[0]).toMatch(/cut off/);
    expect(checkReading("  ", "end_turn")).toEqual(["empty"]);
    expect(checkReading("I'm sorry, I can't read this picture.", "end_turn")[0]).toMatch(/refusal/);
  });

  it("flags table rows with the wrong number of cells", () => {
    expect(checkReading("A | B | C\n1 | 2 | 3\n4 | 5\n7 | 8 | 9", "end_turn")[0]).toMatch(/1 table row/);
  });

  it("flags a letter where a digit should be, and a line repeated again and again", () => {
    expect(checkReading("Growth | 1O.5%", "end_turn")[0]).toMatch(/letter/);
    expect(checkReading(Array(5).fill("Revenue | 100 | 120").join("\n"), "end_turn").join()).toMatch(/repeats/);
  });

  it("flags a Total row that does not add up its column, allowing for rounding", () => {
    expect(checkReading("Item | Value\nA | 10\nB | 20\nTotal | 35", "end_turn")[0]).toMatch(/Total row says 35.*add up to 30/);
    expect(checkReading("Item | Value\nA | 10.4\nB | 20.4\nTotal | 31", "end_turn")).toEqual([]);
    expect(checkReading("Item | Value\nA | $1,000\nB | (200)\nTotal | $800", "end_turn")).toEqual([]);
  });
});

describe("numbers in a reading", () => {
  it("reads commas, currency, percent and brackets as plain values", () => {
    expect(numbersIn("Revenue $1,234.5 | 25% | (300) | -4 | growth 3x")).toEqual([1234.5, 25, -300, -4, 3]);
  });

  it("finds numbers one reading has that the other lacks", () => {
    expect(compareReadings("Rev | 100 | 25%", "Rev | 100 | 25%").agree).toBe(true);
    expect(compareReadings("Rev | 100 | 25%", "Rev | 100 | 26%")).toEqual({ agree: false, onlyFirst: [25], onlySecond: [26] });
    expect(compareReadings("1 1", "1")).toMatchObject({ agree: false, onlyFirst: [1] });
  });
});

describe("the accuracy report", () => {
  const read = (text: string | null, problems: string[] = []) => ({ text, model: "m", stopReason: "end_turn", problems });

  it("picks the sample spread evenly and the same each time", () => {
    const urls = Array.from({ length: 200 }, (_, i) => `u${String(i).padStart(3, "0")}`);
    const picked = pickSamples(urls, 40);

    expect(picked).toHaveLength(40);
    expect(pickSamples([...urls].reverse(), 40)).toEqual(picked);
    expect(pickSamples(["b", "a"], 40)).toEqual(["a", "b"]);
  });

  it("lists flagged readings and the sampled ones where the stronger model read other numbers", () => {
    const readings: PictureReadings = { a: read("Rev | 100"), b: read("Rev | 90", ["a Total row is off"]), c: read(null), d: read("Rev | 7") };
    const report = accuracyReport(readings, { a: "Rev | 100", b: "Rev | 80", c: "NONE" });

    expect(report.flagged).toEqual([{ url: "b", problems: ["a Total row is off"] }]);
    expect(report.disagreements).toEqual([{ url: "b", haikuOnly: [90], strongerOnly: [80] }]);
    expect(report).toMatchObject({ sampled: 2, agreement: 0.5, readings: 3 });
    expect(accuracyReport(readings, {}).agreement).toBeNull();
  });
});
