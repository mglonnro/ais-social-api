#!/usr/bin/env bash
# Brings up the two tunnels needed to run ais-social-api locally against
# the production GCP project `naked-sailor`:
#   1) Cloud SQL Auth Proxy → 127.0.0.1:5433 (Postgres on marinais-db-2)
#   2) gcloud SSH port-forward → 127.0.0.1:3105 (ais-server WS on marinais-vm1)
#
# Ctrl-C tears both down. Output is interleaved.

set -euo pipefail

PROJECT="naked-sailor"
SQL_INSTANCE="${PROJECT}:europe-west1:marinais-db-2"
SQL_PORT="${SQL_PORT:-5433}"
VM_NAME="marinais-vm1"
VM_ZONE="europe-west1-b"
AIS_PORT="${AIS_PORT:-3105}"
MSG_PORT="${MSG_PORT:-3110}"

command -v cloud-sql-proxy >/dev/null \
  || { echo "cloud-sql-proxy not found. brew install cloud-sql-proxy"; exit 1; }
command -v gcloud >/dev/null \
  || { echo "gcloud not found. Install Google Cloud SDK."; exit 1; }

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ Cloud SQL Auth Proxy on 127.0.0.1:${SQL_PORT}"
cloud-sql-proxy "${SQL_INSTANCE}" --port "${SQL_PORT}" &

echo "→ gcloud SSH tunnel ${VM_NAME} :${AIS_PORT} (ais-server) :${MSG_PORT} (msg-server)"
gcloud compute ssh "${VM_NAME}" \
  --zone "${VM_ZONE}" \
  --project "${PROJECT}" \
  -- -L "${AIS_PORT}:127.0.0.1:${AIS_PORT}" \
     -L "${MSG_PORT}:127.0.0.1:${MSG_PORT}" -N &

wait
