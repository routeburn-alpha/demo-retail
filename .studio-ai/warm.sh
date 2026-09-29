#!/bin/bash
# Warm entry point for demo-retail.
#
# `.studio-ai/warm.sh` is THE path the platform runs (execution-api's WARM_SCRIPT_PATH). Run
# before any task exists; change no source file; report a failing test, don't fix it — there is
# no task yet. Idempotent: safe to re-run.
#
# Captures nothing itself. Whoever calls this redirects output to a log file — see CLAUDE.md.
# One place owns that, not every script that might run.

set -e
cd "$(dirname "$0")/.."

npm ci
npm run db:local
npm run sync
npm run build
npm run test || echo "[warm] tests not green — reporting, not fixing"
