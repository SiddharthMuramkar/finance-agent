import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseData } from "@/case-data/case-data";

// What the Widget harness reads from disk (server only). Kept apart from page.tsx, which may export only the page.

const root = () => join(process.cwd(), "src/widgets/fixtures");

/** The fixture folders, in the order the index lists them: the audit programs, then the parts once they exist. */
const GROUPS = ["audit", "parts"] as const;

/** Where the Case Data JSON for the fixtures is read from; set UX_CASE_DATA_DIR to point elsewhere. It is never in git. */
const caseDataDir = () => process.env.UX_CASE_DATA_DIR ?? "/Users/siddharth/Desktop/finance-agent-ux-report/fixtures/case-data";

const bare = (file: string) => file.replace(/\.openui$/, "");

/** Every fixture file, as "audit/01-sensex-milestones.openui". */
export function fixtureList(): string[] {
  return GROUPS.flatMap((group) => {
    const dir = join(root(), group);
    return existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".openui"))
          .sort()
          .map((f) => `${group}/${f}`)
      : [];
  });
}

/** The fixture a `fixture` parameter names: "01-sensex-milestones", with or without ".openui" or its folder. Undefined if none. */
export function resolveFixture(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const wanted = bare(name);
  return fixtureList().find((f) => bare(f) === wanted || bare(f.slice(f.indexOf("/") + 1)) === wanted);
}

/** The program a listed fixture holds. */
export const readFixture = (fixture: string) => readFileSync(join(root(), fixture), "utf8");

/** Every Case's JSON in the Case Data folder; none when the folder is missing. */
export function loadCases(): CaseData[] {
  const dir = caseDataDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(dir, f), "utf8")) as CaseData];
      } catch {
        return [];
      }
    });
}

/** The `state` parameter: JSON of slider values by name. Anything else means none. */
export function parseState(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const numbers = Object.entries(value).filter((e): e is [string, number] => typeof e[1] === "number");
    return numbers.length ? Object.fromEntries(numbers) : undefined;
  } catch {
    return undefined;
  }
}
