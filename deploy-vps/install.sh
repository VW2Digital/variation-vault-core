#!/usr/bin/env bash
###############################################################################
# install.sh — Liberty Pharma (Vite + React) — Instalação nativa Ubuntu/Debian
#
# Faz APENAS 2 coisas:
#   STEP 1 — Instala Node.js LTS, Git, Nginx, builda o app apontando pro
#            Supabase informado e configura SPA.
#   STEP 2 — Instala Certbot e emite certificado SSL para o domínio.
#
# Você só precisa de 4 informações (todas perguntadas no início):
#   1) SUPABASE_ACCESS_TOKEN (sbp_...) — Personal Access Token
#                            https://supabase.com/dashboard/account/tokens
#   2) SUPABASE_PROJECT_REF  (ex: ntlfjekvisepsusbcjsv) — extraído da URL
#                            https://supabase.com/dashboard/project/<REF>
#   3) Domínio               (ex: meusite.com)
#   4) E-mail Let's Encrypt
#
# A anon key é buscada automaticamente via Supabase Management API.
#
# Sem Docker, sem PM2, sem Postgres, sem Management API, sem Access Token.
# O schema do banco você aplica uma vez no SQL Editor do Supabase usando
# deploy-vps/supabase/schema.sql (instruções no fim deste script).
###############################################################################
set -euo pipefail

# ----------------------------- Cores ----------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

# ----------------------------- Pré-checagens --------------------------------
if [[ $EUID -ne 0 ]]; then
    err "Este script precisa ser executado como root (use: sudo bash install.sh)"
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    err "Este script suporta apenas Ubuntu/Debian (apt-get não encontrado)."
    exit 1
fi

# ----------------------------- Configuração ---------------------------------
APP_DIR="/var/www/app"
REPO_URL_DEFAULT="https://github.com/VW2Digital/variation-vault-core.git"
DOMAIN_DEFAULT="luminaeliberty.com"
EMAIL_DEFAULT="libertyluminaepharma@gmail.com"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Liberty Pharma — Instalação Nativa (Vite + Nginx)      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# Garante curl + jq cedo (usados na validação leve da anon key)
if ! command -v curl >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl; fi
if ! command -v jq >/dev/null 2>&1;   then apt-get update -y && apt-get install -y jq;   fi

echo
info "Todas as perguntas serão feitas agora, antes de qualquer instalação."
echo

# 1) Repositório
read -rp "URL do repositório Git [${REPO_URL_DEFAULT}]: " REPO_URL
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
if [[ -z "$REPO_URL" ]]; then
    err "URL do repositório não pode ser vazia."
    exit 1
fi

# 2) Personal Access Token + Project Ref
echo
echo "Configuração do Supabase via Personal Access Token."
echo "Crie um token em: https://supabase.com/dashboard/account/tokens"
echo "Pegue o project ref na URL: https://supabase.com/dashboard/project/<REF>"
echo
echo "Cole o SUPABASE_ACCESS_TOKEN (sbp_...). A entrada fica oculta."
read -rsp "SUPABASE_ACCESS_TOKEN: " SUPABASE_ACCESS_TOKEN
echo
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] || [[ ! "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_ ]]; then
    err "Access token inválido — deve começar com 'sbp_'."
    exit 1
fi

read -rp "SUPABASE_PROJECT_REF (ex: ntlfjekvisepsusbcjsv): " SUPABASE_PROJECT_REF
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF##*/}"  # tolera URL completa colada
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF%%\?*}"
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    err "Project ref inválido — esperado 20 caracteres minúsculos/dígitos (ex: ntlfjekvisepsusbcjsv)."
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
    err "Management API retornou HTTP $API_CODE."
    err "Resposta: $API_BODY"
    err "Verifique se o token é válido e tem acesso ao projeto $SUPABASE_PROJECT_REF."
    exit 1
fi

SUPABASE_ANON_KEY="$(echo "$API_BODY" | jq -r '.[] | select(.name=="anon") | .api_key')"
if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == "null" ]]; then
    err "Anon key não encontrada na resposta da API."
    err "Resposta: $API_BODY"
    exit 1
fi
ok "Anon key obtida automaticamente para o projeto $SUPABASE_PROJECT_REF"

# 4) Domínio + e-mail (perguntados aqui pra ficar tudo no início)
echo
read -rp "Domínio [${DOMAIN_DEFAULT}]: " DOMAIN
DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
read -rp "E-mail para alertas do Let's Encrypt [${EMAIL_DEFAULT}]: " EMAIL
EMAIL="${EMAIL:-$EMAIL_DEFAULT}"

###############################################################################
# STEP 1 — Instalar app (Node + Git + Nginx + build + config SPA)
###############################################################################
step "STEP 1 — Instalando aplicação"

info "Atualizando lista de pacotes..."
apt-get update -y

# Git
if ! command -v git >/dev/null 2>&1; then
    info "Instalando Git..."
    apt-get install -y git
fi
ok "Git: $(git --version)"

# Node.js LTS (via NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    info "Instalando Node.js LTS (20.x) via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
ok "Node: $(node -v) | npm: $(npm -v)"

# Nginx
if ! command -v nginx >/dev/null 2>&1; then
    info "Instalando Nginx..."
    apt-get install -y nginx
fi
systemctl enable nginx
ok "Nginx instalado"

# Clone / pull do repositório
mkdir -p "$(dirname "$APP_DIR")"
if [[ -d "$APP_DIR/.git" ]]; then
    info "Repositório já existe — executando git pull em $APP_DIR..."
    git -C "$APP_DIR" pull --ff-only
else
    if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
        err "$APP_DIR já existe e não é um repositório Git. Remova-o ou esvazie-o e tente novamente."
        exit 1
    fi
    info "Clonando $REPO_URL em $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
fi

# Grava .env do Vite ANTES do build para apontar pro Supabase informado
ENV_FILE="$APP_DIR/.env"
info "Gravando credenciais Supabase em $ENV_FILE (usadas no build do Vite)..."
cat > "$ENV_FILE" <<ENV
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
SUPABASE_PROXY_HOST=${SUPABASE_PROJECT_REF}.supabase.co
SUPABASE_FUNCTIONS_BASE_URL=${SUPABASE_URL_INPUT}/functions/v1
ENV
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
ok "Credenciais gravadas em $ENV_FILE (apontando para $SUPABASE_URL_INPUT)"

# Build
cd "$APP_DIR"
info "Instalando dependências (npm install)..."
npm install --no-audit --no-fund

# Limpa dist/ e cache do Vite para garantir bundle 100% derivado do .env atual.
info "Limpando dist/ e cache do Vite (garante bundle limpo)..."
rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules/.vite" 2>/dev/null || true

info "Buildando aplicação (npm run build)..."
npm run build

if [[ ! -d "$APP_DIR/dist" ]]; then
    err "Build não gerou a pasta dist/. Verifique os logs do npm acima."
    exit 1
fi
ok "Build concluído em $APP_DIR/dist"

# Configurar Nginx (SPA + cache de assets) — server_name ajustado abaixo
info "Configurando Nginx para servir SPA estática..."
cat > /etc/nginx/sites-available/app <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN};

    root /var/www/app/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    # Assets versionados pelo Vite — cache longo e imutável
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # Healthcheck simples
    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        add_header Cache-Control "no-store";
        return 200 "ok\n";
    }

    # Fallback SPA (React Router)
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Proxy de webhooks → Edge Functions do Supabase configurado.
    # Permite que gateways (Melhor Envio, Asaas, MP, PagBank, Pagar.me)
    # postem em https://${DOMAIN}/<webhook> sem precisar saber a URL do Supabase.
    location ~ ^/(melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook)(/.*)?\$ {
        proxy_pass ${SUPABASE_URL_INPUT}/functions/v1/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
    }

    # Webhook do Melhor Envio cadastrado como /admin/configuracoes/logistica:
    # GET serve a SPA normalmente; POST é roteado para a edge function
    # melhor-envio-webhook no Supabase. Resolve E-WBH-0002 (405) ao usar a URL
    # da página de configuração como callback.
    location = /admin/configuracoes/logistica {
        if (\$request_method = POST) {
            rewrite ^ /melhor-envio-webhook last;
        }
        try_files \$uri /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\\. { deny all; access_log off; log_not_found off; }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

chown -R www-data:www-data "$APP_DIR/dist"

nginx -t
systemctl reload nginx
ok "Nginx servindo $APP_DIR/dist na porta 80 (server_name=$DOMAIN)"

# ----------------------------- Verificação pós-build (local) ----------------
info "Executando verificação local..."
VERIFY_FAIL=0

if [[ ! -f "$APP_DIR/dist/index.html" ]]; then
    err "[verify] dist/index.html não foi gerado."
    VERIFY_FAIL=1
else
    ok "[verify] dist/index.html presente"
fi

if grep -rq "${SUPABASE_PROJECT_REF}.supabase" "$APP_DIR/dist/assets/" 2>/dev/null; then
    ok "[verify] Bundle aponta para ${SUPABASE_PROJECT_REF}.supabase.co"
else
    err "[verify] Bundle NÃO contém a URL do Supabase informado. .env não foi aplicado no build."
    VERIFY_FAIL=1
fi

# Detecta URLs hardcoded de outros project refs (resíduos no código).
OTHER_REFS_BUILD="$(grep -rhoE '[a-z0-9]{20}\.supabase\.co' "$APP_DIR/dist/assets/" 2>/dev/null \
    | sort -u | grep -v "^${SUPABASE_PROJECT_REF}\." || true)"
if [[ -n "$OTHER_REFS_BUILD" ]]; then
    err "[verify] Bundle contém URLs de outros projetos Supabase (hardcoded no código):"
    echo "$OTHER_REFS_BUILD" | sed 's/^/    - /'
    err "[verify] Webhooks/queries podem apontar para o lugar errado. Localize com:"
    err "         grep -rE '[a-z0-9]{20}\\.supabase\\.co' $APP_DIR/src/"
    VERIFY_FAIL=1
else
    ok "[verify] Nenhum resíduo de outro project ref no bundle"
fi

HEALTH_HTTP="$(curl -sS -o /tmp/healthz.out -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1/healthz || echo "000")"
if [[ "$HEALTH_HTTP" == "200" ]] && grep -q '^ok' /tmp/healthz.out; then
    ok "[verify] Nginx /healthz respondendo 200"
else
    # Não bloqueia o deploy: /healthz é apenas conveniência de monitoramento.
    # Pode falhar se outro vhost (ex.: SSL pré-existente) capturar a porta 80
    # como default_server. Reportamos como aviso, sem marcar VERIFY_FAIL.
    info "[verify] /healthz retornou HTTP $HEALTH_HTTP — provavelmente outro vhost responde antes. Build segue válido."
fi

ROOT_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1/ || echo "000")"
if [[ "$ROOT_HTTP" == "200" ]]; then
    ok "[verify] Nginx servindo index.html na raiz (HTTP 200)"
else
    err "[verify] Raiz retornou HTTP $ROOT_HTTP"
    VERIFY_FAIL=1
fi

if [[ "$VERIFY_FAIL" -eq 1 ]]; then
    err "Verificação local encontrou problemas. Revise os erros acima antes de continuar."
    exit 1
fi
ok "Verificação local concluída sem erros"

###############################################################################
# STEP 2 — Certbot (SSL)
###############################################################################
step "STEP 2 — Configurando SSL com Certbot para $DOMAIN"

info "Instalando Certbot + plugin Nginx..."
apt-get install -y certbot python3-certbot-nginx

info "Emitindo certificado para $DOMAIN..."
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$EMAIL" \
    -d "$DOMAIN"

# Auto-renovação
if systemctl list-unit-files | grep -q '^certbot.timer'; then
    systemctl enable --now certbot.timer
    info "Auto-renovação via systemd timer (certbot.timer) ativa."
else
    info "systemd timer não disponível — configurando cron diário."
    ( crontab -l 2>/dev/null | grep -v 'certbot renew' ; \
      echo "0 3 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
fi
ok "SSL configurado para $DOMAIN"

###############################################################################
# Resumo final
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
ok "App buildado e servido via Nginx → $APP_DIR/dist/"
ok "SSL ativo em https://${DOMAIN}"
ok "Conectado ao Supabase: $SUPABASE_URL_INPUT"
ok "Credenciais salvas em $ENV_FILE (chmod 600)"
echo
echo -e "${BLUE}Acesse: https://${DOMAIN}${NC}"
echo -e "${BLUE}Healthcheck: https://${DOMAIN}/healthz${NC}"
echo
echo "Para atualizar o app no futuro:"
echo "  cd $APP_DIR && git pull && npm install && npm run build && systemctl reload nginx"
echo
echo "Configurar o banco (faça apenas UMA vez no painel do Supabase):"
echo "  1) Abra https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "  2) Cole o conteúdo de $APP_DIR/deploy-vps/supabase/schema.sql"
echo "  3) Clique em Run"
echo "  4) Auth → Users: crie seu usuário admin"
echo "  5) SQL Editor: INSERT INTO public.user_roles (user_id, role) VALUES ('UUID-DO-USUARIO', 'admin');"
echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}URLs prontas para colar nos painéis dos gateways/webhooks:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "Use as URLs do SEU domínio (proxy Nginx → Supabase). Funcionam mesmo se"
echo "o gateway bloquear domínios *.supabase.co (ex.: WAF do Melhor Envio)."
echo
for FN in melhor-envio-webhook asaas-webhook mercadopago-webhook pagarme-webhook pagbank-webhook; do
    echo "  $FN:"
    echo "    https://${DOMAIN}/${FN}              (recomendado)"
    echo "    ${SUPABASE_URL_INPUT}/functions/v1/${FN}   (direto Supabase)"
done
echo
