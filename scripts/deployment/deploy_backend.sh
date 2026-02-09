#!/usr/bin/env bash

set -euo pipefail

# Deploy Realtime Recruiter Assistant backend to Cloud Run

ENV_FILE="${ENV_FILE:-.env.deploy}"
PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-europe-west2}"
SERVICE_NAME="${SERVICE_NAME:-realtime-recruiter-backend}"
IMAGE_REPO="${IMAGE_REPO:-gcr.io}"

# Load env vars from file if present (optional)
if [ -f "$ENV_FILE" ]; then
  echo "📄 Loading env vars from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ PROJECT_ID is required. Example: export PROJECT_ID='my-gcp-project'"
  exit 1
fi

if ! command -v gcloud &> /dev/null; then
  echo "❌ gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Ensure we are in repo root
if [ ! -d "backend" ]; then
  echo "❌ backend directory not found. Run this script from the repo root."
  exit 1
fi

# Required configuration
REQUIRED_VARS=("SECRET_KEY" "OPENAI_API_KEY" "GCS_BUCKET")

# Optional configuration
ACCESS_TOKEN_EXPIRE_MINUTES="${ACCESS_TOKEN_EXPIRE_MINUTES:-120}"
REFRESH_TOKEN_DAYS="${REFRESH_TOKEN_DAYS:-30}"
REALTIME_MODEL="${REALTIME_MODEL:-gpt-4o-transcribe}"
ACTION_MODEL="${ACTION_MODEL:-gpt-4o-mini}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-text-embedding-3-small}"
ALLOWED_ORIGINS_RAW="${ALLOWED_ORIGINS:-}"
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-}"
DATABASE_USER="${DATABASE_USER:-postgres}"
DATABASE_NAME="${DATABASE_NAME:-postgres}"

# Convert ALLOWED_ORIGINS to JSON array for backend parsing (optional)
ALLOWED_ORIGINS=""
if [ -n "$ALLOWED_ORIGINS_RAW" ]; then
  if [[ "$ALLOWED_ORIGINS_RAW" =~ ^[[:space:]]*\[ ]]; then
    ALLOWED_ORIGINS="$ALLOWED_ORIGINS_RAW"
  else
    if command -v python3 >/dev/null 2>&1; then
      ALLOWED_ORIGINS="$(python3 - <<'PY'
import json, os
raw = os.environ.get("ALLOWED_ORIGINS_RAW", "")
origins = [o.strip() for o in raw.split(",") if o.strip()]
print(json.dumps(origins, separators=(",", ":")))
PY
)"
    else
      IFS=',' read -r -a _origins <<< "${ALLOWED_ORIGINS_RAW}"
      _json="["
      for o in "${_origins[@]}"; do
        o="$(echo "$o" | xargs)"
        [ -z "$o" ] && continue
        [ "$_json" != "[" ] && _json+=","
        _json+="\"$o\""
      done
      _json+="]"
      ALLOWED_ORIGINS="$_json"
    fi
  fi
fi

# Secret Manager support
check_secret_exists() {
  local secret_name=$1
  gcloud secrets describe "$secret_name" --project="${PROJECT_ID}" &> /dev/null
}

USE_SECRET_MANAGER=false
SECRET_NAMES=()

for secret in "${REQUIRED_VARS[@]}"; do
  if check_secret_exists "$secret"; then
    SECRET_NAMES+=("$secret")
    USE_SECRET_MANAGER=true
  fi
done

# Optional DB secrets
if check_secret_exists "DATABASE_URL"; then
  SECRET_NAMES+=("DATABASE_URL")
  USE_SECRET_MANAGER=true
fi
if check_secret_exists "DATABASE_PASSWORD"; then
  SECRET_NAMES+=("DATABASE_PASSWORD")
  USE_SECRET_MANAGER=true
fi

# Validate required secrets/vars
MISSING=()
for secret in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!secret:-}" ] && [[ ! " ${SECRET_NAMES[*]} " =~ " ${secret} " ]]; then
    MISSING+=("$secret")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing required configuration: ${MISSING[*]}"
  echo "   Provide env vars or create secrets in Secret Manager."
  exit 1
fi

# Resolve DATABASE_URL if not provided
if [ -z "${DATABASE_URL:-}" ]; then
  if [[ " ${SECRET_NAMES[*]} " =~ " DATABASE_URL " ]]; then
    : # DATABASE_URL will be provided via Secret Manager
  elif [ -n "${DATABASE_PASSWORD:-}" ] && [ -n "${CLOUDSQL_INSTANCE:-}" ]; then
    DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@/${DATABASE_NAME}?host=/cloudsql/${CLOUDSQL_INSTANCE}"
  elif [[ " ${SECRET_NAMES[*]} " =~ " DATABASE_PASSWORD " ]] && [ -n "${CLOUDSQL_INSTANCE:-}" ]; then
    # DATABASE_PASSWORD will be resolved by Secret Manager at runtime; construct URL with placeholder
    DATABASE_URL="postgresql://${DATABASE_USER}:\${DATABASE_PASSWORD}@/${DATABASE_NAME}?host=/cloudsql/${CLOUDSQL_INSTANCE}"
  else
    echo "❌ DATABASE_URL not set and cannot be constructed."
    echo "   Provide DATABASE_URL, or set CLOUDSQL_INSTANCE + DATABASE_PASSWORD."
    exit 1
  fi
fi

echo "🚀 Deploying backend to Cloud Run..."
echo "   Project: ${PROJECT_ID}"
echo "   Region:  ${REGION}"
echo "   Service: ${SERVICE_NAME}"

IMAGE="${IMAGE_REPO}/${PROJECT_ID}/${SERVICE_NAME}"

echo "🏗️ Building container image..."
gcloud builds submit backend --tag "${IMAGE}" --project="${PROJECT_ID}"

# Build env vars (non-secret)
ENV_VARS=(
  "ENVIRONMENT=production"
  "LOG_LEVEL=INFO"
  "ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES}"
  "REFRESH_TOKEN_DAYS=${REFRESH_TOKEN_DAYS}"
  "REALTIME_MODEL=${REALTIME_MODEL}"
  "ACTION_MODEL=${ACTION_MODEL}"
  "EMBEDDING_MODEL=${EMBEDDING_MODEL}"
  "GCP_PROJECT=${PROJECT_ID}"
  "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
)

if [ -n "$ALLOWED_ORIGINS" ]; then
  ENV_VARS+=("ALLOWED_ORIGINS=${ALLOWED_ORIGINS}")
fi

if [ "$USE_SECRET_MANAGER" = true ]; then
  echo "🔐 Using Secret Manager references"
  SECRET_ARGS=()
  for name in "${SECRET_NAMES[@]}"; do
    SECRET_ARGS+=("${name}=${name}:latest")
  done

  # Add any required vars not in Secret Manager (fallback)
  for name in "${REQUIRED_VARS[@]}"; do
    if [[ ! " ${SECRET_NAMES[*]} " =~ " ${name} " ]]; then
      ENV_VARS+=("${name}=${!name}")
    fi
  done

  if [[ ! " ${SECRET_NAMES[*]} " =~ " DATABASE_URL " ]]; then
    ENV_VARS+=("DATABASE_URL=${DATABASE_URL}")
  fi

  ENV_VARS_STR="^|^$(IFS='|' ; echo "${ENV_VARS[*]}")"
  SECRET_ARGS_STR="^|^$(IFS='|' ; echo "${SECRET_ARGS[*]}")"

  CLOUDSQL_FLAG=()
  if [ -n "${CLOUDSQL_INSTANCE:-}" ]; then
    CLOUDSQL_FLAG=(--add-cloudsql-instances "${CLOUDSQL_INSTANCE}")
  fi

  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE}" \
    --platform managed \
    --region "${REGION}" \
    --allow-unauthenticated \
    --port 8000 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 10 \
    --timeout 300 \
    --concurrency 80 \
    --set-env-vars "${ENV_VARS_STR}" \
    --set-secrets "${SECRET_ARGS_STR}" \
    "${CLOUDSQL_FLAG[@]}" \
    --project "${PROJECT_ID}"
else
  echo "🔐 Using environment variables for secrets"
  ENV_VARS+=(
    "SECRET_KEY=${SECRET_KEY}"
    "OPENAI_API_KEY=${OPENAI_API_KEY}"
    "GCS_BUCKET=${GCS_BUCKET}"
    "DATABASE_URL=${DATABASE_URL}"
  )

  ENV_VARS_STR="^|^$(IFS='|' ; echo "${ENV_VARS[*]}")"

  CLOUDSQL_FLAG=()
  if [ -n "${CLOUDSQL_INSTANCE:-}" ]; then
    CLOUDSQL_FLAG=(--add-cloudsql-instances "${CLOUDSQL_INSTANCE}")
  fi

  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE}" \
    --platform managed \
    --region "${REGION}" \
    --allow-unauthenticated \
    --port 8000 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 10 \
    --timeout 300 \
    --concurrency 80 \
    --set-env-vars "${ENV_VARS_STR}" \
    "${CLOUDSQL_FLAG[@]}" \
    --project "${PROJECT_ID}"
fi

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="value(status.url)")
echo "✅ Backend deployed: ${SERVICE_URL}"

echo "🧪 Checking health endpoint..."
if command -v curl &> /dev/null; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "✅ Health check passed"
  else
    echo "⚠️ Health check returned ${STATUS}"
  fi
else
  echo "ℹ️ curl not available; skipping health check"
fi
