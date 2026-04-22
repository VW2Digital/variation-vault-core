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
#   1) SUPABASE_ACCESS_TOKEN (sbp_...) — Personal Access Token
#                            https://supabase.com/dashboard/account/tokens
#   2) SUPABASE_PROJECT_REF  (ex: ntlfjekvisepsusbcjsv) — extraído da URL
#                            https://supabase.com/dashboard/project/<REF>
#   3) Domínio               (ex: meusite.com)
#   4) E-mail Let's Encrypt
#
# A anon key é buscada automaticamente via Supabase Management API.
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
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
die()  { err "$*"; exit 1; }

# Mascara credenciais para exibição segura no terminal/logs.
# Mostra os primeiros 6 e últimos 4 chars; o miolo vira ****.
# Uso: mask "$SUPABASE_ANON_KEY"
mask() {
    local s="${1:-}"
    local n=${#s}
    if [[ $n -le 12 ]]; then
        printf '****'
    else
        printf '%s****%s' "${s:0:6}" "${s: -4}"
    fi
}

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
if ! command -v openssl >/dev/null 2>&1; then apt-get update -y && apt-get install -y openssl; fi
if ! command -v dig >/dev/null 2>&1; then apt-get update -y && apt-get install -y dnsutils; fi

# ----------------------------- DNS fix (systemd-resolved) -------------------
# Em muitas VPS (Oracle, AWS minimal, etc.) o /etc/resolv.conf aponta apenas
# para 127.0.0.53 (stub do systemd-resolved) sem upstream configurado, fazendo
# com que apt-get falhe em domínios novos como apt.supabase.com / objects.githubusercontent.com.
# Configuramos o resolver com Google + Cloudflare como upstream — sem editar
# /etc/resolv.conf diretamente (que é gerenciado pelo systemd-resolved).
ensure_dns() {
    step "Verificando resolução DNS da VPS"

    local TEST_DOMAINS=(google.com api.supabase.com github.com deb.nodesource.com)
    local DNS_OK=1
    for d in "${TEST_DOMAINS[@]}"; do
        if ! getent hosts "$d" >/dev/null 2>&1; then
            DNS_OK=0
            info "DNS não resolve: $d"
        fi
    done

    if [[ "$DNS_OK" -eq 1 ]]; then
        ok "DNS resolvendo corretamente — nenhuma correção necessária."
        return 0
    fi

    info "DNS quebrado detectado — aplicando configuração via systemd-resolved..."

    if [[ -d /etc/systemd/resolved.conf.d ]] || mkdir -p /etc/systemd/resolved.conf.d; then
        cat > /etc/systemd/resolved.conf.d/99-vps-fallback.conf <<'RESOLVED'
# Adicionado por install.sh — garante upstream DNS público para a VPS.
# Editar/remover este arquivo se você usar DNS interno (VPC, Consul, etc.).
[Resolve]
DNS=8.8.8.8 1.1.1.1
FallbackDNS=8.8.4.4 1.0.0.1
DNSStubListener=yes
RESOLVED
        ok "Escrito /etc/systemd/resolved.conf.d/99-vps-fallback.conf"
    fi

    if systemctl list-unit-files | grep -q '^systemd-resolved'; then
        systemctl restart systemd-resolved 2>/dev/null || true
        ok "systemd-resolved reiniciado"
    else
        # Fallback: sem systemd-resolved, escreve resolv.conf direto
        info "systemd-resolved não disponível — configurando /etc/resolv.conf diretamente."
        # Remove imutabilidade caso esteja setada
        chattr -i /etc/resolv.conf 2>/dev/null || true
        cat > /etc/resolv.conf <<'RESOLV'
# Gerado por install.sh — fallback sem systemd-resolved
nameserver 8.8.8.8
nameserver 1.1.1.1
nameserver 8.8.4.4
RESOLV
    fi

    # Re-testa
    sleep 2
    local STILL_BROKEN=()
    for d in "${TEST_DOMAINS[@]}"; do
        if ! getent hosts "$d" >/dev/null 2>&1; then
            STILL_BROKEN+=("$d")
        fi
    done

    if [[ ${#STILL_BROKEN[@]} -gt 0 ]]; then
        err "DNS continua quebrado após correção. Domínios irresolúveis:"
        printf '    - %s\n' "${STILL_BROKEN[@]}"
        err "Sem DNS funcional, não é possível instalar pacotes (apt) nem deployar Edge Functions."
        err "Diagnóstico:"
        err "  cat /etc/resolv.conf"
        err "  resolvectl status   (ou: systemd-resolve --status)"
        err "  ping -c1 8.8.8.8     (testa rede; se falhar, é firewall/rota da VPS)"
        err "  ping -c1 google.com  (testa DNS)"
        err "Verifique também o firewall do provedor (Oracle/AWS) liberando UDP 53 outbound."
        exit 1
    fi
    ok "DNS funcional após correção: ${TEST_DOMAINS[*]}"
}
ensure_dns

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

# 2) Personal Access Token + Project Ref
echo
echo "Configuração do Supabase via Personal Access Token."
echo "Crie um token em: https://supabase.com/dashboard/account/tokens"
echo "Pegue o project ref na URL: https://supabase.com/dashboard/project/<REF>"
echo
echo "Cole o SUPABASE_ACCESS_TOKEN (sbp_...). A entrada fica oculta."
read -rsp "SUPABASE_ACCESS_TOKEN: " SUPABASE_ACCESS_TOKEN
echo
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] || [[ ! "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_ ]]; then
    err "Access token inválido — deve começar com 'sbp_'."
    exit 1
fi

read -rp "SUPABASE_PROJECT_REF (ex: ntlfjekvisepsusbcjsv): " SUPABASE_PROJECT_REF
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF##*/}"  # tolera URL completa colada
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF%%\?*}"
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    err "Project ref inválido — esperado 20 caracteres minúsculos/dígitos (ex: ntlfjekvisepsusbcjsv)."
    exit 1
fi
SUPABASE_URL_INPUT="https://${SUPABASE_PROJECT_REF}.supabase.co"

info "Buscando anon key via Supabase Management API..."
API_RESP="$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true" || true)"
API_BODY="$(echo "$API_RESP" | sed '$d')"
API_CODE="$(echo "$API_RESP" | tail -n1)"

if [[ "$API_CODE" != "200" ]]; then
    err "Management API retornou HTTP $API_CODE."
    err "Resposta: $API_BODY"
    err "Verifique se o token é válido e tem acesso ao projeto $SUPABASE_PROJECT_REF."
    exit 1
fi

SUPABASE_ANON_KEY="$(echo "$API_BODY" | jq -r '.[] | select(.name=="anon") | .api_key')"
if [[ -z "$SUPABASE_ANON_KEY" || "$SUPABASE_ANON_KEY" == "null" ]]; then
    err "Anon key não encontrada na resposta da API."
    err "Resposta: $API_BODY"
    exit 1
fi
ok "Anon key obtida automaticamente para o projeto $SUPABASE_PROJECT_REF  ($(mask "$SUPABASE_ANON_KEY"))"

###############################################################################
# VALIDAÇÃO OUTBOUND: DNS + HTTPS + Edge Functions
# -----------------------------------------------------------------------------
# Diagnostica a causa-raiz de 502 Bad Gateway no proxy /api/* ANTES de
# prosseguir. Sem essas validações, o instalador conclui "com sucesso" mas o
# Nginx não consegue alcançar o Supabase em runtime.
#
# Cenários cobertos:
#   1) DNS outbound → resolver PROJECT_REF.supabase.co
#   2) HTTPS outbound (porta 443) → conectar de fato ao Supabase
#   3) Project ref correto → endpoint /functions/v1/ responde
#   4) Edge Function existe → testa /functions/v1/healthz se possível
###############################################################################
validate_supabase_outbound() {
    local supa_host="${SUPABASE_PROJECT_REF}.supabase.co"
    local supa_url="https://${supa_host}"
    step "Validando alcance outbound ao Supabase ($supa_host)"

    # 1) DNS específico do projeto
    if ! getent hosts "$supa_host" >/dev/null 2>&1; then
        err "DNS NÃO resolve $supa_host"
        err "Causa provável: project ref incorreto OU DNS outbound bloqueado."
        err "  Teste:  nslookup $supa_host"
        err "  Confira o ref em https://supabase.com/dashboard/project/<REF>"
        exit 1
    fi
    ok "[1/4] DNS resolve $supa_host"

    # 2) HTTPS outbound (porta 443) — TLS handshake
    local tls_code
    tls_code="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 10 --connect-timeout 5 \
        "$supa_url" 2>/dev/null || echo "000")"
    case "$tls_code" in
        000)
            err "HTTPS outbound BLOQUEADO — sem resposta de $supa_url em 10s"
            err "Causa provável: firewall outbound (UFW/cloud provider) bloqueia TCP 443"
            err "  Teste:  curl -v --max-time 10 $supa_url"
            err "          nc -zv $supa_host 443"
            err "  Oracle/AWS/GCP: libere TCP 443 outbound nas Security Lists/Groups"
            exit 1
            ;;
        2*|3*|4*|5*)
            ok "[2/4] HTTPS outbound OK ($supa_url → HTTP $tls_code)"
            ;;
    esac

    # 3) Project ref correto — REST endpoint anônimo deve responder com 200/401
    local rest_code
    rest_code="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 10 \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        "${supa_url}/rest/v1/" 2>/dev/null || echo "000")"
    case "$rest_code" in
        200|401|404)
            ok "[3/4] Project ref VÁLIDO ($supa_url/rest/v1/ → HTTP $rest_code)"
            ;;
        000)
            err "REST endpoint timeout — outbound HTTPS instável"
            exit 1
            ;;
        *)
            err "REST endpoint retornou HTTP $rest_code — project ref pode estar incorreto"
            err "  Teste manual: curl -i -H 'apikey: $(mask "$SUPABASE_ANON_KEY")' ${supa_url}/rest/v1/"
            exit 1
            ;;
    esac

    # 4) Edge Functions runtime acessível — endpoint canônico /functions/v1/
    # Espera 401/404 (sem função informada) — qualquer 2xx/4xx prova que o
    # runtime de functions está LIVE no projeto. 5xx/timeout = problema real.
    local fn_code
    fn_code="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 10 \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
        "${supa_url}/functions/v1/" 2>/dev/null || echo "000")"
    case "$fn_code" in
        2*|401|403|404|405)
            ok "[4/4] Runtime de Edge Functions LIVE (${supa_url}/functions/v1/ → HTTP $fn_code)"
            ;;
        502|503|504)
            err "Runtime de Edge Functions com falha (HTTP $fn_code) — projeto pode estar pausado"
            err "  Verifique: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}"
            exit 1
            ;;
        000)
            err "Runtime de Edge Functions timeout — outbound HTTPS bloqueado para *.supabase.co/functions/*"
            err "  Alguns firewalls inspecionam SNI e bloqueiam subpaths — libere completamente $supa_host:443"
            exit 1
            ;;
        *)
            info "Runtime retornou HTTP $fn_code — pode estar OK, prosseguindo."
            ;;
    esac

    ok "Outbound para Supabase 100% validado — proxy /api/* terá upstream alcançável."
}
validate_supabase_outbound

# Service role key — opt-in. Apenas com confirmação explícita do usuário, pois
# concede acesso administrativo total ao banco (bypass de RLS).
SUPABASE_SERVICE_ROLE_KEY=""
echo
echo "⚠️  SERVICE ROLE KEY concede acesso ADMIN total (bypass de RLS)."
echo "    Use apenas se a app/integrações dependerem dela (ex.: cron jobs, scripts server-side)."
echo "    Será gravada em $APP_DIR/.env (chmod 600) e nunca impressa em logs."
read -rp "Buscar SUPABASE_SERVICE_ROLE_KEY automaticamente? [s/N]: " WANT_SR
if [[ "${WANT_SR,,}" == "s" || "${WANT_SR,,}" == "y" ]]; then
    SR_KEY="$(echo "$API_BODY" | jq -r '.[] | select(.name=="service_role") | .api_key')"
    if [[ -z "$SR_KEY" || "$SR_KEY" == "null" ]]; then
        err "service_role key não retornada pela API. Token tem permissão suficiente?"
        err "Pulando — você pode adicionar manualmente em $APP_DIR/.env depois."
    else
        SUPABASE_SERVICE_ROLE_KEY="$SR_KEY"
        ok "Service role key obtida  ($(mask "$SUPABASE_SERVICE_ROLE_KEY"))  — NUNCA será exibida na íntegra."
    fi
else
    info "Service role key NÃO será buscada (recomendado para produção pública)."
fi

# Limpa o body da Management API da memória — contém keys sensíveis em texto puro
API_BODY=""
API_RESP=""

# 4) Domínio + e-mail (perguntados aqui pra ficar tudo no início)
echo
read -rp "Domínio [${DOMAIN_DEFAULT}]: " DOMAIN
DOMAIN="${DOMAIN:-$DOMAIN_DEFAULT}"
read -rp "E-mail para alertas do Let's Encrypt [${EMAIL_DEFAULT}]: " EMAIL
EMAIL="${EMAIL:-$EMAIL_DEFAULT}"

# 4.1) Subdomínio público para API/Webhooks (proxy reverso → Supabase / app)
echo
echo "Subdomínio público para webhooks/API (Supabase, n8n, Stripe, Meta, etc.)."
echo "Cria um vhost Nginx separado escutando em https://api.<seu_dominio>/api/*"
echo "que faz proxy para as Edge Functions do Supabase + webhooks dos gateways."
API_SUBDOMAIN_DEFAULT="api.${DOMAIN}"
read -rp "Subdomínio de API/Webhooks [${API_SUBDOMAIN_DEFAULT}] (vazio para pular): " API_SUBDOMAIN
API_SUBDOMAIN="${API_SUBDOMAIN-$API_SUBDOMAIN_DEFAULT}"
if [[ -n "$API_SUBDOMAIN" ]]; then
    info "Subdomínio de API: $API_SUBDOMAIN — DNS deve ter um A apontando para este IP."
else
    info "Subdomínio de API pulado — webhooks ficarão acessíveis em https://${DOMAIN}/<webhook>."
fi

# 4.2) Webhook secret (compartilhado com integrações n8n/Meta/Stripe/etc.)
echo
read -rp "WEBHOOK_SECRET (deixe vazio para gerar automaticamente): " WEBHOOK_SECRET
if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
    # Alta entropia: 32 bytes random → 64 chars hex
    if command -v openssl >/dev/null 2>&1; then
        WEBHOOK_SECRET="$(openssl rand -hex 32)"
    else
        WEBHOOK_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64)"
    fi
    info "WEBHOOK_SECRET gerado automaticamente (64 chars hex)  ($(mask "$WEBHOOK_SECRET"))"
fi

# 5) Modo SSL — staging (teste) ou produção (real)
echo
echo "Modo de emissão do certificado SSL:"
echo "  1) Produção (padrão)  — certificado real, confiável pelo navegador."
echo "                          Conta no rate limit do Let's Encrypt (5/semana por domínio)."
echo "  2) Staging  (teste)   — certificado de TESTE, navegador exibirá aviso de segurança."
echo "                          NÃO conta no rate limit. Use para validar a config (Nginx/DNS/portas)"
echo "                          quando você bateu o limite ou está testando um deploy novo."
read -rp "Escolha [1=produção / 2=staging] (padrão: 1): " SSL_MODE_CHOICE
SSL_MODE_CHOICE="${SSL_MODE_CHOICE:-1}"
if [[ "$SSL_MODE_CHOICE" == "2" ]]; then
    SSL_STAGING=1
    info "Modo STAGING selecionado — certificado de teste, sem consumir rate limit."
else
    SSL_STAGING=0
    info "Modo PRODUÇÃO selecionado — certificado real do Let's Encrypt."
fi

# 6) Deploy automático das Supabase Edge Functions
echo
echo "Deploy automático das Supabase Edge Functions deste repositório?"
echo "  • Instala a Supabase CLI (npm i -g supabase) se necessário."
echo "  • Linka o projeto $SUPABASE_PROJECT_REF usando o seu access token."
echo "  • Roda 'supabase functions deploy <nome>' para cada função em supabase/functions/."
echo "  • Valida com 'supabase functions list' e faz healthcheck HTTP em cada uma."
echo "  Recomendado para webhooks externos (n8n, Stripe, Meta, gateways) funcionarem."
read -rp "Deployar Edge Functions automaticamente? [S/n]: " WANT_FN_DEPLOY
WANT_FN_DEPLOY="${WANT_FN_DEPLOY:-s}"
if [[ "${WANT_FN_DEPLOY,,}" == "s" || "${WANT_FN_DEPLOY,,}" == "y" ]]; then
    DEPLOY_EDGE_FUNCTIONS=1
    info "Edge Functions serão deployadas automaticamente após o build."
else
    DEPLOY_EDGE_FUNCTIONS=0
    info "Deploy de Edge Functions PULADO — webhooks via /api/* podem retornar 404 até você rodar 'supabase functions deploy' manualmente."
fi

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
ENV_PROD_FILE="$APP_DIR/.env.production"
info "Gravando credenciais Supabase em $ENV_FILE (usadas no build do Vite)..."
# Apenas variáveis com prefixo VITE_* entram no bundle do frontend.
# As demais (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_SECRET) ficam
# disponíveis para edge functions / scripts server-side que rodem nesta VPS.
API_PUBLIC_URL=""
if [[ -n "$API_SUBDOMAIN" ]]; then
    API_PUBLIC_URL="https://${API_SUBDOMAIN}"
fi
cat > "$ENV_FILE" <<ENV
VITE_SUPABASE_URL=${SUPABASE_URL_INPUT}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY}
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_REF}
SUPABASE_PROXY_HOST=${SUPABASE_PROJECT_REF}.supabase.co
SUPABASE_FUNCTIONS_BASE_URL=${SUPABASE_URL_INPUT}/functions/v1
# Compatibilidade com integrações externas (n8n, Stripe, Meta, etc.)
SUPABASE_URL=${SUPABASE_URL_INPUT}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
# Compat. Next.js / frameworks que usam prefixo NEXT_PUBLIC_*
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL_INPUT}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
NEXT_PUBLIC_API_URL=${API_PUBLIC_URL}
PUBLIC_API_BASE_URL=${API_PUBLIC_URL:+${API_PUBLIC_URL}/api}
ENV
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
# .env.production é uma cópia idêntica usada por build tools (Vite/Next) que
# carregam variáveis específicas em modo produção. Mesmas permissões.
cp "$ENV_FILE" "$ENV_PROD_FILE"
chmod 600 "$ENV_PROD_FILE"
chown root:root "$ENV_PROD_FILE"
ok "Credenciais gravadas em $ENV_FILE e $ENV_PROD_FILE (apontando para $SUPABASE_URL_INPUT)"

# ---------- Validação das variáveis de ambiente exigidas ----------
info "Validando variáveis de ambiente em $ENV_FILE..."
REQUIRED_ENV=(VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_URL SUPABASE_ANON_KEY WEBHOOK_SECRET)
ENV_MISSING=0
for v in "${REQUIRED_ENV[@]}"; do
    val="$(grep -E "^${v}=" "$ENV_FILE" | cut -d= -f2- || true)"
    if [[ -z "${val// /}" ]]; then
        err "[env] Variável obrigatória ausente ou vazia: $v"
        ENV_MISSING=1
    else
        ok "[env] $v presente"
    fi
done
if [[ -z "${API_SUBDOMAIN}" ]]; then
    info "[env] NEXT_PUBLIC_API_URL não setado (subdomínio de API foi pulado)."
fi
if [[ "$ENV_MISSING" -eq 1 ]]; then
    err "Corrija $ENV_FILE antes de prosseguir — webhooks podem falhar."
    exit 1
fi

# Build
cd "$APP_DIR"
info "Instalando dependências (npm install)..."
npm install --no-audit --no-fund

# Limpa dist/ e cache do Vite para garantir bundle 100% derivado do .env atual.
info "Limpando dist/ e cache do Vite (garante bundle limpo)..."
rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules/.vite" 2>/dev/null || true

info "Buildando aplicação (npm run build)..."
npm run build

if [[ ! -d "$APP_DIR/dist" ]]; then
    err "Build não gerou a pasta dist/. Verifique os logs do npm acima."
    exit 1
fi
ok "Build concluído em $APP_DIR/dist"

# Configurar Nginx (SPA + cache de assets) — server_name ajustado abaixo
info "Configurando Nginx para servir SPA estática..."

# ---------- Limpeza de vhosts conflitantes ANTES de gravar a nova config ----
# Causa raiz comum de webhooks/healthz instáveis em VPS com várias instalações:
# múltiplos arquivos em /etc/nginx/sites-enabled/ declaram o mesmo server_name
# (DOMAIN ou API_SUBDOMAIN), o Nginx loga "conflicting server name ... ignored"
# e mantém apenas o primeiro encontrado — que pode ser um vhost antigo sem as
# rotas /api/*. Resultado: /api/healthz responde 404 às vezes, webhook falha,
# root retorna 404. Aqui detectamos e desativamos qualquer vhost duplicado.
cleanup_conflicting_vhosts() {
    local target="$1"
    [[ -z "$target" ]] && return 0
    local sites_enabled=/etc/nginx/sites-enabled
    local sites_available=/etc/nginx/sites-available
    local conf_d=/etc/nginx/conf.d
    local keep_basenames=("app" "api" "00-default-deny")
    local removed=0

    info "[nginx] Procurando vhosts duplicados para server_name '$target'..."
    # 1) sites-enabled/*  (inclui o default que vem do pacote nginx)
    if [[ -d "$sites_enabled" ]]; then
        while IFS= read -r f; do
            [[ -z "$f" ]] && continue
            local base
            base="$(basename "$f")"
            local skip=0
            for keep in "${keep_basenames[@]}"; do
                [[ "$base" == "$keep" ]] && skip=1 && break
            done
            [[ $skip -eq 1 ]] && continue
            warn "  Removendo vhost conflitante: $f"
            rm -f "$f"
            removed=$((removed+1))
        done < <(grep -lE "server_name[[:space:]]+[^;]*\\b${target//./\\.}\\b" "$sites_enabled"/* 2>/dev/null || true)
    fi
    # 2) conf.d/*.conf  (vhosts soltos de instalações antigas / Lovable / certbot)
    if [[ -d "$conf_d" ]]; then
        while IFS= read -r f; do
            [[ -z "$f" ]] && continue
            warn "  Desativando vhost em conf.d: $f → $f.disabled"
            mv -f "$f" "$f.disabled"
            removed=$((removed+1))
        done < <(grep -lE "server_name[[:space:]]+[^;]*\\b${target//./\\.}\\b" "$conf_d"/*.conf 2>/dev/null || true)
    fi
    # 3) Remove o symlink "default" do pacote nginx (sempre)
    if [[ -L "$sites_enabled/default" ]]; then
        warn "  Removendo $sites_enabled/default (vhost padrão do pacote)"
        rm -f "$sites_enabled/default"
        removed=$((removed+1))
    fi
    if [[ $removed -gt 0 ]]; then
        ok "[nginx] $removed vhost(s) conflitante(s) removido(s) para '$target'"
    else
        info "[nginx] Nenhum vhost conflitante encontrado para '$target'"
    fi
}

cleanup_conflicting_vhosts "$DOMAIN"
if [[ -n "${API_SUBDOMAIN:-}" ]]; then
    cleanup_conflicting_vhosts "$API_SUBDOMAIN"
fi

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

    # Proxy de webhooks → Edge Functions do Supabase configurado.
    # Permite que gateways (Melhor Envio, Asaas, MP, PagBank, Pagar.me)
    # postem em https://${DOMAIN}/<webhook> sem precisar saber a URL do Supabase.
    location ~ ^/(melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook)(/.*)?\$ {
        proxy_pass ${SUPABASE_URL_INPUT}/functions/v1/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
    }

    # ─────────────────────────────────────────────────────────────────────────
    # SPA FALLBACK (React Router / Vite)
    # CRÍTICO para OAuth2 (Melhor Envio, etc.): o callback retorna para
    #   https://${DOMAIN}/admin/configuracoes/logistica?code=...
    # Sem fallback, o Nginx procura o arquivo físico
    #   /var/www/app/dist/admin/configuracoes/logistica
    # e retorna 404 — quebrando OAuth2, refresh de página e deep links.
    #
    # try_files preserva automaticamente a query string (?code=...&state=...).
    # ─────────────────────────────────────────────────────────────────────────

    # Match exato: webhook do Melhor Envio cadastrado como a URL da página de
    # configuração. GET serve a SPA (OAuth callback); POST → edge function.
    # Resolve E-WBH-0002 (405) ao usar a URL da página como callback.
    location = /admin/configuracoes/logistica {
        if (\$request_method = POST) {
            rewrite ^ /melhor-envio-webhook last;
        }
        try_files \$uri /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Fallback explícito para TODAS as rotas /admin/* (deep links, OAuth, refresh)
    location ^~ /admin/ {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Fallback SPA genérico — última linha de defesa para qualquer rota React
    location / {
        # POST na raiz → webhook do Melhor Envio (resolve E-WBH-0002 / 405
        # quando a URL cadastrada no painel do ME é apenas https://${DOMAIN}/).
        if (\$request_method = POST) {
            rewrite ^ /melhor-envio-webhook last;
        }
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

# ---------- Catch-all default_server (rejeita Host headers desconhecidos) ----
# Sem isso, qualquer requisição com Host arbitrário (ex.: scanner) cai no
# primeiro vhost e pode acabar em endpoint errado. 444 = close sem resposta.
info "Configurando default_server catch-all (rejeita Hosts desconhecidos)..."
cat > /etc/nginx/sites-available/00-default-deny <<'NGINX_DEFAULT'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    # Healthcheck público para load balancers / uptime checks
    location = /healthz { return 200 "ok\n"; add_header Content-Type text/plain; }
    # Tudo o mais: drop silencioso
    location / { return 444; }
}
NGINX_DEFAULT
ln -sf /etc/nginx/sites-available/00-default-deny /etc/nginx/sites-enabled/00-default-deny

# ---------- Vhost dedicado para subdomínio de API/Webhooks ----------
if [[ -n "$API_SUBDOMAIN" ]]; then
    info "Configurando vhost dedicado para webhooks/API em $API_SUBDOMAIN..."
    cat > /etc/nginx/sites-available/api <<NGINX_API
# Reverse proxy público para webhooks externos (Supabase, n8n, Stripe, Meta, etc.)
# Endpoint canônico: https://${API_SUBDOMAIN}/api/<destino>
server {
    listen 80;
    listen [::]:80;
    server_name ${API_SUBDOMAIN};

    # Healthcheck do gateway de webhooks
    location = /api/healthz {
        access_log off;
        add_header Content-Type text/plain;
        add_header Cache-Control "no-store";
        return 200 "ok\n";
    }

    # CORS preflight global para integrações externas (n8n, navegadores, etc.)
    # Necessário para evitar 405/CORS em chamadas OPTIONS antes do POST real.
    location = /api/_cors_preflight {
        return 204;
    }

    # /api/<algo>  →  Edge Function homônima no Supabase
    # Ex.: /api/mercadopago-webhook → ${SUPABASE_URL_INPUT}/functions/v1/mercadopago-webhook
    location ~ ^/api/(.+)\$ {
        # Responde preflight CORS imediatamente (algumas Edge Functions não tratam OPTIONS)
        if (\$request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-signature, stripe-signature";
            add_header Access-Control-Max-Age 86400;
            add_header Content-Length 0;
            return 204;
        }
        proxy_pass ${SUPABASE_URL_INPUT}/functions/v1/\$1\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Webhook-Source external;
        # Repassa qualquer Authorization / x-signature dos serviços externos
        proxy_pass_request_headers on;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
        client_max_body_size 10m;
    }

    # Atalhos para webhooks dos gateways (mesmo padrão do vhost principal)
    location ~ ^/(melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook)(/.*)?\$ {
        proxy_pass ${SUPABASE_URL_INPUT}/functions/v1/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_PROJECT_REF}.supabase.co;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
        client_max_body_size 10m;
    }

    # Bloqueia tudo o que não for /api/* nem webhook conhecido
    location / {
        return 404 "API endpoint não encontrado. Use /api/<rota>.\n";
        add_header Content-Type text/plain;
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX_API
    ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
    nginx -t
    systemctl reload nginx
    ok "Vhost de API ativo: http://${API_SUBDOMAIN}/api/<rota>  (HTTPS após Certbot)"

    # ---------- Verificação anti-conflito ----------
    # Mesmo após cleanup, revalida que `nginx -T` não emite "conflicting server
    # name" para o subdomínio de API. Se emitir, é sinal de que algum include
    # exótico (snippets, /etc/nginx/nginx.conf custom) ainda referencia o host.
    NGINX_DUMP="$(nginx -T 2>&1 || true)"
    if echo "$NGINX_DUMP" | grep -qiE "conflicting server name.*${API_SUBDOMAIN//./\\.}"; then
        warn "[nginx] AVISO: Nginx ainda reporta 'conflicting server name' para $API_SUBDOMAIN"
        warn "        Isso causa /api/healthz e /api/webhook intermitentes."
        warn "        Arquivos suspeitos:"
        grep -RIlE "server_name[[:space:]]+[^;]*\\b${API_SUBDOMAIN//./\\.}\\b" /etc/nginx 2>/dev/null \
            | sed 's/^/          • /' || true
        warn "        Remova/edite manualmente os arquivos acima e rode: sudo nginx -t && sudo systemctl reload nginx"
    else
        ok "[nginx] Sem conflitos de server_name para $API_SUBDOMAIN"
    fi

    # Smoke test local (loopback + Host header) — não depende de DNS/SSL prontos
    HZ_LOCAL="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${API_SUBDOMAIN}" http://127.0.0.1/api/healthz || echo 000)"
    if [[ "$HZ_LOCAL" == "200" ]]; then
        ok "[nginx] /api/healthz responde 200 localmente (Host: ${API_SUBDOMAIN})"
    else
        warn "[nginx] /api/healthz retornou HTTP $HZ_LOCAL via loopback — vhost de API pode estar sendo ofuscado"
        warn "        Liste vhosts ativos para o host:  sudo nginx -T | grep -nE 'server_name|listen' | less"
    fi
fi

# ---------- Smoke test OAuth callback (Melhor Envio + qualquer OAuth2) ----------
# OAuth2 do Melhor Envio usa a SPA como redirect_uri:
#   https://${DOMAIN}/admin/configuracoes/logistica?code=...
# Se o Nginx retornar 404 nessa rota OU não preservar a query string ?code=...
# o OAuth quebra silenciosamente. Validamos os 3 cenários críticos.
info "[oauth] Smoke test do callback OAuth2 (rota SPA com ?code=...)"
OAUTH_PATH="/admin/configuracoes/logistica"
OAUTH_CODE_TEST="?code=smoke_test_$(date +%s)&state=test"
OAUTH_RESP="$(curl -s -o /tmp/oauth_smoke.html -w '%{http_code}' \
    -H "Host: ${DOMAIN}" \
    "http://127.0.0.1${OAUTH_PATH}${OAUTH_CODE_TEST}" || echo 000)"
if [[ "$OAUTH_RESP" == "200" ]] && grep -qi '<div id="root"\|<title>' /tmp/oauth_smoke.html 2>/dev/null; then
    ok "[oauth] GET ${OAUTH_PATH}?code=... → 200 (SPA carrega para processar o code)"
else
    err "[oauth] GET ${OAUTH_PATH}?code=... retornou HTTP $OAUTH_RESP — OAuth2 do Melhor Envio NÃO funcionará"
    err "        Causa provável: vhost de ${DOMAIN} sem fallback SPA (try_files \$uri /index.html)"
    err "        Nginx está procurando o arquivo físico /var/www/app/dist${OAUTH_PATH}"
    err "        e retornando 404 porque ele não existe (rota é resolvida pelo React Router)."
    err "        Esperado: Nginx deve servir /index.html preservando ?code=..."
    err "        Inspecione: sudo nginx -T | grep -A20 'server_name ${DOMAIN}'"
    err "        Verifique:  sudo tail -n 20 /var/log/nginx/error.log"
fi

# Smoke test extra: deep links genéricos do admin (refresh de qualquer rota)
for DEEP in "/admin/pedidos" "/admin/configuracoes/pagamento" "/minha-conta"; do
    DEEP_RESP="$(curl -s -o /tmp/deep_smoke.html -w '%{http_code}' \
        -H "Host: ${DOMAIN}" "http://127.0.0.1${DEEP}" || echo 000)"
    if [[ "$DEEP_RESP" == "200" ]] && grep -qi '<div id="root"\|<title>' /tmp/deep_smoke.html 2>/dev/null; then
        ok "[spa] GET ${DEEP} → 200 (SPA fallback OK)"
    else
        err "[spa] GET ${DEEP} retornou HTTP $DEEP_RESP — refresh nessa rota dará 404 no browser"
        err "      try_files ausente ou root incorreto no vhost de ${DOMAIN}"
    fi
done
rm -f /tmp/deep_smoke.html

# Garante também que POST na mesma rota é roteado para webhook (não SPA)
OAUTH_POST="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Host: ${DOMAIN}" \
    -H "Content-Type: application/json" \
    --data '{"smoke":"test"}' \
    "http://127.0.0.1${OAUTH_PATH}" || echo 000)"
case "$OAUTH_POST" in
    2*|400|401|403|404)
        ok "[oauth] POST ${OAUTH_PATH} → HTTP $OAUTH_POST (rotaeado para edge function)"
        ;;
    502|504)
        err "[oauth] POST ${OAUTH_PATH} → HTTP $OAUTH_POST — proxy NÃO alcança Supabase"
        err "        Webhook do Melhor Envio falhará. Veja seção '502/504' no troubleshooting."
        ;;
    *)
        warn "[oauth] POST ${OAUTH_PATH} → HTTP $OAUTH_POST (verifique manualmente)"
        ;;
esac
rm -f /tmp/oauth_smoke.html

# ---------- Firewall (UFW) — libera 80/443 para webhooks externos ----------
if command -v ufw >/dev/null 2>&1; then
    info "Configurando firewall (UFW) — liberando 22, 80 e 443..."
    ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 80/tcp  >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    UFW_STATUS="$(ufw status | head -n1 || true)"
    if [[ "$UFW_STATUS" != *"active"* ]]; then
        info "UFW está inativo — não vamos forçar enable para evitar derrubar a sessão SSH."
        info "Para ativar manualmente depois: sudo ufw enable"
    else
        ok "Firewall UFW: 80/443 liberados"
    fi
else
    info "UFW não instalado — pulando configuração de firewall."
    info "Se sua VPS usar outro firewall (cloud provider, iptables), libere TCP 80 e 443."
fi

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

# Detecta URLs hardcoded de outros project refs (resíduos no código).
OTHER_REFS_BUILD="$(grep -rhoE '[a-z0-9]{20}\.supabase\.co' "$APP_DIR/dist/assets/" 2>/dev/null \
    | sort -u | grep -v "^${SUPABASE_PROJECT_REF}\." || true)"
if [[ -n "$OTHER_REFS_BUILD" ]]; then
    err "[verify] Bundle contém URLs de outros projetos Supabase (hardcoded no código):"
    echo "$OTHER_REFS_BUILD" | sed 's/^/    - /'
    err "[verify] Webhooks/queries podem apontar para o lugar errado. Localize com:"
    err "         grep -rE '[a-z0-9]{20}\\.supabase\\.co' $APP_DIR/src/"
    VERIFY_FAIL=1
else
    ok "[verify] Nenhum resíduo de outro project ref no bundle"
fi

HEALTH_HTTP="$(curl -sS -o /tmp/healthz.out -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1/healthz || echo "000")"
if [[ "$HEALTH_HTTP" == "200" ]] && grep -q '^ok' /tmp/healthz.out; then
    ok "[verify] Nginx /healthz respondendo 200"
else
    # Não bloqueia o deploy: /healthz é apenas conveniência de monitoramento.
    # Pode falhar se outro vhost (ex.: SSL pré-existente) capturar a porta 80
    # como default_server. Reportamos como aviso, sem marcar VERIFY_FAIL.
    info "[verify] /healthz retornou HTTP $HEALTH_HTTP — provavelmente outro vhost responde antes. Build segue válido."
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
# STEP 1.5 — Deploy real das Supabase Edge Functions (opcional)
###############################################################################
DEPLOYED_FUNCTIONS=()
FAILED_FUNCTIONS=()
if [[ "${DEPLOY_EDGE_FUNCTIONS:-0}" -eq 1 ]]; then
    step "STEP 1.5 — Deploy das Supabase Edge Functions"

    # 1) Garante a Supabase CLI instalada — método oficial (binário do GitHub).
    # IMPORTANTE: 'npm install -g supabase' NÃO é mais suportado oficialmente
    # (https://github.com/supabase/cli/issues/1528). Usamos o tarball release
    # do GitHub, que funciona em qualquer VPS Linux x86_64 sem dependências.
    install_supabase_cli() {
        local ARCH
        case "$(uname -m)" in
            x86_64|amd64) ARCH="amd64" ;;
            aarch64|arm64) ARCH="arm64" ;;
            *)
                err "Arquitetura $(uname -m) não suportada pela Supabase CLI."
                return 1
                ;;
        esac

        info "Buscando última release da Supabase CLI no GitHub..."
        local LATEST_TAG
        LATEST_TAG="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
            | jq -r '.tag_name' 2>/dev/null || echo "")"
        if [[ -z "$LATEST_TAG" || "$LATEST_TAG" == "null" ]]; then
            err "Não foi possível obter a última release (api.github.com inacessível?)."
            return 1
        fi
        local VERSION="${LATEST_TAG#v}"
        local URL="https://github.com/supabase/cli/releases/download/${LATEST_TAG}/supabase_linux_${ARCH}.tar.gz"
        info "Baixando $URL..."
        if ! curl -fsSL "$URL" -o /tmp/supabase-cli.tgz; then
            err "Falha ao baixar $URL — verifique DNS e acesso a github.com."
            return 1
        fi
        tar -xzf /tmp/supabase-cli.tgz -C /usr/local/bin/ supabase
        chmod +x /usr/local/bin/supabase
        rm -f /tmp/supabase-cli.tgz
        return 0
    }

    NEED_INSTALL=1
    if command -v supabase >/dev/null 2>&1; then
        # Detecta CLI npm-quebrada (algumas versões via npm crasham com "command not found" interno)
        if supabase --version >/dev/null 2>&1; then
            NEED_INSTALL=0
        else
            info "Supabase CLI presente mas quebrada — reinstalando via binário oficial."
            rm -f "$(command -v supabase)" 2>/dev/null || true
        fi
    fi

    if [[ "$NEED_INSTALL" -eq 1 ]]; then
        info "Instalando Supabase CLI (binário oficial GitHub)..."
        if ! install_supabase_cli; then
            err "Supabase CLI não pôde ser instalada — pulando deploy de Edge Functions."
            err "Instale manualmente depois:"
            err "  curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz -C /usr/local/bin/"
            DEPLOY_EDGE_FUNCTIONS=0
        fi
    fi

    if command -v supabase >/dev/null 2>&1 && supabase --version >/dev/null 2>&1; then
        ok "Supabase CLI: $(supabase --version)"
    elif [[ "${DEPLOY_EDGE_FUNCTIONS:-0}" -eq 1 ]]; then
        err "Supabase CLI ainda não funcional — desativando deploy."
        DEPLOY_EDGE_FUNCTIONS=0
    fi
fi

if [[ "${DEPLOY_EDGE_FUNCTIONS:-0}" -eq 1 ]]; then
    # 2) Linka o projeto usando o access token já validado
    export SUPABASE_ACCESS_TOKEN
    info "Linkando projeto $SUPABASE_PROJECT_REF (cwd=$APP_DIR)..."
    cd "$APP_DIR"
    if ! supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null 2>&1; then
        err "Falha ao linkar projeto via 'supabase link'. Verifique o access token."
        DEPLOY_EDGE_FUNCTIONS=0
    else
        ok "Projeto linkado: $SUPABASE_PROJECT_REF"
    fi
fi

if [[ "${DEPLOY_EDGE_FUNCTIONS:-0}" -eq 1 ]]; then
    # 3) Descobre todas as funções no diretório (excluindo arquivos compartilhados como _shared)
    FN_DIR="$APP_DIR/supabase/functions"
    if [[ ! -d "$FN_DIR" ]]; then
        err "Diretório $FN_DIR não existe — nenhuma Edge Function para deployar."
    else
        mapfile -t ALL_FNS < <(find "$FN_DIR" -mindepth 1 -maxdepth 1 -type d \
            -not -name '_*' -printf '%f\n' | sort)
        info "Encontradas ${#ALL_FNS[@]} Edge Functions para deploy:"
        printf '  - %s\n' "${ALL_FNS[@]}"

        for FN in "${ALL_FNS[@]}"; do
            echo
            info "▶ Deployando: $FN"
            if supabase functions deploy "$FN" --project-ref "$SUPABASE_PROJECT_REF" 2>&1 | tail -n 20; then
                DEPLOYED_FUNCTIONS+=("$FN")
                ok "  $FN deployada"
            else
                FAILED_FUNCTIONS+=("$FN")
                err "  Falha ao deployar $FN — veja log acima."
            fi
        done

        # 4) Validação: lista funções publicadas e confirma cada uma
        echo
        info "Validando publicação via 'supabase functions list'..."
        FN_LIST_OUT="$(supabase functions list --project-ref "$SUPABASE_PROJECT_REF" 2>&1 || true)"
        echo "$FN_LIST_OUT" | head -n 50

        # Backup: lista funções via Management API (mais confiável que a CLI).
        info "Confirmando via Management API (api.supabase.com)..."
        PUBLISHED_JSON="$(curl -fsSL \
            -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
            "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/functions" 2>/dev/null || echo '[]')"
        PUBLISHED_NAMES="$(echo "$PUBLISHED_JSON" | jq -r '.[].slug // .[].name // empty' 2>/dev/null | sort -u)"
        PUBLISHED_COUNT="$(echo "$PUBLISHED_NAMES" | grep -c . || echo 0)"
        info "Functions publicadas no projeto ($PUBLISHED_COUNT):"
        echo "$PUBLISHED_NAMES" | sed 's/^/    - /'

        # Detecta cenário "apenas healthz publicada" — sinal de deploy incompleto.
        if [[ "$PUBLISHED_COUNT" -le 1 ]] && echo "$PUBLISHED_NAMES" | grep -qx 'healthz'; then
            err "ATENÇÃO: apenas a função 'healthz' está publicada — deploy real falhou."
            err "Webhooks externos (Stripe, n8n, gateways) NÃO funcionarão."
            err "Tente manualmente: cd $APP_DIR && supabase functions deploy <nome> --project-ref ${SUPABASE_PROJECT_REF}"
        fi

        # Confirma que cada função do repo está realmente publicada
        for FN in "${ALL_FNS[@]}"; do
            if echo "$PUBLISHED_NAMES" | grep -qx "$FN"; then
                ok "  ✓ publicada: $FN"
            else
                err "  ✗ NÃO publicada: $FN  (rode: supabase functions deploy $FN --project-ref $SUPABASE_PROJECT_REF)"
            fi
        done

        echo
        info "Healthcheck HTTP de cada função (espera 2xx, 401 ou 405 — indica que está LIVE)..."
        for FN in "${DEPLOYED_FUNCTIONS[@]}"; do
            FN_URL="${SUPABASE_URL_INPUT}/functions/v1/${FN}"
            FN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
                -H "apikey: ${SUPABASE_ANON_KEY}" \
                -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
                --max-time 15 "$FN_URL" || echo "000")"
            case "$FN_CODE" in
                2*|401|403|405)
                    ok "  [$FN_CODE] $FN  (LIVE em $FN_URL)"
                    ;;
                404)
                    err "  [404] $FN  — função NÃO publicada. Rode: supabase functions deploy $FN"
                    ;;
                000)
                    err "  [timeout] $FN  — sem resposta do Supabase em 15s."
                    ;;
                *)
                    info "  [$FN_CODE] $FN  — código inesperado, mas pode estar OK."
                    ;;
            esac
        done

        # 5) Healthcheck via gateway local /api/* (se subdomínio configurado)
        if [[ -n "$API_SUBDOMAIN" && ${#DEPLOYED_FUNCTIONS[@]} -gt 0 ]]; then
            echo
            info "Testando proxy local /api/<fn> via Nginx (Host: $API_SUBDOMAIN)..."
            FIRST_FN="${DEPLOYED_FUNCTIONS[0]}"
            PROXY_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
                -H "Host: ${API_SUBDOMAIN}" \
                -H "apikey: ${SUPABASE_ANON_KEY}" \
                -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
                --max-time 15 "http://127.0.0.1/api/${FIRST_FN}" || echo "000")"
            case "$PROXY_CODE" in
                2*|401|403|405)
                    ok "  Proxy /api/${FIRST_FN} OK (HTTP $PROXY_CODE) — gateway funcionando."
                    ;;
                404)
                    err "  Proxy /api/${FIRST_FN} retornou 404 — verifique vhost Nginx."
                    ;;
                502|504)
                    err "  Proxy /api/${FIRST_FN} retornou $PROXY_CODE — Nginx NÃO alcança Supabase em runtime."
                    err "  Diagnóstico automático:"
                    # Testa se a função responde direto no Supabase (bypass Nginx)
                    DIRECT_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
                        -H "apikey: ${SUPABASE_ANON_KEY}" \
                        -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
                        --max-time 10 "${SUPABASE_URL_INPUT}/functions/v1/${FIRST_FN}" || echo "000")"
                    case "$DIRECT_CODE" in
                        2*|401|403|405)
                            err "    ✓ Função responde direto no Supabase (HTTP $DIRECT_CODE)"
                            err "    ✗ Mas Nginx falha — provável causa: outbound HTTPS bloqueado APENAS pela rede da VPS"
                            err "    Teste: curl -v ${SUPABASE_URL_INPUT}/functions/v1/${FIRST_FN}"
                            err "    Verifique firewall do provedor (Oracle/AWS Security Group) — TCP 443 outbound"
                            ;;
                        404)
                            err "    ✗ Função '${FIRST_FN}' NÃO existe no Supabase (HTTP 404)"
                            err "    Rode: cd $APP_DIR && supabase functions deploy ${FIRST_FN} --project-ref ${SUPABASE_PROJECT_REF}"
                            ;;
                        000)
                            err "    ✗ Supabase inalcançável tanto via Nginx quanto direto"
                            err "    Outbound TCP 443 da VPS está bloqueado. Veja firewall do provedor."
                            ;;
                        *)
                            err "    Função direto retornou HTTP $DIRECT_CODE"
                            ;;
                    esac
                    ;;
                *)
                    info "  Proxy /api/${FIRST_FN} retornou $PROXY_CODE."
                    ;;
            esac

            # Healthcheck do gateway em si
            HZ_CODE="$(curl -sS -o /tmp/api_healthz.out -w '%{http_code}' \
                -H "Host: ${API_SUBDOMAIN}" --max-time 5 \
                http://127.0.0.1/api/healthz || echo "000")"
            if [[ "$HZ_CODE" == "200" ]] && grep -q '^ok' /tmp/api_healthz.out; then
                ok "  /api/healthz responde 200 'ok'"
            else
                err "  /api/healthz retornou HTTP $HZ_CODE — vhost de API pode não estar carregado."
            fi
        fi
    fi

    if [[ ${#FAILED_FUNCTIONS[@]} -gt 0 ]]; then
        err "Edge Functions com falha no deploy (${#FAILED_FUNCTIONS[@]}):"
        printf '  - %s\n' "${FAILED_FUNCTIONS[@]}"
        err "Rode manualmente após o install: cd $APP_DIR && supabase functions deploy <nome>"
    else
        ok "Todas as Edge Functions deployadas com sucesso (${#DEPLOYED_FUNCTIONS[@]})."
    fi

    # 6) Lembrete sobre secrets das Edge Functions
    echo
    info "Lembrete: Edge Functions precisam de SECRETS configurados no Supabase para autenticar webhooks."
    info "  Liste:    supabase secrets list --project-ref $SUPABASE_PROJECT_REF"
    info "  Configure: supabase secrets set RESEND_API_KEY=xxx WEBHOOK_SECRET=$WEBHOOK_SECRET ... --project-ref $SUPABASE_PROJECT_REF"
    info "  Variáveis típicas: WEBHOOK_SECRET, MP_WEBHOOK_SECRET, RESEND_API_KEY, STRIPE_SECRET_KEY,"
    info "                     OPENAI_API_KEY, evolution_api_url, evolution_api_key."
fi

###############################################################################
# STEP 2 — Certbot (SSL)
###############################################################################
step "STEP 2 — Configurando SSL com Certbot para $DOMAIN"

info "Instalando Certbot + plugin Nginx..."
apt-get install -y certbot python3-certbot-nginx

CERTBOT_EXTRA=()
if [[ "$SSL_STAGING" -eq 1 ]]; then
    info "Emitindo certificado STAGING (teste) para $DOMAIN..."
    info "⚠️  O navegador exibirá aviso de segurança — isso é esperado em modo staging."
    CERTBOT_EXTRA+=(--staging --break-my-certs)
else
    info "Emitindo certificado de PRODUÇÃO para $DOMAIN..."
fi

# Domínios a incluir no certificado (-d). Sempre o principal; opcionalmente o de API.
CERT_DOMAINS=(-d "$DOMAIN")
if [[ -n "$API_SUBDOMAIN" ]]; then
    info "Incluindo $API_SUBDOMAIN no mesmo certificado SAN."
    info "⚠️  O DNS de $API_SUBDOMAIN precisa estar apontado para esta VPS antes do Certbot rodar."
    CERT_DOMAINS+=(-d "$API_SUBDOMAIN")
fi

if ! certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$EMAIL" \
    "${CERT_DOMAINS[@]}" \
    "${CERTBOT_EXTRA[@]}"; then
    err "Falha ao emitir certificado SSL."
    if [[ "$SSL_STAGING" -eq 0 ]]; then
        err "Possíveis causas:"
        err "  • Rate limit do Let's Encrypt (5 certs/semana por domínio)."
        err "  • DNS de $DOMAIN ou $API_SUBDOMAIN ainda não aponta para esta VPS."
        err "    Teste: dig +short $DOMAIN  /  dig +short ${API_SUBDOMAIN:-$DOMAIN}"
        err "  • Porta 80/443 bloqueada por firewall."
        err "    Teste: nc -zv $DOMAIN 80   /   nc -zv $DOMAIN 443"
        err ""
        err "Para validar a config sem queimar quotas, rode novamente escolhendo a opção 2 (staging)."
    fi
    exit 1
fi

# Auto-renovação
if systemctl list-unit-files | grep -q '^certbot.timer'; then
    systemctl enable --now certbot.timer
    info "Auto-renovação via systemd timer (certbot.timer) ativa."
else
    info "systemd timer não disponível — configurando cron diário."
    ( crontab -l 2>/dev/null | grep -v 'certbot renew' ; \
      echo "0 3 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
fi
if [[ "$SSL_STAGING" -eq 1 ]]; then
    ok "SSL STAGING configurado para $DOMAIN (certificado de teste)"
    info "Quando estiver tudo OK, rode novamente o install.sh escolhendo a opção 1 (produção)."
    info "Antes de re-emitir, limpe o staging: sudo certbot delete --cert-name $DOMAIN"
else
    ok "SSL configurado para $DOMAIN"
fi

###############################################################################
# Resumo final
###############################################################################
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO CONCLUÍDA                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo
ok "App buildado e servido via Nginx → $APP_DIR/dist/"
if [[ "$SSL_STAGING" -eq 1 ]]; then
    ok "SSL STAGING (teste) ativo em https://${DOMAIN} — navegador mostrará aviso"
else
    ok "SSL ativo em https://${DOMAIN}"
fi
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
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}URLs prontas para colar nos painéis dos gateways/webhooks:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "Use as URLs do SEU domínio (proxy Nginx → Supabase). Funcionam mesmo se"
echo "o gateway bloquear domínios *.supabase.co (ex.: WAF do Melhor Envio)."
echo
for FN in melhor-envio-webhook asaas-webhook mercadopago-webhook pagarme-webhook pagbank-webhook; do
    echo "  $FN:"
    echo "    https://${DOMAIN}/${FN}              (recomendado)"
    if [[ -n "$API_SUBDOMAIN" ]]; then
        echo "    https://${API_SUBDOMAIN}/api/${FN}    (subdomínio dedicado)"
    fi
    echo "    ${SUPABASE_URL_INPUT}/functions/v1/${FN}   (direto Supabase)"
done
echo
echo "  Melhor Envio (URL alternativa, aceita POST na página de configuração):"
echo "    https://${DOMAIN}/admin/configuracoes/logistica"
echo

if [[ -n "$API_SUBDOMAIN" ]]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Endpoint genérico para integrações externas (n8n, Stripe, Meta):${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "  https://${API_SUBDOMAIN}/api/<nome-da-edge-function>"
    echo "  Healthcheck: https://${API_SUBDOMAIN}/api/healthz   (deve responder 'ok')"
    echo "  WEBHOOK_SECRET salvo em $ENV_FILE — use no header das integrações."
    echo
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Troubleshooting rápido:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Webhooks externos (n8n, Stripe, Meta, gateways):"
echo "    • 404 'Function not found'  → supabase functions deploy <nome> --project-ref ${SUPABASE_PROJECT_REF}"
echo "                                  supabase functions list --project-ref ${SUPABASE_PROJECT_REF}"
echo "    • 401 Unauthorized          → header 'Authorization: Bearer \$WEBHOOK_SECRET' ou 'apikey: <ANON_KEY>'"
echo "                                  conferir secrets: supabase secrets list --project-ref ${SUPABASE_PROJECT_REF}"
echo "    • 403 Forbidden             → função com verify_jwt=true sem JWT válido; revisar supabase/config.toml"
echo "    • 500 Internal              → supabase functions logs <nome> --project-ref ${SUPABASE_PROJECT_REF}"
echo "    • 502/504 Bad Gateway       → Nginx não alcança Supabase. Teste outbound:"
echo "                                  curl -v ${SUPABASE_URL_INPUT}/functions/v1/healthz"
echo "                                  Se direto OK mas via Nginx 502 → firewall outbound da VPS"
echo "                                  Se direto 404 → supabase functions deploy <nome> --project-ref ${SUPABASE_PROJECT_REF}"
echo "                                  Cloud provider Security Group/UFW: liberar TCP 443 OUTBOUND"
echo "    • timeout                   → firewall outbound bloqueia HTTPS para *.supabase.co"
echo
echo "  OAuth2 (Melhor Envio, etc.):"
echo "    • Redirect URI inválida     → Use SEMPRE https://${DOMAIN}/admin/configuracoes/logistica"
echo "                                  NUNCA URL do Supabase, localhost, ou domínio do preview Lovable"
echo "                                  Configure 'URL pública da loja' em /admin/configuracoes/logistica"
echo "    • Code não é processado     → SPA precisa carregar com query string ?code=... preservada"
echo "                                  Teste: curl -i 'https://${DOMAIN}/admin/configuracoes/logistica?code=test'"
echo "                                  Esperado HTTP 200 + HTML da SPA (não 404)"
echo "    • 'invalid redirect_uri'    → Cadastre EXATAMENTE no painel do Melhor Envio:"
echo "                                    https://${DOMAIN}/admin/configuracoes/logistica"
echo "                                  Sem barra final, mesmo schema (https), mesmo host"
echo "    • Token não persiste        → Verifique secrets da edge function:"
echo "                                    supabase secrets list --project-ref ${SUPABASE_PROJECT_REF}"
echo "                                  E logs:  supabase functions logs melhor-envio-oauth --project-ref ${SUPABASE_PROJECT_REF}"
echo "    • OAuth direto OK, custom falha → Nginx não preserva query string ou rota cai em 404"
echo "                                      Veja seção 'Vhosts conflitantes' abaixo"
echo
echo "  SPA fallback (404 em /admin/*, refresh, deep links, OAuth callback):"
echo "    • Sintoma: GET /admin/configuracoes/logistica → 404 (mas / funciona)"
echo "    • Causa:   vhost sem 'try_files \$uri \$uri/ /index.html' no location /"
echo "               Nginx procura o arquivo físico /var/www/app/dist/admin/... e não acha"
echo "    • Fix:     este install.sh já configura fallback em 3 camadas:"
echo "                 1. location = /admin/configuracoes/logistica (exato, GET=SPA / POST=webhook)"
echo "                 2. location ^~ /admin/                       (todas as rotas admin)"
echo "                 3. location /                                (catch-all SPA)"
echo "    • Teste:   curl -I 'https://${DOMAIN}/admin/configuracoes/logistica?code=test'"
echo "               Esperado: HTTP/2 200 + Content-Type text/html"
echo "    • Validar: sudo nginx -T | grep -A3 'try_files'"
echo "               sudo tail -n 20 /var/log/nginx/error.log   (procurar 'No such file')"
echo "    • Lembrete: NÃO é problema de DNS, SSL ou Supabase — é fallback SPA do Nginx"
echo
echo "  Infra (Nginx, SSL, DNS, firewall):"
echo "    • SSL falhou        → sudo certbot certificates  /  tail -n 100 /var/log/letsencrypt/letsencrypt.log"
echo "    • DNS não aponta    → dig +short ${DOMAIN}   (deve retornar o IP público desta VPS)"
if [[ -n "$API_SUBDOMAIN" ]]; then
    echo "                          dig +short ${API_SUBDOMAIN}   (idem)"
fi
echo "    • Vhosts conflitantes (causa #1 de /api/healthz e webhook intermitentes):"
echo "        sudo nginx -T 2>&1 | grep -i 'conflicting server name'"
echo "        sudo grep -RIl 'server_name.*${DOMAIN}' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null"
if [[ -n "$API_SUBDOMAIN" ]]; then
echo "        sudo grep -RIl 'server_name.*${API_SUBDOMAIN}' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null"
fi
echo "        Deve haver APENAS UM arquivo por server_name. Remova duplicados e:"
echo "        sudo nginx -t && sudo systemctl reload nginx"
echo "    • Root retorna 404  → quase sempre é vhost duplicado capturando o host antes do correto."
echo "    • Teste local sem DNS → curl -i -H 'Host: ${API_SUBDOMAIN:-$DOMAIN}' http://127.0.0.1/api/healthz"
echo "    • Porta bloqueada   → sudo ss -tlnp | grep -E ':80|:443'   /   sudo ufw status verbose"
echo "                          Cloud firewall (Oracle/AWS/etc.) também precisa liberar 80 e 443."
echo "    • Nginx erro/access → sudo tail -f /var/log/nginx/error.log /var/log/nginx/access.log"
echo "    • Reload Nginx      → sudo nginx -t && sudo systemctl reload nginx"
echo
echo "  Healthchecks:"
echo "    • App SPA           → curl -i https://${DOMAIN}/healthz   (deve responder 'ok')"
if [[ -n "$API_SUBDOMAIN" ]]; then
    echo "    • API Gateway       → curl -i https://${API_SUBDOMAIN}/api/healthz   (deve responder 'ok')"
    echo "    • Edge Function     → curl -i https://${API_SUBDOMAIN}/api/<nome>"
fi
echo "    • Edge direto       → curl -i ${SUPABASE_URL_INPUT}/functions/v1/<nome>"
echo
echo "  Manutenção:"
echo "    • Rebuild SPA       → cd $APP_DIR && git pull && npm install && npm run build && systemctl reload nginx"
echo "    • Redeploy função   → cd $APP_DIR && supabase functions deploy <nome> --project-ref ${SUPABASE_PROJECT_REF}"
echo "    • Ver WEBHOOK_SECRET → sudo grep '^WEBHOOK_SECRET=' $ENV_FILE"
echo
