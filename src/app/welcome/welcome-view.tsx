import type { Topic } from "@/course/map";
import { STEP_NAMES, TEACHING_STEPS } from "@/course/navigator";
import { PROFILE_PRIVACY, ProfileForm } from "../profile/profile-form";
import { ButtonLink, Card, Eyebrow } from "../ui";
import { StartTopicButton } from "./start-topic-button";

/** The Welcome's three panels, in order. Each is its own address, so Next and Skip are plain links. */
export const WELCOME_PANELS = ["how-a-topic-works", "about-you", "first-topic"] as const;
export type WelcomePanel = (typeof WELCOME_PANELS)[number];

export const welcomeHref = (panel: WelcomePanel) => (panel === "how-a-topic-works" ? "/welcome" : `/welcome?panel=${panel}`);

/** Reads the panel from the address; anything else is the first panel. */
export function welcomePanel(value: string | string[] | undefined): WelcomePanel {
  return WELCOME_PANELS.find((p) => p === value) ?? "how-a-topic-works";
}

/** Skip always lands on the Your first Topic card. */
const SKIP = welcomeHref("first-topic");

function Buttons({ next }: { next: WelcomePanel }) {
  return (
    <div className="mt-6 flex items-center gap-2">
      <ButtonLink href={welcomeHref(next)}>Next</ButtonLink>
      <ButtonLink href={SKIP} variant="secondary">
        Skip
      </ButtonLink>
    </div>
  );
}

function HowATopicWorks() {
  return (
    <>
      <h2 className="text-xl font-semibold leading-7">How a Topic works</h2>
      <p className="mt-2 text-sm leading-5">Each Topic walks through the same kinds of Teaching Step:</p>
      <ol data-step-strip aria-label="Teaching Steps" className="mt-3 flex flex-wrap gap-1.5">
        {/* The seven kinds of Teaching Step, in the order a Topic meets them (the Course Navigator's). */}
        {TEACHING_STEPS.map((step) => (
          <li key={step} className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium leading-4">
            {STEP_NAMES[step]}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm leading-5">Concept → Your turn → Check repeats for each Check.</p>
      <p className="mt-2 text-sm leading-5">The Tutor talks on the left. Things you can move and try appear on the right.</p>
      <Buttons next="about-you" />
    </>
  );
}

function AboutYou() {
  return (
    <>
      <h2 className="text-xl font-semibold leading-7">About you</h2>
      <p className="mt-2 text-sm leading-5">Share a little about your life if you like, so the Tutor can pick examples that fit you. Every answer is optional.</p>
      <p className="mb-4 mt-2 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
      <ProfileForm mode="welcome" initial={{ work: "", location: "", loan: "", savingFor: "" }} next={SKIP} />
    </>
  );
}

function FirstTopic({ topic }: { topic: Pick<Topic, "id" | "title" | "youllLearn"> }) {
  return (
    <>
      <h2 className="text-xl font-semibold leading-7">Your first Topic</h2>
      <Card data-first-topic={topic.id} className="mt-4">
        <p className="text-base font-semibold leading-6">{topic.title}</p>
        {!!topic.youllLearn?.length && (
          <>
            <Eyebrow className="mb-1 mt-3">You&rsquo;ll learn</Eyebrow>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-5">
              {topic.youllLearn.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </>
        )}
        <StartTopicButton topicId={topic.id} />
      </Card>
    </>
  );
}

/**
 * The Welcome (spec #119, "Pages › Welcome"): what a new Learner sees before anything else. Three panels:
 * how a Topic works, About you (optional) and Your first Topic, whose Start this Topic opens it. Next and
 * Skip are links, and Skip always goes to the Your first Topic card. No model call.
 */
export function WelcomeView({ panel, firstTopic }: { panel: WelcomePanel; firstTopic: Pick<Topic, "id" | "title" | "youllLearn"> }) {
  return (
    <div className="mx-auto max-w-xl">
      <Eyebrow className="mb-2">
        Welcome · {WELCOME_PANELS.indexOf(panel) + 1} of {WELCOME_PANELS.length}
      </Eyebrow>
      {panel === "how-a-topic-works" && <HowATopicWorks />}
      {panel === "about-you" && <AboutYou />}
      {panel === "first-topic" && <FirstTopic topic={firstTopic} />}
    </div>
  );
}
