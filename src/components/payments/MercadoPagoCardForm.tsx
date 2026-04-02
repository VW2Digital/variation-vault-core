import { useEffect, useRef, useState } from 'react';
import { loadMercadoPago } from '@/lib/mercadopago';
import { fetchSetting } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

                const { data: result, error } = await supabase.functions.invoke('payment-checkout', {
                  body: {
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
                  },
                });

                if (error) throw new Error(error.message);
                if (result?.error) throw new Error(result.error);

                onSuccess(result);
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Erro inesperado');
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
