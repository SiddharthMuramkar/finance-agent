import type { Metadata } from "next";
import { pageMetadata } from "@/app/site-metadata";
import { about, COURSE } from "@/site/copy";
import { Rich } from "@/site/rich";
import { courseStats } from "@/site/stats";
import { siteViewer } from "@/site/viewer";
import { CtaNote, PrimaryCta } from "../cta";
import { FaqList } from "../faq";
import { Icon, Pill, SectionHead } from "../parts";

// About, at /about (spec 7.6, Appendix B): the header with "At a glance", four promises, the sourcing flow with the
// non-affiliation line (its named Source linked), what you can learn, early access, the full FAQ and the closing CTA. No
// founder's note (#75: no placeholders). Public; drawn per request for the nav's viewer state. Reads the course files
// for the Topic count and nothing private.

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: about.title, description: about.lede, path: "/about" });

/** The line with the Source it names drawn as a link to that Source (#75). */
function NamedSource({ text, source }: { text: string; source: { name: string; url: string } }) {
  const at = text.indexOf(source.name);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a href={source.url} target="_blank" rel="noopener noreferrer">
        {source.name}
      </a>
      {text.slice(at + source.name.length)}
    </>
  );
}

export default async function AboutPage() {
  const viewer = await siteViewer();
  const course = courseStats();
  return (
    <div data-page="about">
      <header className="v-wrap v-about-head">
        <div className="v-stack">
          <h1 className="page-h1 v-page-title" tabIndex={-1}>
            {about.h1}
          </h1>
          <p className="v-lede">{about.lede}</p>
        </div>
        <section className="v-card v-glance" aria-labelledby="glance-h">
          <h2 className="v-label" id="glance-h">
            {about.glance.title}
          </h2>
          <dl>
            {about.glance.rows(course).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </header>

      <section className="v-section tight v-rule-top" aria-labelledby="promises-h">
        <div className="v-wrap">
          <SectionHead title={about.promisesH2} id="promises-h" />
          <ul className="v-promises">
            {about.promises.map((promise) => (
              <li key={promise.heading}>
                <h3 className="v-h3">{promise.heading}</h3>
                <p>
                  <Rich>{promise.body}</Rich>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="v-section tight v-wash" aria-labelledby="sourcing-h">
        <div className="v-wrap v-stack">
          <SectionHead title={about.sourcingH2} id="sourcing-h" />
          <ol className="v-flow">
            {about.sourcing.map((step, i) => (
              <li key={step.step}>
                <p className="step">
                  {step.step}
                  {i < about.sourcing.length - 1 && <Icon name="arrow" />}
                </p>
                <p className="v-small">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="v-small v-measure" data-about-prose="">
            <NamedSource text={about.notAffiliated} source={about.notAffiliatedSource} />
          </p>
        </div>
      </section>

      <section className="v-section tight" aria-labelledby="learn-h">
        <div className="v-wrap v-stack">
          <SectionHead title={about.learnH2} body={about.learnBody(course)} id="learn-h" />
          <ul className="v-tags" aria-label="Subjects">
            {course.bySubject.map((subject) => (
              <li key={subject.name}>
                <Pill tone="plain">
                  {subject.name} · {subject.count}
                </Pill>
              </li>
            ))}
          </ul>
          <ul className="v-tags" aria-label="Stages that read real arguments">
            {course.byStage.map((stage) => (
              <li key={stage.stage}>
                <Pill tone="blue">
                  {COURSE.stages[stage.stage].name} · {stage.count}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="v-section tight v-rule-top" aria-labelledby="early-h">
        <div className="v-wrap">
          <SectionHead title={about.earlyH2} id="early-h" />
          <ul className="v-early">
            {about.early.map((item) => (
              <li key={item.heading} className="v-card v-stack" style={{ gap: 8 }}>
                <h3 className="v-h3">{item.heading}</h3>
                <p>
                  <Rich>{item.body}</Rich>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="v-section tight v-rule-top" aria-labelledby="faq-h" id="faq">
        <div className="v-wrap v-split">
          <div className="v-split-head">
            <h2 className="v-h2" id="faq-h">
              {about.faqH2}
            </h2>
          </div>
          <FaqList />
        </div>
      </section>

      <section className="v-section v-wash" aria-labelledby="about-closing-h" data-site-section="closing">
        <div className="v-wrap v-stack">
          <h2 className="v-h2" id="about-closing-h">
            {about.closing}
          </h2>
          <div className="v-row">
            <PrimaryCta viewer={viewer} />
          </div>
          <CtaNote viewer={viewer} />
        </div>
      </section>
    </div>
  );
}
