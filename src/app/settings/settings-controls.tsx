"use client";

import { useState } from "react";
import { send } from "../profile/profile-form";
import { THEMES, THEME_LABEL, THEME_SWATCH, type ThemeId } from "../theme";
import { setTheme, useTheme } from "../theme-store";
import { Button, SecondaryButton } from "../ui";

/** The Show developer details switch: saved at once, for this Learner on every device. */
export function DeveloperDetailsSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setOn(next);
    setSaving(true);
    const failed = await send("/api/settings", "PUT", { showDeveloperDetails: next });
    setSaving(false);
    setError(failed);
    if (failed) setOn(!next);
  };

  return (
    <div className="text-sm">
      <label className="flex items-start gap-2 leading-5">
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={(e) => void change(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Show developer details
          <span className="block text-xs leading-4 text-[var(--muted)]">
            Adds an &ldquo;Under the hood&rdquo; line under each Tutor reply: the model, the steps, tokens, time and cost.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Start over as a new learner: an outline danger button (the Settings danger zone) that first asks for confirmation, then
 * posts a plain form to /api/start-over, whose 303 opens the Welcome as the fresh Learner.
 */
export function StartOverButton({ confirmValue }: { confirmValue: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button variant="secondary" className="btn-danger-outline" onClick={() => setAsking(true)}>
        Start over as a new learner
      </Button>
    );
  return (
    <div role="alertdialog" aria-labelledby="start-over-question" className="rounded-xl border border-[var(--line)] bg-[var(--wash)] p-4 text-sm">
      <p id="start-over-question" className="font-medium leading-5">
        Start over as a new learner?
      </p>
      <p className="mt-1 leading-5 text-[var(--muted)]">
        You begin again at the Welcome with no progress, Notebook or Sessions. Nothing is deleted: your current progress is kept, but you won&rsquo;t see it here again.
        Any other device signed in as you is signed out.
      </p>
      <form action="/api/start-over" method="post" className="mt-3 flex items-center gap-2">
        <input type="hidden" name="confirm" value={confirmValue} />
        <Button variant="danger" type="submit">
          Yes, start over
        </Button>
        <SecondaryButton onClick={() => setAsking(false)}>Cancel</SecondaryButton>
      </form>
    </div>
  );
}

/**
 * One option of a radio group: a real, visible radio button inside a 44px row that shows its state (an accent border,
 * an inner accent line and an accent tint when checked). The row is a label, so it may show a pointer.
 */
function Choice({ name, label, checked, onPick, children }: { name: string; label: string; checked: boolean; onPick: () => void; children?: React.ReactNode }) {
  return (
    <label data-allow-pointer className="cursor-pointer">
      <span className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium leading-5 text-[var(--ink)] transition-[background-color,border-color,box-shadow] duration-[var(--dur-ui)] ease-[var(--ease-out)] [&:not(:has(:checked)):hover]:bg-[var(--wash)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-tint)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--accent)]">
        <input type="radio" name={name} checked={checked} onChange={onPick} className="shrink-0" />
        {children}
        {label}
      </span>
    </label>
  );
}

/** A theme's preview tile: its paper, two lines of its ink and a bar of its accent, drawn from the swatch map. */
function Tile({ theme }: { theme: ThemeId }) {
  const { paper, ink, accent } = THEME_SWATCH[theme];
  return (
    <span
      aria-hidden="true"
      data-testid={`tile-${theme}`}
      className="flex h-8 w-12 shrink-0 flex-col justify-center gap-1 rounded-md border border-[var(--line)] px-1.5"
      style={{ backgroundColor: paper }}
    >
      <span className="h-0.5 w-7" style={{ backgroundColor: ink }} />
      <span className="h-0.5 w-5" style={{ backgroundColor: ink }} />
      <span className="h-1.5 w-4 rounded-xs" style={{ backgroundColor: accent }} />
    </span>
  );
}

/**
 * The Appearance section: two radios, Light and Dark. It reads and writes the same store as the header's theme toggle,
 * so a pick in either shows in the other at once. Saved per browser, in the cookie.
 */
export function AppearanceSettings({ initial }: { initial: ThemeId }) {
  const theme = useTheme(initial);
  return (
    <fieldset className="text-sm">
      <legend className="mb-2 font-medium">Theme</legend>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => (
          <Choice key={t} name="theme" label={THEME_LABEL[t]} checked={theme === t} onPick={() => setTheme(t)}>
            <Tile theme={t} />
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}
