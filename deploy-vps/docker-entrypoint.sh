#!/bin/sh
# =============================================================================
# Entrypoint do container Nginx
# - Se houver certificado Let's Encrypt para $SERVER_NAME, gera ssl.conf (443)
#   e redirect.conf (force HTTP→HTTPS).
# - Senão, deixa ambos vazios e o site responde só em HTTP.
# =============================================================================
set -eu

SSL_CONF="/etc/nginx/conf.d/ssl.conf"
REDIRECT_CONF="/etc/nginx/conf.d/redirect.conf"
: > "$SSL_CONF"
: > "$REDIRECT_CONF"

SERVER_NAME="${SERVER_NAME:-}"

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

        cat > "$REDIRECT_CONF" <<EOF
# Força HTTPS (gerado pelo entrypoint)
if (\$request_uri !~ ^/\.well-known/acme-challenge/) {
    set \$do_redirect 1;
}
if (\$do_redirect = 1) {
    return 301 https://\$host\$request_uri;
}
EOF

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

    # Proxy webhooks → Supabase Edge Functions
    location ~ ^/(melhor-envio-webhook|asaas-webhook|mercadopago-webhook|pagarme-webhook|pagbank-webhook)(/.*)?\$ {
        proxy_pass https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/\$1\$2\$is_args\$args;
        proxy_http_version 1.1;
        proxy_set_header Host vkomfiplmhpkhfpidrng.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name vkomfiplmhpkhfpidrng.supabase.co;
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