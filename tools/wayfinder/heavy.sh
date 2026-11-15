#!/bin/bash
# heavy.sh — RAM gate for heavy jobs (tsc, eslint, vitest, next build, playwright, npm ci, library:*).
# Runs the command only when a slot is free AND enough RAM is free. Works on Linux (Fedora) and macOS.
# Usage: tools/wayfinder/heavy.sh <command...>
# Env: HEAVY_SLOTS (default 2), HEAVY_MIN_FREE_PCT (default 40), HEAVY_LOCKS (lock dir).
set -u
SLOTS=${HEAVY_SLOTS:-2}
MIN_FREE=${HEAVY_MIN_FREE_PCT:-40}
LOCKS=${HEAVY_LOCKS:-${TMPDIR:-/tmp}/heavy-locks}
mkdir -p "$LOCKS"
# Cap each Node heap at 4 GB so one job cannot eat the machine.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"

free_pct() {
  if [ -r /proc/meminfo ]; then
    awk '$1=="MemTotal:"{t=$2} $1=="MemAvailable:"{a=$2} END{printf "%d", a*100/t}' /proc/meminfo
  else
    memory_pressure -Q | awk '$0 ~ "percentage" {gsub("%","",$NF); print $NF}'
  fi
}

slot=""
waited=0
while [ -z "$slot" ]; do
  for i in $(seq 1 "$SLOTS"); do
    d="$LOCKS/slot$i"
    # Free a slot whose owner died (killed agent, timeout).
    if [ -d "$d" ]; then
      pid=$(cat "$d/pid" 2>/dev/null)
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$d"; fi
    fi
    if mkdir "$d" 2>/dev/null; then
      echo $$ > "$d/pid"
      if [ "$(free_pct)" -ge "$MIN_FREE" ]; then slot="$d"; break; fi
      rm -rf "$d"
    fi
  done
  if [ -z "$slot" ]; then
    [ $((waited % 60)) -eq 0 ] && echo "heavy.sh: waiting for a slot or RAM ($(free_pct)% free)" >&2
    sleep 5
    waited=$((waited + 5))
  fi
done
trap 'rm -rf "$slot"' EXIT INT TERM
echo "heavy.sh: $(basename "$slot") start ($(free_pct)% free): $*" >&2
"$@"
