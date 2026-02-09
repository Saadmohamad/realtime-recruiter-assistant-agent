#!/usr/bin/env bash

set -euo pipefail

# Deploy Realtime Recruiter Assistant frontend to Firebase Hosting
# Inspired by medical_note_taker_eng deployment scripts

ENV_FILE="${ENV_FILE:-.env.deploy}"
FRONTEND_DIR="frontend"

# Load env vars from file if present (optional)
if [ -f "$ENV_FILE" ]; then
  echo "📄 Loading env vars from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# Set variables after loading env file
FIREBASE_PROJECT="${FIREBASE_PROJECT:-}"
API_URL="${REACT_APP_API_URL:-}"
HOSTING_URL="${HOSTING_URL:-}"

if [ -z "$FIREBASE_PROJECT" ]; then
  echo "❌ FIREBASE_PROJECT is required. Example: export FIREBASE_PROJECT='my-firebase-project'"
  exit 1
fi

if [ -z "$API_URL" ]; then
  echo "❌ REACT_APP_API_URL is required. Example: export REACT_APP_API_URL='https://your-backend.run.app'"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ frontend directory not found. Run this script from the repo root."
  exit 1
fi

if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
  exit 1
fi

echo "🚀 Deploying frontend to Firebase Hosting..."
echo "   Project: ${FIREBASE_PROJECT}"
echo "   API URL: ${API_URL}"

cd "$FRONTEND_DIR"

if [ ! -f "package.json" ]; then
  echo "❌ package.json not found in frontend directory"
  exit 1
fi

if [ ! -f "firebase.json" ]; then
  echo "❌ firebase.json not found in frontend directory"
  exit 1
fi

echo "🔧 Writing production env file..."
cat > .env.production.local << EOF
REACT_APP_API_URL=${API_URL}
REACT_APP_ENVIRONMENT=production
REACT_APP_DEBUG=false
EOF

echo "📦 Installing dependencies..."
npm install

echo "🏗️ Building production bundle..."
REACT_APP_API_URL=${API_URL} npm run build

echo "🚀 Deploying to Firebase Hosting..."
firebase deploy --only hosting --project "${FIREBASE_PROJECT}" --message "Deploy $(date)"

rm -f .env.production.local

if [ -n "$HOSTING_URL" ]; then
  echo "✅ Frontend deployed: ${HOSTING_URL}"
else
  echo "✅ Frontend deployed. Check Firebase console for hosting URL."
fi

cd ..
