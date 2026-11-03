import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressView } from "../course/course-map-view";
import { PROFILE_PRIVACY, ProfileForm } from "./profile-form";

const empty = { work: "", location: "", loan: "", savingFor: "" };

describe("the Learner Profile form", () => {
  it("the first-visit card asks four optional things, with Save and Not now", () => {
    const html = renderToStaticMarkup(<ProfileForm mode="card" initial={empty} />);
    for (const label of ["Work", "Where you live", "Any loan", "What you are saving for"]) expect(html).toContain(label);
    expect(html.match(/maxLength="200"|maxlength="200"/gi)).toHaveLength(4);
    expect(html).toContain(">Save<");
    expect(html).toContain(">Not now<");
    expect(html).toContain("data-profile-card");
  });

  it("says it is private, that the Tutor uses it only for examples, and no longer that changes wait for the next Session", () => {
    expect(PROFILE_PRIVACY).toMatch(/private/);
    expect(PROFILE_PRIVACY).toMatch(/never as advice/);
    const card = renderToStaticMarkup(<ProfileForm mode="card" initial={empty} />);
    expect(card).toContain("This is private.");
    expect(card).not.toMatch(/next Session/i);
    expect(renderToStaticMarkup(<ProfileForm mode="page" initial={empty} />)).not.toMatch(/next Session/i);
    expect(PROFILE_PRIVACY).not.toMatch(/next Session/i);
  });

  it("the edit page has Save only, filled with what was saved", () => {
    const html = renderToStaticMarkup(<ProfileForm mode="page" initial={{ ...empty, work: "Nurse" }} />);
    expect(html).toContain('value="Nurse"');
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Not now");
  });

  it("the Progress page no longer links to About you, which lives on Settings", () => {
    const html = renderToStaticMarkup(<ProgressView topics={[]} />);
    expect(html).not.toContain("About you");
    expect(html).not.toContain('href="/profile"');
  });
});
