# Deploy VPS — Liberty Pharma

Instalador único e zero-toque para colocar a Liberty Pharma no ar em uma VPS Ubuntu/Debian, do sistema operacional limpo até site com HTTPS, banco aplicado, admin criado, cron jobs agendados e Edge Functions deployadas.

---

## Conteúdo da pasta

```
deploy-vps/
├── README.md                  ← este arquivo
├── install.sh                 ← instalador zero-toque (12 etapas)
├── deploy.sh                  ← atualiza instalação existente (git pull + rebuild)
├── nginx.conf                 ← gerado dinamicamente pelo install.sh
├── renew-ssl.sh               ← renovação manual de SSL (cron já cuida automaticamente)
├── decisao-deploy.mmd         ← fluxograma Mermaid de decisão
├── GUIA-ORACLE-FREE-TIER.md   ← guia específico Oracle Cloud Free Tier
└── supabase/
    ├── README.md              ← instruções do schema
    └── schema.sql             ← schema completo (22 tabelas + RLS + Storage)
```

---

## Uso rápido

Na VPS (como root):

```bash
curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/install.sh -o /tmp/install.sh
sudo bash /tmp/install.sh
```

O script é interativo. Cada credencial pedida tem instruções de onde encontrar logo abaixo.

---

## As 12 etapas do instalador

| # | Etapa | O que faz | Pode pular? |
|---|-------|-----------|-------------|
| 1 | **Configuração Supabase** | Coleta URL, anon key, project ref, DB URL, service_role e dados do admin | URL e anon key são obrigatórios |
| 2 | **Domínio + SSL** | Pergunta domínio e email para Let's Encrypt | Sim — site fica em HTTP no IP |
| 3 | **Edge Functions** | Pergunta se vai deployar funções e coleta secrets opcionais (RESEND, MP, EVOLUTION, LOVABLE_AI) | Sim |
| 4 | **Limpeza** | Remove instalação anterior em `/opt/liberty-pharma` (faz backup do `.env`) | Não |
| 5 | **Sistema base** | `apt update`, instala curl/git/jq/psql/fail2ban/unattended-upgrades, timezone `America/Sao_Paulo`, fail2ban no SSH | Não |
| 6 | **Swap** | Cria 1GB de swap se a VPS tiver menos de 1GB | Auto |
| 7 | **Docker + Compose** | Instala Docker engine e plugin compose v2 | Não |
| 8 | **Firewall** | UFW liberando 22/80/443 apenas | Não |
| 9 | **Banco + admin** | Aplica `schema.sql`, habilita `pg_cron`/`pg_net`, agenda crons (carrinho/hora, rastreio/5min), cria admin via Auth API e promove a `admin` em `user_roles` | Sim — se não passar DB URL |
| 10 | **Build + Nginx** | Clona repo, gera `.env`, monta `nginx.conf` (HTTP-only ou HTTPS), builda imagem, sobe container, emite cert Let's Encrypt e agenda renovação | Não |
| 11 | **Edge Functions deploy** | Instala Supabase CLI, faz `supabase login` + `link`, configura secrets e deploya as ~17 funções com `--no-verify-jwt` | Sim — só roda se etapa 3 = yes |
| 12 | **Operacional** | Logrotate dos logs Docker, healthcheck cron a cada 5min com auto-restart, gera `INSTALL-INFO.txt` com URLs e status | Não |

Pré-requisitos validados antes de começar: Ubuntu 20+, x86_64 ou aarch64, RAM ≥ 1GB, disco ≥ 10GB.

---

## Variáveis de ambiente suportadas (modo não-interativo)

Você pode pular qualquer prompt definindo variáveis antes de rodar o script. Exemplo completo:

```bash
SUPABASE_URL=https://abc.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
SUPABASE_PROJECT_ID=abc \
SUPABASE_DB_URL=postgresql://postgres:SENHA@db.abc.supabase.co:5432/postgres \
SUPABASE_SERVICE_KEY=eyJ... \
ADMIN_EMAIL=admin@minhaloja.com \
ADMIN_PASSWORD=SenhaForte123 \
DOMAIN=loja.minhaloja.com \
SSL_EMAIL=admin@minhaloja.com \
DEPLOY_FUNCTIONS=yes \
SECRET_RESEND_API_KEY=re_... \
SECRET_LOVABLE_API_KEY=... \
SECRET_MP_WEBHOOK_SECRET=... \
SECRET_EVOLUTION_API_URL=https://evo.exemplo.com \
SECRET_EVOLUTION_API_KEY=... \
sudo -E bash /tmp/install.sh
```

### Tabela completa

| Variável | Obrigatório | Descrição | Onde encontrar |
|----------|-------------|-----------|----------------|
| `SUPABASE_URL` | sim | URL do projeto (`https://xxx.supabase.co`) | Supabase Dashboard → **Project Settings → API** → *Project URL* |
| `SUPABASE_ANON_KEY` | sim | Chave pública (JWT longo) | Supabase Dashboard → **Project Settings → API** → *Project API keys → anon / public* |
| `SUPABASE_PROJECT_ID` | não (deduzido) | Ref do projeto (parte antes de `.supabase.co`) | Mesma tela acima ou na URL do dashboard |
| `SUPABASE_DB_URL` | não | Connection string Postgres (necessária para schema, cron e admin automático) | Supabase Dashboard → **Project Settings → Database → Connection string → URI** (substitua `[YOUR-PASSWORD]` pela senha do banco) |
| `SUPABASE_SERVICE_KEY` | não | Service role key (necessária para criar admin via Auth API) | Supabase Dashboard → **Project Settings → API** → *Project API keys → service_role* (clique em *Reveal*) |
| `ADMIN_EMAIL` | não | Email do primeiro admin | Você define |
| `ADMIN_PASSWORD` | não | Senha do admin (mínimo 6 chars) | Você define |
| `DOMAIN` | não | Domínio apontado para o IP da VPS (ex: `loja.exemplo.com`) | Configure registro **A** no seu provedor DNS antes de rodar |
| `SSL_EMAIL` | não | Email para avisos do Let's Encrypt | Você define (use email real) |
| `DEPLOY_FUNCTIONS` | não | `yes` para instalar Supabase CLI e deployar Edge Functions | Você decide |
| `SECRET_RESEND_API_KEY` | não | API key da Resend para emails transacionais | https://resend.com/api-keys (precisa de domínio verificado) |
| `SECRET_LOVABLE_API_KEY` | não | API key do Lovable AI Gateway | Painel Lovable → workspace settings |
| `SECRET_MP_WEBHOOK_SECRET` | não | Secret de validação HMAC do Mercado Pago | Mercado Pago Dashboard → **Suas integrações → Webhooks → Configurar notificações → Assinatura secreta** |
| `SECRET_EVOLUTION_API_URL` | não | URL da sua instância Evolution API | Sua instância (ex: `https://evo.dominio.com`) |
| `SECRET_EVOLUTION_API_KEY` | não | API key da Evolution | Sua instância Evolution |
| `REPO_URL` | não | URL alternativa do git (default: `VW2Digital/variation-vault-core`) | — |
| `BRANCH` | não | Branch a clonar (default: `main`) | — |
| `APP_DIR` | não | Diretório de instalação (default: `/opt/liberty-pharma`) | — |

---

## Onde achar cada credencial no Supabase (passo a passo)

1. **Project URL + anon key + service_role key**
   `Dashboard → seu projeto → Project Settings (engrenagem) → API`
   - *Project URL* fica no topo
   - *Project API keys*: `anon / public` (sempre visível) e `service_role` (botão **Reveal**)

2. **Connection string do banco**
   `Project Settings → Database → Connection string → URI`
   - Substitua `[YOUR-PASSWORD]` pela senha definida na criação do projeto
   - Se esqueceu a senha: `Database → Database password → Reset database password`

3. **Project Reference**
   - Já aparece na própria URL do dashboard: `https://supabase.com/dashboard/project/<REF>`
   - Ou em `Project Settings → General → Reference ID`

> **Aviso de segurança:** a `service_role` key bypassa RLS. Use apenas durante o install (não commitar, não expor). Após o install ela não é gravada em nenhum arquivo do servidor — só passa em memória para criar o admin.

---

## Após o install

O instalador grava `/opt/liberty-pharma/INSTALL-INFO.txt` com URLs, status de cada etapa e comandos úteis. Para revisitar:

```bash
cat /opt/liberty-pharma/INSTALL-INFO.txt
```

### Comandos do dia a dia

```bash
# Logs do site
docker compose -f /opt/liberty-pharma/docker-compose.yml logs -f app

# Reiniciar
docker compose -f /opt/liberty-pharma/docker-compose.yml restart

# Atualizar (git pull + rebuild)
cd /opt/liberty-pharma && bash deploy-vps/deploy.sh

# Status do fail2ban
fail2ban-client status sshd

# Testar renovação SSL
certbot renew --dry-run
```

---

## Reinstalação

O `install.sh` é seguro para rodar de novo:
- Faz backup do `.env` em `/root/.liberty-env-backup-<timestamp>`
- Remove containers e diretório antigos
- O `schema.sql` usa `CREATE TABLE IF NOT EXISTS` — não apaga dados existentes

Para zerar o banco completamente, veja `deploy-vps/supabase/README.md`.

---

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|----------------|---------|
| `apt update` falha | Mirrors HTTP bloqueados | Script já reescreve para HTTPS automaticamente |
| Schema não aplica | DB URL errada ou senha incorreta | Reset password em Supabase → Database |
| `pg_cron`/`pg_net` falha | Região não suporta | Habilite manualmente em Database → Extensions |
| SSL não emite | DNS não propagou ou porta 80 bloqueada | Aguarde propagação DNS, libere porta 80 no provedor |
| Admin não cria | service_role inválida ou email já existe | Verifique no Supabase Auth → Users |
| Edge functions falham deploy | Token Supabase CLI inválido | `supabase login` manual e `supabase functions deploy` |
| Site não responde após build | RAM insuficiente | Aumente swap ou faça upgrade da VPS |

Logs detalhados ficam em `/tmp/liberty-*.log` durante a execução.
