#!/usr/bin/env bash
# =============================================================================
#  install-supabase-only.sh  —  versão ENXUTA
# -----------------------------------------------------------------------------
#  Provisiona uma VPS (Ubuntu/Debian) para servir APENAS o frontend.
#
#  📌 Toda a lógica de e-mail (SMTP, Resend, templates) continua executando
#     dentro do Supabase, exatamente como funciona no preview do Lovable.
#     Os secrets (SMTP_*, RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY) já vivem
#     em: Supabase → Project Settings → Edge Functions → Secrets.
#
#  Por isso, esta VPS:
#    ❌ NÃO precisa do Supabase CLI
#    ❌ NÃO precisa de secrets de SMTP
#    ❌ NÃO precisa de SUPABASE_SERVICE_ROLE_KEY
#    ❌ NÃO precisa de portas 25/465/587
#
#  Ela só precisa de:
#    ✅ Docker (para subir o container do frontend)
#    ✅ UFW liberando 22/80/443
#    ✅ VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (chaves PÚBLICAS,
#       seguras de viver no .env de build do frontend)
#
#  Uso:
#     sudo bash deploy-vps/install-supabase-only.sh
# =============================================================================

set -Eeuo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[FAIL]${NC}  $*" >&2; }
step() { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
banner(){ echo -e "\n${BOLD}${YELLOW}============================================================${NC}\n${BOLD}${YELLOW} $* ${NC}\n${BOLD}${YELLOW}============================================================${NC}\n"; }

trap 'err "Falha na linha $LINENO. Abortando."; exit 1' ERR

# ---------------------------------------------------------------------------
# 0. Pré-checagens
# ---------------------------------------------------------------------------
banner "VPS Frontend  +  Supabase remoto (sem SMTP local)"

if [[ $EUID -ne 0 ]]; then
  err "Execute como root: sudo bash $0"; exit 1
fi
if ! command -v apt-get >/dev/null 2>&1; then
  err "Distribuição não suportada. Use Ubuntu/Debian."; exit 1
fi

cat <<EOF
${BOLD}O que este script faz:${NC}
  1. Atualiza a VPS
  2. Instala dependências essenciais + Docker
  3. Configura firewall UFW (22, 80, 443)
  4. Pergunta APENAS as chaves PÚBLICAS do Supabase (URL + anon key)
  5. Gera /opt/app/.env de build do frontend
  6. Sobe o container com docker compose

${BOLD}O que este script NÃO faz (porque já está no Supabase):${NC}
  • Não configura SMTP
  • Não instala Supabase CLI
  • Não faz deploy de Edge Functions
  • Não toca em SUPABASE_SERVICE_ROLE_KEY

EOF

# ---------------------------------------------------------------------------
# 1. Atualização do sistema
# ---------------------------------------------------------------------------
step "1/6  Atualizando sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
ok "Sistema atualizado"

# ---------------------------------------------------------------------------
# 2. Dependências + Docker
# ---------------------------------------------------------------------------
step "2/6  Instalando dependências essenciais"
apt-get install -y --no-install-recommends \
  curl wget git unzip zip nano \
  ufw net-tools software-properties-common \
  ca-certificates openssl \
  docker.io docker-compose
ok "Pacotes instalados"

systemctl enable docker
systemctl start docker
if [[ -n "${SUDO_USER:-}" ]] && id "$SUDO_USER" >/dev/null 2>&1; then
  usermod -aG docker "$SUDO_USER" || true
fi
docker --version
docker compose version 2>/dev/null || docker-compose --version
ok "Docker pronto"

# ---------------------------------------------------------------------------
# 3. Firewall
# ---------------------------------------------------------------------------
step "3/6  Configurando firewall (UFW: 22, 80, 443)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  comment 'SSH'
ufw allow 80/tcp  comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose | sed 's/^/    /'
ok "Firewall ativo"

# ---------------------------------------------------------------------------
# 4. Chaves PÚBLICAS do Supabase
# ---------------------------------------------------------------------------
step "4/6  Configurando endpoint do Supabase (chaves públicas)"

cat <<EOF
${BOLD}Você só precisa de duas informações públicas do seu projeto Supabase:${NC}
  • VITE_SUPABASE_URL              (ex: https://abcd1234.supabase.co)
  • VITE_SUPABASE_PUBLISHABLE_KEY  (anon key — pode aparecer no frontend)

${YELLOW}Encontre em:${NC} Lovable → Cloud → Overview → API Keys
EOF
echo

read -r  -p "VITE_SUPABASE_URL: "             VITE_SUPABASE_URL
read -r  -p "VITE_SUPABASE_PUBLISHABLE_KEY: " VITE_SUPABASE_PUBLISHABLE_KEY
read -r  -p "VITE_SUPABASE_PROJECT_ID (opcional, ex: abcd1234): " VITE_SUPABASE_PROJECT_ID || true

if [[ -z "$VITE_SUPABASE_URL" || -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]]; then
  err "URL e PUBLISHABLE_KEY são obrigatórios."; exit 1
fi

APP_DIR="/opt/app"
mkdir -p "$APP_DIR"
cat > "$APP_DIR/.env" <<EOF
# Gerado por install-supabase-only.sh — chaves PÚBLICAS de build do Vite.
# Não há segredo aqui: a anon key é projetada para viver no frontend.
VITE_SUPABASE_URL=$VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
EOF
chmod 644 "$APP_DIR/.env"
ok ".env de build gerado em $APP_DIR/.env"

# ---------------------------------------------------------------------------
# 5. Subindo o container
# ---------------------------------------------------------------------------
step "5/6  Subindo container do frontend"

if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
  cd "$APP_DIR"
  log "docker compose up -d --build"
  docker compose up -d --build || docker-compose up -d --build
  ok "Container no ar"
else
  warn "Nenhum docker-compose.yml encontrado em $APP_DIR."
  warn "Faça o clone do repositório dentro de $APP_DIR e rode:"
  warn "    cd $APP_DIR && docker compose up -d --build"
fi

# ---------------------------------------------------------------------------
# 6. Conferência
# ---------------------------------------------------------------------------
step "6/6  Conferência"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | sed 's/^/    /' || true

banner "✅ VPS pronta"

cat <<EOF
${BOLD}Resumo${NC}
  • VPS atualizada, Docker rodando, UFW liberando 22/80/443
  • Frontend usa Supabase remoto: ${BOLD}$VITE_SUPABASE_URL${NC}
  • E-mail / SMTP / Edge Functions: ${GREEN}continuam executando no Supabase${NC}

${BOLD}Onde gerenciar SMTP / segredos${NC}
  Não nesta VPS. No Supabase:
    Project Settings → Edge Functions → Secrets
  As mesmas credenciais que já funcionam no preview do Lovable serão usadas
  pelo seu app aqui — não há nada para "copiar" de volta para a VPS.

${BOLD}Operação${NC}
  cd /opt/app
  docker compose logs -f          # ver logs
  docker compose pull && docker compose up -d   # atualizar
  docker compose down && docker compose up -d --build   # rebuild

${BOLD}Boas práticas${NC}
  ${GREEN}✓${NC} Esta VPS só conhece chaves PÚBLICAS — zero risco de vazar segredo.
  ${GREEN}✓${NC} Se trocar SMTP no futuro, troque APENAS no Supabase. A VPS não muda.
  ${RED}✗${NC} Nunca cole SUPABASE_SERVICE_ROLE_KEY ou SMTP_PASS em arquivos daqui.
EOF

ok "Tudo pronto. 🚀"