#!/usr/bin/env bash
# ============================================================================================
#  NOT RUN. This script has never been executed against any GCP project. Review it before use.
#  Every resource it creates is prefixed "artisan-ms" and uses its own Firestore database, so it
#  can share a project with the monolith demo without touching its service, job, buckets or data.
# ============================================================================================
# Deploys the microservices version: five Cloud Run services, the transcoder job, the
# video-events topic with a push subscription, the JWT secret, and one service account per
# service with least-privilege IAM. Safe to re-run.
# Usage: PROJECT_ID=<project> REGION=asia-south1 ./infra/deploy-microservices.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
RAW_BUCKET="${RAW_BUCKET:-${PROJECT_ID}-artisan-ms-raw}"
MEDIA_BUCKET="${MEDIA_BUCKET:-${PROJECT_ID}-artisan-ms-media}"
REPO=artisan-ms
DATABASE=artisan-ms
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
TAG="$(date +%Y%m%d-%H%M%S)"
TOPIC=artisan-ms-video-events
SUBSCRIPTION=artisan-ms-video-events-to-catalog
SECRET=artisan-ms-jwt-secret
JOB=artisan-ms-transcoder
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES=(auth-service catalog-service order-service media-service gateway)
svc() { echo "artisan-ms-$1"; } # Cloud Run name for a service

sa() { echo "ams-$1@${PROJECT_ID}.iam.gserviceaccount.com"; }
retry() { for i in 1 2 3 4 5 6; do "$@" >/dev/null 2>&1 && return 0; sleep $((i * 5)); done; "$@" >/dev/null; }
project_role() { retry gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" --condition=None; }
url_of() { gcloud run services describe "$(svc "$1")" --region "$REGION" --format='value(status.url)'; }

gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> APIs"
gcloud services enable run.googleapis.com firestore.googleapis.com storage.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iamcredentials.googleapis.com \
  pubsub.googleapis.com secretmanager.googleapis.com

echo "==> Firestore database, buckets, registry"
gcloud firestore databases describe --database="$DATABASE" >/dev/null 2>&1 ||
  gcloud firestore databases create --database="$DATABASE" --location="$REGION" --type=firestore-native
for b in "$RAW_BUCKET" "$MEDIA_BUCKET"; do
  gcloud storage buckets describe "gs://$b" >/dev/null 2>&1 ||
    gcloud storage buckets create "gs://$b" --location="$REGION" --uniform-bucket-level-access
done
# Browsers upload straight to the raw bucket, so it needs CORS. Media is served by media-service.
gcloud storage buckets update "gs://$RAW_BUCKET" --cors-file="$ROOT/infra/cors-raw.json"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --location="$REGION" --repository-format=docker

echo "==> JWT secret (Secret Manager)"
gcloud secrets describe "$SECRET" >/dev/null 2>&1 ||
  openssl rand -hex 32 | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic
SECRET_VERSION="projects/${PROJECT_ID}/secrets/${SECRET}/versions/latest"

echo "==> Service accounts"
for name in auth catalog order media gateway worker pubsub-push; do
  gcloud iam service-accounts describe "$(sa $name)" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "ams-$name" --display-name="artisan-ms $name"
done

# Firestore access is limited to this version's database with an IAM condition. Within it the
# three services share datastore.user; collection ownership is enforced in code.
DB_CONDITION="expression=resource.name==\"projects/${PROJECT_ID}/databases/${DATABASE}\",title=artisan-ms-db-only"
for name in auth catalog order; do
  retry gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$(sa $name)" \
    --role=roles/datastore.user --condition="$DB_CONDITION"
done
for name in auth catalog order; do
  retry gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$(sa $name)" --role=roles/secretmanager.secretAccessor
done
# catalog: create upload sessions and check uploads in the raw bucket.
retry gcloud storage buckets add-iam-policy-binding "gs://$RAW_BUCKET" --member="serviceAccount:$(sa catalog)" --role=roles/storage.objectAdmin
# media: read-only on the media bucket.
retry gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" --member="serviceAccount:$(sa media)" --role=roles/storage.objectViewer
# worker: read raw, write media, sign the raw-file URL for ffmpeg, publish events.
retry gcloud storage buckets add-iam-policy-binding "gs://$RAW_BUCKET" --member="serviceAccount:$(sa worker)" --role=roles/storage.objectViewer
retry gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" --member="serviceAccount:$(sa worker)" --role=roles/storage.objectAdmin
retry gcloud iam service-accounts add-iam-policy-binding "$(sa worker)" --member="serviceAccount:$(sa worker)" --role=roles/iam.serviceAccountTokenCreator
# Cloud Build runs as the default compute SA, which has no roles in orgs that disable the
# automatic Editor grant.
BUILD_SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
project_role "$BUILD_SA" roles/run.builder
project_role "$BUILD_SA" roles/artifactregistry.writer

echo "==> Pub/Sub topic"
gcloud pubsub topics describe "$TOPIC" >/dev/null 2>&1 || gcloud pubsub topics create "$TOPIC"
retry gcloud pubsub topics add-iam-policy-binding "$TOPIC" --member="serviceAccount:$(sa worker)" --role=roles/pubsub.publisher

echo "==> Web build for the gateway"
(cd "$ROOT/app" && npm install && CI=1 npx expo export -p web --output-dir dist-web)
find "$ROOT/backend/services/gateway/public" -mindepth 1 ! -name index.html -exec rm -rf {} +
cp -r "$ROOT/app/dist-web/." "$ROOT/backend/services/gateway/public/"

echo "==> Images"
build() { # dockerfile image
  gcloud builds submit "$ROOT/backend" --config "$ROOT/infra/cloudbuild.yaml" \
    --substitutions="_DOCKERFILE=$1,_IMAGE=$2"
}
for s in "${SERVICES[@]}"; do build "services/$s/Dockerfile" "$REGISTRY/$s:$TAG"; done
build worker/Dockerfile "$REGISTRY/transcoder:$TAG"

echo "==> Internal services (require Cloud Run invoker)"
deploy_internal() { # name sa env
  gcloud run deploy "$(svc "$1")" --image "$REGISTRY/$1:$TAG" --region "$REGION" --service-account "$(sa "$2")" \
    --no-allow-unauthenticated --cpu 1 --memory 512Mi --set-env-vars "$3"
}
COMMON="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,FIRESTORE_DATABASE=$DATABASE,JWT_SECRET_NAME=$SECRET_VERSION"
deploy_internal auth-service auth "$COMMON"
deploy_internal media-service media "MEDIA_BUCKET=$MEDIA_BUCKET"
deploy_internal catalog-service catalog \
  "$COMMON,REGION=$REGION,RAW_BUCKET=$RAW_BUCKET,TRANSCODER_MODE=job,TRANSCODE_JOB=$JOB"
CATALOG_URL="$(url_of catalog-service)"
deploy_internal order-service order "$COMMON,CATALOG_URL=$CATALOG_URL"

echo "==> Transcoder job"
gcloud run jobs deploy "$JOB" --image "$REGISTRY/transcoder:$TAG" --region "$REGION" \
  --service-account "$(sa worker)" --cpu 4 --memory 8Gi --task-timeout 3600 --max-retries 1 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,RAW_BUCKET=$RAW_BUCKET,MEDIA_BUCKET=$MEDIA_BUCKET,EVENTS_TOPIC=$TOPIC"
# catalog starts the job with env overrides and runs it as the worker SA.
retry gcloud run jobs add-iam-policy-binding "$JOB" --region "$REGION" --member="serviceAccount:$(sa catalog)" --role=roles/run.developer
retry gcloud iam service-accounts add-iam-policy-binding "$(sa worker)" --member="serviceAccount:$(sa catalog)" --role=roles/iam.serviceAccountUser

echo "==> Gateway (public)"
gcloud run deploy "$(svc gateway)" --image "$REGISTRY/gateway:$TAG" --region "$REGION" --service-account "$(sa gateway)" \
  --no-invoker-iam-check --cpu 1 --memory 512Mi \
  --set-env-vars "AUTH_URL=$(url_of auth-service),CATALOG_URL=$CATALOG_URL,ORDER_URL=$(url_of order-service),MEDIA_URL=$(url_of media-service)"

echo "==> Invoker permissions"
invoker() { retry gcloud run services add-iam-policy-binding "$(svc "$1")" --region "$REGION" --member="serviceAccount:$2" --role=roles/run.invoker; }
for s in auth-service catalog-service order-service media-service; do invoker "$s" "$(sa gateway)"; done
invoker catalog-service "$(sa order)"       # GET /internal/products/:id
invoker catalog-service "$(sa pubsub-push)" # POST /events/video

echo "==> Push subscription"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
# The Pub/Sub service agent mints the OIDC token for the push identity.
retry gcloud iam service-accounts add-iam-policy-binding "$(sa pubsub-push)" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
SUB_ARGS=(--push-endpoint="$CATALOG_URL/events/video" --push-auth-service-account="$(sa pubsub-push)"
  --push-auth-token-audience="$CATALOG_URL" --ack-deadline=60 --min-retry-delay=10s --max-retry-delay=600s)
if gcloud pubsub subscriptions describe "$SUBSCRIPTION" >/dev/null 2>&1; then
  gcloud pubsub subscriptions update "$SUBSCRIPTION" "${SUB_ARGS[@]}"
else
  gcloud pubsub subscriptions create "$SUBSCRIPTION" --topic="$TOPIC" "${SUB_ARGS[@]}"
fi

echo
echo "Deployed. Public URL: $(url_of gateway)"
