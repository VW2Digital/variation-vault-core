#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker)
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
# =============================================================================

set -euo pipefail

# ---------- Cores ----------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

# ---------- Config padrão ----------
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
BRANCH="${BRANCH:-main}"

# Credenciais Lovable Cloud (já preenchidas para este projeto)
SUPABASE_URL_DEFAULT="https://vkomfiplmhpkhfpidrng.supabase.co"
SUPABASE_KEY_DEFAULT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb21maXBsbWhwa2hmcGlkcm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDE0NzMsImV4cCI6MjA4NzcxNzQ3M30.kvxMTwPuOjZR6D8P8AM3LOBOd9U-mym-mCRjp5eMoKE"
SUPABASE_PROJECT_ID_DEFAULT="vkomfiplmhpkhfpidrng"

# ---------- Pré-checagem ----------
if [[ $EUID -ne 0 ]]; then
  err "Este script precisa rodar como root. Use: sudo bash install.sh"
  exit 1
fi

if ! grep -qiE 'ubuntu|debian' /etc/os-release; then
  warn "Sistema não é Ubuntu/Debian. O script pode não funcionar."
fi

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║          LIBERTY PHARMA — INSTALADOR DOCKER (VPS)            ║
║                                                              ║
║  Vai instalar:                                               ║
║   • Docker + Docker Compose                                  ║
║   • Firewall UFW (portas 22, 80)                             ║
║   • Swap de 2GB (se RAM < 2GB)                               ║
║   • Aplicação em /opt/liberty-pharma                         ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- 1. Atualizar sistema ----------
log "[1/7] Atualizando pacotes do sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw ca-certificates gnupg wget >/dev/null
ok "Sistema atualizado"

# ---------- 2. Swap (se RAM < 2GB e sem swap) ----------
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( RAM_MB < 2048 )) && (( SWAP_MB < 1024 )); then
  log "[2/7] RAM baixa ($RAM_MB MB), criando 2GB de swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap de 2GB ativo"
else
  ok "[2/7] Swap/RAM já suficientes"
fi

# ---------- 3. Docker ----------
if command -v docker &>/dev/null; then
  ok "[3/7] Docker já instalado ($(docker --version | awk '{print $3}' | tr -d ,))"
else
  log "[3/7] Instalando Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null
  ok "Docker instalado"
fi

if docker compose version &>/dev/null; then
  ok "Docker Compose v2 disponível"
else
  err "Docker Compose v2 não encontrado. Reinstale o Docker."
  exit 1
fi

# ---------- 4. Firewall ----------
log "[4/7] Configurando firewall UFW..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo (22, 80)"

# ---------- 5. Clonar / atualizar repo ----------
if [[ -d "$APP_DIR/.git" ]]; then
  log "[5/7] Repo já existe em $APP_DIR, atualizando..."
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  log "[5/7] Clonando $REPO_URL em $APP_DIR..."
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
fi
ok "Código pronto em $APP_DIR"

cd "$APP_DIR"

# ---------- 6. Arquivo .env ----------
if [[ -f .env ]]; then
  ok "[6/7] .env já existe (mantido)"
else
  log "[6/7] Criando .env com credenciais Lovable Cloud..."
  cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL_DEFAULT
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_KEY_DEFAULT
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID_DEFAULT
EOF
  chmod 600 .env
  ok ".env criado"
fi

# ---------- 7. Build + Up ----------
log "[7/7] Buildando imagem Docker e subindo container (~5min)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --pull
docker compose up -d
ok "Container rodando"

# ---------- Healthcheck ----------
log "Aguardando aplicação responder..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/ -o /dev/null; then
    ok "Aplicação respondendo na porta 80"
    break
  fi
  sleep 2
  if (( i == 30 )); then
    err "Aplicação não respondeu em 60s. Veja: docker compose logs app"
    exit 1
  fi
done

# ---------- Sucesso ----------
PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Acesse:        http://$PUBLIC_IP
  📁 Pasta da app:  $APP_DIR
  📜 Logs:          cd $APP_DIR && docker compose logs -f app
  🔄 Atualizar:     cd $APP_DIR && bash deploy-vps/deploy.sh
  ⏹  Parar:         cd $APP_DIR && docker compose down
  ▶  Subir:         cd $APP_DIR && docker compose up -d

  Próximos passos opcionais:
  • Apontar seu domínio (registro A) para $PUBLIC_IP
  • Adicionar HTTPS com Caddy ou Traefik
EOF
