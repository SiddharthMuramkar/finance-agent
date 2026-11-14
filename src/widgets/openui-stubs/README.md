# Stand-ins for OpenUI's unused heavy dependencies

`@openuidev/react-ui` ships as one file that imports a code highlighter (about 780 KB with its grammars), a date
picker and a table engine, for parts the Widget library dropped (CodeBlock, DatePicker, EditableTable). A bundler
cannot leave them out, so `next.config.ts` points those imports at the files here. Nothing in the app renders
the other parts; if one ever does, it draws nothing. The code highlighter is the exception: TextContent draws
code blocks through it, so its stand-in renders the code as plain text (no colours) and the code stays readable. Do not import these packages from `src/`: the
alias is global, and the real packages are not in the browser bundle.
