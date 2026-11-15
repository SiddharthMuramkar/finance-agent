// Records batch decisions: resolution comment, close, one line in the map's "Decisions so far".
// Usage: node record.mjs decisions-<round>.json
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const R = 'SiddharthMuramkar/finance-agent';
const MAP = '2';
const gh = (args, input) => execFileSync('gh', args, { input, encoding: 'utf8' }).trim();
const decisions = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const lines = [];
for (const d of decisions) {
  const { title, url } = JSON.parse(gh(['issue', 'view', String(d.num), '-R', R, '--json', 'title,url']));
  const body = `## Resolution (owner, ${d.date})\n\n**Decision:** ${d.decision}\n\n${d.details ? d.details + '\n\n' : ''}**What I learned:** ${d.learned}\n`;
  gh(['issue', 'comment', String(d.num), '-R', R, '--body-file', '-'], body);
  gh(['issue', 'close', String(d.num), '-R', R, '--reason', 'completed']);
  lines.push(`- [${title}](${url}): ${d.gist}`);
  console.log('closed', d.num, title);
}

const map = JSON.parse(gh(['issue', 'view', MAP, '-R', R, '--json', 'body'])).body;
const marker = '## Not yet specified';
const i = map.indexOf(marker);
const next = map.slice(0, i).trimEnd() + '\n' + lines.join('\n') + '\n\n' + map.slice(i);
gh(['issue', 'edit', MAP, '-R', R, '--body-file', '-'], next);
console.log('map updated', lines.length);
