#!/usr/bin/env bash
# Cross-agent peer review of commits pushed to dev (ADR-0006). Review state lives in GitHub commit comments
# whose body starts with "peer-review: ok" or "peer-review: issue", then " (<name>)" and an optional note.
# Needs git, gh (authenticated) and jq. Nothing is cached in the repo.
#   peer-review.sh pending [--who x] [--since <sha>]   commits on origin/dev by others that you have not reviewed (default: last 48 h)
#   peer-review.sh show <sha>                           stat, full diff and existing peer-review comments
#   peer-review.sh ok <sha> [note...] [--who x]         post "peer-review: ok"
#   peer-review.sh issue <sha> <note...> [--who x]      post "peer-review: issue" (note required)
#   peer-review.sh status [<range>]                     per commit ok/issue counts (default origin/main..origin/dev); exit 1 if an issue
#                                                       is not followed by a later ok from the same reviewer, or no non-author ok exists
#   peer-review.sh --help
# Identity (--who isabel|fernando|lorenz|helmut): --who, else env SHELFIE_WHO, else the newest context-ack (scripts/task.sh who).
# Commits are first-parent, non-merge, on origin/dev. Handles come from scripts/team.conf.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
# shellcheck source=/dev/null
source scripts/team.conf

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }
die() { echo "peer-review: $*" >&2; exit 1; }

if [[ $# -eq 0 || "$1" == -h || "$1" == --help || "$1" == help ]]; then usage; exit 0; fi
cmd="$1"; shift

who="${SHELFIE_WHO:-}"; since=""; args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --who) who="${2:-}"; shift ;;
    --since) since="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) args+=("$1") ;;
  esac; shift
done

command -v git >/dev/null || die "git is required"
command -v gh >/dev/null || die "gh is required (https://cli.github.com)"
command -v jq >/dev/null || die "jq is required"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated: run 'gh auth login'"
API="repos/$OWNER/$REPO"

handle_of() {
  case "$1" in
    helmut|d|D) echo "$HELMUT" ;;
    isabel|a|A) echo "$ISABEL" ;;
    fernando|b|B) echo "$FERNANDO" ;;
    lorenz|c|C) echo "$LORENZ" ;;
    *) return 1 ;;
  esac
}
resolve_who() {
  if [[ -z "$who" ]]; then
    who="$(bash scripts/task.sh who 2>/dev/null | awk '{print $2; exit}' || true)"
  fi
  [[ -n "$who" ]] || die "who are you? use --who <isabel|fernando|lorenz|helmut> or set SHELFIE_WHO"
  who="$(tr '[:upper:]' '[:lower:]' <<<"$who")"
  me="$(handle_of "$who")" || die "unknown name '$who' (isabel|fernando|lorenz|helmut)"
}

full_sha() { git rev-parse --verify -q "$1^{commit}" 2>/dev/null || die "unknown commit '$1' (git fetch origin dev first?)"; }

# JSON lines {login, body, at} for the peer-review comments of one commit.
reviews() {
  gh api --paginate "$API/commits/$1/comments" \
    --jq '.[] | select(.body | startswith("peer-review:")) | {login: .user.login, body: .body, at: .created_at}' 2>/dev/null || true
}

# GitHub login of the commit author; falls back to git author email/name matched against team handles.
author_of() {
  local sha="$1" login email name h n
  login="$(gh api "$API/commits/$sha" --jq '.author.login // ""' 2>/dev/null || true)"
  if [[ -n "$login" ]]; then echo "$login"; return; fi
  email="$(git log -1 --format=%ae "$sha" | tr '[:upper:]' '[:lower:]')"
  name="$(git log -1 --format=%an "$sha" | tr '[:upper:]' '[:lower:]')"
  for n in HELMUT ISABEL FERNANDO LORENZ; do
    h="${!n}"; h="$(tr '[:upper:]' '[:lower:]' <<<"$h")"
    if [[ "$email" == *"$h"* || "$name" == "$h" ]]; then echo "${!n}"; return; fi
  done
  echo "$name"
}

range_commits() { git log --first-parent --no-merges --format=%H --reverse "$@"; }

case "$cmd" in
  pending)
    resolve_who
    git fetch -q origin dev || die "git fetch origin dev failed"
    if [[ -n "$since" ]]; then rng=("$(full_sha "$since")..origin/dev"); else rng=(--since="48 hours ago" origin/dev); fi
    n=0
    while read -r sha; do
      [[ -z "$sha" ]] && continue
      author="$(author_of "$sha")"
      [[ "$(tr '[:upper:]' '[:lower:]' <<<"$author")" == "$(tr '[:upper:]' '[:lower:]' <<<"$me")" ]] && continue
      mine="$(reviews "$sha" | jq -s --arg me "$me" '[.[] | select(.login | ascii_downcase == ($me | ascii_downcase))] | length')"
      [[ "$mine" -gt 0 ]] && continue
      n=$((n + 1))
      printf '%s  %s  %s\n    -> bash scripts/peer-review.sh show %s\n' \
        "$(git rev-parse --short "$sha")" "$author" "$(git log -1 --format=%s "$sha")" "$(git rev-parse --short "$sha")"
    done < <(range_commits "${rng[@]}")
    [[ $n -eq 0 ]] && echo "nothing to review ($who/$me, ${since:+since $since}${since:-last 48 h})"
    exit 0
    ;;
  show)
    [[ ${#args[@]} -ge 1 ]] || die "usage: show <sha>"
    sha="$(full_sha "${args[0]}")"
    git show --stat "$sha"
    echo; echo "=== diff ==="
    git show --format= "$sha"
    echo; echo "=== peer-review comments ==="
    out="$(reviews "$sha" | jq -r '"\(.at)  \(.login): \(.body)"')"
    echo "${out:-none yet}"
    ;;
  ok|issue)
    [[ ${#args[@]} -ge 1 ]] || die "usage: $cmd <sha> <note...>"
    resolve_who
    sha="$(full_sha "${args[0]}")"
    note="${args[*]:1}"
    [[ "$cmd" == issue && -z "$note" ]] && die "an issue needs a note: issue <sha> <what is wrong>"
    body="peer-review: $cmd ($who)${note:+ $note}"
    gh api -X POST "$API/commits/$sha/comments" -f body="$body" --jq '.html_url' >/dev/null \
      || die "could not post the comment (is $sha pushed to GitHub?)"
    echo "posted on $(git rev-parse --short "$sha"): $body"
    ;;
  status)
    git fetch -q origin dev main 2>/dev/null || git fetch -q origin || die "git fetch failed"
    rng="${args[0]:-origin/main..origin/dev}"
    bad=0; total=0
    while read -r sha; do
      [[ -z "$sha" ]] && continue
      total=$((total + 1))
      author="$(author_of "$sha")"
      # Last verdict per reviewer, in time order; reviewer must not be the author for "ok" to count.
      summary="$(reviews "$sha" | jq -s -r --arg a "$author" '
        map(. + {v: (if (.body | startswith("peer-review: issue")) then "issue" elif (.body | startswith("peer-review: ok")) then "ok" else "other" end)})
        | map(select(.v != "other")) | sort_by(.at) | group_by(.login | ascii_downcase)
        | map({login: .[0].login, last: .[-1].v, oks: (map(select(.v == "ok")) | length), issues: (map(select(.v == "issue")) | length)})
        | {ok: (map(.oks) | add // 0), issue: (map(.issues) | add // 0),
           open: (map(select(.last == "issue") | .login) | join(",")),
           oks_by: (map(select(.oks > 0 and (.login | ascii_downcase) != ($a | ascii_downcase)) | .login) | join(","))}
        | "\(.ok)\t\(.issue)\t\(.open)\t\(.oks_by)"')"
      IFS=$'\t' read -r ok_n is_n open oks_by <<<"$summary"
      flag="ok"
      if [[ -n "$open" ]]; then flag="OPEN ISSUE by $open"; bad=1
      elif [[ -z "$oks_by" ]]; then flag="NOT REVIEWED by anyone but the author"; bad=1; fi
      printf '%s  %-14s ok=%s issue=%s reviewers=[%s]  %s  %s\n' "$(git rev-parse --short "$sha")" "$author" "$ok_n" "$is_n" "$oks_by" "$flag" "$(git log -1 --format=%s "$sha" | cut -c1-60)"
    done < <(range_commits "$rng")
    [[ $total -eq 0 ]] && echo "no commits in $rng"
    if [[ $bad -ne 0 ]]; then echo "peer-review status: NOT clean ($rng)"; exit 1; fi
    echo "peer-review status: clean ($total commits in $rng)"
    ;;
  *) echo "unknown command: $cmd" >&2; usage >&2; exit 64 ;;
esac
