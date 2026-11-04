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

  it("has an Appearance section with Match my Mac, a Day theme and a Night theme, each option labelled", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} />);
    const t = text(html);
    expect(t).toContain("Appearance");
    for (const w of ["Match my Mac", "Always use one theme", "Day theme", "Night theme", "Light", "Paper", "Midnight", "Forest"]) expect(t).toContain(w);
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html).toContain('data-testid="tile-paper"');
  });

  it("shows one group of all four themes when one theme is pinned", () => {
    const html = renderToStaticMarkup(<SettingsView profile={empty} developerDetails={false} theme={{ mode: "single", theme: "forest" }} />);
    expect(text(html)).not.toContain("Day theme");
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html).toMatch(/name="theme-one"[^>]*checked/);
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
});
