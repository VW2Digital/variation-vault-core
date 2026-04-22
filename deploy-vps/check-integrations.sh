#!/bin/bash
# ============================================================
# Script de validação pós-deploy
# Verifica se todas as integrações críticas estão acessíveis
# ============================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILED=$((FAILED+1)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

FAILED=0

echo ""
echo "============================================================"
echo "  VALIDAÇÃO PÓS-DEPLOY - Verificando integrações"
echo "============================================================"
echo ""

# ------------------------------------------------------------
# 1. Carregar .env
# ------------------------------------------------------------
ENV_FILE="${ENV_FILE:-/opt/loja/.env}"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$(dirname "$0")/../.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  fail ".env não encontrado em $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
ok ".env carregado de $ENV_FILE"

# ------------------------------------------------------------
# 2. Validar variáveis obrigatórias
# ------------------------------------------------------------
echo ""
info "Verificando variáveis de ambiente..."

for var in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID; do
  if [ -z "${!var}" ]; then
    fail "$var não definida"
  else
    ok "$var definida"
  fi
done

SUPABASE_URL_CLEAN="${VITE_SUPABASE_URL%/}"

# ------------------------------------------------------------
# 3. Testar endpoints de Edge Functions (webhooks)
# ------------------------------------------------------------
echo ""
info "Testando endpoints de webhooks no Supabase..."

WEBHOOKS=(
  "mercadopago-webhook"
  "pagarme-webhook"
  "pagbank-webhook"
  "asaas-webhook"
  "melhor-envio-webhook"
  "payment-checkout"
  "orders-api"
  "send-email"
  "email-events"
)

for fn in "${WEBHOOKS[@]}"; do
  URL="$SUPABASE_URL_CLEAN/functions/v1/$fn"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$URL" --max-time 10 || echo "000")

  if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
    ok "$fn → HTTP $STATUS (acessível)"
  elif [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
    ok "$fn → HTTP $STATUS (deployada, exige auth)"
  elif [ "$STATUS" = "404" ]; then
    fail "$fn → HTTP 404 (function NÃO deployada no Supabase)"
  else
    warn "$fn → HTTP $STATUS"
  fi
done

# ------------------------------------------------------------
# 4. Testar frontend (VPS)
# ------------------------------------------------------------
if [ -n "$SERVER_NAME" ]; then
  echo ""
  info "Testando frontend em https://$SERVER_NAME ..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$SERVER_NAME" --max-time 10 || echo "000")
  if [ "$STATUS" = "200" ]; then
    ok "Frontend respondendo (HTTP 200)"
  else
    fail "Frontend retornou HTTP $STATUS"
  fi

  # SSL
  if echo | openssl s_client -servername "$SERVER_NAME" -connect "$SERVER_NAME":443 2>/dev/null \
     | openssl x509 -noout -dates >/dev/null 2>&1; then
    ok "Certificado SSL válido"
  else
    fail "SSL inválido ou ausente"
  fi
else
  warn "SERVER_NAME não definido — pulando teste de frontend"
fi

# ------------------------------------------------------------
# 5. Validar Nginx
# ------------------------------------------------------------
echo ""
info "Verificando Nginx..."
if command -v nginx >/dev/null 2>&1; then
  if sudo nginx -t 2>/dev/null; then
    ok "Configuração Nginx válida"
  else
    fail "Nginx config inválida (rode: sudo nginx -t)"
  fi
else
  warn "Nginx não instalado (ok se VPS apenas serve build)"
fi

# ------------------------------------------------------------
# 6. Validar build
# ------------------------------------------------------------
echo ""
info "Verificando build do frontend..."
DIST_DIR="$(dirname "$ENV_FILE")/dist"
if [ -d "$DIST_DIR" ] && [ -f "$DIST_DIR/index.html" ]; then
  ok "Build encontrado em $DIST_DIR"
else
  fail "Build ausente — rode 'npm run build'"
fi

# ------------------------------------------------------------
# Resultado
# ------------------------------------------------------------
echo ""
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ Todas as verificações passaram${NC}"
  echo ""
  echo "Próximos passos manuais (1 vez só):"
  echo "  1. Cadastrar URLs de webhook nos painéis dos gateways"
  echo "     (veja README-PRODUCAO.md seção 4)"
  echo "  2. Conectar Melhor Envio em /admin/configuracoes/logistica"
  echo "  3. Configurar tokens de gateway em /admin/configuracoes/pagamentos"
  exit 0
else
  echo -e "${RED}✗ $FAILED verificação(ões) falharam${NC}"
  echo "  Consulte README-PRODUCAO.md seção 8 (Troubleshooting)"
  exit 1
fi