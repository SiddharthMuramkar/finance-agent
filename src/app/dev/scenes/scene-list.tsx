"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { applyTheme, isTheme } from "../../theme";
import { WidgetView } from "../../widget-view";
import { Eyebrow } from "../../ui";

/** One drawn piece of the scenes page: a scene, a term's Lingo card, or the Running-example scene. */
export type ScenePiece = { key: string; eyebrow: string; title: string; code?: string; error?: string };

function Piece({ piece, testId, recipe, step, mounted }: { piece: ScenePiece; testId: string; recipe?: string; step?: string; mounted: boolean }) {
  return (
    <section data-testid={testId} data-recipe={recipe} data-step={step} className="rounded-lg border border-[var(--border)] p-4">
      <Eyebrow className="mb-1">{piece.eyebrow}</Eyebrow>
      <h2 className="mb-2 text-base font-semibold leading-6">{piece.title}</h2>
      {!mounted ? (
        <p className="text-sm leading-5 text-[var(--muted)]">Drawing…</p>
      ) : piece.code ? (
        <CaseDataProvider cases={[]}>
          <WidgetView code={piece.code} complete bare />
        </CaseDataProvider>
      ) : (
        <p role="status" className="text-sm leading-5 text-[var(--coral-ink)]">
          {piece.error ?? "This scene could not be built."}
        </p>
      )}
    </section>
  );
}

/**
 * A Topic's scenes in step order, its terms as Lingo cards, and its Running-example scene (E3), drawn by the
 * real WidgetView at the Widget panel's wide width, so E6's screenshots and the critics judge what a Learner
 * would see. Developer tool: only reachable outside production (page.tsx).
 */
export function SceneList({
  topicTitle,
  theme,
  scenes,
  terms,
  running,
}: {
  topicTitle: string;
  theme: "light" | "dark";
  scenes: (ScenePiece & { step: string; recipe: string })[];
  terms: ScenePiece[];
  running: ScenePiece | null;
}) {
  // Widgets draw only on the client: their parts read matchMedia on first render, so a server draw would
  // hydrate against a different reduced-motion answer and log a mismatch instead of drawing the scene.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  useEffect(() => {
    const before = document.documentElement.dataset.theme;
    applyTheme(theme);
    return () => {
      applyTheme(isTheme(before) ? before : "light");
    };
  }, [theme]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]" data-testid="dev-scenes" data-theme={theme}>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        <h1 className="text-xl font-semibold leading-7">{topicTitle}</h1>
        {scenes.length === 0 && !running && terms.length === 0 ? (
          <p data-testid="no-scenes" className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm leading-5 text-[var(--muted)]">
            No scenes yet for this Topic.
          </p>
        ) : null}
        {scenes.map((piece) => (
          <Piece key={piece.key} piece={piece} testId="dev-scene" recipe={piece.recipe} step={piece.step} mounted={mounted} />
        ))}
        {running ? <Piece piece={running} testId="dev-running-scene" mounted={mounted} /> : null}
        {terms.length > 0 ? (
          <section data-testid="dev-terms" className="flex flex-col gap-4">
            {terms.map((piece) => (
              <Piece key={piece.key} piece={piece} testId="dev-term" mounted={mounted} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
