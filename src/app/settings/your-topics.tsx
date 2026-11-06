"use client";

import { useState } from "react";
import type { YourTopic } from "@/learner/your-topics";
import { RestartConfirm } from "../restart-confirm";
import { Button, Card, Tag } from "../ui";

const STATUS: Record<YourTopic["status"], string> = { in_progress: "In progress", passed: "Passed" };

function TopicRow({ topic }: { topic: YourTopic }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li data-your-topic={topic.id} className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5">
          <span className="font-semibold">{topic.title}</span>
          <Tag tone={topic.status === "passed" ? "mint" : "brand"}>{STATUS[topic.status]}</Tag>
        </p>
        <Button variant="secondary" size="sm" aria-expanded={confirming} onClick={() => setConfirming(true)}>
          Start over
        </Button>
      </div>
      {confirming && <RestartConfirm topicId={topic.id} onCancel={() => setConfirming(false)} />}
    </li>
  );
}

/**
 * Settings → Your Topics (B3b): the Topics that have progress, in course order, each with its status and a Start over
 * Button that opens the same inline confirm as the Topic bar's ⋯ menu. One of the Settings card-grid's Cards (A5's
 * your-topics slot, after About you). `topics` comes from loadYourTopics.
 */
export function YourTopicsSection({ topics }: { topics: readonly YourTopic[] }) {
  return (
    <Card id="your-topics" aria-labelledby="your-topics-heading">
      <h2 id="your-topics-heading" className="mb-2 text-base font-semibold leading-6">
        Your Topics
      </h2>
      {topics.length === 0 ? (
        <p className="measure text-sm leading-5 text-[var(--muted)]">Topics you start will appear here.</p>
      ) : (
        <>
          <p className="measure mb-2 text-sm leading-5">Start one Topic over without touching the others. Your Notebook keeps the old attempt.</p>
          <ul className="divide-y divide-[var(--hairline)]">
            {topics.map((t) => (
              <TopicRow key={t.id} topic={t} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
