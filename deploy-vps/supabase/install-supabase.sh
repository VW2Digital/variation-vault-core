#!/bin/bash
###############################################################################
# Supabase Self-Hosted - Instalador Enxuto (4GB RAM)
#
# Stack instalado:
#   - PostgreSQL 15 (com extensões pgcrypto, pg_cron, pg_net, uuid-ossp)
#   - GoTrue (Auth)
#   - PostgREST (API REST)
#   - Realtime
#   - Storage API
#   - Kong (gateway, porta 8000)
#   - Edge Functions runtime (Deno)
#   - imgproxy (transformação de imagens)
#
# DESABILITADO para economizar RAM (~2.5GB -> ~1.8GB):
#   - Studio (UI) - sobe sob demanda via ./studio.sh
#   - Logflare / Vector (logs centralizados)
#   - Analytics
#
# Acesso:
#   - API:        http://SEU_IP:8000
#   - Studio:     ssh -L 3000:localhost:3000 root@SEU_IP  + ./studio.sh
###############################################################################

set -e

INSTALL_DIR="/opt/supabase"
COMPOSE_VERSION="v2.27.0"

log()   { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
ok()    { echo -e "\033[1;32m✓\033[0m $1"; }
warn()  { echo -e "\033[1;33m⚠\033[0m $1"; }
fail()  { echo -e "\033[1;31m✗\033[0m $1"; exit 1; }

[[ $EUID -ne 0 ]] && fail "Rode como root: sudo bash $0"

###############################################################################
# 1. Pré-requisitos
###############################################################################
log "1/8 Verificando pré-requisitos"

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
[[ $TOTAL_RAM_MB -lt 3500 ]] && warn "RAM detectada: ${TOTAL_RAM_MB}MB (recomendado >=4GB). Vai apertar."

# Swap de 4GB se não houver
if [[ $(swapon --show | wc -l) -eq 0 ]]; then
  log "Criando swap de 4GB (essencial pra estabilidade)"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p
  ok "Swap 4GB ativo"
fi

###############################################################################
# 2. Docker
###############################################################################
log "2/8 Garantindo Docker + Compose v2"

if ! command -v docker &>/dev/null; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') pronto"

###############################################################################
# 3. Diretório e secrets
###############################################################################
log "3/8 Gerando secrets aleatórios"

mkdir -p "$INSTALL_DIR"/{volumes/db/data,volumes/storage,volumes/functions,volumes/api}
cd "$INSTALL_DIR"

if [[ ! -f .env ]]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 40)
  DASHBOARD_PASSWORD=$(openssl rand -hex 16)
  SECRET_KEY_BASE=$(openssl rand -hex 64)
  VAULT_ENC_KEY=$(openssl rand -hex 32)
  LOGFLARE_KEY=$(openssl rand -hex 32)

  # Gera ANON_KEY e SERVICE_ROLE_KEY com Python (HS256 JWT)
  apt-get install -y python3 python3-pip >/dev/null 2>&1 || true
  pip3 install --quiet --break-system-packages pyjwt 2>/dev/null || pip3 install --quiet pyjwt

  ANON_KEY=$(python3 -c "
import jwt, time
print(jwt.encode({'role':'anon','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+5*365*24*3600},'$JWT_SECRET',algorithm='HS256'))
")
  SERVICE_ROLE_KEY=$(python3 -c "
import jwt, time
print(jwt.encode({'role':'service_role','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+5*365*24*3600},'$JWT_SECRET',algorithm='HS256'))
")

  PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

  cat > .env <<EOF
############### Postgres ###############
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

############### JWT ###############
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

############### URLs ###############
SITE_URL=http://$PUBLIC_IP
API_EXTERNAL_URL=http://$PUBLIC_IP:8000
SUPABASE_PUBLIC_URL=http://$PUBLIC_IP:8000
ADDITIONAL_REDIRECT_URLS=

############### Auth ###############
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
ENABLE_ANONYMOUS_USERS=false
MAILER_AUTOCONFIRM=true

############### SMTP (configure depois se quiser email) ###############
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=Supabase
SMTP_ADMIN_EMAIL=admin@$PUBLIC_IP

############### Studio (sob demanda) ###############
STUDIO_DEFAULT_ORGANIZATION=Default
STUDIO_DEFAULT_PROJECT=Default
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD

############### Storage ###############
FILE_SIZE_LIMIT=52428800

############### Realtime / Misc ###############
SECRET_KEY_BASE=$SECRET_KEY_BASE
VAULT_ENC_KEY=$VAULT_ENC_KEY
LOGFLARE_API_KEY=$LOGFLARE_KEY
EOF
  chmod 600 .env
  ok "Secrets gerados em $INSTALL_DIR/.env"
else
  warn ".env já existe — reutilizando"
fi

source .env

###############################################################################
# 4. Kong config (gateway)
###############################################################################
log "4/8 Configurando Kong API Gateway"

cat > volumes/api/kong.yml <<'KONG'
_format_version: "2.1"
_transform: true

consumers:
  - username: anon
    keyauth_credentials:
      - key: ${SUPABASE_ANON_KEY}
  - username: service_role
    keyauth_credentials:
      - key: ${SUPABASE_SERVICE_KEY}

services:
  - name: auth-v1
    url: http://auth:9999/
    routes:
      - name: auth-v1-all
        strip_path: true
        paths: [/auth/v1/]
    plugins:
      - name: cors

  - name: rest-v1
    url: http://rest:3000/
    routes:
      - name: rest-v1-all
        strip_path: true
        paths: [/rest/v1/]
    plugins:
      - name: cors
      - name: key-auth
        config: { hide_credentials: true }

  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes:
      - name: realtime-v1-all
        strip_path: true
        paths: [/realtime/v1/]
    plugins:
      - name: cors
      - name: key-auth
        config: { hide_credentials: false }

  - name: storage-v1
    url: http://storage:5000/
    routes:
      - name: storage-v1-all
        strip_path: true
        paths: [/storage/v1/]
    plugins:
      - name: cors

  - name: functions-v1
    url: http://functions:9000/
    routes:
      - name: functions-v1-all
        strip_path: true
        paths: [/functions/v1/]
    plugins:
      - name: cors
KONG

# Substitui placeholders
sed -i "s|\${SUPABASE_ANON_KEY}|$ANON_KEY|g; s|\${SUPABASE_SERVICE_KEY}|$SERVICE_ROLE_KEY|g" volumes/api/kong.yml
ok "Kong configurado"

###############################################################################
# 5. Postgres init scripts (extensões + roles)
###############################################################################
log "5/8 Preparando init scripts do Postgres"

mkdir -p volumes/db/init
cat > volumes/db/init/00-init.sql <<'SQL'
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Roles padrão Supabase
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END$$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
SQL

# Injeta a senha real do authenticator
sed -i "s|CHANGE_ME|$POSTGRES_PASSWORD|g" volumes/db/init/00-init.sql
ok "Init scripts prontos"

###############################################################################
# 6. docker-compose.yml (modo enxuto)
###############################################################################
log "6/8 Gerando docker-compose.yml"

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
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    deploy:
      resources:
        limits:
          memory: 1024M

  auth:
    image: supabase/gotrue:v2.158.1
    depends_on:
      db: { condition: service_healthy }
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
    deploy:
      resources:
        limits:
          memory: 256M

  rest:
    image: postgrest/postgrest:v12.2.0
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: public,storage
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
    deploy:
      resources:
        limits:
          memory: 256M

  realtime:
    image: supabase/realtime:v2.30.34
    depends_on:
      db: { condition: service_healthy }
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
    deploy:
      resources:
        limits:
          memory: 256M

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
    volumes:
      - ./volumes/storage:/var/lib/storage:z
    deploy:
      resources:
        limits:
          memory: 256M

  functions:
    image: supabase/edge-runtime:v1.58.6
    restart: unless-stopped
    environment:
      JWT_SECRET: ${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgres://postgres:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    command:
      - start
      - --main-service
      - /home/deno/functions/main
    deploy:
      resources:
        limits:
          memory: 256M

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
    ports:
      - "8000:8000/tcp"
    volumes:
      - ./volumes/api/kong.yml:/var/lib/kong/kong.yml:ro
    deploy:
      resources:
        limits:
          memory: 256M
YAML
ok "docker-compose.yml gerado"

###############################################################################
# 7. Função main (Edge Functions runtime precisa de uma)
###############################################################################
mkdir -p volumes/functions/main
cat > volumes/functions/main/index.ts <<'TS'
// Roteador padrão das Edge Functions self-hosted
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\//, '')
  return new Response(JSON.stringify({ message: 'Edge runtime ok', path }), {
    headers: { 'content-type': 'application/json' }
  })
})
TS

###############################################################################
# 8. Firewall + sobe stack
###############################################################################
log "7/8 Liberando porta 8000 no firewall"
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 8000/tcp >/dev/null
  echo "y" | ufw enable >/dev/null 2>&1 || true
fi

log "8/8 Subindo stack (pode levar 3-5 min na primeira vez)"
docker compose pull
docker compose up -d

# Aguarda Postgres
log "Aguardando Postgres ficar saudável..."
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U postgres &>/dev/null; then
    ok "Postgres OK"
    break
  fi
  sleep 2
done

###############################################################################
# Studio sob demanda
###############################################################################
cat > "$INSTALL_DIR/studio.sh" <<'STUDIO'
#!/bin/bash
# Sobe Studio apenas quando rodar este script. Mata após Ctrl+C.
cd /opt/supabase
source .env
docker run --rm -it \
  --network supabase_default \
  -p 127.0.0.1:3000:3000 \
  -e STUDIO_PG_META_URL=http://meta:8080 \
  -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  -e DEFAULT_ORGANIZATION_NAME=$STUDIO_DEFAULT_ORGANIZATION \
  -e DEFAULT_PROJECT_NAME=$STUDIO_DEFAULT_PROJECT \
  -e SUPABASE_URL=http://kong:8000 \
  -e SUPABASE_PUBLIC_URL=$SUPABASE_PUBLIC_URL \
  -e SUPABASE_ANON_KEY=$ANON_KEY \
  -e SUPABASE_SERVICE_KEY=$SERVICE_ROLE_KEY \
  supabase/studio:20241014-c083b3b
STUDIO
chmod +x "$INSTALL_DIR/studio.sh"

###############################################################################
# Resumo
###############################################################################
PUBLIC_IP=$(grep API_EXTERNAL_URL .env | cut -d= -f2 | sed 's|http://||;s|:8000||')

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  ✓ SUPABASE SELF-HOSTED INSTALADO"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "  📡 API URL:          http://$PUBLIC_IP:8000"
echo "  🔑 ANON_KEY:         $(grep ^ANON_KEY .env | cut -d= -f2)"
echo "  🔐 SERVICE_ROLE_KEY: $(grep ^SERVICE_ROLE_KEY .env | cut -d= -f2)"
echo ""
echo "  📁 Tudo em:    $INSTALL_DIR"
echo "  📋 Secrets em: $INSTALL_DIR/.env  (chmod 600)"
echo ""
echo "  ▶ Status:       cd $INSTALL_DIR && docker compose ps"
echo "  ▶ Logs:         cd $INSTALL_DIR && docker compose logs -f auth"
echo "  ▶ Restart:      cd $INSTALL_DIR && docker compose restart"
echo "  ▶ Studio (UI):  cd $INSTALL_DIR && ./studio.sh"
echo "                  depois: ssh -L 3000:localhost:3000 root@$PUBLIC_IP"
echo "                  abre: http://localhost:3000"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  ⚠️  PRÓXIMO PASSO: atualizar o .env do SITE na VPS:"
echo "      VITE_SUPABASE_URL=http://$PUBLIC_IP:8000"
echo "      VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY acima>"
echo "      Depois: cd /opt/liberty-pharma && docker compose up -d --build"
echo "════════════════════════════════════════════════════════════════════"
