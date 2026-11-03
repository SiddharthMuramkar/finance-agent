## Agent skills

### Issue tracker

Issues live in GitHub Issues on `SiddharthMuramkar/finance-agent`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label string equal to its role name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Architecture note

Whenever you add a layer (a table, a module, a tool, a screen), update `docs/architecture.md` in the same change: what it does, a concrete scenario, the trade-off, in plain words.
