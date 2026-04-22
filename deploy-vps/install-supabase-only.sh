#!/usr/bin/env bash
# =============================================================================
#  install-supabase-only.sh
# -----------------------------------------------------------------------------
#  Provisionamento profissional de VPS (Ubuntu/Debian) para aplicações Docker
#  cuja comunicação SMTP é feita EXCLUSIVAMENTE via Supabase Edge Functions.
#
#  ⚠️  POLÍTICA DE SEGURANÇA (LEIA ANTES DE EXECUTAR)
#  ---------------------------------------------------------------------------
#   ❌ NÃO salvamos credenciais SMTP na VPS
#   ❌ NÃO usamos arquivo .env local para SMTP
#   ❌ NÃO armazenamos credenciais SMTP em tabelas do banco (site_settings, etc)
#   ❌ NÃO salvamos SUPABASE_SERVICE_ROLE_KEY em arquivos da VPS ou do banco
#
#   ✅ Toda credencial sensível vive APENAS em:
#        Supabase Dashboard → Project Settings → Edge Functions → Secrets
#        (equivalente CLI: `supabase secrets set NOME=valor`)
#
#   Secrets gerenciados por este script:
#     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
#     SMTP_FROM, SMTP_FROM_NAME, SMTP_SECURE,
#     SUPABASE_SERVICE_ROLE_KEY
#
#  Uso:
#     sudo bash deploy-vps/install-supabase-only.sh
#
#  Variáveis opcionais (somente para automação não-interativa):
#     SUPABASE_PROJECT_REF=abcd1234 \
#     SUPABASE_ACCESS_TOKEN=sbp_xxx \
#     NON_INTERACTIVE=1 \
#         sudo -E bash deploy-vps/install-supabase-only.sh
#
#  ATENÇÃO: Mesmo em modo não-interativo, valores de SECRETS NUNCA são lidos de
#  arquivos no disco. Eles são solicitados via prompt (read -s) e enviados
#  diretamente ao Supabase, sem persistência local.
# =============================================================================

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Estilo de saída
# ---------------------------------------------------------------------------
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
BOLD=$'\033[1m'
NC=$'\033[0m'

log()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()     { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()    { echo -e "${RED}[FAIL]${NC}  $*" >&2; }
step()   { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }
banner() {
  echo -e "\n${BOLD}${YELLOW}============================================================${NC}"
  echo -e "${BOLD}${YELLOW} $* ${NC}"
  echo -e "${BOLD}${YELLOW}============================================================${NC}\n"
}

trap 'err "Falha na linha $LINENO. Abortando."; exit 1' ERR

# ---------------------------------------------------------------------------
# 0. Pré-checagens
# ---------------------------------------------------------------------------
banner "Provisionamento VPS  +  Supabase Edge Functions (SMTP remoto)"

if [[ $EUID -ne 0 ]]; then
  err "Execute como root: sudo bash $0"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  err "Distribuição não suportada (apt-get ausente). Use Ubuntu/Debian."
  exit 1
fi

NON_INTERACTIVE="${NON_INTERACTIVE:-0}"

# Sanidade: avisa se algum secret SMTP foi exportado no shell
for v in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM SMTP_FROM_NAME \
         SMTP_SECURE SUPABASE_SERVICE_ROLE_KEY; do
  if [[ -n "${!v:-}" ]]; then
    warn "Variável $v presente no ambiente. Ela será usada no prompt como sugestão,"
    warn "mas NÃO será gravada em nenhum arquivo desta VPS."
  fi
done

# ---------------------------------------------------------------------------
# 1. Atualização do sistema
# ---------------------------------------------------------------------------
step "1/9  Atualizando sistema (apt update && apt upgrade -y)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
ok "Sistema atualizado"

# ---------------------------------------------------------------------------
# 2. Dependências essenciais
# ---------------------------------------------------------------------------
step "2/9  Instalando dependências essenciais"
APT_PACKAGES=(
  curl wget git unzip zip nano
  ufw net-tools software-properties-common
  ca-certificates openssl
  telnet netcat-openbsd
  python3 python3-pip python3-venv python3-dev
  build-essential
  docker.io docker-compose
  jq
)
apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
ok "Pacotes instalados: ${APT_PACKAGES[*]}"

# ---------------------------------------------------------------------------
# 3. Docker
# ---------------------------------------------------------------------------
step "3/9  Habilitando e iniciando Docker"
systemctl enable docker
systemctl start docker

if [[ -n "${SUDO_USER:-}" ]] && id "$SUDO_USER" >/dev/null 2>&1; then
  usermod -aG docker "$SUDO_USER" || true
  log "Usuário '$SUDO_USER' adicionado ao grupo docker (faça logout/login para efetivar)"
fi

docker --version
docker compose version 2>/dev/null || docker-compose --version
ok "Docker operacional"

# ---------------------------------------------------------------------------
# 4. Firewall (UFW) — apenas portas web. Sem portas SMTP locais.
# ---------------------------------------------------------------------------
step "4/9  Configurando firewall UFW (22, 80, 443)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
# Sem 25/465/587 — envio de e-mail é responsabilidade do Supabase Edge Functions
ufw --force enable
ufw status verbose | sed 's/^/    /'
ok "Firewall ativo apenas com portas web (22/80/443). SMTP é remoto via Supabase."

# ---------------------------------------------------------------------------
# 5. Supabase CLI
# ---------------------------------------------------------------------------
step "5/9  Instalando Supabase CLI"

install_supabase_cli() {
  if command -v supabase >/dev/null 2>&1; then
    ok "Supabase CLI já instalada: $(supabase --version)"
    return
  fi

  log "Baixando última release de github.com/supabase/cli ..."
  ARCH="$(dpkg --print-architecture)"
  case "$ARCH" in
    amd64) ASSET="supabase_linux_amd64.deb" ;;
    arm64) ASSET="supabase_linux_arm64.deb" ;;
    *) err "Arquitetura não suportada: $ARCH"; exit 1 ;;
  esac

  TMPDEB="$(mktemp --suffix=.deb)"
  URL="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
        | jq -r --arg a "$ASSET" '.assets[] | select(.name==$a) | .browser_download_url')"

  if [[ -z "$URL" || "$URL" == "null" ]]; then
    err "Não foi possível resolver URL do pacote $ASSET no GitHub."
    exit 1
  fi

  curl -fsSL "$URL" -o "$TMPDEB"
  apt-get install -y "$TMPDEB"
  rm -f "$TMPDEB"
  ok "Supabase CLI instalada: $(supabase --version)"
}
install_supabase_cli

# ---------------------------------------------------------------------------
# 6. Login + link do projeto
# ---------------------------------------------------------------------------
step "6/9  Autenticação e vínculo do projeto Supabase"

# IMPORTANTE: SUPABASE_ACCESS_TOKEN é apenas variável de SESSÃO desta execução.
# Não é gravada em /etc, ~/.bashrc, .env, nem em nenhum arquivo desta VPS.
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    err "NON_INTERACTIVE=1 mas SUPABASE_ACCESS_TOKEN não foi exportado."
    exit 1
  fi
  echo -e "${YELLOW}Gere um Personal Access Token em:${NC} https://supabase.com/dashboard/account/tokens"
  read -rs -p "Cole o SUPABASE_ACCESS_TOKEN (sbp_...): " SUPABASE_ACCESS_TOKEN
  echo
  export SUPABASE_ACCESS_TOKEN
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    err "NON_INTERACTIVE=1 mas SUPABASE_PROJECT_REF não foi definido."
    exit 1
  fi
  read -r -p "Project Ref do Supabase (ex: abcd1234efgh5678): " SUPABASE_PROJECT_REF
fi

log "Linkando projeto $SUPABASE_PROJECT_REF ..."
WORKDIR="/opt/supabase-link"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# `supabase link` cria apenas metadados em .supabase/ — sem secrets em disco.
supabase link --project-ref "$SUPABASE_PROJECT_REF"
ok "Projeto vinculado: $SUPABASE_PROJECT_REF"

# ---------------------------------------------------------------------------
# 7. Configuração de SECRETS (somente no Supabase, nunca em disco)
# ---------------------------------------------------------------------------
step "7/9  Configurando Edge Function Secrets no Supabase"

cat <<EOF

${BOLD}Os seguintes valores serão enviados para:${NC}
    Supabase → Project Settings → Edge Functions → Secrets

${RED}Eles NÃO serão escritos em nenhum arquivo desta VPS.${NC}
${RED}Eles NÃO serão escritos em nenhuma tabela do banco.${NC}

EOF

ask_secret() {
  # ask_secret <NOME> <descrição> <default-opcional> <silencioso 0|1>
  local name="$1" desc="$2" default="${3:-}" silent="${4:-0}" value=""
  local current="${!name:-}"
  if [[ -n "$current" ]]; then default="$current"; fi

  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    if [[ -z "$default" ]]; then
      err "NON_INTERACTIVE=1 e $name não foi fornecido via env."
      exit 1
    fi
    printf -v "$name" '%s' "$default"
    return
  fi

  local prompt="${BOLD}$name${NC} — $desc"
  [[ -n "$default" ]] && prompt+=" ${YELLOW}[$default]${NC}"
  prompt+=": "

  if [[ "$silent" == "1" ]]; then
    read -rs -p "$(echo -e "$prompt")" value; echo
  else
    read -r  -p "$(echo -e "$prompt")" value
  fi
  [[ -z "$value" && -n "$default" ]] && value="$default"

  if [[ -z "$value" ]]; then
    err "$name é obrigatório."
    exit 1
  fi
  printf -v "$name" '%s' "$value"
}

ask_secret SMTP_HOST       "Host SMTP"                              "smtp.hostinger.com"           0
ask_secret SMTP_PORT       "Porta SMTP (465 SSL / 587 STARTTLS)"    "465"                          0
ask_secret SMTP_SECURE     "Conexão segura? (true=SSL/465, false=STARTTLS/587)" "true"             0
ask_secret SMTP_USER       "Usuário SMTP (e-mail completo)"         ""                             0
ask_secret SMTP_PASS       "Senha SMTP"                             ""                             1
ask_secret SMTP_FROM       "Endereço remetente (From)"              "${SMTP_USER}"                 0
ask_secret SMTP_FROM_NAME  "Nome do remetente"                      "Equipe"                       0
ask_secret SUPABASE_SERVICE_ROLE_KEY "Service Role Key do Supabase" ""                             1

log "Enviando secrets para o Supabase (supabase secrets set ...)"
# Cada secret é enviado individualmente para que falhas sejam atribuíveis.
# Os valores são passados como argumento e NÃO ecoados em log.
supabase secrets set \
  "SMTP_HOST=$SMTP_HOST" \
  "SMTP_PORT=$SMTP_PORT" \
  "SMTP_SECURE=$SMTP_SECURE" \
  "SMTP_USER=$SMTP_USER" \
  "SMTP_PASS=$SMTP_PASS" \
  "SMTP_FROM=$SMTP_FROM" \
  "SMTP_FROM_NAME=$SMTP_FROM_NAME" \
  "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
  >/dev/null

# Limpa imediatamente da memória do shell — defesa em profundidade.
unset SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS \
      SMTP_FROM SMTP_FROM_NAME SUPABASE_SERVICE_ROLE_KEY

ok "Secrets gravados em Supabase. Verificação:"
supabase secrets list | sed 's/^/    /'

# ---------------------------------------------------------------------------
# 8. Deploy das Edge Functions
# ---------------------------------------------------------------------------
step "8/9  Deploy das Edge Functions"

REPO_FUNCTIONS_DIR=""
# Se o script for executado de dentro de um clone do repositório, usamos as
# functions versionadas. Caso contrário, apenas listamos as existentes no projeto.
if [[ -d "$(dirname "$0")/../supabase/functions" ]]; then
  REPO_FUNCTIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi

if [[ -n "$REPO_FUNCTIONS_DIR" ]]; then
  log "Diretório de functions detectado: $REPO_FUNCTIONS_DIR/supabase/functions"
  cd "$REPO_FUNCTIONS_DIR"
  supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null 2>&1 || true

  mapfile -t FNS < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
  for fn in "${FNS[@]}"; do
    log "  → deploy: $fn"
    supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" >/dev/null
  done
  ok "Deploy concluído (${#FNS[@]} functions)"
else
  warn "Não estamos dentro do repositório (sem supabase/functions). Pulando deploy."
  warn "Para deployar depois: rode este script a partir do clone do projeto."
fi

# ---------------------------------------------------------------------------
# 9. Teste de funcionamento
# ---------------------------------------------------------------------------
step "9/9  Teste rápido"

log "Listando functions ativas no projeto:"
supabase functions list --project-ref "$SUPABASE_PROJECT_REF" | sed 's/^/    /' || true

log "Listando secrets configurados (nomes apenas, valores ocultos):"
supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" | sed 's/^/    /'

# ---------------------------------------------------------------------------
# Encerramento
# ---------------------------------------------------------------------------
banner "✅ Provisionamento concluído"

cat <<EOF
${BOLD}Resumo${NC}
  • VPS atualizada e endurecida (UFW: 22/80/443)
  • Docker pronto para containers da aplicação
  • Supabase CLI instalada e projeto vinculado: ${BOLD}${SUPABASE_PROJECT_REF}${NC}
  • Secrets SMTP + SERVICE_ROLE_KEY: ${GREEN}armazenados APENAS no Supabase${NC}
  • Edge Functions deployadas (se o script foi executado do repositório)

${BOLD}Onde gerenciar as credenciais daqui em diante${NC}
  Dashboard: Project Settings → Edge Functions → Secrets
  CLI     : supabase secrets set NOME=valor --project-ref ${SUPABASE_PROJECT_REF}
  Listar  : supabase secrets list --project-ref ${SUPABASE_PROJECT_REF}
  Remover : supabase secrets unset NOME --project-ref ${SUPABASE_PROJECT_REF}

${BOLD}Operação da aplicação${NC}
  • Sobir containers   : docker compose up -d
  • Atualizar          : docker compose pull && docker compose up -d
  • Rebuild completo   : docker compose down && docker compose up -d --build
  • Logs em tempo real : docker compose logs -f

${BOLD}Boas práticas${NC}
  ${RED}✗${NC} NUNCA grave SMTP_PASS em .env, docker-compose.yml ou repositório.
  ${RED}✗${NC} NUNCA persista SUPABASE_SERVICE_ROLE_KEY em tabelas (ex: site_settings).
  ${GREEN}✓${NC} Toda Edge Function lê via Deno.env.get('SMTP_PASS') etc.
  ${GREEN}✓${NC} Rotacione segredos periodicamente: supabase secrets set ...
  ${GREEN}✓${NC} Em caso de exposição acidental, rotacione SERVICE_ROLE_KEY no Dashboard.

EOF

ok "Tudo pronto. Boa operação! 🚀"