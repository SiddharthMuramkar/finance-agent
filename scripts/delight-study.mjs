// The Delight eval's browser set-up (scripts/widget-eval.mjs --set delight): puts the tools Learner at a prompt's step
// and opens the Study Workspace. Kept out of the runner so it is tested (src/behaviour/delight/study-script.test.ts)
// with a PGlite database and a stand-in page, no server and no model.
import { assertToolsLearner } from "./script-guards.mjs";

/**
 * Puts the tools Learner (and only it) in the prompt's Topic at the prompt's Teaching Step, before the Study Workspace
 * opens: the Topic is its chosen one, in progress, standing at that step with the reveal shown from the reveal on.
 */
export async function openAtStep(pool, learnerId, p) {
  await assertToolsLearner(pool, learnerId);
  const revealShown = p.step === "reveal" || p.step === "principle";
  await pool.query(
    `insert into topic_progress (topic_id, learner_id, step, reveal_shown, status) values ($1, $2, $3, $4, 'in_progress')
     on conflict (learner_id, topic_id) do update set step = excluded.step, reveal_shown = excluded.reveal_shown, status = 'in_progress', updated_at = now()`,
    [p.topic, learnerId, p.step, revealShown],
  );
  await pool.query(
    `insert into learner_state (id, learner_id, current_topic_id) values ($2, $2, $1)
     on conflict (id) do update set current_topic_id = excluded.current_topic_id, updated_at = now()`,
    [p.topic, learnerId],
  );
}

/**
 * Opens the Study Workspace. It waits for the page's DOM, never for network idle: the page starts the Tutor's opener at
 * once as a streaming POST /api/turn, which keeps the network busy until the whole opener has streamed, so a
 * network-idle wait would outlive the 30 s navigation timeout on a slow opener and fail the try (finding E4b-R1).
 * `waitForOpener` then waits for the opener itself, with the long waits.
 */
export async function openStudy(page, base) {
  await page.goto(`${base}/study`, { waitUntil: "domcontentloaded" });
}

/** The opening turn: a Tutor message appears (up to 120 s), then the Stop button goes away and Send comes back. */
export async function waitForOpener(page, turnTimeoutMs) {
  await page.locator('[data-testid="assistant-message"]').first().waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: turnTimeoutMs });
  await page.waitForTimeout(1_500);
}
