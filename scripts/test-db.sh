#!/usr/bin/env bash
# Starts a throw-away local PostgreSQL (16+) on port 55432 for the DB integration
# tests, then runs the whole test suite against it. Requires PostgreSQL server
# binaries (initdb, pg_ctl) on PATH, e.g. `sudo apt install postgresql` or
# `brew install postgresql@16`. Nothing here touches your Supabase project.
set -euo pipefail
PORT="${PGPORT_TEST:-55432}"
DIR="$(mktemp -d)"
cleanup() { pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
initdb -D "$DIR" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1 -c max_connections=200" -l "$DIR/log" start >/dev/null
sleep 1.5
TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/postgres" npx vitest run "$@"
