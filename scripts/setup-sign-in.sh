#!/usr/bin/env bash
# Walks the owner through turning sign-in on in production, both ways in together before
# the first invite (decision on issue #6; spec docs/specs/value-it-signal-spec.md, 7.7):
# Google sign-in, email links (Resend) and the Admin page.
#
#   bash scripts/setup-sign-in.sh            start at step 1
#   bash scripts/setup-sign-in.sh --from 4   resume at step 4
#
# Secrets are never echoed, logged or written to disk by this script: you type
# them straight into Google, Resend or the Vercel CLI prompt.
set -Eeuo pipefail

PROJECT=finance-agent
PROD_URL=https://www.value-it.xyz
TOTAL=8
FROM=1
CURRENT=0

TITLES=("" "Google Cloud OAuth web client" "Resend from the Vercel Marketplace"
  "Verify value-it.xyz in Resend" "Vercel Production variables" "Local .env (optional)"
  "Check the owner invite" "Redeploy Production" "Check both ways in and /admin")

if [[ -t 1 ]]; then B=$'\e[1m'; D=$'\e[2m'; N=$'\e[0m'; else B=; D=; N=; fi

header() { printf '\n%s== Step %s of %s: %s ==%s\n' "$B" "$1" "$TOTAL" "$2" "$N"; }
say()    { printf '  %s\n' "$@"; }
pause()  { read -r -p "  ${1:-Press Enter when done.} " _; }
ask_yn() { local a; read -r -p "  $1 [y/N] " a; [[ $a =~ ^[Yy] ]]; }
# macOS has `open`; Linux desktops have `xdg-open`. Either way the address is printed first.
open_url() {
  say "Open: $1"
  if [[ $(uname -s) == Darwin ]] && command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true; fi
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
[[ $FROM =~ ^[1-8]$ ]] || { echo "--from takes a step number from 1 to $TOTAL." >&2; exit 2; }
[[ -f package.json && -f scripts/invites.mjs ]] || {
  echo "Run this from the repo root: bash scripts/setup-sign-in.sh" >&2; exit 2; }

# --- Vercel variable helpers (names only; values never pass through this script's output)
ENV_LIST=""
refresh_env_list() { ENV_LIST=$(vercel env ls --environment production --project "$PROJECT" 2>/dev/null || true); }
has_env() { grep -qw -- "$1" <<<"$ENV_LIST"; }
# set_var NAME secret|config [lines to show]: Production only; a secret is write-only once saved.
set_var() {
  local name=$1 kind=$2
  shift 2
  local add=(vercel env add "$name" --environment production --project "$PROJECT")
  if [[ $kind == secret ]]; then add+=(--sensitive); else add+=(--no-sensitive); fi
  echo; say "${B}$name${N}" "$@"
  if has_env "$name"; then
    ask_yn "$name is already set for Production. Replace it?" || { say "Kept the existing value."; return 0; }
    add+=(--force)
  fi
  case $name in
    BETTER_AUTH_SECRET) openssl rand -base64 32 | tr -d '\n' | "${add[@]}" ;;
    BETTER_AUTH_URL) printf '%s' "$PROD_URL" | "${add[@]}" ;;
    *) "${add[@]}" ;;
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
  2. Google Auth Platform -> Get started. App name "Value It", your Gmail as support email,
     Audience: ${B}External${N}. Branding: home page $PROD_URL, authorized domain value-it.xyz.
     Leave the logo off (it can trigger a brand check). Data Access: add nothing
     (openid, email and profile are the defaults and need no review).
  3. Audience -> ${B}Publish app${N}: the status must say ${B}In production${N}. In "Testing" only listed
     test users get in, and each sign-in ends after 7 days.
  4. Clients -> Create client -> Web application, named "Value It web (production)".
     Authorized JavaScript origin:
       $PROD_URL
     Authorized redirect URI (exact, letter for letter):
       $PROD_URL/api/auth/callback/google
     Put no localhost address in this client. For sign-in on your machine, make a separate
     client later (step 5).
  5. Copy the Client ID and the Client secret now: Google shows the full secret only once.
     Step 4 asks for both. If you download the JSON, keep it out of this repo.
EOF
  pause
}

step_2() {
  need vercel
  say "This makes a Resend account linked to Vercel and adds RESEND_API_KEY to the project." \
    "When asked, pick the ${B}$PROJECT${N} project and the ${B}Production${N} environment only." \
    "${D}Free plan: 100 emails a day, 3,000 a month. The app stops at 90 a day.${N}"
  if ! vercel integration add resend -m domain=value-it.xyz; then
    say "That did not finish. In Vercel: Marketplace -> Resend -> Install," \
      "then connect it to $PROJECT (Production only)."
  fi
  pause
}

step_3() {
  open_url https://resend.com/domains
  cat <<EOF
  In Resend: Domains -> value-it.xyz (or Add domain -> value-it.xyz).
  If the DNS for value-it.xyz is on Vercel, the Marketplace install or Resend's Auto Configure
  adds the records. Otherwise add every record Resend lists at your DNS host, copying the
  type, the name and the value exactly (and the priority of an MX record). Where your DNS host
  asks for a name, type only the part before .value-it.xyz.
  Wait until the domain says ${B}Verified${N}; DNS can take hours.
  Then, in the domain's settings, check that ${B}open tracking${N} and ${B}click tracking${N} are off
  (the default): click tracking rewrites the sign-in link.
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
  set_var GOOGLE_CLIENT_ID config "Paste the Client ID from step 1 (it ends in .apps.googleusercontent.com)."
  set_var GOOGLE_CLIENT_SECRET secret "Paste the Client secret from step 1."
  set_var EMAIL_FROM config "Suggested value: Value It <sign-in@value-it.xyz>"
  set_var BETTER_AUTH_SECRET secret "Generated with openssl and piped straight to Vercel." \
    "Replacing it later signs everyone out."
  set_var BETTER_AUTH_URL config "Set to $PROD_URL: https, no path, no / at the end." \
    "Anything else keeps both ways in off."
  echo; say "Vercel uses new values from the next deploy (step 7)."
  pause
}

step_5() {
  cat <<EOF
  Only if you want sign-in on your machine. Make a second Google client ("Value It web (local)")
  with origin http://localhost:3000 and redirect URI
  http://localhost:3000/api/auth/callback/google, then add these names to your gitignored
  .env yourself (this script does not write it):
    GOOGLE_CLIENT_ID=        the local client's ID
    GOOGLE_CLIENT_SECRET=    the local client's secret
    BETTER_AUTH_SECRET=      any fresh value from: openssl rand -base64 32
    BETTER_AUTH_URL=http://localhost:3000
    EMAIL_FROM=              Value It <sign-in@value-it.xyz>
    RESEND_API_KEY=          only if you want email links to send real mail locally
EOF
  pause
}

step_6() {
  need npm
  local email="" host hint
  say "The owner invite already exists; this only checks it. Use your Google email."
  until [[ $email == ?*@?* ]]; do read -r -p "  The email you will sign in with first: " email; done
  hint=$(db_host_hint)
  say "The host is the part of DATABASE_URL after @ and before the first /; .env must point at production."
  [[ -n $hint ]] && say "From .env it looks like: $hint"
  read -r -p "  Production database host${hint:+ [$hint]}: " host
  host=${host:-$hint}
  if INVITES_DB_OK="$host" npm run invites -- add "$email" --learner owner; then
    say "Good: \"already invited, linked to Learner N (\"owner\")\". \"Invited ..., linked to Learner N\"" \
      "means the link was missing and is there now."
  else
    say "\"already linked to an account\" is right only after your first sign-in." \
      "Before it, or \"No active Learner is named owner\": stop and give the message to an agent."
  fi
  pause
}

step_7() {
  say "New variables apply from the next Production deploy:" \
    "  Vercel -> Deployments -> the current Production deploy -> ... -> Redeploy." \
    "The build applies any pending migration itself (scripts/migrate-on-build.mjs);" \
    "nothing to run by hand."
  pause "Press Enter once the Production deploy is Ready."
}

step_8() {
  say "$PROD_URL/api/auth/ok must answer 200 (404 means a variable from step 4 is missing," \
    "or BETTER_AUTH_URL is not exactly $PROD_URL)."
  open_url "$PROD_URL/login"
  cat <<EOF
  1. /login shows "Continue with Google", "or", and "Email me a sign-in link".
  2. In a private window: Continue with Google, choose the invited account: you land in the
     Study Workspace, the account menu shows ${B}Admin${N}, and /admin lists you first under
     People with access.
  3. In another private window, with a second address you own: "Email me a sign-in link",
     open the email, press its button, then Sign in: you see ${B}Waiting for approval${N}.
  4. In your window, on /admin press ${B}Approve${N}. In the other window press Check again: you are in.
  5. On /admin press ${B}Remove access${N} for that person and confirm.
     The other window is signed out at its next click.
EOF
  pause "Press Enter when all five checks pass."
}

printf '%sSign-in setup for Value It (issue #6).%s Starting at step %s of %s.\n' "$B" "$N" "$FROM" "$TOTAL"
for ((i = FROM; i <= TOTAL; i++)); do
  CURRENT=$i
  header "$i" "${TITLES[$i]}"
  if ask_yn "Skip this step?"; then say "Skipped."; continue; fi
  "step_$i"
done

printf '\n%s== Done ==%s\n' "$B" "$N"
cat <<EOF
  Google sign-in, email links and /admin are live. Passcodes are unchanged (issue #15 decides them).
  Let someone in early:   Invite an email on /admin, or npm run invites -- add <email>
  See who is waiting:     npm run invites -- waiting
  Open or close the door: npm run invites -- open | close
EOF
