#!/usr/bin/env bash
# Single gate for local runs and CI: every step must pass, in this order.
# Touches no live AWS resources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Keep every step on the in-memory store and away from any real AWS account.
export USE_LOCAL_STORAGE=true
export NEXT_TELEMETRY_DISABLED=1
unset AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

step() { printf '\n==> %s\n' "$1"; }

command -v terraform >/dev/null 2>&1 || {
  echo "verify.sh: terraform is not installed (https://developer.hashicorp.com/terraform/install)" >&2
  exit 1
}

cd "$ROOT/frontend"
step "npm ci";            npm ci
step "TypeScript";        npx tsc --noEmit
step "ESLint";            npm run lint
step "Unit tests";        npm test
step "Production build";  npm run build
step "End-to-end tests";  npm run test:e2e

cd "$ROOT/infra/terraform"
step "terraform fmt";      terraform fmt -check -recursive
step "terraform init";     terraform init -backend=false -input=false
step "terraform validate"; terraform validate

printf '\nAll checks passed.\n'
