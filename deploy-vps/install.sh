#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador automático (App + Supabase)
# =============================================================================
# O usuário fornece apenas:
#   1. Personal Access Token  (https://supabase.com/dashboard/account/tokens)
#   2. Project Ref            (xxxxxxxxxxxxx em xxxxxxxxxxxxx.supabase.co)
#
# O script descobre automaticamente via Management API:
#   - SUPABASE_URL
#   - SUPABASE_ANON_KEY (publishable)
#   - SUPABASE_SECRET_KEY (service_role)
#   - DATABASE_URL (pooler)
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

valid_pat()    { [[ "$1" =~ ^sbp_[A-Za-z0-9_]{20,}$ ]]; }
valid_ref()    { [[ "$1" =~ ^[a-z0-9]{20}$ ]]; }
valid_secret() { [ -n "$1" ]; }

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

# ============================================================================
# Pré-requisitos básicos
# ============================================================================
clear
echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║   Liberty Pharma — Instalador Automático          ║"
echo "║   (descobre tudo via Supabase Management API)     ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"

[ "$(id -u)" -eq 0 ] || { err "Rode como root: sudo bash $0"; exit 1; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

# Garante curl e jq (precisamos de jq pra parsear resposta da API)
need_pkgs=()
command -v curl >/dev/null 2>&1 || need_pkgs+=(curl)
command -v jq   >/dev/null 2>&1 || need_pkgs+=(jq)
if [ ${#need_pkgs[@]} -gt 0 ]; then
  log "Instalando dependências: ${need_pkgs[*]}..."
  apt-get update -qq
  apt-get install -y -qq "${need_pkgs[@]}"
fi

# ============================================================================
# Etapa 1: Coleta credencial mínima
# ============================================================================
echo -e "${BOLD}━━━ Etapa 1/4 · Credenciais Supabase ━━━${NC}"
echo -e "${YELLOW}Você precisa de apenas 2 coisas:${NC}"
echo -e "  ${YELLOW}1.${NC} Personal Access Token  → https://supabase.com/dashboard/account/tokens"
echo -e "  ${YELLOW}2.${NC} Project Ref            → URL do projeto: https://supabase.com/dashboard/project/${BOLD}<ESTE-AQUI>${NC}"
echo

PAT=$(ask_secret "SUPABASE_ACCESS_TOKEN (Personal Access Token)" valid_pat "Começa com sbp_... Crie em supabase.com/dashboard/account/tokens (escopo: All)")
PROJECT_REF=$(ask "PROJECT_REF (20 caracteres, ex: abcdefghijklmnopqrst)" valid_ref "Pegue da URL do dashboard do projeto")

# ============================================================================
# Etapa 2: Descoberta automática via Management API
# ============================================================================
echo
echo -e "${BOLD}━━━ Etapa 2/4 · Descobrindo configurações ━━━${NC}"

API_BASE="https://api.supabase.com/v1"
AUTH_HEADER="Authorization: Bearer $PAT"

http_get() {
  local path="$1"
  local resp http_code body
  resp=$(curl -sS -w '\n__HTTP__%{http_code}' -H "$AUTH_HEADER" -H "Accept: application/json" "$API_BASE$path")
  http_code=$(echo "$resp" | sed -n 's/^__HTTP__//p' | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [ "$http_code" != "200" ]; then
    err "API retornou HTTP $http_code em $path"
    echo "$body" >&2
    return 1
  fi
  echo "$body"
}

# 2.1 — Verifica acesso ao projeto
log "Validando token e ref..."
PROJ_JSON=$(http_get "/projects/$PROJECT_REF") || {
  err "Token inválido ou ref incorreto. Confirme em supabase.com/dashboard/account/tokens"
  exit 1
}
PROJ_NAME=$(echo "$PROJ_JSON" | jq -r '.name // "?"')
PROJ_REGION=$(echo "$PROJ_JSON" | jq -r '.region // "?"')
ok "Projeto: $PROJ_NAME ($PROJ_REGION)"

# 2.2 — Pega API keys (anon + service_role)
log "Buscando API keys..."
KEYS_JSON=$(http_get "/projects/$PROJECT_REF/api-keys") || exit 1
SUPA_ANON=$(echo "$KEYS_JSON" | jq -r '.[] | select(.name=="anon") | .api_key' | head -n1)
SUPA_SECRET=$(echo "$KEYS_JSON" | jq -r '.[] | select(.name=="service_role") | .api_key' | head -n1)
[ -n "$SUPA_ANON" ] && [ "$SUPA_ANON" != "null" ] || { err "Não consegui obter a anon key."; exit 1; }
[ -n "$SUPA_SECRET" ] && [ "$SUPA_SECRET" != "null" ] || { err "Não consegui obter a service_role key."; exit 1; }
ok "API keys obtidas (anon + service_role)"

# 2.3 — Monta URLs
SUPA_URL="https://${PROJECT_REF}.supabase.co"

# 2.4 — Database URL (pooler) — pede senha do banco (Supabase NÃO expõe via API por segurança)
echo
warn "A senha do banco Postgres não pode ser obtida via API por segurança."
warn "Pegue em: Supabase Dashboard → Project Settings → Database → Database password"
echo
SUPA_DBPASS=$(ask_secret "DATABASE_PASSWORD" valid_secret "Senha do Postgres do projeto. Se esqueceu, gere uma nova no painel.")

# Pooler hostname — Supabase usa aws-0-<region>.pooler.supabase.com
# Mas o ref vai no usuário: postgres.<ref>:senha@aws-0-<region>.pooler.supabase.com:6543/postgres
POOLER_REGION=$(echo "$PROJ_REGION" | tr '_' '-' | tr '[:upper:]' '[:lower:]')
SUPA_DBURL="postgresql://postgres.${PROJECT_REF}:${SUPA_DBPASS}@aws-0-${POOLER_REGION}.pooler.supabase.com:6543/postgres"
ok "DATABASE_URL montada (pooler na 6543)"

# 2.5 — Webhook secret: gera automaticamente
SUPA_WHSEC=$(openssl rand -hex 32)
ok "SUPABASE_WEBHOOK_SECRET gerado automaticamente (use este valor ao configurar webhooks no dashboard)"

# ============================================================================
# Revisão
# ============================================================================
echo
echo -e "${BOLD}━━━ Revisão ━━━${NC}"
echo "  Projeto      : $PROJ_NAME"
echo "  SUPABASE_URL : $SUPA_URL"
echo "  Anon Key     : ${SUPA_ANON:0:14}…"
echo "  Secret Key   : ${SUPA_SECRET:0:14}…"
echo "  DATABASE_URL : postgresql://postgres.${PROJECT_REF}:****@aws-0-${POOLER_REGION}.pooler.supabase.com:6543/postgres"
echo "  Webhook Sec  : ${SUPA_WHSEC:0:14}… (gerado)"
echo
read -r -p "Confirmar e instalar? [s/N] " CONFIRM
CONFIRM="$(clean "$CONFIRM")"
[[ "$CONFIRM" =~ ^[sSyY]$ ]] || { warn "Cancelado."; exit 0; }

# ============================================================================
# Etapa 3: Repo + Docker
# ============================================================================
echo
echo -e "${BOLD}━━━ Etapa 3/4 · Repositório e Docker ━━━${NC}"

if [ ! -f "$APP_DIR/Dockerfile" ]; then
  log "Clonando repositório em $APP_DIR..."
  command -v git >/dev/null 2>&1 || apt-get install -y -qq git
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

# ============================================================================
# Etapa 4: .env + build
# ============================================================================
echo
echo -e "${BOLD}━━━ Etapa 4/4 · Configuração e build ━━━${NC}"

{
  echo "# === Vite (frontend) ==="
  echo "VITE_SUPABASE_URL=$SUPA_URL"
  echo "VITE_SUPABASE_PUBLISHABLE_KEY=$SUPA_ANON"
  echo "VITE_SUPABASE_PROJECT_ID=$PROJECT_REF"
  echo
  echo "# === Backend (Edge Functions / scripts) ==="
  echo "SUPABASE_URL=$SUPA_URL"
  echo "SUPABASE_ANON_KEY=$SUPA_ANON"
  echo "SUPABASE_SECRET_KEY=$SUPA_SECRET"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPA_SECRET"
  echo "DATABASE_URL=$SUPA_DBURL"
  echo "SUPABASE_WEBHOOK_SECRET=$SUPA_WHSEC"
  echo
  echo "# === Compatibilidade Next.js ==="
  echo "NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPA_ANON"
} > "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
ok ".env criado com $(grep -c '=' "$APP_DIR/.env") variáveis"

unset PAT SUPA_SECRET SUPA_DBURL SUPA_DBPASS SUPA_WHSEC

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
echo -e "${YELLOW}Webhook secret gerado:${NC} verifique em $APP_DIR/.env (linha SUPABASE_WEBHOOK_SECRET)"
echo
