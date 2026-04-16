# Deploy VPS — Guia Mestre

Este diretório reúne **todas** as opções pra hospedar a Liberty Pharma fora da Lovable: do bare-metal manual ao CI/CD automatizado, passando por Docker com SSL automático.

> 📌 **Não sabe por onde começar?** Pule pro [fluxograma de decisão](#-fluxograma-qual-opção-escolher) abaixo.

---

## 🎯 TL;DR — Recomendações por perfil

| Você é... | Use isto | Tempo |
|---|---|---|
| 💸 **Zero orçamento** | Oracle Free Tier + `quick-start.sh` | 45 min |
| 🚀 **Quero rápido e barato** | DigitalOcean $6 + Traefik + `quick-start.sh` | 15 min |
| 🛠️ **Quero entender cada peça** | DigitalOcean + Nginx + Certbot manual | 60 min |
| 👥 **Tenho equipe / quero CI/CD** | GitHub Actions + qualquer VPS | 30 min setup, 0 depois |
| 🇪🇺 **Quero menor custo absoluto** | Hetzner CX22 (€4) + Traefik | 20 min |

---

## 🗺️ Fluxograma: qual opção escolher?

<lov-artifact url="/__l5e/documents/decisao-deploy.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

---

## 📂 O que tem em cada pasta

```
deploy-vps/
├── README.md                          ← você está aqui
├── quick-start.sh                     ← script único interativo (recomendado)
│
├── GUIA-DIGITALOCEAN.md               ← passo-a-passo DigitalOcean ($6/mês)
├── GUIA-ORACLE-FREE-TIER.md           ← passo-a-passo Oracle Free Tier (R$ 0)
│
├── docker/                            ← Stack Docker + Nginx + Certbot (controle fino)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── nginx.conf
│   └── init-letsencrypt.sh
│
├── docker-traefik/                    ← Stack Docker + Traefik (SSL automático)  ⭐
│   ├── docker-compose.yml
│   ├── traefik.yml
│   └── README.md
│
├── github-actions/                    ← Deploy automático no git push
│   ├── deploy.yml
│   └── SETUP.md
│
├── monitoring/                        ← Prometheus + Grafana + cAdvisor
│   ├── docker-compose.monitoring.yml
│   └── README.md
│
├── backup/                            ← Backup diário pra S3/R2
│   ├── backup.sh
│   └── README.md
│
└── rollback/                          ← Auto-rollback se health check falhar
    ├── deploy-with-rollback.sh
    └── README.md
```

---

## 🚦 As 4 opções explicadas

### Opção 1 — Manual (Nginx + Certbot)

**Pasta:** `deploy-vps/docker/`
**Quando usar:** você quer entender cada peça, ou já tem expertise em Nginx e quer customizar headers/cache/rewrite manualmente.

✅ **Prós**
- Controle total sobre Nginx (cache, rate limit, headers customizados)
- Stack tradicional, muita documentação na web
- Fácil debugar — cada container faz uma coisa

❌ **Contras**
- SSL precisa do `init-letsencrypt.sh` na primeira vez
- Renovação do cert depende de cron + reload do Nginx
- Mais arquivos pra manter (nginx.conf, ssl-options, etc)

**Como subir:**
```bash
cd deploy-vps/docker
cp .env.example .env && nano .env
./init-letsencrypt.sh    # primeira vez apenas
docker compose up -d
```

---

### Opção 2 — Traefik ⭐ (Recomendado)

**Pasta:** `deploy-vps/docker-traefik/`
**Quando usar:** padrão pra 95% dos casos. Mais simples que Nginx+Certbot, sem perder funcionalidade.

✅ **Prós**
- SSL **automático** (zero config) via Let's Encrypt
- Renovação automática, sem cron nem scripts
- Dashboard web bonito em `traefik.seudominio.com`
- Adicionar novo serviço = adicionar 3 labels no compose
- Multi-arch nativo (`linux/amd64` + `linux/arm64`)

❌ **Contras**
- Curva inicial das labels do Docker (mas é trivial depois)
- Menos popular que Nginx em tutoriais antigos

**Como subir (manual):**
```bash
cd deploy-vps/docker-traefik
cp .env.example .env && nano .env
docker compose up -d
```

**Como subir (automático com `quick-start.sh`):**
```bash
curl -fsSL https://raw.githubusercontent.com/SEU_USER/SEU_REPO/main/deploy-vps/quick-start.sh | sudo bash
```

---

### Opção 3 — GitHub Actions (CI/CD)

**Pasta:** `deploy-vps/github-actions/`
**Quando usar:** quer que cada `git push origin main` faça deploy automático na VPS, com build da imagem Docker no GitHub e pull na máquina.

✅ **Prós**
- Zero comando manual depois do setup inicial
- Build acontece nos runners do GitHub (não consome CPU da VPS)
- Logs de cada deploy ficam salvos no GitHub
- Funciona junto com qualquer das opções 1 ou 2

❌ **Contras**
- Setup inicial mais complexo (secrets, SSH keys, registry)
- Depende do GitHub Actions estar no ar (raro, mas acontece)
- Free tier do GHA tem limite de 2000 minutos/mês

**Como subir:** veja `deploy-vps/github-actions/SETUP.md` — basicamente:
1. VPS já configurada com a stack rodando (Opção 1 ou 2)
2. Adicionar secrets no GitHub: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `REGISTRY_TOKEN`
3. Copiar `.github/workflows/deploy.yml` pro repo

---

### Opção 4 — Oracle Free Tier (gratuito pra sempre)

**Guia:** [`GUIA-ORACLE-FREE-TIER.md`](./GUIA-ORACLE-FREE-TIER.md)
**Quando usar:** quer R$ 0/mês, tem paciência pra criar conta Oracle e tolerância pro famoso `Out of host capacity`.

✅ **Prós**
- **4 vCPU + 24GB RAM** grátis pra sempre (ARM Ampere)
- 200GB de disco + 10TB de tráfego/mês inclusos
- Build ARM nativo (graças à imagem multi-arch)

❌ **Contras**
- Burocracia inicial (cartão de crédito pra validar, pode demorar aprovação)
- Erros frequentes de capacidade ARM no Free Tier
- Datacenter Brasil (SP/Vinhedo), latência boa só pra Brasil
- 2 níveis de firewall (Security List + iptables) — fácil errar

---

## 📊 Comparativo rápido

| Critério | Manual (Nginx) | Traefik ⭐ | GH Actions | Oracle Free |
|---|---|---|---|---|
| Tempo setup inicial | 60 min | 15 min | 30 min | 45 min |
| SSL automático | ❌ | ✅ | ✅ (via opção 1/2) | ✅ |
| Multi-arch (ARM) | ✅ | ✅ | ✅ | ✅ obrigatório |
| Deploy automático | ❌ | ❌ | ✅ | ❌ |
| Custo mensal | VPS | VPS | VPS + GHA | **R$ 0** |
| Curva de aprendizado | Média | Baixa | Alta | Média |
| Quem mantém SSL | Cron+você | Traefik | Traefik | Traefik |

---

## 🚀 Caminho mais rápido pro "tô no ar"

Pra **maioria dos casos** (DigitalOcean / Hetzner / Vultr / Oracle):

```bash
# 1. Conecte na VPS via SSH
ssh root@SEU_IP

# 2. Rode o instalador único
curl -fsSL https://raw.githubusercontent.com/SEU_USER/SEU_REPO/main/deploy-vps/quick-start.sh | sudo bash

# 3. Responda 3 perguntas (domínio, email, senha do dashboard) e espere ~10 min
```

Pronto. Domínio com HTTPS válido, dashboard Traefik, firewall configurado, swap criado, fail2ban ativo.

---

## 🧩 Combinando opções

As opções **se combinam**:

| Cenário | Combinação |
|---|---|
| App + monitoramento | `docker-traefik/` + `monitoring/` |
| App + backup automático | `docker-traefik/` + `backup/` |
| Tudo automático com CI | `docker-traefik/` + `github-actions/` + `rollback/` |
| Free Tier completo | `GUIA-ORACLE-FREE-TIER.md` + `quick-start.sh` + `backup/` (S3/R2 grátis) |

---

## 🆘 Onde achar ajuda

- **Erro durante o `quick-start.sh`** → o script imprime exatamente onde parou; copie o bloco de erro e abra issue
- **SSL não emite** → `docker compose logs traefik | grep -i acme` — geralmente DNS errado ou porta 80 bloqueada
- **VPS lenta** → `docker stats` e `htop` — provavelmente RAM insuficiente (mínimo 1GB + 1GB de swap)
- **Specifico Oracle** → seção Troubleshooting no `GUIA-ORACLE-FREE-TIER.md`
- **Específico DigitalOcean** → seção Troubleshooting no `GUIA-DIGITALOCEAN.md`

---

## 🔗 Links úteis

- [Documentação Traefik](https://doc.traefik.io/traefik/)
- [Docker Compose reference](https://docs.docker.com/compose/compose-file/)
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — cuidado pra não esgotar testando
- [DigitalOcean referral $200 free](https://m.do.co/c/) — vale 60 dias
- [Hetzner referral €20 free](https://hetzner.com/cloud) — sem deadline
