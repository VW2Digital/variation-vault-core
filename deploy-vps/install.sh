#!/usr/bin/env bash
###############################################################################
#  install.sh — Instalador profissional para VPS (SPA + Supabase + Nginx)
#
#  Arquitetura:
#    • Frontend SPA (React/Vite) servido estaticamente pelo Nginx
#    • Backend = Supabase (sem Node local em :3000)
#    • Edge Functions deployadas dinamicamente (apenas as que existem)
#    • Subdomínio API faz proxy para Supabase Functions
#    • SMTP Hostinger (465/587) configurado nos secrets do Supabase
#
#  Inputs (interativo ou via env):
#    GIT_REPO_URL, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
#    DOMAIN, API_DOMAIN, SMTP_USER, SMTP_PASS
#
#  Uso:
#    sudo bash install.sh
#    sudo GIT_REPO_URL=... SUPABASE_PROJECT_REF=... bash install.sh   (não-interativo)
###############################################################################

set -Eeuo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# 0. Logging persistente em /var/log/install-vvc.log
# ─────────────────────────────────────────────────────────────────────────────
LOG_DIR="/var/log"
LOG_FILE="$LOG_DIR/install-vvc.log"
mkdir -p "$LOG_DIR"

# Rotação simples: mantém 5 versões
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt 5242880 ]]; then
    for i in 4 3 2 1; do
        [[ -f "${LOG_FILE}.${i}" ]] && mv -f "${LOG_FILE}.${i}" "${LOG_FILE}.$((i+1))" || true
    done
    mv -f "$LOG_FILE" "${LOG_FILE}.1" || true
fi

__log_filter() {
    sed -u -E \
        -e 's/\x1B\[[0-9;]*[mGKHF]//g' \
        -e 's/(SMTP_PASS=)[^ ]+/\1***REDACTED***/g' \
        -e 's/(SUPABASE_ACCESS_TOKEN=)[^ ]+/\1***REDACTED***/g' \
        -e 's/(eyJ[A-Za-z0-9_-]{12})[A-Za-z0-9_.-]{20,}/\1***REDACTED_JWT***/g'
}

exec > >(tee >(__log_filter >> "$LOG_FILE")) 2>&1
chmod 600 "$LOG_FILE" || true

# ─────────────────────────────────────────────────────────────────────────────
# 1. Helpers de UI / log
# ─────────────────────────────────────────────────────────────────────────────
C_RESET="\033[0m"; C_RED="\033[1;31m"; C_GRN="\033[1;32m"
C_YLW="\033[1;33m"; C_BLU="\033[1;34m"; C_CYN="\033[1;36m"; C_DIM="\033[2m"

ts()    { date '+%H:%M:%S'; }
hdr()   { echo -e "\n${C_BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}\n${C_BLU}▶ $*${C_RESET}\n${C_BLU}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"; }
info()  { echo -e "${C_DIM}[$(ts)]${C_RESET} ${C_CYN}ℹ${C_RESET}  $*"; }
ok()    { echo -e "${C_DIM}[$(ts)]${C_RESET} ${C_GRN}✔${C_RESET}  $*"; }
warn()  { echo -e "${C_DIM}[$(ts)]${C_RESET} ${C_YLW}⚠${C_RESET}  $*"; }
err()   { echo -e "${C_DIM}[$(ts)]${C_RESET} ${C_RED}✘${C_RESET}  $*" >&2; }
skip()  { echo -e "${C_DIM}[$(ts)]${C_RESET} ${C_YLW}↷${C_RESET}  ${C_DIM}[SKIP]${C_RESET} $*"; }

START_TIME=$(date +%s)

__on_err() {
    local exit_code=$?
    local line=$1
    err "Falha na linha $line (exit=$exit_code) ao executar: ${BASH_COMMAND:-?}"
    err "Verifique o log completo em: $LOG_FILE"
    exit "$exit_code"
}
trap '__on_err $LINENO' ERR

__on_exit() {
    local code=$?
    local elapsed=$(( $(date +%s) - START_TIME ))
    if [[ $code -eq 0 ]]; then
        ok "Instalação concluída com sucesso em ${elapsed}s"
    else
        err "Instalação interrompida (exit=$code) após ${elapsed}s — log: $LOG_FILE"
    fi
}
trap __on_exit EXIT

# ─────────────────────────────────────────────────────────────────────────────
# 2. Header
# ─────────────────────────────────────────────────────────────────────────────
clear || true
echo -e "${C_BLU}"
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   INSTALADOR PROFISSIONAL — SPA + Supabase + Nginx + SMTP Hostinger         ║
║   Frontend estático · Edge Functions dinâmicas · Validação real             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
BANNER
echo -e "${C_RESET}"
info "Início: $(date '+%Y-%m-%d %H:%M:%S')   Host: $(hostname)   Kernel: $(uname -r)"
info "Logs em: $LOG_FILE"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Pré-requisitos
# ─────────────────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    err "Execute como root: sudo bash $0"
    exit 1
fi

if ! grep -qiE 'ubuntu|debian' /etc/os-release 2>/dev/null; then
    warn "Sistema não-Debian detectado. O script foi testado em Ubuntu/Debian."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Coleta de inputs
# ─────────────────────────────────────────────────────────────────────────────
hdr "Configuração da instalação"

ask() {
    local var_name=$1 prompt=$2 default=${3:-} secret=${4:-no}
    local current=${!var_name:-$default} value
    if [[ -n "${!var_name:-}" ]]; then
        info "${var_name} = $([ "$secret" = yes ] && echo '***' || echo "${!var_name}")"
        return
    fi
    if [[ "$secret" = yes ]]; then
        read -rsp "$(echo -e "${C_CYN}? ${prompt}: ${C_RESET}")" value; echo
    else
        if [[ -n "$current" ]]; then
            read -rp "$(echo -e "${C_CYN}? ${prompt} [${current}]: ${C_RESET}")" value
            value=${value:-$current}
        else
            read -rp "$(echo -e "${C_CYN}? ${prompt}: ${C_RESET}")" value
        fi
    fi
    if [[ -z "$value" ]]; then
        err "Valor obrigatório: $var_name"
        exit 1
    fi
    printf -v "$var_name" '%s' "$value"
    export "$var_name"
}

ask GIT_REPO_URL          "URL do repositório Git (ex: https://github.com/user/repo.git)"
ask SUPABASE_ACCESS_TOKEN "Supabase Access Token (sbp_...)"            ""    yes
ask SUPABASE_PROJECT_REF  "Supabase Project Ref (ex: ntlfjekvisepsusbcjsv)"
ask SUPABASE_PUBLISHABLE_KEY "Supabase Anon/Publishable Key (eyJ... do SEU projeto Supabase)" "" yes
ask DOMAIN                "Domínio principal (ex: luminaeliberty.com)"
ask API_DOMAIN            "Subdomínio da API (ex: api.luminaeliberty.com)"
ask SMTP_USER             "E-mail SMTP Hostinger (ex: contato@dominio.com)"
ask SMTP_PASS             "Senha SMTP Hostinger"                        ""    yes

PROJECT_DIR="/opt/app"
WEB_ROOT="/var/www/app/dist"
SUPABASE_FUNCTIONS_BASE="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1"

# ─────────────────────────────────────────────────────────────────────────────
# Validação rigorosa: a anon key DEVE pertencer ao Project Ref informado.
# Isto impede que o instalador use, por engano, chaves de outro projeto
# (ex.: chaves do projeto Lovable que vieram no .env do repositório).
# ─────────────────────────────────────────────────────────────────────────────
if [[ ! "$SUPABASE_PUBLISHABLE_KEY" =~ ^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    err "SUPABASE_PUBLISHABLE_KEY não parece um JWT válido (esperado: eyJ...)"
    exit 1
fi
__jwt_payload=$(echo "$SUPABASE_PUBLISHABLE_KEY" | cut -d. -f2)
# Padding base64url
__pad=$(( 4 - ${#__jwt_payload} % 4 )); [[ $__pad -lt 4 ]] && __jwt_payload="${__jwt_payload}$(printf '=%.0s' $(seq 1 $__pad))"
__jwt_ref=$(echo "$__jwt_payload" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.ref // empty' 2>/dev/null || true)
if [[ -n "$__jwt_ref" && "$__jwt_ref" != "$SUPABASE_PROJECT_REF" ]]; then
    err "A anon key pertence ao projeto Supabase '$__jwt_ref', mas o Project Ref informado é '$SUPABASE_PROJECT_REF'."
    err "Use a anon key do SEU projeto Supabase (Settings → API → anon public)."
    exit 1
fi
ok "Anon key validada e pertence ao projeto $SUPABASE_PROJECT_REF"

echo
ok "Inputs coletados:"
info "  Repo .................... $GIT_REPO_URL"
info "  Project Ref ............. $SUPABASE_PROJECT_REF"
info "  Domínio principal ....... $DOMAIN"
info "  Subdomínio API .......... $API_DOMAIN"
info "  SMTP user ............... $SMTP_USER"
info "  Project dir ............. $PROJECT_DIR"
info "  Web root ................ $WEB_ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Pacotes do sistema
# ─────────────────────────────────────────────────────────────────────────────
hdr "Instalando pacotes do sistema"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq \
    curl wget git ca-certificates gnupg lsb-release \
    nginx ufw certbot python3-certbot-nginx \
    jq unzip build-essential

ok "Pacotes base instalados"

# Node.js 20 (necessário p/ Vite build)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2-3)" -lt 20 ]]; then
    info "Instalando Node.js 20 LTS"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs
fi
ok "Node.js $(node -v)  npm $(npm -v)"

# Supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
    info "Instalando Supabase CLI"
    SB_VER=$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | jq -r .tag_name | sed 's/^v//')
    curl -fsSL "https://github.com/supabase/cli/releases/download/v${SB_VER}/supabase_${SB_VER}_linux_amd64.deb" -o /tmp/supabase.deb
    dpkg -i /tmp/supabase.deb >/dev/null
    rm -f /tmp/supabase.deb
fi
ok "Supabase CLI $(supabase --version 2>&1 | head -1)"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Firewall (apenas portas necessárias)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Configurando firewall (UFW)"

ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp   comment 'SSH' >/dev/null
ufw allow 80/tcp   comment 'HTTP' >/dev/null
ufw allow 443/tcp  comment 'HTTPS' >/dev/null
ufw allow 465/tcp  comment 'SMTP SSL' >/dev/null
ufw allow 587/tcp  comment 'SMTP STARTTLS' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo — portas: 22, 80, 443, 465, 587"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Clone / atualização do repositório
# ─────────────────────────────────────────────────────────────────────────────
hdr "Clonando repositório"

if [[ -d "$PROJECT_DIR/.git" ]]; then
    info "Repositório já existe — atualizando"
    git -C "$PROJECT_DIR" fetch --all --quiet
    git -C "$PROJECT_DIR" reset --hard origin/HEAD --quiet || git -C "$PROJECT_DIR" pull --quiet
else
    rm -rf "$PROJECT_DIR"
    git clone --depth 1 "$GIT_REPO_URL" "$PROJECT_DIR" --quiet
fi
ok "Repositório em $PROJECT_DIR (commit: $(git -C "$PROJECT_DIR" rev-parse --short HEAD))"

# ─────────────────────────────────────────────────────────────────────────────
# 8. Build do frontend SPA
# ─────────────────────────────────────────────────────────────────────────────
hdr "Build do frontend (React + Vite)"

cd "$PROJECT_DIR"

# Sanidade: package.json deve existir e ter script "build"
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
    err "package.json não encontrado em $PROJECT_DIR — repositório clonado incorretamente?"
    exit 1
fi
if ! grep -q '"build"' "$PROJECT_DIR/package.json"; then
    err "Script 'build' ausente em package.json — projeto incompatível"
    exit 1
fi
ok "package.json validado ($(node -p "require('./package.json').name" 2>/dev/null || echo projeto))"

# .env de build — SEMPRE sobrescrever com os dados do Supabase do CLIENTE.
# Nunca preservar .env do repositório, pois ele pode conter chaves de outro
# projeto (ex.: ambiente de desenvolvimento do Lovable).
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
if [[ -f .env ]]; then
    __old_ref=$(grep -E '^VITE_SUPABASE_PROJECT_ID' .env | head -1 | sed -E 's/.*=//; s/"//g' || true)
    if [[ -n "$__old_ref" && "$__old_ref" != "$SUPABASE_PROJECT_REF" ]]; then
        warn ".env do repositório aponta para projeto '$__old_ref' — será SOBRESCRITO com '$SUPABASE_PROJECT_REF'"
    fi
    cp -f .env .env.repo.bak 2>/dev/null || true
fi
info "Gerando .env do frontend (Supabase do cliente: $SUPABASE_PROJECT_REF)"
cat > .env <<EOF
VITE_SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_REF}"
VITE_SUPABASE_URL="${SUPABASE_URL}"
VITE_SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY}"
EOF
chmod 600 .env
ok ".env gravado apontando para ${SUPABASE_URL}"

# Limpeza de builds anteriores (evita herdar dist quebrada)
rm -rf "$PROJECT_DIR/dist" "$PROJECT_DIR/build" 2>/dev/null || true

# Memória disponível: Vite pode estourar em VPS pequena — aplicar limite explícito
TOTAL_MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [[ "${TOTAL_MEM_MB:-0}" -lt 1500 ]]; then
    warn "RAM total = ${TOTAL_MEM_MB}MB (baixa). Aplicando NODE_OPTIONS=--max-old-space-size=1024"
    export NODE_OPTIONS="--max-old-space-size=1024"
    # Cria swap temporário se não houver
    if [[ $(swapon --show | wc -l) -eq 0 ]]; then
        info "Criando swap temporário de 2G para suportar o build"
        fallocate -l 2G /swapfile-build 2>/dev/null && chmod 600 /swapfile-build \
            && mkswap /swapfile-build >/dev/null && swapon /swapfile-build \
            && ok "Swap ativado" || warn "Não foi possível criar swap"
    fi
else
    export NODE_OPTIONS="--max-old-space-size=2048"
fi

info "npm install (incluindo devDependencies — necessárias para Vite)"
export NODE_ENV=development   # garante instalação de devDependencies
if ! npm install --no-audit --no-fund --loglevel=error --include=dev; then
    err "npm install falhou — tentando limpar cache e reinstalar"
    rm -rf node_modules package-lock.json
    npm cache clean --force >/dev/null 2>&1 || true
    npm install --no-audit --no-fund --loglevel=error --include=dev
fi

# Confirma que o binário do Vite existe
if [[ ! -x "$PROJECT_DIR/node_modules/.bin/vite" ]]; then
    err "node_modules/.bin/vite não encontrado após npm install"
    err "DevDependencies não foram instaladas corretamente"
    exit 1
fi
ok "Vite instalado: $("$PROJECT_DIR/node_modules/.bin/vite" --version 2>/dev/null || echo '?')"

info "Executando 'npm run build' (saída completa abaixo)"
BUILD_LOG="$LOG_DIR/install-vvc-build.log"
export NODE_ENV=production
if ! npm run build 2>&1 | tee "$BUILD_LOG"; then
    err "Build falhou. Últimas linhas do erro:"
    tail -n 40 "$BUILD_LOG" | sed 's/^/    /'
    err "Log completo do build: $BUILD_LOG"
    exit 1
fi

# Validação rigorosa do dist gerado
if [[ ! -d "$PROJECT_DIR/dist" ]]; then
    err "Build terminou sem criar a pasta dist/"
    err "Verifique vite.config.ts (build.outDir) ou rode manualmente: cd $PROJECT_DIR && npm run build"
    exit 1
fi

if [[ ! -f "$PROJECT_DIR/dist/index.html" ]]; then
    err "dist/ existe mas index.html não foi gerado"
    info "Conteúdo de dist/:"
    ls -la "$PROJECT_DIR/dist/" | sed 's/^/    /'
    exit 1
fi

DIST_FILES=$(find "$PROJECT_DIR/dist" -type f | wc -l)
DIST_SIZE=$(du -sh "$PROJECT_DIR/dist" | awk '{print $1}')
if [[ "$DIST_FILES" -lt 3 ]]; then
    err "dist/ contém apenas $DIST_FILES arquivos — build incompleto"
    ls -la "$PROJECT_DIR/dist/" | sed 's/^/    /'
    exit 1
fi

# index.html deve referenciar pelo menos um asset JS (build válido)
if ! grep -qE '<script[^>]+src=' "$PROJECT_DIR/dist/index.html"; then
    err "dist/index.html não referencia nenhum bundle JS — build corrompido"
    exit 1
fi
ok "Build OK — $DIST_FILES arquivos, $DIST_SIZE total"

# ── Publicação atômica em /var/www/app/dist ───────────────────────────────
info "Publicando em $WEB_ROOT (cópia atômica)"
mkdir -p /var/www/app
rm -rf "$WEB_ROOT.new" "$WEB_ROOT.old"
cp -a "$PROJECT_DIR/dist" "$WEB_ROOT.new"

if [[ ! -f "$WEB_ROOT.new/index.html" ]]; then
    err "Falha ao copiar dist para $WEB_ROOT.new"
    exit 1
fi

[[ -d "$WEB_ROOT" ]] && mv "$WEB_ROOT" "$WEB_ROOT.old"
mv "$WEB_ROOT.new" "$WEB_ROOT"
rm -rf "$WEB_ROOT.old" 2>/dev/null || true

chown -R www-data:www-data /var/www/app
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;

# Validação final pós-cópia
PUB_FILES=$(find "$WEB_ROOT" -type f | wc -l)
if [[ ! -f "$WEB_ROOT/index.html" ]] || [[ "$PUB_FILES" -lt 3 ]]; then
    err "Publicação inconsistente: $PUB_FILES arquivos em $WEB_ROOT"
    ls -la "$WEB_ROOT/" | sed 's/^/    /'
    exit 1
fi
ok "Frontend publicado em $WEB_ROOT ($PUB_FILES arquivos servíveis pelo Nginx)"

# ─────────────────────────────────────────────────────────────────────────────
# 9. Deploy de Edge Functions (detecção dinâmica)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Deploy das Edge Functions (detecção dinâmica)"

export SUPABASE_ACCESS_TOKEN

FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"
DEPLOYED=()
SKIPPED=()
FAILED=()

if [[ ! -d "$FUNCTIONS_DIR" ]]; then
    warn "Diretório supabase/functions não existe — nada a deployar"
else
    for fn_path in "$FUNCTIONS_DIR"/*/; do
        fn_name=$(basename "$fn_path")

        # Ignorar diretórios utilitários (começam com _)
        if [[ "$fn_name" == _* ]]; then
            skip "$fn_name (diretório utilitário/shared)"
            continue
        fi

        # Detectar entrypoint válido
        entrypoint=""
        for candidate in index.ts index.js index.tsx; do
            if [[ -f "${fn_path}${candidate}" ]]; then
                entrypoint="${fn_path}${candidate}"
                break
            fi
        done

        if [[ -z "$entrypoint" ]]; then
            skip "$fn_name (sem index.ts/index.js)"
            SKIPPED+=("$fn_name")
            continue
        fi

        info "Deploy → $fn_name"
        if supabase functions deploy "$fn_name" \
            --project-ref "$SUPABASE_PROJECT_REF" \
            --no-verify-jwt \
            --use-api 2>&1 | tail -3; then
            ok "  $fn_name deployada"
            DEPLOYED+=("$fn_name")
        else
            warn "  Falha ao deployar $fn_name (continuando)"
            FAILED+=("$fn_name")
        fi
    done
fi

echo
ok "Edge Functions: ${#DEPLOYED[@]} deployadas, ${#SKIPPED[@]} ignoradas, ${#FAILED[@]} falharam"
[[ ${#DEPLOYED[@]} -gt 0 ]] && info "  ✔ ${DEPLOYED[*]}"
[[ ${#SKIPPED[@]}  -gt 0 ]] && info "  ↷ ${SKIPPED[*]}"
[[ ${#FAILED[@]}   -gt 0 ]] && warn "  ✘ ${FAILED[*]}"

# ─────────────────────────────────────────────────────────────────────────────
# 10. SMTP Hostinger → Supabase secrets
# ─────────────────────────────────────────────────────────────────────────────
hdr "Configurando SMTP Hostinger nos secrets do Supabase"

# Tenta 465 (SSL) por padrão; fallback documentado é 587
if supabase secrets set \
    SMTP_HOST="smtp.hostinger.com" \
    SMTP_PORT="465" \
    SMTP_USER="$SMTP_USER" \
    SMTP_PASS="$SMTP_PASS" \
    SMTP_FROM="$SMTP_USER" \
    SMTP_SECURE="true" \
    --project-ref "$SUPABASE_PROJECT_REF" >/dev/null 2>&1; then
    ok "Secrets SMTP gravados (host=smtp.hostinger.com, porta=465 SSL)"
    info "Fallback: alterar SMTP_PORT=587 e SMTP_SECURE=false se 465 for bloqueado"
else
    warn "Não foi possível gravar secrets SMTP via CLI — configure manualmente"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 11. Limpeza do Nginx (configs antigas/quebradas)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Limpando configurações antigas do Nginx"

# Remover default e qualquer vhost que aponte para localhost:3000
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*.bak /etc/nginx/sites-enabled/*.bak; do
    [[ -e "$f" ]] || continue
    base=$(basename "$f")
    if [[ "$base" == "default" ]] || [[ "$base" == *.bak ]]; then
        info "Removendo $f"
        rm -f "$f"
    elif grep -q "127.0.0.1:3000" "$f" 2>/dev/null; then
        warn "Removendo vhost obsoleto com proxy localhost:3000 → $f"
        rm -f "$f"
    fi
done
ok "Nginx limpo"

# ─────────────────────────────────────────────────────────────────────────────
# 12. Vhost #1 — frontend SPA estático (DOMAIN)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Configurando vhost SPA: $DOMAIN"

cat > /etc/nginx/sites-available/app-spa.conf <<NGINX
# Frontend SPA — servido estaticamente, SEM proxy_pass.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    # ACME challenge (Let's Encrypt)
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    # Compressão
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Assets imutáveis (Vite hash)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX
ln -sf /etc/nginx/sites-available/app-spa.conf /etc/nginx/sites-enabled/app-spa.conf
ok "Vhost SPA criado: /etc/nginx/sites-available/app-spa.conf"

# ─────────────────────────────────────────────────────────────────────────────
# 13. Vhost #2 — proxy API → Supabase Edge Functions (API_DOMAIN)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Configurando vhost API: $API_DOMAIN → Supabase Functions"

SUPABASE_HOST="${SUPABASE_PROJECT_REF}.supabase.co"

cat > /etc/nginx/sites-available/app-api.conf <<NGINX
# Subdomínio API — proxy para Supabase Edge Functions
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    # Proxy para functions/v1/<path>
    location / {
        proxy_pass https://${SUPABASE_HOST}/functions/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_HOST};
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/app-api.conf /etc/nginx/sites-enabled/app-api.conf
ok "Vhost API criado: /etc/nginx/sites-available/app-api.conf"

mkdir -p /var/www/certbot

# ─────────────────────────────────────────────────────────────────────────────
# 14. Validar e ativar Nginx
# ─────────────────────────────────────────────────────────────────────────────
hdr "Validando e ativando Nginx"

if ! nginx -t; then
    err "Configuração do Nginx inválida — abortando"
    exit 1
fi
ok "nginx -t passou"

systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx
sleep 1
if ! systemctl is-active --quiet nginx; then
    err "Nginx não está ativo após restart"
    systemctl status nginx --no-pager -l || true
    exit 1
fi
ok "Nginx ativo (PID $(pgrep -f 'nginx: master' | head -1))"

# ─────────────────────────────────────────────────────────────────────────────
# 15. SSL via Let's Encrypt (best-effort)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Tentando emitir certificados SSL"

issue_ssl() {
    local domains=()
    for d in "$@"; do
        # Só tenta se o domínio resolve para este servidor
        if host "$d" >/dev/null 2>&1; then
            domains+=(-d "$d")
        else
            warn "DNS de $d não resolve — pulando SSL para este domínio"
        fi
    done
    [[ ${#domains[@]} -eq 0 ]] && return 0

    if certbot --nginx --non-interactive --agree-tos \
        --email "$SMTP_USER" --redirect --no-eff-email \
        "${domains[@]}" 2>&1 | tail -5; then
        ok "SSL emitido para: $*"
    else
        warn "Falha ao emitir SSL — siga acessando via HTTP por enquanto"
    fi
}

issue_ssl "$DOMAIN" "www.$DOMAIN"
issue_ssl "$API_DOMAIN"

# ─────────────────────────────────────────────────────────────────────────────
# 16. CHECKLIST FINAL — validação real
# ─────────────────────────────────────────────────────────────────────────────
hdr "Checklist final de produção"

CHECKS_PASS=0
CHECKS_FAIL=0

check() {
    local name=$1; shift
    if "$@" >/dev/null 2>&1; then
        ok "$name"
        ((CHECKS_PASS++)) || true
    else
        err "$name"
        ((CHECKS_FAIL++)) || true
    fi
}

# 16.1 Nginx ativo
check "Nginx ativo" systemctl is-active --quiet nginx

# 16.2 Loopback HTTP — SPA
info "Testando loopback HTTP em 127.0.0.1 (Host: $DOMAIN)"
LOOP_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/" || echo 000)
if [[ "$LOOP_STATUS" =~ ^(200|301|302)$ ]]; then
    ok "Loopback SPA respondeu HTTP $LOOP_STATUS"
    ((CHECKS_PASS++)) || true
else
    err "Loopback SPA respondeu HTTP $LOOP_STATUS (esperado 200/301/302)"
    ((CHECKS_FAIL++)) || true
fi

# 16.3 Loopback fallback SPA (rota inexistente deve cair em index.html)
FB_BODY=$(curl -sk --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/rota-que-nao-existe-spa-test" || true)
if echo "$FB_BODY" | grep -qi '<div id="root"\|<!doctype html'; then
    ok "SPA fallback (try_files) servindo index.html corretamente"
    ((CHECKS_PASS++)) || true
else
    warn "SPA fallback não retornou index.html — verifique manualmente"
fi

# 16.4 Loopback API → Supabase
info "Testando loopback API em 127.0.0.1 (Host: $API_DOMAIN)"
API_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$API_DOMAIN:80:127.0.0.1" "http://$API_DOMAIN/" || echo 000)
if [[ "$API_STATUS" =~ ^(200|401|404)$ ]]; then
    ok "Loopback API respondeu HTTP $API_STATUS (proxy funcionando)"
    ((CHECKS_PASS++)) || true
else
    err "Loopback API respondeu HTTP $API_STATUS (proxy quebrado)"
    ((CHECKS_FAIL++)) || true
fi

# 16.5 Acessibilidade pública (best-effort, depende de DNS)
info "Testando acesso público a http://$DOMAIN"
PUB_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "http://$DOMAIN/" || echo 000)
if [[ "$PUB_STATUS" =~ ^(200|301|302)$ ]]; then
    ok "Domínio público respondeu HTTP $PUB_STATUS"
    ((CHECKS_PASS++)) || true
else
    warn "Domínio público respondeu HTTP $PUB_STATUS (verifique DNS)"
fi

# 16.6 HTTPS se certificado emitido
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    HTTPS_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/" || echo 000)
    if [[ "$HTTPS_STATUS" =~ ^(200|301|302)$ ]]; then
        ok "HTTPS público respondeu $HTTPS_STATUS"
        ((CHECKS_PASS++)) || true
    else
        warn "HTTPS respondeu $HTTPS_STATUS"
    fi
fi

# 16.7 Nenhuma porta inesperada aberta
UNEXPECTED=$(ss -tlnp 2>/dev/null | awk 'NR>1 {split($4,a,":"); p=a[length(a)]; print p}' | sort -u | grep -Ev '^(22|80|443|53|68|123)$' || true)
if [[ -z "$UNEXPECTED" ]]; then
    ok "Nenhuma porta inesperada escutando"
    ((CHECKS_PASS++)) || true
else
    warn "Portas adicionais ouvindo: $(echo "$UNEXPECTED" | tr '\n' ' ')"
fi

echo
echo -e "${C_BLU}═══════════════════════════════════════════════════════════════════════════════${C_RESET}"
echo -e "  ${C_GRN}Passaram: $CHECKS_PASS${C_RESET}    ${C_RED}Falharam: $CHECKS_FAIL${C_RESET}"
echo -e "${C_BLU}═══════════════════════════════════════════════════════════════════════════════${C_RESET}"

# ─────────────────────────────────────────────────────────────────────────────
# 17. Resumo final
# ─────────────────────────────────────────────────────────────────────────────
hdr "Resumo da instalação"

cat <<SUMMARY

  ${C_GRN}■${C_RESET} Frontend SPA ........... $WEB_ROOT
  ${C_GRN}■${C_RESET} Domínio principal ...... http://$DOMAIN  $([[ -d "/etc/letsencrypt/live/$DOMAIN" ]] && echo "(+HTTPS)")
  ${C_GRN}■${C_RESET} Subdomínio API ......... http://$API_DOMAIN → Supabase Functions
  ${C_GRN}■${C_RESET} Edge Functions ......... ${#DEPLOYED[@]} deployadas / ${#SKIPPED[@]} ignoradas
  ${C_GRN}■${C_RESET} SMTP ................... smtp.hostinger.com:465 (user: $SMTP_USER)
  ${C_GRN}■${C_RESET} Firewall ............... 22, 80, 443, 465, 587

  Comandos úteis:
    • Logs Nginx ........... tail -f /var/log/nginx/error.log
    • Logs do instalador ... tail -f $LOG_FILE
    • Re-build frontend .... cd $PROJECT_DIR && npm run build && cp -a dist/. $WEB_ROOT/
    • Deploy 1 function .... supabase functions deploy NOME --project-ref $SUPABASE_PROJECT_REF
    • Renovar SSL .......... certbot renew --quiet

SUMMARY

if [[ $CHECKS_FAIL -gt 0 ]]; then
    err "$CHECKS_FAIL verificação(ões) falharam — revise os logs acima"
    exit 1
fi

ok "Aplicação online e validada em produção 🚀"
