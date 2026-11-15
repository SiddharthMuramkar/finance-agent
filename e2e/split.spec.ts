import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import { hydrated, say, seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * C2a (spec 2026-11-11): the Study Workspace opens at 45 / 55 of the width its two columns share, and a saved share
 * (the `split` cookie) draws from the first frame. Expected numbers are the spec's table: gutter clamp(12px, 1.6vw, 32px),
 * gap clamp(16px, 1.6vw, 28px), shared = viewport − 2 × gutter − gap.
 */

const SHOTS = join("docs", "specs", "img", "2026-11-11");

/** The spec's default widths, in px: conversation 45 %, the Split handle's column, the Widget panel 55 %. */
const DEFAULT: Record<number, { chat: number; handle: number; panel: number }> = {
  1024: { chat: 438.7, handle: 16.4, panel: 536.2 },
  1280: { chat: 548.4, handle: 20.5, panel: 670.2 },
  1512: { chat: 647.7, handle: 24.2, panel: 791.7 },
  1920: { chat: 823.8, handle: 28.0, panel: 1006.8 },
};

/** Within 2 px of the spec's figure. */
function near(actual: number | null | undefined, expected: number, what: string) {
  expect(actual, what).toBeGreaterThanOrEqual(expected - 2);
  expect(actual, what).toBeLessThanOrEqual(expected + 2);
}

/** The width of each test id's element, or null when it is not on the page. */
const widths = (page: Page, ids: string[]) =>
  page.evaluate((ids) => ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().width ?? null), ids);

test("[C2a] split default: 45 / 55 at 1024, 1280, 1512 and 1920", async ({ page }, info) => {
  const width = page.viewportSize()!.width;
  const want = DEFAULT[width];
  test.skip(!want, "measured at the spec's four widths");
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  const [chat, handle, panel] = await widths(page, ["chat-column", "split-handle", "panel-column"]);
  near(chat, want.chat, "conversation");
  near(handle, want.handle, "Split handle");
  near(panel, want.panel, "Widget panel");
  expect((await measureLayout(page)).panelWidthPct).toBeGreaterThanOrEqual(52);

  if (process.env.SHOTS === "C2a" && width === 1512) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `C2a-study-default-light.png`) });
  }
});

/** The `split` cookie, as the Split handle saves it: path /, for this test server. */
const saveSplit = (page: Page, value: string, baseURL: string) => page.context().addCookies([{ name: "split", value, url: baseURL }]);

test("[C2a] a saved share draws from the first frame, with no jump", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await seed(page, "concept-widget");
  await saveSplit(page, "60", baseURL!);

  // The server writes the saved share into the first HTML: on the skeleton's frame and on the page's.
  const html = await (await page.request.get("/study")).text();
  const frames = html.match(/<div[^>]*class="workspace-split[^"]*"[^>]*>/g) ?? [];
  expect(frames, "the skeleton's frame and the page's").toHaveLength(2);
  for (const frame of frames) expect(frame).toContain("--split-saved:60");

  // The conversation's width at the first animation frame after a split frame appears.
  await page.addInitScript(() => {
    const w = window as unknown as { __firstSplit?: number };
    const look = () => {
      const first = document.querySelector(".workspace-split > :first-child");
      if (!first) return false;
      requestAnimationFrame(() => (w.__firstSplit ??= first.getBoundingClientRect().width));
      return true;
    };
    if (look()) return;
    const watch = new MutationObserver(() => look() && watch.disconnect());
    watch.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  const first = await page.evaluate(() => (window as unknown as { __firstSplit?: number }).__firstSplit ?? null);
  const [chat] = await widths(page, ["chat-column"]);
  near(first, 863.7, "first frame");
  near(chat, 863.7, "conversation");
  expect(Math.abs(first! - chat!), "no jump").toBeLessThanOrEqual(1);
});

test("[C2a] below 1024 the handle hides and the default holds", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "mbp14", "one run, at 1000×768");
  await page.setViewportSize({ width: 1000, height: 768 });
  await seed(page, "concept-widget");
  await saveSplit(page, "60", baseURL!);
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  const [chat, panel] = await widths(page, ["chat-column", "panel-column"]);
  near(chat, 428.4, "conversation");
  near(panel, 523.6, "Widget panel");
  await expect(page.getByTestId("split-handle")).toHaveCSS("visibility", "hidden");
});

test("[C2a] an old Session uses the same split", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  test.setTimeout(180_000);
  // As e2e/notebook.spec.ts does: talk once, reading the Session's id off our own turn request.
  await seed(page, "story");
  const sent: number[] = [];
  const onRequest = (r: Request) => {
    if (r.method() !== "POST" || new URL(r.url()).pathname !== "/api/turn") return;
    const body = r.postDataJSON() as { message?: string; shown?: { sessionId?: number } } | null;
    if (body?.message === "Tell me more." && body.shown?.sessionId) sent.push(body.shown.sessionId);
  };
  page.on("request", onRequest);
  await page.goto("/study");
  await say(page, "plain-reply", "Tell me more.");
  page.off("request", onRequest);
  expect(sent, "one message sent, from a shown Session").toHaveLength(1);

  await saveSplit(page, "60", baseURL!);
  await page.goto(`/sessions/${sent[0]}`);
  await expect(page.getByTestId("old-session")).toBeVisible();
  const children = await page.getByTestId("old-session").evaluate((el) =>
    [...el.children].map((c) => ({ width: c.getBoundingClientRect().width, testid: c.getAttribute("data-testid") })),
  );
  near(children[0]?.width, 863.7, "the conversation");
  expect(children[1]?.testid, "the second child is the Split handle").toBe("split-handle");
});

test("[C2b] the Learner drags the Split handle", async ({ page, baseURL }, info) => {
  test.skip(!["mbp14"].includes(info.project.name), "measured at 1512×982");
  await seed(page, "concept-widget");
  await page.goto("/study");
  const handle = page.getByRole("separator", { name: "Resize the conversation and the Widget panel" });
  await expect(handle).toBeVisible();
  const dragTo = async (x: number) => {
    const box = (await handle.boundingBox())!;
    const cy = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, cy);
    await page.mouse.down();
    await page.mouse.move(x, cy, { steps: 10 });
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
    await page.mouse.up();
  };
  await dragTo(899.95);
  await expect(handle).toHaveAttribute("aria-valuenow", "60");
  near((await widths(page, ["chat-column"]))[0], 863.7, "conversation at 60");
  await dragTo(0);
  await expect(handle).toHaveAttribute("aria-valuenow", "33");
  near((await widths(page, ["chat-column"]))[0], 475, "conversation at 33");
  await dragTo(1511);
  await expect(handle).toHaveAttribute("aria-valuenow", "67");
  const [chat, panel] = await widths(page, ["chat-column", "panel-column"]);
  near(chat, 964.4, "conversation at 67");
  near(panel, 475, "panel at 67");
  const cookie = (await page.context().cookies(baseURL!)).find((c) => c.name === "split");
  expect(cookie?.value).toBe("67");
  await page.reload();
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  near((await widths(page, ["chat-column"]))[0], 964.4, "conversation remembered");
  if (process.env.SHOTS === "C2b") {
    mkdirSync(SHOTS, { recursive: true });
    // Let the Widget finish drawing its figures after the reload, so the shot shows the settled panel.
    await hydrated(page);
    await expect(page.getByTestId("panel-column")).not.toContainText("Working out");
    await handle.focus();
    await page.screenshot({ path: join(SHOTS, `C2b-split-67-light.png`) });
  }
});

test("[C2b] the keys and a double-click move it", async ({ page }, info) => {
  test.skip(!["mbp14", "w1024"].includes(info.project.name), "measured at 1512 and 1024");
  await seed(page, "concept-widget");
  await page.goto("/study");
  const handle = page.getByRole("separator", { name: "Resize the conversation and the Widget panel" });
  await handle.focus();
  if (info.project.name === "w1024") {
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuemin", "37");
    await expect(handle).toHaveAttribute("aria-valuenow", "37");
    near((await widths(page, ["chat-column"]))[0], 360.7, "conversation at 37");
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "63");
    const [chat, panel] = await widths(page, ["chat-column", "panel-column"]);
    near(chat, 614.2, "conversation at 63");
    near(panel, 360.7, "panel at 63");
    return;
  }
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(handle).toHaveAttribute("aria-valuenow", "47");
  near((await widths(page, ["chat-column"]))[0], 676.5, "conversation at 47");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "43");
  near((await widths(page, ["chat-column"]))[0], 619, "conversation at 43");
  await page.keyboard.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "33");
  near((await widths(page, ["chat-column"]))[0], 475, "conversation at 33");
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "67");
  near((await widths(page, ["chat-column"]))[0], 964.4, "conversation at 67");
  await handle.dblclick();
  await expect(handle).toHaveAttribute("aria-valuenow", "45");
  near((await widths(page, ["chat-column"]))[0], 647.7, "conversation reset");
});

test("[C2b] one share for every page", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  test.setTimeout(180_000);
  await seed(page, "story");
  const sent: number[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST" || new URL(r.url()).pathname !== "/api/turn") return;
    const body = r.postDataJSON() as { message?: string; shown?: { sessionId?: number } } | null;
    if (body?.message === "Tell me more." && body.shown?.sessionId) sent.push(body.shown.sessionId);
  });
  await page.goto("/study");
  await say(page, "plain-reply", "Tell me more.");
  expect(sent).toHaveLength(1);
  await page.goto(`/sessions/${sent[0]}`);
  const handle = page.getByRole("separator", { name: "Resize the conversation and the Widget panel" });
  await handle.focus();
  await page.keyboard.press("End");
  const oldChat = await page.getByTestId("old-session").evaluate((el) => el.children[0].getBoundingClientRect().width);
  near(oldChat, 964.4, "old Session conversation");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  near((await widths(page, ["chat-column"]))[0], 964.4, "study opens at the same share");
});
