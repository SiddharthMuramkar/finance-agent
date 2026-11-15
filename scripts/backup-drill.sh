#!/usr/bin/env bash
# backup-drill.sh: backup posture and restore drill for Value It's Neon database (issue #8, option B).
#
# Stages (run in order; each one checks before it changes anything):
#    1  tools           pg_dump, pg_restore and psql 18+, the neon CLI, jq
#    2  schedule        daily snapshot schedule on the branch (default main)
#    3  protect         set the branch as protected
#    4  snapshot        a manual snapshot, only with --snapshot-name
#    5  connect         read-only checks on the branch: Postgres version, Library rows
#    6  dump            pg_dump of the library_* tables, off Neon, with a count+hash yardstick
#    7  copy            a second copy of the dump, checked against its checksum
#    8  drill-branch    a throwaway branch: schema only, deletes itself after 1 day
#    9  drill-db        an empty database on the throwaway branch
#   10  restore         pg_restore of the dump into that database
#   11  compare         row counts and hashes: the restore against the yardstick
#   12  clean-up        delete the throwaway branch, print the line for the ticket
#
# Usage:
#   scripts/backup-drill.sh --project-id <id> [--yes]     all stages
#   scripts/backup-drill.sh --project-id <id> --redump    stages 5 to 7: a fresh dump and copy
#   scripts/backup-drill.sh --project-id <id> --from 8    resume at stage 8
#   scripts/backup-drill.sh --project-id <id> --only 2,3  just these stages
#
# Options (an environment variable works too):
#   --project-id ID        NEON_PROJECT_ID   Neon project (required)
#   --branch NAME          NEON_BRANCH       branch to back up, default main
#   --database NAME        BACKUP_DATABASE   database on it, default neondb
#   --role NAME            BACKUP_ROLE       role for the connection, default neondb_owner
#   --hour H               SCHEDULE_HOUR_UTC hour (UTC) of the daily snapshot, default 22
#   --retention-days N     RETENTION_DAYS    days to keep each scheduled snapshot, default 14 (1 to 35)
#   --dump-dir DIR         BACKUP_DIR        where dumps go, default ~/backups (never inside a git repo)
#   --copy-dir DIR         SECOND_DIR        second copy, default <dump-dir>/copy2; "skip" to skip
#   --snapshot-name NAME   SNAPSHOT_NAME     take a manual snapshot with this name in stage 4
#   --no-protect                             skip stage 3
#   --keep-branch                            stage 12 keeps the throwaway branch (it still expires)
#   --from N / --to N / --only N,N / --redump
#   --yes                                    say yes to every change (needed when not on a terminal)
#
# Without --yes the script asks before each change on a terminal, and stops before a change when
# there is no terminal. Reads and the dump need no yes.
#
# Secrets: connection strings come from `neon connection-string` into shell variables. They go to
# psql, pg_dump and pg_restore as PG* environment variables, never on a command line, never to the
# terminal, a log or a file. Do not run this script with `bash -x`; it turns tracing off anyway.
set -Eeuo pipefail
set +o xtrace

# ============================================================================ output helpers
if [[ -t 1 && -z ${NO_COLOR:-} ]]; then
  B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else
  B=; D=; G=; Y=; R=; N=
fi
TOTAL_STAGES=12
CURRENT_STAGE=0
SUMMARY=()

say()  { printf '  %s\n' "$@"; }
ok()   { printf '  %sOK:%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %sCAUTION:%s %s\n' "$Y" "$N" "$*"; }
fail() { printf '  %sSTOP:%s %s\n' "$R" "$N" "$*" >&2; }
die()  { fail "$*"; exit 1; }
note() { SUMMARY+=("$*"); }
stage() { printf '\n%s[stage %s of %s] %s%s\n' "$B" "$CURRENT_STAGE" "$TOTAL_STAGES" "$1" "$N"; }

usage() { sed -n '2,/^set -Eeuo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; }

on_error() {
  printf '\n%sStopped at stage %s.%s Resume with: %s --from %s\n' "$R" "$CURRENT_STAGE" "$N" "$0" "$CURRENT_STAGE" >&2
}
trap '[[ $BASH_SUBSHELL == 0 ]] && on_error' ERR
trap 'printf "\n"; exit 130' INT

# ============================================================================ settings
PROJECT_ID=${NEON_PROJECT_ID:-}
BRANCH=${NEON_BRANCH:-main}
DATABASE=${BACKUP_DATABASE:-neondb}
ROLE=${BACKUP_ROLE:-neondb_owner}
SCHEDULE_HOUR_UTC=${SCHEDULE_HOUR_UTC:-22}   # after the Monday 21:30 UTC Library refresh; outside Thu 20:00-21:00 UTC maintenance
RETENTION_DAYS=${RETENTION_DAYS:-14}         # Neon keeps scheduled snapshots 1 hour to 35 days
BACKUP_DIR=${BACKUP_DIR:-"$HOME/backups"}
SECOND_DIR=${SECOND_DIR:-}
SNAPSHOT_NAME=${SNAPSHOT_NAME:-}
PROTECT=1
KEEP_BRANCH=0
ASSUME_YES=0
FROM_STAGE=1
TO_STAGE=$TOTAL_STAGES
ONLY=""

need_arg() { [[ $# -ge 2 && -n $2 ]] || { echo "$1 needs a value (try --help)" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
  case $1 in
    --project-id) need_arg "$@"; PROJECT_ID=$2; shift 2 ;;
    --branch) need_arg "$@"; BRANCH=$2; shift 2 ;;
    --database) need_arg "$@"; DATABASE=$2; shift 2 ;;
    --role) need_arg "$@"; ROLE=$2; shift 2 ;;
    --hour) need_arg "$@"; SCHEDULE_HOUR_UTC=$2; shift 2 ;;
    --retention-days) need_arg "$@"; RETENTION_DAYS=$2; shift 2 ;;
    --dump-dir) need_arg "$@"; BACKUP_DIR=$2; shift 2 ;;
    --copy-dir) need_arg "$@"; SECOND_DIR=$2; shift 2 ;;
    --snapshot-name) need_arg "$@"; SNAPSHOT_NAME=$2; shift 2 ;;
    --no-protect) PROTECT=0; shift ;;
    --keep-branch) KEEP_BRANCH=1; shift ;;
    --from) need_arg "$@"; FROM_STAGE=$2; shift 2 ;;
    --to) need_arg "$@"; TO_STAGE=$2; shift 2 ;;
    --only) need_arg "$@"; ONLY=$2; shift 2 ;;
    --redump) FROM_STAGE=5; TO_STAGE=7; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

[[ -n $PROJECT_ID ]] || { echo "Set --project-id or NEON_PROJECT_ID (neon projects list)." >&2; exit 2; }
if ! [[ $SCHEDULE_HOUR_UTC =~ ^[0-9]+$ ]] || (( SCHEDULE_HOUR_UTC > 23 )); then
  echo "--hour takes 0 to 23." >&2; exit 2
fi
if ! [[ $RETENTION_DAYS =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 || RETENTION_DAYS > 35 )); then
  echo "--retention-days takes 1 to 35." >&2; exit 2
fi
[[ $BACKUP_DIR == /* ]] || BACKUP_DIR="$PWD/$BACKUP_DIR"
SECOND_DIR=${SECOND_DIR:-"$BACKUP_DIR/copy2"}

STATE="$BACKUP_DIR/.drill-state"   # non-secret values only: stamp, branch names and ids, main's host, result
DRILL_DB=library_drill
LIBRARY_TABLES="library_sources library_passages library_documents library_pictures library_refresh_runs"
LIBRARY_SEQUENCES="library_passages_id_seq library_refresh_runs_id_seq"
MAIN_URL=""; DRILL_URL=""; DUMP=""; STAMP=""

umask 077   # every file this script writes is readable by its owner only

# ============================================================================ small helpers
confirm() { # confirm "question": yes with --yes; asks on a terminal; stops when it cannot ask
  (( ASSUME_YES )) && return 0
  if [[ -t 0 ]]; then
    local a=""
    read -r -p "  $1 [y/N] " a || true
    [[ $a == [Yy]* ]]
    return
  fi
  die "$1 This is a change: run again with --yes, or on a terminal."
}

outside_git() { # outside_git DIR: refuse a folder inside a git work tree (a dump must never be committed)
  if command -v git >/dev/null 2>&1 && git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    die "$1 is inside a git repository. Pick a folder outside every repo (--dump-dir, --copy-dir)."
  fi
}
private_dir() { # private_dir DIR: make it, owner-only, outside git (checked before anything is made)
  local probe=$1
  while [[ ! -d $probe ]]; do probe=$(dirname "$probe"); done
  outside_git "$probe"
  mkdir -p "$1"
  chmod 700 "$1"
  outside_git "$1"
}

state_get() { [[ -f $STATE ]] || return 0; sed -n "s/^$1=//p" "$STATE" | tail -n 1; }
state_set() {
  [[ -d $BACKUP_DIR ]] || private_dir "$BACKUP_DIR"
  touch "$STATE"
  { grep -v "^$1=" "$STATE" || true; printf '%s=%s\n' "$1" "$2"; } > "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
  chmod 600 "$STATE"
}

utc_in_one_day() { date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d +%Y-%m-%dT%H:%M:%SZ; }

sha256_write() { # sha256_write DIR FILE: FILE.sha256 next to FILE, in `sha256sum` format
  (
    cd "$1"
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$2"; else shasum -a 256 "$2"; fi > "$2.sha256"
  )
}
sha256_check() { # sha256_check DIR FILE: FILE matches FILE.sha256
  (
    cd "$1"
    if command -v sha256sum >/dev/null 2>&1; then sha256sum --check --status "$2.sha256"
    else shasum -a 256 --check --status "$2.sha256"; fi
  )
}

neon_() { neon --project-id "$PROJECT_ID" --no-color "$@"; }   # never prompts: every call names the project

# ============================================================================ connections (secrets)
urldecode() { if [[ $1 == *%* ]]; then printf '%b' "${1//%/\\x}"; else printf '%s' "$1"; fi; }

# pg URL DB CMD...: run a libpq tool with the connection in PG* variables, so the password is never on a
# command line (other users can read those with ps). An empty DB keeps the URL's database.
pg() {
  local url=$1 db=$2
  shift 2
  (
    set +o xtrace
    re='^postgres(ql)?://([^:@/]+)(:([^@]*))?@([^/:?]+)(:([0-9]+))?/([^?]*)(\?(.*))?$'
    [[ $url =~ $re ]] || die "That is not a postgresql:// connection string."
    PGUSER=$(urldecode "${BASH_REMATCH[2]}")
    PGPASSWORD=$(urldecode "${BASH_REMATCH[4]}")
    PGHOST=${BASH_REMATCH[5]}
    PGPORT=${BASH_REMATCH[7]:-5432}
    PGDATABASE=${db:-$(urldecode "${BASH_REMATCH[8]}")}
    PGSSLMODE=require
    query=${BASH_REMATCH[10]}
    kvs=()
    [[ -n $query ]] && IFS='&' read -r -a kvs <<< "$query"
    for kv in ${kvs[@]+"${kvs[@]}"}; do
      case ${kv%%=*} in
        sslmode) PGSSLMODE=${kv#*=} ;;
        channel_binding) PGCHANNELBINDING=${kv#*=}; export PGCHANNELBINDING ;;
        options) PGOPTIONS=$(urldecode "${kv#*=}"); export PGOPTIONS ;;
      esac
    done
    PGCONNECT_TIMEOUT=30; PGAPPNAME=backup-drill
    export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE PGSSLMODE PGCONNECT_TIMEOUT PGAPPNAME
    exec "$@"
  )
}
q() { pg "$1" "$2" psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$3"; }   # q URL DB SQL: one value back
url_host() { printf '%s' "$1" | sed -E 's#^[A-Za-z]+://([^@/]*@)?([^/:?]+).*#\2#'; }

conn_string() { # conn_string BRANCH: the direct (not pooled) string, for a variable only
  neon_ connection-string "$1" --role-name "$ROLE" --database-name "$DATABASE"
}
check_url() { # check_url VAR: a direct postgresql:// string, or stop (never prints it)
  local v=${!1}
  [[ $v =~ ^postgres(ql)?:// ]] || { printf -v "$1" '%s' ""; die "neon connection-string gave no postgresql:// string."; }
  [[ $v != *-pooler* ]] || { printf -v "$1" '%s' ""; die "Got a pooled string. pg_dump needs a direct connection."; }
}
need_main_url() {
  [[ -n $MAIN_URL ]] && return 0
  MAIN_URL=$(conn_string "$BRANCH") || die "neon connection-string failed for branch $BRANCH."
  check_url MAIN_URL
}
assert_not_main() { # assert_not_main URL: the URL must not point at the backed-up branch
  local main_host
  main_host=$(state_get MAIN_HOST)
  [[ -n $main_host ]] || die "The backed-up branch's host is not known yet. Run stage 5 first: $0 --from 5"
  [[ $(url_host "$1") != "$main_host" ]] || die "This connection points at $BRANCH's host, not the drill branch."
}
need_drill_url() {
  [[ -n $DRILL_URL ]] && return 0
  local id
  id=$(state_get DRILL_BRANCH_ID)
  [[ -n $id ]] || die "There is no drill branch yet. Run stage 8: $0 --from 8"
  [[ $id != "$(state_get MAIN_BRANCH_ID)" ]] || die "The drill branch id is $BRANCH's id. Stopped."
  DRILL_URL=$(conn_string "$id") || die "neon connection-string failed for the drill branch."
  check_url DRILL_URL
  assert_not_main "$DRILL_URL"
}
wait_for() { # wait_for URL DB: a new branch's compute can take a moment to start
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    q "$1" "$2" "select 1" >/dev/null 2>&1 && return 0
    sleep 5
  done
  die "Could not connect after a minute. Check the branch in the Neon console."
}
use_dump() {
  if [[ -z $DUMP ]]; then
    STAMP=$(state_get STAMP)
    [[ -n $STAMP ]] || die "There is no dump yet. Run stage 6: $0 --from 6"
    DUMP="$BACKUP_DIR/library-$STAMP.dump"
  fi
  [[ -f $DUMP ]] || die "Missing $DUMP. Run stage 6 again."
}

# ============================================================================ Postgres client tools
pg_major() { "$1" --version 2>/dev/null | sed -E 's/^[^0-9]*([0-9]+).*/\1/'; }
tools_ok() {
  local t m
  for t in pg_dump pg_restore psql; do
    command -v "$t" >/dev/null 2>&1 || return 1
    m=$(pg_major "$t")
    [[ $m =~ ^[0-9]+$ ]] && (( m >= 18 )) || return 1
  done
}
add_pg_to_path() { # pg_dump refuses a server newer than itself; the server is 18. Prefer an 18+ client.
  tools_ok && return 0
  local p
  for p in ${PG_BIN:+"$PG_BIN"} /usr/lib/postgresql/19/bin /usr/lib/postgresql/18/bin /usr/pgsql-18/bin \
           /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin \
           /opt/homebrew/opt/postgresql@18/bin /usr/local/opt/postgresql@18/bin; do
    if [[ -x $p/pg_dump ]]; then
      PATH="$p:$PATH"; export PATH
      tools_ok && return 0
    fi
  done
  return 1
}
require_tools() { add_pg_to_path || die "pg_dump, pg_restore and psql 18+ are missing. Run stage 1: $0 --only 1"; }

# Row count + md5 per Library table, ordered by primary key with the C collation (so the database's
# own collation cannot change the order). Fixed output settings, so both sides print the same text.
# Only counts and hashes leave the database, never row contents.
fingerprint() { # fingerprint URL DB OUTPUT_FILE
  pg "$1" "$2" psql -X -q -A -t -F ' | ' -v ON_ERROR_STOP=1 -f - > "$3" <<'SQL'
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

# compare_table YARDSTICK DRILL: a Markdown table: name, rows on the branch, rows restored, hash match.
# For a sequence the "rows" are its last_value and there is no hash.
compare_table() {
  printf '| Table | Rows main | Rows restored | Hash match |\n|---|---:|---:|---|\n'
  awk -F ' \\| ' 'NR == FNR { n[$1] = $2; h[$1] = $3; next }
    { same = (n[$1] == $2 && h[$1] == $3)
      if (h[$1] == "" && $3 == "") verdict = same ? "yes (sequence value)" : "NO (sequence value)"
      else verdict = same ? "yes" : "NO"
      printf "| %s | %s | %s | %s |\n", $1, n[$1], $2, verdict }' "$1" "$2"
}

# ============================================================================ stages
stage_1() {
  stage "Tools: Postgres 18+ client, neon CLI, jq"
  if add_pg_to_path; then
    ok "Found $(pg_dump --version)."
  else
    fail "pg_dump, pg_restore and psql 18 or newer are missing (the server runs Postgres 18)."
    say "Debian/Ubuntu: add the PGDG apt repo, then: apt install postgresql-client-18" \
        "macOS:         brew install libpq   (the script finds Homebrew's libpq by itself)" \
        "Elsewhere:     set PG_BIN to the folder that holds pg_dump 18+."
    exit 1
  fi
  command -v neon >/dev/null 2>&1 || die "The neon CLI is missing: npm i -g neonctl, then neon auth."
  command -v jq >/dev/null 2>&1 || die "jq is missing: apt install jq, or brew install jq."
  command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || die "Need sha256sum or shasum."
  neon_ branches get "$BRANCH" -o json >/dev/null || die "The neon CLI cannot read branch $BRANCH. Is it logged in (neon auth)?"
  ok "neon CLI $(neon --version 2>/dev/null) can read project $PROJECT_ID, branch $BRANCH."
  note "Tools: $(pg_dump --version), neon $(neon --version 2>/dev/null)"
}

stage_2() {
  stage "Daily snapshot schedule on $BRANCH"
  local retention=$(( RETENTION_DAYS * 86400 )) current
  current=$(neon_ snapshots schedule get --branch "$BRANCH" -o json)
  if jq -e --argjson h "$SCHEDULE_HOUR_UTC" --argjson r "$retention" \
       'length == 1 and .[0].frequency == "daily" and .[0].hour == $h and .[0].retention_seconds == $r' \
       <<< "$current" >/dev/null 2>&1; then
    ok "Already set: daily at ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days."
  else
    say "Now: $(jq -c . <<< "$current")"
    say "Want: daily at ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days (this replaces the schedule above)."
    confirm "Set the snapshot schedule on $BRANCH?" || die "Not changed. Resume: $0 --from 2"
    neon_ snapshots schedule set --branch "$BRANCH" --frequency daily --hour "$SCHEDULE_HOUR_UTC" \
      --retention "$retention" -o json >/dev/null \
      || die "Neon refused. Console: project > Backup & restore > Edit schedule > Daily ${SCHEDULE_HOUR_UTC}:00 UTC, ${RETENTION_DAYS} days."
    current=$(neon_ snapshots schedule get --branch "$BRANCH" -o json)
    ok "Set. Neon now reports: $(jq -c . <<< "$current")"
  fi
  note "Snapshot schedule on $BRANCH: daily ${SCHEDULE_HOUR_UTC}:00 UTC, kept ${RETENTION_DAYS} days"
}

stage_3() {
  stage "Protect $BRANCH"
  if (( ! PROTECT )); then warn "Skipped (--no-protect)."; note "Protection: skipped"; return; fi
  local info id
  info=$(neon_ branches get "$BRANCH" -o json)
  id=$(jq -r '.id' <<< "$info")
  if [[ $(jq -r '.protected' <<< "$info") == true ]]; then
    ok "$BRANCH ($id) is already protected."
  else
    say "Protected: nobody can delete or reset $BRANCH, and nobody can delete the project while it has" \
        "a protected branch. The Launch plan allows 2 protected branches; each point-in-time restore of" \
        "$BRANCH adds a protected backup branch. Branches made from $BRANCH get new role passwords."
    confirm "Set $BRANCH ($id) as protected?" || die "Not changed. Resume: $0 --from 3"
    neon_ api "/projects/$PROJECT_ID/branches/$id" -X PATCH -F branch.protected=true -o json >/dev/null \
      || die "Neon refused. Console: Branches > $BRANCH > ... > Set as protected."
    [[ $(neon_ branches get "$id" -o json | jq -r '.protected') == true ]] || die "Neon does not report $BRANCH as protected."
    ok "$BRANCH is protected."
  fi
  note "Protection: $BRANCH protected"
}

stage_4() {
  stage "Manual snapshot of $BRANCH"
  if [[ -z $SNAPSHOT_NAME ]]; then say "No --snapshot-name, so no manual snapshot."; return; fi
  local found
  found=$(neon_ snapshots list -o json | jq -r --arg n "$SNAPSHOT_NAME" '[.[] | select(.name == $n)] | length')
  if (( found > 0 )); then
    ok "A snapshot named $SNAPSHOT_NAME already exists."
  else
    confirm "Take a manual snapshot of $BRANCH named $SNAPSHOT_NAME (kept until you delete it)?" \
      || die "Not taken. Resume: $0 --from 4"
    neon_ snapshots create --branch "$BRANCH" --name "$SNAPSHOT_NAME" -o json >/dev/null \
      || die "Neon refused. Console: Backup & restore > Create snapshot > name $SNAPSHOT_NAME."
    ok "Snapshot $SNAPSHOT_NAME taken."
  fi
  note "Manual snapshot: $SNAPSHOT_NAME"
}

stage_5() {
  stage "Connect to $BRANCH (read only)"
  require_tools
  private_dir "$BACKUP_DIR"
  need_main_url
  local v n id
  id=$(neon_ branches get "$BRANCH" -o json | jq -r '.id')
  v=$(q "$MAIN_URL" "" "show server_version_num")
  (( v >= 180000 )) || warn "The server reports version $v. pg_dump works while it is the same or newer."
  n=$(q "$MAIN_URL" "" "select count(*) from library_passages")
  (( n > 0 )) || die "This database has no Library passages. Is $DATABASE on $BRANCH the app's database?"
  state_set MAIN_HOST "$(url_host "$MAIN_URL")"
  state_set MAIN_BRANCH_ID "$id"
  ok "Connected to $DATABASE on $BRANCH (Postgres $(( v / 10000 ))). It holds $n Library passages."
}

stage_6() {
  stage "Dump the Library off Neon"
  require_tools
  private_dir "$BACKUP_DIR"
  need_main_url
  STAMP=$(date -u +%Y%m%d-%H%M%S)
  DUMP="$BACKUP_DIR/library-$STAMP.dump"
  local base="library-$STAMP"
  local yardstick="$BACKUP_DIR/$base.main.txt" again="$BACKUP_DIR/$base.main-again.txt"
  local toc="$BACKUP_DIR/$base.toc.txt" log="$BACKUP_DIR/$base.dump.log" t

  say "1. Measure $BRANCH: a row count and a hash per library_* table (the yardstick for the drill)."
  fingerprint "$MAIN_URL" "" "$yardstick"
  sed 's/^/       /' "$yardstick"

  say "2. pg_dump --format=custom --table='public.library_*' --lock-wait-timeout=60s --file=$base.dump"
  pg "$MAIN_URL" "" pg_dump --format=custom --table='public.library_*' --lock-wait-timeout=60s \
    --verbose --file="$DUMP" 2> "$log" || die "pg_dump failed. Read the end of $log"
  ok "Dump written: $DUMP ($(du -h "$DUMP" | cut -f1))"

  say "3. Check that the file reads and holds every table and sequence."
  pg_restore --list "$DUMP" > "$toc"
  for t in $LIBRARY_TABLES; do
    grep -q "TABLE DATA public $t " "$toc" || die "The dump has no rows section for $t. See $log"
  done
  for t in $LIBRARY_SEQUENCES; do
    grep -q "SEQUENCE SET public $t " "$toc" || die "The dump has no value for $t. See $log"
  done
  sha256_write "$BACKUP_DIR" "$base.dump"
  ok "All 5 tables and 2 sequences are in the file. sha256 $(cut -c1-16 "$DUMP.sha256")..."

  say "4. Measure $BRANCH again. The numbers must not change during the dump."
  fingerprint "$MAIN_URL" "" "$again"
  diff -q "$yardstick" "$again" >/dev/null \
    || die "$BRANCH changed during the dump (the weekly refresh runs Monday 21:30 UTC). Run stage 6 again later."
  rm -f "$again"
  chmod 600 "$BACKUP_DIR/$base".*
  state_set STAMP "$STAMP"
  ok "$BRANCH did not change. Yardstick: $yardstick"
  note "Dump: $DUMP ($(du -h "$DUMP" | cut -f1), sha256 $(cut -c1-12 "$DUMP.sha256")...)"
}

stage_7() {
  stage "A second copy"
  use_dump
  if [[ $SECOND_DIR == skip ]]; then warn "Skipped (--copy-dir skip)."; note "Second copy: none"; return; fi
  private_dir "$SECOND_DIR"
  local base="library-$STAMP"
  cp "$DUMP" "$DUMP.sha256" "$BACKUP_DIR/$base.main.txt" "$SECOND_DIR/"
  chmod 600 "$SECOND_DIR/$base".*
  sha256_check "$SECOND_DIR" "$base.dump" || die "The copy in $SECOND_DIR does not match its checksum."
  ok "Second copy matches its checksum: $SECOND_DIR"
  say "One disk is one point of failure: move this copy off the machine, for example:" \
      "  scp -r <host>:$SECOND_DIR ./value-it-backups   (then check it with sha256sum -c, or shasum -a 256 -c)"
  note "Second copy: $SECOND_DIR"
}

stage_8() {
  stage "A throwaway branch for the drill"
  local name id exp out kind
  name=$(state_get DRILL_BRANCH)
  id=$(state_get DRILL_BRANCH_ID)
  if [[ -n $id ]] && neon_ branches get "$id" -o json >/dev/null 2>&1; then
    ok "Reusing drill branch $name ($id)."
    return
  fi
  [[ -n $(state_get MAIN_HOST) && -n $(state_get MAIN_BRANCH_ID) ]] || die "Run stage 5 first, so the drill can tell $BRANCH apart: $0 --from 5"
  name="drill-restore-$(date -u +%Y%m%d-%H%M)"
  exp=$(utc_in_one_day)
  say "Schema only copies the table shapes and no rows, so no Learner data goes into it." \
      "If Neon refuses schema only, a normal branch (a full copy, inside Neon) is the fallback."
  confirm "Create branch $name from $BRANCH (schema only, deletes itself at $exp)?" || die "Not created. Resume: $0 --from 8"
  kind="schema only"
  if ! out=$(neon_ branches create --name "$name" --parent "$BRANCH" --schema-only --expires-at "$exp" --no-secrets -o json); then
    warn "Neon refused a schema-only branch. Trying a normal branch with the same 1-day expiry."
    kind="full copy"
    out=$(neon_ branches create --name "$name" --parent "$BRANCH" --expires-at "$exp" --no-secrets -o json) \
      || die "Neon refused the branch. Console: Branches > New branch > parent $BRANCH, name $name, schema only, auto-delete 1 day."
  fi
  id=$(jq -r '.branch.id // .id' <<< "$out")
  [[ $id == br-* ]] || die "Could not read the new branch id."
  [[ $id != "$(state_get MAIN_BRANCH_ID)" ]] || die "The new branch has $BRANCH's id. Stopped."
  state_set DRILL_BRANCH "$name"
  state_set DRILL_BRANCH_ID "$id"
  state_set DRILL_KIND "$kind"
  DRILL_URL=""
  need_drill_url
  wait_for "$DRILL_URL" ""
  ok "Drill branch $name ($id, $kind) is up, on a different host from $BRANCH. It expires at $exp."
  note "Drill branch: $name ($kind)"
}

stage_9() {
  stage "An empty database on the drill branch"
  require_tools
  need_drill_url
  say "The restore goes into a NEW, empty database ($DRILL_DB), as after a lost project: no tables exist."
  local exists
  exists=$(q "$DRILL_URL" "" "select count(*) from pg_database where datname = '$DRILL_DB'")
  if (( exists > 0 )); then
    confirm "$DRILL_DB already exists on the drill branch. Drop it there and start clean?" || die "Stopped. Resume: $0 --from 9"
    q "$DRILL_URL" "" "drop database $DRILL_DB" >/dev/null
  fi
  q "$DRILL_URL" "" "create database $DRILL_DB" >/dev/null
  [[ $(q "$DRILL_URL" "$DRILL_DB" "select current_database()") == "$DRILL_DB" ]] || die "Could not connect to $DRILL_DB."
  q "$DRILL_URL" "$DRILL_DB" "create extension if not exists vector" >/dev/null
  if [[ $(q "$DRILL_URL" "$DRILL_DB" "select count(*) from pg_available_extensions where name = 'lakebase_text'") != 0 ]]; then
    q "$DRILL_URL" "$DRILL_DB" "create extension if not exists lakebase_text" >/dev/null
    ok "$DRILL_DB is empty, with the extensions vector and lakebase_text (BM25)."
  else
    warn "lakebase_text is not available here. The restore will leave out the BM25 index."
    ok "$DRILL_DB is empty, with the extension vector."
  fi
}

stage_10() {
  stage "Restore the dump into the drill database"
  require_tools
  use_dump
  need_drill_url
  local list="$BACKUP_DIR/library-$STAMP.restore-list.txt" log="$BACKUP_DIR/library-$STAMP.restore.log" t0
  [[ $(q "$DRILL_URL" "$DRILL_DB" "select count(*) from pg_tables where schemaname = 'public' and tablename like 'library%'") == 0 ]] \
    || die "$DRILL_DB already has library tables. Run stage 9 again to start clean."
  pg_restore --list "$DUMP" > "$list"
  if [[ $(q "$DRILL_URL" "$DRILL_DB" "select count(*) from pg_extension where extname = 'lakebase_text'") == 0 ]]; then
    grep -v 'library_passages_bm25' "$list" > "$list.tmp"
    mv "$list.tmp" "$list"
    warn "The restore leaves out the BM25 index (no lakebase_text here)."
  fi
  say "pg_restore --dbname=$DRILL_DB --use-list=$(basename "$list") --no-owner --no-privileges \\" \
      "           --single-transaction --exit-on-error $(basename "$DUMP")"
  t0=$SECONDS
  pg "$DRILL_URL" "$DRILL_DB" pg_restore --dbname="$DRILL_DB" --use-list="$list" --no-owner --no-privileges \
    --single-transaction --exit-on-error --verbose "$DUMP" 2> "$log" \
    || die "The restore failed and changed nothing. Read the end of $log"
  chmod 600 "$list" "$log"
  ok "Restored in $(( SECONDS - t0 )) seconds. Log: $log"
}

stage_11() {
  stage "Compare the restore with the yardstick"
  require_tools
  use_dump
  need_drill_url
  local yardstick="$BACKUP_DIR/library-$STAMP.main.txt" drill="$BACKUP_DIR/library-$STAMP.drill.txt"
  local diff_file="$BACKUP_DIR/library-$STAMP.diff.txt" table="$BACKUP_DIR/library-$STAMP.result.md"
  [[ -f $yardstick ]] || die "Missing the yardstick $yardstick. Run stage 6 again."
  fingerprint "$DRILL_URL" "$DRILL_DB" "$drill"
  compare_table "$yardstick" "$drill" > "$table"
  chmod 600 "$drill" "$table"
  sed 's/^/  /' "$table"
  if diff -u "$yardstick" "$drill" > "$diff_file"; then
    rm -f "$diff_file"
    state_set RESULT PASS
    ok "PASS: all 9 lines match (5 tables, the embeddings, the search terms, 2 sequences). Table: $table"
    note "Drill: PASS (9 of 9 lines match)"
  else
    chmod 600 "$diff_file"
    state_set RESULT FAIL
    note "Drill: FAIL (see $diff_file)"
    die "FAIL: the restore differs from the yardstick. The drill branch stays (it expires in 1 day). See $diff_file"
  fi
}

stage_12() {
  stage "Clean up and record"
  use_dump
  local name id result sha size kind
  name=$(state_get DRILL_BRANCH); id=$(state_get DRILL_BRANCH_ID); kind=$(state_get DRILL_KIND)
  result=$(state_get RESULT)
  sha=$(cut -c1-12 "$DUMP.sha256"); size=$(du -h "$DUMP" | cut -f1)
  if [[ -z $id ]]; then
    say "No drill branch to delete."
  elif (( KEEP_BRANCH )); then
    warn "Kept $name ($id) (--keep-branch). It deletes itself after 1 day."
  else
    local info
    if info=$(neon_ branches get "$id" -o json 2>/dev/null); then
      [[ $id != "$(state_get MAIN_BRANCH_ID)" && $(jq -r '.name' <<< "$info") == drill-restore-* \
         && $(jq -r '.default' <<< "$info") != true && $(jq -r '.protected' <<< "$info") != true ]] \
        || die "Branch $id is not a drill branch. Not deleting it."
      confirm "Delete the drill branch $name ($id)?" || die "Kept. It deletes itself after 1 day."
      neon_ branches delete "$id" -o json >/dev/null || die "Neon refused. Console: Branches > $name > Delete."
      ok "Deleted $name."
    else
      ok "$name is already gone."
    fi
    state_set DRILL_BRANCH ""; state_set DRILL_BRANCH_ID ""
    note "Drill branch: deleted"
  fi
  MAIN_URL=""; DRILL_URL=""
  say "" "${B}Line for the ticket:${N}" \
      "Drill $(date -u +%Y-%m-%d): dumped the 5 library_* tables from Neon $BRANCH ($size, sha256 $sha...), restored them into a new database on a throwaway ${kind:-} branch: ${result:-not run} on counts and hashes (9 checks)."
}

# ============================================================================ run
valid_stage() { [[ $1 =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= TOTAL_STAGES )); }
STAGES=()
if [[ -n $ONLY ]]; then
  IFS=',' read -r -a STAGES <<< "$ONLY"
else
  if ! valid_stage "$FROM_STAGE" || ! valid_stage "$TO_STAGE" || (( FROM_STAGE > TO_STAGE )); then
    echo "--from and --to take stage numbers from 1 to $TOTAL_STAGES." >&2; exit 2
  fi
  for (( i = FROM_STAGE; i <= TO_STAGE; i++ )); do STAGES+=("$i"); done
fi
for s in "${STAGES[@]}"; do
  valid_stage "$s" || { echo "Stage numbers run from 1 to $TOTAL_STAGES (got '$s')." >&2; exit 2; }
done

printf '%sbackup-drill: project %s, branch %s, dumps in %s%s\n' "$D" "$PROJECT_ID" "$BRANCH" "$BACKUP_DIR" "$N"
for s in "${STAGES[@]}"; do
  CURRENT_STAGE=$s
  "stage_$s"
done

printf '\n%s== Summary ==%s\n' "$B" "$N"
for line in ${SUMMARY[@]+"${SUMMARY[@]}"}; do say "- $line"; done
say "Files: $BACKUP_DIR"
say "Re-dump after each 'npm run library:load' and once a month: $0 --project-id <id> --redump"
