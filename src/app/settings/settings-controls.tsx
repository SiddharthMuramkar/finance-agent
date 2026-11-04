"use client";

import { useState } from "react";
import { send } from "../profile/profile-form";
import { THEMES, THEME_LABEL, THEME_SWATCH, type DayTheme, type NightTheme, type ThemeId, type ThemePref } from "../theme";
import { followSystem, pinTheme, setThemePref, useThemeState } from "../theme-store";
import { PrimaryButton, SecondaryButton } from "../ui";

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
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
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
 * Start over as a new learner: a button that first asks for confirmation, then posts a plain form to
 * /api/start-over, whose 303 opens the Welcome as the fresh Learner.
 */
export function StartOverButton({ confirmValue }: { confirmValue: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <SecondaryButton onClick={() => setAsking(true)}>Start over as a new learner</SecondaryButton>;
  return (
    <div role="alertdialog" aria-labelledby="start-over-question" className="rounded-lg border border-[var(--border)] p-4 text-sm">
      <p id="start-over-question" className="font-medium leading-5">
        Start over as a new learner?
      </p>
      <p className="mt-1 leading-5 text-[var(--muted)]">
        You begin again at the Welcome with no progress, Notes or Sessions. Nothing is deleted: your current progress is kept, but you won&rsquo;t see it here again.
        Any other device signed in as you is signed out.
      </p>
      <form action="/api/start-over" method="post" className="mt-3 flex items-center gap-2">
        <input type="hidden" name="confirm" value={confirmValue} />
        <PrimaryButton type="submit">Yes, start over</PrimaryButton>
        <SecondaryButton onClick={() => setAsking(false)}>Cancel</SecondaryButton>
      </form>
    </div>
  );
}

/** One option of a radio group: a real radio button, hidden but focusable, and a tile that shows its state. */
function Choice({ name, label, checked, onPick, children }: { name: string; label: string; checked: boolean; onPick: () => void; children?: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onPick} className="peer sr-only" />
      <span className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm leading-5 peer-checked:border-[var(--brand)] peer-checked:ring-1 peer-checked:ring-[var(--brand)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
        {children}
        {label}
      </span>
    </label>
  );
}

/** A theme's preview tile: its page colour, a line of its text colour and a dot of its brand colour, drawn from the swatch map. */
function Tile({ theme }: { theme: ThemeId }) {
  const { bg, ink, brand } = THEME_SWATCH[theme];
  return (
    <span aria-hidden="true" data-testid={`tile-${theme}`} className="flex h-8 w-12 shrink-0 items-center gap-1 rounded border border-[var(--border)] px-1.5" style={{ backgroundColor: bg }}>
      <span className="h-1 flex-1 rounded-full" style={{ backgroundColor: ink }} />
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand }} />
    </span>
  );
}

function ThemeGroup({ legend, name, options, value, onPick }: { legend: string; name: string; options: readonly ThemeId[]; value: ThemeId | null; onPick: (t: ThemeId) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium leading-5">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((t) => (
          <Choice key={t} name={name} label={THEME_LABEL[t]} checked={value === t} onPick={() => onPick(t)}>
            <Tile theme={t} />
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The Appearance section: Match my Mac (with a day theme and a night theme) or one theme always. It reads and writes the
 * same store as the header's Theme menu, so a pick in either shows in the other at once. Saved per browser, in the cookie.
 */
export function AppearanceSettings({ initial }: { initial: ThemePref }) {
  const { pref, pair, theme } = useThemeState(initial);
  const following = pref.mode === "system";
  return (
    <div className="space-y-4 text-sm">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium leading-5">Theme</legend>
        <div className="flex flex-wrap gap-2">
          <Choice name="theme-mode" label="Match my Mac" checked={following} onPick={followSystem} />
          <Choice name="theme-mode" label="Always use one theme" checked={!following} onPick={() => pinTheme(theme ?? pair.day)} />
        </div>
      </fieldset>
      {pref.mode === "system" ? (
        <>
          <ThemeGroup legend="Day theme" name="theme-day" options={["light", "paper"]} value={pref.day} onPick={(t) => setThemePref({ ...pref, day: t as DayTheme })} />
          <ThemeGroup legend="Night theme" name="theme-night" options={["midnight", "forest"]} value={pref.night} onPick={(t) => setThemePref({ ...pref, night: t as NightTheme })} />
        </>
      ) : (
        <ThemeGroup legend="Theme to use" name="theme-one" options={THEMES} value={pref.theme} onPick={pinTheme} />
      )}
    </div>
  );
}
