import { expect, test, type Page } from "@playwright/test";

// E2a: the five story parts, drawn from their /dev/widgets fixtures. Layout at two widths, controls that read as
// buttons, and motion that stops under reduced motion and plays otherwise.

const FIXTURES = ["story-scene", "lingo-card", "timeline-strip", "two-paths", "money-jar", "who-pays-whom", "myth-or-fact", "headline", "choice-cards"];
const WIDTHS = [560, 860];

async function open(page: Page, fixture: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/dev/widgets?fixture=${fixture}`);
  await expect(page.getByTestId("widget-card")).toBeVisible();
}

for (const fixture of FIXTURES) {
  for (const width of WIDTHS) {
    test(`${fixture} at ${width}px: no overflow, buttons are big enough and show a pointer`, async ({ page }) => {
      await open(page, fixture, width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow").toBeLessThanOrEqual(0);
      const buttons = page.getByTestId("widget-card").getByRole("button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
        const box = await button.boundingBox();
        expect(box!.height, `button ${i} height`).toBeGreaterThanOrEqual(28);
        expect(box!.width, `button ${i} width`).toBeGreaterThanOrEqual(28);
        expect(await button.evaluate((el) => getComputedStyle(el).cursor), `button ${i} cursor`).toBe("pointer");
      }
    });
  }

  test(`${fixture}: with reduced motion nothing is animating after a click`, async ({ page }) => {
    await open(page, fixture, 860);
    const first = page.getByTestId("widget-card").locator("button:enabled").first();
    if (await first.count()) await first.click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
}

/**
 * Records every animation that starts on the page, from the first frame, with the CSS properties its keyframes touch.
 * Reading keyframes (not animation names) means a renamed or new animation is judged by what it moves. Sampling each
 * frame means a short fade at mount is seen even if it has ended by the time the test looks.
 */
function recordAnimations() {
  const w = window as unknown as { __motion: { el: Element; props: string[]; transition: boolean }[] };
  w.__motion = [];
  const seen = new WeakSet<Animation>();
  const meta = new Set(["offset", "computedOffset", "easing", "composite"]);
  const tick = () => {
    for (const a of document.getAnimations()) {
      if (seen.has(a)) continue;
      seen.add(a);
      const effect = a.effect as KeyframeEffect | null;
      if (!effect?.target) continue;
      const props = new Set<string>();
      for (const frame of effect.getKeyframes()) for (const k of Object.keys(frame)) if (!meta.has(k)) props.add(k);
      w.__motion.push({ el: effect.target, props: [...props].sort(), transition: a instanceof CSSTransition });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

type Motion = { props: string; where: string; transition: boolean };

/**
 * The animations recorded inside `root` since the last call. The app's controls (`[data-affordance]`) step their colours
 * with a short transition (Block 1's flat anatomy); that is the shared Button's look, not a part's motion, so it is left out.
 */
async function motionIn(page: Page, root: string): Promise<Motion[]> {
  return page.evaluate((id) => {
    const w = window as unknown as { __motion: { el: Element; props: string[]; transition: boolean }[] };
    const host = document.querySelector(`[data-testid="${id}"]`);
    const taken = w.__motion.splice(0);
    return taken
      .filter((m) => host?.contains(m.el) && !(m.transition && m.el.hasAttribute("data-affordance")))
      .map((m) => ({ props: m.props.join("+"), where: `${m.el.getAttribute("data-testid") ?? m.el.tagName.toLowerCase()}.${m.el.getAttribute("class") ?? ""}`, transition: m.transition }));
  }, root);
}

async function openMoving(page: Page, fixture: string, project: string) {
  await page.addInitScript(recordAnimations);
  await page.setViewportSize({ width: 860, height: 900 });
  await page.goto(`/dev/widgets?fixture=${fixture}`);
  await expect(page.getByTestId("widget-card")).toBeVisible();
  await page.waitForTimeout(500); // every entrance is 300 ms or less
}

async function pressAndWait(page: Page, selector: string) {
  await page.locator(selector).first().click();
  await page.waitForTimeout(500);
}

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("StoryScene only fades: every animation, at mount and after Next beat, touches opacity alone (A9a)", async ({ page }, info) => {
    await openMoving(page, "story-scene", info.project.name);
    const mount = await motionIn(page, "story-scene");
    expect(mount.length, "StoryScene plays at least one animation on mount").toBeGreaterThanOrEqual(1);
    expect(mount.filter((m) => m.props !== "opacity"), "animations at mount that move more than opacity").toEqual([]);
    await pressAndWait(page, '[data-testid="story-next"]');
    const next = await motionIn(page, "story-scene");
    expect(next.length, "the next beat fades in").toBeGreaterThanOrEqual(1);
    expect(next.filter((m) => m.props !== "opacity"), "animations after Next beat that move more than opacity").toEqual([]);
  });

  test("the Lingo card only turns: after In the story, its one animation is a transform transition on .lingo-inner (A9a)", async ({ page }, info) => {
    await openMoving(page, "lingo-card", info.project.name);
    await motionIn(page, "lingo-card");
    await pressAndWait(page, '[data-testid="lingo-flip"]');
    const turning = await motionIn(page, "lingo-card");
    expect(turning.length, "the card turns").toBeGreaterThanOrEqual(1);
    for (const m of turning) {
      expect(m.transition, `${m.where} is a transition`).toBe(true);
      expect(m.props, `${m.where} touches transform only`).toBe("transform");
      expect(m.where, "the turning element").toContain("lingo-inner");
    }
  });

  const OPACITY_ONLY: [string, string][] = [
    ["timeline-strip", '[data-testid="timeline-marker"]'],
    ["two-paths", '[data-testid="path-reveal"]'],
    ["money-jar", '[data-testid="jar-again"]'],
  ];
  for (const [fixture, press] of OPACITY_ONLY) {
    test(`${fixture} only fades: every animation, at mount and after the first press, touches opacity alone (A9b)`, async ({ page }, info) => {
      await openMoving(page, fixture, info.project.name);
      const mount = await motionIn(page, fixture);
      expect(mount.filter((m) => m.props !== "opacity"), "animations at mount that move more than opacity").toEqual([]);
      await pressAndWait(page, press);
      const pressed = await motionIn(page, fixture);
      expect(pressed.filter((m) => m.props !== "opacity"), "animations after the press that move more than opacity").toEqual([]);
      expect(mount.length + pressed.length, "the part fades something in").toBeGreaterThanOrEqual(1);
    });
  }

  test("WhoPaysWhom's arrow draws and its Icon rides along it: stroke-dashoffset and transform only (A9c)", async ({ page }, info) => {
    await openMoving(page, "who-pays-whom", info.project.name);
    const mount = await motionIn(page, "who-pays-whom");
    await pressAndWait(page, '[data-testid="flow"]');
    const replay = await motionIn(page, "who-pays-whom");
    for (const [when, list] of [["mount", mount], ["replay", replay]] as const) {
      expect(list.length, `the arrow draws at ${when}`).toBeGreaterThanOrEqual(1);
      expect(list.filter((m) => !["strokeDashoffset", "transform"].includes(m.props)), `animations at ${when} that move anything else`).toEqual([]);
      expect(list.some((m) => m.props === "strokeDashoffset"), `the arrow draws at ${when}`).toBe(true);
    }
  });

  const AFTER_A_PRESS: [string, string][] = [
    ["myth-or-fact", '[data-testid="myth-button"]'],
    ["choice-cards", '[data-testid="choice"]'],
  ];
  for (const [fixture, press] of AFTER_A_PRESS) {
    test(`${fixture}: after a press every animation touches opacity alone (A9c)`, async ({ page }, info) => {
      await openMoving(page, fixture, info.project.name);
      await motionIn(page, fixture);
      await pressAndWait(page, press);
      const pressed = await motionIn(page, fixture);
      expect(pressed.filter((m) => m.props !== "opacity"), "animations after the press that move more than opacity").toEqual([]);
    });
  }
});

// Spec 2026-11-12 B8 (G8): a story scene wide enough for its cast and every beat shows two to five beats together, with
// no Back or Next; a narrow one keeps today's stepped form. The Test bed's 860 px frame is wide, its 480 px frame narrow.
test("B8: at 860 px every beat of the story shows at once, with no Back or Next", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dev/widgets?fixture=story-scene&width=860");
  const scene = page.getByTestId("widget-card").getByTestId("story-scene");
  await expect(scene).toBeVisible();
  const beats = scene.getByTestId("story-beat");
  await expect(beats).toHaveCount(3);
  for (const line of ["It is February, and everyone expects calm.", "Tomorrow, the central bank gives its decision.", "If the rate rises, my old bonds lose their shine."]) {
    await expect(scene.getByTestId("story-beats").getByText(line)).toBeVisible();
  }
  // Out of the accessibility tree, not just out of sight.
  await expect(scene.getByRole("button", { name: /Next beat|Back|Replay/ })).toHaveCount(0);
  await expect(scene.getByText("1 of 3")).toBeHidden();
  await expect(scene.getByTestId("story-bubble")).toBeHidden();
});

test("B8: at 480 px the story still steps, one beat at a time with Back and Next beat", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dev/widgets?fixture=story-scene&width=480");
  const scene = page.getByTestId("widget-card").getByTestId("story-scene");
  await expect(scene).toBeVisible();
  await expect(scene.getByTestId("story-beats")).toBeHidden();
  await expect(scene.getByTestId("story-bubble")).toContainText("It is February, and everyone expects calm.");
  await expect(scene.getByText("1 of 3")).toBeVisible();
  await scene.getByRole("button", { name: /Next beat/ }).click();
  await expect(scene.getByTestId("story-bubble")).toContainText("Tomorrow, the central bank gives its decision.");
  await expect(scene.getByRole("button", { name: /Back/ })).toBeEnabled();
});
