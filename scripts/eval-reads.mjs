// What the Widget eval and the Delight eval (scripts/widget-eval.mjs) read from the test branch after one prompt: which
// lane served the Widget, and for the Delight set the reply, the Choices and the Widget source the judges and bars read.
// Each takes anything with a pg-style `query(text, params)` that resolves to `{ rows }` (a Neon Pool in the run, a
// PGlite client in the tests), so the reads are tested on the real migrations with no server and no model.
import { textOf } from "./script-guards.mjs";

/**
 * Which lane served the Widget, and its code, from the Session's rows after the prompt. An item stored at `promptSeq`
 * itself follows the opener's last message, so it is the opener's (session-items.ts saves after the latest message).
 */
export async function readLane(pool, learnerId, promptSeq) {
  const sessions = (await pool.query(`select id from sessions where learner_id = $1 order by id desc limit 1`, [learnerId])).rows;
  if (!sessions.length) return { lane: "none", note: "no Session" };
  const sessionId = sessions[0].id;
  const messages = (await pool.query(`select seq, role, content from messages where session_id = $1 order by seq`, [sessionId])).rows;
  const after = messages.filter((m) => m.seq > promptSeq);
  const toolsUsed = after.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_use").map((b) => b.name) : []));
  const items = (await pool.query(`select kind, data, after_seq from session_items where session_id = $1 and kind = 'widget_shown' and after_seq > $2 order by id`, [sessionId, promptSeq])).rows;
  const turn = (await pool.query(`select status, stop_reason, error from turns where session_id = $1 order by id desc limit 1`, [sessionId])).rows[0] ?? null;
  const base = { sessionId, toolsUsed, turn };
  if (items.length) {
    const d = items[items.length - 1].data;
    const source = typeof d.source === "string" ? d.source : "recipe";
    return { ...base, lane: source === "compose" || source === "fallback" ? source : "recipe", code: d.code, title: d.title, recipe: d.recipe || null, params: d.params ?? null, widgetsShown: items.length };
  }
  const fences = after.filter((m) => m.role === "assistant").flatMap((m) => [...textOf(m).matchAll(/```openui-lang\n([\s\S]*?)\n```/g)].map((x) => x[1]));
  if (fences.length) return { ...base, lane: "fence", code: fences[fences.length - 1], widgetsShown: fences.length };
  return { ...base, lane: "none" };
}

/**
 * Delight set: what one prompt's judges and bars read. The reply is the text the Learner saw: the turn's
 * reply_checks.shown_text, or, with no shown text recorded, the Tutor's messages after the prompt less the rows the
 * record lists as never seen (a held-back draft, its correction, a failed retry). The Choices are the latest
 * reply_choices item stored after the prompt (spec E4a): the opener's sit at `promptSeq` and never count. widget_source
 * is reply_checks.widget_source for the turn, and when that column is not there yet (a branch before E4a's migration)
 * it falls back to the lane, marked so the report can say so.
 */
export async function readDelight(pool, sessionId, promptSeq, lane) {
  if (!sessionId) return { reply: "", choices: null, choicesCount: null, widgetSource: null, widgetSourceFrom: "none" };
  const messages = (await pool.query(`select seq, role, content from messages where session_id = $1 and seq > $2 order by seq`, [sessionId, promptSeq])).rows;
  const check = (await pool.query(`select shown_text, rejected_seqs from reply_checks where session_id = $1 and turn_seq > $2 order by turn_seq limit 1`, [sessionId, promptSeq])).rows[0];
  const rejected = new Set(check?.rejected_seqs ?? []);
  const shown = typeof check?.shown_text === "string" ? check.shown_text.trim() : "";
  const reply = shown || messages.filter((m) => m.role === "assistant" && !rejected.has(m.seq)).map((m) => textOf(m).trim()).filter(Boolean).join("\n\n");
  const item = (await pool.query(`select data from session_items where session_id = $1 and kind = 'reply_choices' and after_seq > $2 order by id desc limit 1`, [sessionId, promptSeq])).rows[0];
  const choices = Array.isArray(item?.data?.choices) ? item.data.choices : null;
  let widgetSource = null;
  let widgetSourceFrom = "reply_checks";
  try {
    const r = (await pool.query(`select widget_source from reply_checks where session_id = $1 and turn_seq > $2 order by turn_seq limit 1`, [sessionId, promptSeq])).rows[0];
    widgetSource = r ? (r.widget_source ?? null) : null;
    if (!r) widgetSourceFrom = "no reply_checks row";
  } catch {
    widgetSource = lane === "none" ? "none" : lane;
    widgetSourceFrom = "lane (reply_checks.widget_source is not in this database)";
  }
  return { reply, choices, choicesCount: choices ? choices.length : null, widgetSource, widgetSourceFrom };
}

/**
 * Delight set: every model call the app recorded for a Learner's Tutor turns (the `usage` step rows of all its
 * Sessions), in the shape Spend.chargeTurns takes. The eval starts a fresh Learner for each try, so one Learner's steps
 * are one try's turns: the Topic's opener and the reply to the prompt. Step rows, not turn totals, so a turn that broke
 * off before its total was written is still counted.
 */
export async function tutorSteps(pool, learnerId) {
  const { rows } = await pool.query(
    `select u.model, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens from usage u join sessions s on s.id = u.session_id
     where s.learner_id = $1 and u.kind = 'step' order by u.id`,
    [learnerId],
  );
  return rows.map((r) => ({ model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheReadTokens: r.cache_read_tokens, cacheWriteTokens: r.cache_write_tokens }));
}
