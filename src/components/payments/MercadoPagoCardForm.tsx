import { useEffect, useRef, useState } from 'react';
import { loadMercadoPago } from '@/lib/mercadopago';
import { fetchSetting } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Maps known Mercado Pago error codes/messages to user-friendly Portuguese messages.
 */
function friendlyPaymentError(raw: string): string {
  const lower = raw.toLowerCase();

  const errorMap: Array<{ match: (s: string) => boolean; message: string }> = [
    {
      match: (s) => s.includes('diff_param_bins') || s.includes('bin'),
      message: 'Os dados do cartão não correspondem à bandeira detectada. Verifique o número do cartão e tente novamente.',
    },
    {
      match: (s) => s.includes('invalid_token') || s.includes('token'),
      message: 'O token do cartão expirou ou é inválido. Preencha os dados do cartão novamente.',
    },
    {
      match: (s) => s.includes('cc_rejected_insufficient_amount') || s.includes('insufficient'),
      message: 'Saldo insuficiente no cartão. Tente outro cartão ou método de pagamento.',
    },
    {
      match: (s) => s.includes('cc_rejected_bad_filled') || s.includes('bad_filled'),
      message: 'Os dados do cartão estão incorretos. Verifique número, validade e CVV.',
    },
    {
      match: (s) => s.includes('cc_rejected_call_for_authorize'),
      message: 'O banco requer autorização prévia. Entre em contato com o banco emissor do cartão.',
    },
    {
      match: (s) => s.includes('cc_rejected_card_disabled'),
      message: 'O cartão está desabilitado. Entre em contato com o banco ou tente outro cartão.',
    },
    {
      match: (s) => s.includes('cc_rejected_duplicated_payment'),
      message: 'Pagamento duplicado detectado. Aguarde alguns minutos antes de tentar novamente.',
    },
    {
      match: (s) => s.includes('cc_rejected_max_attempts'),
      message: 'Limite de tentativas excedido. Aguarde alguns minutos ou tente outro cartão.',
    },
    {
      match: (s) => s.includes('cc_rejected_high_risk'),
      message: 'Pagamento recusado por segurança. Tente outro cartão ou método de pagamento.',
    },
    {
      match: (s) => s.includes('cc_rejected_blacklist'),
      message: 'Não foi possível processar o pagamento com este cartão. Tente outro cartão.',
    },
    {
      match: (s) => s.includes('cc_rejected') || s.includes('rejected'),
      message: 'Pagamento recusado pelo banco. Verifique os dados ou tente outro cartão.',
    },
    {
      match: (s) => s.includes('timeout') || s.includes('timed out'),
      message: 'O processamento demorou muito. Tente novamente em alguns instantes.',
    },
  ];

  for (const entry of errorMap) {
    if (entry.match(lower)) return entry.message;
  }

  // Fallback: if raw message is too technical, return generic
  if (raw.length > 100 || /[{[\]"]/.test(raw)) {
    return 'Não foi possível processar o pagamento. Verifique os dados do cartão e tente novamente.';
  }

  return raw;
}

type Props = {
  amount: number;
  email: string;
  orderId: string;
  onSuccess: (data: unknown) => void;
  onError: (message: string) => void;
};

export function MercadoPagoCardForm({
  amount,
  email,
  orderId,
  onSuccess,
  onError,
}: Props) {
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cardForm: any;

    async function init() {
      try {
        const publicKey = await fetchSetting('mercadopago_public_key');
        if (!publicKey) {
          onError('Public Key do Mercado Pago não configurada');
          return;
        }

        const mp = await loadMercadoPago(publicKey);

        cardForm = mp.cardForm({
          amount: amount.toFixed(2),
          iframe: true,
          form: {
            id: 'mp-card-form',
            cardNumber: { id: 'form-cardNumber', placeholder: 'Número do cartão' },
            expirationDate: { id: 'form-expirationDate', placeholder: 'MM/YY' },
            securityCode: { id: 'form-securityCode', placeholder: 'CVV' },
            cardholderName: { id: 'form-cardholderName', placeholder: 'Titular do cartão' },
            issuer: { id: 'form-issuer' },
            installments: { id: 'form-installments' },
            identificationType: { id: 'form-identificationType' },
            identificationNumber: { id: 'form-identificationNumber', placeholder: 'CPF' },
            cardholderEmail: { id: 'form-cardholderEmail', placeholder: 'E-mail' },
          },
          callbacks: {
            onFormMounted: () => setLoading(false),
            onSubmit: async (event: Event) => {
              event.preventDefault();

              try {
                const data = cardForm.getCardFormData();

                console.log('[MP CardForm] Raw cardFormData:', JSON.stringify({
                  token: data.token ? `${data.token.substring(0, 8)}...` : null,
                  paymentMethodId: data.paymentMethodId,
                  issuerId: data.issuerId,
                  installments: data.installments,
                  cardholderEmail: data.cardholderEmail,
                  identificationType: data.identificationType,
                  identificationNumber: data.identificationNumber ? '***' : null,
                }));

                const requestBody = {
                  action: 'create_card_payment',
                  orderId,
                  value: amount,
                  creditCard: { token: data.token },
                  creditCardHolderInfo: {
                    email: data.cardholderEmail,
                    cpfCnpj: data.identificationNumber,
                  },
                  installmentCount: Number(data.installments),
                  paymentMethodId: data.paymentMethodId,
                  issuerId: data.issuerId,
                };

                console.log('[MP CardForm] Sending to edge function:', JSON.stringify({
                  ...requestBody,
                  creditCard: { token: '***' },
                  creditCardHolderInfo: { ...requestBody.creditCardHolderInfo, cpfCnpj: '***' },
                }));

                const { data: result, error } = await supabase.functions.invoke('payment-checkout', {
                  body: requestBody,
                });

                if (error) throw new Error(error.message);
                if (result?.error) throw new Error(result.error);

                onSuccess(result);
              } catch (err) {
                const rawMsg = err instanceof Error ? err.message : 'Erro inesperado';
                console.error('[MP CardForm] Payment error (raw):', rawMsg);
                onError(friendlyPaymentError(rawMsg));
              }
            },
            onError: (errors: unknown) => {
              console.error('MP CardForm error', errors);
            },
          },
        });
      } catch (err) {
        onError('Não foi possível inicializar o Mercado Pago');
        setLoading(false);
      }
    }

    void init();

    return () => {
      if (cardForm?.unmount) cardForm.unmount();
    };
  }, [amount, email, orderId, onError, onSuccess]);

  return (
    <form id="mp-card-form" className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando formulário...</span>
        </div>
      )}

      <div className="space-y-2">
        <div id="form-cardNumber" className="h-10 border rounded-md border-border" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div id="form-expirationDate" className="h-10 border rounded-md border-border" />
        <div id="form-securityCode" className="h-10 border rounded-md border-border" />
      </div>

      <div>
        <input id="form-cardholderName" className="w-full h-10 px-3 border rounded-md border-border bg-background text-foreground" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <select id="form-identificationType" className="h-10 px-3 border rounded-md border-border bg-background text-foreground" />
        <input id="form-identificationNumber" className="h-10 px-3 border rounded-md border-border bg-background text-foreground" />
      </div>

      <div>
        <input id="form-cardholderEmail" type="email" defaultValue={email} className="w-full h-10 px-3 border rounded-md border-border bg-background text-foreground" />
      </div>

      <div>
        <select id="form-installments" className="w-full h-10 px-3 border rounded-md border-border bg-background text-foreground" />
      </div>

      <div className="hidden">
        <select id="form-issuer" />
      </div>

      <Button type="submit" className="w-full">
        Pagar com cartão
      </Button>
    </form>
  );
}
