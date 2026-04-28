---
name: Multi-Gateway Card Fallback
description: After card rejection by issuer/fraud rules, offers re-trying same card on alternative configured gateways
type: feature
---
# Fallback Multi-Gateway de Cartão

Quando o cartão é recusado por motivo elegível (issuer, fraude, alto risco, sem limite, max_attempts, "other reason"), o checkout oferece:
1. Pagar com PIX em 1 clique (Smart PIX Fallback existente)
2. Botões "Tentar com X" para cada gateway de cartão configurado, na ordem: **Mercado Pago → Pagar.me → Asaas** (PagBank excluído por ser redirect).

## Critério de elegibilidade
`isCardRejectionEligibleForFallback()` em `src/lib/paymentErrors.ts`:
- Bloqueia erros de digitação (CVV/data/número errados, tokenização) — fallback não ajudaria.
- Permite: rejected, recusad, high_risk, blacklist, insufficient, call_for_authorize, max_attempts, rejected_by_issuer, etc.

## Arquitetura
- **Backend**: `payment-checkout` aceita `gatewayOverride` no payload (whitelist: mercadopago/pagarme/asaas/pagbank). Salva `payment_gateway` real no `orders` para o webhook correto reconhecer.
- **Frontend**: `getAvailableCardFallbacks(currentGateway)` em `src/services/payments/paymentFactory.ts` lê `site_settings` e retorna gateways com chaves configuradas (excluindo o atual).
- **Tokenização ad-hoc**: `src/services/payments/cardTokenizers.ts` carrega SDKs sob demanda (MP via script tag) e tokeniza independente do hook `useMercadoPago`. Asaas envia raw para o servidor.
- **Reuso de pedido**: O mesmo `orderId` é reutilizado nas tentativas (não cria pedido novo) para evitar duplicação no admin.
- Após uma falha, o gateway falho é removido da lista para que o usuário tente o próximo.
