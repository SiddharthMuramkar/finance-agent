import { describe, expect, it } from "vitest";
import { guardSentence, StreamGuard, tellsToBuyOrSell, type GuardFacts } from "./stream-guard";

/**
 * The stream guard (spec 2026-11-12, A5; ADR 0006): an own-question reply shows sentence by sentence, and a sentence
 * holding a Blocked number, a line telling the Learner to buy, sell or hold something, or an internal word or id never
 * shows. The sentences below are the spec's and ADR 0006's, and lines a Tutor reply about the Percent Topic would hold.
 */

const facts: GuardFacts = { blockedNumbers: [], internalWords: ["num-percent-bps", "pb-check-1"] };

/** Streams the text in pieces of `size` characters and gathers what the guard shows, and its hit. */
function stream(text: string, size: number, f: GuardFacts = facts) {
  const guard = new StreamGuard(f);
  let shown = "";
  const after: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const step = guard.push(text.slice(i, i + size));
    shown += step.show;
    after.push(shown);
    if (step.hit) return { shown, hit: step.hit, after };
  }
  const end = guard.end();
  return { shown: shown + end.show, hit: end.hit, after };
}

describe("a sentence that tells the Learner to buy, sell or hold something", () => {
  it.each(["You should buy HDFC Bank now", "Sell it.", "I'd hold your shares", "Buy.", "Don't sell your HDFC Bank shares.", "If I were you, I would buy.", "My advice: sell.", "Now is a good time to buy.", "Yes, buy it.", "You shouldn't sell before the results.", "**Hold.**"])(
    "hits: %s",
    (sentence) => {
      expect(tellsToBuyOrSell(sentence)).toBe(true);
    },
  );

  it.each([
    "Value It does not say what to buy or sell.",
    "Nobody here tells you to buy or sell.",
    "Traders who bought in 2018 watched the price fall.",
    "Bond traders, people who buy and sell loans to governments, waited for the Fed.",
    "If you buy a bond at ₹100, it pays ₹5 a year.",
    "Buy a bond at ₹100 and you get ₹5 a year.",
    "Hold on: there is one more idea.",
    "Hold the rate at 4% and move the years.",
    "Banks must hold reserves at the central bank.",
    "Nobody knows the right time to sell.",
    "Buy-and-hold investors kept their shares through 2008.",
    "Short answer: a basis point is a hundredth of a percentage point.",
    "In 2020 many people sold in March and missed the rise.",
  ])("does not hit: %s", (sentence) => {
    expect(tellsToBuyOrSell(sentence)).toBe(false);
  });
});

describe("guardSentence", () => {
  it("stops on a Blocked number, in any form the quiz could hold it", () => {
    const f = { ...facts, blockedNumbers: ["0.6", "60"] };
    expect(guardSentence("That move is 60 basis points.", f)).toMatchObject({ rule: "blocked_number" });
    expect(guardSentence("A rate up 0.60 of a point.", f)).toMatchObject({ rule: "blocked_number" });
    expect(guardSentence("A rate up 25 basis points.", f)).toBeNull();
  });

  it("stops on an internal id or word, and lets the app words a Learner uses through", () => {
    expect(guardSentence("This is Check pb-check-1 of the Topic.", facts)).toMatchObject({ rule: "internal_word" });
    expect(guardSentence("Code recorded your answer.", facts)).toMatchObject({ rule: "internal_word" });
    expect(guardSentence("You are on the your_turn step.", facts)).toMatchObject({ rule: "internal_word" });
    expect(guardSentence("The Course Map lists every Topic, and you can open any of them from there.", facts)).toBeNull();
    expect(guardSentence('Press "I know this: quiz me" on the Topic Start card to take its Check now.', facts)).toBeNull();
    expect(guardSentence("Your notes are in the Notebook, and the Theme is in Settings.", facts)).toBeNull();
  });

  it("stops on a line telling the Learner to buy", () => {
    expect(guardSentence("You should buy HDFC Bank now.", facts)).toMatchObject({ rule: "advice" });
  });
});

describe("StreamGuard", () => {
  const reply = "Value It does not say what to buy or sell. A rate cut lowers what banks pay to borrow.\n\nIn 2019 the RBI cut its rate five times.";

  it("shows whole sentences only, joining up to exactly the text it was given", () => {
    for (const size of [1, 3, 7, 40, reply.length]) {
      const { shown, hit, after } = stream(reply, size);
      expect(hit).toBeUndefined();
      expect(shown).toBe(reply);
      // Nothing is shown before its sentence has ended: every point the Learner saw ends a sentence or a line.
      for (const seen of after.filter(Boolean)) expect(seen).toMatch(/(?:[.!?]\s+|\n)$/);
    }
  });

  it("holds the first sentence until it ends, then shows it before the rest is written", () => {
    const guard = new StreamGuard(facts);
    expect(guard.push("Value It does not say what to").show).toBe("");
    expect(guard.push(" buy or sell. A rate").show).toBe("Value It does not say what to buy or sell. ");
    expect(guard.end().show).toBe("A rate");
  });

  it("stops at the sentence that tells the Learner to buy: what came before stays, the sentence and all after it never show", () => {
    const text = "A rate cut lowers what banks pay to borrow. You should buy HDFC Bank now. It will rise.";
    for (const size of [1, 5, 1000]) {
      const { shown, hit } = stream(text, size);
      expect(shown).toBe("A rate cut lowers what banks pay to borrow. ");
      expect(hit).toMatchObject({ rule: "advice", sentence: "You should buy HDFC Bank now. " });
    }
  });

  it("tests the last sentence at the end of the reply, with no space after it", () => {
    const { shown, hit } = stream("A rate cut lowers what banks pay to borrow. Buy.", 4);
    expect(shown).toBe("A rate cut lowers what banks pay to borrow. ");
    expect(hit?.rule).toBe("advice");
  });

  it("keeps a Citation marker with the sentence it follows", () => {
    const text = "The RBI cut its rate in 2019.[1](/passages/12?blocks=0-2) Banks then cut loan rates.";
    const guard = new StreamGuard(facts);
    expect(guard.push("The RBI cut its rate in 2019.").show).toBe("");
    expect(guard.push("[1](/passages/12?blocks=0-2) Banks").show).toBe("The RBI cut its rate in 2019.[1](/passages/12?blocks=0-2) ");
    expect(stream(text, 2).shown).toBe(text);
  });

  it("shows a fenced block whole, never half of it", () => {
    const fence = '```openui-lang\nroot = Widget("A rate move", [s])\ns = Slider("Rate", 4, 0, 10)\n```\n';
    const text = `Here is the move.\n${fence}That is all.`;
    const { shown, after } = stream(text, 3);
    expect(shown).toBe(text);
    for (const seen of after) {
      const fences = seen.split("```").length - 1;
      expect(fences % 2).toBe(0);
    }
  });

  it("shows nothing more after a hit", () => {
    const guard = new StreamGuard(facts);
    expect(guard.push("Sell it. ").hit?.rule).toBe("advice");
    expect(guard.push("A rate cut lowers rates. ")).toEqual({ show: "" });
    expect(guard.end()).toEqual({ show: "" });
    expect(guard.hit?.rule).toBe("advice");
  });

  it("starts each loop step's text as a new sentence", () => {
    const guard = new StreamGuard(facts);
    expect(guard.push("Let me look that up").show).toBe("");
    expect(guard.end().show).toBe("Let me look that up");
    expect(guard.push("Banks cut loan rates.").show).toBe("");
    expect(guard.end().show).toBe("Banks cut loan rates.");
  });
});
