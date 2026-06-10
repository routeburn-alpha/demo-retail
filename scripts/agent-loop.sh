#!/usr/bin/env bash
#
# agent-loop.sh — outside-the-session poll loop that drives the SDLC autonomously.
#
# Portable essence of the studio-ai fleet model (FRAMEWORK.md, Opinion 7). Runs in an agent's
# worktree, OUTSIDE Claude Code. It polls studio-ai for work, and only launches an interactive
# Claude session when there is a task — otherwise it idles cheaply. When the session finishes a
# task, control returns here and the loop repeats.
#
# Work lives in studio-ai (the studio's task system), reached over its MCP HTTP server. Because the
# loop runs outside Claude Code, it cannot call the `mcp__studio-ai__*` tools directly; instead it
# uses scripts/studio-poll.ts, a tiny bash-callable bridge that queries the same MCP endpoint with
# `fetch` (token + endpoint resolved from .claude/settings.local.json and .mcp.json). By default the
# loop pulls from the WHOLE studio (any product) — the "many agents, one backlog" model of Opinion 7;
# set STUDIO_PRODUCT to scope a given agent to a single product. A task is "available" when it is in
# `backlog` status; an `inProgress` task owned by this agent is resumed first. studio-poll prints
# "<product> <number>"; the /work-on-task skill performs the actual claim (work_on_next_task) and the
# rest of the lifecycle.
#
# Usage:   scripts/agent-loop.sh
# Env:     AGENT_NAME (from .claude/settings.local.json), STUDIO_PRODUCT (optional — restrict to one
#          product; default: whole studio), POLL_INTERVAL (default 30s)

set -euo pipefail

AGENT_NAME="${AGENT_NAME:?AGENT_NAME not set — run inside an agent worktree (see worktree-init.sh)}"
STUDIO_PRODUCT="${STUDIO_PRODUCT:-}"   # empty = whole studio
POLL_INTERVAL="${POLL_INTERVAL:-30}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
BRANCH="agent/$AGENT_NAME"

SCOPE_DESC="${STUDIO_PRODUCT:-the whole studio}"
echo "[$AGENT_NAME] agent loop started. Polling studio-ai ($SCOPE_DESC) every ${POLL_INTERVAL}s. Ctrl-C to stop."

# Ask studio-ai for the next task to work on: resume this agent's in-progress task if any, else the
# next backlog task. Prints "<product> <number>", or nothing when there is no work. STUDIO_PRODUCT,
# if set, is passed as a scope filter.
next_task() {
  local t
  t="$(npx tsx "$REPO_ROOT/scripts/studio-poll.ts" resume "$AGENT_NAME" $STUDIO_PRODUCT 2>/dev/null || true)"
  [ -z "$t" ] && t="$(npx tsx "$REPO_ROOT/scripts/studio-poll.ts" next $STUDIO_PRODUCT 2>/dev/null || true)"
  echo "$t"
}

while true; do
  # Keep the agent branch current with main between tasks (the parallel-safety invariant).
  git -C "$REPO_ROOT" fetch origin main --quiet || true
  if [ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    git -C "$REPO_ROOT" rebase origin/main --quiet 2>/dev/null || git -C "$REPO_ROOT" rebase --abort 2>/dev/null || true
  fi

  # next_task prints "<product> <number>"; split into the two fields.
  read -r TASK_PRODUCT TASK_NUMBER <<< "$(next_task)"

  if [ -n "$TASK_NUMBER" ]; then
    echo "[$AGENT_NAME] picking up $TASK_PRODUCT task #$TASK_NUMBER"
    # Launch an interactive Claude Code session pointed at the task. The /work-on-task skill claims
    # the task in studio-ai (work_on_next_task → inProgress), runs the test-first SDLC, and hands to
    # /precommit.
    claude "/work-on-task $TASK_PRODUCT $TASK_NUMBER"
    echo "[$AGENT_NAME] session for $TASK_PRODUCT task #$TASK_NUMBER returned; looping."
  else
    echo "[$AGENT_NAME] no available tasks; idle ${POLL_INTERVAL}s."
    sleep "$POLL_INTERVAL"
  fi
done
