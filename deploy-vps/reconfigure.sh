#!/usr/bin/env bash
###############################################################################
# reconfigure.sh — Reaponta uma instalação existente para outro Supabase
#
# Use quando o build atual da VPS aponta para o projeto Supabase errado
# (ex.: instalou com URL de exemplo) e você quer corrigir SEM reinstalar
# Node, Nginx, Certbot, etc.
#
# O que faz:
#   1) Pergunta SUPABASE_URL + ANON_KEY (com a mesma validação do install.sh)
#   2) Reescreve /var/www/app/.env
#   3) Roda npm install + npm run build
#   4) Verifica que o bundle contém a nova URL
#   5) Reload do Nginx
###############################################################################
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

if [[ $EUID -ne 0 ]]; then
    err "Execute como root: sudo bash reconfigure.sh"
    exit 1
fi

APP_DIR="/var/www/app"
ENV_FILE="$APP_DIR/.env"

if [[ ! -d "$APP_DIR" ]]; then
    err "Diretório $APP_DIR não existe — rode o install.sh antes."
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then apt-get update -y && apt-get install -y jq; fi

CURRENT_URL=""
if [[ -f "$ENV_FILE" ]]; then
    CURRENT_URL="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Reconfigurar Supabase + Rebuild                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo
if [[ -n "$CURRENT_URL" ]]; then
    info "Configuração atual: $CURRENT_URL"
fi
echo

echo "Cole o SUPABASE_ACCESS_TOKEN (sbp_...). A entrada fica oculta."
echo "Crie em: https://supabase.com/dashboard/account/tokens"
read -rsp "SUPABASE_ACCESS_TOKEN: " SUPABASE_ACCESS_TOKEN
echo
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] || [[ ! "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_ ]]; then
    err "Access token inválido (deve começar com sbp_)."
    exit 1
fi

read -rp "SUPABASE_PROJECT_REF (ex: ntlfjekvisepsusbcjsv): " SUPABASE_PROJECT_REF
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF##*/}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF%%\?*}"
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    err "Project ref inválido (20 caracteres minúsculos/dígitos)."
    exit 1
fi
SUPABASE_URL_INPUT="https://${SUPABASE_PROJECT_REF}.supabase.co"

info "Buscando anon key via Supabase Management API..."
API_RESP="$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true" || true)"
API_BODY="$(echo "$API_RESP" | sed '$d')"
API_CODE="$(echo "$API_RESP" | tail -n1)"
if [[ "$API_CODE" != "200" ]]; then
    err "Management API retornou HTTP $API_CODE: $API_BODY"
    exit 1
fi
SUPABASE_ANON_KEY="$(echo "$API_BODY" | jq -r '.[] | select(.name=="anon") | .api_key')"
if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == "null" ]]; then
    err "Anon key não encontrada na resposta: $API_BODY"
    exit 1
fi
ok "Anon key obtida automaticamente para $SUPABASE_PROJECT_REF"

step "Reescrevendo $ENV_FILE"
cat > "$ENV_FILE" <<ENV
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
SUPABASE_PROXY_HOST=${SUPABASE_PROJECT_REF}.supabase.co
SUPABASE_FUNCTIONS_BASE_URL=${SUPABASE_URL_INPUT}/functions/v1
ENV
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
ok ".env atualizado"

if grep -q '^SERVER_NAME=' "$ENV_FILE"; then
    info "SERVER_NAME preservado no .env"
fi

step "Rebuild da aplicação"
cd "$APP_DIR"
# Limpa caches e dist antigo para garantir que o bundle novo use 100% o .env recém-gravado.
# Sem isso, o cache do Vite (.vite/) pode reaproveitar chunks antigos contendo a URL anterior.
info "Limpando dist/ e cache do Vite..."
rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules/.vite" 2>/dev/null || true
npm install --no-audit --no-fund
npm run build

if ! grep -rq "${SUPABASE_PROJECT_REF}.supabase" "$APP_DIR/dist/assets/" 2>/dev/null; then
    err "Bundle NÃO contém ${SUPABASE_PROJECT_REF}.supabase.co — algo deu errado no build."
    exit 1
fi
ok "Bundle aponta para ${SUPABASE_PROJECT_REF}.supabase.co"

# Detecta resíduos de outros project refs no bundle (build anterior contaminado).
OTHER_REFS="$(grep -rhoE '[a-z0-9]{20}\.supabase\.co' "$APP_DIR/dist/assets/" 2>/dev/null \
    | sort -u | grep -v "^${SUPABASE_PROJECT_REF}\." || true)"
if [[ -n "$OTHER_REFS" ]]; then
    err "Bundle contém referências a outros projetos Supabase além do informado:"
    echo "$OTHER_REFS" | sed 's/^/    - /'
    err "Isso indica URLs hardcoded no código (não vindas do .env). Procure por elas com:"
    err "  grep -rE '[a-z0-9]{20}\\.supabase\\.co' $APP_DIR/src/"
    err "Build NÃO foi aplicado por segurança."
    exit 1
fi
ok "Nenhum resíduo de project ref antigo no bundle"

chown -R www-data:www-data "$APP_DIR/dist"

# Garantir que o vhost do app tenha /healthz e seja default_server.
# Em instalações antigas o config foi criado sem /healthz (causa 404 no verify).
VHOST="/etc/nginx/sites-available/app"
if [[ -f "$VHOST" ]]; then
    DOMAIN_FROM_VHOST="$(grep -E '^\s*server_name' "$VHOST" | head -n1 | awk '{print $2}' | tr -d ';' || true)"
    DOMAIN_FROM_VHOST="${DOMAIN_FROM_VHOST:-_}"
    if ! grep -q 'location = /healthz' "$VHOST"; then
        step "Atualizando vhost Nginx (adicionando /healthz e default_server)"
        cat > "$VHOST" <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN_FROM_VHOST};

    root /var/www/app/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        add_header Cache-Control "no-store";
        return 200 "ok\n";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\\. { deny all; access_log off; log_not_found off; }
}
NGINX
        ok "Vhost atualizado com /healthz"
    fi
fi

nginx -t && systemctl reload nginx
ok "Nginx recarregado"

echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  RECONFIGURAÇÃO OK                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
ok "App agora aponta para $SUPABASE_URL_INPUT"
echo
echo "Limpe o cache do navegador (Ctrl+Shift+R) e recarregue o painel."
echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}URLs prontas para colar nos painéis dos gateways/webhooks:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for FN in melhor-envio-webhook asaas-webhook mercadopago-webhook pagarme-webhook pagbank-webhook; do
    echo "  $FN:"
    echo "    ${SUPABASE_URL_INPUT}/functions/v1/${FN}"
done
echo