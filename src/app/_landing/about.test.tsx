// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aboutCopy } from "./about-copy";
import { AboutView } from "./about";
import { copy } from "./copy";
import { loadShowcases } from "./showcase-widgets";

const stats = { topics: 95, subjects: 9 };
const widgets = loadShowcases().filter((s) => s.area === "everyday" || s.area === "economy");
const html = renderToStaticMarkup(<AboutView stats={stats} widgets={widgets} />);
const words = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const part = (h: string, tag: string) => h.slice(h.indexOf(`<${tag}`), h.indexOf(`</${tag}>`));

describe("The About page [S4]", () => {
  it("has one h1, Home's header with About marked current, and Home's footer", () => {
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${aboutCopy.title}</h1>`));
    const header = part(html, "header");
    expect(header).toMatch(/<a href="\/about"[^>]*aria-current="page"[^>]*>About<\/a>/);
    expect(header).toMatch(/<a href="\/login"[^>]*>Sign in<\/a>/);
    // Join early access is a ButtonLink, which writes its href after its other attributes: read the link's own href.
    const headerLinks = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("header a")];
    const joins = headerLinks.filter((a) => a.textContent!.includes("Join early access"));
    expect(joins).toHaveLength(1);
    expect(joins[0].getAttribute("href")).toBe("/login");
    const footer = part(html, "footer");
    expect(words(footer)).toContain(copy.footer);
    expect(footer).toMatch(/<a href="\/about"[^>]*>About<\/a>/);
    const text = words(html);
    expect(text).not.toMatch(/lesson/i);
    expect(text).not.toMatch(/\buser\b/i);
    expect(text).not.toMatch(/chatbot/i);
  });

  it("the sections come in the owner's order", () => {
    const at = (needle: string) => html.indexOf(needle);
    const positions = [at("<h1"), at(aboutCopy.what.title), at(aboutCopy.how.title), at(aboutCopy.widgets.title), at(aboutCopy.facts.title), at(aboutCopy.learn.title), at(aboutCopy.not.title), at(aboutCopy.faq.title), at("home-band")];
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("How a Topic teaches lists the seven Teaching Steps in order", () => {
    const how = html.slice(html.indexOf(aboutCopy.how.title), html.indexOf(aboutCopy.widgets.title));
    const steps = [...how.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    // GLOSSARY.md "Teaching Steps": the names are written here, not read from the copy under test.
    expect(steps).toEqual(["Story", "Concept", "Explore", "Your turn", "Check", "Reveal", "Principle"]);
  });

  it("What you can learn shows the counts it is given and exactly the nine subjects", () => {
    const learn = html.slice(html.indexOf(aboutCopy.learn.title), html.indexOf(aboutCopy.not.title));
    const text = words(learn).replaceAll("&amp;", "&");
    expect(text).toContain("95 Topics");
    expect(text).toContain("9 subjects");
    const listed = [...learn.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) => m[1].replaceAll("&amp;", "&"));
    expect(listed).toEqual([
      "Numbers & time value",
      "Financial statements",
      "Economics & policy",
      "Currencies & countries",
      "Bonds & credit",
      "Markets & investing",
      "Valuation & corporate finance",
      "Derivatives",
      "Banks, crises & the system",
    ]);
  });

  it("marks each text block, not its section, as prose: every line of copy is inside one and no Widget is", () => {
    const blocks = [...html.matchAll(/<(\w+)[^>]*data-about-prose[^>]*>/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, tag] of blocks) expect(tag).not.toBe("section");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const prose = [...doc.querySelectorAll("[data-about-prose]")];
    const inProse = (line: string) => prose.some((el) => el.textContent!.includes(line));
    const lines = [aboutCopy.lede, ...aboutCopy.what.lines, ...aboutCopy.how.after, ...aboutCopy.widgets.lines, ...aboutCopy.facts.lines, aboutCopy.learn.stages, ...aboutCopy.not.lines, ...aboutCopy.faq.items.map((i) => i.a)];
    for (const line of lines) expect(inProse(line), line).toBe(true);
    for (const el of prose) {
      expect(el.querySelector('[data-testid="about-widget"]')).toBeNull();
      expect(el.textContent).not.toContain(aboutCopy.widgets.caption);
      expect(el.className).toContain("max-w-[34em]");
    }
  });

  it("the closing band offers Join early access to the sign-in page", () => {
    const band = html.slice(html.indexOf("home-band"));
    expect(band.match(/home-band/g)).toHaveLength(1);
    expect(band).toMatch(/href="\/login"/);
  });
});
