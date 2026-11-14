// A build-time loader (next.config.ts, turbopack.rules) for OpenUI's single-file entry. See README.md.
//
// "@openuidev/react-ui" is one file whose components are built at the top level with calls such as forwardRef(),
// memo(), createContext(), defineComponent() and createLibrary(). A bundler cannot tell those calls have no side
// effects, so it keeps every one of them, and with them the whole chat shell and every part the Widget library
// dropped. Marking each call as pure lets the bundler leave out what nothing imports. The same goes for the
// `Name.displayName = "..."` lines, which only label components in React's dev tools.
//
// It changes nothing a Widget draws: the same code runs, minus the parts that nothing reaches.
const PURE_CALLS = [
  "forwardRef",
  "React\\.forwardRef",
  "memo",
  "React\\.memo",
  "createContext",
  "createLibrary",
  "defineComponent",
  "z\\.\\w+",
  "createColorTheme",
  "createTypographyTheme",
  "createLegendStore",
  "Object\\.freeze",
];

const DECLARATION = new RegExp(`^((?:const|let|var) [\\w$]+ = )(?=(?:${PURE_CALLS.join("|")})\\()`, "gm");
const DISPLAY_NAME = /^[\w$.]+\.displayName = "[^"\n]*";\n/gm;
const AGENT_SLOTS = /^AgentInterface\.\w+ = [\w$]+;\n/gm;

module.exports = function pureOpenui(source) {
  return String(source).replace(/^export \* from "@openuidev\/react-headless";$/m, "").replace(DECLARATION, "$1/* @__PURE__ */ ").replace(DISPLAY_NAME, "").replace(AGENT_SLOTS, "");
};
