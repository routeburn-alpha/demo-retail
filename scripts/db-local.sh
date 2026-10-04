#!/bin/bash
# Local Postgres bootstrap, called via `npm run db:local` from .studio-ai/warm.sh.
#
# No-ops when a real (Neon) DATABASE_URL is already configured: db:push/db:seed rewrite shared state other devs and agents depend on, so this never touches it.

set -e
cd "$(dirname "$0")/.."

if [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local && ! grep -q 'localhost' .env.local; then
	echo "external DATABASE_URL present — leaving the database alone"
	exit 0
fi

sudo service postgresql start
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='demoretail'" | grep -q 1 ||
	sudo -u postgres psql -c "CREATE USER demoretail WITH PASSWORD 'demoretail' SUPERUSER;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='demoretail'" | grep -q 1 ||
	sudo -u postgres psql -c "CREATE DATABASE demoretail OWNER demoretail;"
printf 'DATABASE_URL="postgresql://demoretail:demoretail@localhost:5432/demoretail"\nADMIN_PASSWORD="change-me"\n' > .env.local

npm run db:push
npm run db:seed
npm run db:seed:standards
