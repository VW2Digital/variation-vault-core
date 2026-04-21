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
#   SB_PG_USER         (default: postgres)
#   SB_PG_PASSWORD     (default: gerada com openssl rand)
#   SB_PG_DB           (default: postgres)
#   SB_PG_PORT         (default: 5432)
#   SB_PG_CONTAINER    (default: liberty-supabase-db)
#   SB_PG_VOLUME       (default: liberty_supabase_db — volume Docker persistente)
#   SB_STUDIO_PORT     (default: 3001)
#   SB_BIND_HOST       (default: 127.0.0.1 — só localhost, use 0.0.0.0 por sua conta)
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

# ---------- defaults precoces (necessários no preflight) ---------------------
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-_}"

# ---------- parsing de flags -------------------------------------------------
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n)
      DRY_RUN=1
      ;;
    --help|-h)
      sed -n '2,44p' "$0" | sed 's/^# \{0,1\}//'
      echo
      echo "Flags:"
      echo "  --dry-run, -n   Valida pré-requisitos sem instalar nada"
      echo "  --help, -h      Mostra esta ajuda"
      exit 0
      ;;
    *)
      err "Flag desconhecida: $arg (use --help)"
      exit 1
      ;;
  esac
done

# ---------- dry-run: validações de pré-requisitos ----------------------------
# Roda checks read-only e reporta tudo. Sai com 0 se OK, 1 se algo crítico falhou.
# Usado tanto via --dry-run quanto chamável internamente antes de instalar.
run_preflight_checks() {
  step "Pre-flight checks (modo $1)"

  local ERRORS=0
  local WARNS=0

  # ---- 1. Privilégios ----
  log "1. Privilégios"
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    ok "   Rodando como root (uid=0)"
  else
    err "   Não está como root — use 'sudo bash $0'"
    ERRORS=$((ERRORS+1))
  fi

  # ---- 2. Sistema operacional ----
  log "2. Sistema operacional"
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    ok "   $PRETTY_NAME (kernel $(uname -r))"
    case "${ID:-}" in
      ubuntu|debian)
        ok "   Distro suportada (apt-based)"
        ;;
      *)
        warn "   Distro '$ID' não testada — script usa apt, pode falhar"
        WARNS=$((WARNS+1))
        ;;
    esac
  else
    warn "   /etc/os-release não encontrado — distro desconhecida"
    WARNS=$((WARNS+1))
  fi

  # ---- 3. Memória RAM ----
  log "3. Memória RAM"
  local MEM_MB
  MEM_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
  if [ "$MEM_MB" -ge 3500 ]; then
    ok "   ${MEM_MB} MB total (suficiente p/ app + Supabase self-hosted)"
  elif [ "$MEM_MB" -ge 900 ]; then
    ok "   ${MEM_MB} MB total (suficiente p/ app standalone)"
    [ "${INSTALL_SUPABASE:-}" = "yes" ] && {
      warn "   Mas <4 GB — Supabase self-hosted pode ficar instável"
      WARNS=$((WARNS+1))
    }
  else
    err "   ${MEM_MB} MB — abaixo do mínimo de 1024 MB"
    ERRORS=$((ERRORS+1))
  fi

  # ---- 4. Espaço em disco ----
  log "4. Espaço em disco"
  local DISK_GB
  DISK_GB=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -d ' G')
  DISK_GB=${DISK_GB:-0}
  if [ "$DISK_GB" -ge 20 ]; then
    ok "   ${DISK_GB} GB livres em / (suficiente para tudo)"
  elif [ "$DISK_GB" -ge 8 ]; then
    ok "   ${DISK_GB} GB livres (ok p/ app, apertado p/ Supabase local)"
    [ "$DISK_GB" -lt 15 ] && [ "${INSTALL_SUPABASE:-}" = "yes" ] && {
      warn "   Recomendado 20 GB+ se for usar Supabase self-hosted"
      WARNS=$((WARNS+1))
    }
  else
    err "   ${DISK_GB} GB livres — mínimo recomendado 8 GB"
    ERRORS=$((ERRORS+1))
  fi

  # ---- 5. CPU ----
  log "5. CPU"
  local CPU_CORES
  CPU_CORES=$(nproc 2>/dev/null || echo 1)
  if [ "$CPU_CORES" -ge 2 ]; then
    ok "   $CPU_CORES vCPUs"
  else
    warn "   Apenas $CPU_CORES vCPU — build do Vite pode demorar 10+ min"
    WARNS=$((WARNS+1))
  fi

  # ---- 6. Portas obrigatórias (80, 443) ----
  log "6. Portas obrigatórias"
  check_port_free() {
    local port="$1" label="$2" required="$3"
    local in_use=""
    if command -v ss >/dev/null 2>&1; then
      in_use=$(ss -ltnH "sport = :$port" 2>/dev/null | head -1)
    elif command -v netstat >/dev/null 2>&1; then
      in_use=$(netstat -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p {print; exit}')
    fi
    if [ -z "$in_use" ]; then
      ok "   Porta $port ($label) livre"
      return 0
    fi
    # Verifica se quem está ocupando é nosso próprio container (re-execução)
    if command -v docker >/dev/null 2>&1 && \
       docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -qE "liberty.*:$port->"; then
      warn "   Porta $port ($label) ocupada pelo próprio container Liberty (re-execução ok)"
      return 0
    fi
    if [ "$required" = "1" ]; then
      err "   Porta $port ($label) OCUPADA: $in_use"
      ERRORS=$((ERRORS+1))
    else
      warn "   Porta $port ($label) ocupada: $in_use"
      WARNS=$((WARNS+1))
    fi
  }
  check_port_free 80  "HTTP"  1
  check_port_free 443 "HTTPS" 1

  # ---- 7. Porta SSH ----
  log "7. SSH (porta 22)"
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :22" 2>/dev/null | grep -q .; then
    ok "   SSH ativo na porta 22 (você não vai se trancar fora)"
  else
    warn "   Porta 22 não está LISTEN — confirme acesso por outra via antes de continuar"
    WARNS=$((WARNS+1))
  fi

  # ---- 8. Portas opcionais (Supabase) ----
  if [ "${INSTALL_SUPABASE:-}" = "yes" ] || [ "$1" = "verboso" ]; then
    log "8. Portas opcionais (Supabase self-hosted)"
    check_port_free "${SB_PG_PORT:-5432}"     "Postgres" 0
    check_port_free "${SB_STUDIO_PORT:-3001}" "Studio"   0
  fi

  # ---- 9. Docker ----
  log "9. Docker"
  if command -v docker >/dev/null 2>&1; then
    local DV
    DV=$(docker --version 2>/dev/null | head -c80 || echo "?")
    ok "   Docker presente: $DV"
    if docker info >/dev/null 2>&1; then
      ok "   Docker daemon respondendo"
    else
      err "   Docker instalado mas daemon NÃO responde — 'systemctl start docker'"
      ERRORS=$((ERRORS+1))
    fi
    if docker compose version >/dev/null 2>&1; then
      ok "   Compose plugin: $(docker compose version --short 2>/dev/null || echo presente)"
    else
      warn "   docker compose plugin ausente — script tentará instalar via apt"
      WARNS=$((WARNS+1))
    fi
  else
    warn "   Docker não instalado — script tentará instalar via get.docker.com (~2 min)"
    WARNS=$((WARNS+1))
  fi

  # ---- 10. Conectividade externa ----
  log "10. Conectividade externa"
  if curl -fsS -m 5 -o /dev/null https://github.com 2>/dev/null; then
    ok "    GitHub alcançável (clone do repo vai funcionar)"
  else
    err "    Sem acesso a github.com — clone do repo vai falhar"
    ERRORS=$((ERRORS+1))
  fi
  if curl -fsS -m 5 -o /dev/null https://registry-1.docker.io/v2/ 2>/dev/null; then
    ok "    Docker Hub alcançável"
  else
    warn "    Docker Hub fora — pull de imagens pode falhar"
    WARNS=$((WARNS+1))
  fi

  # ---- 11. Comandos auxiliares ----
  log "11. Comandos auxiliares"
  for cmd in curl git tar; do
    if command -v "$cmd" >/dev/null 2>&1; then
      ok "    $cmd: $(command -v "$cmd")"
    else
      warn "    $cmd ausente — script instalará via apt"
      WARNS=$((WARNS+1))
    fi
  done

  # ---- 12. Permissões em $APP_DIR ----
  log "12. Permissões em $APP_DIR"
  if [ -d "$APP_DIR" ]; then
    if [ -w "$APP_DIR" ]; then
      ok "    $APP_DIR existe e é gravável"
    else
      err "    $APP_DIR existe mas NÃO é gravável"
      ERRORS=$((ERRORS+1))
    fi
  else
    local PARENT
    PARENT=$(dirname "$APP_DIR")
    if [ -w "$PARENT" ]; then
      ok "    $APP_DIR não existe; pai $PARENT é gravável (será criado)"
    else
      err "    Não posso criar $APP_DIR — pai $PARENT não é gravável"
      ERRORS=$((ERRORS+1))
    fi
  fi

  # ---- Resumo ----
  echo
  echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  if [ "$ERRORS" -eq 0 ] && [ "$WARNS" -eq 0 ]; then
    echo -e "${GRN}✓ Pre-flight: tudo verde — VPS pronta para instalar${NC}"
  elif [ "$ERRORS" -eq 0 ]; then
    echo -e "${YLW}⚠ Pre-flight: $WARNS aviso(s), nenhum erro crítico — instalação deve funcionar${NC}"
  else
    echo -e "${RED}✗ Pre-flight: $ERRORS erro(s) crítico(s) e $WARNS aviso(s)${NC}"
    echo -e "${RED}  Resolva os erros antes de instalar.${NC}"
  fi
  echo -e "${BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  return "$ERRORS"
}

# Se for dry-run, executa só os checks e sai
if [ "$DRY_RUN" = "1" ]; then
  # Permite rodar sem root pra inspecionar (mas avisa)
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    warn "Rodando dry-run sem root — alguns checks podem ser limitados"
  fi
  if run_preflight_checks "dry-run"; then
    echo
    log "Para instalar de verdade: sudo bash $0"
    exit 0
  else
    echo
    err "Resolva os erros acima e rode 'sudo bash $0 --dry-run' de novo"
    exit 1
  fi
fi

# ---------- pré-checks -------------------------------------------------------
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  err "Rode como root: sudo bash $0"
  exit 1
fi

# Validação leve antes de mexer no sistema (só erros bloqueiam)
if ! run_preflight_checks "instalação"; then
  err "Pre-flight encontrou erros críticos. Use 'bash $0 --dry-run' para inspecionar."
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

# ---------- 5b. Supabase self-hosted (opcional) ------------------------------
install_supabase_stack() {
  step "Extra  Subindo Postgres + Supabase Studio self-hosted"

  # Configuráveis via env vars (com defaults)
  local SB_PG_USER="${SB_PG_USER:-postgres}"
  local SB_PG_DB="${SB_PG_DB:-postgres}"
  local SB_PG_PORT="${SB_PG_PORT:-5432}"
  local SB_PG_CONTAINER="${SB_PG_CONTAINER:-liberty-supabase-db}"
  local SB_PG_VOLUME="${SB_PG_VOLUME:-liberty_supabase_db}"
  local SB_STUDIO_PORT="${SB_STUDIO_PORT:-3001}"
  local SB_BIND_HOST="${SB_BIND_HOST:-127.0.0.1}"

  local SB_DIR="$APP_DIR/deploy-vps/supabase-stack"
  mkdir -p "$SB_DIR"

  # Senhas e .env (preserva se já existir)
  local SB_ENV="$SB_DIR/.env"
  if [ ! -f "$SB_ENV" ]; then
    local PG_PASS JWT_SECRET DASH_PASS
    PG_PASS="${SB_PG_PASSWORD:-$(openssl rand -hex 16)}"
    JWT_SECRET=$(openssl rand -hex 32)
    DASH_PASS=$(openssl rand -hex 12)
    cat > "$SB_ENV" <<EOF
# Gerado por install.sh em $(date -Iseconds)
# Edite valores e rode "docker compose up -d" novamente para aplicar.
POSTGRES_USER=$SB_PG_USER
POSTGRES_DB=$SB_PG_DB
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_PORT=$SB_PG_PORT
CONTAINER_NAME=$SB_PG_CONTAINER
VOLUME_NAME=$SB_PG_VOLUME
STUDIO_PORT=$SB_STUDIO_PORT
BIND_HOST=$SB_BIND_HOST
JWT_SECRET=$JWT_SECRET
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASH_PASS
# Gere ANON_KEY e SERVICE_ROLE_KEY assinando o JWT_SECRET acima:
# https://supabase.com/docs/guides/self-hosting/docker#api-keys
ANON_KEY=
SERVICE_ROLE_KEY=
EOF
    chmod 600 "$SB_ENV"
    ok "Configuração gerada em $SB_ENV (perms 600)"
  else
    log "$SB_ENV já existe — reaproveitando configuração"
    # shellcheck disable=SC1090
    source "$SB_ENV"
    SB_PG_USER="${POSTGRES_USER:-$SB_PG_USER}"
    SB_PG_DB="${POSTGRES_DB:-$SB_PG_DB}"
    SB_PG_PORT="${POSTGRES_PORT:-$SB_PG_PORT}"
    SB_PG_CONTAINER="${CONTAINER_NAME:-$SB_PG_CONTAINER}"
    SB_PG_VOLUME="${VOLUME_NAME:-$SB_PG_VOLUME}"
    SB_STUDIO_PORT="${STUDIO_PORT:-$SB_STUDIO_PORT}"
    SB_BIND_HOST="${BIND_HOST:-$SB_BIND_HOST}"
  fi

  # docker-compose com volume nomeado e healthcheck robusto.
  # Tudo configurável via .env vizinho (CONTAINER_NAME, PORT, VOLUME_NAME, etc.)
  cat > "$SB_DIR/docker-compose.yml" <<'YML'
# Supabase self-hosted minimal — Postgres persistente + Studio + meta
# Configure em .env: POSTGRES_USER/PASSWORD/PORT, CONTAINER_NAME, VOLUME_NAME, BIND_HOST
# Stack COMPLETA (Auth+REST+Storage+Realtime): https://supabase.com/docs/guides/self-hosting/docker
services:
  db:
    image: supabase/postgres:15.6.1.146
    container_name: ${CONTAINER_NAME:-liberty-supabase-db}
    restart: unless-stopped
    ports:
      - "${BIND_HOST:-127.0.0.1}:${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 15s

  studio:
    image: supabase/studio:20240729-ce42139
    container_name: ${CONTAINER_NAME:-liberty-supabase-db}-studio
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "${BIND_HOST:-127.0.0.1}:${STUDIO_PORT:-3001}:3000"
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: Liberty
      DEFAULT_PROJECT_NAME: liberty-pharma
      DASHBOARD_USERNAME: ${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}

  meta:
    image: supabase/postgres-meta:v0.83.2
    container_name: ${CONTAINER_NAME:-liberty-supabase-db}-meta
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: db
      PG_META_DB_PORT: 5432
      PG_META_DB_NAME: ${POSTGRES_DB:-postgres}
      PG_META_DB_USER: ${POSTGRES_USER:-postgres}
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}

volumes:
  pgdata:
    name: ${VOLUME_NAME:-liberty_supabase_db}
YML

  log "Subindo containers (db + studio + meta) com volume persistente…"
  if ! (cd "$SB_DIR" && timeout 600 docker compose up -d); then
    err "Falha ao subir Supabase self-hosted. Logs:"
    (cd "$SB_DIR" && docker compose logs --tail=40) || true
    return 1
  fi

  # ----- Healthcheck ativo: espera Postgres aceitar conexões (até 90s) -----
  log "Aguardando Postgres ficar pronto (pg_isready)…"
  local READY=0
  for i in $(seq 1 45); do
    if docker exec "$SB_PG_CONTAINER" \
        pg_isready -U "$SB_PG_USER" -d "$SB_PG_DB" >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 2
  done
  if [ "$READY" != "1" ]; then
    err "Postgres não respondeu em 90s. Veja: docker logs $SB_PG_CONTAINER"
    return 1
  fi
  ok "Postgres pronto para conexões"

  # ----- Migrations: schema.sql principal -----
  local SCHEMA_FILE="$APP_DIR/deploy-vps/supabase/schema.sql"
  if [ -f "$SCHEMA_FILE" ]; then
    log "Aplicando schema.sql (migration principal)…"
    if docker exec -i "$SB_PG_CONTAINER" \
        psql -v ON_ERROR_STOP=0 -U "$SB_PG_USER" -d "$SB_PG_DB" \
        < "$SCHEMA_FILE" >/tmp/supabase-schema.log 2>&1; then
      ok "Schema aplicado (log: /tmp/supabase-schema.log)"
    else
      warn "Schema teve avisos (esperado em re-execução idempotente). Veja /tmp/supabase-schema.log"
    fi
  else
    warn "schema.sql não encontrado em $SCHEMA_FILE — pulando migration"
  fi

  # ----- Migrations extras: deploy-vps/supabase/migrations/*.sql -----
  local MIG_DIR="$APP_DIR/deploy-vps/supabase/migrations"
  if [ -d "$MIG_DIR" ]; then
    local applied=0
    for mig in $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | sort); do
      log "Migration: $(basename "$mig")"
      docker exec -i "$SB_PG_CONTAINER" \
        psql -v ON_ERROR_STOP=1 -U "$SB_PG_USER" -d "$SB_PG_DB" < "$mig" \
        >>/tmp/supabase-migrations.log 2>&1 \
        && applied=$((applied+1)) \
        || warn "Falha em $(basename "$mig") — veja /tmp/supabase-migrations.log"
    done
    [ "$applied" -gt 0 ] && ok "$applied migration(s) extra aplicada(s)"
  fi

  # ----- Seed: deploy-vps/supabase/seed/*.sql -----
  local SEED_DIR="$APP_DIR/deploy-vps/supabase/seed"
  if [ -d "$SEED_DIR" ]; then
    local seeded=0
    for seed in $(ls -1 "$SEED_DIR"/*.sql 2>/dev/null | sort); do
      log "Seed: $(basename "$seed")"
      docker exec -i "$SB_PG_CONTAINER" \
        psql -v ON_ERROR_STOP=0 -U "$SB_PG_USER" -d "$SB_PG_DB" < "$seed" \
        >>/tmp/supabase-seed.log 2>&1 \
        && seeded=$((seeded+1)) \
        || warn "Falha em $(basename "$seed") — veja /tmp/supabase-seed.log"
    done
    [ "$seeded" -gt 0 ] && ok "$seeded seed(s) executado(s)"
  fi

  ok "Supabase self-hosted no ar"
  echo
  echo -e "${GRN}📦 SUPABASE SELF-HOSTED${NC}"
  echo "   • Postgres:       $SB_BIND_HOST:$SB_PG_PORT  (user: $SB_PG_USER  db: $SB_PG_DB)"
  echo "   • Container:      $SB_PG_CONTAINER  (volume: $SB_PG_VOLUME — dados persistem)"
  echo "   • Studio (UI):    http://$SB_BIND_HOST:$SB_STUDIO_PORT"
  echo "   • Credenciais:    cat $SB_ENV   (perms 600)"
  echo "   • Acesso remoto:  ssh -L $SB_STUDIO_PORT:127.0.0.1:$SB_STUDIO_PORT -L $SB_PG_PORT:127.0.0.1:$SB_PG_PORT root@<vps>"
  echo "   • Conectar:       psql -h $SB_BIND_HOST -p $SB_PG_PORT -U $SB_PG_USER -d $SB_PG_DB"
  echo "   • Migrations:     coloque .sql em deploy-vps/supabase/migrations/ e re-rode"
  echo "   • Seed:           coloque .sql em deploy-vps/supabase/seed/ e re-rode"
  echo "   • Parar:          cd $SB_DIR && docker compose down  (dados ficam no volume)"
  echo "   • Apagar tudo:    cd $SB_DIR && docker compose down -v"
}

# Decide se pergunta ou usa env var
SHOULD_INSTALL_SUPABASE="${INSTALL_SUPABASE:-}"
if [ -z "$SHOULD_INSTALL_SUPABASE" ]; then
  if [ -t 0 ] && [ -t 1 ]; then
    echo
    echo -e "${YLW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YLW}OPCIONAL: Instalar Supabase self-hosted local?${NC}"
    echo "Sobe Postgres + Studio em containers, expostos apenas em 127.0.0.1."
    echo "Útil pra rodar o backend offline. Não interfere no Lovable Cloud."
    echo -e "${YLW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    read -r -p "Instalar Supabase self-hosted? [y/N] " ANSWER </dev/tty || ANSWER="n"
    case "${ANSWER,,}" in
      y|yes|s|sim) SHOULD_INSTALL_SUPABASE="yes" ;;
      *)           SHOULD_INSTALL_SUPABASE="no"  ;;
    esac
  else
    SHOULD_INSTALL_SUPABASE="no"
    log "Modo não-interativo: pulando Supabase self-hosted (use INSTALL_SUPABASE=yes para forçar)"
  fi
fi

if [ "${SHOULD_INSTALL_SUPABASE,,}" = "yes" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    log "Instalando openssl (necessário para gerar senhas)…"
    timeout 60 apt-get install -y -qq openssl >/dev/null || warn "openssl não instalou"
  fi
  install_supabase_stack || warn "Supabase self-hosted falhou — app principal segue funcionando"
fi

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