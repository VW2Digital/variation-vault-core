---
name: Combos de Produtos
description: Sistema de combos com preço fixo gerenciado em /admin/combos e exibido no catálogo
type: feature
---
- Tabelas: `combos` (slug único, price, compare_price, image_url, max_installments, pix_discount_percent, active, sort_order) e `combo_items` (combo_id FK, product_id, variation_id nullable, quantity, sort_order). RLS: leitura pública quando ativo, gestão restrita a admin.
- Admin: `/admin/combos` (lista) e `/admin/combos/:id` (form com `novo` para criar). Form usa upload no bucket `product-images` em pasta `combos/`. Salva via replace de `combo_items`. Combos ativos exigem ≥2 itens.
- Vitrine: `CombosSection.tsx` renderizado no `Catalog.tsx` logo após o BannerCarousel. Card mostra badge COMBO, lista compacta "Nx Produto + Nx Produto", preço riscado e desconto calculado.
- Checkout: `/combo/:slug` (`ComboCheckout.tsx`, adaptado de `PaymentLinkCheckout`). Cria 1 pedido em `orders` com `product_name` = "Combo: {nome} ({Nx item + Nx item})", `quantity=1`, `unit_price=combo.price`. Usa gateway ativo (Asaas/MP) e função `payment-checkout`.
- Slug: gerado via slugify NFD/kebab-case a partir do nome; pode ser editado.
