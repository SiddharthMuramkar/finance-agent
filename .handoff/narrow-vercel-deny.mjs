// Owner-run (2026-11-15, issue #33): replace the blanket "Bash(vercel *)" block in
// ~/.claude/settings.json with blocks on only the risky Vercel commands, so the agent
// can run the rest (env, firewall, project settings, logs). Edits the file in place.
import fs from "node:fs";

const file = `${process.env.HOME}/.claude/settings.json`;
const settings = JSON.parse(fs.readFileSync(file, "utf8"));
const perms = settings.permissions ?? {};
const list = ["deny", "ask"].find((key) => (perms[key] ?? []).includes("Bash(vercel *)"));
if (!list) {
  console.log('"Bash(vercel *)" not found; nothing changed.');
  process.exit(1);
}
perms[list].splice(perms[list].indexOf("Bash(vercel *)"), 1);
const risky = [
  "Bash(vercel)",
  "Bash(vercel deploy*)",
  "Bash(vercel redeploy*)",
  "Bash(vercel --prod*)",
  "Bash(vercel promote*)",
  "Bash(vercel rollback*)",
  "Bash(vercel remove*)",
  "Bash(vercel rm *)",
  "Bash(vercel project rm*)",
  "Bash(vercel domains rm*)",
  "Bash(vercel dns rm*)",
];
perms.deny = [...new Set([...(perms.deny ?? []), ...risky])];
fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`ok: removed from ${list}, added ${risky.length} narrow blocks`);
