---
name: Campanhas Relâmpago
description: Páginas de oferta com cronômetro de urgência, link de pagamento e tracking de conversão
type: feature
---
- Tabelas `flash_campaigns` e `flash_campaign_events` (view, click, order, conversion).
- Página pública `/relampago/:slug` (tema vermelho urgência, cronômetro até `expires_at`).
- Admin em `/admin/campanhas-relampago` exibe views/cliques/conversões/taxa via view `flash_campaign_stats` (security_invoker).
- CTA navega para `/pagar/:slug` do payment_link, gravando `flash_campaign_pending` em sessionStorage; ao criar pedido, registra evento `order`.
- Trigger `flash_campaign_register_conversion` em `orders` cria evento `conversion` ao virar PAID/CONFIRMED/RECEIVED.