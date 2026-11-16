import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCourseMap } from "@/course/map";
import { casePage, cta } from "@/site/copy";
import { EXAMPLE_SLUGS, exampleBySlug, examplePath, neighbours, type Example } from "@/site/examples";
import { plain } from "@/site/rich";
import { siteViewer, type Viewer } from "@/site/viewer";
import { Button } from "../../../primitives";
import { Icon, Stamp } from "../../parts";
import { CaseFlow } from "./case-flow";

// A case page, at /examples/<slug> (spec 7.5, decision #7): one of the five examples, its story, question, live widget,
// the Tutor's answer after the learner's call, and the ending. The five slugs come from src/site/examples.ts, which the
// proxy reads too, so the gate and the page always agree; any other slug is a 404. Public: the copy is on the page and
// the widget draws in the browser, so a visitor costs no database read (/api/case-data stays closed to them).

export const dynamicParams = false;

export function generateStaticParams() {
  return EXAMPLE_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const example = exampleBySlug((await params).slug);
  return example ? { title: example.question, description: plain(example.hook) } : {};
}

/** Whether a member can open the example's Topic: it has a Topic file (else /api/open cannot open it). */
function topicWritten(example: Example): boolean {
  try {
    return !!loadCourseMap().topic(example.topicId);
  } catch (error) {
    console.error("The case page could not read the Course Map", error);
    return false;
  }
}

/** The foot's CTA by viewer state (7.5): Join, or open this Topic. */
function FootCta({ viewer, example }: { viewer: Viewer; example: Example }) {
  if (viewer.state === "visitor") {
    return (
      <Link href={cta.visitor.href} className="v-btn v-btn-primary" data-affordance="button" data-join="">
        {casePage.footCta.visitor}
      </Link>
    );
  }
  if (!topicWritten(example)) {
    return (
      <Link href="/course" className="v-btn v-btn-primary" data-affordance="button">
        {casePage.footCta.member}
      </Link>
    );
  }
  return (
    <form action="/api/open" method="post" className="v-btn-form">
      <input type="hidden" name="topic" value={example.topicId} />
      <Button type="submit" unstyled className="v-btn v-btn-primary">
        {casePage.footCta.member}
      </Button>
    </form>
  );
}

export default async function CasePage({ params }: Props) {
  const example = exampleBySlug((await params).slug);
  if (!example) notFound();
  const viewer = await siteViewer();
  const { previous, next } = neighbours(example.slug);

  return (
    <div data-page="case" data-site-section="case">
      <div className="v-wrap">
        <div className="v-case-top">
          <p>
            <Link href="/examples" className="v-tlink">
              <Icon name="back" />
              {casePage.all}
            </Link>
          </p>
          <p className="v-row" style={{ gap: 10 }}>
            <Stamp>{example.stamp}</Stamp>
            <span className="v-fine">{example.category}</span>
          </p>
          <h1 className="page-h1 v-page-title" tabIndex={-1}>
            {example.question}
          </h1>
          <CaseFlow example={example} />
        </div>

        <footer className="v-case-foot">
          <div className="v-row">
            <div>
              <p className="v-label">{casePage.fromTopic}</p>
              <p className="v-h3">{example.topic}</p>
            </div>
            <FootCta viewer={viewer} example={example} />
          </div>
          <nav className="v-pager" aria-label="More cases">
            <Link href={examplePath(previous.slug)} className="v-card v-linkcard" data-affordance="nav">
              <span className="v-fine">{casePage.previous}</span>
              <span>{previous.question}</span>
            </Link>
            <Link href={examplePath(next.slug)} className="v-card v-linkcard next" data-affordance="nav">
              <span className="v-fine">{casePage.next}</span>
              <span>{next.question}</span>
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
