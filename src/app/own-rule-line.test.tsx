// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicNote } from "@/learner/notes";
import { OWN_RULE_SAVED } from "@/tutor/own-rule-item";
import { AnnouncerProvider } from "./announcer";
import { NotebookView } from "./notebook/notebook-view";
import { SessionItemView } from "./session-item-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = { kind: OWN_RULE_SAVED, data: { noteId: 12, topicId: "present-value", text: "change × 100 then divide by original", skillId: null } };

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const undo = () => host.querySelector<HTMLButtonElement>("[data-undo-save]")!;
const mount = () => act(() => root.render(<AnnouncerProvider><SessionItemView item={item} /></AnnouncerProvider>));

describe("the line under the Learner's own rule", () => {
  it("reads Saved to your Notebook, with Undo and Open Notebook (a link to that Topic's Notebook row)", () => {
    const html = renderToStaticMarkup(<SessionItemView item={item} />);
    expect(html).toContain('data-testid="own-rule-line"');
    expect(html).toContain("Saved to your Notebook");
    expect(html).toContain("Undo");
    expect(html).toMatch(/href="\/notebook#note-present-value"[^>]*>Open Notebook/);
    // No Save button: code saved it.
    expect(html).not.toContain("Save to Notebook");
  });

  it("draws nothing for an item without a note id", () => {
    expect(renderToStaticMarkup(<SessionItemView item={{ kind: OWN_RULE_SAVED, data: {} }} />)).toBe("");
  });

  it("Undo deletes the note and then reads Removed from your Notebook.", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await act(async () => undo().click());
    expect(fetchMock).toHaveBeenCalledWith("/api/notes", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ id: 12 }) }));
    expect(host.textContent).toContain("Removed from your Notebook.");
    expect(host.textContent).not.toContain("Undo");
  });

  it("says the same when the note is already gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "gone" }), { status: 404 })));
    mount();
    await act(async () => undo().click());
    expect(host.textContent).toContain("Removed from your Notebook.");
  });

  it("keeps the line, with its Undo, when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    mount();
    await act(async () => undo().click());
    expect(host.textContent).toContain("Saved to your Notebook");
    expect(undo()).toBeTruthy();
  });
});

describe("the Notes page with the Learner's own rule", () => {
  const now = new Date("2026-11-04T00:00:00Z");
  const notes: TopicNote[] = [
    {
      topicId: "present-value",
      title: "Present value",
      stage: "foundation",
      passed: false,
      lines: [
        { id: 1, text: "My own line", createdAt: now, updatedAt: now },
        { id: 2, text: "change × 100 then divide by original", createdAt: now, updatedAt: now, ownRule: true },
      ],
      saved: [],
    },
  ];
  const html = renderToStaticMarkup(<NotebookView notebook={{ rows: notes.map((n) => ({ topicId: n.topicId, title: n.title, stage: n.stage, status: "not_started" as const, sessionId: null, lastActive: null, action: null, found: [], note: n })), older: [] }} showAll={false} />);

  it("shows the rule under its Topic, labelled Your rule, and only that line is labelled", () => {
    expect(html).toContain("change × 100 then divide by original");
    expect(html.match(/Your rule/g)).toHaveLength(1);
    expect(html).toMatch(/Your rule<\/span>change × 100/);
  });

  it("lists the Topic even though it is not passed, because it has a line", () => {
    expect(html).toContain("Present value");
  });

  it("lets the rule be edited and deleted like any line", () => {
    expect(html).toContain('data-edit-line="2"');
    expect(html).toContain('data-delete-line="2"');
  });
});
