import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import type { ReplyDraft, ReplyWidget, StepKind } from "@/tutor/reply-checks";
import type { ModelClient } from "@/tutor/model";

/**
 * The browser test bed's scripted Tutor (spec 2026-11-05, T-00). With `E2E_TUTOR=scripted` the app's Tutor client
 * plays one of these named scripts instead of calling OpenAI, so a browser test sees a real Tutor Turn (tools,
 * reply checks, storage) with a known reply and no key. The test picks the script with `POST /api/dev-e2e {script}`;
 * the choice is kept on globalThis, since the route and the turn route are separate module graphs in `next dev`.
 * Every script passes the reply checks for its step (src/dev/e2e-tutor.test.ts), or the gate would retry.
 * A ticket that needs another script adds it here.
 */

const text = (t: string) => ({ type: "text", text: t });

/** The Topic every fixture state opens (src/app/api/dev-e2e/route.ts). Its running example is a savings rate from 4% to 5%. */
const RATE_MOVE_PARAMS = { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5, mode: "show" }, refs: {}, facts: {} };

/**
 * Spine Topic 1 (spine-01-worth, e2e/spine-01.spec.ts): what the Learner types in the play, so a Tutor tool call can
 * quote their own words (record_insight_attempt and the Check verdict take only words from the Learner's message).
 * The spec types exactly these; src/dev/e2e-tutor.test.ts holds the two together.
 */
export const SPINE_ONE_SAYS = {
  /** At explore, once the Value levers reach $84: the Insight in the Learner's words. */
  insight:
    "I moved sales to $60bn and the margin to 12.5%, and the story reached $84. The price needs a much bigger Amazon that keeps more of each sale; a cheaper cost of capital alone could not get there.",
  /** At the conversation Check: Amazon's story as four levers, the lever least sure of, and the price read as a question. */
  talk:
    "Amazon grows to about $39bn of sales in ten years and keeps 10% of each sale. It needs $1 invested for every $3 of new sales, and its 12.84% cost of capital falls as it matures, so on that story it is worth about $35 a share. " +
    "I am least sure of the margin, because Amazon still loses money on what it sells. The $84 price is not proof the story is wrong: it is a question about the bigger, richer Amazon it assumes.",
} as const;

/** The words of the Insight the Learner's message holds, as record_insight_attempt quotes them. */
const SPINE_ONE_INSIGHT_WORDS = "The price needs a much bigger Amazon that keeps more of each sale";

/** Spine Topic 1's explore Workbench (its Topic file's explore.workbench), as the Tutor shows it with show_widget. */
const SPINE_ONE_LEVERS = {
  title: "Amazon, February 2000: your story",
  inputs: { case: "spine-01-amazon-2000", caseStory: "Damodaran's story", priceStory: { revenue: 60, margin: 12.5 } },
  refs: {},
  facts: {},
};

export const E2E_SCRIPTS = {
  /** About 90 words of story at the Story step, one ask on the last line, no Widget. */
  "story-reply": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "In February 1994 the Federal Reserve lifted its key rate from 3 to 3.25 percent. On paper it was a small step. " +
              "Bond traders were stunned anyway, because rates had sat still for more than a year. " +
              "Newspapers called it a quarter-point move. Traders on the phone called it 25 basis points. " +
              "Some readers heard that borrowing had become dearer by a twelfth and wondered what had happened. " +
              "All of them were describing the very same move, only in different words. That year is still remembered as the great bond massacre.\n\n" +
              "Which of those descriptions sounds biggest to you?",
          ),
        ],
      },
    ],
  },
  /** A Concept reply under 80 words and one ready-made Widget (the rate_move recipe) shown with show_widget. */
  "concept-reply-widget": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_show", name: "show_widget", input: { recipe: "rate_move", params: RATE_MOVE_PARAMS } }] },
      {
        content: [
          text(
            "A percentage point is the plain gap between two rates. A savings rate that goes from 4% to 5% is up one point. " +
              "A basis point is one hundredth of a point, so the same move is 100 basis points. The panel shows the move both ways.\n\n" +
              "Which name would a bond trader use for it?",
          ),
        ],
      },
    ],
  },
  /** A Concept reply with no Widget: the case E4a must fix. */
  "plain-reply": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A basis point is one hundredth of a percentage point. Traders like it because small moves in rates matter a lot on big loans, " +
              "and a quarter of a point is clumsy to say out loud.\n\n" +
              "Which word would you use for a tiny rate move?",
          ),
        ],
      },
    ],
  },
  /**
   * E5's stage scripts: Concept replies like concept-reply-widget, each showing a Widget of a different recipe from the
   * Concept card's rate_move and from each other, so a Session collects one tab per reply (B6, ADR 0008: a Widget that
   * opens the same slider recipe at new numbers takes its tab in place instead).
   */
  "stage-reply-2": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage2", name: "show_widget", input: { recipe: "percent_points", params: { title: "A deposit rate from 6% to 6.5%", inputs: { label: "Deposit rate", slider: { label: "New rate", unit: "percent", min: 5, max: 8, step: 0.25, start: 6 } }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here is the same move on a deposit rate. It climbs from 6% to 6.5%: half a percentage point, which traders call 50 basis points. " +
              "The panel draws the move on one line, so the two names sit side by side.\n\n" +
              "Which name makes the move sound bigger?",
          ),
        ],
      },
    ],
  },
  "stage-reply-3": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage3", name: "show_widget", input: { recipe: "lingo_card", params: { title: "A loan rate from 9% to 8.75%", inputs: { term: "Quarter point", pro: "The loan rate fell a quarter point.", means: "A move of one quarter of a percentage point, or 25 basis points.", example: "A loan rate going from 9% to 8.75%.", emoji: "bank" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Now a move the other way. A loan rate falls from 9% to 8.75%: a quarter of a point down, or 25 basis points in trader talk. " +
              "The arrow on the panel points down this time.\n\n" +
              "Which word would a bank use in a headline?",
          ),
        ],
      },
    ],
  },
  "stage-reply-4": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage4", name: "show_widget", input: { recipe: "lingo_card", params: { title: "A bond yield from 7% to 7.1%", inputs: { term: "Basis point", pro: "The yield edged up 10 basis points.", means: "One hundredth of a percentage point.", example: "A bond yield going from 7% to 7.1%.", emoji: "chart-increasing" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "One more, smaller still. A bond yield edges from 7% to 7.1%: a tenth of a point, just 10 basis points. " +
              "Small moves like this are exactly why the smaller unit exists.\n\n" +
              "Which unit would you reach for here?",
          ),
        ],
      },
    ],
  },
  /**
   * The Beginner persona's 10-turn transcript (#531, src/dev/beginner-persona.ts): five replies written for what the persona
   * asks on one turn, so no turn repeats another's words. Concept replies like concept-reply-widget; each Widget has its own title.
   */
  /** "wait so is 1% the same as 100 of those?": one percentage point, not one percent, is 100 basis points. */
  "persona-one-hundred": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_persona_hundred", name: "show_widget", input: { recipe: "rate_move", params: { title: "A mortgage rate from 5% to 6%", inputs: { old: 5, new: 6, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Almost, and the small difference matters. One percentage point is 100 basis points, the way one rupee is 100 paise. " +
              "A mortgage rate that goes from 5% to 6% is up one point, so it is up 100 basis points. The panel shows both names for that one move.\n\n" +
              "Which of the two names is the bigger number?",
          ),
        ],
      },
    ],
  },
  /** "why does anyone care about such tiny moves": a tiny move lands on a huge pile of loans. */
  "persona-why-tiny": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_persona_tiny", name: "show_widget", input: { recipe: "rate_move", params: { title: "A home loan rate from 8% to 8.01%", inputs: { old: 8, new: 8.01, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Because a tiny move lands on a huge pile of money. One basis point sounds like nothing, but a bank with millions of home loans feels it on every loan, every month. " +
              "The panel shows how small that move looks on the line.\n\n" +
              "Would you rather watch one big jump or many small steps?",
          ),
        ],
      },
    ],
  },
  /** "my dad said the bank cut by 25 bps, what does that mean": a cut of a quarter of a point, and what it does to borrowing. */
  "persona-bank-cut": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_persona_cut", name: "show_widget", input: { recipe: "rate_move", params: { title: "A bank rate cut from 6.5% to 6.25%", inputs: { old: 6.5, new: 6.25, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Your dad's bank lowered its rate by a quarter of a percentage point, which is 25 basis points. " +
              "A cut means the rate went down, so borrowing gets a little cheaper. The panel draws a cut like that.\n\n" +
              "Would that cut make a loan cheaper or dearer?",
          ),
        ],
      },
    ],
  },
  /** "What does that word mean?" after the bank cut: bps is the short way to write basis points. No Widget: code adds the card. */
  "persona-bps-short": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Bps is just the short way to write basis points, the way km is short for kilometres. " +
              "So 25 bps is 25 basis points, and 100 bps is one full percentage point. You will see it in bank notices and news headlines.\n\n" +
              "Where might you see bps written?",
          ),
        ],
      },
    ],
  },
  /** "ok got it, one more example": a bigger move to finish, a point and a half. */
  "persona-one-more": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_persona_more", name: "show_widget", input: { recipe: "rate_move", params: { title: "A personal loan rate from 12% to 13.5%", inputs: { old: 12, new: 13.5, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here is a bigger one to finish. A personal loan rate climbs from 12% to 13.5%: a point and a half, which is 150 basis points. " +
              "Counting in basis points keeps even a large move easy to say.\n\n" +
              "Which name would you use when texting a friend?",
          ),
        ],
      },
    ],
  },
  /** A reply beside an open quiz: it quotes none of the quiz's numbers (it has no numbers at all). */
  "quiz-open": {
    step: "check",
    replies: [
      {
        content: [
          text(
            "Take your time with the questions in the Check tab. Each one asks you to name a move the way a trader would. " +
              "Read where the rate started and where it ended before you pick.\n\n" +
              "Which question would you like to start with?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Concept reply about percent change and its base, no Widget: once the step's scene was shown, code adds the Lingo card for "percent change". */
  "concept-percent-change": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A percent change compares the move with where the rate started. Traders call that starting rate the base. " +
              "A small move on a low base is a big percent change, which is why headlines and traders can sound so different.\n\n" +
              "Which rate is the base when a rate moves from its old level to a new one?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Your turn reply about the open Quick try's idea (the reporter's plain gap, in percentage points), no Widget. */
  "your-turn-reply": {
    step: "your_turn",
    replies: [
      {
        content: [
          text(
            "Think like the reporter in the story. She writes the plain gap between the old rate and the new one in percentage points. " +
              "That gap is not a percent change, so you do not need the base here.\n\n" +
              "Have a go at the Quick try below.",
          ),
        ],
      },
    ],
  },
  /** E4a: a Reveal reply about the size of the Fed's move (a quarter point), no Widget. */
  "reveal-reply": {
    step: "reveal",
    replies: [
      {
        content: [
          text(
            "On 4 February 1994 the Fed moved by a quarter point. No number was announced, but traders read the federal funds rate going from about 3% to 3.25%. " +
              "A quarter point looks small on paper. Bond prices still fell over the following weeks as borrowed money rushed out of long bonds, " +
              "and that spring became known as the great bond massacre.\n\n" +
              "Why do you think such a small move shook the bond market so hard?",
          ),
        ],
      },
    ],
  },
  /**
   * reveal-reply with a Widget the Tutor shows itself (a Lingo card for "quarter point"): the late opener of
   * e2e/reply-landed.spec.ts, which needs an opener that brings a Widget now that code adds none to it (B6, ADR 0008).
   */
  "reveal-reply-widget": {
    step: "reveal",
    replies: [
      {
        content: [
          {
            type: "tool_use",
            id: "toolu_e2e_reveal_lingo",
            name: "show_widget",
            input: {
              recipe: "lingo_card",
              params: {
                title: "Lingo: quarter point",
                // No figures: an open quiz's Blocked numbers would keep the card off the screen (V5).
                inputs: { term: "Quarter point", pro: "The Fed moved by a quarter point.", means: "One quarter of a percentage point.", example: "A small rate move that papers write as a quarter point.", emoji: "bank" },
                refs: {},
                facts: {},
              },
            },
          },
        ],
      },
      {
        content: [
          text(
            "On 4 February 1994 the Fed moved by a quarter point. No number was announced, but traders read the federal funds rate going from about 3% to 3.25%. " +
              "A quarter point looks small on paper. Bond prices still fell over the following weeks as borrowed money rushed out of long bonds, " +
              "and that spring became known as the great bond massacre.\n\n" +
              "Why do you think such a small move shook the bond market so hard?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Story reply about the bond trader, who speaks in basis points, no Widget. */
  "story-trader": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "The bond trader in this story speaks in basis points. A basis point is one hundredth of a percentage point, so he can name even a tiny move exactly. " +
              "Tomorrow, whatever the Fed does, he will say it in basis points before anyone else.\n\n" +
              "Why might a trader want such a small unit?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Story reply about what the Fed is deciding (a rate hike or not), no Widget. */
  "story-hike": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "The Fed is deciding whether to make a rate hike: to lift the rate it sets, so that borrowing costs more. " +
              "Its rate has sat still for more than a year, and many traders have borrowed cheaply to hold long-term bonds. A hike would make that borrowing dearer.\n\n" +
              "What do you think a hike would do to those traders?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Concept reply about one move with two names (the trader's and the reporter's), no Widget. */
  "concept-two-ways": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "It is one move with two names. The trader says it in basis points, because the unit is small and exact. " +
              "The reporter says it in points, because readers find that easier. Neither is wrong: both describe the very same move.\n\n" +
              "Which name would you use on the phone to a trader?",
          ),
        ],
      },
    ],
  },
  /**
   * Spec 2026-11-12 A1 (Done when: a rejected draft and an accepted retry, then three normal turns, in a browser test):
   * a first draft of about 150 words that the Concept step's 80-word cap rejects, then a short retry that passes.
   */
  "rejected-draft": {
    step: "concept",
    replies: [{ content: [text(`${"Money today is worth more than money later, because you can use it now. ".repeat(11).trim()}\n\nWhich would you pick?`)] }],
    // The gate's retry is a second run of the Tool Runner in the same turn: it plays these.
    retry: [
      {
        content: [
          text(
            "It is one move with two names. The trader says it in basis points, because the unit is small and exact. " +
              "The reporter says it in points, because readers find that easier. Neither is wrong: both describe the very same move.\n\n" +
              "Which name would you use on the phone to a trader?",
          ),
        ],
      },
    ],
  },
  /**
   * Spine Topic 1 (spine-01-worth), played whole through the page by e2e/spine-01.spec.ts: one script per Tutor Turn
   * the play passes through, in order. Every number is the Case's or the valuation engine's ($84 price, $1,117m of sales,
   * a $410m operating loss, his $35.08 a share, $39bn of sales in year 10, a 10% margin, $3 of sales per $1 invested, a
   * 12.84% cost of capital, the $14.88 low of the fourth quarter; $60bn and 12.5% is the story worth $84). The replies at
   * the Check step hold no number and no choice's words, so they never touch an open quiz (V5).
   */
  /** The opener at Story: the Case's setting, ending on whether the price is fair. */
  "spine1-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "February 2000. Amazon sells books and music online, and its shares cost $84. " +
              "In the twelve months to September 1999 it sold $1,117 million and lost $410 million on its operations. " +
              "A professor in New York, Aswath Damodaran, writes down what he thinks its future looks like: " +
              "how big it gets, what it keeps of each sale, what its growth costs and how risky it is. " +
              "Buyers are paying for a future nobody has seen yet.\n\n" +
              "Would you call $84 a fair price for a company that loses money?",
          ),
        ],
      },
    ],
  },
  /** Concept (the quiz Check's): price against value, and the four levers of his story. Code shows the Concept card. */
  "spine1-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A price is what buyers pay for a share today. A value is what the business's future cash is worth today, argued from a story. " +
              "His story sets four levers: about $39 billion of sales in year 10, 10% of each sale kept, $3 of sales for each $1 invested, and a 12.84% cost of capital.\n\n" +
              "Which of the four levers do you trust least?",
          ),
        ],
      },
    ],
  },
  /** Explore: the Tutor opens the Value levers Workbench (the Topic's explore.workbench) and asks the Insight question. */
  "spine1-explore": {
    step: "explore",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_spine1_levers", name: "show_widget", input: { recipe: "value_levers", params: SPINE_ONE_LEVERS } }] },
      {
        content: [
          text(
            "Here is his story as four levers. At his settings it comes to $35 a share, well under the $84 price. " +
              "Each lever is one part of the story: how big Amazon gets, what it keeps, what growth costs and how risky it is.\n\n" +
              "Which story would make Amazon worth the price, and what did you change to get there?",
          ),
        ],
      },
    ],
  },
  /** Explore, after the Learner's words: the Tutor records the Insight as found, quoting them, and confirms it. */
  "spine1-insight": {
    step: "explore",
    replies: [
      {
        content: [
          { type: "tool_use", id: "toolu_e2e_spine1_insight", name: "record_insight_attempt", input: { outcome: "found", learner_words: SPINE_ONE_INSIGHT_WORDS } },
        ],
      },
      {
        content: [
          text(
            'You said the price "needs a much bigger Amazon that keeps more of each sale", and that is it. ' +
              "Sales of $60bn and a 12.5% margin reach $84, while his story of $39bn and 10% stays near $35. " +
              "The cost of capital alone could not close that gap.\n\n" +
              "Which of your two changes feels harder to believe?",
          ),
        ],
      },
    ],
  },
  /** Your turn of the quiz Check: code posts the Quick tries; the reply points to them. */
  "spine1-your-turn": {
    step: "your_turn",
    replies: [
      {
        content: [
          text(
            "Now a few quick ones on telling a price from a value, and on which lever a piece of news moves. " +
              "Each has choices to tap, and the first has its first step done for you.\n\n" +
              "Have a go at the Quick try below.",
          ),
        ],
      },
    ],
  },
  /** The follow-up once Your turn is done: the quiz Check is open, so no number and no choice's words. */
  "spine1-quiz-open": {
    step: "check",
    replies: [
      {
        content: [
          text(
            "Your turn is done. The Check tab now holds a few questions on telling price from value and on the four levers. " +
              "Read each story slowly before you pick.\n\n" +
              "Which lever do you feel least sure about?",
          ),
        ],
      },
    ],
  },
  /** Concept of the conversation Check, reached after the quiz pass: a story only holds when its parts fit. */
  "spine1-talk-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A story only holds when its parts fit together. Fast growth needs warehouses and systems paid for first, and a young company is risky. " +
              "When the price and your value differ, ask what story the price assumes before you call it wrong.\n\n" +
              "Which part of his story would you argue about first?",
          ),
        ],
      },
    ],
  },
  /** Your turn of the conversation Check (it has no Quick tries): getting ready to tell the story. */
  "spine1-talk-your-turn": {
    step: "your_turn",
    replies: [
      {
        content: [
          text(
            "Soon you will tell Amazon's story yourself. A good story names how big it gets and what it keeps, then what growth costs or how risky it is. " +
              "Doubting one lever, with a reason, is part of a good valuation.\n\n" +
              "Which lever would you doubt most, and why?",
          ),
        ],
      },
    ],
  },
  /** The conversation Check's prompt, at its Check step. */
  "spine1-talk-prompt": {
    step: "check",
    replies: [
      {
        content: [
          text(
            "Time to put it in your own words. A strong answer sets a size, a margin and either a cost of growth or a risk, " +
              "ties the value to that story, and treats the gap to the price as a question.\n\n" +
              "Which lever are you least sure of, and how does Amazon's story go as you would set it?",
          ),
        ],
      },
    ],
  },
  /** The Learner told the story: the Tutor records the pass as the real Tutor does, with record_check_verdict. */
  "spine1-talk-pass": {
    step: "check",
    replies: [
      {
        content: [
          {
            type: "tool_use",
            id: "toolu_e2e_spine1_verdict",
            name: "record_check_verdict",
            input: {
              check_id: "worth-talk",
              verdict: "pass",
              reasons: "Gives a size, a margin and a cost of growth and a risk; ties the value to that story; names the margin as uncertain with a reason; reads the price as a question, not proof.",
            },
          },
        ],
      },
      {
        content: [
          text(
            "That story holds together: a size, a margin, what growth costs and a risk, with the value tied to them. " +
              "Doubting the margin is fair, since Amazon was still losing money. And you read the price as a question about the story it needs.\n\n" +
              "Shall we see what the price did next?",
          ),
        ],
      },
    ],
  },
  /** Reveal: what the price did in 2000, from the Case's reveal. */
  "spine1-reveal": {
    step: "reveal",
    replies: [
      {
        content: [
          text(
            "His story came to $35.08 a share against the $84 price. The $84 was already below the year's high: " +
              "a month earlier, in early January 2000, the shares had traded as high as $91.50. The price fell through 2000: " +
              "by the fourth quarter the shares had been as low as $14.88. " +
              "Neither number proves the other wrong. A price is what buyers paid that day, and a value is what one story about the business is worth.\n\n" +
              "Why might the price swing so far while his story stayed put?",
          ),
        ],
      },
    ],
  },
  /** Principle: the rule to keep. */
  "spine1-principle": {
    step: "principle",
    replies: [
      {
        content: [
          text(
            "Here is the rule to keep. A value is a story set as four levers: how big it gets, what it keeps, what growth costs and how risky it is. " +
              "When a price and your value differ, ask what the price assumes before you call it wrong. " +
              "In February 2000 the $84 price assumed about $60bn of sales and a 12.5% margin, far more than his story.\n\n" +
              "Which lever would you look at first in the next company you meet?",
          ),
        ],
      },
    ],
  },
  /** Complete this Topic: the closing reply in the passed Topic's Session. */
  "spine1-complete": {
    step: "principle",
    replies: [
      {
        content: [
          text(
            "You have finished this Topic. You can tell a price from a value, set a story as four levers, and read a price back as the story it needs.\n\n" +
              "Which company would you like to value next?",
          ),
        ],
      },
    ],
  },
  // ——— The split of Topic 7 (#91, e2e/spine-rate-split.spec.ts): the first three turns of the risk Topic (the cost of
  // equity) and of the cost-of-capital Topic, for the critics' round. Every figure is its Topic file's Case.
  /** The risk Topic's opener at Story: what Amazon's shareholders should require. */
  "rate-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "February 2000. Amazon's shares cost $84, and Aswath Damodaran, a valuation professor in New York, is valuing the company. " +
              "To value its future cash he needs the return its shareholders should require, for waiting and for the risk they bear. " +
              "A safe US Treasury bond pays 6.5%. Amazon's shares swing far more than the market does: his own rough measure says 2.29 times as much, " +
              "while internet retailers average 1.60.\n\n" +
              "Would you ask more of Amazon's shares than of a safe bond?",
          ),
        ],
      },
    ],
  },
  /** The risk Topic's Concept: the cost of equity in layers. Code shows the Concept card. */
  "rate-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "What shareholders require is the cost of equity, and it is built in layers. " +
              "Start with what a safe bond pays, 6.5%. Add the premium investors want for holding average shares, 4%, scaled by how far Amazon's shares move with the market, its beta of 1.60. " +
              "Only the risk that holding many shares cannot spread away earns that premium.\n\n" +
              "Which layer looks hardest to pin down?",
          ),
        ],
      },
    ],
  },
  /** The risk Topic's Explore: the Cost of capital stack on Amazon's Case, and the Insight question. */
  "rate-explore": {
    step: "explore",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_rate_stack", name: "show_widget", input: { recipe: "wacc_stack", params: { title: "What rate for Amazon?", inputs: { figures: { riskFree: 6.5, equityPremium: 4, relativeRisk: 1.6, debtShare: 1.2, costOfDebt: 8, taxRate: 0 }, source: { title: "Damodaran, The Dark Side of Valuation: Can Amazon.com be valued? (valuation done February 2000)", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf" }, case: "spine-07-amazon-rate" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here are his layers as a stack, with what a share is worth at that rate. Amazon borrows almost nothing, so the whole rate is nearly its cost of equity. " +
              "Move relative risk up to his rough measure, then down to a plain retailer's, and watch the value against the $84 price.\n\n" +
              "How far does the value move, next to how far it is from the price?",
          ),
        ],
      },
    ],
  },
  /** The cost-of-capital Topic's opener at Story: lenders put in some of the money too. */
  "coc-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "February 2000. Damodaran has worked out what Amazon's shareholders should require: 12.90% a year. " +
              "But lenders put in some of Amazon's money too, and they charge interest, 8% a year before tax. " +
              "Their part is tiny, only 1.2% of the money. Amazon makes losses, so its interest saves it no tax yet. " +
              "By year ten he expects it to borrow like a traditional retailer, 15% of its money.\n\n" +
              "Whose return do you think matters most for the rate on all of Amazon's money?",
          ),
        ],
      },
    ],
  },
  /** The cost-of-capital Topic's Concept: the blend, the tax saving, and the WACC named once. Code shows the Concept card. */
  "coc-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "The cost of capital blends what shareholders and lenders each require, by how much of the money each puts in. " +
              "Debt counts after its tax saving: interest comes off profit before tax, so a company that pays tax pays less for each dollar of interest. " +
              "Analysts call this blend the WACC, short for weighted average cost of capital.\n\n" +
              "Why might lenders ask for less than shareholders do?",
          ),
        ],
      },
    ],
  },
  /** The cost-of-capital Topic's Explore: the stack at mature Amazon's figures, and the Insight question. */
  "coc-explore": {
    step: "explore",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_coc_stack", name: "show_widget", input: { recipe: "wacc_stack", params: { title: "What does mature Amazon's money cost?", inputs: { figures: { riskFree: 6.5, equityPremium: 4, relativeRisk: 1, debtShare: 15, costOfDebt: 7, taxRate: 35 }, source: { title: "Damodaran, The Dark Side of Valuation: Can Amazon.com be valued? (valuation done February 2000), year 10 of his cost of capital table", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf" } }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here is his mature Amazon of year ten: shareholders require 10.50%, and debt is 15% of its money at 4.55% after tax. " +
              "Move the share of debt down to none, then back up to where he set it.\n\n" +
              "How far does the cost of capital move, and why so little?",
          ),
        ],
      },
    ],
  },
} satisfies Record<string, { step: StepKind; replies: ScriptedReply[]; retry?: ScriptedReply[] }>;

export type E2eScriptName = keyof typeof E2E_SCRIPTS;

export const DEFAULT_E2E_SCRIPT: E2eScriptName = "plain-reply";

export function isE2eScript(name: unknown): name is E2eScriptName {
  return typeof name === "string" && Object.hasOwn(E2E_SCRIPTS, name);
}

/** The finished reply a script gives, as the reply checks read it: its text and the Widgets its tool calls show. */
export function draftOf(name: E2eScriptName): ReplyDraft {
  const blocks = (E2E_SCRIPTS[name].replies as ScriptedReply[]).flatMap((r) => ("content" in r ? r.content : []));
  const textOf = blocks.filter((b) => b.type === "text").map((b) => String(b.text));
  const widgets: ReplyWidget[] = blocks
    .filter((b) => b.type === "tool_use" && b.name === "show_widget")
    .map((b) => {
      const input = b.input as { recipe: string; params?: Record<string, unknown> };
      return { kind: "recipe", id: input.recipe, params: input.params };
    });
  return { text: textOf.join("\n\n"), widgets };
}

declare global {
  var __faE2eScript: E2eScriptName | undefined;
  var __faE2eTurnCount: number | undefined;
}

/**
 * A fresh copy of a script's replies for one Tutor Turn, with every tool_use id made unique to this play:
 * tool calls are recorded once per tool-call id across the whole database (`once` in src/tutor/tools.ts), so
 * replaying a script's fixed ids in a later Session would store no second Widget.
 */
export function freshScriptReplies(name: E2eScriptName, retry = false): ScriptedReply[] {
  const play = (globalThis.__faE2eTurnCount = (globalThis.__faE2eTurnCount ?? 0) + 1);
  const script = E2E_SCRIPTS[name] as { replies: ScriptedReply[]; retry?: ScriptedReply[] };
  const replies = structuredClone(retry && script.retry ? script.retry : script.replies) as ScriptedReply[];
  for (const reply of replies) {
    if (!("content" in reply)) continue;
    for (const block of reply.content) {
      if (block.type === "tool_use" && typeof block.id === "string") block.id = `${block.id}-p${play}`;
    }
  }
  return replies;
}

/** Chooses the script the next Tutor Turns play. */
export function chooseE2eScript(name: E2eScriptName): void {
  globalThis.__faE2eScript = name;
}

export function currentE2eScript(): E2eScriptName {
  return globalThis.__faE2eScript ?? DEFAULT_E2E_SCRIPT;
}

/**
 * The Tutor client of the test bed: each run of the Tool Runner (each Tutor Turn, and each gate retry) plays a fresh
 * copy of the chosen script, so its tool calls and replies come back in order however many steps the run takes.
 */
export function e2eTutorClient(): ModelClient {
  // A script with a `retry` plays it from the turn's second run on (the reply gate's retry, spec A1's browser test).
  let runs = 0;
  const fresh = () => scriptedClient(freshScriptReplies(currentE2eScript(), runs++ > 0)).client;
  let current: ModelClient | undefined;
  return {
    forRun: fresh,
    step: (request, options) => (current ??= fresh()).step(request, options),
    compact: (request, options) => (current ??= fresh()).compact(request, options),
  };
}
