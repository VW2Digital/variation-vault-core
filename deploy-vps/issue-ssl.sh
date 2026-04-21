#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Emissão/Re-emissão de SSL (Let's Encrypt)
# =============================================================================
# Use APÓS o DNS (apex e www) já estar apontado para o IP da VPS.
# Emite um certificado SAN cobrindo tanto o apex quanto o www automaticamente.
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

# Normaliza: se o usuário passar www., usamos o apex como nome principal
DOMAIN="${DOMAIN#www.}"
WWW_DOMAIN="www.$DOMAIN"

cd "$APP_DIR"

ENV_FILE="$APP_DIR/.env"

# 1. Confere DNS (apex + www)
log "Verificando DNS de $DOMAIN e $WWW_DOMAIN..."
VPS_IP=$(curl -s ifconfig.me || echo "")
DOMAIN_IP=$(dig +short "$DOMAIN" | tail -n1 || echo "")
WWW_IP=$(dig +short "$WWW_DOMAIN" | tail -n1 || echo "")

INCLUDE_WWW=1

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
  ok "DNS de $DOMAIN confere ($DOMAIN_IP)"
fi

if [[ -z "$WWW_IP" ]]; then
  warn "$WWW_DOMAIN não resolve no DNS — vou emitir o cert SÓ para o apex."
  warn "Crie um registro A (ou CNAME) para www apontando para $VPS_IP e rode de novo para incluir."
  INCLUDE_WWW=0
elif [[ -n "$VPS_IP" && "$WWW_IP" != "$VPS_IP" ]]; then
  warn "$WWW_DOMAIN aponta para $WWW_IP (≠ $VPS_IP) — vou emitir o cert SÓ para o apex."
  INCLUDE_WWW=0
else
  ok "DNS de $WWW_DOMAIN confere ($WWW_IP)"
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

# 4. Emite o certificado SAN (standalone) — apex + www quando possível
CERT_ARGS=(-d "$DOMAIN")
if [[ "$INCLUDE_WWW" -eq 1 ]]; then
  CERT_ARGS+=(-d "$WWW_DOMAIN")
  log "Emitindo certificado SAN para $DOMAIN + $WWW_DOMAIN..."
else
  log "Emitindo certificado para $DOMAIN..."
fi

# --expand garante que, se já existir um cert só com o apex, ele será
# re-emitido cobrindo também o www (sem precisar deletar manualmente).
if certbot certonly --standalone \
    "${CERT_ARGS[@]}" \
    --non-interactive \
    --agree-tos \
    --expand \
    -m "$EMAIL" \
    --keep-until-expiring; then
  ok "Certificado emitido com sucesso!"
else
  err "Falha ao emitir o certificado. Logs em /var/log/letsencrypt/letsencrypt.log"
  log "Subindo container de volta..."
  docker compose up -d app
  exit 1
fi

# 5. Atualiza .env com SERVER_NAME e recria o container
#    (necessário pra montar /etc/letsencrypt e abrir a porta 443)
log "Configurando SERVER_NAME=$DOMAIN no .env e recriando container..."
if [ -f "$ENV_FILE" ]; then
  if grep -q '^SERVER_NAME=' "$ENV_FILE"; then
    sed -i "s|^SERVER_NAME=.*|SERVER_NAME=$DOMAIN|" "$ENV_FILE"
  else
    echo "SERVER_NAME=$DOMAIN" >> "$ENV_FILE"
  fi
else
  warn ".env não encontrado em $ENV_FILE — criando arquivo mínimo só com SERVER_NAME."
  echo "SERVER_NAME=$DOMAIN" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

mkdir -p /var/www/certbot

# `up -d` sem mudança não recria; force a recriação pra aplicar volumes/ports/env
docker compose up -d --force-recreate app

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
