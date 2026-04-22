#!/usr/bin/env bash
# =============================================================================
# setup-vps-smtp.sh — Preparação completa de VPS (Ubuntu/Debian) para Docker
#                    + configuração e diagnóstico de SMTP
# -----------------------------------------------------------------------------
# Uso:
#   sudo bash setup-vps-smtp.sh                  # interativo
#   sudo SMTP_HOST=smtp.hostinger.com \
#        SMTP_PORT=465 \
#        bash setup-vps-smtp.sh                  # com variáveis pré-definidas
#
# Requisitos:
#   - Ubuntu 20.04+ ou Debian 11+
#   - Acesso root (sudo)
#   - Conexão à internet
#
# O script é IDEMPOTENTE: pode ser executado várias vezes sem efeitos colaterais.
# =============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

# -----------------------------------------------------------------------------
# Cores e helpers de log
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  readonly C_RESET="\033[0m"
  readonly C_BOLD="\033[1m"
  readonly C_DIM="\033[2m"
  readonly C_RED="\033[31m"
  readonly C_GREEN="\033[32m"
  readonly C_YELLOW="\033[33m"
  readonly C_BLUE="\033[34m"
  readonly C_CYAN="\033[36m"
else
  readonly C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_CYAN=""
fi

log_step()    { echo -e "\n${C_BOLD}${C_BLUE}▶ $*${C_RESET}"; }
log_info()    { echo -e "  ${C_CYAN}ℹ${C_RESET} $*"; }
log_ok()      { echo -e "  ${C_GREEN}✔${C_RESET} $*"; }
log_warn()    { echo -e "  ${C_YELLOW}⚠${C_RESET} $*"; }
log_error()   { echo -e "  ${C_RED}✘${C_RESET} $*" >&2; }
log_section() {
  echo -e "\n${C_BOLD}${C_CYAN}═══════════════════════════════════════════════════════════════════${C_RESET}"
  echo -e "${C_BOLD}${C_CYAN}  $*${C_RESET}"
  echo -e "${C_BOLD}${C_CYAN}═══════════════════════════════════════════════════════════════════${C_RESET}"
}

# Erro fatal com contexto
on_error() {
  local exit_code=$?
  local line_no=$1
  log_error "Falha na linha ${line_no} (exit ${exit_code}). Abortando."
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# -----------------------------------------------------------------------------
# Pré-requisitos
# -----------------------------------------------------------------------------
require_root() {
  if [[ $EUID -ne 0 ]]; then
    log_error "Este script precisa ser executado como root. Use: sudo bash $0"
    exit 1
  fi
}

detect_os() {
  if [[ ! -f /etc/os-release ]]; then
    log_error "Sistema operacional não suportado (faltando /etc/os-release)."
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) log_ok "SO detectado: ${PRETTY_NAME}" ;;
    *) log_error "SO não suportado: ${ID:-desconhecido}. Use Ubuntu ou Debian."; exit 1 ;;
  esac
}

# -----------------------------------------------------------------------------
# 1. Atualização do sistema
# -----------------------------------------------------------------------------
update_system() {
  log_step "1/8 Atualizando índices do APT e pacotes do sistema"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
  apt-get autoremove -y
  log_ok "Sistema atualizado"
}

# -----------------------------------------------------------------------------
# 2. Instalação de dependências essenciais
# -----------------------------------------------------------------------------
install_dependencies() {
  log_step "2/8 Instalando dependências essenciais"

  local pkgs=(
    curl wget git unzip zip nano
    ufw net-tools software-properties-common
    ca-certificates openssl
    telnet netcat-openbsd
    python3 python3-pip python3-venv python3-dev
    build-essential
    docker.io docker-compose
  )

  log_info "Pacotes: ${pkgs[*]}"
  apt-get install -y "${pkgs[@]}"
  log_ok "Dependências instaladas"
}

# -----------------------------------------------------------------------------
# 3. Configuração do Docker
# -----------------------------------------------------------------------------
configure_docker() {
  log_step "3/8 Habilitando e iniciando o Docker"
  systemctl enable docker >/dev/null 2>&1 || true
  systemctl start docker

  if systemctl is-active --quiet docker; then
    log_ok "Docker ativo: $(docker --version)"
  else
    log_error "Docker não iniciou corretamente"
    exit 1
  fi

  # Adiciona usuário invocador (SUDO_USER) ao grupo docker — opcional
  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    if id -nG "${SUDO_USER}" | grep -qw docker; then
      log_info "Usuário '${SUDO_USER}' já está no grupo docker"
    else
      usermod -aG docker "${SUDO_USER}"
      log_ok "Usuário '${SUDO_USER}' adicionado ao grupo docker (faça logout/login para aplicar)"
    fi
  fi
}

# -----------------------------------------------------------------------------
# 4. Firewall (UFW)
# -----------------------------------------------------------------------------
configure_firewall() {
  log_step "4/8 Configurando firewall (UFW)"

  # Política padrão segura
  ufw default deny incoming  >/dev/null
  ufw default allow outgoing >/dev/null

  # Portas obrigatórias
  local ports=(22 80 443 465 587)
  for p in "${ports[@]}"; do
    if ufw status | grep -qE "^${p}(/tcp)?\s"; then
      log_info "Porta ${p} já liberada"
    else
      ufw allow "${p}/tcp" >/dev/null
      log_ok "Porta ${p}/tcp liberada"
    fi
  done

  # Ativa firewall sem prompt interativo
  if ufw status | grep -q "Status: active"; then
    log_info "UFW já está ativo"
  else
    yes | ufw enable >/dev/null
    log_ok "UFW ativado"
  fi

  ufw status verbose | sed 's/^/    /'
}

# -----------------------------------------------------------------------------
# 5. Arquivo .env de exemplo (SMTP)
# -----------------------------------------------------------------------------
create_smtp_env() {
  log_step "5/8 Criando arquivo .env.smtp.example"

  local target_dir="${SMTP_ENV_DIR:-/opt/smtp-config}"
  local target_file="${target_dir}/.env.smtp.example"

  mkdir -p "${target_dir}"

  if [[ -f "${target_file}" ]]; then
    log_warn "Arquivo já existe: ${target_file} (não será sobrescrito)"
  else
    cat > "${target_file}" <<'ENV'
# =============================================================================
# .env.smtp.example — Configuração SMTP (template)
# Copie para `.env` no diretório da sua aplicação e preencha com dados reais.
# NUNCA commite o arquivo .env final em repositórios públicos.
# =============================================================================

# Host do servidor SMTP (ex.: smtp.hostinger.com, smtp.gmail.com)
SMTP_HOST=smtp.seu-provedor.com

# Porta SMTP:
#   465 — SSL/TLS (recomendado)
#   587 — STARTTLS
#   25  — sem criptografia (não recomendado)
SMTP_PORT=465

# Use "true" para SSL/TLS direto (porta 465) ou "false" para STARTTLS (porta 587)
SMTP_SECURE=true

# Credenciais de autenticação
SMTP_USER=seu-email@dominio.com
SMTP_PASS=sua_senha_smtp_aqui

# Identidade do remetente
SMTP_FROM=seu-email@dominio.com
SMTP_FROM_NAME="Sua Empresa"
ENV
    chmod 600 "${target_file}"
    log_ok "Template criado: ${target_file} (permissões 600)"
  fi
}

# -----------------------------------------------------------------------------
# 6. Teste de conectividade SMTP
# -----------------------------------------------------------------------------
test_smtp_connectivity() {
  log_step "6/8 Testando conectividade SMTP"

  local host="${SMTP_HOST:-smtp.hostinger.com}"
  local ports=("${SMTP_PORT:-465}" 587)

  log_info "Host de teste: ${host}"
  log_info "Portas testadas: ${ports[*]}"
  log_info "Defina SMTP_HOST e SMTP_PORT como variáveis de ambiente para customizar."

  for port in "${ports[@]}"; do
    if nc -vz -w 5 "${host}" "${port}" 2>&1 | tee /tmp/smtp_test_${port}.log | grep -qE "succeeded|open"; then
      log_ok "Conexão TCP com ${host}:${port} OK"
    else
      log_warn "Não foi possível conectar a ${host}:${port}"
      sed 's/^/      /' /tmp/smtp_test_${port}.log || true
    fi
    rm -f "/tmp/smtp_test_${port}.log"
  done

  # Teste do banner SSL na porta 465 (se host customizado)
  if command -v openssl >/dev/null 2>&1; then
    log_info "Verificando banner TLS em ${host}:465 (timeout 5s)..."
    if timeout 5 bash -c "echo QUIT | openssl s_client -connect ${host}:465 -servername ${host} -quiet 2>/dev/null | head -n 1" \
       | grep -qE "^220 "; then
      log_ok "Banner SMTP/TLS recebido — handshake bem-sucedido"
    else
      log_warn "Banner SMTP/TLS não recebido (pode ser firewall do provedor ou host inválido)"
    fi
  fi
}

# -----------------------------------------------------------------------------
# 7/8. Resumo final e instruções
# -----------------------------------------------------------------------------
print_summary() {
  log_section "✓ Setup concluído com sucesso"

  cat <<'EOF'

  PRÓXIMOS PASSOS:

  1. Configure suas credenciais SMTP reais
     - Edite: /opt/smtp-config/.env.smtp.example
     - Copie para o diretório da sua aplicação como `.env`
     - Garanta que SMTP_PASS é a SENHA DE APP (não a senha da conta de e-mail)

  2. Confirme o uso correto de criptografia
     - Porta 465 → SMTP_SECURE=true   (SSL/TLS direto, recomendado)
     - Porta 587 → SMTP_SECURE=false  (STARTTLS)
     - Hostinger, Gmail, Outlook: use 465 com SSL sempre que possível

  3. Reinicie o Docker se modificou /etc/docker/daemon.json
         sudo systemctl restart docker

  4. Rebuild dos containers da aplicação
         cd /caminho/da/sua/aplicacao
         docker compose down && docker compose up -d --build

  5. Teste manual de envio (após preencher o .env)
         # via swaks (instale com: apt-get install -y swaks)
         swaks --to destino@exemplo.com \
               --from "$SMTP_FROM" \
               --server "$SMTP_HOST:$SMTP_PORT" \
               --auth-user "$SMTP_USER" \
               --auth-password "$SMTP_PASS" \
               --tls-on-connect

  TROUBLESHOOTING:
    • Conexão recusada na 465/587 → verifique firewall do provedor de hospedagem
    • "535 Authentication failed" → confira usuário/senha e habilite "App Password"
    • "550 sender rejected"       → SMTP_FROM precisa ser um e-mail do domínio autenticado
    • E-mails caindo em spam      → configure SPF, DKIM e DMARC no DNS do domínio

  ARQUIVOS RELEVANTES:
    • Template SMTP : /opt/smtp-config/.env.smtp.example
    • UFW status    : sudo ufw status verbose
    • Docker status : sudo systemctl status docker

EOF
}

# -----------------------------------------------------------------------------
# Orquestração principal
# -----------------------------------------------------------------------------
main() {
  log_section "VPS Setup — Docker + SMTP (Ubuntu/Debian)"
  require_root
  detect_os

  update_system
  install_dependencies
  configure_docker
  configure_firewall
  create_smtp_env
  test_smtp_connectivity
  print_summary

  log_step "8/8 Tudo pronto 🚀"
}

main "$@"