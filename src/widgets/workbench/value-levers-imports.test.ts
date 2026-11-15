import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Shared contract (ADR 0011: a site page mounts a widget's view, with no OpenUI): Home reuses ValueLeversView, so it renders without the OpenUI renderer. This walks the
// view's runtime imports inside src/ (type-only imports are erased) and fails on any @openuidev package or on the files
// that bring the renderer in.

const SRC = resolve(process.cwd(), "src");
const FORBIDDEN_FILES = ["app/widget-view.tsx", "widgets/library.tsx", "widgets/check.ts"];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

/** Every package and src/ file the module reaches at run time. */
function reach(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (m[2]) continue;
      const spec = m[3];
      const local = resolveImport(file, spec);
      if (local) queue.push(local);
      else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec);
    }
    for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
      const local = resolveImport(file, m[1]);
      if (local) queue.push(local);
      else packages.add(m[1]);
    }
  }
  return { files, packages };
}

describe("ValueLeversView renders without the OpenUI renderer (shared contract, Home reuses it)", () => {
  it("reaches no @openuidev package and none of the renderer's files", () => {
    const { files, packages } = reach(join(SRC, "widgets/workbench/value-levers-view.tsx"));
    expect(files.size).toBeGreaterThan(3);
    expect([...packages].filter((p) => p.startsWith("@openuidev"))).toEqual([]);
    const relative = [...files].map((f) => f.slice(SRC.length + 1));
    for (const f of FORBIDDEN_FILES) expect(relative).not.toContain(f);
  });

  it("the walk does find the renderer where it is: the OpenUI part that wraps the view", () => {
    expect([...reach(join(SRC, "widgets/workbench/value-levers-part.tsx")).packages].some((p) => p.startsWith("@openuidev"))).toBe(true);
  });
});
