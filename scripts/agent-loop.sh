#!/usr/bin/env bash
#
# agent-loop.sh — outside-the-session poll loop that drives the SDLC autonomously.
#
# Portable essence of the studio-ai fleet model (FRAMEWORK.md, Opinion 7). Runs in an agent's
# worktree, OUTSIDE Claude Code. It polls the shared backlog/, and only launches an interactive
# Claude session when there is work — otherwise it idles cheaply. When the session finishes a task,
# control returns here and the loop repeats.
#
# The backlog is modelled as files in backlog/ (a stand-in for a real task API). A task is
# "available" when its frontmatter has `status: ready`. Claiming = flipping it to `in-progress`
# with this agent's name; /work-on-task and /precommit handle the rest of the lifecycle.
#
# Usage:   scripts/agent-loop.sh
# Env:     AGENT_NAME (from .claude/settings.local.json), POLL_INTERVAL (default 30s)

set -euo pipefail

AGENT_NAME="${AGENT_NAME:?AGENT_NAME not set — run inside an agent worktree (see worktree-init.sh)}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKLOG_DIR="$REPO_ROOT/backlog"
BRANCH="agent/$AGENT_NAME"

echo "[$AGENT_NAME] agent loop started. Polling $BACKLOG_DIR every ${POLL_INTERVAL}s. Ctrl-C to stop."

# Return the path of the first task already in-progress for THIS agent (resume), else empty.
resume_task() {
  grep -rl "^status: in-progress" "$BACKLOG_DIR" 2>/dev/null | while read -r f; do
    if grep -q "^owner: $AGENT_NAME$" "$f"; then echo "$f"; return; fi
  done
}

# Return the path of the lowest-id `status: ready` task, else empty.
next_ready_task() {
  grep -rl "^status: ready" "$BACKLOG_DIR" 2>/dev/null | sort | head -n1
}

# Extract the `id:` value from a task file.
task_id() { grep -m1 "^id:" "$1" | sed 's/^id:[[:space:]]*//'; }

while true; do
  # Keep the agent branch current with main between tasks (the parallel-safety invariant).
  git -C "$REPO_ROOT" fetch origin main --quiet || true
  if [ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    git -C "$REPO_ROOT" rebase origin/main --quiet 2>/dev/null || git -C "$REPO_ROOT" rebase --abort 2>/dev/null || true
  fi

  TASK_FILE="$(resume_task || true)"
  [ -z "$TASK_FILE" ] && TASK_FILE="$(next_ready_task || true)"

  if [ -n "$TASK_FILE" ]; then
    ID="$(task_id "$TASK_FILE")"
    echo "[$AGENT_NAME] picking up task $ID ($TASK_FILE)"
    # Launch an interactive Claude Code session pointed at the task. The /work-on-task skill claims
    # the task (flips status to in-progress), runs the test-first SDLC, and hands to /precommit.
    claude "/work-on-task $ID"
    echo "[$AGENT_NAME] session for task $ID returned; looping."
  else
    echo "[$AGENT_NAME] no ready tasks; idle ${POLL_INTERVAL}s."
    sleep "$POLL_INTERVAL"
  fi
done
