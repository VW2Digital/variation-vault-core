# Deploy em Produção - VPS Ubuntu

Guia completo para clonar e rodar este projeto em uma VPS Ubuntu independente do ambiente Lovable.

## ⚠️ Arquitetura - Leia Antes

Este projeto possui **duas camadas** que rodam em lugares diferentes:

| Camada | Onde roda | O que faz |
|--------|-----------|-----------|
| **Frontend** (React + Vite) | Sua VPS (Nginx) | Catálogo, checkout, painel admin |
| **Backend** (Supabase Edge Functions) | Infraestrutura Supabase | Webhooks, pagamentos, integração Melhor Envio, e-mails |

**Sua VPS NÃO executa webhooks nem chama APIs de gateway diretamente.** Toda lógica server-side está em `supabase/functions/` e roda nos servidores do Supabase. Os gateways (Mercado Pago, Pagar.me, PagBank, Melhor Envio) chamam URLs como:

```
https://SEU_PROJETO.supabase.co/functions/v1/mercadopago-webhook
https://SEU_PROJETO.supabase.co/functions/v1/pagarme-webhook
https://SEU_PROJETO.supabase.co/functions/v1/pagbank-webhook
https://SEU_PROJETO.supabase.co/functions/v1/melhor-envio-webhook
```

Se webhooks retornam 404/405 na sua VPS, é porque os painéis dos gateways estão configurados com a URL errada (apontando pra VPS em vez do Supabase). **A solução não é mexer no Nginx, é trocar a URL no painel do gateway.**

---

## 1. Pré-requisitos da VPS

- Ubuntu 22.04 LTS (ou superior)
- 1 vCPU, 1GB RAM mínimo
- Domínio apontado (registro A) para o IP da VPS
- Acesso root ou sudo

## 2. Instalação Rápida (script automatizado)

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/loja
cd /opt/loja
sudo bash deploy-vps/install.sh
```

O script `install.sh` instala Node 20, Nginx, Certbot, builda o frontend e configura SSL automaticamente. Ele vai pedir:

- `SERVER_NAME` (ex: `loja.seudominio.com`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SSL_EMAIL`

## 3. Instalação Manual (passo a passo)

### 3.1 Dependências do sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 3.2 Clone e configuração

```bash
sudo git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/loja
cd /opt/loja
cp .env.example .env
nano .env  # preencher VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
```

### 3.3 Build do frontend

```bash
npm ci
npm run build
```

Isso gera o diretório `dist/` com o SPA pronto.

### 3.4 Nginx

```bash
sudo cp deploy-vps/nginx.conf /etc/nginx/sites-available/loja
sudo sed -i "s/SERVER_NAME_PLACEHOLDER/$SERVER_NAME/g" /etc/nginx/sites-available/loja
sudo ln -sf /etc/nginx/sites-available/loja /etc/nginx/sites-enabled/loja
sudo nginx -t && sudo systemctl reload nginx
```

### 3.5 SSL Let's Encrypt

```bash
sudo certbot --nginx -d $SERVER_NAME --email $SSL_EMAIL --agree-tos --non-interactive
```

## 4. Configuração das Integrações (1 vez só)

Após o frontend estar no ar, configure cada integração nos painéis externos. **Estes passos são obrigatórios** — sem eles, webhooks e pagamentos não funcionam.

### 4.0 URL pública da loja no admin

Após o primeiro login no painel administrativo, preencha:

- **Configurações → Logo & Identidade → URL Pública da Loja**

Exemplo:

```text
https://loja.seudominio.com
```

Essa URL é usada pelo backend para gerar:

- redirecionamentos de pagamento
- links públicos em e-mails
- callbacks que precisam devolver o cliente para a loja

Sem isso, o frontend sobe, mas partes dos pagamentos e e-mails podem continuar apontando para um domínio antigo.

### 4.1 Secrets do Supabase

No painel Supabase: **Project Settings > Edge Functions > Manage secrets**

Configure (apenas uma vez):
- `RESEND_API_KEY` — chave da [resend.com](https://resend.com) para e-mails
- `MP_WEBHOOK_SECRET` — segredo HMAC do webhook Mercado Pago (gerado no painel MP)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` são **auto-injetados** pelo Supabase — não precisa configurar.

### 4.2 Mercado Pago

1. Acesse [Painel MP > Webhooks](https://www.mercadopago.com.br/developers/panel/app)
2. Cadastre a URL: `https://SEU_PROJETO.supabase.co/functions/v1/mercadopago-webhook`
3. Selecione eventos: `payment`
4. Copie o "Segredo" e adicione como `MP_WEBHOOK_SECRET` nos secrets do Supabase
5. No `/admin/configuracoes/pagamentos`, cole seu `Access Token` MP

### 4.3 Pagar.me

1. Painel Pagar.me > Webhooks
2. URL: `https://SEU_PROJETO.supabase.co/functions/v1/pagarme-webhook`
3. Eventos: `order.paid`, `order.payment_failed`, `charge.paid`
4. No `/admin/configuracoes/pagamentos`, cole sua `Secret Key`

### 4.4 PagBank

1. Painel PagBank > Notificações
2. URL: `https://SEU_PROJETO.supabase.co/functions/v1/pagbank-webhook`
3. No `/admin/configuracoes/pagamentos`, cole seu `Token` PagBank

### 4.5 Asaas

1. Painel Asaas > Integrações > Webhooks
2. URL: `https://SEU_PROJETO.supabase.co/functions/v1/asaas-webhook?token=SEU_TOKEN`
3. Gere e cole o token em `/admin/configuracoes/pagamentos`

### 4.6 Melhor Envio

1. Acesse `/admin/configuracoes/logistica` na sua loja
2. Clique em "Conectar com Melhor Envio" (fluxo OAuth)
3. Autorize a aplicação no painel ME
4. Cadastre webhook em **Painel ME > Webhooks**:
   `https://SEU_PROJETO.supabase.co/functions/v1/melhor-envio-webhook`
5. Eventos: `order.posted`, `order.delivered`, `order.canceled`

> **Atenção:** O CPF/CNPJ do remetente configurado no Melhor Envio **não pode ser igual ao CPF do cliente** que está comprando — limitação do próprio ME (E-WAF-0003).

## 5. Edge Functions - Deploy

As Edge Functions são deployadas **automaticamente pelo Lovable** quando você dá push no repo. Se você não usa Lovable e quer fazer deploy manual:

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link com seu projeto
supabase link --project-ref SEU_PROJECT_REF

# Deploy todas as functions
supabase functions deploy

# Ou uma específica
supabase functions deploy mercadopago-webhook
```

Depois configure os secrets necessários:

```bash
supabase secrets set RESEND_API_KEY=... --project-ref SEU_PROJECT_REF
supabase secrets set MP_WEBHOOK_SECRET=... --project-ref SEU_PROJECT_REF
```

> Importante: alterar secrets exige novo deploy das functions para garantir o runtime atualizado.

## 6. Validar Instalação

Rode o script de validação após o deploy:

```bash
sudo bash deploy-vps/check-integrations.sh
```

Ele verifica:
- ✅ Frontend respondendo (HTTP 200)
- ✅ Endpoints de webhook acessíveis no Supabase
- ✅ Variáveis `.env` corretamente preenchidas
- ✅ SSL válido
- ✅ Nginx com config correta

## 7. Atualização (após git pull)

```bash
cd /opt/loja
git pull
npm ci
npm run build
sudo systemctl reload nginx
```

Ou use o webhook automático: `bash deploy-vps/install-deploy-webhook.sh`

## 8. Troubleshooting

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Webhook MP retorna 404 | URL no painel MP aponta pra VPS | Trocar URL pelo endpoint `*.supabase.co/functions/v1/mercadopago-webhook` |
| Webhook retorna 405 | Mesmo problema acima | Idem |
| Melhor Envio "Token revoked" | OAuth expirado/revogado | Reconectar em `/admin/configuracoes/logistica` |
| Frontend OK mas pagamento falha | Token gateway não salvo | Configurar em `/admin/configuracoes/pagamentos` |
| `npm run build` falha por var | `.env` incompleto | Verificar `VITE_SUPABASE_*` no `.env` |
| 502 Bad Gateway | Build não rodou | `npm run build` na pasta do projeto |

## 9. Estrutura do Repositório

```
/
├── src/                          # Frontend React (roda na VPS)
├── supabase/
│   ├── functions/                # Backend Edge Functions (roda no Supabase)
│   │   ├── mercadopago-webhook/
│   │   ├── pagarme-webhook/
│   │   ├── pagbank-webhook/
│   │   ├── asaas-webhook/
│   │   ├── melhor-envio-webhook/
│   │   ├── melhor-envio-oauth/
│   │   ├── melhor-envio-shipment/
│   │   ├── payment-checkout/
│   │   ├── orders-api/
│   │   └── ... (16 functions no total)
│   ├── migrations/               # Schema do banco
│   └── config.toml               # Config das functions (verify_jwt, etc)
├── deploy-vps/                   # Scripts de deploy VPS
│   ├── install.sh
│   ├── nginx.conf
│   ├── check-integrations.sh    # Script de validação
│   └── ...
├── .env.example                  # Template de variáveis
└── README-PRODUCAO.md           # Este arquivo
```

**Nada crítico depende do ambiente Lovable.** Todo código (frontend, edge functions, migrations, scripts de deploy) está versionado neste repositório.