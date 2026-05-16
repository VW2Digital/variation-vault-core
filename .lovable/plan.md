# Combos de Produtos (preço fixo)

Sistema onde o admin monta um pacote com 2+ produtos/variações, define um preço promocional único, e o combo aparece como item de vitrine no catálogo. Ao comprar, vira um pedido único.

## 1. Banco de dados

Migration nova (2 tabelas):

**`combos`**
- `id`, `user_id` (admin dono), `name`, `subtitle`, `description`
- `image_url`, `price` (preço final do combo), `compare_price` (riscado, opcional)
- `active` (bool), `sort_order` (int)
- `max_installments`, `pix_discount_percent` (mesmas regras dos produtos)
- `slug` (único, para URL `/combo/:slug`)
- `created_at`, `updated_at`

**`combo_items`**
- `id`, `combo_id` (fk)
- `product_id`, `variation_id` (nullable), `quantity` (default 1)
- `sort_order`

RLS:
- `SELECT` público quando `active = true`
- Admin (`has_role(auth.uid(),'admin')`) gerencia tudo
- Mesma política para `combo_items` (via combo dono)

## 2. Página admin `/admin/combos`

Lista todos os combos com:
- Imagem, nome, preço, status (ativo/inativo), nº de itens
- Botões Editar / Duplicar / Excluir (com confirmação "EXCLUIR")
- Botão "Novo combo"

Formulário (modal ou rota `/admin/combos/:id`):
- Campos básicos (nome, subtítulo, descrição, slug, imagem upload no bucket `product-images`)
- Preço do combo + preço comparativo (riscado)
- Parcelas máximas, desconto PIX
- Lista de itens: seletor de produto + variação + quantidade (similar ao UpsellManager existente, com dnd-kit para reordenar)
- Toggle ativo, ordem de exibição
- Salvar usa upsert + replace de `combo_items`

## 3. Sidebar e rotas

- `AdminSidebar.tsx`: adicionar item "Combos" (ícone `Package2` ou `Boxes`) abaixo de Upsells
- `App.tsx`: rota `combos` → `CombosManagerPage` (lazy)

## 4. Vitrine no catálogo

Nova seção "Combos em destaque" na home (`src/pages/Index.tsx` ou `Catalog.tsx`), exibida acima ou abaixo do grid de produtos, somente quando houver combos ativos.

Card de combo:
- Imagem, nome, badge "COMBO"
- Lista compacta dos itens incluídos (ex: "2x Produto A + 1x Produto B")
- Preço riscado + preço do combo + % de desconto
- Botão "Comprar combo" → leva para `/combo/:slug`

## 5. Página de checkout do combo `/combo/:slug`

Reaproveita o layout do checkout existente (`ProductCheckout`):
- Mostra todos os itens do combo
- Preço fixo do combo (não soma variações)
- Pagamento normal (Asaas/MP/PagBank conforme gateway ativo)
- Ao criar pedido em `orders`:
  - `product_name` = nome do combo
  - `unit_price` = preço do combo
  - `quantity` = 1
  - metadados do combo (id, itens) salvos em campo apropriado (usar `dosage` já não cabe; vamos concatenar a descrição dos itens no `product_name` entre parênteses, mantendo backend atual sem mudanças invasivas)

Observação: para não alterar schema de `orders`, o pedido do combo é tratado como produto único de preço fixo. Histórico do cliente mostra "Combo X" normalmente.

## 6. Detalhes técnicos

- Slug auto-gerado a partir do nome (kebab-case) com fallback ao salvar
- Validação: combo precisa ter ≥ 2 itens para ser ativado
- Imagem upload via storage `product-images` (bucket já público existente)
- `api.ts`: adicionar `fetchCombos()`, `fetchComboBySlug()`, `saveCombo()`, `deleteCombo()`
- Memória nova: `mem://features/combos-produtos`

## Arquivos a criar/editar

```text
NEW  supabase/migrations/<ts>_combos.sql
NEW  src/pages/CombosManagerPage.tsx
NEW  src/pages/ComboCheckout.tsx
NEW  src/components/CombosSection.tsx
EDIT src/App.tsx                       (rotas /admin/combos e /combo/:slug)
EDIT src/components/AdminSidebar.tsx   (link Combos)
EDIT src/pages/Index.tsx ou Catalog    (seção Combos)
EDIT src/lib/api.ts                    (helpers de combo)
NEW  .lovable/memory/features/combos-produtos.md
```

## Fora do escopo (não vou fazer agora)

- Estoque por combo (vamos descontar do estoque das variações só se você pedir depois)
- Cupom aplicado dentro de combo
- Combos no checkout do carrinho normal (só na URL própria `/combo/:slug`)

Posso prosseguir?
