import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { plain, Rich, richParts } from "./rich";

describe("the site's copy marks", () => {
  it("read **bold** and *italic*, and leave the rest plain", () => {
    expect(richParts("Buyers pay **$84** a share. *Find it.* Done")).toEqual([
      { text: "Buyers pay " },
      { text: "$84", mark: "strong" },
      { text: " a share. " },
      { text: "Find it.", mark: "em" },
      { text: " Done" },
    ]);
  });

  it("keep an unclosed mark as plain text", () => {
    expect(richParts("A ** lone mark")).toEqual([{ text: "A ** lone mark" }]);
  });

  it("drop the marks for plain text", () => {
    expect(plain("**Right.** It is *a value*.")).toBe("Right. It is a value.");
  });

  it("draw strong and em, escaping everything else", () => {
    expect(renderToStaticMarkup(<p><Rich>{"**$84** <b>x</b> *now*"}</Rich></p>)).toBe("<p><strong>$84</strong> &lt;b&gt;x&lt;/b&gt; <em>now</em></p>");
  });
});
