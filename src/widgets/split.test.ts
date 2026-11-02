import { describe, expect, it } from "vitest";
import { splitReply } from "./split";

const fence = "```openui-lang\nroot = Widget(\"PV\", [])\n```";

describe("splitting a Tutor reply into prose and widget blocks", () => {
  it("separates prose from a widget block, leaving a marker where the widget belongs", () => {
    expect(splitReply(`Before.\n${fence}\nAfter.`)).toEqual([
      { type: "prose", text: "Before.\n" },
      { type: "widget", code: 'root = Widget("PV", [])', complete: true },
      { type: "prose", text: "\nAfter." },
    ]);
  });

  it("treats a widget still streaming as incomplete, and never shows its code as prose", () => {
    expect(splitReply("Look:\n```openui-lang\nroot = Wid", { streaming: true })).toEqual([
      { type: "prose", text: "Look:\n" },
      { type: "widget", code: "root = Wid", complete: false },
    ]);
  });

  it("while streaming, holds back a fence opening that has only partly arrived", () => {
    expect(splitReply("Look:\n```open", { streaming: true })).toEqual([{ type: "prose", text: "Look:\n" }]);
    expect(splitReply("Look:\n``", { streaming: true })).toEqual([{ type: "prose", text: "Look:\n" }]);
  });

  it("keeps other code fences as prose", () => {
    expect(splitReply("PV = A / (1 + r)^n\n```\n1000 / 1.1^5\n```")).toEqual([
      { type: "prose", text: "PV = A / (1 + r)^n\n```\n1000 / 1.1^5\n```" },
    ]);
  });

  it("finds several widgets in order", () => {
    const segments = splitReply(`${fence}\nThen\n${fence}`);
    expect(segments.map((s) => s.type)).toEqual(["widget", "prose", "widget"]);
  });
});
