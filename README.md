# Liberty Pharma — Loja

Projeto construído na [Lovable](https://lovable.dev) com Lovable Cloud (backend integrado: banco de dados, autenticação, edge functions, storage).

**URL do projeto:** https://lovable.dev/projects/f0da6aa7-7048-4961-8fae-083c63d7beea
**Loja publicada:** https://store.pharmaliberty.com

---

## Como editar o código

Existem 4 caminhos. Escolha o que fizer mais sentido pra você.

### 1. Editar pela Lovable (recomendado)

Abra o [projeto na Lovable](https://lovable.dev/projects/f0da6aa7-7048-4961-8fae-083c63d7beea) e converse com a IA. Toda alteração é commitada automaticamente no GitHub (se conectado).

### 2. Editar localmente no seu computador

**Pré-requisitos:** [Node.js](https://nodejs.org) (recomendado instalar via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)) e Git.

**Passo a passo:**

```sh
# 1. Conecte o projeto ao GitHub primeiro:
#    Lovable → Connectors (na sidebar) → GitHub → Connect project
#    Isso cria um repositório no seu GitHub com o código atual.

# 2. Copie a URL do repositório criado (ex: https://github.com/seu-usuario/liberty-pharma.git)

# 3. Clone na sua máquina:
git clone https://github.com/SEU-USUARIO/SEU-REPO.git
cd SEU-REPO

# 4. Instale as dependências:
npm install

# 5. Rode o servidor local com hot reload:
npm run dev
# → abre em http://localhost:8080
```

**Sincronização bidirecional:** mudanças que você faz local + push pro GitHub aparecem na Lovable automaticamente. Mudanças feitas na Lovable são commitadas no GitHub automaticamente.

> ⚠️ **Não edite estes arquivos manualmente** — a Lovable os regenera:
> - `src/integrations/supabase/client.ts`
> - `src/integrations/supabase/types.ts`
> - `.env`

### 3. Editar direto no GitHub

Navegue até o arquivo no repositório → ícone de lápis (Edit) → faça a mudança → Commit. A Lovable sincroniza em segundos.

### 4. GitHub Codespaces

No repositório: botão verde **Code** → aba **Codespaces** → **New codespace**. Edita no navegador, commita, e a Lovable sincroniza.

---

## Stack técnica

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Lovable Cloud (Supabase: Postgres com RLS, Auth, Edge Functions, Storage)
- **Pagamentos:** Asaas, Mercado Pago, PagBank (factory pattern)
- **Logística:** Melhor Envio
- **Comunicação:** Resend (email), Evolution API (WhatsApp)

## Publicar mudanças

Na Lovable: botão **Publish** (canto superior direito). Mudanças de frontend exigem clicar em **Update**; mudanças de backend (edge functions, migrations) entram no ar automaticamente.

## Domínio customizado

Lovable → Project Settings → Domains → Connect Domain. Documentação: https://docs.lovable.dev/features/custom-domain
