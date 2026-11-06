import type { NextConfig } from "next";

// OpenUI ships as one file, and a bundler cannot tell which of its parts a page uses. Three changes trim it (the
// numbers are in docs/architecture.md): a loader that marks its top-level calls as pure and drops its chat shell;
// stand-ins for the code highlighter, date picker and table engine that only dropped parts call; and, in
// globals.css, only the stylesheets of the parts the Widget library keeps. See src/widgets/openui-stubs/README.md.
// The aliases are global, and nothing else in src/ imports those packages.
const STUBS = "./src/widgets/openui-stubs";

const nextConfig: NextConfig = {
  // The browser test bed (E2E=1, spec 2026-11-05 T-00) builds into its own folder, so it never shares a lock or a
  // cache with a normal `npm run dev`.
  distDir: process.env.E2E === "1" ? ".next-e2e" : ".next",
  turbopack: {
    rules: {
      "*.mjs": { condition: { path: /@openuidev\/react-ui\/dist\/index\.mjs$/ }, loaders: [`${STUBS}/pure-loader.cjs`], as: "*.js" },
    },
    resolveAlias: {
      "react-syntax-highlighter": `${STUBS}/react-syntax-highlighter.tsx`,
      "react-syntax-highlighter/dist/cjs/styles/prism/index.js": `${STUBS}/react-syntax-highlighter-styles.ts`,
      "react-day-picker": `${STUBS}/react-day-picker.tsx`,
      "date-fns": `${STUBS}/date-fns.ts`,
      "@tanstack/react-table": `${STUBS}/tanstack-react-table.ts`,
    },
  },
  // The Course Map is read from course/topics and course/outline.yaml at runtime, so ship those files with every route.
  outputFileTracingIncludes: { "/*": ["./course/topics/**/*", "./course/outline.yaml"] },
  // Progress and the Course Map are one page now (spec 2026-11-05 B1): the old address answers 308 to the map.
  async redirects() {
    return [{ source: "/progress", destination: "/course", permanent: true }];
  },
  // "/" (Home) is public, so no other site may frame any page (clickjacking), browsers must not guess content types,
  // and other sites see only our origin as the referrer. Only frame-ancestors is set: a full script CSP would need nonces.
  async headers() {
    return [
      // Home is one address for two pages, keyed only by the cookie: never cached by a CDN or the browser.
      { source: "/", headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }] },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
