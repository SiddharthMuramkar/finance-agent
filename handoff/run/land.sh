#!/bin/bash
# Usage: land.sh <pr> [issue]. Waits for check, build and ui (if present); merges; closes the issue if still open.
PR=$1; ISSUE=$2
for i in $(seq 1 80); do
  J=$(gh pr view $PR --json state,statusCheckRollup)
  ST=$(echo "$J" | jq -r .state); [ "$ST" = MERGED ] && break
  REQ=$(echo "$J" | jq -r '[.statusCheckRollup[] | select(.name=="check" or .name=="build" or .name=="ui")]')
  FAIL=$(echo "$REQ" | jq -r '[.[] | select(.conclusion=="FAILURE" or .conclusion=="CANCELLED" or .conclusion=="TIMED_OUT") | .name] | join(",")')
  [ -n "$FAIL" ] && { echo "CI_RED $FAIL"; exit 2; }
  DONE=$(echo "$REQ" | jq -r '[.[] | select(.conclusion=="SUCCESS")] | length'); HASUI=$(echo "$REQ" | jq -r '[.[]|select(.name=="ui")]|length')
  NEED=$((2 + HASUI))
  if [ "$DONE" -ge "$NEED" ] && [ "$HASUI" -ge 0 ]; then gh pr merge $PR --auto --merge >/dev/null 2>&1; fi
  sleep 30
done
ST=$(gh pr view $PR --json state -q .state); echo "PR $PR $ST"
[ "$ST" != MERGED ] && exit 3
if [ -n "$ISSUE" ] && [ "$(gh issue view $ISSUE --json state -q .state)" = OPEN ]; then gh issue close $ISSUE --comment "Closed by #$PR, merged into main."; fi
echo "issue $ISSUE $(gh issue view $ISSUE --json state -q .state)"
