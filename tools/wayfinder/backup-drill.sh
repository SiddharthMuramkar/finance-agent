#!/usr/bin/env bash
# backup-drill.sh: backup posture for Value It before any migration (wayfinder ticket #8, option B).
# Stages: tools, daily snapshot schedule on Neon main, protect main, an off-Neon pg_dump of the
# library_* tables, a second copy, a restore drill into a throwaway branch, a count+hash compare.
#
#   bash ~/value-it/.wayfinder-tmp/wizards/backup-drill.sh            start at stage 1
#   bash ~/value-it/.wayfinder-tmp/wizards/backup-drill.sh --from 5   resume at stage 5
#
# Secrets: you paste connection strings with hidden entry. They stay in this shell's memory only.
# The restore writes only into a NEW database on a host that is not main's host. Neon settings
# change only by your hand in the Console. Re-run stages 4 to 6 after each `npm run library:load`.
set -Eeuo pipefail

# ============================================================================ library (generic; do not edit)
# Written to match the mattpocock-skills wizard template (stage progress, confirmation gates,
# cross-platform URL opening, hidden secret entry). The template file itself was not readable here.
TOTAL_STAGES=0
CURRENT_STAGE=0
FROM_STAGE=1
SUMMARY=()

if [[ -t 1 ]]; then
  B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else
  B=; D=; G=; Y=; R=; N=
fi

progress_bar() {
  local done=$1 total=$2 width=24 filled
  filled=$(( total > 0 ? done * width / total : 0 ))
  printf '['
  printf '%*s' "$filled" '' | tr ' ' '#'
  printf '%*s' $(( width - filled )) '' | tr ' ' '.'
  printf ']'
}
stage() {
  if [[ -t 1 ]]; then printf '\e[2J\e[H'; fi
  printf '%s%s  stage %s of %s, %s left after this%s\n' "$D" "$(progress_bar $(( CURRENT_STAGE - 1 )) "$TOTAL_STAGES")" \
    "$CURRENT_STAGE" "$TOTAL_STAGES" $(( TOTAL_STAGES - CURRENT_STAGE )) "$N"
  printf '\n%s== %s ==%s\n\n' "$B" "$1" "$N"
}
say()  { printf '  %s\n' "$@"; }
step() { local n=$1; shift; printf '  %s%s.%s %s\n' "$B" "$n" "$N" "$*"; }
ok()   { printf '  %sOK:%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %sCAUTION:%s %s\n' "$Y" "$N" "$*"; }
fail() { printf '  %sSTOP:%s %s\n' "$R" "$N" "$*" >&2; }
note() { SUMMARY+=("$*"); }
pause() { local _a; read -r -p "  ${1:-Press Enter when done.} " _a || true; }
confirm() { local a=""; read -r -p "  $1 [y/N] " a || true; [[ $a == [Yy]* ]]; }
ask() { # ask VAR "prompt" [default]: visible entry, for values that are not secret
  local __var=$1 __prompt=$2 __def=${3:-} __val=""
  while [[ -z $__val ]]; do
    read -r -p "  $__prompt${__def:+ [$__def]}: " __val || true
    __val=${__val:-$__def}
  done
  printf -v "$__var" '%s' "$__val"
}
ask_secret() { # ask_secret VAR "prompt": hidden entry, never echoed
  local __var=$1 __prompt=$2 __val=""
  while [[ -z $__val ]]; do
    read -r -s -p "  $__prompt (hidden, paste and press Enter): " __val || true
    printf '\n'
  done
  printf -v "$__var" '%s' "$__val"
}
open_url() {
  say "Open: ${B}$1${N}"
  if [[ $(uname -s) == Darwin ]]; then
    open "$1" >/dev/null 2>&1 || true
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    if command -v wslview >/dev/null 2>&1; then wslview "$1" >/dev/null 2>&1 || true
    else cmd.exe /c start "" "$1" >/dev/null 2>&1 || true; fi
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 || true
  fi
}
need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  fail "This stage needs '$1' on your PATH. Install it, then resume with --from $CURRENT_STAGE."
  exit 1
}
trap 'printf "\n%sStopped at stage %s.%s Resume with: bash %s --from %s\n" "$R" "$CURRENT_STAGE" "$N" "$0" "$CURRENT_STAGE" >&2' ERR INT

while [[ $# -gt 0 ]]; do
  case $1 in
    --from) FROM_STAGE=${2:-}; shift $(( $# > 1 ? 2 : 1 )) ;;
    --from=*) FROM_STAGE=${1#*=}; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

# ============================================================================ STAGES
TOTAL_STAGES=11

# Facts checked on 2026-11-14 (Neon API): project finance-agent, Launch plan, Postgres 18,
# 7-day restore window, not protected, no snapshot schedule.
NEON_PROJECT_ID="${NEON_PROJECT_ID:?set NEON_PROJECT_ID (Neon console, project finance-agent)}"
CONSOLE="https://console.neon.tech/app/projects/$NEON_PROJECT_ID"
BACKUP_DIR=${BACKUP_DIR:-"$HOME/value-it/backups/neon"}   # outside every git repo
STATE="$BACKUP_DIR/.drill-state"                           # non-secret values only (hosts, names, stamp)
SCHEDULE_HOUR_UTC=22    # after the Monday 21:30 UTC Library refresh; outside the Thu 20:00-21:00 UTC maintenance window
RETENTION_DAYS=14       # Neon allows 1 hour to 35 days for scheduled snapshots
DRILL_DB=library_drill
LIBRARY_TABLES="library_sources library_passages library_documents library_pictures library_refresh_runs"
LIBRARY_SEQUENCES="library_passages_id_seq library_refresh_runs_id_seq"

MAIN_URL=""; DRILL_URL=""; DUMP=""; STAMP=""; SECOND_DIR=""
umask 077   # every file this wizard writes is readable by you only
mkdir -p "$BACKUP_DIR"

die() { fail "$*"; exit 1; }

# --- small state file (never a secret)
state_get() { [[ -f $STATE ]] || return 0; sed -n "s/^$1=//p" "$STATE" | tail -n 1; }
state_set() {
  touch "$STATE"
  { grep -v "^$1=" "$STATE" || true; printf '%s=%s\n' "$1" "$2"; } > "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
}

# --- connection-string helpers (they print hosts and database names, never passwords)
url_host()    { printf '%s' "$1" | sed -E 's#^[A-Za-z]+://([^@/]*@)?([^/:?]+).*#\2#'; }
url_db()      { printf '%s' "$1" | sed -E 's#^[A-Za-z]+://[^/]+/([^?]*).*#\1#'; }
url_with_db() { printf '%s' "$1" | sed -E "s#^([A-Za-z]+://[^/]+)/[^?]*#\\1/$2#"; }
q() { psql "$1" -X -q -A -t -v ON_ERROR_STOP=1 -c "$2"; }

check_url() { # check_url VAR: a direct (unpooled) postgresql:// string, or stop
  local v=${!1}
  [[ $v =~ ^postgres(ql)?:// ]] || { printf -v "$1" '%s' ""; die "That is not a postgresql:// connection string."; }
  [[ $v != *-pooler* ]] || { printf -v "$1" '%s' ""; die "That is the pooled string. Turn Connection pooling off and copy again."; }
}
assert_not_main() {
  local main_host; main_host=$(state_get MAIN_HOST)
  [[ -n $main_host ]] || die "main's host is not known yet. Run stage 4 first: bash $0 --from 4"
  [[ $(url_host "$1") != "$main_host" ]] || die "This connection string points at main's host. Copy the drill branch string."
}

# --- Postgres client tools: pg_dump refuses a server that is newer than itself, and the server is 18
pg_major() { "$1" --version 2>/dev/null | sed -E 's/^[^0-9]*([0-9]+).*/\1/'; }
add_libpq_to_path() {
  local p
  for p in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin /opt/homebrew/opt/postgresql@18/bin /usr/local/opt/postgresql@18/bin; do
    if [[ -x $p/pg_dump ]]; then PATH="$p:$PATH"; export PATH; return 0; fi
  done
}
tools_ok() {
  local t m
  for t in pg_dump pg_restore psql; do
    command -v "$t" >/dev/null 2>&1 || return 1
    m=$(pg_major "$t")
    [[ $m =~ ^[0-9]+$ ]] || return 1
    (( m >= 18 )) || return 1
  done
}
require_tools() {
  add_libpq_to_path
  tools_ok || die "pg_dump, pg_restore and psql 18 or newer are missing. Run stage 1: bash $0 --from 1"
}

need_main_url() {
  [[ -n $MAIN_URL ]] && return 0
  open_url "$CONSOLE"
  step 1 "On the project dashboard, click Connect."
  step 2 "Branch: main. Database: the one in the app's DATABASE_URL (the name after the last /). Role: its owner."
  step 3 "Turn Connection pooling OFF. The host must not contain -pooler: pg_dump needs a direct connection."
  step 4 "Copy the connection string."
  ask_secret MAIN_URL "Paste the main direct connection string"
  check_url MAIN_URL
}
need_drill_url() {
  [[ -n $DRILL_URL ]] && return 0
  local branch; branch=$(state_get DRILL_BRANCH)
  open_url "$CONSOLE"
  step 1 "On the project dashboard, click Connect."
  step 2 "Branch: ${branch:-the drill branch}. Database: the default one. Connection pooling OFF."
  step 3 "Copy the connection string."
  ask_secret DRILL_URL "Paste the drill branch direct connection string"
  check_url DRILL_URL
  assert_not_main "$DRILL_URL"
}
use_dump() {
  if [[ -z $DUMP ]]; then
    STAMP=$(state_get STAMP)
    [[ -n $STAMP ]] || die "There is no dump yet. Run stage 5 first: bash $0 --from 5"
    DUMP="$BACKUP_DIR/library-$STAMP.dump"
  fi
  [[ -f $DUMP ]] || die "Missing $DUMP. Run stage 5 again."
}

# Row count + md5 per Library table, ordered by primary key with the C collation (so the database's
# own collation cannot change the order). Fixed output settings, so main and the drill print the same text.
fingerprint() { # fingerprint CONNECTION_STRING OUTPUT_FILE
  psql "$1" -X -q -A -t -F ' | ' -v ON_ERROR_STOP=1 -f - > "$2" <<'SQL'
SET TimeZone = 'UTC';
SET DateStyle = 'ISO, YMD';
SET IntervalStyle = 'postgres';
SET extra_float_digits = 1;
SELECT name, n, hash FROM (
  SELECT 'library_documents' AS name, count(*) AS n,
         md5(coalesce(string_agg(md5(t::text), '' ORDER BY t.source_id COLLATE "C", t.ref COLLATE "C"), '')) AS hash
    FROM library_documents t
  UNION ALL
  SELECT 'library_passages (all but vectors)', count(*),
         md5(coalesce(string_agg(md5(row(t.id, t.source_id, t.ref, t.heading, t.url, t.published_on, t.text,
                                         t.licence, t.credit, t.latest_year, t.embedded_with)::text), '' ORDER BY t.id), ''))
    FROM library_passages t
  UNION ALL
  SELECT 'library_passages.embedding', count(t.embedding),
         md5(coalesce(string_agg(md5(t.embedding::text), '' ORDER BY t.id), ''))
    FROM library_passages t
  UNION ALL
  SELECT 'library_passages.search', count(*),
         md5(coalesce(string_agg(md5(t.search::text), '' ORDER BY t.id), ''))
    FROM library_passages t
  UNION ALL
  SELECT 'library_passages_id_seq', (SELECT last_value FROM library_passages_id_seq), ''
  UNION ALL
  SELECT 'library_pictures', count(*),
         md5(coalesce(string_agg(md5(t::text), '' ORDER BY t.url COLLATE "C"), ''))
    FROM library_pictures t
  UNION ALL
  SELECT 'library_refresh_runs', count(*),
         md5(coalesce(string_agg(md5(t::text), '' ORDER BY t.id), ''))
    FROM library_refresh_runs t
  UNION ALL
  SELECT 'library_refresh_runs_id_seq', (SELECT last_value FROM library_refresh_runs_id_seq), ''
  UNION ALL
  SELECT 'library_sources', count(*),
         md5(coalesce(string_agg(md5(t::text), '' ORDER BY t.id COLLATE "C"), ''))
    FROM library_sources t
) f ORDER BY name COLLATE "C";
SQL
}

stage_1() {
  stage "Postgres 18 client tools on this laptop"
  say "The database runs Postgres 18. pg_dump stops with 'server version mismatch' when the server" \
      "is newer than pg_dump. You need pg_dump, pg_restore and psql, version 18 or newer."
  add_libpq_to_path
  if tools_ok; then ok "Found $(pg_dump --version)."; note "Tools: $(pg_dump --version)"; pause; return; fi
  echo
  say "They are missing or too old. Homebrew's libpq package has all three."
  say "(If libpq is already installed but old, the command is 'brew upgrade libpq'.)"
  need brew
  confirm "Run 'brew install libpq' now?" || die "Install libpq (or postgresql@18), then resume: bash $0 --from 1"
  brew install libpq
  add_libpq_to_path
  tools_ok || die "pg_dump 18+ is still not found. Check: \"\$(brew --prefix libpq)/bin/pg_dump\" --version"
  ok "Found $(pg_dump --version)."
  say "This wizard adds libpq to its own PATH. For your own shell:" \
      "  export PATH=\"\$(brew --prefix libpq)/bin:\$PATH\""
  note "Tools: $(pg_dump --version) (installed now)"
  pause
}

stage_2() {
  stage "Daily snapshot schedule on main"
  say "Today: point-in-time restore covers 7 days. main has no snapshot schedule."
  say "Target: a snapshot each day at ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days."
  say "Why this hour: it is after the Monday 21:30 UTC Library refresh and outside the" \
      "Thursday 20:00-21:00 UTC maintenance window."
  echo
  open_url "$CONSOLE"
  step 1 "In the left sidebar, open Backup & restore. Make sure the branch is main."
  step 2 "Click Edit schedule."
  step 3 "Frequency: Daily. Hour: ${SCHEDULE_HOUR_UTC}:00 UTC. If the Console shows local time, pick the hour that equals ${SCHEDULE_HOUR_UTC}:00 UTC."
  step 4 "Retention: ${RETENTION_DAYS} days (the maximum is 35)."
  step 5 "Click Update schedule."
  echo
  say "${D}The same with the Neon CLI, if you use it:${N}"
  say "${D}neon snapshots schedule set --project-id $NEON_PROJECT_ID --branch main --frequency daily --hour $SCHEDULE_HOUR_UTC --retention $(( RETENTION_DAYS * 86400 ))${N}"
  echo
  confirm "Does Backup & restore now show a daily schedule at ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days?" \
    || die "The schedule is not set yet. Resume when it is: bash $0 --from 2"
  note "Snapshot schedule: daily ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days"
}

stage_3() {
  stage "Protect main (only if your chosen option includes it)"
  say "Protection gives main these rules:" \
      "  - Nobody can delete or reset main. (Vercel already blocks deleting main, but not the project.)" \
      "  - Nobody can delete the project while it has a protected branch." \
      "  - A restore of main must keep a backup branch. The Console always does this."
  say "Know this first:" \
      "  - The Launch plan allows 2 protected branches. Each restore of main adds a protected backup" \
      "    branch. After a restore, unprotect and delete the backup branches you do not need." \
      "  - Branches made from a protected branch get new role passwords. Vercel reads each preview" \
      "    branch's own connection string, so previews should keep working. Check the next preview."
  echo
  if ! confirm "Did you choose to protect main?"; then
    warn "Skipped. main stays unprotected."; note "main protection: skipped"; pause; return
  fi
  open_url "$CONSOLE"
  step 1 "In the left sidebar, open Branches. Click main."
  step 2 "Open the three-dot menu and click Set as protected. (Some branches show a Protect button.)"
  step 3 "In the dialog, click Set as protected."
  confirm "Does main now show the shield icon?" || die "main is not protected yet. Resume: bash $0 --from 3"
  note "main protection: on"
}

stage_4() {
  stage "Connect to main (read only)"
  require_tools
  say "This stage only reads. It checks the Postgres version and that this is the database with the Library."
  echo
  need_main_url
  local v n
  v=$(q "$MAIN_URL" "show server_version_num")
  (( v >= 180000 )) || warn "main reports server_version_num $v. The steps still work while pg_dump is the same or newer."
  n=$(q "$MAIN_URL" "select count(*) from library_passages")
  (( n > 0 )) || die "This database has no Library passages. Is it main, and the app's database?"
  state_set MAIN_HOST "$(url_host "$MAIN_URL")"
  state_set MAIN_DB "$(url_db "$MAIN_URL")"
  ok "Connected. main holds $n Library passages."
  say "Saved main's host name (not the password) to tell main apart later: $(url_host "$MAIN_URL")"
  pause
}

stage_5() {
  stage "Dump the Library off Neon"
  require_tools
  need_main_url
  STAMP=$(date -u +%Y%m%d-%H%M%S)
  DUMP="$BACKUP_DIR/library-$STAMP.dump"
  local yardstick="$BACKUP_DIR/library-$STAMP.main.txt" again="$BACKUP_DIR/library-$STAMP.main-again.txt"
  local toc="$BACKUP_DIR/library-$STAMP.toc.txt" log="$BACKUP_DIR/library-$STAMP.dump.log" t

  step 1 "Measure main: a row count and a hash for each library_* table. This is the yardstick for the drill."
  fingerprint "$MAIN_URL" "$yardstick"
  sed 's/^/       /' "$yardstick"
  echo
  step 2 "The dump command (the password stays hidden):"
  say "     pg_dump --dbname=<main direct URL> --format=custom --table='public.library_*' \\"
  say "             --lock-wait-timeout=60s --verbose --file=$DUMP"
  say "     --format=custom      one compressed file; pg_restore can list it and pick items from it"
  say "     --table=...library_* the 5 Library tables, their indexes, keys and 2 sequences; no extensions"
  say "     --lock-wait-timeout  stop, not hang, if a migration holds a lock"
  say "     (--no-owner belongs on pg_restore: pg_dump ignores it for a custom-format file)"
  confirm "Run the dump now?" || die "Nothing was dumped. Resume: bash $0 --from 5"
  pg_dump --dbname="$MAIN_URL" --format=custom --table='public.library_*' --lock-wait-timeout=60s \
    --verbose --file="$DUMP" 2> "$log" || die "pg_dump failed. Read the end of $log"
  ok "Dump written: $DUMP ($(du -h "$DUMP" | cut -f1))"

  step 3 "Check that the file reads and holds every table and sequence."
  pg_restore --list "$DUMP" > "$toc"
  for t in $LIBRARY_TABLES; do
    grep -q "TABLE DATA public $t " "$toc" || die "The dump has no rows section for $t. See $log"
  done
  for t in $LIBRARY_SEQUENCES; do
    grep -q "SEQUENCE SET public $t " "$toc" || die "The dump has no value for $t. See $log"
  done
  ok "All 5 tables and 2 sequences are in the file."
  ( cd "$BACKUP_DIR" && shasum -a 256 "library-$STAMP.dump" > "library-$STAMP.dump.sha256" )
  ok "Checksum saved: library-$STAMP.dump.sha256 ($(cut -c1-16 "$DUMP.sha256")...)"

  step 4 "Measure main again. The numbers must not change during the dump."
  fingerprint "$MAIN_URL" "$again"
  if ! diff -q "$yardstick" "$again" >/dev/null; then
    die "main changed during the dump (the weekly refresh runs Monday 21:30 UTC). Run stage 5 again later."
  fi
  rm -f "$again"
  state_set STAMP "$STAMP"
  ok "main did not change. Yardstick: $yardstick"
  note "Dump: $DUMP ($(du -h "$DUMP" | cut -f1), sha256 $(cut -c1-12 "$DUMP.sha256")...)"
  pause
}

stage_6() {
  stage "A second copy, off this laptop"
  use_dump
  say "One laptop is one disk. Put a second copy where a lost or broken laptop cannot take it:" \
      "iCloud Drive, an external disk, or another private drive that you own."
  say "Keep it private: the Damodaran blog text is stored for private search only." \
      "Never put a dump in a git repo."
  echo
  local icloud="$HOME/Library/Mobile Documents/com~apple~CloudDocs" def="skip"
  [[ -d $icloud ]] && def="$icloud/value-it-backups"
  ask SECOND_DIR "Folder for the second copy (type skip to skip)" "$def"
  if [[ $SECOND_DIR == skip ]]; then
    warn "Skipped. The only off-Neon copy is on this laptop."; note "Second copy: none"; pause; return
  fi
  mkdir -p "$SECOND_DIR"
  cp "$DUMP" "$DUMP.sha256" "$BACKUP_DIR/library-$STAMP.main.txt" "$SECOND_DIR/"
  ( cd "$SECOND_DIR" && shasum -a 256 -c "library-$STAMP.dump.sha256" ) || die "The copy in $SECOND_DIR does not match its checksum."
  state_set SECOND_DIR "$SECOND_DIR"
  ok "Second copy matches its checksum: $SECOND_DIR"
  note "Second copy: $SECOND_DIR"
  pause
}

stage_7() {
  stage "Make a throwaway branch for the drill"
  local name; name=$(state_get DRILL_BRANCH)
  [[ -n $name ]] || name="drill-restore-$(date -u +%Y%m%d)"
  say "The drill branch is a safe place to test the restore. You delete it at the end."
  say "'Schema only' copies the table shapes but no rows, so no Learner data goes into it." \
      "It is a root branch: the Launch plan allows 5, and today main is the only one."
  echo
  open_url "$CONSOLE"
  step 1 "In the left sidebar, open Branches. Click New branch."
  step 2 "Parent branch: main. Name: $name"
  step 3 "Choose Schema only. (If that option is missing, a normal branch also works; it holds a copy of main until you delete it.)"
  step 4 "Keep 'Automatically delete branch after' at 1 day."
  step 5 "Click Create."
  confirm "Is the branch $name ready?" || die "Resume when it is: bash $0 --from 7"
  state_set DRILL_BRANCH "$name"
  echo
  DRILL_URL=""
  need_drill_url
  ok "The drill branch is at $(url_host "$DRILL_URL"), not at main's host."
  note "Drill branch: $name"
  pause
}

stage_8() {
  stage "Make an empty database on the drill branch"
  require_tools
  need_drill_url
  say "The restore goes into a NEW, empty database named $DRILL_DB, not into existing tables."
  say "A full restore makes the tables, loads the rows, and adds the keys and indexes last."
  say "(A rows-only restore into existing tables breaks on the foreign keys, and the fix needs a" \
      "superuser, which Neon does not give.)"
  say "First it needs two extensions: vector (the embedding column) and lakebase_text (the BM25 index)."
  echo
  local exists db_url
  exists=$(q "$DRILL_URL" "select count(*) from pg_database where datname = '$DRILL_DB'")
  if (( exists > 0 )); then
    warn "$DRILL_DB already exists on the drill branch (from an earlier run?)."
    confirm "Drop it on the drill branch and start clean?" || die "Stopped. Resume: bash $0 --from 8"
    q "$DRILL_URL" "drop database $DRILL_DB" >/dev/null
  fi
  confirm "Create $DRILL_DB on the drill branch now?" || die "Resume: bash $0 --from 8"
  q "$DRILL_URL" "create database $DRILL_DB" >/dev/null
  db_url=$(url_with_db "$DRILL_URL" "$DRILL_DB")
  assert_not_main "$db_url"
  [[ $(q "$db_url" "select current_database()") == "$DRILL_DB" ]] || die "Could not connect to $DRILL_DB."
  q "$db_url" "create extension if not exists vector" >/dev/null
  if [[ $(q "$db_url" "select count(*) from pg_available_extensions where name = 'lakebase_text'") != 0 ]]; then
    q "$db_url" "create extension if not exists lakebase_text" >/dev/null
    ok "Extensions ready: vector, lakebase_text."
  else
    warn "lakebase_text is not available here. The restore will leave out the BM25 index."
  fi
  ok "$DRILL_DB is empty and ready."
  pause
}

stage_9() {
  stage "Restore the dump into the drill database"
  require_tools
  use_dump
  need_drill_url
  local db_url list log t0
  db_url=$(url_with_db "$DRILL_URL" "$DRILL_DB")
  assert_not_main "$db_url"
  [[ $(q "$db_url" "select current_database()") == "$DRILL_DB" ]] || die "Not connected to $DRILL_DB."
  [[ $(q "$db_url" "select count(*) from pg_tables where schemaname = 'public' and tablename like 'library%'") == 0 ]] \
    || die "$DRILL_DB already has library tables. Run stage 8 again to start clean."
  list="$BACKUP_DIR/library-$STAMP.restore-list.txt"
  log="$BACKUP_DIR/library-$STAMP.restore.log"
  pg_restore --list "$DUMP" > "$list"
  if [[ $(q "$db_url" "select count(*) from pg_extension where extname = 'lakebase_text'") == 0 ]]; then
    grep -v 'library_passages_bm25' "$list" > "$list.tmp"
    mv "$list.tmp" "$list"
    warn "The restore leaves out the BM25 index (no lakebase_text here)."
  fi
  say "The restore command (the password stays hidden):"
  say "  pg_restore --dbname=<drill URL>/$DRILL_DB --use-list=$(basename "$list") \\"
  say "             --no-owner --no-privileges --single-transaction --exit-on-error --verbose $(basename "$DUMP")"
  say "  --no-owner, --no-privileges     skip main's owners and grants; the role you connect with owns everything"
  say "  --single-transaction, --exit-on-error   all or nothing; a failure leaves $DRILL_DB empty"
  echo
  confirm "Restore into $DRILL_DB on the drill branch now?" || die "Resume: bash $0 --from 9"
  t0=$SECONDS
  pg_restore --dbname="$db_url" --use-list="$list" --no-owner --no-privileges \
    --single-transaction --exit-on-error --verbose "$DUMP" 2> "$log" \
    || die "The restore failed and changed nothing. Read the end of $log"
  ok "Restored in $(( SECONDS - t0 )) seconds. Log: $log"
  pause
}

stage_10() {
  stage "Compare the drill database with main"
  require_tools
  use_dump
  need_drill_url
  local db_url yardstick drill diff_file
  db_url=$(url_with_db "$DRILL_URL" "$DRILL_DB")
  yardstick="$BACKUP_DIR/library-$STAMP.main.txt"
  drill="$BACKUP_DIR/library-$STAMP.drill.txt"
  diff_file="$BACKUP_DIR/library-$STAMP.diff.txt"
  [[ -f $yardstick ]] || die "Missing the yardstick $yardstick. Run stage 5 again."
  fingerprint "$db_url" "$drill"
  say "name | rows | hash   (main, measured at dump time)"
  sed 's/^/  /' "$yardstick"
  echo
  if diff -u "$yardstick" "$drill" > "$diff_file"; then
    state_set RESULT PASS
    ok "PASS: all 9 lines match (5 tables, the embeddings, the search terms, 2 sequences)."
    note "Drill: PASS (9 of 9 lines match)"
  else
    state_set RESULT FAIL
    sed 's/^/  /' "$diff_file"
    note "Drill: FAIL (see $diff_file)"
    die "FAIL: the drill database differs from main. Keep the dump and the branch. Look at the lines above."
  fi
  pause
}

stage_11() {
  stage "Clean up and record"
  use_dump
  local branch result sha size
  branch=$(state_get DRILL_BRANCH); result=$(state_get RESULT)
  sha=$(cut -c1-12 "$DUMP.sha256"); size=$(du -h "$DUMP" | cut -f1)
  say "Delete the drill branch. You do not need it after the compare."
  open_url "$CONSOLE"
  step 1 "In the left sidebar, open Branches. Click ${branch:-the drill branch}."
  step 2 "Open the three-dot menu and click Delete."
  step 3 "Read the name in the dialog. It must be ${branch:-the drill branch}. Never main."
  if confirm "Is ${branch:-the drill branch} deleted? (No = let it delete itself after 1 day)"; then
    note "Drill branch: deleted"
  else
    warn "It deletes itself after 1 day if you kept that option. Check Branches tomorrow."
    note "Drill branch: left to expire"
  fi
  MAIN_URL=""; DRILL_URL=""
  echo
  say "${B}Paste this line in ticket #8:${N}"
  say "Drill $(date -u +%Y-%m-%d): dumped the 5 library_* tables from Neon main ($size, sha256 $sha), restored them into a new database on a throwaway schema-only branch: ${result:-not run} on counts and hashes (9 checks)."
  echo
  say "Repeat stages 4 to 6 after each 'npm run library:load', and once a month (the weekly refresh adds posts)."
  pause
}

# ============================================================================ run
[[ $FROM_STAGE =~ ^[0-9]+$ ]] && (( FROM_STAGE >= 1 && FROM_STAGE <= TOTAL_STAGES )) || {
  echo "--from takes a stage number from 1 to $TOTAL_STAGES." >&2; exit 2; }
for (( i = FROM_STAGE; i <= TOTAL_STAGES; i++ )); do
  CURRENT_STAGE=$i
  "stage_$i"
done

if [[ -t 1 ]]; then printf '\e[2J\e[H'; fi
printf '%s%s  all %s stages done%s\n\n%s== Summary ==%s\n' "$D" "$(progress_bar "$TOTAL_STAGES" "$TOTAL_STAGES")" "$TOTAL_STAGES" "$N" "$B" "$N"
for line in ${SUMMARY[@]+"${SUMMARY[@]}"}; do say "- $line"; done
echo
say "Files: $BACKUP_DIR"
say "Next:"
say "- Record the result on wayfinder ticket #8 (the line from stage 11)."
say "- Until migrate-on-build takes its own snapshot: take a manual snapshot before you merge a PR that adds a drizzle/ file."
say "- Keep this wizard if you want one command for re-dumps (copy it to scripts/backup-drill.sh); else delete it."
