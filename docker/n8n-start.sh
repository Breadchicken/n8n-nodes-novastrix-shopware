#!/bin/sh
# Entry point of the `n8n` service: start n8n, then import the quickstart credential and
# example workflows into the running instance. The import must come after the start because
# n8n 3 creates its encryption key in the database on the first start.
n8n start &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null; wait "$pid"; exit $?' TERM INT

until wget -qO /dev/null http://127.0.0.1:5678/healthz/readiness 2>/dev/null; do
	kill -0 "$pid" 2>/dev/null || { wait "$pid"; exit $?; }
	sleep 1
done
node "$PACKAGE_DIR/scripts/quickstart.mjs" --boot || echo 'Quickstart import failed, n8n keeps running.'

wait "$pid"
