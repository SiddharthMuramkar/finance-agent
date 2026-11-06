import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCourseMap, type Topic } from "@/course/map";
import { buildRunningScene, buildScene, buildTermCard, scenesInStepOrder } from "@/course/scenes";
import { SCENE_FIXTURE_TOPIC_ID, sceneFixtureTopic } from "@/course/scenes-fixture";
import { SceneList, type ScenePiece } from "./scene-list";

// The scenes page (developer tool, E3): a Topic's written-ahead story Widgets, its terms as Lingo cards and
// its Running-example scene, built on the server through their recipes and drawn by the real renderer. No
// database and no model call. It does not exist in production. `?topic=scene-fixture` draws the fixture Topic.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function topicFor(id: string): Topic | undefined {
  if (id === SCENE_FIXTURE_TOPIC_ID) return sceneFixtureTopic();
  return loadCourseMap().topic(id);
}

const piece = (key: string, eyebrow: string, title: string, built: { ok: boolean; code?: string; error?: string } | null): ScenePiece => ({
  key,
  eyebrow,
  title,
  ...(built?.ok ? { code: built.code } : { error: built?.error ?? "This scene could not be built." }),
});

export default async function ScenesDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const topicId = first(params.topic);

  if (!topicId) {
    const withScenes = loadCourseMap().topics.filter((t) => t.scenes.length > 0);
    return (
      <main className="mx-auto max-w-5xl p-6 text-[var(--ink)]">
        <h1 className="text-xl font-semibold leading-7">Topic scenes</h1>
        <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Each Topic&apos;s written-ahead story Widgets, drawn through their recipes.</p>
        <ul className="mt-4 divide-y divide-[var(--border)]" data-testid="scene-index">
          <li className="py-2">
            <Link href={`/dev/scenes?topic=${SCENE_FIXTURE_TOPIC_ID}`} className="text-sm underline">
              {SCENE_FIXTURE_TOPIC_ID} (fixture)
            </Link>
          </li>
          {withScenes.map((t) => (
            <li key={t.id} className="py-2">
              <Link href={`/dev/scenes?topic=${t.id}`} className="text-sm underline">
                {t.id}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const topic = topicFor(topicId);
  if (!topic) notFound();

  const scenes = scenesInStepOrder(topic).map((scene) => {
    const built = buildScene(topic, scene);
    return { ...piece(scene.id, `${scene.step} · ${scene.recipe}`, built.ok ? built.title : (scene.title ?? scene.id), built), step: scene.step, recipe: scene.recipe };
  });
  const terms = topic.terms.flatMap((term) => {
    const built = buildTermCard(topic, term);
    return built ? [piece(`term-${term.term}`, "Lingo", term.term, built)] : [];
  });
  const runningBuilt = buildRunningScene(topic);
  const running = runningBuilt ? piece("running-example", "Running example · story_scene", runningBuilt.ok ? runningBuilt.title : "The running example", runningBuilt) : null;

  return <SceneList topicTitle={topic.title} theme={first(params.theme) === "dark" ? "dark" : "light"} scenes={scenes} terms={terms} running={running} />;
}
