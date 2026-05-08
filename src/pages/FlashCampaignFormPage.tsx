import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSection } from '@/components/admin/AdminSection';
import { Zap, ArrowLeft, Save } from 'lucide-react';

interface PaymentLinkOpt { id: string; title: string; slug: string; }
interface ProductOpt {
  id: string;
  name: string;
  variations: { id: string; dosage: string; price: number; offer_price: number | null; is_offer: boolean }[];
}

type Source = 'existing' | 'product';
type DiscountMode = 'fixed' | 'percent';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  || Math.random().toString(36).slice(2, 10);

export default function FlashCampaignFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [links, setLinks] = useState<PaymentLinkOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('OFERTA RELÂMPAGO');
  const [subheadline, setSubheadline] = useState('Por tempo limitadíssimo. Garanta antes que acabe.');
  const [ctaText, setCtaText] = useState('GARANTIR AGORA');
  const [paymentLinkId, setPaymentLinkId] = useState('');
  // Product-based source
  const [source, setSource] = useState<Source>('product');
  const [productId, setProductId] = useState('');
  const [variationId, setVariationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discountMode, setDiscountMode] = useState<DiscountMode>('percent');
  const [discountValue, setDiscountValue] = useState('20');
  const [promoPrice, setPromoPrice] = useState('');
  const [autoLinkId, setAutoLinkId] = useState<string | null>(null);
  const [maxInstallments, setMaxInstallments] = useState('6');
  const [pixDiscount, setPixDiscount] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [bgImage, setBgImage] = useState('');
  const [bgColor, setBgColor] = useState('#0a0000');
  const [accentColor, setAccentColor] = useState('#ef4444');
  const [active, setActive] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: pls } = await supabase
        .from('payment_links').select('id,title,slug').eq('active', true)
        .order('created_at', { ascending: false });
      setLinks((pls as any) || []);

      const { data: prods } = await supabase
        .from('products')
        .select('id,name,product_variations(id,dosage,price,offer_price,is_offer)')
        .eq('active', true)
        .order('name');
      setProducts(((prods as any[]) || []).map(p => ({
        id: p.id, name: p.name,
        variations: (p.product_variations || []).map((v: any) => ({
          id: v.id, dosage: v.dosage, price: Number(v.price) || 0,
          offer_price: v.offer_price != null ? Number(v.offer_price) : null,
          is_offer: !!v.is_offer,
        })),
      })));

      if (isEdit) {
        const { data: c, error } = await supabase
          .from('flash_campaigns' as any).select('*').eq('id', id).maybeSingle();
        if (error || !c) {
          toast({ title: 'Campanha não encontrada', variant: 'destructive' });
          navigate('/admin/campanhas-relampago');
          return;
        }
        const camp = c as any;
        setTitle(camp.title); setSlug(camp.slug); setHeadline(camp.headline);
        setSubheadline(camp.subheadline); setCtaText(camp.cta_text);
        setPaymentLinkId(camp.payment_link_id);
        setSource((camp.source as Source) || 'existing');
        if (camp.product_id) setProductId(camp.product_id);
        if (camp.variation_id) setVariationId(camp.variation_id);
        if (camp.quantity != null) setQuantity(String(camp.quantity));
        if (camp.discount_mode) setDiscountMode(camp.discount_mode as DiscountMode);
        if (camp.discount_value != null) setDiscountValue(String(camp.discount_value));
        if (camp.promo_price != null) setPromoPrice(String(camp.promo_price));
        if (camp.max_installments != null) setMaxInstallments(String(camp.max_installments));
        if (camp.pix_discount != null) setPixDiscount(String(camp.pix_discount));
        if (camp.auto_link_id) setAutoLinkId(camp.auto_link_id);
        setExpiresAt(camp.expires_at?.slice(0, 16) || '');
        setStartsAt(camp.starts_at?.slice(0, 16) || '');
        setBgImage(camp.background_image || '');
        setBgColor(camp.bg_color || '#0a0000');
        setAccentColor(camp.accent_color || '#ef4444');
        setActive(camp.active);
        setLoading(false);
      }
    })();
  }, [id, isEdit, navigate, toast]);

  const selectedProduct = products.find(p => p.id === productId);
  const selectedVariation = selectedProduct?.variations.find(v => v.id === variationId);
  const basePrice = selectedVariation?.price || 0;

  const computedPromoPrice = (() => {
    if (discountMode === 'fixed') return Number(promoPrice) || 0;
    const pct = Math.min(Math.max(Number(discountValue) || 0, 0), 99);
    return Number((basePrice * (1 - pct / 100)).toFixed(2));
  })();
  const finalUnit = computedPromoPrice > 0 ? computedPromoPrice : basePrice;
  const totalAmount = Number((finalUnit * (Number(quantity) || 1)).toFixed(2));
  const discountPct = basePrice > 0 ? Math.round((1 - finalUnit / basePrice) * 100) : 0;

  const save = async () => {
    if (!title.trim() || !expiresAt) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha título e validade.', variant: 'destructive' });
      return;
    }
    if (source === 'existing' && !paymentLinkId) {
      toast({ title: 'Selecione um link de pagamento', variant: 'destructive' });
      return;
    }
    if (source === 'product' && (!productId || !variationId || finalUnit <= 0)) {
      toast({ title: 'Selecione produto, variação e preço promocional válido', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const finalSlug = (slug.trim() || slugify(title)).toLowerCase();

    // Resolve payment_link_id (auto-create/update when source = product)
    let resolvedLinkId = paymentLinkId;
    if (source === 'product') {
      const linkPayload = {
        title: `[Campanha] ${title.trim()}`,
        description: `${selectedProduct?.name} ${selectedVariation?.dosage} — ${quantity}x R$ ${finalUnit.toFixed(2)}`,
        amount: totalAmount,
        quantity: Number(quantity) || 1,
        unit_price: finalUnit,
        active: true,
        pix_discount_percent: Number(pixDiscount) || 0,
        max_installments: Number(maxInstallments) || 1,
      };
      if (autoLinkId) {
        const { error: upErr } = await supabase.from('payment_links').update(linkPayload).eq('id', autoLinkId);
        if (upErr) { setSaving(false); toast({ title: 'Erro ao atualizar link', description: upErr.message, variant: 'destructive' }); return; }
        resolvedLinkId = autoLinkId;
      } else {
        const linkSlug = `camp-${finalSlug}-${Math.random().toString(36).slice(2, 6)}`;
        const { data: newLink, error: insErr } = await supabase
          .from('payment_links')
          .insert({ ...linkPayload, slug: linkSlug, user_id: user?.id })
          .select('id').single();
        if (insErr || !newLink) { setSaving(false); toast({ title: 'Erro ao criar link', description: insErr?.message, variant: 'destructive' }); return; }
        resolvedLinkId = newLink.id;
        setAutoLinkId(newLink.id);
      }
    }

    const payload: any = {
      title: title.trim(), slug: finalSlug, headline: headline.trim(), subheadline: subheadline.trim(),
      cta_text: ctaText.trim() || 'GARANTIR AGORA', payment_link_id: resolvedLinkId,
      expires_at: new Date(expiresAt).toISOString(), background_image: bgImage.trim() || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      bg_color: bgColor, accent_color: accentColor, active,
      source,
      product_id: source === 'product' ? productId || null : null,
      variation_id: source === 'product' ? variationId || null : null,
      quantity: Number(quantity) || 1,
      discount_mode: discountMode,
      discount_value: Number(discountValue) || 0,
      promo_price: discountMode === 'fixed' ? (Number(promoPrice) || null) : null,
      max_installments: Number(maxInstallments) || 1,
      pix_discount: Number(pixDiscount) || 0,
      auto_link_id: source === 'product' ? (resolvedLinkId || null) : null,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from('flash_campaigns' as any).update(payload).eq('id', id));
    } else {
      payload.user_id = user?.id;
      ({ error } = await supabase.from('flash_campaigns' as any).insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: isEdit ? 'Campanha atualizada' : 'Campanha criada' });
    navigate('/admin/campanhas-relampago');
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Zap}
        title={isEdit ? 'Editar campanha relâmpago' : 'Nova campanha relâmpago'}
        description="Configure a página de oferta com cronômetro de urgência"
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/campanhas-relampago')}>
            <ArrowLeft className="w-4 h-4 mr-2" />Voltar
          </Button>
        }
      />

      <AdminSection title="Informações básicas">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Título interno *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Black Friday" />
            </div>
            <div>
              <Label>Slug (URL)</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto" />
            </div>
          </div>
          <div>
            <Label>Origem do checkout *</Label>
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Produto + preço promocional (criar link automaticamente)</SelectItem>
                <SelectItem value="existing">Usar link de pagamento existente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === 'existing' && (
            <div>
              <Label>Link de pagamento *</Label>
              <Select value={paymentLinkId} onValueChange={setPaymentLinkId}>
                <SelectTrigger><SelectValue placeholder="Selecione um link de pagamento" /></SelectTrigger>
                <SelectContent>
                  {links.map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {links.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Crie um link em "Links de Pagamento" antes.</p>
              )}
            </div>
          )}

          {source === 'product' && (
            <div className="grid gap-4 rounded-md border border-border/60 bg-muted/30 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Produto *</Label>
                  <Select value={productId} onValueChange={(v) => { setProductId(v); setVariationId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Variação *</Label>
                  <Select value={variationId} onValueChange={setVariationId} disabled={!selectedProduct}>
                    <SelectTrigger><SelectValue placeholder={selectedProduct ? 'Selecione' : 'Escolha o produto'} /></SelectTrigger>
                    <SelectContent>
                      {selectedProduct?.variations.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.dosage} — R$ {v.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div>
                  <Label>Tipo de desconto</Label>
                  <Select value={discountMode} onValueChange={(v) => setDiscountMode(v as DiscountMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% de desconto</SelectItem>
                      <SelectItem value="fixed">Preço final em R$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {discountMode === 'percent' ? (
                    <>
                      <Label>Desconto (%)</Label>
                      <Input type="number" min="0" max="99" step="1" value={discountValue} onChange={e => setDiscountValue(e.target.value)} />
                    </>
                  ) : (
                    <>
                      <Label>Preço promocional (R$)</Label>
                      <Input type="number" min="0.01" step="0.01" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder={basePrice ? basePrice.toFixed(2) : '0,00'} />
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Máx. parcelas (cartão)</Label>
                  <Input type="number" min="1" max="12" step="1" value={maxInstallments} onChange={e => setMaxInstallments(e.target.value)} />
                </div>
                <div>
                  <Label>Desconto extra PIX (%)</Label>
                  <Input type="number" min="0" max="100" step="1" value={pixDiscount} onChange={e => setPixDiscount(e.target.value)} />
                </div>
              </div>

              {basePrice > 0 && (
                <div className="rounded-md bg-background border border-border p-3 grid gap-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Preço original</span><span className="line-through">R$ {basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Preço promocional unitário</span><span className="font-semibold text-primary">R$ {finalUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>{discountPct}%</span></div>
                  <div className="flex justify-between border-t border-border pt-2 mt-1"><span className="font-medium">Total ({quantity}x)</span><span className="text-lg font-bold text-primary">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Início agendado (opcional)</Label>
              <Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Antes desta data a página fica indisponível.</p>
            </div>
            <div>
              <Label>Validade *</Label>
              <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Após esta data a campanha expira automaticamente.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Campanha ativa (master switch)</Label>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Conteúdo da página">
        <div className="grid gap-4">
          <div>
            <Label>Headline (chamada principal)</Label>
            <Input value={headline} onChange={e => setHeadline(e.target.value)} />
          </div>
          <div>
            <Label>Subheadline</Label>
            <Textarea value={subheadline} onChange={e => setSubheadline(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Texto do botão</Label>
            <Input value={ctaText} onChange={e => setCtaText(e.target.value)} />
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Visual">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Cor de fundo</Label>
              <Input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
            </div>
            <div>
              <Label>Cor de destaque</Label>
              <Input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Imagem de fundo (URL opcional)</Label>
            <Input value={bgImage} onChange={e => setBgImage(e.target.value)} placeholder="https://..." />
          </div>
        </div>
      </AdminSection>

      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => navigate('/admin/campanhas-relampago')}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar campanha'}
        </Button>
      </div>
    </div>
  );
}