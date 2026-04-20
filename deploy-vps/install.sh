#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador mínimo (app + Supabase)
# =============================================================================
set -euo pipefail
printf '\e[?2004l' 2>/dev/null || true

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

clean() {
  printf '%s' "$1" \
    | sed -E 's/\x1B\[\??2?0?0?[0-9]*[~hl]//g' \
    | tr -d '\r' \
    | sed -E "s/^['\"[:space:]]+//; s/['\"[:space:]]+$//"
}

valid_url()    { [[ "$1" =~ ^https://[a-zA-Z0-9.-]+\.supabase\.co/?$ ]]; }
valid_pubkey() { [[ "$1" =~ ^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]{20,})$ ]]; }
valid_seckey() { [[ "$1" =~ ^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]{20,})$ ]]; }
valid_dburl()  { [[ "$1" =~ ^postgres(ql)?://[^[:space:]]+$ ]]; }

ask() {
  local prompt="$1" validator="$2" hint="$3" var
  while true; do
    echo >&2
    echo -e "${BOLD}${prompt}${NC}" >&2
    [ -n "$hint" ] && echo -e "${YELLOW}↳ ${hint}${NC}" >&2
    read -r -p "› " var
    var="$(clean "$var")"
    [ -z "$var" ] && { err "Valor vazio."; continue; }
    if $validator "$var"; then echo "$var"; return 0; fi
    err "Formato inválido."
  done
}

# Pergunta opcional — ENTER pula sem validar
ask_optional() {
  local prompt="$1" hint="$2" var
  echo >&2
  echo -e "${BOLD}${prompt}${NC} ${YELLOW}(opcional — ENTER para pular)${NC}" >&2
  [ -n "$hint" ] && echo -e "${YELLOW}↳ ${hint}${NC}" >&2
  read -r -p "› " var
  echo "$(clean "${var:-}")"
}

ask_optional_secret() {
  local prompt="$1" hint="$2" var
  echo >&2
  echo -e "${BOLD}${prompt}${NC} ${YELLOW}(opcional — ENTER para pular)${NC}" >&2
  [ -n "$hint" ] && echo -e "${YELLOW}↳ ${hint}${NC}" >&2
  read -r -s -p "› " var; echo >&2
  echo "$(clean "${var:-}")"
}

ask_secret() {
  local prompt="$1" validator="$2" hint="$3" var
  while true; do
    echo >&2
    echo -e "${BOLD}${prompt}${NC}" >&2
    [ -n "$hint" ] && echo -e "${YELLOW}↳ ${hint}${NC}" >&2
    read -r -s -p "› " var; echo >&2
    var="$(clean "$var")"
    [ -z "$var" ] && { err "Valor vazio."; continue; }
    if $validator "$var"; then echo "$var"; return 0; fi
    err "Formato inválido."
  done
}

clear
echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║   Liberty Pharma — Instalador (App + Supabase)    ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"

[ "$(id -u)" -eq 0 ] || { err "Rode como root: sudo bash $0"; exit 1; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

# --- Etapa 1: Supabase ---
echo -e "${BOLD}━━━ Etapa 1/4 · Conexão Supabase ━━━${NC}"
SUPA_URL=$(ask    "SUPABASE_URL"          valid_url    "Ex: https://xxxxxxxxxxxx.supabase.co")
SUPA_ANON=$(ask   "SUPABASE_ANON_KEY"     valid_pubkey "Pública (sb_publishable_... ou eyJ...).")
SUPA_SVC=$(ask_secret "SUPABASE_SERVICE_ROLE_KEY" valid_seckey "SECRETA (sb_secret_... ou eyJ...).")

# --- Etapa 2: SSL opcional ---
echo
echo -e "${BOLD}━━━ Etapa 2/4 · SSL (opcional) ━━━${NC}"
echo -e "${YELLOW}Deixe em branco e pressione ENTER para pular (site ficará só em HTTP).${NC}"
echo -e "${YELLOW}Para HTTPS, o domínio JÁ precisa estar apontado para este IP via DNS (registro A).${NC}"
echo
read -r -p "Domínio (ex: catalog.seusite.com) ou ENTER para pular: " SSL_DOMAIN
SSL_DOMAIN="$(clean "${SSL_DOMAIN:-}")"
SSL_EMAIL=""
if [ -n "$SSL_DOMAIN" ]; then
  read -r -p "Email para o Let's Encrypt (avisos de expiração): " SSL_EMAIL
  SSL_EMAIL="$(clean "${SSL_EMAIL:-}")"
  if [ -z "$SSL_EMAIL" ]; then
    warn "Email vazio — pulando SSL."
    SSL_DOMAIN=""
  fi
fi

echo
echo -e "${BOLD}━━━ Revisão ━━━${NC}"
echo "  URL  : $SUPA_URL"
echo "  Anon : ${SUPA_ANON:0:20}…"
if [ -n "$SSL_DOMAIN" ]; then
  echo "  SSL  : $SSL_DOMAIN ($SSL_EMAIL)"
else
  echo "  SSL  : desativado (HTTP only)"
fi
echo
read -r -p "Confirmar e instalar? [s/N] " CONFIRM
CONFIRM="$(clean "$CONFIRM")"
[[ "$CONFIRM" =~ ^[sSyY]$ ]] || { warn "Cancelado."; exit 0; }

# --- Etapa 3: Repo + Docker ---
echo
echo -e "${BOLD}━━━ Etapa 3/4 · Repositório e Docker ━━━${NC}"

if [ ! -f "$APP_DIR/Dockerfile" ]; then
  log "Clonando repositório em $APP_DIR..."
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }
  mkdir -p "$(dirname "$APP_DIR")"
  [ -d "$APP_DIR" ] && [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] && rmdir "$APP_DIR"
  git clone --depth 1 -b "$REPO_BRANCH" "$REPO_URL" "${APP_DIR}.tmp"
  if [ -d "$APP_DIR" ]; then
    cp -rn "${APP_DIR}.tmp/." "$APP_DIR/" && rm -rf "${APP_DIR}.tmp"
  else
    mv "${APP_DIR}.tmp" "$APP_DIR"
  fi
  ok "Repositório clonado"
fi
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  log "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
ok "Docker: $(docker --version)"

if ! docker compose version >/dev/null 2>&1; then
  log "Instalando docker-compose-plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi
ok "Compose: $(docker compose version --short)"

# --- Etapa 4: .env + subir app ---
echo
echo -e "${BOLD}━━━ Etapa 4/4 · Configuração e build ━━━${NC}"

PROJECT_ID=$(echo "$SUPA_URL" | sed -E 's|https://([^.]+)\.supabase\.co/?|\1|')
cat > "$APP_DIR/.env" <<EOF
VITE_SUPABASE_URL=$SUPA_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPA_ANON
VITE_SUPABASE_PROJECT_ID=$PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY=$SUPA_SVC
EOF
chmod 600 "$APP_DIR/.env"
ok ".env criado"

unset SUPA_SVC

# --- SSL via Certbot (standalone) antes de subir o container ---
if [ -n "$SSL_DOMAIN" ]; then
  log "Configurando SSL para $SSL_DOMAIN..."

  if ! command -v certbot >/dev/null 2>&1; then
    log "Instalando certbot..."
    apt-get update -qq && apt-get install -y -qq certbot
  fi

  # Libera porta 80 para o desafio HTTP-01
  ( cd "$APP_DIR" && docker compose down >/dev/null 2>&1 ) || true
  fuser -k 80/tcp >/dev/null 2>&1 || true

  if [ ! -f "/etc/letsencrypt/live/$SSL_DOMAIN/fullchain.pem" ]; then
    log "Emitindo certificado Let's Encrypt..."
    certbot certonly --standalone --non-interactive --agree-tos \
      -m "$SSL_EMAIL" -d "$SSL_DOMAIN" \
      || { err "Falha ao emitir SSL. Verifique se o DNS de $SSL_DOMAIN aponta para este servidor."; exit 1; }
    ok "Certificado emitido"
  else
    ok "Certificado já existe — reaproveitando"
  fi

  # Reescreve nginx.conf com HTTPS
  log "Configurando nginx para HTTPS..."
  cat > "$APP_DIR/deploy-vps/nginx.conf" <<NGINX
server {
    listen 80 default_server;
    server_name $SSL_DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    http2 on;
    server_name $SSL_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$SSL_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$SSL_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    root /usr/share/nginx/html;
    index index.html;

    gzip on; gzip_vary on; gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX

  # Adiciona porta 443 + volume do letsencrypt no docker-compose se ainda não houver
  if ! grep -q '443:443' "$APP_DIR/docker-compose.yml"; then
    log "Atualizando docker-compose.yml (porta 443 + volume SSL)..."
    command -v python3 >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq python3; }
    python3 - "$APP_DIR/docker-compose.yml" <<'PY' || { err "Falha ao editar docker-compose.yml"; exit 1; }
import sys, re
p = sys.argv[1]
s = open(p).read()
s = s.replace('- "80:80"', '- "80:80"\n      - "443:443"')
if 'volumes:' not in s.split('healthcheck:')[0]:
    s = s.replace('healthcheck:', 'volumes:\n      - /etc/letsencrypt:/etc/letsencrypt:ro\n      - /var/www/certbot:/var/www/certbot:ro\n    healthcheck:')
open(p,'w').write(s)
PY
  fi
  mkdir -p /var/www/certbot
  ok "SSL configurado"

  # Renovação automática: cron diário 3h da manhã
  log "Configurando renovação automática do SSL..."
  RENEW_SCRIPT="/usr/local/bin/liberty-pharma-renew-ssl.sh"
  cat > "$RENEW_SCRIPT" <<RENEW
#!/usr/bin/env bash
# Renova certificados Let's Encrypt e recarrega o nginx do container
set -e
cd $APP_DIR
# Para liberar a porta 80 durante o desafio HTTP-01
docker compose stop app >/dev/null 2>&1 || true
certbot renew --standalone --quiet --no-random-sleep-on-renew
docker compose start app >/dev/null 2>&1 || docker compose up -d
# Reload no nginx do container (aplica novos certificados sem downtime)
docker compose exec -T app nginx -s reload >/dev/null 2>&1 || true
RENEW
  chmod +x "$RENEW_SCRIPT"

  # Cron: todo dia às 03:17 (Let's Encrypt só renova nos últimos 30 dias de validade)
  CRON_LINE="17 3 * * * $RENEW_SCRIPT >> /var/log/liberty-pharma-ssl.log 2>&1"
  { crontab -l 2>/dev/null | grep -v 'liberty-pharma-renew-ssl.sh' || true; echo "$CRON_LINE"; } | crontab - || warn "Não foi possível agendar cron de renovação"
  ok "Renovação automática agendada (diária 03:17, log em /var/log/liberty-pharma-ssl.log)"
fi

log "Buildando imagem (pode levar 2-4 min)..."
docker compose build app || { err "Build falhou. Veja o erro acima."; exit 1; }
log "Subindo container..."
docker compose up -d || { err "docker compose up falhou."; docker compose logs --tail=50 app || true; exit 1; }

log "Aguardando aplicação responder..."
CHECK_URL="http://localhost/"
[ -n "$SSL_DOMAIN" ] && CHECK_URL="https://$SSL_DOMAIN/"
for i in $(seq 1 30); do
  if curl -skf "$CHECK_URL" -o /dev/null || curl -sf http://localhost/ -o /dev/null; then ok "Site no ar"; break; fi
  sleep 2
  [ "$i" = "30" ] && { err "App não respondeu em 60s"; docker compose logs --tail=30 app; exit 1; }
done

echo
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║              ✓ INSTALAÇÃO CONCLUÍDA               ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo
if [ -n "$SSL_DOMAIN" ]; then
  echo -e "${BOLD}Acesse:${NC} https://$SSL_DOMAIN"
else
  echo -e "${BOLD}Acesse:${NC} http://$(hostname -I | awk '{print $1}')"
fi
echo
