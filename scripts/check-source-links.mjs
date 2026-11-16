// The laptop check for #75: every Source the public site names (each Example's linked Sources and the one About names)
// answers 200. Run: npm run site:links
// It goes out to the network, so it runs by hand, not in `npm run check` or CI (live fetches are flaky there); the
// offline half, that every named Source carries an https link, is pinned in src/site/examples.test.ts and
// src/app/(site)/pages.test.tsx. Node strips the TypeScript types from the imported modules directly; no build step.
import { about } from "../src/site/copy.ts";
import { EXAMPLES } from "../src/site/examples.ts";

const links = [
  ...EXAMPLES.flatMap((e) => e.sources.filter((s) => "url" in s).map((s) => ({ where: `/examples/${e.slug}`, label: s.label, url: s.url }))),
  { where: "/about", label: about.notAffiliatedSource.name, url: about.notAffiliatedSource.url },
];

// A plain browser's request, since some news sites refuse a bare client. SEC EDGAR instead refuses a browser-like client
// and asks automated ones to name themselves (its fair-access policy).
const SEC_AGENT = "value-it-link-check admin@example.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 value-it-link-check",
  Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
  "Accept-Language": "en",
};

async function status(url) {
  try {
    const headers = new URL(url).hostname.endsWith("sec.gov") ? { ...HEADERS, "User-Agent": SEC_AGENT } : HEADERS;
    const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    await response.body?.cancel();
    return response.status;
  } catch (error) {
    return `failed (${error.cause?.code ?? error.name})`;
  }
}

const results = await Promise.all(links.map(async (link) => ({ ...link, status: await status(link.url) })));
const broken = results.filter((r) => r.status !== 200);
for (const r of results) console.log(`${r.status === 200 ? "ok " : "BAD"} ${r.status}  ${r.where}  ${r.label}  ${r.url}`);
if (broken.length) {
  console.error(`${broken.length} of ${results.length} named Source link(s) did not answer 200.`);
  process.exit(1);
}
console.log(`All ${results.length} named Source links answer 200.`);
