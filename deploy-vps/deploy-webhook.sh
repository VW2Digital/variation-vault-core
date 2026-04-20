#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — Deploy Webhook (servidor HTTP minimalista)
# =============================================================================
# Recebe POST /deploy autenticado por header X-Deploy-Token e executa
# deploy-vps/deploy.sh em background. Retorna JSON com status.
#
# Endpoints:
#   GET  /health   → { ok: true, version: "<commit-curto>" }
#   POST /deploy   → dispara deploy assíncrono (200 imediato)
#
# Variáveis de ambiente (lidas de /opt/liberty-pharma/.deploy-webhook.env):
#   DEPLOY_TOKEN   (obrigatório)
#   APP_DIR        (default /opt/liberty-pharma)
#   PORT           (default 9000)
# =============================================================================

set -euo pipefail

ENV_FILE="/opt/liberty-pharma/.deploy-webhook.env"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

APP_DIR="${APP_DIR:-/opt/liberty-pharma}"
PORT="${PORT:-9000}"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/deploy-webhook.log"
DEPLOY_LOG="$LOG_DIR/last-deploy.log"
LOCK_FILE="/tmp/liberty-deploy.lock"

mkdir -p "$LOG_DIR"

if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "[FATAL] DEPLOY_TOKEN não configurado em $ENV_FILE" >&2
  exit 1
fi

log() { echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"; }

respond() {
  local code="$1" body="$2"
  local status_text="OK"
  case "$code" in
    400) status_text="Bad Request" ;;
    401) status_text="Unauthorized" ;;
    404) status_text="Not Found" ;;
    409) status_text="Conflict" ;;
    405) status_text="Method Not Allowed" ;;
    500) status_text="Internal Server Error" ;;
  esac
  printf 'HTTP/1.1 %s %s\r\nContent-Type: application/json\r\nContent-Length: %d\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type, x-deploy-token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n%s' \
    "$code" "$status_text" "${#body}" "$body"
}

handle_request() {
  local request_line method path
  IFS=$' \t\r\n' read -r method path _ || return

  local token=""
  local content_length=0
  while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
    case "${line,,}" in
      x-deploy-token:*) token="$(echo "${line#*:}" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')" ;;
      content-length:*) content_length="$(echo "${line#*:}" | tr -d '[:space:]')" ;;
    esac
  done

  # Drena body (não usado)
  if [ "$content_length" -gt 0 ]; then
    head -c "$content_length" >/dev/null || true
  fi

  log "$method $path (token=${token:0:6}...)"

  if [ "$method" = "OPTIONS" ]; then
    respond 200 '{"ok":true}'
    return
  fi

  case "$path" in
    /health)
      local commit="unknown"
      if [ -d "$APP_DIR/.git" ]; then
        commit="$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
      fi
      respond 200 "{\"ok\":true,\"version\":\"$commit\",\"app_dir\":\"$APP_DIR\"}"
      ;;
    /deploy)
      if [ "$method" != "POST" ]; then
        respond 405 '{"error":"method not allowed"}'
        return
      fi
      if [ -z "$token" ] || [ "$token" != "$DEPLOY_TOKEN" ]; then
        respond 401 '{"error":"invalid or missing X-Deploy-Token"}'
        return
      fi
      if [ -e "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        respond 409 '{"error":"deploy already in progress"}'
        return
      fi
      # Dispara deploy em background
      (
        echo $$ > "$LOCK_FILE"
        log "Iniciando deploy..."
        : > "$DEPLOY_LOG"
        if bash "$APP_DIR/deploy-vps/deploy.sh" >> "$DEPLOY_LOG" 2>&1; then
          log "Deploy OK"
        else
          log "Deploy FAIL (rc=$?)"
        fi
        rm -f "$LOCK_FILE"
      ) &
      respond 200 "{\"ok\":true,\"message\":\"deploy started\",\"log\":\"$DEPLOY_LOG\"}"
      ;;
    /status)
      if [ -e "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        respond 200 '{"running":true}'
      else
        local tail_log=""
        [ -f "$DEPLOY_LOG" ] && tail_log="$(tail -c 4000 "$DEPLOY_LOG" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}')"
        respond 200 "{\"running\":false,\"last_log\":\"$tail_log\"}"
      fi
      ;;
    *)
      respond 404 '{"error":"not found"}'
      ;;
  esac
}

log "Iniciando deploy-webhook na porta $PORT (APP_DIR=$APP_DIR)"

# Loop com socat (instalado pelo install.sh)
exec socat TCP-LISTEN:"$PORT",reuseaddr,fork,bind=127.0.0.1 SYSTEM:"$0 __handle"

# Sub-comando interno chamado pelo socat para cada conexão
if [ "${1:-}" = "__handle" ]; then
  handle_request
  exit 0
fi