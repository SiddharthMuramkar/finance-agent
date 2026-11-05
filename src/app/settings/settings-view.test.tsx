import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsView } from "./settings-view";

const empty = { work: "", location: "", loan: "", savingFor: "" };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the Settings page", () => {
  it("has a title and four sections in order: About you, Appearance, Developer details and Start over", () => {
    const html = text(renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} />));
    const at = (words: string) => html.indexOf(words);
    expect(at("Settings")).toBeGreaterThanOrEqual(0);
    expect(at("About you")).toBeGreaterThan(at("Settings"));
    expect(at("Show developer details")).toBeGreaterThan(at("About you"));
    expect(at("Start over")).toBeGreaterThan(at("Show developer details"));
    expect(html).not.toMatch(/Dark mode/);
  });

  it("has an Appearance section with three tiles: Light, Dark and Match my Mac", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} />);
    const t = text(html);
    expect(t).toContain("Appearance");
    for (const w of ["Match my Mac", "Light", "Dark"]) expect(t).toContain(w);
    for (const w of ["Day theme", "Night theme", "Always use one theme", "Paper", "Midnight", "Forest"]) expect(t).not.toContain(w);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('data-testid="tile-dark"');
  });

  it("checks the pinned theme's tile", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} theme={{ mode: "single", theme: "dark" }} />);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/name="theme"[^>]*checked/);
  });

  it("fills About you with what was saved, says it is private and never that changes wait for the next Session", () => {
    const html = renderToStaticMarkup(<SettingsView profile={{ ...empty, work: "Nurse" }} developerDetails={false} />);
    expect(html).toContain('value="Nurse"');
    expect(html).toContain("This is private.");
    expect(html).not.toMatch(/next Session/i);
  });

  it("shows the Show developer details switch off by default, and on when the Learner turned it on", () => {
    const box = (on: boolean) => renderToStaticMarkup(<SettingsView profile={empty} developerDetails={on} />).match(/<input type="checkbox"[^>]*>/)![0];
    expect(box(false)).not.toContain("checked");
    expect(box(true)).toContain("checked");
  });

  it("offers Start over as a button that asks for confirmation before anything is posted", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} />);
    expect(html).toContain("Start over as a new learner");
    expect(html).not.toContain("Yes, start over");
    expect(html).not.toContain('action="/api/start-over"');
  });

  it("credits Fluent Emoji at the foot of the page, under Start over (E1)", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} />);
    const t = text(html);
    expect(t).toContain("Emoji artwork: Fluent Emoji by Microsoft, MIT License,");
    expect(html).toContain('href="https://github.com/microsoft/fluentui-emoji"');
    expect(t.indexOf("Emoji artwork")).toBeGreaterThan(t.indexOf("Start over as a new learner"));
  });
});
