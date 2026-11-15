#!/bin/bash
# Stage firewall drafts (LOG mode only). Publish is a separate step after reviewing the diff.
# Docs: https://vercel.com/docs/cli/firewall
#       https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration
#       https://vercel.com/docs/cron-jobs (UA vercel-cron/1.0 + x-vercel-cron-schedule)
# Run 1 staged a. (bot-protection -> log) then stopped: AI Bots needs --category.
set -euo pipefail
S=(--scope acme-ef4b --project prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx)
D=/Users/siddharth/value-it/.wayfinder-tmp/platform
cd /Users/siddharth/value-it/finance-agent-wt-11-provider

echo "== b. ai-bots -> log (per category)"
vercel firewall rules update ai-bots --category ai-crawlers --action log --yes "${S[@]}"
vercel firewall rules update ai-bots --category ai-assistants --action log --yes "${S[@]}"
echo "== e. cron bypass"
vercel firewall rules add --data "$(cat $D/fw-rule-e-cron-bypass.json)" --yes "${S[@]}"
echo "== c. POST /api/turn 20/60s log"
vercel firewall rules add --data "$(cat $D/fw-rule-c-turn-ratelimit.json)" --yes "${S[@]}"
echo "== d. POST /api/* 120/60s log"
vercel firewall rules add --data "$(cat $D/fw-rule-d-api-ratelimit.json)" --yes "${S[@]}"
echo "== diff"
vercel firewall diff "${S[@]}"
