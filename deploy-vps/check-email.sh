#!/usr/bin/env bash
###############################################################################
# check-email.sh — Diagnóstico end-to-end da stack de e-mails
#
# Verifica que TODA a infraestrutura de e-mail está saudável e independente
# do Lovable:
#   1) Variáveis de ambiente da VPS (.env)
#   2) Edge Functions 'send-email' e 'email-events' publicadas e acessíveis
#   3) Secret RESEND_API_KEY presente no Supabase
#   4) Tabela 'email_send_log' acessível (auditoria)
#   5) Configuração de remetente em 'site_settings'
#   6) (Opcional) Envio de teste real para um endereço informado
#
# Uso:
#   bash deploy-vps/check-email.sh                # diagnóstico
#   bash deploy-vps/check-email.sh you@email.com  # + envio de teste real
###############################################################################
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; FAILED=$((FAILED+1)); }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }
mask() {
    local s="${1:-}"; local n=${#s}
    if [[ $n -le 12 ]]; then printf '****'
    else printf '%s****%s' "${s:0:6}" "${s: -4}"
    fi
}

FAILED=0
TEST_TO="${1:-}"

echo
echo "============================================================"
echo "  DIAGNÓSTICO DE E-MAIL — Supabase + Resend (sem Lovable)"
echo "============================================================"
echo

# ----------------------------------------------------------------------------
# 1) Carregar .env
# ----------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-/var/www/app/.env}"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$(dirname "$0")/../.env"
if [[ ! -f "$ENV_FILE" ]]; then
    fail ".env não encontrado em $ENV_FILE — exporte ENV_FILE=/caminho/.env"
    exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
ok ".env carregado: $ENV_FILE"

SUPABASE_URL="${VITE_SUPABASE_URL:-}"
SUPABASE_URL="${SUPABASE_URL%/}"
ANON="${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"
SR="${SUPABASE_SERVICE_ROLE_KEY:-}"

[[ -n "$SUPABASE_URL" ]] || { fail "VITE_SUPABASE_URL ausente"; exit 1; }
[[ -n "$ANON" ]]         || { fail "VITE_SUPABASE_PUBLISHABLE_KEY ausente"; exit 1; }
ok "Supabase URL: $SUPABASE_URL"
ok "Anon key:     $(mask "$ANON")"
[[ -n "$SR" ]] && ok "Service role: $(mask "$SR") (presente)" \
              || warn "SUPABASE_SERVICE_ROLE_KEY ausente — alguns testes serão pulados"

# ----------------------------------------------------------------------------
# 2) Edge Functions de e-mail acessíveis
# ----------------------------------------------------------------------------
echo
info "Testando Edge Functions de e-mail…"
for FN in send-email email-events; do
    URL="$SUPABASE_URL/functions/v1/$FN"
    CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
        -X OPTIONS "$URL" || echo "000")"
    case "$CODE" in
        200|204|401|403|405) ok "$FN → HTTP $CODE (publicada e acessível)" ;;
        404) fail "$FN → HTTP 404 (NÃO publicada — rode: supabase functions deploy $FN)" ;;
        000) fail "$FN → timeout (Supabase inalcançável)" ;;
        *)   warn "$FN → HTTP $CODE" ;;
    esac
done

# ----------------------------------------------------------------------------
# 3) Secret RESEND_API_KEY no Supabase (precisa de service role para checar
#    indiretamente — aqui validamos via uma chamada que ela usaria)
# ----------------------------------------------------------------------------
echo
info "Verificando RESEND_API_KEY no projeto Supabase…"
if [[ -n "$SR" ]]; then
    # Chama send-email com payload inválido — se a função responder 400 (bad
    # request) sabemos que ela rodou e leu a chave; se for 500 com 'RESEND_API_KEY
    # ausente' a secret não está configurada.
    RESP="$(curl -sS --max-time 15 \
        -X POST "$SUPABASE_URL/functions/v1/send-email" \
        -H "Authorization: Bearer $SR" \
        -H "Content-Type: application/json" \
        -d '{"template":"__diag__","to":"diag@example.com"}' || echo '{}')"
    if echo "$RESP" | grep -q "RESEND_API_KEY ausente"; then
        fail "RESEND_API_KEY NÃO configurada no Supabase."
        info "  Configure: supabase secrets set RESEND_API_KEY=re_xxx --project-ref ${VITE_SUPABASE_PROJECT_ID:-<ref>}"
    elif echo "$RESP" | grep -qE '"error".*template'; then
        ok "send-email respondeu (validação rejeitou payload de diagnóstico) — secret presente."
    else
        warn "Resposta inesperada de send-email: $(echo "$RESP" | head -c 200)"
    fi
else
    warn "Pulado — sem service role key. Liste manualmente:"
    info "  supabase secrets list --project-ref ${VITE_SUPABASE_PROJECT_ID:-<ref>}"
fi

# ----------------------------------------------------------------------------
# 4) Tabela email_send_log acessível
# ----------------------------------------------------------------------------
if [[ -n "$SR" ]]; then
    echo
    info "Checando tabela email_send_log (auditoria)…"
    CODE="$(curl -sS -o /tmp/_email_log.json -w '%{http_code}' --max-time 10 \
        "$SUPABASE_URL/rest/v1/email_send_log?select=id&limit=1" \
        -H "apikey: $SR" -H "Authorization: Bearer $SR" || echo "000")"
    if [[ "$CODE" == "200" ]]; then
        ok "email_send_log acessível (linhas amostra: $(jq 'length' /tmp/_email_log.json 2>/dev/null || echo '?'))"
    else
        fail "email_send_log retornou HTTP $CODE — migração aplicada?"
    fi
fi

# ----------------------------------------------------------------------------
# 5) Configuração de remetente em site_settings
# ----------------------------------------------------------------------------
if [[ -n "$SR" ]]; then
    echo
    info "Lendo remetente padrão (site_settings.resend_from_email)…"
    FROM_VAL="$(curl -sS --max-time 10 \
        "$SUPABASE_URL/rest/v1/site_settings?key=eq.resend_from_email&select=value" \
        -H "apikey: $SR" -H "Authorization: Bearer $SR" \
        | jq -r '.[0].value // empty' 2>/dev/null || echo '')"
    if [[ -n "$FROM_VAL" ]]; then
        ok "Remetente configurado: $FROM_VAL"
    else
        warn "Remetente não definido — Edge Function usará 'onboarding@resend.dev' (apenas dev)."
        info "  Defina em /admin/configuracoes/comunicacao."
    fi
fi

# ----------------------------------------------------------------------------
# 6) Envio de teste (apenas se TEST_TO foi passado e tivermos service role)
# ----------------------------------------------------------------------------
if [[ -n "$TEST_TO" && -n "$SR" ]]; then
    echo
    info "Disparando e-mail de teste para $TEST_TO …"
    RESP="$(curl -sS --max-time 30 \
        -X POST "$SUPABASE_URL/functions/v1/send-email" \
        -H "Authorization: Bearer $SR" \
        -H "Content-Type: application/json" \
        -d "{\"template\":\"custom\",\"to\":\"$TEST_TO\",\"subject\":\"Diagnóstico de e-mail — install.sh\",\"html\":\"<p>Funciona.</p>\"}" \
        || echo '{}')"
    if echo "$RESP" | grep -q '"success":true'; then
        ok "E-mail enviado com sucesso. message_id: $(echo "$RESP" | jq -r '.message_id // empty')"
        info "Verifique sua caixa de entrada (e a pasta de spam)."
    else
        fail "Envio falhou. Resposta: $(echo "$RESP" | head -c 300)"
    fi
elif [[ -n "$TEST_TO" ]]; then
    warn "Para testar envio real preciso de SUPABASE_SERVICE_ROLE_KEY no .env."
fi

# ----------------------------------------------------------------------------
echo
echo "============================================================"
if [[ "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}✓ Stack de e-mail saudável — Supabase + Resend, sem Lovable.${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILED problema(s) detectado(s).${NC}"
    echo "  Logs detalhados: dashboard Supabase → Edge Functions → send-email → Logs"
    echo "  UI da app:       /admin/logs-email"
    exit 1
fi
