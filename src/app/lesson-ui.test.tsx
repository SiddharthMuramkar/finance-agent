import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OFF_TOPIC } from "@/tutor/session-item-kinds";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { PastSessionHeaderView, PastSessionsList } from "./past-sessions";
import { SessionItemView } from "./session-item-view";
import { TopicBar } from "./workspace-parts";

/** The lesson additions as the Learner sees them: the goal in the Topic bar, the Off-Topic answer block, and what they found. */

describe("the Topic goal", () => {
  it("is one line under the Topic's title in the Topic bar, and absent when the Topic has none", () => {
    const withGoal = renderToStaticMarkup(<TopicBar title="Present value" goal="Compare money at different dates." strip={null} marked={new Set()} />);
    expect(withGoal).toContain('data-testid="topic-goal"');
    expect(withGoal).toContain("Compare money at different dates.");
    expect(renderToStaticMarkup(<TopicBar title="Present value" strip={null} marked={new Set()} />)).not.toContain("topic-goal");
  });
});

describe("the Off-Topic answer block", () => {
  it("is a quiet marker with a way back to the Topic", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: OFF_TOPIC, data: { topicId: "present-value", title: "Present value", step: 3 } }} />);
    expect(html).toContain('data-testid="off-topic-block"');
    expect(html).toContain("Off-Topic answer");
    expect(html).toContain("↩ Back to Present value");
    expect(html).not.toMatch(/detour/i);
  });
  it("draws nothing without a Topic", () => {
    expect(renderToStaticMarkup(<SessionItemView item={{ kind: OFF_TOPIC, data: {} }} />)).toBe("");
  });
});

describe("what the Learner found", () => {
  const card = { topicId: "present-value", title: "Present value", principle: "Money later is worth less.", next: null };
  it("is listed on the Topic complete card when there is something, and left out when not", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: TOPIC_COMPLETE, data: { ...card, found: ["You found the break-even."] } }} />);
    expect(html).toContain('data-testid="topic-found"');
    expect(html).toContain("You found the break-even.");
    expect(renderToStaticMarkup(<SessionItemView item={{ kind: TOPIC_COMPLETE, data: { ...card, found: [] } }} />)).not.toContain("topic-found");
    expect(renderToStaticMarkup(<SessionItemView item={{ kind: TOPIC_COMPLETE, data: card }} />)).not.toContain("topic-found");
  });
  it("is one line on a Past Sessions row and on the Session's header", () => {
    const lastActive = new Date("2026-10-24T08:00:00Z");
    const row = renderToStaticMarkup(<PastSessionsList past={{ topics: [{ id: 4, topicId: "present-value", title: "Present value", lastActive, found: ["You guessed 12%."] }], older: [] }} />);
    expect(row).toContain('data-testid="session-found"');
    expect(row).toContain("You guessed 12%.");
    const header = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: "present-value", title: "Present value", lastActive, passed: true, found: ["You guessed 12%."] }} />);
    expect(header).toContain("You guessed 12%.");
    expect(renderToStaticMarkup(<PastSessionsList past={{ topics: [{ id: 4, topicId: "present-value", title: "Present value", lastActive, found: [] }], older: [] }} />)).not.toContain("session-found");
  });
});
