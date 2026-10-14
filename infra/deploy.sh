#!/usr/bin/env bash
# Sets up the GCP project and deploys the API service and transcoder job. Safe to re-run.
# Needs: gcloud logged in, billing enabled on the project, Node 22.
# Usage: PROJECT_ID=my-project REGION=asia-south1 ./infra/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
RAW_BUCKET="${RAW_BUCKET:-${PROJECT_ID}-artisan-raw}"
MEDIA_BUCKET="${MEDIA_BUCKET:-${PROJECT_ID}-artisan-media}"
API_SERVICE=artisan-api
JOB=artisan-transcoder
API_SA="artisan-api-sa@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="artisan-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling APIs"
gcloud services enable run.googleapis.com firestore.googleapis.com storage.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iamcredentials.googleapis.com

echo "==> Firestore (Native mode)"
gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || \
  gcloud firestore databases create --location="$REGION" --type=firestore-native

echo "==> Buckets"
gcloud storage buckets describe "gs://$RAW_BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$RAW_BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets describe "gs://$MEDIA_BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$MEDIA_BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://$RAW_BUCKET" --cors-file="$ROOT/infra/cors-raw.json"
gcloud storage buckets update "gs://$MEDIA_BUCKET" --cors-file="$ROOT/infra/cors-media.json"
# Both buckets stay private: our org enforces domain-restricted sharing, which rejects
# allUsers bindings. Players fetch HLS through the API's /media route instead.

echo "==> Service accounts + IAM"
for sa in artisan-api-sa artisan-worker-sa; do
  gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 || \
    gcloud iam service-accounts create "$sa" --display-name="$sa"
done
# New service accounts take a few seconds to propagate in IAM, so retry bindings.
retry() { for i in 1 2 3 4 5 6; do "$@" >/dev/null 2>&1 && return 0; sleep $((i * 5)); done; "$@" >/dev/null; }
bind() { retry gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" --condition=None; }
bind "$API_SA" roles/datastore.user
bind "$API_SA" roles/run.developer # start the transcoder job with env overrides
bind "$WORKER_SA" roles/datastore.user
retry gcloud storage buckets add-iam-policy-binding "gs://$RAW_BUCKET" --member="serviceAccount:$API_SA" --role=roles/storage.objectAdmin
retry gcloud storage buckets add-iam-policy-binding "gs://$RAW_BUCKET" --member="serviceAccount:$WORKER_SA" --role=roles/storage.objectViewer
retry gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" --member="serviceAccount:$WORKER_SA" --role=roles/storage.objectAdmin
retry gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" --member="serviceAccount:$API_SA" --role=roles/storage.objectViewer
# `--source` builds run as the default compute SA, which has no roles in orgs that
# disable the automatic Editor grant.
BUILD_SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
bind "$BUILD_SA" roles/run.builder
# The API runs the job as the worker SA, so it needs to act as it.
retry gcloud iam service-accounts add-iam-policy-binding "$WORKER_SA" --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountUser
# The worker signs a URL for the raw object so ffmpeg can read it over HTTPS.
retry gcloud iam service-accounts add-iam-policy-binding "$WORKER_SA" --member="serviceAccount:$WORKER_SA" --role=roles/iam.serviceAccountTokenCreator

echo "==> Building Expo web app into backend/api/public"
( cd "$ROOT/app" && npm install && CI=1 npx expo export -p web --output-dir dist-web )
rm -rf "$ROOT/backend/api/public" && cp -r "$ROOT/app/dist-web" "$ROOT/backend/api/public"

echo "==> Deploying API Cloud Run service"
# --no-invoker-iam-check makes the service public without an allUsers binding.
# Reuse the existing secret so tokens held by installed apps stay valid across deploys.
EXISTING_JWT="$(gcloud run services describe "$API_SERVICE" --region "$REGION" \
  --format='value(spec.template.spec.containers[0].env)' 2>/dev/null | tr ';' '\n' | sed -n "s/.*'name': 'JWT_SECRET', 'value': '\([^']*\)'.*/\1/p" || true)"
JWT_SECRET="${JWT_SECRET:-${EXISTING_JWT:-$(openssl rand -hex 24)}}"
gcloud run deploy "$API_SERVICE" --source "$ROOT/backend/api" --region "$REGION" \
  --service-account "$API_SA" --no-invoker-iam-check --cpu 1 --memory 512Mi \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REGION=$REGION,RAW_BUCKET=$RAW_BUCKET,MEDIA_BUCKET=$MEDIA_BUCKET,TRANSCODE_JOB=$JOB,JWT_SECRET=$JWT_SECRET"

URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format='value(status.url)')"
MEDIA_BASE_URL="${MEDIA_BASE_URL:-$URL/media}"

echo "==> Deploying transcoder Cloud Run Job"
gcloud run jobs deploy "$JOB" --source "$ROOT/backend/worker" --region "$REGION" \
  --service-account "$WORKER_SA" --cpu 4 --memory 8Gi --task-timeout 3600 --max-retries 1 \
  --set-env-vars "RAW_BUCKET=$RAW_BUCKET,MEDIA_BUCKET=$MEDIA_BUCKET,MEDIA_BASE_URL=$MEDIA_BASE_URL"

echo
echo "Deployed."
echo "   Web app + API : $URL"
echo "   Health check  : $URL/api/health"
echo "   Android build : cd app && EXPO_PUBLIC_API_URL=$URL npx expo run:android --variant release"
