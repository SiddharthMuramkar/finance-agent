// Graduates fog into child tickets of an existing map, then wires native blocking in a second pass.
// Blocked-by tokens: a draft key (D1) or an existing issue number (#16).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const R = 'SiddharthMuramkar/finance-agent';
const MAP = '2';
const gh = (args, input) => execFileSync('gh', args, { input, encoding: 'utf8' }).trim();
const num = (url) => url.split('/').pop();

const tickets = readFileSync(process.argv[2], 'utf8')
  .split(/^@@@ /m)
  .filter((s) => s.trim())
  .map((block) => {
    const lines = block.split('\n');
    const [key, label, blocked = ''] = lines[0].split('|').map((s) => s.trim());
    return {
      key, label,
      blocked: blocked.split(',').map((s) => s.trim()).filter(Boolean),
      title: lines[1].trim(),
      body: lines.slice(2).join('\n').trim() + '\n',
    };
  });

for (const t of tickets) {
  t.url = gh(['issue', 'create', '-R', R, '--parent', MAP, '--label', t.label, '--title', t.title, '--body-file', '-'], t.body);
  t.num = num(t.url);
  console.log(t.key, t.num, t.title);
}

const byKey = Object.fromEntries(tickets.map((t) => [t.key, t]));
for (const t of tickets) {
  if (!t.blocked.length) continue;
  const nums = t.blocked.map((k) => (k.startsWith('#') ? k.slice(1) : byKey[k].num));
  gh(['issue', 'edit', t.num, '-R', R, '--add-blocked-by', nums.join(',')]);
  console.log('BLOCK', t.key, '<-', t.blocked.join(','));
}

writeFileSync(process.argv[2].replace(/\.txt$/, '.result.json'), JSON.stringify(tickets.map(({ key, title, url, num: n }) => ({ key, title, url, num: n })), null, 1));
