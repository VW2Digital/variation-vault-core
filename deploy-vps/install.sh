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

# -----------------------------------------------------------------------------
# LOG PERSISTENTE — toda a execução é gravada em /var/log/install-vvc.log
# (com rotação simples: mantém os últimos 5 .log.N, comprimidos a partir do .2)
# Saída original do terminal (com cores) é preservada via `tee`.
# Senhas/tokens são MASCARADOS antes de gravar no arquivo.
# -----------------------------------------------------------------------------
LOG_DIR="${LOG_DIR:-/var/log}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/install-vvc.log}"
LOG_KEEP="${LOG_KEEP:-5}"

# Só configura o log se rodando como root (mkdir/chmod em /var/log exige isso)
if [[ $EUID -eq 0 ]]; then
  mkdir -p "$LOG_DIR"
  # Rotação: install-vvc.log → .1 → .2.gz → .3.gz ... (descarta acima de LOG_KEEP)
  if [[ -f "$LOG_FILE" ]]; then
    for ((i=LOG_KEEP; i>=2; i--)); do
      [[ -f "${LOG_FILE}.$((i-1)).gz" ]] && mv -f "${LOG_FILE}.$((i-1)).gz" "${LOG_FILE}.${i}.gz"
    done
    [[ -f "${LOG_FILE}.1" ]] && gzip -f "${LOG_FILE}.1" && mv -f "${LOG_FILE}.1.gz" "${LOG_FILE}.2.gz"
    mv -f "$LOG_FILE" "${LOG_FILE}.1"
  fi
  : > "$LOG_FILE"
  chmod 600 "$LOG_FILE"  # protege porque pode conter URLs/headers internos

  # Filtro: remove sequências ANSI de cor e mascara segredos óbvios
  # (ADMIN_PASS, SUPABASE_ACCESS_TOKEN, ANON KEY, SERVICE_ROLE, WEBHOOK_SECRET)
  __log_filter() {
    sed -u -E \
      -e 's/\x1B\[[0-9;]*[mGKHF]//g' \
      -e 's/(sbp_[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/\1***REDACTED***/g' \
      -e 's/(eyJ[A-Za-z0-9_-]{12})[A-Za-z0-9_.-]{20,}/\1***REDACTED_JWT***/g' \
      -e 's/(SMTP_PASS=)[^ ]+/\1***REDACTED***/g' \
      -e 's/(ADMIN_PASS=)[^ ]+/\1***REDACTED***/g' \
      -e 's/(WEBHOOK_SECRET=)[^ ]+/\1***REDACTED***/g' \
      -e 's/(Authorization: Bearer )[A-Za-z0-9._-]+/\1***REDACTED***/g'
  }

  # Redireciona stdout+stderr para tee → terminal (com cores) E filtro → arquivo
  # Usa exec + process substitution para capturar TODO o output do script
  exec > >(tee >(__log_filter >> "$LOG_FILE")) 2>&1

  # Cabeçalho do log com metadados úteis para diagnóstico
  {
    echo "================================================================"
    echo "  install.sh — execução iniciada em $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    echo "  host=$(hostname)  user=$(whoami)  pwd=$(pwd)"
    echo "  args=$*"
    echo "  kernel=$(uname -r)  os=$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo unknown)"
    echo "================================================================"
  } >> "$LOG_FILE"
fi

# ---------- log ---------------------------------------------------------------
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'; W='\033[1m'; N='\033[0m'
# Timestamp curto para cada linha de log (visível no terminal e no arquivo)
__ts() { date +'%H:%M:%S'; }
log()   { echo -e "${C}[$(__ts)] [INFO]${N} $*"; }
ok()    { echo -e "${G}[$(__ts)] [ OK ]${N} $*"; }
warn()  { echo -e "${Y}[$(__ts)] [WARN]${N} $*"; }
err()   { echo -e "${R}[$(__ts)] [ERR ]${N} $*" >&2; }
step()  { echo -e "\n${W}${B}[$(__ts)] ▶ $*${N}"; }
title() { echo -e "\n${W}${C}══════════════════════════════════════════════════════════════════${N}"
          echo -e "${W}${C}  $*${N}"
          echo -e "${W}${C}══════════════════════════════════════════════════════════════════${N}\n"; }
mask()  { local s="${1:-}"; [[ -z "$s" ]] && { echo "(vazio)"; return; }
          local n=${#s}; (( n<=4 )) && { echo "****"; return; }
          echo "${s:0:2}***${s: -2}"; }

# Trap aprimorado: registra linha + comando que falhou (ótimo para postmortem)
__on_err() {
  local rc=$?
  err "Falha na linha $1 (exit=$rc) ao executar: $BASH_COMMAND"
  [[ -n "${LOG_FILE:-}" && -f "$LOG_FILE" ]] && err "Log completo: $LOG_FILE"
  exit "$rc"
}
trap '__on_err $LINENO' ERR
# Trap de saída: registra término (sucesso ou falha) com duração total
__START_TS=$(date +%s)
__on_exit() {
  local rc=$?
  local dur=$(( $(date +%s) - __START_TS ))
  if [[ -n "${LOG_FILE:-}" && -f "$LOG_FILE" ]]; then
    {
      echo "----------------------------------------------------------------"
      echo "  install.sh terminou em $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
      echo "  exit_code=$rc  duracao=${dur}s"
      echo "================================================================"
    } >> "$LOG_FILE"
  fi
}
trap __on_exit EXIT

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

# Detecta automaticamente a arquitetura correta do frontend.
# Padrão deste projeto: SPA estática (Vite/React) servida pelo Nginx do host.
STATIC_ROOT="${STATIC_ROOT:-/var/www/app/dist}"
LOCAL_BACKEND_UPSTREAM="${LOCAL_BACKEND_UPSTREAM:-}"
APP_MODE="spa_static"
APP_MODE_REASON="Projeto Vite/React + Supabase detectado; frontend será servido como arquivos estáticos pelo Nginx do host."
LOCAL_BACKEND_PROXY_URL=""
LOCAL_BACKEND_DISCOVERY=()
mkdir -p "$STATIC_ROOT"

normalize_url() {
  local raw="${1:-}"
  [[ -z "$raw" ]] && return 1
  case "$raw" in
    http://*|https://*) printf '%s\n' "$raw" ;;
    *) printf 'http://%s\n' "$raw" ;;
  esac
}

probe_http() {
  local url="${1:-}" code
  [[ -n "$url" ]] || return 1
  code="$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo 000)"
  [[ "$code" != "000" && "$code" != "502" && "$code" != "503" && "$code" != "504" ]]
}

discover_local_backend_listeners() {
  command -v ss >/dev/null 2>&1 || return 0
  local port line proc
  for port in 3000 3001 4000 5000 5173 8000 8080; do
    line="$(ss -H -ltnp "sport = :$port" 2>/dev/null | head -n1 || true)"
    [[ -n "$line" ]] || continue
    proc="$(sed -n 's/.*users:(("\([^"]\+\)".*/\1/p' <<< "$line" | head -n1)"
    printf '%s:%s\n' "$port" "${proc:-processo-desconhecido}"
  done
}

if [[ -n "$LOCAL_BACKEND_UPSTREAM" ]]; then
  LOCAL_BACKEND_PROXY_URL="$(normalize_url "$LOCAL_BACKEND_UPSTREAM")"
  if probe_http "$LOCAL_BACKEND_PROXY_URL"; then
    APP_MODE="local_backend_proxy"
    APP_MODE_REASON="Backend local explicitamente informado e acessível em ${LOCAL_BACKEND_PROXY_URL}."
  else
    warn "LOCAL_BACKEND_UPSTREAM=${LOCAL_BACKEND_UPSTREAM} não respondeu; mantendo modo SPA estática."
    LOCAL_BACKEND_PROXY_URL=""
  fi
fi

if jq -e '.scripts.build // "" | tostring | test("vite build")' "$PROJECT_DIR/package.json" >/dev/null 2>&1    && [[ -f "$PROJECT_DIR/src/main.tsx" || -f "$PROJECT_DIR/src/main.ts" ]]; then
  log "Detecção do projeto: frontend SPA Vite/React confirmado."
else
  warn "Heurística de SPA inconclusiva; mantendo modo ${APP_MODE} para evitar proxy incorreto."
fi

while IFS= read -r candidate; do
  [[ -n "$candidate" ]] && LOCAL_BACKEND_DISCOVERY+=("$candidate")
done < <(discover_local_backend_listeners)

if (( ${#LOCAL_BACKEND_DISCOVERY[@]} > 0 )); then
  warn "Listeners locais detectados (não serão usados sem validação explícita): ${LOCAL_BACKEND_DISCOVERY[*]}"
else
  log "Nenhum backend local obrigatório detectado nas portas típicas (3000/3001/4000/5000/5173/8000/8080)."
fi

if [[ "$APP_MODE" == "local_backend_proxy" ]]; then
  if [[ ! -f "$PROJECT_DIR/docker-compose.yml" && -f "$PROJECT_DIR/docker-compose.yml.disabled" ]]; then
    mv -f "$PROJECT_DIR/docker-compose.yml.disabled" "$PROJECT_DIR/docker-compose.yml"
    ok "docker-compose.yml restaurado porque um backend local real foi validado"
  fi
else
  rm -f "$PROJECT_DIR/docker-compose.override.yml"
fi

ok "Modo de frontend: ${APP_MODE}"
log "$APP_MODE_REASON"
if [[ "$APP_MODE" == "spa_static" ]]; then
  ok "Nginx servirá arquivos estáticos de ${STATIC_ROOT}"
  log "proxy_pass para o frontend principal: DESATIVADO"
else
  ok "Nginx aplicará proxy_pass apenas para backend real: ${LOCAL_BACKEND_PROXY_URL}"
  log "proxy_pass para o frontend principal: ATIVADO (${LOCAL_BACKEND_PROXY_URL})"
fi

# =============================================================================
# 6) NGINX (host) — domínio principal + subdomínio da API
# =============================================================================
title "Configurando Nginx (1 vhost por domínio · roteamento por path · sem porta-por-função)"

# -----------------------------------------------------------------------------
# Arquitetura:
#   80/443 → Nginx (única porta pública por protocolo)
#       ├─ ${MAIN_DOMAIN}  → SPA estática OU proxy local real (somente se validado)
#       │                    /api/* e webhooks → Supabase Edge Functions
#       └─ ${API_DOMAIN}   → Supabase Edge Functions (subdomínio dedicado)
#
# NUNCA criamos porta por função. Tudo é roteado por path.
# -----------------------------------------------------------------------------

SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_BACKUP_DIR="/var/backups/nginx-vhosts-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$NGINX_BACKUP_DIR" /var/www/certbot "$STATIC_ROOT"

# -----------------------------------------------------------------------------
# CRÍTICO: liberar portas 80/443 antes de configurar o Nginx do host.
# Sem isto, o Nginx do host não sobe e o usuário vê ERR_CONNECTION_REFUSED.
# Causa comum: container Docker (de instalação anterior) ainda bindando 80/443.
# -----------------------------------------------------------------------------
step "Liberando portas 80/443 (parando containers Docker concorrentes)"
# Para qualquer docker compose deste projeto e desabilita restart automático
if [[ -f "$PROJECT_DIR/docker-compose.yml" ]]; then
  ( cd "$PROJECT_DIR" && docker compose down --remove-orphans >/dev/null 2>&1 ) || true
fi
# Remove containers órfãos conhecidos (de versões antigas do projeto)
for cname in liberty-pharma-app variation-vault-core variation-vault-app; do
  docker rm -f "$cname" >/dev/null 2>&1 || true
done
# Última linha de defesa: mata QUALQUER container que ainda esteja segurando 80/443
for port in 80 443; do
  CONTAINERS_ON_PORT="$(docker ps --format '{{.ID}} {{.Ports}}' 2>/dev/null \
      | awk -v p=":$port->" '$0 ~ p {print $1}')"
  if [[ -n "$CONTAINERS_ON_PORT" ]]; then
    warn "Container(s) ainda segurando porta $port — derrubando: $CONTAINERS_ON_PORT"
    echo "$CONTAINERS_ON_PORT" | xargs -r docker rm -f >/dev/null 2>&1 || true
  fi
done
# Em modo SPA estática, renomeia docker-compose.yml para .disabled para
# evitar que `docker compose up` acidental ressuscite o conflito.
if [[ "$APP_MODE" == "spa_static" && -f "$PROJECT_DIR/docker-compose.yml" ]]; then
  mv -f "$PROJECT_DIR/docker-compose.yml" "$PROJECT_DIR/docker-compose.yml.disabled"
  ok "docker-compose.yml renomeado para .disabled (SPA é servida pelo Nginx do host)"
fi
# Verifica se as portas estão de fato livres (qualquer processo, não só Docker)
for port in 80 443; do
  if ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .; then
    PROCESS_INFO="$(ss -ltnp "sport = :$port" 2>/dev/null | tail -n +2 | head -1 || true)"
    # Tolera nginx do host (será reconfigurado/recarregado em seguida)
    if echo "$PROCESS_INFO" | grep -q '"nginx"'; then
      log "Porta $port em uso pelo Nginx do host (será recarregado)"
    else
      err "Porta $port ainda ocupada por processo não-Nginx:"
      err "  $PROCESS_INFO"
      err "Pare manualmente com: sudo fuser -k ${port}/tcp"
      exit 1
    fi
  fi
done
ok "Portas 80/443 prontas para o Nginx do host"

step "Limpando vhosts antigos / conflitantes (sem perder histórico)"
if [[ -d "$SITES_ENABLED" ]]; then
  shopt -s nullglob
  for f in "$SITES_ENABLED"/*; do
    mv -f "$f" "$NGINX_BACKUP_DIR/" 2>/dev/null || true
  done
  shopt -u nullglob
fi
find "$SITES_AVAILABLE" -maxdepth 1 -type f   \( -name '*.bak' -o -name '*.old' -o -name '*.copy' -o -name '*~' \)   -exec mv -f {} "$NGINX_BACKUP_DIR/" \; 2>/dev/null || true
for dom in "$MAIN_DOMAIN" "$API_DOMAIN"; do
  for f in "$SITES_AVAILABLE"/*"$dom"*; do
    [[ -f "$f" ]] || continue
    if grep -qE 'return\s+404' "$f" && ! grep -qE 'proxy_pass|root ' "$f"; then
      mv -f "$f" "$NGINX_BACKUP_DIR/" 2>/dev/null || true
    fi
  done
done
ok "Vhosts antigos movidos para $NGINX_BACKUP_DIR"

SUPABASE_FN_HOST="${SUPABASE_PROJECT_REF}.functions.supabase.co"
MAIN_DOMAIN_MODE_LABEL=""
MAIN_VHOST="$SITES_AVAILABLE/${MAIN_DOMAIN}.conf"

step "Gerando vhost do domínio principal: ${MAIN_DOMAIN}"
if [[ "$APP_MODE" == "local_backend_proxy" ]]; then
  MAIN_DOMAIN_MODE_LABEL="proxy_pass → ${LOCAL_BACKEND_PROXY_URL}"
  cat > "$MAIN_VHOST" <<EOF
# === ${MAIN_DOMAIN} — gerenciado pelo install.sh ===
# Frontend via backend local real validado + rotas /api/* e webhooks via Supabase.
server {
    listen 80;
    listen [::]:80;
    server_name ${MAIN_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass         https://${SUPABASE_FN_HOST}/production-router/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name     ${SUPABASE_FN_HOST};
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }

    location ~ ^/(melhor-envio-oauth|melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook|webhook-healthcheck)(/.*)?$ {
        proxy_pass         https://${SUPABASE_FN_HOST}/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name     ${SUPABASE_FN_HOST};
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }

    location / {
        proxy_pass         ${LOCAL_BACKEND_PROXY_URL};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
    }
}
EOF
else
  MAIN_DOMAIN_MODE_LABEL="SPA estática em ${STATIC_ROOT}"
  cat > "$MAIN_VHOST" <<EOF
# === ${MAIN_DOMAIN} — gerenciado pelo install.sh ===
# Frontend SPA estática + rotas /api/* e webhooks via Supabase.
server {
    listen 80;
    listen [::]:80;
    server_name ${MAIN_DOMAIN};
    root ${STATIC_ROOT};
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain text/css text/xml text/javascript
        application/javascript application/x-javascript
        application/xml application/json application/rss+xml
        image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)$ {
        expires 30d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }

    location /api/ {
        proxy_pass         https://${SUPABASE_FN_HOST}/production-router/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name     ${SUPABASE_FN_HOST};
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }

    location ~ ^/(melhor-envio-oauth|melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook|webhook-healthcheck)(/.*)?$ {
        proxy_pass         https://${SUPABASE_FN_HOST}/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header   Host              ${SUPABASE_FN_HOST};
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name     ${SUPABASE_FN_HOST};
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
fi

step "Gerando vhost da API: ${API_DOMAIN}"
cat > "$SITES_AVAILABLE/${API_DOMAIN}.conf" <<EOF
# === ${API_DOMAIN} — gerenciado pelo install.sh ===
# Subdomínio dedicado a Supabase Edge Functions (webhooks, OAuth, integrações).
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
        proxy_ssl_name     ${SUPABASE_FN_HOST};
        proxy_read_timeout 120s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }
}
EOF

ln -sf "$SITES_AVAILABLE/${MAIN_DOMAIN}.conf" "$SITES_ENABLED/${MAIN_DOMAIN}.conf"
ln -sf "$SITES_AVAILABLE/${API_DOMAIN}.conf"  "$SITES_ENABLED/${API_DOMAIN}.conf"

restart_nginx_or_fail() {
  local action="${1:-restart}"
  if ! nginx -t > /tmp/nginx-test.log 2>&1; then
    err "nginx -t falhou. Saída:"
    cat /tmp/nginx-test.log
    warn "Vhosts antigos foram preservados em $NGINX_BACKUP_DIR (você pode restaurar se precisar)."
    exit 1
  fi

  systemctl enable nginx >/dev/null 2>&1 || true
  if ! systemctl "$action" nginx; then
    err "systemctl ${action} nginx falhou"
    systemctl status nginx --no-pager || true
    journalctl -u nginx -n 50 --no-pager || true
    exit 1
  fi

  if ! systemctl is-active --quiet nginx; then
    err "Nginx não permaneceu ativo após ${action}"
    systemctl status nginx --no-pager || true
    journalctl -u nginx -n 50 --no-pager || true
    exit 1
  fi
}

step "Validando configuração do Nginx"
restart_nginx_or_fail restart
ok "Nginx ativo · ${MAIN_DOMAIN} (${MAIN_DOMAIN_MODE_LABEL}) · ${API_DOMAIN} (Edge Functions)"

# =============================================================================
# 7) BUILD / DEPLOY DO CONTAINER
# =============================================================================
title "Publicando frontend conforme arquitetura detectada"
if [[ "$APP_MODE" == "spa_static" ]]; then
  step "Removendo frontend legado em Docker (se existir)"
  ( cd "$PROJECT_DIR" && docker compose down --remove-orphans >/dev/null 2>&1 ) || true
  docker rm -f liberty-pharma-app >/dev/null 2>&1 || true

  step "Buildando assets estáticos com Docker (sem backend local obrigatório)"
  STATIC_BUILD_IMAGE="variation-vault-static-builder:${SUPABASE_PROJECT_REF}"
  docker build     --target builder     --build-arg VITE_SUPABASE_URL="$SUPABASE_URL"     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_ANON_KEY"     --build-arg VITE_SUPABASE_PROJECT_ID="$SUPABASE_PROJECT_REF"     -t "$STATIC_BUILD_IMAGE" "$PROJECT_DIR"

  BUILD_CID="$(docker create "$STATIC_BUILD_IMAGE")"
  rm -rf "${STATIC_ROOT:?}/"*
  docker cp "$BUILD_CID:/app/dist/." "$STATIC_ROOT/"
  docker rm -f "$BUILD_CID" >/dev/null

  [[ -f "$STATIC_ROOT/index.html" ]] || { err "Build concluído sem index.html em $STATIC_ROOT"; exit 1; }
  chown -R www-data:www-data "$STATIC_ROOT" 2>/dev/null || true
  find "$STATIC_ROOT" -type d -exec chmod 755 {} \;
  find "$STATIC_ROOT" -type f -exec chmod 644 {} \;
  ok "Frontend SPA publicado em $STATIC_ROOT"
else
  step "Validando backend local configurado"
  probe_http "$LOCAL_BACKEND_PROXY_URL" || {
    err "Backend local configurado não respondeu em $LOCAL_BACKEND_PROXY_URL"
    exit 1
  }
  ok "Backend local acessível em $LOCAL_BACKEND_PROXY_URL"
fi

step "Recarregando Nginx com a arquitetura detectada"
restart_nginx_or_fail reload
ok "Frontend publicado sem dependência falsa de localhost:3000"

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
title "Configurando backend gerenciado (Secrets + Auth SMTP + Edge Functions)"

run_supabase() {
  ( cd "$PROJECT_DIR" && supabase "$@" )
}

detect_function_entrypoint() {
  local fn_dir="$1" entry
  for entry in index.ts index.js; do
    [[ -f "$fn_dir/$entry" ]] && { printf '%s\n' "$entry"; return 0; }
  done
  return 1
}

function_exists() {
  [[ -d "$PROJECT_DIR/supabase/functions/$1" ]]
}

CONFIGURED_FUNCTIONS=()
if [[ -f "$PROJECT_DIR/supabase/config.toml" ]]; then
  while IFS= read -r fn_name; do
    [[ -n "$fn_name" ]] && CONFIGURED_FUNCTIONS+=("$fn_name")
  done < <(awk -F'[][]' '/^\[functions\.[^]]+\]/{sub(/^functions\./,"",$2); print $2}' "$PROJECT_DIR/supabase/config.toml" | sort -u)
fi

export SUPABASE_ACCESS_TOKEN
run_supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Convenções automáticas para SMTP (Hostinger por padrão)
SMTP_HOST="${SMTP_HOST:-smtp.hostinger.com}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_FROM_NAME="${SMTP_FROM_NAME:-${MAIN_DOMAIN%%.*}}"

if (( ${#CONFIGURED_FUNCTIONS[@]} > 0 )); then
  step "Auditando funções declaradas em supabase/config.toml"
  CONFIG_ONLY_FUNCTIONS=()
  for fn_name in "${CONFIGURED_FUNCTIONS[@]}"; do
    if [[ ! -d "$PROJECT_DIR/supabase/functions/$fn_name" ]]; then
      CONFIG_ONLY_FUNCTIONS+=("$fn_name")
    fi
  done

  if (( ${#CONFIG_ONLY_FUNCTIONS[@]} > 0 )); then
    warn "Funções declaradas no config, mas ausentes no repositório: ${CONFIG_ONLY_FUNCTIONS[*]}"
    warn "Isso não aborta a instalação; apenas impede deploy falso."
  else
    ok "Configuração de funções consistente com o repositório"
  fi
fi

step "Enviando secrets para Edge Functions"
run_supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
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
  ok "Autenticação do backend configurada (SMTP, Site URL, Redirects)"
else
  warn "Falha ao atualizar Auth (HTTP $HTTP_CODE):"
  cat /tmp/auth.json; echo
fi

step "Deploy automático apenas das Edge Functions reais"
if [[ -d "$PROJECT_DIR/supabase/functions" ]]; then
  FOUND_FUNCTIONS=()
  DEPLOYED_FUNCTIONS=()
  SKIPPED_FUNCTIONS=()
  FAILED_FUNCTIONS=()
  shopt -s nullglob
  for d in "$PROJECT_DIR"/supabase/functions/*; do
    [[ -d "$d" ]] || continue
    fn="$(basename "$d")"

    if [[ "$fn" == "_shared" ]]; then
      echo "  [SKIP] $fn -> diretório compartilhado"
      SKIPPED_FUNCTIONS+=("$fn:shared")
      continue
    fi

    entrypoint="$(detect_function_entrypoint "$d" || true)"
    if [[ -z "$entrypoint" ]]; then
      echo "  [SKIP] $fn -> entrypoint válido não encontrado"
      SKIPPED_FUNCTIONS+=("$fn:missing_entrypoint")
      continue
    fi

    FOUND_FUNCTIONS+=("$fn")
    echo "  [FOUND] $fn -> ${entrypoint}"
    if run_supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"; then
      DEPLOYED_FUNCTIONS+=("$fn")
      echo "  [OK]    $fn -> deploy concluído"
    else
      warn "  [WARN]  $fn -> falha no deploy (instalação seguirá para diagnóstico final)"
      FAILED_FUNCTIONS+=("$fn")
    fi
  done
  shopt -u nullglob

  ok "Edge Functions auditadas: ${#FOUND_FUNCTIONS[@]} encontradas, ${#DEPLOYED_FUNCTIONS[@]} deployadas, ${#SKIPPED_FUNCTIONS[@]} ignoradas, ${#FAILED_FUNCTIONS[@]} com alerta"
  [[ ${#FOUND_FUNCTIONS[@]} -gt 0 ]] && log "Encontradas: ${FOUND_FUNCTIONS[*]}"
  [[ ${#DEPLOYED_FUNCTIONS[@]} -gt 0 ]] && log "Deployadas: ${DEPLOYED_FUNCTIONS[*]}"
  [[ ${#SKIPPED_FUNCTIONS[@]} -gt 0 ]] && warn "Ignoradas: ${SKIPPED_FUNCTIONS[*]}"
  [[ ${#FAILED_FUNCTIONS[@]} -gt 0 ]] && warn "Falharam: ${FAILED_FUNCTIONS[*]}"
else
  warn "supabase/functions/ não encontrado no repositório"
fi

# Limpa segredos da memória
unset ADMIN_PASS SUPABASE_ACCESS_TOKEN SERVICE_ROLE_KEY WEBHOOK_SECRET AUTH_PAYLOAD

# =============================================================================
# 9.5) CHECKLIST DE VALIDAÇÃO FINAL
# =============================================================================
title "Checklist de validação — testando serviços reais"

CHECK_PASS=0; CHECK_FAIL=0; CHECK_WARN=0
pass() { ok    "✓ $*"; CHECK_PASS=$((CHECK_PASS+1)); }
fail() { err   "✗ $*"; CHECK_FAIL=$((CHECK_FAIL+1)); }
skip() { warn  "↷ $*"; CHECK_WARN=$((CHECK_WARN+1)); }

http_code() {
  curl -k -s -o /dev/null -w "%{http_code}"        --max-time 10 -L "$1" 2>/dev/null || echo "000"
}

host_code() {
  local host="$1" path="$2"
  curl -k -s -o /dev/null -w "%{http_code}"        --max-time 10 -H "Host: ${host}" "http://127.0.0.1${path}" 2>/dev/null || echo "000"
}

step "1/9 · Modo de frontend"
if [[ "$APP_MODE" == "spa_static" ]]; then
  if [[ -s "$STATIC_ROOT/index.html" ]]; then
    pass "Modo SPA estática ativo (${STATIC_ROOT})"
  else
    fail "Modo SPA estática configurado, mas ${STATIC_ROOT}/index.html não existe ou está vazio"
  fi
else
  if probe_http "$LOCAL_BACKEND_PROXY_URL"; then
    pass "Backend local proxyável respondeu em ${LOCAL_BACKEND_PROXY_URL}"
  else
    fail "Backend local configurado não respondeu em ${LOCAL_BACKEND_PROXY_URL}"
  fi
fi

step "2/9 · Status rápido de container e Nginx"
if systemctl is-active --quiet nginx && nginx -t >/dev/null 2>&1; then
  pass "Nginx ativo e configuração válida"
else
  fail "Nginx inativo ou com erro de sintaxe (nginx -t para detalhes)"
  systemctl status nginx --no-pager || true
  journalctl -u nginx -n 50 --no-pager || true
fi

if docker ps --format '{{.Names}}	{{.Status}}	{{.Ports}}' | grep -q '.'; then
  docker ps --format 'table {{.Names}}	{{.Status}}	{{.Ports}}'
  pass "Comando de status dos containers respondeu"
else
  skip "Nenhum container ativo — esperado em modo SPA estática"
fi

step "3/9 · Frontend local via Nginx (loopback + fallback SPA)"
LOOPBACK_CODE="$(host_code "$MAIN_DOMAIN" "/")"
LOOPBACK_SPA_CODE="$(host_code "$MAIN_DOMAIN" "/checkout/install-health")"
if [[ "$LOOPBACK_CODE" =~ ^(200|301|302|308)$ && "$LOOPBACK_SPA_CODE" =~ ^(200|301|302|308)$ ]]; then
  pass "Nginx local respondeu para raiz e rota interna SPA (root=$LOOPBACK_CODE, fallback=$LOOPBACK_SPA_CODE)"
else
  fail "Nginx local não serviu corretamente a SPA (root=$LOOPBACK_CODE, fallback=$LOOPBACK_SPA_CODE)"
  warn "Diagnóstico rápido:"
  warn "  • systemctl status nginx --no-pager"
  warn "  • ls -lah ${STATIC_ROOT}"
  warn "  • nginx -T | grep -n '${MAIN_DOMAIN}'"
fi

step "4/9 · Frontend público HTTP"
HTTP_CODE_MAIN="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${MAIN_DOMAIN}" 2>/dev/null || echo "000")"
if [[ "$HTTP_CODE_MAIN" =~ ^(200|301|302|308)$ ]]; then
  pass "http://${MAIN_DOMAIN} respondeu (HTTP $HTTP_CODE_MAIN)"
else
  fail "http://${MAIN_DOMAIN} não está acessível (HTTP $HTTP_CODE_MAIN)"
  warn "DNS atual para ${MAIN_DOMAIN}: $(dig +short ${MAIN_DOMAIN} | paste -sd ',' - || echo 'sem resposta')"
fi

step "5/9 · Frontend público HTTPS"
HTTPS_CODE_MAIN="$(http_code "https://${MAIN_DOMAIN}")"
if [[ "$HTTPS_CODE_MAIN" =~ ^(200|301|302|304)$ ]]; then
  pass "https://${MAIN_DOMAIN} está acessível (HTTP $HTTPS_CODE_MAIN)"
else
  fail "https://${MAIN_DOMAIN} não está acessível (HTTP $HTTPS_CODE_MAIN)"
  warn "Certifique-se de que DNS, certificado e redirect do Nginx estejam corretos."
fi

step "6/9 · API HTTPS (${MAIN_DOMAIN}/api/* e ${API_DOMAIN})"
if function_exists "production-router"; then
  API_CODE_MAIN="$(http_code "https://${MAIN_DOMAIN}/api/")"
  API_CODE_SUBDOMAIN="$(http_code "https://${API_DOMAIN}/")"
  if [[ "$API_CODE_MAIN" =~ ^(200|401|404|405)$ || "$API_CODE_SUBDOMAIN" =~ ^(200|401|404|405)$ ]]; then
    pass "Rotas de API alcançaram Edge Functions (main=$API_CODE_MAIN, api=$API_CODE_SUBDOMAIN)"
  else
    fail "Rotas de API não responderam como esperado (main=$API_CODE_MAIN, api=$API_CODE_SUBDOMAIN)"
  fi
else
  skip "production-router ausente; validação de /api/* pulada"
fi

step "7/9 · Webhooks de pagamento e logística"
WEBHOOK_FAILURES=()
if function_exists "pagarme-webhook"; then
  WH_PAGARME_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "https://${API_DOMAIN}/pagarme-webhook" -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")"
  [[ "$WH_PAGARME_CODE" =~ ^(200|400|401|403|404|405|422)$ ]] || WEBHOOK_FAILURES+=("pagarme-webhook:$WH_PAGARME_CODE")
fi
if function_exists "melhor-envio-webhook"; then
  WH_MELHOR_ENVIO_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "https://${API_DOMAIN}/melhor-envio-webhook" -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")"
  [[ "$WH_MELHOR_ENVIO_CODE" =~ ^(200|400|401|403|404|405|422)$ ]] || WEBHOOK_FAILURES+=("melhor-envio-webhook:$WH_MELHOR_ENVIO_CODE")
fi

if (( ${#WEBHOOK_FAILURES[@]} == 0 )); then
  pass "Webhooks acessíveis pelos endpoints publicados"
else
  fail "Falha em webhook(s): ${WEBHOOK_FAILURES[*]}"
fi

step "8/9 · Endpoint OAuth (melhor-envio-oauth)"
if function_exists "melhor-envio-oauth"; then
  OAUTH_CODE="$(http_code "https://${API_DOMAIN}/melhor-envio-oauth")"
  if [[ "$OAUTH_CODE" =~ ^(200|302|400|401|403|404|405)$ ]]; then
    pass "Endpoint OAuth alcançável (HTTP $OAUTH_CODE)"
  else
    fail "Endpoint OAuth retornou HTTP $OAUTH_CODE"
  fi
else
  skip "melhor-envio-oauth ausente; validação OAuth pulada"
fi

step "9/9 · Auditoria de portas (host + Docker)"
ALLOWED_PUBLIC_PORTS=("80" "443" "22")
SUSPICIOUS_PORTS=("3000" "3001" "4000" "4001" "5000" "5001" "5173" "8000" "8080" "8443" "9000")

is_in_list() { local n="$1"; shift; local x; for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done; return 1; }

UNEXPECTED_PUBLIC=()
UNEXPECTED_DOCKER=()

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    addr="${line%:*}"
    port="${line##*:}"
    [[ "$port" =~ ^[0-9]+$ ]] || continue
    [[ "$addr" == "127.0.0.1" || "$addr" == "[::1]" || "$addr" == "::1" ]] && continue
    if ! is_in_list "$port" "${ALLOWED_PUBLIC_PORTS[@]}"; then
      UNEXPECTED_PUBLIC+=("$addr:$port")
    fi
  done < <(ss -H -ltn 2>/dev/null | awk '{print $4}')
else
  fail "ss não disponível — não foi possível auditar portas do host"
fi

if command -v docker >/dev/null 2>&1 && docker ps -q >/dev/null 2>&1; then
  while IFS= read -r mapping; do
    [[ -z "$mapping" ]] && continue
    host_part="${mapping%%->*}"
    host_port="${host_part##*:}"
    [[ "$host_port" =~ ^[0-9]+$ ]] || continue
    host_addr="${host_part%:*}"
    [[ "$host_addr" == "127.0.0.1" || "$host_addr" == "[::1]" ]] && continue
    if ! is_in_list "$host_port" "${ALLOWED_PUBLIC_PORTS[@]}"; then
      UNEXPECTED_DOCKER+=("$mapping")
    fi
  done < <(docker ps --format '{{.Ports}}' | tr ',' '
' | sed 's/^ *//;s/ *$//')
fi

SUSPECT_HITS=()
for p in "${SUSPICIOUS_PORTS[@]}"; do
  if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -E "^(0\.0\.0\.0|\*|\[::\]):${p}$" -q; then
    SUSPECT_HITS+=("$p")
  fi
done

AUDIT_FAIL=0
if (( ${#UNEXPECTED_PUBLIC[@]} > 0 )); then
  fail "Listeners públicos inesperados no host: ${UNEXPECTED_PUBLIC[*]}"
  AUDIT_FAIL=1
fi
if (( ${#UNEXPECTED_DOCKER[@]} > 0 )); then
  fail "Portas Docker publicadas inesperadas: ${UNEXPECTED_DOCKER[*]}"
  AUDIT_FAIL=1
fi
if (( ${#SUSPECT_HITS[@]} > 0 )); then
  fail "Portas suspeitas expostas: ${SUSPECT_HITS[*]}"
  warn "Arquitetura correta usa apenas 80/443 com roteamento por path no Nginx."
  AUDIT_FAIL=1
fi
if (( AUDIT_FAIL == 0 )); then
  pass "Apenas portas esperadas (80/443) abertas publicamente"
fi

echo
log "Resultado: ${G}${CHECK_PASS} OK${N} · ${Y}${CHECK_WARN} alertas${N} · ${R}${CHECK_FAIL} falhas${N}"
if (( CHECK_FAIL > 0 )); then
  err "Instalação não foi validada em produção. Corrija as falhas acima e reexecute o instalador."
fi

# =============================================================================
# 10) RESUMO FINAL
# =============================================================================
if [[ "$APP_MODE" == "spa_static" ]]; then
  FRONTEND_STATUS_COMMAND="test -f ${STATIC_ROOT}/index.html && ls -lah ${STATIC_ROOT}"
  FRONTEND_ARCH_TARGET="${STATIC_ROOT} (SPA estática)"
else
  FRONTEND_STATUS_COMMAND="curl -I ${LOCAL_BACKEND_PROXY_URL}"
  FRONTEND_ARCH_TARGET="${LOCAL_BACKEND_PROXY_URL} (proxy local validado)"
fi

if (( CHECK_FAIL == 0 )); then
  title "✅ Instalação validada e online"
else
  title "❌ Instalação com falhas — domínio principal não validado"
fi

DOM_ROOT="${MAIN_DOMAIN#*.}"
cat <<EOF
${W}URLs esperadas${N}
  Site .............. https://${MAIN_DOMAIN}
  API/Webhook ....... https://${API_DOMAIN}
  Backend ........... ${SUPABASE_URL}

${W}DNS recomendado (entregabilidade SMTP)${N}
  SPF   TXT  ${DOM_ROOT}                           v=spf1 include:_spf.mail.hostinger.com ~all
  DKIM  TXT  hostingermail._domainkey.${DOM_ROOT}  (valor no painel Hostinger)
  DMARC TXT  _dmarc.${DOM_ROOT}                    v=DMARC1; p=quarantine; rua=mailto:${ADMIN_EMAIL}

  Verificar:
    dig +short TXT ${DOM_ROOT}
    dig +short TXT _dmarc.${DOM_ROOT}

${W}Manutenção${N}
  Logs Nginx ....... tail -f /var/log/nginx/error.log
  Logs Function .... (cd ${PROJECT_DIR} && supabase functions logs <nome> --project-ref ${SUPABASE_PROJECT_REF})
  Renovar SSL ...... certbot renew --quiet
  Log instalação ... tail -f ${LOG_FILE:-/var/log/install-vvc.log}
                     ls -lah ${LOG_DIR:-/var/log}/install-vvc.log*    # rotacionados

${W}Comandos de diagnóstico (status rápido)${N}
  Status Nginx ............ systemctl status nginx --no-pager && nginx -t
  Frontend local ......... ${FRONTEND_STATUS_COMMAND}
  Teste HTTP/HTTPS ....... curl -I http://${MAIN_DOMAIN} && curl -I https://${MAIN_DOMAIN}
  Teste API .............. curl -I https://${MAIN_DOMAIN}/api/ && curl -I https://${API_DOMAIN}/
  Teste webhook .......... curl -X POST https://${API_DOMAIN}/pagarme-webhook -H 'Content-Type: application/json' -d '{}'
  Teste OAuth ............ curl -I https://${API_DOMAIN}/melhor-envio-oauth
  Re-rodar checklist ..... bash ${PROJECT_DIR}/deploy-vps/check-vps.sh   # se existir
  Auditar portas ......... ss -tlnp | grep -vE ':(80|443|22)\s' && docker ps --format '{{.Ports}}'

${W}Troubleshooting Nginx${N}
  duplicate listen ........ grep -RnE 'listen\s+(80|443)' /etc/nginx/sites-enabled
  conflicting server_name . nginx -T 2>&1 | grep -E 'server_name|conflict'
  vhosts ativos ........... ls -la /etc/nginx/sites-enabled/
  logs do serviço ......... journalctl -u nginx -n 50 --no-pager
  recarregar config ....... nginx -t && systemctl restart nginx
  arquitetura por rota .... /api/* e /<webhook> → Edge Functions (NUNCA porta dedicada)

${W}Arquitetura${N}
  Browser ─┬─ https://${MAIN_DOMAIN}/        → Nginx :443 → ${FRONTEND_ARCH_TARGET}
           ├─ https://${MAIN_DOMAIN}/api/*   → Nginx :443 → Edge Functions
           └─ https://${API_DOMAIN}/<fn>     → Nginx :443 → Edge Functions

  Apenas 2 portas públicas: 80 (redirect) e 443 (HTTPS).
  Cada integração (webhook, OAuth, e-mail, payment) é uma rota, não uma porta.
EOF

if (( CHECK_FAIL > 0 )); then
  exit 1
fi
