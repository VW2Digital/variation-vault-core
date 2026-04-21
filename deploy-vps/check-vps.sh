#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — check-vps.sh
# Diagnóstico standalone para validar se uma VPS está pronta para o deploy.
# Não modifica nada. Pode rodar sem root (alguns checks ficarão limitados).
#
# USO:
#   curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/check-vps.sh -o /tmp/check-vps.sh
#   bash /tmp/check-vps.sh                  # diagnóstico básico
#   bash /tmp/check-vps.sh --domain meusite.com   # valida DNS também
#   bash /tmp/check-vps.sh --supabase       # valida requisitos p/ Supabase self-hosted
#   bash /tmp/check-vps.sh --json           # saída JSON para automação
# =============================================================================

set -uo pipefail

# ---------- args -------------------------------------------------------------
DOMAIN=""
CHECK_SUPABASE=0
JSON_OUTPUT=0
for arg in "$@"; do
  case "$arg" in
    --domain=*)  DOMAIN="${arg#*=}" ;;
    --domain)    shift; DOMAIN="${1:-}" ;;
    --supabase)  CHECK_SUPABASE=1 ;;
    --json)      JSON_OUTPUT=1 ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
  shift 2>/dev/null || true
done

# ---------- estética ---------------------------------------------------------
if [ "$JSON_OUTPUT" = "1" ]; then
  RED=''; GRN=''; YLW=''; BLU=''; BLD=''; NC=''
else
  RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
  BLU='\033[0;34m'; BLD='\033[1m'; NC='\033[0m'
fi

ERRORS=0
WARNS=0
PASSES=0
RESULTS=()  # "status|categoria|nome|detalhe|fix"

record() {
  # status: pass|warn|fail   categoria: nome amigável
  local status="$1" cat="$2" name="$3" detail="$4" fix="${5:-}"
  RESULTS+=("$status|$cat|$name|$detail|$fix")
  case "$status" in
    pass) PASSES=$((PASSES+1)) ;;
    warn) WARNS=$((WARNS+1)) ;;
    fail) ERRORS=$((ERRORS+1)) ;;
  esac
  [ "$JSON_OUTPUT" = "1" ] && return
  case "$status" in
    pass) printf "  ${GRN}✓${NC} %-32s ${NC}%s\n"   "$name" "$detail" ;;
    warn) printf "  ${YLW}!${NC} %-32s ${YLW}%s${NC}\n" "$name" "$detail" ;;
    fail) printf "  ${RED}✗${NC} %-32s ${RED}%s${NC}\n" "$name" "$detail" ;;
  esac
  [ -n "$fix" ] && [ "$status" != "pass" ] && \
    printf "      ${BLU}↳ fix:${NC} %s\n" "$fix"
}

section() {
  [ "$JSON_OUTPUT" = "1" ] && return
  echo
  echo -e "${BLD}${BLU}▼ $*${NC}"
}

header() {
  [ "$JSON_OUTPUT" = "1" ] && return
  echo -e "${BLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLD}║           Liberty Pharma — Diagnóstico de VPS                ║${NC}"
  echo -e "${BLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo "Host: $(hostname 2>/dev/null || echo '?')   |   Data: $(date -Iseconds 2>/dev/null || date)"
}
header

# =============================================================================
# 1. Sistema
# =============================================================================
section "1. Sistema operacional"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu)
      VER_NUM="${VERSION_ID%%.*}"
      if [ "${VER_NUM:-0}" -ge 20 ]; then
        record pass "system" "OS"  "$PRETTY_NAME"
      else
        record warn "system" "OS"  "$PRETTY_NAME (recomendado 20.04+)"
      fi
      ;;
    debian)
      VER_NUM="${VERSION_ID%%.*}"
      if [ "${VER_NUM:-0}" -ge 11 ]; then
        record pass "system" "OS"  "$PRETTY_NAME"
      else
        record warn "system" "OS"  "$PRETTY_NAME (recomendado 11+)"
      fi
      ;;
    *)
      record warn "system" "OS"  "$PRETTY_NAME (não testado — script usa apt)" \
        "Use Ubuntu 20.04+ ou Debian 11+"
      ;;
  esac
else
  record fail "system" "OS"  "/etc/os-release ausente" \
    "Use uma distro Linux moderna (Ubuntu/Debian)"
fi

ARCH=$(uname -m 2>/dev/null || echo "?")
case "$ARCH" in
  x86_64|amd64|aarch64|arm64)
    record pass "system" "Arquitetura" "$ARCH"
    ;;
  *)
    record warn "system" "Arquitetura" "$ARCH (Docker images podem não existir)"
    ;;
esac

KERNEL=$(uname -r 2>/dev/null || echo "?")
record pass "system" "Kernel"      "$KERNEL"

# =============================================================================
# 2. Recursos
# =============================================================================
section "2. Recursos (CPU / RAM / Disco)"

CPU_CORES=$(nproc 2>/dev/null || echo 1)
if [ "$CPU_CORES" -ge 2 ]; then
  record pass "resources" "CPU" "$CPU_CORES vCPUs"
elif [ "$CPU_CORES" -eq 1 ]; then
  record warn "resources" "CPU" "$CPU_CORES vCPU — build do Vite vai demorar 8-15 min" \
    "Use VPS com 2+ vCPUs para build mais rápido"
else
  record fail "resources" "CPU" "Não consegui detectar CPU"
fi

MEM_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
MEM_REQ=900
[ "$CHECK_SUPABASE" = "1" ] && MEM_REQ=3500
if [ "$MEM_MB" -ge "$MEM_REQ" ]; then
  record pass "resources" "RAM" "${MEM_MB} MB total"
elif [ "$MEM_MB" -ge 900 ]; then
  if [ "$CHECK_SUPABASE" = "1" ]; then
    record warn "resources" "RAM" "${MEM_MB} MB (Supabase self-hosted recomenda 4 GB)" \
      "Ou rode só o app + Lovable Cloud (1 GB basta)"
  else
    record pass "resources" "RAM" "${MEM_MB} MB total"
  fi
else
  record fail "resources" "RAM" "${MEM_MB} MB — abaixo do mínimo 1024 MB" \
    "Faça upgrade do plano da VPS"
fi

SWAP_MB=$(awk '/SwapTotal/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
if [ "$SWAP_MB" -gt 0 ]; then
  record pass "resources" "Swap" "${SWAP_MB} MB"
elif [ "$MEM_MB" -lt 2000 ]; then
  record warn "resources" "Swap" "Sem swap (RAM baixa, OOM provável no build)" \
    "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
else
  record pass "resources" "Swap" "Sem swap (RAM suficiente)"
fi

DISK_KB=$(df -P / 2>/dev/null | awk 'NR==2 {print $4}')
DISK_GB=$(( ${DISK_KB:-0} / 1024 / 1024 ))
[ "$DISK_GB" -gt 99999 ] && DISK_GB=99999
DISK_REQ=8
[ "$CHECK_SUPABASE" = "1" ] && DISK_REQ=20
if [ "$DISK_GB" -ge "$DISK_REQ" ]; then
  record pass "resources" "Disco livre /" "${DISK_GB} GB"
elif [ "$DISK_GB" -ge 5 ]; then
  record warn "resources" "Disco livre /" "${DISK_GB} GB (mínimo recomendado: ${DISK_REQ} GB)" \
    "Limpe com: docker system prune -a  e  apt-get clean"
else
  record fail "resources" "Disco livre /" "${DISK_GB} GB — crítico" \
    "Aumente o disco da VPS ou limpe arquivos"
fi

# =============================================================================
# 3. Rede
# =============================================================================
section "3. Rede e portas"

# IP público
IP_PUB=$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || echo "")
if [ -n "$IP_PUB" ]; then
  record pass "network" "IP público" "$IP_PUB"
else
  record warn "network" "IP público" "Não consegui detectar (firewall/sem internet?)"
fi

# Função para checar porta
check_port() {
  local port="$1" label="$2" required="$3" fix="$4"
  local in_use=""
  if command -v ss >/dev/null 2>&1; then
    in_use=$(ss -ltnH "sport = :$port" 2>/dev/null | head -1)
  elif command -v netstat >/dev/null 2>&1; then
    in_use=$(netstat -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p {print; exit}')
  else
    record warn "network" "Porta $port ($label)" "ss/netstat ausentes — não consegui verificar"
    return
  fi
  if [ -z "$in_use" ]; then
    record pass "network" "Porta $port ($label)" "livre"
  else
    local proc
    proc=$(echo "$in_use" | awk '{print $NF}' | head -c50)
    if [ "$required" = "1" ]; then
      record fail "network" "Porta $port ($label)" "OCUPADA por: $proc" "$fix"
    else
      record warn "network" "Porta $port ($label)" "ocupada: $proc" "$fix"
    fi
  fi
}

check_port 80  "HTTP"     1 "Pare o serviço atual (apache/nginx): systemctl stop nginx apache2"
check_port 443 "HTTPS"    1 "Pare o serviço atual (apache/nginx): systemctl stop nginx apache2"

# SSH (devemos estar usando, então DEVE estar ocupado)
if command -v ss >/dev/null 2>&1 && ss -ltnH 'sport = :22' 2>/dev/null | grep -q .; then
  record pass "network" "Porta 22 (SSH)" "ativa (você não vai se trancar fora)"
else
  record warn "network" "Porta 22 (SSH)" "não está LISTEN" \
    "Confirme acesso por outra via antes de continuar"
fi

if [ "$CHECK_SUPABASE" = "1" ]; then
  check_port 5432 "Postgres" 0 "Mude SB_PG_PORT no install.sh"
  check_port 3001 "Studio"   0 "Mude SB_STUDIO_PORT no install.sh"
fi

# Conectividade externa
for url_pair in \
  "github.com|GitHub (clone do repo)" \
  "registry-1.docker.io/v2/|Docker Hub" \
  "get.docker.com|Script Docker" \
  "deb.debian.org|Repos APT"; do
  url="${url_pair%|*}"
  label="${url_pair##*|}"
  if curl -fsS -m 6 -o /dev/null "https://$url" 2>/dev/null; then
    record pass "network" "$label" "alcançável"
  else
    record fail "network" "$label" "inalcançável (firewall outbound?)" \
      "Libere saída HTTPS (443) na VPS"
  fi
done

# =============================================================================
# 4. DNS (se domínio fornecido)
# =============================================================================
if [ -n "$DOMAIN" ]; then
  section "4. DNS para $DOMAIN"
  if command -v dig >/dev/null 2>&1; then
    DNS_IP=$(dig +short A "$DOMAIN" @1.1.1.1 2>/dev/null | tail -1)
  elif command -v host >/dev/null 2>&1; then
    DNS_IP=$(host "$DOMAIN" 1.1.1.1 2>/dev/null | awk '/has address/ {print $4; exit}')
  elif command -v getent >/dev/null 2>&1; then
    DNS_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')
  else
    DNS_IP=""
  fi

  if [ -z "$DNS_IP" ]; then
    record fail "dns" "Resolução de $DOMAIN" "DNS não resolve" \
      "Crie registro A no painel do domínio: $DOMAIN → $IP_PUB"
  elif [ "$DNS_IP" = "$IP_PUB" ]; then
    record pass "dns" "Resolução de $DOMAIN" "→ $DNS_IP (bate com IP da VPS)"
  else
    record fail "dns" "Resolução de $DOMAIN" "→ $DNS_IP, mas VPS é $IP_PUB" \
      "Atualize o registro A: $DOMAIN → $IP_PUB (TTL pode levar minutos)"
  fi
fi

# =============================================================================
# 5. Software
# =============================================================================
section "5. Software"

# Privilégios
if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  record pass "privileges" "Root" "uid=0"
else
  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      record pass "privileges" "Sudo sem senha" "ok"
    else
      record warn "privileges" "Privilégios" "rodando como $(id -un) — install.sh exige root" \
        "Use: sudo bash install.sh"
    fi
  else
    record fail "privileges" "Privilégios" "sem root e sem sudo" \
      "Logue como root"
  fi
fi

# Comandos básicos
for cmd in curl git tar gzip; do
  if command -v "$cmd" >/dev/null 2>&1; then
    record pass "software" "$cmd" "$(command -v "$cmd")"
  else
    record warn "software" "$cmd" "ausente — install.sh tentará instalar via apt"
  fi
done

# Docker
if command -v docker >/dev/null 2>&1; then
  DV=$(docker --version 2>/dev/null | head -c80)
  record pass "software" "Docker" "$DV"
  if docker info >/dev/null 2>&1; then
    record pass "software" "Docker daemon" "respondendo"
  else
    record fail "software" "Docker daemon" "não responde" \
      "systemctl start docker  (e adicione seu user ao grupo: usermod -aG docker \$USER)"
  fi
  if docker compose version >/dev/null 2>&1; then
    DCV=$(docker compose version --short 2>/dev/null || echo "presente")
    record pass "software" "Docker Compose" "v$DCV"
  else
    record warn "software" "Docker Compose" "plugin ausente" \
      "apt-get install docker-compose-plugin"
  fi
else
  record warn "software" "Docker" "não instalado — install.sh instala automaticamente" \
    "Ou pré-instale via apt: apt-get install -y docker.io docker-compose-v2"
fi

# Firewall ativo?
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  if ufw status 2>/dev/null | grep -qE '80(/tcp)?\s+ALLOW'; then
    record pass "firewall" "UFW" "ativo, porta 80 liberada"
  else
    record warn "firewall" "UFW" "ativo mas porta 80 NÃO liberada" \
      "ufw allow 80/tcp && ufw allow 443/tcp"
  fi
fi

# =============================================================================
# Resumo
# =============================================================================
if [ "$JSON_OUTPUT" = "1" ]; then
  echo "{"
  echo "  \"summary\": { \"pass\": $PASSES, \"warn\": $WARNS, \"fail\": $ERRORS },"
  echo "  \"ready_to_install\": $([ "$ERRORS" -eq 0 ] && echo true || echo false),"
  echo "  \"results\": ["
  first=1
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status cat name detail fix <<<"$r"
    [ $first -eq 0 ] && echo ","
    first=0
    detail_esc=$(printf '%s' "$detail" | sed 's/\\/\\\\/g; s/"/\\"/g')
    fix_esc=$(printf '%s' "$fix" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '    {"status":"%s","category":"%s","name":"%s","detail":"%s","fix":"%s"}' \
      "$status" "$cat" "$name" "$detail_esc" "$fix_esc"
  done
  echo
  echo "  ]"
  echo "}"
  [ "$ERRORS" -eq 0 ] && exit 0 || exit 1
fi

echo
echo -e "${BLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLD}RESUMO:${NC} ${GRN}${PASSES} ok${NC}   ${YLW}${WARNS} avisos${NC}   ${RED}${ERRORS} erros${NC}"

if [ "$ERRORS" -eq 0 ] && [ "$WARNS" -eq 0 ]; then
  echo -e "${GRN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GRN}║  ✓ VPS 100% PRONTA para instalar o Liberty Pharma           ║${NC}"
  echo -e "${GRN}╚══════════════════════════════════════════════════════════════╝${NC}"
  EXIT=0
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "${YLW}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YLW}║  ⚠ VPS instalável, mas com $WARNS aviso(s) — leia os 'fix' acima ║${NC}"
  echo -e "${YLW}╚══════════════════════════════════════════════════════════════╝${NC}"
  EXIT=0
else
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ VPS NÃO está pronta — corrija os $ERRORS erro(s) acima       ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
  EXIT=1
fi

echo
echo -e "${BLD}Próximos passos:${NC}"
if [ "$ERRORS" -eq 0 ]; then
  echo "  1. curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh"
  echo "  2. sudo bash /tmp/install.sh"
  [ -n "$DOMAIN" ] && \
    echo "  3. sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl.sh $DOMAIN seu@email.com"
else
  echo "  1. Resolva os erros marcados com ${RED}✗${NC} acima"
  echo "  2. Rode novamente: bash $0 ${DOMAIN:+--domain $DOMAIN}${CHECK_SUPABASE:+ --supabase}"
  echo "  3. Quando tudo verde: sudo bash install.sh"
fi
echo

exit $EXIT
