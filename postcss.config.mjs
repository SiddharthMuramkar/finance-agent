/**
 * Trims OpenUI's stylesheet after Tailwind has inlined it (see the @import lines in src/app/globals.css).
 *
 * 1. The kit's own dark colours. Its defaults repeat the whole colour set for the system's dark setting and for a
 *    `data-openui-theme` attribute. Nothing here uses either: GenuiTheme sets every kit colour on `.genui` from our
 *    tokens, and the `:root` block in globals.css maps the colours that popovers outside a widget read.
 * 2. Rules only for charts the Widget library does not draw. The three axis charts are drawn by the plot kit
 *    (src/widgets/plot), and the heatmap, funnel and mini charts are not in the library at all.
 *
 * Each rule is dropped only when every OpenUI class it names is in the list, so a rule shared with a kept part stays.
 */
const DROPPED_CLASS = /^\.openui-(?:calendar-heatmap|heatmap-chart|funnel-chart|mini-(?:area|bar|line)-chart|area-chart|line-chart|bar-chart)(?:$|[-_])/;

const trimOpenui = {
  postcssPlugin: "trim-openui",
  Once(root) {
    root.walkAtRules("media", (media) => {
      if (/prefers-color-scheme:\s*dark/.test(media.params) && media.toString().includes("data-openui-theme")) media.remove();
    });
    root.walkRules((rule) => {
      if (!rule.parent) return;
      if (rule.selector.includes("data-openui-theme=dark")) {
        rule.remove();
        return;
      }
      const dropped = (selector) => {
        const classes = selector.match(/\.openui-[\w-]+/g);
        return Boolean(classes) && classes.every((name) => DROPPED_CLASS.test(name));
      };
      if (rule.selectors.every(dropped)) rule.remove();
    });
  },
};

const config = { plugins: ["@tailwindcss/postcss", trimOpenui] };

export default config;
