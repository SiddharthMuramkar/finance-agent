"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Button, PrimaryButton, SecondaryButton } from "../ui";

/** A warning triangle (Lucide geometry, stroke 1.75) before the prerequisite warning. Decorative: the sentence says it. */
function WarningMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mt-px h-4 w-4 shrink-0 text-[var(--warning)]">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** A full page load, so the workspace's server page re-reads the saved place. */
export function openWorkspace() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is wanted here
  window.location.assign("/study");
}

/** Chooses a Topic (null: back to the default path), or what comes next. Null when it worked, else what went wrong. */
export async function chooseTopic(choice: { topicId: string | null } | { next: true }): Promise<string | null> {
  const res = await fetch("/api/jump", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) });
  if (res.ok) return null;
  const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
  return error ?? `Could not change Topic (${res.status}).`;
}

/** Chooses a Topic (or opens the current one), then opens the Study Workspace. Null when it worked, else what went wrong. */
async function choose(choice: { topicId: string } | { next: true }): Promise<string | null> {
  const failed = await chooseTopic(choice);
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
      className="relative z-10 mt-3 rounded-lg border border-[var(--line)] bg-[var(--warning-tint)] p-3 text-[13px] leading-[18px]"
    >
      <p className="flex gap-2">
        <WarningMark />
        <span>
          {title} builds on {unmet.map((u) => u.title).join(", ")}, which you have not passed yet. You can fill the gap first, or go ahead anyway.
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton autoFocus size="sm" data-study-first={first.id} onClick={() => onStudyFirst(first.id)}>
          Study {first.title} first
        </PrimaryButton>
        <SecondaryButton size="sm" onClick={onGo}>
          Go ahead anyway
        </SecondaryButton>
        <Button variant="tertiary" size="sm" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/** A link stretched over its whole row; the row's other links and the warning sit above it. */
const STRETCHED = "before:absolute before:inset-0 before:content-['']";

/**
 * One Topic row on the Course Map: a single whole-row link (the Topic's title, stretched over the row) under a hairline.
 * - passed: opens the Topic's Session read-only at `href`;
 * - current: opens the current Topic; the page's one active row (an accent line above, an accent tint, aria-current);
 * - choose: chooses the Topic, after the prerequisite warning when some are unpassed.
 */
export function TopicRow({
  topicId,
  title,
  mode,
  href = "/study",
  unmet = [],
  status,
  lead,
  children,
}: {
  topicId: string;
  title: string;
  mode: "passed" | "current" | "choose";
  href?: string;
  unmet?: TopicRef[];
  /** The Topic's status, kept on the card as data-status. */
  status?: string;
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
    <li
      data-topic={topicId}
      data-status={status}
      className={`relative flex gap-3 border-t px-3 pb-4 pt-3 transition-colors duration-[var(--dur-ui)] ${mode === "current" ? "border-[var(--accent-fill)] bg-[var(--accent-tint)] shadow-[inset_0_1px_0_var(--accent-fill)]" : "border-[var(--rule)] hover:bg-[var(--wash)]"}`}
    >
      {lead}
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-medium leading-[22px]">
          <a
            ref={trigger}
            href={href}
            data-affordance="link"
            data-row-link={topicId}
            aria-current={mode === "current" ? "location" : undefined}
            onClick={onClick}
            className={`link ${STRETCHED}`}
          >
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

/**
 * "Do first: <title>": a link inside a Topic row that chooses that prerequisite and opens it. The Topic
 * Start card uses it too, reading `label` ("Study it first") in place of the title.
 */
export function DoFirstLink({ topicId, title, label }: { topicId: string; title: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <a
        href="/study"
        data-affordance="link"
        data-jump={topicId}
        aria-busy={busy || undefined}
        onClick={async (e: MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const failed = await choose({ topicId });
          setError(failed);
          if (failed) setBusy(false);
        }}
        className={`link relative z-10 ${busy ? "opacity-60" : ""}`}
      >
        {busy ? "Opening…" : (label ?? title)}
      </a>
      {error && <span className="relative z-10 ml-1 text-[var(--danger)]">{error}</span>}
    </>
  );
}

/** Goes back to the default path. The chosen Topic keeps its progress. */
export function BackToPathButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        data-back-to-path
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const failed = await chooseTopic({ topicId: null });
          if (failed) {
            setError(failed);
            setBusy(false);
          } else openWorkspace();
        }}
        size="sm"
        className="mt-3"
      >
        Back to the default path
      </Button>
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
  // Busy from the press until the Study Workspace loads (or until the choice is refused).
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        data-what-comes-next
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const failed = await chooseTopic({ next: true });
          if (failed) {
            setError(failed);
            setBusy(false);
          } else openWorkspace();
        }}
      >
        {label} →
      </Button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}
