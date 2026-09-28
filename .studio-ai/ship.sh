#!/bin/bash
# Ship entry point for demo-retail — the mirror of .studio-ai/warm.sh.
#
# `warm.sh` takes the environment setup out of the agent's turn loop; this takes the shipping
# ritual out of it. Both exist for the same reason: a fixed sequence of commands with no judgement
# in it does not belong in a model's context, one turn at a time.
#
# Measured on a real run before this existed: the ship tail was 11 of 24 tool calls — status, diff,
# rebase, commit, check, build, test (a second time, 40 seconds after the first), re-reading the
# standards off disk, push. Half the run, almost none of it thinking.
#
# What stays with the agent, because it IS judgement:
#   - whether the change is right, and whether the standards hold (the confirmStandards gate)
#   - the commit message, passed in here
#   - calling `finalize_task` afterwards, which opens the PR and moves the task to review
#
# Usage:  bash .studio-ai/ship.sh "<commit message>"
#
# Exit 0  the branch is pushed and ready for finalize_task.
# Exit 1  a phase failed. The failing phase is named, with the tail of its log. Fix it and re-run;
#         re-running is safe and amends rather than stacking commits.
#
# There is no success marker to grep for. The exit status is the result.

set -u
cd "$(dirname "$0")/.."

MESSAGE="${1:-}"
if [ -z "$MESSAGE" ]; then
	echo "[ship] usage: bash .studio-ai/ship.sh \"<commit message>\"" >&2
	exit 1
fi

mkdir -p logs

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "main" ]; then
	echo "[ship] refusing: you are on main. Create your branch first." >&2
	exit 1
fi

# `phase <name> <command...>` — run it, keep the output in a file, and say only whether it passed.
# The output stays out of the transcript deliberately: it is large, the tenant controls what is in
# it, and a caller that reads success out of text rather than an exit code gets it wrong.
phase() {
	local name="$1"
	shift
	local log="logs/ship-${name}.log"
	printf '[ship] %-6s ' "$name"
	if "$@" > "$log" 2>&1; then
		echo "ok"
		return 0
	fi
	echo "FAILED"
	echo "[ship] --- last 30 lines of ${log} ---" >&2
	tail -30 "$log" >&2
	return 1
}

# Commit first: a rebase refuses to run with a dirty tree. Re-running after a fix amends, so the
# branch keeps one commit however many times the gate sends you back.
if [ -n "$(git status --porcelain)" ]; then
	git add -A
	if [ "$(git log -1 --pretty=%s 2>/dev/null)" = "$MESSAGE" ]; then
		git commit -q --amend --no-edit
		echo "[ship] commit amended"
	else
		git commit -q -m "$MESSAGE"
		echo "[ship] commit created"
	fi
else
	echo "[ship] nothing to commit"
fi

phase fetch git fetch origin main || exit 1
phase rebase git -c core.editor=true rebase origin/main || {
	echo "[ship] rebase failed — resolve it by hand, then re-run." >&2
	exit 1
}

# The gate. All three, every time, before anything leaves the machine.
phase check npm run check || exit 1
phase build npm run build || exit 1
phase test  npm run test  || exit 1

phase push git push -u --force-with-lease origin "$BRANCH" || exit 1

echo "[ship] pushed ${BRANCH}"
echo "[ship] next: call finalize_task with this branch, the repo, the productCode and a buildReport."
