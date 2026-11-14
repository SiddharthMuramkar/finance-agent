import { describe, expect, it } from "vitest";
import { falseClaims } from "@/test/true-claims";
import { copy } from "./copy";

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") strings(value({ topics: 95, subjects: 9, cases: 103 }), out);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) strings(item, out);
  return out;
}

const count = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("Home's words", () => {
  it("make no false claim", () => {
    expect(falseClaims(strings(copy).join(" "))).toEqual([]);
  });

  // Spec 2026-11-12 E2 and Appendix F: the promise says valuation. The expected words are the spec's, written here.
  it("say valuation: the eyebrow, the headline and the fourth move are the spec's", () => {
    expect(copy.eyebrow).toBe("Learn valuation by doing");
    expect(copy.headline.join(" ")).toBe("Learn what things are worth.");
    expect(copy.subtext).toBe(
      "Value It teaches you to value a jackpot, a bond or a company the way it is really done: a story first, then the numbers. You move every number yourself. You never work out a sum, and it never tells you what to buy.",
    );
    expect(copy.moves.map((m) => m.name)).toEqual(["Hear the story", "Learn the lingo", "Try it", "Value it"]);
    expect(copy.moves[3].line).toBe("Put your own number on it, then see what really happened.");
    expect(copy.valueCompany.title).toBe("Now value a company.");
    expect(copy.valueCompany.intro).toBe("February 2000. Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what your story is worth.");
    // E4: the links under section 2's Widget; B3: the Case's own story chip.
    expect(copy.valueCompany.signIn).toBe("Sign in to see what happened next →");
    expect(copy.valueCompany.open).toBe("Open this Topic →");
    expect(copy.valueCompany.caseStory).toBe("Damodaran's story");
    expect(copy.get.items.map((i) => i.name)).toEqual(["A Tutor that answers back", "Widgets you move", "Checks that bring back what you missed"]);
    expect(copy.notWhat.lines).toContain("Studying needs a laptop or tablet today.");
  });

  it("give the Explorable the spec's lines (E3)", () => {
    const w = copy.widget;
    expect(w.start).toBe("Raise the rate and watch the far-off payments shrink.");
    expect(w.found("3.4")).toBe("You found it. At about 3.4% the 30 payments are worth the cash on offer.");
    expect(w.standing).toEqual({ payments: "The payments are worth more than the cash.", cash: "The cash is worth more than the payments." });
    expect(w.paymentsNow).toBe("30 payments, in today's money");
    expect(w.cashNow).toBe("Cash now");
    expect(w.guess.ask).toBe("At an ordinary interest rate, which is worth more?");
    expect(w.guess.shown(w.guess.said.payments)).toBe("You guessed: the 30 payments");
    expect(w.signIn).toBe("Sign in to learn why →");
    expect(copy.phoneNote).toBe("Studying needs a laptop or tablet today.");
    expect(copy.resume).toBe("Resume");
    expect(copy.sendToLaptop).toBe("Send this to my laptop");
  });

  // E1: "The text-only copy falls from about 500 words to 250 or fewer". Counted: every word of Home's own under the
  // hero (section titles, intros, captions, the four moves, section 5, the closing Band's lines and offer), leaving out
  // only the Showcases' written conversations, which sit beside their live Widget.
  it("keep the copy under the hero to 250 words or fewer (E1)", () => {
    const below = [
      copy.valueCompany.title,
      copy.valueCompany.intro,
      copy.valueCompany.caption,
      copy.movesTitle,
      copy.movesIntro,
      ...copy.moves.flatMap((m) => [m.name, m.line]),
      copy.showcases.title,
      copy.showcases.intro({ cases: 103 }),
      ...Object.values(copy.showcases.areas),
      copy.get.title,
      ...copy.get.items.map((i) => i.name),
      copy.forWho.title,
      copy.forWho.line,
      copy.notWhat.title,
      ...copy.notWhat.lines,
      ...copy.closing,
      copy.closingNote,
    ];
    expect(count(below.join(" "))).toBeLessThanOrEqual(250);
  });
});
