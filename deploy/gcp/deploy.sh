#!/usr/bin/env bash
# Deploys the app to Google Cloud Run in an existing project. See README.md.
# Safe to re-run: every step checks what already exists.
#
#   ./deploy.sh                    # build, push and deploy the current code (dev: config.env)
#   ./deploy.sh --env prod         # the same for another environment (config.prod.env)
#   ./deploy.sh --update-secrets   # also replace the stored database URL / SMTP key
#
# Everything it creates is named after $SERVICE and labelled app=$SERVICE, and
# it never changes your gcloud default project.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
UPDATE_SECRETS=false
ENV_NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --update-secrets) UPDATE_SECRETS=true; shift ;;
    --env) ENV_NAME="${2:?--env needs a name, e.g. prod}"; shift 2 ;;
    *) echo "Usage: $0 [--env NAME] [--update-secrets]" >&2; exit 2 ;;
  esac
done

CONFIG="$HERE/config${ENV_NAME:+.$ENV_NAME}.env"
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG (copy config.env.example)." >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG"

: "${PROJECT_ID:?Set PROJECT_ID in config.env}"
SMTP_USERNAME="${SMTP_USERNAME:-}"
MAIL_FROM="${MAIL_FROM:-}"
# Without SMTP_USERNAME there is no email service: no emails are sent and the
# password-recovery page shows the reset link itself (INSECURE, see README).
EMAIL=true; [[ -n "$SMTP_USERNAME" ]] || EMAIL=false
if [[ "$EMAIL" == true ]]; then : "${MAIL_FROM:?Set MAIL_FROM in config.env}"; fi
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-appointment-matchmaker}"
SMTP_HOST="${SMTP_HOST:-smtp-relay.brevo.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_SECURITY="${SMTP_SECURITY:-starttls}"

LABEL="app=$SERVICE"
SA_NAME="${RUNTIME_SA_NAME:-${SERVICE:0:26}-run}"   # service account IDs are at most 30 characters
SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
SECRET_DB="$SERVICE-database-url"
SECRET_SMTP="$SERVICE-smtp-password"
REGISTRY="$REGION-docker.pkg.dev"
# Same YYYYMMDD-HHMMSS-shortsha tag as CI. A "-dirty" suffix marks uncommitted
# changes, and makes the production promotion refuse the image.
TAG="$(date -u +%Y%m%d-%H%M%S)-$(git -C "$ROOT" rev-parse --short=7 HEAD)"
git -C "$ROOT" diff --quiet HEAD || TAG="$TAG-dirty"
IMAGE="$REGISTRY/$PROJECT_ID/$SERVICE/app:$TAG"

g() { gcloud --project="$PROJECT_ID" --quiet "$@"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "Checking gcloud login, project and billing"
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
  || { echo "Not logged in. Run: gcloud auth login" >&2; exit 1; }
g projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null
[[ "$(g billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)" == "True" ]] \
  || { echo "Billing isn't enabled on $PROJECT_ID (Cloud Run needs it even within the free tier)." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required to build the image." >&2; exit 1; }

step "Enabling APIs (no-op if already enabled)"
g services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

step "Artifact Registry repository $SERVICE (keeps the 3 newest images, inside the free 0.5 GB)"
if ! g artifacts repositories describe "$SERVICE" --location="$REGION" >/dev/null 2>&1; then
  g artifacts repositories create "$SERVICE" --repository-format=docker --location="$REGION" \
    --description="Images of $SERVICE" --labels="$LABEL"
fi
g artifacts repositories set-cleanup-policies "$SERVICE" --location="$REGION" \
  --policy="$HERE/cleanup-policy.json" --no-dry-run >/dev/null

step "Service account $SA"
if ! g iam service-accounts describe "$SA" >/dev/null 2>&1; then
  g iam service-accounts create "$SA_NAME" --display-name="$SERVICE (Cloud Run)"
fi

ensure_secret() { # name, prompt, [value: used instead of asking]
  local name="$1" prompt="$2" value="${3:-}"
  if g secrets describe "$name" >/dev/null 2>&1 && [[ "$UPDATE_SECRETS" == false ]]; then
    echo "Secret $name already exists (run with --update-secrets to replace it)."
  else
    if [[ -n "$value" ]]; then
      echo "$prompt: taken from $NEON_ENV_FILE"
    else
      read -r -s -p "$prompt: " value; echo
    fi
    [[ -n "$value" ]] || { echo "Empty value." >&2; exit 1; }
    if g secrets describe "$name" >/dev/null 2>&1; then
      printf '%s' "$value" | g secrets versions add "$name" --data-file=-
    else
      printf '%s' "$value" | g secrets create "$name" --replication-policy=automatic --labels="$LABEL" --data-file=-
    fi
  fi
  # Only this app's service account can read its secrets.
  g secrets add-iam-policy-binding "$name" --member="serviceAccount:$SA" \
    --role=roles/secretmanager.secretAccessor >/dev/null
}

# The direct (unpooled) Neon connection string written by `neon init` to
# .env.local at the repo root; the app keeps its own connection pool.
NEON_URL=""
NEON_ENV_FILE="${NEON_ENV_FILE:-.env.local}"
if [[ -f "$ROOT/$NEON_ENV_FILE" ]]; then
  NEON_URL="$(sed -n 's/^DATABASE_URL_UNPOOLED=//p' "$ROOT/$NEON_ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
fi

step "Secrets"
ensure_secret "$SECRET_DB" "Neon connection string (postgresql://…)" "$NEON_URL"
if [[ "$EMAIL" == true ]]; then ensure_secret "$SECRET_SMTP" "Brevo SMTP key"; fi

step "Building and pushing $IMAGE"
gcloud auth configure-docker "$REGISTRY" --quiet >/dev/null
docker build --platform linux/amd64 --build-arg APP_VERSION="$(date -u +%Y%m%d-%H%M%S)-$(git -C "$ROOT" rev-parse --short=7 HEAD)" -t "$IMAGE" "$ROOT"
docker push "$IMAGE"

if [[ -z "${APP_BASE_URL:-}" ]]; then
  # Cloud Run's deterministic address: https://SERVICE-PROJECT_NUMBER.REGION.run.app
  APP_BASE_URL="https://$SERVICE-$(g projects describe "$PROJECT_ID" --format='value(projectNumber)').$REGION.run.app"
fi

# Same names as the GitHub Environments the CI deploys use (dev, production).
ENV_VARS=("SEED_DEMO_DATA=false" "APP_BASE_URL=$APP_BASE_URL" "APP_ENV=$([[ "$ENV_NAME" == prod ]] && echo production || echo "${ENV_NAME:-dev}")")
if [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]]; then ENV_VARS+=("OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT"); fi
SECRETS_ARG="DATABASE_URL=$SECRET_DB:latest"
if [[ "$EMAIL" == true ]]; then
  ENV_VARS+=("MAIL_SEND_INLINE=true" "SMTP_HOST=$SMTP_HOST" "SMTP_PORT=$SMTP_PORT"
             "SMTP_SECURITY=$SMTP_SECURITY" "SMTP_USERNAME=$SMTP_USERNAME" "MAIL_FROM=$MAIL_FROM")
  SECRETS_ARG+=",SMTP_PASSWORD=$SECRET_SMTP:latest"
else
  step "No SMTP_USERNAME: deploying WITHOUT email; the reset link is shown on the recovery page"
  ENV_VARS+=("RESET_LINK_IN_RESPONSE=true")
fi
# "^|^" makes "|" the separator: values contain spaces, commas and "@".
ENV_ARG="^|^$(IFS='|'; echo "${ENV_VARS[*]}")"

step "Deploying Cloud Run service $SERVICE in $REGION"
# --cpu-throttling = request-based billing (CPU only while answering), which is
# what the free tier covers. Scales to zero when idle; at most 2 instances so a
# traffic spike can't run up a bill.
g run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --port=8000 \
  --service-account="$SA" \
  --allow-unauthenticated \
  --cpu=1 --memory=512Mi --cpu-throttling \
  --min-instances=0 --max-instances=2 --concurrency=40 --timeout=60 \
  --labels="$LABEL" \
  --set-env-vars="$ENV_ARG" \
  --set-secrets="$SECRETS_ARG"

step "Checking the app is healthy"
"$HERE/check-health.sh" "$APP_BASE_URL" 30 || echo "Warning: the health check failed. Check the logs." >&2

step "Done"
echo "App:  $APP_BASE_URL"
echo "Logs: gcloud run services logs read $SERVICE --project=$PROJECT_ID --region=$REGION"
