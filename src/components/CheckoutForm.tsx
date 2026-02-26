import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, QrCode, Loader2, CheckCircle2, Copy } from 'lucide-react';

interface CheckoutFormProps {
  productName: string;
  dosage: string;
  quantity: number;
  unitPrice: number;
}

type PaymentMethod = 'credit_card' | 'pix';
type CheckoutStep = 'customer' | 'payment' | 'success';

const CheckoutForm = ({ productName, dosage, quantity, unitPrice }: CheckoutFormProps) => {
  const { toast } = useToast();
  const totalValue = unitPrice * quantity;

  const [step, setStep] = useState<CheckoutStep>('customer');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [processing, setProcessing] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // Customer fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCcv, setCardCcv] = useState('');
  const [installments, setInstallments] = useState(1);

  // Card holder info
  const [holderEmail, setHolderEmail] = useState('');
  const [holderCpf, setHolderCpf] = useState('');
  const [holderPostalCode, setHolderPostalCode] = useState('');
  const [holderAddressNumber, setHolderAddressNumber] = useState('');
  const [holderPhone, setHolderPhone] = useState('');

  const invokeAsaas = async (action: string, payload: any) => {
    const { data, error } = await supabase.functions.invoke('asaas-checkout', {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const formatCpf = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleCreateCustomer = async () => {
    if (!name || !email || !cpf || !phone) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    try {
      const customer = await invokeAsaas('create_customer', {
        name,
        email,
        cpfCnpj: cpf.replace(/\D/g, ''),
        phone: phone.replace(/\D/g, ''),
      });
      setCustomerId(customer.id);
      setHolderEmail(email);
      setHolderCpf(cpf);
      setHolderPhone(phone);
      setStep('payment');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    try {
      const description = `${productName} ${dosage} x${quantity}`;

      if (paymentMethod === 'pix') {
        const result = await invokeAsaas('create_pix_payment', {
          customer: customerId,
          value: totalValue,
          description,
        });
        setPaymentResult(result);
      } else {
        const result = await invokeAsaas('create_card_payment', {
          customer: customerId,
          value: totalValue,
          description,
          installmentCount: installments,
          creditCard: {
            holderName: cardName,
            number: cardNumber.replace(/\s/g, ''),
            expiryMonth: cardExpMonth,
            expiryYear: cardExpYear,
            ccv: cardCcv,
          },
          creditCardHolderInfo: {
            name,
            email: holderEmail,
            cpfCnpj: holderCpf.replace(/\D/g, ''),
            postalCode: holderPostalCode.replace(/\D/g, ''),
            addressNumber: holderAddressNumber,
            phone: holderPhone.replace(/\D/g, ''),
          },
        });
        setPaymentResult(result);
      }
      setStep('success');
    } catch (err: any) {
      toast({ title: 'Erro no pagamento', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})/g, '$1 ').trim();
  };

  const maxInstallments = Math.min(6, Math.floor(totalValue / 5) || 1);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  if (step === 'success') {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          {paymentMethod === 'pix' && paymentResult?.pixQrCode ? (
            <>
              <h3 className="text-lg font-bold text-foreground">Pagamento PIX gerado!</h3>
              <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código abaixo</p>
              {paymentResult.pixQrCode.encodedImage && (
                <img
                  src={`data:image/png;base64,${paymentResult.pixQrCode.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 mx-auto rounded-lg border border-border"
                />
              )}
              {paymentResult.pixQrCode.payload && (
                <div className="flex items-center gap-2">
                  <Input
                    value={paymentResult.pixQrCode.payload}
                    readOnly
                    className="text-xs"
                  />
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(paymentResult.pixQrCode.payload)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Valor: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-foreground">Pagamento processado!</h3>
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium text-primary">{paymentResult?.status === 'CONFIRMED' ? 'Confirmado' : paymentResult?.status === 'PENDING' ? 'Pendente' : paymentResult?.status}</span>
              </p>
              <p className="text-xs text-muted-foreground">Valor: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === 'customer') {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Dados do Comprador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome completo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="João da Silva" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@email.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CPF</Label>
              <Input value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <Button onClick={handleCreateCustomer} disabled={processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Continuar para pagamento
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Forma de Pagamento</CardTitle>
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant={paymentMethod === 'pix' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPaymentMethod('pix')}
            className="flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" /> PIX
          </Button>
          <Button
            type="button"
            variant={paymentMethod === 'credit_card' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPaymentMethod('credit_card')}
            className="flex items-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" /> Cartão de Crédito
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {paymentMethod === 'credit_card' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Número do cartão</Label>
              <Input value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome no cartão</Label>
              <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="JOAO DA SILVA" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Mês</Label>
                <Input value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="MM" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ano</Label>
                <Input value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="AAAA" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CVV</Label>
                <Input value={cardCcv} onChange={(e) => setCardCcv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas</Label>
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x de R$ {(totalValue / n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {n === 1 ? 'à vista' : 'sem juros'}
                  </option>
                ))}
              </select>
            </div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Dados do titular</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">CEP</Label>
                  <Input value={holderPostalCode} onChange={(e) => setHolderPostalCode(e.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número do endereço</Label>
                  <Input value={holderAddressNumber} onChange={(e) => setHolderAddressNumber(e.target.value)} placeholder="123" />
                </div>
              </div>
            </div>
          </>
        )}

        {paymentMethod === 'pix' && (
          <div className="text-center py-4 space-y-2">
            <QrCode className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Ao confirmar, um QR Code PIX será gerado para pagamento imediato.
            </p>
          </div>
        )}

        <div className="border-t border-border/50 pt-3">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-foreground">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <Button onClick={handlePayment} disabled={processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {paymentMethod === 'pix' ? 'Gerar PIX' : 'Pagar com Cartão'}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setStep('customer')}
          className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
        >
          ← Voltar aos dados pessoais
        </button>
      </CardContent>
    </Card>
  );
};

export default CheckoutForm;
