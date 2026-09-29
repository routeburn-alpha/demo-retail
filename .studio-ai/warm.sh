#!/bin/bash
# Warm entry point for demo-retail.
#
# `.studio-ai/warm.sh` is THE path the platform runs (execution-api's WARM_SCRIPT_PATH).
# An agent warming its sandbox runs this file and nothing else, before any task exists.
#
# Contract, from the warm prompt:
#   - leave REUSABLE STATE only (installs, generated types, build cache, a warm test runner)
#   - change no source file — the claiming task fetches forward onto this checkout
#   - report failures, never fix them; there is no task yet
#
# Every phase's real output goes to logs/warm-<phase>.log, not a hand-written summary. Nothing on
# this execution path reads a summary back — each run gets a fresh sandbox, so there is no later
# session to hand one to, and there is no download mechanism yet for what lands in logs/ (planned
# separately). What belongs in logs/ is the actual command output, for whenever that exists.
#
# Idempotent: safe to re-run.

set -u
cd "$(dirname "$0")/.."
mkdir -p logs
echo "[warm] start $(date -u)"

# `phase <name> <command...>` — run it, keep the real output in a file, say only pass/fail. Same
# convention as scripts/precommit.sh's phase(): the output is large and is the tenant's own, so it
# does not belong in the transcript, and a caller reading success out of text rather than an exit
# code gets it wrong (this is the exact bug #157/#158 fixed on the precommit side).
phase() {
	local name="$1"
	shift
	local log="logs/warm-${name}.log"
	printf '[warm] %-6s ' "$name"
	if "$@" > "$log" 2>&1; then
		echo "ok"
		return 0
	fi
	echo "FAILED"
	echo "[warm] --- last 30 lines of ${log} ---" >&2
	tail -30 "$log" >&2
	return 1
}

phase install npm ci || exit 1

# The storefront loads its catalogue from Postgres (src/routes/+page.server.ts), so without a
# database the dev server returns 500 and 20 tests silently skip themselves — including the whole
# security project. Postgres 16 is already installed in the sandbox image; it just is not running.
if [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local && ! grep -q 'localhost' .env.local; then
	# A real (Neon) DATABASE_URL is configured. INITIAL-SETUP.md is explicit that db:push and
	# db:seed rewrite shared state other devs and agents depend on, so never run them against it.
	echo "[warm] db     external DATABASE_URL present — leaving the database alone"
else
	# A real `( )` subshell, not `{ }`: `set -e` inside a `{ }` group runs in the current shell and
	# would abort this whole script on the first failing command, before DB_START_RC is even read.
	(
		set -e
		sudo service postgresql start
		sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='demoretail'" | grep -q 1 ||
			sudo -u postgres psql -c "CREATE USER demoretail WITH PASSWORD 'demoretail' SUPERUSER;"
		sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='demoretail'" | grep -q 1 ||
			sudo -u postgres psql -c "CREATE DATABASE demoretail OWNER demoretail;"
	) > logs/warm-db.log 2>&1
	DB_START_RC=$?
	printf 'DATABASE_URL="postgresql://demoretail:demoretail@localhost:5432/demoretail"\nADMIN_PASSWORD="change-me"\n' > .env.local
	if [ "$DB_START_RC" -ne 0 ]; then
		echo "[warm] db     FAILED"
		echo "[warm] --- last 30 lines of logs/warm-db.log ---" >&2
		tail -30 logs/warm-db.log >&2
		exit 1
	fi
	echo "[warm] db     ok"

	phase db-push  npm run db:push || exit 1
	phase db-seed  bash -c 'npm run db:seed && npm run db:seed:standards' || exit 1
fi

# SvelteKit's generated types ($types, $env) plus the build. Without the sync, the first check or
# vitest run pays for it; the build leaves vite's dependency-optimiser cache and output behind for
# the claiming task to reuse. Type checks and linters are deliberately NOT here: they leave only a
# verdict, which the task must redo against its own diff.
phase build bash -c 'npx svelte-kit sync && npm run build' || exit 1

# One run leaves the test runner (and Chromium) warm and proves the environment works before a task
# depends on it. Failures are reported, never fixed — there is no task yet.
if phase test npm run test; then
	:
else
	echo "[warm] WARNING: test suite is not green, see logs/warm-test.log — reporting, not fixing"
fi

echo "[warm] done $(date -u)"
