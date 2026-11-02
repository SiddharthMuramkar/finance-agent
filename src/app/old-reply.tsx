"use client";

import { splitReply } from "@/widgets/split";
import { WidgetView } from "./widget-view";

/** A stored reply in an old Session: prose, with its widgets rebuilt at their starting values. */
export function OldReply({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {splitReply(text).map((s, i) =>
        s.type === "prose" ? <span key={i}>{s.text}</span> : <WidgetView key={i} code={s.code} complete={s.complete} />,
      )}
    </div>
  );
}
