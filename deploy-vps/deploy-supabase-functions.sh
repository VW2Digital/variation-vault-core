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