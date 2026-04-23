#!/usr/bin/env bash
# =============================================================================
#  install.sh — Instalador automatizado de produção
#  Variation Vault Core / Liberty Pharma
#
#  Pede APENAS o essencial; descobre o resto automaticamente:
#    1) URL do repositório Git
#    2) Supabase Personal Access Token  (sigiloso)
#    3) Supabase Project Ref
#    4) Domínio principal               (ex: loja.seudominio.com)
#    5) Subdomínio da API/webhook       (ex: api.seudominio.com)
#    6) E-mail principal                (Certbot + SMTP + admin)
#    7) Senha principal                 (sigilosa — usada como SMTP_PASS)
#
#  Tudo o mais (URL do Supabase, ANON KEY, secrets, env, Nginx, SSL, UFW,
#  Edge Functions, Auth SMTP, webhooks) é detectado/configurado sozinho.
# =============================================================================

set -Eeuo pipefail

# ---------- log ---------------------------------------------------------------
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'; W='\033[1m'; N='\033[0m'
log()   { echo -e "${C}[INFO]${N} $*"; }
ok()    { echo -e "${G}[ OK ]${N} $*"; }
warn()  { echo -e "${Y}[WARN]${N} $*"; }
err()   { echo -e "${R}[ERR ]${N} $*" >&2; }
step()  { echo -e "\n${W}${B}▶ $*${N}"; }
title() { echo -e "\n${W}${C}══════════════════════════════════════════════════════════════════${N}"
          echo -e "${W}${C}  $*${N}"
          echo -e "${W}${C}══════════════════════════════════════════════════════════════════${N}\n"; }
mask()  { local s="${1:-}"; [[ -z "$s" ]] && { echo "(vazio)"; return; }
          local n=${#s}; (( n<=4 )) && { echo "****"; return; }
          echo "${s:0:2}***${s: -2}"; }

trap 'err "Falha na linha $LINENO."; exit 1' ERR
[[ $EUID -eq 0 ]] || { err "Execute como root: sudo bash $0"; exit 1; }

NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
ask()  { # ask VAR "Pergunta" "default"
  local v="$1" p="$2" d="${3:-}"; [[ -n "${!v:-}" ]] && return
  [[ "$NON_INTERACTIVE" == "1" ]] && { printf -v "$v" '%s' "$d"; return; }
  local x; read -r -p "$p $( [[ -n $d ]] && echo "[$d] " ): " x; printf -v "$v" '%s' "${x:-$d}"
}
asks() { # asks VAR "Pergunta"  (sigiloso)
  local v="$1" p="$2"; [[ -n "${!v:-}" ]] && return
  [[ "$NON_INTERACTIVE" == "1" ]] && return
  local x; read -r -s -p "$p: " x; echo; printf -v "$v" '%s' "$x"
}

title "Instalador automatizado — informe apenas o essencial"

# =============================================================================
# 1) PERGUNTAS ESSENCIAIS
# =============================================================================
ask  REPO_URL              "URL do repositório Git" \
     "https://github.com/VW2Digital/variation-vault-core.git"
asks SUPABASE_ACCESS_TOKEN "Supabase Personal Access Token (sbp_...)"
ask  SUPABASE_PROJECT_REF  "Supabase Project Ref"
ask  MAIN_DOMAIN           "Domínio principal (ex: loja.exemplo.com)"
ask  API_DOMAIN            "Subdomínio da API/webhook" "api.${MAIN_DOMAIN#*.}"
ask  ADMIN_EMAIL           "E-mail principal (SSL/SMTP/admin)"
asks ADMIN_PASS            "Senha principal (usada como SMTP_PASS)"

# Validação mínima
for v in REPO_URL SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF MAIN_DOMAIN API_DOMAIN ADMIN_EMAIL ADMIN_PASS; do
  [[ -n "${!v:-}" ]] || { err "Campo obrigatório não preenchido: $v"; exit 1; }
done

echo
log "Resumo:"
cat <<EOF
  Repositório ........ $REPO_URL
  Project Ref ........ $SUPABASE_PROJECT_REF
  Access Token ....... $(mask "$SUPABASE_ACCESS_TOKEN")
  Domínio ............ https://$MAIN_DOMAIN
  API/Webhook ........ https://$API_DOMAIN
  E-mail ............. $ADMIN_EMAIL
  Senha .............. $(mask "$ADMIN_PASS")
EOF

if [[ "$NON_INTERACTIVE" != "1" ]]; then
  read -r -p $'\nConfirmar e iniciar instalação automatizada? [y/N] ' _ok
  [[ "$_ok" =~ ^[yY]$ ]] || { warn "Cancelado."; exit 0; }
fi

# =============================================================================
# 2) SISTEMA + DEPENDÊNCIAS
# =============================================================================
title "Atualizando sistema e instalando dependências"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git unzip zip nano ufw net-tools jq \
  software-properties-common ca-certificates openssl gnupg lsb-release \
  dnsutils python3 python3-pip nginx certbot python3-certbot-nginx
ok "Pacotes essenciais instalados"

# Docker oficial
if ! command -v docker >/dev/null 2>&1; then
  step "Instalando Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io \
                     docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
command -v docker-compose >/dev/null 2>&1 || {
  printf '#!/usr/bin/env bash\nexec docker compose "$@"\n' > /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
}
ok "Docker pronto: $(docker --version)"

# Supabase CLI — APENAS via release oficial do GitHub (sem npm -g)
install_supabase_cli() {
  step "Instalando Supabase CLI (release oficial GitHub)"
  local arch tmp asset url
  case "$(dpkg --print-architecture)" in
    amd64) arch="amd64" ;;
    arm64) arch="arm64" ;;
    *)     err "Arquitetura não suportada"; exit 1 ;;
  esac
  tmp="$(mktemp -d)"
  asset="supabase_linux_${arch}.tar.gz"
  url="https://github.com/supabase/cli/releases/latest/download/${asset}"
  curl -fsSL "$url" -o "$tmp/$asset"
  tar -xzf "$tmp/$asset" -C "$tmp"
  install -m 0755 "$tmp/supabase" /usr/local/bin/supabase
  rm -rf "$tmp"
}
command -v supabase >/dev/null 2>&1 || install_supabase_cli
ok "Supabase CLI: $(supabase --version)"

# =============================================================================
# 3) FIREWALL
# =============================================================================
title "Configurando firewall (UFW): 22/80/443"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ok "UFW ativo"

# =============================================================================
# 4) DETECÇÃO AUTOMÁTICA DE CONFIGURAÇÃO DO SUPABASE
# =============================================================================
title "Detectando configuração do Supabase automaticamente"

SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
FUNCTIONS_URL="${SUPABASE_URL}/functions/v1"

step "Consultando Management API"
API_BASE="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}"
AUTH_HDR=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

# ANON KEY (publishable) via Management API
KEYS_JSON="$(curl -fsS "${AUTH_HDR[@]}" "${API_BASE}/api-keys" || true)"
SUPABASE_ANON_KEY="$(echo "$KEYS_JSON" | jq -r '
  (.[]? | select(.name=="anon" or .type=="publishable") | .api_key) // empty
' | head -n1)"

if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == "null" ]]; then
  warn "Não foi possível obter ANON KEY automaticamente. Informe manualmente:"
  asks SUPABASE_ANON_KEY "VITE_SUPABASE_ANON_KEY"
fi

SERVICE_ROLE_KEY="$(echo "$KEYS_JSON" | jq -r '
  (.[]? | select(.name=="service_role") | .api_key) // empty
' | head -n1)"
# (Service role pode não ser exposto pela API — fica como opcional para Edge Functions)

ok "SUPABASE_URL  ......... $SUPABASE_URL"
ok "ANON KEY ............... $(mask "$SUPABASE_ANON_KEY")"
ok "SERVICE ROLE ........... $(mask "$SERVICE_ROLE_KEY")"
ok "Functions URL .......... $FUNCTIONS_URL"

# Webhook secret gerado automaticamente
WEBHOOK_SECRET="$(openssl rand -hex 32)"

# =============================================================================
# 5) CLONE / ATUALIZAÇÃO DO PROJETO
# =============================================================================
title "Clonando / atualizando projeto"

PROJECT_DIR="${PROJECT_DIR:-/opt/variation-vault-core}"
if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  git clone "$REPO_URL" "$PROJECT_DIR"
else
  git -C "$PROJECT_DIR" fetch --all --prune
  git -C "$PROJECT_DIR" reset --hard origin/main 2>/dev/null || \
    git -C "$PROJECT_DIR" pull --ff-only
fi
ok "Projeto em $PROJECT_DIR"

# -----------------------------------------------------------------------------
# .env  →  preservado se já existir (NUNCA sobrescreve customizações)
# .env.local → SEMPRE regenerado com valores oficiais desta instalação
# Precedência Vite/Next: .env.local sobrescreve .env, então o instalador
# atualiza apenas o .env.local e mantém o .env do usuário intacto.
# -----------------------------------------------------------------------------
ENV_FILE="$PROJECT_DIR/.env"
ENV_LOCAL_FILE="$PROJECT_DIR/.env.local"
ENV_EXAMPLE_FILE="$PROJECT_DIR/.env.example"

# Conteúdo oficial gerenciado pelo instalador
read -r -d '' MANAGED_ENV <<EOF || true
# === Gerado automaticamente pelo install.sh — não editar manualmente ===
# Para customizações, edite .env (será preservado entre instalações).
SERVER_NAME=${MAIN_DOMAIN}
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
APP_URL=https://${MAIN_DOMAIN}
API_URL=https://${API_DOMAIN}
EOF

# 1) .env  →  cria apenas se não existir; senão preserva e faz backup informativo
if [[ -f "$ENV_FILE" ]]; then
  cp -a "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
  ok ".env existente preservado (backup criado em .env.bak.*)"
  warn "Customizações em .env mantidas; valores oficiais vão para .env.local"
else
  if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    cp -a "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    ok ".env criado a partir de .env.example (edite para customizar)"
  else
    printf '# Customize aqui — este arquivo é PRESERVADO entre instalações.\n' \
      > "$ENV_FILE"
    ok ".env vazio criado (pronto para suas customizações)"
  fi
  chmod 600 "$ENV_FILE"
fi

# 2) .env.local  →  sempre regenerado com os valores oficiais (precedência alta)
if [[ -f "$ENV_LOCAL_FILE" ]]; then
  cp -a "$ENV_LOCAL_FILE" "${ENV_LOCAL_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
  log ".env.local anterior salvo como backup"
fi
printf '%s\n' "$MANAGED_ENV" > "$ENV_LOCAL_FILE"
chmod 600 "$ENV_LOCAL_FILE"
ok ".env.local regenerado com configuração oficial"

# Override do compose: container só na loopback, Nginx do host faz o proxy
cat > "$PROJECT_DIR/docker-compose.override.yml" <<'EOF'
services:
  app:
    ports: !override
      - "127.0.0.1:3000:80"
    volumes: []
EOF

# =============================================================================
# 6) NGINX (host) — domínio principal + subdomínio da API
# =============================================================================
title "Configurando Nginx (1 vhost por domínio · roteamento por path · sem porta-por-função)"

# -----------------------------------------------------------------------------
# Arquitetura:
#   80/443 → Nginx (única porta pública por protocolo)
#       ├─ ${MAIN_DOMAIN}        → SPA (proxy → 127.0.0.1:3000) + SPA fallback
#       │                          /api/* → Supabase Edge Functions
#       └─ ${API_DOMAIN}         → Supabase Edge Functions (subdomínio dedicado)
#
# NUNCA criamos porta por função (webhook/oauth/email). Tudo é roteado por path.
# -----------------------------------------------------------------------------

SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_BACKUP_DIR="/var/backups/nginx-vhosts-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$NGINX_BACKUP_DIR" /var/www/certbot

step "Limpando vhosts antigos / conflitantes (sem perder histórico)"
# Move TUDO que estiver em sites-enabled para backup. Vamos reescrever do zero
# apenas os 2 vhosts oficiais. Isso elimina:
#   • duplicate listen 80/443
#   • conflicting server_name
#   • placeholders "return 404" deixados pelo Certbot
#   • backups (.bak/.old/.copy) acidentalmente carregados como vhost
if [[ -d "$SITES_ENABLED" ]]; then
  shopt -s nullglob
  for f in "$SITES_ENABLED"/*; do
    mv -f "$f" "$NGINX_BACKUP_DIR/" 2>/dev/null || true
  done
  shopt -u nullglob
fi
# Também remove de sites-available qualquer backup acidental (mantém .conf reais)
find "$SITES_AVAILABLE" -maxdepth 1 -type f \
  \( -name '*.bak' -o -name '*.old' -o -name '*.copy' -o -name '*~' \) \
  -exec mv -f {} "$NGINX_BACKUP_DIR/" \; 2>/dev/null || true
# Remove placeholders "return 404" deixados pelo Certbot para os nossos domínios
for dom in "$MAIN_DOMAIN" "$API_DOMAIN"; do
  for f in "$SITES_AVAILABLE"/*"$dom"*; do
    [[ -f "$f" ]] || continue
    if grep -qE 'return\s+404' "$f" && ! grep -q 'proxy_pass' "$f"; then
      mv -f "$f" "$NGINX_BACKUP_DIR/" 2>/dev/null || true
    fi
  done
done
ok "Vhosts antigos movidos para $NGINX_BACKUP_DIR"

# Snippet reutilizável: proxy para Supabase Edge Functions
SUPABASE_FN_HOST="${SUPABASE_PROJECT_REF}.functions.supabase.co"

step "Gerando vhost do domínio principal: ${MAIN_DOMAIN}"
cat > "$SITES_AVAILABLE/${MAIN_DOMAIN}.conf" <<EOF
# === ${MAIN_DOMAIN} — gerenciado pelo install.sh ===
# Frontend SPA + roteamento por path /api/* → Supabase Edge Functions.
# UM único listen 80 e UM único listen 443 (após Certbot) por família IP.
server {
    listen 80;
    listen [::]:80;
    server_name ${MAIN_DOMAIN};

    # ACME (renovação SSL)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # /api/* → Edge Functions (webhook, oauth, payment-checkout, admin-users…)
    # Esta é a forma correta: 1 porta (443), roteamento por rota.
    location /api/ {
        proxy_pass         https://${SUPABASE_FN_HOST}/;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_read_timeout 120s;
    }

    # SPA — frontend Vite/React no container local
    # SPA fallback é feito pelo container (try_files). Aqui só fazemos proxy.
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 90s;
    }
}
EOF

step "Gerando vhost da API: ${API_DOMAIN}"
cat > "$SITES_AVAILABLE/${API_DOMAIN}.conf" <<EOF
# === ${API_DOMAIN} — gerenciado pelo install.sh ===
# Subdomínio dedicado a Supabase Edge Functions (webhooks externos, OAuth callback).
# Continua sendo 1 porta (443) com roteamento por path:
#   https://${API_DOMAIN}/melhor-envio-webhook
#   https://${API_DOMAIN}/pagarme-webhook
#   https://${API_DOMAIN}/payment-checkout
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass         https://${SUPABASE_FN_HOST}/;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_read_timeout 120s;
    }
}
EOF

# Habilita APENAS os dois vhosts oficiais (sem o "default")
ln -sf "$SITES_AVAILABLE/${MAIN_DOMAIN}.conf" "$SITES_ENABLED/${MAIN_DOMAIN}.conf"
ln -sf "$SITES_AVAILABLE/${API_DOMAIN}.conf"  "$SITES_ENABLED/${API_DOMAIN}.conf"

# Validação: detecta listen duplicado / server_name conflitante antes de subir
step "Validando configuração do Nginx"
if ! nginx -t 2>/tmp/nginx-test.log; then
  err "nginx -t falhou. Saída:"
  cat /tmp/nginx-test.log
  warn "Vhosts antigos foram preservados em $NGINX_BACKUP_DIR (você pode restaurar se precisar)."
  exit 1
fi
systemctl enable --now nginx
systemctl reload nginx
ok "Nginx ativo · ${MAIN_DOMAIN} (SPA + /api/*) · ${API_DOMAIN} (Edge Functions)"

# =============================================================================
# 7) BUILD / DEPLOY DO CONTAINER
# =============================================================================
title "Subindo o container do frontend"
( cd "$PROJECT_DIR" && docker compose pull 2>/dev/null || true; docker compose up -d --build )
ok "Container ativo (127.0.0.1:3000)"

# =============================================================================
# 8) SSL — Certbot para os dois domínios
# =============================================================================
title "Emitindo certificados SSL (Let's Encrypt)"
if certbot --nginx --non-interactive --agree-tos --redirect \
    -m "$ADMIN_EMAIL" -d "$MAIN_DOMAIN" -d "$API_DOMAIN"; then
  ok "HTTPS ativo em $MAIN_DOMAIN e $API_DOMAIN"
else
  warn "Certbot falhou. Verifique se DNS de $MAIN_DOMAIN e $API_DOMAIN aponta para esta VPS."
  warn "Re-execute: certbot --nginx -m $ADMIN_EMAIL -d $MAIN_DOMAIN -d $API_DOMAIN"
fi

# =============================================================================
# 9) SUPABASE — Secrets, Auth SMTP e Edge Functions
# =============================================================================
title "Configurando Supabase (Secrets + Auth SMTP + Edge Functions)"

export SUPABASE_ACCESS_TOKEN
supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Convenções automáticas para SMTP (Hostinger por padrão)
SMTP_HOST="${SMTP_HOST:-smtp.hostinger.com}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_FROM_NAME="${SMTP_FROM_NAME:-${MAIN_DOMAIN%%.*}}"

step "Enviando secrets para Edge Functions"
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  APP_URL="https://${MAIN_DOMAIN}" \
  API_URL="https://${API_DOMAIN}" \
  SITE_URL="https://${MAIN_DOMAIN}" \
  SMTP_HOST="$SMTP_HOST" \
  SMTP_PORT="$SMTP_PORT" \
  SMTP_USER="$ADMIN_EMAIL" \
  SMTP_PASS="$ADMIN_PASS" \
  SMTP_FROM_EMAIL="$ADMIN_EMAIL" \
  SMTP_FROM_NAME="$SMTP_FROM_NAME" \
  SMTP_SECURE="$([[ $SMTP_PORT == 465 ]] && echo true || echo false)" \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  ADMIN_EMAIL="$ADMIN_EMAIL" >/dev/null
ok "Secrets aplicados (SMTP, URLs, webhook)"

step "Configurando Supabase Auth (SMTP + Site URL + Redirects)"
AUTH_PAYLOAD=$(jq -n \
  --arg site "https://${MAIN_DOMAIN}" \
  --arg api  "https://${API_DOMAIN}" \
  --arg from "$ADMIN_EMAIL" \
  --arg user "$ADMIN_EMAIL" \
  --arg pass "$ADMIN_PASS" \
  --arg host "$SMTP_HOST" \
  --arg name "$SMTP_FROM_NAME" \
  --argjson port "$SMTP_PORT" \
'{
  site_url: $site,
  uri_allow_list: ($site + "," + $site + "/*," + $api + "," + $api + "/*"),
  external_email_enabled: true,
  mailer_autoconfirm: false,
  smtp_admin_email: $from,
  smtp_host: $host,
  smtp_port: $port,
  smtp_user: $user,
  smtp_pass: $pass,
  smtp_sender_name: $name,
  smtp_max_frequency: 60
}')

HTTP_CODE=$(curl -sS -o /tmp/auth.json -w "%{http_code}" \
  -X PATCH "${API_BASE}/config/auth" \
  "${AUTH_HDR[@]}" -H "Content-Type: application/json" \
  -d "$AUTH_PAYLOAD" || true)

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  ok "Supabase Auth configurado (SMTP, Site URL, Redirects)"
else
  warn "Falha ao atualizar Auth (HTTP $HTTP_CODE):"
  cat /tmp/auth.json; echo
fi

step "Deploy de todas as Edge Functions"
if [[ -d "$PROJECT_DIR/supabase/functions" ]]; then
  while IFS= read -r d; do
    fn="$(basename "$d")"; [[ "$fn" == "_shared" ]] && continue
    echo "  → $fn"
    supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" \
      || warn "Falhou: $fn"
  done < <(find "$PROJECT_DIR/supabase/functions" -mindepth 1 -maxdepth 1 -type d)
  ok "Edge Functions deployadas"
else
  warn "supabase/functions/ não encontrado no repositório"
fi

# Limpa segredos da memória
unset ADMIN_PASS SUPABASE_ACCESS_TOKEN SERVICE_ROLE_KEY WEBHOOK_SECRET AUTH_PAYLOAD

# =============================================================================
# 9.5) CHECKLIST DE VALIDAÇÃO FINAL
# =============================================================================
title "Checklist de validação — testando serviços"

CHECK_PASS=0; CHECK_FAIL=0; CHECK_WARN=0
pass() { ok    "✓ $*"; CHECK_PASS=$((CHECK_PASS+1)); }
fail() { err   "✗ $*"; CHECK_FAIL=$((CHECK_FAIL+1)); }
skip() { warn  "↷ $*"; CHECK_WARN=$((CHECK_WARN+1)); }

# helper: imprime status HTTP de uma URL (segue redirects)
http_code() {
  curl -k -s -o /dev/null -w "%{http_code}" \
       --max-time 10 -L "$1" 2>/dev/null || echo "000"
}

step "1/7 · Container Docker"
if docker ps --format '{{.Names}}\t{{.Status}}' | grep -qi 'up'; then
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  pass "Container do app em execução"
else
  fail "Nenhum container ativo (verifique: cd $PROJECT_DIR && docker compose ps)"
fi

step "2/7 · Nginx (host)"
if systemctl is-active --quiet nginx && nginx -t >/dev/null 2>&1; then
  pass "Nginx ativo e configuração válida"
else
  fail "Nginx inativo ou com erro de sintaxe (nginx -t para detalhes)"
fi

step "3/7 · Backend local (loopback 127.0.0.1:3000)"
LOCAL_CODE="$(http_code http://127.0.0.1:3000)"
if [[ "$LOCAL_CODE" =~ ^(200|301|302|304)$ ]]; then
  pass "App responde em 127.0.0.1:3000 (HTTP $LOCAL_CODE)"
else
  fail "App não respondeu na loopback (HTTP $LOCAL_CODE)"
fi

step "4/7 · Frontend HTTP (porta 80 → redirect 80→443)"
HTTP_CODE_MAIN="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
                  "http://${MAIN_DOMAIN}" 2>/dev/null || echo "000")"
if [[ "$HTTP_CODE_MAIN" =~ ^(200|301|302|308)$ ]]; then
  pass "http://${MAIN_DOMAIN} respondeu (HTTP $HTTP_CODE_MAIN)"
else
  fail "http://${MAIN_DOMAIN} sem resposta (HTTP $HTTP_CODE_MAIN) — verifique DNS"
fi

step "5/7 · Frontend HTTPS"
HTTPS_CODE_MAIN="$(http_code "https://${MAIN_DOMAIN}")"
if [[ "$HTTPS_CODE_MAIN" =~ ^(200|301|302|304)$ ]]; then
  pass "https://${MAIN_DOMAIN} OK (HTTP $HTTPS_CODE_MAIN)"
else
  skip "https://${MAIN_DOMAIN} retornou HTTP $HTTPS_CODE_MAIN — SSL pode estar pendente"
fi

step "6/7 · API/Webhook HTTPS (Edge Functions via ${API_DOMAIN})"
API_CODE="$(http_code "https://${API_DOMAIN}/")"
# 200/401/404 = proxy alcançou Supabase corretamente
if [[ "$API_CODE" =~ ^(200|401|404)$ ]]; then
  pass "https://${API_DOMAIN} reverso OK (HTTP $API_CODE — Supabase respondendo)"
else
  skip "https://${API_DOMAIN} retornou HTTP $API_CODE — verifique DNS/SSL"
fi

step "7/7 · Endpoint de webhook (exemplo: pagarme-webhook)"
WH_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 10 \
           -X POST "https://${API_DOMAIN}/pagarme-webhook" \
           -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")"
# Esperado: 400/401/422 (função recebeu mas rejeitou payload vazio)
if [[ "$WH_CODE" =~ ^(200|400|401|403|422)$ ]]; then
  pass "Webhook acessível via HTTPS (HTTP $WH_CODE — função respondeu)"
else
  skip "Webhook retornou HTTP $WH_CODE — confira deploy da função"
fi

echo
log "Resultado: ${G}${CHECK_PASS} OK${N} · ${Y}${CHECK_WARN} alertas${N} · ${R}${CHECK_FAIL} falhas${N}"
if (( CHECK_FAIL > 0 )); then
  warn "Alguma checagem falhou. Veja a seção 'Comandos de diagnóstico' abaixo."
fi

# =============================================================================
# 10) RESUMO FINAL
# =============================================================================
title "✅ Instalação concluída"

DOM_ROOT="${MAIN_DOMAIN#*.}"
cat <<EOF
${W}URLs ativas${N}
  Site .............. https://${MAIN_DOMAIN}
  API/Webhook ....... https://${API_DOMAIN}
  Supabase Dashboard  https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}

${W}DNS recomendado (entregabilidade SMTP)${N}
  SPF   TXT  ${DOM_ROOT}                           v=spf1 include:_spf.mail.hostinger.com ~all
  DKIM  TXT  hostingermail._domainkey.${DOM_ROOT}  (valor no painel Hostinger)
  DMARC TXT  _dmarc.${DOM_ROOT}                    v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}

  Verificar:
    dig +short TXT ${DOM_ROOT}
    dig +short TXT _dmarc.${DOM_ROOT}

${W}Manutenção${N}
  Logs app ......... cd ${PROJECT_DIR} && docker compose logs -f
  Rebuild .......... cd ${PROJECT_DIR} && docker compose down && docker compose up -d --build
  Logs Nginx ....... tail -f /var/log/nginx/error.log
  Logs Function .... supabase functions logs <nome> --project-ref ${SUPABASE_PROJECT_REF}
  Renovar SSL ...... certbot renew --quiet

${W}Comandos de diagnóstico (status rápido)${N}
  Status container . docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  Healthcheck app .. curl -I http://127.0.0.1:3000
  Status Nginx ..... systemctl status nginx --no-pager && nginx -t
  Teste HTTPS ...... curl -I https://${MAIN_DOMAIN} && curl -I https://${API_DOMAIN}
  Teste webhook .... curl -X POST https://${API_DOMAIN}/pagarme-webhook -d '{}'
  Re-rodar checklist bash ${PROJECT_DIR}/deploy-vps/check-vps.sh   # se existir

${W}Arquitetura${N}
  Browser → Nginx (80/443) → Docker app (127.0.0.1:3000)
                                  └→ Supabase (Auth + DB + Functions + SMTP)
EOF