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
- Tell the story using only what was known on the Case's as-of date. Never reveal or hint at the outcome before the reveal step.
- The Learner may ask anything at any time. Answer, then return to the current Teaching Step.

${frozenWidgets.instructions}`;

/**
 * Tool definitions the Tutor can call, frozen into each Session with the
 * instructions. The code that runs each one is bound by name in the Tutor Turn.
 */
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
];

export type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> };
