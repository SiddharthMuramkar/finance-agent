import { expect, test, type Page } from "@playwright/test";
import { hydrated, seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * A5 and ADR 0018: the slim, flat header. A plain wordmark, three ghost page links (the current one ink at weight 600 over
 * a 2px accent bar on the header's hairline), then the theme switch (ADR 0019), Settings gear and account as 32px ghost
 * icons; one line and at most 56px tall at 1512 and 1024; the gear opens Settings; the account menu, a popover, signs out to Home.
 */

// mbp14-dark: the same header in Dark (#80), on a device set to dark.
const PROJECTS = ["mbp14", "w1024", "mbp14-dark"];

test.beforeEach(async ({}, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "the header is measured at 1512×982 and 1024×768");
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
  await expect(page.locator("header")).toBeVisible();
}

async function course(page: Page) {
  await seed(page, "many-topics");
  await open(page, "/course");
}

/** The colour a token resolves to on this page, as the browser writes a computed colour. */
async function token(page: Page, name: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, name);
}

// Reading pages only: /study keeps WP6's workspace frame, so it is not asserted here.
test("[A5] header sits flush at the top (top 0)", async ({ page }) => {
  await seed(page, "many-topics");
  for (const path of ["/course", "/notebook", "/settings"]) {
    await open(page, path);
    expect(await page.locator("header").evaluate((el) => el.getBoundingClientRect().top), path).toBe(0);
  }
});

test("[A5] header fits: 56px or less, on one line", async ({ page }) => {
  await course(page);
  expect((await measureLayout(page)).headerHeight).toBeLessThanOrEqual(56);
  // One line: the brand, the last page link and the account button share a vertical centre (within a pixel or two).
  const centres = await page.evaluate(() => {
    const centre = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    };
    return [
      centre(document.querySelector('header a[title="Home"]')),
      centre(document.querySelector('header nav a[href="/notebook"]')),
      centre(document.querySelector('[data-testid="account-menu-button"]')),
    ];
  });
  expect(centres.every((c) => c !== null)).toBe(true);
  expect(Math.max(...(centres as number[])) - Math.min(...(centres as number[]))).toBeLessThanOrEqual(2);
});

const SWITCH = /^Switch to (?:dark|light) theme$/;

test("[A5] Tab order is brand, Study, Course Map, Notebook, theme switch, Settings, account", async ({ page }) => {
  await course(page);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    names.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return (el?.getAttribute("aria-label") || el?.textContent || "").trim().replace(/\s+/g, " ");
      }),
    );
  }
  expect(names[0]).toBe("Value It");
  expect(names.slice(1, 4)).toEqual(["Study", "Course Map", "Notebook"]);
  expect(names[4]).toMatch(SWITCH);
  expect(names[5]).toBe("Settings");
  expect(names[6]).toBe("Account menu");
});

test("[A5] clicking the gear opens /settings with h1 Settings", async ({ page }) => {
  await course(page);
  await page.locator("header").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("[A5] the account menu names the Learner and Sign out ends on Home, signed out", async ({ page }) => {
  await course(page);
  await page.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("tools");
  // A floating layer (ADR 0018): 12px corners and the pop shadow, the only shadow in the header.
  const look = await menu.evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, shadow: getComputedStyle(el).boxShadow }));
  expect(look.radius).toBe("12px");
  expect(look.shadow).not.toBe("none");
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();
});

test("[ADR 0018] the header is flat: a 56px row over a 1px hairline, 32px ghost controls with 8px corners and no shadow", async ({ page }) => {
  await course(page);
  const header = page.locator("header");
  const box = await header.evaluate((el) => {
    const s = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, border: s.borderBottomWidth, style: s.borderBottomStyle };
  });
  expect(box).toEqual({ height: 56, border: "1px", style: "solid" });

  const controls = await header.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('a[title="Home"], nav a, [data-affordance="icon"]')].map((c) => {
      const s = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return { name: (c.getAttribute("aria-label") || c.textContent || "").trim(), icon: c.dataset.affordance === "icon", shadow: s.boxShadow, radius: s.borderTopLeftRadius, height: r.height, width: r.width, transform: s.transform };
    }),
  );
  expect(controls.map((c) => c.name.replace(SWITCH, "theme switch"))).toEqual(["Value It", "Study", "Course Map", "Notebook", "theme switch", "Settings", "Account menu"]);
  for (const c of controls) {
    expect({ name: c.name, shadow: c.shadow, radius: c.radius, height: c.height, transform: c.transform }).toEqual({ name: c.name, shadow: "none", radius: "8px", height: 32, transform: "none" });
    if (c.icon) expect(c.width, c.name).toBe(32);
  }

  // The last icon's tooltip is the browser's own (title), so focusing and pointing at it never widens the page.
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  await expect(page.getByTestId("account-menu-button")).toBeFocused();
  await page.getByTestId("account-menu-button").hover();
  const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll.scroll).toBeLessThanOrEqual(scroll.client + 1);
});

test("[A5] the page showing is marked three ways: aria-current, ink at weight 600, and a 2px accent bar on the hairline", async ({ page }) => {
  await course(page);
  const [ink, ink2, accent] = [await token(page, "--ink"), await token(page, "--ink-2"), await token(page, "--accent")];
  const tabs = await page.locator("header").evaluate((header) => {
    const bottom = header.getBoundingClientRect().bottom;
    return [...header.querySelectorAll<HTMLElement>("nav li")].map((li) => {
      const a = li.querySelector("a")!;
      const bar = getComputedStyle(li, "::after");
      return {
        label: a.textContent!.trim(),
        current: a.getAttribute("aria-current"),
        weight: getComputedStyle(a).fontWeight,
        colour: getComputedStyle(a).color,
        bar: { colour: bar.backgroundColor, height: bar.height, bottom: bar.bottom },
        gap: Math.abs(li.getBoundingClientRect().bottom + 1 - bottom),
      };
    });
  });
  expect(tabs.map((t) => t.label)).toEqual(["Study", "Course Map", "Notebook"]);
  for (const t of tabs) {
    if (t.label === "Course Map") {
      expect(t).toMatchObject({ current: "page", weight: "600", colour: ink, bar: { colour: accent, height: "2px", bottom: "-1px" } });
      // The bar's slot runs to the header's hairline, and the bar sits 1px below the slot: flush with the header's bottom.
      expect(t.gap).toBeLessThanOrEqual(0.5);
    } else {
      expect(t, t.label).toMatchObject({ current: null, weight: "500", colour: ink2, bar: { colour: "rgba(0, 0, 0, 0)" } });
    }
  }

  // On Settings the gear is the page showing: its slot draws the bar, its icon is ink on no face, and no page link is current.
  await open(page, "/settings");
  const gear = await page.locator("header").evaluate((header) => {
    const link = header.querySelector<HTMLElement>('a[aria-label="Settings"]')!;
    const slot = link.parentElement!;
    const bar = getComputedStyle(slot, "::after");
    return {
      current: link.getAttribute("aria-current"),
      colour: getComputedStyle(link).color,
      face: getComputedStyle(link).backgroundColor,
      bar: { colour: bar.backgroundColor, height: bar.height },
      gap: Math.abs(slot.getBoundingClientRect().bottom + 1 - header.getBoundingClientRect().bottom),
      currentLinks: header.querySelectorAll('nav [aria-current], nav li[data-current="true"]').length,
    };
  });
  expect(gear).toMatchObject({ current: "page", colour: ink, face: "rgba(0, 0, 0, 0)", bar: { colour: accent, height: "2px" }, currentLinks: 0 });
  expect(gear.gap).toBeLessThanOrEqual(0.5);
});

test("[A5] the page links never move between pages, and each is named by its label alone", async ({ page }) => {
  await seed(page, "many-topics");
  let first: number[] | null = null;
  for (const path of ["/study", "/course", "/notebook", "/settings"]) {
    await open(page, path);
    const nav = page.locator("header nav");
    // The hidden bold copy that holds each link's width is in neither the name nor the text.
    for (const label of ["Study", "Course Map", "Notebook"]) await expect(nav.getByRole("link", { name: label, exact: true }), `${path}: ${label}`).toHaveCount(1);
    const lefts = await nav.locator("a").evaluateAll((links) => links.map((a) => a.getBoundingClientRect().left));
    expect(lefts, path).toHaveLength(3);
    first ??= lefts;
    lefts.forEach((left, i) => expect(Math.abs(left - first![i]), `${path}: link ${i + 1}`).toBeLessThanOrEqual(0.5));
  }
});

// Spec 2026-11-12 F3: the Topic bar is a positioned Band right under the header on /study, so the header stacks above it
// and its account menu drops over the bar, not under it.
test("[F3] on /study the account menu drops over the Topic bar's Band", async ({ page }) => {
  await seed(page, "story");
  await open(page, "/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();
  await page.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toBeVisible();
  const onTop = await menu.evaluate((el) => {
    const bar = document.querySelector('[data-testid="topic-bar"]')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // A point of the menu that lies over the bar: what the browser hits there must be the menu.
    const y = Math.max(r.top, bar.top) + 4;
    const x = r.left + r.width / 2;
    const overlaps = r.top < bar.bottom && r.bottom > bar.top;
    return { overlaps, hit: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(onTop).toEqual({ overlaps: true, hit: true });
});
