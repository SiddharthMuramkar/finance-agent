import { expect, test, type Page } from "@playwright/test";
import { seed, settled } from "./support/app";

/**
 * #317: the message row (Attach a passage, the message box, Send) stays on one line at narrow widths. At 768×1024 the
 * old row squeezed the message box until its "Ask the Tutor" placeholder wrapped, and the box and Send grew taller.
 * This measures the real row in the browser: each control renders one line high, the box is no taller than at
 * 1512×982, and nothing in the row spills out of it. Runs once, in the mbp14 project, and resizes the window itself.
 */

/**
 * `lines`: for the box, its content height in line-heights; for a button, how many lines its label's text sits on (0 when
 * the label is hidden and only the icon shows).
 */
type Control = { height: number; lines: number };
type Row = {
  attach: Control;
  box: Control;
  send: Control;
  /** The placeholder's own width and the room the box gives it, both in px. */
  placeholder: { text: number; room: number };
  rowOverflow: number;
  childSpill: number;
  horizontalScroll: boolean;
};

/**
 * A wide fallback face, so the row is checked against fonts wider than the Mac's: CI's Linux Chromium draws the page in
 * a fallback about 15 % wider than SF, and a row that only fits by the Mac's metrics clips there. DejaVu Sans is the
 * Linux fallback; Verdana, on the Mac, is wider still.
 */
const WIDE_FONT = "* { font-family: 'DejaVu Sans', Verdana, sans-serif !important; }";

async function openStudy(page: Page, width: number, height: number, wideFont: boolean) {
  await page.setViewportSize({ width, height });
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  if (wideFont) await page.addStyleTag({ content: WIDE_FONT });
  // The story Session plays its opener on first load; Send only shows once no reply is being written.
  await settled(page);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
}

async function measureRow(page: Page): Promise<Row> {
  return page.getByRole("textbox", { name: "Message" }).evaluate((box) => {
    const row = box.parentElement!;
    const px = (v: string) => parseFloat(v) || 0;
    const control = (el: Element) => {
      const s = getComputedStyle(el);
      const height = el.getBoundingClientRect().height;
      const inner = height - px(s.paddingTop) - px(s.paddingBottom) - px(s.borderTopWidth) - px(s.borderBottomWidth);
      return { height, lines: inner / px(s.lineHeight) };
    };
    // A button is stretched to the row's height, so count the lines its text actually lands on instead.
    const textLines = (el: Element) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tops: number[] = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && !tops.some((t) => Math.abs(t - rect.top) < 2)) tops.push(rect.top);
        }
      }
      return tops.length;
    };
    const button = (name: string) => {
      const el = [...row.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name)!;
      return { height: el.getBoundingClientRect().height, lines: textLines(el) };
    };
    const s = getComputedStyle(box);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const r = row.getBoundingClientRect();
    const spill = [...row.querySelectorAll(":scope > *, :scope > .contents > *")]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0)
      .reduce((max, b) => Math.max(max, r.left - b.left, b.right - r.right), 0);
    return {
      attach: button("Attach a passage"),
      box: control(box),
      send: button("Send"),
      placeholder: {
        text: ctx.measureText((box as HTMLTextAreaElement).placeholder).width,
        room: box.clientWidth - px(s.paddingLeft) - px(s.paddingRight),
      },
      rowOverflow: row.scrollWidth - row.clientWidth,
      childSpill: spill,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

for (const [fonts, wideFont] of [
  ["", false],
  [" in a wide fallback font", true],
] as const) {
  test(`[#317] the message row stays on one line at 768×1024 and 1024×768${fonts}`, async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "resizes the window itself; runs once");
    await seed(page, "story");
    await openStudy(page, 1512, 982, wideFont);
    const wide = await measureRow(page);
    expect(wide.box.lines, "message box at 1512").toBeLessThanOrEqual(1.5);
    expect(wide.send.lines, "Send at 1512").toBe(1);
    // The row is wider than 28rem here, so Attach shows its words, on one line.
    expect(wide.attach.lines, "Attach a passage label lines at 1512").toBe(1);

    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
    ] as const) {
      await openStudy(page, width, height, wideFont);
      const m = await measureRow(page);
      const at = `at ${width}×${height}`;
      expect(m.placeholder.text, `"Ask the Tutor" fits the box ${at}`).toBeLessThanOrEqual(m.placeholder.room);
      expect(m.box.lines, `message box lines ${at}`).toBeLessThanOrEqual(1.5);
      expect(m.box.height, `message box height ${at}`).toBeLessThanOrEqual(wide.box.height + 0.5);
      expect(m.send.lines, `Send lines ${at}`).toBe(1);
      expect(m.send.height, `Send height ${at}`).toBeLessThanOrEqual(wide.send.height + 0.5);
      // Under 28rem Attach folds to its icon: no label text drawn at all.
      expect(m.attach.lines, `Attach a passage is icon-only ${at}`).toBe(0);
      expect(m.rowOverflow, `row overflow ${at}`).toBeLessThanOrEqual(0);
      expect(m.childSpill, `controls outside the row ${at}`).toBeLessThanOrEqual(0.5);
      expect(m.horizontalScroll, `horizontal scroll ${at}`).toBe(false);
    }
  });
}
