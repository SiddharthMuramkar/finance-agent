"use client";

import { useRef, useState } from "react";
import type { YourTopic } from "@/learner/your-topics";
import { RestartConfirm } from "../restart-confirm";
import { Button, Card, Tag } from "../ui";

const STATUS: Record<YourTopic["status"], string> = { in_progress: "In progress", passed: "Passed" };

function TopicRow({ topic }: { topic: YourTopic }) {
  const [confirming, setConfirming] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  return (
    <li data-your-topic={topic.id} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5">
          <span className="font-semibold">{topic.title}</span>
          <Tag tone={topic.status === "passed" ? "success" : "brand"}>{STATUS[topic.status]}</Tag>
        </p>
        <Button ref={start} variant="secondary" size="sm" aria-expanded={confirming} onClick={() => setConfirming(true)}>
          Start over
        </Button>
      </div>
      {confirming && (
        <RestartConfirm
          topicId={topic.id}
          onCancel={() => {
            setConfirming(false);
            start.current?.focus();
          }}
        />
      )}
    </li>
  );
}

/**
 * Settings → Your Topics (B3b): the Topics that have progress, in course order, each with its status and a Start over
 * Button that opens the same inline confirm as the Topic bar's ⋯ menu, on a hairline list. One of the Settings sections
 * (A5's your-topics slot, after About you), under an ink rule like the rest. `topics` comes from loadYourTopics.
 */
export function YourTopicsSection({ topics }: { topics: readonly YourTopic[] }) {
  return (
    <Card variant="rule" id="your-topics" aria-labelledby="your-topics-heading">
      {/* The same heading as the other Settings sections (settings-view.tsx). */}
      <h2 id="your-topics-heading" className="mb-3 [font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]">
        Your Topics
      </h2>
      {topics.length === 0 ? (
        <p className="measure text-sm leading-5 text-[var(--muted)]">Topics you start will appear here.</p>
      ) : (
        <>
          <p className="measure mb-2 text-sm leading-5">Start one Topic over without touching the others. Your Notebook keeps the old attempt.</p>
          <ul className="divide-y divide-[var(--rule)] border-b border-[var(--rule)]">
            {topics.map((t) => (
              <TopicRow key={t.id} topic={t} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
