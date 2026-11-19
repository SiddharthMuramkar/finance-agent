"use client";

import { useId, useRef, useState } from "react";
import { send } from "../profile/profile-form";
import { Button, SecondaryButton } from "../ui";

/** The Show developer details switch: saved at once, for this Learner on every device. */
export function DeveloperDetailsSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setOn(next);
    setSaving(true);
    const failed = await send("/api/settings", "PUT", { showDeveloperDetails: next });
    setSaving(false);
    setError(failed);
    if (failed) setOn(!next);
  };

  return (
    <div className="text-sm">
      <label className="flex items-start gap-2 leading-5">
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={(e) => void change(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Show developer details
          <span className="block text-xs leading-4 text-[var(--muted)]">
            Adds an &ldquo;Under the hood&rdquo; line under each Tutor reply: the model, the steps, tokens, time and cost.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Marks the control a modal dialog focuses when it opens: the HTML autofocus attribute, which the dialog's focusing steps
 * look for. React's autoFocus prop cannot be trusted for it: React writes the attribute only when the server renders the
 * page, and on a client render (a client-side visit to Settings) calls focus() at mount instead, which does nothing inside
 * a closed dialog. Without the attribute the dialog would focus its first control.
 */
const autofocus = (el: HTMLElement | null) => el?.setAttribute("autofocus", "");

/** Whether the browser itself closes a dialog with closedby="any" on a press outside it (Chromium 134+, Firefox 141+). */
const lightDismissIsNative = () => "closedBy" in HTMLDialogElement.prototype;

/** Whether a pointer is outside the dialog's box, on its ::backdrop (whose presses the browser gives to the dialog). */
function outside(e: { clientX: number; clientY: number }, dialog: HTMLDialogElement) {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/**
 * Start over as a new learner: an outline danger button (the Settings danger zone) that first asks for confirmation, then
 * posts a plain form to /api/start-over, whose 303 opens the Welcome as the fresh Learner.
 *
 * The question is a native modal dialog (audit batch 2, finding 9: the old inline alertdialog replaced its button, so focus
 * fell to the page, and it was not modal). The button stays in the page and opens the dialog with showModal(), so the
 * browser draws it over the page, makes the page behind inert, keeps focus inside, closes it on Esc and gives focus back to
 * the button when it closes. Cancel, the safe answer, has the first focus and closes the dialog without posting (its
 * formmethod is dialog). closedby="any" also closes it on a press outside; where the browser does not know closedby yet
 * (Safari), the press is caught here. The copy and the button looks are as before; the answers sit at the row's end, the
 * destructive one last.
 */
export function StartOverButton({ confirmValue }: { confirmValue: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Light dismiss needs the press to start outside too, so a text selection dragged out of the dialog does not close it.
  const pressedOutside = useRef(false);
  const titleId = useId();
  const bodyId = useId();
  return (
    <>
      <Button variant="secondary" className="btn-danger-outline" onClick={() => dialog.current?.showModal()}>
        Start over as a new learner
      </Button>
      <dialog
        ref={dialog}
        closedby="any"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="dialog"
        onPointerDown={(e) => {
          pressedOutside.current = e.target === e.currentTarget && outside(e, e.currentTarget);
        }}
        onClick={(e) => {
          const startedOutside = pressedOutside.current;
          pressedOutside.current = false;
          // Only a click on the dialog element itself, outside its box, is a press on the backdrop: a click on a button
          // inside (Enter on Cancel is a click at 0,0) or on the dialog's own padding is not.
          if (lightDismissIsNative() || !startedOutside || e.target !== e.currentTarget || !outside(e, e.currentTarget)) return;
          e.currentTarget.close();
        }}
      >
        <h2 id={titleId} className="type-h3">
          Start over as a new learner?
        </h2>
        <p id={bodyId} className="mt-1 text-sm leading-5 text-[var(--muted)]">
          You begin again at the Welcome with no progress, Notebook or Sessions. Nothing is deleted: your current progress is kept, but you won&rsquo;t see it here again.
          Any other device signed in as you is signed out.
        </p>
        <form action="/api/start-over" method="post" className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="confirm" value={confirmValue} />
          <SecondaryButton type="submit" formMethod="dialog" value="cancel" ref={autofocus}>
            Cancel
          </SecondaryButton>
          <Button variant="danger" type="submit">
            Yes, start over
          </Button>
        </form>
      </dialog>
    </>
  );
}
