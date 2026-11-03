import { describe, expect, it } from "vitest";
import { connectionsCheckErrors } from "./connections-check";
import { loadCourseMap } from "./map";

const conn = (text: string) => ({ text, topics: ["bond-pricing"], titles: ["Bond basics and pricing"] });
const insight = loadCourseMap().topic("present-value")!.insight!;

describe("the Connections course check", () => {
  it("passes the real Course Map", () => {
    expect(connectionsCheckErrors(loadCourseMap().topics)).toEqual([]);
  });

  it("fails a Topic with an Insight and no Connections", () => {
    expect(connectionsCheckErrors([{ id: "t", insight, connections: [] }])).toEqual([
      'Topic "t" has an Insight, so it needs two or three Connections (it has 0)',
    ]);
  });

  it("fails one Connection or four, and passes two or three", () => {
    expect(connectionsCheckErrors([{ id: "a", insight, connections: [conn("x")] }])).toHaveLength(1);
    expect(connectionsCheckErrors([{ id: "b", insight, connections: [conn("1"), conn("2"), conn("3"), conn("4")] }])).toHaveLength(1);
    expect(connectionsCheckErrors([{ id: "c", insight, connections: [conn("1"), conn("2")] }])).toEqual([]);
    expect(connectionsCheckErrors([{ id: "d", insight, connections: [conn("1"), conn("2"), conn("3")] }])).toEqual([]);
  });

  it("leaves a Topic without an Insight alone", () => {
    expect(connectionsCheckErrors([{ id: "e", insight: undefined, connections: [] }])).toEqual([]);
  });
});
