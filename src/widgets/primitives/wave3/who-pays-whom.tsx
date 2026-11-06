"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// WhoPaysWhom: money moving between people. Each flow draws an arrow (300 ms) with its emoji riding along it; a tap on a
// flow replays it. The ordered list under the drawing ("The bank pays the saver: interest") is the screen-reader text.

const actorProps = z.object({ id: z.string(), emoji: z.string().describe("An emoji name for the actor"), name: z.string() });
const flowProps = z.object({
  from: z.string().describe("The id of the actor who pays"),
  to: z.string().describe("The id of the actor who is paid"),
  what: z.string().describe("What moves: at most 6 words"),
  emoji: z.string().describe("An emoji name for what moves, e.g. coin"),
});

export const whoPaysWhomProps = z.object({
  actors: z.array(actorProps).describe("2 to 4 actors"),
  flows: z.array(flowProps).describe("1 to 4 flows between the actors"),
});

type Props = z.infer<typeof whoPaysWhomProps>;
type Actor = z.infer<typeof actorProps>;

/** What is wrong with the drawing, in words, or null: a flow must join two actors that exist. */
export function flowProblem(actors: Actor[] | undefined, flows: Props["flows"] | undefined): string | null {
  if (!Array.isArray(actors) || actors.length < 2 || !Array.isArray(flows) || flows.length < 1) return "The picture is still arriving";
  const ids = new Set(actors.map((a) => a?.id));
  for (const f of flows) {
    if (!f || typeof f.what !== "string") return "A flow is still arriving";
    if (!ids.has(f.from) || !ids.has(f.to)) return "A flow names someone who is not in the picture";
  }
  return null;
}

/** "The bank pays the saver: interest" (a leading "The" on the one paid drops to lower case). */
const sentenceOf = (from: Actor, to: Actor, what: string) => `${from.name} pays ${to.name.replace(/^The /, "the ")}: ${what}`;

function Flow({ actors, flow }: { actors: Actor[]; flow: Props["flows"][number] }) {
  const reduced = usePrefersReducedMotion();
  const [run, setRun] = useState(0);
  const from = actors.find((a) => a.id === flow.from)!;
  const to = actors.find((a) => a.id === flow.to)!;
  const sentence = sentenceOf(from, to, flow.what);
  return (
    <Button
      variant="secondary"
      data-testid="flow"
      data-run={run}
      aria-label={`Replay: ${sentence}`}
      onClick={() => setRun((n) => n + 1)}
      className="w-full !justify-between gap-2 !px-3"
    >
      <span className="flex shrink-0 flex-col items-center">
        <Pic name={from.emoji} size={32} />
        <span className="text-xs font-semibold leading-4">{from.name}</span>
      </span>
      <span key={run} className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-1">
        <span className="relative flex h-8 w-full items-center justify-end" aria-hidden="true">
          <span className={`absolute inset-y-0 left-0 flex w-full items-center justify-end ${reduced ? "" : "flow-ride"}`}>
            <Pic name={flow.emoji} size={24} />
          </span>
        </span>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2 w-full" aria-hidden="true" fill="none">
          <path d="M0 5 H94" pathLength={1} strokeDasharray={1} className={reduced ? "" : "flow-draw"} stroke="var(--mint-ink)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          <path d="M88 1 L98 5 L88 9" stroke="var(--mint-ink)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="mt-1 text-center text-xs font-medium leading-4 text-[var(--mint-ink)]">{flow.what}</span>
      </span>
      <span className="flex shrink-0 flex-col items-center">
        <Pic name={to.emoji} size={32} />
        <span className="text-xs font-semibold leading-4">{to.name}</span>
      </span>
      <span data-testid="flow-replay" aria-hidden="true" className="flex shrink-0 flex-col items-center text-[var(--mint-ink)]">
        <span className="text-xl leading-5">↻</span>
        <span className="text-xs font-semibold leading-4">Replay</span>
      </span>
    </Button>
  );
}

export function WhoPaysWhomView({ actors, flows }: Props) {
  const reduced = usePrefersReducedMotion();
  const problem = flowProblem(actors, flows);
  if (problem) return <p data-testid="who-pays-whom-problem" className="py-2 text-sm text-[var(--muted)]">{problem}.</p>;
  const who = (id: string) => actors.find((a) => a.id === id)!;
  return (
    <section data-testid="who-pays-whom" data-motion={motionFlag(reduced)} aria-label="Who pays whom" className="@container py-1">
      <div className="flex flex-col gap-2">
        {flows.slice(0, 4).map((flow, i) => (
          <Flow key={i} actors={actors} flow={flow} />
        ))}
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">Tap a row to watch it again.</p>
      <ol className="mt-2 list-decimal pl-5 text-sm leading-6 text-[var(--ink)]">
        {flows.slice(0, 4).map((flow, i) => (
          <li key={i}>{sentenceOf(who(flow.from), who(flow.to), flow.what)}</li>
        ))}
      </ol>
    </section>
  );
}

export const WhoPaysWhom = defineComponent({
  name: "WhoPaysWhom",
  description:
    "Who pays whom: WhoPaysWhom(actors, flows). actors are 2 to 4 {id, emoji, name}; flows are 1 to 4 {from, to, what (at most 6 words), emoji} between actor ids. Each flow draws an arrow and replays on a tap.",
  props: whoPaysWhomProps,
  component: ({ props }: ComponentRenderProps<Props>) => <WhoPaysWhomView {...props} />,
});
