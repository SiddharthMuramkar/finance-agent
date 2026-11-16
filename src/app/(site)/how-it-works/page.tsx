import type { Metadata } from "next";
import { COURSE, home, howItWorks } from "@/site/copy";
import { exampleBySlug } from "@/site/examples";
import { Rich } from "@/site/rich";
import { siteViewer } from "@/site/viewer";
import { ColourLanguage } from "../colour-language";
import { CtaNote, PrimaryCta } from "../cta";
import { MiniPicture } from "../mini-pictures";
import { Pill, SectionHead } from "../parts";
import { HowMoves } from "./moves";

// How it works, at /how-it-works (spec 7.3): the header, the four moves with a rail on the running Amazon example, the
// Study Workspace mock, the colour language, Reviews, the path and the closing CTA. Public; drawn per request for the
// nav's viewer state.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "How it works", description: "Every Topic is one real event, taught in four moves, in 10 to 15 minutes." };

const RATES = exampleBySlug("rbi-repo-cut-2025")!;

/** The annotated Study Workspace mock (7.3 item 3): chat left, a widget right, the 15-step bar and four callouts. */
function WorkspaceMock() {
  const { workspace } = howItWorks;
  return (
    <figure className="v-stack" style={{ margin: 0 }}>
      <div className="v-raised v-mock" aria-hidden="true">
        <span className="v-callout" style={{ left: -10, top: 24 }}>
          1
        </span>
        <div className="v-mock-chat">
          <p className="v-bubble you">{RATES.ask}</p>
          <p className="v-bubble tutor">
            <Rich>{RATES.lead}</Rich>
          </p>
          <p className="v-mock-input">{workspace.input}</p>
        </div>
        <span className="v-callout" style={{ right: -10, top: 24 }}>
          2
        </span>
        <div className="v-mock-widget v-card">
          <MiniPicture kind="rates" id="mock-rates" />
          <p>
            <Rich>{workspace.readout}</Rich>
          </p>
          <p>
            <Pill tone="gain" icon="check">
              {workspace.saved}
            </Pill>
          </p>
          <span className="v-callout" style={{ right: -10, bottom: 12 }}>
            4
          </span>
        </div>
        <div className="v-stepbar">
          {Array.from({ length: 15 }, (_, i) => (
            <span key={i} className={i < 4 ? "done" : undefined} />
          ))}
        </div>
        <span className="v-callout" style={{ left: -10, bottom: 4 }}>
          3
        </span>
      </div>
      <figcaption>
        <ol className="v-legend">
          {workspace.legend.map((line, i) => (
            <li key={line}>
              <span className="v-callout">{i + 1}</span>
              {line}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

/** Reviews (7.3 item 5): a labelled illustration of spaced reviews, with the word "Illustration" in the drawing. */
function ReviewsIllustration() {
  const { reviews } = howItWorks;
  const rings = [150, 250, 410];
  return (
    <svg viewBox="0 0 560 150" width="100%" role="img" aria-label={`${reviews.illustration}: a check passed, then three reviews spaced further and further apart; a missed review comes back sooner.`} style={{ maxWidth: 640, display: "block" }}>
      <rect x={10} y={84} width={540} height={2} className="v-svg-line" />
      <circle cx={40} cy={85} r={10} className="v-svg-gain" />
      <text x={40} y={120} textAnchor="middle" fontSize={12} className="v-svg-ink">
        {reviews.passed}
      </text>
      {rings.map((x) => (
        <g key={x}>
          <circle cx={x} cy={85} r={9} strokeWidth={3} className="v-svg-stroke-blue" />
          <text x={x} y={120} textAnchor="middle" fontSize={12} className="v-svg-ink">
            {reviews.review}
          </text>
        </g>
      ))}
      <path d="M250 74 Q 200 20 160 74" strokeWidth={2} strokeDasharray="5 4" className="v-svg-stroke-loss" />
      <text x={205} y={30} textAnchor="middle" fontSize={12} className="v-svg-ink">
        {reviews.missed}
      </text>
      <text x={550} y={18} textAnchor="end" fontSize={11} fontWeight={600} className="v-svg-ink">
        {reviews.illustration}
      </text>
    </svg>
  );
}

export default async function HowItWorksPage() {
  const viewer = await siteViewer();
  return (
    <div data-page="how-it-works">
      <header className="v-wrap v-section tight v-stack">
        <p className="v-eyebrow">{howItWorks.eyebrow}</p>
        <h1 className="page-h1 v-page-title" tabIndex={-1}>
          {howItWorks.h1}
        </h1>
        <p className="v-lede">
          <Rich>{howItWorks.lede}</Rich>
        </p>
      </header>

      <section className="v-wrap" aria-label="The four moves" data-site-section="moves">
        <HowMoves />
      </section>

      <section className="v-section v-rule-top" aria-labelledby="workspace-h" data-site-section="workspace">
        <div className="v-wrap">
          <SectionHead title={howItWorks.workspace.h2} id="workspace-h" />
          <WorkspaceMock />
        </div>
      </section>

      <ColourLanguage eyebrow={home.colours.eyebrow} title={home.colours.h2} body={howItWorks.colourBody} headingId="colours-h" />

      <section className="v-section" aria-labelledby="reviews-h" data-site-section="reviews">
        <div className="v-wrap">
          <SectionHead title={howItWorks.reviews.h2} id="reviews-h" />
          <ReviewsIllustration />
        </div>
      </section>

      <section className="v-section v-rule-top" aria-labelledby="path-h" id="path" data-site-section="path">
        <div className="v-wrap">
          <SectionHead eyebrow={howItWorks.path.eyebrow} title={howItWorks.path.h2} id="path-h" />
          <div className="v-path">
            <div className="v-stack">
              <h3 className="v-h3">{howItWorks.path.core}</h3>
              <ol className="v-core">
                {COURSE.core.map((topic) => (
                  <li key={topic.n}>
                    <span className="n">{topic.n}</span>
                    <span>{topic.title}</span>
                    <span className="min">{howItWorks.path.minutes(topic.min)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="v-stack">
              <h3 className="v-h3">{howItWorks.path.subjects}</h3>
              <ul className="v-counts">
                {COURSE.subjects.map((subject) => (
                  <li key={subject.name}>
                    <span>{subject.name}</span>
                    <span className="tabular">{subject.count}</span>
                  </li>
                ))}
              </ul>
              <h3 className="v-h3">{howItWorks.path.stages}</h3>
              <ul className="v-counts">
                {COURSE.stages.map((stage) => (
                  <li key={stage.name}>
                    <span>
                      <strong>{stage.name}</strong>, {stage.line}
                    </span>
                    <span className="tabular">{stage.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="v-section v-wash" aria-labelledby="start-h" data-site-section="closing">
        <div className="v-wrap v-stack">
          <h2 className="v-h2" id="start-h">
            {howItWorks.closing}
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
