import { cookies } from "next/headers";
import { SPLIT_COOKIE, parseSplit } from "./split";

/** The Learner's saved split, read from the `split` cookie (server only); 45 when there is none. Pass it to the frame. */
export async function readSplit(): Promise<number> {
  return parseSplit((await cookies()).get(SPLIT_COOKIE)?.value);
}
