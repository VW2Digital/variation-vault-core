#!/usr/bin/env bash
# =============================================================================
# validate-env.sh
# Valida que TODAS as variáveis obrigatórias estão presentes antes do deploy.
# Falha (exit 1) com mensagem clara quando algo estiver faltando ou inválido.
#
# Uso:
#   bash deploy-vps/validate-env.sh                # lê ./.env
#   bash deploy-vps/validate-env.sh /path/.env     # lê arquivo específico
#   bash deploy-vps/validate-env.sh --skip-secrets # pula checagem online de secrets
# =============================================================================
set -uo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }
title() { echo -e "\n${BLUE}▶ $*${NC}"; }

# ---------- args ----------
ENV_FILE="${1:-.env}"
SKIP_SECRETS=0
for arg in "$@"; do
  [[ "$arg" == "--skip-secrets" ]] && SKIP_SECRETS=1
done
[[ "$ENV_FILE" == --* ]] && ENV_FILE=".env"

ERRORS=0
WARNINGS=0

# ---------- carregar .env ----------
title "Lendo arquivo de ambiente: $ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  err "Arquivo não encontrado: $ENV_FILE"
  err "Copie .env.example para .env e preencha as variáveis."
  exit 1
fi

# Carrega sem sobrescrever variáveis já exportadas no shell
set -a
# shellcheck disable=SC1090
source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed -E 's/^([^=]+)=(.*)$/\1="\2"/' | sed -E 's/="(.*)"$/=\1/' | sed -E 's/^([^=]+)=(.*)$/\1="\2"/')
set +a
ok "Arquivo carregado."

# ---------- helpers ----------
require() {
  local name="$1"
  local hint="${2:-}"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    err "$name está vazio ou ausente. $hint"
    ERRORS=$((ERRORS + 1))
    return 1
  fi
  ok "$name definido."
  return 0
}

optional() {
  local name="$1"
  local hint="${2:-}"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    warn "$name vazio (opcional). $hint"
    WARNINGS=$((WARNINGS + 1))
  else
    ok "$name definido."
  fi
}

match() {
  local name="$1"
  local regex="$2"
  local hint="${3:-}"
  local value="${!name:-}"
  [[ -z "$value" ]] && return 0
  if [[ ! "$value" =~ $regex ]]; then
    err "$name tem formato inválido. $hint"
    ERRORS=$((ERRORS + 1))
  fi
}

# ---------- [1] frontend ----------
title "[1/4] Variáveis de frontend (Vite build)"
require VITE_SUPABASE_URL "Ex.: https://abc123.supabase.co"
match   VITE_SUPABASE_URL '^https://[a-z0-9-]+\.supabase\.co/?$' "Deve ser URL Supabase válida."
require VITE_SUPABASE_PUBLISHABLE_KEY "Anon key pública (começa com eyJ...)"
match   VITE_SUPABASE_PUBLISHABLE_KEY '^eyJ' "Deve ser um JWT (começar com eyJ)."
require VITE_SUPABASE_PROJECT_ID "Ref do projeto Supabase, ex.: abc123xyz"

# ---------- [2] deploy VPS ----------
title "[2/4] Configuração de VPS (Nginx + SSL)"
require SERVER_NAME "Domínio público sem https://, ex.: loja.exemplo.com"
match   SERVER_NAME '^[a-z0-9.-]+\.[a-z]{2,}$' "Domínio inválido (não use https:// nem barras)."
require SSL_EMAIL "E-mail para Let's Encrypt"
match   SSL_EMAIL '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' "E-mail inválido."
optional SUPABASE_PROXY_HOST "Será derivado de VITE_SUPABASE_URL se vazio."
optional SUPABASE_FUNCTIONS_BASE_URL "Será derivada se vazia."

# ---------- [3] deploy edge functions ----------
title "[3/4] Deploy das Edge Functions (Supabase CLI)"
require SUPABASE_PROJECT_REF "Mesmo valor de VITE_SUPABASE_PROJECT_ID."
if [[ -n "${SUPABASE_PROJECT_REF:-}" && -n "${VITE_SUPABASE_PROJECT_ID:-}" \
      && "$SUPABASE_PROJECT_REF" != "$VITE_SUPABASE_PROJECT_ID" ]]; then
  err "SUPABASE_PROJECT_REF ($SUPABASE_PROJECT_REF) ≠ VITE_SUPABASE_PROJECT_ID ($VITE_SUPABASE_PROJECT_ID)."
  ERRORS=$((ERRORS + 1))
fi
optional SUPABASE_ACCESS_TOKEN "Necessário apenas em CI/CD. Localmente, use 'supabase login'."

if command -v supabase >/dev/null 2>&1; then
  ok "Supabase CLI instalada ($(supabase --version 2>/dev/null | head -n1))."
else
  err "Supabase CLI não instalada. Rode: npm i -g supabase"
  ERRORS=$((ERRORS + 1))
fi

# ---------- [4] secrets remotos (online) ----------
title "[4/4] Secrets das Edge Functions (Supabase remoto)"
if [[ "$SKIP_SECRETS" == "1" ]]; then
  warn "Checagem online ignorada (--skip-secrets)."
elif ! command -v supabase >/dev/null 2>&1; then
  warn "Supabase CLI ausente — checagem de secrets ignorada."
elif [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  warn "SUPABASE_PROJECT_REF ausente — checagem de secrets ignorada."
else
  REMOTE_SECRETS=$(supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" 2>/dev/null || true)
  if [[ -z "$REMOTE_SECRETS" ]]; then
    warn "Não foi possível listar secrets (faça 'supabase login' primeiro)."
    WARNINGS=$((WARNINGS + 1))
  else
    REQUIRED_SECRETS=(
      SUPABASE_URL
      SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      SUPABASE_DB_URL
      RESEND_API_KEY
      MP_WEBHOOK_SECRET
    )
    for secret in "${REQUIRED_SECRETS[@]}"; do
      if echo "$REMOTE_SECRETS" | grep -qE "^\s*\|\s*$secret\s*\|" \
         || echo "$REMOTE_SECRETS" | grep -qE "(^|\s)$secret(\s|$)"; then
        ok "Secret remoto '$secret' configurado."
      else
        err "Secret remoto '$secret' AUSENTE no projeto $SUPABASE_PROJECT_REF."
        err "  Configure: supabase secrets set $secret=... --project-ref $SUPABASE_PROJECT_REF"
        ERRORS=$((ERRORS + 1))
      fi
    done
  fi
fi

# ---------- conectividade ----------
title "Sanidade: conectividade com Supabase"
if [[ -n "${VITE_SUPABASE_URL:-}" ]]; then
  if curl -sf --max-time 5 "${VITE_SUPABASE_URL%/}/auth/v1/health" >/dev/null 2>&1 \
     || curl -sf --max-time 5 -o /dev/null "${VITE_SUPABASE_URL%/}/rest/v1/" \
        -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY:-}"; then
    ok "Supabase respondendo em $VITE_SUPABASE_URL."
  else
    warn "Não consegui validar conectividade com $VITE_SUPABASE_URL (pode ser firewall local)."
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ---------- resumo ----------
echo ""
echo "=============================================="
echo " Resumo: $ERRORS erro(s), $WARNINGS aviso(s)"
echo "=============================================="

if [[ "$ERRORS" -gt 0 ]]; then
  err "Validação falhou. Corrija os itens acima antes de deployar."
  exit 1
fi

ok "Tudo certo — pronto para deploy!"
exit 0