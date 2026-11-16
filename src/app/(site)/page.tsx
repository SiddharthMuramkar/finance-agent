import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/app/site-metadata";
import { home, MOVES } from "@/site/copy";
import { EXAMPLES } from "@/site/examples";
import { leverSteps } from "@/site/levers-story";
import { Rich } from "@/site/rich";
import { courseStats } from "@/site/stats";
import { siteViewer } from "@/site/viewer";
import { ClosingBars } from "./_home/closing-bars";
import { LeversStory } from "./_home/levers-story";
import { TutorDemo } from "./_home/tutor-demo";
import { ColourLanguage } from "./colour-language";
import { CtaNote, PrimaryCta } from "./cta";
import { FaqList } from "./faq";
import { ArrowLink, Glyph, SectionHead } from "./parts";
import { QuestionList } from "./question-list";

// Home, at "/" (spec 7.2): hero with the Tutor demo, four moves, the levers story, the colour language, the questions,
// trust, FAQ and early access. Open to everyone; the CTAs follow the viewer state, so the page is drawn per request and
// sent no-store (next.config.ts). A visitor costs no Learner read, and the page makes no model call and no write.

export const dynamic = "force-dynamic";

/** The site's own title and description (the root's), with Home's canonical link (issue #69). */
export const metadata: Metadata = pageMetadata({ path: "/" });

export default async function HomePage() {
  const viewer = await siteViewer();
  const { topics } = courseStats();
  const secondary = viewer.state === "visitor" ? { href: "/examples", label: home.hero.secondary.visitor } : viewer.state === "member" ? { href: "/course", label: home.hero.secondary.member } : null;

  return (
    <div data-page="home">
      <section className="v-wrap v-hero" data-site-section="hero">
        <div className="v-hero-copy">
          <p className="v-eyebrow">{home.hero.eyebrow}</p>
          <h1 className="page-h1 v-display" tabIndex={-1}>
            {home.hero.h1.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="v-lede">
            <Rich>{home.hero.lede}</Rich>
          </p>
          <div className="v-row">
            <PrimaryCta viewer={viewer} />
            {secondary && (
              <Link href={secondary.href} className="v-btn v-btn-secondary v-btn-lg" data-affordance="button">
                {secondary.label}
              </Link>
            )}
          </div>
          <CtaNote viewer={viewer} />
          <ul className="v-hero-facts">
            <li>
              {topics} {home.hero.facts[0]}
            </li>
            <li>{home.hero.facts[1]}</li>
            <li>{home.hero.facts[2]}</li>
          </ul>
        </div>
        <TutorDemo />
      </section>

      <section className="v-section v-rule-top" aria-labelledby="moves-h" data-site-section="moves">
        <div className="v-wrap">
          <SectionHead eyebrow={home.moves.eyebrow} title={home.moves.h2} id="moves-h" />
          <ol className="v-moves">
            {MOVES.map((move, i) => (
              <li key={move.name}>
                <Glyph size={26} lit={i + 1} />
                <p className="v-label">Move {i + 1}</p>
                <p className="name">{move.name}</p>
                <p className="v-small">{move.line}</p>
              </li>
            ))}
          </ol>
          <p className="v-section-link">
            <ArrowLink href="/how-it-works">{home.moves.link}</ArrowLink>
          </p>
        </div>
      </section>

      <LeversStory steps={leverSteps()} />

      <ColourLanguage eyebrow={home.colours.eyebrow} title={home.colours.h2} body={home.colours.body} headingId="colours-h" />

      <section className="v-section" aria-labelledby="questions-h" data-site-section="questions">
        <div className="v-wrap">
          <SectionHead eyebrow={home.questions.eyebrow} title={home.questions.h2} body={home.questions.body} id="questions-h" />
          <QuestionList examples={EXAMPLES} />
          <div className="v-row v-section-link">
            <p>
              <Rich>{home.questions.more(topics)}</Rich>
            </p>
            <ArrowLink href="/how-it-works#path">{home.questions.path}</ArrowLink>
          </div>
        </div>
      </section>

      <section className="v-section v-rule-top" aria-labelledby="trust-h" data-site-section="trust">
        <div className="v-wrap v-split">
          <div className="v-split-head">
            <p className="v-eyebrow">{home.trust.eyebrow}</p>
            <h2 className="v-h2" id="trust-h">
              {home.trust.h2}
            </h2>
            <ArrowLink href="/about">{home.trust.link}</ArrowLink>
          </div>
          <ul className="v-trust">
            {home.trust.columns.map((column) => (
              <li key={column.heading}>
                <h3 className="v-h3">{column.heading}</h3>
                <p>
                  <Rich>{column.body}</Rich>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="v-section v-rule-top" aria-labelledby="faq-h" data-site-section="faq">
        <div className="v-wrap v-split">
          <div className="v-split-head">
            <p className="v-eyebrow">{home.faq.eyebrow}</p>
            <h2 className="v-h2" id="faq-h">
              {home.faq.h2}
            </h2>
            <ArrowLink href="/about#faq">{home.faq.link}</ArrowLink>
          </div>
          <FaqList numbers={home.faq.pick} />
        </div>
      </section>

      <section className="v-section v-wash" aria-labelledby="closing-h" data-site-section="closing">
        <div className="v-wrap v-closing">
          <div className="v-stack">
            <h2 className="v-closing-h" id="closing-h">
              {home.closing.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <div className="v-row">
              <PrimaryCta viewer={viewer} />
            </div>
            <CtaNote viewer={viewer} />
            {viewer.state === "visitor" && (
              <ol className="v-join-steps">
                {home.closing.steps.map((step, i) => (
                  <li key={step}>
                    <span className="n">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <ClosingBars />
        </div>
      </section>
    </div>
  );
}
