import { loadCaseData, type CaseDataset } from "@/case-data/case-data";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { hiddenPassages, passageCredits } from "@/library/library";
import { splitReply } from "@/widgets/split";
import { foldText, type CitationMarks, type SourceEntry } from "./citations";

/**
 * A reply's sources, folded. The Learner sees tiny numbers in the text and, at the end of the whole
 * reply, one small "N sources" line that opens to the list: each Library passage the reply cited
 * (numbered as its markers are, with its heading and credit line) and each Case Data dataset whose
 * figures the text quotes. Worked out by code from the stored reply, so it is the same while the reply
 * streams and when it is read back, in old Sessions too.
 */

/** What code needs to know to list a reply's sources, looked up once for a reply or a whole Session. */
export type SourceContext = {
  credits: Map<number, string>;
  /** Cited passages the as-of rule hides now: listed without heading or credit. */
  hidden: Set<number>;
  /** The Case Data the as-of rule allows now, for the Case the Learner is at. */
  datasets: CaseDataset[];
};

/**
 * Looks up the credit of these cited passages, which of them the as-of rule hides and, given the
 * Course Map, the Case Data allowed now. Without the Course Map nothing is withheld. The as-of rule
 * reads the given Learner's progress.
 */
export async function sourceContext(deps: SourceDeps, cited: number[], topicTitle?: string): Promise<SourceContext> {
  const { db, map, learnerId } = deps;
  const credits = await passageCredits({ db }, cited);
  if (!map) return { credits, hidden: new Set(), datasets: [] };
  return { credits, hidden: await hiddenPassages({ db, map, learnerId }, cited), datasets: await topicDatasets({ db, map, learnerId }, topicTitle) };
}

/** What a reply's sources are looked up with: the Learner whose progress the as-of rule reads, and the Course Map. */
export type SourceDeps = { db: Db; map?: CourseMap; learnerId: number };

/**
 * The Case Data of a Topic, under the as-of rule as it applies now to the Learner. `topicTitle` is the Topic a
 * reply was taught under (an old Session keeps its own Topic's credits); without it, or when the Course Map has
 * no such Topic, the Learner's current Topic is used.
 */
export async function topicDatasets({ db, map, learnerId }: SourceDeps & { map: CourseMap }, topicTitle?: string): Promise<CaseDataset[]> {
  const progress = await loadProgress(db, learnerId);
  const topic = (topicTitle ? map.topics.find((t) => t.title === topicTitle) : undefined) ?? navigate(map, progress)?.topic;
  const cases = await Promise.all((topic?.cases ?? []).map((c) => loadCaseData(db, map, progress, c.id)));
  return cases.flatMap((c) => c?.datasets ?? []);
}

/** The forms a figure may take in a sentence: as the widgets write it, and as a plain number. */
function forms(value: number, unit: string): string[] {
  const out = new Set([String(value), value.toFixed(2), value.toLocaleString("en-US")]);
  if (unit === "percent") out.add(`${value.toFixed(2)}%`).add(`${value}%`);
  if (unit === "USD") {
    const abs = Math.abs(value);
    if (abs >= 1e9) out.add(`$${(value / 1e9).toFixed(3)} billion`).add(`$${(value / 1e9).toFixed(1)} billion`);
    else if (abs >= 1e6) out.add(`$${(value / 1e6).toFixed(1)} million`);
    out.add(`$${Math.round(value).toLocaleString("en-US")}`);
  }
  // A short whole number ("5") would match anywhere; only decimals and figures of three digits or more count.
  return [...out].filter((f) => /\./.test(f) || (f.match(/\d/g)?.length ?? 0) >= 3);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The datasets whose figures the text quotes: any allowed point's value written out whole (not as part
 * of a longer number). Widget code and citation links are not text the Learner reads, so they are skipped.
 */
export function quotedDatasets(text: string, datasets: CaseDataset[]): CaseDataset[] {
  if (!datasets.length) return [];
  const prose = splitReply(text)
    .flatMap((s) => (s.type === "prose" ? [s.text] : []))
    .join("\n")
    .replace(/\]\([^)]*\)/g, "]");
  return datasets.filter((d) =>
    d.points.some((p) => forms(p.value, d.unit).some((f) => new RegExp(`(?<![\\d.,])${escape(f)}(?![\\d]|[.,]\\d)`).test(prose))),
  );
}

/** The sources of one reply, as the text that ends it: empty when it cites nothing and quotes no Case Data. */
export function replyFold(marks: CitationMarks, replyText: string, ctx: SourceContext): string {
  const entries: SourceEntry[] = marks.entries(ctx.credits, ctx.hidden);
  const seen = new Set<string>();
  for (const d of quotedDatasets(replyText, ctx.datasets)) {
    if (seen.has(d.source)) continue;
    seen.add(d.source);
    entries.push({ n: null, title: d.label, href: d.sourceUrl, credit: d.source });
  }
  return foldText(entries);
}
