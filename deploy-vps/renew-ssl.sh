#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Renovação automática do certificado SSL (Let's Encrypt)
# =============================================================================
# Executado pelo cron. Renova se faltar < 30 dias para expirar.
# Como o Nginx roda dentro do Docker, paramos o container, renovamos no modo
# standalone (Certbot escuta na porta 80) e subimos o container de novo.
#
# Instalação do cron (rodar UMA VEZ na VPS):
#   chmod +x /opt/liberty-pharma/deploy-vps/renew-ssl.sh
#   (crontab -l 2>/dev/null; echo "0 3 * * 1 /opt/liberty-pharma/deploy-vps/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1") | crontab -
#
# Isso roda toda segunda às 03:00. Certbot só renova de fato se faltar < 30 dias.
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
cd "$APP_DIR"

echo "[$(date -Is)] Iniciando verificação de renovação SSL..."

# Para o container para liberar a porta 80
docker compose stop app

# Tenta renovar (Certbot só age se faltar < 30 dias)
if certbot renew --standalone --non-interactive --quiet; then
  echo "[$(date -Is)] Renovação verificada com sucesso."
else
  echo "[$(date -Is)] ERRO na renovação. Verifique /var/log/letsencrypt/letsencrypt.log"
fi

# Sobe o container de novo (vai recarregar os certificados atualizados)
docker compose up -d app

echo "[$(date -Is)] Container reiniciado."
