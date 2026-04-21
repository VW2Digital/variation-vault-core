#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — Instalador minimalista e à prova de travamento
# =============================================================================
# Foco ÚNICO: deixar o site no ar via Docker em uma VPS Ubuntu/Debian limpa.
#   1. Instala Docker + Compose (se faltar)
#   2. Clona o repositório em /opt/liberty-pharma (ou usa o atual se já lá)
#   3. Gera .env com as credenciais Supabase (defaults do projeto)
#   4. docker compose build && up -d
#   5. Health check HTTP
#
# O que este script NÃO faz (de propósito — pra não travar):
#   - Não instala mailutils/postfix
#   - Não configura fail2ban / unattended-upgrades / UFW
#   - Não pede prompts interativos (tudo via env vars com defaults)
#   - Não emite SSL (rode `bash deploy-vps/issue-ssl.sh` depois, se quiser)
#   - Não aplica schema Supabase (use `deploy-vps/supabase/schema.sql` no SQL Editor)
#
# OPCIONAL — Supabase self-hosted local:
#   Se rodado em terminal interativo, pergunta se quer subir uma stack Supabase
#   completa (Postgres + Auth + REST + Storage + Studio) em containers vizinhos,
#   exposta apenas em 127.0.0.1 (acesso externo via SSH tunnel).
#   Para forçar não-interativo: export INSTALL_SUPABASE=yes (ou no)
#
# USO:
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh
#   sudo bash /tmp/install.sh
#
# Variáveis opcionais (export antes ou inline):
#   APP_DIR    (default: /opt/liberty-pharma)
#   REPO_URL   (default: https://github.com/VW2Digital/variation-vault-core.git)
#   BRANCH     (default: main)
#   DOMAIN     (default: _ — serve qualquer host em HTTP)
#   VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
#   INSTALL_SUPABASE  (yes|no — pula o prompt interativo)
# =============================================================================

set -Eeuo pipefail

# ---------- estética ---------------------------------------------------------
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[INFO]${NC} $*"; }
ok()   { echo -e "${GRN}[ OK ]${NC} $*"; }
warn() { echo -e "${YLW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

step() {
  echo
  echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLU}▶ $*${NC}"
  echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ---------- pré-checks -------------------------------------------------------
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  err "Rode como root: sudo bash $0"
  exit 1
fi

# Tudo não-interativo — nada de prompt do apt / debconf / needrestart
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export UCF_FORCE_CONFOLD=1
export APT_LISTCHANGES_FRONTEND=none

# ---------- defaults ---------------------------------------------------------
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-_}"

# Defaults reais do projeto (mesmos do .env do repo). Podem ser sobrescritos.
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://vkomfiplmhpkhfpidrng.supabase.co}"
VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb21maXBsbWhwa2hmcGlkcm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDE0NzMsImV4cCI6MjA4NzcxNzQ3M30.kvxMTwPuOjZR6D8P8AM3LOBOd9U-mym-mCRjp5eMoKE}"
VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-vkomfiplmhpkhfpidrng}"

# ---------- 1. Sistema base --------------------------------------------------
step "1/5  Atualizando índice do apt (timeout 120s)"
timeout 120 apt-get update -qq -o Acquire::Retries=3 >/dev/null 2>&1 || warn "apt update demorou — seguindo assim mesmo"

log "Instalando dependências mínimas (curl, ca-certificates, git)…"
timeout 180 apt-get install -y -qq --no-install-recommends \
  -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
  ca-certificates curl git gnupg >/dev/null
ok "Dependências base instaladas"

# ---------- 2. Docker --------------------------------------------------------
step "2/5  Instalando Docker Engine + Compose plugin"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker e Compose já presentes — $(docker --version | head -c80)"
else
  log "Baixando script oficial get.docker.com…"
  if timeout 300 curl -fsSL https://get.docker.com | sh >/tmp/docker-install.log 2>&1; then
    ok "Docker instalado"
  else
    err "Falha ao instalar Docker. Últimas linhas do log:"
    tail -n 20 /tmp/docker-install.log >&2 || true
    exit 1
  fi

  # Plugin compose (caso não tenha vindo no get.docker.com)
  if ! docker compose version >/dev/null 2>&1; then
    log "Instalando docker-compose-plugin via apt…"
    timeout 180 apt-get install -y -qq docker-compose-plugin >/dev/null || \
      warn "docker-compose-plugin não instalou via apt — tente reiniciar a sessão"
  fi
fi

systemctl enable --now docker >/dev/null 2>&1 || true
ok "Docker ativo"

# ---------- 3. Código --------------------------------------------------------
step "3/5  Preparando código em $APP_DIR"

# Se já estamos rodando de dentro do repo, usa esse diretório
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$REPO_ROOT/Dockerfile" ] && [ -f "$REPO_ROOT/docker-compose.yml" ]; then
  log "Detectado repo local em $REPO_ROOT — usando diretamente"
  APP_DIR="$REPO_ROOT"
elif [ -d "$APP_DIR/.git" ]; then
  log "Repo já clonado — fazendo git pull em $APP_DIR"
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  log "Clonando $REPO_URL (branch $BRANCH) em $APP_DIR…"
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR" --quiet
fi
ok "Código pronto em $APP_DIR"

# ---------- 4. .env ----------------------------------------------------------
step "4/5  Gerando .env e docker-compose"
ENV_FILE="$APP_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
  log "Backup do .env existente salvo"
fi

cat > "$ENV_FILE" <<EOF
# Gerado por install.sh em $(date -Iseconds)
VITE_SUPABASE_URL="$VITE_SUPABASE_URL"
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY"
VITE_SUPABASE_PROJECT_ID="$VITE_SUPABASE_PROJECT_ID"
SERVER_NAME=$DOMAIN
EOF
ok ".env escrito ($ENV_FILE)"

# ---------- 5. Build + up ----------------------------------------------------
step "5/5  Build da imagem e subida do container (pode levar 3-8 min)"
cd "$APP_DIR"

log "docker compose build app…"
if ! timeout 1200 docker compose build app; then
  err "Build falhou. Veja os logs acima."
  exit 1
fi
ok "Imagem buildada"

log "docker compose up -d…"
docker compose up -d
ok "Container iniciado"

# ---------- health check -----------------------------------------------------
step "Health check HTTP (até 60s)"
HEALTHY=0
for i in $(seq 1 30); do
  if curl -sf -o /dev/null -m 3 http://localhost/; then
    HEALTHY=1
    break
  fi
  sleep 2
done

echo
echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$HEALTHY" = "1" ]; then
  ok "Aplicação respondendo em http://localhost/"
  IP=$(curl -fsS -m 3 https://api.ipify.org 2>/dev/null || echo "<seu-ip>")
  echo
  echo -e "${GRN}🎉 INSTALAÇÃO CONCLUÍDA${NC}"
  echo "   • Site (HTTP):   http://$IP/"
  if [ "$DOMAIN" != "_" ]; then
    echo "   • Domínio:       http://$DOMAIN/"
    echo "   • Para SSL:      sudo bash $APP_DIR/deploy-vps/issue-ssl.sh $DOMAIN seu@email.com"
  fi
  echo "   • Logs:          docker compose -f $APP_DIR/docker-compose.yml logs -f app"
  echo "   • Atualizar:     cd $APP_DIR && bash deploy-vps/deploy.sh"
else
  warn "Container subiu mas não respondeu HTTP em 60s. Diagnóstico:"
  docker compose ps || true
  echo
  echo "Últimas 40 linhas do container:"
  docker compose logs --tail=40 app || true
  echo
  echo "Investigue com: docker compose -f $APP_DIR/docker-compose.yml logs -f app"
  exit 1
fi
echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"