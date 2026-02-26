import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, QrCode, Loader2, CheckCircle2, Copy, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface CheckoutFormProps {
  productName: string;
  dosage: string;
  quantity: number;
  unitPrice: number;
}

type PaymentMethod = 'credit_card' | 'pix';
type CheckoutStep = 'customer' | 'payment' | 'success';

// Validation helpers
const isValidCpf = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone: string): boolean => phone.replace(/\D/g, '').length >= 10;

interface FieldError {
  name?: string;
  email?: string;
  cpf?: string;
  phone?: string;
}

interface CardError {
  cardNumber?: string;
  cardName?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  cardCcv?: string;
  holderPostalCode?: string;
  holderAddressNumber?: string;
}

const ErrorText = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="text-[11px] text-destructive flex items-center gap-1 mt-0.5">
      <AlertCircle className="w-3 h-3" /> {msg}
    </p>
  ) : null;

const CheckoutForm = ({ productName, dosage, quantity, unitPrice }: CheckoutFormProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
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
  const [fieldErrors, setFieldErrors] = useState<FieldError>({});

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCcv, setCardCcv] = useState('');
  const [installments, setInstallments] = useState(1);
  const [cardErrors, setCardErrors] = useState<CardError>({});

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

  const validateCustomer = (): boolean => {
    const errors: FieldError = {};
    if (!name.trim()) errors.name = t('nameRequired');
    else if (name.trim().length < 3) errors.name = t('nameMin');

    if (!email.trim()) errors.email = t('emailRequired');
    else if (!isValidEmail(email)) errors.email = t('emailInvalid');

    if (!cpf.trim()) errors.cpf = t('cpfRequired');
    else if (!isValidCpf(cpf)) errors.cpf = t('cpfInvalid');

    if (!phone.trim()) errors.phone = t('phoneRequired');
    else if (!isValidPhone(phone)) errors.phone = t('phoneInvalid');

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateCard = (): boolean => {
    if (paymentMethod === 'pix') return true;
    const errors: CardError = {};
    const num = cardNumber.replace(/\s/g, '');
    if (num.length < 13) errors.cardNumber = t('cardNumberInvalid');
    if (!cardName.trim()) errors.cardName = t('cardNameRequired');
    if (!cardExpMonth || parseInt(cardExpMonth) < 1 || parseInt(cardExpMonth) > 12) errors.cardExpMonth = t('monthInvalid');
    if (!cardExpYear || cardExpYear.length !== 4) errors.cardExpYear = t('yearInvalid');
    if (!cardCcv || cardCcv.length < 3) errors.cardCcv = t('cvvInvalid');
    if (!holderPostalCode.replace(/\D/g, '') || holderPostalCode.replace(/\D/g, '').length < 8) errors.holderPostalCode = t('cepInvalid');
    if (!holderAddressNumber.trim()) errors.holderAddressNumber = t('numberRequired');
    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateCustomer = async () => {
    if (!validateCustomer()) return;
    setProcessing(true);
    try {
      const customer = await invokeAsaas('create_customer', {
        name: name.trim(),
        email: email.trim(),
        cpfCnpj: cpf.replace(/\D/g, ''),
        phone: phone.replace(/\D/g, ''),
      });
      setCustomerId(customer.id);
      setHolderEmail(email);
      setHolderCpf(cpf);
      setHolderPhone(phone);
      setStep('payment');
    } catch (err: any) {
      toast({ title: t('error'), description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!validateCard()) return;
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
            holderName: cardName.trim(),
            number: cardNumber.replace(/\s/g, ''),
            expiryMonth: cardExpMonth,
            expiryYear: cardExpYear,
            ccv: cardCcv,
          },
          creditCardHolderInfo: {
            name: name.trim(),
            email: holderEmail.trim(),
            cpfCnpj: holderCpf.replace(/\D/g, ''),
            postalCode: holderPostalCode.replace(/\D/g, ''),
            addressNumber: holderAddressNumber.trim(),
            phone: holderPhone.replace(/\D/g, ''),
          },
        });
        setPaymentResult(result);
      }
      setStep('success');
    } catch (err: any) {
      toast({ title: t('paymentError'), description: err.message, variant: 'destructive' });
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
    toast({ title: t('copied') });
  };

  if (step === 'success') {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          {paymentMethod === 'pix' && paymentResult?.pixQrCode ? (
            <>
              <h3 className="text-lg font-bold text-foreground">{t('pixGenerated')}</h3>
              <p className="text-sm text-muted-foreground">{t('scanQR')}</p>
              {paymentResult.pixQrCode.encodedImage && (
                <img
                  src={`data:image/png;base64,${paymentResult.pixQrCode.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 mx-auto rounded-lg border border-border"
                />
              )}
              {paymentResult.pixQrCode.payload && (
                <div className="flex items-center gap-2">
                  <Input value={paymentResult.pixQrCode.payload} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(paymentResult.pixQrCode.payload)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('value')}: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-foreground">{t('paymentProcessed')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('status')}: <span className="font-medium text-primary">{paymentResult?.status === 'CONFIRMED' ? t('confirmed') : paymentResult?.status === 'PENDING' ? t('pending') : paymentResult?.status}</span>
              </p>
              <p className="text-xs text-muted-foreground">{t('value')}: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
          <CardTitle className="text-base">{t('buyerData')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('fullName')} *</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: undefined })); }}
              placeholder="João da Silva"
              className={fieldErrors.name ? 'border-destructive' : ''}
            />
            <ErrorText msg={fieldErrors.name} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('email')} *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }}
              placeholder="joao@email.com"
              className={fieldErrors.email ? 'border-destructive' : ''}
            />
            <ErrorText msg={fieldErrors.email} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cpf')} *</Label>
              <Input
                value={cpf}
                onChange={(e) => { setCpf(formatCpf(e.target.value)); setFieldErrors(p => ({ ...p, cpf: undefined })); }}
                placeholder="000.000.000-00"
                className={fieldErrors.cpf ? 'border-destructive' : ''}
              />
              <ErrorText msg={fieldErrors.cpf} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('phoneLabel')} *</Label>
              <Input
                value={phone}
                onChange={(e) => { setPhone(formatPhone(e.target.value)); setFieldErrors(p => ({ ...p, phone: undefined })); }}
                placeholder="(11) 99999-9999"
                className={fieldErrors.phone ? 'border-destructive' : ''}
              />
              <ErrorText msg={fieldErrors.phone} />
            </div>
          </div>
          <Button onClick={handleCreateCustomer} disabled={processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('continueToPayment')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t('paymentMethod')}</CardTitle>
        <div className="flex gap-2 mt-2">
          <Button type="button" variant={paymentMethod === 'pix' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('pix')} className="flex items-center gap-1.5">
            <QrCode className="w-4 h-4" /> PIX
          </Button>
          <Button type="button" variant={paymentMethod === 'credit_card' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('credit_card')} className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" /> {t('creditCard')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {paymentMethod === 'credit_card' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cardNumber')} *</Label>
              <Input
                value={cardNumber}
                onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setCardErrors(p => ({ ...p, cardNumber: undefined })); }}
                placeholder="0000 0000 0000 0000"
                className={cardErrors.cardNumber ? 'border-destructive' : ''}
              />
              <ErrorText msg={cardErrors.cardNumber} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cardName')} *</Label>
              <Input
                value={cardName}
                onChange={(e) => { setCardName(e.target.value); setCardErrors(p => ({ ...p, cardName: undefined })); }}
                placeholder="JOAO DA SILVA"
                className={cardErrors.cardName ? 'border-destructive' : ''}
              />
              <ErrorText msg={cardErrors.cardName} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('month')} *</Label>
                <Input
                  value={cardExpMonth}
                  onChange={(e) => { setCardExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2)); setCardErrors(p => ({ ...p, cardExpMonth: undefined })); }}
                  placeholder="MM"
                  className={cardErrors.cardExpMonth ? 'border-destructive' : ''}
                />
                <ErrorText msg={cardErrors.cardExpMonth} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('year')} *</Label>
                <Input
                  value={cardExpYear}
                  onChange={(e) => { setCardExpYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors(p => ({ ...p, cardExpYear: undefined })); }}
                  placeholder="AAAA"
                  className={cardErrors.cardExpYear ? 'border-destructive' : ''}
                />
                <ErrorText msg={cardErrors.cardExpYear} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CVV *</Label>
                <Input
                  value={cardCcv}
                  onChange={(e) => { setCardCcv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors(p => ({ ...p, cardCcv: undefined })); }}
                  placeholder="123"
                  className={cardErrors.cardCcv ? 'border-destructive' : ''}
                />
                <ErrorText msg={cardErrors.cardCcv} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('installments')}</Label>
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x de R$ {(totalValue / n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {n === 1 ? t('cashPayment') : t('noInterest')}
                  </option>
                ))}
              </select>
            </div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('holderData')}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('cep')} *</Label>
                  <Input
                    value={holderPostalCode}
                    onChange={(e) => { setHolderPostalCode(e.target.value); setCardErrors(p => ({ ...p, holderPostalCode: undefined })); }}
                    placeholder="00000-000"
                    className={cardErrors.holderPostalCode ? 'border-destructive' : ''}
                  />
                  <ErrorText msg={cardErrors.holderPostalCode} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('addressNumber')} *</Label>
                  <Input
                    value={holderAddressNumber}
                    onChange={(e) => { setHolderAddressNumber(e.target.value); setCardErrors(p => ({ ...p, holderAddressNumber: undefined })); }}
                    placeholder="123"
                    className={cardErrors.holderAddressNumber ? 'border-destructive' : ''}
                  />
                  <ErrorText msg={cardErrors.holderAddressNumber} />
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
            {paymentMethod === 'pix' ? t('generatePix') : `${t('pay')} ${t('creditCard')}`}
          </Button>
        </div>

        <button type="button" onClick={() => setStep('customer')} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
          ← Voltar aos dados pessoais
        </button>
      </CardContent>
    </Card>
  );
};

export default CheckoutForm;
