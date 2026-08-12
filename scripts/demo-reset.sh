#!/usr/bin/env bash
#
# demo-reset.sh — return the repo to the "before" state of the fuzzy-search demo.
#
# The demo beat: type a typo ("jckt" / "jaket") into storefront search, get zero
# results, watch the agent build typo tolerance, watch it work. To replay that
# beat the repo must be back in the state where search is EXACT-MATCH ONLY.
#
# This is deliberately repeatable — the feature is meant to be built and reset
# over and over, so "reset" must not depend on nobody having shipped it.
#
# Four kinds of state are in play. This script handles three and reports the fourth:
#   1. Code     — current branch pinned to origin/main, then the search matcher
#                 forced back to the fuzzy-free baseline tag. Self-healing: if
#                 fuzzy matching ever lands on main, this still restores "before".
#   2. Branches — optionally delete a throwaway demo branch (local + remote),
#                 which drops its Vercel preview.
#   3. DB       — optionally reseed (--seed) so the low-stock badge renders.
#   4. Studio   — cannot be reset from a shell (it lives behind MCP); printed
#                 as an explicit checklist instead of silently ignored.
#
# Usage:
#   scripts/demo-reset.sh                       # per-run reset (code + verify)
#   scripts/demo-reset.sh <branch>              # also delete that demo branch + its preview
#   scripts/demo-reset.sh --seed [<branch>]     # pre-flight: also reseed DB + low-stock
#   scripts/demo-reset.sh --check               # verify only, change nothing (exit 1 if not baseline)
#   scripts/demo-reset.sh --force               # proceed even if unrelated files are dirty
#   scripts/demo-reset.sh --no-verify           # skip the test-based verification (faster)

set -euo pipefail

# This script runs `git reset --hard`, which can rewrite THIS FILE while bash is
# still reading it — bash reads scripts incrementally, so a length change mid-run
# makes it resume at the wrong byte offset. Re-exec from an immutable snapshot.
if [ "${DEMO_RESET_REEXEC:-0}" != "1" ]; then
  SNAPSHOT="$(mktemp -t demo-reset.XXXXXX)"
  cp "$0" "$SNAPSHOT"
  export DEMO_RESET_REEXEC=1
  bash "$SNAPSHOT" "$@"
  STATUS=$?
  rm -f "$SNAPSHOT"
  exit $STATUS
fi

BASELINE_BRANCH="origin/main"
BASELINE_TAG="demo-baseline/search-exact"

# The demo's blast radius: the only files whose "before" state the demo depends on.
SEARCH_FILES=(
  src/lib/storefront/search.ts
  src/lib/storefront/search.test.ts
)

DO_SEED=0
DO_CHECK=0
DO_VERIFY=1
FORCE=0
DEMO_BRANCH=""

for arg in "$@"; do
  case "$arg" in
    --seed)      DO_SEED=1 ;;
    --check)     DO_CHECK=1 ;;
    --no-verify) DO_VERIFY=0 ;;
    --force)     FORCE=1 ;;
    -h|--help)   sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --*)         echo "Unknown flag: $arg" >&2; exit 2 ;;
    *)           DEMO_BRANCH="$arg" ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ---------------------------------------------------------------------------
# verify_baseline — is the working tree actually in the "before" state?
#
# Greps for fuzzy symbols, then (unless --no-verify) runs the search unit tests.
# The tests are the real check: the baseline suite asserts that search('jaket')
# returns [], so a green run proves typo tolerance is genuinely absent, rather
# than just proving a particular identifier is missing.
# ---------------------------------------------------------------------------
verify_baseline() {
  local failed=0

  # 1. Strongest check: the demo's files must match the pinned baseline byte for byte.
  #    This is what catches a shipped feature — fuzzy matching arrives WITH its own
  #    passing tests, so "the suite is green" proves nothing on its own.
  if git rev-parse --verify --quiet "refs/tags/$BASELINE_TAG" >/dev/null; then
    if git diff --quiet "$BASELINE_TAG" -- "${SEARCH_FILES[@]}"; then
      echo "✓ search files match baseline $BASELINE_TAG"
    else
      echo "✗ search files differ from baseline $BASELINE_TAG:" >&2
      git diff --stat "$BASELINE_TAG" -- "${SEARCH_FILES[@]}" | sed 's/^/    /' >&2
      failed=1
    fi
  fi

  # 2. Defence in depth, and the only check available if the tag is missing:
  #    the matcher itself must contain no edit-distance machinery.
  if grep -nE 'levenshtein|tokenMatches|MAX_EDIT_DIST|editDistance' src/lib/storefront/search.ts >/dev/null 2>&1; then
    echo "✗ fuzzy matching still present in src/lib/storefront/search.ts" >&2
    failed=1
  else
    echo "✓ search.ts is exact-match only"
  fi

  # 3. Behaviour: the baseline suite asserts search('jaket') returns []. Green here
  #    means typo tolerance is genuinely absent — but only meaningful alongside (1),
  #    since a shipped feature would replace these tests with ones that expect fuzzy.
  if [ "$DO_VERIFY" -eq 1 ]; then
    if npx vitest run src/lib/storefront/search.test.ts >/tmp/demo-reset-verify.log 2>&1; then
      echo "✓ search unit tests green"
    else
      echo "✗ search tests failed — repo is NOT at the demo baseline" >&2
      tail -25 /tmp/demo-reset-verify.log >&2
      failed=1
    fi
  fi

  return $failed
}

# --check: report and exit without touching anything.
if [ "$DO_CHECK" -eq 1 ]; then
  echo "▸ Checking demo baseline (read-only)…"
  if verify_baseline; then
    echo "✓ Repo is at the fuzzy-search demo baseline. Ready to run the demo."
    exit 0
  fi
  echo "✗ Repo is NOT at the baseline. Run: scripts/demo-reset.sh" >&2
  exit 1
fi

echo "▸ Fetching origin…"
git fetch --quiet --tags origin

# ---------------------------------------------------------------------------
# 1. Code: pin the branch to baseline, then force the search files fuzzy-free.
# ---------------------------------------------------------------------------

# Guard real work. Dirty search files are expected (that IS the demo output);
# dirty anything-else is probably work someone cares about, so stop unless --force.
if ! git diff --quiet || ! git diff --cached --quiet; then
  UNRELATED="$(git diff --name-only HEAD -- . ':(exclude)src/lib/storefront/search.ts' ':(exclude)src/lib/storefront/search.test.ts')"
  if [ -n "$UNRELATED" ] && [ "$FORCE" -eq 0 ]; then
    echo "✗ Uncommitted changes outside the demo's search files:" >&2
    echo "$UNRELATED" | sed 's/^/    /' >&2
    echo "  These would be destroyed by 'git reset --hard'. Commit/stash them," >&2
    echo "  or re-run with --force to discard them." >&2
    exit 1
  fi
  echo "▸ Discarding demo changes on $CURRENT_BRANCH"
fi

git reset --hard "$BASELINE_BRANCH" --quiet
git clean -fd --quiet
echo "✓ $CURRENT_BRANCH reset to $BASELINE_BRANCH ($(git rev-parse --short HEAD))"

# Force the search matcher to the pinned fuzzy-free baseline. In the healthy case
# main is already fuzzy-free and this is a no-op. If someone merged the feature to
# main, this is what still gets you a replayable demo.
if git rev-parse --verify --quiet "refs/tags/$BASELINE_TAG" >/dev/null; then
  git checkout "$BASELINE_TAG" -- "${SEARCH_FILES[@]}"
  if git diff --cached --quiet -- "${SEARCH_FILES[@]}"; then
    echo "✓ search matcher already fuzzy-free on $BASELINE_BRANCH"
  else
    git reset --quiet -- "${SEARCH_FILES[@]}"
    echo "⚠ $BASELINE_BRANCH CONTAINS FUZZY MATCHING — restored search files from $BASELINE_TAG."
    echo "  The working tree is now correct for the demo, but it is dirty."
    echo "  Fix the root cause by reverting the fuzzy commit on main."
  fi
else
  echo "⚠ Baseline tag '$BASELINE_TAG' not found — relying on $BASELINE_BRANCH alone."
  echo "  Create it with: git tag $BASELINE_TAG <fuzzy-free-commit> && git push origin $BASELINE_TAG"
fi

# ---------------------------------------------------------------------------
# 2. Branch + preview: delete the throwaway demo branch (drops its Vercel preview).
# ---------------------------------------------------------------------------
if [ -n "$DEMO_BRANCH" ]; then
  if [ "$DEMO_BRANCH" = "$CURRENT_BRANCH" ]; then
    echo "✗ Refusing to delete the branch you're on ($DEMO_BRANCH). Switch away first." >&2
  else
    git branch -D "$DEMO_BRANCH" 2>/dev/null && echo "✓ Deleted local branch $DEMO_BRANCH" || true
    if git ls-remote --exit-code --heads origin "$DEMO_BRANCH" >/dev/null 2>&1; then
      git push origin --delete "$DEMO_BRANCH" --quiet \
        && echo "✓ Deleted remote branch $DEMO_BRANCH (Vercel preview will drop)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3. DB (pre-flight only): reseed and force a low-stock spread so the badge renders.
# ---------------------------------------------------------------------------
if [ "$DO_SEED" -eq 1 ]; then
  echo "▸ Reseeding catalogue…"
  npm run --silent db:seed
  echo "▸ Applying low-stock demo state…"
  npm run --silent db:seed:lowstock
fi

# ---------------------------------------------------------------------------
# 4. Verify we actually landed in the "before" state.
# ---------------------------------------------------------------------------
echo "▸ Verifying demo baseline…"
if ! verify_baseline; then
  echo "" >&2
  echo "✗ Reset did NOT reach the demo baseline. Do not start the demo." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Studio (manual — the MCP store can't be reset from a shell).
# ---------------------------------------------------------------------------
cat <<'EOF'

✓ Reset complete. Search is exact-match only — "jckt" and "jaket" return nothing.

Still to do by hand (Studio task store is behind MCP, not git):
  • Reset the fuzzy-search idea to Backlog and its tasks to backlog.
  • Soft-delete any idea/task the last run created.
  • Confirm the routeburn Vercel production storefront (main) is unchanged.
EOF
