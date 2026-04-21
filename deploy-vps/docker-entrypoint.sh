#!/bin/sh
# =============================================================================
# Entrypoint do container Nginx
# Gerencia 3 arquivos em /etc/nginx/conf.d/:
#   • http.conf      — server block porta 80 (sempre presente)
#   • redirect.conf  — server block porta 80 que redireciona p/ HTTPS (só com SSL)
#   • ssl.conf       — server block porta 443 (só com SSL)
# Quando há SSL, http.conf é substituído por uma versão mínima (só ACME challenge)
# para evitar conflito de "default_server" entre os dois server blocks na 80.
# =============================================================================
set -eu

HTTP_CONF="/etc/nginx/conf.d/http.conf"
SSL_CONF="/etc/nginx/conf.d/ssl.conf"
REDIRECT_CONF="/etc/nginx/conf.d/redirect.conf"
HTTP_TEMPLATE="/etc/nginx/templates/http.conf"

# Sempre começa com o template padrão de http.conf (serve site em HTTP)
cp "$HTTP_TEMPLATE" "$HTTP_CONF"
: > "$SSL_CONF"
: > "$REDIRECT_CONF"

SERVER_NAME="${SERVER_NAME:-}"
SUPABASE_PROXY_HOST="${SUPABASE_PROXY_HOST:-}"
SUPABASE_FUNCTIONS_BASE_URL="${SUPABASE_FUNCTIONS_BASE_URL:-}"

if [ -z "$SUPABASE_PROXY_HOST" ] && [ -n "$SUPABASE_FUNCTIONS_BASE_URL" ]; then
    SUPABASE_PROXY_HOST="$(printf '%s' "$SUPABASE_FUNCTIONS_BASE_URL" | sed -E 's#^https?://([^/]+)/?.*$#\1#')"
fi

if [ -z "$SUPABASE_FUNCTIONS_BASE_URL" ] && [ -n "$SUPABASE_PROXY_HOST" ]; then
    SUPABASE_FUNCTIONS_BASE_URL="https://$SUPABASE_PROXY_HOST/functions/v1"
fi

if [ -n "$SUPABASE_FUNCTIONS_BASE_URL" ] && [ -n "$SUPABASE_PROXY_HOST" ]; then
    sed -i "s|__SUPABASE_FUNCTIONS_BASE_URL__|$SUPABASE_FUNCTIONS_BASE_URL|g; s|__SUPABASE_PROXY_HOST__|$SUPABASE_PROXY_HOST|g" "$HTTP_CONF"
fi

if [ -n "$SERVER_NAME" ] && [ "$SERVER_NAME" != "_" ]; then
    # Normaliza para o apex (sem www) — é assim que o certbot nomeia a pasta
    APEX="${SERVER_NAME#www.}"
    WWW="www.$APEX"
    CERT_DIR="/etc/letsencrypt/live/$APEX"

    # Detecta se o cert cobre também o www (para gerar bloco de redirect canônico)
    HAS_WWW=0
    if [ -f "$CERT_DIR/fullchain.pem" ] && \
       openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -text 2>/dev/null \
         | grep -q "DNS:$WWW"; then
        HAS_WWW=1
        echo "[entrypoint] Certificado cobre $APEX e $WWW (será aplicado redirect canônico www → apex)."
    fi

    if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
        echo "[entrypoint] Certificado encontrado para $APEX — habilitando HTTPS (443) no apex."

        # Substitui http.conf por versão mínima: só ACME challenge + redirect.
        # Isso evita conflito de default_server e duplicação de location /.
        cat > "$HTTP_CONF" <<EOF
server {
    listen 80 default_server;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
        # redirect.conf agora fica vazio (lógica movida para http.conf acima)
        : > "$REDIRECT_CONF"

        cat > "$SSL_CONF" <<EOF
server {
    listen 443 ssl;
    http2 on;
    server_name $APEX;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain text/css text/xml text/javascript
        application/javascript application/x-javascript
        application/xml application/json application/rss+xml
        image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location ~* \.(?:jpg|jpeg|gif|png|ico|webp|svg|woff|woff2|ttf|otf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Proxy webhooks → Edge Functions do backend configurado em runtime
    location ~ ^/(melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook)(/.*)?\$ {
        proxy_pass ${SUPABASE_FUNCTIONS_BASE_URL}/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host ${SUPABASE_PROXY_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name ${SUPABASE_PROXY_HOST};
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_buffering off;
    }

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF

        # Bloco canônico: redireciona www → apex (HTTP e HTTPS) com 301
        if [ "$HAS_WWW" = "1" ]; then
            cat >> "$SSL_CONF" <<EOF

# Redirect canônico: www.$APEX → $APEX (HTTPS, 301)
server {
    listen 443 ssl;
    http2 on;
    server_name $WWW;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    return 301 https://$APEX\$request_uri;
}

# Redirect canônico: http://www.$APEX → https://$APEX (301)
server {
    listen 80;
    server_name $WWW;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 301 https://$APEX\$request_uri;
    }
}
EOF
        fi
    else
        echo "[entrypoint] Sem certificado para $SERVER_NAME ainda — servindo só HTTP."
    fi
else
    echo "[entrypoint] SERVER_NAME não definido — servindo só HTTP."
fi

exec nginx -g 'daemon off;'