#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker)
# Site + Supabase self-hosted na MESMA VPS (4GB+ RAM recomendado)
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
#
# Variáveis opcionais:
#   USE_LOCAL_SUPABASE=0  -> usa Lovable Cloud em vez de subir Supabase local
#   USE_LOCAL_SUPABASE=1  -> instala Supabase self-hosted (DEFAULT)
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
SUPA_DIR="${SUPA_DIR:-/opt/supabase}"
BRANCH="${BRANCH:-main}"
COMPOSE_VERSION="v2.29.7"
USE_LOCAL_SUPABASE="${USE_LOCAL_SUPABASE:-1}"

# Fallback para Lovable Cloud (caso USE_LOCAL_SUPABASE=0)
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
  if apt-get update -qq; then return 0; fi
  warn "Falha no apt update. Trocando mirrors para HTTPS..."
  rewrite_sources_to_https
  apt-get clean
  if apt-get update -qq; then ok "Apt OK com HTTPS"; return 0; fi
  if [[ "${VERSION_ID:-}" == "20.04" || "${VERSION_ID:-}" == "18.04" || "${VERSION_ID:-}" == "16.04" ]]; then
    warn "Ubuntu ${VERSION_ID}: tentando old-releases..."
    rewrite_sources_to_old_releases
    apt-get clean
    if apt-get update -qq; then ok "Apt OK com old-releases"; return 0; fi
  fi
  err "Não foi possível atualizar APT"
  exit 1
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
║     LIBERTY PHARMA — INSTALADOR DOCKER (Site + Supabase)     ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

TOTAL_STEPS=10
[[ "$USE_LOCAL_SUPABASE" != "1" ]] && TOTAL_STEPS=7

# ---------- 1. Limpeza COMPLETA ----------
log "[1/$TOTAL_STEPS] Limpando instalação anterior (Docker, app, supabase)..."
docker compose -f "$APP_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
docker compose -f "$SUPA_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
apt-get remove -y -qq docker docker.io docker-compose docker-compose-plugin containerd runc 2>/dev/null || true
rm -rf "$APP_DIR" "$SUPA_DIR" /var/lib/docker /etc/docker /usr/local/lib/docker 2>/dev/null || true
ok "Limpeza concluída"

# ---------- 2. Atualizar sistema ----------
log "[2/$TOTAL_STEPS] Atualizando pacotes essenciais..."
configure_apt_retries
apt_update_resilient
apt_install_resilient curl git ufw ca-certificates wget openssl python3 python3-pip jq
ok "Sistema atualizado"

# ---------- 3. Swap ----------
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
NEEDED_SWAP=2048
[[ "$USE_LOCAL_SUPABASE" == "1" ]] && NEEDED_SWAP=4096

if (( SWAP_MB < NEEDED_SWAP )); then
  log "[3/$TOTAL_STEPS] RAM=${RAM_MB}MB Swap=${SWAP_MB}MB. Criando swap de $((NEEDED_SWAP/1024))GB..."
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  fallocate -l "${NEEDED_SWAP}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "Swap de $((NEEDED_SWAP/1024))GB ativo"
else
  ok "[3/$TOTAL_STEPS] Swap suficiente (${SWAP_MB}MB)"
fi

# Aviso de RAM apertada para Supabase local
if [[ "$USE_LOCAL_SUPABASE" == "1" ]] && (( RAM_MB < 3500 )); then
  warn "RAM=${RAM_MB}MB é pouco para Supabase self-hosted (recomendado 4GB+)."
  warn "Vai funcionar mas pode ficar lento sob carga. Considere upgrade."
fi

# ---------- 4. Docker + Compose ----------
log "[4/$TOTAL_STEPS] Instalando Docker e Compose v2..."
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
log "[5/$TOTAL_STEPS] Configurando firewall (22 SSH, 80 HTTP$( [[ "$USE_LOCAL_SUPABASE" == "1" ]] && echo ", 8000 Supabase API" ))..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
[[ "$USE_LOCAL_SUPABASE" == "1" ]] && ufw allow 8000/tcp comment 'Supabase API' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo"

# ---------- 6. SUPABASE SELF-HOSTED (opcional) ----------
SUPABASE_URL_FINAL="$SUPABASE_URL_DEFAULT"
SUPABASE_KEY_FINAL="$SUPABASE_KEY_DEFAULT"
SUPABASE_PROJECT_ID_FINAL="$SUPABASE_PROJECT_ID_DEFAULT"

if [[ "$USE_LOCAL_SUPABASE" == "1" ]]; then
  log "[6/$TOTAL_STEPS] Instalando Supabase self-hosted em $SUPA_DIR..."

  pip3 install --quiet --break-system-packages pyjwt 2>/dev/null || pip3 install --quiet pyjwt

  mkdir -p "$SUPA_DIR"/{volumes/db/data,volumes/db/init,volumes/storage,volumes/functions/main,volumes/api}
  cd "$SUPA_DIR"

  POSTGRES_PASSWORD=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 40)
  DASHBOARD_PASSWORD=$(openssl rand -hex 16)
  SECRET_KEY_BASE=$(openssl rand -hex 64)
  PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

  ANON_KEY=$(python3 -c "
import jwt, time
print(jwt.encode({'role':'anon','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+5*365*24*3600},'$JWT_SECRET',algorithm='HS256'))
")
  SERVICE_ROLE_KEY=$(python3 -c "
import jwt, time
print(jwt.encode({'role':'service_role','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+5*365*24*3600},'$JWT_SECRET',algorithm='HS256'))
")

  cat > .env <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=postgres
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SITE_URL=http://$PUBLIC_IP
API_EXTERNAL_URL=http://$PUBLIC_IP:8000
SUPABASE_PUBLIC_URL=http://$PUBLIC_IP:8000
ADDITIONAL_REDIRECT_URLS=
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
MAILER_AUTOCONFIRM=true
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=Supabase
SMTP_ADMIN_EMAIL=admin@$PUBLIC_IP
STUDIO_DEFAULT_ORGANIZATION=Default
STUDIO_DEFAULT_PROJECT=Default
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
FILE_SIZE_LIMIT=52428800
SECRET_KEY_BASE=$SECRET_KEY_BASE
EOF
  chmod 600 .env

  # Postgres init: extensões + roles
  cat > volumes/db/init/00-init.sql <<SQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '$POSTGRES_PASSWORD'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN PASSWORD '$POSTGRES_PASSWORD' NOINHERIT CREATEROLE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin') THEN CREATE ROLE supabase_storage_admin LOGIN PASSWORD '$POSTGRES_PASSWORD' NOINHERIT CREATEROLE; END IF;
END\$\$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS realtime;
SQL

  # Kong gateway
  cat > volumes/api/kong.yml <<KONG
_format_version: "2.1"
_transform: true
consumers:
  - username: anon
    keyauth_credentials:
      - key: $ANON_KEY
  - username: service_role
    keyauth_credentials:
      - key: $SERVICE_ROLE_KEY
services:
  - name: auth-v1
    url: http://auth:9999/
    routes:
      - { name: auth-v1-all, strip_path: true, paths: [/auth/v1/] }
    plugins: [{ name: cors }]
  - name: rest-v1
    url: http://rest:3000/
    routes:
      - { name: rest-v1-all, strip_path: true, paths: [/rest/v1/] }
    plugins:
      - { name: cors }
      - { name: key-auth, config: { hide_credentials: true } }
  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes:
      - { name: realtime-v1-all, strip_path: true, paths: [/realtime/v1/] }
    plugins:
      - { name: cors }
      - { name: key-auth, config: { hide_credentials: false } }
  - name: storage-v1
    url: http://storage:5000/
    routes:
      - { name: storage-v1-all, strip_path: true, paths: [/storage/v1/] }
    plugins: [{ name: cors }]
  - name: functions-v1
    url: http://functions:9000/
    routes:
      - { name: functions-v1-all, strip_path: true, paths: [/functions/v1/] }
    plugins: [{ name: cors }]
KONG

  # Edge Functions runtime precisa de função "main"
  cat > volumes/functions/main/index.ts <<'TS'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
serve(async (req) => {
  const url = new URL(req.url)
  return new Response(JSON.stringify({ ok: true, path: url.pathname }), {
    headers: { 'content-type': 'application/json' }
  })
})
TS

  # docker-compose.yml do Supabase
  cat > docker-compose.yml <<'YAML'
name: supabase
services:
  db:
    image: supabase/postgres:15.6.1.139
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXPIRY}
    volumes:
      - ./volumes/db/data:/var/lib/postgresql/data
      - ./volumes/db/init:/docker-entrypoint-initdb.d
    ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 20
    deploy: { resources: { limits: { memory: 1024M } } }

  auth:
    image: supabase/gotrue:v2.158.1
    depends_on: { db: { condition: service_healthy } }
    restart: unless-stopped
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: ${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}
      GOTRUE_MAILER_AUTOCONFIRM: ${MAILER_AUTOCONFIRM}
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
    deploy: { resources: { limits: { memory: 256M } } }

  rest:
    image: postgrest/postgrest:v12.2.0
    depends_on: { db: { condition: service_healthy } }
    restart: unless-stopped
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: public,storage
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
    deploy: { resources: { limits: { memory: 256M } } }

  realtime:
    image: supabase/realtime:v2.30.34
    depends_on: { db: { condition: service_healthy } }
    restart: unless-stopped
    environment:
      PORT: 4000
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: ${JWT_SECRET}
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "10000"
      APP_NAME: realtime
      SEED_SELF_HOST: "true"
      RUN_JANITOR: "true"
    deploy: { resources: { limits: { memory: 256M } } }

  storage:
    image: supabase/storage-api:v1.11.13
    depends_on:
      db: { condition: service_healthy }
      rest: { condition: service_started }
    restart: unless-stopped
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      FILE_SIZE_LIMIT: ${FILE_SIZE_LIMIT}
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
    volumes: ["./volumes/storage:/var/lib/storage:z"]
    deploy: { resources: { limits: { memory: 256M } } }

  functions:
    image: supabase/edge-runtime:v1.58.6
    restart: unless-stopped
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgres://postgres:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    volumes: ["./volumes/functions:/home/deno/functions:Z"]
    command: [start, --main-service, /home/deno/functions/main]
    deploy: { resources: { limits: { memory: 256M } } }

  kong:
    image: kong:2.8.1
    restart: unless-stopped
    depends_on:
      auth: { condition: service_started }
      rest: { condition: service_started }
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /var/lib/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
    ports: ["8000:8000/tcp"]
    volumes: ["./volumes/api/kong.yml:/var/lib/kong/kong.yml:ro"]
    deploy: { resources: { limits: { memory: 256M } } }
YAML

  # Script Studio sob demanda
  cat > "$SUPA_DIR/studio.sh" <<'STUDIO'
#!/bin/bash
cd /opt/supabase && source .env
docker run --rm -it --network supabase_default -p 127.0.0.1:3000:3000 \
  -e STUDIO_PG_META_URL=http://meta:8080 \
  -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  -e SUPABASE_URL=http://kong:8000 \
  -e SUPABASE_PUBLIC_URL=$SUPABASE_PUBLIC_URL \
  -e SUPABASE_ANON_KEY=$ANON_KEY \
  -e SUPABASE_SERVICE_KEY=$SERVICE_ROLE_KEY \
  supabase/studio:20241014-c083b3b
STUDIO
  chmod +x "$SUPA_DIR/studio.sh"

  log "Subindo stack Supabase (download de imagens, ~3-5 min)..."
  docker compose pull --quiet
  docker compose up -d

  log "Aguardando Postgres ficar saudável..."
  for i in $(seq 1 90); do
    if docker compose exec -T db pg_isready -U postgres &>/dev/null; then
      ok "Postgres OK"
      break
    fi
    sleep 2
    if (( i == 90 )); then
      err "Postgres não ficou pronto em 180s. Logs:"
      docker compose logs --tail=50 db
      exit 1
    fi
  done

  # Aguarda Kong responder
  log "Aguardando gateway Kong na porta 8000..."
  for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/ -o /dev/null 2>&1 || \
       curl -s http://localhost:8000/ -o /dev/null; then
      ok "Kong respondendo"
      break
    fi
    sleep 2
  done

  SUPABASE_URL_FINAL="http://$PUBLIC_IP:8000"
  SUPABASE_KEY_FINAL="$ANON_KEY"
  SUPABASE_PROJECT_ID_FINAL="local"
  ok "Supabase self-hosted no ar em $SUPABASE_URL_FINAL"
fi

# ---------- 7. Clonar repo ----------
NEXT=$([[ "$USE_LOCAL_SUPABASE" == "1" ]] && echo "7" || echo "6")
log "[$NEXT/$TOTAL_STEPS] Clonando código do site em $APP_DIR..."
git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
cd "$APP_DIR"

cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL_FINAL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_KEY_FINAL
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID_FINAL
EOF
chmod 600 .env
ok "Código + .env apontando para $SUPABASE_URL_FINAL"

# ---------- 8. Build site ----------
NEXT=$((NEXT+1))
log "[$NEXT/$TOTAL_STEPS] Build da imagem do site (~3-5 min)..."
docker compose build --pull
docker compose up -d
ok "Site subiu"

# ---------- 9. Healthcheck ----------
NEXT=$((NEXT+1))
log "[$NEXT/$TOTAL_STEPS] Aguardando site na porta 80..."
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

# ---------- 10. Resumo ----------
PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Site:           http://$PUBLIC_IP
EOF

if [[ "$USE_LOCAL_SUPABASE" == "1" ]]; then
cat <<EOF
  🗄  Supabase API:   http://$PUBLIC_IP:8000
  📁 Site:           $APP_DIR
  📁 Supabase:       $SUPA_DIR
  🔑 Credenciais:    $SUPA_DIR/.env  (ANON_KEY, SERVICE_ROLE_KEY)

  Comandos do SITE:
    docker compose -f $APP_DIR/docker-compose.yml logs -f app
    docker compose -f $APP_DIR/docker-compose.yml restart

  Comandos do SUPABASE:
    docker compose -f $SUPA_DIR/docker-compose.yml ps
    docker compose -f $SUPA_DIR/docker-compose.yml logs -f auth
    bash $SUPA_DIR/studio.sh    # Studio sob demanda

  ⚠  Banco está VAZIO. Acesse o painel admin do site para cadastrar
     produtos, configurações e criar o primeiro usuário admin.
EOF
else
cat <<EOF
  📁 Pasta:          $APP_DIR
  🔄 Atualizar:      cd $APP_DIR && bash deploy-vps/deploy.sh
EOF
fi

echo ""
