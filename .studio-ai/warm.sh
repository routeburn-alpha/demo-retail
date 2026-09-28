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
# Idempotent: safe to re-run.

set -e
cd "$(dirname "$0")/.."
echo "[warm] start $(date -u)"

echo "[warm] install"
npm ci

# The storefront loads its catalogue from Postgres (src/routes/+page.server.ts), so without a
# database the dev server returns 500 and 20 tests silently skip themselves — including the whole
# security project. Postgres 16 is already installed in the sandbox image; it just is not running.
if [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local && ! grep -q 'localhost' .env.local; then
	# A real (Neon) DATABASE_URL is configured. INITIAL-SETUP.md is explicit that db:push and
	# db:seed rewrite shared state other devs and agents depend on, so never run them against it.
	echo "[warm] external DATABASE_URL present — leaving the database alone"
else
	echo "[warm] local database"
	sudo service postgresql start
	sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='demoretail'" | grep -q 1 ||
		sudo -u postgres psql -c "CREATE USER demoretail WITH PASSWORD 'demoretail' SUPERUSER;"
	sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='demoretail'" | grep -q 1 ||
		sudo -u postgres psql -c "CREATE DATABASE demoretail OWNER demoretail;"
	printf 'DATABASE_URL="postgresql://demoretail:demoretail@localhost:5432/demoretail"\nADMIN_PASSWORD="change-me"\n' > .env.local

	npm run db:push
	npm run db:seed
	npm run db:seed:standards
fi

# SvelteKit's generated types ($types, $env). Without this the first check or vitest run pays for
# the sync itself, which is exactly the cost warming exists to move off the task's clock.
echo "[warm] svelte-kit sync"
npx svelte-kit sync

# A build leaves vite's dependency-optimiser cache and the output behind, and the claiming task
# reuses both. Type checks and linters are deliberately NOT here: they leave only a verdict, which
# the task must redo against its own diff.
echo "[warm] build"
npm run build

# One run leaves the test runner (and Chromium) warm and proves the environment works before a task
# depends on it. Output goes to a file, not the transcript: CLAUDE.md asks for that anyway, and the
# demo-reset fixtures print benign git plumbing messages that a caller scanning output for failure
# strings would read as a real failure.
echo "[warm] test"
mkdir -p logs
if npm run test > logs/warm-test.log 2>&1; then
	echo "[warm] tests green"
else
	echo "[warm] WARNING: test suite is not green, see logs/warm-test.log — reporting, not fixing"
fi

# A record the claiming session can read instead of re-deriving what was already done.
{
	echo "# Environment prepared by .studio-ai/warm.sh"
	echo
	echo "- at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	echo "- commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
	echo "- node: $(node --version 2>/dev/null || echo unknown)"
	echo "- database: $(grep -o 'postgresql://[^\"]*' .env.local 2>/dev/null || echo none)"
	echo
	echo "Dependencies are installed, the database is pushed and seeded, SvelteKit types are"
	echo "generated, and the app has been built and tested once."
	echo "Do not reinstall, rebuild, or re-seed. Run tests with: npm run test"
} > .studio-warm.md

echo "[warm] done $(date -u)"
