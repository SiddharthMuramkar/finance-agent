#!/usr/bin/env bash
# Walks the owner through Appendix F.1 of
# docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md:
# Google sign-in, email links (Resend) and the Admin page, in production.
#
#   bash scripts/setup-sign-in.sh            start at step 1
#   bash scripts/setup-sign-in.sh --from 4   resume at step 4
#
# Secrets are never echoed, logged or written to disk by this script: you type
# them straight into Google, Resend or the Vercel CLI prompt.
set -Eeuo pipefail

PROJECT=finance-agent
REPO=SiddharthMuramkar/finance-agent
PROD_URL=https://www.value-it.xyz
TOTAL=9
FROM=1
CURRENT=0

TITLES=("" "Google Cloud OAuth web client" "Resend from the Vercel Marketplace"
  "Verify value-it.xyz in Resend" "Vercel Production variables" "Local .env (optional)"
  "Production migration" "Link yourself as the owner" "Deploy and check"
  "Close the passcode door and #367")

if [[ -t 1 ]]; then B=$'\e[1m'; D=$'\e[2m'; N=$'\e[0m'; else B=; D=; N=; fi

header() { printf '\n%s== Step %s of %s: %s ==%s\n' "$B" "$1" "$TOTAL" "$2" "$N"; }
say()    { printf '  %s\n' "$@"; }
pause()  { read -r -p "  ${1:-Press Enter when done.} " _; }
ask_yn() { local a; read -r -p "  $1 [y/N] " a; [[ $a =~ ^[Yy] ]]; }
open_url() {
  say "Open: $1"
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true; fi
}
need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "  This step needs '$1' on your PATH. Install it, then rerun with --from $CURRENT." >&2
  exit 1
}
trap 'echo; echo "Stopped at step $CURRENT. Resume with: bash scripts/setup-sign-in.sh --from $CURRENT" >&2' ERR

while [[ $# -gt 0 ]]; do
  case $1 in
    --from) FROM=${2:-}; shift $(( $# > 1 ? 2 : 1 )) ;;
    --from=*) FROM=${1#*=}; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done
[[ $FROM =~ ^[1-9]$ ]] || { echo "--from takes a step number from 1 to $TOTAL." >&2; exit 2; }
[[ -f package.json && -f scripts/invites.mjs ]] || {
  echo "Run this from the repo root: bash scripts/setup-sign-in.sh" >&2; exit 2; }

# --- Vercel variable helpers (names only; values never pass through this script's output)
ENV_LIST=""
refresh_env_list() { ENV_LIST=$(vercel env ls production --project "$PROJECT" 2>/dev/null || true); }
has_env() { grep -qw -- "$1" <<<"$ENV_LIST"; }
set_var() {
  local name=$1
  shift
  echo; say "${B}$name${N}" "$@"
  if has_env "$name"; then
    ask_yn "$name is already set for Production. Replace it?" || { say "Kept the existing value."; return 0; }
    vercel env rm "$name" production --project "$PROJECT" --yes
  fi
  case $name in
    BETTER_AUTH_SECRET) openssl rand -base64 32 | tr -d '\n' | vercel env add "$name" production --project "$PROJECT" ;;
    BETTER_AUTH_URL) printf '%s' "$PROD_URL" | vercel env add "$name" production --project "$PROJECT" ;;
    *) vercel env add "$name" production --project "$PROJECT" ;;
  esac
}
db_host_hint() {
  [[ -f .env ]] || return 0
  sed -nE "s/^DATABASE_URL=[\"']?[^@]*@([^/?\"']+).*/\1/p" .env | head -n 1
}

step_1() {
  open_url https://console.cloud.google.com/
  cat <<EOF
  1. Project picker at the top -> New project -> name it "Value It".
  2. APIs & Services -> OAuth consent screen (now "Google Auth Platform") -> Get started.
     App name "Value It", your email as support email, Audience: ${B}External${N},
     authorized domain value-it.xyz. Scopes: keep the defaults (openid, email, profile), add nothing.
  3. Google Auth Platform -> Audience -> ${B}Publish app${N}. Leave the logo off (it triggers brand review).
  4. Google Auth Platform -> Clients -> Create client -> Web application, name "Value It web".
     Authorized JavaScript origins:
       https://www.value-it.xyz
       http://localhost:3000
     Authorized redirect URIs (exact, no wildcard):
       https://www.value-it.xyz/api/auth/callback/google
       http://localhost:3000/api/auth/callback/google
  5. Leave the Client ID and Client secret dialog open: step 4 asks for both.
     If you download the JSON, keep it out of this repo.
EOF
  pause
}

step_2() {
  need vercel
  say "This installs Resend and adds RESEND_API_KEY to the project." \
    "When asked, pick the ${B}$PROJECT${N} project and the ${B}Production${N} environment only." \
    "${D}Free plan: 100 emails a day, 3,000 a month. The app stops at 90 a day.${N}"
  if ! vercel integration add resend/resend-email; then
    say "That did not finish. Try: vercel integration open resend" \
      "or in Vercel: Marketplace -> Resend -> Install."
  fi
  pause
}

step_3() {
  open_url https://resend.com/domains
  cat <<EOF
  In Resend: Domains -> Add domain -> value-it.xyz. Then add the DNS records Resend shows,
  copying each value exactly. Where your DNS host asks for a name, type only the part
  before .value-it.xyz:
    DKIM   TXT  resend._domainkey   (value from Resend)
    SPF    MX   send                (priority 10, value from Resend)
    SPF    TXT  send                v=spf1 include:amazonses.com ~all
    DMARC  TXT  _dmarc              v=DMARC1; p=none;
  If the DNS is on Vercel, Resend's Auto Configure adds them for you.
  Wait until the domain says ${B}Verified${N}. Then, in the domain's settings, turn
  ${B}open tracking${N} and ${B}click tracking${N} off: click tracking rewrites the sign-in link.
EOF
  pause "Press Enter once the domain is Verified and tracking is off."
}

step_4() {
  need vercel; need openssl
  say "Every variable goes to ${B}Production only${N} on $PROJECT, never Preview." \
    "Vercel prompts for a value where needed: paste it there, it is not shown here."
  refresh_env_list
  if has_env RESEND_API_KEY; then say "RESEND_API_KEY is set for Production."
  else say "${B}RESEND_API_KEY is missing for Production.${N} Finish step 2 first (--from 2)."; fi
  set_var GOOGLE_CLIENT_ID "Paste the Client ID from step 1."
  set_var GOOGLE_CLIENT_SECRET "Paste the Client secret from step 1."
  set_var EMAIL_FROM "Suggested value: Value It <sign-in@value-it.xyz>"
  set_var BETTER_AUTH_SECRET "Generated with openssl and piped straight to Vercel." \
    "Replacing it later signs everyone out."
  set_var BETTER_AUTH_URL "Set to $PROD_URL (the address written into emailed links)."
  echo; say "Vercel uses new values from the next deploy. Do steps 6 and 7 before anything deploys."
  pause
}

step_5() {
  cat <<EOF
  For sign-in on your machine, add these names to your gitignored .env yourself
  (this script does not write it):
    GOOGLE_CLIENT_ID=        same as Production
    GOOGLE_CLIENT_SECRET=    same as Production
    BETTER_AUTH_SECRET=      any fresh value from: openssl rand -base64 32
    BETTER_AUTH_URL=http://localhost:3000
    EMAIL_FROM=              Value It <sign-in@value-it.xyz>
    RESEND_API_KEY=          only if you want email links to work locally
EOF
  pause
}

step_6() {
  need npm
  open_url https://console.neon.tech/
  say "1. Take a Neon snapshot first, so you have a way back (Neon console -> Branches or Backups)." \
    "2. npm run db:migrate reads ${B}DATABASE_URL_UNPOOLED${N} from .env, so it must point at" \
    "   the ${B}production${N} database for this run." \
    "It only adds tables (sign-in, access_denials, rate_limit, email_link_sends); nothing is dropped."
  if [[ -f .env ]] && ! grep -q '^DATABASE_URL_UNPOOLED=.' .env; then
    say "${B}DATABASE_URL_UNPOOLED is empty or missing in .env.${N} Add it before you go on."
  fi
  if ask_yn "Snapshot taken and .env points at production. Run the migration now?"; then
    npm run db:migrate
  else
    say "Not run. Resume later with --from 6."
  fi
}

step_7() {
  need npm
  local email="" host hint
  until [[ $email == ?*@?* ]]; do read -r -p "  The Google email you will sign in with: " email; done
  hint=$(db_host_hint)
  say "The host is the part of DATABASE_URL after @ and before the first /."
  [[ -n $hint ]] && say "From .env it looks like: $hint"
  read -r -p "  Production database host${hint:+ [$hint]}: " host
  host=${host:-$hint}
  INVITES_DB_OK="$host" npm run invites -- add "$email" --learner owner
  say "Expect: linked to Learner 1 (\"owner\"). If the number differs, check before going on."
  pause
}

step_8() {
  say "New variables apply from the next Production deploy. Either:" \
    "  - merge the PR: main deploys www.value-it.xyz, or" \
    "  - Vercel -> Deployments -> latest Production -> Redeploy."
  if ask_yn "Deploy this checkout to Production with 'vercel --prod' instead?"; then
    need vercel; vercel --prod
  fi
  pause "Press Enter once the Production deploy is Ready."
  open_url "$PROD_URL/login"
  cat <<EOF
  1. Continue with Google, choose your account: you land in the Study Workspace.
  2. Your account menu shows ${B}Admin${N}; on /admin you are under People with access.
  3. In a private window, open /login with a second address you own and press
     "Email me a sign-in link". Open the email, press its button, then Sign in:
     you should see ${B}Waiting for approval${N}.
  4. In your window, on /admin press ${B}Approve${N}. In the private window press Check again: you are in.
  5. On /admin press ${B}Remove access${N} for that person and confirm.
     The private window is signed out at its next click.
EOF
  pause "Press Enter when all five checks pass."
}

step_9() {
  say "1. In Vercel (Settings -> Environment Variables, Production), edit PASSCODES:" \
    "   take out the owner:... entry and keep tools:... (browser tests and evals need it)."
  pause
  if command -v vercel >/dev/null 2>&1; then
    refresh_env_list
    if has_env PASSCODE && ask_yn "PASSCODE is still set for Production. Delete it now?"; then
      vercel env rm PASSCODE production --project "$PROJECT" --yes
    fi
  else
    say "Also delete PASSCODE from Production if it is still set."
  fi
  say "2. Redeploy Production (as in step 8) so the change takes effect."
  pause
  local comment
  read -r -p "  Comment for #367 [F.1 worked as written; no step needed a change.]: " comment
  comment=${comment:-"F.1 worked as written; no step needed a change."}
  if command -v gh >/dev/null 2>&1 && ask_yn "Close #367 with that comment now?"; then
    gh issue close 367 --repo "$REPO" --comment "$comment"
  else
    say "Later: gh issue close 367 --repo $REPO --comment \"...\""
  fi
}

printf '%sSign-in setup for Value It (Appendix F.1).%s Starting at step %s of %s.\n' "$B" "$N" "$FROM" "$TOTAL"
for ((i = FROM; i <= TOTAL; i++)); do
  CURRENT=$i
  header "$i" "${TITLES[$i]}"
  if ask_yn "Skip this step?"; then say "Skipped."; continue; fi
  "step_$i"
done

printf '\n%s== Done ==%s\n' "$B" "$N"
cat <<EOF
  Google sign-in, email links and /admin are live; passcodes no longer open your Learner.
  Let someone in early:   Invite an email on /admin, or npm run invites -- add <email>
  See who is waiting:     npm run invites -- waiting
  Open or close the door: npm run invites -- open | close
EOF
