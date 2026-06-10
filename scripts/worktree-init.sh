#!/usr/bin/env bash
#
# worktree-init.sh — spin up an isolated agent workspace as a git worktree.
#
# This is the portable essence of the studio-ai fleet model (FRAMEWORK.md, Opinion 7): every agent
# gets its own git worktree, its own branch (agent/<name>), and its own dev-server port, so N agents
# run in parallel on one machine without colliding. Each pulls from the shared backlog/.
#
# Usage:   scripts/worktree-init.sh <agent-name> [agent-number]
# Example: scripts/worktree-init.sh bravo 2
#
# Creates ../demo-retail-<name> as a worktree on branch agent/<name>, writes its identity into
# .claude/settings.local.json, and installs deps.

set -euo pipefail

AGENT_NAME="${1:?usage: worktree-init.sh <agent-name> [agent-number]}"
AGENT_NUMBER="${2:-1}"
# Dev server port: base 5173 (vite default) offset by agent number, so each agent is isolated.
AGENT_PORT=$((5173 + AGENT_NUMBER))

REPO_ROOT="$(git rev-parse --show-toplevel)"
PARENT_DIR="$(dirname "$REPO_ROOT")"
WORKTREE_DIR="$PARENT_DIR/demo-retail-$AGENT_NAME"
BRANCH="agent/$AGENT_NAME"

echo "Agent:    $AGENT_NAME"
echo "Branch:   $BRANCH"
echo "Port:     $AGENT_PORT"
echo "Worktree: $WORKTREE_DIR"
echo

if [ -d "$WORKTREE_DIR" ]; then
  echo "Worktree already exists at $WORKTREE_DIR — nothing to do."
  exit 0
fi

git -C "$REPO_ROOT" fetch origin main

# Create the branch off origin/main if it doesn't exist yet, then add the worktree.
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH"
else
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_DIR" origin/main
fi

# Bake the agent's identity into the worktree so every Claude Code session and shell inherits it.
mkdir -p "$WORKTREE_DIR/.claude"
cat > "$WORKTREE_DIR/.claude/settings.local.json" <<JSON
{
  "env": {
    "AGENT_NAME": "$AGENT_NAME",
    "AGENT_PORT": "$AGENT_PORT"
  }
}
JSON

echo "Installing dependencies..."
(cd "$WORKTREE_DIR" && npm ci)

cat <<DONE

Worktree ready.

  cd $WORKTREE_DIR
  npm run dev -- --port $AGENT_PORT      # isolated dev server for this agent
  scripts/agent-loop.sh                  # start pulling work from the shared backlog

Each agent's branch returns to origin/main between tasks (the invariant that makes parallel agents
safe). List all agent worktrees with:  git worktree list
DONE
