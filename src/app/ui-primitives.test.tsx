import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const link = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/link")>()), useLinkStatus: () => ({ pending: link.pending }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/course" }));
vi.mock("./theme-cookie", () => ({ readTheme: async () => "light" }));
vi.mock("./split-cookie", () => ({ readSplit: async () => 45 }));

import Loading from "./course/loading";
import NotebookLoading from "./notebook/loading";
import SettingsLoading from "./settings/loading";
import StudyLoading from "./study/loading";
import { Button, Chip, IconButton, NavLink, Spinner } from "./ui";

beforeEach(() => {
  link.pending = false;
});

describe("Button", () => {
  it("shows a spinner and is busy while loading, and ignores presses", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain('data-testid="spinner"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("has no spinner or busy flag at rest, and passes the variant and pressed state through", () => {
    const html = renderToStaticMarkup(
      <Button variant="secondary" size="sm" pressed>
        Save
      </Button>,
    );
    expect(html).not.toContain("spinner");
    expect(html).not.toContain("aria-busy");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("btn btn-secondary btn-sm");
    expect(html).toContain('type="button"');
  });

  it("gives the primary variant the one filled face (ADR 0015: flat, no lip)", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain("btn btn-primary");
  });

  it("draws the tertiary variant as text only, at the 28px xs size beside text", () => {
    const html = renderToStaticMarkup(
      <Button variant="tertiary" size="xs">
        Save to Notebook
      </Button>,
    );
    expect(html).toContain('class="btn btn-tertiary btn-xs"');
    expect(html).toContain('data-affordance="button"');
  });
});

describe("IconButton", () => {
  it("is named by its label and says whether it is on", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Close" pressed={false}>
        x
      </IconButton>,
    );
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("btn btn-icon");
  });

  it("shows its label as the tooltip, or the tip when one is given", () => {
    expect(renderToStaticMarkup(<IconButton label="Close">x</IconButton>)).toContain('title="Close"');
    const tipped = renderToStaticMarkup(
      <IconButton label="Theme: Light" tip="Switch to dark theme">
        x
      </IconButton>,
    );
    expect(tipped).toContain('aria-label="Theme: Light"');
    expect(tipped).toContain('title="Switch to dark theme"');
  });
});

describe("Chip", () => {
  it("is at least 28px tall and keeps the older active spelling", () => {
    const html = renderToStaticMarkup(<Chip active>Tab</Chip>);
    expect(html).toContain("chip");
    expect(html).toContain('data-state="showing"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows a spinner and is busy while drawing", () => {
    const html = renderToStaticMarkup(<Chip state="drawing">Chart</Chip>);
    expect(html).toContain('data-state="drawing"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="spinner"');
    expect(renderToStaticMarkup(<Chip>Chart</Chip>)).toContain('data-state="idle"');
  });
});

describe("Spinner", () => {
  it("is hidden from screen readers", () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain('aria-hidden="true"');
  });
});

describe("NavLink", () => {
  it("marks the page showing, by the address, and carries no pending flag at rest", () => {
    const here = renderToStaticMarkup(<NavLink href="/course">Course Map</NavLink>);
    expect(here).toContain('aria-current="page"');
    expect(here).not.toContain("data-link-pending");
    expect(renderToStaticMarkup(<NavLink href="/notes">Notes</NavLink>)).not.toContain("aria-current");
  });

  it("is a flat ghost link (no chip) that says it is a nav control, keeps the caller's classes and holds its bold width", () => {
    const html = renderToStaticMarkup(<NavLink href="/notes" className="shrink-0">Notes</NavLink>);
    expect(html).toContain('data-affordance="nav"');
    expect(html).toMatch(/class="relative inline-flex h-8 [^"]* shrink-0"/);
    expect(html).toMatch(/text-\[var\(--ink-2\)\][^"]*hover:bg-\[var\(--wash\)\][^"]*aria-\[current=page\]:font-semibold aria-\[current=page\]:text-\[var\(--ink\)\]/);
    expect(html).toContain('<span data-label="Notes" class="inline-flex flex-col');
    expect(html).not.toMatch(/\bchip\b/);
  });

  it("flags the link while its page is loading", () => {
    link.pending = true;
    expect(renderToStaticMarkup(<NavLink href="/notes">Notes</NavLink>)).toContain('data-link-pending="true"');
  });
});

describe("route skeletons", () => {
  it.each([
    ["study", StudyLoading],
    ["course", Loading],
        ["notebook", NotebookLoading],
    ["settings", SettingsLoading],
  ])("%s shows the route-skeleton under the real header", async (_name, Page) => {
    // Each loading.tsx returns an async server component; resolve it by hand, as the server would.
    const element = Page() as React.ReactElement<object>;
    const html = renderToStaticMarkup(await (element.type as (props: object) => Promise<React.ReactElement>)(element.props));
    expect(html).toContain('data-testid="route-skeleton"');
    expect(html).toContain("Value It");
    expect(html).toContain("skeleton");
  });

  // Spec 2026-11-11, C2a: the skeleton and the page draw the same columns at the saved share.
  it("the study skeleton draws the same three columns", async () => {
    const element = StudyLoading() as React.ReactElement<object>;
    const html = renderToStaticMarkup(await (element.type as (props: object) => Promise<React.ReactElement>)(element.props));
    const open = html.match(/<div[^>]*class="workspace-split[ "][^>]*>/)?.[0] ?? "";
    expect(open).toContain("--split-saved:45");
    // Spec 2026-11-12 F3: the Topic bar is a Band above both columns, so its place comes before the split, not in it.
    expect(html.indexOf('data-testid="topic-bar-skeleton"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="topic-bar-skeleton"')).toBeLessThan(html.indexOf(open));
    expect(html).toMatch(/<div data-testid="topic-bar-skeleton" class="band /);
    const inside = html.slice(html.indexOf(open) + open.length);
    // Between the conversation's blocks (its composer, h-14, last) and the right column's (its first block, h-8):
    // an empty aria-hidden div, the Split handle's place.
    const middle = inside.slice(inside.indexOf("h-14"), inside.indexOf("h-8 w-1/3"));
    expect(middle).toContain('</div></div><div aria-hidden="true"></div><div');
  });
});

describe("Card and heading sizes (A2)", () => {
  // ADR 0015's type scale: a page title is type-h1 (Inter Tight 28/34, 600), and a Card pads 20px.
  it("Card pads with p-5 and the page h1 is type-h1", async () => {
    const { Card } = await import("./ui");
    expect(renderToStaticMarkup(<Card>x</Card>)).toMatch(/\bp-5\b/);
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["course/course-map-view.tsx", "settings/settings-view.tsx", "notebook/notebook-view.tsx"]) {
      const h1 = readFileSync(join(__dirname, file), "utf8").match(/<h1 className="([^"]*)"/)![1]!;
      expect(h1, file).toContain("type-h1");
      expect(h1, file).not.toMatch(/\btext-(?:lg|xl)\b/);
    }
  });
});
