import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, QrCode, Loader2, CheckCircle2, Copy, AlertCircle, MapPin, Truck, ShoppingBag } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';

interface CheckoutFormProps {
  productName: string;
  dosage: string;
  quantity: number;
  unitPrice: number;
  freeShipping?: boolean;
  freeShippingMinValue?: number;
  onSuccess?: () => void;
}

type PaymentMethod = 'credit_card' | 'pix';
type CheckoutStep = 'customer' | 'address' | 'shipping' | 'payment' | 'success';

interface ShippingOption {
  id: number;
  name: string;
  company: string;
  price: number;
  delivery_time: number | null;
}

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

interface FieldError { name?: string; email?: string; cpf?: string; phone?: string; }
interface AddressError { postalCode?: string; address?: string; number?: string; district?: string; city?: string; state?: string; }
interface CardError { cardNumber?: string; cardName?: string; cardExpMonth?: string; cardExpYear?: string; cardCcv?: string; holderPostalCode?: string; holderAddressNumber?: string; }

const ErrorText = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="text-[11px] text-destructive flex items-center gap-1 mt-0.5">
      <AlertCircle className="w-3 h-3" /> {msg}
    </p>
  ) : null;

const CheckoutForm = ({ productName, dosage, quantity, unitPrice, freeShipping, freeShippingMinValue, onSuccess }: CheckoutFormProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { clearCart } = useCart();
  const navigate = useNavigate();
  const baseProductTotal = unitPrice * quantity;
  const qualifiesForFreeShipping = freeShipping && baseProductTotal >= (freeShippingMinValue || 0);

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
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Address fields
  const [addrPostalCode, setAddrPostalCode] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrComplement, setAddrComplement] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addressErrors, setAddressErrors] = useState<AddressError>({});
  const [fetchingCep, setFetchingCep] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [saveAddress, setSaveAddress] = useState(false);

  // Shipping selection
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);

  const shippingCost = selectedShipping?.price || 0;
  const totalValue = baseProductTotal + shippingCost;

  // Load saved profile + addresses on mount
  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setProfileLoaded(true); return; }

      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, cpf')
        .eq('user_id', session.user.id)
        .single();

      const userEmail = session.user.email || '';

      if (profile && profile.full_name && userEmail && (profile as any).cpf && profile.phone) {
        setName(profile.full_name);
        setEmail(userEmail);
        setCpf(formatCpf((profile as any).cpf));
        setPhone(formatPhone(profile.phone));
        // Auto-create Asaas customer and skip to address
        try {
          const customer = await invokeAsaas('create_customer', {
            name: profile.full_name,
            email: userEmail,
            cpfCnpj: ((profile as any).cpf || '').replace(/\D/g, ''),
            phone: (profile.phone || '').replace(/\D/g, ''),
          });
          setCustomerId(customer.id);
          setHolderEmail(userEmail);
          setHolderCpf(formatCpf((profile as any).cpf));
          setHolderPhone(formatPhone(profile.phone));
          setStep('address');
        } catch {
          // If Asaas fails, stay on customer step
        }
      } else {
        // Pre-fill what we have
        if (profile?.full_name) setName(profile.full_name);
        if (userEmail) setEmail(userEmail);
        if ((profile as any)?.cpf) setCpf(formatCpf((profile as any).cpf));
        if (profile?.phone) setPhone(formatPhone(profile.phone));
      }
      setProfileLoaded(true);

      // Load addresses
      const { data } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false });
      if (data && data.length > 0) {
        setSavedAddresses(data as any[]);
        const defaultAddr = data.find((a: any) => a.is_default) || data[0];
        if (defaultAddr) {
          applyAddress(defaultAddr as any);
          setSelectedAddressId(defaultAddr.id);
        }
      }
    };
    loadUserData();
  }, []);

  const applyAddress = (addr: any) => {
    setAddrPostalCode(addr.postal_code?.replace(/(\d{5})(\d{3})/, '$1-$2') || '');
    setAddrStreet(addr.street || '');
    setAddrNumber(addr.number || '');
    setAddrComplement(addr.complement || '');
    setAddrDistrict(addr.district || '');
    setAddrCity(addr.city || '');
    setAddrState(addr.state || '');
  };

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

  const createOrder = async (paymentMethodType: string): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const orderData: any = {
      customer_name: name.trim(),
      customer_email: email.trim(),
      customer_cpf: cpf.replace(/\D/g, ''),
      customer_phone: phone.replace(/\D/g, ''),
      customer_postal_code: addrPostalCode.replace(/\D/g, ''),
      customer_address: addrStreet.trim(),
      customer_number: addrNumber.trim(),
      customer_complement: addrComplement.trim(),
      customer_district: addrDistrict.trim(),
      customer_city: addrCity.trim(),
      customer_state: addrState.trim().toUpperCase(),
      asaas_customer_id: customerId,
      product_name: productName,
      dosage,
      quantity,
      unit_price: unitPrice,
      total_value: totalValue,
      shipping_cost: shippingCost,
      selected_service_id: selectedShipping?.id || null,
      shipping_service: selectedShipping ? `${selectedShipping.company} - ${selectedShipping.name}` : null,
      payment_method: paymentMethodType,
      installments: paymentMethodType === 'credit_card' ? installments : 1,
      status: 'PENDING',
    };
    if (session?.user?.id) {
      orderData.customer_user_id = session.user.id;
    }

    const { data, error } = await supabase
      .from('orders' as any)
      .insert(orderData)
      .select('id')
      .single();

    if (error) {
      console.error('Order creation error:', error);
      throw new Error('Erro ao criar pedido');
    }
    return (data as any).id;
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

  const formatCardNumber = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})/g, '$1 ').trim();
  };

  const formatCep = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const fetchAddressByCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddrStreet(data.logradouro || '');
        setAddrDistrict(data.bairro || '');
        setAddrCity(data.localidade || '');
        setAddrState(data.uf || '');
      }
    } catch { /* ignore */ }
    finally { setFetchingCep(false); }
  };

  const validateCustomer = (): boolean => {
    const errors: FieldError = {};
    if (!name.trim()) errors.name = 'Nome é obrigatório';
    else if (name.trim().length < 3) errors.name = 'Nome deve ter pelo menos 3 caracteres';
    if (!email.trim()) errors.email = 'Email é obrigatório';
    else if (!isValidEmail(email)) errors.email = 'Email inválido';
    if (!cpf.trim()) errors.cpf = 'CPF é obrigatório';
    else if (!isValidCpf(cpf)) errors.cpf = 'CPF inválido';
    if (!phone.trim()) errors.phone = 'Telefone é obrigatório';
    else if (!isValidPhone(phone)) errors.phone = 'Telefone inválido';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAddress = (): boolean => {
    const errors: AddressError = {};
    if (!addrPostalCode.replace(/\D/g, '') || addrPostalCode.replace(/\D/g, '').length < 8) errors.postalCode = 'CEP inválido';
    if (!addrStreet.trim()) errors.address = 'Endereço é obrigatório';
    if (!addrNumber.trim()) errors.number = 'Número é obrigatório';
    if (!addrDistrict.trim()) errors.district = 'Bairro é obrigatório';
    if (!addrCity.trim()) errors.city = 'Cidade é obrigatória';
    if (!addrState.trim() || addrState.trim().length !== 2) errors.state = 'UF inválida (2 letras)';
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateCard = (): boolean => {
    if (paymentMethod === 'pix') return true;
    const errors: CardError = {};
    const num = cardNumber.replace(/\s/g, '');
    if (num.length < 13) errors.cardNumber = 'Número do cartão inválido';
    if (!cardName.trim()) errors.cardName = 'Nome é obrigatório';
    if (!cardExpMonth || parseInt(cardExpMonth) < 1 || parseInt(cardExpMonth) > 12) errors.cardExpMonth = 'Mês inválido';
    if (!cardExpYear || cardExpYear.length !== 4) errors.cardExpYear = 'Ano inválido';
    if (!cardCcv || cardCcv.length < 3) errors.cardCcv = 'CVV inválido';
    if (!holderPostalCode.replace(/\D/g, '') || holderPostalCode.replace(/\D/g, '').length < 8) errors.holderPostalCode = 'CEP inválido';
    if (!holderAddressNumber.trim()) errors.holderAddressNumber = 'Número é obrigatório';
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

      // Save buyer data to profile for future purchases
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from('profiles').update({
          full_name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          cpf: cpf.replace(/\D/g, ''),
        } as any).eq('user_id', session.user.id);
      }

      setStep('address');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddressNext = async () => {
    if (!validateAddress()) return;
    // Auto-save address if user opted in and is logged in and using a new address
    if (saveAddress && selectedAddressId === 'new' || (saveAddress && savedAddresses.length === 0)) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('addresses').insert({
            user_id: session.user.id,
            label: 'Checkout',
            postal_code: addrPostalCode.replace(/\D/g, ''),
            street: addrStreet.trim(),
            number: addrNumber.trim(),
            complement: addrComplement.trim(),
            district: addrDistrict.trim(),
            city: addrCity.trim(),
            state: addrState.trim().toUpperCase(),
            is_default: savedAddresses.length === 0,
          });
        }
      } catch { /* non-blocking */ }
    }
    // Pre-fill card holder postal code and number
    setHolderPostalCode(addrPostalCode);
    setHolderAddressNumber(addrNumber);

    // If qualifies for free shipping, skip to payment directly
    if (qualifiesForFreeShipping) {
      setSelectedShipping({ id: 0, name: 'Frete Grátis', company: 'Grátis', price: 0, delivery_time: null });
      setStep('shipping');
      return;
    }

    // Fetch shipping options
    setLoadingShipping(true);
    setStep('shipping');
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', {
        body: {
          action: 'quote',
          postal_code: addrPostalCode.replace(/\D/g, ''),
          insurance_value: baseProductTotal,
          quantity,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.services && data.services.length > 0) {
        setShippingOptions(data.services);
      } else {
        toast({ title: 'Aviso', description: 'Nenhuma transportadora disponível para este CEP.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao buscar frete', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingShipping(false);
    }
  };

  const handleShippingNext = () => {
    if (!selectedShipping) {
      toast({ title: 'Selecione uma opção de frete', variant: 'destructive' });
      return;
    }
    setStep('payment');
  };

  const handlePayment = async () => {
    if (!validateCard()) return;
    setProcessing(true);
    try {
      const description = `${productName} ${dosage} x${quantity}`;
      const orderId = await createOrder(paymentMethod);

      if (paymentMethod === 'pix') {
        const result = await invokeAsaas('create_pix_payment', {
          customer: customerId, value: totalValue, description, orderId,
        });
        setPaymentResult(result);
      } else {
        const holderInfo = {
          name: name.trim(), email: holderEmail.trim(),
          cpfCnpj: holderCpf.replace(/\D/g, ''),
          postalCode: holderPostalCode.replace(/\D/g, ''),
          addressNumber: holderAddressNumber.trim(),
          phone: holderPhone.replace(/\D/g, ''),
          mobilePhone: holderPhone.replace(/\D/g, ''),
        };
        const tokenResult = await invokeAsaas('tokenize_credit_card', {
          customer: customerId,
          creditCard: {
            holderName: cardName.trim(), number: cardNumber.replace(/\s/g, ''),
            expiryMonth: cardExpMonth, expiryYear: cardExpYear, ccv: cardCcv,
          },
          creditCardHolderInfo: holderInfo,
        });
        if (!tokenResult?.creditCardToken) throw new Error('Falha ao tokenizar cartão');
        const result = await invokeAsaas('create_card_payment', {
          customer: customerId, value: totalValue, description,
          installmentCount: installments, creditCardToken: tokenResult.creditCardToken,
          creditCardHolderInfo: holderInfo, orderId,
        });
        setPaymentResult(result);
      }
      setStep('success');
      await clearCart();
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Erro no pagamento', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const maxInstallments = Math.min(6, Math.floor(totalValue / 5) || 1);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  // ─── SUCCESS ───
  // Auto-redirect to customer dashboard after payment (delayed for PIX to allow scanning)
  useEffect(() => {
    if (step === 'success') {
      const delay = paymentMethod === 'pix' ? 30000 : 5000; // 30s for PIX, 5s for card
      const timer = setTimeout(() => {
        navigate('/minha-conta');
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [step, paymentMethod, navigate]);

  if (step === 'success') {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          {paymentMethod === 'pix' && paymentResult?.pixQrCode ? (
            <>
              <h3 className="text-lg font-bold text-foreground">PIX Gerado!</h3>
              <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código</p>
              {paymentResult.pixQrCode.encodedImage && (
                <img src={`data:image/png;base64,${paymentResult.pixQrCode.encodedImage}`} alt="QR Code PIX" className="w-48 h-48 mx-auto rounded-lg border border-border" />
              )}
              {paymentResult.pixQrCode.payload && (
                <div className="flex items-center gap-2">
                  <Input value={paymentResult.pixQrCode.payload} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(paymentResult.pixQrCode.payload)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Valor: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground mt-2">Você será redirecionado em 30 segundos...</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-foreground">Pagamento Processado!</h3>
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium text-primary">{paymentResult?.status === 'CONFIRMED' ? 'Confirmado' : paymentResult?.status === 'PENDING' ? 'Pendente' : paymentResult?.status}</span>
              </p>
              <p className="text-xs text-muted-foreground">Valor: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground mt-2">Você será redirecionado em 5 segundos...</p>
            </>
          )}
          <Button onClick={() => navigate('/minha-conta')} className="mt-4 gap-2">
            <ShoppingBag className="w-4 h-4" />
            Ver meus pedidos
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── CUSTOMER DATA ───
  if (step === 'customer') {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Dados do Comprador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome completo *</Label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: undefined })); }} placeholder="João da Silva" className={fieldErrors.name ? 'border-destructive' : ''} />
            <ErrorText msg={fieldErrors.name} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email *</Label>
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }} placeholder="joao@email.com" className={fieldErrors.email ? 'border-destructive' : ''} />
            <ErrorText msg={fieldErrors.email} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CPF *</Label>
              <Input value={cpf} onChange={(e) => { setCpf(formatCpf(e.target.value)); setFieldErrors(p => ({ ...p, cpf: undefined })); }} placeholder="000.000.000-00" className={fieldErrors.cpf ? 'border-destructive' : ''} />
              <ErrorText msg={fieldErrors.cpf} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone *</Label>
              <Input value={phone} onChange={(e) => { setPhone(formatPhone(e.target.value)); setFieldErrors(p => ({ ...p, phone: undefined })); }} placeholder="(11) 99999-9999" className={fieldErrors.phone ? 'border-destructive' : ''} />
              <ErrorText msg={fieldErrors.phone} />
            </div>
          </div>
          <Button onClick={handleCreateCustomer} disabled={processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Continuar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── ADDRESS ───
  if (step === 'address') {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Endereço de Entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Saved Address Selector */}
          {savedAddresses.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço salvo</Label>
              <select
                value={selectedAddressId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedAddressId(id);
                  if (id === 'new') {
                    setAddrPostalCode(''); setAddrStreet(''); setAddrNumber('');
                    setAddrComplement(''); setAddrDistrict(''); setAddrCity(''); setAddrState('');
                  } else {
                    const addr = savedAddresses.find(a => a.id === id);
                    if (addr) applyAddress(addr);
                  }
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {savedAddresses.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.street}, {a.number} ({a.city}/{a.state})
                  </option>
                ))}
                <option value="new">+ Novo endereço</option>
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">CEP *</Label>
            <Input
              value={addrPostalCode}
              onChange={(e) => {
                const formatted = formatCep(e.target.value);
                setAddrPostalCode(formatted);
                setAddressErrors(p => ({ ...p, postalCode: undefined }));
                if (formatted.replace(/\D/g, '').length === 8) fetchAddressByCep(formatted);
              }}
              placeholder="00000-000"
              className={addressErrors.postalCode ? 'border-destructive' : ''}
            />
            <ErrorText msg={addressErrors.postalCode} />
            {fetchingCep && <p className="text-xs text-muted-foreground">Buscando endereço...</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço *</Label>
            <Input value={addrStreet} onChange={(e) => { setAddrStreet(e.target.value); setAddressErrors(p => ({ ...p, address: undefined })); }} placeholder="Rua, Avenida..." className={addressErrors.address ? 'border-destructive' : ''} />
            <ErrorText msg={addressErrors.address} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Número *</Label>
              <Input value={addrNumber} onChange={(e) => { setAddrNumber(e.target.value); setAddressErrors(p => ({ ...p, number: undefined })); }} placeholder="123" className={addressErrors.number ? 'border-destructive' : ''} />
              <ErrorText msg={addressErrors.number} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Complemento</Label>
              <Input value={addrComplement} onChange={(e) => setAddrComplement(e.target.value)} placeholder="Apto, Bloco..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bairro *</Label>
            <Input value={addrDistrict} onChange={(e) => { setAddrDistrict(e.target.value); setAddressErrors(p => ({ ...p, district: undefined })); }} placeholder="Centro" className={addressErrors.district ? 'border-destructive' : ''} />
            <ErrorText msg={addressErrors.district} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input value={addrCity} onChange={(e) => { setAddrCity(e.target.value); setAddressErrors(p => ({ ...p, city: undefined })); }} placeholder="São Paulo" className={addressErrors.city ? 'border-destructive' : ''} />
              <ErrorText msg={addressErrors.city} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UF *</Label>
              <Input value={addrState} onChange={(e) => { setAddrState(e.target.value.toUpperCase()); setAddressErrors(p => ({ ...p, state: undefined })); }} placeholder="SP" maxLength={2} className={addressErrors.state ? 'border-destructive' : ''} />
              <ErrorText msg={addressErrors.state} />
            </div>
          </div>
          {/* Save address checkbox - only for new addresses and logged-in users */}
          {(selectedAddressId === 'new' || savedAddresses.length === 0) && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="save-address"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="save-address" className="text-xs text-muted-foreground cursor-pointer">
                Salvar este endereço na minha conta
              </Label>
            </div>
          )}
          <Button onClick={handleAddressNext} disabled={loadingShipping} className="w-full">
            {loadingShipping ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Calcular Frete
          </Button>
          <button type="button" onClick={() => setStep('customer')} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
            ← Voltar aos dados pessoais
          </button>
        </CardContent>
      </Card>
    );
  }

  // ─── SHIPPING ───
  if (step === 'shipping') {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4" /> Escolha o Frete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {qualifiesForFreeShipping ? (
            <div className="text-center py-6 space-y-3">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
                <Truck className="w-5 h-5" />
                <span className="font-bold text-sm">Frete Grátis!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Este produto possui frete grátis{freeShippingMinValue && freeShippingMinValue > 0 ? ` para compras acima de R$ ${freeShippingMinValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}.
              </p>
              <div className="border-t border-border/50 pt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Produtos</span>
                  <span>R$ {baseProductTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs text-primary font-medium">
                  <span>Frete</span>
                  <span>Grátis</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground pt-1">
                  <span>Total</span>
                  <span>R$ {baseProductTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button onClick={handleShippingNext} className="w-full">
                Continuar para Pagamento
              </Button>
            </div>
          ) : loadingShipping ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Buscando opções de frete...</span>
            </div>
          ) : shippingOptions.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma opção de frete disponível para este CEP.</p>
              <Button variant="outline" size="sm" onClick={() => setStep('address')}>
                Alterar endereço
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {shippingOptions.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedShipping(opt)}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedShipping?.id === opt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-foreground">{opt.company} — {opt.name}</p>
                        {opt.delivery_time && (
                          <p className="text-xs text-muted-foreground">
                            Prazo: {opt.delivery_time} dias úteis
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        R$ {opt.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/50 pt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Produtos</span>
                  <span>R$ {baseProductTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                {selectedShipping && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Frete</span>
                    <span>R$ {selectedShipping.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-foreground pt-1">
                  <span>Total</span>
                  <span>R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button onClick={handleShippingNext} disabled={!selectedShipping} className="w-full">
                Continuar para Pagamento
              </Button>
            </>
          )}

          <button type="button" onClick={() => setStep('address')} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
            ← Voltar ao endereço
          </button>
        </CardContent>
      </Card>
    );
  }

  // ─── PAYMENT ───
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Forma de Pagamento</CardTitle>
        <div className="flex gap-2 mt-2">
          <Button type="button" variant={paymentMethod === 'pix' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('pix')} className="flex items-center gap-1.5">
            <QrCode className="w-4 h-4" /> PIX
          </Button>
          <Button type="button" variant={paymentMethod === 'credit_card' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('credit_card')} className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" /> Cartão
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {paymentMethod === 'credit_card' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Número do cartão *</Label>
              <Input value={cardNumber} onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setCardErrors(p => ({ ...p, cardNumber: undefined })); }} placeholder="0000 0000 0000 0000" className={cardErrors.cardNumber ? 'border-destructive' : ''} />
              <ErrorText msg={cardErrors.cardNumber} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome no cartão *</Label>
              <Input value={cardName} onChange={(e) => { setCardName(e.target.value); setCardErrors(p => ({ ...p, cardName: undefined })); }} placeholder="JOAO DA SILVA" className={cardErrors.cardName ? 'border-destructive' : ''} />
              <ErrorText msg={cardErrors.cardName} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Mês *</Label>
                <Input value={cardExpMonth} onChange={(e) => { setCardExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2)); setCardErrors(p => ({ ...p, cardExpMonth: undefined })); }} placeholder="MM" className={cardErrors.cardExpMonth ? 'border-destructive' : ''} />
                <ErrorText msg={cardErrors.cardExpMonth} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ano *</Label>
                <Input value={cardExpYear} onChange={(e) => { setCardExpYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors(p => ({ ...p, cardExpYear: undefined })); }} placeholder="AAAA" className={cardErrors.cardExpYear ? 'border-destructive' : ''} />
                <ErrorText msg={cardErrors.cardExpYear} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CVV *</Label>
                <Input value={cardCcv} onChange={(e) => { setCardCcv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors(p => ({ ...p, cardCcv: undefined })); }} placeholder="123" className={cardErrors.cardCcv ? 'border-destructive' : ''} />
                <ErrorText msg={cardErrors.cardCcv} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas</Label>
              <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x de R$ {(totalValue / n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {n === 1 ? '(à vista)' : '(sem juros)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Dados do titular</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">CEP *</Label>
                  <Input value={holderPostalCode} onChange={(e) => { setHolderPostalCode(e.target.value); setCardErrors(p => ({ ...p, holderPostalCode: undefined })); }} placeholder="00000-000" className={cardErrors.holderPostalCode ? 'border-destructive' : ''} />
                  <ErrorText msg={cardErrors.holderPostalCode} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número *</Label>
                  <Input value={holderAddressNumber} onChange={(e) => { setHolderAddressNumber(e.target.value); setCardErrors(p => ({ ...p, holderAddressNumber: undefined })); }} placeholder="123" className={cardErrors.holderAddressNumber ? 'border-destructive' : ''} />
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
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Produtos</span>
              <span>R$ {baseProductTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            {shippingCost > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Frete ({selectedShipping?.company})</span>
                <span>R$ {shippingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <Button onClick={handlePayment} disabled={processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {paymentMethod === 'pix' ? 'Gerar PIX' : 'Pagar com Cartão'}
          </Button>
        </div>

        <button type="button" onClick={() => setStep('shipping')} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
          ← Voltar ao frete
        </button>
      </CardContent>
    </Card>
  );
};

export default CheckoutForm;
