import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedSection } from '@/components/AnimatedSection';
import CheckoutForm from '@/components/CheckoutForm';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Package, Boxes, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface ComboItem {
  id: string;
  product_id: string;
  variation_id: string | null;
  quantity: number;
  sort_order: number;
  product_name?: string;
  variation_dosage?: string;
  image?: string;
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
  free_shipping: boolean;
  free_shipping_min_value: number;
}

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ComboCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [combo, setCombo] = useState<ComboData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Auth guard - mirror standard Checkout behavior
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        const currentUrl = window.location.pathname + window.location.search;
        navigate(`/cliente/login?redirect=${encodeURIComponent(currentUrl)}`);
      }
    });

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
        pids.length ? supabase.from('products').select('id, name, images, free_shipping, free_shipping_min_value').in('id', pids) : Promise.resolve({ data: [] as any[] }),
        vids.length ? supabase.from('product_variations').select('id, dosage, image_url, images').in('id', vids) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pmap = new Map<string, { name: string; image: string; free_shipping: boolean; free_shipping_min_value: number }>();
      (prods as any[] || []).forEach((p) => {
        const img = (Array.isArray(p.images) ? p.images : []).find((u: string) => u && !/placeholder/i.test(u)) || '';
        pmap.set(p.id, {
          name: p.name,
          image: img,
          free_shipping: !!p.free_shipping,
          free_shipping_min_value: Number(p.free_shipping_min_value) || 0,
        });
      });
      const vmap = new Map<string, { dosage: string; image: string }>();
      (vars as any[] || []).forEach((v) => {
        const arr = Array.isArray(v.images) ? v.images.filter(Boolean) : [];
        vmap.set(v.id, { dosage: v.dosage, image: arr[0] || v.image_url || '' });
      });
      items.forEach((i) => {
        const p = pmap.get(i.product_id);
        const v = i.variation_id ? vmap.get(i.variation_id) : undefined;
        i.product_name = p?.name || 'Produto';
        i.variation_dosage = v?.dosage;
        i.image = v?.image || p?.image || '';
      });
      // Herdar frete grátis: combo é grátis se TODOS os produtos do combo tiverem free_shipping=true
      const productsInCombo = pids.map((id) => pmap.get(id)).filter(Boolean) as Array<{ free_shipping: boolean; free_shipping_min_value: number }>;
      const allFree = productsInCombo.length > 0 && productsInCombo.every((p) => p.free_shipping);
      // Min value herdado: 0 (ilimitado) se algum for ilimitado; senão o menor (constraint mais apertada)
      const mins = productsInCombo.map((p) => p.free_shipping_min_value);
      const hasUnlimited = mins.some((m) => !m || m <= 0);
      const inheritedMin = hasUnlimited ? 0 : Math.min(...mins);

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
        free_shipping: allFree,
        free_shipping_min_value: inheritedMin,
      });
      setLoading(false);
    })();
  }, [slug, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (notFound || !combo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold">Combo não encontrado</h1>
          <p className="text-muted-foreground">Este combo não existe ou foi desativado.</p>
        </div>
        <Footer />
      </div>
    );
  }

  const totalPrice = combo.price;
  const savings = Math.max(0, combo.compare_price - combo.price);
  const heroImage = combo.image_url || combo.items.find((i) => i.image)?.image || '';
  const itemsDescription = combo.items
    .map((i) => `${i.quantity}x ${i.product_name}${i.variation_dosage ? ` ${i.variation_dosage}` : ''}`)
    .join(' + ');
  const orderProductName = `Combo: ${combo.name}${itemsDescription ? ` (${itemsDescription})` : ''}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="max-w-3xl mx-auto px-4 py-8">
        <AnimatedSection variant="fadeUp">
          {/* Order Summary - same structure as product checkout */}
          <div className="border border-border/50 rounded-xl p-5 bg-card mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" /> {t('orderSummary')}
            </h2>
            <div className="flex items-center gap-4">
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={combo.name}
                  className="w-20 h-20 object-contain rounded-lg border border-border/50 bg-muted p-1"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg border border-border/50 bg-muted flex items-center justify-center">
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-bold text-foreground">{combo.name}</p>
                {combo.subtitle && (
                  <p className="text-sm text-muted-foreground">{combo.subtitle}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {combo.items.length} {combo.items.length === 1 ? 'item' : 'itens'} no combo
                </p>
              </div>
              <div className="text-right">
                {combo.compare_price > combo.price && (
                  <p className="text-sm text-muted-foreground line-through">{fmtBRL(combo.compare_price)}</p>
                )}
                <p className="text-xl font-bold text-primary">{fmtBRL(totalPrice)}</p>
              </div>
            </div>

            {/* Items thumbnails */}
            {combo.items.length > 0 && (
              <ul className="mt-4 border-t border-border pt-3 space-y-2">
                {combo.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
                    <div className="relative w-12 h-12 shrink-0 rounded-md bg-muted border border-border/60 overflow-hidden">
                      {i.image ? (
                        <img src={i.image} alt={i.product_name} loading="lazy" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Package className="w-4 h-4" />
                        </div>
                      )}
                      {i.quantity > 1 && (
                        <span className="absolute top-0.5 left-0.5 bg-background/90 text-foreground text-[10px] font-semibold px-1 rounded">
                          {i.quantity}x
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-tight">
                      <span className="font-medium">{i.product_name}</span>
                      {i.variation_dosage ? <span className="text-muted-foreground"> — {i.variation_dosage}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {/* Savings */}
            {savings > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between bg-success/10 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-medium text-success flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4" /> Você está economizando
                  </span>
                  <span className="text-lg font-bold text-success">{fmtBRL(savings)}</span>
                </div>
              </div>
            )}

            {combo.description && (
              <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{combo.description}</p>
            )}
          </div>

          {/* Reuse the same CheckoutForm used by product checkout */}
          <CheckoutForm
            productName={orderProductName}
            paymentDescription={combo.name}
            dosage=""
            quantity={1}
            unitPrice={combo.price}
            freeShipping={combo.free_shipping}
            freeShippingMinValue={combo.free_shipping_min_value}
            pixDiscountPercentProp={combo.pix_discount_percent}
            maxInstallmentsProp={combo.max_installments}
            installmentsInterestProp="sem_juros"
            onSuccess={() => {
              toast({ title: 'Compra realizada!' });
            }}
          />
        </AnimatedSection>
      </section>

      <Footer />
    </div>
  );
}
