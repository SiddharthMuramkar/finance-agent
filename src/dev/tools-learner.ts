import { type Learner, signInAs, startOver } from "@/auth/learners";
import { TOOLS_NAME } from "@/auth/passcode";
import type { Db } from "@/db/types";

/**
 * The Learner the comparison and behaviour runs play, as every run of the test tools begins: the tools Learner,
 * started over. Its active row is archived (nothing is deleted) and a fresh, empty one opened under the same
 * name, so a run never reads or writes the owner's rows or the owner's test Learner's.
 */
export async function freshToolsLearner(db: Db): Promise<Learner> {
  const current = await signInAs(db, TOOLS_NAME);
  const fresh = await startOver(db, current.id);
  if (!fresh) throw new Error("The tools Learner was started over by something else at the same moment; run again.");
  return fresh;
}
