import { getDb } from "@/db/client";
import { loadCurrentSession } from "@/tutor/turn";
import { Conversation } from "./conversation";

// Reads the saved Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const initial = await loadCurrentSession(getDb());
  return <Conversation initial={initial} />;
}
