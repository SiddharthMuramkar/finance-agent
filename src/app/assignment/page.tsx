import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { assignmentOpen } from "@/learner/own-cases";
import { currentAccount } from "../account";
import { ButtonLink } from "../primitives";
import { ReadingPage } from "../ui";
import { OwnCaseForm } from "./own-case-form";

// Reads saved progress on every visit. No model call, and nothing fetched live (ADR 0013).
export const dynamic = "force-dynamic";

/**
 * The Assignment after the Spine (spec #68; ADR 0020): the Learner picks a listed Indian company, copies about eight
 * numbers from its annual report into an Own Case, sees the engine's value and saves a one-page note to the Notebook.
 */
export default async function AssignmentPage() {
  const learner = await signedInLearner();
  const open = await assignmentOpen(getDb(), loadCourseMap(), learner.id);
  return (
    <ReadingPage current="course" account={await currentAccount()}>
      <h1 className="type-h1">Assignment: value a company you pick</h1>
      {open ? (
        <>
          <p className="measure mb-8 mt-2 text-sm leading-5 text-[var(--muted)]">
            Pick a listed Indian company and open its annual report. Copy eight numbers from it into your Own Case: this is the one place you type numbers.
            The Own Case is dated at the report, with the share price of that day; nothing is fetched live.
          </p>
          <OwnCaseForm />
        </>
      ) : (
        <div data-assignment-closed className="mt-4 flex flex-col items-start gap-4">
          <p className="text-sm leading-5">The Assignment opens once you pass every Spine Topic.</p>
          <ButtonLink href="/course" variant="secondary" size="sm">
            Course Map
          </ButtonLink>
        </div>
      )}
    </ReadingPage>
  );
}
