# Supabase Self-Hosted na VPS — Modo Enxuto (2GB RAM)

Stack PostgreSQL + Auth + Storage + Edge Functions + Kong rodando em Docker na **mesma VPS** do site. **Realtime removido** e substituído por polling de 10s no front (Dashboard cliente e Pedidos admin) — economia de ~256MB RAM.

## ⚠️ Avisos importantes

- **Você assume responsabilidade total**: backups, atualizações, segurança, SSL.
- **Banco zerado**: você vai recadastrar produtos/configurações pelo painel admin.
- **Edge Functions atuais NÃO são copiadas**: webhooks de Asaas/MP/PagBank/Melhor Envio precisam ser reimplantados manualmente neste runtime.
- **Sem Realtime**: dashboard admin (`/admin/pedidos`) e portal cliente (`/minha-conta`) atualizam a cada 10s via polling. Funciona, só não é instantâneo.
- **pg_cron**: instalado, mas precisa recriar os jobs (carrinho abandonado, sync rastreio).
- **Sem SSL inicial**: acesso via `http://IP:8000`. Gateways de pagamento podem rejeitar webhooks sem HTTPS — recomendo configurar Caddy + subdomínio antes de produção.

## Instalação (1 comando)

Numa **VPS Ubuntu 22.04 limpa, com 2GB+ RAM**:

```bash
curl -fsSL https://raw.githubusercontent.com/VW2Digital/variation-vault-core/main/deploy-vps/supabase/install-supabase.sh | sudo bash
```

Demora 5-8 min na primeira vez (download das imagens). No final imprime:
- IP da API (`http://SEU_IP:8000`)
- `ANON_KEY` (público — vai no `.env` do site)
- `SERVICE_ROLE_KEY` (privado — só pras Edge Functions)

## Apontar o site pro novo Supabase

Edite `/opt/liberty-pharma/.env`:

```env
VITE_SUPABASE_URL=http://SEU_IP:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY que o instalador imprimiu>
VITE_SUPABASE_PROJECT_ID=local
```

Rebuild:
```bash
cd /opt/liberty-pharma
docker compose up -d --build
```

## Studio (UI gráfica) sob demanda

Pra economizar RAM, o Studio NÃO sobe junto. Quando precisar:

```bash
# Na VPS:
cd /opt/supabase && ./studio.sh

# Da sua máquina (outro terminal):
ssh -L 3000:localhost:3000 root@SEU_IP

# Abre no navegador:
http://localhost:3000
```

`Ctrl+C` no terminal da VPS encerra o Studio e libera ~300MB de RAM.

## Rotinas operacionais

| Ação | Comando |
|---|---|
| Status dos containers | `cd /opt/supabase && docker compose ps` |
| Logs do Auth | `docker compose logs -f auth` |
| Logs do Postgres | `docker compose logs -f db` |
| Restart tudo | `docker compose restart` |
| Parar tudo | `docker compose down` |
| Subir tudo | `docker compose up -d` |
| Ver uso de RAM | `docker stats --no-stream` |

## Backup diário automático

Adicione ao cron do root:

```bash
crontab -e
```

```cron
0 3 * * * docker exec supabase-db-1 pg_dumpall -U postgres | gzip > /root/backups/supabase-$(date +\%Y\%m\%d).sql.gz && find /root/backups -mtime +7 -delete
```

(Cria diretório antes: `mkdir -p /root/backups`)

## Restaurar backup

```bash
gunzip < /root/backups/supabase-AAAAMMDD.sql.gz | docker exec -i supabase-db-1 psql -U postgres
```

## O que NÃO foi instalado (e por quê)

| Removido | Motivo | Como adicionar depois |
|---|---|---|
| **Studio sempre ligado** | Economia de ~300MB RAM | Use `./studio.sh` sob demanda |
| **Logflare + Vector** | Economia de ~400MB RAM | Adicionar ao `docker-compose.yml` se precisar logs centralizados |
| **Analytics** | Economia de ~200MB RAM | Idem |
| **imgproxy** | Não é essencial pra storage | Adicionar se precisar transformação de imagens |

## Troubleshooting

**Postgres reiniciando em loop**: provavelmente RAM cheia. Confira `free -h` e `docker stats`. Se passar de 90% RAM, desligue containers menos críticos ou faça upgrade da VPS.

**Auth retornando 500**: confira `docker compose logs auth | tail -50`. Comum: senha do `authenticator` divergente entre `.env` e Postgres init.

**Site não conecta no banco**: confira firewall (`ufw status`) — porta 8000 precisa estar liberada.

**Edge Function antiga não roda**: você precisa migrar manualmente o código `.ts` de `supabase/functions/<nome>/` pra `/opt/supabase/volumes/functions/<nome>/` e reiniciar: `docker compose restart functions`.

## Limites desta configuração

- **Sem alta disponibilidade**: se a VPS cair, tudo cai junto (banco, site, pagamentos).
- **Sem replicação**: backup é seu único seguro contra perda de dados.
- **Performance limitada**: 4GB RAM atende ~1000 usuários simultâneos no máximo.
- **Edge Functions sem hot reload**: cada mudança precisa de `docker compose restart functions`.

Pra produção séria com volume, considere VPS de 8GB+ ou voltar pro Lovable Cloud gerenciado.
