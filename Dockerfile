# ============================================
# Stage 1: Build da aplicação Vite/React
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifestos primeiro para cache de dependências
COPY package*.json bun.lockb* ./

# Instala dependências (npm install é mais tolerante a lock desatualizado)
RUN npm install --no-audit --no-fund

# Copia o restante do código
COPY . .

# Variáveis de build (Vite precisa delas em build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Build de produção
RUN npm run build

# ============================================
# Stage 2: Servir com Nginx (leve e rápido)
# ============================================
FROM nginx:1.27-alpine AS runner

# Remove config padrão e adiciona a nossa (com fallback SPA)
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy-vps/nginx.conf /etc/nginx/conf.d/default.conf

# Copia o build gerado
COPY --from=builder /app/dist /usr/share/nginx/html

# Entrypoint que habilita HTTPS dinamicamente quando há certificado
COPY deploy-vps/docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80 443

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["/docker-entrypoint-custom.sh"]
