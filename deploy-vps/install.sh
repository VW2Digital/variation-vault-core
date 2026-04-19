#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker) — site + backend
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
#
# Variáveis opcionais (modo não-interativo):
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   SUPABASE_PROJECT_ID=xxx \
#   SUPABASE_DB_URL=postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres \
#   SUPABASE_SERVICE_KEY=eyJ... \
#   ADMIN_EMAIL=admin@dominio.com ADMIN_PASSWORD=senha123 \
#   DOMAIN=meusite.com SSL_EMAIL=admin@meusite.com \
#   DEPLOY_FUNCTIONS=yes \
#     curl ... | sudo -E bash
#
# Modo dry-run (valida credenciais sem aplicar nada):
#   sudo bash install.sh --dry-run
#   DRY_RUN=yes sudo -E bash install.sh
# =============================================================================

DRY_RUN="${DRY_RUN:-no}"
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN="yes" ;;
    --help|-h)
      sed -n '2,22p' "$0"; exit 0 ;;
  esac
done

set -uo pipefail
[[ "$DRY_RUN" != "yes" ]] && set -e
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

apt_update_resilient() {
  apt-get clean
  if apt-get update -qq; then return 0; fi
  warn "Falha no apt update. Trocando mirrors para HTTPS..."
  rewrite_sources_to_https
  apt-get clean
  apt-get update -qq
}

apt_install_resilient() {
  if apt-get install -y -qq --no-install-recommends "$@" >/dev/null; then return 0; fi
  warn "Falha ao instalar: $*. Recarregando..."
  apt_update_resilient
  apt-get install -y -qq --fix-missing --no-install-recommends "$@" >/dev/null
}

if [[ "$DRY_RUN" == "yes" ]]; then
  warn "════════════════════════════════════════════════════════════════"
  warn "  MODO DRY-RUN ATIVO — nada será modificado no servidor"
  warn "  Apenas valida credenciais e mostra o que seria executado"
  warn "════════════════════════════════════════════════════════════════"
  echo ""
fi

if [[ "$DRY_RUN" != "yes" ]]; then
  [[ $EUID -ne 0 ]] && { err "Rode como root"; exit 1; }
fi

# ---------- Pré-requisitos ----------
log "Validando pré-requisitos do sistema..."
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  err "Sistema operacional '$PRETTY_NAME' não é Ubuntu/Debian. Abortando."
  exit 1
fi
UBUNTU_MAJOR=$(echo "$VERSION_ID" | cut -d. -f1)
if [[ "$ID" == "ubuntu" && "$UBUNTU_MAJOR" -lt 20 ]]; then
  err "Ubuntu $VERSION_ID muito antigo. Mínimo: 20.04. Abortando."
  exit 1
fi
ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
  err "Arquitetura $ARCH não suportada (x86_64 ou aarch64)."
  exit 1
fi
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if (( RAM_MB < 900 )); then
  err "RAM insuficiente: ${RAM_MB}MB. Mínimo recomendado: 1GB."
  exit 1
fi
DISK_GB=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
if (( DISK_GB < 10 )); then
  err "Espaço em disco insuficiente: ${DISK_GB}GB livres. Mínimo: 10GB."
  exit 1
fi
ok "SO $PRETTY_NAME • $ARCH • RAM ${RAM_MB}MB • Disco ${DISK_GB}GB"

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║       LIBERTY PHARMA — INSTALADOR DOCKER COMPLETO            ║
║       Site + Schema + Admin + SSL + Edge Functions           ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- Detecta TTY ----------
if exec 3</dev/tty 2>/dev/null; then
  TTY_FD=3
elif [[ -t 0 ]]; then
  exec 3<&0
  TTY_FD=3
else
  TTY_FD=""
fi

prompt_tty() {
  local __var_name="$1"
  local __label="$2"
  local __value=""
  if [[ -z "$TTY_FD" ]]; then
    err "Sem terminal interativo disponível. Baixe primeiro:"
    err "  curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh"
    err "  sudo bash /tmp/install.sh"
    exit 1
  fi
  printf "%s" "$__label" > /dev/tty
  IFS= read -r __value <&3 || true
  printf -v "$__var_name" '%s' "$__value"
}

prompt_tty_secret() {
  local __var_name="$1"
  local __label="$2"
  local __value=""
  if [[ -z "$TTY_FD" ]]; then
    err "Sem terminal para input de senha."; exit 1
  fi
  printf "%s" "$__label" > /dev/tty
  IFS= read -rs __value <&3 || true
  printf "\n" > /dev/tty
  printf -v "$__var_name" '%s' "$__value"
}

# ============================================================================
# [1/12] Configuração Supabase
# ============================================================================
log "[1/12] Configuração do Supabase Cloud"
echo ""

if [[ -z "${SUPABASE_URL:-}" ]]; then
  cat <<'INFO'
  Antes de continuar, você precisa de um projeto Supabase pronto:
    1) Crie em: https://supabase.com/dashboard/projects
    2) Project Settings → API → copie:
         - Project URL          (https://abc.supabase.co)
         - anon / public key    (eyJ...)
         - service_role key     (eyJ... — opcional, p/ criar admin auto)
    3) Project Settings → Database → Connection string → URI
         (opcional — se fornecer, schema é aplicado automaticamente)

INFO
  prompt_tty SUPABASE_URL "  Project URL (https://xxx.supabase.co): "
  prompt_tty SUPABASE_ANON_KEY "  anon key (eyJ...): "
  prompt_tty SUPABASE_PROJECT_ID "  Project Reference (opcional, deduzido): "
  prompt_tty SUPABASE_DB_URL "  Connection string Postgres (opcional, ENTER p/ pular): "

  if [[ -n "$SUPABASE_DB_URL" ]]; then
    echo ""
    echo "  Para criar o usuário ADMIN automaticamente (opcional):"
    prompt_tty SUPABASE_SERVICE_KEY "  service_role key (eyJ... — ENTER p/ pular): "
    if [[ -n "$SUPABASE_SERVICE_KEY" ]]; then
      prompt_tty ADMIN_EMAIL "  Email do admin: "
      prompt_tty_secret ADMIN_PASSWORD "  Senha do admin (mín 6 chars, oculta): "
    fi
  fi
fi

# Limpa e valida
SUPABASE_URL="$(echo -n "$SUPABASE_URL" | tr -d '[:space:]')"
SUPABASE_ANON_KEY="$(echo -n "$SUPABASE_ANON_KEY" | tr -d '[:space:]')"
SUPABASE_PROJECT_ID="$(echo -n "${SUPABASE_PROJECT_ID:-}" | tr -d '[:space:]')"
SUPABASE_DB_URL="$(echo -n "${SUPABASE_DB_URL:-}" | tr -d '[:space:]')"
SUPABASE_SERVICE_KEY="$(echo -n "${SUPABASE_SERVICE_KEY:-}" | tr -d '[:space:]')"
SUPABASE_URL="${SUPABASE_URL%/}"

if [[ -n "$SUPABASE_URL" && ! "$SUPABASE_URL" =~ ^https?:// ]]; then
  if [[ "$SUPABASE_URL" =~ \.supabase\.co$ ]]; then
    SUPABASE_URL="https://$SUPABASE_URL"
  else
    SUPABASE_URL="https://${SUPABASE_URL}.supabase.co"
  fi
fi

[[ -z "$SUPABASE_URL" ]] && { err "URL do Supabase vazia"; exit 1; }
[[ ! "$SUPABASE_URL" =~ ^https?://[a-zA-Z0-9.-]+\.supabase\.co$ ]] && { err "URL inválida: $SUPABASE_URL"; exit 1; }
[[ -z "$SUPABASE_ANON_KEY" ]] && { err "anon key vazia"; exit 1; }
[[ ${#SUPABASE_ANON_KEY} -lt 100 ]] && { err "anon key parece curta demais"; exit 1; }
[[ -z "$SUPABASE_PROJECT_ID" ]] && SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co|\1|')
ok "Supabase configurado: $SUPABASE_URL (ref: $SUPABASE_PROJECT_ID)"

# ============================================================================
# [2/12] Domínio + SSL (opcional)
# ============================================================================
log "[2/12] Configuração de domínio e SSL"
if [[ -z "${DOMAIN:-}" ]]; then
  echo ""
  echo "  Configure HTTPS automaticamente com Let's Encrypt (recomendado):"
  echo "  Pré-requisito: o domínio já deve estar apontando para o IP desta VPS (registro A)."
  prompt_tty DOMAIN "  Domínio (ex: loja.exemplo.com — ENTER p/ pular SSL): "
  if [[ -n "$DOMAIN" ]]; then
    prompt_tty SSL_EMAIL "  Email para Let's Encrypt (recuperação/avisos): "
  fi
fi
DOMAIN="$(echo -n "${DOMAIN:-}" | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
SSL_EMAIL="$(echo -n "${SSL_EMAIL:-}" | tr -d '[:space:]')"
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  warn "Domínio inválido: $DOMAIN — pulando SSL."
  DOMAIN=""
fi
[[ -n "$DOMAIN" ]] && ok "SSL será configurado para: $DOMAIN" || warn "Sem domínio — site rodará apenas em HTTP"

# ============================================================================
# [3/12] Edge Functions deploy (opcional)
# ============================================================================
DEPLOY_FUNCTIONS="${DEPLOY_FUNCTIONS:-}"
if [[ -z "$DEPLOY_FUNCTIONS" && -n "$SUPABASE_DB_URL" ]]; then
  echo ""
  echo "  Deploy automático das Edge Functions (pagamentos, webhooks, frete, etc):"
  echo "  Requer login interativo no Supabase CLI no final do processo."
  prompt_tty DEPLOY_FUNCTIONS "  Deployar Edge Functions? (yes/no, default: no): "
fi
DEPLOY_FUNCTIONS=$(echo -n "${DEPLOY_FUNCTIONS:-no}" | tr 'A-Z' 'a-z')

if [[ "$DEPLOY_FUNCTIONS" == "yes" || "$DEPLOY_FUNCTIONS" == "y" || "$DEPLOY_FUNCTIONS" == "s" || "$DEPLOY_FUNCTIONS" == "sim" ]]; then
  DEPLOY_FUNCTIONS="yes"
  echo ""
  echo "  Secrets das Edge Functions (todos opcionais — ENTER p/ pular):"
  prompt_tty SECRET_RESEND_API_KEY    "  RESEND_API_KEY (emails transacionais): "
  prompt_tty SECRET_LOVABLE_API_KEY   "  LOVABLE_API_KEY (Lovable AI): "
  prompt_tty SECRET_MP_WEBHOOK_SECRET "  MP_WEBHOOK_SECRET (Mercado Pago): "
  prompt_tty SECRET_EVOLUTION_API_URL "  EVOLUTION_API_URL (WhatsApp): "
  prompt_tty SECRET_EVOLUTION_API_KEY "  EVOLUTION_API_KEY (WhatsApp): "
else
  DEPLOY_FUNCTIONS="no"
fi

# ============================================================================
# DRY-RUN: valida tudo e sai antes de modificar o servidor
# ============================================================================
if [[ "$DRY_RUN" == "yes" ]]; then
  echo ""
  log "════════════════ VALIDAÇÃO DRY-RUN ════════════════"
  echo ""
  DRY_ERRORS=0
  DRY_WARNS=0

  # 1) URL Supabase responde?
  log "→ Testando URL Supabase: $SUPABASE_URL"
  if curl -fsS --max-time 10 "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY" -o /dev/null 2>/dev/null; then
    ok "  Supabase respondeu e anon key é válida"
  else
    err "  Falha ao conectar em $SUPABASE_URL/auth/v1/health (URL ou anon key inválidas)"
    DRY_ERRORS=$((DRY_ERRORS+1))
  fi

  # 2) Conexão Postgres (se DB URL fornecida)
  if [[ -n "$SUPABASE_DB_URL" ]]; then
    log "→ Testando conexão Postgres..."
    if ! command -v psql >/dev/null 2>&1; then
      warn "  psql não instalado neste host (será instalado durante o install real)"
      DRY_WARNS=$((DRY_WARNS+1))
    elif PGCONNECT_TIMEOUT=10 psql "$SUPABASE_DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
      ok "  Conexão Postgres OK"
      # Verifica se schema já existe
      EXISTING=$(PGCONNECT_TIMEOUT=10 psql "$SUPABASE_DB_URL" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='products';" 2>/dev/null || echo "0")
      if [[ "$EXISTING" == "1" ]]; then
        warn "  Tabela 'products' já existe — schema.sql é idempotente, dados serão preservados"
        DRY_WARNS=$((DRY_WARNS+1))
      else
        ok "  Schema vazio — pronto para receber schema.sql"
      fi
    else
      err "  Falha ao conectar no Postgres (senha incorreta ou URL inválida)"
      DRY_ERRORS=$((DRY_ERRORS+1))
    fi
  else
    warn "  Sem SUPABASE_DB_URL — schema, cron jobs e admin precisarão ser feitos manualmente"
    DRY_WARNS=$((DRY_WARNS+1))
  fi

  # 3) Service role key (se admin será criado)
  if [[ -n "$SUPABASE_SERVICE_KEY" ]]; then
    log "→ Validando service_role key..."
    if curl -fsS --max-time 10 "$SUPABASE_URL/auth/v1/admin/users?per_page=1" \
      -H "apikey: $SUPABASE_SERVICE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -o /dev/null 2>/dev/null; then
      ok "  service_role key válida (acesso ao Auth Admin API confirmado)"
    else
      err "  service_role key inválida — admin NÃO será criado automaticamente"
      DRY_ERRORS=$((DRY_ERRORS+1))
    fi
    [[ -n "${ADMIN_EMAIL:-}" ]] && ok "  Admin a criar: $ADMIN_EMAIL" || warn "  ADMIN_EMAIL não definido"
    [[ -n "${ADMIN_PASSWORD:-}" && ${#ADMIN_PASSWORD} -ge 6 ]] && ok "  Senha admin OK (${#ADMIN_PASSWORD} chars)" || warn "  Senha admin ausente ou <6 chars"
  fi

  # 4) DNS do domínio (se SSL será emitido)
  if [[ -n "$DOMAIN" ]]; then
    log "→ Verificando DNS de $DOMAIN..."
    PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
    DOMAIN_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1)
    [[ -z "$DOMAIN_IP" ]] && DOMAIN_IP=$(dig +short "$DOMAIN" A 2>/dev/null | head -n1 || true)
    if [[ -z "$DOMAIN_IP" ]]; then
      err "  $DOMAIN não resolve para nenhum IP — SSL falhará"
      DRY_ERRORS=$((DRY_ERRORS+1))
    elif [[ -n "$PUBLIC_IP" && "$DOMAIN_IP" != "$PUBLIC_IP" ]]; then
      err "  $DOMAIN aponta para $DOMAIN_IP mas IP público desta VPS é $PUBLIC_IP"
      err "  Atualize o registro A no seu DNS antes de rodar o install real"
      DRY_ERRORS=$((DRY_ERRORS+1))
    else
      ok "  DNS OK: $DOMAIN → $DOMAIN_IP (= IP da VPS)"
    fi
    # Porta 80 acessível?
    if [[ -n "$PUBLIC_IP" ]] && timeout 3 bash -c "</dev/tcp/$PUBLIC_IP/80" 2>/dev/null; then
      warn "  Porta 80 já está em uso — será reutilizada (algo escutando agora)"
      DRY_WARNS=$((DRY_WARNS+1))
    fi
  else
    warn "  Sem DOMAIN — site rodará apenas em HTTP no IP"
    DRY_WARNS=$((DRY_WARNS+1))
  fi

  # 5) Rede para repos externos
  log "→ Testando conectividade externa..."
  for url in "https://github.com" "https://download.docker.com" "https://api.ipify.org"; do
    if curl -fsS --max-time 5 "$url" -o /dev/null 2>/dev/null; then
      ok "  $url alcançável"
    else
      warn "  $url inalcançável — pode haver problemas no install"
      DRY_WARNS=$((DRY_WARNS+1))
    fi
  done

  # 6) Estado atual da VPS
  log "→ Estado atual da VPS:"
  [[ -d "$APP_DIR" ]] && warn "  $APP_DIR já existe — será REMOVIDO no install real" || ok "  $APP_DIR não existe (instalação limpa)"
  command -v docker >/dev/null 2>&1 && warn "  Docker já instalado — será reinstalado" || ok "  Docker não instalado (será instalado)"
  ufw status 2>/dev/null | grep -q "Status: active" && warn "  UFW já ativo — regras serão substituídas" || ok "  UFW será configurado do zero"

  # Resumo
  echo ""
  cat <<DRYSUMMARY
╔══════════════════════════════════════════════════════════════╗
║                  RESUMO DRY-RUN                              ║
╚══════════════════════════════════════════════════════════════╝

  Ações que SERIAM executadas (em ordem):
    [4]  Backup do .env antigo + remoção de $APP_DIR e Docker
    [5]  apt update + instala curl/git/jq/psql/fail2ban + timezone BR
    [6]  Cria 1GB de swap se RAM <1GB
    [7]  Instala Docker engine + Compose v2
    [8]  UFW reset → libera 22/80/443
    [9]  $([[ -n "$SUPABASE_DB_URL" ]] && echo "Aplica schema.sql + pg_cron/pg_net + agenda crons" || echo "PULADO (sem DB URL)")
         $([[ -n "$SUPABASE_SERVICE_KEY" && -n "${ADMIN_EMAIL:-}" ]] && echo "Cria admin $ADMIN_EMAIL via Auth API" || echo "Admin NÃO será criado")
    [10] Clona repo, gera .env e nginx.conf
         $([[ -n "$DOMAIN" ]] && echo "Build + emite SSL Let's Encrypt para $DOMAIN" || echo "Build em HTTP-only")
    [11] $([[ "$DEPLOY_FUNCTIONS" == "yes" ]] && echo "Instala Supabase CLI + deploya Edge Functions + secrets" || echo "PULADO (DEPLOY_FUNCTIONS=no)")
    [12] Logrotate + healthcheck cron 5min + INSTALL-INFO.txt

  Validação:
    Erros:   $DRY_ERRORS
    Warnings: $DRY_WARNS

DRYSUMMARY

  if (( DRY_ERRORS > 0 )); then
    err "Corrija os $DRY_ERRORS erro(s) acima antes de rodar o install real."
    exit 1
  fi

  ok "Tudo validado. Para executar de verdade, rode SEM --dry-run:"
  echo "  sudo bash $0"
  exit 0
fi

# ============================================================================
# [4/12] Limpeza de instalação anterior
# ============================================================================
log "[4/12] Limpando instalação anterior..."
if [[ -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env" "/root/.liberty-env-backup-$(date +%s)" 2>/dev/null || true
  log "Backup do .env antigo salvo em /root/"
fi
docker compose -f "$APP_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
apt-get remove -y -qq docker docker.io docker-compose docker-compose-plugin containerd runc 2>/dev/null || true
rm -rf "$APP_DIR" /var/lib/docker /etc/docker /usr/local/lib/docker 2>/dev/null || true
ok "Limpeza concluída"

# ============================================================================
# [5/12] Sistema base + timezone + hardening
# ============================================================================
log "[5/12] Atualizando sistema e configurando timezone/hardening..."
configure_apt_retries
apt_update_resilient
apt_install_resilient curl git ufw ca-certificates wget gnupg jq \
  postgresql-client fail2ban unattended-upgrades

# Timezone Brasil
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true

# Fail2ban (proteção SSH brute-force)
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# Auto-update de segurança
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Sistema atualizado • Timezone America/Sao_Paulo • Fail2ban ativo"

# ============================================================================
# [6/12] Swap
# ============================================================================
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( SWAP_MB < 1024 )); then
  log "[6/12] Criando swap de 1GB..."
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "Swap de 1GB ativo"
else
  ok "[6/12] Swap suficiente (${SWAP_MB}MB)"
fi

# ============================================================================
# [7/12] Docker + Compose
# ============================================================================
log "[7/12] Instalando Docker e Compose v2..."
apt_install_resilient docker.io
systemctl enable --now docker >/dev/null
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ok "Docker + Compose instalados"

# ============================================================================
# [8/12] Firewall
# ============================================================================
log "[8/12] Configurando firewall..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo"

# ============================================================================
# [9/12] Schema do banco + admin
# ============================================================================
SCHEMA_APPLIED="no"
ADMIN_CREATED="no"
EXTENSIONS_OK="no"
CRON_JOBS_OK="no"

if [[ -n "$SUPABASE_DB_URL" ]]; then
  log "[9/12] Aplicando schema, extensões e cron jobs no banco..."
  if [[ ! "$SUPABASE_DB_URL" =~ ^postgres(ql)?:// ]]; then
    err "Connection string inválida"; exit 1
  fi

  SCHEMA_URL="https://raw.githubusercontent.com/VW2Digital/variation-vault-core/${BRANCH}/deploy-vps/supabase/schema.sql"
  TMP_SCHEMA="/tmp/liberty-schema.sql"
  if ! curl -fsSL "$SCHEMA_URL" -o "$TMP_SCHEMA"; then
    err "Falha ao baixar schema.sql"; exit 1
  fi
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$TMP_SCHEMA" >/tmp/liberty-schema.log 2>&1; then
    SCHEMA_APPLIED="yes"
    ok "Schema aplicado (23 tabelas + RLS + Realtime + Storage)"
  else
    err "Falha ao aplicar schema. Log: /tmp/liberty-schema.log"
    tail -n 20 /tmp/liberty-schema.log >&2
    exit 1
  fi
  rm -f "$TMP_SCHEMA"

  # Extensões pg_cron e pg_net
  log "Habilitando extensões pg_cron e pg_net..."
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
    "CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;" \
    >/tmp/liberty-ext.log 2>&1; then
    EXTENSIONS_OK="yes"
    ok "Extensões pg_cron + pg_net habilitadas"
  else
    warn "Falha ao habilitar extensões (algumas regiões Supabase não suportam). Log: /tmp/liberty-ext.log"
  fi

  # Cron jobs (cart abandonment + melhor envio sync)
  if [[ "$EXTENSIONS_OK" == "yes" ]]; then
    log "Agendando cron jobs (cart-abandonment + tracking sync)..."
    CRON_SQL=$(cat <<SQL
-- Carrinho abandonado: a cada hora
SELECT cron.unschedule('cart-abandonment-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cart-abandonment-hourly');
SELECT cron.schedule(
  'cart-abandonment-hourly', '0 * * * *',
  \$\$ SELECT net.http_post(
    url:='${SUPABASE_URL}/functions/v1/cart-abandonment',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ${SUPABASE_ANON_KEY}"}'::jsonb,
    body:=concat('{"time":"', now(), '"}')::jsonb
  ); \$\$
);
-- Melhor Envio: sync de rastreio a cada 5min
SELECT cron.unschedule('melhor-envio-sync-5min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='melhor-envio-sync-5min');
SELECT cron.schedule(
  'melhor-envio-sync-5min', '*/5 * * * *',
  \$\$ SELECT net.http_post(
    url:='${SUPABASE_URL}/functions/v1/melhor-envio-shipment',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ${SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"action":"sync-tracking"}'::jsonb
  ); \$\$
);
SQL
)
    if echo "$CRON_SQL" | psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q >/tmp/liberty-cron.log 2>&1; then
      CRON_JOBS_OK="yes"
      ok "Cron jobs agendados (carrinho/hora • rastreio/5min)"
    else
      warn "Cron schedule falhou. Log: /tmp/liberty-cron.log"
    fi
  fi

  # Admin
  if [[ -n "$SUPABASE_SERVICE_KEY" && -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
    if [[ ${#SUPABASE_SERVICE_KEY} -lt 100 ]]; then
      warn "service_role key muito curta — pulando admin"
    elif [[ ${#ADMIN_PASSWORD} -lt 6 ]]; then
      warn "Senha admin <6 chars — pulando"
    elif [[ ! "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
      warn "Email inválido — pulando admin"
    else
      log "Criando usuário admin..."
      ADMIN_PAYLOAD=$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
        '{email:$e,password:$p,email_confirm:true,user_metadata:{full_name:"Administrador"}}')
      ADMIN_RESP=$(curl -sS -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
        -H "Content-Type: application/json" \
        -d "$ADMIN_PAYLOAD" 2>&1 || true)
      ADMIN_UUID=$(echo "$ADMIN_RESP" | jq -r '.id // empty' 2>/dev/null)
      if [[ -z "$ADMIN_UUID" ]]; then
        LOOKUP=$(curl -sS "${SUPABASE_URL}/auth/v1/admin/users?email=${ADMIN_EMAIL}" \
          -H "apikey: $SUPABASE_SERVICE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" 2>&1 || true)
        ADMIN_UUID=$(echo "$LOOKUP" | jq -r '.users[0].id // empty' 2>/dev/null)
      fi
      if [[ -n "$ADMIN_UUID" ]]; then
        if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
          "INSERT INTO public.user_roles (user_id, role) VALUES ('$ADMIN_UUID', 'admin') ON CONFLICT DO NOTHING;" \
          >/dev/null 2>&1; then
          ADMIN_CREATED="yes"
          ok "Admin $ADMIN_EMAIL criado e promovido"
        else
          warn "Admin criado mas falha ao inserir role"
        fi
      else
        warn "Falha ao criar admin: $(echo "$ADMIN_RESP" | head -c 200)"
      fi
    fi
  fi
else
  warn "[9/12] Sem connection string — schema/admin/cron precisam ser feitos manualmente"
fi

# ============================================================================
# [10/12] Clone + .env + nginx + build
# ============================================================================
log "[10/12] Clonando código e fazendo build..."
git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
cd "$APP_DIR"

cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID
EOF
chmod 600 .env

# Gera nginx.conf dinâmico (HTTP-only se sem domínio; HTTP+HTTPS com SSL)
NGINX_SERVER_NAME="${DOMAIN:-_}"
if [[ -n "$DOMAIN" ]]; then
  # Versão com SSL — vai começar HTTP-only e ser substituída após certbot
  cat > deploy-vps/nginx.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    root /usr/share/nginx/html;
    index index.html;
    gzip on; gzip_vary on; gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json image/svg+xml;
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)\$ { expires 30d; add_header Cache-Control "public"; try_files \$uri =404; }
    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    location ~ /\\. { deny all; access_log off; log_not_found off; }
}
NGINX

  # Versão HTTP-only temporária (pra emitir cert com certbot standalone)
  cat > deploy-vps/nginx-http-only.conf <<NGINX
server {
    listen 80 default_server;
    server_name $DOMAIN _;
    root /usr/share/nginx/html;
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
else
  # Sem domínio: HTTP-only no IP
  cat > deploy-vps/nginx.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    gzip on; gzip_vary on; gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)$ { expires 30d; try_files $uri =404; }
    location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX
fi

# Build em modo HTTP-only primeiro se houver domínio (pra certbot funcionar)
SSL_OK="no"
if [[ -n "$DOMAIN" ]]; then
  log "Build inicial (HTTP) para emitir certificado SSL..."
  cp deploy-vps/nginx-http-only.conf deploy-vps/nginx.conf.tmp
  mv deploy-vps/nginx.conf deploy-vps/nginx-final.conf
  mv deploy-vps/nginx.conf.tmp deploy-vps/nginx.conf
  mkdir -p /var/www/certbot
  docker compose build --pull
  docker compose up -d
  sleep 5

  # Emite cert via certbot standalone (precisa parar nginx temporariamente)
  log "Emitindo certificado Let's Encrypt para $DOMAIN..."
  apt_install_resilient certbot
  docker compose stop app
  if certbot certonly --standalone --non-interactive --agree-tos \
    -m "${SSL_EMAIL:-admin@$DOMAIN}" -d "$DOMAIN" --preferred-challenges http; then
    SSL_OK="yes"
    ok "Certificado SSL emitido"
    # Restaura config final com SSL
    mv deploy-vps/nginx-final.conf deploy-vps/nginx.conf
    docker compose up -d --force-recreate
  else
    warn "Falha ao emitir SSL. Site continuará em HTTP."
    rm -f deploy-vps/nginx-final.conf
    docker compose up -d
  fi

  # Renovação automática do cert
  cat >/etc/cron.d/certbot-liberty <<EOF
0 3 * * * root certbot renew --quiet --pre-hook "docker compose -f $APP_DIR/docker-compose.yml stop app" --post-hook "docker compose -f $APP_DIR/docker-compose.yml start app"
EOF
else
  docker compose build --pull
  docker compose up -d
fi

ok "Site buildado e em execução"

# Healthcheck
log "Aguardando site responder..."
HEALTH_URL="http://localhost/"
for i in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" -o /dev/null; then ok "Site respondendo ✓"; break; fi
  sleep 2
  if (( i == 30 )); then
    err "Site não respondeu em 60s. Logs:"
    docker compose logs --tail=50 app
    exit 1
  fi
done

# ============================================================================
# [11/12] Deploy Edge Functions (opcional)
# ============================================================================
FUNCTIONS_DEPLOYED="no"
SECRETS_SET="no"
if [[ "$DEPLOY_FUNCTIONS" == "yes" ]]; then
  log "[11/12] Instalando Supabase CLI e deployando Edge Functions..."
  if ! command -v supabase >/dev/null 2>&1; then
    SUPA_ARCH="amd64"; [[ "$ARCH" == "aarch64" ]] && SUPA_ARCH="arm64"
    SUPA_VER="2.20.5"
    curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPA_VER}/supabase_${SUPA_VER}_linux_${SUPA_ARCH}.tar.gz" \
      -o /tmp/supabase.tgz
    tar -xzf /tmp/supabase.tgz -C /usr/local/bin/ supabase
    chmod +x /usr/local/bin/supabase
    rm -f /tmp/supabase.tgz
    ok "Supabase CLI $(supabase --version) instalado"
  fi

  cd "$APP_DIR"
  echo ""
  warn "Faça login no Supabase CLI a seguir (abrirá navegador OU pedirá token)"
  warn "Token disponível em: https://supabase.com/dashboard/account/tokens"
  echo ""
  if supabase login </dev/tty; then
    if supabase link --project-ref "$SUPABASE_PROJECT_ID" </dev/tty 2>/dev/null; then
      log "Configurando secrets das Edge Functions..."
      [[ -n "${SECRET_RESEND_API_KEY:-}" ]] && supabase secrets set "RESEND_API_KEY=$SECRET_RESEND_API_KEY" >/dev/null 2>&1 || true
      [[ -n "${SECRET_LOVABLE_API_KEY:-}" ]] && supabase secrets set "LOVABLE_API_KEY=$SECRET_LOVABLE_API_KEY" >/dev/null 2>&1 || true
      [[ -n "${SECRET_MP_WEBHOOK_SECRET:-}" ]] && supabase secrets set "MP_WEBHOOK_SECRET=$SECRET_MP_WEBHOOK_SECRET" >/dev/null 2>&1 || true
      [[ -n "${SECRET_EVOLUTION_API_URL:-}" ]] && supabase secrets set "EVOLUTION_API_URL=$SECRET_EVOLUTION_API_URL" >/dev/null 2>&1 || true
      [[ -n "${SECRET_EVOLUTION_API_KEY:-}" ]] && supabase secrets set "EVOLUTION_API_KEY=$SECRET_EVOLUTION_API_KEY" >/dev/null 2>&1 || true
      SECRETS_SET="yes"
      ok "Secrets configurados"

      log "Deployando todas as Edge Functions..."
      if supabase functions deploy --no-verify-jwt 2>&1 | tail -20; then
        FUNCTIONS_DEPLOYED="yes"
        ok "Edge Functions deployadas"
      else
        warn "Falha em algumas funções — rode manualmente: cd $APP_DIR && supabase functions deploy"
      fi
    else
      warn "Falha no link com projeto $SUPABASE_PROJECT_ID"
    fi
  else
    warn "Login Supabase falhou — pulando deploy de funções"
  fi
fi

# ============================================================================
# [12/12] Operacional (logrotate + healthcheck cron + INSTALL-INFO)
# ============================================================================
log "[12/12] Finalizando: logrotate + healthcheck + resumo..."

# Logrotate (Docker já gerencia via json-file driver no compose, mas garantimos)
cat >/etc/logrotate.d/docker-liberty <<'EOF'
/var/lib/docker/containers/*/*.log {
  rotate 5
  daily
  compress
  size=10M
  missingok
  delaycompress
  copytruncate
}
EOF

# Healthcheck cron (auto-restart se site cair)
cat >/etc/cron.d/liberty-healthcheck <<EOF
*/5 * * * * root curl -sf http://localhost/ -o /dev/null || (cd $APP_DIR && docker compose restart app) >> /var/log/liberty-healthcheck.log 2>&1
EOF

PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
SITE_URL="http://$PUBLIC_IP"
[[ "$SSL_OK" == "yes" ]] && SITE_URL="https://$DOMAIN"
[[ -n "$DOMAIN" && "$SSL_OK" != "yes" ]] && SITE_URL="http://$DOMAIN"

INSTALL_INFO="$APP_DIR/INSTALL-INFO.txt"
cat > "$INSTALL_INFO" <<EOF
Liberty Pharma — Instalação concluída em $(date)
================================================================

URLs
  Site:           $SITE_URL
  Admin:          $SITE_URL/admin
  Backend:        $SUPABASE_URL

Status
  Schema DB:      $([[ "$SCHEMA_APPLIED" == "yes" ]] && echo "✓ aplicado" || echo "⚠ manual")
  Admin user:     $([[ "$ADMIN_CREATED" == "yes" ]] && echo "✓ $ADMIN_EMAIL" || echo "⚠ criar manualmente")
  pg_cron/pg_net: $([[ "$EXTENSIONS_OK" == "yes" ]] && echo "✓ habilitadas" || echo "⚠ habilitar manualmente")
  Cron jobs:      $([[ "$CRON_JOBS_OK" == "yes" ]] && echo "✓ agendados" || echo "⚠ agendar manualmente")
  SSL HTTPS:      $([[ "$SSL_OK" == "yes" ]] && echo "✓ $DOMAIN" || echo "⚠ HTTP only")
  Edge Functions: $([[ "$FUNCTIONS_DEPLOYED" == "yes" ]] && echo "✓ deployadas" || echo "⚠ deploy manual")
  Secrets:        $([[ "$SECRETS_SET" == "yes" ]] && echo "✓ configurados" || echo "⚠ configurar manualmente")
  Fail2ban:       ✓ ativo (SSH brute-force)
  Auto-update:    ✓ ativo (security patches)
  Healthcheck:    ✓ a cada 5min (auto-restart)
  Timezone:       America/Sao_Paulo

Comandos úteis
  Ver logs:       docker compose -f $APP_DIR/docker-compose.yml logs -f app
  Reiniciar:      docker compose -f $APP_DIR/docker-compose.yml restart
  Atualizar:      cd $APP_DIR && bash deploy-vps/deploy.sh
  Renovar SSL:    certbot renew --dry-run
  Status fail2ban: fail2ban-client status sshd

Próximos passos
$([[ "$ADMIN_CREATED" != "yes" ]] && echo "  • Crie um admin: Supabase Auth → Users → Add user")
$([[ "$ADMIN_CREATED" != "yes" ]] && echo "    SQL: INSERT INTO public.user_roles (user_id, role) VALUES ('<UUID>','admin');")
$([[ "$FUNCTIONS_DEPLOYED" != "yes" && "$DEPLOY_FUNCTIONS" == "yes" ]] && echo "  • Redeploy functions: cd $APP_DIR && supabase functions deploy --no-verify-jwt")
$([[ "$SSL_OK" != "yes" && -n "$DOMAIN" ]] && echo "  • Verifique se o domínio $DOMAIN aponta para $PUBLIC_IP e rode: certbot certonly --standalone -d $DOMAIN")
  • Acesse $SITE_URL/admin

Backup do .env: /root/.liberty-env-backup-* (se existia instalação anterior)
EOF

ok "Resumo salvo em $INSTALL_INFO"

# ============================================================================
# Resumo final
# ============================================================================
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Site:           $SITE_URL
  🗄  Backend:        $SUPABASE_URL
  📋 Schema DB:      $([[ "$SCHEMA_APPLIED" == "yes" ]] && echo "✓ aplicado" || echo "⚠ manual")
  👤 Admin:          $([[ "$ADMIN_CREATED" == "yes" ]] && echo "✓ $ADMIN_EMAIL" || echo "⚠ criar manualmente")
  ⏰ Cron jobs:       $([[ "$CRON_JOBS_OK" == "yes" ]] && echo "✓ ativos" || echo "⚠ pendente")
  🔐 SSL HTTPS:      $([[ "$SSL_OK" == "yes" ]] && echo "✓ $DOMAIN" || echo "⚠ HTTP only")
  ⚡ Edge Functions: $([[ "$FUNCTIONS_DEPLOYED" == "yes" ]] && echo "✓ deployadas" || echo "⚠ não deployadas")
  🛡  Fail2ban:       ✓ ativo
  🔄 Healthcheck:    ✓ a cada 5min
  📁 Pasta:          $APP_DIR
  📄 Resumo:         $INSTALL_INFO

  Comandos úteis:
    docker compose -f $APP_DIR/docker-compose.yml logs -f app
    cd $APP_DIR && bash deploy-vps/deploy.sh    # atualizar
    cat $INSTALL_INFO                            # ver resumo

EOF
