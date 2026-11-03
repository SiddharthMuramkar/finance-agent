"use client";

import { useState, type FormEvent } from "react";
import { PROFILE_FIELDS, PROFILE_MAX_CHARS, type ProfileField } from "@/learner/profile";
import { Card, Eyebrow, PrimaryButton, SecondaryButton } from "../ui";

export type ProfileValues = Record<ProfileField, string>;

/** What the Learner is told about the profile, in both the card and the edit page. */
export const PROFILE_PRIVACY =
  "This is private. It is given to the Tutor when a Session starts, and kept in that Session's record. The Tutor uses it only to choose everyday examples, never as advice. If you change it, the change applies from your next Session.";

const inputClass =
  "mt-1 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm leading-5 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

/** The four optional questions, each limited to 200 characters. Pure markup, so it renders the same on the server. */
export function ProfileFields({ values, onChange, idPrefix = "profile" }: { values: ProfileValues; onChange?: (key: ProfileField, value: string) => void; idPrefix?: string }) {
  return (
    <div className="space-y-3">
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
 * Saves the profile. "card" is the first-visit offer (Save and Not now; it hides itself afterwards);
 * "page" is the edit page ("About you"), which only saves.
 */
export function ProfileForm({ initial, mode }: { initial: ProfileValues; mode: "card" | "page" }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "gone">("idle");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const failed = await send("/api/profile", "PUT", values);
    setError(failed);
    setStatus(failed ? "idle" : mode === "card" ? "gone" : "saved");
  };
  const notNow = async () => {
    setStatus("saving");
    const failed = await send("/api/profile/dismiss", "POST");
    setError(failed);
    setStatus(failed ? "idle" : "gone");
  };

  if (status === "gone") return null;
  const form = (
    <form onSubmit={save} className="text-sm">
      <ProfileFields values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} idPrefix={`profile-${mode}`} />
      <div className="mt-4 flex items-center gap-2">
        <PrimaryButton type="submit" disabled={status === "saving"}>
          Save
        </PrimaryButton>
        {mode === "card" && (
          <SecondaryButton onClick={() => void notNow()} disabled={status === "saving"}>
            Not now
          </SecondaryButton>
        )}
        <p role="status" aria-live="polite" className="text-xs leading-4 text-[var(--muted)]">
          {status === "saved" ? "Saved. It applies from your next Session." : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
  if (mode === "page") return form;
  return (
    <Card data-profile-card className="mb-4 max-h-[60dvh] overflow-y-auto">
      <Eyebrow className="mb-1">About you</Eyebrow>
      <p className="mb-3 text-sm leading-5">Share a little about your life if you like, so the Tutor can pick examples that fit you. Every answer is optional.</p>
      <p className="mb-3 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
      {form}
    </Card>
  );
}
