import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Vercel Analytics records each page's address. A sign-in link lands on /login?link=<token>, and that token signs
// someone in once, so it must never reach the analytics: SiteAnalytics drops it before the event is sent.

const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: Record<string, unknown>) => {
    seen.props = props;
    return null;
  },
}));

const { SiteAnalytics, withoutSignInLink } = await import("./site-analytics");

describe("site analytics", () => {
  it("drops the sign-in token from a page view and keeps the rest of the address", () => {
    const event = withoutSignInLink({ type: "pageview", url: "https://www.value-it.xyz/login?link=AbCdEf123&next=%2Fcourse" });
    expect(event).toEqual({ type: "pageview", url: "https://www.value-it.xyz/login?next=%2Fcourse" });
    expect(JSON.stringify(event)).not.toContain("AbCdEf123");
  });

  it("leaves any other address as it is", () => {
    const view = { type: "pageview", url: "https://www.value-it.xyz/course?topic=percent" } as const;
    expect(withoutSignInLink(view)).toBe(view);
    const custom = { type: "event", url: "https://www.value-it.xyz/study" } as const;
    expect(withoutSignInLink(custom)).toBe(custom);
  });

  it("sends nothing for an address it cannot read, rather than risk a token", () => {
    expect(withoutSignInLink({ type: "pageview", url: "not a url ?link=AbC" })).toBeNull();
  });

  it("is Vercel's Analytics with that filter", () => {
    renderToStaticMarkup(<SiteAnalytics />);
    expect(seen.props?.beforeSend).toBe(withoutSignInLink);
  });
});
