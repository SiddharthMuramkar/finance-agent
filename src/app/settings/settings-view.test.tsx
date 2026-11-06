import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsView } from "./settings-view";

const empty = { work: "", location: "", loan: "", savingFor: "" };
const account = { name: "Asha" };
const view = (props: Partial<Parameters<typeof SettingsView>[0]> = {}) =>
  renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} account={account} {...props} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the Settings page", () => {
  it("six cards in order: Account, Appearance, About you, Your Topics, Developer details, Start over", () => {
    const html = view();
    const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["account", "appearance", "about-you", "your-topics", "developer-details", "start-over"]);
    const t = text(html);
    expect(t.indexOf("Settings")).toBeGreaterThanOrEqual(0);
    expect(t).not.toMatch(/Dark mode/);
    // Start over: a danger button under a Start over heading, in the last card, spanning the grid.
    expect(html).toMatch(/<h2[^>]*id="start-over-heading"[^>]*>Start over<\/h2>/);
    expect(html).toMatch(/<button[^>]*class="btn btn-danger[^"]*"[^>]*>Start over as a new learner/);
    expect(html).toMatch(/<section[^>]*class="[^"]*col-span-full[^"]*"[^>]*id="start-over"|<section[^>]*id="start-over"[^>]*class="[^"]*col-span-full/);
  });

  it("Your Topics lists only the Topics given (those with progress), in that order, each with a Start over Button", () => {
    const html = view({
      topics: [
        { id: "percent", title: "Percent", status: "passed" },
        { id: "present-value", title: "Present value", status: "in_progress" },
      ],
    });
    const card = html.slice(html.indexOf('id="your-topics"'), html.indexOf('id="developer-details"'));
    const t = text(card);
    expect(t).toContain("Your Topics");
    expect(t.indexOf("Percent")).toBeLessThan(t.indexOf("Present value"));
    expect([...card.matchAll(/class="btn btn-secondary[^"]*"[^>]*>Start over</g)]).toHaveLength(2);
    expect(t).not.toContain("Topics you start will appear here.");
  });

  it("Your Topics says Topics you start will appear here. when none has progress", () => {
    const html = view();
    const card = html.slice(html.indexOf('id="your-topics"'), html.indexOf('id="developer-details"'));
    expect(text(card)).toContain("Topics you start will appear here.");
    expect(card).not.toContain(">Start over<");
  });

  it("fills A5's Your Topics slot (id=\"your-topics\") with B3b's Card, between About you and Developer details, and leaves no empty slot", () => {
    const html = view();
    const slot = html.match(/<(\w+)[^>]*\bid="your-topics"[^>]*>/);
    expect(slot).not.toBeNull();
    expect(slot![1]).toBe("section"); // B3b's Card, not A5's empty <div class="contents">
    expect(html.match(/\bid="your-topics"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<div[^>]*id="your-topics"[^>]*><\/div>/);
    expect(html.indexOf('id="your-topics"')).toBeGreaterThan(html.indexOf('id="about-you"'));
    expect(html.indexOf('id="your-topics"')).toBeLessThan(html.indexOf('id="developer-details"'));
  });

  it("Account names the Learner, says Signed in with a passcode until an email exists, and signs out by form post", () => {
    const html = view();
    const card = html.slice(html.indexOf('id="account"'), html.indexOf('id="appearance"'));
    expect(text(card)).toContain("Asha");
    expect(text(card)).toContain("Signed in with a passcode");
    expect(card).toMatch(/<form[^>]*action="\/api\/logout"[^>]*method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);

    const withEmail = view({ account: { name: "Asha", email: "asha@example.com" } });
    const emailCard = withEmail.slice(withEmail.indexOf('id="account"'), withEmail.indexOf('id="appearance"'));
    expect(text(emailCard)).toContain("asha@example.com");
    expect(text(emailCard)).not.toContain("Signed in with a passcode");
  });

  it("has an Appearance section with three tiles: Light, Dark and Match my Mac", () => {
    const html = view();
    const t = text(html);
    expect(t).toContain("Appearance");
    for (const w of ["Match my Mac", "Light", "Dark"]) expect(t).toContain(w);
    for (const w of ["Day theme", "Night theme", "Always use one theme", "Paper", "Midnight", "Forest"]) expect(t).not.toContain(w);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('data-testid="tile-dark"');
  });

  it("checks the pinned theme's tile", () => {
    const html = view({ theme: { mode: "single", theme: "dark" } });
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/name="theme"[^>]*checked/);
  });

  it("fills About you with what was saved, says it is private and never that changes wait for the next Session", () => {
    const html = view({ profile: { ...empty, work: "Nurse" } });
    expect(html).toContain('value="Nurse"');
    expect(html).toContain("This is private.");
    expect(html).not.toMatch(/next Session/i);
  });

  it("shows the Show developer details switch off by default, and on when the Learner turned it on", () => {
    const box = (on: boolean) => view({ developerDetails: on }).match(/<input type="checkbox"[^>]*>/)![0];
    expect(box(false)).not.toContain("checked");
    expect(box(true)).toContain("checked");
  });

  it("offers Start over as a button that asks for confirmation before anything is posted", () => {
    const html = view();
    expect(html).toContain("Start over as a new learner");
    expect(html).not.toContain("Yes, start over");
    expect(html).not.toContain('action="/api/start-over"');
  });

  it("credits Fluent Emoji at the foot of the page, under Start over (E1)", () => {
    const html = view();
    const t = text(html);
    expect(t).toContain("Emoji artwork: Fluent Emoji by Microsoft, MIT License,");
    expect(html).toContain('href="https://github.com/microsoft/fluentui-emoji"');
    expect(t.indexOf("Emoji artwork")).toBeGreaterThan(t.indexOf("Start over as a new learner"));
  });
});
