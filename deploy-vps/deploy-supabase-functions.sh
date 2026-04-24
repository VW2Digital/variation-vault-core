#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

PROJECT_REF="${SUPABASE_PROJECT_REF:-${1:-}}"
APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="$APP_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed -E 's/^([^=]+)=(.*)$/\1="\2"/' | sed -E 's/="(.*)"$/=\1/' | sed -E 's/^([^=]+)=(.*)$/\1="\2"/')
  set +a
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-${VITE_SUPABASE_PROJECT_ID:-${PROJECT_REF}}}"

if [[ -z "$PROJECT_REF" ]]; then
  err "Informe o project ref: SUPABASE_PROJECT_REF=xxxx bash deploy-vps/deploy-supabase-functions.sh"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  err "Supabase CLI não encontrada. Instale com: npm i -g supabase"
  exit 1
fi

step "Linkando projeto $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"

if [[ -f "$ENV_FILE" ]]; then
  step "Enviando secrets do .env local para o projeto $PROJECT_REF"
  SECRET_ARGS=()
  for key in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL DATABASE_URL RESEND_API_KEY MP_WEBHOOK_SECRET; do
    value="${!key:-}"
    [[ -n "$value" ]] && SECRET_ARGS+=("$key=$value")
  done
  if [[ "${#SECRET_ARGS[@]}" -gt 0 ]]; then
    supabase secrets set --project-ref "$PROJECT_REF" "${SECRET_ARGS[@]}"
  fi
fi

step "Deployando Edge Functions versionadas"
FUNCTIONS=(
  admin-users
  asaas-checkout
  asaas-webhook
  backup-csv
  backup-weekly-email
  cart-abandonment
  evolution-send-message
  melhor-envio-oauth
  melhor-envio-shipment
  melhor-envio-webhook
  mercadopago-webhook
  notify-payment-failure
  orders-api
  production-router
  pagarme-webhook
  pagarme-webhooks-admin
  pagbank-webhook
  payment-checkout
  trigger-deploy
  webhook-healthcheck
)

for fn in "${FUNCTIONS[@]}"; do
  echo "  - $fn"
  supabase functions deploy "$fn"
done

ok "Todas as Edge Functions foram deployadas no projeto $PROJECT_REF"
echo ""
echo "Próximo passo: configurar os secrets com 'supabase secrets set ...' e cadastrar os webhooks nos gateways."