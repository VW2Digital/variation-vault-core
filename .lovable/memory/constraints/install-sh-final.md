---
name: install.sh VPS - versão final aprovada
description: Script deploy-vps/install.sh está finalizado e aprovado em produção - NÃO ALTERAR
type: constraint
---
O arquivo `deploy-vps/install.sh` está em sua versão FINAL e APROVADA em produção real.

**NÃO ALTERAR, REFATORAR OU "MELHORAR"** este arquivo sob nenhuma circunstância, exceto se o usuário pedir EXPLICITAMENTE uma mudança nele.

Arquitetura aprovada (não mexer):
- Usa Supabase Management API com SUPABASE_ACCESS_TOKEN para buscar automaticamente anon key e service_role key do projeto do CLIENTE
- Valida que o token tem permissão no SUPABASE_PROJECT_REF antes de prosseguir
- Sobrescreve qualquer .env do repositório com as credenciais do Supabase do CLIENTE (nunca do Lovable Cloud)
- Ordem de prompts: repo URL → Supabase Access Token → Project Ref → domínio → subdomínio API → SMTP email → SMTP senha
- Instala jq + curl no início para parsing de JSON
- Configura secrets das Edge Functions (SMTP, PUBLIC_SITE_URL, PUBLIC_API_URL) automaticamente via CLI
- Build do frontend: npm install + npm run build, copia dist/ para /var/www/app/dist/
- Nginx + HTTPS + SMTP configurados e validados

**Why:** Usuário confirmou que está perfeito e funcionando em produção após múltiplas iterações. Qualquer alteração futura quebra o deploy.
