#!/usr/bin/env bash
set -euo pipefail
SPEC="docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md"
TMP="$(mktemp -d)"

# Every ticket id, in creation order (wave order, section 9.1).
AGENT_IDS="T-00 T-01 A1 A3a A4 B3a C1a D1a E1 A2 A3b B1 B2a C1b D1b D1c D3a E2a A5 B2b D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j D3b E2b E5 C3 B3b E3 E4b E4a E6a E6b E6c F1 F2"
HUMAN_IDS="C2 H1"

# Ticket text: from its "### <ID> · title" heading to the next heading or rule.
body_of () {  # $1 = ticket id, $2 = output file
  awk -v id="$1" '
    $0 ~ ("^### " id " · ") { on = 1; next }
    on && (/^### / || /^## / || /^---[[:space:]]*$/) { exit }
    on { print }
  ' "$SPEC" > "$2"
  [ -s "$2" ] || { echo "No text found for $1 in $SPEC" >&2; exit 1; }
}
title_of () {  # $1 = ticket id
  grep -m1 -E "^### $1 · " "$SPEC" | sed -E 's/^### [^ ]+ · //'
}

if [ "${1:-}" = "--dry-run" ]; then
  for id in $AGENT_IDS $HUMAN_IDS; do
    body_of "$id" "$TMP/$id.md"
    echo "$id  $(wc -l < "$TMP/$id.md") lines  $(title_of "$id")"
  done
  echo "Dry run OK: every ticket has a heading and a body."
  exit 0
fi

gh label create ready-for-agent -c 0E8A16 -d "Fully specified; an agent can implement it" 2>/dev/null || true
gh label create ready-for-human -c 1D76DB -d "Needs the owner's hands"                    2>/dev/null || true
gh label create needs-triage    -c FBCA04 -d "Needs a decision before work starts"        2>/dev/null || true

# 1. Parent: title = the file's H1, body = sections 1-5.
TITLE="$(grep -m1 '^# ' "$SPEC" | sed 's/^# //')"
awk '/^## 1\./ { on = 1 } /^## 6\./ { on = 0 } on' "$SPEC" > "$TMP/parent.md"
[ -s "$TMP/parent.md" ] || { echo "Sections 1-5 not found" >&2; exit 1; }
PARENT=$(gh issue create --title "$TITLE" --body-file "$TMP/parent.md" | grep -oE '[0-9]+$')
echo "Parent #$PARENT"

# 2. Sub-issues. Bash 3 (macOS) has no associative arrays, so numbers live in N_<id> and database ids in D_<id>.
var () { echo "$1" | tr -c 'A-Za-z0-9\n' '_'; }
add_ticket () {  # $1 = ticket id, $2 = label
  local id="$1" label="$2" n dbid v
  body_of "$id" "$TMP/$id.md"
  n=$(gh issue create --title "$(title_of "$id")" --label "$label" --body-file "$TMP/$id.md" | grep -oE '[0-9]+$')
  dbid=$(gh api "repos/{owner}/{repo}/issues/$n" --jq .id)
  gh api --method POST "repos/{owner}/{repo}/issues/$PARENT/sub_issues" -F sub_issue_id="$dbid" > /dev/null
  v=$(var "$id"); eval "N_$v=$n; D_$v=$dbid"
  echo "#$n  $id  $(title_of "$id")"
}
# Native blocked-by edge: $1 = ticket, $2.. = its blockers.
block () {
  local child="$1" b cv bv n bd
  shift
  cv=$(var "$child"); eval "n=\$N_$cv"
  for b in "$@"; do
    bv=$(var "$b"); eval "bd=\$D_$bv"
    gh api --method POST "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by" -F issue_id="$bd" > /dev/null
  done
}

for id in $AGENT_IDS; do add_ticket "$id" ready-for-agent; done
for id in $HUMAN_IDS; do add_ticket "$id" ready-for-human; done

# 3. The dependency graph (section 9.1). Each line: ticket, then the tickets it waits for.
# Wave 0 rule: every ticket except T-00, T-01, C2, C3 and H1 waits for T-00 and T-01.
for id in $AGENT_IDS; do
  case "$id" in T-00|T-01|C3) ;; *) block "$id" T-00 T-01 ;; esac
done
block A2  A1
block A3b A3a
block A5  A3b A4 B2a
block B1  A1
block B2a A1
block B2b B2a
block B3b B3a A5 B2a
block C1b C1a A3a
block C2  C1b
block C3  C2
block D1b D1a
block D1c D1a
for id in D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j; do block "$id" D1b; done
block D3a D1a E1
block D3b D3a
block E2a E1 A4
block E2b E2a
block E3  E2b
block E4a E3 D3a D3b
block E4b D3b
block E5  A1 E2a
for id in E6a E6b E6c; do block "$id" E3 D1b; done
block F1  A1 A2 A3a A3b A4 A5 B1 B2a B2b B3a B3b C1a C1b D1a D1b D1c D2a D2b D2c D2d D2e D2f D2g D2h D2i D2j D3a D3b E1 E2a E2b E3 E4a E4b E5 E6a E6b E6c
block F2  F1
block H1  B3b C1b E4a

echo "Done. Check the board: gh issue list --state open --label ready-for-agent"
