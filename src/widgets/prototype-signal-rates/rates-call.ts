// PROTOTYPE (wayfinder #5, prototype A): throwaway. The server-side check of a Tutor's widget call for the Signal
// "rates" widget (spec §8.2). The Tutor sends JSON; this file decides what the widget is allowed to draw.
// Server only by convention: the dev page calls it in a Server Component and hands the result to the client.

import { z } from "zod/v4";
import { RANGES, RATES_DATASETS, round2, type RatesState } from "./rates-model";

export type RatesCall = {
  widget: "rates";
  dataset: string;
  mode: "full" | "compact";
  state: RatesState;
  illustration: boolean;
};

export type ClampResult = { ok: true; call: RatesCall; notes: string[] } | { ok: false; reason: string; notes: string[] };

/** The call envelope (§8.2). Unknown top-level keys are stripped (zod's default). */
const Envelope = z.object({
  widget: z.string(),
  dataset: z.string(),
  mode: z.enum(["full", "compact"]).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  illustration: z.boolean().optional(),
});

const Num = z.number(); // finite only: zod 4 rejects NaN and Infinity

function snap(x: number, r: { min: number; max: number; step: number }) {
  const c = Math.min(r.max, Math.max(r.min, x));
  return round2(Math.round((c - r.min) / r.step) * r.step + r.min);
}

/** Validate a raw Tutor call and clamp its state to the widget's ranges. Every change is written to notes. */
export function clampRatesCall(raw: unknown): ClampResult {
  const notes: string[] = [];
  const env = Envelope.safeParse(raw);
  if (!env.success) return { ok: false, reason: "The call is not a widget call object. Render nothing; the Tutor answers in text.", notes };
  const c = env.data;

  if (c.widget !== "rates") return { ok: false, reason: `Unknown widget "${c.widget}". Render nothing; the Tutor answers in text.`, notes };
  const ds = RATES_DATASETS[c.dataset];
  if (!ds || !ds.checked) return { ok: false, reason: `Dataset "${c.dataset}" is not a checked dataset. Render nothing.`, notes };

  const mode = c.mode ?? "compact";
  if (!c.mode) notes.push('mode missing: used "compact".');
  const illustration = c.illustration ?? false;

  const rawState = c.state ?? {};
  const state: RatesState = { ...ds.defaultState };
  for (const [key, value] of Object.entries(rawState)) {
    if (key !== "old" && key !== "new") {
      notes.push(`state.${key}: not a key of this widget, dropped.`);
      continue;
    }
    const n = Num.safeParse(value);
    if (!n.success) {
      notes.push(`state.${key}: ${JSON.stringify(value)} is not a finite number, dropped (default ${ds.defaultState[key]}).`);
      continue;
    }
    const v = snap(n.data, RANGES[key]);
    if (v !== n.data) notes.push(`state.${key}: ${n.data} clamped/snapped to ${v} (range ${RANGES[key].min} to ${RANGES[key].max}, step ${RANGES[key].step}).`);
    state[key] = v;
  }

  // Rule not in §8.2: the call asks "which describe the move", so the opening state must be a move.
  if (state.old === state.new) {
    notes.push(`state: old = new (${state.old}) is no move, so the call has nothing to ask. Used the dataset default ${ds.defaultState.old} -> ${ds.defaultState.new}.`);
    state.old = ds.defaultState.old;
    state.new = ds.defaultState.new;
  }

  return { ok: true, call: { widget: "rates", dataset: ds.id, mode, state, illustration }, notes };
}
