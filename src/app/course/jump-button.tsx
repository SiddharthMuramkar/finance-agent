"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { PrimaryButton, SecondaryButton } from "../ui";

/** A full page load, so the workspace's server page re-reads the saved place. */
function openWorkspace() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is wanted here
  window.location.assign("/study");
}

/** Chooses a Topic (null: back to the default path), or what comes next. Null when it worked, else what went wrong. */
async function post(choice: { topicId: string | null } | { next: true }): Promise<string | null> {
  const res = await fetch("/api/jump", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) });
  if (res.ok) return null;
  const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
  return error ?? `Could not change Topic (${res.status}).`;
}

/** Chooses a Topic (or opens the current one), then opens the Study Workspace. Null when it worked, else what went wrong. */
async function choose(choice: { topicId: string } | { next: true }): Promise<string | null> {
  const failed = await post(choice);
  if (!failed) openWorkspace();
  return failed;
}

/** A Topic as the Course Map names it. */
export type TopicRef = { id: string; title: string };

/**
 * The prerequisite warning. Filling the gap is the easy path: the main button studies the first unpassed
 * prerequisite, then Go ahead anyway, then Not now. A labelled group, not a modal dialog: focus moves to the
 * main button when it appears, and Escape cancels.
 */
export function PrerequisiteConfirm({
  title,
  unmet,
  onStudyFirst,
  onGo,
  onCancel,
}: {
  title: string;
  unmet: TopicRef[];
  onStudyFirst: (topicId: string) => void;
  onGo: () => void;
  onCancel: () => void;
}) {
  const first = unmet[0];
  return (
    <div
      role="group"
      aria-label={`Prerequisites for ${title}`}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="relative z-10 mt-2 rounded border border-[var(--src-line)] bg-[var(--src-tint)] p-3 text-xs leading-4"
    >
      <p>
        {title} builds on {unmet.map((u) => u.title).join(", ")}, which you have not passed yet. You can fill the gap first, or go ahead anyway.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PrimaryButton autoFocus data-study-first={first.id} onClick={() => onStudyFirst(first.id)} className="!px-2 !py-1 text-xs">
          Study {first.title} first
        </PrimaryButton>
        <SecondaryButton onClick={onGo} className="!px-2 !py-1 text-xs">
          Go ahead anyway
        </SecondaryButton>
        <SecondaryButton onClick={onCancel} className="!px-2 !py-1 text-xs">
          Not now
        </SecondaryButton>
      </div>
    </div>
  );
}

/** A link stretched over its whole row; the row's other links and the warning sit above it. */
const STRETCHED = "before:absolute before:inset-0 before:content-['']";

/**
 * One Topic row on the Course Map: a single whole-row link (the Topic's title, stretched over the row).
 * - passed: opens the Topic's Session read-only at `href`;
 * - current: opens the current Topic;
 * - choose: chooses the Topic, after the prerequisite warning when some are unpassed.
 */
export function TopicRow({
  topicId,
  title,
  mode,
  href = "/study",
  unmet = [],
  lead,
  children,
}: {
  topicId: string;
  title: string;
  mode: "passed" | "current" | "choose";
  href?: string;
  unmet?: TopicRef[];
  lead?: ReactNode;
  children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const wasAsking = useRef(false);
  // Keyboard and screen-reader users keep their place: when the warning closes, focus goes back to the row link.
  useEffect(() => {
    if (wasAsking.current && !asking) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const go = async (choice: { topicId: string } | { next: true }) => setError(await choose(choice));
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (mode === "passed") return;
    e.preventDefault();
    if (mode === "current") void go({ next: true });
    else if (unmet.length) setAsking(true);
    else void go({ topicId });
  };
  return (
    <li data-topic={topicId} className="relative flex gap-3 border-b border-[var(--hairline)] px-1 py-3 hover:bg-[var(--field)]">
      {lead}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium leading-5">
          <a ref={trigger} href={href} data-row-link={topicId} onClick={onClick} className={`${STRETCHED} hover:underline`}>
            {title}
          </a>
        </h3>
        {children}
        {asking && (
          <PrerequisiteConfirm title={title} unmet={unmet} onStudyFirst={(id) => void go({ topicId: id })} onGo={() => void go({ topicId })} onCancel={() => setAsking(false)} />
        )}
        {error && <p className="relative z-10 mt-1 text-xs text-[var(--danger)]">{error}</p>}
      </div>
    </li>
  );
}

/** "Do first: <title>": a link inside a Topic row that chooses that prerequisite and opens it. */
export function DoFirstLink({ topicId, title }: { topicId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <a
        href="/study"
        data-jump={topicId}
        onClick={async (e: MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault();
          setError(await choose({ topicId }));
        }}
        className="relative z-10 text-[var(--brand)] underline"
      >
        {title}
      </a>
      {error && <span className="relative z-10 ml-1 text-[var(--danger)]">{error}</span>}
    </>
  );
}

/** Goes back to the default path. The chosen Topic keeps its progress. */
export function BackToPathButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <SecondaryButton
        data-back-to-path
        onClick={async () => {
          const failed = await post({ topicId: null });
          if (failed) setError(failed);
          else openWorkspace();
        }}
        className="mt-2 !px-2 !py-1 text-xs"
      >
        Back to the default path
      </SecondaryButton>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}

/**
 * What comes next: opens the Learner's current Topic (the Course Navigator's place), whose Session shows at
 * once. After a Topic passed in a turn, this is how the Learner leaves it. Refused while a turn is running.
 */
export function WhatComesNextButton({ label }: { label: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PrimaryButton
        data-what-comes-next
        onClick={async () => {
          const failed = await post({ next: true });
          if (failed) setError(failed);
          else openWorkspace();
        }}
      >
        {label} →
      </PrimaryButton>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}
