import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, CreditCard, QrCode, CheckCircle2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import logoImg from '@/assets/liberty-pharma-logo.png';

interface PaymentLink {
  id: string;
  title: string;
  description: string;
  amount: number;
  slug: string;
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

  const handleSubmit = async () => {
    if (!link || !name.trim() || !email.trim() || !cpf.trim()) {
      toast({ title: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const body: any = {
        action: 'create_payment',
        customer: {
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: cpf.replace(/\D/g, ''),
          phone: phone.replace(/\D/g, '') || undefined,
        },
        payment: {
          billingType: paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
          value: link.amount,
          description: link.title,
        },
      };

      if (paymentMethod === 'credit_card') {
        const [expMonth, expYear] = cardExpiry.split('/');
        body.payment.creditCard = {
          holderName: cardName,
          number: cardNumber.replace(/\s/g, ''),
          expiryMonth: expMonth,
          expiryYear: expYear?.length === 2 ? `20${expYear}` : expYear,
          ccv: cardCvv,
        };
        body.payment.creditCardHolderInfo = {
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: cpf.replace(/\D/g, ''),
          phone: phone.replace(/\D/g, '') || '00000000000',
          postalCode: '00000000',
        };
      }

      // Create order record
      const { error: orderError } = await supabase.from('orders').insert({
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_cpf: cpf.replace(/\D/g, ''),
        customer_phone: phone.replace(/\D/g, '') || null,
        product_name: link.title,
        quantity: 1,
        unit_price: link.amount,
        total_value: link.amount,
        payment_method: paymentMethod,
        status: 'PENDING',
      });

      if (orderError) throw orderError;

      const { data, error } = await supabase.functions.invoke('asaas-checkout', { body });

      if (error) throw error;

      if (paymentMethod === 'pix' && data?.pixQrCode) {
        setPixData(data);
      } else if (paymentMethod === 'credit_card') {
        setSuccess(true);
      }

      toast({ title: paymentMethod === 'pix' ? 'PIX gerado com sucesso!' : 'Pagamento processado!' });
    } catch (err: any) {
      toast({ title: 'Erro no pagamento', description: err.message, variant: 'destructive' });
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
                    onClick={() => setPaymentMethod('pix')}
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
                    <div className="space-y-2">
                      <Label>Número do Cartão</Label>
                      <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="0000 0000 0000 0000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nome no Cartão</Label>
                      <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Como no cartão" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Validade</Label>
                        <Input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/AA" />
                      </div>
                      <div className="space-y-2">
                        <Label>CVV</Label>
                        <Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="000" maxLength={4} />
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-base mt-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  {paymentMethod === 'pix' ? 'Gerar PIX' : 'Pagar com Cartão'}
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
