---
name: Mercado Pago Redirect Checkout
description: Mercado Pago Checkout Pro (redirect mode) as alternative to transparent checkout, selectable via admin settings
type: feature
---
Mercado Pago now supports two checkout modes, configurable via `mercadopago_checkout_mode` in `site_settings`:

1. **Transparent** (default): PIX + Card forms rendered in-page. Requires MP SDK, public key, tokenization.
2. **Redirect** (Checkout Pro): Customer redirected to Mercado Pago hosted page. No SDK needed. Supports PIX, Credit, Debit, Boleto.

Backend: `create_mp_checkout` action in `payment-checkout` edge function. Calls MP's `/checkout/preferences` API. Returns `init_point` URL. Uses `auto_return: 'approved'` and `back_urls` pointing to `/minha-conta`.

Frontend: When `isMpRedirect` (MP active + redirect mode), the payment step shows a single "Pagar via Mercado Pago" button. Same UI pattern as PagBank redirect. Order created before redirect, cart cleared.

Settings UI: "Modo de Checkout" selector in MP card on `SettingsPayment.tsx` with "Transparente" and "Redirect" options.

Hook: `useMercadoPago` exposes `checkoutMode`. When redirect, SDK is NOT loaded. When transparent, full SDK init with tokenization.
