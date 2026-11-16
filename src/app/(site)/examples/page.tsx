import type { Metadata } from "next";
import { COURSE, examplesPage, home } from "@/site/copy";
import { EXAMPLES } from "@/site/examples";
import { Rich } from "@/site/rich";
import { courseStats } from "@/site/stats";
import { siteViewer } from "@/site/viewer";
import { CtaNote, PrimaryCta } from "../cta";
import { Pill } from "../parts";
import { ExamplesFilter } from "./examples-filter";

// Examples, at /examples (spec 7.4): the playable cases with a filter, then the Topics that wait inside for
// members. Public; drawn per request for the nav's viewer state.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Examples", description: examplesPage.description(EXAMPLES.length) };

export default async function ExamplesPage() {
  const viewer = await siteViewer();
  const course = courseStats();
  return (
    <div data-page="examples">
      <header className="v-wrap v-section tight v-stack">
        <h1 className="page-h1 v-page-title" tabIndex={-1}>
          {examplesPage.h1}
        </h1>
        <p className="v-lede">
          <Rich>{examplesPage.lede(EXAMPLES.length)}</Rich>
        </p>
      </header>

      <section className="v-wrap" aria-label="Cases" data-site-section="examples">
        <ExamplesFilter />
      </section>

      <section className="v-section" aria-labelledby="inside-h" data-site-section="inside">
        <div className="v-wrap v-stack">
          <h2 className="v-h3" id="inside-h">
            <Rich>{home.questions.more(course)}</Rich>
          </h2>
          <ul className="v-lockedlist">
            {COURSE.locked.map((topic) => (
              <li key={topic.title} className="v-card">
                <span className="v-fine">{topic.category}</span>
                <span className="title">{topic.title}</span>
                <span>
                  <Pill tone="plain" icon="lock">
                    {examplesPage.members}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
          <div className="v-row">
            <PrimaryCta viewer={viewer} />
          </div>
          <CtaNote viewer={viewer} />
        </div>
      </section>
    </div>
  );
}
