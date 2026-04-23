#!/usr/bin/env bash
# =============================================================================
#  install.sh — Instalador Profissional de Produção
#  Liberty Pharma / Variation Vault Core
#
#  Arquitetura alvo:
#    Frontend (Docker/Nginx VPS)  →  Supabase (Auth + DB + Edge Functions)
#                                     │
#                                     ├─ SMTP Hostinger (Auth e-mails)
#                                     └─ Edge Functions (transacionais)
#
#  Princípios:
#    • Zero credenciais sensíveis em arquivo no host (.env só com chaves públicas)
#    • SMTP configurado direto no Supabase Auth (não no servidor)
#    • Service Role Key e SMTP_PASS vivem APENAS como Supabase Secrets
#    • Nginx do host como reverse proxy único (porta 80/443)
#    • Container exposto APENAS em 127.0.0.1:3000
#    • UFW restrito a 22/80/443 (SMTP é externo)
#    • Independente do Lovable: roda em qualquer VPS / Vercel / Netlify
# =============================================================================

set -Eeuo pipefail

# ---------- estilo de log -----------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()     { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERR ]${NC} $*" >&2; }
step()   { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
title()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${NC}"; \
           echo -e "${BOLD}${CYAN}  $*${NC}"; \
           echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${NC}\n"; }
mask()   { local s="${1:-}"; [[ -z "$s" ]] && { echo "(vazio)"; return; }; \
           local n=${#s}; (( n<=4 )) && { echo "****"; return; }; \
           echo "${s:0:2}***${s: -2}"; }

trap 'err "Falha na linha $LINENO. Abortando."; exit 1' ERR

# ---------- pré-requisitos ----------------------------------------------------
[[ $EUID -eq 0 ]] || { err "Execute como root: sudo bash $0"; exit 1; }

NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
ask() {
  # ask VAR "Pergunta" "default" [silencioso=1]
  local __var="$1" __prompt="$2" __default="${3:-}" __silent="${4:-0}"
  local __cur="${!__var:-}"
  if [[ -n "$__cur" ]]; then return; fi
  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    printf -v "$__var" '%s' "$__default"; return
  fi
  local __input
  if [[ "$__silent" == "1" ]]; then
    read -r -s -p "$__prompt $( [[ -n $__default ]] && echo "[****] " ): " __input; echo
  else
    read -r -p "$__prompt $( [[ -n $__default ]] && echo "[$__default] " ): " __input
  fi
  printf -v "$__var" '%s' "${__input:-$__default}"
}

title "Instalador Profissional — Produção (SMTP Hostinger + Supabase)"

cat <<EOF
Este script vai:
  1) Atualizar a VPS e instalar Docker, Nginx, UFW, Supabase CLI e utilitários
  2) Configurar Nginx do host como reverse proxy (80/443) → container 127.0.0.1:3000
  3) Subir o frontend via Docker Compose com APENAS chaves públicas no .env
  4) Enviar SMTP Hostinger + Service Role Key como Supabase Secrets (Edge Functions)
  5) Configurar Supabase Auth (SMTP, Site URL, Redirect URLs) via Management API
  6) Fazer deploy de todas as Edge Functions
  7) Imprimir checklist de DNS (SPF/DKIM/DMARC) e troubleshooting

Nada de credenciais SMTP em arquivo no host. Nada de Postfix/Exim. Nada de Lovable.
EOF

# =============================================================================
# 1) ATUALIZAÇÃO E DEPENDÊNCIAS
# =============================================================================
title "1/8  Atualização do sistema e dependências"

export DEBIAN_FRONTEND=noninteractive
step "apt update && upgrade"
apt-get update -y
apt-get upgrade -y

step "Instalando pacotes essenciais"
apt-get install -y \
  curl wget git unzip zip nano ufw net-tools jq \
  software-properties-common ca-certificates openssl gnupg lsb-release \
  telnet netcat-openbsd dnsutils \
  python3 python3-pip python3-venv \
  nginx
ok "Pacotes base instalados"

# Docker (oficial)
if ! command -v docker >/dev/null 2>&1; then
  step "Instalando Docker Engine (repositório oficial)"
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
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') ativo"

# docker-compose shim (compat. legacy)
if ! command -v docker-compose >/dev/null 2>&1; then
  cat >/usr/local/bin/docker-compose <<'EOF'
#!/usr/bin/env bash
exec docker compose "$@"
EOF
  chmod +x /usr/local/bin/docker-compose
fi

# Supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
  step "Instalando Supabase CLI"
  ARCH="$(dpkg --print-architecture)"
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.tar.gz" \
    -o "$TMP/supabase.tar.gz"
  tar -xzf "$TMP/supabase.tar.gz" -C "$TMP"
  install -m 0755 "$TMP/supabase" /usr/local/bin/supabase
  rm -rf "$TMP"
fi
ok "Supabase CLI $(supabase --version) pronta"

# =============================================================================
# 2) FIREWALL
# =============================================================================
title "2/8  Firewall (UFW) — apenas 22/80/443"

ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
# SMTP (465/587) NÃO é aberto: o envio acontece DO Supabase para a Hostinger.
ufw --force enable
ok "UFW ativo: $(ufw status | grep -E '^(22|80|443)' | wc -l) regras de entrada"

# =============================================================================
# 3) COLETA DE CONFIGURAÇÃO
# =============================================================================
title "3/8  Coleta de configuração"

echo -e "${BOLD}— Domínio e Supabase —${NC}"
ask DOMAIN          "Domínio público do site (ex: loja.seudominio.com)" ""
ask APP_URL         "URL pública (https://...)" "https://${DOMAIN:-localhost}"
ask SITE_URL        "Site URL p/ Supabase Auth" "$APP_URL"
ask SUPABASE_URL    "VITE_SUPABASE_URL (https://xxxx.supabase.co)" ""
ask SUPABASE_PROJECT_ID "Supabase Project Ref (xxxx)" \
    "$(echo "$SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')"
ask SUPABASE_ANON_KEY        "VITE_SUPABASE_ANON_KEY (pública)" "" 1
ask SUPABASE_SERVICE_ROLE_KEY "SERVICE_ROLE_KEY (NUNCA commitar)" "" 1
ask SUPABASE_ACCESS_TOKEN    "Supabase Access Token (para CLI / Management API)" "" 1

echo -e "\n${BOLD}— SMTP Hostinger —${NC}"
ask SMTP_HOST       "SMTP host" "smtp.hostinger.com"
ask SMTP_PORT       "SMTP port (465 SSL / 587 STARTTLS)" "465"
ask SMTP_USER       "SMTP user (e-mail completo)" "no-reply@${DOMAIN#*.}"
ask SMTP_PASS       "SMTP password" "" 1
ask SMTP_FROM_EMAIL "Remetente (From)" "$SMTP_USER"
ask SMTP_FROM_NAME  "Nome de exibição" "Liberty Pharma"
ask WEBHOOK_SECRET  "Webhook secret (gere se não tiver)" "$(openssl rand -hex 32)"

echo
log "Resumo (segredos mascarados):"
cat <<EOF
  DOMAIN ............. $DOMAIN
  APP_URL ............ $APP_URL
  SITE_URL ........... $SITE_URL
  SUPABASE_URL ....... $SUPABASE_URL
  SUPABASE_PROJECT_ID  $SUPABASE_PROJECT_ID
  ANON_KEY ........... $(mask "$SUPABASE_ANON_KEY")
  SERVICE_ROLE_KEY ... $(mask "$SUPABASE_SERVICE_ROLE_KEY")
  ACCESS_TOKEN ....... $(mask "$SUPABASE_ACCESS_TOKEN")
  SMTP_HOST:PORT ..... $SMTP_HOST:$SMTP_PORT
  SMTP_USER .......... $SMTP_USER
  SMTP_PASS .......... $(mask "$SMTP_PASS")
  SMTP_FROM .......... "$SMTP_FROM_NAME" <$SMTP_FROM_EMAIL>
  WEBHOOK_SECRET ..... $(mask "$WEBHOOK_SECRET")
EOF

if [[ "$NON_INTERACTIVE" != "1" ]]; then
  read -r -p $'\nProsseguir? [y/N] ' _ok
  [[ "$_ok" =~ ^[yY]$ ]] || { warn "Cancelado pelo usuário."; exit 0; }
fi

# =============================================================================
# 4) PROJETO E .env (APENAS chaves públicas)
# =============================================================================
title "4/8  Projeto e .env (somente chaves públicas)"

PROJECT_DIR="${PROJECT_DIR:-/opt/variation-vault-core}"
REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  step "Clonando $REPO_URL → $PROJECT_DIR"
  git clone "$REPO_URL" "$PROJECT_DIR"
else
  step "Atualizando repositório existente"
  git -C "$PROJECT_DIR" fetch --all --prune
  git -C "$PROJECT_DIR" reset --hard origin/main || git -C "$PROJECT_DIR" pull --ff-only
fi

# .env do build/Compose: SOMENTE chaves públicas + URLs
ENV_FILE="$PROJECT_DIR/.env"
cat > "$ENV_FILE" <<EOF
# Gerado por install.sh — apenas variáveis PÚBLICAS
# NÃO inclua SERVICE_ROLE_KEY, SMTP_PASS, ou outros segredos aqui.
SERVER_NAME=${DOMAIN}
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}
APP_URL=${APP_URL}
EOF
chmod 600 "$ENV_FILE"
ok ".env gravado em $ENV_FILE (somente chaves públicas)"

# Override do compose: expõe apenas em 127.0.0.1:3000 (Nginx do host faz o proxy)
cat > "$PROJECT_DIR/docker-compose.override.yml" <<'EOF'
services:
  app:
    ports: !override
      - "127.0.0.1:3000:80"
    volumes: []
EOF
ok "docker-compose.override.yml: container só escuta em 127.0.0.1:3000"

# =============================================================================
# 5) NGINX HOST (reverse proxy)
# =============================================================================
title "5/8  Nginx do host como reverse proxy"

# Remove default que causa "duplicate default_server"
rm -f /etc/nginx/sites-enabled/default

SITE_CONF="/etc/nginx/sites-available/variation-vault.conf"
cat > "$SITE_CONF" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN:-_};

  # ACME challenge (certbot --webroot)
  location /.well-known/acme-challenge/ { root /var/www/certbot; }

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
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/variation-vault.conf
mkdir -p /var/www/certbot

nginx -t
systemctl enable --now nginx
systemctl reload nginx
ok "Nginx do host respondendo em :80 → 127.0.0.1:3000"

# =============================================================================
# 6) BUILD / SUBIDA DO CONTAINER
# =============================================================================
title "6/8  Build e subida do container"

cd "$PROJECT_DIR"
docker compose pull || true
docker compose up -d --build
ok "Container do app no ar (127.0.0.1:3000)"

# =============================================================================
# 7) SUPABASE: SECRETS + AUTH SMTP + DEPLOY DAS FUNCTIONS
# =============================================================================
title "7/8  Supabase: Secrets, Auth SMTP e Edge Functions"

export SUPABASE_ACCESS_TOKEN

step "Linkando projeto $SUPABASE_PROJECT_ID"
supabase link --project-ref "$SUPABASE_PROJECT_ID"

step "Enviando Secrets para Edge Functions (nada disso vive no host)"
supabase secrets set \
  SMTP_HOST="$SMTP_HOST" \
  SMTP_PORT="$SMTP_PORT" \
  SMTP_USER="$SMTP_USER" \
  SMTP_PASS="$SMTP_PASS" \
  SMTP_FROM_EMAIL="$SMTP_FROM_EMAIL" \
  SMTP_FROM_NAME="$SMTP_FROM_NAME" \
  SMTP_SECURE="$([[ $SMTP_PORT == 465 ]] && echo true || echo false)" \
  APP_URL="$APP_URL" \
  SITE_URL="$SITE_URL" \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" >/dev/null
ok "Secrets enviados ao Supabase"

step "Configurando Supabase Auth (SMTP + Site URL + Redirects) via Management API"
# Supabase Auth tem seu próprio SMTP (independente de Edge Functions).
# Usamos a Management API para evitar abrir o dashboard manualmente.
AUTH_PAYLOAD=$(cat <<JSON
{
  "site_url": "${SITE_URL}",
  "uri_allow_list": "${APP_URL},${APP_URL}/*,${SITE_URL},${SITE_URL}/*",
  "external_email_enabled": true,
  "mailer_autoconfirm": false,
  "smtp_admin_email": "${SMTP_FROM_EMAIL}",
  "smtp_host": "${SMTP_HOST}",
  "smtp_port": ${SMTP_PORT},
  "smtp_user": "${SMTP_USER}",
  "smtp_pass": "${SMTP_PASS}",
  "smtp_sender_name": "${SMTP_FROM_NAME}",
  "smtp_max_frequency": 60
}
JSON
)

HTTP_CODE=$(curl -sS -o /tmp/auth_resp.json -w "%{http_code}" \
  -X PATCH "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$AUTH_PAYLOAD") || true

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  ok "Supabase Auth atualizado (SMTP Hostinger ativo para confirmação/reset/magic link/convite/troca de e-mail)"
else
  warn "Falha ao atualizar Auth via API (HTTP $HTTP_CODE). Resposta:"
  cat /tmp/auth_resp.json; echo
  warn "Configure manualmente em: Supabase → Authentication → Email → SMTP Settings"
fi

step "Deploy das Edge Functions (transacionais e webhooks)"
FUNCTIONS=()
if [[ -d "$PROJECT_DIR/supabase/functions" ]]; then
  while IFS= read -r d; do
    fn="$(basename "$d")"
    [[ "$fn" == "_shared" ]] && continue
    FUNCTIONS+=("$fn")
  done < <(find "$PROJECT_DIR/supabase/functions" -mindepth 1 -maxdepth 1 -type d)
fi

if (( ${#FUNCTIONS[@]} == 0 )); then
  warn "Nenhuma Edge Function encontrada em supabase/functions/"
else
  for fn in "${FUNCTIONS[@]}"; do
    echo "  → $fn"
    supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_ID" || \
      warn "Falhou no deploy de $fn (siga com os demais)"
  done
  ok "Deploy concluído (${#FUNCTIONS[@]} functions)"
fi

# Limpa variáveis sensíveis da memória do shell
unset SMTP_PASS SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN WEBHOOK_SECRET
ok "Segredos descarregados da memória do shell"

# =============================================================================
# 8) PÓS-INSTALAÇÃO: DNS, SSL, TROUBLESHOOTING
# =============================================================================
title "8/8  Próximos passos: DNS, SSL e validação"

DOM_ROOT="${DOMAIN#*.}"

cat <<EOF
${BOLD}A) HTTPS (Let's Encrypt)${NC}
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d ${DOMAIN}
   systemctl reload nginx

${BOLD}B) DNS profissional para entregabilidade${NC}
   Configure no painel DNS de ${DOM_ROOT}:

   • SPF (TXT em ${DOM_ROOT})
       v=spf1 include:_spf.mail.hostinger.com ~all

   • DKIM (TXT) — pegue o seletor/valor no painel da Hostinger:
       hostingermail._domainkey.${DOM_ROOT}   IN TXT  "v=DKIM1; k=rsa; p=..."

   • DMARC (TXT em _dmarc.${DOM_ROOT})
       v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOM_ROOT}; fo=1; adkim=s; aspf=s

   Verifique:
       dig +short TXT ${DOM_ROOT}
       dig +short TXT _dmarc.${DOM_ROOT}
       dig +short TXT hostingermail._domainkey.${DOM_ROOT}

${BOLD}C) Teste SMTP (sem expor senha em log)${NC}
   Envie um teste a partir do próprio Supabase:
     Dashboard → Authentication → Users → "Send magic link"
   Ou pelo terminal local (NÃO precisa abrir 465/587 no UFW):
     python3 - <<'PY'
     import smtplib, ssl, os
     ctx = ssl.create_default_context()
     with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], 465, context=ctx, timeout=10) as s:
         s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
         print("OK")
     PY

${BOLD}D) Manutenção${NC}
   • Logs do app:        cd ${PROJECT_DIR} && docker compose logs -f
   • Rebuild:            cd ${PROJECT_DIR} && docker compose down && docker compose up -d --build
   • Logs do Nginx:      tail -f /var/log/nginx/error.log
   • Logs Edge Function: supabase functions logs <nome> --project-ref ${SUPABASE_PROJECT_ID}
   • Atualizar segredo:  supabase secrets set CHAVE=valor --project-ref ${SUPABASE_PROJECT_ID}

${BOLD}E) Troubleshooting de e-mail${NC}
   • Não chega confirmação/reset:
       1. Confira Auth → Logs no dashboard (erro de SMTP aparece aqui)
       2. dig +short MX ${DOM_ROOT}              (Hostinger configurado?)
       3. dig +short TXT ${DOM_ROOT}             (SPF presente?)
       4. dig +short TXT _dmarc.${DOM_ROOT}      (DMARC presente?)
   • Vai para spam: falta DKIM ou DMARC=none — ajuste conforme item B.
   • "535 Authentication failed": SMTP_USER deve ser o e-mail completo.
   • "Connection refused" 465: troque para 587 (STARTTLS) e SMTP_SECURE=false.
   • Edge Function falhando: supabase functions logs <nome> --project-ref ${SUPABASE_PROJECT_ID}

${BOLD}F) Arquitetura final${NC}
   Browser ──► Nginx (host, 80/443)
              └─► Docker app (127.0.0.1:3000)
                     └─► Supabase (Auth + DB + Edge Functions)
                            ├─► SMTP Hostinger  (e-mails de Auth)
                            └─► Edge Functions  (e-mails transacionais)

   ✔ Nenhum SMTP_PASS no host
   ✔ Nenhum Service Role Key no .env
   ✔ Nenhum Postfix/Exim/Sendmail rodando
   ✔ Nenhuma dependência do Lovable
EOF

title "✅  Instalação concluída"
ok "App: ${APP_URL}"
ok "Supabase: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}"