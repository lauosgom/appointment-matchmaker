#!/usr/bin/env bash
# Waits until BASE_URL/api/health answers 200 with {"status":"ok"} (the app is up
# and can reach its database). Exits 1 otherwise.
#   ./check-health.sh https://appointment-matchmaker-….run.app [tries]
set -uo pipefail
URL="${1:?Usage: $0 BASE_URL [tries]}"; TRIES="${2:-30}"
for i in $(seq 1 "$TRIES"); do
  body="$(curl -s -m 20 -w '\n%{http_code}' "${URL%/}/api/health" || true)"
  code="${body##*$'\n'}"
  if [[ "$code" == 200 && "$body" == *'"status":"ok"'* ]]; then echo "Healthy: ${URL%/}/api/health -> 200"; exit 0; fi
  echo "Not healthy yet ($i/$TRIES): HTTP '${code}'"; sleep 4
done
echo "Health check failed for ${URL%/}/api/health" >&2
exit 1
