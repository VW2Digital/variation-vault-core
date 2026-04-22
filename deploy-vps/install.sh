#!/usr/bin/env bash
###############################################################################
# install-production.sh
# -----------------------------------------------------------------------------
# Provisionamento profissional de VPS Ubuntu/Debian para hospedar o frontend
# da aplicação em Docker, com Nginx da VPS atuando como ÚNICO reverse proxy
# público (portas 80/443) e SMTP 100% delegado ao Supabase Edge Functions.
#
# Arquitetura alvo:
#   Internet
#      │
#      ▼
#   Nginx (VPS, host)        ── portas 80/443 expostas ao mundo
#      │  proxy_pass
#      ▼
#   Docker container app     ── escuta APENAS em 127.0.0.1:3000
#      │  supabase.functions.invoke(...)
#      ▼
#   Supabase (Auth + DB + Edge Functions + Secrets SMTP)
#      │  SMTP TLS 465
#      ▼
#   Provider SMTP externo (Hostinger / Resend / SES / SendGrid)
#
# Princípios desta arquitetura (LEIA antes de modificar):
#   • NÃO existe Nginx duplicado: o container NÃO publica porta 80 no host.
#   • NÃO há conflito de porta 80: somente o Nginx do host escuta nela.
#   • NÃO há "duplicate default server": o site é gerenciado em um único
#     arquivo dentro de /etc/nginx/sites-available/ e o default do Nginx
#     padrão é desativado.
#   • NÃO há SMTP local (Postfix/Exim/Sendmail). O envio é feito por uma
#     Edge Function que lê os secrets configurados no próprio Supabase.
#   • Credenciais sensíveis (SMTP_PASS, SUPABASE_SERVICE_ROLE_KEY) NUNCA são
#     gravadas em disco na VPS — são enviadas direto para os secrets do
#     Supabase via `supabase secrets set` e em seguida descartadas da memória.
#
# Uso:
#   sudo bash install-production.sh
#
# Modo não-interativo (CI/CD): defina as variáveis abaixo antes de executar
# para pular os prompts:
#   NON_INTERACTIVE=1
#   DOMAIN=app.exemplo.com
#   APP_PORT=3000
#   SUPABASE_PROJECT_REF=xxxxxxxxxxxxxxxx
#   CONFIGURE_SMTP_SECRETS=1   # também: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME, SMTP_SECURE
###############################################################################

set -Eeuo pipefail

# ─── Cores e helpers de log ──────────────────────────────────────────────────
readonly C_RESET='\033[0m'
readonly C_BOLD='\033[1m'
readonly C_RED='\033[0;31m'
readonly C_GREEN='\033[0;32m'
readonly C_YELLOW='\033[0;33m'
readonly C_BLUE='\033[0;34m'
readonly C_CYAN='\033[0;36m'

log_step()    { echo -e "\n${C_BOLD}${C_BLUE}▸ $*${C_RESET}"; }
log_info()    { echo -e "  ${C_CYAN}ℹ${C_RESET} $*"; }
log_ok()      { echo -e "  ${C_GREEN}✓${C_RESET} $*"; }
log_warn()    { echo -e "  ${C_YELLOW}⚠${C_RESET} $*" >&2; }
log_error()   { echo -e "  ${C_RED}✗${C_RESET} $*" >&2; }
log_section() {
    echo -e "\n${C_BOLD}${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN} $* ${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
}

trap 'log_error "Falha na linha $LINENO. Abortando."' ERR

# ─── Pré-requisitos ──────────────────────────────────────────────────────────
require_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script precisa ser executado como root (use: sudo bash $0)"
        exit 1
    fi
}

require_debian_family() {
    if ! command -v apt-get >/dev/null 2>&1; then
        log_error "Sistema não suportado. Este script foi escrito para Ubuntu/Debian (apt)."
        exit 1
    fi
}

# ─── Inputs do usuário ───────────────────────────────────────────────────────
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
APP_PORT="${APP_PORT:-3000}"
DOMAIN="${DOMAIN:-}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
CONFIGURE_SMTP_SECRETS="${CONFIGURE_SMTP_SECRETS:-0}"

prompt_inputs() {
    if [[ "$NON_INTERACTIVE" == "1" ]]; then
        log_info "Modo não-interativo ativo (NON_INTERACTIVE=1)."
        return
    fi

    log_section "Configuração inicial"

    if [[ -z "$DOMAIN" ]]; then
        read -rp "Domínio público da aplicação (ex: app.exemplo.com) [opcional]: " DOMAIN || true
    fi

    read -rp "Porta interna em que o container escutará no host [${APP_PORT}]: " _ans || true
    APP_PORT="${_ans:-$APP_PORT}"

    read -rp "Configurar secrets SMTP no Supabase agora? (s/N): " _ans || true
    if [[ "${_ans,,}" =~ ^s(im)?$ ]]; then
        CONFIGURE_SMTP_SECRETS=1
    fi
}

# ─── Etapa 1: atualização do sistema ─────────────────────────────────────────
update_system() {
    log_step "1/9 Atualizando o sistema (apt update && apt upgrade)"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get upgrade -y
    apt-get autoremove -y
    log_ok "Sistema atualizado."
}

# ─── Etapa 2: dependências essenciais ────────────────────────────────────────
install_dependencies() {
    log_step "2/9 Instalando dependências essenciais"
    apt-get install -y \
        curl wget git unzip zip nano \
        ufw net-tools software-properties-common \
        ca-certificates openssl telnet netcat-openbsd \
        python3 python3-pip python3-venv python3-dev \
        build-essential \
        docker.io docker-compose \
        nginx
    log_ok "Pacotes base instalados (Docker + Nginx + utilitários)."
}

# ─── Etapa 3: Docker ─────────────────────────────────────────────────────────
configure_docker() {
    log_step "3/9 Habilitando e iniciando Docker"
    systemctl enable docker
    systemctl start docker
    docker --version || true
    docker compose version 2>/dev/null || docker-compose --version || true
    log_ok "Docker ativo."
    log_info "Lembrete: o container da app NÃO deve publicar a porta 80 do host."
    log_info "          Use 'ports: \"127.0.0.1:${APP_PORT}:80\"' no docker-compose.yml."
}

# ─── Etapa 4: Nginx único reverse proxy ──────────────────────────────────────
configure_nginx() {
    log_step "4/9 Configurando Nginx do host como reverse proxy único"

    systemctl enable nginx
    systemctl start nginx

    # Remove o default do Nginx para evitar "duplicate default server".
    if [[ -L /etc/nginx/sites-enabled/default || -f /etc/nginx/sites-enabled/default ]]; then
        rm -f /etc/nginx/sites-enabled/default
        log_info "Site 'default' do Nginx desativado (evita duplicate default_server)."
    fi

    local server_name_directive="_"
    if [[ -n "$DOMAIN" ]]; then
        server_name_directive="$DOMAIN"
    fi

    local site_path="/etc/nginx/sites-available/app.conf"
    cat >"$site_path" <<NGINX_CONF
###############################################################################
# Reverse proxy gerenciado pelo install-production.sh
# Único server block padrão do host. NUNCA marque outros como default_server.
###############################################################################
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${server_name_directive};

    # ACME challenge (renovação Let's Encrypt via webroot)
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    # Encaminha tudo para o container Docker, que escuta em 127.0.0.1:${APP_PORT}.
    # O container NÃO precisa (e não deve) publicar a porta 80 no host.
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
    }

    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff"    always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
}
NGINX_CONF

    ln -sf "$site_path" /etc/nginx/sites-enabled/app.conf

    if nginx -t; then
        systemctl reload nginx
        log_ok "Nginx configurado e recarregado (server_name: ${server_name_directive})."
    else
        log_error "nginx -t falhou. Revise /etc/nginx/sites-available/app.conf."
        exit 1
    fi

    log_warn "HTTPS (porta 443) não foi configurado por este script."
    log_warn "Após apontar o DNS, rode: certbot --nginx -d ${DOMAIN:-SEU_DOMINIO}"
}

# ─── Etapa 5: firewall UFW ───────────────────────────────────────────────────
configure_firewall() {
    log_step "5/9 Configurando firewall (UFW)"

    ufw --force reset >/dev/null
    ufw default deny incoming
    ufw default allow outgoing

    ufw allow 22/tcp   comment 'SSH'
    ufw allow 80/tcp   comment 'HTTP (Nginx host)'
    ufw allow 443/tcp  comment 'HTTPS (Nginx host)'

    # NÃO abrimos 25/465/587 — SMTP é processado fora da VPS (Supabase + provider).
    ufw --force enable
    ufw status verbose || true
    log_ok "Firewall ativo. Apenas 22, 80 e 443 expostos."
    log_info "SMTP local NÃO foi liberado por design (sem Postfix/Exim/Sendmail)."
}

# ─── Etapa 6: Supabase CLI ───────────────────────────────────────────────────
install_supabase_cli() {
    log_step "6/9 Instalando Supabase CLI"
    if command -v supabase >/dev/null 2>&1; then
        log_ok "Supabase CLI já instalado: $(supabase --version 2>/dev/null || echo 'ok')"
        return
    fi

    local arch
    arch="$(uname -m)"
    local pkg
    case "$arch" in
        x86_64|amd64) pkg="supabase_linux_amd64.deb" ;;
        aarch64|arm64) pkg="supabase_linux_arm64.deb" ;;
        *) log_error "Arquitetura não suportada para Supabase CLI: $arch"; return 1 ;;
    esac

    local tmp="/tmp/${pkg}"
    local url
    url="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
        | grep -Eo "https://[^\"]+${pkg}" | head -n1 || true)"

    if [[ -z "$url" ]]; then
        log_warn "Não consegui descobrir a URL do release. Tentando fallback npm/script."
        if command -v npm >/dev/null 2>&1; then
            npm install -g supabase
        else
            log_error "Instale o Supabase CLI manualmente: https://supabase.com/docs/guides/cli"
            return 1
        fi
    else
        curl -fsSL -o "$tmp" "$url"
        apt-get install -y "$tmp"
        rm -f "$tmp"
    fi

    log_ok "Supabase CLI instalado: $(supabase --version 2>/dev/null || echo 'ok')"
}

# ─── Etapa 7: secrets SMTP no Supabase ───────────────────────────────────────
configure_supabase_secrets() {
    if [[ "$CONFIGURE_SMTP_SECRETS" != "1" ]]; then
        log_step "7/9 Secrets SMTP no Supabase (PULADO)"
        log_info "Para configurar depois, exporte CONFIGURE_SMTP_SECRETS=1 e rode novamente,"
        log_info "ou use manualmente: supabase secrets set CHAVE=valor --project-ref <ref>"
        return
    fi

    log_step "7/9 Configurando secrets SMTP diretamente no Supabase"
    log_warn "As credenciais NÃO serão gravadas em disco. Vão direto para os secrets do projeto."

    if [[ -z "$SUPABASE_PROJECT_REF" && "$NON_INTERACTIVE" != "1" ]]; then
        read -rp "Supabase project ref (ex: abcdefghijklmnop): " SUPABASE_PROJECT_REF
    fi
    if [[ -z "$SUPABASE_PROJECT_REF" ]]; then
        log_error "SUPABASE_PROJECT_REF é obrigatório para configurar secrets."
        return 1
    fi

    if [[ "$NON_INTERACTIVE" != "1" ]]; then
        log_info "Faça login no Supabase CLI (abrirá navegador / pedirá token)."
        supabase login || { log_error "Falha no supabase login."; return 1; }

        : "${SMTP_HOST:=smtp.hostinger.com}"
        read -rp "SMTP_HOST [${SMTP_HOST}]: " _a; SMTP_HOST="${_a:-$SMTP_HOST}"
        : "${SMTP_PORT:=465}"
        read -rp "SMTP_PORT [${SMTP_PORT}]: " _a; SMTP_PORT="${_a:-$SMTP_PORT}"
        read -rp "SMTP_USER (ex: contato@seudominio.com): " SMTP_USER
        read -rsp "SMTP_PASS: " SMTP_PASS; echo
        : "${SMTP_FROM:=$SMTP_USER}"
        read -rp "SMTP_FROM [${SMTP_FROM}]: " _a; SMTP_FROM="${_a:-$SMTP_FROM}"
        : "${SMTP_FROM_NAME:=Loja}"
        read -rp "SMTP_FROM_NAME [${SMTP_FROM_NAME}]: " _a; SMTP_FROM_NAME="${_a:-$SMTP_FROM_NAME}"
        : "${SMTP_SECURE:=true}"
        read -rp "SMTP_SECURE (true/false) [${SMTP_SECURE}]: " _a; SMTP_SECURE="${_a:-$SMTP_SECURE}"
        read -rsp "SUPABASE_SERVICE_ROLE_KEY (cole aqui, não será exibido): " SUPABASE_SERVICE_ROLE_KEY; echo
    fi

    : "${SMTP_HOST:?SMTP_HOST não definido}"
    : "${SMTP_PORT:?SMTP_PORT não definido}"
    : "${SMTP_USER:?SMTP_USER não definido}"
    : "${SMTP_PASS:?SMTP_PASS não definido}"
    : "${SMTP_FROM:?SMTP_FROM não definido}"
    : "${SMTP_FROM_NAME:?SMTP_FROM_NAME não definido}"
    : "${SMTP_SECURE:?SMTP_SECURE não definido}"
    : "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY não definido}"

    supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null

    supabase secrets set \
        "SMTP_HOST=${SMTP_HOST}" \
        "SMTP_PORT=${SMTP_PORT}" \
        "SMTP_USER=${SMTP_USER}" \
        "SMTP_PASS=${SMTP_PASS}" \
        "SMTP_FROM=${SMTP_FROM}" \
        "SMTP_FROM_NAME=${SMTP_FROM_NAME}" \
        "SMTP_SECURE=${SMTP_SECURE}" \
        "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}" \
        --project-ref "$SUPABASE_PROJECT_REF"

    # Limpa as variáveis sensíveis da memória do shell.
    unset SMTP_PASS SUPABASE_SERVICE_ROLE_KEY
    log_ok "Secrets enviados ao Supabase. Nada foi gravado em disco na VPS."
}

# ─── Etapa 8: deploy de Edge Functions ───────────────────────────────────────
deploy_edge_functions() {
    log_step "8/9 Deploy das Edge Functions"

    if [[ ! -d "supabase/functions" ]]; then
        log_warn "Diretório supabase/functions não encontrado no CWD ($(pwd))."
        log_info "Rode este script a partir da raiz do projeto para deploy automático,"
        log_info "ou faça manualmente: supabase functions deploy <nome> --project-ref <ref>"
        return
    fi

    if [[ -z "$SUPABASE_PROJECT_REF" ]]; then
        log_warn "SUPABASE_PROJECT_REF não definido. Pulando deploy automático."
        return
    fi

    supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null || true

    local fn
    for fn in supabase/functions/*/; do
        fn="$(basename "$fn")"
        [[ "$fn" == "_shared" || "$fn" == _* ]] && continue
        log_info "Deploying função: $fn"
        supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" || \
            log_warn "Falha ao fazer deploy de $fn (continuando)."
    done
    log_ok "Deploy concluído."
}

# ─── Etapa 9: instruções finais ──────────────────────────────────────────────
print_summary() {
    log_section "9/9 Concluído — próximos passos"

    cat <<EOF

${C_BOLD}Arquitetura ativa${C_RESET}
  • Nginx do HOST  → escuta nas portas 80/443 (único reverse proxy público)
  • Container app  → deve escutar APENAS em 127.0.0.1:${APP_PORT}
  • SMTP           → 100% no Supabase Edge Functions (sem servidor local)

${C_BOLD}docker-compose.yml — exemplo correto${C_RESET}
  services:
    app:
      build: .
      restart: unless-stopped
      ports:
        - "127.0.0.1:${APP_PORT}:80"   # ✅ NÃO use "80:80"
      # NÃO adicione um serviço nginx aqui — o Nginx do host já é o proxy.

${C_BOLD}Comandos úteis${C_RESET}
  • Subir/atualizar containers (rebuild):
      docker-compose down && docker-compose up -d --build

  • Acompanhar logs:
      docker-compose logs -f

  • Recarregar Nginx do host após mudanças:
      sudo nginx -t && sudo systemctl reload nginx

  • Emitir certificado SSL (após apontar DNS):
      sudo apt-get install -y certbot python3-certbot-nginx
      sudo certbot --nginx -d ${DOMAIN:-SEU_DOMINIO}

${C_BOLD}Validar SMTP via Python (sem instalar Postfix)${C_RESET}
  python3 - <<'PY'
  import smtplib, ssl, os
  host = os.environ["SMTP_HOST"]; port = int(os.environ["SMTP_PORT"])
  user = os.environ["SMTP_USER"]; pwd = os.environ["SMTP_PASS"]
  ctx = ssl.create_default_context()
  with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
      s.login(user, pwd)
      print("SMTP OK:", s.noop())
  PY
  # Defina SMTP_HOST/PORT/USER/PASS apenas na sessão do shell para o teste.
  # NÃO grave essas credenciais em arquivos da VPS.

${C_BOLD}Gerenciar secrets do Supabase (sempre fora da VPS)${C_RESET}
  supabase secrets list --project-ref ${SUPABASE_PROJECT_REF:-<project-ref>}
  supabase secrets set SMTP_PASS=novo_valor --project-ref <project-ref>

${C_BOLD}Checklist anti-conflito${C_RESET}
  [ ] Nenhum container publica a porta 80 do host (só 127.0.0.1:${APP_PORT}).
  [ ] /etc/nginx/sites-enabled/default foi removido.
  [ ] Apenas /etc/nginx/sites-enabled/app.conf usa 'default_server'.
  [ ] UFW expõe somente 22, 80 e 443.
  [ ] Nenhum Postfix/Exim/Sendmail instalado: 'systemctl status postfix' deve falhar.

EOF
    log_ok "Provisionamento finalizado com sucesso."
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
    require_root
    require_debian_family
    prompt_inputs

    update_system
    install_dependencies
    configure_docker
    configure_nginx
    configure_firewall
    install_supabase_cli
    configure_supabase_secrets
    deploy_edge_functions
    print_summary
}

main "$@"