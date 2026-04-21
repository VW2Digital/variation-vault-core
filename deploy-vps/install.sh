#!/usr/bin/env bash
###############################################################################
# install.sh — Liberty Pharma (Vite + React) — Instalação nativa Ubuntu/Debian
#
# Faz APENAS 2 coisas:
#   STEP 1 — Instala Node.js LTS, Git, Nginx, builda o app apontando pro
#            Supabase informado e configura SPA.
#   STEP 2 — Instala Certbot e emite certificado SSL para o domínio.
#
# Você só precisa de 4 informações (todas perguntadas no início):
#   1) SUPABASE_URL          (ex: https://xxx.supabase.co)
#   2) SUPABASE_ANON_KEY     (eyJ...) — cole direto do painel
#   3) Domínio               (ex: meusite.com)
#   4) E-mail Let's Encrypt
#
# Sem Docker, sem PM2, sem Postgres, sem Management API, sem Access Token.
# O schema do banco você aplica uma vez no SQL Editor do Supabase usando
# deploy-vps/supabase/schema.sql (instruções no fim deste script).
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

# Garante curl + jq cedo (usados na validação leve da anon key)
if ! command -v curl >/dev/null 2>&1; then apt-get update -y && apt-get install -y curl; fi
if ! command -v jq >/dev/null 2>&1;   then apt-get update -y && apt-get install -y jq;   fi

echo
info "Todas as perguntas serão feitas agora, antes de qualquer instalação."
echo

# 1) Repositório
read -rp "URL do repositório Git [${REPO_URL_DEFAULT}]: " REPO_URL
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
if [[ -z "$REPO_URL" ]]; then
    err "URL do repositório não pode ser vazia."
    exit 1
fi

# 2) Supabase URL
echo
echo "Configuração do Supabase — só precisamos da URL e da anon key públicas."
echo "Onde encontrar: painel do Supabase → Project Settings → API"
echo
read -rp "SUPABASE_URL (ex: https://xxx.supabase.co): " SUPABASE_URL_INPUT
SUPABASE_URL_INPUT="${SUPABASE_URL_INPUT%/}"  # remove barra final
if [[ ! "$SUPABASE_URL_INPUT" =~ ^https://([a-z0-9]+)\.supabase\.(co|in)$ ]]; then
    err "URL inválida. Esperado algo como https://abcdef123456.supabase.co"
    exit 1
fi
SUPABASE_PROJECT_REF="${BASH_REMATCH[1]}"

# 3) Anon key
echo
echo "Cole a SUPABASE_ANON_KEY (formato eyJ...). A entrada fica oculta."
read -rsp "SUPABASE_ANON_KEY: " SUPABASE_ANON_KEY
echo
if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
    err "Anon key não pode ser vazia."
    exit 1
fi
if [[ ! "$SUPABASE_ANON_KEY" =~ ^eyJ ]]; then
    err "Anon key inválida — deve começar com 'eyJ' (JWT)."
    exit 1
fi

# 4) Domínio + e-mail (perguntados aqui pra ficar tudo no início)
echo
read -rp "Domínio [${DOMAIN_DEFAULT}]: " DOMAIN
DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
read -rp "E-mail para alertas do Let's Encrypt [${EMAIL_DEFAULT}]: " EMAIL
EMAIL="${EMAIL:-$EMAIL_DEFAULT}"

# ----------------------------- Validação leve da anon key -------------------
# Decodifica o JWT só pra confirmar role=anon e que pertence ao mesmo projeto
# da URL informada. Sem chamadas externas.
jwt_field() {
    local jwt="$1" field="$2" payload
    payload="$(echo "$jwt" | cut -d. -f2)"
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
ANON_EXP="$(jwt_field "$SUPABASE_ANON_KEY" "exp")"

if [[ "$ANON_ROLE" != "anon" ]]; then
    err "A chave informada tem role '$ANON_ROLE' (esperado: 'anon'). Use a anon/publishable key."
    exit 1
fi
if [[ -n "$ANON_REF" && "$ANON_REF" != "$SUPABASE_PROJECT_REF" ]]; then
    err "Anon key pertence ao projeto '$ANON_REF' mas a URL aponta para '$SUPABASE_PROJECT_REF'."
    err "Confira se você copiou a URL e a key do MESMO projeto."
    exit 1
fi
if [[ -n "$ANON_EXP" && "$ANON_EXP" =~ ^[0-9]+$ ]]; then
    NOW="$(date +%s)"
    if (( ANON_EXP < NOW )); then
        err "Anon key expirou em $(date -d "@$ANON_EXP" 2>/dev/null || echo "$ANON_EXP")."
        exit 1
    fi
fi
ok "Anon key válida e pertence ao projeto $SUPABASE_PROJECT_REF"

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

# Grava .env do Vite ANTES do build para apontar pro Supabase informado
ENV_FILE="$APP_DIR/.env"
info "Gravando credenciais Supabase em $ENV_FILE (usadas no build do Vite)..."
cat > "$ENV_FILE" <<ENV
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
ENV
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
ok "Credenciais gravadas em $ENV_FILE (apontando para $SUPABASE_URL_INPUT)"

# Build
cd "$APP_DIR"
info "Instalando dependências (npm install)..."
npm install --no-audit --no-fund

info "Buildando aplicação (npm run build)..."
npm run build

if [[ ! -d "$APP_DIR/dist" ]]; then
    err "Build não gerou a pasta dist/. Verifique os logs do npm acima."
    exit 1
fi
ok "Build concluído em $APP_DIR/dist"

# Configurar Nginx (SPA + cache de assets) — server_name ajustado abaixo
info "Configurando Nginx para servir SPA estática..."
cat > /etc/nginx/sites-available/app <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

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
        try_files \$uri =404;
    }

    # Healthcheck simples
    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        add_header Cache-Control "no-store";
        return 200 "ok\n";
    }

    # Fallback SPA (React Router)
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\\. { deny all; access_log off; log_not_found off; }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

chown -R www-data:www-data "$APP_DIR/dist"

nginx -t
systemctl reload nginx
ok "Nginx servindo $APP_DIR/dist na porta 80 (server_name=$DOMAIN)"

# ----------------------------- Verificação pós-build (local) ----------------
info "Executando verificação local..."
VERIFY_FAIL=0

if [[ ! -f "$APP_DIR/dist/index.html" ]]; then
    err "[verify] dist/index.html não foi gerado."
    VERIFY_FAIL=1
else
    ok "[verify] dist/index.html presente"
fi

if grep -rq "${SUPABASE_PROJECT_REF}.supabase" "$APP_DIR/dist/assets/" 2>/dev/null; then
    ok "[verify] Bundle aponta para ${SUPABASE_PROJECT_REF}.supabase.co"
else
    err "[verify] Bundle NÃO contém a URL do Supabase informado. .env não foi aplicado no build."
    VERIFY_FAIL=1
fi

HEALTH_HTTP="$(curl -sS -o /tmp/healthz.out -w '%{http_code}' http://127.0.0.1/healthz || echo "000")"
if [[ "$HEALTH_HTTP" == "200" ]] && grep -q '^ok' /tmp/healthz.out; then
    ok "[verify] Nginx /healthz respondendo 200"
else
    err "[verify] /healthz retornou HTTP $HEALTH_HTTP"
    VERIFY_FAIL=1
fi

ROOT_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1/ || echo "000")"
if [[ "$ROOT_HTTP" == "200" ]]; then
    ok "[verify] Nginx servindo index.html na raiz (HTTP 200)"
else
    err "[verify] Raiz retornou HTTP $ROOT_HTTP"
    VERIFY_FAIL=1
fi

if [[ "$VERIFY_FAIL" -eq 1 ]]; then
    err "Verificação local encontrou problemas. Revise os erros acima antes de continuar."
    exit 1
fi
ok "Verificação local concluída sem erros"

###############################################################################
# STEP 2 — Certbot (SSL)
###############################################################################
step "STEP 2 — Configurando SSL com Certbot para $DOMAIN"

info "Instalando Certbot + plugin Nginx..."
apt-get install -y certbot python3-certbot-nginx

info "Emitindo certificado para $DOMAIN..."
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$EMAIL" \
    -d "$DOMAIN"

# Auto-renovação
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
# Resumo final
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
ok "App buildado e servido via Nginx → $APP_DIR/dist/"
ok "SSL ativo em https://${DOMAIN}"
ok "Conectado ao Supabase: $SUPABASE_URL_INPUT"
ok "Credenciais salvas em $ENV_FILE (chmod 600)"
echo
echo -e "${BLUE}Acesse: https://${DOMAIN}${NC}"
echo -e "${BLUE}Healthcheck: https://${DOMAIN}/healthz${NC}"
echo
echo "Para atualizar o app no futuro:"
echo "  cd $APP_DIR && git pull && npm install && npm run build && systemctl reload nginx"
echo
echo "Configurar o banco (faça apenas UMA vez no painel do Supabase):"
echo "  1) Abra https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "  2) Cole o conteúdo de $APP_DIR/deploy-vps/supabase/schema.sql"
echo "  3) Clique em Run"
echo "  4) Auth → Users: crie seu usuário admin"
echo "  5) SQL Editor: INSERT INTO public.user_roles (user_id, role) VALUES ('UUID-DO-USUARIO', 'admin');"
echo
