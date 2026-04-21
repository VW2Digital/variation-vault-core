#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Emissão/Re-emissão de SSL (Let's Encrypt)
# =============================================================================
# Use APÓS o DNS já estar apontado para o IP da VPS.
#
# Uso (na VPS):
#   sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl.sh seudominio.com seu@email.com
#
# Exemplo:
#   sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl.sh luminaeliberty.net admin@luminaeliberty.net
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()  { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR ]${NC} $*" >&2; }

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/opt/liberty-pharma}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  err "Uso: sudo bash $0 <dominio> <email>"
  err "Ex:  sudo bash $0 luminaeliberty.net admin@luminaeliberty.net"
  exit 1
fi

cd "$APP_DIR"

# 1. Confere DNS
log "Verificando se $DOMAIN aponta para esta VPS..."
VPS_IP=$(curl -s ifconfig.me || echo "")
DOMAIN_IP=$(dig +short "$DOMAIN" | tail -n1 || echo "")

if [[ -z "$VPS_IP" ]]; then
  warn "Não consegui detectar o IP da VPS, prosseguindo mesmo assim."
elif [[ -z "$DOMAIN_IP" ]]; then
  err "DNS de $DOMAIN não resolve para nenhum IP. Aguarde propagação."
  exit 1
elif [[ "$VPS_IP" != "$DOMAIN_IP" ]]; then
  err "DNS aponta para $DOMAIN_IP, mas a VPS é $VPS_IP."
  err "Corrija o registro A no seu DNS e aguarde propagar (use: dig +short $DOMAIN)."
  exit 1
else
  ok "DNS confere ($DOMAIN_IP)"
fi

# 2. Garante certbot instalado
if ! command -v certbot >/dev/null 2>&1; then
  log "Instalando certbot..."
  apt-get update -y -qq
  apt-get install -y -qq certbot
fi

# 3. Para o container para liberar a porta 80
log "Parando container Docker para liberar a porta 80..."
docker compose stop app || true

# 4. Emite o certificado (standalone)
log "Emitindo certificado para $DOMAIN..."
if certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --keep-until-expiring; then
  ok "Certificado emitido com sucesso!"
else
  err "Falha ao emitir o certificado. Logs em /var/log/letsencrypt/letsencrypt.log"
  log "Subindo container de volta..."
  docker compose up -d app
  exit 1
fi

# 5. Sobe o container de volta
log "Reiniciando container..."
docker compose up -d app

# 6. Instala cron de renovação automática (idempotente)
RENEW_SCRIPT="$APP_DIR/deploy-vps/renew-ssl.sh"
if [ -f "$RENEW_SCRIPT" ]; then
  chmod +x "$RENEW_SCRIPT"
  CRON_LINE="0 3 * * 1 $RENEW_SCRIPT >> /var/log/ssl-renew.log 2>&1"
  if crontab -l 2>/dev/null | grep -Fq "$RENEW_SCRIPT"; then
    ok "Cron de renovação já configurado (segunda 03:00)"
  else
    log "Configurando cron de renovação automática (toda segunda às 03:00)..."
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    ok "Cron instalado. Logs em /var/log/ssl-renew.log"
  fi
else
  warn "renew-ssl.sh não encontrado em $RENEW_SCRIPT — cron não instalado."
fi

# 7. Valida HTTPS
log "Validando HTTPS (aguardando até 30s)..."
for i in $(seq 1 15); do
  if curl -sfk "https://$DOMAIN/" -o /dev/null; then
    ok "HTTPS respondendo em https://$DOMAIN ✓"
    exit 0
  fi
  sleep 2
done

warn "HTTPS ainda não respondeu, mas o certificado foi gerado."
warn "Verifique os logs: docker compose logs --tail=50 app"
