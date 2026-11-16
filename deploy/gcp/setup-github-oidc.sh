#!/usr/bin/env bash
# One-time setup (run by a project admin, after the first ./deploy.sh) that lets
# GitHub Actions deploy through OIDC, with no stored keys. See README.md.
# Safe to re-run.
#
#   ./setup-github-oidc.sh [--env NAME] [OWNER/REPO]   # default repo: from the git remote
#
# --env NAME reads config.NAME.env instead of config.env, so each environment
# gets its own service account, provider and permissions. If the config sets
# GITHUB_ENVIRONMENT (e.g. production), the provider also requires the job to run
# in that GitHub Environment, where you can require a manual approval.
#
# What it creates, and nothing else:
#   - a service account, $SERVICE-deploy, that the workflow impersonates
#   - a workload identity pool + provider that trust GitHub tokens ONLY from
#     this repository's main branch (pull requests and forks can't deploy)
#   - three narrow permissions for that service account, each on one resource:
#       roles/artifactregistry.writer  on the app's image repository only
#       roles/run.developer            on the app's Cloud Run service only
#       roles/iam.serviceAccountUser   on the app's runtime service account only
#   - if the config sets PROMOTE_FROM_SERVICE (production: the dev service), two
#     read-only permissions on that service, so the deploy can find the image dev
#     serves and copy it into this environment's repository:
#       roles/artifactregistry.reader  on its image repository only
#       roles/run.viewer               on its Cloud Run service only
#
# It gets NO access to secrets, to IAM policies, to other services or to the
# project as a whole. It can't create the service or change who may call it:
# that stays with ./deploy.sh. The deploy workflow only swaps the image.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_NAME=""
if [[ "${1:-}" == "--env" ]]; then ENV_NAME="${2:?--env needs a name, e.g. prod}"; shift 2; fi
CONFIG="$HERE/config${ENV_NAME:+.$ENV_NAME}.env"
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG" >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG"
: "${PROJECT_ID:?Set PROJECT_ID in config.env}"
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-appointment-matchmaker}"

REPO="${1:-$(git -C "$ROOT" remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Usage: $0 OWNER/REPO" >&2; exit 2; }

# One pool per environment: the grant below matches every token of a pool, so a
# shared pool would let one environment's pipeline impersonate the other's deployer.
POOL="${OIDC_POOL:-github}"
PROVIDER="${OIDC_PROVIDER:-github-actions}"
DEPLOYER_NAME="${DEPLOYER_SA_NAME:-${SERVICE:0:21}-deploy}"   # service account IDs are at most 30 characters
DEPLOYER="$DEPLOYER_NAME@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME_SA="${RUNTIME_SA_NAME:-${SERVICE:0:26}-run}@$PROJECT_ID.iam.gserviceaccount.com"

g() { gcloud --project="$PROJECT_ID" --quiet "$@"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

PROJECT_NUMBER="$(g projects describe "$PROJECT_ID" --format='value(projectNumber)')"

step "Enabling the APIs workload identity federation needs"
g services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

step "Deployer service account $DEPLOYER"
g iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1 \
  || g iam service-accounts create "$DEPLOYER_NAME" --display-name="$SERVICE (GitHub Actions deploy)"

step "Workload identity pool and provider (GitHub, $REPO, main branch only)"
g iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 \
  || g iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
CONDITION="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"
if [[ -n "${GITHUB_ENVIRONMENT:-}" ]]; then CONDITION+=" && assertion.environment == '$GITHUB_ENVIRONMENT'"; fi
PROVIDER_ARGS=(--location=global --workload-identity-pool="$POOL"
  --issuer-uri="https://token.actions.githubusercontent.com"
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"
  --attribute-condition="$CONDITION")
if g iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  g iam workload-identity-pools providers update-oidc "$PROVIDER" "${PROVIDER_ARGS[@]}"
else
  g iam workload-identity-pools providers create-oidc "$PROVIDER" "${PROVIDER_ARGS[@]}" --display-name="GitHub Actions"
fi

step "Letting tokens from $REPO impersonate the deployer"
g iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" >/dev/null

step "Granting the deployer its three narrow permissions"
MEMBER="serviceAccount:$DEPLOYER"
g artifacts repositories add-iam-policy-binding "$SERVICE" --location="$REGION" \
  --member="$MEMBER" --role=roles/artifactregistry.writer >/dev/null
g run services add-iam-policy-binding "$SERVICE" --region="$REGION" \
  --member="$MEMBER" --role=roles/run.developer >/dev/null
g iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="$MEMBER" --role=roles/iam.serviceAccountUser >/dev/null

SOURCE_SERVICE="${PROMOTE_FROM_SERVICE:-}"
if [[ -n "$SOURCE_SERVICE" ]]; then
  step "Letting the deployer read the image dev serves ($SOURCE_SERVICE)"
  g artifacts repositories add-iam-policy-binding "$SOURCE_SERVICE" --location="$REGION" \
    --member="$MEMBER" --role=roles/artifactregistry.reader >/dev/null
  g run services add-iam-policy-binding "$SOURCE_SERVICE" --region="$REGION" \
    --member="$MEMBER" --role=roles/run.viewer >/dev/null
fi

if [[ -n "${GITHUB_ENVIRONMENT:-}" ]]; then
  step "Done. Add these as variables of the GitHub Environment '$GITHUB_ENVIRONMENT' (Settings → Environments → $GITHUB_ENVIRONMENT → Environment variables):"
else
  step "Done. Add these as GitHub repository variables (Settings → Secrets and variables → Actions → Variables):"
fi
cat <<OUT
  GCP_PROJECT_ID                 $PROJECT_ID
  GCP_REGION                     $REGION
  GCP_SERVICE                    $SERVICE
  GCP_WORKLOAD_IDENTITY_PROVIDER projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
  GCP_DEPLOYER_SERVICE_ACCOUNT   $DEPLOYER
OUT
if [[ -n "$SOURCE_SERVICE" ]]; then echo "  GCP_SOURCE_SERVICE             $SOURCE_SERVICE"; fi
