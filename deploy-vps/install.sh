#!/usr/bin/env bash
###############################################################################
# install.sh — Liberty Pharma (Vite + React) — Instalação nativa Ubuntu/Debian
#
# Faz APENAS 3 coisas:
#   STEP 1 — Instala Node.js LTS, Git, Nginx, builda o app e configura SPA
#   STEP 2 — Instala Certbot e emite certificado SSL para o domínio
#   STEP 3 — Coleta credenciais de um Supabase EXTERNO (URL, anon key, ref),
#            grava em /var/www/app/.env e rebuilda o app apontando pra ele.
#
# Sem Docker, sem PM2, sem Postgres, sem extras.
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

read -rp "URL do repositório Git [${REPO_URL_DEFAULT}]: " REPO_URL
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
if [[ -z "$REPO_URL" ]]; then
    err "URL do repositório não pode ser vazia."
    exit 1
fi

# ----------------------------- Coleta Supabase ANTES do build ---------------
# Precisamos das credenciais agora porque elas entram no bundle do Vite
# como variáveis VITE_* durante `npm run build`.
echo
info "Configuração do Supabase (banco externo da sua VPS)"
echo "Você precisa de um projeto Supabase próprio (https://supabase.com/dashboard)."
echo "Encontre URL e anon key em: Project Settings → API"
echo

read -rp "SUPABASE URL (ex: https://xxxxx.supabase.co): " SUPABASE_URL_INPUT
if [[ -z "${SUPABASE_URL_INPUT:-}" ]]; then
    err "SUPABASE URL não pode ser vazia."
    exit 1
fi
if [[ ! "$SUPABASE_URL_INPUT" =~ ^https://[a-z0-9]+\.supabase\.co/?$ ]]; then
    err "URL inválida. Formato esperado: https://xxxxx.supabase.co"
    exit 1
fi
SUPABASE_URL_INPUT="${SUPABASE_URL_INPUT%/}"

# Extrai automaticamente o project ref da URL
SUPABASE_PROJECT_REF="$(echo "$SUPABASE_URL_INPUT" | sed -E 's#https://([^.]+)\.supabase\.co#\1#')"

echo
echo "SUPABASE ANON KEY (chave pública 'anon / public', JWT longo começando com eyJ...)"
read -rp "SUPABASE_ANON_KEY: " SUPABASE_ANON_KEY
if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
    err "Anon key não pode ser vazia."
    exit 1
fi
if [[ ! "$SUPABASE_ANON_KEY" =~ ^eyJ ]]; then
    err "Anon key inválida (deve começar com 'eyJ')."
    exit 1
fi

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

# Grava .env do Vite ANTES do build para apontar pro Supabase externo
ENV_FILE="$APP_DIR/.env"
info "Gravando credenciais Supabase em $ENV_FILE (usadas no build do Vite)..."
cat > "$ENV_FILE" <<ENV
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
ENV
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
ok "Variáveis VITE_* gravadas (apontando para $SUPABASE_URL_INPUT)"

# Build
cd "$APP_DIR"
info "Instalando dependências (npm install)..."
npm install --no-audit --no-fund

info "Buildando aplicação com Supabase externo (npm run build)..."
npm run build

if [[ ! -d "$APP_DIR/dist" ]]; then
    err "Build não gerou a pasta dist/. Verifique os logs do npm acima."
    exit 1
fi
ok "Build concluído em $APP_DIR/dist"

# Configurar Nginx (SPA + cache de assets) — domínio ajustado no STEP 2
info "Configurando Nginx para servir SPA estática..."
cat > /etc/nginx/sites-available/app <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name _;

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
        try_files $uri =404;
    }

    # Fallback SPA (React Router)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

chown -R www-data:www-data "$APP_DIR/dist"

nginx -t
systemctl reload nginx
ok "Nginx servindo $APP_DIR/dist na porta 80"

###############################################################################
# STEP 2 — Certbot (SSL)
###############################################################################
step "STEP 2 — Configurando SSL com Certbot"

read -rp "Domínio [${DOMAIN_DEFAULT}]: " DOMAIN
DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
if [[ -z "${DOMAIN:-}" ]]; then
    err "Domínio não pode ser vazio."
    exit 1
fi

read -rp "E-mail para alertas do Let's Encrypt [${EMAIL_DEFAULT}]: " EMAIL
EMAIL="${EMAIL:-$EMAIL_DEFAULT}"
if [[ -z "${EMAIL:-}" ]]; then
    err "E-mail não pode ser vazio."
    exit 1
fi

info "Atualizando server_name do Nginx para $DOMAIN..."
sed -i "s/server_name _;/server_name ${DOMAIN};/" /etc/nginx/sites-available/app
nginx -t
systemctl reload nginx

info "Instalando Certbot + plugin Nginx..."
apt-get install -y certbot python3-certbot-nginx

info "Emitindo certificado para $DOMAIN..."
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$EMAIL" \
    -d "$DOMAIN"

# Auto-renovação: pacote já instala certbot.timer; fallback para cron.
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
# STEP 3 — Confirmação das credenciais Supabase já aplicadas no build
###############################################################################
step "STEP 3 — Supabase externo configurado"

ok "URL ............ $SUPABASE_URL_INPUT"
ok "Project Ref .... $SUPABASE_PROJECT_REF"
ok "Anon Key ....... ${SUPABASE_ANON_KEY:0:20}... (${#SUPABASE_ANON_KEY} chars)"
ok "Arquivo ........ $ENV_FILE (chmod 600)"
info "Credenciais aplicadas no bundle Vite durante o build acima."

###############################################################################
# Resumo final
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
ok "App Vite/React buildado e servido via Nginx → $APP_DIR/dist/"
ok "Certificado SSL configurado para $DOMAIN"
ok "Supabase externo: $SUPABASE_URL_INPUT (ref: $SUPABASE_PROJECT_REF)"
ok "Credenciais salvas em $ENV_FILE (chmod 600)"
echo
echo -e "${BLUE}Acesse: https://${DOMAIN}${NC}"
echo
echo "Para atualizar o app no futuro (mantém o .env com Supabase externo):"
echo "  cd $APP_DIR && git pull && npm install && npm run build && systemctl reload nginx"
echo
echo "IMPORTANTE: o schema do banco precisa estar criado no seu Supabase."
echo "Use o SQL em deploy-vps/supabase/schema.sql para provisionar tudo."
echo
