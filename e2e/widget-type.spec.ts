import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** A3a: every fixture Widget is Inter, and nothing inside it is heavier than 500. */

const PROJECTS = ["mbp14", "mbp14-dark"];
const SHOTS = join("docs", "specs", "img", "2026-11-11");
const FIXTURES = ["audit", "parts"].flatMap((group) => readdirSync(`src/widgets/fixtures/${group}`).filter((f) => f.endsWith(".openui")).map((f) => f.replace(/\.openui$/, "")));

test("every fixture Widget is Inter, with nothing above 500", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "measured at 1512×982, Light and Dark");
  test.setTimeout(240_000);
  const dark = info.project.name.endsWith("-dark");
  const heavy: string[] = [];
  for (const fixture of FIXTURES) {
    await page.goto(`/dev/widgets?fixture=${fixture}${dark ? "&theme=dark" : ""}`);
    await expect(page.getByTestId("widget-card")).toBeVisible();
    const family = await page.locator('[data-testid="widget-card"] .genui').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family, fixture).toMatch(/Inter/i);
    if (fixture === "stat") {
      const weight = await page.locator('[data-testid="stat-value"]').evaluate((el) => getComputedStyle(el).fontWeight);
      expect(weight, "stat's key figure").toBe("600");
    }
    const leads = await page.locator("[data-key-figure]:not([data-key-figure-extra])").count();
    expect(leads, fixture).toBeLessThanOrEqual(1);
    const offenders = await page.locator('[data-testid="widget-card"] .genui').first().evaluate((root) => {
      const out: string[] = [];
      const walk = (el: Element) => {
        const text = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim());
        const svgText = el.tagName === "text";
        const lead = el.closest("[data-key-figure]:not([data-key-figure-extra])");
        if (text || svgText) {
          const weight = Number(getComputedStyle(el).fontWeight);
          if (weight >= 600 && !lead) out.push(`${el.getAttribute("data-testid") || el.tagName.toLowerCase()}: ${(el.textContent || "").trim().slice(0, 40)} (${weight})`);
        }
        for (const child of el.children) walk(child);
      };
      walk(root);
      return out;
    });
    for (const line of offenders) heavy.push(`${fixture} ${line}`);
    if (process.env.SHOTS === "A3a" && (fixture === "stat" || fixture === "06-lottery-breakeven")) {
      mkdirSync(SHOTS, { recursive: true });
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev server's issue badge
      await page.screenshot({ path: join(SHOTS, `A3a-${fixture}-${dark ? "dark" : "light"}.png`) });
    }
    if (process.env.SHOTS === "A3b" && (fixture === "stat" || fixture === "06-lottery-breakeven")) {
      mkdirSync(SHOTS, { recursive: true });
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev server's issue badge
      await page.screenshot({ path: join(SHOTS, `A3b-${fixture}-${dark ? "dark" : "light"}.png`) });
    }
  }
  expect(heavy).toEqual([]);
});
