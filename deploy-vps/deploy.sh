#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Atualização rápida (use após mudanças na Lovable)
# =============================================================================
# Uso (na VPS, dentro de /opt/liberty-pharma):
#   bash deploy-vps/deploy.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()  { echo -e "${GREEN}[ OK ]${NC} $*"; }
err() { echo -e "${RED}[ERR ]${NC} $*" >&2; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
BRANCH="${BRANCH:-main}"
ENV_FILE="$APP_DIR/.env"

[ -f "$ENV_FILE" ] || { err "Arquivo $ENV_FILE não encontrado. Atualização bloqueada para não usar credenciais do repositório."; exit 1; }

ENV_BACKUP="$(mktemp)"
cp "$ENV_FILE" "$ENV_BACKUP"
cleanup() { rm -f "$ENV_BACKUP"; }
trap cleanup EXIT

cd "$APP_DIR"

log "Protegendo .env local antes de atualizar o código..."
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  git update-index --skip-worktree .env >/dev/null 2>&1 || true
fi
git config --local core.excludesfile .git/info/exclude
grep -qxF '.env' .git/info/exclude 2>/dev/null || echo '.env' >> .git/info/exclude
ok ".env local preservado"

log "Puxando últimas alterações de origin/$BRANCH..."
git fetch origin "$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet
ok "Código atualizado"

cp "$ENV_BACKUP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok ".env do cliente restaurado após o git reset"

log "Rebuilding imagem Docker..."
docker compose build app

log "Reiniciando container (sem downtime perceptível)..."
docker compose up -d --no-deps --force-recreate app

log "Validando healthcheck..."
for i in $(seq 1 20); do
  if curl -sf http://localhost/ -o /dev/null; then
    ok "Aplicação respondendo ✓"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

err "Aplicação não respondeu em 40s. Logs:"
docker compose logs --tail=50 app
exit 1
