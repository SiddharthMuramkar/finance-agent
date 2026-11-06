#!/bin/bash
# Compact status for the 15-minute watchdog. Read-only.
RUN=/Users/siddharth/Downloads/finance-agent-story-run
R=SiddharthMuramkar/finance-agent
echo "time $(date '+%H:%M')  caffeinate $(pgrep -q caffeinate && echo on || echo OFF)  load $(sysctl -n vm.loadavg | awk '{print $2}')  free-mem $(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{print $2}')"
if [ -f "$RUN/journal-path.txt" ]; then J=$(cat "$RUN/journal-path.txt"); if [ -f "$J" ]; then
  echo "journal: $(wc -l < "$J") events, last $(( ($(date +%s) - $(stat -f %m "$J")) / 60 )) min ago"; fi; fi
echo "-- open story PRs"
gh pr list -R $R --state open --search "head:story/" --json number,headRefName,statusCheckRollup,isDraft \
  -q '.[] | "#\(.number) \(.headRefName)\(if .isDraft then " (draft)" else "" end) " + ([.statusCheckRollup[]? | select(.name=="check" or .name=="build" or .name=="ui") | "\(.name)=\((.conclusion // .status)|ascii_downcase)"] | join(" "))'
echo "-- main CI (last 3)"
gh run list -R $R --branch main --workflow CI --limit 3 --json conclusion,status,displayTitle,createdAt \
  -q '.[] | "\(.createdAt[11:16]) \(.conclusion // .status) \(.displayTitle[0:60])"'
OPEN=$(gh issue list -R $R --state open --label ready-for-agent --limit 100 --json number -q '[.[] | select(.number>=324 and .number<=368)] | length')
echo "-- spec tickets open (ready-for-agent): $OPEN of 43; needs-triage since run: $(gh issue list -R $R --state open --label needs-triage --search 'created:>=2026-11-05' --json number -q length)"
[ -f "$RUN/ledger.txt" ] && echo "-- ledger: $(cat $RUN/ledger.txt)"
