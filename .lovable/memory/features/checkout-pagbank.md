---
name: PagBank Integration
description: PagBank (PagSeguro) checkout transparente integration as third payment gateway option alongside Asaas and Mercado Pago
type: feature
---
PagBank added as third gateway in the factory pattern. Settings saved to `site_settings` keys: `pagbank_token`, `pagbank_public_key`, `pagbank_environment`.

Backend: `PagBankGateway` class in `payment-checkout` edge function. Uses PagBank Orders API (`/orders`) for both PIX (via `qr_codes`) and Card (via `charges` with `encrypted` card). Amounts in centavos (value * 100).

Webhook: `pagbank-webhook` edge function receives PagBank notifications, maps statuses (PAID->PAID, DECLINED->REFUSED, etc.), applies priority-based anti-regression, and sends admin WhatsApp notifications. Always returns 200.

Frontend: `paymentFactory.ts` exports `getPagBankPublicKey()`. The `CheckoutGateway` type includes `'pagbank'`. PagBank uses its own JS SDK (`pagseguro.min.js`) for card encryption via `PagSeguro.encryptCard()`.

Settings UI: Third card in `SettingsPayment.tsx` with Token, Public Key, Environment, and webhook URL fields. Exclusive toggle ensures only one gateway active at a time.
