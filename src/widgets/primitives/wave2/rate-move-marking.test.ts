import { describe, expect, it } from "vitest";
import { markMove } from "./rate-move-marking";

describe("marking a typed rate move in basis points", () => {
  it("is exact at 20 bp, with or without the unit", () => {
    for (const typed of ["20", "20bp", "20 bp", " 20 BP ", "20 basis points"]) expect(markMove(typed, 5, 5.2).status, typed).toBe("right");
    for (const typed of ["19", "21", "20.4", "0.2"]) expect(markMove(typed, 5, 5.2).status, typed).toBe("wrong");
    expect(markMove("20", 5, 5.2).expected).toBe("20 bp");
  });

  it("is exact in whole basis points for a big move: 250 bp, and 1,999 bp across nearly the whole range", () => {
    expect(markMove("250", 2, 4.5).status).toBe("right");
    expect(markMove("249", 2, 4.5).status).toBe("wrong");
    expect(markMove("251 bp", 2, 4.5).status).toBe("wrong");
    expect(markMove("1,999", 0.01, 20).status).toBe("right");
    expect(markMove("2000", 0.01, 20).status).toBe("wrong");
  });

  it("takes a fall as its size, with a minus sign, or in words, but never a fall for a rise", () => {
    for (const typed of ["30", "-30", "−30 bp", "a fall of 30", "down 30 bp"]) expect(markMove(typed, 7.5, 7.2).status, typed).toBe("right");
    expect(markMove("-20", 5, 5.2).status).toBe("wrong");
    expect(markMove("30", 7.5, 7.2).expected).toBe("30 bp (a fall)");
  });

  it("names the move in points when that is what was typed", () => {
    expect(markMove("0.2", 5, 5.2).inPoints).toBe(true);
    expect(markMove("19", 5, 5.2).inPoints).toBe(false);
  });

  it("does not mark what is not one number", () => {
    for (const typed of ["", "twenty", "20 or 30", "abc"]) expect(markMove(typed, 5, 5.2).status, typed).toBe("unread");
  });
});
