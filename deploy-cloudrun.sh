#!/bin/bash
# Deploy Mediq to Google Cloud Run
# Usage: ./deploy-cloudrun.sh
# Prerequisites: gcloud CLI installed + authenticated (gcloud auth login)

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE="mediq"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}"

echo "Project: ${PROJECT_ID}"
echo "Image:   ${IMAGE}"
echo "Region:  ${REGION}"

# Build and push image
gcloud builds submit --tag "${IMAGE}" .

# Deploy to Cloud Run
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
  --set-env-vars "\
DATABASE_URL=${DATABASE_URL},\
NVIDIA_API_KEY=${NVIDIA_API_KEY},\
APP_PASSWORD=${APP_PASSWORD},\
APP_SECRET_KEY=${APP_SECRET_KEY},\
AUTH_SECRET=${AUTH_SECRET},\
CRON_SECRET=${CRON_SECRET},\
RIVESTACK_DATABASE_URL=${RIVESTACK_DATABASE_URL},\
NCBI_API_KEY=${NCBI_API_KEY}"

echo ""
echo "Deployed. URL:"
gcloud run services describe "${SERVICE}" --region "${REGION}" --format "value(status.url)"
