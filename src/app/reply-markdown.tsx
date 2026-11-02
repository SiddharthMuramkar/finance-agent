"use client";

import { useAuiState, useMessagePartText } from "@assistant-ui/react";
import { MarkdownTextPrimitive, type SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { createContext, useCallback, useContext, type ComponentProps, type ReactNode } from "react";
import { findWidget, markdownSource, splitReply } from "@/widgets/split";

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
function ReplyLink({ href, children, node: _node, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
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

const NoHeader = () => null;
const BY_LANGUAGE = { "openui-lang": { SyntaxHighlighter: WidgetFence, CodeHeader: NoHeader } };

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
