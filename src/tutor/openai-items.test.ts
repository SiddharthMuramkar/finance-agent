import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { loadPassageView, searchLibrary, searchResultBlocks } from "@/library/library";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { TUTOR_MODEL, type Message, type SearchResultBlock, type StepRequest } from "./model";
import { fromResponseOutput, passagesIn, renderSearchResult, ResponseFailed, toInputItems, toResponseCreateParams } from "./openai-items";

const searchTool = { type: "function" as const, name: "search_library", description: "Search the Library.", parameters: { type: "object", properties: { query: { type: "string" } } }, strict: false };

function request(messages: Message[], extra: Partial<StepRequest> = {}): StepRequest {
  return { model: TUTOR_MODEL, effort: "medium", instructions: "Teach present value.", tools: [searchTool], messages, maxOutputTokens: 16000, ...extra };
}

/** A Library passage as search_library returns it: block 0 the credit header, then one block per sentence. */
function passage(id: number, title: string, sentences: string[]): SearchResultBlock {
  return {
    type: "search_result",
    source: `/passages/${id}`,
    title,
    content: [{ type: "text", text: "Source: B. Author, A textbook (CC BY 4.0). https://example.org/book\n\n" }, ...sentences.map((text) => ({ type: "text" as const, text }))],
    citations: { enabled: true },
  };
}

const pv = passage(12, "Present value", ["Present value discounts each future payment back to today. ", "A higher discount rate gives a lower present value."]);

/** Output items as the API returns them. */
const reasoning = (id: string): ResponseOutputItem => ({ id, type: "reasoning", summary: [], encrypted_content: `encrypted-${id}` });
const message = (id: string, text: string, phase: "commentary" | "final_answer" = "final_answer"): ResponseOutputItem => ({
  id,
  type: "message",
  role: "assistant",
  status: "completed",
  phase,
  content: [{ type: "output_text", text, annotations: [] }],
});
const call = (callId: string, name: string, args: string): ResponseOutputItem => ({ id: `fc_${callId}`, type: "function_call", call_id: callId, name, arguments: args, status: "completed" });

describe("a step's request", () => {
  it("is a stateless, streamed Responses request: instructions first with a cache breakpoint, function tools, medium effort", () => {
    expect(toResponseCreateParams(request([{ role: "user", content: "Why discount?" }]))).toEqual({
      model: "gpt-6.1-sol",
      input: [
        { type: "message", role: "developer", content: [{ type: "input_text", text: "Teach present value.", prompt_cache_breakpoint: { mode: "explicit" } }] },
        { type: "message", role: "user", content: "Why discount?" },
      ],
      tools: [{ type: "function", name: "search_library", description: "Search the Library.", parameters: { type: "object", properties: { query: { type: "string" } } }, strict: false }],
      reasoning: { effort: "medium", context: "current_turn" },
      max_output_tokens: 16000,
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
    });
    expect(toResponseCreateParams(request([], { effort: "high" })).reasoning).toEqual({ effort: "high", context: "current_turn" });
  });

  it("sends a turn's last allowed step with tool choice none, its tools still listed (the step limit)", () => {
    const last = toResponseCreateParams(request([{ role: "user", content: "Why discount?" }], { toolChoice: "none" }));
    expect(last.tool_choice).toBe("none");
    expect(last.tools).toHaveLength(1);
    expect(toResponseCreateParams(request([{ role: "user", content: "Why discount?" }]))).not.toHaveProperty("tool_choice");
  });

  it("sends code's context rows as developer messages, where they stand", () => {
    expect(
      toInputItems([
        { role: "user", content: "Hi" },
        { role: "system", content: "The Learner is now at the concept step." },
        { role: "system", content: [{ type: "text", text: "One." }, { type: "text", text: "Two." }] },
      ]),
    ).toEqual([
      { type: "message", role: "user", content: "Hi" },
      { type: "message", role: "developer", content: "The Learner is now at the concept step." },
      { type: "message", role: "developer", content: "One.\n\nTwo." },
    ]);
  });

  it("sends the Learner's text blocks as one user message per run, and each tool result as its call's output", () => {
    const items = toInputItems([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "Recorded." },
          { type: "text", text: "Opener by code: start." },
          { type: "text", text: "" },
          { type: "text", text: "Why discount?" },
          { type: "tool_result", tool_use_id: "call_2", content: "Error: no such Topic", is_error: true },
          { type: "tool_result", tool_use_id: "call_3", content: "the tool broke", is_error: true },
        ],
      },
    ]);
    expect(items).toEqual([
      { type: "function_call_output", call_id: "call_1", output: "Recorded." },
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Opener by code: start." },
          { type: "input_text", text: "Why discount?" },
        ],
      },
      { type: "function_call_output", call_id: "call_2", output: "Error: no such Topic" },
      { type: "function_call_output", call_id: "call_3", output: "Error: the tool broke" },
    ]);
  });

  it("renders Library passages as numbered sentences the model can cite", () => {
    expect(renderSearchResult(pv)).toBe(
      [
        "Passage 12: Present value",
        "Source: B. Author, A textbook (CC BY 4.0). https://example.org/book",
        "§1 Present value discounts each future payment back to today.",
        "§2 A higher discount rate gives a lower present value.",
      ].join("\n"),
    );
    // A sentence's own line breaks become spaces, so each stays on its line.
    expect(renderSearchResult(passage(3, "Lists", ["One\nline. "]))).toContain("\n§1 One line.");
    const [output] = toInputItems([{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "text", text: "Two passages." }, pv, passage(14, "Bonds", ["A bond pays coupons."])] }] }]);
    expect(output).toEqual({ type: "function_call_output", call_id: "call_1", output: `Two passages.\n\n${renderSearchResult(pv)}\n\nPassage 14: Bonds\nSource: B. Author, A textbook (CC BY 4.0). https://example.org/book\n§1 A bond pays coupons.` });
  });

  it("sends a model step exactly as it came back: reasoning, the message's phase, ids and exact arguments", () => {
    const output = [reasoning("rs_1"), message("msg_1", "Let me look.⟦12:1⟧", "commentary"), call("call_1", "search_library", '{"query": "pv"}')];
    const items = toInputItems([
      { role: "user", content: "Why?" },
      { role: "assistant", content: [{ type: "text", text: "Let me look." }, { type: "tool_use", id: "call_1", name: "search_library", input: { query: "pv" } }, { type: "replay", items: output }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "Nothing." }] },
    ]);
    expect(items).toEqual([{ type: "message", role: "user", content: "Why?" }, ...output, { type: "function_call_output", call_id: "call_1", output: "Nothing." }]);
    expect(items[1]).toMatchObject({ type: "reasoning", encrypted_content: "encrypted-rs_1" });
    expect(items[2]).toMatchObject({ phase: "commentary", id: "msg_1" });
  });

  it("rebuilds a step without its replay block from its blocks: citations as markers, tool calls with their arguments, no reasoning", () => {
    const cited = { type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 1, end_block_index: 3 };
    const items = toInputItems([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Money today is worth more", citations: [cited] },
          { type: "text", text: ", so we discount." },
          { type: "tool_use", id: "call_1", name: "search_library", input: { query: "pv" } },
          { type: "tool_use", id: "call_2", name: "record_insight_attempt", input: {}, arguments: '{"attempt": "Money to' },
          { type: "text", text: "Fixed by code." },
        ],
      },
    ]);
    expect(items).toEqual([
      // Text before a tool call goes back as the model's commentary; the step's last text as its answer.
      { type: "message", role: "assistant", phase: "commentary", content: "Money today is worth more⟦12:1-2⟧, so we discount." },
      { type: "function_call", call_id: "call_1", name: "search_library", arguments: '{"query":"pv"}' },
      { type: "function_call", call_id: "call_2", name: "record_insight_attempt", arguments: '{"attempt": "Money to' },
      { type: "message", role: "assistant", phase: "final_answer", content: "Fixed by code." },
    ]);
    expect(toInputItems([{ role: "assistant", content: "Plain reply." }])).toEqual([{ type: "message", role: "assistant", phase: "final_answer", content: "Plain reply." }]);
  });

  it("sends the history from its latest compaction on, the compacted window as it came back", () => {
    const window = [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Why discount?" }] },
      { id: "cmp_2", type: "compaction", encrypted_content: "summary-2" },
    ];
    const items = toInputItems([
      { role: "user", content: "Old question." },
      { role: "assistant", content: [{ type: "compaction", items: [{ id: "cmp_1", type: "compaction", encrypted_content: "summary-1" }] }] },
      { role: "user", content: "Middle question." },
      { role: "assistant", content: [{ type: "compaction", items: window }] },
      { role: "user", content: "Go on." },
    ]);
    expect(items).toEqual([...window, { type: "message", role: "user", content: "Go on." }]);
  });

  it("fails loudly on a block from before the switch: thinking, Anthropic's server tools, a readable compaction", () => {
    const legacy: Message[] = [
      { role: "assistant", content: [{ type: "thinking", thinking: "Hmm", signature: "sig" }] as never },
      { role: "assistant", content: [{ type: "redacted_thinking", data: "x" }] as never },
      { role: "assistant", content: [{ type: "server_tool_use", id: "srv_1", name: "code_execution", input: {} }] as never },
      { role: "user", content: [{ type: "code_execution_tool_result", tool_use_id: "srv_1", content: {} }] as never },
      { role: "user", content: [{ type: "web_search_tool_result", tool_use_id: "srv_2", content: [] }] as never },
      { role: "assistant", content: [{ type: "compaction", content: "Summary of the Session so far." }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "image", source: {} }] as never }] },
    ];
    for (const m of legacy) expect(() => toResponseCreateParams(request([m])), JSON.stringify(m.content)).toThrow(/cannot be sent to OpenAI/);
  });

  it("knows the passages the history's searches returned, from its latest compaction on", () => {
    const found = (block: SearchResultBlock): Message => ({ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [block] }] });
    const old = passage(7, "Annuities", ["One."]);
    const resolve = passagesIn([found(old), { role: "assistant", content: [{ type: "compaction", items: [] }] }, found(pv)]);
    expect(resolve(12)).toEqual({ title: "Present value", sentences: 2 });
    expect(resolve(7)).toBeUndefined();
    expect(resolve(99)).toBeUndefined();
  });
});

describe("a finished response as a step", () => {
  const passages = passagesIn([{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_0", content: [pv] }] }]);

  it("cuts each message's text into cited blocks, makes each function call a tool call, and keeps the raw output last", () => {
    const output = [
      reasoning("rs_1"),
      message("msg_1", "Money today is worth more ⟦12:1-2⟧, so we discount.\n\nAnd ⟦99:1⟧ more.", "commentary"),
      call("call_1", "search_library", '{"query":"rates"}'),
      message("msg_2", "Done.⟦12:2⟧"),
    ];
    const step = fromResponseOutput(output, "completed", null, passages);
    expect(step).toEqual({
      content: [
        {
          type: "text",
          text: "Money today is worth more",
          citations: [{ type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 1, end_block_index: 3 }],
        },
        { type: "text", text: ", so we discount." },
        { type: "text", text: "\n\nAnd  more." },
        { type: "tool_use", id: "call_1", name: "search_library", input: { query: "rates" } },
        // A second message item starts on a new paragraph, so the two never run together on screen.
        { type: "text", text: "\n\nDone.", citations: [{ type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 2, end_block_index: 3 }] },
        { type: "replay", items: output },
      ],
      stopReason: "tool_use",
    });
  });

  it("keeps a function call's arguments raw when they do not parse (cut off at the length limit), and stops for max_tokens", () => {
    const output = [message("msg_1", "Let me record that."), call("call_1", "record_insight_attempt", '{"attempt": "Money to')];
    const step = fromResponseOutput(output, "incomplete", { reason: "max_output_tokens" }, passages);
    expect(step.content[1]).toEqual({ type: "tool_use", id: "call_1", name: "record_insight_attempt", input: {}, arguments: '{"attempt": "Money to' });
    expect(step.stopReason).toBe("max_tokens");
  });

  it("keeps no raw output for a step cut off at its length limit: it may end in a reasoning item with nothing after it", () => {
    // Sent back as is, a lone reasoning item makes the API refuse every later request of the Session.
    const cut = fromResponseOutput([reasoning("rs_1")], "incomplete", { reason: "max_output_tokens" }, passages);
    expect(cut).toEqual({ content: [], stopReason: "max_tokens" });
    const partial = fromResponseOutput([reasoning("rs_1"), message("msg_1", "Half a")], "incomplete", { reason: "max_output_tokens" }, passages);
    expect(partial.content).toEqual([{ type: "text", text: "Half a" }]);
    // So it goes back rebuilt from its readable blocks: no reasoning item at all.
    expect(toInputItems([{ role: "assistant", content: partial.content }])).toEqual([{ type: "message", role: "assistant", phase: "final_answer", content: "Half a" }]);
  });

  it("starts a message item on a new paragraph only after one with text", () => {
    const refusalOnly = { ...message("msg_2", ""), content: [{ type: "refusal", refusal: "No." }] } as unknown as ResponseOutputItem;
    const step = fromResponseOutput([message("msg_1", "First."), refusalOnly, message("msg_3", "Third.")], "completed", null, passages);
    expect(step.content.filter((b) => b.type === "text")).toEqual([
      { type: "text", text: "First." },
      { type: "text", text: "\n\nThird." },
    ]);
  });

  it("works out why the step stopped", () => {
    const stop = (output: ResponseOutputItem[], status: "completed" | "incomplete" = "completed", reason?: "max_output_tokens" | "content_filter") =>
      fromResponseOutput(output, status, reason ? { reason } : null, passages).stopReason;
    expect(stop([message("m", "Hello.")])).toBe("end_turn");
    expect(stop([reasoning("r"), call("c", "search_library", "{}")])).toBe("tool_use");
    expect(stop([message("m", "Cut")], "incomplete", "max_output_tokens")).toBe("max_tokens");
    expect(stop([reasoning("r")], "incomplete", "max_output_tokens")).toBe("max_tokens");
    expect(stop([message("m", "Partial")], "incomplete", "content_filter")).toBe("refusal");
    // A refusal wins over tool calls.
    const refusal: ResponseOutputItem = { id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "I can't help with that." }] };
    expect(stop([refusal, call("c", "search_library", "{}")])).toBe("refusal");
    expect(fromResponseOutput([refusal], "completed", null, passages).content).toEqual([{ type: "replay", items: [refusal] }]);
  });

  it("throws for a failed response, with OpenAI's error code and message", () => {
    const failed = () => fromResponseOutput([], "failed", null, passages, { code: "server_error", message: "The server had an error." });
    expect(failed).toThrow(ResponseFailed);
    expect(failed).toThrow("The server had an error.");
    try {
      failed();
    } catch (error) {
      expect((error as ResponseFailed).code).toBe("server_error");
    }
  });
});

describe("a citation marker and the passage view", () => {
  const book: LibraryFile = {
    source: {
      id: "a-book",
      title: "A textbook",
      kind: "timeless",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      credit: "B. Author, A textbook (Publisher, 2022), CC BY 4.0",
      url: "https://example.org/book",
      fetchedOn: "2026-11-02",
    },
    passages: [
      {
        ref: "pv",
        heading: "Present value",
        url: "https://example.org/book/pv",
        text: "Present value discounts each future payment back to today. A higher discount rate gives a lower present value. It falls as the wait grows.",
      },
    ],
  };

  it("marks exactly the sentences the model numbered: §n in the search result is sentence n in the passage view", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    const deps = { db, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID };
    const results = searchResultBlocks(await searchLibrary(deps, "discount rate present value"));
    expect(Array.isArray(results)).toBe(true);
    const [found] = results as SearchResultBlock[];
    const id = Number(found.source.split("/").at(-1));
    const shown = toolOutput(found);
    expect(shown).toContain(`Passage ${id}: Present value`);
    expect(shown).toContain("§2 A higher discount rate gives a lower present value.");
    expect(shown).toContain("§3 It falls as the wait grows.");

    // The model cites §2-§3 of what it was shown.
    const history: Message[] = [{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [found] }] }];
    const step = fromResponseOutput([message("msg_1", `Higher rates and longer waits lower it.⟦${id}:2-3⟧`)], "completed", null, passagesIn(history));
    const [block] = step.content as { citations: { start_block_index: number; end_block_index: number }[] }[];
    const [citation] = block.citations;
    const view = await loadPassageView(deps, id, { from: citation.start_block_index, to: citation.end_block_index });
    expect(view.status).toBe("shown");
    if (view.status !== "shown") return;
    expect(view.sentences.filter((s) => s.cited).map((s) => s.text.trim())).toEqual(["A higher discount rate gives a lower present value.", "It falls as the wait grows."]);
  });
});

/** What a passage's function call output says, as the model reads it. */
function toolOutput(block: SearchResultBlock): string {
  const [item] = toInputItems([{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [block] }] }]);
  return (item as { output: string }).output;
}
