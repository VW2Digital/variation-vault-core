# Guia: Deploy gratuito na Oracle Cloud Ampere ARM (Free Tier)

Hospedagem **100% gratuita pra sempre** numa VM ARM com **4 vCPU + 24GB RAM + 200GB disco** — recursos absurdos comparados a qualquer VPS paga. Stack: Docker + Traefik + SSL automático, build multi-arch `linux/arm64`.

> ⏱️ **Tempo total:** ~45 minutos (a maior parte é espera pela Oracle aprovar a conta).
> 💰 **Custo:** R$ 0,00 — pra sempre, sem trial expirando.
> ⚠️ **Pegadinhas:** Oracle às vezes nega a criação da VM ARM por falta de capacidade. Tem solução — explico no passo 3.

---

## Visão geral

| Etapa | O que acontece | Tempo |
|---|---|---|
| 1 | Criar conta Oracle Cloud (precisa cartão de crédito pra validar, **não é cobrado**) | 10-30min |
| 2 | Configurar VCN (rede virtual) | 3min |
| 3 | Criar a VM Ampere ARM (Always Free) | 5min |
| 4 | Liberar portas no firewall (Security List + iptables) | 5min |
| 5 | Configurar DNS apontando pra IP público | 3min |
| 6 | Conectar via SSH e rodar o `quick-start.sh` | 15min |
| 7 | Validar HTTPS funcionando | 2min |

---

## Pré-requisitos

- ✅ **Cartão de crédito internacional** (Visa/Master) pra validar a conta — Oracle faz uma cobrança de US$ 0 (autorização) e libera. Não há cobrança real no Free Tier.
- ✅ **Domínio próprio** (registrado em Registro.br, Namecheap, Cloudflare, etc).
- ✅ **Cliente SSH** (terminal nativo no Mac/Linux, ou [Termius](https://termius.com)/PuTTY no Windows).
- ✅ **Repositório Git** com este projeto (GitHub/GitLab).

---

## Etapa 1 — Criar conta Oracle Cloud

1. Acesse https://signup.cloud.oracle.com/
2. Preencha:
   - **País:** Brasil (importante: define a região default)
   - **Nome/email/telefone:** dados reais
   - **Account type:** `Individual`
   - **Cloud Account Name:** algo único (ex: `liberty-pharma-2026`) — vira o subdomínio do console
3. **Região home:** escolha **`São Paulo (sa-saopaulo-1)`** ou **`Vinhent (sa-vinhedo-1)`** pra menor latência no Brasil. ⚠️ Essa escolha é **definitiva** — não dá pra mudar depois.
4. Verifique email e telefone (recebe SMS).
5. Adicione cartão de crédito → Oracle valida com US$ 0.
6. Aguarde aprovação. Pode levar de 2 minutos a algumas horas. Você recebe um email "Your Oracle Cloud Account is Ready".

> 💡 **Dica:** Se a conta ficar "Pending" por mais de 24h, abra um chat no support da Oracle. Geralmente liberam na hora.

---

## Etapa 2 — Configurar a rede (VCN)

Depois de logado em https://cloud.oracle.com:

1. Menu (☰) → **Networking** → **Virtual Cloud Networks**
2. Clique em **Start VCN Wizard**
3. Selecione **Create VCN with Internet Connectivity** → **Start VCN Wizard**
4. Preencha:
   - **VCN Name:** `vcn-liberty`
   - **Compartment:** deixe o default (root)
   - Resto: deixar default (CIDR `10.0.0.0/16`)
5. **Next** → **Create**

Pronto, você tem uma rede com sub-rede pública e gateway de internet.

---

## Etapa 3 — Criar a VM Ampere ARM

Esta é a parte que **pode dar problema** por falta de capacidade — leia até o fim antes de prosseguir.

1. Menu (☰) → **Compute** → **Instances** → **Create Instance**
2. Configure:
   - **Name:** `vm-liberty-arm`
   - **Compartment:** root (default)
   - **Placement:** mantenha o AD sugerido (vai testar todos depois se falhar)
   - **Image and shape:** clique **Edit** → **Change shape**
     - **Shape series:** `Ampere`
     - **Shape:** `VM.Standard.A1.Flex`
     - **OCPU:** `4` (máximo do Free Tier)
     - **Memory:** `24 GB` (máximo do Free Tier)
   - **Image:** `Canonical Ubuntu 24.04` (Minimal ou Standard)
   - **Networking:** use a `vcn-liberty` criada, **Public subnet**, **Assign a public IPv4 address**
   - **SSH keys:** escolha **Generate a key pair for me** → clique em **Save Private Key** e **Save Public Key** (você vai precisar do arquivo `.key` privado)
   - **Boot volume:** deixe default (47GB) — pode aumentar até 200GB grátis depois
3. **Create**

### Se aparecer erro `Out of host capacity`

É super comum. A Oracle ARM no Free Tier vive lotada. Soluções **na ordem de eficácia**:

**Opção A — Loop com OCI CLI (mais eficaz)**
1. Em outro lugar (sua máquina), instale o [OCI CLI](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm)
2. Configure com `oci setup config`
3. Salve o JSON da tentativa de criação (Console → Instance failed → "View JSON")
4. Rode num loop:
   ```bash
   while true; do
     oci compute instance launch --from-json file://launch.json && break
     sleep 60
   done
   ```
   Em geral consegue em algumas horas.

**Opção B — Tentar outro AD**
Repita a criação trocando entre `AD-1`, `AD-2`, `AD-3` (Availability Domains). São datacenters diferentes na mesma região.

**Opção C — Reduzir recursos**
Tente `2 OCPU + 12GB RAM` (metade). Costuma ter mais capacidade. Ainda é mais que suficiente pra esta aplicação.

**Opção D — Mudar pra outra região**
São Paulo costuma ter menos vagas. Tente `us-ashburn-1` (Virginia) ou `eu-frankfurt-1`. Latência fica pior pro Brasil (~150ms) mas funciona.

---

## Etapa 4 — Liberar portas (DOIS níveis de firewall)

A Oracle tem **dois firewalls em camadas** — esse é o erro #1 de quem deploya pela primeira vez.

### 4.1 — Security List (firewall da VCN)

1. Menu → **Networking** → **Virtual Cloud Networks** → `vcn-liberty`
2. Clique na **Public Subnet**
3. Clique na **Default Security List for vcn-liberty**
4. **Ingress Rules** → **Add Ingress Rules** — adicione 2 regras:

| Source CIDR | Protocol | Destination Port | Descrição |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP Let's Encrypt |
| `0.0.0.0/0` | TCP | `443` | HTTPS app |

(A porta 22 já vem aberta por default.)

### 4.2 — iptables dentro da VM

Ubuntu da Oracle vem com **iptables bloqueando tudo exceto 22**. Você vai liberar isso via SSH no passo 6 — o `quick-start.sh` cuida disso, mas se preferir manual:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Etapa 5 — Configurar DNS

Na página da instância (Compute → Instances → `vm-liberty-arm`), copie o **Public IP Address** (algo tipo `132.226.xxx.xxx`).

No painel do seu provedor de domínio, crie 3 registros tipo **A**:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` | `132.226.xxx.xxx` | 300 |
| A | `www` | `132.226.xxx.xxx` | 300 |
| A | `traefik` | `132.226.xxx.xxx` | 300 |

Aguarde 2-5 minutos e teste:

```bash
dig +short seudominio.com
# deve retornar 132.226.xxx.xxx
```

---

## Etapa 6 — Conectar via SSH e rodar o quick-start

### 6.1 — Conectar

Com o arquivo `.key` privado salvo do passo 3:

```bash
chmod 600 ~/Downloads/ssh-key-2026.key
ssh -i ~/Downloads/ssh-key-2026.key ubuntu@132.226.xxx.xxx
```

> 💡 **Windows com PuTTY:** converta o `.key` pra `.ppk` usando o PuTTYgen primeiro.

### 6.2 — Liberar iptables (CRÍTICO antes do quick-start)

Rode dentro da VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt update && sudo apt install -y netfilter-persistent
sudo netfilter-persistent save
```

Sem isso, o Let's Encrypt **vai falhar** (não consegue HTTP-01 challenge na porta 80) e você corre risco de bater no rate limit.

### 6.3 — Rodar o quick-start

```bash
# Baixa e executa direto do seu repo
curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/deploy-vps/quick-start.sh | sudo bash
```

Ou clonando antes (se quiser inspecionar):

```bash
sudo apt install -y git
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /tmp/repo
sudo bash /tmp/repo/deploy-vps/quick-start.sh
```

O script vai:
1. Perguntar **domínio**, **email** (Let's Encrypt) e **senha do dashboard Traefik**
2. Validar DNS (todos os 3 subdomínios apontando pra IP correto)
3. Instalar Docker + Compose + UFW + fail2ban
4. Configurar swap de 2GB (precaução, mesmo com 24GB de RAM)
5. Clonar o repo em `/opt/liberty-pharma`
6. Gerar `.env` com htpasswd escapado
7. **Buildar a imagem `linux/arm64` localmente** (4-7 minutos no Ampere)
8. Subir os containers e validar HTTPS

> ⚙️ **Multi-arch nativo:** como você está dentro de uma VM ARM, o `docker compose build` produz uma imagem `linux/arm64` **nativa** (sem QEMU/emulação) — build é rápido e runtime é máxima performance. É exatamente pra isso que serve a configuração multi-arch que existe no projeto.

---

## Etapa 7 — Validar

Quando o script terminar, deve aparecer:

```
╔══════════════════════════════════════════════════════════╗
║                  ✓ DEPLOY CONCLUÍDO                       ║
╚══════════════════════════════════════════════════════════╝

URLs:
  🌐 App:       https://seudominio.com
  🎛️  Dashboard: https://traefik.seudominio.com  (login: admin)
```

Teste:

```bash
# HTTP redireciona pra HTTPS
curl -I http://seudominio.com
# Esperado: 308 Permanent Redirect → https://

# HTTPS responde 200
curl -I https://seudominio.com
# Esperado: HTTP/2 200

# Cert é Let's Encrypt real (não staging)
echo | openssl s_client -servername seudominio.com -connect seudominio.com:443 2>/dev/null | openssl x509 -noout -issuer
# Esperado: issuer=C=US, O=Let's Encrypt, CN=R3
```

Abra `https://seudominio.com` no navegador → cadeado verde, app carrega.

---

## Manutenção e operação

### Atualizar o app

```bash
cd /opt/liberty-pharma
git pull
docker compose build app
docker compose up -d --no-deps --force-recreate app
```

### Ver logs

```bash
cd /opt/liberty-pharma
docker compose logs -f app          # logs do app
docker compose logs -f traefik      # logs do proxy/SSL
docker compose ps                   # status dos containers
```

### Reiniciar

```bash
docker compose restart app
docker compose restart traefik
```

### Ver consumo de recursos

```bash
docker stats          # CPU/RAM por container
htop                  # geral da VM
df -h                 # disco
```

---

## Troubleshooting comum

| Sintoma | Causa | Fix |
|---|---|---|
| `curl https://...` dá timeout | iptables bloqueando 443 | Rode o passo 6.2 de novo |
| Let's Encrypt: `connection refused` | Security List sem porta 80/443 | Volte ao passo 4.1 |
| `Out of host capacity` ao criar VM | Free Tier ARM lotado | Use loop OCI CLI (passo 3) |
| Build do Docker muito lento | Tentando build x86 com QEMU | Garanta que está dentro da VM ARM (`uname -m` deve dar `aarch64`) |
| `Too many requests` Let's Encrypt | DNS errado em tentativas anteriores | Aguarde 1h, cert é cacheado depois |
| App acessa localhost mas não pelo domínio | DNS não propagou | `dig +short seudominio.com` deve dar o IP da VM |

---

## Limites do Free Tier (sempre grátis)

| Recurso | Limite | Suficiente pra este app? |
|---|---|---|
| ARM Compute (Ampere A1) | 4 OCPU + 24 GB RAM total | ✅ Muito |
| Block Storage | 200 GB total | ✅ Muito |
| Tráfego de saída | 10 TB/mês | ✅ Muito |
| Load Balancer | 1 (10 Mbps) | Não usado (Traefik faz o papel) |
| IPs públicos reservados | 2 | ✅ |
| Backups automáticos | Ilimitados | ✅ Use! |

---

## Próximos passos opcionais

- 📦 **Backup automático** do banco/storage pra S3/R2 → `deploy-vps/backup/README.md`
- 📊 **Monitoramento** Prometheus + Grafana → `deploy-vps/monitoring/README.md`
- 🔄 **CI/CD** com deploy automático no `git push` → `deploy-vps/github-actions/SETUP.md`
- 🛡️ **Auto-rollback** em caso de health check falhar → `deploy-vps/rollback/README.md`
- 🔐 **Snapshot semanal** da boot volume pelo console Oracle (Compute → Boot Volumes → Backup Policy → Bronze)

---

## Custos reais (transparência)

- **VM ARM 4 vCPU + 24GB:** R$ 0/mês — pra sempre, no Free Tier.
- **Tráfego:** 10TB/mês incluso. Equivale a milhões de visitas. Acima disso → US$ 0.0085/GB.
- **Snapshot da boot volume:** incluso até 5 GB; acima disso US$ 0.0255/GB/mês.
- **IP público:** grátis enquanto a VM estiver rodando. Se desligar a VM por >7 dias, perde o IP.

> 💡 Se um dia precisar escalar além do Free Tier, a mesma VM aceita **upgrade pra paga** sem reinstalar — só editar shape no console.
