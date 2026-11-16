# Issue tracker

Issues live in GitHub Issues for `SiddharthMuramkar/finance-agent`. Use the `gh` CLI.

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <n> --comments`
- List: `gh issue list`
- Comment: `gh issue comment <n> --body "..."`
- Close: only through a PR whose body says `Closes #<n>`. Never `gh issue close` by hand, except a wayfinder ticket when the owner says yes in that turn (see Resolve).

PRs as a request surface: off. Only issues are triaged as requests.

## Wayfinding operations

How the wayfinder skill's map, tickets, blocking and frontier live on GitHub. Repo: `SiddharthMuramkar/finance-agent`.

- **Map**: one issue labelled `wayfinder:map`. Find it: `gh issue list --label wayfinder:map --state all`.
- **Ticket**: a sub-issue of the map with exactly one label `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`. Create: `gh issue create --parent <map> --label wayfinder:grilling --title "..." --body "..."`.
- **Blocking**: GitHub's native "blocked by" link. Add: `gh issue edit <n> --add-blocked-by <m>`. Remove: `--remove-blocked-by <m>`.
- **Claim**: assign the ticket before any work: `gh issue edit <n> --add-assignee @me`. An open, unassigned ticket is unclaimed.
- **Frontier**: open sub-issues of the map that are unassigned and have no open blocker:

  ```sh
  gh api graphql -F n=<map> -f query='query($n:Int!){repository(owner:"SiddharthMuramkar",name:"finance-agent"){issue(number:$n){subIssues(first:100){nodes{number title state assignees(first:1){totalCount} blockedBy(first:20){nodes{state}}}}}}}' \
    --jq '.data.repository.issue.subIssues.nodes[] | select(.state=="OPEN" and .assignees.totalCount==0 and ([.blockedBy.nodes[] | select(.state=="OPEN")] | length)==0) | "#\(.number) \(.title)"'
  ```

- **Resolve**: post the answer as a comment (`gh issue comment <n> --body "..."`), close the ticket (`gh issue close <n>`, only with the owner's yes in that turn), then add one line to the map's "Decisions so far": `- [<ticket title>](<url>): <one-line gist>`.
- **Research findings**: commit them on a throwaway branch named `research-<slug>`, push it, never open a PR, and link the branch from the ticket. No branch but `main` gets a Vercel deploy: `vercel.json` has `"main": true, "**": false`, and `**` (unlike `*`) also matches names with `/`.
- **Labels**: map and tickets carry only `wayfinder:*` labels. Build issues made after the map is clear carry `ready-for-agent` or `ready-for-human`.
