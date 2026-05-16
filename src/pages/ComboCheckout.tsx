import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, CreditCard, QrCode, CheckCircle2, Clock, Boxes, TrendingDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { gerarOpcoesParcelamento, InstallmentResult } from '@/lib/installments';
import { mapPaymentErrorMessage } from '@/lib/paymentErrors';
import { fetchSetting } from '@/lib/api';
import { useMercadoPago } from '@/hooks/useMercadoPago';

interface ComboItem {
  id: string;
  product_id: string;
  variation_id: string | null;
  quantity: number;
  sort_order: number;
  product_name?: string;
  variation_dosage?: string;
}

interface ComboData {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  image_url: string;
  price: number;
  compare_price: number;
  max_installments: number;
  pix_discount_percent: number;
  items: ComboItem[];
}

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ComboCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isReady: mercadoPagoReady, tokenizeCard, deviceSessionId } = useMercadoPago();
  const [combo, setCombo] = useState<ComboData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card'>('pix');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pixData, setPixData] = useState<any>(null);
  const [cardResultData, setCardResultData] = useState<any>(null);

  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  const [installments, setInstallments] = useState(1);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentResult[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('combos' as any)
        .select('*, combo_items(*)')
        .eq('slug', slug)
        .eq('active', true)
        .maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      const c: any = data;
      const items: ComboItem[] = (c.combo_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
      const pids = Array.from(new Set(items.map((i) => i.product_id)));
      const vids = Array.from(new Set(items.map((i) => i.variation_id).filter(Boolean) as string[]));
      const [{ data: prods }, { data: vars }] = await Promise.all([
        pids.length ? supabase.from('products').select('id, name').in('id', pids) : Promise.resolve({ data: [] as any[] }),
        vids.length ? supabase.from('product_variations').select('id, dosage').in('id', vids) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pmap = new Map<string, string>(); (prods as any[] || []).forEach((p) => pmap.set(p.id, p.name));
      const vmap = new Map<string, string>(); (vars as any[] || []).forEach((v) => vmap.set(v.id, v.dosage));
      items.forEach((i) => {
        i.product_name = pmap.get(i.product_id) || 'Produto';
        i.variation_dosage = i.variation_id ? vmap.get(i.variation_id) : undefined;
      });
      setCombo({
        id: c.id,
        name: c.name,
        subtitle: c.subtitle || '',
        description: c.description || '',
        image_url: c.image_url || '',
        price: Number(c.price) || 0,
        compare_price: Number(c.compare_price) || 0,
        max_installments: c.max_installments || 6,
        pix_discount_percent: Number(c.pix_discount_percent) || 0,
        items,
      });
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (!combo || combo.price <= 0) return;
    const value = combo.price;
    const maxParcelas = Math.min(combo.max_installments || 12, Math.max(1, Math.floor(value / 5) || 1));
    if (maxParcelas <= 1) {
      setInstallmentOptions([{ parcelas: 1, percentualJuros: 0, valorFinal: value, valorParcela: value }]);
      return;
    }
    setLoadingInstallments(true);
    supabase.functions.invoke('payment-checkout', {
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
  }, [combo]);

  const formatCPF = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };
  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const formatCardNumber = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const fetchCepData = async (cep: string) => {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress(data.logradouro || '');
        setDistrict(data.bairro || '');
        setCity(data.localidade || '');
        setState(data.uf || '');
      }
    } catch { /* ignore */ }
    setLoadingCep(false);
  };

  const handleSubmit = async () => {
    if (!combo || !name.trim() || !email.trim() || !cpf.trim() || !phone.trim()) {
      toast({ title: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }
    if (!postalCode.replace(/\D/g, '') || !address.trim() || !addressNumber.trim() || !district.trim() || !city.trim() || !state.trim()) {
      toast({ title: 'Preencha o endereço completo para entrega.', variant: 'destructive' });
      return;
    }
    if (paymentMethod === 'credit_card' && (!cardNumber.replace(/\s/g, '') || !cardName.trim() || !cardExpiry || !cardCvv)) {
      toast({ title: 'Preencha todos os dados do cartão.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const baseAmount = combo.price;
      const pixDiscountPct = combo.pix_discount_percent || 0;
      const pixDiscountValue = pixDiscountPct > 0 ? baseAmount * (pixDiscountPct / 100) : 0;
      const pixTotalValue = baseAmount - pixDiscountValue;

      const selectedOpt = installmentOptions.find((o) => o.parcelas === installments);
      const finalValue = paymentMethod === 'pix' ? pixTotalValue : (selectedOpt ? selectedOpt.valorFinal : baseAmount);
      const installmentValue = paymentMethod === 'credit_card' && selectedOpt ? selectedOpt.valorParcela : finalValue;

      const activeGw = await fetchSetting('payment_gateway') || 'asaas';
      const activeGwEnv = activeGw === 'mercadopago'
        ? (await fetchSetting('mercadopago_environment') || 'sandbox')
        : (await fetchSetting('asaas_environment') || 'sandbox');

      const itemsDescription = combo.items
        .map((i) => `${i.quantity}x ${i.product_name}${i.variation_dosage ? ` ${i.variation_dosage}` : ''}`)
        .join(' + ');
      const orderProductName = `Combo: ${combo.name} (${itemsDescription})`;

      const { getResellerCode, trackResellerEvent } = await import('@/lib/reseller');
      const _resellerCode = getResellerCode();

      const { data: orderData, error: orderError } = await supabase.from('orders').insert({
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_cpf: cpf.replace(/\D/g, ''),
        customer_phone: phone.replace(/\D/g, '') || null,
        product_name: orderProductName,
        quantity: 1,
        unit_price: combo.price,
        total_value: finalValue,
        payment_method: paymentMethod,
        installments,
        status: 'PENDING',
        payment_gateway: activeGw,
        gateway_environment: activeGwEnv,
        customer_address: address.trim(),
        customer_number: addressNumber.trim(),
        customer_complement: complement.trim() || null,
        customer_district: district.trim(),
        customer_city: city.trim(),
        customer_state: state.trim(),
        customer_postal_code: postalCode.replace(/\D/g, ''),
        ...(_resellerCode ? { reseller_code: _resellerCode } : {}),
      }).select('id').single();

      if (orderError) throw orderError;
      const orderId = orderData.id;

      if (_resellerCode) {
        void trackResellerEvent('order_created', {
          orderId,
          productName: combo.name,
          amount: finalValue,
          metadata: { combo_slug: slug, payment_method: paymentMethod },
        });
      }

      const { data: customerData, error: customerError } = await supabase.functions.invoke('payment-checkout', {
        body: {
          action: 'create_customer',
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: cpf.replace(/\D/g, ''),
          phone: phone.replace(/\D/g, '') || undefined,
        },
      });
      if (customerError) throw customerError;
      const checkoutCustomerId = customerData.id;
      await supabase.from('orders').update({ asaas_customer_id: checkoutCustomerId }).eq('id', orderId);

      if (paymentMethod === 'pix') {
        const { data: pixResult, error: pixError } = await supabase.functions.invoke('payment-checkout', {
          body: {
            action: 'create_pix_payment',
            customer: checkoutCustomerId,
            value: pixTotalValue,
            description: combo.name,
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
        const normalizedExpYear = expYear?.length === 2 ? `20${expYear}` : expYear;
        let creditCardPayload: Record<string, string>;
        let paymentMethodId: string | undefined;
        let issuerId: string | undefined;

        if (activeGw === 'mercadopago') {
          if (!mercadoPagoReady) {
            throw new Error('O formulário de cartão do Mercado Pago ainda está carregando. Tente novamente.');
          }
          const tokenResult = await tokenizeCard({
            cardNumber: cardNumber.replace(/\s/g, ''),
            cardholderName: cardName.trim(),
            expirationMonth: expMonth,
            expirationYear: normalizedExpYear || '',
            securityCode: cardCvv,
            identificationType: 'CPF',
            identificationNumber: cpf.replace(/\D/g, ''),
          });
          creditCardPayload = { token: tokenResult.token };
          paymentMethodId = tokenResult.paymentMethodId;
          issuerId = tokenResult.issuerId;
        } else {
          creditCardPayload = {
            holderName: cardName.trim(),
            number: cardNumber.replace(/\s/g, ''),
            expiryMonth: expMonth,
            expiryYear: normalizedExpYear || '',
            ccv: cardCvv,
          };
        }

        const { data: cardResult, error: cardError } = await supabase.functions.invoke('payment-checkout', {
          body: {
            action: 'create_card_payment',
            customer: checkoutCustomerId,
            value: finalValue,
            description: combo.name,
            orderId,
            installmentCount: installments,
            installmentValue,
            creditCard: creditCardPayload,
            creditCardHolderInfo: {
              name: name.trim(),
              email: email.trim(),
              cpfCnpj: cpf.replace(/\D/g, ''),
              phone: phone.replace(/\D/g, '') || '00000000000',
              postalCode: postalCode.replace(/\D/g, ''),
              address: address.trim(),
              addressNumber: addressNumber.trim(),
            },
            ...(paymentMethodId ? { paymentMethodId } : {}),
            ...(issuerId ? { issuerId } : {}),
            ...(deviceSessionId ? { deviceSessionId } : {}),
          },
        });
        if (cardError) throw cardError;
        setCardResultData(cardResult);
        setSuccess(true);
      }

      toast({ title: paymentMethod === 'pix' ? 'PIX gerado!' : 'Pagamento processado!' });
    } catch (err: any) {
      const rawMsg = err?.message || 'Não foi possível processar o pagamento';
      toast({ title: 'Erro no pagamento', description: mapPaymentErrorMessage(rawMsg), variant: 'destructive' });
      try {
        await supabase.from('payment_logs' as any).insert({
          customer_email: email.trim(),
          customer_name: name.trim(),
          payment_method: paymentMethod,
          error_message: rawMsg,
          error_source: 'combo',
          request_payload: { slug, name: combo?.name, amount: combo?.price, installments },
        });
      } catch { /* non-blocking */ }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (notFound || !combo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold">Combo não encontrado</h1>
          <p className="text-muted-foreground">Este combo não existe ou foi desativado.</p>
          <Button onClick={() => navigate('/')}>Ir para o Catálogo</Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (success) {
    const isInReview = cardResultData?.status === 'IN_REVIEW' || cardResultData?.mpStatus === 'in_process';
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          {isInReview ? (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><Clock className="w-9 h-9 text-amber-600" /></div>
              <h1 className="text-2xl font-bold">Pagamento em Análise</h1>
              <p className="text-muted-foreground">Seu pagamento está sendo analisado pela operadora.</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
              <h1 className="text-2xl font-bold">Pagamento Realizado!</h1>
              <p className="text-muted-foreground">Seu combo foi confirmado com sucesso.</p>
            </>
          )}
          <Button onClick={() => navigate('/minha-conta')}>Ver meus pedidos</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const selectedOpt = installmentOptions.find((o) => o.parcelas === installments);
  const pixPrice = combo.price - combo.price * ((combo.pix_discount_percent || 0) / 100);
  const savingsValue = Math.max(0, combo.compare_price - combo.price);
  const savingsPercent = combo.compare_price > 0 ? Math.round((savingsValue / combo.compare_price) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Card className="border-primary/20 bg-primary/5 overflow-hidden">
          {combo.image_url && (
            <div className="aspect-[16/9] bg-muted overflow-hidden">
              <img src={combo.image_url} alt={combo.name} className="w-full h-full object-cover" />
            </div>
          )}
          <CardContent className="p-6 text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1">
              <Boxes className="w-3.5 h-3.5" /> COMBO
            </div>
            <h1 className="text-xl font-bold">{combo.name}</h1>
            {combo.subtitle && <p className="text-sm text-muted-foreground">{combo.subtitle}</p>}
            {combo.compare_price > combo.price && (
              <p className="text-sm text-muted-foreground line-through">{fmtBRL(combo.compare_price)}</p>
            )}
            <p className="text-3xl font-extrabold text-primary mt-1">{fmtBRL(combo.price)}</p>
            {combo.pix_discount_percent > 0 && (
              <p className="text-sm text-muted-foreground">No PIX: <span className="font-semibold text-primary">{fmtBRL(pixPrice)}</span> ({combo.pix_discount_percent}% off)</p>
            )}
            <div className="text-left bg-background/70 border rounded-lg p-3 mt-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Inclui:</p>
              {combo.items.map((i) => (
                <p key={i.id} className="text-sm text-muted-foreground">• {i.quantity}x {i.product_name}{i.variation_dosage ? ` — ${i.variation_dosage}` : ''}</p>
              ))}
            </div>
            {combo.description && <p className="text-sm text-muted-foreground whitespace-pre-line text-left pt-2">{combo.description}</p>}
          </CardContent>
        </Card>

        {!pixData && savingsValue > 0 && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-green-600" />
                Resumo da oferta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Comprando avulso</span>
                <span className="font-medium line-through text-muted-foreground">{fmtBRL(combo.compare_price)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Preço do combo</span>
                <span className="font-bold text-primary text-lg">{fmtBRL(combo.price)}</span>
              </div>
              {combo.pix_discount_percent > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pagando no PIX</span>
                  <span className="font-semibold text-primary">{fmtBRL(pixPrice)}</span>
                </div>
              )}
              <div className="border-t border-green-500/20 pt-2.5 flex items-center justify-between">
                <span className="text-sm font-medium">Você economiza</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded-full">−{savingsPercent}%</span>
                  <span className="font-bold text-green-600">{fmtBRL(savingsValue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {pixData ? (
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><QrCode className="w-5 h-5 text-primary" /> Pague com PIX</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-center">
              {pixData.pixQrCode && <img src={`data:image/png;base64,${pixData.pixQrCode}`} alt="QR Code" className="w-48 h-48 mx-auto" />}
              {pixData.pixCopiaECola && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Código PIX Copia e Cola</p>
                  <div className="bg-muted p-3 rounded-lg text-xs font-mono break-all">{pixData.pixCopiaECola}</div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(pixData.pixCopiaECola); toast({ title: 'Código copiado!' }); }}>
                    Copiar Código
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-lg">Seus Dados</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Nome completo *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></div>
                <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>CPF *</Label><Input value={cpf} onChange={(e) => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" /></div>
                  <div className="space-y-2"><Label>Telefone *</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Endereço de Entrega</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-1">
                    <Label>CEP *</Label>
                    <Input value={postalCode} maxLength={9} placeholder="00000-000" onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPostalCode(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
                      if (d.length === 8) fetchCepData(d);
                    }} />
                  </div>
                  <div className="space-y-2 col-span-2"><Label>Rua *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={loadingCep} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Número *</Label><Input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} /></div>
                  <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Bairro *</Label><Input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={loadingCep} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2 col-span-2"><Label>Cidade *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} disabled={loadingCep} /></div>
                  <div className="space-y-2"><Label>UF *</Label><Input value={state} maxLength={2} onChange={(e) => setState(e.target.value)} disabled={loadingCep} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Forma de Pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setPaymentMethod('pix'); setInstallments(1); }}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${paymentMethod === 'pix' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                    <QrCode className={`w-6 h-6 mx-auto mb-1 ${paymentMethod === 'pix' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-sm font-medium">PIX</p>
                  </button>
                  <button onClick={() => setPaymentMethod('credit_card')}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${paymentMethod === 'credit_card' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                    <CreditCard className={`w-6 h-6 mx-auto mb-1 ${paymentMethod === 'credit_card' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-sm font-medium">Cartão</p>
                  </button>
                </div>

                {paymentMethod === 'credit_card' && (
                  <div className="space-y-3 pt-2">
                    {installmentOptions.length > 1 && (
                      <div className="space-y-2">
                        <Label>Parcelas</Label>
                        {loadingInstallments ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
                        ) : (
                          <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {installmentOptions.map((opt) => (
                                <SelectItem key={opt.parcelas} value={String(opt.parcelas)}>
                                  {opt.parcelas}x de {fmtBRL(opt.valorParcela)}
                                  {opt.parcelas === 1 ? ' (à vista)' : ` (total ${fmtBRL(opt.valorFinal)})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    <div className="space-y-2"><Label>Número do Cartão</Label><Input value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} /></div>
                    <div className="space-y-2"><Label>Nome no Cartão</Label><Input value={cardName} onChange={(e) => setCardName(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label>Validade</Label><Input value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} /></div>
                      <div className="space-y-2"><Label>CVV</Label><Input value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} /></div>
                    </div>
                  </div>
                )}

                <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-base mt-2">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                  {paymentMethod === 'pix' ? 'Gerar PIX' : `Pagar ${installments > 1 ? `${installments}x de ${fmtBRL(selectedOpt?.valorParcela || 0)}` : 'com Cartão'}`}
                </Button>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4" /> Pagamento seguro e criptografado
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