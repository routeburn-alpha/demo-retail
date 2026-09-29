#!/bin/bash
# Precommit entry point for demo-retail — the mirror of .studio-ai/warm.sh.
#
# `warm.sh` takes the environment setup out of the agent's turn loop; this takes the precommit
# ritual out of it. Both exist for the same reason: a fixed sequence of commands with no judgement
# in it does not belong in a model's context, one turn at a time.
#
# Measured on a real run before this existed: the precommit tail was 11 of 24 tool calls — status,
# diff, rebase, commit, check, build, test (a second time, 40 seconds after the first), re-reading
# the standards off disk, push. Half the run, almost none of it thinking.
#
# What stays with the agent, because it IS judgement:
#   - whether the change is right, and whether the standards hold (the confirmStandards gate)
#   - the commit message, passed in here
#   - calling `finalize_task` afterwards, which opens the PR and moves the task to review
#
# Usage:  bash scripts/precommit.sh "<commit message>"
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
	echo "[precommit] usage: bash scripts/precommit.sh \"<commit message>\"" >&2
	exit 1
fi

mkdir -p logs

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "main" ]; then
	echo "[precommit] refusing: you are on main. Create your branch first." >&2
	exit 1
fi

# `phase <name> <command...>` — run it, keep the output in a file, and say only whether it passed.
# The output stays out of the transcript deliberately: it is large, the tenant controls what is in
# it, and a caller that reads success out of text rather than an exit code gets it wrong.
phase() {
	local name="$1"
	shift
	local log="logs/precommit-${name}.log"
	printf '[precommit] %-6s ' "$name"
	if "$@" > "$log" 2>&1; then
		echo "ok"
		return 0
	fi
	echo "FAILED"
	echo "[precommit] --- last 30 lines of ${log} ---" >&2
	tail -30 "$log" >&2
	return 1
}

# Commit first: a rebase refuses to run with a dirty tree. Re-running after a fix amends, so the
# branch keeps one commit however many times the gate sends you back.
if [ -n "$(git status --porcelain)" ]; then
	git add -A
	if [ "$(git log -1 --pretty=%s 2>/dev/null)" = "$MESSAGE" ]; then
		git commit -q --amend --no-edit
		echo "[precommit] commit amended"
	else
		git commit -q -m "$MESSAGE"
		echo "[precommit] commit created"
	fi
else
	echo "[precommit] nothing to commit"
fi

phase fetch git fetch origin main || exit 1
phase rebase git -c core.editor=true rebase origin/main || {
	echo "[precommit] rebase failed — resolve it by hand, then re-run." >&2
	exit 1
}

# The gate. All three, every time, before anything leaves the machine.
#
# `check` and `build` are independent and neither writes what the other reads, so they run
# concurrently — measured at 9s and 8s serially. `test` runs alone afterwards: it drives a real
# Chromium, and starting it beside a vite build makes a CPU-bound suite contend for the same cores,
# which is how a pure-render test ends up timing out on a small box.
printf '[precommit] check+build '
npm run check > logs/precommit-check.log 2>&1 &
CHECK_PID=$!
npm run build > logs/precommit-build.log 2>&1 &
BUILD_PID=$!
CHECK_RC=0; BUILD_RC=0
wait $CHECK_PID || CHECK_RC=$?
wait $BUILD_PID || BUILD_RC=$?
if [ "$CHECK_RC" -ne 0 ] || [ "$BUILD_RC" -ne 0 ]; then
	echo "FAILED"
	[ "$CHECK_RC" -ne 0 ] && { echo "[precommit] --- last 30 lines of logs/precommit-check.log ---" >&2; tail -30 logs/precommit-check.log >&2; }
	[ "$BUILD_RC" -ne 0 ] && { echo "[precommit] --- last 30 lines of logs/precommit-build.log ---" >&2; tail -30 logs/precommit-build.log >&2; }
	exit 1
fi
echo "ok"

phase test npm run test || exit 1

phase push git push -u --force-with-lease origin "$BRANCH" || exit 1

echo "[precommit] pushed ${BRANCH}"
echo "[precommit] next: call finalize_task with this branch, the repo, the productCode and a buildReport."
