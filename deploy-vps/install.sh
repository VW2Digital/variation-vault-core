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

# --- Etapa 3: .env + subir app ---
echo
echo -e "${BOLD}━━━ Etapa 3/3 · Configuração e build ━━━${NC}"

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

log "Buildando imagem (pode levar 2-4 min)..."
docker compose build app
log "Subindo container..."
docker compose up -d

log "Aguardando aplicação responder..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/ -o /dev/null; then ok "Site no ar"; break; fi
  sleep 2
  [ "$i" = "30" ] && { err "App não respondeu em 60s"; docker compose logs --tail=30 app; exit 1; }
done

echo
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║              ✓ INSTALAÇÃO CONCLUÍDA               ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${BOLD}Acesse:${NC} http://$(hostname -I | awk '{print $1}')"
echo
