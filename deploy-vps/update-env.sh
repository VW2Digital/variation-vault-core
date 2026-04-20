#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — Editor de variáveis do .env (sem reinstalar)
# =============================================================================
# Uso (na VPS):
#   sudo bash deploy-vps/update-env.sh
#
# O script lê o .env existente, mostra cada variável (mascarando segredos)
# e permite manter (ENTER), alterar (digitar novo valor) ou remover (digitar -).
# Ao final, faz backup do .env antigo e reinicia o container Docker.
# =============================================================================

set -euo pipefail
printf '\e[?2004l' 2>/dev/null || true

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
ENV_FILE="$APP_DIR/.env"

[ "$(id -u)" -eq 0 ] || { err "Rode como root: sudo bash $0"; exit 1; }
[ -f "$ENV_FILE" ] || { err "Arquivo $ENV_FILE não existe. Rode antes: bash deploy-vps/install.sh"; exit 1; }

clean() {
  printf '%s' "$1" \
    | sed -E 's/\x1B\[\??2?0?0?[0-9]*[~hl]//g' \
    | tr -d '\r' \
    | sed -E "s/^['\"[:space:]]+//; s/['\"[:space:]]+$//"
}

is_secret() {
  case "$1" in
    *SERVICE_ROLE*|*SECRET*|*PASSWORD*|*TOKEN*|*DATABASE_URL*) return 0 ;;
    *) return 1 ;;
  esac
}

mask() {
  local v="$1"
  local len=${#v}
  if [ "$len" -le 8 ]; then echo "********"
  else echo "${v:0:4}…${v: -4} (${len} chars)"
  fi
}

clear
echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║   Liberty Pharma — Editor do .env                 ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${YELLOW}Para cada variável:${NC}"
echo -e "  ${BOLD}ENTER${NC}        → manter o valor atual"
echo -e "  ${BOLD}novo valor${NC}   → substituir"
echo -e "  ${BOLD}-${NC}            → remover a variável"
echo

# Variáveis conhecidas/recomendadas. Outras encontradas no .env serão preservadas.
KNOWN_KEYS=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_PROJECT_ID
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  DATABASE_URL
  SUPABASE_WEBHOOK_SECRET
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
)

# Carrega .env atual em um array associativo
declare -A CURRENT
ORDER=()
while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="$(clean "$key")"
  [ -z "$key" ] && continue
  CURRENT["$key"]="$val"
  ORDER+=("$key")
done < "$ENV_FILE"

# Garante que as KNOWN_KEYS apareçam mesmo se ausentes (para permitir adicionar)
for k in "${KNOWN_KEYS[@]}"; do
  if [ -z "${CURRENT[$k]+x}" ]; then
    CURRENT["$k"]=""
    ORDER+=("$k")
  fi
done

declare -A NEW
for key in "${ORDER[@]}"; do
  current="${CURRENT[$key]:-}"
  if [ -n "$current" ]; then
    if is_secret "$key"; then
      display="$(mask "$current")"
    else
      display="$current"
    fi
    echo -e "${BOLD}${key}${NC} ${YELLOW}[atual: ${display}]${NC}"
  else
    echo -e "${BOLD}${key}${NC} ${YELLOW}[não definido]${NC}"
  fi

  if is_secret "$key"; then
    read -r -s -p "› " val; echo
  else
    read -r -p "› " val
  fi
  val="$(clean "${val:-}")"

  if [ "$val" = "-" ]; then
    NEW["$key"]="__REMOVE__"
    warn "  → será removida"
  elif [ -z "$val" ]; then
    NEW["$key"]="$current"
  else
    NEW["$key"]="$val"
    ok "  → atualizada"
  fi
  echo
done

# Backup
BACKUP="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
ok "Backup salvo em $BACKUP"

# Reescreve .env preservando ordem e seções
SUPA_URL="${NEW[SUPABASE_URL]:-${NEW[VITE_SUPABASE_URL]:-}}"
PROJECT_ID=""
[ -n "$SUPA_URL" ] && PROJECT_ID=$(echo "$SUPA_URL" | sed -E 's|https://([^.]+)\.supabase\.co/?|\1|')
[ -n "$PROJECT_ID" ] && [ -z "${NEW[VITE_SUPABASE_PROJECT_ID]:-}" ] && NEW[VITE_SUPABASE_PROJECT_ID]="$PROJECT_ID"

write_var() {
  local k="$1"
  local v="${NEW[$k]:-}"
  [ "$v" = "__REMOVE__" ] && return 0
  [ -z "$v" ] && return 0
  echo "$k=$v"
}

{
  echo "# === Vite (frontend) ==="
  write_var VITE_SUPABASE_URL
  write_var VITE_SUPABASE_PUBLISHABLE_KEY
  write_var VITE_SUPABASE_PROJECT_ID
  echo
  echo "# === Supabase canônico (Edge Functions / backend) ==="
  write_var SUPABASE_URL
  write_var SUPABASE_ANON_KEY
  write_var SUPABASE_SERVICE_ROLE_KEY
  write_var DATABASE_URL
  write_var SUPABASE_WEBHOOK_SECRET
  echo
  echo "# === Compatibilidade Next.js ==="
  write_var NEXT_PUBLIC_SUPABASE_URL
  write_var NEXT_PUBLIC_SUPABASE_ANON_KEY

  # Outras chaves customizadas presentes no .env original
  EXTRA_PRINTED=0
  for key in "${ORDER[@]}"; do
    skip=0
    for k in "${KNOWN_KEYS[@]}"; do [ "$key" = "$k" ] && skip=1 && break; done
    [ "$skip" -eq 1 ] && continue
    v="${NEW[$key]:-}"
    [ "$v" = "__REMOVE__" ] && continue
    [ -z "$v" ] && continue
    if [ "$EXTRA_PRINTED" -eq 0 ]; then
      echo
      echo "# === Outras variáveis ==="
      EXTRA_PRINTED=1
    fi
    echo "$key=$v"
  done
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok ".env atualizado ($(grep -c '=' "$ENV_FILE") variáveis ativas)"

# Reinicia container se docker compose existir
if [ -f "$APP_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
  echo
  read -r -p "Reiniciar container agora para aplicar mudanças? [S/n] " R
  R="$(clean "${R:-s}")"
  if [[ "$R" =~ ^[sSyY]$ ]]; then
    cd "$APP_DIR"
    log "Rebuilding e reiniciando app..."
    docker compose build app
    docker compose up -d --no-deps --force-recreate app
    log "Validando healthcheck..."
    for i in $(seq 1 20); do
      if curl -sf http://localhost/ -o /dev/null; then
        ok "Aplicação respondendo ✓"
        exit 0
      fi
      sleep 2
    done
    err "Aplicação não respondeu em 40s. Veja: docker compose logs --tail=50 app"
    exit 1
  else
    warn "Mudanças aplicadas no .env, mas o container ainda usa o valor antigo."
    warn "Rode: cd $APP_DIR && docker compose up -d --force-recreate app"
  fi
fi

ok "Concluído."