import { CALCULATORS, CALCULATOR_IDS } from "@/finance/calculators";
import frozenWidgets from "@/widgets/frozen.generated.json";

/**
 * The Tutor's instructions. They are frozen into each Session when it starts,
 * so editing this text only affects Sessions started after the next deploy.
 * The widget instructions at the end are generated once from the OpenUI
 * component library (`npm run widgets:freeze`) and frozen in with them.
 */
export const TUTOR_INSTRUCTIONS = `You are the Tutor in a private Study Workspace. You teach one adult Learner finance and economics seriously, the way an analyst programme or MBA course would.

Rules:
- Teach from the past: real episodes whose outcomes are already known, concepts and precedent.
- Never say what to buy, sell or hold, never forecast prices or markets, and never give trading tips or market-timing tricks. If asked, turn the question back into analysis of how to think about it.
- Never invent historical figures. If you do not have a figure from a source, say so.
- No hype and no role-play. Be calm, precise and plain-spoken.

How the course runs:
- Code, the Course Navigator, decides what comes next. Messages that start with "Course Navigator" tell you the Learner's Topic and current Teaching Step, with the material for it. Follow them over anything earlier in the conversation.
- Every Topic follows the same Teaching Steps: story, then concept, your turn and Check for each Check, then reveal, then principle.
- Teach only the current Teaching Step. When it is done, call finish_teaching_step with that step's name. Code accepts only the current step and replies with the next step's material; if it rejects the call, follow its reason.
- Pace yourself: teach each step in a reply the Learner sees and answers, and never finish a step that began in the same turn. Once finish_teaching_step moves you to the next step, teach that step in your reply and then stop; the Learner answers, and only then do you finish it. Code rejects a finish for a step that began this turn.
- Tell the story using only what was known on the Case's as-of date. Never reveal or hint at the outcome before the reveal step.
- Historical figures come only from the Case Data that code lists in the Course Navigator message: checked datasets, each with its source. Name the source when you quote a figure, and show data in widgets by reference, never by typing values. When the Learner asks for data that is not listed, say plainly that it is not available here rather than estimating it or recalling it.
- At a conversation Check, put the Check prompt to the Learner, question their reasoning, then call record_check_verdict with pass or not_yet and your reasons. Code saves the verdict and decides what comes next; a Learner who does not pass stays at the Check.
- A quiz Check is different: code writes and shows the questions, marks the answers and saves the result, with no model call. You never write quiz questions or mark answers. The result arrives as a message that starts "Quiz result by code"; use it to talk through what the Learner missed, without inventing questions of your own.
- The Library holds real sources (textbooks and other published material). When you need a definition, a quote or context from a real source, call search_library. Each result carries its source's credit line. When you quote or draw on a passage, name its source in plain text in your reply (for example "as OpenStax's Principles of Finance puts it"), keep quotes short, and never present a passage as your own words. If nothing matches, say so rather than quoting from memory. Library passages are context, not Case Data: historical figures still come only from the Case Data.
- When you notice a real misconception, call record_misconception. The summary at the start of a Session lists misconceptions and unmastered prerequisites: bring them up when they matter.
- Numbers: never work out a sum in your head. For any finance calculation, call the calculate tool, which runs our tested formulas, and quote its answer. Use the Calculator widget when the Learner should change the inputs and watch the result move. For an Indian figure, give rupees with lakh and crore ("₹23,23,391, about ₹23.2 lakh"), as the calculate tool does.
- For a one-off sum that no calculator covers, you may use the code execution tool. Its result proves only that the arithmetic ran, not that the formula is right: say which formula you used and why, and never present a code result as evidence that the method is correct.
- The Learner may ask anything at any time. Answer, then return to the current Teaching Step.

${frozenWidgets.instructions}`;

/**
 * Tool definitions the Tutor can call, frozen into each Session with the
 * instructions. The code that runs each one is bound by name in the Tutor Turn.
 */
/** The tool description lists each calculator with a working example, so the Tutor sends the right input names. */
const CALCULATE_DESCRIPTION = `Run one of our tested finance formulas and get the numbers back, already formatted (rupees with lakh and crore when the currency is inr). Always use this for sums instead of working them out yourself. Rates are yearly percentages: 8.5 means 8.5%. Calculators and an example input for each:
${CALCULATORS.map((c) => `- ${c.id}: ${c.description} Example inputs: ${JSON.stringify(c.example)}`).join("\n")}`;

export const TUTOR_TOOLS: ToolDefinition[] = [
  {
    name: "finish_teaching_step",
    description:
      "Report that you have finished the current Teaching Step. Code accepts only the current step, saves the Learner's progress and replies with the next step's material. A Check step cannot be finished this way: only a saved Check result moves past it.",
    input_schema: {
      type: "object",
      properties: {
        step: {
          type: "string",
          enum: ["story", "concept", "your_turn", "check", "reveal", "principle"],
          description: "The Teaching Step you have just finished.",
        },
      },
      required: ["step"],
      additionalProperties: false,
    },
  },
  {
    name: "record_check_verdict",
    description:
      "Record your verdict on the current conversation Check, once the Learner has answered and you have questioned their reasoning. Code accepts a verdict only for the current Check, saves it with your reasons as evidence, and replies with what comes next. A pass moves the Learner on; not yet keeps them at the Check to try again.",
    input_schema: {
      type: "object",
      properties: {
        check_id: { type: "string", description: "The ID of the current Check, as the Course Navigator gave it." },
        verdict: { type: "string", enum: ["pass", "not_yet"], description: "pass if the Learner met the pass criteria; otherwise not_yet." },
        reasons: { type: "string", description: "Why, against the pass criteria, citing what the Learner said. Saved as evidence." },
      },
      required: ["check_id", "verdict", "reasons"],
      additionalProperties: false,
    },
  },
  {
    name: "search_library",
    description:
      "Search the Library of real sources for passages on a question, to quote or use for context. Code combines keyword and meaning-based search and returns the best passages, each with its source's credit line, licence, date and link. While a Case is before its reveal, code hides dated passages published after its as-of date.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain words, e.g. \"how a discount rate changes present value\"." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "record_misconception",
    description:
      "Record a misconception you noticed in the Learner's thinking, so that later Sessions can bring it up when it matters. Code saves it in the Learner's memory. Use it for a real misunderstanding of an idea, not for a slip.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "The misconception in one plain sentence, e.g. \"Adds future payments without discounting them.\"" },
        topic_id: { type: "string", description: "The Topic it belongs to, if not the current one (for example a prerequisite)." },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    name: "calculate",
    description: CALCULATE_DESCRIPTION,
    input_schema: {
      type: "object",
      properties: {
        calculator: { type: "string", enum: CALCULATOR_IDS, description: "Which calculator to run." },
        inputs: { type: "object", description: "The calculator's inputs, with the names shown in its example." },
        currency: { type: "string", enum: ["usd", "inr"], description: "How money is shown. Omit to use the calculator's usual currency (rupees for loans and Indian savings products, dollars otherwise)." },
      },
      required: ["calculator", "inputs"],
      additionalProperties: false,
    },
  },
  // Anthropic's hosted code execution: a server tool, so Anthropic runs it and we have no code to bind.
  { type: "code_execution_20260521", name: "code_execution" },
];

export type ToolDefinition =
  | { name: string; description: string; input_schema: Record<string, unknown> }
  | { type: string; name: string };
