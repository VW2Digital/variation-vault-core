#!/usr/bin/env bash
###############################################################################
# migrate-to-own-supabase.sh — Replica TODAS as Edge Functions + Secrets
# para um projeto Supabase próprio (saindo do Lovable Cloud).
#
# Pré-requisitos:
#   1) Você já criou um projeto novo no https://supabase.com/dashboard
#   2) Já rodou o schema (deploy-vps/supabase/schema.sql) no SQL Editor dele
#   3) Tem em mãos:
#        - SUPABASE_ACCESS_TOKEN  (sbp_...)  → conta → tokens
#        - SUPABASE_PROJECT_REF   (20 chars) → URL do dashboard do projeto novo
#
# O que este script faz:
#   1) Instala a Supabase CLI (se não tiver)
#   2) Faz login com o access token
#   3) Linka este repo ao projeto novo
#   4) Pergunta CADA secret necessário (você cola o valor) e seta no projeto novo
#   5) Faz deploy das 18 edge functions com --no-verify-jwt nas que precisam
#      (webhooks chamados por gateways externos sem JWT)
#
# Depois disso:
#   - sudo bash deploy-vps/reconfigure.sh   ← reaponta o frontend pro novo projeto
###############################################################################
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

if [[ $EUID -ne 0 ]]; then
    err "Execute como root: sudo bash $0"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -d "supabase/functions" ]]; then
    err "Pasta supabase/functions/ não encontrada em $REPO_ROOT"
    exit 1
fi

###############################################################################
# 1) Supabase CLI
###############################################################################
if ! command -v supabase >/dev/null 2>&1; then
    step "Instalando Supabase CLI"
    curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
        | tar -xz -C /usr/local/bin supabase
    chmod +x /usr/local/bin/supabase
fi
ok "Supabase CLI: $(supabase --version)"

###############################################################################
# 2) Inputs
###############################################################################
echo
echo "Cole o SUPABASE_ACCESS_TOKEN do projeto NOVO (sbp_...). Entrada oculta."
read -rsp "SUPABASE_ACCESS_TOKEN: " SB_TOKEN; echo
if [[ ! "$SB_TOKEN" =~ ^sbp_ ]]; then err "Token inválido"; exit 1; fi
export SUPABASE_ACCESS_TOKEN="$SB_TOKEN"

read -rp "SUPABASE_PROJECT_REF do projeto NOVO (20 chars): " SB_REF
SB_REF="${SB_REF##*/}"; SB_REF="${SB_REF%%\?*}"
if [[ ! "$SB_REF" =~ ^[a-z0-9]{20}$ ]]; then err "Ref inválido"; exit 1; fi

###############################################################################
# 3) Link
###############################################################################
step "Linkando repo ao projeto $SB_REF"
supabase link --project-ref "$SB_REF" >/dev/null 2>&1 || \
    supabase link --project-ref "$SB_REF"
ok "Repo linkado a $SB_REF"

###############################################################################
# 4) Secrets
###############################################################################
# Lista de secrets que as edge functions usam (descobertos via grep no código).
# SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY são injetados automaticamente pela
# plataforma Supabase — NÃO precisam ser setados manualmente.
SECRETS=(
    "RESEND_API_KEY"           # E-mails transacionais (Resend)
    "MP_WEBHOOK_SECRET"        # Validação HMAC webhook Mercado Pago
    "MP_ACCESS_TOKEN"          # Access token Mercado Pago (server)
    "ASAAS_API_KEY"            # API Asaas (se usar)
    "ASAAS_WEBHOOK_TOKEN"      # Validação webhook Asaas
    "PAGARME_API_KEY"          # API Pagar.me (se usar)
    "PAGARME_WEBHOOK_SECRET"   # Validação HMAC-SHA1 webhook Pagar.me
    "PAGBANK_TOKEN"            # API PagBank (se usar)
    "MELHOR_ENVIO_CLIENT_ID"   # OAuth Melhor Envio
    "MELHOR_ENVIO_CLIENT_SECRET"
    "EVOLUTION_API_URL"        # Evolution API (WhatsApp)
    "EVOLUTION_API_KEY"
    "EVOLUTION_INSTANCE"
    "ORDERS_API_KEY"           # x-api-key da API REST de pedidos
)

step "Configurando secrets (deixe em branco para pular um secret que você não usa)"
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

for KEY in "${SECRETS[@]}"; do
    read -rsp "  $KEY (oculto, ENTER para pular): " VAL; echo
    if [[ -n "$VAL" ]]; then
        printf '%s=%s\n' "$KEY" "$VAL" >> "$TMP_ENV"
    fi
done

if [[ -s "$TMP_ENV" ]]; then
    info "Enviando secrets ao projeto $SB_REF..."
    supabase secrets set --env-file "$TMP_ENV" --project-ref "$SB_REF"
    ok "Secrets configurados"
else
    info "Nenhum secret informado — pulando."
fi

###############################################################################
# 5) Deploy das Edge Functions
###############################################################################
# Webhooks chamados por gateways externos não recebem JWT → --no-verify-jwt.
# As demais funções usam o JWT do usuário logado para validar permissões.
NO_JWT_FUNCTIONS=(
    "asaas-webhook"
    "mercadopago-webhook"
    "pagarme-webhook"
    "pagbank-webhook"
    "melhor-envio-webhook"
    "orders-api"            # Usa x-api-key próprio
    "trigger-deploy"        # Webhook de deploy
)

is_no_jwt() {
    local fn="$1"
    for x in "${NO_JWT_FUNCTIONS[@]}"; do [[ "$x" == "$fn" ]] && return 0; done
    return 1
}

step "Deployando edge functions"
FAILED=()
for FN_DIR in supabase/functions/*/; do
    FN="$(basename "$FN_DIR")"
    [[ "$FN" == "_shared" ]] && continue

    if is_no_jwt "$FN"; then
        info "→ $FN (sem verificação de JWT)"
        if ! supabase functions deploy "$FN" --project-ref "$SB_REF" --no-verify-jwt; then
            FAILED+=("$FN"); err "  Falha em $FN"
        fi
    else
        info "→ $FN"
        if ! supabase functions deploy "$FN" --project-ref "$SB_REF"; then
            FAILED+=("$FN"); err "  Falha em $FN"
        fi
    fi
done

echo
if [[ ${#FAILED[@]} -gt 0 ]]; then
    err "Falharam (${#FAILED[@]}): ${FAILED[*]}"
    err "Veja logs em: supabase functions logs <nome> --project-ref $SB_REF"
    exit 1
fi
ok "Todas as edge functions deployadas no projeto $SB_REF"

###############################################################################
# Próximos passos
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              MIGRAÇÃO BACKEND CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
echo "Agora reaponte o frontend da VPS para o novo projeto:"
echo
echo "  sudo bash $REPO_ROOT/deploy-vps/reconfigure.sh"
echo
echo "Use o MESMO access token e o ref $SB_REF."
echo
echo "Ainda precisa fazer no painel do Supabase NOVO:"
echo "  1) Storage → criar buckets PÚBLICOS:"
echo "       - product-images"
echo "       - banner-images"
echo "       - testimonial-videos"
echo "  2) Authentication → Users → criar seu usuário admin"
echo "  3) SQL Editor: INSERT INTO public.user_roles (user_id, role)"
echo "                 VALUES ('UUID-DO-USUARIO', 'admin');"
echo "  4) Authentication → URL Configuration → Site URL = https://SEUDOMINIO"
echo