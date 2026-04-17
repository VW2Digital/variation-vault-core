#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker)
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

source /etc/os-release

REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
BRANCH="${BRANCH:-main}"
COMPOSE_VERSION="v2.29.7"

SUPABASE_URL_DEFAULT="https://vkomfiplmhpkhfpidrng.supabase.co"
SUPABASE_KEY_DEFAULT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb21maXBsbWhwa2hmcGlkcm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDE0NzMsImV4cCI6MjA4NzcxNzQ3M30.kvxMTwPuOjZR6D8P8AM3LOBOd9U-mym-mCRjp5eMoKE"
SUPABASE_PROJECT_ID_DEFAULT="vkomfiplmhpkhfpidrng"

configure_apt_retries() {
  cat >/etc/apt/apt.conf.d/80-liberty-retries <<'EOF'
Acquire::Retries "5";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::ForceIPv4 "true";
APT::Get::Assume-Yes "true";
Dpkg::Use-Pty "0";
EOF
}

rewrite_sources_to_https() {
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -f "$file" ]] || continue
    sed -i \
      -e 's|http://archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
      -e 's|http://ports.ubuntu.com/ubuntu-ports|https://ports.ubuntu.com/ubuntu-ports|g' \
      "$file"
  done
}

rewrite_sources_to_old_releases() {
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -f "$file" ]] || continue
    sed -i \
      -e 's|https\?://archive.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|https\?://security.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' \
      -e 's|https\?://ports.ubuntu.com/ubuntu-ports|http://old-releases.ubuntu.com/ubuntu|g' \
      "$file"
  done
}

apt_update_resilient() {
  apt-get clean

  if apt-get update -qq; then
    return 0
  fi

  warn "Falha no apt update. Tentando trocar os mirrors para HTTPS..."
  rewrite_sources_to_https
  apt-get clean
  if apt-get update -qq; then
    ok "Apt voltou a responder com mirrors HTTPS"
    return 0
  fi

  if [[ "${VERSION_ID:-}" == "20.04" || "${VERSION_ID:-}" == "18.04" || "${VERSION_ID:-}" == "16.04" ]]; then
    warn "Ubuntu ${VERSION_ID} detectado. Tentando old-releases..."
    rewrite_sources_to_old_releases
    apt-get clean
    if apt-get update -qq; then
      ok "Apt voltou a responder com old-releases"
      return 0
    fi
  fi

  err "Não foi possível atualizar os pacotes APT nesta VPS"
  exit 1
}

apt_install_resilient() {
  if apt-get install -y -qq --no-install-recommends "$@" >/dev/null; then
    return 0
  fi

  warn "Falha ao instalar: $*. Recarregando índices e tentando novamente..."
  apt_update_resilient
  apt-get install -y -qq --fix-missing --no-install-recommends "$@" >/dev/null
}

if [[ $EUID -ne 0 ]]; then
  err "Rode como root: sudo bash install.sh"
  exit 1
fi

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║          LIBERTY PHARMA — INSTALADOR DOCKER (VPS)            ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- 1. Limpar instalações antigas ----------
log "[1/7] Limpando instalações Docker antigas (se houver)..."
apt-get remove -y -qq docker docker.io docker-compose docker-compose-plugin containerd runc 2>/dev/null || true
rm -rf /var/lib/docker /etc/docker 2>/dev/null || true
ok "Limpeza concluída"

# ---------- 2. Atualizar sistema ----------
log "[2/7] Atualizando pacotes essenciais..."
configure_apt_retries
apt_update_resilient
apt_install_resilient curl git ufw ca-certificates wget
ok "Sistema atualizado"

# ---------- 3. Swap (se RAM < 2GB) ----------
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( RAM_MB < 2048 )) && (( SWAP_MB < 1024 )); then
  log "[3/7] RAM baixa ($RAM_MB MB), criando swap de 2GB..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap de 2GB ativo"
else
  ok "[3/7] Swap/RAM já suficientes"
fi

# ---------- 4. Docker (apt do Ubuntu) + Compose v2 (plugin) ----------
log "[4/7] Instalando Docker e Compose v2..."
apt_install_resilient pigz docker.io
systemctl enable --now docker >/dev/null

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ,)
COMPOSE_VER=$(docker compose version --short)
ok "Docker $DOCKER_VER + Compose $COMPOSE_VER"

# ---------- 5. Firewall ----------
log "[5/7] Configurando firewall (portas 22 SSH e 80 HTTP)..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo"

# ---------- 6. Clonar repo + .env ----------
if [[ -d "$APP_DIR/.git" ]]; then
  log "[6/7] Atualizando repo em $APP_DIR..."
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  log "[6/7] Clonando $REPO_URL em $APP_DIR..."
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL_DEFAULT
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_KEY_DEFAULT
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID_DEFAULT
EOF
  chmod 600 .env
fi
ok "Código + .env prontos"

# ---------- 7. Build + Up ----------
log "[7/7] Build da imagem Docker (~3-5 min)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --pull
docker compose up -d
ok "Container subiu"

# ---------- Healthcheck ----------
log "Aguardando resposta na porta 80..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/ -o /dev/null; then
    ok "Aplicação respondendo ✓"
    break
  fi
  sleep 2
  if (( i == 30 )); then
    err "Aplicação não respondeu em 60s. Logs:"
    docker compose logs --tail=50 app
    exit 1
  fi
done

PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Acesse:        http://$PUBLIC_IP
  📁 Pasta:         $APP_DIR
  📜 Logs:          cd $APP_DIR && docker compose logs -f app
  🔄 Atualizar:     cd $APP_DIR && bash deploy-vps/deploy.sh
  ⏹  Parar:         cd $APP_DIR && docker compose down
  ▶  Subir:         cd $APP_DIR && docker compose up -d

EOF
