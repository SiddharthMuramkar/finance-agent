import type { ReactNode } from "react";

// Stand-in for react-syntax-highlighter (see README.md). OpenUI's TextContent draws a fenced or indented code block
// through it; the stub shows the code as plain text, with no colours, so it never vanishes. Other props are ignored.
export const Prism = ({ children }: { children?: ReactNode }) => (
  <pre className="whitespace-pre-wrap text-sm">
    <code>{children}</code>
  </pre>
);
export const Light = Prism;
export const PrismLight = Prism;
export default Prism;
