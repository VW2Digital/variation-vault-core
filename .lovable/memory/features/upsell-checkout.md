---
name: Upsell no Checkout
description: Sugestões "Leve também" antes do pagamento via tabela product_upsells, configurável no formulário de produto
type: feature
---

Sistema de upsell exibido no checkout do carrinho (`/checkout-carrinho`) antes do formulário de pagamento. Cliente adiciona produtos sugeridos com 1 clique e o valor entra automaticamente no total via `useCart().addToCart`.

**Tabela**: `product_upsells` relaciona `product_id` (produto principal no carrinho) → `upsell_product_id` (produto sugerido), com `sort_order`. Constraint `UNIQUE(product_id, upsell_product_id)` e `CHECK (product_id <> upsell_product_id)` impede self-reference. RLS: leitura pública; insert/update/delete apenas pelo dono do produto principal.

**Componente**: `src/components/UpsellSection.tsx` busca todas as associações dos produtos atualmente no carrinho, filtra variações em estoque e exclui itens já adicionados. Suporta seleção de variação via Select quando há mais de uma. Renderizado em `CartCheckout.tsx` antes do `<CheckoutForm>`. Não aparece se não houver upsells configurados.

**Configuração**: Card "Produtos Sugeridos no Checkout (Upsell)" no `ProductForm.tsx` com busca textual + lista de checkboxes (max 50 resultados visíveis). Pills para itens já selecionados com botão X para remover. API helpers: `fetchProductUpsells(productId)` e `saveProductUpsells(productId, ids[])` em `src/lib/api.ts` (estratégia replace: delete + insert).

**Escopo**: Funciona em todos os gateways (Asaas/MP/PagBank/Pagar.me) pois apenas adiciona itens ao carrinho — o total recalculado é enviado normalmente ao gateway ativo.
