#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador mínimo (app + Supabase)
# Apenas 4 variáveis: SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, SUPABASE_WEBHOOK_SECRET
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
valid_seckey() { [[ "$1" =~ ^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]{20,})$ ]]; }
valid_dburl()  { [[ "$1" =~ ^postgres(ql)?://[^[:space:]]+$ ]]; }
valid_any()    { [ -n "$1" ]; }

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

# --- Etapa 1: Variáveis Supabase (apenas 4) ---
echo -e "${BOLD}━━━ Etapa 1/3 · Variáveis do Supabase ━━━${NC}"
echo -e "${YELLOW}Pegue tudo em: Supabase Dashboard → Project Settings${NC}"
SUPA_URL=$(ask        "SUPABASE_URL"             valid_url    "Ex: https://xxxxxxxxxxxx.supabase.co (Project Settings → API)")
SUPA_SECRET=$(ask_secret "SUPABASE_SECRET_KEY"   valid_seckey "Service Role / Secret Key (sb_secret_... ou eyJ...). NUNCA exponha no frontend.")
SUPA_DBURL=$(ask_secret  "DATABASE_URL"          valid_dburl  "Connection string Postgres (Settings → Database → URI). Use o pooler na 6543 para serverless.")
SUPA_WHSEC=$(ask_secret  "SUPABASE_WEBHOOK_SECRET" valid_any  "Segredo compartilhado para validar webhooks do Supabase (Database → Webhooks).")

PROJECT_ID=$(echo "$SUPA_URL" | sed -E 's|https://([^.]+)\.supabase\.co/?|\1|')

echo
echo -e "${BOLD}━━━ Revisão ━━━${NC}"
echo "  SUPABASE_URL            : $SUPA_URL"
echo "  SUPABASE_SECRET_KEY     : ${SUPA_SECRET:0:14}…"
echo "  DATABASE_URL            : configurado"
echo "  SUPABASE_WEBHOOK_SECRET : configurado"
echo
read -r -p "Confirmar e instalar? [s/N] " CONFIRM
CONFIRM="$(clean "$CONFIRM")"
[[ "$CONFIRM" =~ ^[sSyY]$ ]] || { warn "Cancelado."; exit 0; }

# --- Etapa 2: Repo + Docker ---
echo
echo -e "${BOLD}━━━ Etapa 2/3 · Repositório e Docker ━━━${NC}"

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

{
  echo "# === Vite (frontend) ==="
  echo "VITE_SUPABASE_URL=$SUPA_URL"
  echo "VITE_SUPABASE_PROJECT_ID=$PROJECT_ID"
  echo
  echo "# === Backend (Edge Functions / scripts) ==="
  echo "SUPABASE_URL=$SUPA_URL"
  echo "SUPABASE_SECRET_KEY=$SUPA_SECRET"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPA_SECRET"
  echo "DATABASE_URL=$SUPA_DBURL"
  echo "SUPABASE_WEBHOOK_SECRET=$SUPA_WHSEC"
} > "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
ok ".env criado com $(grep -c '=' "$APP_DIR/.env") variáveis"

unset SUPA_SECRET SUPA_DBURL SUPA_WHSEC

log "Buildando imagem (pode levar 2-4 min)..."
docker compose build app || { err "Build falhou. Veja o erro acima."; exit 1; }
log "Subindo container..."
docker compose up -d || { err "docker compose up falhou."; docker compose logs --tail=50 app || true; exit 1; }

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
echo -e "${YELLOW}SSL (HTTPS):${NC} aponte o DNS para esta VPS e rode:"
echo "  sudo bash $APP_DIR/deploy-vps/issue-ssl.sh seudominio.com seu@email.com"
echo
