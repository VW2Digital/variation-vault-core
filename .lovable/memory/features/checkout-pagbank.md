---
name: PagBank Integration
description: PagBank (PagSeguro) checkout redirect integration as third payment gateway option alongside Asaas and Mercado Pago
type: feature
---
PagBank added as third gateway in the factory pattern. Settings saved to `site_settings` keys: `pagbank_token`, `pagbank_public_key`, `pagbank_environment`.

**Checkout Mode: Redirect** (not transparent). When PagBank is active, the customer is redirected to PagBank's hosted checkout page. This avoids the need for PagBank SDK, card encryption, and API Connect v4 whitelist.

Backend: `PagBankGateway` class in `payment-checkout` edge function. The `create_pagbank_checkout` action calls PagBank's `/checkouts` API to generate a redirect URL. Supports PIX, Credit Card, and Debit Card via PagBank's hosted page. Amounts in centavos (value * 100).

Frontend: When `isPagBank`, the payment step shows a single "Pagar via PagBank" button instead of PIX/Card selection. No SDK loaded. Order is created before redirect. Cart is cleared before redirect.

Webhook: `pagbank-webhook` edge function receives PagBank notifications, maps statuses (PAID->PAID, DECLINED->REFUSED, etc.), applies priority-based anti-regression, and sends admin WhatsApp notifications. Always returns 200.

Settings UI: Third card in `SettingsPayment.tsx` with Token, Public Key, Environment, webhook URL, and redirect URL fields. Exclusive toggle ensures only one gateway active at a time.

NOTE: PagBank account requires "allowlist" access for both Orders API and Checkouts API. Contact PagBank support to enable API access.
