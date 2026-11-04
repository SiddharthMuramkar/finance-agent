import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const link = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/link")>()), useLinkStatus: () => ({ pending: link.pending }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/course" }));
vi.mock("./theme-cookie", () => ({ readTheme: async () => "light" }));

import Loading from "./course/loading";
import NotesLoading from "./notes/loading";
import ProgressLoading from "./progress/loading";
import SessionsLoading from "./sessions/loading";
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
    expect(html).toContain("pressable");
    expect(html).toContain('type="button"');
  });

  it("gives the primary variant the pressed navy", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain("--pressed-bg:var(--brand-pressed)");
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
    expect(html).toMatch(/min-h-8 min-w-8/);
  });
});

describe("Chip", () => {
  it("is at least 28px tall and keeps the older active spelling", () => {
    const html = renderToStaticMarkup(<Chip active>Tab</Chip>);
    expect(html).toContain("min-h-7");
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

  it("flags the link while its page is loading", () => {
    link.pending = true;
    expect(renderToStaticMarkup(<NavLink href="/notes">Notes</NavLink>)).toContain('data-link-pending="true"');
  });
});

describe("route skeletons", () => {
  it.each([
    ["study", StudyLoading],
    ["course", Loading],
    ["progress", ProgressLoading],
    ["sessions", SessionsLoading],
    ["notes", NotesLoading],
    ["settings", SettingsLoading],
  ])("%s shows the route-skeleton under the real header", async (_name, Page) => {
    // Each loading.tsx returns an async server component; resolve it by hand, as the server would.
    const element = Page() as React.ReactElement<object>;
    const html = renderToStaticMarkup(await (element.type as (props: object) => Promise<React.ReactElement>)(element.props));
    expect(html).toContain('data-testid="route-skeleton"');
    expect(html).toContain("Finance Agent");
    expect(html).toContain("skeleton");
  });
});
