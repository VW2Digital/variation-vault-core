---
name: schema-sql-sempre-atualizado
description: Regras para manter /mnt/documents/schema_supabase.sql funcional, idempotente e validado a cada mudança de banco
type: preference
---

Arquivo único e fonte da verdade para recriar o banco do zero no SQL Editor do Supabase: **`/mnt/documents/schema_supabase.sql`**.

## Quando atualizar
A cada `supabase--migration` (nova tabela, coluna, policy, função, trigger, índice ou bucket), refletir a mudança em `schema_supabase.sql` na **Seção 11 — ATUALIZAÇÕES**, sempre de forma idempotente.

## Regras obrigatórias (não negociáveis)

1. **Cabeçalho do arquivo** deve conter, antes do bloco de EXTENSIONS:
   ```sql
   SET check_function_bodies = off;
   ```
   Sem isso, funções `LANGUAGE sql` como `has_role()` quebram em DB limpo porque referenciam tabelas criadas mais adiante (`user_roles`, `resellers`, etc.).

2. **Publication `supabase_realtime`** — em DB próprio (não-Supabase) ela não existe. Sempre criar antes de usar:
   ```sql
   IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
     CREATE PUBLICATION supabase_realtime;
   END IF;
   ```
   E no `ALTER PUBLICATION ... ADD TABLE`, capturar `WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;`.

3. **Idempotência total** — usar sempre:
   - `CREATE TABLE IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   - `DROP POLICY IF EXISTS ...; CREATE POLICY ...`
   - `DROP TRIGGER IF EXISTS ...; CREATE TRIGGER ...`
   - `CREATE OR REPLACE FUNCTION`
   - `CREATE INDEX IF NOT EXISTS`
   - `INSERT ... ON CONFLICT DO NOTHING`

4. **NUNCA recriar views/relations já existentes como tabela.** Erro recorrente: gerar `CREATE TABLE IF NOT EXISTS public.coupons_with_usage` quando é VIEW (idem `flash_campaign_stats`). Antes de adicionar bloco para um nome na Seção 11, conferir se já existe como view nas seções anteriores. Nomes que **NUNCA** devem virar tabela:
   - `coupons_with_usage` (view)
   - `flash_campaign_stats` (view)

5. **Compatibilidade SQL Editor do Supabase** — proibido:
   - `ALTER DATABASE ...`
   - Metacomandos psql: `\restrict`, `\connect`, `\set`, etc.
   - Dependências de roles inexistentes — sempre envolver em `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`

6. **Final estrutural** — após mudanças de schema, terminar com:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
   E atualizar comentário de data/versão no topo.

## Validação local antes de entregar

1. Subir Postgres local: `setpriv --reuid=65534 --regid=65534 --clear-groups bash -c 'initdb -D /tmp/pgdata -U postgres --auth=trust'` + `pg_ctl start` em socket `/tmp` porta `54329`.
2. Rodar `/tmp/prep.sql` que stuba `auth`, `storage`, `net`, `extensions`, roles `anon/authenticated/service_role`, `auth.users`, `auth.uid()`, `auth.role()`, `auth.jwt()`, `storage.buckets/objects`, `storage.foldername()`, `net.http_post()`.
3. Comentar `pg_cron` e `pg_net` (não existem fora do Supabase) via sed antes do teste.
4. Rodar com `psql -f` e exigir: `EXIT=0` e `grep -cE 'ERROR|FATAL' = 0`.
5. Re-rodar contra o mesmo DB para confirmar idempotência (também deve dar 0 erros).

## Ordem segura das seções (não inverter)
1. Header + `SET check_function_bodies = off`
2. Extensions
3. Enums
4. Funções utilitárias (`has_role`, `update_updated_at_column`, etc.)
5. Tabelas core (profiles, user_roles, addresses, products...)
6. Tabelas dependentes (orders, cart_items...)
7. Triggers
8. Views (`coupons_with_usage`, `flash_campaign_stats`)
9. Storage buckets + policies
10. RLS policies
11. ATUALIZAÇÕES (delta de migrations recentes, idempotente)
12. `NOTIFY pgrst, 'reload schema';`