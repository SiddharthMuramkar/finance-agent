import type { ReactNode } from "react";
import { SUBJECTS } from "@/course/outline";
import { aboutCopy } from "./about-copy";
import { HomeFooter, HomeHeader, JoinBand } from "./chrome";
import { LiveWidget } from "./live-widget";
import type { BuiltShowcase } from "./showcase-widgets";
import type { LandingStats } from "./stats";

/**
 * The About page. The counts and the two Widgets are built from files, and the page calls no model. `signedIn` is the
 * only thing it knows about the visitor (spec 2026-11-12 G1, E11): signed in, the header offers the Study Workspace and
 * Sign out and the closing band opens the Study Workspace; signed out, both offer Join early access. Its opening is a
 * Band (F1), the first of its two: the closing band is the other, and the sections between keep them apart.
 */
export function AboutView({ stats, widgets, signedIn = false }: { stats: Pick<LandingStats, "topics" | "subjects">; widgets: BuiltShowcase[]; signedIn?: boolean }) {
  return (
    <div className="home">
      <HomeHeader current="about" signIn={signedIn ? "learner" : undefined} />
      <main>
        <section data-band="about-opening" className="band">
          <div className="home-wrap pb-[clamp(48px,6vw,80px)] pt-[clamp(48px,7vw,96px)]">
            <h1 className="home-display max-w-[34em] text-[clamp(40px,4.4vw,56px)] leading-[1.05] tracking-[-0.03em] max-sm:text-[36px] [text-wrap:balance]">
              {aboutCopy.title}
            </h1>
            <Prose>
              <p className="home-lede mt-5">{aboutCopy.lede}</p>
            </Prose>
          </div>
        </section>

        <Section title={aboutCopy.what.title}>
          <Prose>
            {aboutCopy.what.lines.map((line) => (
              <p key={line} className="home-body mt-4">{line}</p>
            ))}
          </Prose>
        </Section>

        <Section title={aboutCopy.how.title}>
          <Prose>
            <p className="home-body mt-4">{aboutCopy.how.intro}</p>
            <ol className="mt-6 list-none p-0">
              {aboutCopy.how.steps.map((step) => (
                <li key={step.name} className="mt-4">
                  <h3 className="home-h3">{step.name}</h3>
                  <p className="home-body mt-1">{step.line}</p>
                </li>
              ))}
            </ol>
            {aboutCopy.how.after.map((line) => (
              <p key={line} className="home-body mt-4">{line}</p>
            ))}
          </Prose>
        </Section>

        <Section title={aboutCopy.widgets.title}>
          <Prose>
            {aboutCopy.widgets.lines.map((line) => (
              <p key={line} className="home-body mt-4">{line}</p>
            ))}
          </Prose>
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {widgets.map((widget) => (
              <div key={widget.id}>
                <p className="home-eyebrow mb-3">{aboutCopy.widgets.caption}</p>
                <LiveWidget code={widget.code} testId="about-widget" />
              </div>
            ))}
          </div>
        </Section>

        <Section title={aboutCopy.facts.title}>
          <Prose>
            {aboutCopy.facts.lines.map((line) => (
              <p key={line} className="home-body mt-4">{line}</p>
            ))}
          </Prose>
        </Section>

        <Section title={aboutCopy.learn.title}>
          <Prose>
            <p className="home-body mt-4">{aboutCopy.learn.line(stats)}</p>
            <ul className="home-body mt-4 list-disc pl-5">
              {SUBJECTS.map((subject) => (
                <li key={subject}>{subject}</li>
              ))}
            </ul>
            <p className="home-body mt-4">{aboutCopy.learn.stages}</p>
          </Prose>
        </Section>

        <Section title={aboutCopy.not.title}>
          <Prose>
            {aboutCopy.not.lines.map((line) => (
              <p key={line} className="home-body mt-4">{line}</p>
            ))}
          </Prose>
        </Section>

        <Section title={aboutCopy.faq.title}>
          <Prose>
            <dl className="mt-4">
              {aboutCopy.faq.items.map((item) => (
                <div key={item.q} className="mt-4">
                  <dt className="home-h3">{item.q}</dt>
                  <dd className="home-body mt-1">
                    <p>{item.a}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </Prose>
        </Section>

        <JoinBand button={signedIn ? { kind: "open" } : undefined} />
      </main>
      <HomeFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="home-wrap home-section">
      <hr className="home-rule" />
      <h2 className="home-h2 pt-10">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One block of running text, capped at the reading measure (34em). `data-about-prose` marks it for the browser's
 * line-length check (`[data-about-prose] p`); the Widgets and their captions sit outside every such block.
 */
function Prose({ children }: { children: ReactNode }) {
  return (
    <div data-about-prose className="max-w-[34em]">
      {children}
    </div>
  );
}
