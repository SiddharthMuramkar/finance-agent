import { home, meta } from "./copy";
import { exampleBySlug } from "./examples";
import { plain } from "./rich";

// The share cards (issue #71): what a shared link shows, drawn in today's look by src/app/share-image/[name]/route.tsx.
// Home's names the site's question; each Example's names its own, from src/site/examples.ts, so a renamed or added
// Example gets its card with no hand work.

/** A card's words: the small line above, the question, the line under it, and the alt text a link preview reads. */
export type ShareCard = { eyebrow: string; title: string; line: string; alt: string };

/** The card for "home" or an Example's slug; none for any other name. */
export function shareCard(name: string): ShareCard | undefined {
  if (name === "home") {
    return { eyebrow: home.hero.eyebrow, title: home.hero.h1.join(" "), line: meta.sharePromise, alt: meta.shareTitle };
  }
  const example = exampleBySlug(name);
  return example && { eyebrow: "Example", title: example.question, line: plain(example.hook), alt: example.question };
}
