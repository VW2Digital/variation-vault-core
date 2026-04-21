#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Renovação automática do certificado SSL (Let's Encrypt)
# =============================================================================
# Modos:
#   (sem args)    Renovação real semanal (Certbot só age se faltar < 30 dias)
#   --dry-run     Teste mensal de simulação (não altera certificado)
#
# Em qualquer falha (ou cert expirando em < 20 dias), envia alerta por e-mail
# para o endereço configurado em SSL_ALERT_EMAIL no .env (fallback: root local).
# =============================================================================

set -uo pipefail

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
LOG_FILE="/var/log/ssl-renew.log"
MODE="${1:-renew}"   # renew | --dry-run

cd "$APP_DIR"

# ---- Lê configurações do .env (SSL_ALERT_EMAIL, SERVER_NAME) -----------------
ENV_FILE="$APP_DIR/.env"
SSL_ALERT_EMAIL=""
SERVER_NAME=""
if [ -f "$ENV_FILE" ]; then
  SSL_ALERT_EMAIL="$(grep -E '^SSL_ALERT_EMAIL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  SERVER_NAME="$(grep -E '^SERVER_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
SSL_ALERT_EMAIL="${SSL_ALERT_EMAIL:-root}"
SERVER_NAME="${SERVER_NAME:-_}"
HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"

log() { echo "[$(date -Is)] $*"; }

# ---- Envio de alerta por e-mail (best-effort: msmtp, mailx ou mail) ----------
send_alert() {
  local subject="$1"
  local body="$2"
  local to="$SSL_ALERT_EMAIL"

  log "ALERTA: $subject → enviando para $to"

  # Monta cabeçalho + corpo
  local payload
  payload=$(printf "To: %s\nFrom: ssl-monitor@%s\nSubject: %s\n\n%s\n" \
    "$to" "$HOSTNAME_FQDN" "$subject" "$body")

  if command -v msmtp >/dev/null 2>&1; then
    printf "%s" "$payload" | msmtp -t 2>>"$LOG_FILE" && return 0
  fi
  if command -v mail >/dev/null 2>&1; then
    printf "%s\n" "$body" | mail -s "$subject" "$to" 2>>"$LOG_FILE" && return 0
  fi
  if command -v mailx >/dev/null 2>&1; then
    printf "%s\n" "$body" | mailx -s "$subject" "$to" 2>>"$LOG_FILE" && return 0
  fi
  if command -v sendmail >/dev/null 2>&1; then
    printf "%s" "$payload" | sendmail -t 2>>"$LOG_FILE" && return 0
  fi

  log "ERRO: nenhum agente de e-mail disponível (msmtp/mail/mailx/sendmail). Alerta não enviado."
  return 1
}

# ---- Verifica dias restantes do certificado ---------------------------------
check_cert_expiry() {
  local apex="${SERVER_NAME#www.}"
  local cert="/etc/letsencrypt/live/$apex/fullchain.pem"
  if [ ! -f "$cert" ]; then
    log "Aviso: certificado não encontrado em $cert (verificação de expiração ignorada)."
    return 0
  fi
  local end_epoch now_epoch days_left
  end_epoch=$(date -d "$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  days_left=$(( (end_epoch - now_epoch) / 86400 ))
  log "Certificado de $apex expira em $days_left dias."
  if [ "$days_left" -lt 20 ] && [ "$days_left" -ge 0 ]; then
    send_alert "[SSL] Certificado expirando em $days_left dias ($apex)" \
      "O certificado de $apex (host $HOSTNAME_FQDN) expira em $days_left dias e ainda não foi renovado.\n\nVerifique $LOG_FILE e /var/log/letsencrypt/letsencrypt.log."
  fi
}

# =============================================================================
# MODO 1: TESTE MENSAL (--dry-run) — não altera certificado, não para container
# =============================================================================
if [ "$MODE" = "--dry-run" ]; then
  log "Iniciando TESTE mensal de renovação SSL (--dry-run)..."
  OUTPUT=$(certbot renew --dry-run --non-interactive 2>&1)
  RC=$?
  echo "$OUTPUT"
  if [ $RC -ne 0 ] || echo "$OUTPUT" | grep -qi "failed"; then
    send_alert "[SSL] Falha no teste mensal de renovação ($HOSTNAME_FQDN)" \
      "O teste de simulação (--dry-run) de renovação Let's Encrypt FALHOU em $HOSTNAME_FQDN.\n\nIsso indica que a renovação real provavelmente vai falhar — investigue ANTES do certificado expirar.\n\nSaída do certbot:\n\n$OUTPUT"
    log "Teste mensal FALHOU — alerta enviado."
    exit 1
  fi
  log "Teste mensal OK — renovação real deve funcionar."
  check_cert_expiry
  exit 0
fi

# =============================================================================
# MODO 2: RENOVAÇÃO REAL SEMANAL
# =============================================================================
log "Iniciando verificação de renovação SSL..."

# Para o container para liberar a porta 80
docker compose stop app

OUTPUT=$(certbot renew --standalone --non-interactive --quiet 2>&1)
RC=$?

# Sobe o container de novo (vai recarregar os certificados atualizados)
docker compose up -d app
log "Container reiniciado."

if [ $RC -ne 0 ]; then
  log "ERRO na renovação (rc=$RC). Logs em /var/log/letsencrypt/letsencrypt.log"
  send_alert "[SSL] Falha na renovação automática ($HOSTNAME_FQDN)" \
    "A renovação automática do certificado Let's Encrypt FALHOU em $HOSTNAME_FQDN.\n\nVerifique:\n  - /var/log/letsencrypt/letsencrypt.log\n  - $LOG_FILE\n\nSaída do certbot:\n$OUTPUT"
  check_cert_expiry
  exit 1
fi

log "Renovação verificada com sucesso."
check_cert_expiry
exit 0
