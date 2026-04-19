#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker) — só o site
# Banco/Auth/Storage/Functions ficam no Supabase Cloud (gerenciado por você)
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
#
# Variáveis opcionais (modo não-interativo):
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   SUPABASE_PROJECT_ID=xxx \
#     curl ... | sudo -E bash
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

[[ $EUID -ne 0 ]] && { err "Rode como root"; exit 1; }

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║       LIBERTY PHARMA — INSTALADOR DOCKER (somente site)      ║
║       Banco em Supabase Cloud (gerenciado)                   ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- 1. Coleta de credenciais Supabase ----------
log "[1/7] Configuração do Supabase Cloud"
echo ""

# Detecta TTY disponível (necessário quando rodando via `curl | bash`)
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
    err "Sem terminal interativo disponível."
    err "Rode novamente baixando o script primeiro:"
    err "  curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh"
    err "  sudo bash /tmp/install.sh"
    err "Ou passe as variáveis via ambiente:"
    err "  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_PROJECT_ID=... sudo -E bash /tmp/install.sh"
    exit 1
  fi

  printf "%s" "$__label" > /dev/tty
  IFS= read -r __value <&3 || true
  printf -v "$__var_name" '%s' "$__value"
}

if [[ -z "${SUPABASE_URL:-}" ]]; then
  cat <<'INFO'
  Antes de continuar, você precisa de um projeto Supabase pronto:
    1) Crie em: https://supabase.com/dashboard/projects
    2) Vá em Project Settings → API e copie:
         - Project URL          (ex: https://abc.supabase.co)
         - anon / public key    (eyJ...)
         - Project Reference    (abc — parte antes de .supabase.co)
    3) (Opcional) Para criar o schema automaticamente, copie também:
         Project Settings → Database → Connection string → URI
         Formato: postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres
       Se não fornecer, você precisará rodar o schema.sql manualmente no SQL Editor.

INFO
  prompt_tty SUPABASE_URL "  Project URL (https://xxx.supabase.co): "
  prompt_tty SUPABASE_ANON_KEY "  anon key (eyJ...): "
  prompt_tty SUPABASE_PROJECT_ID "  Project Reference (xxx — opcional, deduzido da URL): "
  prompt_tty SUPABASE_DB_URL "  Connection string Postgres (opcional, ENTER para pular): "
fi

# Limpa espaços/quebras
SUPABASE_URL="$(echo -n "$SUPABASE_URL" | tr -d '[:space:]')"
SUPABASE_ANON_KEY="$(echo -n "$SUPABASE_ANON_KEY" | tr -d '[:space:]')"
SUPABASE_PROJECT_ID="$(echo -n "${SUPABASE_PROJECT_ID:-}" | tr -d '[:space:]')"
SUPABASE_URL="${SUPABASE_URL%/}"

# Aceita URL sem https:// (adiciona) e sem .supabase.co (adiciona)
if [[ -n "$SUPABASE_URL" && ! "$SUPABASE_URL" =~ ^https?:// ]]; then
  if [[ "$SUPABASE_URL" =~ \.supabase\.co$ ]]; then
    SUPABASE_URL="https://$SUPABASE_URL"
  else
    SUPABASE_URL="https://${SUPABASE_URL}.supabase.co"
  fi
fi

# Validação
if [[ -z "$SUPABASE_URL" ]]; then
  err "URL do Supabase vazia. Cole a Project URL completa (https://xxx.supabase.co)"; exit 1
fi
if [[ ! "$SUPABASE_URL" =~ ^https?://[a-zA-Z0-9.-]+\.supabase\.co$ ]]; then
  err "URL inválida: '$SUPABASE_URL' — esperado formato https://xxx.supabase.co"; exit 1
fi
if [[ -z "$SUPABASE_ANON_KEY" ]]; then
  err "anon key vazia. Copie a chave 'anon / public' de Project Settings → API"; exit 1
fi
if [[ ${#SUPABASE_ANON_KEY} -lt 100 ]]; then
  err "anon key parece curta demais (${#SUPABASE_ANON_KEY} chars; esperado JWT >100)"; exit 1
fi
if [[ -z "$SUPABASE_PROJECT_ID" ]]; then
  SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co|\1|')
fi
SUPABASE_DB_URL="$(echo -n "${SUPABASE_DB_URL:-}" | tr -d '[:space:]')"
ok "Supabase configurado: $SUPABASE_URL (ref: $SUPABASE_PROJECT_ID)"

# ---------- 1b. Schema automático (se DB URL fornecida) ----------
SCHEMA_APPLIED="no"
if [[ -n "$SUPABASE_DB_URL" ]]; then
  if [[ ! "$SUPABASE_DB_URL" =~ ^postgres(ql)?:// ]]; then
    err "Connection string inválida. Esperado: postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres"
    exit 1
  fi
  log "Instalando psql (postgresql-client) para aplicar schema..."
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq --no-install-recommends postgresql-client >/dev/null 2>&1 || \
    apt_install_resilient postgresql-client
  log "Aplicando schema.sql no banco Supabase..."
  SCHEMA_URL="https://raw.githubusercontent.com/VW2Digital/variation-vault-core/${BRANCH}/deploy-vps/supabase/schema.sql"
  TMP_SCHEMA="/tmp/liberty-schema.sql"
  if ! curl -fsSL "$SCHEMA_URL" -o "$TMP_SCHEMA"; then
    err "Falha ao baixar schema.sql de $SCHEMA_URL"
    exit 1
  fi
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$TMP_SCHEMA" >/tmp/liberty-schema.log 2>&1; then
    SCHEMA_APPLIED="yes"
    ok "Schema aplicado com sucesso (23 tabelas + RLS + Realtime + Storage)"
  else
    err "Falha ao aplicar schema. Últimas linhas do log:"
    tail -n 20 /tmp/liberty-schema.log >&2
    err "Log completo: /tmp/liberty-schema.log"
    err "Alternativa: cole o schema.sql manualmente no SQL Editor do Supabase."
    exit 1
  fi
  rm -f "$TMP_SCHEMA"
else
  warn "Connection string não fornecida — rode o schema.sql manualmente no SQL Editor:"
  warn "  https://raw.githubusercontent.com/VW2Digital/variation-vault-core/${BRANCH}/deploy-vps/supabase/schema.sql"
fi

# ---------- 2. Limpeza ----------
log "[2/7] Limpando instalação anterior..."
docker compose -f "$APP_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
docker compose -f /opt/supabase/docker-compose.yml down --remove-orphans 2>/dev/null || true
apt-get remove -y -qq docker docker.io docker-compose docker-compose-plugin containerd runc 2>/dev/null || true
rm -rf "$APP_DIR" /opt/supabase /var/lib/docker /etc/docker /usr/local/lib/docker 2>/dev/null || true
ok "Limpeza concluída"

# ---------- 3. Sistema base ----------
log "[3/7] Atualizando pacotes essenciais..."
configure_apt_retries
apt_update_resilient
apt_install_resilient curl git ufw ca-certificates wget
ok "Sistema atualizado"

# ---------- 4. Swap (1GB) ----------
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( SWAP_MB < 1024 )); then
  log "[4/7] Criando swap de 1GB..."
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
  ok "[4/7] Swap suficiente (${SWAP_MB}MB)"
fi

# ---------- 5. Docker + Compose ----------
log "[5/7] Instalando Docker e Compose v2..."
apt_install_resilient docker.io
systemctl enable --now docker >/dev/null
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) + Compose $(docker compose version --short)"

# ---------- 6. Firewall ----------
log "[6/7] Configurando firewall (22 SSH, 80 HTTP, 443 HTTPS)..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo"

# ---------- 7. Clone + .env + build ----------
log "[7/7] Clonando código e fazendo build do site..."
git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
cd "$APP_DIR"

cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID
EOF
chmod 600 .env

docker compose build --pull
docker compose up -d
ok "Site buildado e em execução"

# Healthcheck
log "Aguardando site responder na porta 80..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/ -o /dev/null; then
    ok "Site respondendo ✓"
    break
  fi
  sleep 2
  if (( i == 30 )); then
    err "Site não respondeu em 60s. Logs:"
    docker compose logs --tail=50 app
    exit 1
  fi
done

# ---------- Resumo ----------
PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Site:           http://$PUBLIC_IP
  🗄  Backend:        $SUPABASE_URL
  📁 Pasta:          $APP_DIR
  🔑 .env:           $APP_DIR/.env

  Comandos úteis:
    docker compose -f $APP_DIR/docker-compose.yml logs -f app
    docker compose -f $APP_DIR/docker-compose.yml restart
    cd $APP_DIR && bash deploy-vps/deploy.sh    # atualizar do git

  Próximos passos no Supabase:
    1) Authentication → Users → criar primeiro usuário
    2) SQL Editor → promover a admin:
         INSERT INTO public.user_roles (user_id, role)
         VALUES ('<UUID>', 'admin');
    3) Acessar http://$PUBLIC_IP/admin

EOF
