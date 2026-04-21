#!/usr/bin/env bash
###############################################################################
# install.sh — Liberty Pharma (Vite + React) — Instalação nativa Ubuntu/Debian
#
# Faz APENAS 3 coisas:
#   STEP 1 — Instala Node.js LTS, Git, Nginx, builda o app e configura SPA
#   STEP 2 — Instala Certbot e emite certificado SSL para o domínio
#   STEP 3 — Conecta a um Supabase EXTERNO via Classic Access Token:
#            descobre a anon key automaticamente pela Management API,
#            aplica o schema SQL e grava credenciais em /var/www/app/.env.
#
# Sem Docker, sem PM2, sem Postgres, sem extras.
###############################################################################
set -euo pipefail

# ----------------------------- Cores ----------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

# ----------------------------- Pré-checagens --------------------------------
if [[ $EUID -ne 0 ]]; then
    err "Este script precisa ser executado como root (use: sudo bash install.sh)"
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    err "Este script suporta apenas Ubuntu/Debian (apt-get não encontrado)."
    exit 1
fi

# ----------------------------- Configuração ---------------------------------
APP_DIR="/var/www/app"
REPO_URL_DEFAULT="https://github.com/VW2Digital/variation-vault-core.git"
DOMAIN_DEFAULT="luminaeliberty.com"
EMAIL_DEFAULT="libertyluminaepharma@gmail.com"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Liberty Pharma — Instalação Nativa (Vite + Nginx)      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

read -rp "URL do repositório Git [${REPO_URL_DEFAULT}]: " REPO_URL
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
if [[ -z "$REPO_URL" ]]; then
    err "URL do repositório não pode ser vazia."
    exit 1
fi

# ----------------------------- Coleta Supabase ANTES do build ---------------
# Usa Classic Access Token (sbp_...) para descobrir tudo automaticamente:
#   - Anon key e service_role via Management API
#   - Aplicar schema SQL via /v1/projects/{ref}/database/query
# As VITE_* entram no bundle durante `npm run build`.
echo
info "Configuração do Supabase (projeto externo via Management API)"
echo "Você precisa de:"
echo "  1) Project Ref (ex: ntlfjekvisepsusbcjsv) — Settings → General → Reference ID"
echo "  2) Classic Access Token (sbp_...) — https://supabase.com/dashboard/account/tokens"
echo

read -rp "SUPABASE_PROJECT_REF (ex: ntlfjekvisepsusbcjsv): " SUPABASE_PROJECT_REF
if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    err "Project Ref não pode ser vazio."
    exit 1
fi
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z]{20}$ ]]; then
    err "Project Ref inválido (esperado: 20 letras minúsculas, ex: ntlfjekvisepsusbcjsv)."
    exit 1
fi

echo
echo "Cole o Classic Access Token (formato sbp_...). A entrada fica oculta."
read -rsp "SUPABASE_ACCESS_TOKEN: " SUPABASE_ACCESS_TOKEN
echo
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    err "Access Token não pode ser vazio."
    exit 1
fi
if [[ ! "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_ ]]; then
    err "Token inválido — deve começar com 'sbp_' (Classic Access Token)."
    exit 1
fi

SUPABASE_URL_INPUT="https://${SUPABASE_PROJECT_REF}.supabase.co"

# Garante curl + jq disponíveis (usados na descoberta da anon key)
if ! command -v curl >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl; fi
if ! command -v jq >/dev/null 2>&1;   then apt-get update -y && apt-get install -y jq;   fi

info "Validando token e buscando chaves API do projeto $SUPABASE_PROJECT_REF..."
API_KEYS_JSON="$(curl -fsS \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Accept: application/json" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys" 2>&1)" || {
    err "Falha ao acessar Management API. Verifique o Project Ref e o Access Token."
    err "Resposta: $API_KEYS_JSON"
    exit 1
}

SUPABASE_ANON_KEY="$(echo "$API_KEYS_JSON" | jq -r '.[] | select(.name=="anon") | .api_key')"
SUPABASE_SERVICE_ROLE_KEY="$(echo "$API_KEYS_JSON" | jq -r '.[] | select(.name=="service_role") | .api_key')"

if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == "null" ]]; then
    err "Não foi possível extrair a anon key. Resposta da API: $API_KEYS_JSON"
    exit 1
fi
ok "Anon key obtida via Management API (${#SUPABASE_ANON_KEY} chars)"
ok "Service role key obtida (uso server-side)"

# ----------------------------- Validação cruzada ----------------------------
# Garante que anon key, service_role key e o endpoint REST do projeto
# pertencem todos ao mesmo SUPABASE_PROJECT_REF informado. Evita o erro
# clássico de colar chave de outro projeto e só descobrir em produção.
info "Validando consistência entre anon key, service_role e project ref..."

# Decodifica o payload (parte 2) de um JWT base64url e extrai um campo via jq.
# Tolera padding ausente — base64 do POSIX exige múltiplo de 4.
jwt_field() {
    local jwt="$1" field="$2" payload
    payload="$(echo "$jwt" | cut -d. -f2)"
    # base64url → base64 + padding
    payload="${payload//-/+}"
    payload="${payload//_/\/}"
    case $(( ${#payload} % 4 )) in
        2) payload="${payload}==" ;;
        3) payload="${payload}=" ;;
    esac
    echo "$payload" | base64 -d 2>/dev/null | jq -r ".${field} // empty"
}

ANON_REF="$(jwt_field "$SUPABASE_ANON_KEY" "ref")"
ANON_ROLE="$(jwt_field "$SUPABASE_ANON_KEY" "role")"
SR_REF="$(jwt_field "$SUPABASE_SERVICE_ROLE_KEY" "ref")"
SR_ROLE="$(jwt_field "$SUPABASE_SERVICE_ROLE_KEY" "role")"
ANON_EXP="$(jwt_field "$SUPABASE_ANON_KEY" "exp")"

# 1) Anon key tem role correto
if [[ "$ANON_ROLE" != "anon" ]]; then
    err "Anon key tem role '$ANON_ROLE' (esperado: 'anon'). Chave inválida."
    exit 1
fi
ok "Anon key role = anon"

# 2) Service role key tem role correto
if [[ "$SR_ROLE" != "service_role" ]]; then
    err "Service role key tem role '$SR_ROLE' (esperado: 'service_role')."
    exit 1
fi
ok "Service role key role = service_role"

# 3) Ambas as chaves apontam para o MESMO project ref informado
if [[ "$ANON_REF" != "$SUPABASE_PROJECT_REF" ]]; then
    err "Anon key pertence ao projeto '$ANON_REF', mas você informou '$SUPABASE_PROJECT_REF'."
    err "As chaves não pertencem ao projeto informado — abortando antes do build."
    exit 1
fi
if [[ "$SR_REF" != "$SUPABASE_PROJECT_REF" ]]; then
    err "Service role key pertence ao projeto '$SR_REF', mas você informou '$SUPABASE_PROJECT_REF'."
    exit 1
fi
ok "Anon key e service_role pertencem ao projeto $SUPABASE_PROJECT_REF"

# 4) Anon key não está expirada
if [[ -n "$ANON_EXP" ]] && [[ "$ANON_EXP" =~ ^[0-9]+$ ]]; then
    NOW="$(date +%s)"
    if (( ANON_EXP < NOW )); then
        err "Anon key expirou em $(date -d "@$ANON_EXP" 2>/dev/null || echo "$ANON_EXP")."
        err "Gere novas chaves no painel do Supabase e rode o instalador de novo."
        exit 1
    fi
    DAYS_LEFT=$(( (ANON_EXP - NOW) / 86400 ))
    ok "Anon key válida por mais $DAYS_LEFT dias"
fi

# 5) URL pública do projeto responde de fato (DNS + HTTPS funcionando)
URL_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    "${SUPABASE_URL_INPUT}/rest/v1/" || echo "000")"
# Códigos aceitos:
#  200/404 → projeto respondeu normalmente
#  401     → PostgREST devolve 401 na raiz mesmo com apikey válida; só prova que respondeu
#  301/302 → redirect (raro, mas projeto está vivo)
if [[ "$URL_HTTP" == "200" || "$URL_HTTP" == "401" || "$URL_HTTP" == "404" \
      || "$URL_HTTP" == "301" || "$URL_HTTP" == "302" ]]; then
    ok "Endpoint REST de $SUPABASE_PROJECT_REF respondeu HTTP $URL_HTTP (projeto online)"
else
    err "Endpoint $SUPABASE_URL_INPUT/rest/v1/ retornou HTTP $URL_HTTP. Projeto inacessível."
    err "Verifique se $SUPABASE_PROJECT_REF está ativo (não pausado) no painel do Supabase."
    exit 1
fi

# 6) Confirmar que a anon key NÃO está revogada — usar o endpoint /auth/v1/settings
#    (público com apikey, retorna 200 quando a key bate com o projeto e 401 se foi revogada)
AUTH_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    "${SUPABASE_URL_INPUT}/auth/v1/settings" || echo "000")"
if [[ "$AUTH_HTTP" == "200" ]]; then
    ok "Anon key validada contra /auth/v1/settings (HTTP 200)"
elif [[ "$AUTH_HTTP" == "401" || "$AUTH_HTTP" == "403" ]]; then
    err "Anon key foi rejeitada por /auth/v1/settings (HTTP $AUTH_HTTP)."
    err "A key provavelmente foi revogada. Gere novas chaves no painel do Supabase."
    exit 1
else
    info "/auth/v1/settings retornou HTTP $AUTH_HTTP — seguindo mesmo assim."
fi

ok "Validação cruzada concluída — todas as credenciais batem com $SUPABASE_PROJECT_REF"

###############################################################################
# STEP 1 — Instalar app (Node + Git + Nginx + build + config SPA)
###############################################################################
step "STEP 1 — Instalando aplicação"

info "Atualizando lista de pacotes..."
apt-get update -y

# Git
if ! command -v git >/dev/null 2>&1; then
    info "Instalando Git..."
    apt-get install -y git
fi
ok "Git: $(git --version)"

# Node.js LTS (via NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    info "Instalando Node.js LTS (20.x) via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
ok "Node: $(node -v) | npm: $(npm -v)"

# Nginx
if ! command -v nginx >/dev/null 2>&1; then
    info "Instalando Nginx..."
    apt-get install -y nginx
fi
systemctl enable nginx
ok "Nginx instalado"

# Clone / pull do repositório
mkdir -p "$(dirname "$APP_DIR")"
if [[ -d "$APP_DIR/.git" ]]; then
    info "Repositório já existe — executando git pull em $APP_DIR..."
    git -C "$APP_DIR" pull --ff-only
else
    if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
        err "$APP_DIR já existe e não é um repositório Git. Remova-o ou esvazie-o e tente novamente."
        exit 1
    fi
    info "Clonando $REPO_URL em $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
fi

# Grava .env do Vite ANTES do build para apontar pro Supabase externo
ENV_FILE="$APP_DIR/.env"
info "Gravando credenciais Supabase em $ENV_FILE (usadas no build do Vite)..."
cat > "$ENV_FILE" <<ENV
# --- Públicas (entram no bundle do Vite) ---
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}

# --- Privadas (server-side / scripts / Management API) ---
SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF}
SUPABASE_ACCESS_TOKEN=${SUPABASE_ACCESS_TOKEN}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
ok "Credenciais gravadas em $ENV_FILE (apontando para $SUPABASE_URL_INPUT)"

# Build
cd "$APP_DIR"
info "Instalando dependências (npm install)..."
npm install --no-audit --no-fund

info "Buildando aplicação com Supabase externo (npm run build)..."
npm run build

if [[ ! -d "$APP_DIR/dist" ]]; then
    err "Build não gerou a pasta dist/. Verifique os logs do npm acima."
    exit 1
fi
ok "Build concluído em $APP_DIR/dist"

# Configurar Nginx (SPA + cache de assets) — domínio ajustado no STEP 2
info "Configurando Nginx para servir SPA estática..."
cat > /etc/nginx/sites-available/app <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    root /var/www/app/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    # Assets versionados pelo Vite — cache longo e imutável
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Healthcheck — usado pelo instalador, monitoramento e load balancer.
    # Não requer SSL nem JS; resposta texto puro com 200.
    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        add_header Cache-Control "no-store";
        return 200 "ok\n";
    }

    # Fallback SPA (React Router)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

chown -R www-data:www-data "$APP_DIR/dist"

nginx -t
systemctl reload nginx
ok "Nginx servindo $APP_DIR/dist na porta 80"

# ----------------------------- Verificação pós-build ------------------------
# Confirma que o app foi buildado contra o Supabase EXTERNO (e não Lovable Cloud)
# e que o servidor está realmente respondendo.
info "Executando verificação pós-build..."

VERIFY_FAIL=0

# 1) dist/index.html existe
if [[ ! -f "$APP_DIR/dist/index.html" ]]; then
    err "[verify] dist/index.html não foi gerado."
    VERIFY_FAIL=1
else
    ok "[verify] dist/index.html presente"
fi

# 2) URL do Supabase externo aparece em algum bundle JS
if grep -rq "${SUPABASE_PROJECT_REF}.supabase.co" "$APP_DIR/dist/assets/" 2>/dev/null; then
    ok "[verify] Bundle aponta para ${SUPABASE_PROJECT_REF}.supabase.co"
else
    err "[verify] Bundle NÃO contém a URL do Supabase externo. .env não foi aplicado no build."
    VERIFY_FAIL=1
fi

# 3) Bundle não contém URL do Lovable Cloud (regressão)
if grep -rq "vkomfiplmhpkhfpidrng.supabase.co" "$APP_DIR/dist/assets/" 2>/dev/null; then
    err "[verify] Bundle contém referência ao Lovable Cloud (vkomfiplmhpkhfpidrng). Build incorreto."
    VERIFY_FAIL=1
else
    ok "[verify] Bundle livre de referências ao Lovable Cloud"
fi

# 4) Endpoint Supabase externo está acessível com a anon key (espera 200 ou 404)
SB_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    "${SUPABASE_URL_INPUT}/rest/v1/" || echo "000")"
if [[ "$SB_HTTP" == "200" || "$SB_HTTP" == "404" ]]; then
    ok "[verify] Supabase externo respondeu HTTP $SB_HTTP com a anon key"
else
    err "[verify] Supabase externo retornou HTTP $SB_HTTP — chave inválida ou projeto inacessível"
    VERIFY_FAIL=1
fi

# 5) Healthcheck do Nginx local
HEALTH_HTTP="$(curl -sS -o /tmp/healthz.out -w '%{http_code}' http://127.0.0.1/healthz || echo "000")"
if [[ "$HEALTH_HTTP" == "200" ]] && grep -q '^ok' /tmp/healthz.out; then
    ok "[verify] Nginx /healthz respondendo 200 OK"
else
    err "[verify] /healthz retornou HTTP $HEALTH_HTTP — Nginx não está servindo corretamente"
    VERIFY_FAIL=1
fi

# 6) index.html é servido pela raiz
ROOT_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/ || echo "000")"
if [[ "$ROOT_HTTP" == "200" ]]; then
    ok "[verify] Nginx servindo index.html na raiz (HTTP 200)"
else
    err "[verify] Raiz retornou HTTP $ROOT_HTTP"
    VERIFY_FAIL=1
fi

if [[ "$VERIFY_FAIL" -eq 1 ]]; then
    err "Verificação pós-build encontrou problemas. Revise os erros acima antes de continuar."
    exit 1
fi
ok "Verificação pós-build concluída sem erros"

###############################################################################
# STEP 2 — Certbot (SSL)
###############################################################################
step "STEP 2 — Configurando SSL com Certbot"

read -rp "Domínio [${DOMAIN_DEFAULT}]: " DOMAIN
DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
if [[ -z "${DOMAIN:-}" ]]; then
    err "Domínio não pode ser vazio."
    exit 1
fi

read -rp "E-mail para alertas do Let's Encrypt [${EMAIL_DEFAULT}]: " EMAIL
EMAIL="${EMAIL:-$EMAIL_DEFAULT}"
if [[ -z "${EMAIL:-}" ]]; then
    err "E-mail não pode ser vazio."
    exit 1
fi

info "Atualizando server_name do Nginx para $DOMAIN..."
sed -i "s/server_name _;/server_name ${DOMAIN};/" /etc/nginx/sites-available/app
nginx -t
systemctl reload nginx

info "Instalando Certbot + plugin Nginx..."
apt-get install -y certbot python3-certbot-nginx

info "Emitindo certificado para $DOMAIN..."
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$EMAIL" \
    -d "$DOMAIN"

# Auto-renovação: pacote já instala certbot.timer; fallback para cron.
if systemctl list-unit-files | grep -q '^certbot.timer'; then
    systemctl enable --now certbot.timer
    info "Auto-renovação via systemd timer (certbot.timer) ativa."
else
    info "systemd timer não disponível — configurando cron diário."
    ( crontab -l 2>/dev/null | grep -v 'certbot renew' ; \
      echo "0 3 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
fi
ok "SSL configurado para $DOMAIN"

###############################################################################
# STEP 3 — Aplica schema SQL no Supabase externo via Management API
###############################################################################
step "STEP 3 — Provisionando schema do banco no Supabase"

SCHEMA_FILE="$APP_DIR/deploy-vps/supabase/schema.sql"
if [[ ! -f "$SCHEMA_FILE" ]]; then
    err "schema.sql não encontrado em $SCHEMA_FILE"
    exit 1
fi

info "Aplicando $SCHEMA_FILE via Management API (pode levar alguns segundos)..."
# Empacota o SQL como JSON via jq pra escapar tudo corretamente
SCHEMA_PAYLOAD="$(jq -Rs '{query: .}' < "$SCHEMA_FILE")"

SCHEMA_HTTP_CODE="$(curl -sS -o /tmp/schema_apply.log -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$SCHEMA_PAYLOAD" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query")"

if [[ "$SCHEMA_HTTP_CODE" =~ ^2 ]]; then
    ok "Schema aplicado com sucesso (HTTP $SCHEMA_HTTP_CODE)"
else
    err "Falha ao aplicar schema (HTTP $SCHEMA_HTTP_CODE)."
    err "Resposta: $(cat /tmp/schema_apply.log)"
    err "Você pode aplicar manualmente colando $SCHEMA_FILE no SQL Editor do Supabase."
fi

echo
ok "URL ................ $SUPABASE_URL_INPUT"
ok "Project Ref ........ $SUPABASE_PROJECT_REF"
ok "Anon key ........... ${SUPABASE_ANON_KEY:0:24}... (auto via Management API)"
ok "Service role key ... ${SUPABASE_SERVICE_ROLE_KEY:0:24}... (auto via Management API)"
ok "Access token ....... sbp_*** (oculto, salvo em $ENV_FILE)"

###############################################################################
# Resumo final
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
ok "App Vite/React buildado e servido via Nginx → $APP_DIR/dist/"
ok "Certificado SSL configurado para $DOMAIN"
ok "Supabase externo: $SUPABASE_URL_INPUT (ref: $SUPABASE_PROJECT_REF)"
ok "Credenciais salvas em $ENV_FILE (chmod 600)"
echo
echo -e "${BLUE}Acesse: https://${DOMAIN}${NC}"
echo -e "${BLUE}Healthcheck: https://${DOMAIN}/healthz${NC}"
echo
echo "Para atualizar o app no futuro (mantém o .env com Supabase externo):"
echo "  cd $APP_DIR && git pull && npm install && npm run build && systemctl reload nginx"
echo
echo "Próximos passos no painel do Supabase (https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}):"
echo "  1) Auth → Users: crie seu primeiro usuário admin"
echo "  2) SQL Editor: INSERT INTO public.user_roles (user_id, role) VALUES ('UUID', 'admin');"
echo "  3) Edge Functions: deploy via Supabase CLI (supabase functions deploy --no-verify-jwt)"
echo "  4) Functions → Settings: adicione secrets (RESEND_API_KEY, MP_WEBHOOK_SECRET, etc)"
echo
