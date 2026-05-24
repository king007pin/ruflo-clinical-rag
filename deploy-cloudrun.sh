#!/bin/bash
# Deploy Mediq to Google Cloud Run
# Usage: ./deploy-cloudrun.sh
# Prerequisites:
#   - gcloud CLI installed + authenticated (gcloud auth login)
#   - Secret Manager secrets created (see SECRETS list below) and the Cloud
#     Run runtime service account granted roles/secretmanager.secretAccessor.
#
# W12: secrets are mounted from Secret Manager (--set-secrets) instead of
# baked into the revision via --set-env-vars. Previous behaviour persisted
# every secret value in Cloud Run revision metadata, gcloud audit logs, and
# local shell history. With --set-secrets, only secret *references* land in
# revision metadata; values are fetched at boot from Secret Manager.

set -euo pipefail

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE="mediq"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}"

echo "Project: ${PROJECT_ID}"
echo "Image:   ${IMAGE}"
echo "Region:  ${REGION}"

# Each entry: ENV_VAR_NAME=secret-resource-name. Add new vars here, never
# inline values. Run once per project:
#   echo -n "<value>" | gcloud secrets create mediq-database-url --data-file=-
SECRETS=(
  "DATABASE_URL=mediq-database-url:latest"
  "NVIDIA_API_KEY=mediq-nvidia-api-key:latest"
  "APP_PASSWORD=mediq-app-password:latest"
  "APP_SECRET_KEY=mediq-app-secret-key:latest"
  "APP_PHI_KEK=mediq-app-phi-kek:latest"
  "AUTH_SECRET=mediq-auth-secret:latest"
  "JWT_SECRET=mediq-jwt-secret:latest"
  "CRON_SECRET=mediq-cron-secret:latest"
  "RIVESTACK_DATABASE_URL=mediq-rivestack-database-url:latest"
  "NCBI_API_KEY=mediq-ncbi-api-key:latest"
)
SECRETS_FLAG=$(IFS=, ; echo "${SECRETS[*]}")

# Build and push image.
gcloud builds submit --tag "${IMAGE}" .

# Deploy to Cloud Run.
# NOTE: --allow-unauthenticated keeps the service publicly reachable so the
# Next.js middleware enforces the cookie gate. Front with IAP, Cloud Endpoints,
# or Cloud Armor before any production rollout.
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --min-instances 1 \
  --max-instances 5 \
  --set-secrets "${SECRETS_FLAG}"

echo ""
echo "Deployed. URL:"
gcloud run services describe "${SERVICE}" --region "${REGION}" --format "value(status.url)"
