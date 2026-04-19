#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Desinstalador completo da VPS
# =============================================================================
# Remove: containers Docker, volumes, imagens, /opt/liberty-pharma,
#         certificados Let's Encrypt, cron jobs (healthcheck + certbot + renew),
#         regras fail2ban, jail SSH custom, regras UFW (opcional),
#         backups do .env em /root/, logs em /var/log/liberty-*
#
# NÃO remove: Docker engine, UFW, fail2ban (pacotes), pacotes apt,
#             dados no Supabase Cloud (banco fica intacto).
#
# Uso (na VPS, como root):
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/uninstall.sh -o /tmp/uninstall.sh
#   sudo bash /tmp/uninstall.sh
#
# Variáveis (modo não-interativo):
#   FORCE=yes               pula as duas confirmações
#   REMOVE_DOCKER=yes       remove também o Docker engine
#   REMOVE_UFW_RULES=yes    reseta regras UFW (mantém SSH)
#   APP_DIR=/opt/liberty-pharma
# =============================================================================

set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
FORCE="${FORCE:-no}"
REMOVE_DOCKER="${REMOVE_DOCKER:-no}"
REMOVE_UFW_RULES="${REMOVE_UFW_RULES:-no}"

[[ $EUID -ne 0 ]] && { err "Rode como root"; exit 1; }

# ---------- TTY ----------
if exec 3</dev/tty 2>/dev/null; then
  TTY_FD=3
elif [[ -t 0 ]]; then
  exec 3<&0; TTY_FD=3
else
  TTY_FD=""
fi

prompt_tty() {
  local __var="$1" __label="$2" __value=""
  if [[ -z "$TTY_FD" ]]; then
    err "Sem terminal interativo. Use FORCE=yes ou baixe o script primeiro:"
    err "  curl -fsSL .../uninstall.sh -o /tmp/uninstall.sh && sudo bash /tmp/uninstall.sh"
    exit 1
  fi
  printf "%s" "$__label" > /dev/tty
  IFS= read -r __value <&3 || true
  printf -v "$__var" '%s' "$__value"
}

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════════╗
║      LIBERTY PHARMA — DESINSTALADOR COMPLETO DA VPS          ║
║      Esta ação é IRREVERSÍVEL no servidor                    ║
╚══════════════════════════════════════════════════════════════╝
BANNER
echo ""

# ---------- Inventário do que será removido ----------
log "Inventário do que será removido:"
echo ""
[[ -d "$APP_DIR" ]] && echo "  • Diretório:           $APP_DIR" || echo "  • Diretório:           (não existe)"

DOMAIN_FOUND=""
if [[ -d /etc/letsencrypt/live ]]; then
  DOMAIN_FOUND=$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -n1 || true)
fi
[[ -n "$DOMAIN_FOUND" ]] && echo "  • Certificado SSL:     /etc/letsencrypt/live/$DOMAIN_FOUND" || echo "  • Certificado SSL:     (nenhum)"

CONTAINERS=$(docker ps -a --filter "label=com.docker.compose.project" --format "{{.Names}}" 2>/dev/null | grep -i liberty || true)
[[ -n "$CONTAINERS" ]] && echo "  • Containers Docker:   $(echo $CONTAINERS | tr '\n' ' ')" || echo "  • Containers Docker:   (nenhum encontrado)"

CRON_FILES=()
[[ -f /etc/cron.d/liberty-healthcheck ]] && CRON_FILES+=("/etc/cron.d/liberty-healthcheck")
[[ -f /etc/cron.d/certbot-liberty ]] && CRON_FILES+=("/etc/cron.d/certbot-liberty")
echo "  • Cron jobs:           ${#CRON_FILES[@]} arquivo(s)"

[[ -f /etc/fail2ban/jail.d/sshd.local ]] && echo "  • Fail2ban jail:       /etc/fail2ban/jail.d/sshd.local" || echo "  • Fail2ban jail:       (não existe)"

BACKUPS=$(ls /root/.liberty-env-backup-* 2>/dev/null | wc -l)
echo "  • Backups do .env:     $BACKUPS arquivo(s) em /root/"

[[ -f /etc/logrotate.d/docker-liberty ]] && echo "  • Logrotate:           /etc/logrotate.d/docker-liberty" || true

echo ""
warn "NÃO será afetado: dados no Supabase Cloud, Docker engine, pacotes apt, UFW (a menos que REMOVE_UFW_RULES=yes)."
echo ""

# ---------- Confirmação dupla ----------
if [[ "$FORCE" != "yes" ]]; then
  prompt_tty CONF1 "  Tem certeza que deseja desinstalar? (yes/no): "
  CONF1=$(echo -n "${CONF1:-no}" | tr 'A-Z' 'a-z')
  if [[ "$CONF1" != "yes" && "$CONF1" != "y" && "$CONF1" != "s" && "$CONF1" != "sim" ]]; then
    log "Cancelado pelo usuário."
    exit 0
  fi

  echo ""
  warn "ÚLTIMA CONFIRMAÇÃO — esta ação removerá tudo listado acima."
  prompt_tty CONF2 "  Digite EXATAMENTE 'EXCLUIR' para confirmar: "
  if [[ "$CONF2" != "EXCLUIR" ]]; then
    log "Texto incorreto. Cancelado por segurança."
    exit 0
  fi
fi

echo ""
log "Iniciando desinstalação..."

# ============================================================================
# [1/8] Para containers e remove volumes/imagens
# ============================================================================
log "[1/8] Parando containers e removendo volumes..."
if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
  docker compose -f "$APP_DIR/docker-compose.yml" down --volumes --remove-orphans 2>/dev/null || true
fi

# Cata qualquer container/imagem residual com nome liberty
docker ps -a --format "{{.ID}} {{.Names}}" 2>/dev/null | grep -i liberty | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true
docker images --format "{{.ID}} {{.Repository}}" 2>/dev/null | grep -i liberty | awk '{print $1}' | xargs -r docker rmi -f 2>/dev/null || true
docker volume ls --format "{{.Name}}" 2>/dev/null | grep -i liberty | xargs -r docker volume rm -f 2>/dev/null || true
ok "Containers, volumes e imagens removidos"

# ============================================================================
# [2/8] Remove diretório da aplicação
# ============================================================================
log "[2/8] Removendo $APP_DIR..."
rm -rf "$APP_DIR" 2>/dev/null || true
ok "Diretório removido"

# ============================================================================
# [3/8] Remove cron jobs
# ============================================================================
log "[3/8] Removendo cron jobs..."
rm -f /etc/cron.d/liberty-healthcheck /etc/cron.d/certbot-liberty 2>/dev/null || true
ok "Cron jobs removidos"

# ============================================================================
# [4/8] Remove certificados Let's Encrypt
# ============================================================================
log "[4/8] Removendo certificados SSL..."
if [[ -n "$DOMAIN_FOUND" ]] && command -v certbot >/dev/null 2>&1; then
  certbot delete --cert-name "$DOMAIN_FOUND" --non-interactive 2>/dev/null || true
  ok "Certificado $DOMAIN_FOUND removido"
else
  rm -rf /etc/letsencrypt/live/* /etc/letsencrypt/archive/* /etc/letsencrypt/renewal/*.conf 2>/dev/null || true
  ok "Diretórios Let's Encrypt limpos"
fi
rm -rf /var/www/certbot 2>/dev/null || true

# ============================================================================
# [5/8] Reverte fail2ban jail customizada
# ============================================================================
log "[5/8] Removendo jail customizada do fail2ban..."
if [[ -f /etc/fail2ban/jail.d/sshd.local ]]; then
  rm -f /etc/fail2ban/jail.d/sshd.local
  systemctl restart fail2ban 2>/dev/null || true
  ok "Jail SSH customizada removida (serviço fail2ban mantido ativo)"
else
  ok "Nenhuma jail custom encontrada"
fi

# ============================================================================
# [6/8] Logrotate, logs e backups
# ============================================================================
log "[6/8] Removendo logrotate, logs e backups antigos..."
rm -f /etc/logrotate.d/docker-liberty 2>/dev/null || true
rm -f /var/log/liberty-healthcheck.log /tmp/liberty-*.log 2>/dev/null || true
rm -f /root/.liberty-env-backup-* 2>/dev/null || true
ok "Logs e backups limpos"

# ============================================================================
# [7/8] Regras UFW (opcional)
# ============================================================================
if [[ "$REMOVE_UFW_RULES" == "yes" ]]; then
  log "[7/8] Resetando UFW (mantendo apenas SSH)..."
  ufw --force reset >/dev/null 2>&1 || true
  ufw default deny incoming >/dev/null 2>&1 || true
  ufw default allow outgoing >/dev/null 2>&1 || true
  ufw allow 22/tcp comment 'SSH' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "UFW resetado (porta 22 liberada)"
else
  log "[7/8] UFW preservado (use REMOVE_UFW_RULES=yes para resetar)"
fi

# ============================================================================
# [8/8] Docker engine (opcional)
# ============================================================================
if [[ "$REMOVE_DOCKER" == "yes" ]]; then
  log "[8/8] Removendo Docker engine..."
  systemctl stop docker docker.socket 2>/dev/null || true
  apt-get remove -y -qq docker.io docker-compose-plugin containerd runc 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
  rm -rf /var/lib/docker /etc/docker /usr/local/lib/docker 2>/dev/null || true
  ok "Docker removido"
else
  log "[8/8] Docker engine preservado (use REMOVE_DOCKER=yes para remover)"
fi

# ============================================================================
# Resumo
# ============================================================================
echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║              ✓ DESINSTALAÇÃO CONCLUÍDA                       ║
╚══════════════════════════════════════════════════════════════╝

  Removido:
    - Containers, volumes e imagens Docker
    - $APP_DIR
    - Cron jobs (healthcheck + certbot)
    - Certificados Let's Encrypt
    - Jail SSH customizada do fail2ban
    - Logs e backups do .env

  Preservado:
    - Banco Supabase Cloud (intacto, dados seguros)
    - Pacotes apt (curl, git, postgresql-client, fail2ban, etc)
    $([[ "$REMOVE_DOCKER" != "yes" ]] && echo "- Docker engine (use REMOVE_DOCKER=yes para remover)")
    $([[ "$REMOVE_UFW_RULES" != "yes" ]] && echo "- Regras UFW atuais (use REMOVE_UFW_RULES=yes para resetar)")

  Para reinstalar:
    curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh
    sudo bash /tmp/install.sh

EOF
