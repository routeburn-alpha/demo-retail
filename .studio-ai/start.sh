#!/bin/bash
# Start the services a parked sandbox has dropped.
#
# The platform runs this when a task claims a warm session (execution-api's START_SCRIPT_PATH). A
# warm session sits idle between the warm turn and the task, and an idle sandbox is recreated with
# its disk intact and its running processes gone, so the Postgres that `warm.sh` -> `db:local`
# started is not running by the time the task needs it. The data is still there; only the server is not.
#
# The services-only counterpart of `warm.sh`: no install, no build, no seeding. Idempotent and quick,
# safe to re-run. Starts what is down, and fails loudly if it does not come up.

set -e
cd "$(dirname "$0")/.."

# Mirror scripts/db-local.sh: with an external DATABASE_URL there is no local database to start.
if [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local && ! grep -q 'localhost' .env.local; then
	echo "external DATABASE_URL present — no local database to start"
	exit 0
fi

sudo service postgresql start
pg_isready -h localhost -p 5432 -q || {
	echo "[start] postgres did not come up on localhost:5432" >&2
	exit 1
}
echo "[start] postgres is up"
