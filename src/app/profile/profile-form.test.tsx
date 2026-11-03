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

  it("says it is private, when the Tutor gets it, where it is kept, and that changes apply from the next Session", () => {
    expect(PROFILE_PRIVACY).toMatch(/private/);
    expect(PROFILE_PRIVACY).toMatch(/when a Session starts/);
    expect(PROFILE_PRIVACY).toMatch(/kept in that Session's record/);
    expect(PROFILE_PRIVACY).toMatch(/next Session/);
    expect(PROFILE_PRIVACY).toMatch(/never as advice/);
    expect(renderToStaticMarkup(<ProfileForm mode="card" initial={empty} />)).toMatch(/kept in that Session(&#x27;|')s record/);
  });

  it("the edit page has Save only, filled with what was saved", () => {
    const html = renderToStaticMarkup(<ProfileForm mode="page" initial={{ ...empty, work: "Nurse" }} />);
    expect(html).toContain('value="Nurse"');
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Not now");
  });

  it("the Progress page links to About you", () => {
    expect(renderToStaticMarkup(<ProgressView topics={[]} />)).toMatch(/href="\/profile"[^>]*>About you|data-about-you[^>]*>About you/);
  });
});
