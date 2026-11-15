#!/bin/bash
# ram-watch.sh — exits (and prints top memory users) when free RAM drops below $1 percent (default 25).
# Run it in the background while agents work; its exit is the alert. Linux and macOS.
LIMIT=${1:-25}
free_pct() {
  if [ -r /proc/meminfo ]; then
    awk '$1=="MemTotal:"{t=$2} $1=="MemAvailable:"{a=$2} END{printf "%d", a*100/t}' /proc/meminfo
  else
    memory_pressure -Q | awk '$0 ~ "percentage" {gsub("%","",$NF); print $NF}'
  fi
}
while true; do
  f=$(free_pct)
  if [ "$f" -lt "$LIMIT" ]; then
    echo "LOW RAM: ${f}% free at $(date +%H:%M)"
    ps -eo rss=,comm= | sort -rn | head -8 | awk '{printf "%.1fG %s\n",$1/1048576,$2}'
    exit 0
  fi
  sleep 30
done
