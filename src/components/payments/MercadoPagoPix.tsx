import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Props = {
  amount: number;
  email: string;
  orderId: string;
  description?: string;
};

type PixResponse = {
  id: string;
  status: string;
  pixQrCode?: {
    encodedImage: string;
    payload: string;
    expirationDate?: string;
  };
};

export function MercadoPagoPix({ amount, email, orderId, description }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<PixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreatePix() {
    try {
      setLoading(true);
      setError(null);

      const { data: result, error: invokeError } = await supabase.functions.invoke('payment-checkout', {
        body: {
          action: 'create_pix_payment',
          orderId,
          value: amount,
          description: description || `Pedido ${orderId}`,
          creditCardHolderInfo: { email },
        },
      });

      if (invokeError) throw new Error(invokeError.message);
      if (result?.error) throw new Error(result.error);

      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      setError(msg);
      toast({ title: 'Erro ao gerar Pix', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const handleCopyCode = () => {
    if (data?.pixQrCode?.payload) {
      navigator.clipboard.writeText(data.pixQrCode.payload);
      setCopied(true);
      toast({ title: 'Código PIX copiado!' });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {!data && (
        <Button onClick={handleCreatePix} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Gerando Pix...
            </>
          ) : (
            'Pagar com Pix'
          )}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data?.pixQrCode?.encodedImage && (
        <div className="flex flex-col items-center gap-4">
          <img
            src={`data:image/png;base64,${data.pixQrCode.encodedImage}`}
            alt="QR Code Pix"
            className="w-48 h-48 border rounded-lg border-border"
          />
          {data.pixQrCode.payload && (
            <div className="w-full space-y-2">
              <textarea
                readOnly
                value={data.pixQrCode.payload}
                rows={3}
                className="w-full text-xs p-2 border rounded-md border-border bg-muted resize-none"
              />
              <Button variant="outline" size="sm" onClick={handleCopyCode} className="w-full">
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar código Pix
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
