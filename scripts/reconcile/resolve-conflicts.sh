#!/usr/bin/env bash
# Conflict-resolution helper for the upstream reconciliation merge.
# Preserve-list paths → --ours; everything else → --theirs; hand-merge files left alone.
# See docs/superpowers/specs/2026-04-20-upstream-reconcile-design.md §5.3.
set -eo pipefail
cd "$(git rev-parse --show-toplevel)"

PRESERVE="$(dirname "$0")/preserve-paths.txt"
HAND_MERGE_RE='^(src/cli/program/register\.subclis\.ts|src/cli/program/subcli-descriptors\.ts|package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$'

is_preserved() {
  local p="$1"
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    case "$p" in
      "$pattern"*) return 0 ;;
    esac
  done < "$PRESERVE"
  return 1
}

ours=0; theirs=0; manual=0; other=0
manual_list=""

while IFS=$'\t' read -r status path; do
  [ -z "$path" ] && continue
  if echo "$path" | grep -qE "$HAND_MERGE_RE"; then
    manual=$((manual+1))
    manual_list="$manual_list$path
"
    continue
  fi
  case "$status" in
    UU)
      if is_preserved "$path"; then
        git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
      else
        git checkout --theirs -- "$path" && git add -- "$path" && theirs=$((theirs+1))
      fi
      ;;
    DU|UD)
      if is_preserved "$path"; then
        git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
      else
        git rm -f -- "$path" >/dev/null && theirs=$((theirs+1))
      fi
      ;;
    AU|UA)
      if is_preserved "$path"; then
        git checkout --ours -- "$path" && git add -- "$path" && ours=$((ours+1))
      else
        git checkout --theirs -- "$path" && git add -- "$path" && theirs=$((theirs+1))
      fi
      ;;
    *)
      other=$((other+1))
      ;;
  esac
done < <(git status --porcelain=v1 | awk '/^(UU|DU|UD|AU|UA) /{print substr($0,1,2) "\t" substr($0,4)}')

printf "resolved: ours=%s theirs=%s manual=%s other=%s\n" "$ours" "$theirs" "$manual" "$other"
if [ "$manual" -gt 0 ]; then
  printf "hand-merge required:\n%s" "$manual_list"
fi
