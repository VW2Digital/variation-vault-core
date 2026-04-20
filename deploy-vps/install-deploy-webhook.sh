#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — Instalador do Deploy Webhook (systemd + nginx proxy)
# =============================================================================
# Uso (na VPS, como root):
#   sudo bash deploy-vps/install-deploy-webhook.sh
#
# Cria:
#   - /opt/liberty-pharma/.deploy-webhook.env  (DEPLOY_TOKEN gerado aleatório)
#   - /etc/systemd/system/liberty-deploy-webhook.service
#   - bloco proxy /deploy-api/* no Nginx (se /etc/nginx/sites-available/default existir)
#
# Ao final imprime o TOKEN — copie e salve em
#   Admin → Configurações → Avançado → Atualização da aplicação.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*" >&2; }

[ "$(id -u)" -eq 0 ] || { err "Rode como root: sudo bash $0"; exit 1; }

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
ENV_FILE="$APP_DIR/.deploy-webhook.env"
SERVICE_FILE="/etc/systemd/system/liberty-deploy-webhook.service"
SCRIPT_PATH="$APP_DIR/deploy-vps/deploy-webhook.sh"
PORT=9000

[ -f "$SCRIPT_PATH" ] || { err "Não encontrei $SCRIPT_PATH. Atualize o repositório primeiro."; exit 1; }

log "Instalando dependências (socat)..."
apt-get update -qq
apt-get install -y -qq socat python3 >/dev/null

chmod +x "$SCRIPT_PATH"

if [ -f "$ENV_FILE" ] && grep -q '^DEPLOY_TOKEN=' "$ENV_FILE"; then
  TOKEN="$(grep '^DEPLOY_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  warn "Token já existia — mantido."
else
  TOKEN="$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64)"
  cat > "$ENV_FILE" <<EOF
DEPLOY_TOKEN=$TOKEN
APP_DIR=$APP_DIR
PORT=$PORT
EOF
  chmod 600 "$ENV_FILE"
  ok "Token gerado e salvo em $ENV_FILE"
fi

log "Criando systemd unit..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Liberty Pharma Deploy Webhook
After=network.target docker.service

[Service]
Type=simple
EnvironmentFile=$ENV_FILE
ExecStart=$SCRIPT_PATH
Restart=on-failure
RestartSec=5
# Roda como root porque precisa rebuildar containers Docker
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now liberty-deploy-webhook
sleep 1

if systemctl is-active --quiet liberty-deploy-webhook; then
  ok "Serviço ativo (porta $PORT, escutando em 127.0.0.1)"
else
  err "Serviço NÃO subiu. Veja: journalctl -u liberty-deploy-webhook -n 50"
  exit 1
fi

# --- Nginx proxy /deploy-api/ ---
NGINX_CONF=""
for f in /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default /etc/nginx/conf.d/default.conf; do
  [ -f "$f" ] && NGINX_CONF="$f" && break
done

if [ -n "$NGINX_CONF" ]; then
  if grep -q 'location /deploy-api/' "$NGINX_CONF"; then
    ok "Nginx já tem o proxy /deploy-api/ — pulando."
  else
    log "Adicionando bloco proxy /deploy-api/ em $NGINX_CONF..."
    cp "$NGINX_CONF" "$NGINX_CONF.bak.$(date +%s)"
    # Insere antes do último '}' (fim do server block principal)
    awk -v port="$PORT" '
      /^}/ && !done {
        print "    location /deploy-api/ {"
        print "        proxy_pass http://127.0.0.1:" port "/;"
        print "        proxy_http_version 1.1;"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_read_timeout 30s;"
        print "    }"
        done=1
      }
      { print }
    ' "$NGINX_CONF" > "$NGINX_CONF.new" && mv "$NGINX_CONF.new" "$NGINX_CONF"
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      ok "Nginx recarregado com /deploy-api/ → 127.0.0.1:$PORT"
    else
      err "nginx -t falhou — restaurando backup"
      mv "$NGINX_CONF.bak."* "$NGINX_CONF" 2>/dev/null || true
    fi
  fi
else
  warn "Nginx config não encontrada — configure manualmente um proxy /deploy-api/ → 127.0.0.1:$PORT"
fi

echo
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}TOKEN (cole no painel admin):${NC}"
echo
echo "  $TOKEN"
echo
echo -e "${BOLD}URL pública (use em Admin → Configurações → Avançado):${NC}"
echo "  https://SEU-DOMINIO/deploy-api"
echo
echo -e "${YELLOW}Teste rápido:${NC}"
echo "  curl https://SEU-DOMINIO/deploy-api/health"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"