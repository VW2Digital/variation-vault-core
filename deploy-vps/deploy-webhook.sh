#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma — Deploy Webhook (servidor HTTP minimalista via socat)
# =============================================================================
# Recebe POST /deploy autenticado por header X-Deploy-Token e dispara
# deploy-vps/deploy.sh em background.
#
# Endpoints (escuta em 127.0.0.1:PORT — Nginx faz proxy /deploy-api/*):
#   GET  /health   → { ok, version }
#   POST /deploy   → { ok, message }   (header X-Deploy-Token obrigatório)
#   GET  /status   → { running, last_log }
#
# Config em /opt/liberty-pharma/.deploy-webhook.env:
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

log() { echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"; }

respond() {
  local code="$1" body="$2"
  local status_text="OK"
  case "$code" in
    400) status_text="Bad Request" ;;
    401) status_text="Unauthorized" ;;
    404) status_text="Not Found" ;;
    405) status_text="Method Not Allowed" ;;
    409) status_text="Conflict" ;;
    500) status_text="Internal Server Error" ;;
  esac
  printf 'HTTP/1.1 %s %s\r\nContent-Type: application/json\r\nContent-Length: %d\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type, x-deploy-token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n%s' \
    "$code" "$status_text" "${#body}" "$body"
}

handle_request() {
  local method path _proto
  if ! read -r method path _proto; then return; fi
  method="${method%$'\r'}"; path="${path%$'\r'}"

  local token="" content_length=0
  while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
    case "${line,,}" in
      x-deploy-token:*) token="$(echo "${line#*:}" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')" ;;
      content-length:*) content_length="$(echo "${line#*:}" | tr -d '[:space:]')" ;;
    esac
  done

  if [ "$content_length" -gt 0 ] 2>/dev/null; then
    head -c "$content_length" >/dev/null || true
  fi

  log "$method $path token=${token:0:6}..."

  if [ "$method" = "OPTIONS" ]; then
    respond 200 '{"ok":true}'; return
  fi

  case "$path" in
    /health|/health/*)
      local commit="unknown" branch="unknown"
      if [ -d "$APP_DIR/.git" ]; then
        commit="$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
        branch="$(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
      fi
      respond 200 "{\"ok\":true,\"version\":\"$commit\",\"branch\":\"$branch\"}"
      ;;
    /deploy)
      if [ "$method" != "POST" ]; then
        respond 405 '{"error":"method not allowed"}'; return
      fi
      if [ -z "${DEPLOY_TOKEN:-}" ]; then
        respond 500 '{"error":"DEPLOY_TOKEN not configured on server"}'; return
      fi
      if [ -z "$token" ] || [ "$token" != "$DEPLOY_TOKEN" ]; then
        respond 401 '{"error":"invalid or missing X-Deploy-Token"}'; return
      fi
      if [ -e "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        respond 409 '{"error":"deploy already running"}'; return
      fi
      ( setsid bash -c '
          echo $$ > "'"$LOCK_FILE"'"
          : > "'"$DEPLOY_LOG"'"
          echo "[$(date -Iseconds)] Iniciando deploy via webhook" >> "'"$LOG_FILE"'"
          if bash "'"$APP_DIR"'/deploy-vps/deploy.sh" >> "'"$DEPLOY_LOG"'" 2>&1; then
            echo "[$(date -Iseconds)] Deploy OK" >> "'"$LOG_FILE"'"
          else
            echo "[$(date -Iseconds)] Deploy FAIL rc=$?" >> "'"$LOG_FILE"'"
          fi
          rm -f "'"$LOCK_FILE"'"
      ' </dev/null >/dev/null 2>&1 & )
      respond 200 '{"ok":true,"message":"deploy started"}'
      ;;
    /status)
      local running="false"
      if [ -e "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        running="true"
      fi
      local tail_log=""
      if [ -f "$DEPLOY_LOG" ]; then
        tail_log="$(tail -c 3000 "$DEPLOY_LOG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')"
      else
        tail_log='""'
      fi
      respond 200 "{\"running\":$running,\"last_log\":$tail_log}"
      ;;
    *)
      respond 404 '{"error":"not found"}'
      ;;
  esac
}

# Sub-modo invocado pelo socat para cada conexão
if [ "${1:-}" = "__handle" ]; then
  handle_request
  exit 0
fi

# Validações de boot
if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "[FATAL] DEPLOY_TOKEN não configurado em $ENV_FILE" >&2
  exit 1
fi
if ! command -v socat >/dev/null 2>&1; then
  echo "[FATAL] socat não instalado. Rode: apt-get install -y socat" >&2
  exit 1
fi

log "Iniciando deploy-webhook em 127.0.0.1:$PORT (APP_DIR=$APP_DIR)"
exec socat TCP-LISTEN:"$PORT",reuseaddr,fork,bind=127.0.0.1 SYSTEM:"$(readlink -f "$0") __handle"