"use client";

import { useAuiState, useMessagePartText } from "@assistant-ui/react";
import { MarkdownTextPrimitive, type SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { createContext, useCallback, useContext, type ComponentProps, type ReactNode } from "react";
import { isSafeHref, parseFold, SOURCES_FENCE, type SourceEntry } from "@/tutor/citations";
import { findWidget, markdownSource, splitReply } from "@/widgets/split";
import { Chevron } from "./ui";

/** What stands where a widget belongs in the prose: a marker in the workspace, the widget itself in an old Session. */
export type WidgetSlot = (widget: { messageId: string; index: number; code: string; complete: boolean }) => ReactNode;

const SlotContext = createContext<WidgetSlot | null>(null);

function useStreaming() {
  return useAuiState((s) => s.message.status?.type === "running");
}

/** Rendered by the Markdown renderer for each ```openui-lang fence. */
function WidgetFence({ code }: SyntaxHighlighterProps) {
  const slot = useContext(SlotContext)!;
  const messageId = useAuiState((s) => s.message.id);
  const { text } = useMessagePartText();
  const streaming = useStreaming();
  const found = findWidget(splitReply(text, { streaming }), code);
  if (!found) return null;
  return slot({ messageId, index: found.index, code: code.replace(/\n$/, ""), complete: found.complete });
}

/**
 * Links in a reply. A citation marker (a number linking to a Library passage, see src/tutor/citations.ts)
 * is shown small and raised; it and the reply's source list open the passage view in a new tab, so the
 * conversation stays where it is.
 */
function ReplyLink({ href, children, node, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
  void node; // react-markdown's syntax-tree node, which must not reach the DOM
  if (!href?.startsWith("/passages/")) return <a href={href} {...rest}>{children}</a>;
  const link = (
    <a href={href} target="_blank" rel="noopener" className="cite" {...rest}>
      {children}
    </a>
  );
  const marker = typeof children === "string" && /^\d+$/.test(children);
  return marker ? <sup>{link}</sup> : link;
}
const COMPONENTS = { a: ReplyLink };

/**
 * A reply's sources, folded: one small "N sources" line that opens on click to the numbered list, each
 * entry with its passage heading and credit line. A passage the as-of rule hides keeps its hidden
 * title and has no credit; a Case Data source has no number, since no marker points to it.
 */
export function SourcesFold({ entries }: { entries: SourceEntry[] }) {
  if (!entries.length) return null;
  return (
    <details data-testid="sources-fold" className="group sources-fold mt-3 text-sm text-[var(--muted)]">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <Chevron />
        {entries.length} {entries.length === 1 ? "source" : "sources"}
      </summary>
      <div className="mt-1 space-y-1">
        {entries.map((e, i) => (
          <p key={i}>
            {e.n !== null && <span className="mr-1 tabular-nums">{e.n}.</span>}
            {isSafeHref(e.href) ? (
              <a href={e.href} target="_blank" rel="noopener" className="underline">
                {e.title}
              </a>
            ) : (
              // A fence the model wrote itself can carry any link: only /passages/ and https: ones are links.
              <span>{e.title}</span>
            )}
            {e.credit && <span>{` — ${e.credit}`}</span>}
          </p>
        ))}
      </div>
    </details>
  );
}

/** Rendered by the Markdown renderer for the ```sources fence that ends a reply. */
function SourcesFence({ code }: SyntaxHighlighterProps) {
  return <SourcesFold entries={parseFold(code)} />;
}

const NoHeader = () => null;
const BY_LANGUAGE = {
  "openui-lang": { SyntaxHighlighter: WidgetFence, CodeHeader: NoHeader },
  [SOURCES_FENCE]: { SyntaxHighlighter: SourcesFence, CodeHeader: NoHeader },
};

/**
 * A Tutor reply as formatted Markdown (bold, lists, headings, tables), rendered by assistant-ui's
 * Markdown primitive from the current message part. Widget fences are not shown as code: each
 * becomes the given slot, in the place the Tutor put it.
 */
export function ReplyMarkdown({ slot }: { slot: WidgetSlot }) {
  const streaming = useStreaming();
  const preprocess = useCallback((text: string) => markdownSource(text, { streaming }), [streaming]);
  return (
    <SlotContext.Provider value={slot}>
      <MarkdownTextPrimitive className="md" remarkPlugins={[remarkGfm]} smooth={false} preprocess={preprocess} components={COMPONENTS} componentsByLanguage={BY_LANGUAGE} />
    </SlotContext.Provider>
  );
}
