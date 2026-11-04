"use client";

import { useState } from "react";
import type { OwnRuleItemData } from "@/tutor/own-rule-item";
import { useAnnounce } from "./announcer";
import { SaveToNotesView, type SaveState } from "./save-to-notes";

/**
 * The line under the Tutor's confirmation of the Learner's own rule: "Saved to your notes · Undo · Open notes". Code
 * saved the rule (save_learner_rule), so there is no Save button, only the controls of the Save to notes control, reused
 * with their own label. Undo calls the same DELETE /api/notes as a line on the Notes page; a note already gone counts as
 * removed. Display-only: it is never sent to the model.
 */
export function OwnRuleLine({ data }: { data: OwnRuleItemData }) {
  const [state, setState] = useState<SaveState>({ status: "saved", id: data.noteId, topicId: data.topicId });
  const [removed, setRemoved] = useState(false);
  const announce = useAnnounce();
  const undo = async () => {
    setState({ status: "saving" });
    const res = await fetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.noteId }) }).catch(() => null);
    if (res && (res.ok || res.status === 404)) {
      setRemoved(true);
      announce("Removed from your notes");
    } else setState({ status: "saved", id: data.noteId, topicId: data.topicId });
  };
  if (removed) {
    return (
      <p data-testid="own-rule-line" data-removed className="self-start text-xs leading-4 text-[var(--muted)]">
        Removed from your notes.
      </p>
    );
  }
  return (
    <div data-testid="own-rule-line" className="self-start">
      <SaveToNotesView state={state} what="rule" label="Saved to your notes" onSave={() => {}} onUndo={() => void undo()} />
    </div>
  );
}
