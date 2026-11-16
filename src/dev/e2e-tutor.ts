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

/** Spine Topic 1's explore Workbench (its Topic file's explore.workbench), as the Tutor shows it with show_widget. */
const SPINE_ONE_LEVERS = {
  title: "Amazon, February 2000: the four levers",
  inputs: { case: "spine-01-amazon-2000", caseStory: "Damodaran's story", priceStory: { revenue: 60, margin: 12.5 } },
  refs: {},
  facts: {},
};

/** The report's page beside the annual report Topic's Value bridge, copied from its Topic file as the Tutor copies it (ADR 0010). */
const AR_REPORT = {
  title: "Amazon's 10-K for 2000",
  lines: [
    { line: "Long-term debt", amount: 2127, lever: "debt" },
    { line: "Cash and marketable securities", amount: 1101, lever: "cash" },
    { line: "Loss from operations", amount: 864 },
  ],
  source: {
    title: "Amazon.com Form 10-K405 for 2000, Consolidated Balance Sheets and Statements of Operations",
    url: "https://www.sec.gov/Archives/edgar/data/1018724/000103221001500087/d10k405.txt",
  },
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
   * the play passes through, in order. Every number is the Case's or the valuation engine's, rounded as the Topic
   * rounds them for a beginner where the Learner reads one to answer ($84 price, about $1.1bn of sales, about a $400m
   * operating loss, $39bn of sales in year 10, a 10% margin, $3 of sales per dollar invested, a cost of capital near 13%;
   * the reveal keeps its exact $35.08, $91.50 and $14.88). The Learner types
   * nothing: the Insight and both Checks are taps (ticket #88). The replies at
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
              "A share is one small slice of the company. In the twelve months to September 1999 it sold about $1.1 billion of goods and lost about $400 million on its operations. " +
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
              "His story sets four levers: about $39 billion of sales in year 10, 10% of each sale kept, $3 of sales for each dollar invested, and a cost of capital near 13%.\n\n" +
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
              "Find a story worth the price in the Workbench, then tap below what you had to change to get there.",
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
  /** Concept of the judging Check (worth-talk), reached after the quiz pass: a story only holds when its parts fit. */
  "spine1-talk-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A story only holds when its parts fit together. Fast growth needs warehouses and systems paid for first, and a young company is risky. " +
              "When a price and a value differ, ask what story the price assumes before you call it wrong.\n\n" +
              "Which part of his story would you argue about first?",
          ),
        ],
      },
    ],
  },
  /** Your turn of the judging Check (it has no Quick tries): getting ready to judge other people's stories. */
  "spine1-talk-your-turn": {
    step: "your_turn",
    replies: [
      {
        content: [
          text(
            "Next you will judge other people's stories about Amazon: a headline's, an analyst's, a founder's and a fan's. " +
              "For each, ask whether it is a price someone paid or a value someone argued, and which lever it moves.\n\n" +
              "Which lever would you check first in a story you read?",
          ),
        ],
      },
    ],
  },
  /** The judging Check's step: its questions are in the Check tab, so no number and no choice's words. */
  "spine1-talk-prompt": {
    step: "check",
    replies: [
      {
        content: [
          text(
            "The Check tab now holds a few stories other people tell about Amazon. " +
              "Read each one slowly, then tap your judgement.\n\n" +
              "Which kind of story do you find hardest to judge?",
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
  /**
   * Go deeper at the Concept step (spec #68): the Tutor gives Topic 1's Go deeper material, in the Topic file's own words
   * (src/dev/e2e-tutor.test.ts holds the two together), then an invitation.
   */
  "spine1-go-deeper": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Behind the four levers sits one sum that code does for you. " +
              "Each year's cash is worth less the further away it is, so code shrinks every future year's cash by the cost of capital and adds the years up. " +
              "Take away what the company owes and what it has promised its staff, split the rest over its shares, and you have a value for one share.\n\n" +
              "Why might a higher cost of capital shrink the far years most?",
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
              "When a price and a value differ, ask what the price assumes before you call it wrong. " +
              "In February 2000 the $84 price assumed far more sales and a fatter margin than his story.\n\n" +
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
              "Which headline would you like to judge next?",
          ),
        ],
      },
    ],
  },
  /**
   * Spine Topics 2 and 3 for beginners (#89, e2e/spine-02-03.spec.ts): the first three Tutor Turns of each, Story, Concept
   * and Explore, played for the critics' screenshots and transcript. Their figures are each Topic file's Case figures; code
   * opens each Topic's explore Widget, so the explore replies only point at it.
   */
  "spine2-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "October 2018. One ticket sold in South Carolina matches all six numbers of the Mega Millions lottery. " +
              "The advertised jackpot is $1.537 billion, paid as 30 yearly payments that grow a little each year. " +
              "Or the winner can take one cash payment of about $877.8 million now. " +
              "Nobody knows yet who holds the ticket, or which way they will choose.\n\n" +
              "Why do you think the cash is so much smaller than the jackpot?",
          ),
        ],
      },
    ],
  },
  "spine2-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Money in your hand today can sit in the bank and grow, so money promised later is worth less today. " +
              "That is its present value: what a later payment is worth in today's money. " +
              "The longer the wait, or the higher the rate, the less a later payment is worth today.\n\n" +
              "Which of the 30 payments do you think is worth least today?",
          ),
        ],
      },
    ],
  },
  "spine2-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here are the 30 payments, with a slider for the interest rate. At no interest at all they are worth the full advertised total. " +
              "As you raise the rate, the later payments shrink, and the far-off ones shrink the most.\n\n" +
              "Is there a rate where the payments are worth the same as the cash?",
          ),
        ],
      },
    ],
  },
  "spine3-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "April 2001. Webvan, an online grocer, files its report for 2000. " +
              "Its sales grew from $13.3 million in 1999 to $178.5 million in 2000. " +
              "Yet running the business used $263.1 million more cash than its sales brought in, and $259.8 million more went on warehouses and equipment. " +
              "About $212 million is left.\n\n" +
              "Where do you think all that cash went?",
          ),
        ],
      },
    ],
  },
  "spine3-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Free cash flow is the cash left after paying for growth. " +
              "Growth is paid for first: the warehouses, vans and groceries that more sales need are bought before those sales arrive. " +
              "So a business can make a profit on each sale and still run short of cash.\n\n" +
              "Which grocer would you expect to use more cash: one growing fast, or one standing still?",
          ),
        ],
      },
    ],
  },
  "spine3-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here is Webvan's 2000 as a waterfall, from sales down to free cash flow. " +
              "Suppose Webvan made a small profit on each sale (it really lost money on most): free cash flow is still far below zero.\n\n" +
              "What happens to free cash flow when you move growth down?",
          ),
        ],
      },
    ],
  },
  // ——— The annual report Topic (#93, e2e/spine-annual-report.spec.ts): its first three turns, for the critics' round. Every
  // figure is its Topic file's Amazon Case (Amazon's 10-K for 2000 next to Damodaran's story of February 2000).
  /** The opener at Story: Amazon's 10-K is out, and six numbers matter. */
  "ar-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "March 2001. Amazon files its annual report for 2000. A year earlier Aswath Damodaran, a valuation professor in New York, said a share was worth $35.08 while it sold for $84. " +
              "Now the report is out. Was he right?\n\n" +
              "What would you look for first in it?",
          ),
        ],
      },
    ],
  },
  /** The Concept: two pages hold the six numbers, and names change from report to report. Code shows the Concept card. */
  "ar-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Two pages hold a valuation's numbers. The income statement runs from sales down to operating profit, what the business makes before interest and tax, then tax. " +
              "The balance sheet shows debt and cash on one day; its note on share capital counts the shares. " +
              "Names change: Zomato calls sales revenue from operations. " +
              "Japan, Korea and Europe keep the same two pages, in Nintendo's yearly results, Samsung's business report and LVMH's annual report.\n\n" +
              "Where would you look for Amazon's debt?",
          ),
        ],
      },
    ],
  },
  /** The Explore: the Value bridge on the Topic's Amazon Case, and the Insight question. */
  "ar-explore": {
    step: "explore",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_ar_bridge", name: "show_widget", input: { recipe: "value_bridge", params: { title: "Put Amazon's 2000 report into the bridge", inputs: { case: "spine-ar-amazon-2000", report: AR_REPORT }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here is his bridge from Amazon's business to one share, with the report's page beside it. " +
              "The 2000 report shows about $2.1 billion of debt and $1.1 billion of cash. Tap each on the page, or slide debt to $2.1bn and cash to $1.1bn, and watch one share.\n\n" +
              "Does a share move a lot or a little, and is that what his value rested on?",
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
  // ——— Spine Topics 4 to 9 for beginners (#95, e2e/spine-04-09.spec.ts): the first three turns of the growth, margins,
  // growth-cost and far-future Topics, for the critics' round. Every figure is its Topic file's Case. Code opens each
  // Topic's explore Workbench, so the explore replies only point at it.
  /** The growth Topic's opener at Story: a professor's value against the venture price. */
  "growth-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "June 2014. Venture investors put $1.2 billion into Uber at a price of $17 billion for the whole company. " +
              "Days later Aswath Damodaran, a valuation professor, valued it at about $5.9 billion as a car-service company. " +
              "His story: taxis and car services take about $100 billion of fares a year, Uber wins 10% of them, and it keeps 20% of each fare. " +
              "An investor answers that the market is far bigger once people give up owning cars.\n\n" +
              "Who do you think is right about how big Uber can get?",
          ),
        ],
      },
    ],
  },
  /** The growth Topic's Concept: market, share and slice. Code shows the Concept card. */
  "growth-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "Revenue years from now is a story in three parts: the total market, the market share the company wins, and its take rate, the slice of each sale it keeps. " +
              "A market can be taxis today, or every trip people take instead of driving. " +
              "A young company has small revenue now, so the market it can win moves its value most.\n\n" +
              "Which of the three parts would you argue about first?",
          ),
        ],
      },
    ],
  },
  /** The growth Topic's Explore: Value levers in market mode, opened by code. */
  "growth-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here are Damodaran's levers for Uber, starting from his story: a fifth of $100 billion of fares, growing 6% a year. " +
              "Keep everything else where he set it and switch to the market three times bigger, then watch the value against the venture price.\n\n" +
              "What are the professor and the investors really disagreeing about?",
          ),
        ],
      },
    ],
  },
  /** The margins Topic's opener at Story: what will Tesla keep? */
  "margins-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "February 2020. Tesla sold $24.6 billion of cars and more in 2019, and kept almost none of it as operating profit. " +
              "Its shares closed at $748.96, while Damodaran had valued it at about $427 a share. " +
              "In 2019 the median global carmaker kept 3.01% of its sales, and Toyota, the best of the large ones, kept 8.46%. " +
              "The median technology company kept 10.25%.\n\n" +
              "Is Tesla a carmaker or a technology company, do you think?",
          ),
        ],
      },
    ],
  },
  /** The margins Topic's Concept: what a company keeps, and what rivals let it keep. Code shows the Concept card. */
  "margins-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "The operating margin is the share of each sale a company keeps after its running costs, before interest and tax. " +
              "When a business keeps a lot, rivals copy it and cut prices, so margins drift towards the industry median. " +
              "Staying above every rival needs a competitive edge they cannot copy, such as a brand or software.\n\n" +
              "What edge might let Tesla keep more than other carmakers?",
          ),
        ],
      },
    ],
  },
  /** The margins Topic's Explore: Value levers with margin marks, opened by code. */
  "margins-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here are Damodaran's levers for Tesla, with marks on the margin lever for what others keep: the median carmaker, Toyota, the median technology company. " +
              "Move what Tesla keeps from one mark to the next and watch the value against the price of the day.\n\n" +
              "What kind of company does that price ask Tesla to be?",
          ),
        ],
      },
    ],
  },
  /** The growth-cost Topic's opener at Story: Webvan's plan to build more centres. */
  "gcost-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "March 2000. Webvan, an online grocer, delivers from one centre in Oakland built for the volume of about 18 supermarkets, and it runs at under 25% of that. " +
              "In 1999 it sold $13.3 million and lost $144.6 million. " +
              "Its plan is up to 26 more centres over three years, at $30 million to $35 million each. " +
              "Webvan says a full centre would keep 12% of its sales as operating profit, where a supermarket keeps about 4%.\n\n" +
              "Would you lend Webvan the money for the next centre?",
          ),
        ],
      },
    ],
  },
  /** The growth-cost Topic's Concept: reinvestment and the return on capital. Code shows the Concept card. */
  "gcost-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A company cannot grow for free: more sales need warehouses, trucks and systems first. " +
              "The money it puts back is its reinvestment; sales to capital says how many dollars of new sales each dollar brings. " +
              "Growth adds value only when the return on capital is above what that money costs. Below it, growing faster loses more.\n\n" +
              "What would you want to know about a new Webvan centre before it is built?",
          ),
        ],
      },
    ],
  },
  /** The growth-cost Topic's Explore: Value levers in return-on-capital mode, opened by code. */
  "gcost-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here is Webvan on its own claims, with levers for growth, margin and sales for each dollar invested. " +
              "Make Webvan bigger, then try again with a supermarket's margin and the fewest sales for each dollar.\n\n" +
              "When does getting bigger help Webvan's shareholders?",
          ),
        ],
      },
    ],
  },
  /** The far-future Topic's opener at Story: Amazon's years after the forecast. */
  "far-story": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "February 2000. Amazon's shares cost $84, and Damodaran forecasts its cash for ten years. " +
              "In his story Amazon spends heavily to grow, loses cash in each of the first six years, and only turns cash-positive in year 7. " +
              "Nobody can forecast year 11, year 30 or year 60 one by one, so for everything after year 10 he sets a few things once: Amazon grows 6% a year for ever, and investors want 9.61% a year.\n\n" +
              "Where do you think most of his value comes from: the ten years he forecasts, or the years after?",
          ),
        ],
      },
    ],
  },
  /** The far-future Topic's Concept: terminal value. Code shows the Concept card. */
  "far-concept": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A forecast period covers a few years, usually ten, but a business can run for decades. " +
              "Terminal value packs every later year into one lump at year 10, brought back to today like any other cash. " +
              "Two settings drive it: stable growth, which cannot beat the economy for ever, and the cost of capital after year 10.\n\n" +
              "Why might growth for ever have to be modest?",
          ),
        ],
      },
    ],
  },
  /** The far-future Topic's Explore: the terminal seesaw on Amazon's Case, opened by code. */
  "far-explore": {
    step: "explore",
    replies: [
      {
        content: [
          text(
            "Here is Amazon's value as a seesaw: the forecast years on one side, the years after the tenth on the other. " +
              "Look at where the weight sits, then move the two far-future settings and watch both sides.\n\n" +
              "Which side of the seesaw holds more of Amazon's value?",
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
