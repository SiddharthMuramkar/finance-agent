import { describe, expect, it } from "vitest";
import { falseClaims } from "@/test/true-claims";
import { aboutCopy } from "./about-copy";

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") strings(value({ topics: 95, subjects: 9 }), out);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) strings(item, out);
  return out;
}

describe("About's words", () => {
  it("make no false claim and give five to eight questions", () => {
    const all = strings(aboutCopy);
    expect(falseClaims(all.join(" "))).toEqual([]);
    expect(aboutCopy.faq.items.length).toBeGreaterThanOrEqual(5);
    expect(aboutCopy.faq.items.length).toBeLessThanOrEqual(8);
    for (const item of aboutCopy.faq.items) {
      expect(item.q.endsWith("?")).toBe(true);
      expect(item.a.length).toBeGreaterThan(0);
    }
    const text = all.join(" ");
    expect(text).not.toMatch(/Session|lesson/i);
    expect(text).not.toMatch(/\buser\b/i);
    expect(text).not.toMatch(/chatbot/i);
  });

  // Spec 2026-11-12 E2, Appendix F, and the Assumption "Naming Damodaran": his valuations are named as his, and Value It
  // says plainly that it is not affiliated with him.
  it("name Damodaran as the author of the valuations used as Cases, and say Value It is not affiliated", () => {
    expect(strings(aboutCopy)).toContain(
      "The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.",
    );
  });
});
