/**
 * A Widget's settings: the numbers the Learner has set on its sliders. Each slider is bound to a
 * `$variable` that the Widget's code declares with a starting number (`$rate = 5`); a saved Widget keeps
 * the current numbers of those variables, and reopens by writing them in place of the starting numbers.
 */

const DECLARATION = /^\$([A-Za-z_]\w*)[ \t]*=[ \t]*(-?\d+(?:\.\d+)?)[ \t]*$/gm;

/** The numeric `$variables` a Widget's code declares, with their starting numbers (keys keep the `$`). */
export function declaredSettings(code: string): Record<string, number> {
  return Object.fromEntries([...code.matchAll(DECLARATION)].map((m) => [`$${m[1]}`, Number(m[2])]));
}

/** The settings in a Renderer's state snapshot: its numeric `$variables`, nothing else. */
export function settingsFrom(snapshot: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(snapshot).filter(([k, v]) => k.startsWith("$") && typeof v === "number" && Number.isFinite(v)) as [string, number][]);
}

/** What the browser sent as a Widget's settings, cut down to the variables this code declares, as finite numbers. */
export function cleanSettings(code: string, raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const declared = declaredSettings(code);
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k, v]) => Object.hasOwn(declared, k) &&typeof v === "number" && Number.isFinite(v)) as [string, number][]);
}

/** The code with the saved numbers written in place of the starting ones. Unknown names are ignored. */
export function applySettings(code: string, settings: Record<string, number> | null | undefined): string {
  if (!settings) return code;
  return code.replace(DECLARATION, (line, name: string) => {
    const saved = settings[`$${name}`];
    return typeof saved === "number" && Number.isFinite(saved) ? `$${name} = ${saved}` : line;
  });
}
