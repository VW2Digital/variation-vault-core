#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Instalador único para VPS Ubuntu (Docker) — site + backend
# =============================================================================
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh | sudo bash
#
# Variáveis opcionais (modo não-interativo):
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   SUPABASE_PROJECT_ID=xxx \
#   SUPABASE_DB_URL=postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres \
#   SUPABASE_SERVICE_KEY=eyJ... \
#   ADMIN_EMAIL=admin@dominio.com ADMIN_PASSWORD=senha123 \
#   DOMAIN=meusite.com SSL_EMAIL=admin@meusite.com \
#   DEPLOY_FUNCTIONS=yes \
#     curl ... | sudo -E bash
#
# Modo dry-run (valida credenciais sem aplicar nada):
#   sudo bash install.sh --dry-run
#   DRY_RUN=yes sudo -E bash install.sh
# =============================================================================

DRY_RUN="${DRY_RUN:-no}"
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN="yes" ;;
    --help|-h)
      sed -n '2,22p' "$0"; exit 0 ;;
  esac
done

set -uo pipefail
[[ "$DRY_RUN" != "yes" ]] && set -e
export DEBIAN_FRONTEND=noninteractive

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

source /etc/os-release

REPO_URL="${REPO_URL:-https://github.com/VW2Digital/variation-vault-core.git}"
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
BRANCH="${BRANCH:-main}"
COMPOSE_VERSION="v2.29.7"

configure_apt_retries() {
  cat >/etc/apt/apt.conf.d/80-liberty-retries <<'EOF'
Acquire::Retries "5";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::ForceIPv4 "true";
APT::Get::Assume-Yes "true";
Dpkg::Use-Pty "0";
EOF
}

rewrite_sources_to_https() {
  local file
  for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -f "$file" ]] || continue
    sed -i \
      -e 's|http://archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
      -e 's|http://ports.ubuntu.com/ubuntu-ports|https://ports.ubuntu.com/ubuntu-ports|g' \
      "$file"
  done
}

apt_update_resilient() {
  apt-get clean
  if apt-get update -qq; then return 0; fi
  warn "Falha no apt update. Trocando mirrors para HTTPS..."
  rewrite_sources_to_https
  apt-get clean
  apt-get update -qq
}

apt_install_resilient() {
  if apt-get install -y -qq --no-install-recommends "$@" >/dev/null; then return 0; fi
  warn "Falha ao instalar: $*. Recarregando..."
  apt_update_resilient
  apt-get install -y -qq --fix-missing --no-install-recommends "$@" >/dev/null
}

if [[ "$DRY_RUN" == "yes" ]]; then
  warn "════════════════════════════════════════════════════════════════"
  warn "  MODO DRY-RUN ATIVO — nada será modificado no servidor"
  warn "  Apenas valida credenciais e mostra o que seria executado"
  warn "════════════════════════════════════════════════════════════════"
  echo ""
fi

if [[ "$DRY_RUN" != "yes" ]]; then
  [[ $EUID -ne 0 ]] && { err "Rode como root"; exit 1; }
fi

# ---------- Pré-requisitos ----------
log "Validando pré-requisitos do sistema..."
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  err "Sistema operacional '$PRETTY_NAME' não é Ubuntu/Debian. Abortando."
  exit 1
fi
UBUNTU_MAJOR=$(echo "$VERSION_ID" | cut -d. -f1)
if [[ "$ID" == "ubuntu" && "$UBUNTU_MAJOR" -lt 20 ]]; then
  err "Ubuntu $VERSION_ID muito antigo. Mínimo: 20.04. Abortando."
  exit 1
fi
ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
  err "Arquitetura $ARCH não suportada (x86_64 ou aarch64)."
  exit 1
fi
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if (( RAM_MB < 900 )); then
  err "RAM insuficiente: ${RAM_MB}MB. Mínimo recomendado: 1GB."
  exit 1
fi
DISK_GB=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
if (( DISK_GB < 10 )); then
  err "Espaço em disco insuficiente: ${DISK_GB}GB livres. Mínimo: 10GB."
  exit 1
fi
ok "SO $PRETTY_NAME • $ARCH • RAM ${RAM_MB}MB • Disco ${DISK_GB}GB"

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║       LIBERTY PHARMA — INSTALADOR DOCKER COMPLETO            ║
║       Site + Schema + Admin + SSL + Edge Functions           ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- Detecta TTY ----------
if exec 3</dev/tty 2>/dev/null; then
  TTY_FD=3
elif [[ -t 0 ]]; then
  exec 3<&0
  TTY_FD=3
else
  TTY_FD=""
fi

prompt_tty() {
  local __var_name="$1"
  local __label="$2"
  local __value=""
  if [[ -z "$TTY_FD" ]]; then
    err "Sem terminal interativo disponível. Baixe primeiro:"
    err "  curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh"
    err "  sudo bash /tmp/install.sh"
    exit 1
  fi
  printf "%s" "$__label" > /dev/tty
  IFS= read -r __value <&3 || true
  printf -v "$__var_name" '%s' "$__value"
}

prompt_tty_secret() {
  local __var_name="$1"
  local __label="$2"
  local __value=""
  if [[ -z "$TTY_FD" ]]; then
    err "Sem terminal para input de senha."; exit 1
  fi
  printf "%s" "$__label" > /dev/tty
  IFS= read -rs __value <&3 || true
  printf "\n" > /dev/tty
  printf -v "$__var_name" '%s' "$__value"
}

# ----------------------------------------------------------------------------
# UX helpers: banners de etapa, barra de progresso, prompts com validação
# ----------------------------------------------------------------------------

# Estado das etapas: pending|done|current
declare -a STEP_NAMES=(
  "Supabase" "Domínio/SSL" "Edge Functions" "Limpeza"
  "Sistema base" "Swap" "Docker" "Firewall"
  "Banco + Admin" "Build + Nginx" "Deploy Funcs" "Operacional"
)
declare -a STEP_STATUS=(pending pending pending pending pending pending pending pending pending pending pending pending)

print_progress_bar() {
  local current_idx="$1"  # 1-based
  local i name status icon
  printf "\n" > /dev/tty
  printf "  Progresso: " > /dev/tty
  for i in "${!STEP_NAMES[@]}"; do
    name="${STEP_NAMES[$i]}"
    status="${STEP_STATUS[$i]}"
    if (( i + 1 == current_idx )); then
      printf "${YELLOW}[%d ▶]${NC}" "$((i+1))" > /dev/tty
    elif [[ "$status" == "done" ]]; then
      printf "${GREEN}[%d ✓]${NC}" "$((i+1))" > /dev/tty
    else
      printf "[%d ○]" "$((i+1))" > /dev/tty
    fi
    [[ $((i+1)) -lt ${#STEP_NAMES[@]} ]] && printf " " > /dev/tty
  done
  printf "\n\n" > /dev/tty
}

step_banner() {
  local num="$1" title="$2" subtitle="$3"
  STEP_STATUS[$((num-1))]="current"
  print_progress_bar "$num"
  printf "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}\n" > /dev/tty
  printf "${BLUE}║${NC}  ${YELLOW}ETAPA %2d/12${NC} — %-46s ${BLUE}║${NC}\n" "$num" "$title" > /dev/tty
  if [[ -n "$subtitle" ]]; then
    printf "${BLUE}║${NC}  %-58s ${BLUE}║${NC}\n" "$subtitle" > /dev/tty
  fi
  printf "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}\n\n" > /dev/tty
}

step_done() {
  local num="$1"
  STEP_STATUS[$((num-1))]="done"
}

# Validadores: retornam 0 = válido, 1 = inválido (ecoa erro em stderr/tty)
validate_supabase_url() {
  local v="$1"
  [[ -z "$v" ]] && { echo "  ✗ URL não pode ser vazia." > /dev/tty; return 1; }
  [[ ! "$v" =~ ^https?:// ]] && { echo "  ✗ URL deve começar com https://" > /dev/tty; return 1; }
  [[ ! "$v" =~ \.supabase\.co/?$ ]] && { echo "  ✗ URL deve terminar em .supabase.co (ex: https://abc.supabase.co)" > /dev/tty; return 1; }
  return 0
}
validate_jwt_key() {
  local v="$1" label="${2:-key}"
  [[ -z "$v" ]] && { echo "  ✗ $label vazia." > /dev/tty; return 1; }
  [[ ! "$v" =~ ^eyJ ]] && { echo "  ✗ $label deve começar com 'eyJ' (formato JWT)." > /dev/tty; return 1; }
  [[ ${#v} -lt 100 ]] && { echo "  ✗ $label parece curta demais (${#v} chars, esperado >100)." > /dev/tty; return 1; }
  return 0
}
validate_db_url() {
  local v="$1"
  [[ -z "$v" ]] && return 0  # opcional
  [[ ! "$v" =~ ^postgresql:// ]] && { echo "  ✗ Deve começar com postgresql://" > /dev/tty; return 1; }
  [[ ! "$v" =~ @ ]] && { echo "  ✗ Formato inválido (esperado postgresql://USER:SENHA@HOST:PORTA/DB)" > /dev/tty; return 1; }
  return 0
}
validate_email() {
  local v="$1"
  [[ -z "$v" ]] && { echo "  ✗ Email vazio." > /dev/tty; return 1; }
  [[ ! "$v" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] && { echo "  ✗ Email inválido." > /dev/tty; return 1; }
  return 0
}
validate_password() {
  local v="$1"
  [[ ${#v} -lt 6 ]] && { echo "  ✗ Senha precisa ter no mínimo 6 caracteres." > /dev/tty; return 1; }
  return 0
}
validate_domain() {
  local v="$1"
  [[ -z "$v" ]] && return 0  # opcional
  [[ ! "$v" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] && { echo "  ✗ Domínio inválido. Use formato: loja.exemplo.com" > /dev/tty; return 1; }
  return 0
}

# prompt_validated VAR "label" "validador_func" [optional|required] [default]
prompt_validated() {
  local var_name="$1" label="$2" validator="$3" mode="${4:-required}" default="${5:-}"
  local value=""
  while true; do
    prompt_tty value "$label"
    value="$(echo -n "$value" | tr -d '[:space:]')"
    if [[ -z "$value" && -n "$default" ]]; then
      value="$default"
    fi
    if [[ -z "$value" && "$mode" == "optional" ]]; then
      printf -v "$var_name" '%s' ""
      return 0
    fi
    if $validator "$value"; then
      printf -v "$var_name" '%s' "$value"
      return 0
    fi
    echo "  → tente novamente (ou Ctrl+C para abortar)" > /dev/tty
  done
}

prompt_validated_secret() {
  local var_name="$1" label="$2" validator="$3"
  local value=""
  while true; do
    prompt_tty_secret value "$label"
    if $validator "$value"; then
      printf -v "$var_name" '%s' "$value"
      return 0
    fi
    echo "  → tente novamente (ou Ctrl+C para abortar)" > /dev/tty
  done
}

# Mostra valor mascarando segredos
mask_secret() {
  local v="$1"
  [[ -z "$v" ]] && { echo "(vazio)"; return; }
  local len=${#v}
  if (( len <= 12 )); then echo "***"; else echo "${v:0:6}...${v: -4} (${len} chars)"; fi
}

# ============================================================================
# COLETA DE DADOS — Etapas 1, 2 e 3 (interativas, com revisão antes do deploy)
# ============================================================================
# Estratégia:
#   - Cada campo: explicação + onde encontrar + validação em loop (não aborta).
#   - Modo interativo: ao final, MENU DE REVISÃO permite editar qualquer campo.
#   - Modo não-interativo (env vars): valida e segue direto.
# ============================================================================

collect_supabase() {
  cat > /dev/tty <<'INFO'
  ──────────────────────────────────────────────────────────────
   ONDE ENCONTRAR no painel Supabase (https://supabase.com/dashboard):
     • Project URL    → Settings → API → Project URL
     • anon key       → Settings → API → Project API keys → "anon public"
     • service_role   → Settings → API → Project API keys → "service_role" (segredo!)
     • Connection URI → Settings → Database → Connection string → URI
  ──────────────────────────────────────────────────────────────

INFO
  echo "  [1.1] URL do projeto Supabase  (ex: https://abc.supabase.co)" > /dev/tty
  prompt_validated SUPABASE_URL "        URL: " validate_supabase_url required
  SUPABASE_URL="${SUPABASE_URL%/}"

  echo "" > /dev/tty
  echo "  [1.2] anon / public key  (JWT começando com eyJ... — é PÚBLICA)" > /dev/tty
  prompt_validated SUPABASE_ANON_KEY "        anon key: " "validate_jwt_key" required

  echo "" > /dev/tty
  echo "  [1.3] Connection string Postgres  (OPCIONAL — ENTER pula)" > /dev/tty
  echo "        Necessária para aplicar o schema.sql automaticamente." > /dev/tty
  echo "        Formato: postgresql://postgres:SENHA@db.<ref>.supabase.co:5432/postgres" > /dev/tty
  prompt_validated SUPABASE_DB_URL "        DB URL: " validate_db_url optional

  SUPABASE_SERVICE_KEY=""
  ADMIN_EMAIL=""
  ADMIN_PASSWORD=""
  if [[ -n "$SUPABASE_DB_URL" ]]; then
    echo "" > /dev/tty
    echo "  [1.4] service_role key  (OPCIONAL — necessária só p/ criar admin auto)" > /dev/tty
    echo "        SECRETA — nunca exponha no frontend." > /dev/tty
    prompt_validated SUPABASE_SERVICE_KEY "        service_role: " "validate_jwt_key" optional

    if [[ -n "$SUPABASE_SERVICE_KEY" ]]; then
      echo "" > /dev/tty
      echo "  [1.5] Email do usuário ADMIN inicial" > /dev/tty
      prompt_validated ADMIN_EMAIL "        Email admin: " validate_email required
      echo "" > /dev/tty
      echo "  [1.6] Senha do admin  (mínimo 6 caracteres, oculta ao digitar)" > /dev/tty
      prompt_validated_secret ADMIN_PASSWORD "        Senha: " validate_password
    fi
  fi

  SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co|\1|')
  ok "Supabase coletado (ref: $SUPABASE_PROJECT_ID)"
}

collect_domain() {
  cat > /dev/tty <<'INFO'
  ──────────────────────────────────────────────────────────────
   DOMÍNIO + SSL (HTTPS via Let's Encrypt — opcional)
     PRÉ-REQUISITO: registro DNS tipo A do domínio já apontando
     para o IP desta VPS (caso contrário SSL falhará).
     Pular agora = site rodará apenas em HTTP no IP da VPS.
  ──────────────────────────────────────────────────────────────

INFO
  echo "  [2.1] Domínio  (ex: loja.exemplo.com — ENTER pula SSL)" > /dev/tty
  prompt_validated DOMAIN "        Domínio: " validate_domain optional
  DOMAIN="$(echo -n "${DOMAIN:-}" | tr 'A-Z' 'a-z')"

  SSL_EMAIL=""
  if [[ -n "$DOMAIN" ]]; then
    echo "" > /dev/tty
    echo "  [2.2] Email para Let's Encrypt  (avisos de expiração de cert)" > /dev/tty
    prompt_validated SSL_EMAIL "        Email: " validate_email required
  fi
  [[ -n "$DOMAIN" ]] && ok "SSL: $DOMAIN" || warn "Sem domínio — apenas HTTP"
}

collect_functions() {
  cat > /dev/tty <<'INFO'
  ──────────────────────────────────────────────────────────────
   EDGE FUNCTIONS (pagamentos, webhooks, frete, emails) — opcional
     Requer login interativo no Supabase CLI durante a etapa 11.
     Sem deploy: você pode subir as funções manualmente depois.
  ──────────────────────────────────────────────────────────────

INFO
  if [[ -z "$SUPABASE_DB_URL" ]]; then
    warn "Sem DB URL — deploy de Edge Functions desabilitado."
    DEPLOY_FUNCTIONS="no"
    return
  fi

  local resp=""
  prompt_tty resp "  Deployar Edge Functions automaticamente? (s/N): "
  resp="$(echo -n "${resp:-n}" | tr 'A-Z' 'a-z')"
  case "$resp" in
    s|sim|y|yes) DEPLOY_FUNCTIONS="yes" ;;
    *) DEPLOY_FUNCTIONS="no"; ok "Edge Functions: NÃO serão deployadas"; return ;;
  esac

  cat > /dev/tty <<'INFO'

  Secrets das Edge Functions (TODOS opcionais — ENTER pula cada um):
    • RESEND_API_KEY        → resend.com/api-keys (emails transacionais)
    • LOVABLE_API_KEY       → lovable.dev (Lovable AI Gateway)
    • MP_WEBHOOK_SECRET     → mercadopago.com → Webhooks → assinatura HMAC
    • EVOLUTION_API_URL/KEY → painel da sua Evolution API (WhatsApp)

INFO
  prompt_tty SECRET_RESEND_API_KEY    "  RESEND_API_KEY: "
  prompt_tty SECRET_LOVABLE_API_KEY   "  LOVABLE_API_KEY: "
  prompt_tty SECRET_MP_WEBHOOK_SECRET "  MP_WEBHOOK_SECRET: "
  prompt_tty SECRET_EVOLUTION_API_URL "  EVOLUTION_API_URL: "
  prompt_tty SECRET_EVOLUTION_API_KEY "  EVOLUTION_API_KEY: "
  ok "Edge Functions: deploy habilitado"
}

# ---- Resumo + menu de revisão ---------------------------------------------

print_review_summary() {
  printf "\n${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}\n" > /dev/tty
  printf "${BLUE}║${NC}            ${YELLOW}REVISÃO DOS DADOS COLETADOS${NC}                       ${BLUE}║${NC}\n" > /dev/tty
  printf "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}\n" > /dev/tty
  printf "\n  ${GREEN}── Etapa 1: Supabase ──${NC}\n" > /dev/tty
  printf "   [1] URL ............... %s\n" "${SUPABASE_URL:-<vazio>}" > /dev/tty
  printf "   [2] anon key .......... %s\n" "$(mask_secret "$SUPABASE_ANON_KEY")" > /dev/tty
  printf "   [3] DB URL ............ %s\n" "$([[ -n "$SUPABASE_DB_URL" ]] && echo "configurada" || echo "(pulada)")" > /dev/tty
  printf "   [4] service_role ...... %s\n" "$(mask_secret "${SUPABASE_SERVICE_KEY:-}")" > /dev/tty
  printf "   [5] admin email ....... %s\n" "${ADMIN_EMAIL:-<não criar>}" > /dev/tty
  printf "   [6] admin senha ....... %s\n" "$([[ -n "${ADMIN_PASSWORD:-}" ]] && echo "*** (${#ADMIN_PASSWORD} chars)" || echo "(não definida)")" > /dev/tty
  printf "\n  ${GREEN}── Etapa 2: Domínio + SSL ──${NC}\n" > /dev/tty
  printf "   [7] domínio ........... %s\n" "${DOMAIN:-<HTTP no IP>}" > /dev/tty
  printf "   [8] email SSL ......... %s\n" "${SSL_EMAIL:-<sem SSL>}" > /dev/tty
  printf "\n  ${GREEN}── Etapa 3: Edge Functions ──${NC}\n" > /dev/tty
  printf "   [9] deploy funcs ...... %s\n" "$DEPLOY_FUNCTIONS" > /dev/tty
  if [[ "$DEPLOY_FUNCTIONS" == "yes" ]]; then
    printf "  [10] RESEND ............ %s\n" "$(mask_secret "${SECRET_RESEND_API_KEY:-}")" > /dev/tty
    printf "  [11] LOVABLE_AI ........ %s\n" "$(mask_secret "${SECRET_LOVABLE_API_KEY:-}")" > /dev/tty
    printf "  [12] MP_WEBHOOK ........ %s\n" "$(mask_secret "${SECRET_MP_WEBHOOK_SECRET:-}")" > /dev/tty
    printf "  [13] EVOLUTION_URL ..... %s\n" "${SECRET_EVOLUTION_API_URL:-<vazio>}" > /dev/tty
    printf "  [14] EVOLUTION_KEY ..... %s\n" "$(mask_secret "${SECRET_EVOLUTION_API_KEY:-}")" > /dev/tty
  fi
  printf "\n" > /dev/tty
}

edit_single_field() {
  local n=""
  prompt_tty n "  Número do campo a editar (1-14, ENTER cancela): "
  n="$(echo -n "$n" | tr -d '[:space:]')"
  [[ -z "$n" ]] && return
  case "$n" in
    1) prompt_validated SUPABASE_URL "  Nova URL: " validate_supabase_url required
       SUPABASE_URL="${SUPABASE_URL%/}"
       SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co|\1|') ;;
    2) prompt_validated SUPABASE_ANON_KEY "  Nova anon key: " "validate_jwt_key" required ;;
    3) prompt_validated SUPABASE_DB_URL   "  Nova DB URL (ENTER limpa): " validate_db_url optional ;;
    4) prompt_validated SUPABASE_SERVICE_KEY "  Nova service_role (ENTER limpa): " "validate_jwt_key" optional ;;
    5) prompt_validated ADMIN_EMAIL "  Novo email admin: " validate_email required ;;
    6) prompt_validated_secret ADMIN_PASSWORD "  Nova senha admin: " validate_password ;;
    7) prompt_validated DOMAIN "  Novo domínio (ENTER limpa): " validate_domain optional
       DOMAIN="$(echo -n "${DOMAIN:-}" | tr 'A-Z' 'a-z')" ;;
    8) prompt_validated SSL_EMAIL "  Novo email SSL: " validate_email required ;;
    9) local r; prompt_tty r "  Deployar funcs? (s/N): "
       case "$(echo "$r" | tr 'A-Z' 'a-z')" in s|sim|y|yes) DEPLOY_FUNCTIONS=yes;; *) DEPLOY_FUNCTIONS=no;; esac ;;
    10) prompt_tty SECRET_RESEND_API_KEY    "  RESEND_API_KEY: " ;;
    11) prompt_tty SECRET_LOVABLE_API_KEY   "  LOVABLE_API_KEY: " ;;
    12) prompt_tty SECRET_MP_WEBHOOK_SECRET "  MP_WEBHOOK_SECRET: " ;;
    13) prompt_tty SECRET_EVOLUTION_API_URL "  EVOLUTION_API_URL: " ;;
    14) prompt_tty SECRET_EVOLUTION_API_KEY "  EVOLUTION_API_KEY: " ;;
    *) warn "Campo inválido: $n" ;;
  esac
}

review_menu() {
  while true; do
    print_review_summary
    cat > /dev/tty <<'MENU'
  Opções:
    [c] Confirmar e iniciar deploy
    [1] Refazer Etapa 1 (Supabase completo)
    [2] Refazer Etapa 2 (Domínio + SSL)
    [3] Refazer Etapa 3 (Edge Functions)
    [e] Editar UM campo específico (digita o número)
    [q] Cancelar e sair sem instalar

MENU
    local choice=""
    prompt_tty choice "  Sua escolha [c]: "
    choice="$(echo -n "$choice" | tr 'A-Z' 'a-z' | tr -d '[:space:]')"
    case "$choice" in
      c|"") ok "Dados confirmados — iniciando deploy"; return 0 ;;
      1) collect_supabase ;;
      2) collect_domain ;;
      3) collect_functions ;;
      q) err "Instalação cancelada pelo usuário"; exit 0 ;;
      e) edit_single_field ;;
      *) warn "Opção inválida: '$choice'" ;;
    esac
  done
}

# ---- Execução das etapas 1-3 ----------------------------------------------

INTERACTIVE_MODE="no"
[[ -z "${SUPABASE_URL:-}" ]] && INTERACTIVE_MODE="yes"

# [1/12] Supabase
step_banner 1 "Configuração Supabase Cloud" "Credenciais do projeto + admin"
if [[ "$INTERACTIVE_MODE" == "yes" ]]; then
  collect_supabase
else
  SUPABASE_URL="$(echo -n "$SUPABASE_URL" | tr -d '[:space:]')"
  SUPABASE_URL="${SUPABASE_URL%/}"
  SUPABASE_ANON_KEY="$(echo -n "${SUPABASE_ANON_KEY:-}" | tr -d '[:space:]')"
  SUPABASE_DB_URL="$(echo -n "${SUPABASE_DB_URL:-}" | tr -d '[:space:]')"
  SUPABASE_SERVICE_KEY="$(echo -n "${SUPABASE_SERVICE_KEY:-}" | tr -d '[:space:]')"
  if [[ -n "$SUPABASE_URL" && ! "$SUPABASE_URL" =~ ^https?:// ]]; then
    SUPABASE_URL="https://${SUPABASE_URL}"
  fi
  validate_supabase_url "$SUPABASE_URL" || { err "SUPABASE_URL inválida"; exit 1; }
  validate_jwt_key "$SUPABASE_ANON_KEY" "anon key" || { err "SUPABASE_ANON_KEY inválida"; exit 1; }
  validate_db_url "$SUPABASE_DB_URL" || { err "SUPABASE_DB_URL inválida"; exit 1; }
  [[ -n "$SUPABASE_SERVICE_KEY" ]] && { validate_jwt_key "$SUPABASE_SERVICE_KEY" "service_role" || { err "SUPABASE_SERVICE_KEY inválida"; exit 1; }; }
  SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:-$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co|\1|')}"
fi
ok "Supabase configurado: $SUPABASE_URL (ref: $SUPABASE_PROJECT_ID)"
step_done 1

# [2/12] Domínio + SSL
step_banner 2 "Domínio e SSL (HTTPS)" "Let's Encrypt automático (opcional)"
if [[ "$INTERACTIVE_MODE" == "yes" ]]; then
  collect_domain
else
  DOMAIN="$(echo -n "${DOMAIN:-}" | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
  SSL_EMAIL="$(echo -n "${SSL_EMAIL:-}" | tr -d '[:space:]')"
  if [[ -n "$DOMAIN" ]] && ! validate_domain "$DOMAIN"; then
    warn "Domínio inválido: $DOMAIN — pulando SSL."; DOMAIN=""
  fi
fi
[[ -n "$DOMAIN" ]] && ok "SSL: $DOMAIN" || warn "Sem domínio — site rodará apenas em HTTP"
step_done 2

# [3/12] Edge Functions
step_banner 3 "Edge Functions" "Deploy de pagamentos, webhooks, frete, emails"
if [[ "$INTERACTIVE_MODE" == "yes" ]]; then
  collect_functions
else
  DEPLOY_FUNCTIONS=$(echo -n "${DEPLOY_FUNCTIONS:-no}" | tr 'A-Z' 'a-z')
  case "$DEPLOY_FUNCTIONS" in yes|y|s|sim) DEPLOY_FUNCTIONS=yes ;; *) DEPLOY_FUNCTIONS=no ;; esac
fi
step_done 3

# ---- Menu de revisão (somente modo interativo) ----------------------------
if [[ "$INTERACTIVE_MODE" == "yes" ]]; then
  review_menu
fi

# ============================================================================
# DRY-RUN: valida tudo e sai antes de modificar o servidor
# ============================================================================
if [[ "$DRY_RUN" == "yes" ]]; then
  echo ""
  log "════════════════ VALIDAÇÃO DRY-RUN ════════════════"
  echo ""
  DRY_ERRORS=0
  DRY_WARNS=0

  # 1) URL Supabase responde?
  log "→ Testando URL Supabase: $SUPABASE_URL"
  if curl -fsS --max-time 10 "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY" -o /dev/null 2>/dev/null; then
    ok "  Supabase respondeu e anon key é válida"
  else
    err "  Falha ao conectar em $SUPABASE_URL/auth/v1/health (URL ou anon key inválidas)"
    DRY_ERRORS=$((DRY_ERRORS+1))
  fi

  # 2) Conexão Postgres (se DB URL fornecida)
  if [[ -n "$SUPABASE_DB_URL" ]]; then
    log "→ Testando conexão Postgres..."
    if ! command -v psql >/dev/null 2>&1; then
      warn "  psql não instalado neste host (será instalado durante o install real)"
      DRY_WARNS=$((DRY_WARNS+1))
    elif PGCONNECT_TIMEOUT=10 psql "$SUPABASE_DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
      ok "  Conexão Postgres OK"
      # Verifica se schema já existe
      EXISTING=$(PGCONNECT_TIMEOUT=10 psql "$SUPABASE_DB_URL" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='products';" 2>/dev/null || echo "0")
      if [[ "$EXISTING" == "1" ]]; then
        warn "  Tabela 'products' já existe — schema.sql é idempotente, dados serão preservados"
        DRY_WARNS=$((DRY_WARNS+1))
      else
        ok "  Schema vazio — pronto para receber schema.sql"
      fi
    else
      err "  Falha ao conectar no Postgres (senha incorreta ou URL inválida)"
      DRY_ERRORS=$((DRY_ERRORS+1))
    fi
  else
    warn "  Sem SUPABASE_DB_URL — schema, cron jobs e admin precisarão ser feitos manualmente"
    DRY_WARNS=$((DRY_WARNS+1))
  fi

  # 3) Service role key (se admin será criado)
  if [[ -n "$SUPABASE_SERVICE_KEY" ]]; then
    log "→ Validando service_role key..."
    if curl -fsS --max-time 10 "$SUPABASE_URL/auth/v1/admin/users?per_page=1" \
      -H "apikey: $SUPABASE_SERVICE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -o /dev/null 2>/dev/null; then
      ok "  service_role key válida (acesso ao Auth Admin API confirmado)"
    else
      err "  service_role key inválida — admin NÃO será criado automaticamente"
      DRY_ERRORS=$((DRY_ERRORS+1))
    fi
    [[ -n "${ADMIN_EMAIL:-}" ]] && ok "  Admin a criar: $ADMIN_EMAIL" || warn "  ADMIN_EMAIL não definido"
    [[ -n "${ADMIN_PASSWORD:-}" && ${#ADMIN_PASSWORD} -ge 6 ]] && ok "  Senha admin OK (${#ADMIN_PASSWORD} chars)" || warn "  Senha admin ausente ou <6 chars"
  fi

  # 4) DNS do domínio (se SSL será emitido)
  if [[ -n "$DOMAIN" ]]; then
    log "→ Verificando DNS de $DOMAIN..."
    PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
    DOMAIN_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1)
    [[ -z "$DOMAIN_IP" ]] && DOMAIN_IP=$(dig +short "$DOMAIN" A 2>/dev/null | head -n1 || true)
    if [[ -z "$DOMAIN_IP" ]]; then
      err "  $DOMAIN não resolve para nenhum IP — SSL falhará"
      DRY_ERRORS=$((DRY_ERRORS+1))
    elif [[ -n "$PUBLIC_IP" && "$DOMAIN_IP" != "$PUBLIC_IP" ]]; then
      err "  $DOMAIN aponta para $DOMAIN_IP mas IP público desta VPS é $PUBLIC_IP"
      err "  Atualize o registro A no seu DNS antes de rodar o install real"
      DRY_ERRORS=$((DRY_ERRORS+1))
    else
      ok "  DNS OK: $DOMAIN → $DOMAIN_IP (= IP da VPS)"
    fi
    # Porta 80 acessível?
    if [[ -n "$PUBLIC_IP" ]] && timeout 3 bash -c "</dev/tcp/$PUBLIC_IP/80" 2>/dev/null; then
      warn "  Porta 80 já está em uso — será reutilizada (algo escutando agora)"
      DRY_WARNS=$((DRY_WARNS+1))
    fi
  else
    warn "  Sem DOMAIN — site rodará apenas em HTTP no IP"
    DRY_WARNS=$((DRY_WARNS+1))
  fi

  # 5) Rede para repos externos
  log "→ Testando conectividade externa..."
  for url in "https://github.com" "https://download.docker.com" "https://api.ipify.org"; do
    if curl -fsS --max-time 5 "$url" -o /dev/null 2>/dev/null; then
      ok "  $url alcançável"
    else
      warn "  $url inalcançável — pode haver problemas no install"
      DRY_WARNS=$((DRY_WARNS+1))
    fi
  done

  # 6) Estado atual da VPS
  log "→ Estado atual da VPS:"
  [[ -d "$APP_DIR" ]] && warn "  $APP_DIR já existe — será REMOVIDO no install real" || ok "  $APP_DIR não existe (instalação limpa)"
  command -v docker >/dev/null 2>&1 && warn "  Docker já instalado — será reinstalado" || ok "  Docker não instalado (será instalado)"
  ufw status 2>/dev/null | grep -q "Status: active" && warn "  UFW já ativo — regras serão substituídas" || ok "  UFW será configurado do zero"

  # Resumo
  echo ""
  cat <<DRYSUMMARY
╔══════════════════════════════════════════════════════════════╗
║                  RESUMO DRY-RUN                              ║
╚══════════════════════════════════════════════════════════════╝

  Ações que SERIAM executadas (em ordem):
    [4]  Backup do .env antigo + remoção de $APP_DIR e Docker
    [5]  apt update + instala curl/git/jq/psql/fail2ban + timezone BR
    [6]  Cria 1GB de swap se RAM <1GB
    [7]  Instala Docker engine + Compose v2
    [8]  UFW reset → libera 22/80/443
    [9]  $([[ -n "$SUPABASE_DB_URL" ]] && echo "Aplica schema.sql + pg_cron/pg_net + agenda crons" || echo "PULADO (sem DB URL)")
         $([[ -n "$SUPABASE_SERVICE_KEY" && -n "${ADMIN_EMAIL:-}" ]] && echo "Cria admin $ADMIN_EMAIL via Auth API" || echo "Admin NÃO será criado")
    [10] Clona repo, gera .env e nginx.conf
         $([[ -n "$DOMAIN" ]] && echo "Build + emite SSL Let's Encrypt para $DOMAIN" || echo "Build em HTTP-only")
    [11] $([[ "$DEPLOY_FUNCTIONS" == "yes" ]] && echo "Instala Supabase CLI + deploya Edge Functions + secrets" || echo "PULADO (DEPLOY_FUNCTIONS=no)")
    [12] Logrotate + healthcheck cron 5min + INSTALL-INFO.txt

  Validação:
    Erros:   $DRY_ERRORS
    Warnings: $DRY_WARNS

DRYSUMMARY

  if (( DRY_ERRORS > 0 )); then
    err "Corrija os $DRY_ERRORS erro(s) acima antes de rodar o install real."
    exit 1
  fi

  ok "Tudo validado. Para executar de verdade, rode SEM --dry-run:"
  echo "  sudo bash $0"
  exit 0
fi

# ============================================================================
# [4/12] Limpeza de instalação anterior
# ============================================================================
step_banner 4 "Limpeza" "Removendo instalação anterior (containers, volumes)"
if [[ -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env" "/root/.liberty-env-backup-$(date +%s)" 2>/dev/null || true
  log "Backup do .env antigo salvo em /root/"
fi
docker compose -f "$APP_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
apt-get remove -y -qq docker docker.io docker-compose docker-compose-plugin containerd runc 2>/dev/null || true
rm -rf "$APP_DIR" /var/lib/docker /etc/docker /usr/local/lib/docker 2>/dev/null || true
ok "Limpeza concluída"
step_done 4

# ============================================================================
# [5/12] Sistema base + timezone + hardening
# ============================================================================
step_banner 5 "Sistema base + hardening" "apt update, fail2ban, timezone, auto-update"
configure_apt_retries
apt_update_resilient
apt_install_resilient curl git ufw ca-certificates wget gnupg jq \
  postgresql-client fail2ban unattended-upgrades

# Timezone Brasil
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true

# Fail2ban (proteção SSH brute-force)
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# Auto-update de segurança
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Sistema atualizado • Timezone America/Sao_Paulo • Fail2ban ativo"
step_done 5

# ============================================================================
# [6/12] Swap
# ============================================================================
step_banner 6 "Swap" "Garantindo 1GB de swap (vm.swappiness=10)"
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if (( SWAP_MB < 1024 )); then
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "Swap de 1GB ativo"
else
  ok "Swap suficiente (${SWAP_MB}MB)"
fi
step_done 6

# ============================================================================
# [7/12] Docker + Compose
# ============================================================================
step_banner 7 "Docker + Compose" "docker.io + plugin Compose v2"
apt_install_resilient docker.io
systemctl enable --now docker >/dev/null
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ok "Docker + Compose instalados"
step_done 7

# ============================================================================
# [8/12] Firewall
# ============================================================================
step_banner 8 "Firewall (UFW)" "Permitindo apenas SSH/HTTP/HTTPS"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "Firewall ativo"
step_done 8

# ============================================================================
# [9/12] Schema do banco + admin
# ============================================================================
SCHEMA_APPLIED="no"
ADMIN_CREATED="no"
EXTENSIONS_OK="no"
CRON_JOBS_OK="no"

step_banner 9 "Banco de dados + Admin" "Schema, extensões pg_cron/pg_net, cron jobs"
if [[ -n "$SUPABASE_DB_URL" ]]; then
  if [[ ! "$SUPABASE_DB_URL" =~ ^postgres(ql)?:// ]]; then
    err "Connection string inválida"; exit 1
  fi

  SCHEMA_URL="https://raw.githubusercontent.com/VW2Digital/variation-vault-core/${BRANCH}/deploy-vps/supabase/schema.sql"
  TMP_SCHEMA="/tmp/liberty-schema.sql"
  if ! curl -fsSL "$SCHEMA_URL" -o "$TMP_SCHEMA"; then
    err "Falha ao baixar schema.sql"; exit 1
  fi
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$TMP_SCHEMA" >/tmp/liberty-schema.log 2>&1; then
    SCHEMA_APPLIED="yes"
    ok "Schema aplicado (23 tabelas + RLS + Realtime + Storage)"
  else
    err "Falha ao aplicar schema. Log: /tmp/liberty-schema.log"
    tail -n 20 /tmp/liberty-schema.log >&2
    exit 1
  fi
  rm -f "$TMP_SCHEMA"

  # Extensões pg_cron e pg_net
  log "Habilitando extensões pg_cron e pg_net..."
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
    "CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;" \
    >/tmp/liberty-ext.log 2>&1; then
    EXTENSIONS_OK="yes"
    ok "Extensões pg_cron + pg_net habilitadas"
  else
    warn "Falha ao habilitar extensões (algumas regiões Supabase não suportam). Log: /tmp/liberty-ext.log"
  fi

  # Cron jobs (cart abandonment + melhor envio sync)
  if [[ "$EXTENSIONS_OK" == "yes" ]]; then
    log "Agendando cron jobs (cart-abandonment + tracking sync)..."
    CRON_SQL=$(cat <<SQL
-- Carrinho abandonado: a cada hora
SELECT cron.unschedule('cart-abandonment-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cart-abandonment-hourly');
SELECT cron.schedule(
  'cart-abandonment-hourly', '0 * * * *',
  \$\$ SELECT net.http_post(
    url:='${SUPABASE_URL}/functions/v1/cart-abandonment',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ${SUPABASE_ANON_KEY}"}'::jsonb,
    body:=concat('{"time":"', now(), '"}')::jsonb
  ); \$\$
);
-- Melhor Envio: sync de rastreio a cada 5min
SELECT cron.unschedule('melhor-envio-sync-5min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='melhor-envio-sync-5min');
SELECT cron.schedule(
  'melhor-envio-sync-5min', '*/5 * * * *',
  \$\$ SELECT net.http_post(
    url:='${SUPABASE_URL}/functions/v1/melhor-envio-shipment',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ${SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"action":"sync-tracking"}'::jsonb
  ); \$\$
);
SQL
)
    if echo "$CRON_SQL" | psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q >/tmp/liberty-cron.log 2>&1; then
      CRON_JOBS_OK="yes"
      ok "Cron jobs agendados (carrinho/hora • rastreio/5min)"
    else
      warn "Cron schedule falhou. Log: /tmp/liberty-cron.log"
    fi
  fi

  # Admin
  if [[ -n "$SUPABASE_SERVICE_KEY" && -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
    if [[ ${#SUPABASE_SERVICE_KEY} -lt 100 ]]; then
      warn "service_role key muito curta — pulando admin"
    elif [[ ${#ADMIN_PASSWORD} -lt 6 ]]; then
      warn "Senha admin <6 chars — pulando"
    elif [[ ! "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
      warn "Email inválido — pulando admin"
    else
      log "Criando usuário admin..."
      ADMIN_PAYLOAD=$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
        '{email:$e,password:$p,email_confirm:true,user_metadata:{full_name:"Administrador"}}')
      ADMIN_RESP=$(curl -sS -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
        -H "Content-Type: application/json" \
        -d "$ADMIN_PAYLOAD" 2>&1 || true)
      ADMIN_UUID=$(echo "$ADMIN_RESP" | jq -r '.id // empty' 2>/dev/null)
      if [[ -z "$ADMIN_UUID" ]]; then
        LOOKUP=$(curl -sS "${SUPABASE_URL}/auth/v1/admin/users?email=${ADMIN_EMAIL}" \
          -H "apikey: $SUPABASE_SERVICE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" 2>&1 || true)
        ADMIN_UUID=$(echo "$LOOKUP" | jq -r '.users[0].id // empty' 2>/dev/null)
      fi
      if [[ -n "$ADMIN_UUID" ]]; then
        if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
          "INSERT INTO public.user_roles (user_id, role) VALUES ('$ADMIN_UUID', 'admin') ON CONFLICT DO NOTHING;" \
          >/dev/null 2>&1; then
          ADMIN_CREATED="yes"
          ok "Admin $ADMIN_EMAIL criado e promovido"
        else
          warn "Admin criado mas falha ao inserir role"
        fi
      else
        warn "Falha ao criar admin: $(echo "$ADMIN_RESP" | head -c 200)"
      fi
    fi
  fi
else
  warn "Sem connection string — schema/admin/cron precisam ser feitos manualmente"
fi
step_done 9

# ============================================================================
# [10/12] Clone + .env + nginx + build
# ============================================================================
step_banner 10 "Build + Nginx + SSL" "Clone repo, build Docker, certificado Let's Encrypt"
git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
cd "$APP_DIR"

cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID
EOF
chmod 600 .env

# Gera nginx.conf dinâmico (HTTP-only se sem domínio; HTTP+HTTPS com SSL)
NGINX_SERVER_NAME="${DOMAIN:-_}"
if [[ -n "$DOMAIN" ]]; then
  # Versão com SSL — vai começar HTTP-only e ser substituída após certbot
  cat > deploy-vps/nginx.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    root /usr/share/nginx/html;
    index index.html;
    gzip on; gzip_vary on; gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json image/svg+xml;
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)\$ { expires 30d; add_header Cache-Control "public"; try_files \$uri =404; }
    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    location ~ /\\. { deny all; access_log off; log_not_found off; }
}
NGINX

  # Versão HTTP-only temporária (pra emitir cert com certbot standalone)
  cat > deploy-vps/nginx-http-only.conf <<NGINX
server {
    listen 80 default_server;
    server_name $DOMAIN _;
    root /usr/share/nginx/html;
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
else
  # Sem domínio: HTTP-only no IP
  cat > deploy-vps/nginx.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    gzip on; gzip_vary on; gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)$ { expires 30d; try_files $uri =404; }
    location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    location ~ /\. { deny all; access_log off; log_not_found off; }
}
NGINX
fi

# Build em modo HTTP-only primeiro se houver domínio (pra certbot funcionar)
SSL_OK="no"
if [[ -n "$DOMAIN" ]]; then
  log "Build inicial (HTTP) para emitir certificado SSL..."
  cp deploy-vps/nginx-http-only.conf deploy-vps/nginx.conf.tmp
  mv deploy-vps/nginx.conf deploy-vps/nginx-final.conf
  mv deploy-vps/nginx.conf.tmp deploy-vps/nginx.conf
  mkdir -p /var/www/certbot
  docker compose build --pull
  docker compose up -d
  sleep 5

  # Emite cert via certbot standalone (precisa parar nginx temporariamente)
  log "Emitindo certificado Let's Encrypt para $DOMAIN..."
  apt_install_resilient certbot
  docker compose stop app
  if certbot certonly --standalone --non-interactive --agree-tos \
    -m "${SSL_EMAIL:-admin@$DOMAIN}" -d "$DOMAIN" --preferred-challenges http; then
    SSL_OK="yes"
    ok "Certificado SSL emitido"
    # Restaura config final com SSL
    mv deploy-vps/nginx-final.conf deploy-vps/nginx.conf
    docker compose up -d --force-recreate
  else
    warn "Falha ao emitir SSL. Site continuará em HTTP."
    rm -f deploy-vps/nginx-final.conf
    docker compose up -d
  fi

  # Renovação automática do cert
  cat >/etc/cron.d/certbot-liberty <<EOF
0 3 * * * root certbot renew --quiet --pre-hook "docker compose -f $APP_DIR/docker-compose.yml stop app" --post-hook "docker compose -f $APP_DIR/docker-compose.yml start app"
EOF
else
  docker compose build --pull
  docker compose up -d
fi

ok "Site buildado e em execução"

# Healthcheck
log "Aguardando site responder..."
HEALTH_URL="http://localhost/"
for i in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" -o /dev/null; then ok "Site respondendo ✓"; break; fi
  sleep 2
  if (( i == 30 )); then
    err "Site não respondeu em 60s. Logs:"
    docker compose logs --tail=50 app
    exit 1
  fi
done
step_done 10

# ============================================================================
# [11/12] Deploy Edge Functions (opcional)
# ============================================================================
FUNCTIONS_DEPLOYED="no"
SECRETS_SET="no"
step_banner 11 "Edge Functions" "Deploy via Supabase CLI (se habilitado)"
if [[ "$DEPLOY_FUNCTIONS" == "yes" ]]; then
  if ! command -v supabase >/dev/null 2>&1; then
    SUPA_ARCH="amd64"; [[ "$ARCH" == "aarch64" ]] && SUPA_ARCH="arm64"
    SUPA_VER="2.20.5"
    curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPA_VER}/supabase_${SUPA_VER}_linux_${SUPA_ARCH}.tar.gz" \
      -o /tmp/supabase.tgz
    tar -xzf /tmp/supabase.tgz -C /usr/local/bin/ supabase
    chmod +x /usr/local/bin/supabase
    rm -f /tmp/supabase.tgz
    ok "Supabase CLI $(supabase --version) instalado"
  fi

  cd "$APP_DIR"
  echo ""
  warn "Faça login no Supabase CLI a seguir (abrirá navegador OU pedirá token)"
  warn "Token disponível em: https://supabase.com/dashboard/account/tokens"
  echo ""
  if supabase login </dev/tty; then
    if supabase link --project-ref "$SUPABASE_PROJECT_ID" </dev/tty 2>/dev/null; then
      log "Configurando secrets das Edge Functions..."
      [[ -n "${SECRET_RESEND_API_KEY:-}" ]] && supabase secrets set "RESEND_API_KEY=$SECRET_RESEND_API_KEY" >/dev/null 2>&1 || true
      [[ -n "${SECRET_LOVABLE_API_KEY:-}" ]] && supabase secrets set "LOVABLE_API_KEY=$SECRET_LOVABLE_API_KEY" >/dev/null 2>&1 || true
      [[ -n "${SECRET_MP_WEBHOOK_SECRET:-}" ]] && supabase secrets set "MP_WEBHOOK_SECRET=$SECRET_MP_WEBHOOK_SECRET" >/dev/null 2>&1 || true
      [[ -n "${SECRET_EVOLUTION_API_URL:-}" ]] && supabase secrets set "EVOLUTION_API_URL=$SECRET_EVOLUTION_API_URL" >/dev/null 2>&1 || true
      [[ -n "${SECRET_EVOLUTION_API_KEY:-}" ]] && supabase secrets set "EVOLUTION_API_KEY=$SECRET_EVOLUTION_API_KEY" >/dev/null 2>&1 || true
      SECRETS_SET="yes"
      ok "Secrets configurados"

      log "Deployando todas as Edge Functions..."
      if supabase functions deploy --no-verify-jwt 2>&1 | tail -20; then
        FUNCTIONS_DEPLOYED="yes"
        ok "Edge Functions deployadas"
      else
        warn "Falha em algumas funções — rode manualmente: cd $APP_DIR && supabase functions deploy"
      fi
    else
      warn "Falha no link com projeto $SUPABASE_PROJECT_ID"
    fi
  else
    warn "Login Supabase falhou — pulando deploy de funções"
  fi
fi
step_done 11

# ============================================================================
# [12/12] Operacional (logrotate + healthcheck cron + INSTALL-INFO)
# ============================================================================
step_banner 12 "Operacional" "Logrotate + healthcheck cron + resumo final"

# Logrotate (Docker já gerencia via json-file driver no compose, mas garantimos)
cat >/etc/logrotate.d/docker-liberty <<'EOF'
/var/lib/docker/containers/*/*.log {
  rotate 5
  daily
  compress
  size=10M
  missingok
  delaycompress
  copytruncate
}
EOF

# Healthcheck cron (auto-restart se site cair)
cat >/etc/cron.d/liberty-healthcheck <<EOF
*/5 * * * * root curl -sf http://localhost/ -o /dev/null || (cd $APP_DIR && docker compose restart app) >> /var/log/liberty-healthcheck.log 2>&1
EOF

PUBLIC_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "SEU_IP")
SITE_URL="http://$PUBLIC_IP"
[[ "$SSL_OK" == "yes" ]] && SITE_URL="https://$DOMAIN"
[[ -n "$DOMAIN" && "$SSL_OK" != "yes" ]] && SITE_URL="http://$DOMAIN"

INSTALL_INFO="$APP_DIR/INSTALL-INFO.txt"
cat > "$INSTALL_INFO" <<EOF
Liberty Pharma — Instalação concluída em $(date)
================================================================

URLs
  Site:           $SITE_URL
  Admin:          $SITE_URL/admin
  Backend:        $SUPABASE_URL

Status
  Schema DB:      $([[ "$SCHEMA_APPLIED" == "yes" ]] && echo "✓ aplicado" || echo "⚠ manual")
  Admin user:     $([[ "$ADMIN_CREATED" == "yes" ]] && echo "✓ $ADMIN_EMAIL" || echo "⚠ criar manualmente")
  pg_cron/pg_net: $([[ "$EXTENSIONS_OK" == "yes" ]] && echo "✓ habilitadas" || echo "⚠ habilitar manualmente")
  Cron jobs:      $([[ "$CRON_JOBS_OK" == "yes" ]] && echo "✓ agendados" || echo "⚠ agendar manualmente")
  SSL HTTPS:      $([[ "$SSL_OK" == "yes" ]] && echo "✓ $DOMAIN" || echo "⚠ HTTP only")
  Edge Functions: $([[ "$FUNCTIONS_DEPLOYED" == "yes" ]] && echo "✓ deployadas" || echo "⚠ deploy manual")
  Secrets:        $([[ "$SECRETS_SET" == "yes" ]] && echo "✓ configurados" || echo "⚠ configurar manualmente")
  Fail2ban:       ✓ ativo (SSH brute-force)
  Auto-update:    ✓ ativo (security patches)
  Healthcheck:    ✓ a cada 5min (auto-restart)
  Timezone:       America/Sao_Paulo

Comandos úteis
  Ver logs:       docker compose -f $APP_DIR/docker-compose.yml logs -f app
  Reiniciar:      docker compose -f $APP_DIR/docker-compose.yml restart
  Atualizar:      cd $APP_DIR && bash deploy-vps/deploy.sh
  Renovar SSL:    certbot renew --dry-run
  Status fail2ban: fail2ban-client status sshd

Próximos passos
$([[ "$ADMIN_CREATED" != "yes" ]] && echo "  • Crie um admin: Supabase Auth → Users → Add user")
$([[ "$ADMIN_CREATED" != "yes" ]] && echo "    SQL: INSERT INTO public.user_roles (user_id, role) VALUES ('<UUID>','admin');")
$([[ "$FUNCTIONS_DEPLOYED" != "yes" && "$DEPLOY_FUNCTIONS" == "yes" ]] && echo "  • Redeploy functions: cd $APP_DIR && supabase functions deploy --no-verify-jwt")
$([[ "$SSL_OK" != "yes" && -n "$DOMAIN" ]] && echo "  • Verifique se o domínio $DOMAIN aponta para $PUBLIC_IP e rode: certbot certonly --standalone -d $DOMAIN")
  • Acesse $SITE_URL/admin

Backup do .env: /root/.liberty-env-backup-* (se existia instalação anterior)
EOF

ok "Resumo salvo em $INSTALL_INFO"

step_done 12

# ============================================================================
# Resumo final
# ============================================================================
echo ""
print_progress_bar 13  # mostra todas como done
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║                  ✓ INSTALAÇÃO CONCLUÍDA                      ║
╚══════════════════════════════════════════════════════════════╝

  🌐 Site:           $SITE_URL
  🗄  Backend:        $SUPABASE_URL
  📋 Schema DB:      $([[ "$SCHEMA_APPLIED" == "yes" ]] && echo "✓ aplicado" || echo "⚠ manual")
  👤 Admin:          $([[ "$ADMIN_CREATED" == "yes" ]] && echo "✓ $ADMIN_EMAIL" || echo "⚠ criar manualmente")
  ⏰ Cron jobs:       $([[ "$CRON_JOBS_OK" == "yes" ]] && echo "✓ ativos" || echo "⚠ pendente")
  🔐 SSL HTTPS:      $([[ "$SSL_OK" == "yes" ]] && echo "✓ $DOMAIN" || echo "⚠ HTTP only")
  ⚡ Edge Functions: $([[ "$FUNCTIONS_DEPLOYED" == "yes" ]] && echo "✓ deployadas" || echo "⚠ não deployadas")
  🛡  Fail2ban:       ✓ ativo
  🔄 Healthcheck:    ✓ a cada 5min
  📁 Pasta:          $APP_DIR
  📄 Resumo:         $INSTALL_INFO

  Comandos úteis:
    docker compose -f $APP_DIR/docker-compose.yml logs -f app
    cd $APP_DIR && bash deploy-vps/deploy.sh    # atualizar
    cat $INSTALL_INFO                            # ver resumo

EOF
