#!/usr/bin/env bash
# Runs the whole stack without Docker: gcloud emulators plus every service as a Node process.
# Needs: Node 22, ffmpeg, Java 17+ and the gcloud components cloud-firestore-emulator and
# pubsub-emulator. Video files go to ./.local-storage. Stop with Ctrl-C.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.local-logs"
mkdir -p "$LOGS" "$ROOT/.local-storage"

export GOOGLE_CLOUD_PROJECT=demo-artisan
export FIRESTORE_EMULATOR_HOST=localhost:8686
export PUBSUB_EMULATOR_HOST=localhost:8681
export JWT_SECRET=dev-secret STORAGE_MODE=local LOCAL_STORAGE_DIR="$ROOT/.local-storage"
export RAW_BUCKET=raw MEDIA_BUCKET=media

pids=()
start() { # name, log file, command...
  local name=$1; shift
  "$@" >"$LOGS/$name.log" 2>&1 &
  pids+=($!)
  echo "started $name (log: .local-logs/$name.log)"
}
trap 'kill "${pids[@]}" 2>/dev/null' EXIT

start firestore gcloud emulators firestore start --host-port="$FIRESTORE_EMULATOR_HOST" --project=$GOOGLE_CLOUD_PROJECT
start pubsub gcloud beta emulators pubsub start --host-port="$PUBSUB_EMULATOR_HOST" --project=$GOOGLE_CLOUD_PROJECT
until curl -s "http://$FIRESTORE_EMULATOR_HOST" >/dev/null && curl -s "http://$PUBSUB_EMULATOR_HOST" >/dev/null; do sleep 1; done

cd "$ROOT/backend"
node scripts/pubsub-init.js http://localhost:8082/events/video
PORT=8081 start auth-service node services/auth-service/src/index.js
PORT=8082 TRANSCODER_MODE=http TRANSCODER_URL=http://localhost:8085 start catalog-service node services/catalog-service/src/index.js
PORT=8083 CATALOG_URL=http://localhost:8082 start order-service node services/order-service/src/index.js
PORT=8084 start media-service node services/media-service/src/index.js
PORT=8085 start transcoder node worker/src/dev-server.js
PORT=8080 start gateway node services/gateway/src/index.js

echo "Gateway: http://localhost:8080 (Ctrl-C to stop)"
wait
