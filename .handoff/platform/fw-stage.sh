#!/usr/bin/env bash
# STAGES DRAFTS ONLY (vercel firewall rules/managed changes are drafts until `publish`).
# Do NOT run without owner OK. Publish is a separate, owner-run step (see bottom).
# Docs: https://vercel.com/docs/cli/firewall
#       https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration
#       https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
set -euo pipefail
S=(--scope acme-ef4b --project prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx)
D=/Users/siddharth/value-it/.wayfinder-tmp/platform

# a. Bot Protection managed rule -> log (currently: off)
vercel firewall rules update bot-protection --action log --yes "${S[@]}"

# b. AI Bots managed rule -> log (currently: allow). Category-level alt:
#    vercel firewall rules update ai-bots --category ai-crawlers --action log --yes
vercel firewall rules update ai-bots --action log --yes "${S[@]}"

# e. Bypass for Vercel Cron (must be first). Bypass skips remaining custom rules + managed rulesets.
vercel firewall rules add --data "$(cat $D/fw-rule-e-cron-bypass.json)" --yes "${S[@]}"

# c. POST /api/turn: 20 / 60 s per IP, log when exceeded
vercel firewall rules add --data "$(cat $D/fw-rule-c-turn-ratelimit.json)" --yes "${S[@]}"

# d. POST /api/* (not /api/turn, not /api/cron/): 120 / 60 s per IP, log when exceeded
vercel firewall rules add --data "$(cat $D/fw-rule-d-api-ratelimit.json)" --yes "${S[@]}"

# Order: bypass first
vercel firewall rules move "Bypass Vercel Cron" --first --yes "${S[@]}"

# Review (read-only)
vercel firewall diff "${S[@]}"
vercel firewall rules list --expand "${S[@]}"

# OWNER RUNS (agents must pass --effects-digest from the preview; --yes is rejected for agents):
#   vercel firewall publish --confirm-name finance-agent --scope acme-ef4b --project prj_GhCV5t8pT2vuRQQo0hlnImPWLlAx
# Abort: vercel firewall discard ... (only if owner asks)
