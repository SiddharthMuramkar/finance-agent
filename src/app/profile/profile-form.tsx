"use client";

import { useState, type FormEvent } from "react";
import { PROFILE_FIELDS, PROFILE_MAX_CHARS, type ProfileField } from "@/learner/profile";
import Link from "next/link";
import { PrimaryButton, secondaryButtonClass } from "../ui";

export type ProfileValues = Record<ProfileField, string>;

/**
 * What the Learner is told about the profile, on the Welcome and in Settings. A change reaches the Tutor
 * with the Learner's next message (a new Where the Learner stands block), so nothing waits for a new Session.
 */
export const PROFILE_PRIVACY =
  "This is private. The Tutor is given it with your messages, and it is kept in your Session's record. The Tutor uses it only when you ask how an idea applies to you, never as advice.";

const inputClass =
  "mt-1 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm leading-5 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

/** The four optional questions, each limited to 200 characters. Pure markup, so it renders the same on the server. */
export function ProfileFields({ values, onChange, idPrefix = "profile" }: { values: ProfileValues; onChange?: (key: ProfileField, value: string) => void; idPrefix?: string }) {
  return (
    <div className="measure space-y-3">
      {PROFILE_FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={`${idPrefix}-${f.key}`} className="text-sm font-medium leading-5">
            {f.label} <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-${f.key}`}
            name={f.key}
            type="text"
            maxLength={PROFILE_MAX_CHARS}
            value={values[f.key]}
            onChange={(e) => onChange?.(f.key, e.target.value)}
            aria-describedby={`${idPrefix}-${f.key}-hint`}
            className={inputClass}
          />
          <p id={`${idPrefix}-${f.key}-hint`} className="mt-0.5 text-xs leading-4 text-[var(--muted)]">
            {f.hint}
          </p>
        </div>
      ))}
    </div>
  );
}

export async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (res.ok) return null;
  const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
  return error ?? `Could not save (${res.status}).`;
}

/**
 * Saves the profile. "page" is About you on Settings, which only saves. "welcome" is the Welcome's About you
 * panel: Next saves the answers and goes on to `next`; Skip, a plain link, goes there too and saves nothing.
 */
export function ProfileForm({ initial, mode, next = "/study" }: { initial: ProfileValues; mode: "page" | "welcome"; next?: string }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const failed = await send("/api/profile", "PUT", values);
    setError(failed);
    if (!failed && mode === "welcome") {
      // A full load of the next Welcome panel.
      window.location.assign(next);
      return;
    }
    setStatus(failed ? "idle" : "saved");
  };

  return (
    <form onSubmit={save} className="text-sm">
      <ProfileFields values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} idPrefix={`profile-${mode}`} />
      <div className={`${mode === "welcome" ? "mt-6" : "mt-4"} flex items-center gap-2`}>
        <PrimaryButton type="submit" disabled={status === "saving"}>
          {mode === "welcome" ? "Next" : "Save"}
        </PrimaryButton>
        {mode === "welcome" && (
          <Link href={next} className={secondaryButtonClass}>
            Skip
          </Link>
        )}
        <p role="status" aria-live="polite" className="text-xs leading-4 text-[var(--muted)]">
          {status === "saved" ? "Saved. The Tutor sees it from your next message." : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
}
