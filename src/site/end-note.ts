import { valuationCase } from "@/finance/valuation-cases";
import { valueLeversModeSchema } from "@/widgets/workbench/data-schemas";
import { leverSpecs, openingSettings, storyNote, valueLeversModel, type SavedStory } from "@/widgets/workbench/value-levers-model";

// Home's "Where you end up" (#75): the one-page note Spine Topic 15 ("Value one yourself, as of a past date") saves to
// the Notebook, here for Amazon as of 3 Feb 2000 with the story the Topic opens on. It is drawn by the same code the
// Topic's Save my story button runs (storyNote, through the course's tested valuation engine), so the figures are the
// ones a Learner's note holds. Pure: no database, so Home stays public and cacheable per viewer.

/** The Topic whose saved note Home shows. */
export const END_NOTE_TOPIC = "spine-15-value-yourself";
/** The Case it values, and the chip label Topic 15 names it by in the note (course/topics/spine-15-value-yourself.yaml). */
const CASE_ID = "amazon-yourself-2000";
const CASE_LABEL = "Amazon, Feb 2000";

/** The saved note: its title and its lines, as the Notebook shows them. */
export function endNote(): SavedStory {
  const block = valuationCase(CASE_ID);
  if (!block) throw new Error(`Valuation Case ${CASE_ID} is missing`);
  const mode = valueLeversModeSchema.parse({ kind: "all_open" });
  const specs = leverSpecs(block, mode);
  const settings = openingSettings(specs);
  return storyNote(block, specs, settings, valueLeversModel(block, specs, settings, mode), CASE_LABEL);
}
