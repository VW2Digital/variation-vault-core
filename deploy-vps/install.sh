#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador SIMPLES (site + Supabase já existente)
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

valid_domain()  { [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]]; }
valid_email()   { [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; }
valid_url()     { [[ "$1" =~ ^https://[a-zA-Z0-9.-]+\.supabase\.co/?$ ]]; }
valid_pubkey()  { [[ "$1" =~ ^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]{20,})$ ]]; }
valid_seckey()  { [[ "$1" =~ ^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]{20,})$ ]]; }
valid_pass()    { [ "${#1}" -ge 8 ]; }

ask() {
  local prompt="$1" validator="$2" hint="$3" var
  while true; do
    echo >&2
    echo -e "${BOLD}${prompt}${NC}" >&2
    [ -n "$hint" ] && echo -e "${YELLOW}↳ ${hint}${NC}" >&2
    read -r -p "› " var
    var="$(clean "$var")"
    if [ -z "$var" ]; then err "Valor vazio."; continue; fi
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
    if [ -z "$var" ]; then err "Valor vazio."; continue; fi
    if $validator "$var"; then echo "$var"; return 0; fi
    err "Formato inválido (mínimo 8 caracteres para senha)."
  done
}

clear
echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Liberty Pharma — Instalador (Site + Supabase + Admin)    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Pré-requisito: rode antes deploy-vps/supabase/schema.sql no SQL Editor."
echo

if [ "$(id -u)" -ne 0 ]; then err "Rode como root: sudo bash $0"; exit 1; fi
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

if [ ! -f "$APP_DIR/Dockerfile" ]; then
  log "Repositório não encontrado em $APP_DIR — clonando de $REPO_URL..."
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }
  mkdir -p "$(dirname "$APP_DIR")"
  if [ -d "$APP_DIR" ] && [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    rmdir "$APP_DIR"
  fi
  git clone --depth 1 -b "$REPO_BRANCH" "$REPO_URL" "${APP_DIR}.tmp"
  if [ -d "$APP_DIR" ]; then
    cp -rn "${APP_DIR}.tmp/." "$APP_DIR/"
    rm -rf "${APP_DIR}.tmp"
  else
    mv "${APP_DIR}.tmp" "$APP_DIR"
  fi
  ok "Repositório clonado em $APP_DIR"
fi
cd "$APP_DIR"

echo -e "${BOLD}━━━ Etapa 1/5 · Site ━━━${NC}"
DOMAIN=$(ask "Domínio do site (ex: store.pharmaliberty.com)" valid_domain \
  "Sem https:// e sem barra. Aponte o A record para o IP desta VPS antes.")
EMAIL=$(ask "E-mail para o certificado SSL" valid_email \
  "Usado só para avisos do Let's Encrypt.")

echo
echo -e "${BOLD}━━━ Etapa 2/5 · Supabase ━━━${NC}"
SUPA_URL=$(ask "VITE_SUPABASE_URL" valid_url "Ex: https://xxxxxxxxxxxx.supabase.co")
SUPA_KEY=$(ask "VITE_SUPABASE_PUBLISHABLE_KEY" valid_pubkey \
  "Pública (sb_publishable_... ou eyJ...).")
SUPA_SECRET=$(ask_secret "SUPABASE_SERVICE_ROLE_KEY" valid_seckey \
  "SECRETA. Usada só agora para criar o admin. Não fica salva em disco.")

echo
echo -e "${BOLD}━━━ Etapa 3/5 · Usuário admin ━━━${NC}"
ADMIN_EMAIL=$(ask "E-mail do admin" valid_email "Será o login no painel /admin.")
ADMIN_PASS=$(ask_secret "Senha do admin (mín. 8 caracteres)" valid_pass \
  "Você usará para entrar em /admin.")

echo
echo -e "${BOLD}━━━ Revisão ━━━${NC}"
echo "  Domínio   : $DOMAIN"
echo "  Email SSL : $EMAIL"
echo "  Supabase  : $SUPA_URL"
echo "  Admin     : $ADMIN_EMAIL"
echo
read -r -p "Confirmar e iniciar? [s/N] " CONFIRM
CONFIRM="$(clean "$CONFIRM")"
[[ "$CONFIRM" =~ ^[sSyY]$ ]] || { warn "Cancelado."; exit 0; }

echo
log "Criando usuário admin no Supabase..."
CREATE_RESP=$(curl -s -X POST "$SUPA_URL/auth/v1/admin/users" \
  -H "apikey: $SUPA_SECRET" \
  -H "Authorization: Bearer $SUPA_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}")

ADMIN_UUID=$(echo "$CREATE_RESP" | grep -oE '"id":"[a-f0-9-]{36}"' | head -1 | cut -d'"' -f4)

if [ -z "$ADMIN_UUID" ]; then
  if echo "$CREATE_RESP" | grep -qiE 'already|registered|exists'; then
    warn "Usuário já existe. Buscando UUID..."
    LIST_RESP=$(curl -s "$SUPA_URL/auth/v1/admin/users?email=$ADMIN_EMAIL" \
      -H "apikey: $SUPA_SECRET" -H "Authorization: Bearer $SUPA_SECRET")
    ADMIN_UUID=$(echo "$LIST_RESP" | grep -oE '"id":"[a-f0-9-]{36}"' | head -1 | cut -d'"' -f4)
  fi
fi

if [ -z "$ADMIN_UUID" ]; then
  err "Falha ao criar/localizar admin. Resposta: $CREATE_RESP"
  exit 1
fi
ok "Admin pronto (UUID: ${ADMIN_UUID:0:8}…)"

log "Atribuindo role 'admin' em public.user_roles..."
ROLE_RESP=$(curl -s -X POST "$SUPA_URL/rest/v1/user_roles" \
  -H "apikey: $SUPA_SECRET" \
  -H "Authorization: Bearer $SUPA_SECRET" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"user_id\":\"$ADMIN_UUID\",\"role\":\"admin\"}")

if echo "$ROLE_RESP" | grep -qiE 'error|message'; then
  if echo "$ROLE_RESP" | grep -qiE 'duplicate|unique|exists'; then
    ok "Role admin já estava atribuída"
  else
    err "Falha ao inserir role: $ROLE_RESP"
    err "Tabela public.user_roles existe? Rodou o schema.sql antes?"
    exit 1
  fi
else
  ok "Role admin atribuída"
fi

unset SUPA_SECRET ADMIN_PASS

echo
echo -e "${BOLD}━━━ Etapa 4/5 · Docker ━━━${NC}"
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

PROJECT_ID=$(echo "$SUPA_URL" | sed -E 's|https://([^.]+)\.supabase\.co/?|\1|')
cat > "$APP_DIR/.env" <<EOF
VITE_SUPABASE_URL=$SUPA_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPA_KEY
VITE_SUPABASE_PROJECT_ID=$PROJECT_ID
EOF
chmod 600 "$APP_DIR/.env"
ok ".env criado"

log "Buildando imagem (2-4 min)..."
docker compose build app
log "Subindo container..."
docker compose up -d

log "Aguardando aplicação..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/ -o /dev/null; then ok "Site no ar"; break; fi
  sleep 2
  [ "$i" = "30" ] && { err "App não respondeu em 60s"; docker compose logs --tail=30 app; exit 1; }
done

echo
echo -e "${BOLD}━━━ Etapa 5/5 · SSL ━━━${NC}"
command -v certbot >/dev/null 2>&1 || { log "Instalando Certbot..."; apt-get install -y -qq certbot; }

log "Parando container para liberar porta 80..."
docker compose stop app

if certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive; then
  ok "Certificado emitido"
else
  warn "Falha SSL. Rode depois: certbot certonly --standalone -d $DOMAIN"
fi

docker compose up -d

if [ ! -f /etc/cron.d/liberty-ssl-renew ]; then
  cat > /etc/cron.d/liberty-ssl-renew <<EOF
0 3 * * * root certbot renew --quiet --pre-hook "cd $APP_DIR && docker compose stop app" --post-hook "cd $APP_DIR && docker compose up -d"
EOF
  ok "Renovação SSL agendada (03:00 diário)"
fi

echo
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║                  ✓ INSTALAÇÃO CONCLUÍDA                    ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${BOLD}Site:${NC}  https://$DOMAIN"
echo -e "${BOLD}Admin:${NC} https://$DOMAIN/admin · login: $ADMIN_EMAIL"
echo
