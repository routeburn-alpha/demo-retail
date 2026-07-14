#!/usr/bin/env bash
#
# demo-reset.sh — return the repo to a clean "before" state between demo runs.
#
# The repeatable preview-URL demo mutates four kinds of state. This script
# resets the two it can (code + branches) and reminds you about the two it
# can't (Studio idea/task via MCP, and the DB, which only needs a one-time
# pre-flight — see --seed).
#
# Usage:
#   scripts/demo-reset.sh                      # per-run reset (code + throwaway branch)
#   scripts/demo-reset.sh <branch>             # also delete this demo branch (local + remote → drops its Vercel preview)
#   scripts/demo-reset.sh --seed [<branch>]    # pre-flight: also reseed DB + apply low-stock so the badge renders
#
# The agent branch is reset to origin/main — the moving baseline every task
# starts from (the repo's standing invariant). No git tag required.

set -euo pipefail

BASELINE="origin/main"
DO_SEED=0
DEMO_BRANCH=""

for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=1 ;;
    --*)    echo "Unknown flag: $arg" >&2; exit 2 ;;
    *)      DEMO_BRANCH="$arg" ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "▸ Fetching origin…"
git fetch --quiet origin

# 1. Code: discard working-tree changes and pin the current branch to baseline.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "▸ Discarding uncommitted changes on $CURRENT_BRANCH"
fi
git reset --hard "$BASELINE" --quiet
git clean -fd --quiet
echo "✓ $CURRENT_BRANCH reset to $BASELINE ($(git rev-parse --short HEAD))"

# 2. Branch + preview: delete the throwaway demo branch, which drops its Vercel preview.
if [ -n "$DEMO_BRANCH" ]; then
  if [ "$DEMO_BRANCH" = "$CURRENT_BRANCH" ]; then
    echo "✗ Refusing to delete the branch you're on ($DEMO_BRANCH). Switch away first." >&2
  else
    git branch -D "$DEMO_BRANCH" 2>/dev/null && echo "✓ Deleted local branch $DEMO_BRANCH" || true
    if git ls-remote --exit-code --heads origin "$DEMO_BRANCH" >/dev/null 2>&1; then
      git push origin --delete "$DEMO_BRANCH" --quiet && echo "✓ Deleted remote branch $DEMO_BRANCH (Vercel preview will drop)"
    fi
  fi
fi

# 3. DB (pre-flight only): reseed and force a low-stock spread so the badge renders.
if [ "$DO_SEED" -eq 1 ]; then
  echo "▸ Reseeding catalogue…"
  npm run --silent db:seed
  echo "▸ Applying low-stock demo state…"
  npm run --silent db:seed:lowstock
fi

# 4. Studio (manual — the MCP store can't be reset from a shell):
cat <<'EOF'

✓ Reset complete. Working tree clean, branch on origin/main baseline.

Still to do by hand (Studio task store is behind MCP, not git):
  • Soft-delete the idea + task this run created (as you did for #8).
  • Confirm the routeburn Vercel production storefront (main) is unchanged.
EOF
