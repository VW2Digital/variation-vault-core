import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, CreditCard, QrCode, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import logoImg from '@/assets/liberty-pharma-logo.png';
import { gerarOpcoesParcelamento, InstallmentResult } from '@/lib/installments';

interface PaymentLink {
  id: string;
  title: string;
  description: string;
  amount: number;
  slug: string;
  pix_discount_percent: number;
  max_installments: number;
}

export default function PaymentLinkCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card'>('pix');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pixData, setPixData] = useState<any>(null);

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Address fields
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  // Installments
  const [installments, setInstallments] = useState(1);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentResult[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('payment_links')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setLink(data as PaymentLink);
        setLoading(false);
      });
  }, [slug]);

  // Fetch installment simulation from Asaas (same logic as CheckoutForm)
  useEffect(() => {
    if (!link || link.amount <= 0) return;
    const value = link.amount;
    const maxParcelas = Math.min(link.max_installments || 12, Math.max(1, Math.floor(value / 5) || 1));
    if (maxParcelas <= 1) {
      setInstallmentOptions([{ parcelas: 1, percentualJuros: 0, valorFinal: value, valorParcela: value }]);
      return;
    }
    setLoadingInstallments(true);
    supabase.functions.invoke('asaas-checkout', {
      body: { action: 'simulate_installments', value, installmentCount: maxParcelas },
    }).then(({ data }) => {
      if (data?.creditCard?.installments && Array.isArray(data.creditCard.installments) && data.creditCard.installments.length > 0) {
        const opts: InstallmentResult[] = data.creditCard.installments
          .filter((inst: any) => inst.installmentCount <= maxParcelas)
          .map((inst: any) => ({
            parcelas: inst.installmentCount,
            percentualJuros: inst.installmentCount === 1 ? 0 : Number(((inst.totalValue / value - 1)).toFixed(4)),
            valorFinal: Number(inst.totalValue),
            valorParcela: Number(inst.installmentValue),
          }));
        setInstallmentOptions(opts);
      } else {
        setInstallmentOptions(gerarOpcoesParcelamento(value, maxParcelas));
      }
    }).catch(() => {
      setInstallmentOptions(gerarOpcoesParcelamento(value, maxParcelas));
    }).finally(() => setLoadingInstallments(false));
  }, [link]);

  const formatCPF = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSubmit = async () => {
    if (!link || !name.trim() || !email.trim() || !cpf.trim()) {
      toast({ title: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }

    if (paymentMethod === 'credit_card') {
      if (!cardNumber.replace(/\s/g, '') || !cardName.trim() || !cardExpiry || !cardCvv) {
        toast({ title: 'Preencha todos os dados do cartão.', variant: 'destructive' });
        return;
      }
      if (!postalCode.replace(/\D/g, '') || !address.trim() || !addressNumber.trim()) {
        toast({ title: 'Preencha o endereço do titular do cartão.', variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      // Determine final value based on payment method
      const pixDiscountPct = link.pix_discount_percent || 0;
      const pixDiscountValue = pixDiscountPct > 0 ? link.amount * (pixDiscountPct / 100) : 0;
      const pixTotalValue = link.amount - pixDiscountValue;

      const selectedOpt = installmentOptions.find(o => o.parcelas === installments);
      const finalValue = paymentMethod === 'pix' ? pixTotalValue : (selectedOpt ? selectedOpt.valorFinal : link.amount);
      const installmentValue = paymentMethod === 'credit_card' && selectedOpt ? selectedOpt.valorParcela : finalValue;

      // 1. Create order
      const { data: orderData, error: orderError } = await supabase.from('orders').insert({
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_cpf: cpf.replace(/\D/g, ''),
        customer_phone: phone.replace(/\D/g, '') || null,
        product_name: link.title,
        quantity: 1,
        unit_price: link.amount,
        total_value: finalValue,
        payment_method: paymentMethod,
        installments,
        status: 'PENDING',
      }).select('id').single();

      if (orderError) throw orderError;
      const orderId = orderData.id;

      // 2. Create or find Asaas customer
      const { data: customerData, error: customerError } = await supabase.functions.invoke('asaas-checkout', {
        body: {
          action: 'create_customer',
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: cpf.replace(/\D/g, ''),
          phone: phone.replace(/\D/g, '') || undefined,
        },
      });

      if (customerError) throw customerError;
      const asaasCustomerId = customerData.id;

      await supabase.from('orders').update({ asaas_customer_id: asaasCustomerId }).eq('id', orderId);

      // 3. Create payment
      if (paymentMethod === 'pix') {
        const { data: pixResult, error: pixError } = await supabase.functions.invoke('asaas-checkout', {
          body: {
            action: 'create_pix_payment',
            customer: asaasCustomerId,
            value: pixTotalValue,
            description: link.title,
            orderId,
          },
        });

        if (pixError) throw pixError;
        if (pixResult?.pixQrCode) {
          setPixData({
            pixQrCode: pixResult.pixQrCode.encodedImage,
            pixCopiaECola: pixResult.pixQrCode.payload,
          });
        }
      } else {
        const [expMonth, expYear] = cardExpiry.split('/');
        const { data: cardResult, error: cardError } = await supabase.functions.invoke('asaas-checkout', {
          body: {
            action: 'create_card_payment',
            customer: asaasCustomerId,
            value: finalValue,
            description: link.title,
            orderId,
            installmentCount: installments,
            installmentValue: installmentValue,
            creditCard: {
              holderName: cardName.trim(),
              number: cardNumber.replace(/\s/g, ''),
              expiryMonth: expMonth,
              expiryYear: expYear?.length === 2 ? `20${expYear}` : expYear,
              ccv: cardCvv,
            },
            creditCardHolderInfo: {
              name: name.trim(),
              email: email.trim(),
              cpfCnpj: cpf.replace(/\D/g, ''),
              phone: phone.replace(/\D/g, '') || '00000000000',
              postalCode: postalCode.replace(/\D/g, ''),
              address: address.trim(),
              addressNumber: addressNumber.trim(),
            },
          },
        });

        if (cardError) throw cardError;
        setSuccess(true);
      }

      toast({ title: paymentMethod === 'pix' ? 'PIX gerado com sucesso!' : 'Pagamento processado!' });
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível processar o pagamento';
      toast({ title: 'Erro no pagamento', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Link não encontrado</h1>
          <p className="text-muted-foreground">Este link de pagamento não existe ou foi desativado.</p>
          <Button onClick={() => navigate('/catalogo')}>Ir para o Catálogo</Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Pagamento Realizado!</h1>
          <p className="text-muted-foreground">Seu pagamento foi processado com sucesso.</p>
        </div>
        <Footer />
      </div>
    );
  }

  const selectedOpt = installmentOptions.find(o => o.parcelas === installments);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Payment Info */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center space-y-2">
            <img src={logoImg} alt="Liberty Pharma" className="h-10 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-foreground">{link!.title}</h1>
            {link!.description && <p className="text-sm text-muted-foreground">{link!.description}</p>}
            <p className="text-3xl font-extrabold text-primary mt-2">
              R$ {Number(link!.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            {(link!.pix_discount_percent || 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                No PIX: <span className="font-semibold text-primary">R$ {(link!.amount - link!.amount * (link!.pix_discount_percent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span className="ml-1">({link!.pix_discount_percent}% off)</span>
              </p>
            )}
          </CardContent>
        </Card>

        {pixData ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" /> Pague com PIX
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {pixData.pixQrCode && (
                <img src={`data:image/png;base64,${pixData.pixQrCode}`} alt="QR Code PIX" className="w-48 h-48 mx-auto" />
              )}
              {pixData.pixCopiaECola && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Código PIX Copia e Cola</p>
                  <div className="bg-muted p-3 rounded-lg text-xs font-mono break-all">{pixData.pixCopiaECola}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(pixData.pixCopiaECola);
                      toast({ title: 'Código copiado!' });
                    }}
                  >
                    Copiar Código
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Seus Dados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome completo *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>CPF *</Label>
                    <Input value={cpf} onChange={(e) => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setPaymentMethod('pix'); setInstallments(1); }}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${paymentMethod === 'pix' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                  >
                    <QrCode className={`w-6 h-6 mx-auto mb-1 ${paymentMethod === 'pix' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-sm font-medium text-foreground">PIX</p>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('credit_card')}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${paymentMethod === 'credit_card' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                  >
                    <CreditCard className={`w-6 h-6 mx-auto mb-1 ${paymentMethod === 'credit_card' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-sm font-medium text-foreground">Cartão</p>
                  </button>
                </div>

                {paymentMethod === 'credit_card' && (
                  <div className="space-y-3 pt-2">
                    {/* Installments selector */}
                    {installmentOptions.length > 1 && (
                      <div className="space-y-2">
                        <Label>Parcelas</Label>
                        {loadingInstallments ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando parcelas...
                          </div>
                        ) : (
                          <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {installmentOptions.map((opt) => (
                                <SelectItem key={opt.parcelas} value={String(opt.parcelas)}>
                                  {opt.parcelas}x de R$ {opt.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  {opt.parcelas === 1 ? ' (à vista)' : ` (total R$ ${opt.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Número do Cartão</Label>
                      <Input value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nome no Cartão</Label>
                      <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Como no cartão" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Validade</Label>
                        <Input value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} />
                      </div>
                      <div className="space-y-2">
                        <Label>CVV</Label>
                        <Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="000" maxLength={4} />
                      </div>
                    </div>

                    {/* Address fields required by payment gateway */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground font-medium">Endereço do titular</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2 col-span-1">
                        <Label>CEP *</Label>
                        <Input
                          value={postalCode}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                            setPostalCode(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits);
                          }}
                          placeholder="00000-000"
                          maxLength={9}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>Endereço *</Label>
                        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, Av..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Número *</Label>
                      <Input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="123" className="w-24" />
                    </div>

                    {/* Show selected installment total */}
                    {selectedOpt && installments > 1 && (
                      <div className="bg-muted/50 p-3 rounded-lg text-sm text-center">
                        <span className="text-muted-foreground">Total no cartão: </span>
                        <span className="font-semibold text-foreground">
                          R$ {selectedOpt.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-base mt-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  {paymentMethod === 'pix' ? 'Gerar PIX' : `Pagar ${installments > 1 ? `${installments}x de R$ ${selectedOpt?.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'com Cartão'}`}
                </Button>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4" />
                  Pagamento seguro e criptografado
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
