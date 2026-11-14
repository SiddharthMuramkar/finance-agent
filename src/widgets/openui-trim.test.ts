import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widgetLibrary } from "./library";

// The bundle trim (next.config.ts, postcss.config.mjs, src/widgets/openui-stubs) must not change which parts the
// Tutor can write, or how a program is read.

const require_ = createRequire(import.meta.url);
const pureLoader = require_("./openui-stubs/pure-loader.cjs") as (source: string) => string;

/** The parts of OpenUI's kit the Widget library keeps (the rest are in DROPPED_KIT_PARTS in library.tsx). */
const KEPT_KIT_PARTS = [
  ...["Stack", "Tabs", "TabItem", "Accordion", "AccordionItem", "Steps", "StepsItem", "Separator"],
  ...["Card", "CardHeader", "TextContent", "Callout", "TextCallout", "InlineHeader", "Table", "Col"],
  ...["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart"],
  ...["Series", "Slice", "ScatterSeries", "Point", "FormControl", "Label", "Select", "SelectItem", "SwitchGroup", "SwitchItem", "Chips", "ChipItem"],
  ...["Tag", "TagBlock", "EntityList", "Icon"],
];

/** Heavy parts the library drops; the trim stands in for the packages only they call. */
const DROPPED = ["CodeBlock", "DatePicker", "EditableTable", "Carousel", "ImageGallery", "Form", "Button"];

describe("the Widget library after the bundle trim", () => {
  it("still holds every kept OpenUI part", () => {
    for (const name of KEPT_KIT_PARTS) expect(widgetLibrary.components[name], name).toBeDefined();
  });

  it("still holds none of the parts whose packages the build replaces", () => {
    for (const name of DROPPED) expect(widgetLibrary.components[name], name).toBeUndefined();
  });

  it("still reads a program through the kit", () => {
    const prompt = widgetLibrary.prompt();
    for (const name of ["Card", "Tabs", "Slider", "LineChart"]) expect(prompt).toContain(`${name}(`);
  });
});

describe("the OpenUI loader", () => {
  const entry = readFileSync(require_.resolve("@openuidev/react-ui").replace(/index\.cjs$/, "index.mjs"), "utf8");

  it("marks the top-level component calls as pure and leaves the code otherwise alone", () => {
    const out = pureLoader("const A = forwardRef((p, r) => null);\nconst B = React.memo(() => null);\nconst C = createContext(null);\nlet n = 1;\n");
    expect(out).toBe("const A = /* @__PURE__ */ forwardRef((p, r) => null);\nconst B = /* @__PURE__ */ React.memo(() => null);\nconst C = /* @__PURE__ */ createContext(null);\nlet n = 1;\n");
  });

  it("drops the chat shell's attachments and the dev-tools labels", () => {
    const out = pureLoader('Button.displayName = "Button";\nAgentInterface.Sidebar = SidebarSlot;\nexport * from "@openuidev/react-headless";\nconst keep = 1;\n');
    expect(out.trim()).toBe("const keep = 1;");
  });

  it("leaves the package's real entry file with its library and theme exports", () => {
    const out = pureLoader(entry);
    expect(out).toMatch(/const openuiLibrary = \/\* @__PURE__ \*\/ createLibrary\(/);
    expect(out).toMatch(/export \{[^}]*\bThemeProvider\b[^}]*\bopenuiLibrary\b/);
  });
});
